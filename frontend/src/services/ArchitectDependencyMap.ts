/**
 * ArchitectDependencyMap — deterministic classification of runArchitect output fields.
 *
 * Diagnostic/advisory only. Does not change runtime behavior.
 * Does not remove runArchitect. Does not alter runCoder input.
 * Does not block generation.
 *
 * Purpose: before reducing the architect role, identify exactly which fields
 * are still required by the pipeline and which are advisory/duplicative now
 * that the builder (PR #13) owns architecture + self-test planning.
 *
 * Field classification is derived from static inspection of every consumer
 * of ArchitectPlan across:
 *   - ProtoPipeline.ts        (pipeline guard, coder system prompt)
 *   - SkeletonIntegrationPlanner.ts  (extractArchitectInsights)
 *   - FunctionalFlowPlanner.ts      (dataModel hint in functionalNotes)
 *   - ProductSpecificityPlanner.ts  (collectArchitectDataModel)
 *   - ScreenCompositionPlanner.ts   (receives architectPlan but does not read it)
 */

import type { ArchitectPlan } from './ProtoPipeline';

// ── Field category vocabulary ─────────────────────────────────────────────────

export type ArchitectFieldCategory =
  | 'required_for_pipeline'
  | 'required_for_compile_or_files'
  | 'required_for_planners'
  | 'advisory_for_coder'
  | 'duplicated_by_market_aware_brief'
  | 'candidate_for_removal_or_downscoping';

export interface ArchitectFieldEntry {
  /** Field name as it appears on ArchitectPlan. */
  field: keyof ArchitectPlan;
  /** One or more dependency categories for this field. */
  categories: ArchitectFieldCategory[];
  /** True when the field is present and non-empty in the inspected plan. */
  presentInPlan: boolean;
  /** Human-readable rationale for the classification. */
  notes: string;
}

export interface ArchitectDependencyMap {
  fields: ArchitectFieldEntry[];
  /** Fields with at least one 'required_for_pipeline' category. */
  required_for_pipeline: string[];
  /** Fields with at least one 'required_for_compile_or_files' category. */
  required_for_compile_or_files: string[];
  /** Fields with at least one 'required_for_planners' category. */
  required_for_planners: string[];
  /** Fields with at least one 'advisory_for_coder' category. */
  advisory_for_coder: string[];
  /** Fields with at least one 'duplicated_by_market_aware_brief' category. */
  duplicated_by_market_aware_brief: string[];
  /** Fields with at least one 'candidate_for_removal_or_downscoping' category. */
  candidate_for_removal_or_downscoping: string[];
}

// ── Diagnostics types ─────────────────────────────────────────────────────────

export interface ArchitectRoleDiagnosticsIssue {
  code: string;
  severity: 'info' | 'warn' | 'advisory';
  message: string;
}

export interface ArchitectRoleDiagnosticsResult {
  /** Architect still provides the technical file tree (fileTree, deltaFiles). */
  architect_technical_ownership_detected: boolean;
  /** Architect summary/notes duplicate builder-owned brief content. */
  duplicate_product_strategy_detected: boolean;
  /** Both architect fileTree and builder-owned self-plan are injected into coder. */
  conflicting_architecture_instructions: boolean;
  /** Fields that would be missing from the pipeline if architect were reduced. */
  missing_required_fields_if_reduced: string[];
  /** Fields safe to move into the product strategist brief instead. */
  fields_safe_to_move_to_product_strategist: string[];
  /** Fields that must remain until a replacement adapter is built. */
  fields_must_remain_until_replacement: string[];
  /** Advisory issues — does not block generation. */
  issues: ArchitectRoleDiagnosticsIssue[];
}

export interface ArchitectDependencyTelemetry {
  architect_dependency_required_count: number;
  architect_dependency_advisory_count: number;
  architect_fields_candidate_for_downscope_count: number;
  architect_technical_ownership_detected: boolean;
  replacement_adapter_needed: boolean;
}

// ── Static field catalogue ────────────────────────────────────────────────────

/**
 * Static, deterministic catalogue derived from inspecting every consumer of
 * ArchitectPlan. Each entry maps a field to its dependency categories and
 * a rationale for the classification.
 *
 * Fields are listed in descending order of pipeline criticality.
 */
const FIELD_CATALOGUE: ReadonlyArray<{
  field: keyof ArchitectPlan;
  categories: ArchitectFieldCategory[];
  notes: string;
}> = [
  {
    field: 'deltaFiles',
    categories: ['required_for_pipeline', 'required_for_compile_or_files'],
    notes:
      'Hard pipeline guard: plan.deltaFiles.length === 0 returns fail("architect"). ' +
      'Coder uses deltaFiles for file list serialization, retry logic (missing files), ' +
      'and allowed-paths filter on coder output.',
  },
  {
    field: 'fileTree',
    categories: ['required_for_pipeline', 'required_for_compile_or_files', 'required_for_planners'],
    notes:
      'Coder receives "DELTA FILE TREE FROM ARCHITECT (source of truth)" verbatim in system prompt. ' +
      'SkeletonIntegrationPlanner.extractArchitectInsights reads fileTree paths to classify ' +
      'screen/component/hook/data files. deltaFiles is derived from fileTree during normalization.',
  },
  {
    field: 'appName',
    categories: ['required_for_compile_or_files'],
    notes:
      'Passed into buildSkeletonPromptBlock to provide app identity context in the coder system prompt.',
  },
  {
    field: 'pages',
    categories: ['required_for_compile_or_files', 'required_for_planners'],
    notes:
      'Coder receives "PAGES TO WIRE INTO THE ROUTER" from this field. ' +
      'SkeletonIntegrationPlanner.extractArchitectInsights also reads pages file paths ' +
      'alongside fileTree paths.',
  },
  {
    field: 'contextContract',
    categories: ['required_for_compile_or_files'],
    notes:
      'Injected as "CONTEXT CONTRACT FROM ARCHITECT — READ CAREFULLY" in the coder system prompt. ' +
      'Provides cross-file import contracts (e.g. "use useApp() from AppContext, not useLocalStorage").',
  },
  {
    field: 'dataModel',
    categories: ['required_for_planners'],
    notes:
      'FunctionalFlowPlanner appends "Architect data model hint: <dataModel>" to functionalNotes. ' +
      'ProductSpecificityPlanner.collectArchitectDataModel uses it for domain entity context.',
  },
  {
    field: 'summary',
    categories: [
      'advisory_for_coder',
      'duplicated_by_market_aware_brief',
      'candidate_for_removal_or_downscoping',
    ],
    notes:
      'Only used as user-message suffix: prompt + "\\n\\nSummary: " + plan.summary. ' +
      'Market brief productPromise and productCategory now cover the same strategic intent. ' +
      'Safe to downscope once market brief coverage is validated.',
  },
  {
    field: 'notes',
    categories: [
      'advisory_for_coder',
      'duplicated_by_market_aware_brief',
      'candidate_for_removal_or_downscoping',
    ],
    notes:
      'Injected as "ADDITIONAL REQUIREMENTS" block in the coder system prompt. ' +
      'Market brief marketInsights, requiredMoments, and selfTestChecklist now cover similar content. ' +
      'Safe to move to product strategist brief.',
  },
  {
    field: 'skeleton',
    categories: ['advisory_for_coder', 'candidate_for_removal_or_downscoping'],
    notes:
      'Stored in the ArchitectPlan result but never validated against config.skeletonId downstream. ' +
      'The authoritative skeleton identifier comes from ProtoPipeline config, not this field. ' +
      'Redundant with config.skeletonId.',
  },
  {
    field: 'rawResponse',
    categories: ['advisory_for_coder', 'candidate_for_removal_or_downscoping'],
    notes:
      'Debug/logging artifact. Stored in plan result for tracing but not consumed by any ' +
      'downstream planner, coder step, or compile logic.',
  },
] as const;

// ── Internal helpers ──────────────────────────────────────────────────────────

function isFieldPresent(plan: ArchitectPlan, field: keyof ArchitectPlan): boolean {
  const value = plan[field];
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return true;
}

// ── Public exports ────────────────────────────────────────────────────────────

/**
 * Classify each ArchitectPlan field into dependency categories.
 *
 * Deterministic — no LLM calls. Classification is static; presentInPlan
 * reflects the actual plan passed in.
 */
export function buildArchitectDependencyMap(plan: ArchitectPlan): ArchitectDependencyMap {
  const fields: ArchitectFieldEntry[] = FIELD_CATALOGUE.map(entry => ({
    field: entry.field,
    categories: [...entry.categories],
    presentInPlan: isFieldPresent(plan, entry.field),
    notes: entry.notes,
  }));

  const byCategory = (cat: ArchitectFieldCategory): string[] =>
    fields.filter(f => f.categories.includes(cat)).map(f => f.field as string);

  return {
    fields,
    required_for_pipeline:                byCategory('required_for_pipeline'),
    required_for_compile_or_files:        byCategory('required_for_compile_or_files'),
    required_for_planners:                byCategory('required_for_planners'),
    advisory_for_coder:                   byCategory('advisory_for_coder'),
    duplicated_by_market_aware_brief:     byCategory('duplicated_by_market_aware_brief'),
    candidate_for_removal_or_downscoping: byCategory('candidate_for_removal_or_downscoping'),
  };
}

/**
 * Evaluate architect role diagnostics.
 *
 * Advisory only — does not change runtime behavior.
 * Does not remove runArchitect. Does not alter runCoder input.
 * Does not block generation.
 *
 * @param plan                 Normalized ArchitectPlan from runArchitect.
 * @param context.marketAwareBriefInjected       True when market brief is in coder planning blocks.
 * @param context.builderOwnedSelfPlanInjected   True when PR #13 self-plan block is injected.
 */
export function evaluateArchitectRoleDiagnostics(
  plan: ArchitectPlan,
  context: {
    marketAwareBriefInjected: boolean;
    builderOwnedSelfPlanInjected: boolean;
  },
): ArchitectRoleDiagnosticsResult {
  const map = buildArchitectDependencyMap(plan);
  const issues: ArchitectRoleDiagnosticsIssue[] = [];

  // Technical ownership: architect provides the file tree — the structural build target.
  const architectTechnicalOwnership =
    isFieldPresent(plan, 'fileTree') || isFieldPresent(plan, 'deltaFiles');
  if (architectTechnicalOwnership) {
    issues.push({
      code: 'ARCH_OWNS_FILE_TREE',
      severity: 'info',
      message:
        'Architect still owns technical architecture: fileTree and deltaFiles define the build ' +
        'target. These fields are required_for_pipeline with no replacement adapter yet.',
    });
  }

  // Duplicate product strategy: market brief now covers summary + notes intent.
  const duplicateProductStrategy =
    context.marketAwareBriefInjected &&
    (isFieldPresent(plan, 'summary') || isFieldPresent(plan, 'notes'));
  if (duplicateProductStrategy) {
    issues.push({
      code: 'DUPLICATE_PRODUCT_STRATEGY',
      severity: 'advisory',
      message:
        'Architect summary and/or notes duplicate builder-owned brief content ' +
        '(market brief is injected). These fields are safe to downscope once ' +
        'market brief coverage is validated.',
    });
  }

  // Conflicting architecture instructions in the coder prompt.
  // Architect injects "source of truth" fileTree; PR #13 tells the coder to own architecture.
  const conflictingInstructions =
    context.builderOwnedSelfPlanInjected && isFieldPresent(plan, 'fileTree');
  if (conflictingInstructions) {
    issues.push({
      code: 'CONFLICTING_ARCH_INSTRUCTIONS',
      severity: 'warn',
      message:
        'Coder receives both "DELTA FILE TREE FROM ARCHITECT (source of truth)" and ' +
        'builder-owned architecture self-plan instructions (PR #13). ' +
        'Architect fileTree is still the compile/file target while the builder self-plan ' +
        'instructs the coder to own architecture independently. ' +
        'Resolve by clarifying which instruction is authoritative for structural decisions.',
    });
  }

  // Required fields that would be missing if architect were reduced.
  const missingIfReduced = map.fields
    .filter(
      f =>
        f.presentInPlan &&
        (f.categories.includes('required_for_pipeline') ||
          f.categories.includes('required_for_compile_or_files')),
    )
    .map(f => f.field as string);

  // Fields safe to move to product strategist brief (advisory/duplicated + candidate).
  const safeToMove = map.fields
    .filter(
      f =>
        f.presentInPlan &&
        f.categories.includes('candidate_for_removal_or_downscoping') &&
        (f.categories.includes('duplicated_by_market_aware_brief') ||
          f.categories.includes('advisory_for_coder')),
    )
    .map(f => f.field as string);

  // Fields that must remain until a replacement adapter provides them instead.
  const mustRemain = map.fields
    .filter(f => f.presentInPlan && f.categories.includes('required_for_pipeline'))
    .map(f => f.field as string);

  return {
    architect_technical_ownership_detected: architectTechnicalOwnership,
    duplicate_product_strategy_detected:    duplicateProductStrategy,
    conflicting_architecture_instructions:  conflictingInstructions,
    missing_required_fields_if_reduced:     missingIfReduced,
    fields_safe_to_move_to_product_strategist: safeToMove,
    fields_must_remain_until_replacement:   mustRemain,
    issues,
  };
}

/**
 * Serialize ArchitectDependencyMap + diagnostics to flat telemetry object.
 *
 * Advisory only — does not affect runtime behavior.
 * Intended for [architect-dependency] log line in ProtoPipeline.ts.
 */
export function serializeArchitectDependencyTelemetry(
  map: ArchitectDependencyMap,
  diagnostics: ArchitectRoleDiagnosticsResult,
): ArchitectDependencyTelemetry {
  const presentRequired = map.fields.filter(
    f =>
      f.presentInPlan &&
      (f.categories.includes('required_for_pipeline') ||
        f.categories.includes('required_for_compile_or_files') ||
        f.categories.includes('required_for_planners')),
  ).length;

  const presentAdvisory = map.fields.filter(
    f => f.presentInPlan && f.categories.includes('advisory_for_coder'),
  ).length;

  return {
    architect_dependency_required_count:             presentRequired,
    architect_dependency_advisory_count:             presentAdvisory,
    architect_fields_candidate_for_downscope_count:  map.candidate_for_removal_or_downscoping.length,
    architect_technical_ownership_detected:          diagnostics.architect_technical_ownership_detected,
    replacement_adapter_needed:                      diagnostics.fields_must_remain_until_replacement.length > 0,
  };
}
