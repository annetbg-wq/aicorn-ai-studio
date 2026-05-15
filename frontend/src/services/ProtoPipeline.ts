/**
 * ProtoPipeline — clean 6-step generation pipeline.
 *
 * Each step tells the user exactly what's happening
 * while the underlying work runs as a deterministic linear flow.
 *
 *   1. clarify   — 1 LLM call (agent_spec)        : confirm / clarify intent
 *   2. skeleton  — 1 backend call (no LLM)        : wipe src/, copy skeleton, validate build
 *   3. architect — 1 LLM call (agent_primary)     : delta plan over the skeleton
 *   4. coder     — 1 LLM call (agent_build)       : FILE/END blocks for delta files only
 *   5. apply     — pure JS                        : parse markers, filter protected paths
 *   6. build     — 1 backend call (no LLM)        : compile delta + emit /preview/<id>
 *
 *   On build failure: at most 2 repair passes (1 LLM call each).
 *
 * Models are resolved STRICTLY from user Settings via ConfigService. There are
 * no hardcoded model fallbacks. If a slot is unconfigured, the pipeline fails
 * fast with a clear "configure your model in Settings" error.
 *
 * The coder runs exactly once. If finish_reason === 'length', a single targeted
 * retry asks the model for the missing files only — never the whole project.
 */

import { llmFetch } from './LLMProxy';
import { ConfigService, type AgentSlot } from './ConfigService';
import { Orchestrator } from './Orchestrator';
import {
  type SkeletonId,
  SKELETON_REGISTRY,
  buildSkeletonPromptBlock,
  getEditableSkeletonFiles,
  getSkeletonInstalledFiles,
  isProtectedSkeletonFile,
} from './SkeletonRegistry';
import { previewController } from './PreviewController';
import {
  resolveDesignContext,
  archetypeContextForArchitect,
  designContractForCoder,
  themeFile,
  validateDesignContract,
  describeViolations,
  type DesignContext,
} from './DesignContract';
import { normalizePath as normalizePreviewPath } from './PreviewWriteGateway';
import { appendPreviewSessionToUrl, getPreviewSessionToken } from './PreviewSessionService';
import type { FastPathTelemetry, GenerationRunTelemetry } from '../shared/projectModel';

// ── Public types ──────────────────────────────────────────────────────────────

export type StepId =
  | 'clarify'
  | 'skeleton'
  | 'pack'
  | 'architect'
  | 'coder'
  | 'apply'
  | 'build'
  | 'preview';

export type StepStatus = 'pending' | 'active' | 'done' | 'error';

export interface StepLlmMetrics {
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd?: number;
}

export interface StepOutputMetrics {
  file_count?: number;
  total_bytes?: number;
  asset_count?: number;
  build_size_kb?: number;
  preview_url?: string;
  files?: string[];
  selected_visual_pack_id?: string;
  selected_visual_variant_id?: string;
  selected_visual_variant_path?: string;
  selected_visual_theme_file?: string;
  selected_color_family_id?: string;
  selected_variation_preset_id?: string;
  visual_anti_repeat_group?: string;
  visual_source_files?: string[];
  visual_linked_style_files?: string[];
  visual_linked_component_files?: string[];
  visual_material_files?: string[];
  materialized_visual_files?: string[];
  fallback_visual_selection?: boolean;
}

export interface StepExecutionMetrics {
  llm?: StepLlmMetrics;
  output?: StepOutputMetrics;
  warnings?: string[];
}

export interface StepEvent {
  step:    StepId;
  status:  StepStatus;
  /** Human-readable label shown to the user (RU). */
  label:   string;
  /** Optional secondary detail (e.g. "8 файлов"). */
  detail?: string;
  llm?: StepLlmMetrics;
  output?: StepOutputMetrics;
  warnings?: string[];
}

export interface PipelineAttachment {
  type:        'image' | 'text' | 'code' | 'pdf';
  name:        string;
  data:        string;
  mimeType:    string;
  textContent?: string;
}

export interface ProtoPipelineConfig {
  prompt:       string;
  skeletonId:   SkeletonId;
  buildId:      string;
  attachments?: PipelineAttachment[];
  skipClarify?: boolean;
  signal?:      AbortSignal;
  routeOverrides?: Partial<Record<AgentSlot, ResolvedRoute>>;
  /** Step lifecycle events for the progress UI. */
  onStep:       (e: StepEvent) => void;
  /** Free-form log output (debug pane, telemetry). */
  onLog?:       (msg: string, level?: 'info' | 'warn' | 'error') => void;
  /** Streaming coder token deltas (for the live "Пишу код…" preview). */
  onCoderStream?: (delta: string) => void;
  /** Fired exactly once after a successful build. */
  onPreviewReady?: (url: string, buildId: string) => void;
}

export interface ProtoPipelineResult {
  success:            boolean;
  buildId:            string;
  url?:               string;
  files?:             Record<string, string>;
  plan?:              ArchitectPlan;
  error?:             string;
  stepResults?:       Partial<Record<StepId, StepExecutionMetrics>>;
  fastPathTelemetry?: FastPathTelemetry;
  runTelemetry?:      GenerationRunTelemetry;
}

export interface ArchitectPlan {
  appName:     string;
  skeleton?:   SkeletonId;
  summary:     string;
  rawResponse?: string;
  /**
   * Raw architect response: delta-only file tree keyed by file path.
   * Keys may come back as "src/..." from the LLM and are normalized later for
   * the coder / compiler handoff.
   */
  fileTree:    Record<string, string>;
  /**
   * Delta files the coder MUST produce (relative to preview-workspace/src/).
   * Derived from fileTree so downstream coder / apply logic can stay path-safe.
   */
  deltaFiles:  Array<{ path: string; purpose: string }>;
  /** Optional pages the coder should wire into the router. */
  pages?:      Array<{ path: string; name: string; file: string; purpose: string }>;
  /** Free-form notes routed into the coder system prompt. */
  notes?:      string[];
  /**
   * Optional cross-file context contract — e.g. "use useApp() from AppContext,
   * NOT useLocalStorage('onboarding') directly". Injected verbatim into the
   * coder system prompt.
   */
  contextContract?: string;
  /** Optional high-level data shape the app should use. */
  dataModel?:  string;
}

// ── Step labels (RU) ───────────────────────────────────────────

const STEP_LABEL: Record<StepId, string> = {
  clarify:   'Понимаю задачу...',
  skeleton:  'Устанавливаю основу...',
  pack:      'Выбираю дизайн-пак...',
  architect: 'Проектирую архитектуру...',
  coder:     'Пишу код...',
  apply:     'Применяю изменения...',
  build:     'Собираю приложение...',
  preview:   'Готово',
};

// ── Token / timeout budgets per step ──────────────────────────────────────────

const STEP_BUDGET = {
  clarify:   { maxTokens:  600,  timeoutMs:  20_000 },
  architect: { maxTokens: 4_000, timeoutMs:  60_000 },
  coder:     { maxTokens: 35_000, timeoutMs: 360_000 },
  repair:    { maxTokens: 12_000, timeoutMs: 120_000 },
} as const;

const MAX_REPAIR_PASSES = 2;

const DESIGN_PACK_RAW_MODULES = import.meta.glob(
  '../../../prototype-bank/design-packs/**/*',
  { eager: true, query: '?raw', import: 'default' },
) as Record<string, string>;

const SKELETON_APP_RAW_MODULES = import.meta.glob(
  '../../../skeletons/*/skeleton-*/src/App.tsx',
  { eager: true, query: '?raw', import: 'default' },
) as Record<string, string>;

interface CompileResultTiming {
  compileMs: number;
  previewMountMs: number;
  totalMs: number;
  previewMounted: boolean;
}

interface MaterializedVisualPack {
  files: Record<string, string>;
  linkedStyleFiles: string[];
  linkedComponentFiles: string[];
  materialFiles: string[];
  materializedFiles: string[];
}

function normalizeRepoAssetPath(modulePath: string): string {
  return modulePath.replace(/^(\.\.\/)+/, '').replace(/\\/g, '/');
}

const DESIGN_PACK_RAW_FILES = Object.fromEntries(
  Object.entries(DESIGN_PACK_RAW_MODULES).map(([path, content]) => [normalizeRepoAssetPath(path), content]),
) as Record<string, string>;

const SKELETON_APP_FILES = Object.fromEntries(
  Object.entries(SKELETON_APP_RAW_MODULES).map(([path, content]) => [normalizeRepoAssetPath(path), content]),
) as Record<string, string>;

function getDesignPackRawFile(path: string | undefined): string | null {
  if (!path) return null;
  return DESIGN_PACK_RAW_FILES[path] ?? null;
}

function outputPathForDesignPackAsset(path: string): string {
  const relative = path.replace(/^prototype-bank\/design-packs\//, '');
  return normalizePreviewPath(`design-pack/${relative}`);
}

function getSkeletonAppTemplate(skeletonId: SkeletonId): string | null {
  const entry = Object.entries(SKELETON_APP_FILES).find(([path]) => (
    path.includes(`/skeletons/${skeletonId}/`) && path.endsWith(`/skeleton-${skeletonId}/src/App.tsx`)
  ));
  return entry?.[1] ?? null;
}

function ensureVisualPackImport(appSource: string): string {
  const importLine = "import './styles/visual-pack.css';";
  if (appSource.includes(importLine)) return appSource;
  return `${importLine}\n${appSource}`;
}

function materializeVisualPack(ctx: DesignContext): MaterializedVisualPack {
  const selection = ctx.visualSelection;
  const repoMaterialFiles = Array.from(new Set(
    [
      selection.selectedManifestPath,
      selection.selectedVariantPath,
      selection.selectedThemeFile,
      ...selection.linkedStyleFiles,
      ...selection.linkedComponentFiles,
      ...selection.layoutPresetFiles,
      ...selection.motionPresetFiles,
      ...selection.assetReferenceFiles,
      ...selection.requiredFiles,
      ...selection.sourceFiles,
      ...selection.materialFiles,
    ].filter((value): value is string => typeof value === 'string' && value.startsWith('prototype-bank/design-packs/')),
  ));

  const copiedFiles = Object.fromEntries(
    repoMaterialFiles.flatMap(path => {
      const raw = getDesignPackRawFile(path);
      if (!raw) return [];
      return [[outputPathForDesignPackAsset(path), raw] as const];
    }),
  );

  const linkedStyleFiles = Array.from(new Set(
    [...selection.linkedStyleFiles, selection.selectedThemeFile].filter((value): value is string => Boolean(value)),
  ));
  const linkedComponentFiles = Array.from(new Set(selection.linkedComponentFiles));
  const styleSections = linkedStyleFiles.map(path => {
    const raw = getDesignPackRawFile(path);
    return raw ? `/* SOURCE: ${path} */\n${raw}` : `/* MISSING SOURCE: ${path} */`;
  });

  const files: Record<string, string> = {
    ...copiedFiles,
    'styles/visual-pack.css': [
      '/* AUTO-GENERATED visual pack bundle */',
      `/* pack=${selection.selectedPackId} variant=${selection.selectedVariantId} theme=${selection.theme} */`,
      "@import './generated-theme.css';",
      '',
      ...styleSections,
      '',
    ].join('\n'),
    'design-pack/selected-pack.manifest.json': JSON.stringify({
      selectedPackId: selection.selectedPackId,
      selectedVariantId: selection.selectedVariantId,
      selectedManifestPath: selection.selectedManifestPath,
      selectedVariantPath: selection.selectedVariantPath,
      selectedThemeFile: selection.selectedThemeFile,
      purpose: selection.purpose,
      whenToUse: selection.whenToUse,
      requiredComponents: selection.requiredComponents,
      allowedSurfaces: selection.allowedSurfaces,
      linkedStyleFiles: selection.linkedStyleFiles,
      linkedComponentFiles: selection.linkedComponentFiles,
      layoutPresetFiles: selection.layoutPresetFiles,
      motionPresetFiles: selection.motionPresetFiles,
      assetReferenceFiles: selection.assetReferenceFiles,
      requiredFiles: selection.requiredFiles,
      sourceFiles: selection.sourceFiles,
      materialFiles: selection.materialFiles,
      componentHints: selection.componentHints,
      layoutHints: selection.layoutHints,
      fallbackVisualSelection: selection.fallbackVisualSelection,
      materializedOutputFiles: [
        'styles/visual-pack.css',
        ...Object.keys(copiedFiles),
      ],
    }, null, 2),
  };

  const materializedFiles = Object.keys(files).sort((a, b) => a.localeCompare(b));
  return {
    files,
    linkedStyleFiles,
    linkedComponentFiles,
    materialFiles: repoMaterialFiles,
    materializedFiles,
  };
}

// ── Implementation ────────────────────────────────────────────────────────────

export class ProtoPipeline {
  /**
   * Optional Step 1 helper — callers may invoke this BEFORE run() to ask the
   * user clarifying questions. Returns null when the prompt is already clear
   * or when the LLM call fails (treated as "skip").
   */
  static async clarify(config: {
    prompt:  string;
    signal?: AbortSignal;
  }): Promise<{ questions: string[] } | null> {
    const route = resolveRoute('spec');
    if (!route.modelId || !route.apiKey) return null;

    const system = `You are a product advisor. The user wants to build an app.
If their request is clear and specific, respond with: {"clear": true}
Otherwise respond with: {"clear": false, "questions": ["q1", "q2"]}
Maximum 2 short questions. Ask about WHAT, not HOW. JSON only — no prose, no markdown.`;

    let raw: string;
    try {
      raw = await callOnce({
        slot:        'spec',
        system,
        user:        config.prompt,
        maxTokens:   STEP_BUDGET.clarify.maxTokens,
        timeoutMs:   STEP_BUDGET.clarify.timeoutMs,
        signal:      config.signal,
      });
    } catch (err) {
      if (isAbort(err)) throw err;
      return null;
    }

    const parsed = safeParseJson(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;
    if (obj.clear === true) return null;
    const qs = Array.isArray(obj.questions)
      ? obj.questions.filter((q): q is string => typeof q === 'string')
      : [];
    return qs.length > 0 ? { questions: qs } : null;
  }

  /**
   * Run the full 6-step pipeline. Always emits step events even on failure
   * so the UI can surface the exact phase that broke.
   */
  static async run(config: ProtoPipelineConfig): Promise<ProtoPipelineResult> {
    const log = config.onLog ?? (() => {});
    const runStartedAt = Date.now();
    const fastPathTelemetry: FastPathTelemetry = {
      canonicalPath: [
        'idea',
        'package',
        'architecture',
        'skeleton selection',
        'coder delta',
        'final compile',
        'first real preview',
      ],
      removedStages: [
        'playwright hardcoded blueprint',
        'legacy plan warmup',
        'legacy design classification warmup',
        'architect kickoff pre-analysis',
      ],
      collapsedStages: [
        'idea -> package -> architecture',
        'final compile -> preview mount',
      ],
      steps: {
        packageMs: 0,
        architectureMs: 0,
        skeletonMs: 0,
        coderMs: 0,
        finalCompileMs: 0,
        previewMountMs: 0,
      },
      timeToSkeletonPreviewMs: 0,
      timeToFirstRealPreviewMs: 0,
    };
    const stepResults: Partial<Record<StepId, StepExecutionMetrics>> = {};
    const stepTimeline: GenerationRunTelemetry['steps'] = [];
    const stepStartedAt = new Map<StepId, number>();
    let compileCount = 0;
    let finalPreviewMounted = false;
    const updateStepTimeline = (
      step: StepId,
      status: StepStatus,
      detail?: string,
      metrics?: StepExecutionMetrics,
    ) => {
      const index = stepTimeline.findIndex(entry => entry.id === step);
      if (status === 'active') {
        stepStartedAt.set(step, Date.now());
      }
      const durationMs = status === 'active'
        ? stepTimeline[index]?.durationMs
        : Math.max(0, Date.now() - (stepStartedAt.get(step) ?? Date.now()));
      const nextEntry = {
        id: step,
        label: STEP_LABEL[step],
        status,
        detail,
        durationMs,
        llm: metrics?.llm,
        output: metrics?.output,
        warnings: metrics?.warnings,
      } satisfies GenerationRunTelemetry['steps'][number];
      if (index === -1) {
        stepTimeline.push(nextEntry);
      } else {
        stepTimeline[index] = {
          ...stepTimeline[index],
          ...nextEntry,
          detail: detail ?? stepTimeline[index].detail,
          durationMs: durationMs ?? stepTimeline[index].durationMs,
          llm: metrics?.llm ?? stepTimeline[index].llm,
          output: metrics?.output ?? stepTimeline[index].output,
          warnings: metrics?.warnings ?? stepTimeline[index].warnings,
        };
      }
      if (status !== 'active') {
        stepStartedAt.delete(step);
      }
    };
    const emit = (
      step: StepId,
      status: StepStatus,
      detail?: string,
      metrics?: StepExecutionMetrics,
    ) =>
      (
        updateStepTimeline(step, status, detail, metrics),
        config.onStep({ step, status, label: STEP_LABEL[step], detail, ...metrics })
      );
    const fail = (step: StepId, error: string): ProtoPipelineResult => {
      log(`[ProtoPipeline] ${step} failed: ${error}`, 'error');
      emit(step, 'error', error);
      return { success: false, buildId: config.buildId, error, stepResults };
    };

    if (!SKELETON_REGISTRY[config.skeletonId]) {
      return fail('skeleton', `Unknown skeletonId: ${config.skeletonId}`);
    }

    // ── Step 1 — Clarifier (advisory; never blocks) ───────────────────────
    let clarifiedPrompt = config.prompt;
    if (!config.skipClarify) {
      emit('clarify', 'active');
      try {
        const enrichment = await summarizeIntent(config.prompt, config.signal, config.routeOverrides);
        if (enrichment) {
          clarifiedPrompt = enrichment;
          log(`[clarify] intent normalised`);
        }
      } catch (err) {
        if (isAbort(err)) return fail('clarify', 'aborted');
        log(`[clarify] non-fatal: ${(err as Error).message}`, 'warn');
      }
      emit('clarify', 'done');
    } else {
      log('[clarify] skipped for packaged founder fast path');
    }

    // ── Step 2 — Resolve pack + materialise theme (deterministic, no LLM) ──
    emit('pack', 'active');
    let designCtx: DesignContext;
    const packStartedAt = Date.now();
    try {
      designCtx = await resolveDesignContext(clarifiedPrompt, config.skeletonId, {
        projectId: config.buildId,
      });
      log(
        `[design] archetype=${designCtx.archetype?.id ?? 'none'}` +
        ` domain=${designCtx.domain?.id ?? 'none'}` +
        ` theme=${designCtx.theme.name}` +
        ` visual=${designCtx.visualSelection.selectedPackId}/${designCtx.visualSelection.selectedVariantId}` +
        ` fallback=${designCtx.visualSelection.fallbackVisualSelection}`,
      );
      stepResults.pack = {
        output: {
          selected_visual_pack_id: designCtx.visualSelection.selectedPackId,
          selected_visual_variant_id: designCtx.visualSelection.selectedVariantId,
          selected_visual_variant_path: designCtx.visualSelection.selectedVariantPath,
          selected_visual_theme_file: designCtx.visualSelection.selectedThemeFile,
          selected_color_family_id: designCtx.visualSelection.colorFamily,
          selected_variation_preset_id: designCtx.visualSelection.variationPreset.id,
          visual_anti_repeat_group: designCtx.visualSelection.antiRepeatGroup,
          visual_source_files: designCtx.visualSelection.sourceFiles,
          visual_linked_style_files: designCtx.visualSelection.linkedStyleFiles,
          visual_linked_component_files: designCtx.visualSelection.linkedComponentFiles,
          visual_material_files: designCtx.visualSelection.materialFiles,
          fallback_visual_selection: designCtx.visualSelection.fallbackVisualSelection,
        },
      };
      emit(
        'pack', 'done',
        `${designCtx.visualSelection.selectedPackId} · ${designCtx.visualSelection.selectedVariantId}`,
        stepResults.pack,
      );
    } catch (err) {
      if (isAbort(err)) return fail('pack', 'aborted');
      log(`[design] resolveDesignContext failed: ${(err as Error).message}`, 'warn');
      emit('pack', 'error', 'failed — using default');
      // Fall back to a default corporate-medium theme so the pipeline still runs.
      designCtx = await resolveDesignContext('', config.skeletonId, {
        projectId: config.buildId,
      });
    }
    fastPathTelemetry.steps.packageMs = Date.now() - packStartedAt;

    // ── Step 3 — Architect (delta plan only) ──────────────────────────────
    emit('architect', 'active');
    let plan: ArchitectPlan;
    let architectUsage: StepLlmMetrics | undefined;
    const architectStartedAt = Date.now();
    try {
        plan = await runArchitect({
          prompt:     clarifiedPrompt,
          skeletonId: config.skeletonId,
          signal:     config.signal,
          routeOverrides: config.routeOverrides,
          onLog:      log,
          onUsage:    (usage) => { architectUsage = usage; },
          designCtx,
      });
    } catch (err) {
      if (isAbort(err)) return fail('architect', 'aborted');
      return fail('architect', (err as Error).message);
    }
    if (plan.deltaFiles.length === 0) {
      return fail('architect', 'Architect returned an empty delta plan');
    }
    stepResults.architect = {
      llm: architectUsage,
      output: {
        file_count: plan.deltaFiles.length,
        files: plan.deltaFiles.map(file => file.path),
      },
    };
    emit('architect', 'done', `${plan.deltaFiles.length} файлов`, stepResults.architect);
    fastPathTelemetry.steps.architectureMs = Date.now() - architectStartedAt;

    // ── Step 4 — Skeleton install (validates the selected base) ───────────
    emit('skeleton', 'active');
    try {
      compileCount += 1;
      const skeletonTiming = await compile(
        config.buildId,
        {},
        config.skeletonId,
        config.signal,
        'skeleton',
      );
      fastPathTelemetry.steps.skeletonMs = skeletonTiming.totalMs;
      fastPathTelemetry.timeToSkeletonPreviewMs = Date.now() - runStartedAt;
    } catch (err) {
      if (isAbort(err)) return fail('skeleton', 'aborted');
      return fail('skeleton', `Clean skeleton build failed: ${(err as Error).message}`);
    }
    emit('skeleton', 'done', SKELETON_REGISTRY[config.skeletonId].label);

    // ── Step 5 — Coder (one shot + at most one targeted retry) ────────────
    emit('coder', 'active');
    let deltaFiles: Record<string, string>;
    let coderUsage: StepLlmMetrics | undefined;
    const coderStartedAt = Date.now();
    try {
        deltaFiles = await runCoder({
          prompt:     clarifiedPrompt,
          plan,
          skeletonId: config.skeletonId,
          signal:     config.signal,
          routeOverrides: config.routeOverrides,
          onLog:      log,
          onStream:   config.onCoderStream,
          onUsage:    (usage) => { coderUsage = usage; },
        designCtx,
      });
    } catch (err) {
      if (isAbort(err)) return fail('coder', 'aborted');
      return fail('coder', (err as Error).message);
    }
    stepResults.coder = {
      llm: coderUsage,
      output: {
        file_count: Object.keys(deltaFiles).length,
        total_bytes: totalFileBytes(deltaFiles),
        files: Object.keys(deltaFiles),
      },
    };
    emit('coder', 'done', `${Object.keys(deltaFiles).length} файлов`, stepResults.coder);
    fastPathTelemetry.steps.coderMs = Date.now() - coderStartedAt;

    // ── Step 6 — Apply (filter protected, defend STORAGE_KEYS) ────────────
    emit('apply', 'active');
    // Inject the materialised theme as a delta file (overrides any coder copy).
    const tf = themeFile(designCtx);
    deltaFiles[tf.path] = tf.content;
    const visualMaterialization = materializeVisualPack(designCtx);
    Object.assign(deltaFiles, visualMaterialization.files);
    const appPath = Object.keys(deltaFiles).find(path => normalizePreviewPath(path) === 'App.tsx');
    const appSource =
      (appPath ? deltaFiles[appPath] : null) ??
      getSkeletonAppTemplate(config.skeletonId);
    if (appSource) {
      deltaFiles[appPath ?? 'App.tsx'] = ensureVisualPackImport(appSource);
    }

    // Validate the design contract — fail loudly so the coder is forced to use tokens.
    const verdict = validateDesignContract(deltaFiles, designCtx);
    if (!verdict.ok) {
      const summary = describeViolations(verdict.violations);
      log(`[design] ${verdict.violations.length} contract violation(s):\n${summary}`, 'warn');
    }

    const filteredFiles: Record<string, string> = {};
    let droppedProtected = 0;
    for (const [path, content] of Object.entries(deltaFiles)) {
      if (isProtectedSkeletonFile(config.skeletonId, path)) {
        droppedProtected += 1;
        log(`[apply] dropped protected: ${path}`, 'warn');
        continue;
      }
      filteredFiles[path] = content;
    }
    if (droppedProtected > 0) {
      log(`[apply] ${droppedProtected} protected file(s) ignored`, 'warn');
    }
    if (Object.keys(filteredFiles).length === 0) {
      return fail('apply', 'All produced files are skeleton-protected — nothing to write');
    }
    stepResults.apply = {
      output: {
        file_count: Object.keys(filteredFiles).length,
        total_bytes: totalFileBytes(filteredFiles),
        files: Object.keys(filteredFiles),
        materialized_visual_files: visualMaterialization.materializedFiles,
      },
      warnings: droppedProtected > 0 ? [`${droppedProtected} protected file(s) ignored`] : undefined,
    };
    emit('apply', 'done', `${Object.keys(filteredFiles).length} файлов`, stepResults.apply);

    // ── Step 7 — Build (with at most 2 repair passes) ─────────────────────
    emit('build', 'active');
    let lastBuildErr: string | null = null;
    let currentFiles = filteredFiles;
    let buildOk = false;
    for (let attempt = 0; attempt <= MAX_REPAIR_PASSES; attempt++) {
      try {
        compileCount += 1;
        const buildTiming = await compile(
          config.buildId,
          currentFiles,
          config.skeletonId,
          config.signal,
          attempt === 0 ? 'final' : 'repair',
        );
        fastPathTelemetry.steps.finalCompileMs = buildTiming.compileMs;
        fastPathTelemetry.steps.previewMountMs = buildTiming.previewMountMs;
        finalPreviewMounted = buildTiming.previewMounted;
        buildOk = true;
        break;
      } catch (err) {
        if (isAbort(err)) return fail('build', 'aborted');
        lastBuildErr = (err as Error).message;
        log(`[build] attempt ${attempt + 1} failed: ${lastBuildErr}`, 'warn');
        if (attempt === MAX_REPAIR_PASSES) break;
        try {
          const repaired = await runRepair({
            prompt:      clarifiedPrompt,
            plan,
            skeletonId:  config.skeletonId,
            currentFiles,
            errorLog:    lastBuildErr,
            signal:      config.signal,
            routeOverrides: config.routeOverrides,
            onLog:       log,
            designCtx,
          });
          currentFiles = { ...currentFiles, ...repaired };
        } catch (repairErr) {
          if (isAbort(repairErr)) return fail('build', 'aborted');
          log(`[repair] LLM call failed: ${(repairErr as Error).message}`, 'warn');
          break;
        }
      }
    }
    if (!buildOk) {
      return fail('build', `Build failed after ${MAX_REPAIR_PASSES + 1} attempts: ${lastBuildErr ?? 'unknown'}`);
    }
    stepResults.build = {
      output: {
        file_count: Object.keys(currentFiles).length,
        total_bytes: totalFileBytes(currentFiles),
        preview_url: `/preview/${config.buildId}`,
        files: Object.keys(currentFiles),
      },
      warnings: lastBuildErr ? [`Recovered after build error: ${lastBuildErr}`] : undefined,
    };
    emit('build', 'done', undefined, stepResults.build);
    fastPathTelemetry.timeToFirstRealPreviewMs = Date.now() - runStartedAt;

    // ── Step 8 — Preview ready ────────────────────────────────────────────
    const url = `/preview/${config.buildId}`;
    const previewNavigationUrl = appendPreviewSessionToUrl(url);
    stepResults.preview = { output: { preview_url: url } };
    emit('preview', 'done', url, stepResults.preview);
    config.onPreviewReady?.(previewNavigationUrl, config.buildId);
    log(
      `[fast-path] package=${fastPathTelemetry.steps.packageMs}ms architecture=${fastPathTelemetry.steps.architectureMs}ms ` +
      `skeleton=${fastPathTelemetry.steps.skeletonMs}ms coder=${fastPathTelemetry.steps.coderMs}ms ` +
      `finalCompile=${fastPathTelemetry.steps.finalCompileMs}ms previewMount=${fastPathTelemetry.steps.previewMountMs}ms ` +
      `skeletonPreview=${fastPathTelemetry.timeToSkeletonPreviewMs}ms firstRealPreview=${fastPathTelemetry.timeToFirstRealPreviewMs}ms`,
    );

    const runTelemetry: GenerationRunTelemetry = {
      brief: clarifiedPrompt.slice(0, 600),
      appName: plan.appName,
      planSummary: plan.summary,
      skeletonId: config.skeletonId,
      skeletonLabel: SKELETON_REGISTRY[config.skeletonId].label,
      skeletonFiles: getSkeletonInstalledFiles(config.skeletonId),
      deltaFiles: Object.keys(currentFiles),
      archetypeId: designCtx.archetype?.id ?? undefined,
      archetypeName: designCtx.archetype?.name ?? undefined,
      domainId: designCtx.domain?.id ?? undefined,
      domainName: designCtx.domain?.name ?? undefined,
      themeName: designCtx.theme.name,
      visualBank: {
        selectedPackId: designCtx.visualSelection.selectedPackId,
        selectedVariantId: designCtx.visualSelection.selectedVariantId,
        selectedVariantPath: designCtx.visualSelection.selectedVariantPath,
        selectedManifestPath: designCtx.visualSelection.selectedManifestPath,
        selectedThemeFile: designCtx.visualSelection.selectedThemeFile,
        purpose: designCtx.visualSelection.purpose,
        whenToUse: designCtx.visualSelection.whenToUse,
        requiredComponents: designCtx.visualSelection.requiredComponents,
        allowedSurfaces: designCtx.visualSelection.allowedSurfaces,
        linkedStyleFiles: designCtx.visualSelection.linkedStyleFiles,
        linkedComponentFiles: designCtx.visualSelection.linkedComponentFiles,
        layoutPresetFiles: designCtx.visualSelection.layoutPresetFiles,
        motionPresetFiles: designCtx.visualSelection.motionPresetFiles,
        assetReferenceFiles: designCtx.visualSelection.assetReferenceFiles,
        materialFiles: designCtx.visualSelection.materialFiles,
        materializedFiles: visualMaterialization.materializedFiles,
        sourceFiles: designCtx.visualSelection.sourceFiles,
        requiredFiles: designCtx.visualSelection.requiredFiles,
        fallbackVisualSelection: designCtx.visualSelection.fallbackVisualSelection,
      },
      designIntent: [
        designCtx.archetype ? `${designCtx.archetype.name} (${designCtx.archetype.id})` : null,
        designCtx.domain ? `${designCtx.domain.name} (${designCtx.domain.id})` : null,
        `Visual bank ${designCtx.visualSelection.selectedPackId}/${designCtx.visualSelection.selectedVariantId}`,
        designCtx.visualSelection.selectedVariantPath ? `Variant file ${designCtx.visualSelection.selectedVariantPath}` : null,
        designCtx.visualSelection.selectedThemeFile ? `Theme file ${designCtx.visualSelection.selectedThemeFile}` : null,
        `Visual fallback ${designCtx.visualSelection.fallbackVisualSelection}`,
        `Theme ${designCtx.theme.name}`,
        `Mood ${designCtx.intent.mood}`,
        `Contrast ${designCtx.intent.contrast}`,
        `Radius ${designCtx.intent.radius}`,
        `${visualMaterialization.linkedStyleFiles.length} linked style files`,
        `${visualMaterialization.linkedComponentFiles.length} linked component presets`,
        `${visualMaterialization.materializedFiles.length} materialized design-pack files`,
      ].filter((item): item is string => Boolean(item)),
      architectSummary: plan.summary,
      designSummary:
        `Visual ${designCtx.visualSelection.selectedPackId}/${designCtx.visualSelection.selectedVariantId} ` +
        `(${designCtx.visualSelection.selectedVariantPath ?? 'fallback'}) with theme ${designCtx.theme.name}; ` +
        `${visualMaterialization.linkedStyleFiles.length} style files, ` +
        `${visualMaterialization.linkedComponentFiles.length} component presets, ` +
        `${visualMaterialization.materializedFiles.length} materialized files; ` +
        `fallbackVisualSelection=${designCtx.visualSelection.fallbackVisualSelection}.`,
      steps: stepTimeline,
      compileCount,
      finalPreviewMounted,
      timeToSkeletonPreviewMs: fastPathTelemetry.timeToSkeletonPreviewMs,
      timeToFirstRealPreviewMs: fastPathTelemetry.timeToFirstRealPreviewMs,
    };

    return {
      success: true,
      buildId: config.buildId,
      url,
      files: currentFiles,
      plan,
      stepResults,
      fastPathTelemetry,
      runTelemetry,
    };
  }

  /**
   * Stand-alone repair entry point (used by the in-app "Fix it" affordance).
   */
  static async repair(config: {
    buildId:     string;
    skeletonId:  SkeletonId;
    prompt:      string;
    errorLog:    string;
    currentFiles: Record<string, string>;
    signal?:     AbortSignal;
    onLog?:      (msg: string, level?: 'info' | 'warn' | 'error') => void;
  }): Promise<{ success: boolean; error?: string }> {
    const log = config.onLog ?? (() => {});
    try {
      const repaired = await runRepair({
        prompt:      config.prompt,
        plan:        {
          appName: 'app',
          summary: '',
          fileTree: Object.fromEntries(Object.keys(config.currentFiles).map(p => [p, 'Repair existing delta file'])),
          deltaFiles: Object.keys(config.currentFiles).map(p => ({ path: p, purpose: 'Repair existing delta file' })),
        },
        skeletonId:  config.skeletonId,
        currentFiles: config.currentFiles,
        errorLog:    config.errorLog,
        signal:      config.signal,
        onLog:       log,
      });
      const merged = { ...config.currentFiles, ...repaired };
      await compile(config.buildId, merged, config.skeletonId, config.signal);
      return { success: true };
    } catch (err) {
      if (isAbort(err)) return { success: false, error: 'aborted' };
      return { success: false, error: (err as Error).message };
    }
  }
}

// ── Step 1 helper: light-touch normalisation ─────────────────────────────────
//
// The full clarify() above asks the user questions. summarizeIntent() instead
// silently rewrites the prompt into a clean one-paragraph form, which is what
// the run() pipeline uses internally so the architect always sees high-signal
// input regardless of how the user phrased the request.

async function summarizeIntent(
  prompt: string,
  signal?: AbortSignal,
  routeOverrides?: RouteOverrideMap,
): Promise<string | null> {
  const route = resolveRouteOrSkip('spec', routeOverrides);
  if (!route) return null;

  const system = `Rewrite the user's product idea as a single dense paragraph.
Keep it under 400 characters.
Preserve every concrete feature, page, and constraint they mentioned.
Do not add new features. Do not ask questions. Output the paragraph only.`;
  try {
    const out = await callOnce({
      slot:      'spec',
      system,
      user:      prompt,
      maxTokens: STEP_BUDGET.clarify.maxTokens,
      timeoutMs: STEP_BUDGET.clarify.timeoutMs,
      signal,
      routeOverrides,
    });
    const cleaned = out.trim().replace(/^["']|["']$/g, '');
    return cleaned.length > 20 ? cleaned : null;
  } catch (err) {
    if (isAbort(err)) throw err;
    return null;
  }
}

// ── Step 3 — Architect ───────────────────────────────────────────────────────

async function runArchitect(input: {
  prompt:     string;
  skeletonId: SkeletonId;
  signal?:    AbortSignal;
  routeOverrides?: RouteOverrideMap;
  onLog:      (msg: string, level?: 'info' | 'warn' | 'error') => void;
  onUsage?:   (usage: StepLlmMetrics) => void;
  designCtx?: DesignContext;
}): Promise<ArchitectPlan> {
  const skeleton = SKELETON_REGISTRY[input.skeletonId];
  const installedFiles = getSkeletonInstalledFiles(input.skeletonId);
  const editableFiles = getEditableSkeletonFiles(input.skeletonId);
  const editableFileSet = new Set(editableFiles);
  const protectedExistingFiles = installedFiles
    .filter(path => !editableFileSet.has(path))
    .sort((a, b) => a.localeCompare(b));
  const explicitExisting = new Set<string>([
    'src/App.tsx',
    'src/main.tsx',
    'src/config/theme.ts',
    'src/lib/cn.ts',
    ...protectedExistingFiles,
  ]);
  const protectedExistingLines = [
    `- src/components/ui/* (${skeleton.uiPrimitives.join(', ') || 'existing UI primitives'})`,
    ...skeleton.providedComponents
      .map(name => `src/components/${name}.tsx`)
      .filter(path => explicitExisting.has(path))
      .sort((a, b) => a.localeCompare(b))
      .map(path => `- ${path}`),
    ...skeleton.providedHooks
      .map(name => `src/hooks/${name}.ts`)
      .filter(path => explicitExisting.has(path))
      .sort((a, b) => a.localeCompare(b))
      .map(path => `- ${path}`),
    explicitExisting.has('src/context/AppContext.tsx')
      ? '- src/context/AppContext.tsx (provides useApp(), isOnboarded, completeOnboarding)'
      : '',
    explicitExisting.has('src/config/theme.ts')
      ? '- src/config/theme.ts'
      : '',
    explicitExisting.has('src/lib/cn.ts')
      ? '- src/lib/cn.ts'
      : '',
    explicitExisting.has('src/main.tsx')
      ? '- src/main.tsx'
      : '',
    explicitExisting.has('src/App.tsx')
      ? '- src/App.tsx (routing already configured)'
      : '',
  ].filter(Boolean).join('\n');
  const editableExistingLines = editableFiles
    .map(path => `- ${path}`)
    .join('\n');
  const providedList = [
    ...skeleton.providedComponents.map(c => `component:${c}`),
    ...skeleton.providedHooks.map(h => `hook:${h}`),
    ...skeleton.uiPrimitives.map(u => `ui:${u}`),
  ].join(', ');
  const installedList = installedFiles.length > 0
    ? installedFiles.map(path => `- ${path}`).join('\n')
    : '- (none)';
  const shapeRequirement = buildArchitectShapeRequirement(input.prompt, input.skeletonId);

  const system = `You are a senior product architect. The user wants a React + Tailwind app built on top of an EXISTING SKELETON.

SKELETON: ${skeleton.label} (${skeleton.id})
NAVIGATION: ${skeleton.navigation}
ALREADY PROVIDED (import/reuse, do not recreate): ${providedList || '(none listed)'}
PROTECTED / PROVIDED FILES (do not include these in fileTree):
${protectedExistingLines || '- (none)'}

EDITABLE SKELETON FILES (include these in fileTree when the product needs real modifications):
${editableExistingLines || '- (none)'}

SKELETON SNAPSHOT (already on disk; use this to avoid duplicates):
${installedList}
${input.designCtx ? archetypeContextForArchitect(input.designCtx) : ''}
YOUR TASK: Return fileTree with ONLY the delta files this specific app needs.
The skeleton is already installed. You MAY include editable skeleton files in fileTree when they need meaningful product-specific rewrites.
Typical delta for a mobile app: multiple routed pages, product navigation config, a real data layer, one domain hook, and at least one reusable product component.
${shapeRequirement}
Each fileTree value must be one sentence saying what the file does and which data / state it uses.

Return ONLY valid JSON matching this schema:
{
  "appName":  "<short name>",
  "skeleton": "${skeleton.id}",
  "summary":  "<one-sentence elevator pitch>",
  "fileTree": {
    "src/pages/Home.tsx": "Main screen: what it shows and which state/data it uses",
    "src/hooks/useSomething.ts": "Hook: what it owns and which data it persists"
  },
  "pages": [
    { "path": "/dashboard", "name": "Dashboard", "file": "pages/Dashboard.tsx", "purpose": "..." }
  ],
  "contextContract": "<optional: cross-file contract, e.g. which hook/context to use for shared state>",
  "dataModel": "<optional: compact entity shape, e.g. Habit: { id, name, completedDates[] }>",
  "notes": ["any cross-cutting requirement worth telling the coder"]
}

RULES
- fileTree keys may be returned as "src/..." paths, but they must describe ONLY delta files the coder should create.
- NEVER include App.tsx, main.tsx, AppContext, theme.ts, UI primitives, or any file listed under PROTECTED / PROVIDED FILES.
- Prefer product-specific pages/hooks/components/config/data files over infrastructure files.
- For editable skeleton pages/config/data files, include them in fileTree when they must be meaningfully rewritten for the product.
- Use contextContract to describe shared state contracts (e.g. "use useApp() from AppContext, NOT useLocalStorage directly") whenever multiple files share state.
- Use dataModel for the canonical domain entity / collection shape.
- Keep pages[] optional; include it only if route labels / route mapping help the coder.
- Output JSON only. No markdown fences. No prose.`;

  const raw = await callOnce({
    slot:      'primary',
    system,
    user:      input.prompt,
    maxTokens: STEP_BUDGET.architect.maxTokens,
    timeoutMs: STEP_BUDGET.architect.timeoutMs,
    signal:    input.signal,
    routeOverrides: input.routeOverrides,
    onUsage:   input.onUsage,
  });

  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Architect returned non-JSON output');
  }
  const obj = parsed as Record<string, unknown>;
  const fileTreeRaw = obj.fileTree && typeof obj.fileTree === 'object' && !Array.isArray(obj.fileTree)
    ? obj.fileTree as Record<string, unknown>
    : {};
  const normalizedFileTree = Object.fromEntries(
    Object.entries(fileTreeRaw)
      .map(([path, purpose]) => {
        const normalizedPath = normalizeArchitectTreeKey(path);
        const normalizedPurpose = typeof purpose === 'string' ? purpose.trim() : '';
        if (!normalizedPath || !normalizedPurpose) return null;
        return [normalizedPath, normalizedPurpose] as const;
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  );
  const legacyDeltaRaw = Array.isArray(obj.deltaFiles) ? obj.deltaFiles : [];
  const legacyDeltaFiles = legacyDeltaRaw
    .map((d) => {
      if (!d || typeof d !== 'object') return null;
      const dx = d as Record<string, unknown>;
      const path = typeof dx.path === 'string' ? normaliseDeltaPath(dx.path) : '';
      if (!path) return null;
      const purpose = typeof dx.purpose === 'string' ? dx.purpose.trim() : '';
      return purpose ? { path, purpose } : null;
    })
    .filter((d): d is { path: string; purpose: string } => d !== null);
  const fileTree = Object.keys(normalizedFileTree).length > 0
    ? normalizedFileTree
    : Object.fromEntries(legacyDeltaFiles.map(file => [file.path, file.purpose]));

  const pagesRaw = Array.isArray(obj.pages) ? obj.pages : [];
  const pages = pagesRaw
    .map((p) => {
      if (!p || typeof p !== 'object') return null;
      const px = p as Record<string, unknown>;
      const path = typeof px.path === 'string' ? px.path : '';
      const name = typeof px.name === 'string' ? px.name : '';
      const file = typeof px.file === 'string' ? normaliseDeltaPath(px.file) : '';
      const purpose = typeof px.purpose === 'string' ? px.purpose : '';
      return path && name && file ? { path, name, file, purpose } : null;
    })
    .filter((p): p is { path: string; name: string; file: string; purpose: string } => p !== null);
  const planner = augmentArchitectPlan({
    prompt: input.prompt,
    skeletonId: input.skeletonId,
    fileTree,
    pages,
    notes: Array.isArray(obj.notes)
      ? obj.notes.filter((n): n is string => typeof n === 'string')
      : [],
    contextContract: typeof obj.contextContract === 'string' ? obj.contextContract : undefined,
    dataModel: typeof obj.dataModel === 'string' ? obj.dataModel : undefined,
  });
  const deltaFiles = Object.entries(planner.fileTree)
    .map(([path, purpose]) => ({ path, purpose }))
    .filter(file => {
      const srcPath = `src/${file.path}`;
      return editableFileSet.has(srcPath) || !installedFiles.includes(srcPath);
    });

  if (deltaFiles.length === 0) {
    throw new Error('Architect plan contains no usable delta fileTree entries');
  }
  const duplicateSkeletonFiles = Object.keys(planner.fileTree)
    .filter(path => {
      const srcPath = `src/${path}`;
      return installedFiles.includes(srcPath) && !editableFileSet.has(srcPath);
    });
  if (duplicateSkeletonFiles.length > 0) {
    input.onLog(
      `[architect] dropped ${duplicateSkeletonFiles.length} skeleton file(s) from fileTree: ${duplicateSkeletonFiles.join(', ')}`,
      'warn',
    );
  }
  if (deltaFiles.length < Object.keys(planner.fileTree).length) {
    input.onLog(
      `[architect] kept ${deltaFiles.length} delta file(s) after excluding already-installed skeleton files`,
      'info',
    );
  }

  return {
    appName:  typeof obj.appName === 'string' ? obj.appName : 'App',
    skeleton: typeof obj.skeleton === 'string' ? obj.skeleton as SkeletonId : input.skeletonId,
    summary:  typeof obj.summary === 'string' ? obj.summary : '',
    rawResponse: raw,
    fileTree: planner.fileTree,
    deltaFiles,
    pages: planner.pages,
    notes: planner.notes,
    contextContract: planner.contextContract,
    dataModel: planner.dataModel,
  };
}

// ── Step 4 — Coder ───────────────────────────────────────────────────────────

async function runCoder(input: {
  prompt:     string;
  plan:       ArchitectPlan;
  skeletonId: SkeletonId;
  signal?:    AbortSignal;
  routeOverrides?: RouteOverrideMap;
  onLog:      (msg: string, level?: 'info' | 'warn' | 'error') => void;
  onStream?:  (delta: string) => void;
  onUsage?:   (usage: StepLlmMetrics) => void;
  designCtx?: DesignContext;
}): Promise<Record<string, string>> {
  const skeleton = SKELETON_REGISTRY[input.skeletonId];
  const skeletonPromptBlock = buildSkeletonPromptBlock(input.skeletonId, {
    plan: {
      appName: input.plan.appName,
      summary: input.plan.summary,
      fileTree: input.plan.fileTree,
      deltaFiles: input.plan.deltaFiles,
      pages: input.plan.pages ?? [],
      notes: input.plan.notes ?? [],
      dataModel: input.plan.dataModel ?? '',
    },
  });
  const fileList = input.plan.deltaFiles
    .map(d => `  - ${d.path}${d.purpose ? `  // ${d.purpose}` : ''}`)
    .join('\n');
  const fileTreeBlock = Object.entries(input.plan.fileTree)
    .map(([path, purpose]) => `  - ${path}${purpose ? `  // ${purpose}` : ''}`)
    .join('\n');
  const pageList = input.plan.pages && input.plan.pages.length > 0
    ? input.plan.pages.map(p => `  - ${p.path}  → ${p.file}  (${p.purpose})`).join('\n')
    : '  (none — single-screen app)';
  const notesBlock = input.plan.notes && input.plan.notes.length > 0
    ? `\nADDITIONAL REQUIREMENTS\n${input.plan.notes.map(n => `  • ${n}`).join('\n')}\n`
    : '';
  const dataModelBlock = input.plan.dataModel
    ? `\nDATA MODEL\n${input.plan.dataModel}\n`
    : '';

  const contractBlock = [
    skeleton.contextContract
      ? `APPCONTEXT CONTRACT — READ CAREFULLY:\n${skeleton.contextContract.trim()}`
      : '',
    input.plan.contextContract
      ? `CONTEXT CONTRACT FROM ARCHITECT — READ CAREFULLY:\n${input.plan.contextContract.trim()}`
      : '',
  ].filter(Boolean).join('\n\n');

  const system = `You are a senior React + TypeScript + Tailwind engineer. You are completing an app on top of an existing skeleton.

SKELETON: ${skeleton.label} (${skeleton.id})
PROVIDED COMPONENTS: ${skeleton.providedComponents.join(', ') || '(see registry)'}
PROVIDED HOOKS: ${skeleton.providedHooks.join(', ') || '(see registry)'}
UI PRIMITIVES: ${skeleton.uiPrimitives.join(', ') || '(see registry)'}
${contractBlock ? `\n${contractBlock}\n` : ''}${input.designCtx ? '\n' + designContractForCoder(input.designCtx) : ''}
${skeletonPromptBlock}
DELTA FILE TREE FROM ARCHITECT (source of truth):
${fileTreeBlock || '  - (none)'}

YOU MUST write EXACTLY these files and only these files:
${fileList}

PAGES TO WIRE INTO THE ROUTER:
${pageList}
${dataModelBlock}${notesBlock}
OUTPUT FORMAT — CRITICAL
Emit each file enclosed in plain-text markers, nothing else around them:

<<<FILE: pages/Dashboard.tsx>>>
// full file contents here
<<<END>>>

<<<FILE: components/StatCard.tsx>>>
// full file contents here
<<<END>>>

IMPORT RULES — follow exactly, never mix paths
From '@/components/ui' (shadcn primitives):
  Button, Card, CardContent, CardHeader, CardTitle, CardDescription,
  Input, Label, Badge, Avatar, AvatarImage, AvatarFallback,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Tabs, TabsContent, TabsList, TabsTrigger,
  Progress, Skeleton, Separator, Switch, Checkbox, Textarea,
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
  ScrollArea, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger

From '@/components/EmptyState' (NOT from ui): EmptyState
From '@/components/BottomTabs'  (NOT from ui): BottomTabs
From '@/components/LoadingScreen' (NOT from ui): LoadingScreen
From '@/components/ErrorBoundary' (NOT from ui): ErrorBoundary
From 'lucide-react': any icon component
From '@/config/navigation': BOTTOM_TABS (read-only; do NOT re-import or re-export)
From '@/config/routes': ROUTES

NEVER import EmptyState, BottomTabs, LoadingScreen, or ErrorBoundary from '@/components/ui'.
CRITICAL: config/navigation.ts MUST export BOTTOM_TABS (readonly TabDefinition[] with {to, label, icon} matching ROUTES).
         config/routes.ts MUST export ROUTES object with home/create/detail/progress/profile keys.

RULES
- Paths relative to preview-workspace/src/. No leading "src/" or "/".
- Each file must be a complete, compilable .tsx/.ts file. No diffs, no patches.
- Only import from skeleton-provided modules listed above, "@/components/ui/*", "lucide-react", "react", and files you yourself emit.
- For component-local state (counters, form fields, toggles, lists, etc.) use React's own useState / useReducer / useEffect — DO NOT invent custom hooks like "useApp", "useCounter" etc. that are not in the PROVIDED HOOKS list above. If you need persistence, import "useLocalStorage" from "@/hooks/useLocalStorage".
- You are extending the installed skeleton by delta. NEVER rebuild the app shell, router, providers, or placeholder app from scratch when the selected skeleton already provides them.
- Do not modify any skeleton-locked path.
- No commentary outside the markers. No markdown. No code fences.
- Quality over verbosity: real content, no lorem ipsum, no TODOs.`;

  let firstReason = '';
  let body = '';
  let usageAcc: StepLlmMetrics | undefined;
  await streamCall({
    slot:      'build',
    system,
    user:      input.prompt + '\n\nSummary: ' + input.plan.summary,
    maxTokens: STEP_BUDGET.coder.maxTokens,
    timeoutMs: STEP_BUDGET.coder.timeoutMs,
    signal:    input.signal,
    routeOverrides: input.routeOverrides,
    onChunk:   (delta) => { body += delta; input.onStream?.(delta); },
    onFinishReason: (r) => { firstReason = r; },
    onUsage:   (usage) => { usageAcc = mergeLlmUsage(usageAcc, usage); },
  });

  let parsed = parseFileMarkers(body);
  let missing = input.plan.deltaFiles
    .map(d => d.path)
    .filter(p => !(p in parsed));

  // Targeted retry for length truncation — ask only for the missing files.
  if ((firstReason === 'length' || missing.length > 0) && missing.length > 0) {
    input.onLog(`[coder] retry for ${missing.length} missing file(s) (finish_reason=${firstReason || 'incomplete'})`, 'warn');
    const retrySystem = `Same task as before. Emit ONLY the files listed below, in the same FILE/END marker format. Do not repeat already-produced files.

MISSING FILES:
${missing.map(p => `  - ${p}`).join('\n')}`;
    let retryBody = '';
    try {
      await streamCall({
        slot:      'build',
        system:    retrySystem,
        user:      'Re-emit ONLY the missing files for the previous task.',
        maxTokens: STEP_BUDGET.coder.maxTokens,
        timeoutMs: STEP_BUDGET.coder.timeoutMs,
        signal:    input.signal,
        routeOverrides: input.routeOverrides,
        onChunk:   (delta) => { retryBody += delta; input.onStream?.(delta); },
        onUsage:   (usage) => { usageAcc = mergeLlmUsage(usageAcc, usage); },
      });
      const retryParsed = parseFileMarkers(retryBody);
      parsed = { ...parsed, ...retryParsed };
      missing = input.plan.deltaFiles
        .map(d => d.path)
        .filter(p => !(p in parsed));
    } catch (err) {
      if (isAbort(err)) throw err;
      input.onLog(`[coder] retry failed: ${(err as Error).message}`, 'warn');
    }
  }

  if (Object.keys(parsed).length === 0) {
    throw new Error('Coder produced no FILE/END blocks — output was unparsable');
  }
  const allowedPaths = new Set(input.plan.deltaFiles.map(file => normaliseDeltaPath(file.path)));
  const droppedUnexpected = Object.keys(parsed).filter(path => !allowedPaths.has(normaliseDeltaPath(path)));
  if (droppedUnexpected.length > 0) {
    input.onLog(
      `[coder] dropped ${droppedUnexpected.length} unexpected file(s): ${droppedUnexpected.join(', ')}`,
      'warn',
    );
  }
  parsed = Object.fromEntries(
    Object.entries(parsed).filter(([path]) => allowedPaths.has(normaliseDeltaPath(path))),
  );
  if (Object.keys(parsed).length === 0) {
    throw new Error('Coder did not return any allowed delta files');
  }
  if (missing.length > 0) {
    input.onLog(`[coder] still missing after retry: ${missing.join(', ')}`, 'warn');
  }
  if (usageAcc) input.onUsage?.(usageAcc);
  return parsed;
}

// ── Repair pass ──────────────────────────────────────────────────────────────

async function runRepair(input: {
  prompt:       string;
  plan:         ArchitectPlan;
  skeletonId:   SkeletonId;
  currentFiles: Record<string, string>;
  errorLog:     string;
  signal?:      AbortSignal;
  routeOverrides?: RouteOverrideMap;
  onLog:        (msg: string, level?: 'info' | 'warn' | 'error') => void;
  onUsage?:     (usage: StepLlmMetrics) => void;
  designCtx?:   DesignContext;
}): Promise<Record<string, string>> {
  const skeleton = SKELETON_REGISTRY[input.skeletonId];
  // Heuristic: pull file paths the error log references; fall back to all files.
  const referenced = Array.from(input.errorLog.matchAll(/(?:src\/)?([\w./@-]+\.(?:tsx?|css|json))/g))
    .map(m => normaliseDeltaPath(m[1]))
    .filter(p => p in input.currentFiles);
  const targetPaths = referenced.length > 0
    ? Array.from(new Set(referenced))
    : Object.keys(input.currentFiles);

  const targets = targetPaths
    .map(p => `<<<FILE: ${p}>>>\n${input.currentFiles[p]}\n<<<END>>>`)
    .join('\n\n');

  const system = `You are fixing build errors. Re-emit the files below with the bugs fixed.
Same FILE/END marker format. Only emit files you actually changed. Do not modify any skeleton-locked path.
SKELETON: ${skeleton.label} (${skeleton.id})
${input.designCtx ? '\n' + designContractForCoder(input.designCtx) : ''}

BUILD ERROR LOG (truncated):
${input.errorLog.slice(0, 4000)}`;

  let body = '';
  await streamCall({
    slot:      'fix',
    system,
    user:      `Original task: ${input.prompt}\n\nFiles to repair:\n\n${targets}`,
    maxTokens: STEP_BUDGET.repair.maxTokens,
    timeoutMs: STEP_BUDGET.repair.timeoutMs,
    signal:    input.signal,
    routeOverrides: input.routeOverrides,
    onChunk:   (delta) => { body += delta; },
    onUsage:   input.onUsage,
  });
  const parsed = parseFileMarkers(body);
  if (Object.keys(parsed).length === 0) {
    throw new Error('Repair produced no FILE/END blocks');
  }
  return parsed;
}

// ── Backend compile call ─────────────────────────────────────────────────────

async function compile(
  buildId:    string,
  files:      Record<string, string>,
  skeletonId: SkeletonId,
  signal?:    AbortSignal,
  buildStage: import('./PreviewController').PreviewBuildStage = 'unknown',
): Promise<CompileResultTiming> {
  // 1. Notify UI that compile is starting (sets previewState.expectingBuildId → iframe gets URL)
  previewController.notifyCompiling(buildId, buildStage);

  // 2. Call backend compile endpoint
  const compileStartedAt = Date.now();
  const sessionId = getPreviewSessionToken();
  const resp = await fetch(`/api/preview/${encodeURIComponent(buildId)}/compile`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-Preview-Session': sessionId },
    body:    JSON.stringify({ files, skeletonId, sessionId }),
    signal,
  });
  const text = await resp.text();
  let json: { success?: boolean; error?: string } = {};
  try { json = JSON.parse(text); } catch { /* keep raw text */ }
  if (!resp.ok || json.success === false) {
    const errMsg = json.error || text || `compile failed (${resp.status})`;
    previewController.notifyFailed(errMsg, buildId);
    throw new Error(errMsg);
  }
  const compileMs = Date.now() - compileStartedAt;

  // 3. Force-reload the iframe so MountReporter fires (iframe may have gotten 404 during build)
  const iframe = typeof document !== 'undefined'
    ? document.querySelector<HTMLIFrameElement>('iframe[data-testid="preview-iframe"]')
    : null;
  const nextPreviewUrl = appendPreviewSessionToUrl(`/preview/${buildId}`);
  if (iframe) {
    const absoluteNextUrl = new URL(nextPreviewUrl, window.location.origin).toString();
    if (iframe.src === absoluteNextUrl) {
      iframe.src = 'about:blank';
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    }
    iframe.src = nextPreviewUrl;
  }

  // 4. Wait for preview-mounted postMessage from MountReporter (timeout: 45s)
  const previewMountStartedAt = Date.now();
  const ready = await waitForIframeMounted(buildId, signal);
  const previewMountMs = Date.now() - previewMountStartedAt;
  if (!ready) {
    // Don't throw — preview might still load; just log and continue
    console.warn(`[ProtoPipeline] compile: preview-mounted not received for ${buildId} — iframe may load later`);
  }

  // 5. Mark preview as ready in PreviewController
  previewController.notifyReady(buildId, 'proto_pipeline_complete', buildStage);
  return {
    compileMs,
    previewMountMs,
    totalMs: compileMs + previewMountMs,
    previewMounted: ready,
  };
}

function waitForIframeMounted(buildId: string, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const timeoutMs = 45_000;
    let settled = false;
    const settle = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(result);
    };
    const onMessage = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'preview-mounted' && e.data.buildId === buildId) settle(true);
      if (e.data.type === 'iframe-error') settle(false);
    };
    window.addEventListener('message', onMessage);
    const timer = setTimeout(() => settle(false), timeoutMs);
    signal?.addEventListener('abort', () => settle(false), { once: true });
  });
}

// ── LLM helpers ──────────────────────────────────────────────────────────────

interface ResolvedRoute {
  modelId:  string;
  apiKey:   string;
  endpoint: string;
  provider: string;
}

type RouteOverrideMap = Partial<Record<AgentSlot, ResolvedRoute>>;

function totalFileBytes(files: Record<string, string>): number {
  return Object.values(files).reduce((sum, content) => sum + new Blob([content]).size, 0);
}

function mergeLlmUsage(
  base: StepLlmMetrics | undefined,
  next: StepLlmMetrics,
): StepLlmMetrics {
  if (!base) return next;
  return {
    model: base.model || next.model,
    prompt_tokens: base.prompt_tokens + next.prompt_tokens,
    completion_tokens: base.completion_tokens + next.completion_tokens,
    total_tokens: base.total_tokens + next.total_tokens,
    cost_usd:
      typeof base.cost_usd === 'number' || typeof next.cost_usd === 'number'
        ? (base.cost_usd ?? 0) + (next.cost_usd ?? 0)
        : undefined,
  };
}

function extractUsageMetric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function resolveRoute(slot: AgentSlot, overrides?: RouteOverrideMap): ResolvedRoute {
  const override = overrides?.[slot];
  if (override) {
    const modelId = override.modelId?.trim();
    const endpoint = override.endpoint?.trim();
    if (!modelId || !endpoint) {
      throw new Error(`Invalid route override for slot "${slot}"`);
    }
    return {
      modelId,
      apiKey: override.apiKey ?? '',
      endpoint,
      provider: override.provider,
    };
  }
  const modelId = ConfigService.resolveModel(slot);
  if (!modelId) {
    throw new Error(
      `Model not configured for slot "${slot}". Open Settings → Agents and pick a model for AGENT_CONFIG_agent_${slot}.`,
    );
  }
  const apiKey = ConfigService.getKeyForAgent(slot);
  if (!apiKey) {
    throw new Error(
      `API key missing for slot "${slot}". Open Settings → Providers and set the key.`,
    );
  }
  const provider = ConfigService.getAgentConfig(`agent_${slot}`).provider || 'openrouter';
  const endpoint = Orchestrator.getEndpoint(provider);
  return { modelId, apiKey, endpoint, provider };
}

function resolveRouteOrSkip(slot: AgentSlot, overrides?: RouteOverrideMap): ResolvedRoute | null {
  try { return resolveRoute(slot, overrides); } catch { return null; }
}

async function callOnce(input: {
  slot:      AgentSlot;
  system:    string;
  user:      string;
  maxTokens: number;
  timeoutMs: number;
  signal?:   AbortSignal;
  routeOverrides?: RouteOverrideMap;
  onUsage?:  (usage: StepLlmMetrics) => void;
}): Promise<string> {
  let out = '';
  await streamCall({
    ...input,
    onChunk: (delta) => { out += delta; },
  });
  return out;
}

/**
 * Non-streaming LLM call. We deliberately set `stream: false` because the
 * surrounding pipeline only needs the final assistant message (it parses
 * <<<FILE>>>/<<<END>>> markers AFTER the call completes). Avoiding SSE means
 * we can JSON.parse the entire response body in one go and never have to
 * handle the `data: {...}\n\n` chunk framing — the original cause of the
 * "Unexpected token 'd'..." parse errors observed in the browser console.
 *
 * The `onChunk` callback is preserved for callers that wire it into a live
 * "writing code…" UI: we fire it exactly once with the full assistant content
 * so the existing accumulator code (`body += delta`) keeps working unchanged.
 */
async function streamCall(input: {
  slot:           AgentSlot;
  system:         string;
  user:           string;
  maxTokens:      number;
  timeoutMs:      number;
  signal?:        AbortSignal;
  routeOverrides?: RouteOverrideMap;
  onChunk:        (delta: string) => void;
  onFinishReason?: (reason: string) => void;
  onUsage?:       (usage: StepLlmMetrics) => void;
}): Promise<void> {
  const route = resolveRoute(input.slot, input.routeOverrides);
  const body = JSON.stringify({
    model:       Orchestrator.normalizeModelId(route.modelId, route.endpoint),
    messages:    [
      { role: 'system', content: input.system },
      { role: 'user',   content: input.user },
    ],
    stream:      false,
    temperature: 0.3,
    max_tokens:  input.maxTokens,
  });
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${route.apiKey}`,
    'Content-Type':  'application/json',
    'HTTP-Referer':  typeof window !== 'undefined' ? window.location.origin : '',
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), input.timeoutMs);
  const onCallerAbort = () => ctrl.abort();
  input.signal?.addEventListener('abort', onCallerAbort, { once: true });

  try {
    if (input.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const resp = route.provider === 'claude-cli' || route.provider === 'codex-cli'
      ? await fetch('/api/quality/llm-run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: route.provider === 'codex-cli' ? 'codex' : 'claude',
            model: route.modelId,
            systemPrompt: input.system,
            userPrompt: input.user,
          }),
          signal: ctrl.signal,
        })
      : await llmFetch(route.endpoint, headers, body);
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`LLM ${resp.status}: ${errText.slice(0, 300)}`);
    }
    const raw = await resp.text();
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      // Defensive fallback: some providers ignore stream:false and return SSE
      // anyway. Salvage by reassembling deltas line-by-line so the pipeline
      // never crashes mid-generation.
      const reassembled = reassembleSSE(raw);
      if (reassembled.content) {
        if (reassembled.content) input.onChunk(reassembled.content);
        if (reassembled.finishReason) input.onFinishReason?.(reassembled.finishReason);
        return;
      }
      throw new Error(
        `Unparseable LLM response (first 200 chars): ${raw.slice(0, 200)} — ${(err as Error).message}`,
      );
    }
    const usage = parsed?.usage;
    const content: string = route.provider === 'claude-cli' || route.provider === 'codex-cli'
      ? parsed?.output_text ?? ''
      : parsed?.choices?.[0]?.message?.content ?? '';
    const finishReason: string = route.provider === 'claude-cli' || route.provider === 'codex-cli'
      ? parsed?.finish_reason ?? ''
      : parsed?.choices?.[0]?.finish_reason ?? '';
    const promptTokens = extractUsageMetric(usage?.prompt_tokens);
    const completionTokens = extractUsageMetric(usage?.completion_tokens);
    const totalTokens = extractUsageMetric(usage?.total_tokens)
      ?? ((promptTokens ?? 0) + (completionTokens ?? 0));
    const costUsd =
      extractUsageMetric(usage?.cost_usd)
      ?? extractUsageMetric(usage?.total_cost)
      ?? extractUsageMetric(usage?.cost);
    if (promptTokens !== undefined || completionTokens !== undefined || totalTokens > 0) {
      input.onUsage?.({
        model: typeof parsed?.model === 'string'
          ? parsed.model
          : Orchestrator.normalizeModelId(route.modelId, route.endpoint),
        prompt_tokens: promptTokens ?? 0,
        completion_tokens: completionTokens ?? 0,
        total_tokens: totalTokens,
        cost_usd: costUsd,
      });
    }
    if (content) input.onChunk(content);
    if (finishReason) input.onFinishReason?.(finishReason);
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', onCallerAbort);
  }
}

/**
 * Defensive SSE fallback for providers that ignore `stream: false`.
 * Walks `data: {...}` lines and concatenates `delta.content` / `message.content`.
 */
function reassembleSSE(raw: string): { content: string; finishReason: string } {
  let content = '';
  let finishReason = '';
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice(6).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const parsed = JSON.parse(payload);
      const choice = parsed?.choices?.[0];
      if (!choice) continue;
      const piece = choice.delta?.content ?? choice.message?.content ?? '';
      if (typeof piece === 'string') content += piece;
      if (choice.finish_reason) finishReason = choice.finish_reason;
    } catch { /* skip malformed line */ }
  }
  return { content, finishReason };
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

function parseFileMarkers(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Tolerate variations: <<<FILE: path>>> ... <<<END>>>, with or without spaces.
  const re = /<<<\s*FILE\s*:\s*([^>\n]+?)\s*>>>([\s\S]*?)<<<\s*END\s*>>>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const path = normaliseDeltaPath(match[1].trim());
    if (!path) continue;
    let body = match[2];
    // Strip leading newline and any markdown fences the model might have wrapped around.
    body = body.replace(/^\s*```[\w-]*\s*\n?/, '').replace(/\n?```\s*$/, '');
    body = body.replace(/^\r?\n/, '').replace(/\r?\n\s*$/, '\n');
    out[path] = body;
  }
  return out;
}

function normaliseDeltaPath(p: string): string {
  return p
    .trim()
    .replace(/^\.?\/+/, '')
    .replace(/^src\/+/, '')
    .replace(/^preview-workspace\/(?:src\/)?/, '')
    .replace(/\\/g, '/');
}

function normalizeArchitectTreeKey(p: string): string {
  return normaliseDeltaPath(p);
}

export interface AugmentArchitectPlanInput {
  prompt: string;
  skeletonId: SkeletonId;
  fileTree: Record<string, string>;
  pages: Array<{ path: string; name: string; file: string; purpose: string }>;
  notes: string[];
  contextContract?: string;
  dataModel?: string;
}

export function buildArchitectShapeRequirement(prompt: string, skeletonId: SkeletonId): string {
  if (!isHabitTrackerPrompt(prompt) || skeletonId !== 'mobile-app') return '';
  return [
    'TRACKER DELTA REQUIREMENT:',
    '- Treat editable skeleton pages/config/data files as the main delta surface; include them in fileTree when rewritten.',
    '- For a habit tracker, fileTree must cover Home, Create, Detail, Progress, and Profile screens.',
    '- Include config/routes.ts (must export ROUTES object) and config/navigation.ts (must export BOTTOM_TABS array with {to,label,icon} entries matching ROUTES) as meaningful product navigation/config deltas.',
    '- Include a real data layer: data/types.ts, data/seed.ts, and one domain data helper file.',
    '- Include one reusable product component and one domain state hook.',
    '- Avoid generic copy like "New item", "Item not found", or generic placeholder text.',
  ].join('\n');
}

function isHabitTrackerPrompt(prompt: string): boolean {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) return false;
  return [
    'habit',
    'habits',
    'tracker',
    'streak',
    'routine',
    'daily check',
    'привыч',
    'трекер',
    'стрик',
  ].some(token => normalized.includes(token));
}

export function augmentArchitectPlan(input: AugmentArchitectPlanInput): AugmentArchitectPlanInput {
  if (!(input.skeletonId === 'mobile-app' && isHabitTrackerPrompt(input.prompt))) {
    return input;
  }

  // Strip landing-page section components — they are inappropriate for a mobile-app skeleton
  // and consume coder token budget, preventing habit-tracker page/config/data modifications.
  const SECTION_PATTERN = /^(?:src\/)?components\/sections\//;
  const fileTree: Record<string, string> = Object.fromEntries(
    Object.entries(input.fileTree).filter(([p]) => !SECTION_PATTERN.test(p)),
  );
  const ensureFile = (path: string, purpose: string) => {
    if (!fileTree[path]) fileTree[path] = purpose;
  };

  ensureFile('config/routes.ts', 'Habit route registry with home, create, progress, profile, and detail path helpers.');
  ensureFile('config/navigation.ts', 'Bottom-tab habit navigation config for Home, Create, Progress, and Profile flows.');
  ensureFile('data/types.ts', 'Habit domain types for habits, completion history, progress summaries, and profile preferences.');
  ensureFile('data/seed.ts', 'Starter habits, seeded completion history, and profile defaults for first launch.');
  ensureFile('data/habits.ts', 'Pure habit data helpers for lookups, streak calculation, completion toggles, and progress aggregation.');
  ensureFile('components/HabitCard.tsx', 'Reusable habit card with streak, schedule, completion CTA, and detail navigation.');
  ensureFile('hooks/useHabits.ts', 'Shared habit state hook that loads, creates, toggles, persists, and looks up habits.');
  ensureFile('pages/Home.tsx', 'Today screen with habit list, streak summary, add action, and detail navigation.');
  ensureFile('pages/Create.tsx', 'Create habit form with habit-specific examples, cadence fields, and save flow.');
  ensureFile('pages/Detail.tsx', 'Habit detail screen with schedule, recent completions, progress insight, and product-specific not-found recovery copy.');
  ensureFile('pages/Progress.tsx', 'Progress screen with weekly completion stats, streak insights, and completion trend summaries.');
  ensureFile('pages/Profile.tsx', 'Profile screen with goal preferences, reminder settings, and reset controls for habit tracking.');

  const pageMap = new Map(input.pages.map(page => [normaliseDeltaPath(page.file), page]));
  const ensurePage = (path: string, name: string, route: string, purpose: string) => {
    if (!pageMap.has(path)) {
      pageMap.set(path, { path: route, name, file: path, purpose });
    }
  };
  ensurePage('pages/Home.tsx', 'Home', '/home', 'Primary habit list and daily actions.');
  ensurePage('pages/Create.tsx', 'Create', '/create', 'Create a new habit with product-specific form fields.');
  ensurePage('pages/Detail.tsx', 'Detail', '/detail/:id', 'Review a habit and its recent completion history.');
  ensurePage('pages/Progress.tsx', 'Progress', '/progress', 'Inspect weekly completion trends and streak health.');
  ensurePage('pages/Profile.tsx', 'Profile', '/profile', 'Adjust preferences, reminders, and reset options.');

  const notes = Array.from(new Set([
    ...input.notes,
    'Replace all generic tracker scaffold copy with habit-specific labels, placeholders, empty states, and not-found recovery text.',
    'Keep domain types in src/data/types.ts and starter content in src/data/seed.ts instead of embedding them only inside hooks.',
    'Route and navigation config must stay synchronized with Home, Create, Detail, Progress, and Profile habit flows.',
  ]));

  const contextContract = input.contextContract && input.contextContract.trim().length > 0
    ? input.contextContract
    : 'Use useLocalStorage from the skeleton for persisted habit state; page files read and mutate habits through hooks/useHabits.ts instead of duplicating domain logic.';
  const dataModel = input.dataModel && input.dataModel.trim().length > 0
    ? input.dataModel
    : 'Habit: { id: string, name: string, goal: string, cadence: string[], streak: number, completedDates: string[], bestStreak: number, note?: string }; UserProfile: { id: string, name: string, focus: string, reminderTime: string };';

  return {
    ...input,
    fileTree,
    pages: Array.from(pageMap.values()),
    notes,
    contextContract,
    dataModel,
  };
}

function safeParseJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```json?\s*\n?/i, '').replace(/\n?```\s*$/, '');
  try { return JSON.parse(trimmed); } catch { /* fallthrough */ }
  // Salvage the first {...} block.
  const start = trimmed.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(trimmed.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

// ── Public step-label helper for UI consumers ────────────────────────────────

export function stepLabel(step: StepId): string {
  return STEP_LABEL[step];
}

