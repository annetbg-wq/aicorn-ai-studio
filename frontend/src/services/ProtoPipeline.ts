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

import { llmFetch, llmFetchStream } from './LLMProxy';
import { interceptForDiagnosticRun } from './DiagnosticIntercept';
import { ConfigService, type AgentSlot } from './ConfigService';
import { metricsService } from './MetricsService';
import type { GenerationOutcomeEvent } from '../shared/projectModel';
import { Orchestrator } from './Orchestrator';
import {
  type SkeletonId,
  SKELETON_REGISTRY,
  buildSkeletonPromptBlock,
  checkExportIntegrity,
  getEditableSkeletonFiles,
  getSkeletonInstalledFiles,
  getSkeletonProductSlotFiles,
  isProtectedSkeletonFile,
  mergeSkeletonExports,
} from './SkeletonRegistry';
import { getSkeletonQualityContract } from './SkeletonQualityContract';
import { previewController } from './PreviewController';
import { isLocalDevHost } from './internalAccess';
import { getLocalDevAgentProvider } from './devAgentMode';
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
import SUPABASE_HELPER_RAW from '../lib/supabase.ts?raw';
import {
  buildScreenCompositionPlan,
  serializeScreenCompositionPlan,
  evaluateScreenCompositionDiagnostics,
  type ScreenCompositionPlan,
  type ScreenCompositionPlanTelemetry,
  type ScreenCompositionDiagnosticsResult,
} from './ScreenCompositionPlanner';
import {
  buildFunctionalFlowPlan,
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
  serializeArchitectureImplementationDiagnostics,
  serializeSkeletonIntegrationPlan,
  type ArchitectureImplementationDiagnosticsTelemetry,
  type SkeletonIntegrationPlan,
  type SkeletonIntegrationPlanTelemetry,
} from './SkeletonIntegrationPlanner';
import {
  buildProductSpecificityDiagnostics,
  buildProductSpecificityPlan,
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
  formatLiveGenerationContractFailure,
  type LiveGenerationContractDiagnostic,
  type LiveGenerationContractValidationInput,
  type LiveGenerationContractValidationResult,
  validateImportExportContract,
  validateLiveGenerationContract,
} from './LiveGenerationContractValidator';
import {
  buildMarketAwareBuilderBrief,
  evaluateMarketAwareBuilderBriefDiagnostics,
  serializeMarketAwareBriefDiagnosticsTelemetry,
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
import { validateDownscopedArchitectOutput } from './ArchitectOutputValidator';
import { executeWithClassifiedRetry, recordLlmCallDiagnostics, recordLlmCallOutcome, LlmTransportError } from './LLMTransportError';
import {
  buildCoderOutputBudgetDiagnostics,
  recordCoderOutputBudgetDiagnostics,
} from './CoderOutputBudgetDiagnostics';
import { buildSkeletonContractForCoder } from './SkeletonContractForCoder';
import { filterProductDeltaFiles, filterProductDeltaSpecs, getProductDeltaScope, normalizeProductDeltaPath } from './ProductDeltaContract';
import {
  measureCoderPromptBlockSizes,
  recordCoderPromptBlockSizes,
} from './CoderPromptBlockSizeDiagnostics';
import type { ProjectPlan } from './types/ProjectPlan';
import { resolveProductDocumentSet, buildCoderContractBrief, type FeatureChecklistItem } from './ProductDocumentSet';
import { evaluateCompletenessGate, type CompletenessGateCoverage } from './CompletenessGate';
import {
  buildDesignFusionPromptBlock,
  buildUploadedAssetFusionEntries,
  buildPremiumFusionEntries,
} from './DesignFusionService';
import type { ScreenshotStatus } from './ScreenshotService';

// ── Public types ──────────────────────────────────────────────────────────────

export type StepId =
  | 'clarify'
  | 'skeleton'
  | 'pack'
  | 'architect'
  | 'product-docs'
  | 'coder'
  | 'apply'
  | 'build'
  | 'preview';

export type StepStatus = 'pending' | 'active' | 'done' | 'error';

// ── Pass 2 Gap types (WI-4) ───────────────────────────────────────────────────

export type GapStatus = 'missing' | 'partial' | 'fake' | 'broken' | 'visual';
export type GapPriority = 'must' | 'should' | 'nice';
export type GapSource = 'completeness' | 'build' | 'critic' | 'visual';

/** Strict gap item returned by the Pass 2 critic. No loose {verdict,reasons,instructions,focusFiles} schema. */
export interface Gap {
  id: string;
  briefPoint: string;
  status: GapStatus;
  evidence: string;
  targetFile: string;
  requiredAction: string;
  priority: GapPriority;
  source: GapSource;
}

/** Telemetry emitted by the Pass 2 loop. Included in stepResults.apply.output. */
export interface Pass2Telemetry {
  pass2_ran: boolean;
  pass2_available: boolean;
  pass2_unavailable_reason?: string;
  pass2_iterations: number;
  critic_gap_count: number;
  critic_schema: 'Gap[]';
  critic_parse_status: 'ok' | 'parse_error' | 'retry_ok' | 'unavailable';
  implementer_touched_files: string[];
  implementer_rejected_files: string[];
  coverage_before: number;
  coverage_after: number;
  pass2_build_ok: boolean;
  outcome: 'done' | 'partial' | 'pass2_unavailable' | 'route_unresolved';
  factoryGatePassed: boolean;
  // ── WI-8: Vision health fields ────────────────────────────────────────────
  /** Whether a screenshot capture was attempted before Pass 2 ran. */
  screenshotAttempted?: boolean;
  /** Whether the screenshot capture succeeded. False → critic is vision-blind. */
  screenshotSucceeded?: boolean;
  /** Capture method that produced (or attempted) the screenshot. */
  screenshotSource?: 'html2canvas' | 'playwright' | 'manual' | 'none';
  /** True when the screenshot dataUrl was present in the status. */
  screenshotDataPresent?: boolean;
  /** Reason the screenshot was unavailable (when screenshotSucceeded=false). */
  screenshotUnavailableReason?: string;
  /**
   * True when the critic is operating on code only — no visual evidence exists.
   * Hard rule: when critic_vision_blind=true, visualGateStatus cannot be 'pass'.
   */
  critic_vision_blind?: boolean;
  /** Reason the critic cannot access visual evidence. Set when critic_vision_blind=true. */
  visionUnavailableReason?: string;
  /**
   * Visual quality gate status — separate from the code completeness gate.
   * Cannot be 'pass' without a successful screenshot (critic_vision_blind=false).
   */
  visualGateStatus?: 'pass' | 'partial' | 'skipped' | 'fail';
  /** True when the code-only critic is blocked from claiming visual acceptance. */
  codeOnlyVisualPassBlocked?: boolean;
  /** True when an empty/0x0 canvas was detected and blocked from being counted as success. */
  screenshotEmptyBlocked?: boolean;
}

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
  /** Product-identity violations on editable skeleton slots in the final shipped workspace. */
  identitySlotFindings?: string[];
  /**
   * Editable identity-slot files that are absent from coder-output and therefore
   * would survive as skeleton defaults unless repair creates them.
   */
  repairableMissingIdentityPaths?: string[];
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
  identity_slot_findings?: string[];
  repairable_missing_identity_paths?: string[];
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
  identity_slot_violation_count: number;
  generic_dashboard_card_flag: boolean;
  specificity_score: number | null;
  /** Number of advisory (warn-only) reasons. */
  advisory_reasons_count: number;
  /**
   * True: runQualityRepair() is wired and will be called for hard blocking reasons.
   * Hard blockers: design token violations, generic placeholders/identity issues,
   * numbered metric placeholders, and empty dashboard metric cards.
   * Soft issues: premium/media unused stay advisory-only.
   */
  repair_hook_available: boolean;
}

/** Result returned by evaluatePrototypeQualityGate(). */
export interface PrototypeQualityGateResult {
  ok: boolean;
  blockingReasons: string[];
  repairInstructions: string[];
  /** Residual hard blocking violation after repair must fail the release gate. */
  hardFailAfterRepair: boolean;
  /** Advisory issues (non-blocking). Soft release signals stay here. */
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
  completeness_gate?: {
    mustTotal: number;
    mustCovered: number;
    shouldTotal: number;
    shouldCovered: number;
    coverageRatioMust: number;
    coverageRatioAll: number;
    uncoveredMust: string[];
    uncoveredShould: string[];
    completenessGateStatus: 'pass' | 'fail';
    completenessGateReason: string;
    factoryGatePassed: boolean;
  };
  pass2_telemetry?: Pass2Telemetry;
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
  projectId?:   string;
  revisionId?:  string;
  attachments?: PipelineAttachment[];
  prebuiltPlan?: ProjectPlan;
  skipClarify?: boolean;
  signal?:      AbortSignal;
  routeOverrides?: Partial<Record<AgentSlot, ResolvedRoute>>;
  /** Unified run id — passed by SimpleGeneration so fail() and success share one id. */
  runId?:       string;
  /** Step lifecycle events for the progress UI. */
  onStep:       (e: StepEvent) => void;
  /** Free-form log output (debug pane, telemetry). */
  onLog?:       (msg: string, level?: 'info' | 'warn' | 'error') => void;
  /** Streaming coder token deltas (for the live "Пишу код…" preview). */
  onCoderStream?: (delta: string) => void;
  /** Fired exactly once after a successful build. */
  onPreviewReady?: (url: string, buildId: string) => void;
  /**
   * Optional screenshot status from a prior capture (e.g. from a previous preview).
   * Used by the Pass 2 vision gate (WI-8) to record whether visual evidence exists.
   * When absent, the critic is assumed vision-blind (code-only analysis).
   */
  screenshotStatus?: ScreenshotStatus;
}

export interface ProtoPipelineResult {
  success:            boolean;
  buildId:            string;
  url?:               string;
  files?:             Record<string, string>;
  plan?:              ArchitectPlan;
  error?:             string;
  reason?:            ProtoPipelineFailureReason;
  stepResults?:       Partial<Record<StepId, StepExecutionMetrics>>;
  fastPathTelemetry?: FastPathTelemetry;
  runTelemetry?:      GenerationRunTelemetry;
  /** Data for the flywheel outcome event — populated by both success and fail() paths. */
  outcomeData?: {
    repairPasses:          number;
    /** Pre-repair: was the coder's FIRST output contract-clean? (signal for substrate quality) */
    designContractOk?:      boolean;
    /** Post-repair: does the FINAL committed code satisfy the contract? (signal for repair reliability) */
    designContractFinalOk?: boolean;
    compiled:              boolean;
    failedStep?:           StepId;
    errorMessage?:         string;
    reasonCode?:           ProtoPipelineFailureReason;
  };
}

export type ProtoPipelineFailureReason =
  | 'coverage_below_threshold'
  | 'hard_quality_gate_failed'
  | 'hard_quality_repair_failed'
  | 'live_generation_contract_failed'
  | 'live_generation_contract_repair_failed';

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
  clarify:          'Понимаю задачу...',
  skeleton:         'Устанавливаю основу...',
  pack:             'Выбираю дизайн-пак...',
  architect:        'Проектирую архитектуру...',
  'product-docs':   'Создаю Product Docs...',
  coder:            'Пишу код...',
  apply:            'Применяю изменения...',
  build:            'Собираю приложение...',
  preview:          'Готово',
};

// ── Token / timeout budgets per step ──────────────────────────────────────────

const STEP_BUDGET = {
  clarify:       { maxTokens:  600,   timeoutMs:  20_000 },
  architect:     { maxTokens: 8_000,  timeoutMs:  60_000 },
  coder:         { maxTokens: 35_000, timeoutMs: 360_000 },
  applyModuleHeal: { maxTokens: 8_000, timeoutMs:  90_000 },
  applyExportRetry: { maxTokens: 6_000, timeoutMs:  75_000 },
  repair:        { maxTokens: 12_000, timeoutMs: 120_000 },
  qualityRepair: { maxTokens:  8_000, timeoutMs:  90_000 },
  qualityRepairHeavy: { maxTokens: 16_000, timeoutMs: 180_000 },
} as const;

/**
 * Exported for diagnostics/tests — proves coder.maxTokens was not lowered
 * as part of the coder-skeleton-context-contract fix.
 * The fix reduces INPUT payload (skeleton contract), not OUTPUT budget.
 */
export const CODER_MAX_TOKENS = STEP_BUDGET.coder.maxTokens;

const MAX_REPAIR_PASSES = 2;
const MAX_QUALITY_REPAIR_PASSES = 3;
const PASS2_MAX_ITERATIONS = 2;
const PHASED_CODER_MIN_TOTAL_FILES = 8;
const PHASED_CODER_MIN_FOUNDATION_FILES = 1;
const PHASED_CODER_SCREEN_BATCH_MAX_FILES = 2;
const NON_STREAM_CODER_MAX_TOKENS = 12_000;
const STREAM_FIRST_BYTE_TIMEOUT_MS = 25_000;
const STREAM_CHUNK_IDLE_TIMEOUT_MS = 40_000;
const STREAM_MEANINGFUL_SSE_TIMEOUT_MS = 35_000;
const FACTORY_RELEASE_MIN_COVERAGE = 0.8;

function buildCoverageReleaseFailure(
  coverage: CompletenessGateCoverage,
): { reason: ProtoPipelineFailureReason; message: string } {
  const summary =
    `must-coverage ${(coverage.coverageRatioMust * 100).toFixed(0)}% < ${(FACTORY_RELEASE_MIN_COVERAGE * 100).toFixed(0)}% ` +
    `(${coverage.mustCovered}/${coverage.mustTotal})`;
  const uncovered = coverage.uncoveredMust.slice(0, 5);
  return {
    reason: 'coverage_below_threshold',
    message:
      `coverage_below_threshold: ${summary}` +
      (uncovered.length > 0 ? `; uncovered must: ${uncovered.join(', ')}` : ''),
  };
}

function buildHardQualityReleaseFailure(
  blockingReasons: string[],
): { reason: ProtoPipelineFailureReason; message: string } {
  return {
    reason: 'hard_quality_gate_failed',
    message:
      'hard_quality_gate_failed: ' +
      blockingReasons.slice(0, 4).join(' | '),
  };
}

function buildHardQualityRepairFailure(
  repairError: string,
): { reason: ProtoPipelineFailureReason; message: string } {
  return {
    reason: 'hard_quality_repair_failed',
    message: `hard_quality_repair_failed: ${repairError}`,
  };
}

function buildLiveContractReleaseFailure(
  validation: LiveGenerationContractValidationResult,
): { reason: ProtoPipelineFailureReason; message: string } {
  const shellOwnershipViolation = validation.diagnostics.find(
    diagnostic => diagnostic.root_cause_type === 'protected_shell_import',
  );
  return {
    reason: 'live_generation_contract_failed',
    message: shellOwnershipViolation
      ? `live_generation_contract_failed: ${shellOwnershipViolation.actual ?? shellOwnershipViolation.suggested_fix}`
      : `live_generation_contract_failed: ` +
        formatLiveGenerationContractFailure(validation.diagnostics, validation.candidateGraphSummary),
  };
}

function buildLiveContractRepairFailure(
  repairError: string,
): { reason: ProtoPipelineFailureReason; message: string } {
  return {
    reason: 'live_generation_contract_repair_failed',
    message: `live_generation_contract_repair_failed: ${repairError}`,
  };
}

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

const SKELETON_ROOT_RAW_MODULES = import.meta.glob(
  [
    '../../../skeletons/*/skeleton-*/src/main.tsx',
    '../../../skeletons/*/skeleton-*/src/index.css',
    '../../../skeletons/*/skeleton-*/src/route-manifest.json',
  ],
  { eager: true, query: '?raw', import: 'default' },
) as Record<string, string>;

const SKELETON_SOURCE_RAW_MODULES = import.meta.glob(
  [
    '../../../skeletons/*/skeleton-*/src/*.{ts,tsx,js,jsx,css,json}',
    '../../../skeletons/*/skeleton-*/src/**/*.{ts,tsx,js,jsx,css,json}',
  ],
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

const SKELETON_SOURCE_FILES = Object.fromEntries(
  [
    ...Object.entries(SKELETON_ROOT_RAW_MODULES),
    ...Object.entries(SKELETON_SOURCE_RAW_MODULES),
  ].map(([path, content]) => [normalizeRepoAssetPath(path), content]),
) as Record<string, string>;

const CANONICAL_SUPPORT_FILES: Record<string, string> = {
  'src/lib/supabase.ts': SUPABASE_HELPER_RAW,
};

const CANONICAL_SUPPORT_IMPORTS: Record<string, string> = {
  '@/lib/supabase': 'src/lib/supabase.ts',
};

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

function normalizeLiveContractPath(path: string): string {
  const normalized = normaliseDeltaPath(path);
  return normalized ? `src/${normalized}` : 'src';
}

function isLiveContractBuildFile(path: string): boolean {
  const normalized = normaliseDeltaPath(path);
  return normalized.length > 0 && !normalized.startsWith('docs/architect/');
}

function buildSkeletonLiveContractGraph(skeletonId: SkeletonId): Record<string, string> {
  const prefix = `skeletons/${skeletonId}/skeleton-${skeletonId}/src/`;
  const graph: Record<string, string> = {};

  for (const [repoPath, content] of Object.entries(SKELETON_SOURCE_FILES)) {
    if (!repoPath.includes(prefix)) continue;
    const srcIndex = repoPath.indexOf('/src/');
    if (srcIndex < 0) continue;
    const installedPath = `src/${repoPath.slice(srcIndex + 5)}`;
    graph[installedPath] = content;
  }

  return graph;
}

function buildFinalLiveContractGraph(
  skeletonId: SkeletonId,
  currentFiles: Record<string, string>,
): Record<string, string> {
  const graph = buildSkeletonLiveContractGraph(skeletonId);
  for (const [path, content] of Object.entries(currentFiles)) {
    if (!isLiveContractBuildFile(path)) continue;
    graph[normalizeLiveContractPath(path)] = content;
  }
  return graph;
}

function buildFinalLiveContractMaterializedFiles(
  files: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    if (!isLiveContractBuildFile(path)) continue;
    out[normalizeLiveContractPath(path)] = content;
  }
  return out;
}

function buildLiveContractValidationInput(config: {
  skeletonId: SkeletonId;
  currentFiles: Record<string, string>;
  materializedFiles: Record<string, string>;
}): LiveGenerationContractValidationInput {
  const finalFiles = buildFinalLiveContractGraph(config.skeletonId, config.currentFiles);
  return {
    finalFiles,
    skeletonId: config.skeletonId,
    generatedDeltaFiles: buildFinalLiveContractMaterializedFiles(config.currentFiles),
    materializedFiles: buildFinalLiveContractMaterializedFiles(config.materializedFiles),
  };
}

function liveContractPathCandidates(
  importerFile: string | null,
  importPath: string | null,
): string[] {
  if (!importPath) return [];

  let basePath = '';
  if (importPath.startsWith('@/')) {
    basePath = importPath.slice(2);
  } else if (importPath.startsWith('./') || importPath.startsWith('../')) {
    if (!importerFile) return [];
    const importerParts = normaliseDeltaPath(importerFile).split('/').filter(Boolean);
    importerParts.pop();
    for (const segment of importPath.split('/')) {
      if (!segment || segment === '.') continue;
      if (segment === '..') {
        importerParts.pop();
      } else {
        importerParts.push(segment);
      }
    }
    basePath = importerParts.join('/');
  } else {
    return [];
  }

  if (!basePath) return [];
  return uniqueStrings([
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}/index.ts`,
    `${basePath}/index.tsx`,
    `${basePath}/index.js`,
    `${basePath}/index.jsx`,
  ]);
}

function buildLiveContractBlockingReasons(
  diagnostics: LiveGenerationContractDiagnostic[],
): string[] {
  return uniqueStrings(
    diagnostics.map(diagnostic => {
      if (diagnostic.root_cause_type === 'protected_shell_import') {
        return diagnostic.actual ?? diagnostic.suggested_fix;
      }
      const location = diagnostic.file ?? diagnostic.import_path ?? 'graph';
      const detail = diagnostic.actual ?? diagnostic.expected ?? 'contract violation';
      return `Live generation contract ${diagnostic.root_cause_type} at ${location}: ${detail}`;
    }),
  );
}

function buildLiveContractRepairInstructions(
  diagnostics: LiveGenerationContractDiagnostic[],
): string[] {
  return uniqueStrings(diagnostics.map(diagnostic => diagnostic.suggested_fix));
}

function collectLiveContractRepairScopePaths(
  diagnostics: LiveGenerationContractDiagnostic[],
  currentFiles: Record<string, string>,
): string[] {
  const available = new Set(Object.keys(currentFiles).map(path => normaliseDeltaPath(path)));
  const scoped = new Set<string>();

  for (const diagnostic of diagnostics) {
    if (diagnostic.file) {
      const importerPath = normaliseDeltaPath(diagnostic.file);
      if (available.has(importerPath)) scoped.add(importerPath);
    }
    for (const candidate of liveContractPathCandidates(diagnostic.file, diagnostic.import_path)) {
      if (available.has(candidate)) scoped.add(candidate);
    }
  }

  return Array.from(scoped).sort((left, right) => left.localeCompare(right));
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

/**
 * Neutral placeholder illustration written for any '@/assets/generated/*' asset the
 * coder imported but the media system did not materialize. Keeps the build compiling
 * (ship-and-iterate) so a cosmetic missing asset never hard-blocks the prototype.
 */
const PLACEHOLDER_ASSET_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" role="img" aria-label="illustration placeholder">' +
  '<rect width="400" height="300" rx="16" fill="#eef2f7"/>' +
  '<circle cx="150" cy="115" r="24" fill="#cbd5e1"/>' +
  '<path d="M96 214l58-66 40 46 34-40 76 60v6H96z" fill="#cbd5e1"/>' +
  '</svg>\n';

/** Image asset extensions the coder may import from '@/assets/generated/'. */
const GENERATED_ASSET_IMPORT_RE =
  /@\/(assets\/generated\/[^"'`()\s]+?\.(?:svg|png|jpe?g|webp|gif|avif))/g;

/** Asset/style/font specifiers Vite resolves from disk, not text modules in the graph. */
const NON_MODULE_IMPORT_RE =
  /\.(?:svg|png|jpe?g|gif|webp|avif|ico|css|scss|sass|less|woff2?|ttf|otf|eot|mp4|webm|mp3|wav)(?:\?\S*)?$/i;

/** ES import statements with a binding clause: `import <clause> from '<specifier>'`. */
const ES_IMPORT_WITH_CLAUSE_RE = /import\s+(?:type\s+)?([^'"]*?)\s+from\s*['"]([^'"]+)['"]/g;
const ROOT_ALIAS_IMPORT_FROM_RE = /(^\s*(?:import|export)\s+(?:type\s+)?[^'"]*?\sfrom\s*['"])(@\/[^'"]+)(['"])/gm;
const ROOT_ALIAS_SIDE_EFFECT_IMPORT_RE = /(^\s*import\s*['"])(@\/[^'"]+)(['"])/gm;

/** Dangling import target: which generated files import it and the symbols they use. */
export interface DanglingModuleNeed {
  importers:      Set<string>;
  defaultImports: Set<string>;
  namedImports:   Set<string>;
}

/**
 * Resolves a relative import specifier against the importer path to a normalised
 * src-rooted module base WITHOUT extension
 * (src/hooks/useFinance.ts + '../types/finance' → 'src/types/finance').
 */
function resolveRelativeModuleBase(importer: string, specifier: string): string {
  const parts = importer.replace(/\/[^/]*$/, '').split('/').filter(Boolean);
  for (const seg of specifier.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

/**
 * Finds RELATIVE local imports among generated files whose target module is not
 * present in the file set — modules the coder referenced but forgot to emit.
 *
 * Relative ('./','../') imports are always generated-to-generated: skeleton
 * modules are imported via the '@/' alias, never relatively. So an unresolved
 * relative import is unambiguously a dangling generated module, with no risk of
 * false-positives against skeleton files we do not have in scope here. Returns
 * each missing module base path → its importers and the default/named symbols
 * they reference, so a re-emit can synthesise a real module with those exports.
 */
export function collectDanglingRelativeImports(
  files: Record<string, string>,
): Map<string, DanglingModuleNeed> {
  const have = new Set(Object.keys(files).map(p => p.replace(/^\.?\//, '')));
  const exts = ['.ts', '.tsx', '.js', '.jsx'];
  const resolvesInSet = (base: string): boolean =>
    exts.some(e => have.has(base + e) || have.has(`${base}/index${e}`));

  const out = new Map<string, DanglingModuleNeed>();
  for (const [path, content] of Object.entries(files)) {
    const importer = path.replace(/^\.?\//, '');
    for (const m of content.matchAll(ES_IMPORT_WITH_CLAUSE_RE)) {
      const clause = m[1].trim();
      const specifier = m[2];
      if (!specifier.startsWith('.')) continue;            // relative only
      if (NON_MODULE_IMPORT_RE.test(specifier)) continue;  // asset/style/font
      const base = resolveRelativeModuleBase(importer, specifier);
      if (!base || resolvesInSet(base)) continue;          // target exists

      const need = out.get(base) ?? {
        importers: new Set<string>(), defaultImports: new Set<string>(), namedImports: new Set<string>(),
      };
      need.importers.add(importer);
      const named = clause.match(/\{([^}]*)\}/);
      if (named) {
        for (const raw of named[1].split(',')) {
          const sym = raw.trim().split(/\s+as\s+/)[0].trim();
          if (sym) need.namedImports.add(sym);
        }
      }
      const def = clause.replace(/\{[^}]*\}/, '').replace(/\*\s+as\s+\w+/, '').replace(/,/g, '').trim();
      if (def && /^[A-Za-z_$][\w$]*$/.test(def)) need.defaultImports.add(def);
      out.set(base, need);
    }
  }
  return out;
}

export interface AliasImportRewrite {
  file: string;
  from: string;
  to: string;
}

function moduleBaseExistsInFileSet(have: Set<string>, base: string): boolean {
  const normalizedBase = normaliseDeltaPath(base);
  const exts = ['.ts', '.tsx', '.js', '.jsx'];
  return exts.some(ext =>
    have.has(`${normalizedBase}${ext}`) ||
    have.has(`${normalizedBase}/index${ext}`),
  );
}

function buildRelativeModuleSpecifier(importerPath: string, targetBase: string): string {
  const importerParts = normaliseDeltaPath(importerPath).split('/').filter(Boolean);
  importerParts.pop();
  const targetParts = normaliseDeltaPath(targetBase).split('/').filter(Boolean);

  while (importerParts.length > 0 && targetParts.length > 0 && importerParts[0] === targetParts[0]) {
    importerParts.shift();
    targetParts.shift();
  }

  const rel = [...Array(importerParts.length).fill('..'), ...targetParts].join('/');
  if (!rel) return '.';
  return rel.startsWith('.') ? rel : `./${rel}`;
}

function resolveDanglingSingleSegmentAliasToSiblingBase(
  importerPath: string,
  specifier: string,
  have: Set<string>,
): string | null {
  const singleSegmentAlias = specifier.match(/^@\/([^/]+)$/);
  if (!singleSegmentAlias) return null;

  const rootBase = normaliseDeltaPath(singleSegmentAlias[1]);
  if (!rootBase || moduleBaseExistsInFileSet(have, rootBase)) {
    return null;
  }

  const importerParts = normaliseDeltaPath(importerPath).split('/').filter(Boolean);
  importerParts.pop();
  const siblingBase = normaliseDeltaPath([...importerParts, rootBase].join('/'));
  if (!siblingBase || !moduleBaseExistsInFileSet(have, siblingBase)) {
    return null;
  }

  return siblingBase;
}

/**
 * Rewrites missing single-segment root aliases like "@/types" or "@/routes" to
 * a same-directory sibling module when that sibling exists and the root target
 * does not. This deterministically closes a common skeleton-path defect where a
 * product-slot file imports a local contract via root alias and the final graph
 * only materializes the sibling module (for example data/seed.ts -> ./types).
 */
export function rewriteDanglingSingleSegmentAliasImportsToSiblingModules(
  files: Record<string, string>,
): { files: Record<string, string>; rewrites: AliasImportRewrite[] } {
  const have = new Set(Object.keys(files).map(path => path.replace(/^\.?\//, '')));
  const rewrites: AliasImportRewrite[] = [];
  let nextFiles: Record<string, string> | null = null;

  const rewriteSpecifier = (importerPath: string, specifier: string): string | null => {
    const siblingBase = resolveDanglingSingleSegmentAliasToSiblingBase(importerPath, specifier, have);
    if (!siblingBase) return null;
    return buildRelativeModuleSpecifier(importerPath, siblingBase);
  };

  for (const [path, content] of Object.entries(files)) {
    const importerPath = path.replace(/^\.?\//, '');
    let changed = false;
    let nextContent = content.replace(
      ROOT_ALIAS_IMPORT_FROM_RE,
      (full, prefix: string, specifier: string, suffix: string) => {
        const nextSpecifier = rewriteSpecifier(importerPath, specifier);
        if (!nextSpecifier || nextSpecifier === specifier) return full;
        rewrites.push({ file: importerPath, from: specifier, to: nextSpecifier });
        changed = true;
        return `${prefix}${nextSpecifier}${suffix}`;
      },
    );

    nextContent = nextContent.replace(
      ROOT_ALIAS_SIDE_EFFECT_IMPORT_RE,
      (full, prefix: string, specifier: string, suffix: string) => {
        const nextSpecifier = rewriteSpecifier(importerPath, specifier);
        if (!nextSpecifier || nextSpecifier === specifier) return full;
        rewrites.push({ file: importerPath, from: specifier, to: nextSpecifier });
        changed = true;
        return `${prefix}${nextSpecifier}${suffix}`;
      },
    );

    if (changed) {
      nextFiles ??= { ...files };
      nextFiles[path] = nextContent;
    }
  }

  return rewrites.length > 0
    ? { files: nextFiles ?? files, rewrites }
    : { files, rewrites };
}

export function materializeCanonicalSupportModulesForImports(
  skeletonId: SkeletonId,
  files: Record<string, string>,
): { files: Record<string, string>; materialized: string[] } {
  const present = new Set(Object.keys(files).map(path => normaliseDeltaPath(path)));
  const installed = new Set(
    getSkeletonInstalledFiles(skeletonId).map(path => normaliseDeltaPath(path)),
  );
  const needed = new Set<string>();

  for (const content of Object.values(files)) {
    for (const [specifier, repoTarget] of Object.entries(CANONICAL_SUPPORT_IMPORTS)) {
      if (
        !content.includes(`'${specifier}'`) &&
        !content.includes(`"${specifier}"`)
      ) {
        continue;
      }

      const deltaPath = normaliseDeltaPath(repoTarget);
      if (present.has(deltaPath) || installed.has(deltaPath)) {
        continue;
      }
      if (!CANONICAL_SUPPORT_FILES[repoTarget]) {
        continue;
      }
      needed.add(deltaPath);
    }
  }

  if (needed.size === 0) {
    return { files, materialized: [] };
  }

  const nextFiles = { ...files };
  for (const deltaPath of needed) {
    const repoTarget = `src/${deltaPath}`;
    const raw = CANONICAL_SUPPORT_FILES[repoTarget];
    if (!raw) continue;
    nextFiles[deltaPath] = raw;
  }

  return {
    files: nextFiles,
    materialized: Array.from(needed).sort((left, right) => left.localeCompare(right)),
  };
}

/** A coder delta file (path + purpose) as produced by the architect plan. */
export type DeltaFileSpec = { path: string; purpose: string };

/**
 * Splits the coder's delta files into the data/logic FOUNDATION (types, data,
 * hooks, services, store) and the UI SCREENS that consume it. Phased generation
 * emits the foundation first so every screen is generated against a fixed,
 * already-existing data contract — eliminating the cross-module inconsistency and
 * dangling-import failures that a single big-bang generation is prone to.
 */
export function partitionDeltaForPhasing(
  deltaFiles: readonly DeltaFileSpec[],
): { foundation: DeltaFileSpec[]; screens: DeltaFileSpec[] } {
  const FOUNDATION_DIR_RE = /\/(?:data|types?|hooks|lib|services|store|state|utils|models|api)\//i;
  const FOUNDATION_FILE_RE = /\/(?:types|data|seed|store|schema|constants)\.tsx?$/i;
  const foundation: DeltaFileSpec[] = [];
  const screens: DeltaFileSpec[] = [];
  for (const f of deltaFiles) {
    const p = `/${f.path.replace(/^\.?\/?(?:src\/)?/, '')}`;
    if (FOUNDATION_DIR_RE.test(p) || FOUNDATION_FILE_RE.test(p)) foundation.push(f);
    else screens.push(f);
  }
  return { foundation, screens };
}

function rankScreenPhaseDeltaPath(path: string): number {
  const normalized = normaliseDeltaPath(path);
  if (/^config\//i.test(normalized)) return 0;
  if (/^components\//i.test(normalized)) return 1;
  if (/^pages\//i.test(normalized)) return 3;
  return 2;
}

/**
 * Phased screen generation works best when reusable support files land before the
 * route pages that consume them. This keeps later page batches small while still
 * letting them import the exact config/component contracts generated earlier.
 */
export function orderScreenDeltaForPhasedGeneration(
  screenFiles: readonly DeltaFileSpec[],
): DeltaFileSpec[] {
  return screenFiles
    .map((file, index) => ({ file, index }))
    .sort((left, right) => {
      const rankDiff = rankScreenPhaseDeltaPath(left.file.path) - rankScreenPhaseDeltaPath(right.file.path);
      if (rankDiff !== 0) return rankDiff;
      return left.index - right.index;
    })
    .map(entry => entry.file);
}

/**
 * Later screen batches only need reusable support files from earlier screen
 * passes. Carrying previously generated pages forward makes prompts balloon
 * without improving import correctness, so we deliberately exclude them.
 */
export function selectCarryForwardScreenFilesForEstablishedContext(
  batchFiles: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(batchFiles).filter(([path]) => !/^pages\//i.test(normaliseDeltaPath(path))),
  );
}

export function shouldUsePhasedCoder(
  deltaFiles: readonly DeltaFileSpec[],
): boolean {
  const { foundation, screens } = partitionDeltaForPhasing(deltaFiles);
  return (
    deltaFiles.length >= PHASED_CODER_MIN_TOTAL_FILES &&
    foundation.length >= PHASED_CODER_MIN_FOUNDATION_FILES &&
    screens.length >= 4
  );
}

export function resolveCoderMaxTokensForTargetFileCount(targetFileCount: number): number {
  if (targetFileCount <= 2) return 8_000;
  if (targetFileCount <= 4) return 12_000;
  if (targetFileCount <= 7) return 18_000;
  if (targetFileCount <= 12) return 24_000;
  return STEP_BUDGET.coder.maxTokens;
}

export function shouldStreamCoderTransportForTargetFileCount(targetFileCount: number): boolean {
  if (targetFileCount <= 1) return true;
  return resolveCoderMaxTokensForTargetFileCount(targetFileCount) > NON_STREAM_CODER_MAX_TOKENS;
}

function splitIntoSequentialBatches<T>(items: readonly T[], maxBatchSize: number): T[][] {
  const safeBatchSize = Math.max(1, Math.floor(maxBatchSize));
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += safeBatchSize) {
    batches.push(items.slice(index, index + safeBatchSize));
  }
  return batches;
}

export async function runPhasedScreenBatchesWithRecovery(input: {
  screens: readonly DeltaFileSpec[];
  establishedFiles: Record<string, string>;
  runBatch: (
    batch: readonly DeltaFileSpec[],
    establishedFiles: Record<string, string>,
  ) => Promise<Record<string, string>>;
  onLog?: (msg: string, level?: 'info' | 'warn' | 'error') => void;
  maxBatchSize?: number;
  label?: string;
  selectCarryForwardFiles?: (
    batchFiles: Record<string, string>,
    batch: readonly DeltaFileSpec[],
  ) => Record<string, string>;
}): Promise<Record<string, string>> {
  if (input.screens.length === 0) return {};

  const maxBatchSize = input.maxBatchSize ?? PHASED_CODER_SCREEN_BATCH_MAX_FILES;
  const queue = splitIntoSequentialBatches(input.screens, maxBatchSize);
  const accumulatedFiles: Record<string, string> = { ...input.establishedFiles };
  const generatedScreens: Record<string, string> = {};
  let batchIndex = 0;
  const label = input.label ?? 'screens';

  while (queue.length > 0) {
    const batch = queue.shift();
    if (!batch || batch.length === 0) continue;
    batchIndex += 1;

    try {
      input.onLog?.(
        `[coder] ${label} batch ${batchIndex}: ${batch.length} file(s)`,
      );
      const batchFiles = await input.runBatch(batch, { ...accumulatedFiles });
      const carryForwardFiles = input.selectCarryForwardFiles
        ? input.selectCarryForwardFiles(batchFiles, batch)
        : batchFiles;
      Object.assign(generatedScreens, batchFiles);
      Object.assign(accumulatedFiles, carryForwardFiles);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (batch.length <= 1) throw err;
      const midpoint = Math.ceil(batch.length / 2);
      const left = batch.slice(0, midpoint);
      const right = batch.slice(midpoint);
      input.onLog?.(
        `[coder] ${label} batch of ${batch.length} file(s) failed (${message.slice(0, 120)}) ` +
          `- splitting into ${left.length}+${right.length}`,
        'warn',
      );
      queue.unshift(right);
      queue.unshift(left);
    }
  }

  return generatedScreens;
}

/**
 * A safe TypeScript stub for a skeleton-required export the coder failed to
 * provide. Appended so the skeleton-locked import resolves and the build never
 * hard-fails on missing_named_export — ship-and-iterate: the coder's real content
 * is untouched, only the absent symbol is back-filled.
 *
 *   PascalCase name / type entry  → `export type X = any;`
 *   config/* value                → `export const x: any = {};`
 *   data/seed value (default)     → `export const x: any = [];`  (arrays degrade
 *                                    gracefully: .map/.filter work; .prop → undefined)
 */
export function buildRequiredExportStub(file: string, entry: { name: string; type?: string }): string {
  const isType = entry.type === 'type' || entry.type === 'interface' || /^[A-Z]/.test(entry.name);
  if (isType) return `export type ${entry.name} = any;`;
  const initial = /\/config\//.test(`/${file}`) ? '{}' : '[]';
  return `export const ${entry.name}: any = ${initial};`;
}

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
  { label: 'PRODUCT', rx: /\bPRODUCT\b/ },
  { label: 'Coming soon', rx: /\bComing soon\b/i },
  { label: 'Untitled', rx: /\bUntitled\b/i },
  { label: 'TODO', rx: /\bTODO\b/i },
  { label: 'placeholder image', rx: /\bplaceholder image\b/i },
  { label: 'gray placeholder', rx: /\bgray placeholder\b/i },
  { label: 'generic dashboard', rx: /\bgeneric dashboard\b/i },
  { label: 'generic app', rx: /\bgeneric app\b/i },
  // ── Skeleton-default fingerprints (product-identity gate) ──────────────────
  // Verbatim copy/seed shipped by the skeleton carcass. If these survive into the
  // output, the coder failed to replace the shell with the requested product — the
  // theme is lost (e.g. a "Cashflow Guard" brief left showing "Morning intention").
  // Treated as BLOCKING so the run repairs instead of shipping a generic shell.
  { label: 'Morning intention', rx: /\bMorning intention\b/i },
  { label: 'Deep work block', rx: /\bDeep work block\b/i },
  { label: "Today's space", rx: /\bToday's space\b/i },
  { label: 'Nothing here yet', rx: /\bNothing here yet\b/i },
];

interface IdentitySlotFingerprint {
  label: string;
  matches: (content: string) => boolean;
}

interface IdentitySlotRule {
  path: string;
  missingLabel: string;
  fingerprints: IdentitySlotFingerprint[];
}

export interface ProductIdentityPlaceholderRewrite {
  path: string;
  detail: string;
}

function extractDeterministicProductNameFromPrompt(prompt?: string | null): string {
  const text = typeof prompt === 'string' ? prompt.trim() : '';
  if (!text) return '';
  const titled =
    /(?:^|\n)\s*(?:Название|Title)\s*:\s*([^\n]+)/i.exec(text)?.[1]?.trim()
    ?? '';
  if (titled && !/\b(?:AppName|PRODUCT|Feature\s+\d+|Untitled)\b/i.test(titled)) {
    return titled;
  }
  return '';
}

function resolveDeterministicProductName(input: {
  appName?: string | null;
  fallbackPrompt?: string | null;
}): string {
  const primary = typeof input.appName === 'string' ? input.appName.trim() : '';
  if (primary && !/\b(?:AppName|PRODUCT)\b/i.test(primary)) {
    return primary;
  }
  return extractDeterministicProductNameFromPrompt(input.fallbackPrompt);
}

const DEFAULT_MOBILE_NAV_FINGERPRINTS = [
  /label\s*:\s*['"]Home['"]/i,
  /label\s*:\s*['"]Create['"]/i,
  /label\s*:\s*['"]Progress['"]/i,
  /label\s*:\s*['"]Profile['"]/i,
];

function containsDefaultMobileNavigation(content: string): boolean {
  return DEFAULT_MOBILE_NAV_FINGERPRINTS.every(pattern => pattern.test(content));
}

const IDENTITY_SLOT_RULES: ReadonlyArray<IdentitySlotRule> = [
  {
    path: 'config/app.ts',
    missingLabel: 'missing identity slot',
    fingerprints: [
      { label: 'AppName', matches: (content) => /\bAppName\b/i.test(content) },
    ],
  },
  {
    path: 'data/seed.ts',
    missingLabel: 'missing identity slot',
    fingerprints: [
      { label: 'Morning intention', matches: (content) => /\bMorning intention\b/i.test(content) },
      { label: 'Deep work block', matches: (content) => /\bDeep work block\b/i.test(content) },
    ],
  },
  {
    path: 'config/navigation.ts',
    missingLabel: 'missing identity slot',
    fingerprints: [
      { label: 'default mobile navigation', matches: containsDefaultMobileNavigation },
    ],
  },
  {
    path: 'pages/Home.tsx',
    missingLabel: 'missing identity slot',
    fingerprints: [
      { label: "Today's space", matches: (content) => /\bToday's space\b/i.test(content) },
      { label: 'Nothing here yet', matches: (content) => /\bNothing here yet\b/i.test(content) },
    ],
  },
];

export function substituteDeterministicProductIdentityPlaceholders(input: {
  files: Record<string, string>;
  skeletonId: SkeletonId;
  appName?: string | null;
  fallbackPrompt?: string | null;
}): {
  files: Record<string, string>;
  rewrites: ProductIdentityPlaceholderRewrite[];
} {
  const normalizedAppName = resolveDeterministicProductName(input);
  if (!normalizedAppName) {
    return {
      files: input.files,
      rewrites: [],
    };
  }

  const editableProductOwnedPaths = getEditableSkeletonFiles(input.skeletonId).map(path => normalizeOutputPath(path));
  const editableProductOwnedFiles = new Set(editableProductOwnedPaths);
  const nextFiles: Record<string, string> = { ...input.files };
  const rewrites: ProductIdentityPlaceholderRewrite[] = [];

  for (const [path, content] of Object.entries(input.files)) {
    const normalizedPath = canonicalizeBareDeltaPathToKnownPath(
      normalizeOutputPath(path),
      editableProductOwnedPaths,
    );
    if (!editableProductOwnedFiles.has(normalizedPath)) continue;

    let nextContent = content;

    const replacedExactLiteral = nextContent.replace(
      /(['"`])AppName\1/g,
      () => JSON.stringify(normalizedAppName),
    );
    if (replacedExactLiteral !== nextContent) {
      nextContent = replacedExactLiteral;
      rewrites.push({
        path: normalizedPath,
        detail: 'replaced exact AppName string literal(s)',
      });
    }

    const replacedExactProductLiteral = nextContent.replace(
      /(['"`])PRODUCT\1/g,
      () => JSON.stringify(normalizedAppName),
    );
    if (replacedExactProductLiteral !== nextContent) {
      nextContent = replacedExactProductLiteral;
      rewrites.push({
        path: normalizedPath,
        detail: 'replaced exact PRODUCT string literal(s)',
      });
    }

    if (normalizedPath === 'config/app.ts') {
      const replacedBareNamePlaceholder = nextContent.replace(
        /(\bname\s*:\s*)(?:AppName|PRODUCT)\b/g,
        (_, prefix: string) => `${prefix}${JSON.stringify(normalizedAppName)}`,
      );
      if (replacedBareNamePlaceholder !== nextContent) {
        nextContent = replacedBareNamePlaceholder;
        rewrites.push({
          path: normalizedPath,
          detail: 'filled APP_CONFIG.name from the architect app name',
        });
      }

      const replacedResidualPlaceholder = nextContent.replace(
        /\bAppName\b/g,
        normalizedAppName,
      );
      if (replacedResidualPlaceholder !== nextContent) {
        nextContent = replacedResidualPlaceholder;
        rewrites.push({
          path: normalizedPath,
          detail: 'replaced residual AppName token(s) in config/app.ts',
        });
      }
    }

    const replacedStandaloneProductToken = nextContent.replace(
      /\bPRODUCT\b/g,
      normalizedAppName,
    );
    if (replacedStandaloneProductToken !== nextContent) {
      nextContent = replacedStandaloneProductToken;
      rewrites.push({
        path: normalizedPath,
        detail: 'replaced standalone PRODUCT token(s)',
      });
    }

    if (nextContent !== content) {
      nextFiles[path] = nextContent;
    }
  }

  return {
    files: rewrites.length > 0 ? nextFiles : input.files,
    rewrites,
  };
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)));
}

function buildIdentitySlotDiagnostics(input: {
  files: Record<string, string>;
  skeletonId: SkeletonId;
}): {
  identitySlotFindings: string[];
  repairableMissingIdentityPaths: string[];
} {
  const editablePaths = getEditableSkeletonFiles(input.skeletonId).map(path => normalizeOutputPath(path));
  const editableFiles = new Set(editablePaths);
  const normalizedFiles = new Map<string, string>(
    Object.entries(input.files).map(([path, content]) => [
      canonicalizeBareDeltaPathToKnownPath(normalizeOutputPath(path), editablePaths),
      content,
    ]),
  );
  const identitySlotFindings: string[] = [];
  const repairableMissingIdentityPaths: string[] = [];

  for (const rule of IDENTITY_SLOT_RULES) {
    if (!editableFiles.has(rule.path)) continue;
    const content = normalizedFiles.get(rule.path);
    if (!content || content.trim().length === 0) {
      identitySlotFindings.push(`${rule.path}: ${rule.missingLabel}`);
      repairableMissingIdentityPaths.push(rule.path);
      continue;
    }
    for (const fingerprint of rule.fingerprints) {
      if (fingerprint.matches(content)) {
        identitySlotFindings.push(`${rule.path}: ${fingerprint.label}`);
      }
    }
  }

  return {
    identitySlotFindings: uniqueStrings(identitySlotFindings).sort((a, b) => a.localeCompare(b)),
    repairableMissingIdentityPaths: uniqueStrings(repairableMissingIdentityPaths).sort((a, b) => a.localeCompare(b)),
  };
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
  if (normalized.startsWith('generated/uploads/')) return false;
  if (normalized.startsWith('docs/architect/')) return false;
  if (normalized.includes('__tests__/')) return false;
  if (/\.(?:test|spec)\.tsx?$/.test(normalized)) return false;
  return true;
}

export interface UploadedAssetPromptEntry {
  id: string;
  kind: PipelineAttachment['type'];
  name: string;
  moduleImportPath?: string;
  excerpt?: string;
}

export interface UploadedAssetFusionResult {
  files: Record<string, string>;
  materializedFiles: string[];
  promptBlock: string;
  entries: UploadedAssetPromptEntry[];
}

function truncatePromptSnippet(value: string, limit = 220): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1)}…`;
}

function sanitizeAttachmentModuleId(name: string, index: number): string {
  const stem = name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return stem ? `${String(index + 1).padStart(2, '0')}-${stem}` : `attachment-${index + 1}`;
}

export function materializeUploadedAssetFusion(
  attachments: readonly PipelineAttachment[] | undefined,
): UploadedAssetFusionResult {
  const files: Record<string, string> = {};
  const entries: UploadedAssetPromptEntry[] = [];

  for (const [index, attachment] of (attachments ?? []).entries()) {
    const id = sanitizeAttachmentModuleId(attachment.name, index);
    const basePath = `generated/uploads/${id}`;
    const snippet = truncatePromptSnippet(
      attachment.textContent ?? (attachment.type === 'image' ? '' : attachment.data),
    );

    if (attachment.type === 'image') {
      const dataUrl = attachment.data.startsWith('data:')
        ? attachment.data
        : `data:${attachment.mimeType};base64,${attachment.data}`;
      const modulePath = `${basePath}.ts`;
      files[modulePath] = [
        `export const uploadedAsset = ${JSON.stringify({
          id,
          name: attachment.name,
          mimeType: attachment.mimeType,
          kind: attachment.type,
          dataUrl,
        }, null, 2)} as const;`,
        '',
        'export default uploadedAsset.dataUrl;',
        '',
      ].join('\n');
      entries.push({
        id,
        kind: attachment.type,
        name: attachment.name,
        moduleImportPath: `@/${basePath}`,
      });
      continue;
    }

    const modulePath = `${basePath}.ts`;
    files[modulePath] = [
      `export const uploadedAsset = ${JSON.stringify({
        id,
        name: attachment.name,
        mimeType: attachment.mimeType,
        kind: attachment.type,
        excerpt: snippet,
      }, null, 2)} as const;`,
      '',
      'export default uploadedAsset;',
      '',
    ].join('\n');
    entries.push({
      id,
      kind: attachment.type,
      name: attachment.name,
      moduleImportPath: `@/${basePath}`,
      excerpt: snippet,
    });
  }

  if (entries.length > 0) {
    files['generated/uploads/manifest.ts'] = [
      `export const UPLOADED_ASSET_MANIFEST = ${JSON.stringify(entries, null, 2)} as const;`,
      '',
      'export default UPLOADED_ASSET_MANIFEST;',
      '',
    ].join('\n');
  }

  const promptLines = entries.map(entry => {
    if (entry.kind === 'image') {
      return `- image \`${entry.name}\` -> import default from '${entry.moduleImportPath}' and use it directly in the UI`;
    }
    return `- ${entry.kind} \`${entry.name}\`${entry.moduleImportPath ? ` -> metadata at '${entry.moduleImportPath}'` : ''}${entry.excerpt ? ` | excerpt: "${entry.excerpt}"` : ''}`;
  });

  return {
    files,
    materializedFiles: Object.keys(files).sort((left, right) => left.localeCompare(right)),
    promptBlock: promptLines.length > 0
      ? [
          'UPLOADED ASSETS / REFERENCE MATERIAL',
          ...promptLines,
          '- If a provided asset helps the product, fuse it into the shipped UI instead of ignoring it.',
        ].join('\n')
      : '',
    entries,
  };
}

function collectRequiredCapabilityIds(prebuiltPlan?: ProjectPlan | null): string[] {
  if (!prebuiltPlan) return [];
  const kickoff = (prebuiltPlan.kickoffScope as { selectedCapabilityIds?: string[] } | undefined)?.selectedCapabilityIds ?? [];
  const architectKickoff = (prebuiltPlan.architectKickoff as { selectedCapabilityIds?: string[] } | undefined)?.selectedCapabilityIds ?? [];
  return Array.from(new Set(
    [...kickoff, ...architectKickoff]
      .map(capability => capability.trim())
      .filter(Boolean),
  )).sort((left, right) => left.localeCompare(right));
}

function mergeSavedPlanRequirements(
  plan: ArchitectPlan,
  prebuiltPlan: ProjectPlan | undefined,
  onLog: (msg: string, level?: 'info' | 'warn' | 'error') => void,
): ArchitectPlan {
  if (!prebuiltPlan) return plan;

  const nextFileTree = { ...plan.fileTree };
  const nextPages = [...(plan.pages ?? [])];
  const nextNotes = [...(plan.notes ?? [])];
  const pageFiles = new Set(nextPages.map(page => normalizeOutputPath(page.file)));
  const requiredCapabilities = collectRequiredCapabilityIds(prebuiltPlan);
  let injectedPages = 0;

  for (const page of prebuiltPlan.pages ?? []) {
    const normalizedFile = normalizeOutputPath(page.file ?? '');
    if (!normalizedFile) continue;
    if (!nextFileTree[normalizedFile]) {
      nextFileTree[normalizedFile] = page.purpose?.trim()
        ? `Saved product-plan requirement: ${page.purpose}`
        : `Saved product-plan required screen: ${page.name || page.path || normalizedFile}`;
      injectedPages += 1;
    }
    if (!pageFiles.has(normalizedFile)) {
      nextPages.push({
        path: page.path,
        name: page.name,
        file: normalizedFile,
        purpose: page.purpose,
      });
      pageFiles.add(normalizedFile);
    }
  }

  if (requiredCapabilities.length > 0) {
    nextNotes.push(
      `Saved plan must-capabilities that must be concrete in the shipped prototype: ${requiredCapabilities.join(', ')}.`,
    );
  }
  if (injectedPages > 0) {
    nextNotes.push(
      `Saved product plan added ${injectedPages} required page file(s); they must ship as real routed screens, not notes only.`,
    );
    onLog(`[completeness] injected ${injectedPages} required saved-plan page(s) into the architect delta`, 'info');
  }

  const deltaFiles = Object.entries(nextFileTree)
    .map(([path, purpose]) => ({ path, purpose }))
    .sort((left, right) => left.path.localeCompare(right.path));

  return {
    ...plan,
    fileTree: nextFileTree,
    deltaFiles,
    pages: nextPages,
    notes: Array.from(new Set(nextNotes)),
    contextContract: [
      plan.contextContract?.trim(),
      requiredCapabilities.length > 0
        ? `Saved plan scope is authoritative for must-capabilities: ${requiredCapabilities.join(', ')}.`
        : '',
    ].filter(Boolean).join('\n'),
  };
}

function buildCriticFileDigest(currentFiles: Record<string, string>): string {
  const prioritizedFiles = Object.keys(currentFiles)
    .sort((left, right) => left.localeCompare(right))
    .sort((left, right) => {
      const leftPriority = /^pages\//.test(left) ? 0 : /^config\//.test(left) ? 1 : /^components\//.test(left) ? 2 : 3;
      const rightPriority = /^pages\//.test(right) ? 0 : /^config\//.test(right) ? 1 : /^components\//.test(right) ? 2 : 3;
      return leftPriority - rightPriority || left.localeCompare(right);
    })
    .slice(0, 12);

  return prioritizedFiles
    .map(path => [
      `FILE: ${path}`,
      currentFiles[path].slice(0, 900),
      '---',
    ].join('\n'))
    .join('\n');
}

// ── Pass 2 helpers (WI-4) ─────────────────────────────────────────────────────

/** Paths that the Pass 2 implementer must never touch. */
const PASS2_UNSAFE_PATH_PATTERNS: RegExp[] = [
  /^backend\//,
  /package(?:-lock)?\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /\.env(?:\.|$)/,
  /agent-config\.json$/,
  /tsconfig(?:\..*)?\.json$/,
  /vite\.config\./,
  /tailwind\.config\./,
  /postcss\.config\./,
  /node_modules\//,
  /secrets?\./,
];

/** Returns false for backend/config/secrets/package paths; true for workspace source files. */
export function isPass2SafeTargetFile(path: string): boolean {
  const normalized = normalizeOutputPath(path);
  return !PASS2_UNSAFE_PATH_PATTERNS.some(rx => rx.test(normalized));
}

/** Strips ```json or ``` fences from LLM output before JSON.parse. */
export function stripPass2JsonFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*\n?/im, '')
    .replace(/\n?```\s*$/m, '')
    .trim();
}

/**
 * Parses a Gap[] from raw LLM text.
 * Rejects the old loose schema {verdict, reasons, instructions, focusFiles} with an explicit error.
 */
export function parseGapArray(raw: string): { gaps: Gap[] | null; parseError?: string } {
  const stripped = stripPass2JsonFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (e) {
    return { gaps: null, parseError: `json_parse_failed: ${(e as Error).message}` };
  }
  if (!Array.isArray(parsed)) {
    if (typeof parsed === 'object' && parsed !== null) {
      const obj = parsed as Record<string, unknown>;
      if ('verdict' in obj || 'reasons' in obj || 'instructions' in obj || 'focusFiles' in obj) {
        return {
          gaps: null,
          parseError: 'loose_schema_rejected: critic returned {verdict,reasons,instructions,focusFiles} instead of Gap[]',
        };
      }
    }
    return { gaps: null, parseError: `expected_json_array: got ${typeof parsed}` };
  }

  const GAP_STATUSES = new Set(['missing', 'partial', 'fake', 'broken', 'visual']);
  const GAP_PRIORITIES = new Set(['must', 'should', 'nice']);
  const GAP_SOURCES = new Set(['completeness', 'build', 'critic', 'visual']);

  const gaps: Gap[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const g = item as Record<string, unknown>;
    if (typeof g.id !== 'string' || !g.id) continue;
    if (typeof g.briefPoint !== 'string' || !g.briefPoint) continue;
    gaps.push({
      id: g.id,
      briefPoint: g.briefPoint,
      status: GAP_STATUSES.has(String(g.status)) ? g.status as GapStatus : 'missing',
      evidence: typeof g.evidence === 'string' ? g.evidence : '',
      targetFile: typeof g.targetFile === 'string' ? g.targetFile : '',
      requiredAction: typeof g.requiredAction === 'string' ? g.requiredAction : '',
      priority: GAP_PRIORITIES.has(String(g.priority)) ? g.priority as GapPriority : 'must',
      source: GAP_SOURCES.has(String(g.source)) ? g.source as GapSource : 'completeness',
    });
  }

  return { gaps };
}

/**
 * Converts CompletenessGate uncoveredMust feature points into a deterministic Gap[].
 * Always available — no LLM required. Used as the canonical gap source even when
 * the QA route is not configured.
 */
export function buildDeterministicGaps(
  featureChecklist: FeatureChecklistItem[],
  uncoveredMust: string[],
): Gap[] {
  return uncoveredMust.map((briefPoint, index) => {
    const item = featureChecklist.find(f => f.briefPoint === briefPoint);
    const targetFile = item?.targetFiles[0]
      ? normalizeOutputPath(item.targetFiles[0])
      : 'pages/Home.tsx';
    return {
      id: `gap-${String(index + 1).padStart(3, '0')}`,
      briefPoint,
      status: 'missing' as GapStatus,
      evidence: item
        ? `CompletenessGate: feature not covered. Target file(s): ${item.targetFiles.join(', ')}`
        : `CompletenessGate: feature absent from generated output`,
      targetFile,
      requiredAction: item
        ? `Implement "${briefPoint}" with concrete code in ${item.targetFiles.join(', ')}`
        : `Implement "${briefPoint}" with concrete code`,
      priority: (item?.priority ?? 'must') as GapPriority,
      source: 'completeness' as GapSource,
    };
  });
}

/**
 * Pass 2 critic — strict Gap[] output.
 *
 * Always builds a deterministic Gap[] from CompletenessGate uncovered must features.
 * If the QA route is configured, attempts LLM enrichment with one retry on parse failure.
 * If LLM unavailable or parse fails after retry, falls back to the deterministic Gap[].
 * Never returns the loose {verdict,reasons,instructions,focusFiles} schema.
 */
async function runPass2Critic(input: {
  featureChecklist: FeatureChecklistItem[];
  uncoveredMust: string[];
  currentFiles: Record<string, string>;
  buildErrors?: string;
  signal?: AbortSignal;
  routeOverrides?: RouteOverrideMap;
  onLog: (msg: string, level?: 'info' | 'warn' | 'error') => void;
  onUsage?: (usage: StepLlmMetrics) => void;
}): Promise<{
  gaps: Gap[];
  parseStatus: Pass2Telemetry['critic_parse_status'];
  available: boolean;
  unavailableReason?: string;
}> {
  const deterministicGaps = buildDeterministicGaps(input.featureChecklist, input.uncoveredMust);

  const qaRoute = resolveRouteOrSkip('qa', input.routeOverrides);
  if (!qaRoute) {
    input.onLog('[pass2-critic] qa route not configured — using deterministic Gap[] from CompletenessGate', 'info');
    return { gaps: deterministicGaps, parseStatus: 'unavailable', available: false, unavailableReason: 'route_unresolved' };
  }

  const system = [
    'You are Pass 2 critic for a prototype pipeline.',
    'Analyze the provided feature gaps and current file state.',
    'Return ONLY a valid JSON array of Gap objects (no prose, no markdown fences):',
    '[',
    '  {',
    '    "id": "gap-001",',
    '    "briefPoint": "short description of gap",',
    '    "status": "missing" | "partial" | "fake" | "broken" | "visual",',
    '    "evidence": "concrete reason the gap exists",',
    '    "targetFile": "path/to/file.tsx",',
    '    "requiredAction": "what the implementer must do",',
    '    "priority": "must" | "should" | "nice",',
    '    "source": "completeness" | "build" | "critic" | "visual"',
    '  }',
    ']',
    'STRICT RULES:',
    '- Return ONLY a JSON array. No object wrapper. No verdict/reasons/instructions/focusFiles.',
    '- Do NOT generate code. Only identify and describe gaps.',
    '- If input gaps are already complete, return them as-is.',
  ].join('\n');

  const user = [
    'Detected gaps from CompletenessGate:',
    JSON.stringify(deterministicGaps, null, 2),
    '',
    'Current file inventory:',
    Object.keys(input.currentFiles).sort((a, b) => a.localeCompare(b)).map(p => `- ${p}`).join('\n'),
    ...(input.buildErrors ? ['', `Build errors:\n${input.buildErrors}`] : []),
  ].join('\n');

  const callCritic = async (extraInstruction = ''): Promise<string> =>
    callOnce({
      slot: 'qa',
      system: extraInstruction ? `${system}\n\n${extraInstruction}` : system,
      user,
      maxTokens: 3000,
      timeoutMs: 60_000,
      signal: input.signal,
      routeOverrides: input.routeOverrides,
      onUsage: input.onUsage,
    });

  let raw = '';
  try {
    raw = await callCritic();
  } catch (err) {
    if (isAbort(err)) throw err;
    input.onLog(`[pass2-critic] LLM call failed: ${(err as Error).message} — using deterministic gaps`, 'warn');
    return { gaps: deterministicGaps, parseStatus: 'unavailable', available: true };
  }

  const result = parseGapArray(raw);
  if (!result.gaps || result.gaps.length === 0) {
    input.onLog(`[pass2-critic] first parse failed (${result.parseError ?? 'empty'}) — retrying`, 'warn');
    try {
      const raw2 = await callCritic(
        'IMPORTANT: Previous response was not a valid JSON array. Return ONLY a JSON array of Gap objects. No text before or after.',
      );
      const result2 = parseGapArray(raw2);
      if (result2.gaps && result2.gaps.length > 0) {
        input.onLog(`[pass2-critic] retry parse ok — ${result2.gaps.length} gap(s)`, 'info');
        return { gaps: result2.gaps, parseStatus: 'retry_ok', available: true };
      }
    } catch (err) {
      if (isAbort(err)) throw err;
      input.onLog(`[pass2-critic] retry call failed: ${(err as Error).message}`, 'warn');
    }
    input.onLog('[pass2-critic] parse_error after retry — using deterministic gaps', 'warn');
    return { gaps: deterministicGaps, parseStatus: 'parse_error', available: true, unavailableReason: result.parseError };
  }

  input.onLog(`[pass2-critic] LLM returned ${result.gaps.length} gap(s) — schema Gap[]`, 'info');
  return { gaps: result.gaps, parseStatus: 'ok', available: true };
}

/**
 * Pass 2 implementer — scope-guarded patch applicator.
 *
 * Receives Gap[] from the critic, calls the 'fix' agent slot to produce delta patches,
 * and merges only patches whose paths are:
 *  1. Not unsafe (no backend/, package.json, .env, agent-config.json, tsconfig.json, etc.)
 *  2. Present in the existing generated files OR in the allowed target files set
 *  3. Not skeleton-protected
 */
async function runPass2Implementer(input: {
  gaps: Gap[];
  currentFiles: Record<string, string>;
  allowedTargetFiles: Set<string>;
  skeletonId: SkeletonId;
  prompt?: string;
  productAppName?: string;
  productSummary?: string;
  signal?: AbortSignal;
  routeOverrides?: RouteOverrideMap;
  onLog: (msg: string, level?: 'info' | 'warn' | 'error') => void;
  onUsage?: (usage: StepLlmMetrics) => void;
}): Promise<{
  mergedFiles: Record<string, string>;
  touchedFiles: string[];
  rejectedFiles: string[];
}> {
  const editableProductSlotFiles = getSkeletonProductSlotFiles(input.skeletonId)
    .map(path => normalizeOutputPath(path));
  const mustGapCount = input.gaps.filter(gap => gap.priority === 'must').length;
  const touchesEditableProductSlot = input.gaps.some(gap => (
    editableProductSlotFiles.includes(normalizeOutputPath(gap.targetFile ?? ''))
  ));
  const wantsBuildStrength = touchesEditableProductSlot && mustGapCount >= 3;
  const hasFixRoute = Boolean(resolveRouteOrSkip('fix', input.routeOverrides));
  const hasBuildRoute = Boolean(resolveRouteOrSkip('build', input.routeOverrides));
  const strategy = (
    wantsBuildStrength && hasBuildRoute
      ? {
          slot: 'build' as AgentSlot,
          maxTokens: STEP_BUDGET.qualityRepairHeavy.maxTokens,
          timeoutMs: STEP_BUDGET.qualityRepairHeavy.timeoutMs,
          reason: 'coverage rescue on editable product-slot files needs build-strength rewrite',
        }
      : hasFixRoute
        ? {
            slot: 'fix' as AgentSlot,
            maxTokens: STEP_BUDGET.repair.maxTokens,
            timeoutMs: STEP_BUDGET.repair.timeoutMs,
            reason: wantsBuildStrength
              ? 'build-strength rescue unavailable — falling back to fix route'
              : 'standard pass2 gap patch',
          }
        : hasBuildRoute
          ? {
              slot: 'build' as AgentSlot,
              maxTokens: wantsBuildStrength
                ? STEP_BUDGET.qualityRepairHeavy.maxTokens
                : STEP_BUDGET.repair.maxTokens,
              timeoutMs: wantsBuildStrength
                ? STEP_BUDGET.qualityRepairHeavy.timeoutMs
                : STEP_BUDGET.repair.timeoutMs,
              reason: wantsBuildStrength
                ? 'fix route unavailable — using build route for coverage rescue'
                : 'fix route unavailable — using build route for scoped pass2 patch',
            }
          : {
              slot: 'fix' as AgentSlot,
              maxTokens: STEP_BUDGET.repair.maxTokens,
              timeoutMs: STEP_BUDGET.repair.timeoutMs,
              reason: 'standard pass2 gap patch',
            }
  );
  const implementerRoute = resolveRouteOrSkip(strategy.slot, input.routeOverrides);
  if (!implementerRoute) {
    input.onLog('[pass2-implementer] no fix/build route configured — skipping implementation', 'warn');
    return { mergedFiles: input.currentFiles, touchedFiles: [], rejectedFiles: [] };
  }

  const allowedNormalized = new Set<string>();
  for (const path of Object.keys(input.currentFiles)) {
    allowedNormalized.add(normalizeOutputPath(path));
  }
  for (const path of input.allowedTargetFiles) {
    allowedNormalized.add(normalizeOutputPath(path));
  }
  for (const gap of input.gaps) {
    if (gap.targetFile) allowedNormalized.add(normalizeOutputPath(gap.targetFile));
  }

  const gapSummary = input.gaps
    .map(gap =>
      `${gap.id} [${gap.priority}] "${gap.briefPoint}"\n  status=${gap.status} targetFile=${gap.targetFile}\n  action: ${gap.requiredAction}`,
    )
    .join('\n\n');

  const allowedList = [...allowedNormalized].sort((a, b) => a.localeCompare(b));
  const editableSlotBlock = editableProductSlotFiles.length > 0
    ? `\nEDITABLE PRODUCT-SLOT FILES (safe to rewrite fully when gaps require it):\n` +
      `${editableProductSlotFiles.map(path => `  ${path}`).join('\n')}\n`
    : '';
  const productContextBlock =
    (input.productAppName && input.productAppName.trim().length > 0) ||
    (input.productSummary && input.productSummary.trim().length > 0) ||
    (input.prompt && input.prompt.trim().length > 0)
      ? `\nPRODUCT CONTEXT:\n` +
        `${input.productAppName ? `App name: ${input.productAppName}\n` : ''}` +
        `${input.productSummary ? `Summary: ${input.productSummary}\n` : ''}` +
        `${input.prompt ? `Original task: ${input.prompt}\n` : ''}`
      : '';
  const system = [
    'You are the Pass 2 implementer. Patch the prototype to address the identified gaps.',
    'Emit ONLY the files you changed using delta patch format:',
    '<<<FILE: src/pages/Coach.tsx>>>',
    '...full file content...',
    '<<<END>>>',
    '',
    'SCOPE RULES (strictly enforced):',
    '- Only emit files listed in ALLOWED FILES below.',
    '- Do NOT create files outside the workspace.',
    '- Do NOT modify: backend/, package.json, tsconfig.json, .env, agent-config.json, vite.config.*, tailwind.config.*, node_modules/.',
    '- Preserve all existing working code — only patch what gaps require.',
    '- If a target file is an editable product-slot page/config/data file, you MAY rewrite it from top to bottom to remove skeleton defaults and implement the missing workflow.',
    '- If a target file is missing from the current graph but present in ALLOWED FILES, create it as a complete product-specific implementation.',
    '- Implement the gap end-to-end with visible state changes; do not leave TODO surfaces, placeholder copy, or inert CTA buttons.',
    editableSlotBlock,
    productContextBlock,
    `- ALLOWED FILES:\n${allowedList.map(p => `  ${p}`).join('\n')}`,
  ].join('\n');

  const originalKeysByNormalizedPath = new Map<string, string>(
    Object.keys(input.currentFiles).map(path => [normalizeOutputPath(path), path]),
  );
  const prioritizedRelevantPaths = uniqueStrings([
    ...input.gaps.map(gap => normalizeOutputPath(gap.targetFile ?? '')),
    ...editableProductSlotFiles,
    ...Object.keys(input.currentFiles).map(path => normalizeOutputPath(path)),
  ]).filter(path => allowedNormalized.has(path));
  const relevantFiles = prioritizedRelevantPaths
    .slice(0, 12)
    .map((normalizedPath) => {
      const originalKey = originalKeysByNormalizedPath.get(normalizedPath);
      if (!originalKey) {
        return `<<<FILE: ${normalizedPath}>>>\n/* file not present in current graph — create it if this gap requires it */\n<<<END>>>`;
      }
      const content = input.currentFiles[originalKey] ?? '';
      const clipped = content.length > 2000
        ? `${content.slice(0, 2000)}\n/* …truncated… */`
        : content;
      return `<<<FILE: ${originalKey}>>>\n${clipped}\n<<<END>>>`;
    })
    .join('\n\n');

  const user = [
    'Gaps to implement:',
    gapSummary,
    '',
    'Relevant current files:',
    relevantFiles || '(none in allowed set)',
  ].join('\n');

  let body = '';
  try {
    input.onLog(
      `[pass2-implementer] route=${strategy.slot} max_tokens=${strategy.maxTokens} timeout_ms=${strategy.timeoutMs} ` +
        `(${strategy.reason})`,
      'info',
    );
    await streamCall({
      slot: strategy.slot,
      system,
      user,
      maxTokens: strategy.maxTokens,
      timeoutMs: strategy.timeoutMs,
      signal: input.signal,
      routeOverrides: input.routeOverrides,
      onChunk: (delta) => { body += delta; },
      onUsage: input.onUsage,
    });
    input.onLog(`[pass2-implementer] llm response received (${body.length} chars)`, 'info');
  } catch (err) {
    if (isAbort(err)) throw err;
    input.onLog(`[pass2-implementer] LLM call failed: ${(err as Error).message}`, 'warn');
    return { mergedFiles: input.currentFiles, touchedFiles: [], rejectedFiles: [] };
  }

  const patches = parseFileMarkers(body);
  if (Object.keys(patches).length === 0) {
    input.onLog('[pass2-implementer] no <<<FILE:>>>/<<<END>>> blocks produced', 'warn');
    return { mergedFiles: input.currentFiles, touchedFiles: [], rejectedFiles: [] };
  }

  const merged: Record<string, string> = { ...input.currentFiles };
  const touchedFiles: string[] = [];
  const rejectedFiles: string[] = [];

  for (const [patchPath, patchContent] of Object.entries(patches)) {
    const normalized = canonicalizeBareDeltaPathToKnownPath(
      normalizeOutputPath(patchPath),
      allowedNormalized,
    );

    if (!isPass2SafeTargetFile(normalized)) {
      rejectedFiles.push(normalized);
      input.onLog(`[pass2-implementer] rejected unsafe path: ${normalized}`, 'warn');
      continue;
    }
    if (!allowedNormalized.has(normalized)) {
      rejectedFiles.push(normalized);
      input.onLog(`[pass2-implementer] rejected out-of-scope path: ${normalized}`, 'warn');
      continue;
    }
    if (isProtectedSkeletonFile(input.skeletonId, patchPath)) {
      rejectedFiles.push(normalized);
      input.onLog(`[pass2-implementer] rejected skeleton-protected path: ${normalized}`, 'warn');
      continue;
    }

    const originalKey = Object.keys(input.currentFiles).find(
      key => normalizeOutputPath(key) === normalized,
    );
    merged[originalKey ?? normalized] = patchContent;
    touchedFiles.push(normalized);
  }

  if (touchedFiles.length > 0) {
    input.onLog(`[pass2-implementer] patched ${touchedFiles.length} file(s): ${touchedFiles.join(', ')}`, 'info');
  }
  if (rejectedFiles.length > 0) {
    input.onLog(`[pass2-implementer] rejected ${rejectedFiles.length} file(s): ${rejectedFiles.join(', ')}`, 'warn');
  }

  return { mergedFiles: merged, touchedFiles, rejectedFiles };
}

function filterCompletenessFiles(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).filter(([path]) => {
      const normalized = normalizeOutputPath(path);
      return !normalized.startsWith('docs/architect/')
        && !normalized.startsWith('generated/uploads/')
        && !normalized.startsWith('design-pack/')
        && !normalized.startsWith('assets/generated/');
    }),
  );
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
  const identitySlotDiagnostics = buildIdentitySlotDiagnostics({
    files: input.files,
    skeletonId: input.skeletonId,
  });
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
  const qualityContract = getSkeletonQualityContract(input.skeletonId);
  if (meaningfulScreenFiles.length < qualityContract.minMeaningfulScreens) {
    visualUsageNotes.push(
      `${input.skeletonId} quality contract requires at least ${qualityContract.minMeaningfulScreens} meaningful screens; observed ${meaningfulScreenFiles.length}.`,
    );
  }
  if (genericPlaceholderFindings.length > 0) {
    visualUsageNotes.push('Obvious generic placeholder content remains in generated source.');
  }
  if (identitySlotDiagnostics.identitySlotFindings.length > 0) {
    visualUsageNotes.push('Required product-identity slots are missing or still contain skeleton-default content.');
  }

  const designMismatchObserved = (input.designSelectionDiagnostics?.possibleMismatchWarnings.length ?? 0) > 0;
  const assetsExistButUnused =
    (premiumUsageChecked && !premiumUsageObserved) ||
    (mediaUsageChecked && !mediaUsageObserved);
  const firstScreenVisualUsageObserved = firstScreenPremiumUsageObserved || firstScreenMediaUsageObserved;
  const repeatedUnusedSignals =
    (!firstScreenVisualUsageObserved && (premiumUsageObserved || mediaUsageObserved)) ||
    (premiumUsageChecked && mediaUsageChecked && !premiumUsageObserved && !mediaUsageObserved) ||
    genericPlaceholderFindings.length > 0 ||
    identitySlotDiagnostics.identitySlotFindings.length > 0;
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
    identitySlotFindings: identitySlotDiagnostics.identitySlotFindings,
    repairableMissingIdentityPaths: identitySlotDiagnostics.repairableMissingIdentityPaths,
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
    identity_slot_findings: diagnostics.identitySlotFindings ?? [],
    repairable_missing_identity_paths: diagnostics.repairableMissingIdentityPaths ?? [],
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
 * ADVISORY (warn-only, ok remains true):
 *   - premium components selected but none referenced in generated source
 *   - media assets materialized but none referenced in generated source
 *
 * Wired as a blocking gate in ProtoPipeline.run() after emit('apply', 'done', ...).
 * Advisory reasons are logged as warn before the build step.
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
    const identitySlotFindings = vud.identitySlotFindings ?? [];

    if (premiumSelectedNotUsed) {
      // Advisory, NOT blocking (was previously a soft block that forced a repair
      // pass to import a premium component). Premium design-pack components are
      // optional accelerators, not the last word: a UI composed entirely from the
      // modern shadcn/radix @/components/ui primitives is a first-class,
      // premium-grade outcome. We record the signal but never force a premium
      // import. (See CODER COMPONENT INSTRUCTIONS in DesignContract.)
      const ids = vud.premiumComponentsSelected.slice(0, 4).join(', ');
      advisoryReasons.push(
        `Premium components selected (${ids}) but composed from shadcn/radix primitives instead — allowed`,
      );
      advisoryInstructions.push(
        'Premium design-pack components are optional. Keep composing from the modern ' +
        'shadcn/radix @/components/ui primitives where they read cleaner; only fold in a ' +
        'premium block when it genuinely fits a screen slot.',
      );
    }

    // ── Check 3: media materialized but not referenced ────────────────────────
    if (mediaNotUsed) {
      const files = vud.mediaAssetsMaterialized.slice(0, 3).join(', ');
      advisoryReasons.push(
        `Generated media assets materialized (${files}) but none referenced in generated source`,
      );
      advisoryInstructions.push(
        'Generated media is optional at release-gate time. Keep the current product-specific UI if it reads clearly; ' +
        'fold the media asset into a visible screen later only when it improves the composition.',
      );
    }

    // ── Check 4: generic placeholder content ─────────────────────────────────
    const visualPlaceholders = vud.genericPlaceholderFindings;
    const BLOCKING_PLACEHOLDER_LABELS = new Set([
      'Feature 1', 'Feature 2', 'Feature 3',
      'AppName', 'PRODUCT',
      'Lorem', 'lorem ipsum',
      'Untitled', 'TODO',
      // Skeleton-default fingerprints — surviving carcass copy means the product
      // identity was not applied (theme lost). Block → repair, never ship generic.
      'Morning intention', 'Deep work block', "Today's space", 'Nothing here yet',
    ]);
    const blockingVisualPlaceholders = visualPlaceholders.filter(finding => {
      const label = finding.split(': ').slice(1).join(': ');
      return BLOCKING_PLACEHOLDER_LABELS.has(label);
    });
    const identitySlotFindingSet = new Set(identitySlotFindings);
    const genericBlockingFindings = blockingVisualPlaceholders.filter(
      finding => !identitySlotFindingSet.has(finding),
    );

    if (genericBlockingFindings.length > 0) {
      blockingReasons.push(
        `Generic placeholder / skeleton-default content in ${genericBlockingFindings.length} location(s): ` +
        genericBlockingFindings.slice(0, 4).join('; '),
      );
      repairInstructions.push(
        'Replace all generic placeholders (Feature 1, AppName, Lorem ipsum, Untitled, TODO) AND any ' +
        'surviving skeleton-default copy/seed (Morning intention, Deep work block, Today\'s space, ' +
        'Nothing here yet) with product-specific copy, domain entities, and seed data for THIS product.',
      );
    }

    if (identitySlotFindings.length > 0) {
      blockingReasons.push(
        `Product identity slots missing or generic in ${identitySlotFindings.length} location(s): ` +
        identitySlotFindings.slice(0, 4).join('; '),
      );
      repairInstructions.push(
        'Emit and fully rewrite every missing or generic identity slot ' +
        '(config/app.ts, data/seed.ts, config/navigation.ts, pages/Home.tsx when applicable) ' +
        'so the final shipped workspace does not retain skeleton defaults.',
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
  const identitySlotViolationCount = vud?.identitySlotFindings?.length ?? 0;

  return {
    ok: blockingReasons.length === 0,
    blockingReasons,
    repairInstructions,
    hardFailAfterRepair: blockingReasons.length > 0,
    advisoryReasons,
    advisoryInstructions,
    telemetry: {
      checks_run: checksRun,
      design_contract_violations: designContractViolationCount,
      premium_selected_not_used: premiumSelectedNotUsed,
      media_materialized_not_used: mediaNotUsed,
      generic_placeholder_count: totalGenericPlaceholderCount,
      identity_slot_violation_count: identitySlotViolationCount,
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
    // ── Outcome telemetry state (captured by fail() closure) ──────────────────
    const runId = config.runId ?? config.buildId;
    let capturedPlan: ArchitectPlan | undefined;
    let designContractOk:      boolean | undefined;  // pre-repair (coder first pass)
    let designContractFinalOk: boolean | undefined;  // post-repair (committed code)
    let repairPasses = 0;
    // true once the final build compile loop starts (not the skeleton compile)
    let buildCompileAttempted = false;
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
    const fail = (
      step: StepId,
      error: string,
      reason?: ProtoPipelineFailureReason,
    ): ProtoPipelineResult => {
      log(`[ProtoPipeline] ${step} failed: ${error}`, 'error');
      emit(step, 'error', error);
      const isAborted = error === 'aborted';
      const outcomeEvent: GenerationOutcomeEvent = {
        runId,
        prompt:          config.prompt.slice(0, 600),
        skeletonId:      config.skeletonId,
        planSummary:     capturedPlan?.summary,
        deltaFileCount:  capturedPlan?.deltaFiles.length,
        // compiled: only meaningful after build was actually attempted; aborts = undefined
        compiled:        !isAborted && buildCompileAttempted ? false : undefined,
        // repairPasses/designContractOk: undefined if we never reached architect/apply
        repairPasses:    capturedPlan !== undefined ? repairPasses : undefined,
        designContractOk,
        durationMs:      Date.now() - runStartedAt,
        outcome:         isAborted ? 'aborted' : 'failed',
        failedStep:      step,
        errorMessage:    error,
      };
      metricsService.logOutcomeEvent(outcomeEvent);
      // Include outcomeData so callers (GenerationEngine, BenchmarkService) can read
      // designContractOk even for failed runs. Previously this was only logged to telemetry,
      // making designContractOkRate always 0 for suites where every intent failed at build.
      return {
        success: false,
        buildId: config.buildId,
        error,
        reason,
        stepResults,
        outcomeData: {
          repairPasses:          capturedPlan !== undefined ? repairPasses : 0,
          designContractOk,
          designContractFinalOk,
          compiled:              false,
          failedStep:            step,
          errorMessage:          error,
          reasonCode:           reason,
        },
      };
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

    const uploadedAssetFusion = materializeUploadedAssetFusion(config.attachments);
    if (uploadedAssetFusion.entries.length > 0) {
      log(
        `[attachments] fused ${uploadedAssetFusion.entries.length} uploaded asset(s): ` +
        uploadedAssetFusion.entries.map(entry => entry.name).join(', '),
      );
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
          attachmentPromptBlock: uploadedAssetFusion.promptBlock,
      });
    } catch (err) {
      if (isAbort(err)) return fail('architect', 'aborted');
      return fail('architect', (err as Error).message);
    }
    plan = mergeSavedPlanRequirements(plan, config.prebuiltPlan, log);
    capturedPlan = plan;

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

    // ── Architect output downscope validator (advisory only) ─────────────
    // Wired after runArchitect and after controlled adapter fallback so it
    // validates the final plan used by the pipeline, whether real architect
    // output or adapter rescue plan.
    // Does not block generation. Does not mutate plan. Does not trigger repair.
    // Does not alter fallback behavior.
    {
      const outputValidation = validateDownscopedArchitectOutput(plan);
      log(
        `[architect-output-validator]` +
        ` ok=${String(outputValidation.telemetry.architect_output_validator_ok)}` +
        ` technical_signals=${outputValidation.telemetry.architect_output_technical_signal_count}` +
        ` violations=${outputValidation.telemetry.architect_output_downscope_violation_count}` +
        ` scaffold_signals=${outputValidation.telemetry.architect_output_scaffold_signal_count}` +
        ` is_adapter_generated=${String(outputValidation.telemetry.architect_output_is_adapter_generated)}`,
      );
      for (const violation of outputValidation.downscopeViolations) {
        log(`[architect-output-validator] violation: ${violation}`, 'warn');
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
        'run:skeleton-render',
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
    const productDocumentSet = resolveProductDocumentSet({
      prompt: clarifiedPrompt,
      topicPrompt: config.prompt, // raw user brief — stable topic identity for dedup
      projectId: config.projectId,
      revisionId: config.revisionId,
      runId: config.runId,
      generationPath: 'skeleton_assembly',
      skeletonId: config.skeletonId,
      architectPlan: {
        appName: plan.appName,
        summary: plan.summary,
        pages: plan.pages,
        fileTree: plan.fileTree,
        notes: plan.notes,
        dataModel: plan.dataModel,
        contextContract: plan.contextContract,
      },
      prebuiltPlan: config.prebuiltPlan,
      compositionPlan,
      functionalFlowPlan,
      skeletonIntegrationPlan,
      productSpecificityPlan,
    });
    log(
      productDocumentSet.reused
        ? `[docs] reused existing document package for topic "${productDocumentSet.topicMarker.label}" ` +
          `(${productDocumentSet.topicMarker.key}) — ${productDocumentSet.materializedFiles.length} file(s)`
        : `[docs] materialized architect folder (${productDocumentSet.materializedFiles.length} file(s)) at ${productDocumentSet.baseDir} ` +
          `[topic ${productDocumentSet.topicMarker.key}]`,
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
    const serializedBriefLength = buildCompactMarketAwareBuilderBriefForCoder(marketBrief).length;
    const compactSelfPlanLength = buildCompactBuilderOwnedSelfPlanForCoder(marketBrief).length;
    const mustItemCount = marketBrief.selfTestChecklist.filter(i => i.severity === 'must').length;
    log(
      `[market-brief] ok=${String(marketBriefTelemetry.market_brief_ok)} category=${marketBriefTelemetry.product_category} insights=${marketBriefTelemetry.market_insight_count} screens=${marketBriefTelemetry.required_screen_count} checklist=${marketBriefTelemetry.self_test_item_count} differentiator=${String(marketBriefTelemetry.differentiator_present)} generic=${String(marketBriefTelemetry.suspiciously_generic)} techArch=${String(marketBriefTelemetry.tries_to_own_technical_architecture)}`,
    );
    log(
      `[market-brief] injected=true serialized_length=${serializedBriefLength} required_moments=${marketBriefTelemetry.required_screen_count} self_test_must_count=${mustItemCount}`,
    );
    log(
      `[builder-self-plan] injected=${String(marketBriefTelemetry.builder_owned_self_plan_injected)} instruction_length=${compactSelfPlanLength} self_test_items=${marketBriefTelemetry.self_test_items_count}`,
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
       // WI-7: Build Design Fusion block before coder call using already-resolved context.
       const _dfUploadedEntries = buildUploadedAssetFusionEntries(uploadedAssetFusion.entries);
       const _dfPremiumEntries = designCtx
         ? buildPremiumFusionEntries(designCtx.premiumComponentSelection.selectedComponents)
         : [];
       const _designFusionBlock = buildDesignFusionPromptBlock({
         uploadedAssets: _dfUploadedEntries,
         premiumComponents: _dfPremiumEntries,
       });

       const baseCoderInput = {
          prompt:     clarifiedPrompt,
          plan,
          skeletonId: config.skeletonId,
          signal:     config.signal,
          routeOverrides: config.routeOverrides,
          onLog:      log,
          onStream:   config.onCoderStream,
          onUsage:    (usage: StepLlmMetrics) => { coderUsage = mergeLlmUsage(coderUsage, usage); },
          designCtx,
          mediaHints: mediaMaterialization.mediaHints,
          compositionPlan,
          functionalFlowPlan,
          skeletonIntegrationPlan,
          productSpecificityPlan,
          marketAwareBuilderBrief: marketBrief,
          attachmentPromptBlock: uploadedAssetFusion.promptBlock,
          designFusionBlock: _designFusionBlock,
          coderContractBrief: buildCoderContractBrief(productDocumentSet.productDocs),
       };
       // Phased generation: emit the data/logic FOUNDATION first, then the SCREENS
       // against that fixed contract. Both phases can recursively split into
       // smaller batches so medium-complex skeleton apps do not bounce back into a
       // fragile whole-app single pass after the first overloaded batch.
       const { foundation: _founFiles, screens: _scrFiles } = partitionDeltaForPhasing(plan.deltaFiles);
       if (shouldUsePhasedCoder(plan.deltaFiles)) {
         const orderedScreenFiles = orderScreenDeltaForPhasedGeneration(_scrFiles);
         let lockedFoundationFiles: Record<string, string> | null = null;
         try {
           log(`[coder] phased: foundation(${_founFiles.length}) → screens(${orderedScreenFiles.length})`);
           const phase1 = _founFiles.length > PHASED_CODER_SCREEN_BATCH_MAX_FILES
             ? await runPhasedScreenBatchesWithRecovery({
                 label: 'foundation',
                 screens: _founFiles,
                 establishedFiles: {},
                 onLog: log,
                 runBatch: (batch, establishedFiles) => runCoder({
                   ...baseCoderInput,
                   targetFiles: batch,
                   establishedFiles,
                 }),
               })
             : await runCoder({ ...baseCoderInput, targetFiles: _founFiles });
           lockedFoundationFiles = phase1;
           log(`[coder] foundation ready (${Object.keys(phase1).length} file(s)) — generating screens against it`);
           const phase2 = await runPhasedScreenBatchesWithRecovery({
             label: 'screens',
             screens: orderedScreenFiles,
             establishedFiles: phase1,
             onLog: log,
             selectCarryForwardFiles: selectCarryForwardScreenFilesForEstablishedContext,
             runBatch: (batch, establishedFiles) => runCoder({
               ...baseCoderInput,
               targetFiles: batch,
               establishedFiles,
             }),
           });
           deltaFiles = { ...phase1, ...phase2 };
           log(`[coder] phased generation complete (${Object.keys(deltaFiles).length} file(s))`);
         } catch (phErr) {
           if (isAbort(phErr)) throw phErr;
           if (!lockedFoundationFiles) {
             log(
               `[coder] phased foundation failed (${(phErr as Error).message.slice(0, 120)}) ` +
                 `— aborting without whole-app single-pass`,
               'warn',
             );
             throw phErr;
           } else {
             log(
               `[coder] phased screens failed after foundation lock (${(phErr as Error).message.slice(0, 120)}) — aborting without whole-app single-pass`,
               'warn',
             );
             throw phErr;
           }
         }
       } else {
         deltaFiles = await runCoder(baseCoderInput);
       }
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
    Object.assign(deltaFiles, uploadedAssetFusion.files);
    const appPath = Object.keys(deltaFiles).find(path => normalizePreviewPath(path) === 'App.tsx');
    const appSource =
      (appPath ? deltaFiles[appPath] : null) ??
      getSkeletonAppTemplate(config.skeletonId);
    if (appSource) {
      deltaFiles[appPath ?? 'App.tsx'] = ensureVisualPackImport(appSource);
    }

    const productDeltaFilter = filterProductDeltaFiles(config.skeletonId, deltaFiles);
    let filteredFiles: Record<string, string> = productDeltaFilter.files;
    if (productDeltaFilter.rejected.length > 0) {
      log(
        `[apply] rejected ${productDeltaFilter.rejected.length} out-of-scope file(s); product slots are the only writable source paths: ` +
          productDeltaFilter.rejected.join(', '),
        'warn',
      );
    }
    for (const path of Object.keys(filteredFiles)) {
      if (isProtectedSkeletonFile(config.skeletonId, path)) {
        delete filteredFiles[path];
        log(`[apply] rejected invariant violation: product slot is also skeleton-protected: ${path}`, 'error');
      }
    }
    if (Object.keys(filteredFiles).length === 0) {
      return fail('apply', 'No manifest-declared product-slot files were produced — nothing to write');
    }

    // ── Scaffold merge (механизм Б) — BEFORE export integrity check ──────────
    // For rich-skeleton project types (old-5 with scaffold+markers), restore any
    // scaffold export the coder dropped.  Deterministic, no LLM call.
    // Runs BEFORE checkExportIntegrity so merge closes the "coder dropped carcass
    // export" gap and integrity check handles "coder's own symbol missing".
    if (config.skeletonId) {
      const merged = mergeSkeletonExports(config.skeletonId, filteredFiles);
      if (merged !== filteredFiles) {
        const restoredCount = Object.keys(filteredFiles).filter(
          k => merged[k] !== filteredFiles[k],
        ).length;
        log(`[apply] scaffold merge: restored exports in ${restoredCount} file(s)`, 'info');
        filteredFiles = merged;
      }
    }

    // ── Placeholder assets for coder-invented generated imports ─────────────
    // The coder sometimes imports '@/assets/generated/*.svg|png|…' illustrations
    // beyond what the media system materialized (plausible but non-existent names),
    // which the contract validator rejects as missing_local_import. A cosmetic asset
    // must never hard-block the prototype (ship-and-iterate): write a neutral
    // placeholder so Vite resolves the import; the Time-2 loop refines real art later.
    {
      const existingAssetKeys = new Set(
        Object.keys(filteredFiles).map(p => normalizePreviewPath(p)),
      );
      const missingAssets = new Set<string>();
      for (const content of Object.values(filteredFiles)) {
        for (const match of content.matchAll(GENERATED_ASSET_IMPORT_RE)) {
          const rel = match[1];
          if (!existingAssetKeys.has(normalizePreviewPath(rel))) missingAssets.add(rel);
        }
      }
      for (const rel of missingAssets) {
        log(`[apply] rejected generated asset outside product slots: src/${rel}`, 'warn');
      }
      if (missingAssets.size > 0) {
        log(
          `[apply] materialized ${missingAssets.size} placeholder asset(s) for missing ` +
            `generated imports: ${Array.from(missingAssets).join(', ')}`,
          'warn',
        );
      }
    }

    // ── Heal dangling single-segment root aliases to sibling modules ───────
    // Product-slot files sometimes import a local companion contract via a root
    // alias like "@/types" or "@/routes" even though the generated graph only
    // contains the sibling module (data/types.ts, config/routes.ts, etc.).
    // This is a structural mismatch, not a creative one, so normalize it
    // deterministically before compile/repair loops burn LLM time.
    {
      const aliasHeal = rewriteDanglingSingleSegmentAliasImportsToSiblingModules(filteredFiles);
      filteredFiles = aliasHeal.files;
      if (aliasHeal.rewrites.length > 0) {
        log(
          `[apply] rewired ${aliasHeal.rewrites.length} dangling root-alias import(s) to sibling modules: ` +
            aliasHeal.rewrites
              .slice(0, 4)
              .map(rewrite => `${rewrite.file} ${rewrite.from} -> ${rewrite.to}`)
              .join(', '),
          'warn',
        );
      }
    }

    // ── Materialize canonical platform support modules on demand ───────────
    // The prompt contract explicitly allows stable app-local helpers like
    // "@/lib/supabase". When the model uses one, the preview graph must carry
    // the canonical platform file instead of failing on a missing root alias.
    {
      const supportMaterialization = materializeCanonicalSupportModulesForImports(
        config.skeletonId,
        filteredFiles,
      );
      filteredFiles = supportMaterialization.files;
      if (supportMaterialization.materialized.length > 0) {
        log(
          `[apply] materialized ${supportMaterialization.materialized.length} canonical support module(s): ` +
            supportMaterialization.materialized.join(', '),
          'warn',
        );
      }
    }

    // ── Heal dangling relative local-module imports (missing_local_import) ──
    // The coder occasionally imports a sibling module it forgot to emit (e.g. a
    // hook importing '../types/finance' with no types/finance.ts). The contract
    // validator rejects this at compile (missing_local_import) and the repair /
    // quality passes cannot recover — they edit existing files, they never
    // synthesise an absent module, so the build hard-fails after its retries.
    // Detect dangling RELATIVE imports here, pre-compile, and issue ONE targeted
    // coder call that CREATES the missing modules with exactly the symbols their
    // importers reference. Real modules, no placeholders. (Relative imports are
    // always generated-to-generated, so this is false-positive-free.)
    {
      const danglers = collectDanglingRelativeImports(filteredFiles);
      if (danglers.size > 0) {
        const specs = Array.from(danglers.entries()).map(([base, need]) => {
          const def = Array.from(need.defaultImports);
          const named = Array.from(need.namedImports);
          const provides = [
            ...(def.length ? [`default export (${def.join(' / ')})`] : []),
            ...(named.length ? [`named exports: ${named.join(', ')}`] : []),
          ].join('; ') || 'the symbols its importers reference';
          return {
            file:      `${base}.ts`,
            importers: Array.from(need.importers),
            provides,
          };
        });
        log(
          `[apply] dangling local imports — synthesising ${specs.length} missing module(s): ` +
            specs.map(s => s.file).join(', '),
          'warn',
        );
        const healSystem =
          `Same task as before (product: ${plan.appName}). Some generated files import local ` +
          `modules that were never created, so the build cannot resolve them.\n\n` +
          `Create ONLY the missing modules listed below. Emit each as a COMPLETE, real module — ` +
          `actual TypeScript types/interfaces/constants/functions matching how the importers use ` +
          `them and the product domain. No placeholders, no TODOs, no empty stubs. Do not re-emit ` +
          `or modify any other file.\n\n` +
          `Output format — wrap EACH new file exactly as:\n` +
          `<<<FILE: path/from/src>>>\n...file content...\n<<<END>>>\n\n` +
          `MISSING MODULES:\n` +
          specs.map(s =>
            `- Create ${s.file}\n` +
            `    imported by: ${s.importers.join(', ')}\n` +
            `    must provide: ${s.provides}`,
          ).join('\n');
        try {
          let healBody = '';
          await streamCall({
            slot:           'build',
            system:         healSystem,
            user:           'Create the listed missing modules with real, complete content.',
            maxTokens:      STEP_BUDGET.applyModuleHeal.maxTokens,
            timeoutMs:      STEP_BUDGET.applyModuleHeal.timeoutMs,
            signal:         config.signal,
            routeOverrides: config.routeOverrides,
            stream:         true,
            timeoutAsError: true,
            onChunk:        (delta) => { healBody += delta; },
            onUsage:        (usage) => { coderUsage = mergeLlmUsage(coderUsage, usage); },
          });
          const createdRaw = parseFileMarkers(healBody);
          const createdScope = filterProductDeltaFiles(config.skeletonId, createdRaw);
          const created = createdScope.files;
          if (createdScope.rejected.length > 0) {
            log(`[apply] rejected ${createdScope.rejected.length} synthesized module(s) outside product slots: ${createdScope.rejected.join(', ')}`, 'warn');
          }
          let added = 0;
          for (const [createdPath, createdContent] of Object.entries(created)) {
            const norm = createdPath.replace(/^\.?\//, '');
            const already = Object.keys(filteredFiles).some(p => p.replace(/^\.?\//, '') === norm);
            if (!already) { filteredFiles[createdPath] = createdContent; added++; }
          }
          log(
            `[apply] synthesised ${added} missing local module(s) for dangling imports`,
            added > 0 ? 'info' : 'warn',
          );
        } catch (err) {
          log(`[apply] dangling-import heal failed: ${(err as Error).message.slice(0, 140)}`, 'warn');
        }
      }
    }

    // ── Export integrity check — targeted retry at source, BEFORE repair ────
    // Verify that every required export listed in the manifest is present in the
    // coder output.  If any are missing, issue ONE targeted retry asking the coder
    // to re-emit only the offending files with the missing exports added.
    const exportViolations = checkExportIntegrity(config.skeletonId, filteredFiles);
    if (exportViolations.length > 0) {
      const byFile = new Map<string, typeof exportViolations>();
      for (const v of exportViolations) {
        if (!byFile.has(v.file)) byFile.set(v.file, []);
        byFile.get(v.file)!.push(v);
      }
      const instructions = Array.from(byFile.entries()).map(([file, vs]) => {
        const exports = vs.map(v => (v.type ? `${v.name}: ${v.type}` : v.name)).join(', ');
        return `${file} is missing required export(s) ${vs.map(v => v.name).join(', ')} — re-emit it exporting ${exports}`;
      });
      log(
        `[apply] export-integrity violations (${exportViolations.length}): ${instructions.join(' | ')}`,
        'warn',
      );
      const retryFiles = Array.from(byFile.keys());
      const retrySystem =
        `Same task as before. Some files are missing required exports that locked skeleton files import.\n` +
        `Re-emit ONLY the files listed below with ALL existing content preserved AND the missing exports added.\n\n` +
        `EXPORT VIOLATIONS:\n${instructions.map(i => `- ${i}`).join('\n')}\n\n` +
        `FILES TO RE-EMIT:\n${retryFiles.map(f => `  - ${f}`).join('\n')}`;
      try {
        let retryBody = '';
        await streamCall({
          slot:          'build',
          system:        retrySystem,
          user:          'Re-emit the listed files with all required exports present.',
          maxTokens:     STEP_BUDGET.applyExportRetry.maxTokens,
          timeoutMs:     STEP_BUDGET.applyExportRetry.timeoutMs,
          signal:        config.signal,
          routeOverrides: config.routeOverrides,
          stream:        true,
          timeoutAsError: true,
          onChunk:       (delta) => { retryBody += delta; },
          onUsage:       (usage) => { coderUsage = mergeLlmUsage(coderUsage, usage); },
        });
        const retryParsed = parseFileMarkers(retryBody);
        for (const [retryPath, retryContent] of Object.entries(retryParsed)) {
          if (retryPath in filteredFiles) {
            filteredFiles[retryPath] = retryContent;
            log(`[apply] export-integrity retry: updated ${retryPath}`, 'info');
          }
        }
      } catch (err) {
        if (isAbort(err)) throw err;
        log(`[apply] export-integrity retry failed: ${(err as Error).message}`, 'warn');
      }

      // ── Deterministic export safety-net — guarantee carcass contracts resolve ──
      // The LLM retry above is best-effort; if a required export is STILL missing,
      // a skeleton-locked import would break at compile (missing_named_export) and
      // hard-fail the build — exactly the "system can't glue the preview into a
      // working app" failure. Back-fill a typed stub so the contract always resolves
      // and the prototype builds (ship-and-iterate). Never throws, never an LLM call.
      const stillMissing = checkExportIntegrity(config.skeletonId, filteredFiles);
      if (stillMissing.length > 0) {
        const stubsByFile = new Map<string, string[]>();
        for (const v of stillMissing) {
          if (!stubsByFile.has(v.file)) stubsByFile.set(v.file, []);
          stubsByFile.get(v.file)!.push(buildRequiredExportStub(v.file, v));
        }
        for (const [file, stubs] of stubsByFile) {
          filteredFiles[file] =
            `${filteredFiles[file].trimEnd()}\n\n` +
            `// ── Auto-stubbed required exports (skeleton contract safety-net) ──\n` +
            `${stubs.join('\n')}\n`;
        }
        log(
          `[apply] export safety-net: back-filled ${stillMissing.length} still-missing required export(s) ` +
            `(${stillMissing.map(v => `${v.file}:${v.name}`).join(', ')})`,
          'warn',
        );
      }
    }

    // ── Pass 2: CompletenessGate → strict Gap[] critic → implementer loop ──────
    // WI-4: CompletenessGate runs first to establish coverage_before.
    // If gate fails, up to PASS2_MAX_ITERATIONS of (critic → implementer → re-gate).
    // Outcome 'done' + factoryGatePassed=true requires coverageRatioMust >= 0.8.
    // Outcome 'partial' + factoryGatePassed=false: pipeline continues, not a gate pass.
    // Pass 2 unavailable (fix slot unset): structured telemetry, no crash.
    const pass2FeatureChecklist = productDocumentSet.productDocs.featureChecklist ?? [];
    const pass2SkeletonFiles = getSkeletonInstalledFiles(config.skeletonId);
    let completenessGate = evaluateCompletenessGate({
      featureChecklist: pass2FeatureChecklist,
      prebuiltPlan: config.prebuiltPlan,
      generatedFiles: filterCompletenessFiles(filteredFiles),
      skeletonFiles: pass2SkeletonFiles,
    });
    const coverageBefore = completenessGate.coverage.coverageRatioMust;

    const pass2Telemetry: Pass2Telemetry = {
      pass2_ran: false,
      pass2_available: false,
      pass2_iterations: 0,
      critic_gap_count: 0,
      critic_schema: 'Gap[]',
      critic_parse_status: 'unavailable',
      implementer_touched_files: [],
      implementer_rejected_files: [],
      coverage_before: coverageBefore,
      coverage_after: coverageBefore,
      pass2_build_ok: false,
      outcome: 'pass2_unavailable',
      factoryGatePassed: false,
    };

    // ── WI-8: Vision health — thread screenshot status into Pass 2 telemetry ──
    // When no screenshot is provided, the critic is vision-blind (code-only analysis).
    // Hard rule: visualGateStatus cannot be 'pass' when critic_vision_blind is true.
    {
      const ssStatus: ScreenshotStatus = config.screenshotStatus ?? {
        attempted: false,
        succeeded: false,
        source: 'none',
        unavailableReason: 'screenshot_not_provided: no screenshot available at Pass 2 time',
      };
      const visionBlind = !ssStatus.succeeded;
      pass2Telemetry.screenshotAttempted = ssStatus.attempted;
      pass2Telemetry.screenshotSucceeded = ssStatus.succeeded;
      pass2Telemetry.screenshotSource = ssStatus.source;
      pass2Telemetry.screenshotDataPresent = Boolean(ssStatus.dataUrl);
      pass2Telemetry.screenshotUnavailableReason = ssStatus.unavailableReason;
      pass2Telemetry.critic_vision_blind = visionBlind;
      pass2Telemetry.visionUnavailableReason = visionBlind
        ? (ssStatus.unavailableReason ?? 'screenshot_not_available')
        : undefined;
      // Screenshot captured but no vision model check in this pipeline → 'partial'
      // No screenshot → gate cannot pass → 'skipped'
      pass2Telemetry.visualGateStatus = ssStatus.succeeded ? 'partial' : 'skipped';
      pass2Telemetry.codeOnlyVisualPassBlocked = visionBlind;
      pass2Telemetry.screenshotEmptyBlocked =
        ssStatus.attempted &&
        !ssStatus.succeeded &&
        Boolean(
          ssStatus.unavailableReason?.startsWith('empty_canvas') ||
            ssStatus.unavailableReason?.startsWith('empty_dataUrl'),
        );
      log(
        `[pass2] vision: critic_vision_blind=${visionBlind}, visualGateStatus=${pass2Telemetry.visualGateStatus}` +
          (visionBlind ? ` (${ssStatus.unavailableReason})` : ''),
        visionBlind ? 'warn' : 'info',
      );
    }

    if (completenessGate.ok) {
      pass2Telemetry.outcome = 'done';
      pass2Telemetry.factoryGatePassed = true;
      pass2Telemetry.pass2_build_ok = true;
      log(`[completeness] gate passed (${(coverageBefore * 100).toFixed(0)}%) — no Pass 2 needed`);
    } else {
      pass2Telemetry.pass2_ran = true;
      log(
        `[completeness] gate failed (${(coverageBefore * 100).toFixed(0)}%) — entering Pass 2 loop (max ${PASS2_MAX_ITERATIONS} iter)`,
        'warn',
      );

      const fixRoute = resolveRouteOrSkip('fix', config.routeOverrides);
      const buildRoute = resolveRouteOrSkip('build', config.routeOverrides);
      pass2Telemetry.pass2_available = Boolean(fixRoute || buildRoute);

      if (!pass2Telemetry.pass2_available) {
        pass2Telemetry.pass2_unavailable_reason = 'route_unresolved';
        pass2Telemetry.outcome = 'route_unresolved';
        log('[pass2] fix/build routes not configured — pass2_unavailable; structured telemetry only', 'warn');
      } else {
        let lastCoverage = coverageBefore;
        const allTouchedFiles: string[] = [];
        const allRejectedFiles: string[] = [];

        for (let pass2Iter = 0; pass2Iter < PASS2_MAX_ITERATIONS; pass2Iter++) {
          pass2Telemetry.pass2_iterations += 1;
          try {
            const criticResult = await runPass2Critic({
              featureChecklist: pass2FeatureChecklist,
              uncoveredMust: completenessGate.coverage.uncoveredMust,
              currentFiles: filterCompletenessFiles(filteredFiles),
              signal: config.signal,
              routeOverrides: config.routeOverrides,
              onLog: log,
            });

            pass2Telemetry.critic_gap_count = criticResult.gaps.length;
            pass2Telemetry.critic_parse_status = criticResult.parseStatus;
            if (!criticResult.available && criticResult.unavailableReason) {
              pass2Telemetry.pass2_unavailable_reason = criticResult.unavailableReason;
            }

            if (criticResult.gaps.length === 0) {
              log('[pass2] no gaps identified — stopping loop early', 'info');
              break;
            }

            const allowedTargetFiles = new Set<string>(
              pass2FeatureChecklist.flatMap(item =>
                item.targetFiles.map(f => normalizeOutputPath(f)),
              ),
            );

            const implResult = await runPass2Implementer({
              gaps: criticResult.gaps,
              currentFiles: filteredFiles,
              allowedTargetFiles,
              skeletonId: config.skeletonId,
              prompt: clarifiedPrompt,
              productAppName: plan.appName,
              productSummary: plan.summary,
              signal: config.signal,
              routeOverrides: config.routeOverrides,
              onLog: log,
            });

            filteredFiles = implResult.mergedFiles;
            for (const f of implResult.touchedFiles) {
              if (!allTouchedFiles.includes(f)) allTouchedFiles.push(f);
            }
            for (const f of implResult.rejectedFiles) {
              if (!allRejectedFiles.includes(f)) allRejectedFiles.push(f);
            }

            completenessGate = evaluateCompletenessGate({
              featureChecklist: pass2FeatureChecklist,
              prebuiltPlan: config.prebuiltPlan,
              generatedFiles: filterCompletenessFiles(filteredFiles),
              skeletonFiles: pass2SkeletonFiles,
            });

            const newCoverage = completenessGate.coverage.coverageRatioMust;
            pass2Telemetry.coverage_after = newCoverage;

            log(
              `[pass2] iter ${pass2Iter + 1}: coverage ${(lastCoverage * 100).toFixed(0)}% → ${(newCoverage * 100).toFixed(0)}%`,
              newCoverage > lastCoverage ? 'info' : 'warn',
            );

            if (completenessGate.ok) {
              pass2Telemetry.outcome = 'done';
              pass2Telemetry.factoryGatePassed = true;
              pass2Telemetry.pass2_build_ok = true;
              log('[pass2] coverage reached threshold — outcome: done, factoryGatePassed: true');
              break;
            }

            if (newCoverage <= lastCoverage) {
              log('[pass2] no coverage improvement — stopping early', 'warn');
              break;
            }

            lastCoverage = newCoverage;
          } catch (err) {
            if (isAbort(err)) return fail('apply', 'aborted');
            log(`[pass2] iter ${pass2Iter + 1} error: ${(err as Error).message}`, 'warn');
            break;
          }
        }

        pass2Telemetry.implementer_touched_files = allTouchedFiles;
        pass2Telemetry.implementer_rejected_files = allRejectedFiles;

        if (!pass2Telemetry.factoryGatePassed) {
          // partial outcome — pipeline continues, NOT a gate pass
          pass2Telemetry.outcome = 'partial';
          log(
            `[pass2] outcome: partial (coverage ${(pass2Telemetry.coverage_after * 100).toFixed(0)}% < 80%) — factoryGatePassed: false`,
            'warn',
          );
        }
      }
    }

    if (completenessGate.coverage.mustTotal > 0) {
      log(
        `[completeness] must-coverage ${completenessGate.coverage.mustCovered}/${completenessGate.coverage.mustTotal}` +
        ` (${(completenessGate.coverage.coverageRatioMust * 100).toFixed(0)}%)` +
        (completenessGate.coverage.uncoveredMust.length > 0
          ? ` uncovered: ${completenessGate.coverage.uncoveredMust.join(', ')}`
          : ''),
        completenessGate.ok ? 'info' : 'warn',
      );
    }

    {
      const identitySubstitution = substituteDeterministicProductIdentityPlaceholders({
        files: filteredFiles,
        skeletonId: config.skeletonId,
        appName: plan.appName,
        fallbackPrompt: config.prompt,
      });
      filteredFiles = identitySubstitution.files;
      if (identitySubstitution.rewrites.length > 0) {
        log(
          `[apply] substituted ${identitySubstitution.rewrites.length} deterministic product-identity placeholder(s): ` +
            identitySubstitution.rewrites
              .slice(0, 4)
              .map(rewrite => `${rewrite.path} (${rewrite.detail})`)
              .join(', '),
          'warn',
        );
      }
    }

    // Validate the design contract on the publishable graph only. Protected
    // skeleton shell files are dropped above, so shell edits the coder tried to
    // make must not poison the product-slot quality gate or trigger futile
    // repairs against files that will never ship.
    const verdict = validateDesignContract(filteredFiles, designCtx);
    designContractOk      = verdict.ok;   // pre-repair: coder first-pass quality signal
    designContractFinalOk = verdict.ok;   // default = same; overwritten if repair runs
    if (!verdict.ok) {
      const summary = describeViolations(verdict.violations);
      log(`[design] ${verdict.violations.length} contract violation(s):\n${summary}`, 'warn');
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
        completeness_gate: {
          mustTotal: completenessGate.coverage.mustTotal,
          mustCovered: completenessGate.coverage.mustCovered,
          shouldTotal: completenessGate.coverage.shouldTotal,
          shouldCovered: completenessGate.coverage.shouldCovered,
          coverageRatioMust: completenessGate.coverage.coverageRatioMust,
          coverageRatioAll: completenessGate.coverage.coverageRatioAll,
          uncoveredMust: completenessGate.coverage.uncoveredMust,
          uncoveredShould: completenessGate.coverage.uncoveredShould,
          completenessGateStatus: completenessGate.coverage.completenessGateStatus,
          completenessGateReason: completenessGate.coverage.completenessGateReason,
          factoryGatePassed: pass2Telemetry.factoryGatePassed,
        },
        pass2_telemetry: pass2Telemetry,
      },
      warnings: productDeltaFilter.rejected.length > 0 ? [`${productDeltaFilter.rejected.length} out-of-scope file(s) ignored`] : undefined,
    };

    if (completenessGate.coverage.coverageRatioMust < FACTORY_RELEASE_MIN_COVERAGE) {
      const coverageFailure = buildCoverageReleaseFailure(completenessGate.coverage);
      return fail('apply', coverageFailure.message, coverageFailure.reason);
    }

    // ── Prototype quality gate — hard blockers only, up to 2 repair passes ──
    // Release contract:
    //   - soft issues (premium/media unused) stay advisory-only
    //   - hard issues get up to MAX_QUALITY_REPAIR_PASSES bounded repair attempts
    //   - any residual hard issue or repair infrastructure failure => success:false
    let currentDesignViolations = verdict.ok ? [] : verdict.violations;
    let currentVisualUsageDiagnostics = visualUsageDiagnostics;
    let currentProductSpecificityDiagnostics = productSpecificityDiagnostics;
    let qualityGate = evaluatePrototypeQualityGate({
      designContractViolations: currentDesignViolations,
      visualUsageDiagnostics: currentVisualUsageDiagnostics,
      productSpecificityDiagnostics: currentProductSpecificityDiagnostics,
    });

    if (qualityGate.advisoryReasons.length > 0) {
      log(
        `[quality-gate] ${qualityGate.advisoryReasons.length} advisory issue(s): ` +
          qualityGate.advisoryReasons.join(' | '),
        'warn',
      );
    }

    while (!qualityGate.ok) {
      const attemptNumber = repairPasses + 1;
      log(
        `[quality-gate] ${qualityGate.blockingReasons.length} hard blocking issue(s); ` +
          `attempting quality repair pass ${attemptNumber}/${MAX_QUALITY_REPAIR_PASSES}`,
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
          productAppName:               plan.appName,
          productSummary:               plan.summary,
          designContractViolations:     currentDesignViolations,
          visualUsageDiagnostics:       currentVisualUsageDiagnostics,
          designCtx,
          productSpecificityDiagnostics: currentProductSpecificityDiagnostics,
          signal:                       config.signal,
          routeOverrides:               config.routeOverrides,
          onLog:                        log,
        });
      } catch (err) {
        if (isAbort(err)) return fail('apply', 'aborted');
        const repairErrMsg = (err as Error).message;
        designContractFinalOk = false;
        log(`[quality-gate] repair attempt failed: ${repairErrMsg}`, 'warn');
        metricsService.recordError('orchestrator', `quality-repair infra failure: ${repairErrMsg}`, {
          step: 'quality_repair',
          blockingCount: qualityGate.blockingReasons.length,
        });
        const repairFailure = buildHardQualityRepairFailure(repairErrMsg);
        return fail('apply', repairFailure.message, repairFailure.reason);
      }

      {
        const aliasHeal = rewriteDanglingSingleSegmentAliasImportsToSiblingModules(filteredFiles);
        filteredFiles = aliasHeal.files;
        if (aliasHeal.rewrites.length > 0) {
          log(
            `[quality-gate] rewired ${aliasHeal.rewrites.length} dangling root-alias import(s) after repair: ` +
              aliasHeal.rewrites
                .slice(0, 4)
                .map(rewrite => `${rewrite.file} ${rewrite.from} -> ${rewrite.to}`)
                .join(', '),
            'warn',
          );
        }
      }

      {
        const supportMaterialization = materializeCanonicalSupportModulesForImports(
          config.skeletonId,
          filteredFiles,
        );
        filteredFiles = supportMaterialization.files;
        if (supportMaterialization.materialized.length > 0) {
          log(
            `[quality-gate] materialized ${supportMaterialization.materialized.length} canonical support module(s) after repair: ` +
              supportMaterialization.materialized.join(', '),
            'warn',
          );
        }
      }

      {
        const identitySubstitution = substituteDeterministicProductIdentityPlaceholders({
          files: filteredFiles,
          skeletonId: config.skeletonId,
          appName: plan.appName,
          fallbackPrompt: config.prompt,
        });
        filteredFiles = identitySubstitution.files;
        if (identitySubstitution.rewrites.length > 0) {
          log(
            `[quality-gate] substituted ${identitySubstitution.rewrites.length} deterministic product-identity placeholder(s) after repair: ` +
              identitySubstitution.rewrites
                .slice(0, 4)
                .map(rewrite => `${rewrite.path} (${rewrite.detail})`)
                .join(', '),
            'warn',
          );
        }
      }

      repairPasses += 1;
      const repairedVerdict = validateDesignContract(filteredFiles, designCtx);
      designContractFinalOk = repairedVerdict.ok;
      currentDesignViolations = repairedVerdict.ok ? [] : repairedVerdict.violations;
      currentVisualUsageDiagnostics = buildVisualUsageDiagnostics({
        files:                  filteredFiles,
        skeletonId:             config.skeletonId,
        selectedPremiumComponentIds,
        materializedMediaFiles: mediaMaterialization.materializedFiles,
      });
      currentProductSpecificityDiagnostics = buildProductSpecificityDiagnostics({
        files: filteredFiles,
        plan:  productSpecificityPlan,
      });
      qualityGate = evaluatePrototypeQualityGate({
        designContractViolations: currentDesignViolations,
        visualUsageDiagnostics:   currentVisualUsageDiagnostics,
        productSpecificityDiagnostics: currentProductSpecificityDiagnostics,
      });

      if (qualityGate.ok) {
        if (qualityGate.advisoryReasons.length > 0) {
          log(
            `[quality-gate] repaired hard blockers; ${qualityGate.advisoryReasons.length} advisory issue(s) remain: ` +
              qualityGate.advisoryReasons.join(' | '),
            'warn',
          );
        } else {
          log('[quality-gate] quality gate passed after repair');
        }
        break;
      }

      if (repairPasses >= MAX_QUALITY_REPAIR_PASSES) {
        const releaseFailure = buildHardQualityReleaseFailure(qualityGate.blockingReasons);
        return fail('apply', releaseFailure.message, releaseFailure.reason);
      }

      log(
        `[quality-gate] ${qualityGate.blockingReasons.length} hard issue(s) remain after repair pass ` +
          `${repairPasses}/${MAX_QUALITY_REPAIR_PASSES}; retrying`,
        'warn',
      );
    }
    if (qualityGate.ok && qualityGate.advisoryReasons.length === 0) {
      log('[quality-gate] prototype quality gate: ok');
    }

    const liveContractMaterializedFiles = {
      ...visualMaterialization.files,
      ...premiumMaterialization.files,
      ...mediaMaterialization.files,
      ...uploadedAssetFusion.files,
    };
    const evaluateLiveContractState = (files: Record<string, string>) => {
      const validationInput = buildLiveContractValidationInput({
        skeletonId: config.skeletonId,
        currentFiles: files,
        materializedFiles: liveContractMaterializedFiles,
      });
      const importExportContract = validateImportExportContract(validationInput);
      const liveContract = validateLiveGenerationContract(validationInput);
      return { validationInput, importExportContract, liveContract };
    };

    let liveContractState = evaluateLiveContractState(filteredFiles);
    while (!liveContractState.liveContract.ok) {
      const remainingReleaseRepairPasses = MAX_QUALITY_REPAIR_PASSES - repairPasses;
      const blockingReasons = buildLiveContractBlockingReasons(liveContractState.liveContract.diagnostics);
      const repairInstructions = buildLiveContractRepairInstructions(liveContractState.liveContract.diagnostics);
      const additionalScopePaths = collectLiveContractRepairScopePaths(
        liveContractState.liveContract.diagnostics,
        filteredFiles,
      );

      log(
        `[live-contract] ${liveContractState.liveContract.diagnostics.length} hard issue(s) ` +
          `(import/export=${liveContractState.importExportContract.diagnostics.length}, ` +
          `remaining_release_repairs=${remainingReleaseRepairPasses}): ` +
          blockingReasons.slice(0, 4).join(' | '),
        'warn',
      );

      if (remainingReleaseRepairPasses <= 0) {
        const releaseFailure = buildLiveContractReleaseFailure(liveContractState.liveContract);
        return fail('apply', releaseFailure.message, releaseFailure.reason);
      }

      for (const instruction of repairInstructions) {
        log(`[live-contract] repair needed: ${instruction}`, 'warn');
      }

      try {
        filteredFiles = await runQualityRepair({
          prompt:                        clarifiedPrompt,
          skeletonId:                    config.skeletonId,
          currentFiles:                  filteredFiles,
          blockingReasons,
          repairInstructions,
          productAppName:                plan.appName,
          productSummary:                plan.summary,
          designContractViolations:      currentDesignViolations,
          visualUsageDiagnostics:        currentVisualUsageDiagnostics,
          designCtx,
          productSpecificityDiagnostics: currentProductSpecificityDiagnostics,
          additionalScopePaths,
          signal:                        config.signal,
          routeOverrides:                config.routeOverrides,
          onLog:                         log,
        });
      } catch (err) {
        if (isAbort(err)) return fail('apply', 'aborted');
        const repairErrMsg = (err as Error).message;
        designContractFinalOk = false;
        log(`[live-contract] repair attempt failed: ${repairErrMsg}`, 'warn');
        metricsService.recordError('orchestrator', `live-contract repair failure: ${repairErrMsg}`, {
          step: 'live_contract_repair',
          blockingCount: liveContractState.liveContract.diagnostics.length,
        });
        const repairFailure = buildLiveContractRepairFailure(repairErrMsg);
        return fail('apply', repairFailure.message, repairFailure.reason);
      }

      {
        const aliasHeal = rewriteDanglingSingleSegmentAliasImportsToSiblingModules(filteredFiles);
        filteredFiles = aliasHeal.files;
        if (aliasHeal.rewrites.length > 0) {
          log(
            `[live-contract] rewired ${aliasHeal.rewrites.length} dangling root-alias import(s) after repair: ` +
              aliasHeal.rewrites
                .slice(0, 4)
                .map(rewrite => `${rewrite.file} ${rewrite.from} -> ${rewrite.to}`)
                .join(', '),
            'warn',
          );
        }
      }

      {
        const supportMaterialization = materializeCanonicalSupportModulesForImports(
          config.skeletonId,
          filteredFiles,
        );
        filteredFiles = supportMaterialization.files;
        if (supportMaterialization.materialized.length > 0) {
          log(
            `[live-contract] materialized ${supportMaterialization.materialized.length} canonical support module(s) after repair: ` +
              supportMaterialization.materialized.join(', '),
            'warn',
          );
        }
      }

      {
        const identitySubstitution = substituteDeterministicProductIdentityPlaceholders({
          files: filteredFiles,
          skeletonId: config.skeletonId,
          appName: plan.appName,
          fallbackPrompt: config.prompt,
        });
        filteredFiles = identitySubstitution.files;
        if (identitySubstitution.rewrites.length > 0) {
          log(
            `[live-contract] substituted ${identitySubstitution.rewrites.length} deterministic product-identity placeholder(s) after repair: ` +
              identitySubstitution.rewrites
                .slice(0, 4)
                .map(rewrite => `${rewrite.path} (${rewrite.detail})`)
                .join(', '),
            'warn',
          );
        }
      }

      repairPasses += 1;
      const repairedVerdict = validateDesignContract(filteredFiles, designCtx);
      designContractFinalOk = repairedVerdict.ok;
      currentDesignViolations = repairedVerdict.ok ? [] : repairedVerdict.violations;
      currentVisualUsageDiagnostics = buildVisualUsageDiagnostics({
        files:                  filteredFiles,
        skeletonId:             config.skeletonId,
        selectedPremiumComponentIds,
        materializedMediaFiles: mediaMaterialization.materializedFiles,
      });
      currentProductSpecificityDiagnostics = buildProductSpecificityDiagnostics({
        files: filteredFiles,
        plan:  productSpecificityPlan,
      });
      liveContractState = evaluateLiveContractState(filteredFiles);
    }
    log(
      `[live-contract] final graph validated: total=${liveContractState.liveContract.candidateGraphSummary.totalFiles}, ` +
        `meaningful=${liveContractState.liveContract.candidateGraphSummary.meaningfulSourceCount}, ` +
        `generated_delta=${liveContractState.liveContract.candidateGraphSummary.generatedDeltaCount}`,
    );
    stepResults.apply = {
      ...stepResults.apply,
      output: {
        ...(stepResults.apply.output ?? {}),
        file_count: Object.keys(filteredFiles).length,
        total_bytes: totalFileBytes(filteredFiles),
        files: Object.keys(filteredFiles),
      },
      warnings: productDeltaFilter.rejected.length > 0 ? [`${productDeltaFilter.rejected.length} out-of-scope file(s) ignored`] : undefined,
    };
    emit('apply', 'done', `${Object.keys(filteredFiles).length} файлов`, stepResults.apply);

    // ── Step 7 — Build (with at most 2 compile repair passes) ─────────────
    emit('build', 'active');
    let lastBuildErr: string | null = null;
    let currentFiles = filteredFiles;
    // The product document package is the deliverable spec and MUST persist with
    // the project even if the app build itself fails — that is exactly the "take
    // it elsewhere if the studio did not manage" case. Merge it here as the final,
    // unconditional mutation: it survives every prior reassignment (Pass2, quality
    // repair) and lands in whatever file set the build/persist uses, whether the
    // compile succeeds or fails. (docs/architect/* is non-compiled spec content.)
    Object.assign(currentFiles, productDocumentSet.files);
    let buildOk = false;
    buildCompileAttempted = true;
    for (let attempt = 0; attempt <= MAX_REPAIR_PASSES; attempt++) {
      try {
        compileCount += 1;
        const buildTiming = await compile(
          config.buildId,
          currentFiles,
          config.skeletonId,
          config.signal,
          attempt === 0 ? 'final' : 'repair',
          attempt === 0 ? 'run:final-build' : 'run:repair-build',
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
          repairPasses += 1;
          currentFiles = { ...currentFiles, ...repaired };
        } catch (repairErr) {
          if (isAbort(repairErr)) return fail('build', 'aborted');
          const repairErrMsg = (repairErr as Error).message;
          log(`[repair] LLM call failed: ${repairErrMsg}`, 'warn');
          metricsService.recordError('orchestrator', `build-repair LLM failure: ${repairErrMsg}`, {
            step: 'build_repair',
            attempt: attempt + 1,
          });
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
      productDocs: {
        built: productDocumentSet.telemetry.built,
        saved: productDocumentSet.telemetry.saved,
        id: productDocumentSet.productDocs.id,
        status: productDocumentSet.productDocs.status,
        generationPath: productDocumentSet.productDocs.generationPath,
        persistenceTarget: productDocumentSet.telemetry.persistenceTarget,
        featureChecklistItemCount: productDocumentSet.telemetry.featureChecklistItemCount,
        featureChecklistMustCount: productDocumentSet.telemetry.featureChecklistMustCount,
        markdownBundleFiles: productDocumentSet.telemetry.markdownBundleFiles,
      },
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
      outcomeData: {
        repairPasses,
        designContractOk,
        designContractFinalOk,
        compiled: true,
      },
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
      await compile(
        config.buildId,
        merged,
        config.skeletonId,
        config.signal,
        'repair',
        'repair:merged',
      );
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
  attachmentPromptBlock?: string;
}): Promise<ArchitectPlan> {
  const skeleton = SKELETON_REGISTRY[input.skeletonId];
  const architectRoute = resolveRouteOrSkip('primary', input.routeOverrides);
  const architectProvider = architectRoute?.provider ?? 'unknown';
  const architectModel = architectRoute
    ? Orchestrator.normalizeModelId(architectRoute.modelId, architectRoute.endpoint)
    : 'unknown';
  const installedFiles = getSkeletonInstalledFiles(input.skeletonId);
  const productDeltaScope = getProductDeltaScope(input.skeletonId);
  const editableFiles = productDeltaScope.allowed.map(path => `src/${path}`);
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

PRODUCT SLOT WRITE SCOPE (the ONLY paths fileTree may contain):
${editableExistingLines || '- (none)'}

SKELETON SNAPSHOT (already on disk; use this to avoid duplicates):
${installedList}
${input.designCtx ? archetypeContextForArchitect(input.designCtx) : ''}
${input.attachmentPromptBlock ? `\n${input.attachmentPromptBlock}\n` : ''}
${architectureQualityRules}
YOUR TASK: Return fileTree using ONLY the concrete PRODUCT SLOT WRITE SCOPE above.
The skeleton is already installed. Every required product slot must be filled; optional slots may be included when needed.
Do not invent new pages, hooks, components, services, assets, styles, or helper modules outside those slots. Reuse skeleton-provided modules and keep product-local helper logic inside an allowed slot.
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
    "src/pages/Home.tsx": "Required product slot: main screen, what it shows and which state/data it uses",
    "src/data/seed.ts": "Required product slot: realistic domain seed data used by the product screens"
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
- fileTree keys may be returned as "src/..." paths, but EVERY key must be one of the PRODUCT SLOT WRITE SCOPE paths above.
- NEVER include App.tsx, main.tsx, AppContext, theme.ts, UI primitives, or any file listed under PROTECTED / PROVIDED FILES.
- NEVER invent a new source file outside the declared product slots, even for helpers/hooks/components/services.
- Include every required product slot; use optional product slots only when needed.
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
  const editableSlotPaths = editableFiles.map(path => normaliseDeltaPath(path));
  const fileTreeRaw = obj.fileTree && typeof obj.fileTree === 'object' && !Array.isArray(obj.fileTree)
    ? obj.fileTree as Record<string, unknown>
    : {};
  const architectFileTreePathRewrites: string[] = [];
  const normalizedFileTree = Object.fromEntries(
    Object.entries(fileTreeRaw)
      .map(([path, purpose]) => {
        const rawNormalizedPath = normalizeArchitectTreeKey(path);
        const normalizedPath = canonicalizeBareDeltaPathToKnownPath(rawNormalizedPath, editableSlotPaths);
        const normalizedPurpose = typeof purpose === 'string' ? purpose.trim() : '';
        if (!normalizedPath || !normalizedPurpose) return null;
        if (normalizedPath !== rawNormalizedPath) {
          architectFileTreePathRewrites.push(`${rawNormalizedPath} -> ${normalizedPath}`);
        }
        return [normalizedPath, normalizedPurpose] as const;
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  );
  const legacyDeltaRaw = Array.isArray(obj.deltaFiles) ? obj.deltaFiles : [];
  const legacyDeltaFiles = legacyDeltaRaw
    .map((d) => {
      if (!d || typeof d !== 'object') return null;
      const dx = d as Record<string, unknown>;
      const rawPath = typeof dx.path === 'string' ? normaliseDeltaPath(dx.path) : '';
      const path = canonicalizeBareDeltaPathToKnownPath(rawPath, editableSlotPaths);
      if (!path) return null;
      const purpose = typeof dx.purpose === 'string' ? dx.purpose.trim() : '';
      return purpose ? { path, purpose } : null;
    })
    .filter((d): d is { path: string; purpose: string } => d !== null);
  const fileTree = Object.keys(normalizedFileTree).length > 0
    ? normalizedFileTree
    : Object.fromEntries(legacyDeltaFiles.map(file => [file.path, file.purpose]));

  const pagesRaw = Array.isArray(obj.pages) ? obj.pages : [];
  const architectPageFileRewrites: string[] = [];
  const pages = pagesRaw
    .map((p) => {
      if (!p || typeof p !== 'object') return null;
      const px = p as Record<string, unknown>;
      const path = typeof px.path === 'string' ? px.path : '';
      const name = typeof px.name === 'string' ? px.name : '';
      const rawFile = typeof px.file === 'string' ? normaliseDeltaPath(px.file) : '';
      const file = canonicalizeBareDeltaPathToKnownPath(rawFile, editableSlotPaths);
      const purpose = typeof px.purpose === 'string' ? px.purpose : '';
      if (file && rawFile && file !== rawFile) {
        architectPageFileRewrites.push(`${rawFile} -> ${file}`);
      }
      return path && name && file ? { path, name, file, purpose } : null;
    })
    .filter((p): p is { path: string; name: string; file: string; purpose: string } => p !== null);
  const architectPathRewrites = uniqueStrings([
    ...architectFileTreePathRewrites,
    ...architectPageFileRewrites,
  ]);
  if (architectPathRewrites.length > 0) {
    input.onLog(
      `[architect] canonicalized ${architectPathRewrites.length} bare editable-slot path alias(es): ` +
        architectPathRewrites.slice(0, 6).join(', '),
      'warn',
    );
  }
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
  const plannedSpecs = Object.entries(planner.fileTree)
    .map(([path, purpose]) => ({ path, purpose }));
  const plannedPathSet = new Set(plannedSpecs.map(file => normalizeProductDeltaPath(file.path)));
  const requiredFallbackSpecs = productDeltaScope.required
    .filter(path => !plannedPathSet.has(path))
    .map(path => ({ path, purpose: 'Required product slot from the compiled skeleton contract' }));
  const scopedPlan = filterProductDeltaSpecs(
    input.skeletonId,
    [...plannedSpecs, ...requiredFallbackSpecs],
  );
  if (scopedPlan.rejected.length > 0) {
    input.onLog(
      `[architect] rejected ${scopedPlan.rejected.length} out-of-scope planned file(s): ${scopedPlan.rejected.join(', ')}`,
      'warn',
    );
  }
  const scopedFileTree = Object.fromEntries(scopedPlan.specs.map(file => [file.path, file.purpose]));
  const allowedPageFiles = new Set(productDeltaScope.allowed);
  const scopedPages = (planner.pages ?? []).filter(page =>
    allowedPageFiles.has(normalizeProductDeltaPath(page.file)),
  );
  const deltaFiles = scopedPlan.specs;

  if (deltaFiles.length === 0) {
    const schemaError = 'plan contains no product-slot delta files after compiled-contract filtering';
    input.onLog(`[architect] schema_error=${schemaError}`, 'warn');
    throw new Error(`Architect JSON parsed but schema validation failed: ${schemaError}. Raw snippet: ${extracted.rawSnippet}`);
  }

  return {
    appName:  typeof obj.appName === 'string' ? obj.appName : 'App',
    skeleton: typeof obj.skeleton === 'string' ? obj.skeleton as SkeletonId : input.skeletonId,
    summary:  typeof obj.summary === 'string' ? obj.summary : '',
    rawResponse: raw,
    fileTree: scopedFileTree,
    deltaFiles,
    pages: scopedPages,
    notes: planner.notes,
    contextContract: planner.contextContract,
    dataModel: planner.dataModel,
  };
}

// ── Step 4 — Coder ───────────────────────────────────────────────────────────

const COMPACT_PLAN_SCREEN_LIMIT = 4;
const COMPACT_PLAN_ZONE_LIMIT = 4;
const COMPACT_PLAN_ENTITY_LIMIT = 3;
const COMPACT_PLAN_FIELD_LIMIT = 4;
const COMPACT_PLAN_FLOW_LIMIT = 5;
const COMPACT_PLAN_RULE_LIMIT = 6;
const COMPACT_PLAN_NOTE_LIMIT = 5;
const COMPACT_RELEVANT_SCREEN_LIMIT = 3;
const PROMPT_RELEVANCE_STOPWORDS = new Set([
  'app', 'screen', 'screens', 'page', 'pages', 'component', 'components', 'view',
  'module', 'widget', 'panel', 'section', 'tab', 'tabs', 'data', 'file', 'files',
  'tsx', 'ts', 'ui', 'main', 'core',
]);

function summarizePromptList(
  values: readonly string[],
  limit = COMPACT_PLAN_RULE_LIMIT,
  empty = '(none)',
): string {
  if (values.length === 0) return empty;
  const head = values.slice(0, limit).join(', ');
  return values.length > limit
    ? `${head}, +${values.length - limit} more`
    : head;
}

function pushCompactBulletSection(
  lines: string[],
  header: string,
  values: readonly string[],
  limit = COMPACT_PLAN_RULE_LIMIT,
): void {
  lines.push(`${header}:`);
  for (const value of values.slice(0, limit)) {
    lines.push(`  - ${value}`);
  }
  if (values.length > limit) {
    lines.push(`  - … ${values.length - limit} more`);
  }
  lines.push('');
}

function tokenizePromptRelevance(value: string | undefined | null): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map(token => token.trim())
    .filter(token => token.length >= 3 && !PROMPT_RELEVANCE_STOPWORDS.has(token));
}

function tokenizeTargetFileForPromptRelevance(target: DeltaFileSpec): string[] {
  return [
    ...tokenizePromptRelevance(target.path.replace(/\.[a-z0-9]+$/i, '')),
    ...tokenizePromptRelevance(target.purpose),
  ];
}

function hasPromptTokenOverlap(source: readonly string[], target: ReadonlySet<string>): boolean {
  return source.some(token => target.has(token));
}

function scoreScreenForPromptRelevance(
  screen: ScreenCompositionPlan['screens'][number],
  targetTokens: ReadonlySet<string>,
): number {
  if (targetTokens.size === 0) return 0;
  let score = 0;
  const addWeight = (value: string | undefined, weight: number): void => {
    if (hasPromptTokenOverlap(tokenizePromptRelevance(value), targetTokens)) {
      score += weight;
    }
  };

  addWeight(screen.id, 6);
  addWeight(screen.title, 5);
  addWeight(screen.routeHint, 5);
  addWeight(screen.role, 3);
  addWeight(screen.layoutIntent, 3);

  for (const value of screen.requiredInteractions.slice(0, 4)) addWeight(value, 2);
  for (const value of screen.stateRequirements.slice(0, 4)) addWeight(value, 2);
  for (const value of screen.contentRequirements.slice(0, 4)) addWeight(value, 2);
  for (const zone of screen.zones.slice(0, COMPACT_PLAN_ZONE_LIMIT)) {
    addWeight(zone.id, 2);
    addWeight(zone.intent, 2);
    for (const value of zone.interactions.slice(0, 3)) addWeight(value, 1);
    for (const value of zone.contentRules.slice(0, 3)) addWeight(value, 1);
  }

  return score;
}

function selectRelevantScreenIdsForPromptContext(
  plan: ScreenCompositionPlan,
  targetFiles: readonly DeltaFileSpec[] | undefined,
): readonly string[] {
  if (!targetFiles || targetFiles.length === 0) {
    return plan.screens.slice(0, COMPACT_RELEVANT_SCREEN_LIMIT).map(screen => screen.id);
  }

  const targetTokens = new Set(
    targetFiles.flatMap(file => tokenizeTargetFileForPromptRelevance(file)),
  );

  const rankedScreens = plan.screens
    .map(screen => ({
      id: screen.id,
      score: scoreScreenForPromptRelevance(screen, targetTokens),
      priorityBoost:
        screen.id === plan.firstScreenId
          ? 100
          : screen.priority === 'primary'
            ? 5
            : screen.priority === 'secondary'
              ? 2
              : 0,
    }))
    .sort((a, b) => (b.score + b.priorityBoost) - (a.score + a.priorityBoost));

  const selected = new Set<string>([plan.firstScreenId]);
  for (const ranked of rankedScreens) {
    if (selected.size >= COMPACT_RELEVANT_SCREEN_LIMIT) break;
    if (ranked.score <= 0 && selected.size > 0) continue;
    selected.add(ranked.id);
  }
  for (const ranked of rankedScreens) {
    if (selected.size >= COMPACT_RELEVANT_SCREEN_LIMIT) break;
    selected.add(ranked.id);
  }

  return plan.screens
    .filter(screen => selected.has(screen.id))
    .map(screen => screen.id);
}

function filterScreensForPromptContext(
  plan: ScreenCompositionPlan,
  relevantScreenIds?: readonly string[],
): ScreenCompositionPlan['screens'] {
  if (!relevantScreenIds || relevantScreenIds.length === 0) {
    return plan.screens.slice(0, COMPACT_PLAN_SCREEN_LIMIT);
  }
  const relevantSet = new Set(relevantScreenIds);
  const filtered = plan.screens.filter(screen => relevantSet.has(screen.id));
  return (filtered.length > 0 ? filtered : plan.screens).slice(0, COMPACT_RELEVANT_SCREEN_LIMIT);
}

function matchesTargetFilePath(candidatePath: string | undefined, targetFiles: readonly DeltaFileSpec[]): boolean {
  if (!candidatePath) return false;
  const normalizedCandidate = candidatePath.replace(/\\/g, '/').toLowerCase();
  const candidateBase = normalizedCandidate.split('/').pop() ?? normalizedCandidate;
  return targetFiles.some(file => {
    const normalizedTarget = file.path.replace(/\\/g, '/').toLowerCase();
    return normalizedTarget === normalizedCandidate || normalizedTarget.endsWith(`/${candidateBase}`);
  });
}

function filterFlowsForPromptContext(
  flows: readonly FunctionalFlowPlan['flows'][number][],
  relevantScreenIds?: readonly string[],
): FunctionalFlowPlan['flows'] {
  if (!relevantScreenIds || relevantScreenIds.length === 0) {
    return flows.slice(0, COMPACT_PLAN_FLOW_LIMIT);
  }
  const relevantSet = new Set(relevantScreenIds);
  const filtered = flows.filter(flow => relevantSet.has(flow.screenId));
  return (filtered.length > 0 ? filtered : flows).slice(0, COMPACT_PLAN_FLOW_LIMIT);
}

function filterNavigationRulesForPromptContext(
  rules: readonly FunctionalFlowPlan['navigationRules'][number][],
  relevantScreenIds?: readonly string[],
): FunctionalFlowPlan['navigationRules'] {
  if (!relevantScreenIds || relevantScreenIds.length === 0) return rules.slice(0, 5);
  const relevantSet = new Set(relevantScreenIds);
  const filtered = rules.filter(rule => relevantSet.has(rule.from) || relevantSet.has(rule.to));
  return (filtered.length > 0 ? filtered : rules).slice(0, 5);
}

function filterMetricsForPromptContext(
  metrics: readonly ProductSpecificityPlan['productMetrics'][number][],
  relevantScreenIds?: readonly string[],
): ProductSpecificityPlan['productMetrics'] {
  if (!relevantScreenIds || relevantScreenIds.length === 0) return metrics.slice(0, 4);
  const relevantSet = new Set(relevantScreenIds);
  const filtered = metrics.filter(metric => metric.shouldAppearOnScreens.some(screenId => relevantSet.has(screenId)));
  return (filtered.length > 0 ? filtered : metrics).slice(0, 4);
}

function filterActionsForPromptContext(
  actions: readonly ProductSpecificityPlan['productActions'][number][],
  relevantScreenIds?: readonly string[],
): ProductSpecificityPlan['productActions'] {
  if (!relevantScreenIds || relevantScreenIds.length === 0) return actions.slice(0, 4);
  const relevantSet = new Set(relevantScreenIds);
  const filtered = actions.filter(action => action.shouldAppearOnScreens.some(screenId => relevantSet.has(screenId)));
  return (filtered.length > 0 ? filtered : actions).slice(0, 4);
}

function filterScreenSpecificContentForPromptContext(
  screenContent: readonly ProductSpecificityPlan['screenSpecificContent'][number][],
  relevantScreenIds?: readonly string[],
): ProductSpecificityPlan['screenSpecificContent'] {
  if (!relevantScreenIds || relevantScreenIds.length === 0) {
    return screenContent.slice(0, COMPACT_PLAN_SCREEN_LIMIT);
  }
  const relevantSet = new Set(relevantScreenIds);
  const filtered = screenContent.filter(screen => relevantSet.has(screen.screenId));
  return (filtered.length > 0 ? filtered : screenContent).slice(0, COMPACT_RELEVANT_SCREEN_LIMIT);
}

function filterExtensionStrategyForPromptContext(
  strategies: readonly SkeletonIntegrationPlan['extensionStrategy'][number][],
  targetFiles?: readonly DeltaFileSpec[],
): SkeletonIntegrationPlan['extensionStrategy'] {
  if (!targetFiles || targetFiles.length === 0) return strategies.slice(0, 4);
  const filtered = strategies.filter(strategy =>
    strategy.targetFiles.some(path => matchesTargetFilePath(path, targetFiles)),
  );
  return (filtered.length > 0 ? filtered : strategies).slice(0, 4);
}

function filterCustomModulesForPromptContext(
  modules: readonly SkeletonIntegrationPlan['customModules'][number][],
  targetFiles?: readonly DeltaFileSpec[],
): SkeletonIntegrationPlan['customModules'] {
  if (!targetFiles || targetFiles.length === 0) return modules.slice(0, 4);
  const filtered = modules.filter(module => matchesTargetFilePath(module.recommendedPath, targetFiles));
  return (filtered.length > 0 ? filtered : modules).slice(0, 4);
}

/**
 * The deterministic planners intentionally keep rich structures for diagnostics
 * and telemetry, but the coder only needs a compact operational slice. These
 * serializers preserve the same headings/contracts while bounding payload size.
 */
function buildCompactCompositionPlanPromptBlock(
  plan: ScreenCompositionPlan,
  options: { relevantScreenIds?: readonly string[] } = {},
): string {
  const lines: string[] = [];
  const screens = filterScreensForPromptContext(plan, options.relevantScreenIds);

  lines.push('SCREEN_COMPOSITION_PLAN:');
  lines.push(`firstScreenId: ${plan.firstScreenId}`);
  if (plan.productType) lines.push(`productType: ${plan.productType}`);
  lines.push(`skeletonId: ${plan.skeletonId}`);
  if (plan.selectedRecipeId) lines.push(`selectedRecipeId: ${plan.selectedRecipeId}`);
  lines.push('');

  lines.push('SCREENS:');
  for (const screen of screens) {
    lines.push(`  - id: ${screen.id}`);
    lines.push(`    title: ${screen.title}`);
    if (screen.routeHint) lines.push(`    route: ${screen.routeHint}`);
    lines.push(`    role: ${screen.role}`);
    lines.push(`    priority: ${screen.priority}`);
    lines.push(`    layoutIntent: ${screen.layoutIntent}`);
    lines.push(`    premiumComponentTargets: ${summarizePromptList(screen.premiumComponentTargets, 3)}`);
    lines.push(`    mediaTargets: ${summarizePromptList(screen.mediaTargets, 3)}`);
    lines.push(`    requiredInteractions: ${summarizePromptList(screen.requiredInteractions, 3)}`);
    lines.push(`    stateRequirements: ${summarizePromptList(screen.stateRequirements, 3)}`);
    lines.push(`    contentRequirements: ${summarizePromptList(screen.contentRequirements, 3)}`);
    lines.push('    ZONES:');
    for (const zone of screen.zones.slice(0, COMPACT_PLAN_ZONE_LIMIT)) {
      lines.push(`      - id: ${zone.id}  role: ${zone.role}  priority: ${zone.priority}`);
      lines.push(`        intent: ${zone.intent}`);
      lines.push(`        suggestedComponents: ${summarizePromptList(zone.suggestedComponents, 3)}`);
      lines.push(`        suggestedMedia: ${summarizePromptList(zone.suggestedMedia, 3)}`);
      lines.push(`        interactions: ${summarizePromptList(zone.interactions, 3)}`);
      lines.push(`        contentRules: ${summarizePromptList(zone.contentRules, 3)}`);
    }
    if (screen.zones.length > COMPACT_PLAN_ZONE_LIMIT) {
      lines.push(`      - … ${screen.zones.length - COMPACT_PLAN_ZONE_LIMIT} more zone(s)`);
    }
    lines.push('');
  }
  if (plan.screens.length > COMPACT_PLAN_SCREEN_LIMIT) {
    lines.push(`  - … ${plan.screens.length - COMPACT_PLAN_SCREEN_LIMIT} more screen(s)`);
    lines.push('');
  }

  pushCompactBulletSection(lines, 'GLOBAL_LAYOUT_RULES', plan.globalLayoutRules, 4);
  pushCompactBulletSection(lines, 'AVOID_PATTERNS', plan.avoidPatterns, 4);
  if (plan.compositionNotes.length > 0) {
    pushCompactBulletSection(lines, 'COMPOSITION_NOTES', plan.compositionNotes, COMPACT_PLAN_NOTE_LIMIT);
  }

  const firstScreen = plan.screens.find(s => s.id === plan.firstScreenId);
  const firstScreenZoneCount = firstScreen?.zones.length ?? 0;
  lines.push('CODER_INSTRUCTIONS:');
  lines.push('- Follow this composition plan before inventing generic layouts.');
  lines.push(`- Treat the first screen (${plan.firstScreenId}) as a multi-zone product cockpit with ${firstScreenZoneCount} meaningful zones.`);
  lines.push('- Use premium components where the plan assigns them (premiumComponentTargets per screen, suggestedComponents per zone).');
  lines.push('- Use generated media assets where the plan assigns them (mediaTargets per screen, suggestedMedia per zone).');
  lines.push('- Build screens as product flows, not static mockups.');
  lines.push('- Do not collapse a complex product surface into a single generic card list.');
  lines.push('- Do not produce a generic admin dashboard or generic mobile card wall.');

  return lines.join('\n');
}

function buildCompactDesignContractForCoder(ctx: DesignContext, mediaHints?: MediaHint[]): string {
  const tokenList = [
    'bg-background', 'text-foreground',
    'bg-card text-card-foreground',
    'bg-primary text-primary-foreground',
    'bg-secondary text-secondary-foreground',
    'bg-muted text-muted-foreground',
    'bg-accent text-accent-foreground',
    'bg-destructive text-destructive-foreground',
    'border-border', 'ring-ring',
  ];
  const selection = ctx.visualSelection;
  const premium = ctx.premiumComponentSelection;
  const lines: string[] = [
    'DESIGN CONTRACT — ENFORCED BY VALIDATOR (compact operating contract)',
    '',
    `Theme: ${ctx.theme.name}  (mood=${ctx.intent.mood}, contrast=${ctx.intent.contrast}, radius=${ctx.intent.radius})`,
    `Visual variant: ${selection.selectedPackId}/${selection.selectedVariantId}`,
    `Theme file: ${selection.selectedThemeFile ?? '(none)'}`,
    `Purpose: ${selection.purpose}`,
    `Tone profile: ${selection.toneProfile}  |  trustProfile: ${selection.trustProfile}`,
    `Color family: ${selection.colorFamily}  |  spacing: ${selection.spacing}  |  typography: ${selection.typography}`,
    `Radius profile: ${selection.radiusProfile}  |  motionPreset: ${selection.motionPreset}  |  density: ${selection.densityProfile}`,
    `Fallback visual selection: ${String(selection.fallbackVisualSelection)}`,
    `Token hints: ${summarizePromptList(selection.tokenHints, 4)}`,
    `Component hints: ${summarizePromptList(selection.componentHints, 4)}`,
    `Layout hints: ${summarizePromptList(selection.layoutHints, 4)}`,
    `Required components: ${summarizePromptList(selection.requiredComponents, 4)}`,
    `Forbidden patterns: ${summarizePromptList(selection.forbiddenPatterns, 4)}`,
    `Design source files: ${summarizePromptList([
      ...selection.linkedStyleFiles,
      ...selection.linkedComponentFiles,
      ...selection.layoutPresetFiles,
      ...selection.motionPresetFiles,
      ...selection.assetReferenceFiles,
      ...selection.materialFiles,
    ], 6)}`,
    '',
    'PREMIUM_COMPONENT_SELECTION:',
    `selectedRecipeId: ${premium.selectedRecipeId ?? '(none)'}`,
    `selectedComponents: ${premium.selectedComponents.map(component => `${component.name} (${component.id})`).slice(0, 4).join(', ') || '(none)'}`,
    `usageRules: ${summarizePromptList(premium.usageRules, 4)}`,
    `forbiddenPatterns: ${summarizePromptList(premium.forbiddenPatterns, 4)}`,
  ];

  if (ctx.archetype) {
    lines.push(
      '',
      `ARCHETYPE REFERENCE — ${ctx.archetype.name} (${ctx.archetype.id})`,
      `  navigation: ${ctx.archetype.navigation}`,
      `  prebuilt components: ${summarizePromptList(ctx.archetype.includes, 6)}`,
      `  entities: ${summarizePromptList(ctx.archetype.entities, 4)}`,
    );
  }

  if (ctx.domain) {
    lines.push(
      '',
      `DOMAIN CONSTRAINTS — ${ctx.domain.name}`,
      `  restrictions: ${summarizePromptList(ctx.domain.restrictions, 4)}`,
      `  typical flows: ${summarizePromptList(ctx.domain.typicalFlows, 4)}`,
      `  ui patterns: ${summarizePromptList(ctx.domain.uiPatterns, 4)}`,
    );
  }

  if (mediaHints && mediaHints.length > 0) {
    lines.push('', 'GENERATED_MEDIA_ASSETS:');
    for (const hint of mediaHints.slice(0, 3)) {
      lines.push(
        `  - ${hint.id} (${hint.kind}) → ${hint.recommendedUse}` +
        (hint.importPath ? ` | import=${hint.importPath}` : '') +
        (hint.publicPath ? ` | public=${hint.publicPath}` : ''),
      );
    }
    if (mediaHints.length > 3) {
      lines.push(`  - … ${mediaHints.length - 3} more media hint(s)`);
    }
  }

  lines.push(
    '',
    'You may use ONLY these semantic Tailwind utilities for colour and surfaces:',
    `  ${tokenList.join('  ')}`,
    '',
    'FORBIDDEN — any of these will fail validation:',
    '  • Raw hex colours, rgb()/hsl(), or palette classes like bg-blue-500 / text-red-600 / border-gray-200',
    '  • Generic blank fallback such as className="bg-white text-black"',
    '',
    'CODER VISUAL INSTRUCTIONS:',
    '- Treat the selected visual variant as design truth; do not invent a separate visual system.',
    '- Respect spacing, typography, radius, motionPreset, color family, and layout/component hints.',
    '- Compose primarily from the shipped shadcn/radix primitives in @/components/ui.',
    '- Premium blocks are optional accelerators; use them only when they clearly fit a product slot.',
    '- Use generated media assets as real UI material when provided; do not leave media slots empty by default.',
  );

  return lines.join('\n');
}

function buildCompactFunctionalFlowPromptBlock(
  plan: FunctionalFlowPlan,
  options: { foundationOnly?: boolean; relevantScreenIds?: readonly string[] } = {},
): string {
  const foundationOnly = options.foundationOnly === true;
  const lines: string[] = [];
  const flows = foundationOnly
    ? plan.flows
    : filterFlowsForPromptContext(plan.flows, options.relevantScreenIds);
  const navigationRules = foundationOnly
    ? plan.navigationRules
    : filterNavigationRulesForPromptContext(plan.navigationRules, options.relevantScreenIds);

  lines.push('FUNCTIONAL_FLOW_PLAN:');
  lines.push(`primaryUserGoal: ${plan.primaryUserGoal}`);
  if (plan.productType) lines.push(`productType: ${plan.productType}`);
  lines.push(`skeletonId: ${plan.skeletonId}`);
  lines.push('');

  pushCompactBulletSection(lines, 'GLOBAL_STATE_REQUIREMENTS', plan.globalStateRequirements, 5);

  lines.push('DATA_ENTITIES:');
  for (const entity of plan.entities.slice(0, COMPACT_PLAN_ENTITY_LIMIT)) {
    lines.push(`  - id: ${entity.id}`);
    lines.push(`    label: ${entity.label}`);
    lines.push(`    sampleCount: ${entity.sampleCount}`);
    lines.push('    fields:');
    for (const field of entity.fields.slice(0, COMPACT_PLAN_FIELD_LIMIT)) {
      lines.push(`      - ${field.name} (${field.type}) example=${field.example}`);
    }
    if (entity.fields.length > COMPACT_PLAN_FIELD_LIMIT) {
      lines.push(`      - … ${entity.fields.length - COMPACT_PLAN_FIELD_LIMIT} more field(s)`);
    }
  }
  if (plan.entities.length > COMPACT_PLAN_ENTITY_LIMIT) {
    lines.push(`  - … ${plan.entities.length - COMPACT_PLAN_ENTITY_LIMIT} more entit${plan.entities.length - COMPACT_PLAN_ENTITY_LIMIT === 1 ? 'y' : 'ies'}`);
  }
  lines.push('');

  lines.push('FLOWS:');
  for (const flow of flows.slice(0, foundationOnly ? 3 : COMPACT_PLAN_FLOW_LIMIT)) {
    lines.push(`  - id: ${flow.id}`);
    lines.push(`    title: ${flow.title}`);
    if (!foundationOnly) lines.push(`    screenId: ${flow.screenId}`);
    lines.push(`    userIntent: ${flow.userIntent}`);
    if (!foundationOnly) lines.push(`    triggerElements: ${summarizePromptList(flow.triggerElements, 3)}`);
    lines.push(`    stateChanges: ${summarizePromptList(flow.stateChanges, 3)}`);
    lines.push(`    affectedEntities: ${summarizePromptList(flow.affectedEntities, 3)}`);
    lines.push(`    visibleFeedback: ${summarizePromptList(flow.visibleFeedback, 3)}`);
    lines.push(`    requiredImplementation: ${summarizePromptList(flow.requiredImplementation, 4)}`);
    if (!foundationOnly && flow.navigationTarget) lines.push(`    navigationTarget: ${flow.navigationTarget}`);
  }
  const shownFlowCount = foundationOnly ? 3 : COMPACT_PLAN_FLOW_LIMIT;
  if (flows.length > shownFlowCount) {
    lines.push(`  - … ${flows.length - shownFlowCount} more flow(s)`);
  }
  lines.push('');

  lines.push('NAVIGATION_RULES:');
  if (foundationOnly) {
    lines.push(`  - summary: ${summarizePromptList(plan.navigationRules.map(rule => `${rule.from} -> ${rule.to}`), 4)}`);
  } else {
    for (const rule of navigationRules.slice(0, 5)) {
      lines.push(`  - from: ${rule.from}`);
      lines.push(`    to: ${rule.to}`);
      lines.push(`    trigger: ${rule.trigger}`);
      lines.push(`    expectedBehavior: ${rule.expectedBehavior}`);
    }
    if (navigationRules.length > 5) {
      lines.push(`  - … ${navigationRules.length - 5} more navigation rule(s)`);
    }
  }
  lines.push('');

  pushCompactBulletSection(lines, 'NON_DECORATIVE_RULES', plan.nonDecorativeRules, 6);
  pushCompactBulletSection(lines, 'FUNCTIONAL_NOTES', plan.functionalNotes, COMPACT_PLAN_NOTE_LIMIT);

  lines.push('CODER_INSTRUCTIONS:');
  lines.push('- Implement this functional flow plan with local React state, derived data, and simple handlers.');
  lines.push('- Keep it lightweight and deterministic.');
  lines.push('- Do not introduce backend requirements.');
  lines.push('- Do not use external APIs.');
  lines.push('- Do not overbuild persistence.');
  lines.push('- Use mock data where needed.');
  lines.push('- Make the generated prototype feel clickable and demo-ready.');

  return lines.join('\n');
}

function buildCompactSkeletonIntegrationPromptBlock(
  plan: SkeletonIntegrationPlan,
  options: { foundationOnly?: boolean; targetFiles?: readonly DeltaFileSpec[] } = {},
): string {
  const foundationOnly = options.foundationOnly === true;
  const lines: string[] = [];
  const extensionStrategy = foundationOnly
    ? plan.extensionStrategy
    : filterExtensionStrategyForPromptContext(plan.extensionStrategy, options.targetFiles);
  const customModules = foundationOnly
    ? plan.customModules
    : filterCustomModulesForPromptContext(plan.customModules, options.targetFiles);

  lines.push('SKELETON_INTEGRATION_PLAN:');
  lines.push(`skeletonId: ${plan.skeletonId}`);
  if (plan.productType) lines.push(`productType: ${plan.productType}`);
  lines.push(`skeletonFit: ${plan.skeletonFit}`);
  lines.push(`skeletonFitReason: ${plan.skeletonFitReason}`);
  lines.push(`skeletonBypassAllowed: ${String(plan.skeletonBypassAllowed)}`);
  lines.push(`skeletonBypassRule: ${plan.skeletonBypassRule}`);
  lines.push('');

  lines.push('REUSE_STRATEGY:');
  for (const strategy of plan.reuseStrategy.slice(0, foundationOnly ? 3 : 4)) {
    lines.push(`  - area: ${strategy.area}`);
    lines.push(`    reuseMode: ${strategy.reuseMode}`);
    lines.push(`    reason: ${strategy.reason}`);
  }
  const shownReuseCount = foundationOnly ? 3 : 4;
  if (plan.reuseStrategy.length > shownReuseCount) {
    lines.push(`  - … ${plan.reuseStrategy.length - shownReuseCount} more reuse strategy item(s)`);
  }
  lines.push('');

  if (!foundationOnly) {
    lines.push('EXTENSION_STRATEGY:');
    for (const strategy of extensionStrategy.slice(0, 4)) {
      lines.push(`  - area: ${strategy.area}`);
      lines.push(`    extensionMode: ${strategy.extensionMode}`);
      lines.push(`    targetFiles: ${summarizePromptList(strategy.targetFiles, 4)}`);
      lines.push(`    reason: ${strategy.reason}`);
    }
    if (extensionStrategy.length > 4) {
      lines.push(`  - … ${extensionStrategy.length - 4} more extension strategy item(s)`);
    }
    lines.push('');

    lines.push('CUSTOM_MODULES:');
    for (const module of customModules.slice(0, 4)) {
      lines.push(`  - id: ${module.id}`);
      lines.push(`    moduleType: ${module.moduleType}`);
      lines.push(`    recommendedPath: ${module.recommendedPath}`);
      lines.push(`    purpose: ${module.purpose}`);
      lines.push(`    dependencies: ${summarizePromptList(module.dependencies, 4)}`);
    }
    if (customModules.length > 4) {
      lines.push(`  - … ${customModules.length - 4} more custom module(s)`);
    }
    lines.push('');
  }

  lines.push('FILE_OWNERSHIP_RULES:');
  for (const rule of plan.fileOwnershipRules.slice(0, foundationOnly ? 4 : 5)) {
    lines.push(`  - filePattern: ${rule.filePattern}`);
    lines.push(`    responsibility: ${rule.responsibility}`);
    lines.push(`    avoid: ${summarizePromptList(rule.avoid, 4)}`);
  }
  const shownOwnershipCount = foundationOnly ? 4 : 5;
  if (plan.fileOwnershipRules.length > shownOwnershipCount) {
    lines.push(`  - … ${plan.fileOwnershipRules.length - shownOwnershipCount} more file ownership rule(s)`);
  }
  lines.push('');

  pushCompactBulletSection(lines, 'CODE_QUALITY_RULES', plan.codeQualityRules, foundationOnly ? 4 : 6);
  pushCompactBulletSection(lines, 'FORBIDDEN_PATTERNS', plan.forbiddenPatterns, foundationOnly ? 4 : 6);
  if (plan.integrationNotes.length > 0) {
    pushCompactBulletSection(lines, 'INTEGRATION_NOTES', plan.integrationNotes, foundationOnly ? 3 : COMPACT_PLAN_NOTE_LIMIT);
  }

  lines.push('CODER_INSTRUCTIONS:');
  lines.push('- Follow the skeleton integration plan before writing code.');
  lines.push('- For app prototypes, preserve the selected skeleton as the application foundation.');
  lines.push('- Do not bypass the selected skeleton unless skeletonId is landing-page.');
  lines.push('- Extend skeleton through clean modules instead of replacing it.');
  lines.push('- Keep App.tsx small and orchestration-focused.');
  lines.push('- Keep the code export-ready and buildable.');

  return lines.join('\n');
}

function buildCompactProductSpecificityPromptBlock(
  plan: ProductSpecificityPlan,
  options: { foundationOnly?: boolean; relevantScreenIds?: readonly string[] } = {},
): string {
  const foundationOnly = options.foundationOnly === true;
  const lines: string[] = [];
  const productMetrics = foundationOnly
    ? plan.productMetrics
    : filterMetricsForPromptContext(plan.productMetrics, options.relevantScreenIds);
  const productActions = foundationOnly
    ? plan.productActions
    : filterActionsForPromptContext(plan.productActions, options.relevantScreenIds);
  const screenSpecificContent = foundationOnly
    ? plan.screenSpecificContent
    : filterScreenSpecificContentForPromptContext(plan.screenSpecificContent, options.relevantScreenIds);

  lines.push('PRODUCT_SPECIFICITY_PLAN:');
  if (plan.productType) lines.push(`productType: ${plan.productType}`);
  lines.push(`skeletonId: ${plan.skeletonId}`);
  lines.push(`inferredDomain: ${plan.inferredDomain}`);
  lines.push(`targetUserRole: ${plan.targetUserRole}`);
  lines.push(`primaryJobToBeDone: ${plan.primaryJobToBeDone}`);
  lines.push('');

  lines.push('DOMAIN_ENTITIES:');
  for (const entity of plan.domainEntities.slice(0, COMPACT_PLAN_ENTITY_LIMIT)) {
    lines.push(`  - id: ${entity.id}`);
    lines.push(`    label: ${entity.label}`);
    lines.push(`    description: ${entity.description}`);
    lines.push(`    sampleNames: ${summarizePromptList(entity.sampleNames, 3)}`);
    lines.push('    fields:');
    for (const field of entity.fields.slice(0, COMPACT_PLAN_FIELD_LIMIT)) {
      lines.push(`      - ${field.name} (${field.type}) example=${field.example}`);
    }
    if (entity.fields.length > COMPACT_PLAN_FIELD_LIMIT) {
      lines.push(`      - … ${entity.fields.length - COMPACT_PLAN_FIELD_LIMIT} more field(s)`);
    }
  }
  if (plan.domainEntities.length > COMPACT_PLAN_ENTITY_LIMIT) {
    lines.push(`  - … ${plan.domainEntities.length - COMPACT_PLAN_ENTITY_LIMIT} more domain entit${plan.domainEntities.length - COMPACT_PLAN_ENTITY_LIMIT === 1 ? 'y' : 'ies'}`);
  }
  lines.push('');

  lines.push('PRODUCT_METRICS:');
  for (const metric of productMetrics.slice(0, 4)) {
    lines.push(`  - id: ${metric.id}`);
    lines.push(`    label: ${metric.label}`);
    lines.push(`    meaning: ${metric.meaning}`);
    lines.push(`    exampleValue: ${metric.exampleValue}`);
    lines.push(`    shouldAppearOnScreens: ${summarizePromptList(metric.shouldAppearOnScreens, 3)}`);
  }
  if (productMetrics.length > 4) {
    lines.push(`  - … ${productMetrics.length - 4} more metric(s)`);
  }
  lines.push('');

  lines.push('PRODUCT_STATUSES:');
  for (const status of plan.productStatuses.slice(0, 4)) {
    lines.push(`  - id: ${status.id}`);
    lines.push(`    label: ${status.label}`);
    lines.push(`    meaning: ${status.meaning}`);
    lines.push(`    exampleUsage: ${status.exampleUsage}`);
  }
  if (plan.productStatuses.length > 4) {
    lines.push(`  - … ${plan.productStatuses.length - 4} more status item(s)`);
  }
  lines.push('');

  lines.push('PRODUCT_ACTIONS:');
  for (const action of productActions.slice(0, 4)) {
    lines.push(`  - id: ${action.id}`);
    lines.push(`    label: ${action.label}`);
    lines.push(`    userIntent: ${action.userIntent}`);
    lines.push(`    expectedVisibleResult: ${action.expectedVisibleResult}`);
    lines.push(`    shouldAppearOnScreens: ${summarizePromptList(action.shouldAppearOnScreens, 3)}`);
  }
  if (productActions.length > 4) {
    lines.push(`  - … ${productActions.length - 4} more action(s)`);
  }
  lines.push('');

  lines.push('VOCABULARY:');
  lines.push(`  preferredTerms: ${summarizePromptList(plan.vocabulary.preferredTerms, 6)}`);
  lines.push(`  avoidTerms: ${summarizePromptList(plan.vocabulary.avoidTerms, 6)}`);
  lines.push(`  toneNotes: ${summarizePromptList(plan.vocabulary.toneNotes, 4, '(none)')}`);
  lines.push('');

  lines.push('SCREEN_SPECIFIC_CONTENT:');
  if (foundationOnly) {
    lines.push(`  - summary: ${summarizePromptList(plan.screenSpecificContent.map(screen => screen.screenId), 4)}`);
  } else {
    for (const screen of screenSpecificContent.slice(0, COMPACT_RELEVANT_SCREEN_LIMIT)) {
      lines.push(`  - screenId: ${screen.screenId}`);
      lines.push(`    concreteTitleSuggestions: ${summarizePromptList(screen.concreteTitleSuggestions, 3, '(none)')}`);
      lines.push(`    requiredEntities: ${summarizePromptList(screen.requiredEntities, 3)}`);
      lines.push(`    requiredMetrics: ${summarizePromptList(screen.requiredMetrics, 3)}`);
      lines.push(`    requiredActions: ${summarizePromptList(screen.requiredActions, 3)}`);
      lines.push(`    copyHints: ${summarizePromptList(screen.copyHints, 3, '(none)')}`);
      lines.push(`    avoidOnThisScreen: ${summarizePromptList(screen.avoidOnThisScreen, 3, '(none)')}`);
    }
    if (screenSpecificContent.length > COMPACT_RELEVANT_SCREEN_LIMIT) {
      lines.push(`  - … ${screenSpecificContent.length - COMPACT_RELEVANT_SCREEN_LIMIT} more screen content hint(s)`);
    }
  }
  lines.push('');

  pushCompactBulletSection(lines, 'SAMPLE_DATA_RULES', plan.sampleDataRules, 5);
  pushCompactBulletSection(lines, 'COPYWRITING_RULES', plan.copywritingRules, foundationOnly ? 3 : 5);
  pushCompactBulletSection(lines, 'FORBIDDEN_GENERIC_PATTERNS', plan.forbiddenGenericPatterns, 6);
  if (plan.specificityNotes.length > 0) {
    pushCompactBulletSection(lines, 'SPECIFICITY_NOTES', plan.specificityNotes, foundationOnly ? 3 : COMPACT_PLAN_NOTE_LIMIT);
  }

  lines.push('CODER_INSTRUCTIONS:');
  lines.push('- Use the product specificity plan before writing screen copy and sample data.');
  lines.push('- Every major screen must include product-specific entities, actions, statuses, or metrics.');
  lines.push('- Do not use generic placeholders such as Feature 1, AppName, Product, Lorem, or Coming soon.');
  lines.push('- Do not create empty KPI cards with generic labels.');
  lines.push('- Sample data must look like it belongs to this product category.');
  lines.push(
    foundationOnly
      ? '- Preserve skeleton structure and follow FUNCTIONAL_FLOW_PLAN and SKELETON_INTEGRATION_PLAN while defining shared entities, metrics, statuses, and actions.'
      : '- Preserve skeleton structure and follow SCREEN_COMPOSITION_PLAN, FUNCTIONAL_FLOW_PLAN, and SKELETON_INTEGRATION_PLAN.',
  );

  return lines.join('\n');
}

function buildCompactMarketAwareBuilderBriefForCoder(
  brief: MarketAwareBuilderBrief,
  options: { foundationOnly?: boolean } = {},
): string {
  const foundationOnly = options.foundationOnly === true;
  const { marketInsight, productVision, builderBrief, selfTestChecklist } = brief;
  const mustItems = selfTestChecklist.filter(item => item.severity === 'must');
  const expectationLimit = foundationOnly ? 2 : 3;
  const painPointLimit = foundationOnly ? 2 : 3;
  const requiredMomentLimit = foundationOnly ? 2 : 3;
  const mustItemLimit = foundationOnly ? 3 : 4;
  const forbiddenLimit = foundationOnly ? 4 : 5;

  const lines: string[] = [
    'MARKET-AWARE BUILDER BRIEF — MANDATORY BUILDER GUIDANCE',
    `productCategory: ${marketInsight.productCategory}`,
    `productPromise: ${productVision.productPromise}`,
    `targetUser: ${productVision.targetUser}`,
    `coreUserJourney: ${productVision.coreUserJourney}`,
    '',
    `topUserExpectations: ${summarizePromptList(marketInsight.popularFeatures, expectationLimit)}`,
    `topPainPoints: ${summarizePromptList(marketInsight.userPainPoints, painPointLimit)}`,
    `requiredProductMoments: ${summarizePromptList(builderBrief.requiredScreens, requiredMomentLimit)}`,
    `visibleDifferentiator: ${builderBrief.marketAwareDifferentiator}`,
    `mustSelfTestItems: ${summarizePromptList(mustItems.map(item => `${item.id}: ${item.label}`), mustItemLimit)}`,
    `forbiddenPlaceholders: ${summarizePromptList(builderBrief.forbiddenGenericPlaceholders, forbiddenLimit)}`,
    '',
    'CODER_INSTRUCTIONS:',
    '- Implement at least one visible differentiator from this brief.',
    '- Do not emit generic placeholder text anywhere in the UI.',
    foundationOnly
      ? '- Use this brief to define shared entities, labels, statuses, and actions before screen rendering begins.'
      : '- Reflect this brief in the current screen batch, especially the first meaningful viewport and primary actions.',
  ];

  return lines.join('\n');
}

function buildCompactBuilderOwnedSelfPlanForCoder(
  brief: MarketAwareBuilderBrief,
  options: { foundationOnly?: boolean } = {},
): string {
  const foundationOnly = options.foundationOnly === true;
  const differentiatorHint = brief.builderBrief.marketAwareDifferentiator.length > 72
    ? `${brief.builderBrief.marketAwareDifferentiator.slice(0, 69)}...`
    : brief.builderBrief.marketAwareDifferentiator;
  const lines: string[] = [
    'BUILDER-OWNED PRODUCT ASSEMBLY PLAN & SELF-TEST — MANDATORY',
    'ARCHITECTURE_OWNERSHIP:',
    '  - Architect provides strategy and scaffolding only; coder owns final composition and implementation.',
    '  - Delta files are a contract, not a finished component hierarchy.',
    '',
    'WRITE_PRODUCT_ASSEMBLY_PLAN_FIRST:',
  ];

  if (foundationOnly) {
    lines.push(
      '  - Define the product promise, primary user action, and shared domain entities.',
      '  - Define product-specific statuses, metrics, labels, and mock data conventions.',
      '  - Map the differentiator to shared data/state primitives before screen files render it.',
      '  - Keep file ownership aligned with the skeleton and expected delta file list.',
    );
  } else {
    lines.push(
      '  - State product promise, first-screen role, and primary user action.',
      '  - Define 3-6 screen/section roles with purpose, action, data, and component role.',
      `  - Place the visible differentiator in a concrete UI surface: ${differentiatorHint}`,
      '  - State what is visible in the first viewport before any scroll.',
    );
  }

  lines.push(
    '',
    'IMPLEMENTATION_RULES:',
    '  - Preserve the expected file list exactly.',
    '  - Extend the selected skeleton; do not rebuild or bypass it.',
    '  - Use shipped primitives/assets when provided; do not reference missing components.',
    '  - Keep every emitted screen or shared module product-specific and navigable.',
    '',
    'SELF_TEST_BEFORE_FINAL_OUTPUT:',
    '  - Product Assembly Plan matches the emitted files.',
    '  - Imports resolve using shipped primitives or self-implemented modules only.',
    '  - Primary CTA and workflow are product-specific.',
    '  - Visible differentiator is present.',
    '  - Zero forbidden placeholder text remains.',
  );

  return lines.join('\n');
}

function buildCompactProductIdentityContractForCoder(
  options: { foundationOnly?: boolean } = {},
): string {
  const foundationOnly = options.foundationOnly === true;
  const lines: string[] = [
    'PRODUCT IDENTITY SUBSTITUTION CONTRACT — MANDATORY',
    '  - Skeleton copy is structural placeholder text only.',
    '  - Replace titles, KPI labels, entities, nav labels, CTAs, table headings, and empty states with product-specific language.',
    '  - Source visible copy from the Product Assembly Plan, product promise, target user, and differentiator.',
    '  - Do not leave generic labels like Dashboard, Overview, Analytics, Pipeline, Item 1, Sample Data unless the domain truly requires them.',
    '  - Sample records, numeric values, statuses, and field names must feel native to the product domain.',
  ];
  if (!foundationOnly) {
    lines.push('  - The first viewport must make the specific product identity obvious without outside context.');
  }
  return lines.join('\n');
}

export function buildCoderPlanningBlocks(input: {
  designCtx?: DesignContext;
  mediaHints?: MediaHint[];
  compositionPlan?: ScreenCompositionPlan;
  functionalFlowPlan?: FunctionalFlowPlan;
  skeletonIntegrationPlan?: SkeletonIntegrationPlan;
  productSpecificityPlan?: ProductSpecificityPlan;
  marketAwareBuilderBrief?: MarketAwareBuilderBrief;
  attachmentPromptBlock?: string;
  /** WI-7: Design Fusion Contract block — injected after attachment context. */
  designFusionBlock?: string;
  targetFiles?: readonly DeltaFileSpec[];
}): string {
  const foundationOnlyTargetSet = Boolean(
    input.targetFiles
      && input.targetFiles.length > 0
      && partitionDeltaForPhasing(input.targetFiles).screens.length === 0,
  );
  const relevantScreenIds = !foundationOnlyTargetSet && input.compositionPlan
    ? selectRelevantScreenIdsForPromptContext(input.compositionPlan, input.targetFiles)
    : undefined;
  return [
    input.designCtx ? buildCompactDesignContractForCoder(input.designCtx, input.mediaHints) : '',
    input.compositionPlan && !foundationOnlyTargetSet
      ? buildCompactCompositionPlanPromptBlock(input.compositionPlan, { relevantScreenIds })
      : '',
    input.functionalFlowPlan
      ? buildCompactFunctionalFlowPromptBlock(input.functionalFlowPlan, {
          foundationOnly: foundationOnlyTargetSet,
          relevantScreenIds,
        })
      : '',
    input.skeletonIntegrationPlan
      ? buildCompactSkeletonIntegrationPromptBlock(input.skeletonIntegrationPlan, {
          foundationOnly: foundationOnlyTargetSet,
          targetFiles: input.targetFiles,
        })
      : '',
    input.productSpecificityPlan
      ? buildCompactProductSpecificityPromptBlock(input.productSpecificityPlan, {
          foundationOnly: foundationOnlyTargetSet,
          relevantScreenIds,
        })
      : '',
    input.marketAwareBuilderBrief
      ? buildCompactMarketAwareBuilderBriefForCoder(input.marketAwareBuilderBrief, {
          foundationOnly: foundationOnlyTargetSet,
        })
      : '',
    input.attachmentPromptBlock ?? '',
    // WI-7: Design Fusion Contract — priority hierarchy for visual assets vs shadcn vs custom.
    input.designFusionBlock ?? '',
    // Product Identity Substitution Contract — injected when a market-aware brief is present.
    // Must appear after the brief (so the coder has product context) and before the
    // self-plan instructions (so the substitution rules are in scope during planning).
    input.marketAwareBuilderBrief
      ? buildCompactProductIdentityContractForCoder({ foundationOnly: foundationOnlyTargetSet })
      : '',
    input.marketAwareBuilderBrief
      ? buildCompactBuilderOwnedSelfPlanForCoder(input.marketAwareBuilderBrief, {
          foundationOnly: foundationOnlyTargetSet,
        })
      : '',
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
  attachmentPromptBlock?: string;
  /** WI-7: Design Fusion Contract block for this coder call. */
  designFusionBlock?: string;
  /** Compact "build to this" contract distilled from the product document package. */
  coderContractBrief?: string;
  /**
   * Phased generation: the subset of plan.deltaFiles THIS call must emit (defaults
   * to all). Used to generate the data/type foundation first, then the screens.
   */
  targetFiles?: readonly DeltaFileSpec[];
  /**
   * Phased generation: files already produced by an earlier phase. Injected as
   * read-only context so this phase imports from them and matches their exact
   * types/exports instead of recreating or diverging from them.
   */
  establishedFiles?: Record<string, string>;
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
  const requestedTargetFiles = input.targetFiles ?? input.plan.deltaFiles;
  const scopedTargets = filterProductDeltaSpecs(input.skeletonId, requestedTargetFiles);
  if (scopedTargets.rejected.length > 0) {
    input.onLog(`[coder] rejected ${scopedTargets.rejected.length} out-of-scope target file(s): ${scopedTargets.rejected.join(', ')}`, 'warn');
  }
  const targetFiles = scopedTargets.specs;
  if (targetFiles.length === 0) {
    throw new Error('Coder has no product-slot targets after compiled-contract filtering');
  }
  const coderMaxTokens = resolveCoderMaxTokensForTargetFileCount(targetFiles.length);
  const fileList = targetFiles
    .map(d => `  - ${d.path}${d.purpose ? `  // ${d.purpose}` : ''}`)
    .join('\n');
  // Phased generation: inject already-built foundation files as read-only context.
  const establishedFilesBlock = input.establishedFiles && Object.keys(input.establishedFiles).length > 0
    ? `ESTABLISHED FOUNDATION — these files ALREADY EXIST from an earlier phase. Do NOT re-emit them. ` +
      `Import from these EXACT module paths and match their exported types/names PRECISELY (do not redefine or diverge):\n\n` +
      Object.entries(input.establishedFiles)
        .map(([path, content]) => `<<<FILE: ${path}>>>\n${content.length > 2400 ? content.slice(0, 2400) + '\n/* …truncated… */' : content}\n<<<END>>>`)
        .join('\n\n')
    : '';
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
      attachmentPromptBlock: input.attachmentPromptBlock,
      designFusionBlock: input.designFusionBlock,
      targetFiles,
    });
  const advertisedUiPrimitives = filterAdvertisedUiPrimitiveNames(skeleton.uiPrimitives);
  const uiPrimitiveImportCatalog = buildUiPrimitiveImportCatalog(advertisedUiPrimitives);

  // Compact skeleton contract: describes installed foundation, navigation config exports,
  // and per-skeleton import rules. Replaces hardcoded mobile-specific nav lines.
  // Does NOT include raw skeleton source code — structural contract only.
  const skeletonContractBlock = buildSkeletonContractForCoder(input.skeletonId);

  // ── Prompt sub-blocks (measured for diagnostics) ───────────────────────────
  const skeletonHeaderBlock =
    `You are a senior React + TypeScript + Tailwind engineer. You are completing an app on top of an existing skeleton.\n\n` +
    `SKELETON: ${skeleton.label} (${skeleton.id})\n` +
    `PROVIDED COMPONENTS: ${skeleton.providedComponents.join(', ') || '(see registry)'}\n` +
    `PROVIDED HOOKS: ${skeleton.providedHooks.join(', ') || '(see registry)'}\n` +
    `UI PRIMITIVES: ${advertisedUiPrimitives.join(', ') || '(see registry)'}`;

  const filePlanBlock =
    `DELTA FILE TREE FROM ARCHITECT (source of truth):\n${fileTreeBlock || '  - (none)'}\n\n` +
    `YOU MUST write EXACTLY these files and only these files:\n${fileList}\n\n` +
    `PAGES TO WIRE INTO THE ROUTER:\n${pageList}` +
    dataModelBlock + notesBlock;

  const outputFormatBlock =
    `OUTPUT FORMAT — CRITICAL\n` +
    `Emit each file enclosed in plain-text markers, nothing else around them:\n\n` +
    `<<<FILE: pages/Dashboard.tsx>>>\n// full file contents here\n<<<END>>>\n\n` +
    `<<<FILE: components/StatCard.tsx>>>\n// full file contents here\n<<<END>>>`;

  const importRulesBlock =
    `IMPORT RULES — follow exactly, never mix paths\n` +
    `Available UI primitive import catalog (use only these exact paths):\n` +
    uiPrimitiveImportCatalog + `\n\n` +
    `From '@/components/EmptyState' (NOT from ui): EmptyState\n` +
    `From '@/components/LoadingScreen' (NOT from ui): LoadingScreen\n` +
    `From '@/components/ErrorBoundary' (NOT from ui): ErrorBoundary\n` +
    `From 'lucide-react': any icon component\n` +
    `From '@/config/routes': ROUTES\n\n` +
    `NEVER import EmptyState, LoadingScreen, or ErrorBoundary from '@/components/ui'.\n\n` +
    skeletonContractBlock;

  const rulesBlock =
    `RULES\n` +
    `- Paths relative to preview-workspace/src/. No leading "src/" or "/".\n` +
    `- Each file must be a complete, compilable .tsx/.ts file. No diffs, no patches.\n` +
    `- Do not import UI primitives that are not listed in the UI primitive import catalog or not physically present in src/components/ui.\n` +
    `- If a component/helper is needed but not available in the skeleton, implement it inside the current product-slot file; NEVER create an extra source module outside the declared product slots.\n` +
    `- Only import from skeleton-provided modules listed above, exact UI primitive paths listed above, "lucide-react", "react", and files you yourself emit.\n` +
    `- For component-local state (counters, form fields, toggles, lists, etc.) use React's own useState / useReducer / useEffect — DO NOT invent custom hooks like "useApp", "useCounter" etc. that are not in the PROVIDED HOOKS list above. If you need persistence, use the named import: import { useLocalStorage } from "@/hooks/useLocalStorage".\n` +
    `- You are extending the installed skeleton by delta. NEVER rebuild the app shell, router, providers, or placeholder app from scratch when the selected skeleton already provides them.\n` +
    `- Do not modify any skeleton-locked path.\n` +
    `- HARD WRITE SCOPE: emit only manifest-declared required/optional product slots. No extra components, hooks, services, assets, styles, or helper files.\n` +
    `- No commentary outside the markers. No markdown. No code fences.\n` +
    `- Quality over verbosity: real content, no lorem ipsum, no TODOs.\n` +
    `- DESIGN TOKENS: ALWAYS use Tailwind design token classes — bg-background, bg-card, bg-muted, bg-primary, text-foreground, text-muted-foreground, text-primary, text-primary-foreground, border-border. NEVER use raw color utilities (bg-white, bg-black, bg-gray-100, text-gray-900, border-gray-200). Use var(--primary) / var(--foreground) in style props when tokens are needed inline.\n` +
    `- REAL DATA: Write actual domain entities with real business labels, realistic numbers, and meaningful copy. Never write "Lorem ipsum", "placeholder", "TODO", or generic "Item 1 / Item 2" lists.\n` +
    `- COMPLETENESS: Every emitted file must be fully functional — no partial stubs, no "// rest of implementation" comments, no empty component bodies.`;

  const system = [
    skeletonHeaderBlock,
    input.coderContractBrief ? `\n${input.coderContractBrief}` : '',
    contractBlock ? `\n${contractBlock}` : '',
    planningBlocks ? `\n${planningBlocks}` : '',
    `\n${skeletonPromptBlock}`,
    establishedFilesBlock ? `\n${establishedFilesBlock}` : '',
    `\n${filePlanBlock}`,
    `\n${outputFormatBlock}`,
    `\n${importRulesBlock}`,
    `\n${rulesBlock}`,
  ].join('\n');

  // Measure and log prompt block sizes (chars only, no content) for diagnostics.
  const promptBlockSizes = measureCoderPromptBlockSizes({
    skeletonHeader:       skeletonHeaderBlock,
    contractBlock:        contractBlock,
    planningBlocks:       planningBlocks,
    skeletonFoundation:   skeletonPromptBlock,
    skeletonContract:     skeletonContractBlock,
    filePlan:             filePlanBlock,
    outputFormat:         outputFormatBlock,
    importRules:          importRulesBlock,
    rules:                rulesBlock,
    userMessage:          input.prompt + '\n\nSummary: ' + input.plan.summary,
  });
  recordCoderPromptBlockSizes(promptBlockSizes);

  let firstReason = '';
  let body = '';
  let usageAcc: StepLlmMetrics | undefined;
  const useStreamingCoderTransport = shouldStreamCoderTransportForTargetFileCount(targetFiles.length);
  await streamCall({
    slot:      'build',
    system,
    user:      input.prompt + '\n\nSummary: ' + input.plan.summary,
    maxTokens: coderMaxTokens,
    timeoutMs: STEP_BUDGET.coder.timeoutMs,
    signal:    input.signal,
    routeOverrides: input.routeOverrides,
    // 12k phased batches complete reliably on the atomic JSON path and avoid the
    // repeated 35s stream-degrade penalty DeepSeek pays before falling back.
    stream:    useStreamingCoderTransport,
    timeoutAsError: true,
    onChunk:   (delta) => { body += delta; input.onStream?.(delta); },
    onFinishReason: (r) => { firstReason = r; },
    onUsage:   (usage) => { usageAcc = mergeLlmUsage(usageAcc, usage); },
  });
  input.onLog(
    `[coder] llm response received (${body.length} chars, finish_reason=${firstReason || 'none'})`,
    'info',
  );

  const canonicalTargetPaths = targetFiles.map(file => normaliseDeltaPath(file.path));
  const canonicalizeParsedPaths = (files: Record<string, string>) => {
    const rewrittenEntries = Object.entries(files).map(([path, content]) => {
      const canonicalPath = canonicalizeBareDeltaPathToKnownPath(path, canonicalTargetPaths);
      return [canonicalPath, content] as const;
    });
    const rewrites = Object.keys(files)
      .map(path => {
        const canonicalPath = canonicalizeBareDeltaPathToKnownPath(path, canonicalTargetPaths);
        return canonicalPath !== normaliseDeltaPath(path)
          ? `${normaliseDeltaPath(path)} -> ${canonicalPath}`
          : null;
      })
      .filter((rewrite): rewrite is string => rewrite !== null);
    return {
      files: Object.fromEntries(rewrittenEntries),
      rewrites: uniqueStrings(rewrites),
    };
  };

  let parsed = canonicalizeParsedPaths(parseFileMarkers(body));
  if (parsed.rewrites.length > 0) {
    input.onLog(
      `[coder] canonicalized ${parsed.rewrites.length} bare file marker path alias(es): ` +
        parsed.rewrites.slice(0, 4).join(', '),
      'warn',
    );
  }
  let missing = targetFiles
    .map(d => d.path)
    .filter(p => !(p in parsed.files));

  // Targeted retry for length truncation OR a first reply that produced no
  // parseable markers at all. When NOTHING parsed, the model ignored the marker
  // format — so the retry leads with an emphatic, example-driven format reminder
  // (model-agnostic; never depends on a specific model).
  if ((firstReason === 'length' || missing.length > 0) && missing.length > 0) {
    const nothingParsed = Object.keys(parsed.files).length === 0;
    input.onLog(
      `[coder] retry for ${missing.length} missing file(s) ` +
        `(finish_reason=${firstReason || 'incomplete'}, nothing_parsed=${nothingParsed})`,
      'warn',
    );
    const formatReminder = nothingParsed
      ? 'Your previous reply contained NO valid file markers and could not be parsed. ' +
        'Output EVERY file wrapped EXACTLY like this, with nothing else around it:\n' +
        '<<<FILE: src/path/Name.tsx>>>\n<file contents>\n<<<END>>>\n' +
        'Do NOT wrap the whole reply in markdown code fences and do NOT add any commentary ' +
        'before the first marker or after the last one.\n\n'
      : '';
    const retryTargetFiles = targetFiles.filter(file => missing.includes(file.path));
    const retryFileList = retryTargetFiles
      .map(file => `  - ${file.path}${file.purpose ? `  // ${file.purpose}` : ''}`)
      .join('\n');
    const retrySystem = [
      skeletonHeaderBlock,
      input.coderContractBrief ? `\n${input.coderContractBrief}` : '',
      contractBlock ? `\n${contractBlock}` : '',
      planningBlocks ? `\n${planningBlocks}` : '',
      `\n${skeletonPromptBlock}`,
      establishedFilesBlock ? `\n${establishedFilesBlock}` : '',
      `\nREQUIRED PRODUCT-SLOT RECOVERY\n` +
        `${formatReminder}` +
        `Your previous response omitted required product-slot file(s). ` +
        `This recovery succeeds ONLY if every path below is emitted exactly once.\n` +
        `Emit ONLY these missing files; do not repeat any file already accepted.\n\n` +
        `MISSING REQUIRED PRODUCT SLOTS:\n${retryFileList}`,
      `\n${outputFormatBlock}`,
      `\n${importRulesBlock}`,
      `\n${rulesBlock}`,
    ].join('\n');
    let retryBody = '';
    try {
      await streamCall({
        slot:      'build',
        system:    retrySystem,
        user:      'Re-emit ONLY the missing files for the previous task.',
        maxTokens: coderMaxTokens,
        timeoutMs: STEP_BUDGET.coder.timeoutMs,
        signal:    input.signal,
        routeOverrides: input.routeOverrides,
        stream:    useStreamingCoderTransport,
        timeoutAsError: true,
        onChunk:   (delta) => { retryBody += delta; input.onStream?.(delta); },
        onUsage:   (usage) => { usageAcc = mergeLlmUsage(usageAcc, usage); },
      });
      input.onLog(`[coder] retry response received (${retryBody.length} chars)`, 'info');
      const retryParsed = canonicalizeParsedPaths(parseFileMarkers(retryBody));
      if (retryParsed.rewrites.length > 0) {
        input.onLog(
          `[coder] canonicalized ${retryParsed.rewrites.length} bare retry file marker path alias(es): ` +
            retryParsed.rewrites.slice(0, 4).join(', '),
          'warn',
        );
      }
      parsed = { files: { ...parsed.files, ...retryParsed.files }, rewrites: uniqueStrings([...parsed.rewrites, ...retryParsed.rewrites]) };
      missing = targetFiles
        .map(d => d.path)
        .filter(p => !(p in parsed.files));
    } catch (err) {
      if (isAbort(err)) throw err;
      input.onLog(`[coder] retry failed: ${(err as Error).message}`, 'warn');
    }
  }

  if (Object.keys(parsed.files).length === 0) {
    // Diagnosable failure: finish_reason distinguishes truncation (length) from a
    // genuine format miss; body length confirms whether content arrived at all.
    throw new Error(
      `Coder produced no FILE/END blocks — output was unparsable ` +
        `(finish_reason=${firstReason || 'none'}, body_chars=${body.length})`,
    );
  }
  const allowedPaths = new Set(targetFiles.map(file => normaliseDeltaPath(file.path)));
  const droppedUnexpected = Object.keys(parsed.files).filter(path => !allowedPaths.has(normaliseDeltaPath(path)));
  if (droppedUnexpected.length > 0) {
    input.onLog(
      `[coder] dropped ${droppedUnexpected.length} unexpected file(s): ${droppedUnexpected.join(', ')}`,
      'warn',
    );
  }
  const acceptedParsed = Object.fromEntries(
    Object.entries(parsed.files).filter(([path]) => allowedPaths.has(normaliseDeltaPath(path))),
  );
  if (Object.keys(acceptedParsed).length === 0) {
    throw new Error('Coder did not return any allowed delta files');
  }
  if (missing.length > 0) {
    input.onLog(`[coder] still missing after retry: ${missing.join(', ')}`, 'warn');
    throw new Error(`Coder still missing ${missing.length} required delta file(s) after retry: ${missing.join(', ')}`);
  }

  // ── Output-budget diagnostics (safe, no code/prompt/secrets logged) ─────────
  const parseStatus =
    Object.keys(acceptedParsed).length === 0 ? 'parse_failed'
    : missing.length > 0 ? 'missing_files'
    : firstReason === 'length' ? 'retry_recovered'
    : 'ok';

  const budgetDiag = buildCoderOutputBudgetDiagnostics({
    requestedMaxTokens:          coderMaxTokens,
    expectedFileCount:           input.plan.deltaFiles.length,
    parsedFileCount:             Object.keys(acceptedParsed).length,
    outputCharCount:             body.length,
    parseStatus,
    truncatedArtifactDetected:   firstReason === 'length',
    missingExpectedFilesCount:   missing.length,
    finishReason:                firstReason,
    parsedFiles:                 acceptedParsed,
  });
  recordCoderOutputBudgetDiagnostics(budgetDiag);

  if (usageAcc) input.onUsage?.(usageAcc);
  return acceptedParsed;
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
  const scopedCurrentFiles = filterProductDeltaFiles(input.skeletonId, input.currentFiles).files;
  // Heuristic: pull file paths the error log references; fall back to all product-slot files.
  const referenced = Array.from(input.errorLog.matchAll(/(?:src\/)?([\w./@-]+\.(?:tsx?|css|json))/g))
    .map(m => normaliseDeltaPath(m[1]))
    .filter(p => p in scopedCurrentFiles);
  const targetPaths = referenced.length > 0
    ? Array.from(new Set(referenced))
    : Object.keys(scopedCurrentFiles);

  const targets = targetPaths
    .map(p => `<<<FILE: ${p}>>>\n${scopedCurrentFiles[p]}\n<<<END>>>`)
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
  const scopedRepair = filterProductDeltaFiles(input.skeletonId, parsed);
  if (scopedRepair.rejected.length > 0) {
    input.onLog(`[repair] rejected ${scopedRepair.rejected.length} out-of-scope file(s): ${scopedRepair.rejected.join(', ')}`, 'warn');
  }
  if (Object.keys(scopedRepair.files).length === 0) {
    throw new Error('Repair produced no manifest-declared product-slot files');
  }
  return scopedRepair.files;
}

// ── Quality repair pass ───────────────────────────────────────────────────────

/**
 * Builds the system + user prompt pair for one-shot quality repair.
 *
 * Exported for unit tests so prompt content can be verified without making
 * real LLM calls.  runQualityRepair delegates to this helper; behaviour is
 * identical to the inline prompt that existed before extraction.
 */
export function buildRepairPrompt(input: {
  prompt:                       string;
  skeletonId?:                  SkeletonId;
  blockingReasons:              string[];
  repairInstructions:           string[];
  productAppName?:              string;
  productSummary?:              string;
  designCtx?:                   DesignContext;
  productSpecificityDiagnostics?: ProductSpecificityDiagnostics | null;
  currentFiles:                 Record<string, string>;
}): { system: string; user: string } {
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
  const editableProductSlotFiles = input.skeletonId
    ? getSkeletonProductSlotFiles(input.skeletonId).map(path => normalizeOutputPath(path))
    : [];
  const editableSlotBlock = editableProductSlotFiles.length > 0
    ? `\nEDITABLE PRODUCT-SLOT FILES (safe to rewrite when removing carcass defaults):\n` +
      `${editableProductSlotFiles.map(path => `- ${path}`).join('\n')}\n`
    : '';
  const productContextBlock =
    (input.productAppName && input.productAppName.trim().length > 0) ||
    (input.productSummary && input.productSummary.trim().length > 0)
      ? `\nPRODUCT CONTEXT:\n` +
        `${input.productAppName ? `App name: ${input.productAppName}\n` : ''}` +
        `${input.productSummary ? `Summary: ${input.productSummary}\n` : ''}`
      : '';

  const targets = Object.entries(input.currentFiles)
    .map(([path, content]) => `<<<FILE: ${path}>>>\n${content}\n<<<END>>>`)
    .join('\n\n');

  const system =
    `You are fixing prototype quality gate failures. Re-emit only the files you change.\n` +
    `Use the same <<<FILE: path>>>...<<<END>>> marker format. Do not modify skeleton-locked shell files.\n` +
    `Editable product-slot files listed below are explicitly allowed repair targets when they still contain ` +
    `carcass defaults such as AppName, default navigation, TODO markers, or skeleton seed copy.\n` +
    editableSlotBlock +
    productContextBlock +
    `\n` +
    `QUALITY GATE BLOCKING REASONS:\n${reasonsList}\n\n` +
    `REPAIR INSTRUCTIONS:\n${instructionsList}\n` +
    designBlock +
    specificityNote +
    `\nRULES:\n` +
    `- Replace all generic placeholders (Feature 1, AppName, Lorem ipsum, Untitled, TODO, Item 1, KPI 1) with product-specific copy.\n` +
    `- Replace raw hex colours (#xxxxxx), raw colour functions (rgb/hsl), and Tailwind palette classes (bg-blue-500) ` +
    `with semantic design tokens: bg-primary, bg-background, bg-card, text-foreground, text-muted-foreground, etc.\n` +
    `- If config/app.ts, data/seed.ts, config/navigation.ts, or pages/Home.tsx are in the editable product-slot list, ` +
    `you MAY rewrite them in full to remove skeleton-default content and make them match THIS product.\n` +
    `- Fill empty dashboard metric cards with real domain-specific labels and realistic sample values.\n` +
    `- Bare PRODUCT token: if the output contains PRODUCT as a standalone placeholder token ` +
    `(e.g. <h1>PRODUCT</h1>, const name = "PRODUCT", "Welcome to PRODUCT"), replace it with the actual ` +
    `product name, app name, or trend niche name derived from the original task prompt. ` +
    `Do not leave PRODUCT in visible text, labels, headings, mock data, constants, or route/page copy. ` +
    `Do not replace PRODUCT where it appears as a substring inside a normal word.\n` +
    `- Empty data arrays: if a hook or module exports or returns an empty [] for visible UI content ` +
    `(feeds, cards, charts, lists, dashboards), replace it with 3–5 realistic domain-specific sample entries. ` +
    `Entries must match the product idea and the surrounding TypeScript type shape. ` +
    `Do not leave visible dashboards, feeds, cards, charts, lists, or hooks backed by empty arrays.\n` +
    `- Self-check before returning repaired files: verify (a) no standalone PRODUCT token remains in ` +
    `any emitted file, (b) no visible-content data hook returns or exports [], ` +
    `(c) every import references either a real installed package, a skeleton-provided path, or a component ` +
    `implemented in the same output — do not import absent catalog components, ` +
    `(d) each emitted file is syntactically complete and compilable.\n` +
    `- Emit only files you actually changed. Each emitted file must be complete and compilable.`;

  const user = `Original task: ${input.prompt}\n\nFiles to repair:\n\n${targets}`;
  return { system, user };
}

function resolveQualityRepairStrategy(input: {
  skeletonId: SkeletonId;
  blockingReasons: string[];
  repairInstructions: string[];
  resolvedPaths: string[];
}): {
  slot: AgentSlot;
  maxTokens: number;
  timeoutMs: number;
  reason: string;
} {
  const productSlotSet = new Set(
    getSkeletonProductSlotFiles(input.skeletonId).map(path => normalizeOutputPath(path)),
  );
  const touchesProductSlot = input.resolvedPaths.some(path => productSlotSet.has(normalizeOutputPath(path)));
  const repairText = input.blockingReasons.join('\n');
  const identityOrCarcassSignal =
    /Product identity slots|AppName|PRODUCT|Morning intention|Deep work block|Today's space|Nothing here yet|empty local arrays|Empty or generic dashboard metric cards/i
      .test(repairText);

  if (touchesProductSlot && identityOrCarcassSignal) {
    return {
      slot: 'build',
      maxTokens: STEP_BUDGET.qualityRepairHeavy.maxTokens,
      timeoutMs: STEP_BUDGET.qualityRepairHeavy.timeoutMs,
      reason: 'product-slot identity/carcass repair needs a stronger scoped build pass',
    };
  }

  return {
    slot: 'fix',
    maxTokens: STEP_BUDGET.qualityRepair.maxTokens,
    timeoutMs: STEP_BUDGET.qualityRepair.timeoutMs,
    reason: 'standard scoped quality repair',
  };
}

/**
 * Computes the scoped file subset that quality repair should edit.
 *
 * Union of paths from all three violation sources:
 *   1. DesignViolation[].path        — design-contract token violations
 *   2. vudGenericFindings[]          — "path: label" from VisualUsageDiagnostics
 *   3. psdGenericFindings[]          — "path: label" from ProductSpecificityDiagnostics
 *   4. psdEmptyMetricFindings[]      — "path: detail" for empty/generic KPI cards
 *
 * Only paths already present in currentFiles are included (safe subset).
 * When no paths can be resolved, falls back to all files with an explanation.
 *
 * Exported for unit testing — pure function, no LLM calls.
 */
export function computeRepairScopedFiles(
  currentFiles:          Record<string, string>,
  designContractViolations?: DesignViolation[] | null,
  vudGenericFindings?:   string[] | null,
  psdGenericFindings?:   string[] | null,
  psdEmptyMetricFindings?: string[] | null,
  repairableMissingPaths?: string[] | null,
  additionalScopePaths?: string[] | null,
): {
  scopedFiles: Record<string, string>;
  isFallback: boolean;
  fallbackReason?: string;
  rawPaths: string[];
  resolvedPaths: string[];
  sourcePathCounts: {
    designContract: number;
    visualPlaceholders: number;
    specificityPlaceholders: number;
    specificityEmptyMetrics: number;
    identitySlots: number;
    liveContract: number;
  };
} {
  const rawPaths = new Set<string>();
  const sourcePathCounts = {
    designContract: 0,
    visualPlaceholders: 0,
    specificityPlaceholders: 0,
    specificityEmptyMetrics: 0,
    identitySlots: 0,
    liveContract: 0,
  };

  // Source 1: design-contract token violations — path is a direct string field
  for (const v of (designContractViolations ?? [])) {
    if (typeof v.path === 'string' && v.path) {
      rawPaths.add(v.path);
      sourcePathCounts.designContract += 1;
    }
  }

  // Sources 2 & 3: "path: label" findings — extract everything before the first ': '
  for (const finding of (vudGenericFindings ?? [])) {
    const idx = finding.indexOf(': ');
    if (idx > 0) {
      rawPaths.add(finding.slice(0, idx));
      sourcePathCounts.visualPlaceholders += 1;
    }
  }
  for (const finding of (psdGenericFindings ?? [])) {
    const idx = finding.indexOf(': ');
    if (idx > 0) {
      rawPaths.add(finding.slice(0, idx));
      sourcePathCounts.specificityPlaceholders += 1;
    }
  }
  // Source 4: empty/generic metric findings also carry "path: detail"
  for (const finding of (psdEmptyMetricFindings ?? [])) {
    const idx = finding.indexOf(': ');
    if (idx > 0) {
      rawPaths.add(finding.slice(0, idx));
      sourcePathCounts.specificityEmptyMetrics += 1;
    }
  }
  for (const path of (repairableMissingPaths ?? [])) {
    if (typeof path === 'string' && path.trim().length > 0) {
      rawPaths.add(path);
      sourcePathCounts.identitySlots += 1;
    }
  }
  for (const path of (additionalScopePaths ?? [])) {
    if (typeof path === 'string' && path.trim().length > 0) {
      rawPaths.add(path);
      sourcePathCounts.liveContract += 1;
    }
  }

  // Normalize and filter to paths actually present in currentFiles, plus any
  // explicitly repairable missing identity slots that the quality repair is
  // allowed to create.
  const currentEntriesByNormalizedPath = new Map<string, { originalPath: string; content: string }>(
    Object.entries(currentFiles).map(([path, content]) => [
      normalizeOutputPath(path),
      { originalPath: path, content },
    ]),
  );
  const extraAllowedPaths = new Set(
    (repairableMissingPaths ?? []).map(path => normalizeOutputPath(path)),
  );
  const uniqueScoped = Array.from(
    new Set(Array.from(rawPaths).map(p => normalizeOutputPath(p))),
  ).filter(path => currentEntriesByNormalizedPath.has(path) || extraAllowedPaths.has(path));
  const rawPathList = Array.from(rawPaths);
  const resolvedPaths = [...uniqueScoped];

  if (uniqueScoped.length > 0) {
    const scopedFiles = Object.fromEntries(uniqueScoped.map((path) => {
      const currentEntry = currentEntriesByNormalizedPath.get(path);
      if (currentEntry) {
        return [currentEntry.originalPath, currentEntry.content] as const;
      }
      return [path, currentFiles[path] ?? ''] as const;
    }));
    return {
      scopedFiles,
      isFallback: false,
      rawPaths: rawPathList,
      resolvedPaths,
      sourcePathCounts,
    };
  }

  const fallbackReason = rawPaths.size === 0
    ? 'no violation sources provided file paths'
    : `${rawPaths.size} raw path(s) could not be matched to currentFiles after normalization`;
  return {
    scopedFiles: currentFiles,
    isFallback: true,
    fallbackReason,
    rawPaths: rawPathList,
    resolvedPaths,
    sourcePathCounts,
  };
}

/**
 * Bounded one-shot quality repair — separate from compile repair (runRepair).
 *
 * Called only when evaluatePrototypeQualityGate() returns blockingReasons.length > 0.
 * Makes exactly ONE LLM call via the 'fix' slot with a quality-focused prompt.
 * Scopes the LLM input to only the files that contain violations (2-5 files instead of
 * all 34), so the 8k output budget can cover all violating files rather than just one.
 * Context (prompt, designCtx, psd) remains full — needed for PRODUCT/label resolution.
 * Parses output using parseFileMarkers; accepts paths already in currentFiles plus
 * explicitly repairable missing identity slots (safety filter — prevents arbitrary
 * new file injection while letting the gate create absent product-identity files).
 *
 * No loops or retries inside this helper. ProtoPipeline.run() may invoke it
 * for multiple bounded hard-block repair passes.
 */
export async function runQualityRepair(input: {
  prompt:                        string;
  skeletonId:                    SkeletonId;
  currentFiles:                  Record<string, string>;
  blockingReasons:               string[];
  repairInstructions:            string[];
  productAppName?:               string;
  productSummary?:               string;
  designContractViolations?:     DesignViolation[] | null;
  visualUsageDiagnostics?:       VisualUsageDiagnostics | null;
  designCtx?:                    DesignContext;
  productSpecificityDiagnostics?: ProductSpecificityDiagnostics | null;
  additionalScopePaths?:         string[] | null;
  signal?:                       AbortSignal;
  routeOverrides?:               RouteOverrideMap;
  onLog:                         (msg: string, level?: 'info' | 'warn' | 'error') => void;
  onUsage?:                      (usage: StepLlmMetrics) => void;
}): Promise<Record<string, string>> {
  const {
    scopedFiles,
    isFallback,
    fallbackReason,
    rawPaths,
    resolvedPaths,
    sourcePathCounts,
  } = computeRepairScopedFiles(
    input.currentFiles,
    input.designContractViolations,
    input.visualUsageDiagnostics?.genericPlaceholderFindings,
    input.productSpecificityDiagnostics?.genericPlaceholderFindings,
    input.productSpecificityDiagnostics?.emptyMetricFindings,
    input.visualUsageDiagnostics?.repairableMissingIdentityPaths,
    input.additionalScopePaths,
  );

  input.onLog(
    `[quality-repair] scope sources: design=${sourcePathCounts.designContract}, ` +
      `visual-placeholder=${sourcePathCounts.visualPlaceholders}, ` +
      `specificity-placeholder=${sourcePathCounts.specificityPlaceholders}, ` +
      `specificity-empty-metric=${sourcePathCounts.specificityEmptyMetrics}, ` +
      `identity-slot=${sourcePathCounts.identitySlots}, ` +
      `live-contract=${sourcePathCounts.liveContract}, ` +
      `raw=${rawPaths.length}, resolved=${resolvedPaths.length}` +
      (resolvedPaths.length > 0 ? ` -> ${resolvedPaths.join(', ')}` : ''),
  );

  if (isFallback) {
    input.onLog(
      `[quality-repair] scoped-repair: no paths resolved (${fallbackReason}); ` +
      `falling back to all ${Object.keys(input.currentFiles).length} file(s) — repair may patch fewer issues than intended`,
      'warn',
    );
  }

  const scopedCount = Object.keys(scopedFiles).length;
  const totalCount  = Object.keys(input.currentFiles).length;
  input.onLog(
    `[quality-repair] attempting repair of ${input.blockingReasons.length} issue(s) across ` +
    `${scopedCount}/${totalCount} file(s)` +
    (isFallback ? ' (fallback: all files)' : ' (scoped to violations)'),
  );

  const strategy = resolveQualityRepairStrategy({
    skeletonId: input.skeletonId,
    blockingReasons: input.blockingReasons,
    repairInstructions: input.repairInstructions,
    resolvedPaths,
  });
  input.onLog(
    `[quality-repair] route=${strategy.slot} max_tokens=${strategy.maxTokens} timeout_ms=${strategy.timeoutMs} ` +
      `(${strategy.reason})`,
  );

  const { system, user } = buildRepairPrompt({ ...input, currentFiles: scopedFiles });

  let body = '';
  await streamCall({
    slot:           strategy.slot,
    system,
    user,
    maxTokens:      strategy.maxTokens,
    timeoutMs:      strategy.timeoutMs,
    signal:         input.signal,
    routeOverrides: input.routeOverrides,
    onChunk:        (delta) => { body += delta; },
    onUsage:        input.onUsage,
  });
  input.onLog(`[quality-repair] llm response received (${body.length} chars)`, 'info');

  const patches = parseFileMarkers(body);
  if (Object.keys(patches).length === 0) {
    throw new Error('Quality repair produced no FILE/END blocks');
  }

  // Safety filter: only accept patches for paths already present in currentFiles
  // plus explicitly repairable missing identity-slot files. Use a normalised-key
  // map so that src/-prefix mismatches (e.g. patch emits "config/navigation.ts"
  // but currentFiles key is "src/config/navigation.ts") resolve correctly.
  const normToOriginal = new Map<string, string>(
    Object.keys(input.currentFiles).map(k => [normaliseDeltaPath(k), k]),
  );
  const productSlotPaths = new Set(getProductDeltaScope(input.skeletonId).allowed);
  const allowedMissingIdentityPaths = new Set(
    (input.visualUsageDiagnostics?.repairableMissingIdentityPaths ?? [])
      .map(path => normalizeProductDeltaPath(path))
      .filter(path => productSlotPaths.has(path)),
  );
  const canonicalPatchTargets = [
    ...Object.keys(input.currentFiles).map(key => normaliseDeltaPath(key)),
    ...Array.from(allowedMissingIdentityPaths),
  ];
  const safePatches: Record<string, string> = {};
  const unexpectedPaths: string[] = [];
  const canonicalPatchRewrites: string[] = [];
  for (const [patchPath, patchContent] of Object.entries(patches)) {
    const canonicalPatchPath = canonicalizeBareDeltaPathToKnownPath(patchPath, canonicalPatchTargets);
    if (canonicalPatchPath !== patchPath) {
      canonicalPatchRewrites.push(`${patchPath} -> ${canonicalPatchPath}`);
    }
    if (canonicalPatchPath in input.currentFiles) {
      safePatches[canonicalPatchPath] = patchContent;
    } else {
      // patchPath already normalised by parseFileMarkers; look up by normalised currentFiles key
      const originalKey = normToOriginal.get(canonicalPatchPath);
      if (originalKey !== undefined) {
        safePatches[originalKey] = patchContent;
      } else if (allowedMissingIdentityPaths.has(canonicalPatchPath)) {
        safePatches[canonicalPatchPath] = patchContent;
      } else {
        unexpectedPaths.push(canonicalPatchPath);
      }
    }
  }
  if (canonicalPatchRewrites.length > 0) {
    input.onLog(
      `[quality-repair] canonicalized ${canonicalPatchRewrites.length} bare patch path alias(es): ` +
        uniqueStrings(canonicalPatchRewrites).slice(0, 5).join(', '),
      'warn',
    );
  }
  if (Object.keys(safePatches).length === 0) {
    const attempted = Object.keys(patches).slice(0, 5).join(', ');
    const available = Object.keys(input.currentFiles).slice(0, 5).join(', ');
    input.onLog(
      `[quality-repair] all patched paths were unexpected — no files merged` +
      ` (attempted: ${attempted}; available sample: ${available})`,
      'warn',
    );
    return input.currentFiles;
  }
  if (unexpectedPaths.length > 0) {
    input.onLog(
      `[quality-repair] ${unexpectedPaths.length} patch path(s) skipped (not in currentFiles): ` +
      unexpectedPaths.slice(0, 5).join(', '),
      'warn',
    );
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
  callsite = 'unknown',
): Promise<CompileResultTiming> {
  console.log('[compile-stage]', {
    buildId,
    buildStage,
    callsite,
    fileCount: Object.keys(files).length,
  });
  // 1. Notify UI that compile is starting (sets previewState.expectingBuildId → iframe gets URL)
  previewController.notifyCompiling(buildId, buildStage);

  // 2. Call backend compile endpoint
  const compileStartedAt = Date.now();
  const sessionId = getPreviewSessionToken();
  const compileDelta = filterProductDeltaFiles(skeletonId, files);
  if (compileDelta.rejected.length > 0) {
    console.warn(`[ProtoPipeline] compile rejected out-of-scope product delta files: ${compileDelta.rejected.join(', ')}`);
  }
  const resp = await fetch(`/api/preview/${encodeURIComponent(buildId)}/compile`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-Preview-Session': sessionId },
    body:    JSON.stringify({ files: compileDelta.files, skeletonId, sessionId }),
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
  modelId:          string;
  apiKey:           string;
  endpoint:         string;
  provider:         string;
  endpointKind?:    string;  // direct_provider | supabase_proxy | openrouter_proxy | unknown
  sourceAuthority?: string;  // user_set | backend_runtime_saved | backend_factory_template | etc.
}

type RouteOverrideMap = Partial<Record<AgentSlot, ResolvedRoute>>;

const LOCAL_CODEX_CLI_RESERVE_MODEL = 'codex-auto';
const LOCAL_CLAUDE_CLI_RESERVE_MODEL = 'claude-sonnet-4-6';
const LOCAL_CLI_RESERVE_FORCE_KEY = 'AIC_FORCE_LOCAL_CLI_RESERVE';
const LOCAL_CLI_RESERVE_TIMEOUT_MS = 120_000;

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

// ── Diagnostic helper: classify endpoint for route telemetry ─────────────────

const NATIVE_ROUTE_HOSTS = new Set([
  'api.deepseek.com',
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'api.mistral.ai',
  'api.groq.com',
]);

function routeEndpointKind(endpoint: string, provider: string): string {
  if (provider === 'claude-cli' || provider === 'codex-cli') return 'direct_provider';
  try {
    const host = new URL(endpoint).hostname;
    if (host.endsWith('openrouter.ai')) return 'openrouter_proxy';
    if (NATIVE_ROUTE_HOSTS.has(host))  return 'supabase_proxy';
  } catch { /* malformed endpoint */ }
  return 'unknown';
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
      apiKey:          override.apiKey ?? '',
      endpoint,
      provider:        override.provider,
      endpointKind:    override.endpointKind ?? routeEndpointKind(endpoint, override.provider),
      sourceAuthority: override.sourceAuthority ?? 'override',
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
  const { authority } = ConfigService.resolveModelWithAuthority(slot);
  return {
    modelId,
    apiKey,
    endpoint,
    provider,
    endpointKind:    routeEndpointKind(endpoint, provider),
    sourceAuthority: authority,
  };
}

function resolveRouteOrSkip(slot: AgentSlot, overrides?: RouteOverrideMap): ResolvedRoute | null {
  try { return resolveRoute(slot, overrides); } catch { return null; }
}

/**
 * The slot's configured fallback model (AgentConfig.fallback1ModelId), or null.
 * Used when the primary model is unavailable (e.g. a dead model id → HTTP 404):
 * the studio honours the user-configured reserve instead of failing the run.
 * Not a hardcoded model — it is whatever the user/config set as fallback1.
 *
 * Deliberately independent of routeOverrides: in the real generation flow
 * GenerationEngine passes a resolved route as the override for EVERY slot
 * (buildPipelineRouteOverrides), so gating the fallback on "no override present"
 * made the reserve unreachable in production — the override is the resolved
 * primary route, not a "pin this exact model, never fall back" signal. The
 * fallback1 reserve is its own config field and applies regardless. The key and
 * endpoint are resolved for the FALLBACK provider (which may differ from the
 * primary's), and a fallback that equals the primary model is skipped — retrying
 * the same dead model id is pointless.
 */
export function resolveFallbackRoute(slot: AgentSlot, primaryModelId: string): ResolvedRoute | null {
  const cfg = ConfigService.getAgentConfig(`agent_${slot}`);
  const fbModel = cfg.fallback1ModelId?.trim();
  if (!fbModel || fbModel === primaryModelId) return null;
  const provider = (cfg.fallback1Provider || 'openrouter') as string;
  const endpoint = Orchestrator.getEndpoint(provider as Parameters<typeof Orchestrator.getEndpoint>[0]);
  const apiKey = provider === 'openrouter'
    ? (ConfigService.getProviderKey('openrouter') || ConfigService.getApiKey())
    : ConfigService.getProviderKey(provider);
  if (!apiKey) return null;
  return {
    modelId:         fbModel,
    apiKey,
    endpoint,
    provider,
    endpointKind:    routeEndpointKind(endpoint, provider),
    sourceAuthority: 'fallback1',
  };
}

function shouldEnableLocalCliReserve(): boolean {
  if (typeof window === 'undefined') return false;
  if (!isLocalDevHost(window.location.hostname)) return false;

  const forced = typeof localStorage !== 'undefined'
    && localStorage.getItem(LOCAL_CLI_RESERVE_FORCE_KEY) === '1';
  if (forced) return true;

  return getLocalDevAgentProvider() !== 'off';
}

export function resolveLocalCliReserveRoute(
  slot: AgentSlot,
  currentProvider?: string | null,
): ResolvedRoute | null {
  return resolveLocalCliReserveRoutes(slot, currentProvider)[0] ?? null;
}

export function resolveLocalCliReserveRoutes(
  slot: AgentSlot,
  currentProvider?: string | null,
): ResolvedRoute[] {
  if (!shouldEnableLocalCliReserve()) return [];

  const reserveProviders = [
    { provider: 'codex-cli' as const, modelId: LOCAL_CODEX_CLI_RESERVE_MODEL },
    { provider: 'claude-cli' as const, modelId: LOCAL_CLAUDE_CLI_RESERVE_MODEL },
  ];

  return reserveProviders
    .filter((candidate) => candidate.provider !== currentProvider)
    .map((candidate) => ({
      modelId: candidate.modelId,
      apiKey: '__local_cli_reserve__',
      endpoint: '/api/quality/llm-run',
      provider: candidate.provider,
      endpointKind: 'direct_provider' as const,
      sourceAuthority: `local_cli_reserve:${slot}:${candidate.provider}`,
    }));
}

function isSameResolvedRoute(left: ResolvedRoute | null | undefined, right: ResolvedRoute | null | undefined): boolean {
  if (!left || !right) return false;
  return (
    left.provider === right.provider &&
    left.endpoint === right.endpoint &&
    Orchestrator.normalizeModelId(left.modelId, left.endpoint) ===
      Orchestrator.normalizeModelId(right.modelId, right.endpoint)
  );
}

/** True for failures that mean the MODEL is unavailable (not a content/format issue). */
function isModelUnavailableError(err: unknown): boolean {
  if (err instanceof LlmTransportError) {
    return err.httpStatus === 404 || err.category === 'missing_provider_key';
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /\b404\b|not found|no (?:such )?model|unknown model|model_not_found/i.test(msg);
}

function isRouteFallbackEligibleError(err: unknown): boolean {
  if (isModelUnavailableError(err)) return true;
  if (err instanceof LlmTransportError) {
    return (
      err.category === 'missing_provider_key' ||
      err.category === 'provider_http_500' ||
      err.category === 'proxy_resource_limit' ||
      err.category === 'provider_rate_limit' ||
      err.category === 'invalid_llm_response' ||
      err.category === 'unknown_llm_transport_error'
    );
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /timed out|timeout|504|502|503|resource limit|overloaded|empty response body|unparseable|body is unusable/i.test(msg);
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

/** Maps an AgentSlot to a human-readable step name for LLM transport telemetry. */
function slotToStepName(slot: AgentSlot): string {
  const map: Record<AgentSlot, string> = {
    primary: 'architect',
    build:   'coder',
    fix:     'repair',
    spec:    'clarify',
    qa:      'quality',
    chat:    'chat',
  };
  return map[slot] ?? slot;
}

async function readStreamChunkWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  return new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`stream_read_timeout_${timeoutMs}`));
    }, timeoutMs);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };

    signal.addEventListener('abort', onAbort, { once: true });
    reader.read().then(
      (value) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

async function readStreamingResponseText(
  response: Response,
  signal: AbortSignal,
): Promise<string> {
  if (!response.body) return response.text();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let sawBytes = false;
  const readStartedAt = Date.now();

  try {
    while (true) {
      const chunk = await readStreamChunkWithTimeout(
        reader,
        signal,
        sawBytes ? STREAM_CHUNK_IDLE_TIMEOUT_MS : STREAM_FIRST_BYTE_TIMEOUT_MS,
      );
      if (chunk.done) break;
      if (!chunk.value || chunk.value.length === 0) continue;
      sawBytes = true;
      text += decoder.decode(chunk.value, { stream: true });
      const sseState = reassembleSSE(text);
      const hasMeaningfulSseContent =
        sseState.content.trim().length > 0 ||
        Boolean(sseState.finishReason);
      if (
        !hasMeaningfulSseContent &&
        Date.now() - readStartedAt >= STREAM_MEANINGFUL_SSE_TIMEOUT_MS
      ) {
        try { await reader.cancel('stream_meaningful_content_timeout'); } catch { /* ignore */ }
        break;
      }
      if (/(^|\n)\s*data:\s*\[DONE\]/.test(text)) {
        try { await reader.cancel('stream_done_seen'); } catch { /* ignore */ }
        break;
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    try { await reader.cancel('stream_read_timeout'); } catch { /* ignore */ }
  }

  text += decoder.decode();
  return text;
}

/**
 * Streaming LLM call (proxy path).
 *
 * We use `stream: true` so the Supabase llm-proxy edge function pipes the
 * upstream response immediately (it returns `proxyResp.body` at the first byte
 * instead of `await proxyResp.text()`-ing the whole generation). The non-
 * streaming path blocked the edge-function handler for the entire generation and
 * was killed by Supabase `WallClockTime` on long coder runs — surfaced to the
 * client as `WORKER_RESOURCE_LIMIT` / HTTP 546. Streaming keeps the connection
 * actively flowing so the handler returns fast and the wall-clock kill never
 * fires.
 *
 * The full SSE body is reassembled client-side (reassembleSSE) and normalised
 * back into the OpenAI-shaped JSON the downstream parser already expects, so the
 * <<<FILE>>>/<<<END>>> marker parsing, usage extraction, and the single
 * `onChunk(fullContent)` contract all keep working unchanged. Providers that
 * ignore `stream: true` and return plain JSON are passed through untouched.
 *
 * The model is always taken from the resolved route (user-configured) — never
 * hardcoded here.
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
  /**
   * Stream the proxy call. Only needed for LONG generations (the coder) that
   * would otherwise hold the Supabase edge function past its ~150s WallClockTime.
   * Short steps (architect/clarify/…) stay non-streaming: a single atomic
   * JSON.parse of the whole body is far more robust than reassembling many SSE
   * frames, where one dropped frame silently corrupts JSON / FILE markers.
   */
  stream?:        boolean;
  /** Reclassify this step's own timeout as a normal error instead of a user abort. */
  timeoutAsError?: boolean;
}): Promise<void> {
  // route/body/headers are reassignable so a model-unavailable failure can retry
  // with the slot's configured fallback model (fallback1) — see the attempt loop below.
  let route = resolveRoute(input.slot, input.routeOverrides);
  const useStream = input.stream ?? false;
  const fallbackRoute = resolveFallbackRoute(input.slot, route.modelId);
  const primaryReserveRoute = input.slot === 'build'
    ? resolveRouteOrSkip('primary', input.routeOverrides)
    : null;
  const localCliReserveRoutes = resolveLocalCliReserveRoutes(input.slot, route.provider);
  const additionalRouteAttempts = [
    fallbackRoute,
    primaryReserveRoute,
    ...localCliReserveRoutes,
  ].filter((candidate, index, arr): candidate is ResolvedRoute => (
    Boolean(candidate) &&
    !isSameResolvedRoute(candidate, route) &&
    arr.findIndex(other => isSameResolvedRoute(other ?? null, candidate)) === index
  ));
  const buildBody = (r: ResolvedRoute, streamEnabled = useStream) => JSON.stringify({
    model:       Orchestrator.normalizeModelId(r.modelId, r.endpoint),
    messages:    [
      { role: 'system', content: input.system },
      { role: 'user',   content: input.user },
    ],
    stream:      streamEnabled,
    // Under streaming, ask OpenAI-compatible providers (DeepSeek/OpenAI/OpenRouter/
    // Groq/Mistral) to emit a final usage chunk so billing keeps working.
    ...(streamEnabled ? { stream_options: { include_usage: true } } : {}),
    temperature: 0.3,
    max_tokens:  input.maxTokens,
  });
  const buildHeaders = (r: ResolvedRoute): Record<string, string> => ({
    'Authorization': `Bearer ${r.apiKey}`,
    'Content-Type':  'application/json',
    'HTTP-Referer':  typeof window !== 'undefined' ? window.location.origin : '',
  });
  let body = buildBody(route);
  let headers = buildHeaders(route);

  // Pre-call diagnostics: safe payload metrics only — no prompt text, no API key.
  const systemCharCount = input.system.length;
  const userCharCount   = input.user.length;
  const totalCharCount  = systemCharCount + userCharCount;
  const recordDiag = (r: ResolvedRoute) => recordLlmCallDiagnostics({
    llm_call_step:              slotToStepName(input.slot),
    provider:                   r.provider,
    model_id:                   Orchestrator.normalizeModelId(r.modelId, r.endpoint),
    endpoint_kind:              r.endpointKind    ?? 'unknown',
    route_authority:            r.sourceAuthority ?? 'unknown_authority',
    system_prompt_char_count:   systemCharCount,
    user_payload_char_count:    userCharCount,
    total_prompt_char_count:    totalCharCount,
    estimated_token_count:      Math.round(totalCharCount / 4),
    messages_count:             2,
    max_tokens:                 input.maxTokens,
    request_payload_byte_size:  body.length,
    streaming_enabled:          useStream,
  });
  recordDiag(route);

  const ctrl = new AbortController();
  let timedOut = false;
  let hasAdditionalRoutesAvailable = additionalRouteAttempts.length > 0;
  const effectiveTimeoutMs = additionalRouteAttempts.some(candidate =>
    candidate.provider === 'codex-cli' || candidate.provider === 'claude-cli',
  )
    ? Math.max(input.timeoutMs, LOCAL_CLI_RESERVE_TIMEOUT_MS)
    : input.timeoutMs;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, effectiveTimeoutMs);
  const onCallerAbort = () => ctrl.abort();
  input.signal?.addEventListener('abort', onCallerAbort, { once: true });

  const callStart = Date.now();
  try {
    const doFetch = async (): Promise<string> => {
      if (input.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      // CLI providers run through the local backend (no Supabase edge function,
      // no wall-clock limit) and already return a single JSON body. This bypasses
      // LLMProxy entirely (it isn't an HTTP LLM API call), so it needs its own
      // DiagnosticIntercept check to stay on the same interception path as every
      // other LLM-dependent step — see DiagnosticIntercept.ts's docstring.
      if (route.provider === 'claude-cli' || route.provider === 'codex-cli') {
        const cliRequestBody = JSON.stringify({
          provider: route.provider === 'codex-cli' ? 'codex' : 'claude',
          model: route.modelId,
          systemPrompt: input.system,
          userPrompt: input.user,
        });
        const intercepted = await interceptForDiagnosticRun(
          '/api/quality/llm-run',
          { 'Content-Type': 'application/json' },
          cliRequestBody,
          input.slot,
        );
        if (intercepted) return intercepted.text();

        const resp = await fetch('/api/quality/llm-run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: cliRequestBody,
          signal: ctrl.signal,
        });
        if (!resp.ok) {
          const errText = await resp.text().catch(() => '');
          throw new Error(`LLM ${resp.status}: ${errText.slice(0, 300)}`);
        }
        return resp.text();
      }

      // Non-streaming proxy path (short steps): one atomic JSON body. Far more
      // robust than SSE reassembly — used for architect/clarify/etc.
      if (!useStream) {
        const resp = await llmFetch(route.endpoint, headers, body);
        if (!resp.ok) {
          const errText = await resp.text().catch(() => '');
          throw new Error(`LLM ${resp.status}: ${errText.slice(0, 300)}`);
        }
        return resp.text();
      }

      // Streaming proxy path (coder only): the edge function returns at the first
      // byte and is never killed by WallClockTime while a long generation completes.
      // llmFetchStream throws on a non-2xx status (classified downstream).
      const fetchNonStreamFallback = async (reason: string): Promise<string> => {
        console.warn(
          `[streamCall] empty streaming body for slot=${input.slot} model=${route.modelId}; ` +
          `retrying same route with stream=false (${reason})`,
        );
        const nonStreamResp = await llmFetch(
          route.endpoint,
          headers,
          buildBody(route, false),
          input.slot,
        );
        if (!nonStreamResp.ok) {
          const errText = await nonStreamResp.text().catch(() => '');
          throw new Error(`LLM ${nonStreamResp.status}: ${errText.slice(0, 300)}`);
        }
        const nonStreamText = await nonStreamResp.text();
        if (!nonStreamText.trim()) {
          throw new Error('LLM 200: empty response body after stream fallback');
        }
        return nonStreamText;
      };
      const handleStreamDegradation = async (reason: string, _label: string): Promise<string> =>
        fetchNonStreamFallback(reason);

      const streamResp = await llmFetchStream(route.endpoint, headers, body, ctrl.signal);
      const sseText = await readStreamingResponseText(streamResp, ctrl.signal);
      if (!sseText.trim()) {
        return handleStreamDegradation('empty_body', 'empty streaming body');
      }
      // OpenAI-compatible providers emit `data: {...}` SSE frames. Reassemble them
      // into the single JSON shape the parser below already understands. Providers
      // that ignored `stream: true` and returned plain JSON are passed through.
      const looksLikeSSE = /(^|\n)\s*data:/.test(sseText);
      if (!looksLikeSSE) return sseText;
      const r = reassembleSSE(sseText);
      if (!r.content.trim() && !r.finishReason) {
        return handleStreamDegradation('empty_sse_content', 'empty SSE content');
      }
      if (!r.finishReason) {
        return handleStreamDegradation('missing_finish_reason', 'stream ended without finish_reason');
      }
      return JSON.stringify({
        model: r.model ?? Orchestrator.normalizeModelId(route.modelId, route.endpoint),
        choices: [{ message: { content: r.content }, finish_reason: r.finishReason }],
        ...(r.usage ? { usage: r.usage } : {}),
      });
    };
    let retryUsed = false;
    let raw = '';
    // Attempt the primary model, then the configured fallback1 if the primary model
    // is UNAVAILABLE (e.g. a dead model id → HTTP 404). doFetch closes over the
    // reassignable route/body/headers, so switching the route switches the request.
    const routeAttempts: ResolvedRoute[] = [route, ...additionalRouteAttempts];
    let done = false;
    for (let ai = 0; ai < routeAttempts.length; ai++) {
      hasAdditionalRoutesAvailable = ai < routeAttempts.length - 1;
      if (ai > 0) {
        const prevModel = route.modelId;
        route = routeAttempts[ai];
        body = buildBody(route);
        headers = buildHeaders(route);
        recordDiag(route);
        console.warn(`[streamCall] model "${prevModel}" degraded — falling back to "${route.modelId}" [${route.sourceAuthority}]`);
      }
      try {
        const callResult = await executeWithClassifiedRetry(slotToStepName(input.slot), doFetch);
        retryUsed = callResult.retryUsed;
        raw = callResult.result;
        done = true;
        break;
      } catch (llmErr) {
        const timedOutErr =
          input.timeoutAsError &&
          timedOut &&
          !input.signal?.aborted &&
          llmErr instanceof DOMException &&
          llmErr.name === 'AbortError';
        const normalizedErr = timedOutErr
          ? new Error(`LLM timed out after ${effectiveTimeoutMs}ms`)
          : llmErr;
        const canFallback =
          ai < routeAttempts.length - 1 &&
          isRouteFallbackEligibleError(normalizedErr);
        if (
          canFallback &&
          normalizedErr instanceof LlmTransportError &&
          normalizedErr.category === 'missing_provider_key'
        ) {
          const nextDistinctCredentialsIndex = routeAttempts.findIndex((candidate, index) => (
            index > ai &&
            (
              candidate.provider !== route.provider ||
              candidate.endpoint !== route.endpoint ||
              candidate.apiKey !== route.apiKey
            )
          ));
          if (nextDistinctCredentialsIndex > ai + 1) {
            ai = nextDistinctCredentialsIndex - 1;
          }
        }
        if (canFallback) continue;
        recordLlmCallOutcome({
          llm_call_step:    slotToStepName(input.slot),
          response_time_ms: Date.now() - callStart,
          final_status:     (normalizedErr instanceof LlmTransportError || timedOutErr) ? 'failed' : 'aborted',
          http_status:      (normalizedErr instanceof LlmTransportError) ? normalizedErr.httpStatus : 0,
          error_category:   (normalizedErr instanceof LlmTransportError) ? normalizedErr.category : undefined,
        });
        throw normalizedErr;
      }
    }
    if (!done) throw new Error(`streamCall exhausted ${routeAttempts.length} route attempt(s) for slot ${input.slot}`);
    recordLlmCallOutcome({
      llm_call_step:    slotToStepName(input.slot),
      response_time_ms: Date.now() - callStart,
      final_status:     retryUsed ? 'retry_success' : 'success',
      http_status:      0,
    });
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
 * Reassembles an OpenAI-compatible SSE stream into a single result.
 * Walks `data: {...}` frames, concatenating `delta.content` / `message.content`,
 * and captures the trailing `usage` and `model` fields when present (providers
 * emit usage in a final choices-less frame when stream_options.include_usage is set).
 */
function reassembleSSE(raw: string): {
  content: string;
  finishReason: string;
  usage?: unknown;
  model?: string;
} {
  let content = '';
  let finishReason = '';
  let usage: unknown;
  let model: string | undefined;
  for (const line of raw.split('\n')) {
    const trimmedLine = line.startsWith('data:') ? line : line.trimStart();
    if (!trimmedLine.startsWith('data:')) continue;
    const payload = trimmedLine.slice(trimmedLine.indexOf('data:') + 5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const parsed = JSON.parse(payload);
      if (parsed?.usage) usage = parsed.usage;
      if (typeof parsed?.model === 'string') model = parsed.model;
      const choice = parsed?.choices?.[0];
      if (!choice) continue;
      const piece = choice.delta?.content ?? choice.message?.content ?? '';
      if (typeof piece === 'string') content += piece;
      if (choice.finish_reason) finishReason = choice.finish_reason;
    } catch { /* skip malformed line */ }
  }
  return { content, finishReason, usage, model };
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

export function canonicalizeBareDeltaPathToKnownPath(
  path: string,
  knownPaths: Iterable<string>,
): string {
  const normalized = normaliseDeltaPath(path);
  if (!normalized) return normalized;

  const known = Array.from(new Set(
    Array.from(knownPaths)
      .map(candidate => normaliseDeltaPath(candidate))
      .filter(candidate => candidate.length > 0),
  ));
  if (known.length === 0) return normalized;

  const exact = new Set(known);
  if (exact.has(normalized)) return normalized;
  if (normalized.includes('/')) return normalized;

  const basenameMatches = known.filter(candidate => (
    candidate === normalized || candidate.endsWith(`/${normalized}`)
  ));
  return basenameMatches.length === 1 ? basenameMatches[0] : normalized;
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
    '- Include config/navigation.ts as a meaningful product navigation delta when labels or product wording must change; keep the canonical route contract from the skeleton shell.',
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
  // ── Universal product-identity slots ──────────────────────────────────────
  // Force the skeleton's identity files into the plan so the coder fills them with
  // THIS product's name/copy/seed/nav instead of leaving the carcass defaults
  // (AppName, Morning intention, generic Home/Create/Progress/Profile). The architect
  // often omits these editable files, the coder then never touches them, and a generic
  // shell ships — the exact "theme lost" failure. Applies to every skeleton; the
  // product-identity gate is the backstop that catches any survivor.
  const identityEditable = new Set(
    getEditableSkeletonFiles(input.skeletonId).map(p => p.replace(/^src\//, '')),
  );
  const IDENTITY_SLOTS: ReadonlyArray<readonly [string, string]> = [
    ['config/app.ts', 'Product identity for THIS product: real app name and tagline — never "AppName" or generic copy.'],
    ['data/seed.ts', 'Seed data: realistic domain entities/records for THIS product — never generic placeholder seed (no "Morning intention" etc.).'],
    ['config/navigation.ts', "Navigation labels/destinations for THIS product's real surfaces — not generic Home/Create/Progress/Profile."],
  ];
  const identityTree: Record<string, string> = { ...input.fileTree };
  for (const [path, purpose] of IDENTITY_SLOTS) {
    if (identityEditable.has(path) && !identityTree[path]) identityTree[path] = purpose;
  }
  const identityInput: AugmentArchitectPlanInput = { ...input, fileTree: identityTree };

  if (!(input.skeletonId === 'mobile-app' && isHabitTrackerPrompt(input.prompt))) {
    return identityInput;
  }

  // Strip landing-page section components — they are inappropriate for a mobile-app skeleton
  // and consume coder token budget, preventing habit-tracker page/config/data modifications.
  const SECTION_PATTERN = /^(?:src\/)?components\/sections\//;
  const fileTree: Record<string, string> = Object.fromEntries(
    Object.entries(identityInput.fileTree).filter(([p]) => !SECTION_PATTERN.test(p)),
  );
  const ensureFile = (path: string, purpose: string) => {
    if (!fileTree[path]) fileTree[path] = purpose;
  };

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

