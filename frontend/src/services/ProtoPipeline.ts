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
  type DesignViolation,
  type MediaHint,
} from './DesignContract';
import { resolveMediaIntent } from './media/MediaIntentService';
import { LocalPlaceholderMediaProvider } from './media/MediaProvider';
import { mergeGeneratedMediaBundles } from './media/GeneratedMediaStore';
import type { GeneratedMediaAsset } from './media/MediaAssetManifestService';
import {
  describePremiumComponentSelection,
  describePremiumRecipeSelection,
  selectPremiumRecipe,
} from './PremiumComponentBankService';
import { normalizePath as normalizePreviewPath } from './PreviewWriteGateway';
import { appendPreviewSessionToUrl, getPreviewSessionToken } from './PreviewSessionService';
import type { FastPathTelemetry, GenerationRunTelemetry } from '../shared/projectModel';
import {
  buildScreenCompositionPlan,
  buildCompositionPlanPromptBlock,
  serializeScreenCompositionPlan,
  evaluateScreenCompositionDiagnostics,
  type ScreenCompositionPlan,
  type ScreenCompositionPlanTelemetry,
  type ScreenCompositionDiagnosticsResult,
} from './ScreenCompositionPlanner';
import {
  buildFunctionalFlowPlan,
  buildFunctionalFlowPromptBlock,
  buildFunctionalImplementationDiagnostics,
  serializeFunctionalFlowPlan,
  serializeFunctionalImplementationDiagnostics,
  type FunctionalFlowPlan,
  type FunctionalFlowPlanTelemetry,
  type FunctionalImplementationDiagnosticsTelemetry,
} from './FunctionalFlowPlanner';
import {
  buildArchitectureImplementationDiagnostics,
  buildArchitectureQualityRulesBlock,
  buildSkeletonIntegrationPlan,
  buildSkeletonIntegrationPromptBlock,
  serializeArchitectureImplementationDiagnostics,
  serializeSkeletonIntegrationPlan,
  type ArchitectureImplementationDiagnosticsTelemetry,
  type SkeletonIntegrationPlan,
  type SkeletonIntegrationPlanTelemetry,
} from './SkeletonIntegrationPlanner';
import {
  buildProductSpecificityDiagnostics,
  buildProductSpecificityPlan,
  buildProductSpecificityPromptBlock,
  serializeProductSpecificityDiagnostics,
  serializeProductSpecificityPlan,
  type ProductSpecificityDiagnostics,
  type ProductSpecificityDiagnosticsTelemetry,
  type ProductSpecificityPlan,
  type ProductSpecificityPlanTelemetry,
} from './ProductSpecificityPlanner';
import {
  extractJsonObjectFromModelText,
  safeModelTextSnippet,
  validateArchitectJsonShape,
} from './architectJson';
import {
  buildLiveGenerationUiPrimitiveImportCatalog,
  filterAdvertisedUiPrimitiveNames,
} from './LiveGenerationContractValidator';
import {
  buildMarketAwareBuilderBrief,
  buildBuilderOwnedSelfPlanInstructions,
  evaluateMarketAwareBuilderBriefDiagnostics,
  serializeMarketAwareBriefDiagnosticsTelemetry,
  serializeMarketAwareBuilderBriefForCoder,
  type MarketAwareBuilderBrief,
} from './MarketAwareBuilderBrief';
import {
  buildArchitectDependencyMap,
  evaluateArchitectRoleDiagnostics,
  serializeArchitectDependencyTelemetry,
} from './ArchitectDependencyMap';
import {
  buildMinimalArchitectPlanAdapter,
  evaluateArchitectReplacementAdapterReadiness,
  compareArchitectPlanWithAdapter,
  isArchitectPlanUsableForPipeline,
  maybeApplyArchitectAdapterFallback,
  type BuildMinimalArchitectPlanAdapterInput,
} from './ArchitectReplacementAdapter';

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

export interface DesignSelectionDiagnostics {
  inputBrief: string;
  detectedProductType?: string;
  detectedDomain?: string;
  detectedTone?: string;
  detectedMood?: string;
  selectedSkeletonId?: string;
  skeletonSelectionReason?: string;
  selectedVisualPackId?: string;
  selectedVisualVariantId?: string;
  visualPackSelectionReason?: string;
  visualPackFallbackUsed?: boolean;
  selectedPremiumRecipeId?: string;
  selectedPremiumRecipeReason?: string;
  selectedPremiumComponentIds: string[];
  premiumComponentSelectionReason?: string;
  selectedMediaKinds: string[];
  selectedMediaReasons: string[];
  designDecisionNotes: string[];
  possibleMismatchWarnings: string[];
  compositionPlanCreated?: boolean;
  compositionFirstScreenId?: string;
  compositionScreenCount?: number;
  compositionZoneCountOnFirstScreen?: number;
  functionalFlowPlanCreated?: boolean;
  functionalFlowCount?: number;
  functionalEntityCount?: number;
  skeletonIntegrationPlanCreated?: boolean;
  skeletonFit?: 'strong' | 'partial' | 'weak';
  skeletonBypassAllowed?: boolean;
  customModuleCount?: number;
  productSpecificityPlanCreated?: boolean;
  inferredDomain?: string;
  domainEntityCount?: number;
  productMetricCount?: number;
  forbiddenGenericPatternCount?: number;
  architectureDiagnosticsChecked?: boolean;
}

export interface VisualUsageDiagnostics {
  premiumUsageChecked: boolean;
  premiumComponentsSelected: string[];
  premiumComponentImportsFound: string[];
  premiumUsageCount: number;
  premiumUsageObserved: boolean;
  mediaUsageChecked: boolean;
  mediaAssetsMaterialized: string[];
  mediaAssetReferencesFound: string[];
  mediaUsageCount: number;
  mediaUsageObserved: boolean;
  firstScreenFilesChecked: string[];
  firstScreenPremiumUsageObserved: boolean;
  firstScreenMediaUsageObserved: boolean;
  meaningfulScreenFiles: string[];
  meaningfulScreenCount: number;
  genericPlaceholderFindings: string[];
  visualUsageNotes: string[];
  suggestedNextAction: 'none' | 'improve_prompt' | 'improve_assets' | 'add_repair_later';
}

export interface DesignSelectionDiagnosticsTelemetry {
  input_brief: string;
  detected_product_type?: string;
  detected_domain?: string;
  detected_tone?: string;
  detected_mood?: string;
  selected_skeleton_id?: string;
  skeleton_selection_reason?: string;
  selected_visual_pack_id?: string;
  selected_visual_variant_id?: string;
  visual_pack_selection_reason?: string;
  visual_pack_fallback_used?: boolean;
  selected_premium_recipe_id?: string;
  selected_premium_recipe_reason?: string;
  selected_premium_component_ids: string[];
  premium_component_selection_reason?: string;
  selected_media_kinds: string[];
  selected_media_reasons: string[];
  design_decision_notes: string[];
  possible_mismatch_warnings: string[];
  composition_plan_created?: boolean;
  composition_first_screen_id?: string;
  composition_screen_count?: number;
  composition_zone_count_on_first_screen?: number;
  functional_flow_plan_created?: boolean;
  functional_flow_count?: number;
  functional_entity_count?: number;
  skeleton_integration_plan_created?: boolean;
  skeleton_fit?: 'strong' | 'partial' | 'weak';
  skeleton_bypass_allowed?: boolean;
  custom_module_count?: number;
  product_specificity_plan_created?: boolean;
  inferred_domain?: string;
  domain_entity_count?: number;
  product_metric_count?: number;
  forbidden_generic_pattern_count?: number;
  architecture_diagnostics_checked?: boolean;
}

export interface VisualUsageDiagnosticsTelemetry {
  premium_usage_checked: boolean;
  premium_components_selected: string[];
  premium_component_imports_found: string[];
  premium_component_usage_count: number;
  premium_usage_observed: boolean;
  media_usage_checked: boolean;
  media_assets_materialized: string[];
  media_asset_references_found: string[];
  media_usage_count: number;
  media_usage_observed: boolean;
  first_screen_files_checked: string[];
  first_screen_premium_usage_observed: boolean;
  first_screen_media_usage_observed: boolean;
  meaningful_screen_files: string[];
  meaningful_screen_count: number;
  generic_placeholder_findings: string[];
  visual_usage_notes: string[];
  suggested_next_action: 'none' | 'improve_prompt' | 'improve_assets' | 'add_repair_later';
}

// ── Prototype quality gate ────────────────────────────────────────────────────

/**
 * Input to the deterministic prototype quality gate helper.
 * All fields are optional — omit any you don't have yet.
 */
export interface PrototypeQualityGateInput {
  /** Violations from validateDesignContract(). Null/undefined = check not run. */
  designContractViolations?: DesignViolation[] | null;
  /** Pre-computed visual usage diagnostics. Null/undefined = check not run. */
  visualUsageDiagnostics?: VisualUsageDiagnostics | null;
  /** Pre-computed product specificity diagnostics. Null/undefined = check not run. */
  productSpecificityDiagnostics?: ProductSpecificityDiagnostics | null;
}

/** The telemetry payload included with every quality gate result. */
export interface PrototypeQualityGateTelemetry {
  checks_run: string[];
  design_contract_violations: number;
  premium_selected_not_used: boolean;
  media_materialized_not_used: boolean;
  generic_placeholder_count: number;
  generic_dashboard_card_flag: boolean;
  specificity_score: number | null;
  /** Number of advisory (warn-only) reasons. */
  advisory_reasons_count: number;
  /**
   * True: runQualityRepair() is wired and will be called for all blocking reasons.
   * Blocking: design token violations, generic placeholders, premium-unused, media-unused.
   * Advisory reasons: none currently (all checks are either blocking or not run).
   */
  repair_hook_available: boolean;
}

/** Result returned by evaluatePrototypeQualityGate(). */
export interface PrototypeQualityGateResult {
  ok: boolean;
  blockingReasons: string[];
  repairInstructions: string[];
  /** Advisory issues (non-blocking). Currently empty — all checks are blocking. */
  advisoryReasons: string[];
  advisoryInstructions: string[];
  telemetry: PrototypeQualityGateTelemetry;
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
  materialized_premium_files?: string[];
  selected_premium_component_ids?: string[];
  selected_premium_recipe_id?: string | null;
  fallback_visual_selection?: boolean;
  materialized_media_files?: string[];
  media_manifest_path?: string;
  selected_media_kinds?: string[];
  design_selection_diagnostics?: DesignSelectionDiagnosticsTelemetry;
  visual_usage_diagnostics?: VisualUsageDiagnosticsTelemetry;
  screen_composition_plan?: ScreenCompositionPlanTelemetry;
  functional_flow_plan?: FunctionalFlowPlanTelemetry;
  skeleton_integration_plan?: SkeletonIntegrationPlanTelemetry;
  product_specificity_plan?: ProductSpecificityPlanTelemetry;
  functional_implementation_diagnostics?: FunctionalImplementationDiagnosticsTelemetry;
  architecture_implementation_diagnostics?: ArchitectureImplementationDiagnosticsTelemetry;
  product_specificity_diagnostics?: ProductSpecificityDiagnosticsTelemetry;
  screen_composition_diagnostics?: ScreenCompositionDiagnosticsResult;
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
  clarify:       { maxTokens:  600,   timeoutMs:  20_000 },
  architect:     { maxTokens: 8_000,  timeoutMs:  60_000 },
  coder:         { maxTokens: 35_000, timeoutMs: 360_000 },
  repair:        { maxTokens: 12_000, timeoutMs: 120_000 },
  qualityRepair: { maxTokens:  8_000, timeoutMs:  90_000 },
} as const;

const MAX_REPAIR_PASSES = 2;

const DESIGN_PACK_RAW_MODULES = import.meta.glob(
  [
    '../../../prototype-bank/design-packs/**/*',
    '!../../../prototype-bank/design-packs/**/preview-adapters/**',
  ],
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

interface MaterializedPremiumComponents {
  files: Record<string, string>;
  materializedFiles: string[];
  importHints: Array<{ componentId: string; importPath: string; sourcePath: string }>;
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

function premiumComponentImportPath(sourcePath: string): string {
  return `@/${outputPathForDesignPackAsset(sourcePath).replace(/\.[^.]+$/, '')}`;
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

const PREMIUM_COMPONENT_REGISTRY_SOURCE =
  'prototype-bank/design-packs/premium-components/_registry/premiumComponentPrimitives.tsx';

export function materializePremiumComponents(ctx: DesignContext): MaterializedPremiumComponents {
  const selection = ctx.premiumComponentSelection;
  const componentSourceFiles = Array.from(new Set(
    selection.componentSourceFiles.filter(path => (
      path.startsWith('prototype-bank/design-packs/premium-components/') &&
      path.endsWith('/component.tsx') &&
      !path.includes('/preview-adapters/') &&
      !/\/(?:LICENSE|license|import-notes?)\b/.test(path)
    )),
  ));

  if (componentSourceFiles.length === 0) {
    return { files: {}, materializedFiles: [], importHints: [] };
  }

  const repoMaterialFiles = [
    PREMIUM_COMPONENT_REGISTRY_SOURCE,
    ...componentSourceFiles,
  ];

  const files = Object.fromEntries(
    repoMaterialFiles.flatMap(path => {
      const raw = getDesignPackRawFile(path);
      if (!raw) return [];
      return [[outputPathForDesignPackAsset(path), raw] as const];
    }),
  );

  const importHints = selection.selectedComponents
    .filter(component => componentSourceFiles.includes(component.file))
    .map(component => ({
      componentId: component.id,
      importPath: premiumComponentImportPath(component.file),
      sourcePath: component.file,
    }));

  return {
    files,
    materializedFiles: Object.keys(files).sort((a, b) => a.localeCompare(b)),
    importHints,
  };
}

// ── Media materialization ─────────────────────────────────────────────────────

export interface MaterializedMediaAssets {
  files: Record<string, string>;
  materializedFiles: string[];
  mediaManifestPath?: string;
  mediaHints: MediaHint[];
  selectionReasons: string[];
}

const MEDIA_MANIFEST_PATH = 'src/assets/generated/media-manifest.json';

export async function materializeMediaAssets(
  ctx: DesignContext,
  brief: string,
  skeletonId: SkeletonId,
): Promise<MaterializedMediaAssets> {
  const recipe = selectPremiumRecipe({ brief, skeletonId, domainId: ctx.domain?.id });
  const intentResult = resolveMediaIntent({
    brief,
    skeleton: skeletonId,
    domain: ctx.domain?.id,
    selectedComponentRecipe: recipe,
  });

  if (!intentResult.mediaNeeded || intentResult.mediaRequests.length === 0) {
    return {
      files: {},
      materializedFiles: [],
      mediaHints: [],
      selectionReasons: intentResult.selectionReasons,
    };
  }

  const provider = new LocalPlaceholderMediaProvider();
  const allAssets: GeneratedMediaAsset[] = [];
  const svgFiles: Record<string, string> = {};

  for (const request of intentResult.mediaRequests) {
    const bundle = await provider.generateImage(request);
    allAssets.push(bundle.asset);
    svgFiles[bundle.asset.assetPath] = bundle.files[bundle.asset.assetPath] ?? '';
  }

  const files = mergeGeneratedMediaBundles(allAssets, svgFiles);

  const mediaHints: MediaHint[] = allAssets.map(asset => ({
    id: asset.id,
    kind: asset.type,
    importPath: asset.assetPath,
    recommendedUse: `${asset.targetSlot} on ${asset.targetScreen}`,
  }));

  const materializedFiles = Object.keys(files).sort((a, b) => a.localeCompare(b));
  return {
    files,
    materializedFiles,
    mediaManifestPath: MEDIA_MANIFEST_PATH,
    mediaHints,
    selectionReasons: intentResult.selectionReasons,
  };
}

const FIRST_SCREEN_CANDIDATES = [
  'App.tsx',
  'src/App.tsx',
  'pages/Home.tsx',
  'pages/Dashboard.tsx',
  'pages/Landing.tsx',
  'pages/Index.tsx',
  'app/page.tsx',
  'app/home/page.tsx',
  'app/dashboard/page.tsx',
] as const;

const GENERIC_PLACEHOLDER_PATTERNS: Array<{ label: string; rx: RegExp }> = [
  { label: 'Lorem', rx: /\blorem\b/i },
  { label: 'lorem ipsum', rx: /\blorem ipsum\b/i },
  { label: 'Feature 1', rx: /\bFeature 1\b/i },
  { label: 'Feature 2', rx: /\bFeature 2\b/i },
  { label: 'Feature 3', rx: /\bFeature 3\b/i },
  { label: 'AppName', rx: /\bAppName\b/i },
  { label: 'PRODUCT', rx: /\bPRODUCT\b/i },
  { label: 'Coming soon', rx: /\bComing soon\b/i },
  { label: 'Untitled', rx: /\bUntitled\b/i },
  { label: 'TODO', rx: /\bTODO\b/i },
  { label: 'placeholder image', rx: /\bplaceholder image\b/i },
  { label: 'gray placeholder', rx: /\bgray placeholder\b/i },
  { label: 'generic dashboard', rx: /\bgeneric dashboard\b/i },
  { label: 'generic app', rx: /\bgeneric app\b/i },
];

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)));
}

function productTypeLabel(productType?: string): string {
  switch (productType) {
    case 'landing-page': return 'landing-page';
    case 'mobile-app': return 'mobile-app';
    case 'saas-dashboard': return 'saas-dashboard';
    case 'social-community': return 'social-community';
    case 'productivity-tool': return 'productivity-tool';
    case 'ecommerce': return 'ecommerce';
    default: return productType ?? 'unknown';
  }
}

function isObviousSkeletonMismatch(detectedProductType: string | undefined, selectedSkeletonId: string): boolean {
  if (!detectedProductType || detectedProductType === selectedSkeletonId) return false;
  const obviousPairs = new Set([
    'mobile-app>landing-page',
    'mobile-app>saas-dashboard',
    'landing-page>mobile-app',
    'landing-page>saas-dashboard',
    'saas-dashboard>mobile-app',
    'saas-dashboard>landing-page',
    'ecommerce>mobile-app',
    'social-community>landing-page',
  ]);
  return obviousPairs.has(`${detectedProductType}>${selectedSkeletonId}`);
}

function buildSkeletonSelectionReason(
  detectedProductType: string | undefined,
  selectedSkeletonId: SkeletonId,
): string {
  if (detectedProductType === selectedSkeletonId) {
    return 'selected by brief product-type match';
  }
  return 'selected by pipeline skeletonId input; reason unavailable from current selector';
}

function readableVisualReason(reason: string): string {
  const code = reason.split(':')[0];
  switch (code) {
    case 'skeleton-compatible': return 'skeleton compatibility match';
    case 'skeleton-exact': return 'exact skeleton match';
    case 'skeleton-contract': return 'skeleton visual contract match';
    case 'density-contract': return 'density contract match';
    case 'motion-contract': return 'motion contract match';
    case 'surface': return 'surface match';
    case 'selected-surface': return 'selected surface match';
    case 'layout-pattern-contract': return 'layout pattern contract match';
    case 'component-family-contract': return 'component family contract match';
    case 'domain-tags': return 'domain match';
    case 'variant-domain-tags': return 'variant domain match';
    case 'semantic-pack-bridge': return 'semantic domain bridge';
    case 'subdomain': return 'subdomain match';
    case 'selected-subdomain': return 'selected subdomain match';
    case 'product-skeleton': return 'product-type skeleton match';
    case 'preferred-variant': return 'preferred variant match';
    case 'tone-profile': return 'tone profile match';
    case 'tone-in-variant': return 'tone-aligned variant';
    case 'tone-in-users': return 'target-user tone match';
    case 'semantic-in-users': return 'semantic domain target-user match';
    case 'semantic-neighbor': return 'semantic neighbor match';
    case 'trust-level': return 'trust-level match';
    case 'tone-density': return 'density match';
    case 'tone-radius': return 'radius match';
    case 'tone-motion': return 'motion match';
    case 'tone-contrast': return 'contrast match';
    case 'tone-color-family': return 'color-family match';
    case 'pack-priority': return 'pack priority weighting';
    case 'preferred-variant-floor': return 'preferred variant floor';
    default: return code.replace(/-/g, ' ');
  }
}

function buildVisualPackSelectionReason(ctx: DesignContext): string {
  if (ctx.visualSelection.fallbackVisualSelection) {
    return 'selected by fallback visual selection';
  }
  const selectedCandidate =
    ctx.visualSelection.audit.viableCandidates.find(candidate =>
      candidate.packId === ctx.visualSelection.selectedPackId &&
      candidate.variantId === ctx.visualSelection.selectedVariantId
    ) ??
    ctx.visualSelection.audit.candidates.find(candidate =>
      candidate.packId === ctx.visualSelection.selectedPackId &&
      candidate.variantId === ctx.visualSelection.selectedVariantId
    );
  if (!selectedCandidate) return 'reason unavailable from current selector';
  const reasons = uniqueStrings(selectedCandidate.reasons.map(readableVisualReason)).slice(0, 4);
  return reasons.length > 0
    ? `selected by ${reasons.join(', ')}`
    : 'reason unavailable from current selector';
}

function normalizeOutputPath(path: string): string {
  return normalizePreviewPath(path);
}

function isCodeFile(path: string): boolean {
  const normalized = normalizeOutputPath(path);
  return /\.(?:ts|tsx|css)$/.test(normalized);
}

function isSourceScanFile(path: string): boolean {
  const normalized = normalizeOutputPath(path);
  if (!isCodeFile(path)) return false;
  if (normalized.startsWith('design-pack/')) return false;
  if (normalized.startsWith('assets/generated/')) return false;
  if (normalized.includes('__tests__/')) return false;
  if (/\.(?:test|spec)\.tsx?$/.test(normalized)) return false;
  return true;
}

function isMeaningfulScreenFile(path: string): boolean {
  const normalized = normalizeOutputPath(path);
  if (!/\.tsx$/.test(normalized)) return false;
  if (!isSourceScanFile(path)) return false;
  if (normalized === 'App.tsx') return true;
  if (/^pages\/[^/]+\.tsx$/.test(normalized)) return true;
  if (/^app(?:\/[^/]+)*\/page\.tsx$/.test(normalized)) return true;
  if (/^screens\/[^/]+\.tsx$/.test(normalized)) return true;
  if (/^components\/screens\/[^/]+\.tsx$/.test(normalized)) return true;
  return false;
}

function findMatches(content: string, patterns: RegExp[]): string[] {
  const matches: string[] = [];
  for (const pattern of patterns) {
    const rx = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    let match: RegExpExecArray | null;
    while ((match = rx.exec(content)) !== null) {
      matches.push(match[0]);
    }
  }
  return matches;
}

export function buildVisualUsageDiagnostics(input: {
  files: Record<string, string>;
  skeletonId: SkeletonId;
  selectedPremiumComponentIds: string[];
  materializedMediaFiles: string[];
  designSelectionDiagnostics?: DesignSelectionDiagnostics;
}): VisualUsageDiagnostics {
  const fileEntries = Object.entries(input.files).filter(([path]) => isSourceScanFile(path));
  const premiumPatterns = [
    /@\/design-pack\/premium-components\/[^"'`\s)]+/g,
    /design-pack\/premium-components\/[^"'`\s)]+/g,
  ];
  const mediaAssetFiles = input.materializedMediaFiles
    .filter(path => path !== MEDIA_MANIFEST_PATH)
    .filter(path => /\.(?:svg|png|jpg|jpeg|webp|gif|avif)$/i.test(path));
  const mediaBasenames = mediaAssetFiles.map(path => path.split('/').pop()).filter((value): value is string => Boolean(value));
  const mediaPatterns = [
    /src\/assets\/generated\/[^"'`\s)]+/g,
    /\/assets\/generated\/[^"'`\s)]+/g,
    /generated-media/gi,
    ...mediaBasenames.map(name => new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')),
  ];

  const premiumFindings = fileEntries.flatMap(([path, content]) =>
    findMatches(content, premiumPatterns).map(match => `${normalizeOutputPath(path)}: ${match}`),
  );
  const mediaFindings = fileEntries
    .filter(([path]) => /\.(?:ts|tsx|css)$/.test(normalizeOutputPath(path)))
    .flatMap(([path, content]) =>
      findMatches(content, mediaPatterns).map(match => `${normalizeOutputPath(path)}: ${match}`),
    );

  const normalizedFileMap = new Map(fileEntries.map(([path]) => [normalizeOutputPath(path), normalizeOutputPath(path)]));
  const meaningfulScreenFiles = uniqueStrings(
    Object.keys(input.files)
      .filter(path => isMeaningfulScreenFile(path))
      .map(path => normalizeOutputPath(path)),
  ).sort((a, b) => a.localeCompare(b));
  const firstScreenFilesChecked = uniqueStrings(
    FIRST_SCREEN_CANDIDATES
      .map(path => normalizedFileMap.get(normalizeOutputPath(path)))
      .concat(meaningfulScreenFiles.length > 0 ? [meaningfulScreenFiles[0]] : []),
  ).sort((a, b) => a.localeCompare(b));

  const firstScreenSet = new Set(firstScreenFilesChecked);
  const firstScreenPremiumUsageObserved = premiumFindings.some(entry => firstScreenSet.has(entry.split(': ')[0] ?? ''));
  const firstScreenMediaUsageObserved = mediaFindings.some(entry => firstScreenSet.has(entry.split(': ')[0] ?? ''));

  const genericPlaceholderFindings = uniqueStrings(
    fileEntries.flatMap(([path, content]) =>
      GENERIC_PLACEHOLDER_PATTERNS
        .filter(pattern => pattern.rx.test(content))
        .map(pattern => `${normalizeOutputPath(path)}: ${pattern.label}`),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const premiumUsageChecked = input.selectedPremiumComponentIds.length > 0;
  const mediaUsageChecked = mediaAssetFiles.length > 0;
  const premiumComponentImportsFound = uniqueStrings(premiumFindings).sort((a, b) => a.localeCompare(b));
  const mediaAssetReferencesFound = uniqueStrings(mediaFindings).sort((a, b) => a.localeCompare(b));
  const premiumUsageObserved = premiumComponentImportsFound.length > 0;
  const mediaUsageObserved = mediaAssetReferencesFound.length > 0;

  const visualUsageNotes: string[] = [];
  if (premiumUsageChecked && !premiumUsageObserved) {
    visualUsageNotes.push('Premium components were selected, but generated source did not reference premium component imports.');
  }
  if (mediaUsageChecked && !mediaUsageObserved) {
    visualUsageNotes.push('Generated media assets were materialized, but generated source did not reference them.');
  }
  if (input.skeletonId === 'saas-dashboard' && meaningfulScreenFiles.length < 3) {
    visualUsageNotes.push('SaaS dashboard selected but fewer than 3 meaningful screens were observed.');
  }
  if (genericPlaceholderFindings.length > 0) {
    visualUsageNotes.push('Obvious generic placeholder content remains in generated source.');
  }

  const designMismatchObserved = (input.designSelectionDiagnostics?.possibleMismatchWarnings.length ?? 0) > 0;
  const assetsExistButUnused =
    (premiumUsageChecked && !premiumUsageObserved) ||
    (mediaUsageChecked && !mediaUsageObserved);
  const firstScreenVisualUsageObserved = firstScreenPremiumUsageObserved || firstScreenMediaUsageObserved;
  const repeatedUnusedSignals =
    (!firstScreenVisualUsageObserved && (premiumUsageObserved || mediaUsageObserved)) ||
    (premiumUsageChecked && mediaUsageChecked && !premiumUsageObserved && !mediaUsageObserved) ||
    genericPlaceholderFindings.length > 0;
  const suggestedNextAction: VisualUsageDiagnostics['suggestedNextAction'] =
    designMismatchObserved
      ? 'improve_assets'
      : assetsExistButUnused
        ? 'improve_prompt'
        : repeatedUnusedSignals
          ? 'add_repair_later'
          : 'none';

  return {
    premiumUsageChecked,
    premiumComponentsSelected: [...input.selectedPremiumComponentIds].sort((a, b) => a.localeCompare(b)),
    premiumComponentImportsFound,
    premiumUsageCount: premiumFindings.length,
    premiumUsageObserved,
    mediaUsageChecked,
    mediaAssetsMaterialized: [...mediaAssetFiles].sort((a, b) => a.localeCompare(b)),
    mediaAssetReferencesFound,
    mediaUsageCount: mediaFindings.length,
    mediaUsageObserved,
    firstScreenFilesChecked,
    firstScreenPremiumUsageObserved,
    firstScreenMediaUsageObserved,
    meaningfulScreenFiles,
    meaningfulScreenCount: meaningfulScreenFiles.length,
    genericPlaceholderFindings,
    visualUsageNotes,
    suggestedNextAction,
  };
}

export function buildDesignSelectionDiagnostics(input: {
  inputBrief: string;
  selectedSkeletonId: SkeletonId;
  designCtx: DesignContext;
  selectedMediaKinds: string[];
  selectedMediaReasons: string[];
  visualUsageDiagnostics?: VisualUsageDiagnostics;
}): DesignSelectionDiagnostics {
  const detectedProductType = input.designCtx.visualSelection.signals.productDomain || undefined;
  const detectedDomain =
    input.designCtx.domain?.id ??
    input.designCtx.visualSelection.signals.semanticDomainId ??
    undefined;
  const detectedTone =
    input.designCtx.visualSelection.signals.toneProfiles[0] ??
    input.designCtx.visualSelection.toneProfile ??
    undefined;
  const selectedPremiumRecipeId = input.designCtx.premiumComponentSelection.selectedRecipeId ?? undefined;
  const selectedPremiumComponentIds = input.designCtx.premiumComponentSelection.selectedComponents
    .map(component => component.id)
    .sort((a, b) => a.localeCompare(b));
  const diagnostics: DesignSelectionDiagnostics = {
    inputBrief: input.inputBrief,
    detectedProductType,
    detectedDomain,
    detectedTone,
    detectedMood: input.designCtx.intent.mood,
    selectedSkeletonId: input.selectedSkeletonId,
    skeletonSelectionReason: buildSkeletonSelectionReason(detectedProductType, input.selectedSkeletonId),
    selectedVisualPackId: input.designCtx.visualSelection.selectedPackId,
    selectedVisualVariantId: input.designCtx.visualSelection.selectedVariantId,
    visualPackSelectionReason: buildVisualPackSelectionReason(input.designCtx),
    visualPackFallbackUsed: input.designCtx.visualSelection.fallbackVisualSelection,
    selectedPremiumRecipeId,
    selectedPremiumRecipeReason: selectedPremiumRecipeId
      ? describePremiumRecipeSelection({
          brief: input.inputBrief,
          skeletonId: input.selectedSkeletonId,
          domainId: detectedDomain,
          surfaces: input.designCtx.visualSelection.surfaces,
        })
      : undefined,
    selectedPremiumComponentIds,
    premiumComponentSelectionReason: describePremiumComponentSelection(
      input.designCtx.premiumComponentSelection,
      {
        brief: input.inputBrief,
        skeletonId: input.selectedSkeletonId,
        domainId: detectedDomain,
        surfaces: input.designCtx.visualSelection.surfaces,
      },
    ),
    selectedMediaKinds: [...input.selectedMediaKinds].sort((a, b) => a.localeCompare(b)),
    selectedMediaReasons: [...input.selectedMediaReasons],
    designDecisionNotes: uniqueStrings([
      `visual selection pipeline: ${input.designCtx.visualSelection.audit.pipelineStages.map(stage => stage.stage).join(' > ') || 'fallback'}`,
      input.designCtx.visualSelection.audit.selectedByExactMatch ? 'visual variant matched an exact preferred signal' : null,
      input.designCtx.visualSelection.audit.selectedAfterDiversity ? 'visual selection changed after diversity balancing' : null,
      input.designCtx.visualSelection.audit.selectedBySeed ? 'visual selection was resolved by stable seed within the viable pool' : null,
      input.designCtx.visualSelection.signals.recommendedDesign
        ? `recommended design hint: ${input.designCtx.visualSelection.signals.recommendedDesign}`
        : null,
    ]),
    possibleMismatchWarnings: [],
  };

  if (isObviousSkeletonMismatch(diagnostics.detectedProductType, input.selectedSkeletonId)) {
    diagnostics.possibleMismatchWarnings.push(
      `Brief looks like ${productTypeLabel(diagnostics.detectedProductType)}, but selected skeleton is ${input.selectedSkeletonId}.`,
    );
  }
  if (diagnostics.visualPackFallbackUsed) {
    diagnostics.possibleMismatchWarnings.push('Visual fallback was used, so design direction may be less product-specific.');
  }
  if (
    input.visualUsageDiagnostics &&
    input.selectedSkeletonId === 'saas-dashboard' &&
    input.visualUsageDiagnostics.meaningfulScreenCount < 3
  ) {
    diagnostics.possibleMismatchWarnings.push('SaaS dashboard selected but fewer than 3 meaningful screens were observed.');
  }
  if (
    selectedPremiumRecipeId === 'health-wellness-mobile' &&
    input.visualUsageDiagnostics &&
    !input.visualUsageDiagnostics.premiumUsageObserved
  ) {
    diagnostics.possibleMismatchWarnings.push('Premium health recipe selected, but no premium component usage was later observed.');
  }
  if (
    diagnostics.selectedMediaKinds.length > 0 &&
    input.visualUsageDiagnostics &&
    !input.visualUsageDiagnostics.firstScreenMediaUsageObserved
  ) {
    diagnostics.possibleMismatchWarnings.push('Media asset selected for hero/background, but no first-screen media usage was observed.');
  }

  return diagnostics;
}

export function serializeDesignSelectionDiagnostics(
  diagnostics: DesignSelectionDiagnostics,
): DesignSelectionDiagnosticsTelemetry {
  return {
    input_brief: diagnostics.inputBrief,
    detected_product_type: diagnostics.detectedProductType,
    detected_domain: diagnostics.detectedDomain,
    detected_tone: diagnostics.detectedTone,
    detected_mood: diagnostics.detectedMood,
    selected_skeleton_id: diagnostics.selectedSkeletonId,
    skeleton_selection_reason: diagnostics.skeletonSelectionReason,
    selected_visual_pack_id: diagnostics.selectedVisualPackId,
    selected_visual_variant_id: diagnostics.selectedVisualVariantId,
    visual_pack_selection_reason: diagnostics.visualPackSelectionReason,
    visual_pack_fallback_used: diagnostics.visualPackFallbackUsed,
    selected_premium_recipe_id: diagnostics.selectedPremiumRecipeId,
    selected_premium_recipe_reason: diagnostics.selectedPremiumRecipeReason,
    selected_premium_component_ids: diagnostics.selectedPremiumComponentIds,
    premium_component_selection_reason: diagnostics.premiumComponentSelectionReason,
    selected_media_kinds: diagnostics.selectedMediaKinds,
    selected_media_reasons: diagnostics.selectedMediaReasons,
    design_decision_notes: diagnostics.designDecisionNotes,
    possible_mismatch_warnings: diagnostics.possibleMismatchWarnings,
    composition_plan_created: diagnostics.compositionPlanCreated,
    composition_first_screen_id: diagnostics.compositionFirstScreenId,
    composition_screen_count: diagnostics.compositionScreenCount,
    composition_zone_count_on_first_screen: diagnostics.compositionZoneCountOnFirstScreen,
    functional_flow_plan_created: diagnostics.functionalFlowPlanCreated,
    functional_flow_count: diagnostics.functionalFlowCount,
    functional_entity_count: diagnostics.functionalEntityCount,
    skeleton_integration_plan_created: diagnostics.skeletonIntegrationPlanCreated,
    skeleton_fit: diagnostics.skeletonFit,
    skeleton_bypass_allowed: diagnostics.skeletonBypassAllowed,
    custom_module_count: diagnostics.customModuleCount,
    product_specificity_plan_created: diagnostics.productSpecificityPlanCreated,
    inferred_domain: diagnostics.inferredDomain,
    domain_entity_count: diagnostics.domainEntityCount,
    product_metric_count: diagnostics.productMetricCount,
    forbidden_generic_pattern_count: diagnostics.forbiddenGenericPatternCount,
    architecture_diagnostics_checked: diagnostics.architectureDiagnosticsChecked,
  };
}

export function serializeVisualUsageDiagnostics(
  diagnostics: VisualUsageDiagnostics,
): VisualUsageDiagnosticsTelemetry {
  return {
    premium_usage_checked: diagnostics.premiumUsageChecked,
    premium_components_selected: diagnostics.premiumComponentsSelected,
    premium_component_imports_found: diagnostics.premiumComponentImportsFound,
    premium_component_usage_count: diagnostics.premiumUsageCount,
    premium_usage_observed: diagnostics.premiumUsageObserved,
    media_usage_checked: diagnostics.mediaUsageChecked,
    media_assets_materialized: diagnostics.mediaAssetsMaterialized,
    media_asset_references_found: diagnostics.mediaAssetReferencesFound,
    media_usage_count: diagnostics.mediaUsageCount,
    media_usage_observed: diagnostics.mediaUsageObserved,
    first_screen_files_checked: diagnostics.firstScreenFilesChecked,
    first_screen_premium_usage_observed: diagnostics.firstScreenPremiumUsageObserved,
    first_screen_media_usage_observed: diagnostics.firstScreenMediaUsageObserved,
    meaningful_screen_files: diagnostics.meaningfulScreenFiles,
    meaningful_screen_count: diagnostics.meaningfulScreenCount,
    generic_placeholder_findings: diagnostics.genericPlaceholderFindings,
    visual_usage_notes: diagnostics.visualUsageNotes,
    suggested_next_action: diagnostics.suggestedNextAction,
  };
}

// ── Prototype quality gate helper ─────────────────────────────────────────────

/**
 * Deterministic quality gate for generated prototype output.
 *
 * Consumes pre-computed diagnostic signals (no LLM calls, no file I/O).
 *
 * BLOCKING (ok=false, hard-fail before build step):
 *   - raw/forbidden design token violations from the design contract
 *   - obvious generic placeholders (Feature 1, AppName, Lorem ipsum, Untitled, TODO)
 *   - numbered metric placeholder slots (Item 1, KPI 1, Metric 1)
 *   - empty/generic dashboard metric cards flagged by product specificity
 *
 * ADVISORY (warn-only, ok remains true — repair hook not yet available):
 *   - premium components selected but none referenced in generated source
 *   - media assets materialized but none referenced in generated source
 *
 * Wired as a blocking gate in ProtoPipeline.run() after emit('apply', 'done', ...).
 * Advisory reasons are logged as warn before the build step.
 *
 * Next commit should add runQualityRepair(designCtx, filteredFiles, qualityGate)
 * targeting the blocking reasons via a bounded coder patch prompt (not LLM compile repair).
 */
export function evaluatePrototypeQualityGate(
  input: PrototypeQualityGateInput,
): PrototypeQualityGateResult {
  const blockingReasons: string[] = [];
  const repairInstructions: string[] = [];
  const advisoryReasons: string[] = [];
  const advisoryInstructions: string[] = [];
  const checksRun: string[] = [];

  // ── Check 1: design contract raw token violations ─────────────────────────
  const violations = input.designContractViolations ?? null;
  const designContractViolationCount = violations !== null ? violations.length : 0;
  if (violations !== null) {
    checksRun.push('design_contract');
    if (designContractViolationCount > 0) {
      const ruleSet = Array.from(new Set(violations.map(v => v.rule))).slice(0, 4).join(', ');
      blockingReasons.push(
        `Design contract: ${designContractViolationCount} raw token violation(s) in generated source (rules: ${ruleSet})`,
      );
      repairInstructions.push(
        'Replace raw hex/rgb/hsl colours and Tailwind palette classes (e.g. bg-blue-500) ' +
        'with semantic tokens: bg-background, text-foreground, bg-primary, bg-card, bg-muted, etc.',
      );
    }
  }

  // ── Check 2: premium components selected but not referenced ───────────────
  const vud = input.visualUsageDiagnostics ?? null;
  const premiumSelectedNotUsed =
    vud !== null && vud.premiumUsageChecked && !vud.premiumUsageObserved;
  const mediaNotUsed =
    vud !== null && vud.mediaUsageChecked && !vud.mediaUsageObserved;

  if (vud !== null) {
    checksRun.push('visual_usage');

    if (premiumSelectedNotUsed) {
      const ids = vud.premiumComponentsSelected.slice(0, 4).join(', ');
      blockingReasons.push(
        `Premium components selected (${ids}) but none referenced in generated source`,
      );
      repairInstructions.push(
        'Import at least one premium component from @/design-pack/premium-components/ ' +
        'and visibly render it in a meaningful section or screen (e.g. hero, feature card, dashboard widget). ' +
        `Selected component IDs: ${ids}`,
      );
    }

    // ── Check 3: media materialized but not referenced ────────────────────────
    if (mediaNotUsed) {
      const files = vud.mediaAssetsMaterialized.slice(0, 3).join(', ');
      blockingReasons.push(
        `Generated media assets materialized (${files}) but none referenced in generated source`,
      );
      repairInstructions.push(
        'Reference at least one generated media asset in a visible UI area. ' +
        'Prefer hero section, feature highlight, or empty-state illustration depending on existing layout. ' +
        `Materialized assets: ${files}`,
      );
    }

    // ── Check 4: generic placeholder content ─────────────────────────────────
    const visualPlaceholders = vud.genericPlaceholderFindings;
    const BLOCKING_PLACEHOLDER_LABELS = new Set([
      'Feature 1', 'Feature 2', 'Feature 3',
      'AppName', 'PRODUCT',
      'Lorem', 'lorem ipsum',
      'Untitled', 'TODO',
    ]);
    const blockingVisualPlaceholders = visualPlaceholders.filter(finding => {
      const label = finding.split(': ').slice(1).join(': ');
      return BLOCKING_PLACEHOLDER_LABELS.has(label);
    });

    if (blockingVisualPlaceholders.length > 0) {
      blockingReasons.push(
        `Generic placeholder content in ${blockingVisualPlaceholders.length} location(s): ` +
        blockingVisualPlaceholders.slice(0, 4).join('; '),
      );
      repairInstructions.push(
        'Replace all generic placeholders (Feature 1, AppName, Lorem ipsum, Untitled, TODO) ' +
        'with product-specific copy and domain-specific entity names.',
      );
    }
  }

  // ── Check 5: product specificity — empty/generic dashboard cards ──────────
  const psd = input.productSpecificityDiagnostics ?? null;
  const genericDashboardCardFlag = psd !== null && (
    psd.emptyMetricFindings.length > 0 ||
    psd.suggestedNextAction === 'add_repair_later'
  );

  // Also detect Item 1 / KPI 1 from specificity generic placeholder findings
  let specificityPlaceholderCount = 0;
  if (psd !== null) {
    checksRun.push('product_specificity');

    const SPECIFICITY_BLOCKING_PATTERNS = /\b(Item\s+\d+|KPI\s+\d+|Metric\s+\d+|Stat\s+\d+)\b/i;
    specificityPlaceholderCount = psd.genericPlaceholderFindings.filter(
      finding => SPECIFICITY_BLOCKING_PATTERNS.test(finding),
    ).length;

    if (specificityPlaceholderCount > 0) {
      blockingReasons.push(
        `Generic numbered metric placeholders in ${specificityPlaceholderCount} location(s) ` +
        '(e.g. Item 1, KPI 1, Metric 1)',
      );
      repairInstructions.push(
        'Replace numbered metric slots (Item 1, KPI 1, Metric 1) with real domain-specific ' +
        'labels and example values (e.g. "Active Users This Week", "Revenue MTD").',
      );
    }

    if (genericDashboardCardFlag && psd.emptyMetricFindings.length > 0) {
      const examples = psd.emptyMetricFindings.slice(0, 3).join('; ');
      blockingReasons.push(
        `Empty or generic dashboard metric cards: ${examples}`,
      );
      repairInstructions.push(
        'Fill dashboard cards with product-specific metrics and realistic sample values. ' +
        'Use domain entities and product metrics from the ProductSpecificityPlan.',
      );
    }
  }

  const totalGenericPlaceholderCount =
    (vud?.genericPlaceholderFindings.length ?? 0) + specificityPlaceholderCount;

  return {
    ok: blockingReasons.length === 0,
    blockingReasons,
    repairInstructions,
    advisoryReasons,
    advisoryInstructions,
    telemetry: {
      checks_run: checksRun,
      design_contract_violations: designContractViolationCount,
      premium_selected_not_used: premiumSelectedNotUsed,
      media_materialized_not_used: mediaNotUsed,
      generic_placeholder_count: totalGenericPlaceholderCount,
      generic_dashboard_card_flag: genericDashboardCardFlag,
      specificity_score: psd?.specificityScore ?? null,
      advisory_reasons_count: advisoryReasons.length,
      repair_hook_available: true,
    },
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

    // ── Controlled adapter fallback (rescue before pipeline guard) ────────────
    // Fires only when runArchitect output fails isArchitectPlanUsableForPipeline.
    // Does NOT add LLM calls. Does NOT fire for valid plans (fast path exits immediately).
    // When adapter readiness passes, plan is replaced with the adapter rescue plan.
    // When adapter readiness fails, plan is left unchanged and the existing guard
    // below fires exactly as before.
    {
      const fallbackMarketBrief = buildMarketAwareBuilderBrief({
        brief: clarifiedPrompt,
        skeletonId: config.skeletonId,
        premiumComponentIds: designCtx.premiumComponentSelection.selectedComponents.map(c => c.id),
        // mediaHints intentionally omitted — not yet materialized at this pipeline point.
        // mediaHints defaults to [] inside buildMarketAwareBuilderBrief; safe for fallback.
      });
      const fallbackResult = maybeApplyArchitectAdapterFallback({
        realPlan: plan,
        brief: fallbackMarketBrief,
        skeletonId: config.skeletonId,
        expectedFiles: plan.deltaFiles,
      });
      if (fallbackResult.fallbackApplied) {
        plan = fallbackResult.plan;
        log(
          `[architect-adapter-fallback] applied` +
          ` reason="${fallbackResult.fallbackReason ?? ''}"` +
          ` adapter_readiness_ok=${String(fallbackResult.adapterReadinessOk)}` +
          ` issue_count=${fallbackResult.telemetry.adapter_issue_count}`,
          'warn',
        );
      } else if (fallbackResult.telemetry.fallback_triggered) {
        log(
          `[architect-adapter-fallback] triggered but adapter not ready` +
          ` reason="${fallbackResult.fallbackReason ?? ''}"` +
          ` diagnostics: ${fallbackResult.diagnostics.slice(0, 3).join(' | ')}`,
          'warn',
        );
      }
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

    // ── Architect dependency map diagnostics (advisory only) ──────────────
    // Wired after runArchitect normalization, before deterministic planners.
    // Does not affect plan, planners, coder input, or compile behavior.
    // Does not remove runArchitect. Does not block generation.
    {
      const architectDependencyMap = buildArchitectDependencyMap(plan);
      const architectRoleDiagnostics = evaluateArchitectRoleDiagnostics(plan, {
        marketAwareBriefInjected: true,       // market brief is injected (PR #12)
        builderOwnedSelfPlanInjected: true,   // builder self-plan is injected (PR #13)
      });
      const architectDependencyTelemetry = serializeArchitectDependencyTelemetry(
        architectDependencyMap,
        architectRoleDiagnostics,
      );
      log(
        `[architect-dependency] required=${architectDependencyTelemetry.architect_dependency_required_count}` +
        ` advisory=${architectDependencyTelemetry.architect_dependency_advisory_count}` +
        ` candidate_downscope=${architectDependencyTelemetry.architect_fields_candidate_for_downscope_count}` +
        ` technical_ownership=${String(architectDependencyTelemetry.architect_technical_ownership_detected)}` +
        ` replacement_adapter_needed=${String(architectDependencyTelemetry.replacement_adapter_needed)}`,
      );
      for (const issue of architectRoleDiagnostics.issues) {
        log(`[architect-dependency] advisory ${issue.severity}: [${issue.code}] ${issue.message}`, 'warn');
      }
    }

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

    // ── Media materialization (deterministic, no LLM) ─────────────────────
    const mediaMaterialization = await materializeMediaAssets(designCtx, clarifiedPrompt, config.skeletonId);
    if (mediaMaterialization.mediaHints.length > 0) {
      log(`[media] materialized ${mediaMaterialization.mediaHints.length} media asset(s): ${mediaMaterialization.mediaHints.map(h => h.id).join(', ')}`);
    }

    // ── Screen composition planning (deterministic, no LLM) ──────────────────
    const compositionPlan = buildScreenCompositionPlan({
      brief: clarifiedPrompt,
      skeletonId: config.skeletonId,
      designCtx,
      premiumComponentIds: designCtx.premiumComponentSelection.selectedComponents.map(c => c.id),
      mediaHints: mediaMaterialization.mediaHints,
      architectPlan: plan,
    });
    if (compositionPlan.screens.length > 0) {
      log(`[composition] built plan: ${compositionPlan.screens.length} screens, firstScreenId=${compositionPlan.firstScreenId}, zones=${compositionPlan.screens.find(s => s.id === compositionPlan.firstScreenId)?.zones.length ?? 0} on first screen`);
    }
    const functionalFlowPlan = buildFunctionalFlowPlan({
      brief: clarifiedPrompt,
      skeletonId: config.skeletonId,
      screenCompositionPlan: compositionPlan,
      architectPlan: plan,
    });
    if (functionalFlowPlan.flows.length > 0) {
      log(`[functional] built plan: ${functionalFlowPlan.flows.length} flows, entities=${functionalFlowPlan.entities.length}, goal="${functionalFlowPlan.primaryUserGoal}"`);
    }
    const skeletonIntegrationPlan = buildSkeletonIntegrationPlan({
      brief: clarifiedPrompt,
      skeletonId: config.skeletonId,
      screenCompositionPlan: compositionPlan,
      functionalFlowPlan,
      premiumComponentIds: designCtx.premiumComponentSelection.selectedComponents.map(c => c.id),
      mediaHints: mediaMaterialization.mediaHints,
      architectPlan: plan,
    });
    log(
      `[skeleton-integration] fit=${skeletonIntegrationPlan.skeletonFit} bypassAllowed=${String(skeletonIntegrationPlan.skeletonBypassAllowed)} customModules=${skeletonIntegrationPlan.customModules.length}`,
    );
    const productSpecificityPlan = buildProductSpecificityPlan({
      brief: clarifiedPrompt,
      skeletonId: config.skeletonId,
      screenCompositionPlan: compositionPlan,
      functionalFlowPlan,
      skeletonIntegrationPlan,
      premiumComponentIds: designCtx.premiumComponentSelection.selectedComponents.map(c => c.id),
      mediaHints: mediaMaterialization.mediaHints,
      architectPlan: plan,
    });
    log(
      `[product-specificity] domain="${productSpecificityPlan.inferredDomain}" entities=${productSpecificityPlan.domainEntities.length} metrics=${productSpecificityPlan.productMetrics.length}`,
    );

    // ── Market-aware builder brief diagnostics (advisory only, no blocking) ──
    // Wired before runCoder to provide visibility into market context coverage.
    // Does not change final generated files, compile behavior, or quality gate.
    const marketBrief = buildMarketAwareBuilderBrief({
      brief: clarifiedPrompt,
      skeletonId: config.skeletonId,
      premiumComponentIds: designCtx.premiumComponentSelection.selectedComponents.map(c => c.id),
      mediaHints: mediaMaterialization.mediaHints,
    });
    const marketBriefDiagnostics = evaluateMarketAwareBuilderBriefDiagnostics(marketBrief);
    const marketBriefTelemetry = serializeMarketAwareBriefDiagnosticsTelemetry(
      marketBrief,
      marketBriefDiagnostics,
      true, // coder_prompt_contains_market_brief — injected into coder planning blocks
      true, // builder_owned_self_plan_injected — self-plan block appended after market brief
    );
    const serializedBriefLength = serializeMarketAwareBuilderBriefForCoder(marketBrief).length;
    const mustItemCount = marketBrief.selfTestChecklist.filter(i => i.severity === 'must').length;
    log(
      `[market-brief] ok=${String(marketBriefTelemetry.market_brief_ok)} category=${marketBriefTelemetry.product_category} insights=${marketBriefTelemetry.market_insight_count} screens=${marketBriefTelemetry.required_screen_count} checklist=${marketBriefTelemetry.self_test_item_count} differentiator=${String(marketBriefTelemetry.differentiator_present)} generic=${String(marketBriefTelemetry.suspiciously_generic)} techArch=${String(marketBriefTelemetry.tries_to_own_technical_architecture)}`,
    );
    log(
      `[market-brief] injected=true serialized_length=${serializedBriefLength} required_moments=${marketBriefTelemetry.required_screen_count} self_test_must_count=${mustItemCount}`,
    );
    log(
      `[builder-self-plan] injected=${String(marketBriefTelemetry.builder_owned_self_plan_injected)} instruction_length=${marketBriefTelemetry.self_plan_instruction_length} self_test_items=${marketBriefTelemetry.self_test_items_count}`,
    );
    if (marketBriefDiagnostics.issues.length > 0) {
      for (const issue of marketBriefDiagnostics.issues) {
        log(`[market-brief] advisory ${issue.severity}: [${issue.code}] ${issue.message}`, 'warn');
      }
    }

    // ── Architect adapter shadow telemetry (advisory only, no blocking) ───────
    // Wired after runArchitect normalization and after market-aware brief, screen
    // composition, and product specificity plans are all available.
    // Uses real plan.deltaFiles as expectedFiles so the adapter reconstructs from
    // the same file list the architect produced — isolating brief/skeleton fidelity.
    // Does NOT mutate realPlan. Does NOT fail generation. Does NOT trigger repair.
    // Does NOT change output, planners, coder input, or any production behavior.
    {
      const adapterInput: BuildMinimalArchitectPlanAdapterInput = {
        brief: marketBrief,
        skeletonId: config.skeletonId,
        expectedFiles: plan.deltaFiles,
        screenCompositionPlan: compositionPlan,
        productSpecificityPlan,
      };
      const adapterPlan = buildMinimalArchitectPlanAdapter(adapterInput);
      const adapterReadiness = evaluateArchitectReplacementAdapterReadiness(adapterInput, adapterPlan);
      const comparison = compareArchitectPlanWithAdapter({
        realPlan: plan,
        adapterPlan,
        adapterReadiness,
      });
      const t = comparison.telemetry;
      log(
        `[architect-adapter-shadow] enabled=${String(t.architect_adapter_shadow_enabled)}` +
        ` compatible=${String(t.adapter_compatible)}` +
        ` score=${t.adapter_compatibility_score.toFixed(3)}` +
        ` missing=${t.adapter_missing_fields_count}` +
        ` file_overlap=${t.adapter_file_overlap_count}` +
        ` page_overlap=${t.adapter_page_overlap_count}` +
        ` readiness_ok=${String(t.adapter_readiness_ok)}` +
        ` replacement_safe_candidate=${String(t.adapter_replacement_safe_candidate)}`,
      );
      if (comparison.mismatches.length > 0) {
        log(
          `[architect-adapter-shadow] mismatches: ${comparison.mismatches.join(' | ')}`,
          'warn',
        );
      }
      if (comparison.missingInAdapter.length > 0) {
        log(
          `[architect-adapter-shadow] missing_in_adapter: ${comparison.missingInAdapter.slice(0, 5).join(', ')}`,
          'warn',
        );
      }
    }

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
        mediaHints: mediaMaterialization.mediaHints,
         compositionPlan,
         functionalFlowPlan,
         skeletonIntegrationPlan,
         productSpecificityPlan,
         marketAwareBuilderBrief: marketBrief,
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
    const premiumMaterialization = materializePremiumComponents(designCtx);
    Object.assign(deltaFiles, premiumMaterialization.files);
    Object.assign(deltaFiles, mediaMaterialization.files);
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

    let filteredFiles: Record<string, string> = {};
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
    const selectedPremiumComponentIds = designCtx.premiumComponentSelection.selectedComponents
      .map(component => component.id)
      .sort((a, b) => a.localeCompare(b));
    const selectedMediaKinds = mediaMaterialization.mediaHints
      .map(hint => hint.kind)
      .sort((a, b) => a.localeCompare(b));
    const preliminaryDesignSelectionDiagnostics = buildDesignSelectionDiagnostics({
      inputBrief: clarifiedPrompt,
      selectedSkeletonId: config.skeletonId,
      designCtx,
      selectedMediaKinds,
      selectedMediaReasons: mediaMaterialization.selectionReasons,
    });
    const visualUsageDiagnostics = buildVisualUsageDiagnostics({
      files: filteredFiles,
      skeletonId: config.skeletonId,
      selectedPremiumComponentIds,
      materializedMediaFiles: mediaMaterialization.materializedFiles,
      designSelectionDiagnostics: preliminaryDesignSelectionDiagnostics,
    });
    const designSelectionDiagnostics = buildDesignSelectionDiagnostics({
      inputBrief: clarifiedPrompt,
      selectedSkeletonId: config.skeletonId,
      designCtx,
      selectedMediaKinds,
      selectedMediaReasons: mediaMaterialization.selectionReasons,
      visualUsageDiagnostics,
    });
    // Enrich design selection diagnostics with composition plan info
    const firstCompositionScreen = compositionPlan.screens.find(s => s.id === compositionPlan.firstScreenId);
    designSelectionDiagnostics.compositionPlanCreated = true;
    designSelectionDiagnostics.compositionFirstScreenId = compositionPlan.firstScreenId;
    designSelectionDiagnostics.compositionScreenCount = compositionPlan.screens.length;
    designSelectionDiagnostics.compositionZoneCountOnFirstScreen = firstCompositionScreen?.zones.length ?? 0;
    // Advisory composition diagnostics — never blocks generation
    const compositionDiagnostics = evaluateScreenCompositionDiagnostics(compositionPlan);
    if (!compositionDiagnostics.ok) {
      log(
        `[composition-diagnostics] advisory: score=${compositionDiagnostics.compositionScore} warnings=${compositionDiagnostics.warnings.length}: ${compositionDiagnostics.warnings.join(' | ')}`,
        'warn',
      );
    } else {
      log(`[composition-diagnostics] ok: score=${compositionDiagnostics.compositionScore}`);
    }
    designSelectionDiagnostics.functionalFlowPlanCreated = true;
    designSelectionDiagnostics.functionalFlowCount = functionalFlowPlan.flows.length;
    designSelectionDiagnostics.functionalEntityCount = functionalFlowPlan.entities.length;
    const functionalImplementationDiagnostics = buildFunctionalImplementationDiagnostics({
      files: filteredFiles,
      plan: functionalFlowPlan,
    });
    const architectureImplementationDiagnostics = buildArchitectureImplementationDiagnostics({
      files: filteredFiles,
      skeletonId: config.skeletonId,
      screenCompositionPlan: compositionPlan,
      functionalFlowPlan,
      skeletonIntegrationPlan,
    });
    const productSpecificityDiagnostics = buildProductSpecificityDiagnostics({
      files: filteredFiles,
      plan: productSpecificityPlan,
    });
    if (skeletonIntegrationPlan.skeletonFit === 'weak' && config.skeletonId !== 'landing-page') {
      designSelectionDiagnostics.possibleMismatchWarnings.push(
        `Skeleton integration fit is weak for ${config.skeletonId}; keep the selected skeleton as the foundation and extend it cleanly.`,
      );
    }
    designSelectionDiagnostics.skeletonIntegrationPlanCreated = true;
    designSelectionDiagnostics.skeletonFit = skeletonIntegrationPlan.skeletonFit;
    designSelectionDiagnostics.skeletonBypassAllowed = skeletonIntegrationPlan.skeletonBypassAllowed;
    designSelectionDiagnostics.customModuleCount = skeletonIntegrationPlan.customModules.length;
    designSelectionDiagnostics.productSpecificityPlanCreated = true;
    designSelectionDiagnostics.inferredDomain = productSpecificityPlan.inferredDomain;
    designSelectionDiagnostics.domainEntityCount = productSpecificityPlan.domainEntities.length;
    designSelectionDiagnostics.productMetricCount = productSpecificityPlan.productMetrics.length;
    designSelectionDiagnostics.forbiddenGenericPatternCount = productSpecificityPlan.forbiddenGenericPatterns.length;
    designSelectionDiagnostics.architectureDiagnosticsChecked = architectureImplementationDiagnostics.architectureDiagnosticsChecked;
    stepResults.apply = {
      output: {
        file_count: Object.keys(filteredFiles).length,
        total_bytes: totalFileBytes(filteredFiles),
        files: Object.keys(filteredFiles),
        materialized_visual_files: visualMaterialization.materializedFiles,
        materialized_premium_files: premiumMaterialization.materializedFiles,
        selected_premium_component_ids: selectedPremiumComponentIds,
        selected_premium_recipe_id: designCtx.premiumComponentSelection.selectedRecipeId,
        materialized_media_files: mediaMaterialization.materializedFiles,
        media_manifest_path: mediaMaterialization.mediaManifestPath,
        selected_media_kinds: selectedMediaKinds,
        design_selection_diagnostics: serializeDesignSelectionDiagnostics(designSelectionDiagnostics),
        visual_usage_diagnostics: serializeVisualUsageDiagnostics(visualUsageDiagnostics),
        screen_composition_plan: serializeScreenCompositionPlan(compositionPlan),
        functional_flow_plan: serializeFunctionalFlowPlan(functionalFlowPlan),
        skeleton_integration_plan: serializeSkeletonIntegrationPlan(skeletonIntegrationPlan),
        product_specificity_plan: serializeProductSpecificityPlan(productSpecificityPlan),
        functional_implementation_diagnostics: serializeFunctionalImplementationDiagnostics(functionalImplementationDiagnostics),
        architecture_implementation_diagnostics: serializeArchitectureImplementationDiagnostics(architectureImplementationDiagnostics),
        product_specificity_diagnostics: serializeProductSpecificityDiagnostics(productSpecificityDiagnostics),
        screen_composition_diagnostics: compositionDiagnostics,
      },
      warnings: droppedProtected > 0 ? [`${droppedProtected} protected file(s) ignored`] : undefined,
    };
    emit('apply', 'done', `${Object.keys(filteredFiles).length} файлов`, stepResults.apply);

    // ── Prototype quality gate — one bounded repair pass, then hard-block ───
    // All blocking reasons: attempt repair first.
    //   If repair THROWS (infra failure — no FILE/END blocks, timeout, abort): degrade all
    //   blocking issues to advisory and continue. Do not fail for broken repair infra.
    //   If repair SUCCEEDS but re-evaluation still shows hard-blocking reasons: fail.
    // Hard-blocking (if repair succeeds but issues persist): design token violations,
    //   generic placeholders, empty dashboard metric cards.
    // Soft-blocking (degrade to advisory even if repair succeeds but post-repair still fails):
    //   premium components selected-but-unused, media assets materialized-but-unused.
    const qualityGate = evaluatePrototypeQualityGate({
      designContractViolations: verdict.ok ? [] : verdict.violations,
      visualUsageDiagnostics,
      productSpecificityDiagnostics,
    });
    // Log advisory issues (none currently; kept for future advisory checks)
    if (qualityGate.advisoryReasons.length > 0) {
      log(
        `[quality-gate] ${qualityGate.advisoryReasons.length} advisory issue(s) (not blocking): ` +
          qualityGate.advisoryReasons.join(' | '),
        'warn',
      );
    }
    // If blocking, attempt exactly one quality repair pass before hard-failing
    if (!qualityGate.ok) {
      // Determine whether all blocking reasons are soft (premium/media) or include hard ones
      const SOFT_BLOCKING_PREFIXES = [
        'Premium components selected',
        'Generated media assets materialized',
      ] as const;
      const allSoftBlocking = qualityGate.blockingReasons.every(r =>
        SOFT_BLOCKING_PREFIXES.some(p => r.startsWith(p)),
      );
      log(
        `[quality-gate] ${qualityGate.blockingReasons.length} blocking issue(s)` +
          (allSoftBlocking ? ' (soft/repair-first)' : ' (includes hard-blocking)') +
          '; attempting one quality repair pass',
        'warn',
      );
      for (const instruction of qualityGate.repairInstructions) {
        log(`[quality-gate] repair needed: ${instruction}`, 'warn');
      }
      try {
        filteredFiles = await runQualityRepair({
          prompt:                       clarifiedPrompt,
          skeletonId:                   config.skeletonId,
          currentFiles:                 filteredFiles,
          blockingReasons:              qualityGate.blockingReasons,
          repairInstructions:           qualityGate.repairInstructions,
          designCtx,
          productSpecificityDiagnostics,
          signal:                       config.signal,
          routeOverrides:               config.routeOverrides,
          onLog:                        log,
        });
        // Re-run diagnostics on repaired files — pure JS, no LLM
        const repairedVerdict = validateDesignContract(filteredFiles, designCtx);
        const repairedVisualUsage = buildVisualUsageDiagnostics({
          files:                      filteredFiles,
          skeletonId:                 config.skeletonId,
          selectedPremiumComponentIds,
          materializedMediaFiles:     mediaMaterialization.materializedFiles,
        });
        const repairedSpecificity = buildProductSpecificityDiagnostics({
          files: filteredFiles,
          plan:  productSpecificityPlan,
        });
        const repairedGate = evaluatePrototypeQualityGate({
          designContractViolations: repairedVerdict.ok ? [] : repairedVerdict.violations,
          visualUsageDiagnostics:   repairedVisualUsage,
          productSpecificityDiagnostics: repairedSpecificity,
        });
        if (!repairedGate.ok) {
          // Fail only if post-repair result still has hard-blocking reasons.
          // If repair fixed all hard-blocking issues and only soft-blocking remains,
          // degrade those to advisory and continue.
          const postRepairAllSoft = repairedGate.blockingReasons.every(r =>
            SOFT_BLOCKING_PREFIXES.some(p => r.startsWith(p)),
          );
          if (!postRepairAllSoft) {
            return fail(
              'apply',
              `Quality gate failed after repair: ${repairedGate.blockingReasons.join(' | ')}`,
            );
          }
          // Soft-blocking still failing after repair — degrade to advisory and continue
          log(
            `[quality-gate] premium/media still unused after repair (advisory): ` +
              repairedGate.blockingReasons.join(' | '),
            'warn',
          );
        } else {
          log('[quality-gate] quality gate passed after repair');
        }
      } catch (err) {
        if (isAbort(err)) return fail('apply', 'aborted');
        log(`[quality-gate] repair attempt failed: ${(err as Error).message}`, 'warn');
        // Repair infrastructure failure (no FILE/END blocks, timeout, etc.) — we cannot
        // determine whether it would have fixed the issues. Degrade ALL blocking reasons to
        // advisory and continue. Hard-fail is reserved for when repair runs successfully but
        // re-evaluation still shows hard-blocking issues (handled in the try block above).
        log(
          `[quality-gate] repair infrastructure failure — all ${qualityGate.blockingReasons.length} quality issue(s) downgraded to advisory (best-effort)`,
          'warn',
        );
      }
    } else if (qualityGate.advisoryReasons.length === 0) {
      log('[quality-gate] prototype quality gate: ok');
    }

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
            mediaHints:  mediaMaterialization.mediaHints,
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
  const architectRoute = resolveRouteOrSkip('primary', input.routeOverrides);
  const architectProvider = architectRoute?.provider ?? 'unknown';
  const architectModel = architectRoute
    ? Orchestrator.normalizeModelId(architectRoute.modelId, architectRoute.endpoint)
    : 'unknown';
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
  const architectureQualityRules = buildArchitectureQualityRulesBlock();

  const architectRole = buildArchitectProductStrategistRole();
  const system = `${architectRole}

The user wants a React + Tailwind app built on top of an EXISTING SKELETON.

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
${architectureQualityRules}
YOUR TASK: Return fileTree with ONLY the delta files this specific app needs.
The skeleton is already installed. You MAY include editable skeleton files in fileTree when they need meaningful product-specific rewrites.
Typical delta for a mobile app: multiple routed pages, product navigation config, a real data layer, one domain hook, and at least one reusable product component.
${shapeRequirement}
Each fileTree value must be one sentence saying what the file does and which data / state it uses.

ARCHITECT_OUTPUT_CONTRACT:
- Return exactly one valid JSON object.
- Do not wrap it in markdown.
- Do not use code fences.
- Do not add commentary before or after JSON.
- Do not include explanations outside JSON.
- The JSON must match the required architect schema.

Return ONLY valid JSON matching this schema:
{
  "appName":  "<short name>",
  "skeleton": "${skeleton.id}",
  "summary":  "<one-sentence elevator pitch>",
  "fileTree": {
    "src/pages/Home.tsx": "Minimal pipeline scaffold — expected delta file: main screen, what it shows and which state/data it uses",
    "src/hooks/useSomething.ts": "Minimal pipeline scaffold — expected delta file: hook, what it owns and which data it persists"
  },
  "pages": [
    { "path": "/dashboard", "name": "Dashboard", "file": "pages/Dashboard.tsx", "purpose": "Product moment: what the user experiences on this screen" }
  ],
  "skeletonFitNotes": ["optional note about why the skeleton fits or where it needs clean extension"],
  "skeletonBypassNotes": ["optional note about preserving the selected skeleton foundation"],
  "customModuleNotes": ["optional note about product-specific modules to add"],
  "fileOwnershipNotes": ["optional note about which file types own screens/data/hooks/components"],
  "contextContract": "<[product-strategy-source][builder-owned][pipeline-scaffolding] builder/coder owns final architecture, implementation, and self-test — e.g. which hook/context to use for shared state. Coder must follow market-aware brief + builder-owned self-plan. Architect must not override builder-owned architecture responsibility.>",
  "dataModel": "<optional: product-level information only — compact entity shape, e.g. Habit: { id, name, completedDates[] }. Not final schema design.>",
  "notes": ["Strategic constraints only — not implementation instructions. Cross-cutting product requirements."]
}

RULES
- You are a product strategist, not the final technical architect. The builder/coder owns architecture, implementation, and self-test.
- Do not create detailed component architecture — fileTree and deltaFiles are minimal pipeline scaffolding, not final architecture authority.
- Do not design detailed component hierarchy.
- Do not prescribe internal React state architecture.
- Do not prescribe final component boundaries.
- Do not conflict with the builder-owned self-plan.
- Do not conflict with the market-aware builder brief.
- fileTree keys may be returned as "src/..." paths, but they must describe ONLY the minimal expected delta files the coder should create.
- NEVER include App.tsx, main.tsx, AppContext, theme.ts, UI primitives, or any file listed under PROTECTED / PROVIDED FILES.
- Prefer product-specific pages/hooks/components/config/data files over infrastructure files.
- For editable skeleton pages/config/data files, include them in fileTree when they must be meaningfully rewritten for the product.
- Use contextContract to declare that builder/coder owns final architecture, implementation, and self-test. Describe shared state contracts (e.g. "use useApp() from AppContext, NOT useLocalStorage directly") whenever multiple files share state.
- Use dataModel for product-level information only — canonical domain entity shape. Not final schema design.
- Use notes for strategic constraints only — not implementation instructions.
- pages[] describes product moments and screens — do not use it to describe component architecture.
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

  const extracted = extractJsonObjectFromModelText(raw, {
    validate: value => validateArchitectJsonShape(value),
  });
  if (!extracted.ok) {
    input.onLog(
      `[architect] parse diagnostics provider=${architectProvider} model=${architectModel} raw_length=${raw.length} raw_snippet=${extracted.rawSnippet}`,
      'error',
    );
    if (extracted.candidateSnippet) {
      input.onLog(`[architect] candidate_json_snippet=${extracted.candidateSnippet}`, 'warn');
    }
    if (extracted.parseError) {
      input.onLog(`[architect] parse_error=${extracted.parseError}`, 'warn');
    }
    if (extracted.schemaError) {
      input.onLog(`[architect] schema_error=${extracted.schemaError}`, 'warn');
    }
    const message = extracted.schemaError
      ? `Architect JSON parsed but schema validation failed: ${extracted.schemaError}`
      : `Architect returned non-JSON output: ${extracted.error}`;
    throw new Error(`${message}. Raw snippet: ${extracted.rawSnippet}`);
  }
  const obj = extracted.value as Record<string, unknown>;
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
    const schemaError = 'plan contains no usable delta fileTree entries after path normalization and skeleton filtering';
    input.onLog(
      `[architect] schema diagnostics provider=${architectProvider} model=${architectModel} raw_length=${raw.length} raw_snippet=${extracted.rawSnippet}`,
      'error',
    );
    input.onLog(`[architect] candidate_json_snippet=${safeModelTextSnippet(extracted.jsonText)}`, 'warn');
    input.onLog(`[architect] schema_error=${schemaError}`, 'warn');
    throw new Error(`Architect JSON parsed but schema validation failed: ${schemaError}. Raw snippet: ${extracted.rawSnippet}`);
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

export function buildCoderPlanningBlocks(input: {
  designCtx?: DesignContext;
  mediaHints?: MediaHint[];
  compositionPlan?: ScreenCompositionPlan;
  functionalFlowPlan?: FunctionalFlowPlan;
  skeletonIntegrationPlan?: SkeletonIntegrationPlan;
  productSpecificityPlan?: ProductSpecificityPlan;
  marketAwareBuilderBrief?: MarketAwareBuilderBrief;
}): string {
  return [
    input.designCtx ? designContractForCoder(input.designCtx, input.mediaHints) : '',
    input.compositionPlan ? buildCompositionPlanPromptBlock(input.compositionPlan) : '',
    input.functionalFlowPlan ? buildFunctionalFlowPromptBlock(input.functionalFlowPlan) : '',
    input.skeletonIntegrationPlan ? buildSkeletonIntegrationPromptBlock(input.skeletonIntegrationPlan) : '',
    input.productSpecificityPlan ? buildProductSpecificityPromptBlock(input.productSpecificityPlan) : '',
    input.marketAwareBuilderBrief ? serializeMarketAwareBuilderBriefForCoder(input.marketAwareBuilderBrief) : '',
    input.marketAwareBuilderBrief ? buildBuilderOwnedSelfPlanInstructions(input.marketAwareBuilderBrief) : '',
  ].filter(Boolean).join('\n');
}

export function buildUiPrimitiveImportCatalog(uiPrimitives: readonly string[]): string {
  return buildLiveGenerationUiPrimitiveImportCatalog(filterAdvertisedUiPrimitiveNames(uiPrimitives));
}

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
  mediaHints?: MediaHint[];
  compositionPlan?: ScreenCompositionPlan;
  functionalFlowPlan?: FunctionalFlowPlan;
  skeletonIntegrationPlan?: SkeletonIntegrationPlan;
  productSpecificityPlan?: ProductSpecificityPlan;
  marketAwareBuilderBrief?: MarketAwareBuilderBrief;
}): Promise<Record<string, string>>{
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
  const planningBlocks = buildCoderPlanningBlocks({
    designCtx: input.designCtx,
      mediaHints: input.mediaHints,
      compositionPlan: input.compositionPlan,
      functionalFlowPlan: input.functionalFlowPlan,
      skeletonIntegrationPlan: input.skeletonIntegrationPlan,
      productSpecificityPlan: input.productSpecificityPlan,
      marketAwareBuilderBrief: input.marketAwareBuilderBrief,
    });
  const advertisedUiPrimitives = filterAdvertisedUiPrimitiveNames(skeleton.uiPrimitives);
  const uiPrimitiveImportCatalog = buildUiPrimitiveImportCatalog(advertisedUiPrimitives);

  const system = `You are a senior React + TypeScript + Tailwind engineer. You are completing an app on top of an existing skeleton.

SKELETON: ${skeleton.label} (${skeleton.id})
PROVIDED COMPONENTS: ${skeleton.providedComponents.join(', ') || '(see registry)'}
PROVIDED HOOKS: ${skeleton.providedHooks.join(', ') || '(see registry)'}
UI PRIMITIVES: ${advertisedUiPrimitives.join(', ') || '(see registry)'}
${contractBlock ? `\n${contractBlock}\n` : ''}${planningBlocks ? '\n' + planningBlocks + '\n' : ''}
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
Available UI primitive import catalog (use only these exact paths):
${uiPrimitiveImportCatalog}

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
- Do not import UI primitives that are not listed in the UI primitive import catalog or not physically present in src/components/ui.
- If a component is needed but not available in the UI catalog, implement it as a local component under components/ instead of importing a nonexistent shadcn primitive.
- Only import from skeleton-provided modules listed above, exact UI primitive paths listed above, "lucide-react", "react", and files you yourself emit.
- For component-local state (counters, form fields, toggles, lists, etc.) use React's own useState / useReducer / useEffect — DO NOT invent custom hooks like "useApp", "useCounter" etc. that are not in the PROVIDED HOOKS list above. If you need persistence, use the named import: import { useLocalStorage } from "@/hooks/useLocalStorage".
- You are extending the installed skeleton by delta. NEVER rebuild the app shell, router, providers, or placeholder app from scratch when the selected skeleton already provides them.
- Do not modify any skeleton-locked path.
- No commentary outside the markers. No markdown. No code fences.
- Quality over verbosity: real content, no lorem ipsum, no TODOs.
- DESIGN TOKENS: ALWAYS use Tailwind design token classes — bg-background, bg-card, bg-muted, bg-primary, text-foreground, text-muted-foreground, text-primary, text-primary-foreground, border-border. NEVER use raw color utilities (bg-white, bg-black, bg-gray-100, text-gray-900, border-gray-200). Use var(--primary) / var(--foreground) in style props when tokens are needed inline.
- REAL DATA: Write actual domain entities with real business labels, realistic numbers, and meaningful copy. Never write "Lorem ipsum", "placeholder", "TODO", or generic "Item 1 / Item 2" lists.
- COMPLETENESS: Every emitted file must be fully functional — no partial stubs, no "// rest of implementation" comments, no empty component bodies.`;

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
  mediaHints?:  MediaHint[];
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
${input.designCtx ? '\n' + designContractForCoder(input.designCtx, input.mediaHints) : ''}

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

// ── Quality repair pass ───────────────────────────────────────────────────────

/**
 * Bounded one-shot quality repair — separate from compile repair (runRepair).
 *
 * Called only when evaluatePrototypeQualityGate() returns blockingReasons.length > 0.
 * Makes exactly ONE LLM call via the 'fix' slot with a quality-focused prompt.
 * Parses output using parseFileMarkers; only accepts paths already in currentFiles
 * (safety filter — prevents injecting new skeleton-protected files).
 *
 * No loops, no retry. At most one repair attempt per pipeline run.
 */
export async function runQualityRepair(input: {
  prompt:                       string;
  skeletonId:                   SkeletonId;
  currentFiles:                 Record<string, string>;
  blockingReasons:              string[];
  repairInstructions:           string[];
  designCtx?:                   DesignContext;
  productSpecificityDiagnostics?: ProductSpecificityDiagnostics | null;
  signal?:                      AbortSignal;
  routeOverrides?:              RouteOverrideMap;
  onLog:                        (msg: string, level?: 'info' | 'warn' | 'error') => void;
  onUsage?:                     (usage: StepLlmMetrics) => void;
}): Promise<Record<string, string>> {
  const reasonsList = input.blockingReasons
    .map((r, i) => `  ${i + 1}. ${r}`)
    .join('\n');
  const instructionsList = input.repairInstructions
    .map((ins, i) => `  ${i + 1}. ${ins}`)
    .join('\n');
  const designBlock = input.designCtx
    ? `\nDESIGN CONTRACT:\n${designContractForCoder(input.designCtx)}\n`
    : '';
  const specificityNote = input.productSpecificityDiagnostics
    ? `\nPRODUCT SPECIFICITY SUMMARY: score=${input.productSpecificityDiagnostics.specificityScore ?? 'n/a'}, ` +
      `domain entities: ${input.productSpecificityDiagnostics.domainEntitySignals.slice(0, 6).join(', ')}, ` +
      `product metrics: ${input.productSpecificityDiagnostics.productMetricSignals.slice(0, 4).join(', ')}\n`
    : '';

  const targets = Object.entries(input.currentFiles)
    .map(([path, content]) => `<<<FILE: ${path}>>>\n${content}\n<<<END>>>`)
    .join('\n\n');

  const system =
    `You are fixing prototype quality gate failures. Re-emit only the files you change.\n` +
    `Use the same <<<FILE: path>>>...<<<END>>> marker format. Do not modify skeleton-locked paths.\n\n` +
    `QUALITY GATE BLOCKING REASONS:\n${reasonsList}\n\n` +
    `REPAIR INSTRUCTIONS:\n${instructionsList}\n` +
    designBlock +
    specificityNote +
    `\nRULES:\n` +
    `- Replace all generic placeholders (Feature 1, AppName, Lorem ipsum, Untitled, TODO, Item 1, KPI 1) with product-specific copy.\n` +
    `- Replace raw hex colours (#xxxxxx), raw colour functions (rgb/hsl), and Tailwind palette classes (bg-blue-500) ` +
    `with semantic design tokens: bg-primary, bg-background, bg-card, text-foreground, text-muted-foreground, etc.\n` +
    `- Fill empty dashboard metric cards with real domain-specific labels and realistic sample values.\n` +
    `- Emit only files you actually changed. Each emitted file must be complete and compilable.`;

  input.onLog(
    `[quality-repair] attempting repair of ${input.blockingReasons.length} issue(s) across ` +
    `${Object.keys(input.currentFiles).length} file(s)`,
  );

  let body = '';
  await streamCall({
    slot:           'fix',
    system,
    user:           `Original task: ${input.prompt}\n\nFiles to repair:\n\n${targets}`,
    maxTokens:      STEP_BUDGET.qualityRepair.maxTokens,
    timeoutMs:      STEP_BUDGET.qualityRepair.timeoutMs,
    signal:         input.signal,
    routeOverrides: input.routeOverrides,
    onChunk:        (delta) => { body += delta; },
    onUsage:        input.onUsage,
  });

  const patches = parseFileMarkers(body);
  if (Object.keys(patches).length === 0) {
    throw new Error('Quality repair produced no FILE/END blocks');
  }

  // Safety filter: only accept patches for paths already present in currentFiles.
  const safePatches = Object.fromEntries(
    Object.entries(patches).filter(([path]) => path in input.currentFiles),
  );
  if (Object.keys(safePatches).length === 0) {
    input.onLog('[quality-repair] all patched paths were unexpected — no files merged', 'warn');
    return input.currentFiles;
  }

  input.onLog(`[quality-repair] repair patched ${Object.keys(safePatches).length} file(s)`);
  return { ...input.currentFiles, ...safePatches };
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
  const ready = await waitForIframeMounted(buildId, signal, nextPreviewUrl);
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

function waitForIframeMounted(buildId: string, signal?: AbortSignal, previewUrl = `/preview/${buildId}`): Promise<boolean> {
  return new Promise((resolve) => {
    const timeoutMs = 45_000;
    const expectedOrigin = new URL(previewUrl, window.location.origin).origin;
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
      if (e.origin !== expectedOrigin) return;
      if (e.data.type === 'preview-mounted' && e.data.buildId === buildId) settle(true);
      if (e.data.type === 'iframe-error') settle(false);
    };
    window.addEventListener('message', onMessage);
    const timer = setTimeout(() => settle(false), timeoutMs);
    signal?.addEventListener('abort', () => settle(false), { once: true });
  });
}

// ── LLM helpers ──────────────────────────────────────────────────────────────

export interface ResolvedRoute {
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

/**
 * Returns the static role description that heads the runArchitect system prompt.
 * Exported for deterministic unit testing only.
 *
 * Both the chat/founder flow and the trending-niche/direct-launch flow converge
 * into ProtoPipeline.run → runArchitect, which uses this role instruction.
 * Changing it here downscopes the architect for every entry path simultaneously.
 */
export function buildArchitectProductStrategistRole(): string {
  return [
    'You are a market/product strategist, not the final technical architect.',
    'Unlike the traditional senior product architect role, your focus is product strategy and minimal pipeline contracts only.',
    'Your role is to provide product strategy, user journey, required product moments, and a minimal pipeline contract.',
    'Do not over-own implementation architecture.',
    'Do not create detailed component architecture.',
    'Do not design detailed component hierarchy.',
    'Do not prescribe internal React state architecture.',
    'Do not prescribe final component boundaries.',
    'Do not create a detailed implementation plan.',
    'Do not override builder-owned self-plan.',
    'Do not conflict with the builder-owned self-plan.',
    'Do not conflict with the market-aware builder brief.',
    'The builder/coder owns architecture, implementation, and self-test.',
    'fileTree and deltaFiles are pipeline scaffolding that guides the coder — they are not final architecture authority.',
    'fileTree must be a minimal pipeline scaffold, not final architecture ownership.',
    'deltaFiles are expected generated files for the pipeline contract, not final implementation ownership.',
    'pages must describe product moments and screens, not component architecture.',
    'dataModel must be product-level information only, not final schema design.',
    'notes must be strategic constraints only, not implementation instructions.',
    'contextContract must declare that builder/coder owns architecture, implementation, and self-test.',
  ].join('\n');
}

/**
 * Returns the canonical list of required ArchitectPlan output field names.
 * deltaFiles is derived from fileTree internally and is not a separate LLM output field.
 * Exported for deterministic unit testing only.
 */
export function getArchitectRequiredOutputFields(): readonly string[] {
  return [
    'appName',
    'summary',
    'skeleton',
    'pages',
    'fileTree',
    'dataModel',
    'contextContract',
    'notes',
  ] as const;
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

