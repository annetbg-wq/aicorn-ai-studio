/**
 * GenerationEngine — adapter over the ProtoPipeline engine.
 *
 * The legacy SimpleGeneration module (~7 200 lines) has been replaced by the
 * 6-step pipeline in `ProtoPipeline.ts`. This file preserves
 * the public surface (`GenerationEngine.run / .generatePlan / .autoFix /
 * .clarify`, plus the `ProjectPlan` and `PipelineRunConfig` types) so the rest
 * of the codebase keeps compiling while every actual generation now goes
 * through ProtoPipeline under the hood.
 *
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │ useStudio / SandpackPreview / BenchmarkService                 │
 *   │      │  GenerationEngine.run / .generatePlan / .autoFix        │
 *   │      ▼                                                          │
 *   │ adapter (this file) → ProtoPipeline.{run,clarify,repair}        │
 *   │      │                                                          │
 *   │      ▼                                                          │
 *   │ /api/preview/:buildId/compile  (skeleton install + build)       │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * The adapter is intentionally thin: no admission gating, no artist layer,
 * no visual-polish loops, no plan confirmation gating, no edit-vs-create
 * branching. Every call is forwarded to ProtoPipeline and the response
 * is normalised back into the GenerationResult shape that downstream code
 * still reads.
 */

import { ProtoPipeline, type StepEvent, type StepId } from './ProtoPipeline';
import { selectSkeletonWithSafeOverrides, type SkeletonId } from './SkeletonRegistry';
import { ConfigService } from './ConfigService';
import { Orchestrator } from './Orchestrator';
import { llmFetchStream } from './LLMProxy';
import { revisionManager } from './RevisionManager';
import { metricsService } from './MetricsService';
import { generationTracer } from './GenerationTracer';
import { GenerationQualityService } from './benchmark/GenerationQualityService';
import { VisualQualityService } from './benchmark/VisualQualityService';
import type {
  LLMMessage,
  FileOperation,
  PhaseEvent,
  AgentPhase,
  UsageData,
  GenerationResult,
  ProjectGraph,
  ProductManifest,
  ChangePackage,
  ArtistLayerSpec,
  RedesignIntent,
  VisualPolishMode,
  RouteSpec,
} from '../shared/projectModel';
import type { AgentExecutionRoute } from './buildAgentRouting';
import type { AdmissionDecision } from './EditAdmissionService';
import type { FileDiff } from '../components/DiffPreview';

// ── Re-export ProjectPlan + co. so existing imports keep working ─────────────

export type {
  ProjectPlan,
  SectionSpec,
  KickoffBuildScopeId,
  PlanConfirmationResult,
} from './types/ProjectPlan';
import type { ProjectPlan } from './types/ProjectPlan';

export type { GenerationResult, ProjectGraph } from '../shared/projectModel';

// ── PipelineRunConfig — loose passthrough, matches old surface ───────────────

export interface PipelineRunConfig {
  intent:                string;
  history:               LLMMessage[];
  files:                 Record<string, string>;
  designSystemPrompt?:   string;
  primaryRoute:          AgentExecutionRoute;
  buildRoute:            AgentExecutionRoute;
  fixRoute?:             AgentExecutionRoute;
  specRoute?:            AgentExecutionRoute;
  qaRoute?:              AgentExecutionRoute;
  apiKey:                string;
  modelId:               string;
  fixModelId?:           string;
  onStream:              (text: string) => void;
  onFiles:               (ops: FileOperation[]) => void;
  onPhase:               (e: PhaseEvent) => void;
  onLog:                 (msg: string) => void;
  onPlan:                (steps: string[], appName?: string) => void;
  onPlanReady?:          (data: {
    plan:               object;
    blueprintText:      string;
    technicalBlueprint?: object | null;
    appName:            string;
    theme:              string;
    pages:              string[];
  }) => void;
  /** Called on each pipeline step state change so the UI can show a step track. */
  onStepTrack?:         (e: import('./ProtoPipeline').StepEvent) => void;
  waitForConfirmation?:  (plan: ProjectPlan) => Promise<unknown>;
  waitForDiffReview?:    (diffs: FileDiff[]) => Promise<string[] | false>;
  waitForAdmission?:     (decision: AdmissionDecision) => Promise<boolean>;
  signal?:               AbortSignal;
  onUsage?:              (data: UsageData) => void;
  language?:             string;
  maxIterations?:        number;
  projectId?:            string;
  branchId?:             string;
  revisionId?:           string;
  singlePageSafeMode?:   boolean;
  generationMode?:       'landing' | 'app' | 'superapp';
  prebuiltPlan?:         ProjectPlan;
  reuseSavedPlanForContinuation?: boolean;
  skipClarify?:          boolean;
  attachments?: Array<{
    type:        string;
    name:        string;
    data:        string;
    mimeType:    string;
    textContent?: string;
  }>;
  redesignIntent?:       Partial<RedesignIntent>;
  artistLayer?:          ArtistLayerSpec;
  visualPolishMode?:     VisualPolishMode;
  [key: string]: unknown;
}

// ── Public class — adapter over ProtoPipeline ──────────────────────────────

export class GenerationEngine {
  /**
   * Optional clarification step. Mirrors the legacy signature; delegates to
   * ProtoPipeline.clarify().
   */
  static async clarify(config: {
    intent:  string;
    apiKey:  string;
    signal?: AbortSignal;
  }): Promise<{ questions: string[] } | null> {
    return ProtoPipeline.clarify({ prompt: config.intent, signal: config.signal });
  }

  /**
   * Generate a structured plan card for the UI. One LLM call against the
   * primary slot. Falls back to a minimal local plan if the model is
   * unconfigured or replies with garbage so generation never blocks here.
   */
  static async generatePlan(config: {
    intent:    string;
    userLang:  string;
    apiKey:    string;
    route:     AgentExecutionRoute;
    projectId?: string;
    signal?:   AbortSignal;
  }): Promise<{
    appName:     string;
    summary:     string;
    pages:       string[];
    steps:       Array<{ id: string; label: string; status: 'pending' | 'active' | 'done' }>;
    assumptions: string[];
  }> {
    const fallback = makeFallbackPlan(config.intent);
    const route = config.route;
    if (!route?.modelId || !route?.apiKey) return fallback;

    const system = `You MUST respond in the user's language. User language: ${config.userLang}.
Generate a step-by-step plan for the user's app idea. Do not ask questions; if ambiguous, make a reasonable assumption.

Return ONLY JSON, no markdown, matching this exact shape:
{
  "appName":  "<short app name>",
  "summary":  "<one-sentence description>",
  "pages":    ["<page1>", "<page2>"],
  "steps": [
    { "id": "think",     "label": "<analysis summary>" },
    { "id": "architect", "label": "<architecture decision>" },
    { "id": "code",      "label": "<main coding tasks>" },
    { "id": "theme",     "label": "<visual style choice>" },
    { "id": "save",      "label": "Saving project" }
  ],
  "assumptions": ["<assumption if any>"]
}`;

    let raw: string;
    try {
      raw = await callPlanLLM(route, system, config.intent, config.signal);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      return fallback;
    }
    const parsed = safeParseJson(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;
    const obj = parsed as Record<string, unknown>;
    const pages = Array.isArray(obj.pages)
      ? obj.pages.filter((p): p is string => typeof p === 'string')
      : [];
    const stepsRaw = Array.isArray(obj.steps) ? obj.steps : [];
    const steps = stepsRaw
      .map((s) => {
        if (!s || typeof s !== 'object') return null;
        const sx = s as Record<string, unknown>;
        const id = typeof sx.id === 'string' ? sx.id : '';
        const label = typeof sx.label === 'string' ? sx.label : '';
        return id && label
          ? { id, label, status: 'pending' as const }
          : null;
      })
      .filter((s): s is { id: string; label: string; status: 'pending' } => s !== null);

    return {
      appName:     typeof obj.appName === 'string' ? obj.appName : fallback.appName,
      summary:     typeof obj.summary === 'string' ? obj.summary : fallback.summary,
      pages:       pages.length > 0 ? pages : fallback.pages,
      steps:       steps.length > 0 ? steps : fallback.steps,
      assumptions: Array.isArray(obj.assumptions)
        ? obj.assumptions.filter((a): a is string => typeof a === 'string')
        : [],
    };
  }

  /**
   * Run the full pipeline. Translates the legacy callback shape
   * (onStream / onFiles / onPhase / onLog / onPlan) to ProtoPipeline events
   * and synthesises a GenerationResult so downstream consumers continue to
   * read graph / operations / status / message as before.
   */
  static async run(config: PipelineRunConfig): Promise<GenerationResult> {
    const startMs = Date.now();
    const startedAt = new Date().toISOString();
    const log = (msg: string) => { try { config.onLog(msg); } catch { /* ignore */ } };
    const phase = (p: AgentPhase, progress: number) => {
      try { config.onPhase({ phase: p, progress }); } catch { /* ignore */ }
    };

    revisionManager.claimPreviewOwnership('GenerationEngine.run');

    const buildId = config.revisionId
      || revisionManager.getActiveRevisionId()
      || `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Pick a skeleton using safe override logic (advisory diagnostics + narrow deterministic overrides).
    const archetype = inferArchetype(config);
    const tags = inferTags(config);
    const skOverride = selectSkeletonWithSafeOverrides(archetype, tags);
    const skeletonId: SkeletonId = skOverride.finalSelectedSkeletonId;
    log(`[GenerationEngine] Skeleton original=${skOverride.originalSelectedSkeletonId} final=${skeletonId} override=${skOverride.overrideApplied}`);
    if (skOverride.overrideApplied && skOverride.overrideReason) {
      log(`[GenerationEngine] Skeleton override reason: ${skOverride.overrideReason}`);
    }
    log(`[GenerationEngine] Skeleton diagnostics: confidence=${skOverride.confidence} bestScore=${skOverride.bestScore} runnerUp=${skOverride.runnerUpSkeletonId ?? 'none'}(${skOverride.runnerUpScore})`);
    if (skOverride.intentSignals.length > 0) {
      log(`[GenerationEngine] Skeleton intent signals: ${skOverride.intentSignals.join(', ')}`);
    }
    for (const warning of skOverride.mismatchWarnings) {
      log(`[GenerationEngine] ⚠ Skeleton mismatch: ${warning}`);
    }
    if (skOverride.fallbackReason) {
      log(`[GenerationEngine] Skeleton fallback reason: ${skOverride.fallbackReason}`);
    }

    // Surface the architect "pages" plan to the UI as soon as we have one.
    const planFromConfig = config.prebuiltPlan;
    if (planFromConfig?.pages?.length) {
      try {
        config.onPlan(
          planFromConfig.pages.map(p => p.name ?? p.path ?? '').filter(Boolean),
          planFromConfig.appName,
        );
      } catch { /* ignore */ }
    }

    // Capture the tracer id BEFORE the pipeline runs so fail() and success share one runId.
    const outcomeRunId = generationTracer.current()?.id ?? crypto.randomUUID();

    let result: {
      success: boolean;
      files?: Record<string, string>;
      error?: string;
      url?: string;
      fastPathTelemetry?: import('../shared/projectModel').FastPathTelemetry;
      runTelemetry?: import('../shared/projectModel').GenerationRunTelemetry;
      outcomeData?: import('./ProtoPipeline').ProtoPipelineResult['outcomeData'];
      plan?: {
        appName: string;
        summary: string;
        deltaFiles: Array<{ path: string; purpose: string }>;
        pages?: Array<{ path: string; name: string; file: string; purpose: string }>;
      };
    };
    try {
      result = await ProtoPipeline.run({
        prompt:     config.intent,
        skeletonId,
        buildId,
        runId:      outcomeRunId,
        attachments: (config.attachments ?? [])
          .filter(a => a.type === 'image' || a.type === 'text' || a.type === 'code' || a.type === 'pdf')
          .map(a => ({
            type:        a.type as 'image' | 'text' | 'code' | 'pdf',
            name:        a.name,
            data:        a.data,
            mimeType:    a.mimeType,
            textContent: a.textContent,
          })),
        signal: config.signal,
        skipClarify: config.skipClarify,
        onLog:  (m) => log(m),
        onCoderStream: (delta) => {
          try { config.onStream(delta); } catch { /* ignore */ }
        },
        onStep: (e: StepEvent) => {
          // Map pipeline step events to legacy 4-phase signal.
          const m = stepToPhase(e.step, e.status);
          if (m) phase(m.phase, m.progress);
          // Emit a friendly log line.
          if (e.status === 'active') log(`[${e.step}] ${e.label}`);
          if (e.status === 'error')  log(`[${e.step}] error: ${e.detail ?? ''}`);
          // Build step-track markdown for the progress message and forward it
          // through a new onStepTrack channel if provided.
          if (config.onStepTrack) {
            try { config.onStepTrack(e); } catch { /* ignore */ }
          }
          // Surface the architect plan to onPlan once it's known.
          if (e.step === 'architect' && e.status === 'done') {
            try {
              const ap = (result as { plan?: { appName?: string; pages?: Array<{ name?: string; path?: string }> } } | undefined)?.plan;
              const names = ap?.pages?.map(p => p.name || p.path || '').filter(Boolean) ?? [];
              if (names.length) config.onPlan(names, ap?.appName);
            } catch { /* ignore */ }
          }
        },
      });
    } catch (err) {
      revisionManager.releasePreviewOwnership();
      const message = err instanceof Error ? err.message : String(err);
      log(`[GenerationEngine] pipeline crashed: ${message}`);
      return makeFailedResult({
        intent: config.intent,
        modelId: config.buildRoute?.modelId || config.modelId,
        message,
        startMs,
        startedAt,
      });
    }

    revisionManager.releasePreviewOwnership();

    if (!result.success) {
      log(`[GenerationEngine] pipeline failed: ${result.error ?? 'unknown'}`);
      return makeFailedResult({
        intent: config.intent,
        modelId: config.buildRoute?.modelId || config.modelId,
        message: result.error ?? 'Generation failed',
        startMs,
        startedAt,
      });
    }

    // Emit onFiles ops for the produced delta files.
    // R6: onFiles throw is a real failure — pipeline output didn't reach the revision.
    const ops: FileOperation[] = Object.entries(result.files ?? {})
      .map(([name, content]) => ({ op: 'upsert', name: `src/${name}`, content }));
    if (ops.length > 0) {
      try {
        config.onFiles(ops);
      } catch (onFilesErr) {
        revisionManager.releasePreviewOwnership();
        const onFilesMsg = onFilesErr instanceof Error ? onFilesErr.message : String(onFilesErr);
        log(`[GenerationEngine] onFiles failed — pipeline output not applied to revision: ${onFilesMsg}`);
        metricsService.logOutcomeEvent({
          runId:           outcomeRunId,
          prompt:          config.intent.slice(0, 600),
          skeletonId:      result.runTelemetry?.skeletonId,
          planSummary:     result.runTelemetry?.planSummary,
          deltaFileCount:  result.runTelemetry?.deltaFiles.length,
          compiled:        result.outcomeData?.compiled,
          repairPasses:    result.outcomeData?.repairPasses,
          designContractOk: result.outcomeData?.designContractOk,
          durationMs:      Date.now() - startMs,
          outcome:         'applied_empty',
          failedStep:      'apply_files',
          errorMessage:    onFilesMsg,
        });
        return makeFailedResult({
          intent:  config.intent,
          modelId: config.buildRoute?.modelId || config.modelId,
          message: `Files produced but could not be applied to revision: ${onFilesMsg}`,
          startMs,
          startedAt,
        });
      }
    }

    // Mark all phases done.
    phase('idle', 100);

    // Surface a final assistant message via onPlanReady (used to dispatch the
    // blueprint card). Optional — only fire if the consumer subscribed.
    if (config.onPlanReady && result.plan) {
      try {
        config.onPlanReady({
          plan:           result.plan as unknown as object,
          blueprintText:  result.plan.summary,
          appName:        result.plan.appName,
          theme:          'default',
          pages:          (result.plan.pages ?? []).map(p => p.name).filter(Boolean),
        });
      } catch { /* ignore */ }
    }

    const finished = new Date().toISOString();
    const filesArray = Object.entries(result.files ?? {});
    const graph = synthesiseGraph(buildId, config, filesArray, startedAt, finished, result.plan);
    const changePackage = emptyChangePackage(graph, ops);
    const baseResult = {
      id:            crypto.randomUUID(),
      status:        'completed',
      graph,
      operations:    ops,
      message:       result.plan ? `✅ ${result.plan.appName}: ${result.plan.summary}` : '✅ Готово',
      phase:         'idle',
      usedModel:     config.buildRoute?.modelId || config.modelId || 'unknown',
      selfCorrected: false,
      iterations:    1,
      durationMs:    Date.now() - startMs,
      createdAt:     finished,
      planTheme:     'dark-slate',
      changePackage,
      fastPathTelemetry: result.fastPathTelemetry,
      runTelemetry:  result.runTelemetry,
    } as unknown as GenerationResult;
    const visualQualitySummary = VisualQualityService.evaluate(baseResult);
    const qualitySummary = GenerationQualityService.evaluate(baseResult);

    const autofixNeeded  = (result.outcomeData?.repairPasses ?? 0) > 0;
    metricsService.logGeneration({
      generation_id:   outcomeRunId,
      intent:          config.intent.slice(0, 200),
      model_id:        config.buildRoute?.modelId || config.modelId || 'unknown',
      duration_ms:     Date.now() - startMs,
      file_count:      filesArray.length,
      parse_success:   true,
      fallback_used:   false,
      compile_success: result.outcomeData?.compiled ?? true,
      autofix_needed:  autofixNeeded,
      autofix_success: autofixNeeded,
      error_message:   null,
    });
    metricsService.logOutcomeEvent({
      runId:           outcomeRunId,
      prompt:          config.intent.slice(0, 600),
      skeletonId:      result.runTelemetry?.skeletonId,
      planSummary:     result.runTelemetry?.planSummary,
      deltaFileCount:  result.runTelemetry?.deltaFiles.length,
      compiled:        result.outcomeData?.compiled ?? true,
      repairPasses:    result.outcomeData?.repairPasses,
      designContractOk: result.outcomeData?.designContractOk,
      durationMs:      Date.now() - startMs,
      outcome:         'success',
    });

    return {
      ...baseResult,
      qualitySummary,
      visualQualitySummary,
      designContractOk: result.outcomeData?.designContractOk,
    } as unknown as GenerationResult;
  }

  /**
   * Minimal autoFix: collects current files from the active revision, asks
   * ProtoPipeline to repair them against the build error log, and returns
   * true on success.
   */
  static async autoFix(config: {
    errorMsg: string;
    apiKey:   string;
    onLog?:   (msg: string) => void;
    signal?:  AbortSignal;
  }): Promise<boolean> {
    const log = config.onLog ?? (() => {});
    const startMs = Date.now();
    const activeRevId = revisionManager.getActiveRevisionId();
    if (!activeRevId) {
      log('[autoFix] No active revision — cannot repair');
      return false;
    }
    const currentFiles = revisionManager.getRevisionFiles(activeRevId) ?? {};
    if (Object.keys(currentFiles).length === 0) {
      log('[autoFix] Active revision has no files — cannot repair');
      return false;
    }

    // Use the universal default skeleton; the repair pass only re-emits files
    // that already exist in `currentFiles` so the skeleton id mainly gates the
    // protected-paths check.
    const skeletonId: SkeletonId = 'mobile-app';
    const out = await ProtoPipeline.repair({
      buildId:      activeRevId,
      skeletonId,
      prompt:       'Restore the project to a building state by fixing the reported errors.',
      errorLog:     config.errorMsg,
      currentFiles,
      signal:       config.signal,
      onLog:        (m) => log(m),
    });

    metricsService.logGeneration({
      generation_id:   crypto.randomUUID(),
      intent:          config.errorMsg.slice(0, 200),
      model_id:        ConfigService.resolveModel('fix') || 'unknown',
      duration_ms:     Date.now() - startMs,
      file_count:      out.success ? 1 : 0,
      parse_success:   out.success,
      fallback_used:   false,
      compile_success: out.success,
      autofix_needed:  true,
      autofix_success: out.success,
      error_message:   out.success ? null : (out.error ?? null),
    });

    return out.success;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function inferArchetype(config: PipelineRunConfig): string {
  const plan = config.prebuiltPlan;
  if (plan?.layout?.type) return plan.layout.type;
  return config.generationMode ?? '';
}

function inferTags(config: PipelineRunConfig): string[] {
  const plan = config.prebuiltPlan;
  const tags: string[] = [];
  if (plan?.layout?.navigation) tags.push(plan.layout.navigation);
  if (plan?.theme)              tags.push(plan.theme);
  if (plan?.layout?.type)       tags.push(plan.layout.type);
  // Use the intent itself as a tag bag of words so skeleton keyword
  // matching has signal even without a prebuilt plan.
  tags.push(config.intent);
  return tags;
}

function stepToPhase(step: StepId, status: StepEvent['status']): { phase: AgentPhase; progress: number } | null {
  if (status !== 'active' && status !== 'done') return null;
  switch (step) {
    case 'clarify':   return { phase: 'think',  progress: status === 'active' ? 5  : 10 };
    case 'skeleton':  return { phase: 'think',  progress: status === 'active' ? 12 : 18 };
    case 'pack':      return { phase: 'think',  progress: status === 'active' ? 20 : 28 };
    case 'architect': return { phase: 'think',  progress: status === 'active' ? 30 : 40 };
    case 'coder':     return { phase: 'code',   progress: status === 'active' ? 45 : 78 };
    case 'apply':     return { phase: 'verify', progress: status === 'active' ? 82 : 88 };
    case 'build':     return { phase: 'verify', progress: status === 'active' ? 90 : 96 };
    case 'preview':   return { phase: 'idle',   progress: 100 };
    default:          return null;
  }
}

async function callPlanLLM(
  route: AgentExecutionRoute,
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<string> {
  const provider = (route as { provider?: string }).provider || 'openrouter';
  const endpoint = Orchestrator.getEndpoint(provider);
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${route.apiKey}`,
    'Content-Type':  'application/json',
    'HTTP-Referer':  typeof window !== 'undefined' ? window.location.origin : '',
  };
  const body = JSON.stringify({
    model:       route.modelId,
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: user },
    ],
    stream:      true,
    temperature: 0.3,
    max_tokens:  1500,
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  signal?.addEventListener('abort', () => ctrl.abort(), { once: true });
  let out = '';
  try {
    const resp = await llmFetchStream(endpoint, headers, body, ctrl.signal);
    const reader = resp.body?.getReader();
    if (!reader) return '';
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6);
        if (payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload);
          out += parsed.choices?.[0]?.delta?.content ?? '';
        } catch { /* skip malformed */ }
      }
    }
  } finally {
    clearTimeout(timer);
  }
  return out;
}

function safeParseJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```json?\s*\n?/i, '').replace(/\n?```\s*$/, '');
  try { return JSON.parse(trimmed); } catch { /* fallthrough */ }
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

function makeFallbackPlan(intent: string) {
  return {
    appName:     intent.slice(0, 40) || 'My App',
    summary:     intent.slice(0, 120),
    pages:       ['Home'],
    steps: [
      { id: 'think',     label: 'Analysing your idea',         status: 'pending' as const },
      { id: 'architect', label: 'Designing the architecture',  status: 'pending' as const },
      { id: 'code',      label: 'Writing the code',            status: 'pending' as const },
      { id: 'theme',     label: 'Polishing the visuals',       status: 'pending' as const },
      { id: 'save',      label: 'Saving project',              status: 'pending' as const },
    ],
    assumptions: [],
  };
}

function emptyManifest(intent: string): ProductManifest {
  const now = new Date().toISOString();
  return {
    version: 1 as const,
    id: crypto.randomUUID(),
    name: intent.slice(0, 60) || 'app',
    description: intent,
    intent,
    targetPlatforms: ['web'],
    techStack: {
      framework: 'react',
      language: 'typescript',
      styling: 'tailwind',
      bundler: 'vite',
      backend: null,
      stateManagement: null,
    },
    createdAt: now,
    updatedAt: now,
  } as ProductManifest;
}

function emptyChangePackage(graph: ProjectGraph, ops: FileOperation[]): ChangePackage {
  const routes = graph.routes ?? [];
  const isMultiPage = (graph.manifest as { isMultiPage?: boolean })?.isMultiPage ?? routes.length > 1;
  return {
    plan: [],
    graph,
    fileOperations: ops,
    routeManifest: { routes, isMultiPage },
    dependencies: [],
    previewMeta: { entryFile: 'src/App.tsx', capabilities: [] },
    guardResults: {
      integration: {
        isHealthy: true, totalIssues: 0, fixedCount: 0,
        reportedCount: 0, unresolvedIssues: [], durationMs: 0,
      },
      integrity: {
        passed: true, errorCount: 0, warnCount: 0,
        errors: [], warnings: [], durationMs: 0,
      },
      runtime: {
        passed: true, failingFiles: [], reasons: [], durationMs: 0,
      },
    },
    warnings: [],
    repairHints: [],
  };
}

function normalizeGeneratedPath(input: string): string {
  const normalized = input.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
  return normalized.startsWith('src/') ? normalized : `src/${normalized}`;
}

function inferGeneratedRole(path: string): ProjectGraph['files'][number]['role'] {
  if (/\/App\.tsx$/i.test(path)) return 'entry';
  if (/\/(?:pages|screens)\//.test(path)) return 'page';
  if (/\/components\//.test(path)) return 'component';
  if (/\/hooks\//.test(path)) return 'hook';
  if (/\/config\//.test(path)) return 'config';
  if (/\/services\//.test(path)) return 'service';
  if (/\/(?:data|context|lib)\//.test(path)) return path.endsWith('.css') ? 'style' : 'util';
  return 'component';
}

function buildRoutesFromPlan(plan?: {
  pages?: Array<{ path?: string; name?: string; file?: string; purpose?: string }>;
}): RouteSpec[] {
  if (!plan?.pages?.length) return [];
  return plan.pages.reduce<RouteSpec[]>((routes, page) => {
    const pagePath = typeof page.path === 'string' ? page.path : '';
    const filePath = typeof page.file === 'string' ? normalizeGeneratedPath(page.file) : '';
    const title = typeof page.name === 'string' ? page.name : '';
    if (!pagePath || !filePath || !title) {
      return routes;
    }
    routes.push({
      id: pagePath,
      path: pagePath,
      fileBlueprintId: filePath,
      filePath,
      title,
      isIndex: pagePath === '/',
      isProtected: false,
      params: [],
      children: [],
    });
    return routes;
  }, []);
}

function synthesiseGraph(
  buildId: string,
  config: PipelineRunConfig,
  files: Array<[string, string]>,
  createdAt: string,
  updatedAt: string,
  plan?: {
    appName: string;
    summary: string;
    deltaFiles: Array<{ path: string; purpose: string }>;
    pages?: Array<{ path: string; name: string; file: string; purpose: string }>;
  },
): ProjectGraph {
  const routes = buildRoutesFromPlan(plan);
  const fileBlueprints = files.map(([path, content], i) => {
    const normalizedPath = normalizeGeneratedPath(path);
    return {
      id: normalizedPath,
      path: normalizedPath,
      content,
      kind: 'component' as const,
      role: inferGeneratedRole(normalizedPath),
      language: normalizedPath.endsWith('.css')
        ? 'css'
        : normalizedPath.endsWith('.ts')
          ? 'ts'
          : 'tsx',
      exports: [],
      dependencies: [],
      hash: `${buildId}:${i}`,
      generatedAt: updatedAt,
      generatedBy: 'ai',
      isProtected: false,
      userZones: [],
    };
  }) as unknown as ProjectGraph['files'];

  return {
    version: 1 as const,
    id: crypto.randomUUID(),
    projectId: config.projectId ?? '',
    revisionId: buildId,
    manifest: {
      ...emptyManifest(config.intent),
      name: plan?.appName || config.intent.slice(0, 60) || 'app',
      description: plan?.summary || config.intent,
      isMultiPage: routes.length > 1,
    } as ProductManifest,
    files: fileBlueprints,
    routes,
    features: [],
    externalDependencies: [],
    entryFileId: fileBlueprints.find((file) => /\/App\.tsx$/i.test(file.path))?.id ?? '',
    createdAt,
    updatedAt,
  };
}

function makeFailedResult(input: {
  intent:    string;
  modelId:   string;
  message:   string;
  startMs:   number;
  startedAt: string;
}): GenerationResult {
  const failedId = crypto.randomUUID();
  const now = new Date().toISOString();
  const graph: ProjectGraph = {
    version: 1 as const,
    id: '',
    projectId: '',
    revisionId: '',
    manifest: emptyManifest(input.intent),
    files: [],
    routes: [],
    features: [],
    externalDependencies: [],
    entryFileId: '',
    createdAt: input.startedAt,
    updatedAt: now,
  };
  metricsService.logGeneration({
    generation_id:   failedId,
    intent:          input.intent.slice(0, 200),
    model_id:        input.modelId || 'unknown',
    duration_ms:     Date.now() - input.startMs,
    file_count:      0,
    parse_success:   false,
    fallback_used:   false,
    compile_success: false,
    autofix_needed:  false,
    autofix_success: false,
    error_message:   input.message.slice(0, 500),
  });
  return {
    id:            failedId,
    status:        'failed',
    graph,
    operations:    [],
    message:       input.message,
    phase:         'idle',
    usedModel:     input.modelId || 'unknown',
    selfCorrected: false,
    iterations:    1,
    durationMs:    Date.now() - input.startMs,
    createdAt:     now,
    error:         input.message,
    changePackage: emptyChangePackage(graph, []),
  } as unknown as GenerationResult;
}
