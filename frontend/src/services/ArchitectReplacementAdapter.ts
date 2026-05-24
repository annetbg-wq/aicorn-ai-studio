/**
 * ArchitectReplacementAdapter — deterministic adapter that builds a minimal
 * ArchitectPlan-compatible object from existing non-architect inputs.
 *
 * Advisory/helper-only in this commit.
 * Does NOT replace runArchitect output.
 * Does NOT affect production flow.
 * Does NOT call any LLM.
 *
 * Purpose: prepare a deterministic replacement adapter foundation for a
 * future step where runArchitect may be reduced or replaced.
 * The adapter output may optionally be used for shadow/telemetry comparison
 * after runArchitect (non-blocking, never alters the pipeline result).
 *
 * Adapter-generated fields are clearly marked:
 *   - rawResponse: "architect-replacement-adapter"
 *   - notes:  first item is "adapter-generated — ..."
 *   - contextContract: prefixed "[adapter-generated] [builder-owned] [market-aware-source]"
 */

import type { ArchitectPlan } from './ProtoPipeline';
import type { MarketAwareBuilderBrief } from './MarketAwareBuilderBrief';
import type { ScreenCompositionPlan } from './ScreenCompositionPlanner';
import type { ProductSpecificityPlan } from './ProductSpecificityPlanner';
import { buildArchitectDependencyMap } from './ArchitectDependencyMap';

// ── Input type ────────────────────────────────────────────────────────────────

export interface BuildMinimalArchitectPlanAdapterInput {
  /** The market-aware builder brief (product identity, required moments, workflow). */
  brief: MarketAwareBuilderBrief;
  /** The selected skeleton ID (source: ProtoPipeline config.skeletonId). */
  skeletonId: string;
  /**
   * Expected / delta files the coder should produce.
   * This is the primary structural input and must be non-empty for a safe plan.
   */
  expectedFiles: Array<{ path: string; purpose: string }>;
  /** Optional screen composition plan (provides the page/route list). */
  screenCompositionPlan?: ScreenCompositionPlan;
  /** Optional product specificity plan (provides the domain data model). */
  productSpecificityPlan?: ProductSpecificityPlan;
  /** Optional explicit app name; if absent, derived from the brief. */
  appName?: string;
}

// ── Readiness diagnostics ─────────────────────────────────────────────────────

export type AdapterReadinessIssueCode =
  | 'MISSING_DELTA_FILES'
  | 'MISSING_FILE_TREE'
  | 'MISSING_PAGES'
  | 'MISSING_APP_NAME'
  | 'MISSING_PRODUCT_CATEGORY'
  | 'MISSING_SOURCE_BRIEF'
  | 'UNSAFE_EMPTY_ADAPTER_OUTPUT'
  | 'FILE_TREE_DELTA_FILES_MISMATCH'
  | 'MISSING_REQUIRED_FIELD';

export interface AdapterReadinessDiagnosticIssue {
  code: AdapterReadinessIssueCode;
  severity: 'error' | 'warn' | 'info';
  message: string;
}

export interface ArchitectReplacementAdapterReadiness {
  /** True when adapter output has no error-severity issues and satisfies all required fields. */
  ready: boolean;
  /** True when adapter output satisfies every field in ArchitectDependencyMap required categories. */
  satisfiesRequiredFields: boolean;
  /** Required pipeline fields that are present in the adapter output. */
  presentRequiredFields: string[];
  /** Required pipeline fields that are absent from the adapter output. */
  missingRequiredFields: string[];
  /** Advisory issues. Does not block generation — adapter is helper-only. */
  issues: AdapterReadinessDiagnosticIssue[];
}

// ── Internal field builders ───────────────────────────────────────────────────

function deriveAppName(brief: MarketAwareBuilderBrief, override?: string): string {
  if (override && override.trim()) return override.trim();
  const words = brief.productVision.productPromise.split(/\s+/).slice(0, 3).join(' ');
  return words || 'App';
}

function buildSummary(brief: MarketAwareBuilderBrief): string {
  const { productPromise, targetUser, primaryUserOutcome } = brief.productVision;
  return `${productPromise} — targeting ${targetUser}. Primary outcome: ${primaryUserOutcome}`;
}

function buildPages(
  brief: MarketAwareBuilderBrief,
  screenCompositionPlan?: ScreenCompositionPlan,
): NonNullable<ArchitectPlan['pages']> {
  // Prefer the structured screen composition plan when available.
  if (screenCompositionPlan && screenCompositionPlan.screens.length > 0) {
    return screenCompositionPlan.screens.map(screen => ({
      path: screen.routeHint ?? `/${screen.id}`,
      name: screen.title,
      file: `pages/${screen.title.replace(/\s+/g, '')}.tsx`,
      purpose: screen.layoutIntent,
    }));
  }

  // Fallback: derive pages from the brief's requiredScreens (required moments).
  const moments = brief.builderBrief.requiredScreens;
  if (moments.length > 0) {
    return moments.map((moment, i) => {
      const label = moment.split('(')[0].trim();
      const slug = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const componentName = slug
        .split('-')
        .map(s => s.charAt(0).toUpperCase() + s.slice(1))
        .join('');
      return {
        path: i === 0 ? '/' : `/${slug}`,
        name: label,
        file: `pages/${componentName}.tsx`,
        purpose: moment,
      };
    });
  }

  // Safe ultimate fallback.
  return [{ path: '/', name: 'Home', file: 'pages/Home.tsx', purpose: 'Main application screen' }];
}

function buildFileTree(
  expectedFiles: Array<{ path: string; purpose: string }>,
): Record<string, string> {
  const tree: Record<string, string> = {};
  for (const f of expectedFiles) {
    tree[f.path] = f.purpose;
  }
  return tree;
}

function buildDataModel(
  brief: MarketAwareBuilderBrief,
  productSpecificityPlan?: ProductSpecificityPlan,
): string {
  if (productSpecificityPlan && productSpecificityPlan.domainEntities.length > 0) {
    return productSpecificityPlan.domainEntities
      .slice(0, 3)
      .map(e => {
        const fieldList = e.fields.length > 0 ? e.fields.map(f => f.name).join(', ') : 'id, name';
        return `${e.label} { ${fieldList} }`;
      })
      .join(' | ');
  }
  const { productCategory } = brief.marketInsight;
  const { primaryUserOutcome } = brief.productVision;
  return `[adapter-generated] ${productCategory} domain: ${primaryUserOutcome}`;
}

function buildContextContract(brief: MarketAwareBuilderBrief, skeletonId: string): string {
  const lines: string[] = [
    '[adapter-generated] [builder-owned] [market-aware-source]',
    `Product category: ${brief.marketInsight.productCategory}`,
    `Skeleton: ${skeletonId}`,
    `Product promise: ${brief.productVision.productPromise}`,
    `Core journey: ${brief.productVision.coreUserJourney}`,
    `Workflow: ${brief.builderBrief.productSpecificWorkflow}`,
    `Differentiator: ${brief.builderBrief.marketAwareDifferentiator}`,
  ];
  const constraints = brief.builderBrief.qualityConstraints;
  if (constraints.length > 0) {
    lines.push(`Quality constraints: ${constraints.slice(0, 3).join('; ')}`);
  }
  return lines.join('\n');
}

function buildAdapterNotes(brief: MarketAwareBuilderBrief): string[] {
  return [
    'adapter-generated — this plan was produced by ArchitectReplacementAdapter, not runArchitect',
    `Market insight: ${brief.marketInsight.differentiatorOpportunity}`,
    `Required workflow: ${brief.builderBrief.productSpecificWorkflow}`,
    ...brief.builderBrief.forbiddenGenericPlaceholders
      .slice(0, 2)
      .map(p => `Forbidden placeholder: ${p}`),
  ];
}

// ── Shadow telemetry types ────────────────────────────────────────────────────

export interface CompareArchitectPlanWithAdapterInput {
  /** The real ArchitectPlan produced by runArchitect. */
  realPlan: ArchitectPlan;
  /** The adapter-built ArchitectPlan produced by buildMinimalArchitectPlanAdapter. */
  adapterPlan: ArchitectPlan;
  /** Readiness evaluation for the adapter output. */
  adapterReadiness: ArchitectReplacementAdapterReadiness;
}

/** Flat telemetry object for the [architect-adapter-shadow] log line. */
export interface ArchitectAdapterShadowTelemetry {
  architect_adapter_shadow_enabled: true;
  adapter_compatible: boolean;
  adapter_compatibility_score: number;
  adapter_missing_fields_count: number;
  adapter_file_overlap_count: number;
  adapter_page_overlap_count: number;
  adapter_readiness_ok: boolean;
  adapter_replacement_safe_candidate: boolean;
}

export interface ArchitectAdapterComparisonResult {
  /** True when adapter plan is structurally compatible with the real plan (score ≥ threshold). */
  compatible: boolean;
  /** Normalised compatibility score: 0–1, weighted average of 8 comparison checks. */
  compatibilityScore: number;
  /** Items present in realPlan but absent from adapterPlan (paths, field names). */
  missingInAdapter: string[];
  /** Items present in adapterPlan but absent from realPlan (paths, field names). */
  extraInAdapter: string[];
  /** Value incompatibilities between real and adapter (e.g. skeleton, appName mismatch). */
  mismatches: string[];
  /** Flat telemetry for logging. */
  telemetry: ArchitectAdapterShadowTelemetry;
}

const COMPATIBILITY_THRESHOLD = 0.75;

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Build a minimal ArchitectPlan-compatible adapter output from non-architect inputs.
 *
 * Inputs: market-aware builder brief, selected skeleton ID, expected/delta files,
 * and optional screen composition + product specificity plans.
 *
 * Adapter-generated markers:
 *   - rawResponse: "architect-replacement-adapter"
 *   - notes[0]:    "adapter-generated — ..."
 *   - contextContract: prefixed "[adapter-generated] [builder-owned] [market-aware-source]"
 *
 * Advisory / helper-only — does NOT replace runArchitect.
 * Production behavior is unchanged.
 */
export function buildMinimalArchitectPlanAdapter(
  input: BuildMinimalArchitectPlanAdapterInput,
): ArchitectPlan {
  const { brief, skeletonId, expectedFiles, screenCompositionPlan, productSpecificityPlan, appName } =
    input;

  // Guarantee non-empty delta files and a matching file tree.
  // When no expectedFiles are provided, both use the same safe default so the
  // adapter output satisfies pipeline requirements (non-empty deltaFiles AND fileTree).
  const effectiveDeltaFiles =
    expectedFiles.length > 0
      ? expectedFiles
      : [{ path: 'pages/Home.tsx', purpose: 'Main application screen (safe default)' }];
  const fileTree = buildFileTree(effectiveDeltaFiles);
  const deltaFiles = effectiveDeltaFiles;

  return {
    appName: deriveAppName(brief, appName),
    // Cast is safe: skeleton is advisory-only per ArchitectDependencyMap; skeletonId here
    // comes from ProtoPipeline config which already validated the value.
    skeleton: skeletonId as ArchitectPlan['skeleton'],
    summary: buildSummary(brief),
    rawResponse: 'architect-replacement-adapter',
    fileTree,
    deltaFiles,
    pages: buildPages(brief, screenCompositionPlan),
    dataModel: buildDataModel(brief, productSpecificityPlan),
    contextContract: buildContextContract(brief, skeletonId),
    notes: buildAdapterNotes(brief),
  };
}

/**
 * Evaluate readiness diagnostics for an ArchitectReplacementAdapter output.
 *
 * Checks:
 *   - missing deltaFiles
 *   - missing fileTree
 *   - missing pages
 *   - missing appName
 *   - missing / generic product category from source brief
 *   - unsafe empty adapter output (all structural fields empty)
 *   - mismatch between expectedFiles and fileTree paths
 *   - whether adapter output satisfies required fields from ArchitectDependencyMap
 *
 * Advisory only — does not affect runtime behavior.
 * Does not block generation. Does not replace runArchitect.
 */
export function evaluateArchitectReplacementAdapterReadiness(
  input: BuildMinimalArchitectPlanAdapterInput,
  adapterOutput: ArchitectPlan,
): ArchitectReplacementAdapterReadiness {
  const issues: AdapterReadinessDiagnosticIssue[] = [];

  // 1. Missing deltaFiles
  if (!adapterOutput.deltaFiles || adapterOutput.deltaFiles.length === 0) {
    issues.push({
      code: 'MISSING_DELTA_FILES',
      severity: 'error',
      message:
        'Adapter output has no deltaFiles. The pipeline guard (deltaFiles.length === 0 → fail) ' +
        'would reject this plan if used in production.',
    });
  }

  // 2. Missing fileTree
  if (!adapterOutput.fileTree || Object.keys(adapterOutput.fileTree).length === 0) {
    issues.push({
      code: 'MISSING_FILE_TREE',
      severity: 'error',
      message:
        'Adapter output has an empty fileTree. The coder "source of truth" would be empty, ' +
        'breaking skeleton integration planner and file path validation.',
    });
  }

  // 3. Missing pages
  if (!adapterOutput.pages || adapterOutput.pages.length === 0) {
    issues.push({
      code: 'MISSING_PAGES',
      severity: 'warn',
      message:
        'Adapter output has no pages. Router wiring ("PAGES TO WIRE INTO THE ROUTER") ' +
        'would be absent from the coder prompt.',
    });
  }

  // 4. Missing appName
  if (!adapterOutput.appName || !adapterOutput.appName.trim()) {
    issues.push({
      code: 'MISSING_APP_NAME',
      severity: 'error',
      message:
        'Adapter output has no appName. App identity context (buildSkeletonPromptBlock) ' +
        'would be empty.',
    });
  }

  // 5. Missing / generic product category
  const category = input.brief?.marketInsight?.productCategory;
  if (!category || category === 'generic') {
    issues.push({
      code: 'MISSING_PRODUCT_CATEGORY',
      severity: 'warn',
      message:
        `Adapter input has no specific product category (got: ${category ?? 'undefined'}). ` +
        'Using safe generic defaults. Adapter output will be less precise.',
    });
  }

  // 6. Missing source brief
  if (!input.brief) {
    issues.push({
      code: 'MISSING_SOURCE_BRIEF',
      severity: 'error',
      message:
        'No source brief provided to the adapter. Cannot produce a meaningful plan ' +
        'without market-aware product context.',
    });
  }

  // 7. Unsafe empty adapter output (all three structural fields empty simultaneously)
  const allEmpty =
    (!adapterOutput.deltaFiles || adapterOutput.deltaFiles.length === 0) &&
    (!adapterOutput.fileTree || Object.keys(adapterOutput.fileTree).length === 0) &&
    (!adapterOutput.pages || adapterOutput.pages.length === 0);
  if (allEmpty) {
    issues.push({
      code: 'UNSAFE_EMPTY_ADAPTER_OUTPUT',
      severity: 'error',
      message:
        'Adapter output has empty deltaFiles, fileTree, and pages simultaneously. ' +
        'Using this plan in production would break the pipeline at multiple guard points.',
    });
  }

  // 8. Mismatch between expectedFiles and fileTree paths
  if (input.expectedFiles.length > 0 && adapterOutput.fileTree) {
    const expectedPaths = new Set(input.expectedFiles.map(f => f.path));
    const fileTreePaths = new Set(Object.keys(adapterOutput.fileTree));
    const missingFromTree = [...expectedPaths].filter(p => !fileTreePaths.has(p));
    const extraInTree = [...fileTreePaths].filter(p => !expectedPaths.has(p));
    if (missingFromTree.length > 0 || extraInTree.length > 0) {
      issues.push({
        code: 'FILE_TREE_DELTA_FILES_MISMATCH',
        severity: 'warn',
        message:
          `fileTree paths and expectedFiles paths do not fully align. ` +
          (missingFromTree.length > 0
            ? `Missing from fileTree: [${missingFromTree.join(', ')}]. `
            : '') +
          (extraInTree.length > 0 ? `Extra in fileTree: [${extraInTree.join(', ')}].` : ''),
      });
    }
  }

  // 9. Required fields from ArchitectDependencyMap
  const map = buildArchitectDependencyMap(adapterOutput);
  const requiredFieldSet = new Set([
    ...map.required_for_pipeline,
    ...map.required_for_compile_or_files,
  ]);

  const presentRequired = map.fields
    .filter(
      f =>
        f.presentInPlan &&
        (f.categories.includes('required_for_pipeline') ||
          f.categories.includes('required_for_compile_or_files')),
    )
    .map(f => f.field as string);

  const missingRequired = [...requiredFieldSet].filter(f => !presentRequired.includes(f));

  for (const field of missingRequired) {
    issues.push({
      code: 'MISSING_REQUIRED_FIELD',
      severity: 'error',
      message:
        `Adapter output is missing required pipeline field: "${field}". ` +
        'runArchitect cannot be replaced until this field is provided.',
    });
  }

  const satisfiesRequiredFields = missingRequired.length === 0;
  const ready =
    satisfiesRequiredFields && issues.filter(i => i.severity === 'error').length === 0;

  return {
    ready,
    satisfiesRequiredFields,
    presentRequiredFields: presentRequired,
    missingRequiredFields: missingRequired,
    issues,
  };
}

/**
 * Compare a real runArchitect plan against an adapter-built plan and return
 * advisory shadow telemetry.
 *
 * Advisory / helper-only — does NOT affect generation, planners, coder input,
 * compile behavior, quality gate, or any production output.
 * Does NOT mutate realPlan or adapterPlan.
 * Does NOT call any LLM.
 *
 * Scoring: 8 deterministic checks, each contributes an equal 1/8 share.
 *   1. deltaFiles path overlap fraction
 *   2. fileTree key overlap fraction
 *   3. pages path overlap fraction
 *   4. appName presence in both plans
 *   5. skeleton compatibility
 *   6. dataModel presence in both plans
 *   7. contextContract presence in both plans
 *   8. required pipeline fields present in adapter
 *
 * compatible = true when compatibilityScore ≥ 0.75.
 */
export function compareArchitectPlanWithAdapter(
  input: CompareArchitectPlanWithAdapterInput,
): ArchitectAdapterComparisonResult {
  const { realPlan, adapterPlan, adapterReadiness } = input;

  const missingInAdapter: string[] = [];
  const extraInAdapter: string[] = [];
  const mismatches: string[] = [];

  // ── 1. deltaFiles overlap ─────────────────────────────────────────────────
  const realDeltaPaths = new Set((realPlan.deltaFiles ?? []).map(f => f.path));
  const adapterDeltaPaths = new Set((adapterPlan.deltaFiles ?? []).map(f => f.path));
  const deltaOverlapItems = [...realDeltaPaths].filter(p => adapterDeltaPaths.has(p));
  for (const p of [...realDeltaPaths].filter(p => !adapterDeltaPaths.has(p))) {
    missingInAdapter.push(`deltaFile:${p}`);
  }
  for (const p of [...adapterDeltaPaths].filter(p => !realDeltaPaths.has(p))) {
    extraInAdapter.push(`deltaFile:${p}`);
  }
  const deltaFraction =
    Math.max(realDeltaPaths.size, adapterDeltaPaths.size) > 0
      ? deltaOverlapItems.length / Math.max(realDeltaPaths.size, adapterDeltaPaths.size)
      : 1;

  // ── 2. fileTree overlap ───────────────────────────────────────────────────
  const realTreeKeys = new Set(Object.keys(realPlan.fileTree ?? {}));
  const adapterTreeKeys = new Set(Object.keys(adapterPlan.fileTree ?? {}));
  const treeOverlapItems = [...realTreeKeys].filter(k => adapterTreeKeys.has(k));
  for (const k of [...realTreeKeys].filter(k => !adapterTreeKeys.has(k))) {
    missingInAdapter.push(`fileTree:${k}`);
  }
  for (const k of [...adapterTreeKeys].filter(k => !realTreeKeys.has(k))) {
    extraInAdapter.push(`fileTree:${k}`);
  }
  const treeFraction =
    Math.max(realTreeKeys.size, adapterTreeKeys.size) > 0
      ? treeOverlapItems.length / Math.max(realTreeKeys.size, adapterTreeKeys.size)
      : 1;

  // ── 3. pages overlap ──────────────────────────────────────────────────────
  const realPagePaths = new Set((realPlan.pages ?? []).map(p => p.path));
  const adapterPagePaths = new Set((adapterPlan.pages ?? []).map(p => p.path));
  const pageOverlapItems = [...realPagePaths].filter(p => adapterPagePaths.has(p));
  for (const p of [...realPagePaths].filter(p => !adapterPagePaths.has(p))) {
    missingInAdapter.push(`page:${p}`);
  }
  for (const p of [...adapterPagePaths].filter(p => !realPagePaths.has(p))) {
    extraInAdapter.push(`page:${p}`);
  }
  // Both empty → neutral (no pages declared in either plan)
  const pagesFraction =
    realPagePaths.size === 0 && adapterPagePaths.size === 0
      ? 1
      : pageOverlapItems.length / Math.max(realPagePaths.size, adapterPagePaths.size);

  // ── 4. appName compatibility ──────────────────────────────────────────────
  const realName = realPlan.appName?.trim() ?? '';
  const adapterName = adapterPlan.appName?.trim() ?? '';
  let appNameFraction: number;
  if (realName && adapterName) {
    appNameFraction = 1;
    if (realName.toLowerCase() !== adapterName.toLowerCase()) {
      mismatches.push(`appName: real="${realName}" adapter="${adapterName}"`);
    }
  } else if (!realName && !adapterName) {
    appNameFraction = 0.5; // neutral — neither plan has an app name
  } else {
    appNameFraction = 0;
    if (realName && !adapterName) missingInAdapter.push('appName');
  }

  // ── 5. skeleton compatibility ─────────────────────────────────────────────
  const realSkeleton = (realPlan.skeleton ?? '') as string;
  const adapterSkeleton = (adapterPlan.skeleton ?? '') as string;
  let skeletonFraction: number;
  if (realSkeleton && adapterSkeleton) {
    if (realSkeleton === adapterSkeleton) {
      skeletonFraction = 1;
    } else {
      skeletonFraction = 0;
      mismatches.push(`skeleton: real="${realSkeleton}" adapter="${adapterSkeleton}"`);
    }
  } else {
    skeletonFraction = 0.5; // neutral — skeleton is optional in ArchitectPlan
  }

  // ── 6. dataModel compatibility ────────────────────────────────────────────
  const realDataModel = realPlan.dataModel?.trim() ?? '';
  const adapterDataModel = adapterPlan.dataModel?.trim() ?? '';
  let dataModelFraction: number;
  if (realDataModel && adapterDataModel) {
    dataModelFraction = 1;
  } else if (realDataModel && !adapterDataModel) {
    dataModelFraction = 0;
    missingInAdapter.push('dataModel');
  } else {
    dataModelFraction = 0.5; // adapter may have extra dataModel or neither — neutral
  }

  // ── 7. contextContract presence ──────────────────────────────────────────
  const realCC = realPlan.contextContract?.trim() ?? '';
  const adapterCC = adapterPlan.contextContract?.trim() ?? '';
  let contextContractFraction: number;
  if (realCC && adapterCC) {
    contextContractFraction = 1;
  } else if (realCC && !adapterCC) {
    contextContractFraction = 0;
    missingInAdapter.push('contextContract');
  } else {
    contextContractFraction = 0.5; // neutral
  }

  // ── 8. Required pipeline fields present in adapter ────────────────────────
  const realDepMap = buildArchitectDependencyMap(realPlan);
  const requiredFields = [
    ...new Set([...realDepMap.required_for_pipeline, ...realDepMap.required_for_compile_or_files]),
  ];
  const adapterDepMap = buildArchitectDependencyMap(adapterPlan);
  const adapterPresentFields = new Set(
    adapterDepMap.fields.filter(f => f.presentInPlan).map(f => f.field as string),
  );
  const requiredMissingInAdapter = requiredFields.filter(f => !adapterPresentFields.has(f));
  for (const f of requiredMissingInAdapter) {
    missingInAdapter.push(`requiredField:${f}`);
  }
  const requiredFraction =
    requiredFields.length > 0
      ? (requiredFields.length - requiredMissingInAdapter.length) / requiredFields.length
      : 1;

  // ── Final score ───────────────────────────────────────────────────────────
  const checks = [
    deltaFraction,
    treeFraction,
    pagesFraction,
    appNameFraction,
    skeletonFraction,
    dataModelFraction,
    contextContractFraction,
    requiredFraction,
  ];
  const compatibilityScore = checks.reduce((sum, c) => sum + c, 0) / checks.length;
  const compatible = compatibilityScore >= COMPATIBILITY_THRESHOLD;

  const telemetry: ArchitectAdapterShadowTelemetry = {
    architect_adapter_shadow_enabled: true,
    adapter_compatible: compatible,
    adapter_compatibility_score: compatibilityScore,
    adapter_missing_fields_count: missingInAdapter.length,
    adapter_file_overlap_count: deltaOverlapItems.length,
    adapter_page_overlap_count: pageOverlapItems.length,
    adapter_readiness_ok: adapterReadiness.ready,
    adapter_replacement_safe_candidate: compatible && adapterReadiness.ready,
  };

  return {
    compatible,
    compatibilityScore,
    missingInAdapter,
    extraInAdapter,
    mismatches,
    telemetry,
  };
}

// ── Plan usability guard ──────────────────────────────────────────────────────

/**
 * Deterministic validity check: is this ArchitectPlan usable by the existing pipeline?
 *
 * Requires at minimum:
 *   - appName present and non-empty
 *   - deltaFiles non-empty  (hard pipeline guard at ProtoPipeline.ts)
 *   - fileTree non-empty    (coder "source of truth"; SkeletonIntegrationPlanner input)
 *   - pages non-empty       (router wiring in the coder prompt)
 *
 * Does NOT call any LLM. Does NOT change pipeline behavior.
 * Used by maybeApplyArchitectAdapterFallback as the trigger condition.
 */
export function isArchitectPlanUsableForPipeline(plan: ArchitectPlan): boolean {
  if (!plan.appName || !plan.appName.trim()) return false;
  if (!plan.deltaFiles || plan.deltaFiles.length === 0) return false;
  if (!plan.fileTree || Object.keys(plan.fileTree).length === 0) return false;
  if (!plan.pages || plan.pages.length === 0) return false;
  return true;
}

// ── Controlled fallback types ─────────────────────────────────────────────────

export interface ArchitectAdapterFallbackInput {
  /** The real ArchitectPlan returned by runArchitect (possibly invalid). */
  realPlan: ArchitectPlan;
  /** Market-aware builder brief (must be non-null). */
  brief: MarketAwareBuilderBrief;
  /** Selected skeleton ID (from ProtoPipeline config). */
  skeletonId: string;
  /**
   * Expected / delta files to pass into the adapter.
   * Pass the real plan's deltaFiles when available; pass [] when they are absent.
   */
  expectedFiles?: Array<{ path: string; purpose: string }>;
}

export interface ArchitectAdapterFallbackTelemetry {
  architect_adapter_fallback_evaluated: boolean;
  fallback_triggered: boolean;
  fallback_applied: boolean;
  fallback_reason?: string;
  adapter_readiness_ok: boolean;
  adapter_issue_count: number;
  adapter_missing_required_fields_count: number;
  adapter_source: string;
}

export interface ArchitectAdapterFallbackResult {
  /** The plan to use — either the original real plan or the adapter rescue plan. */
  plan: ArchitectPlan;
  /** True when the adapter plan was substituted for the real plan. */
  fallbackApplied: boolean;
  /** Human-readable reason the fallback was triggered. Absent when not triggered. */
  fallbackReason?: string;
  /** True when the adapter readiness evaluation passed (no error-severity issues). */
  adapterReadinessOk: boolean;
  /** Diagnostic messages from the adapter readiness evaluation. */
  diagnostics: string[];
  /** Flat telemetry for logging. */
  telemetry: ArchitectAdapterFallbackTelemetry;
}

// ── Controlled fallback helper ────────────────────────────────────────────────

/**
 * Controlled fallback: if runArchitect returned an invalid plan, attempt to
 * build a minimal adapter rescue plan.
 *
 * Safety rules:
 *   - If real plan is usable (isArchitectPlanUsableForPipeline): returns it unchanged,
 *     fallbackApplied: false. Adapter is never invoked.
 *   - If real plan is unusable and adapter readiness passes: returns adapter plan,
 *     fallbackApplied: true. Adapter plan is clearly marked (rawResponse, notes).
 *   - If real plan is unusable and adapter readiness fails (or adapter build throws):
 *     returns original invalid plan unchanged, fallbackApplied: false, so downstream
 *     guards (e.g. deltaFiles.length === 0) can fail exactly as before.
 *
 * Does NOT add LLM calls. Does NOT modify coder prompt behavior.
 * Does NOT change quality gate or skeleton selection behavior.
 */
export function maybeApplyArchitectAdapterFallback(
  input: ArchitectAdapterFallbackInput,
): ArchitectAdapterFallbackResult {
  const { realPlan, brief, skeletonId, expectedFiles = [] } = input;

  // Fast path: real plan is valid — do nothing.
  if (isArchitectPlanUsableForPipeline(realPlan)) {
    return {
      plan: realPlan,
      fallbackApplied: false,
      adapterReadinessOk: true,
      diagnostics: [],
      telemetry: {
        architect_adapter_fallback_evaluated: false,
        fallback_triggered: false,
        fallback_applied: false,
        adapter_readiness_ok: true,
        adapter_issue_count: 0,
        adapter_missing_required_fields_count: 0,
        adapter_source: 'none',
      },
    };
  }

  // Collect the specific invalidity reasons for telemetry.
  const reasons: string[] = [];
  if (!realPlan.appName || !realPlan.appName.trim()) reasons.push('appName_missing');
  if (!realPlan.deltaFiles || realPlan.deltaFiles.length === 0) reasons.push('deltaFiles_empty');
  if (!realPlan.fileTree || Object.keys(realPlan.fileTree).length === 0) reasons.push('fileTree_empty');
  if (!realPlan.pages || realPlan.pages.length === 0) reasons.push('pages_empty');
  const fallbackReason = reasons.join(', ');

  // Build adapter plan from the best available inputs.
  const effectiveFiles =
    expectedFiles.length > 0 ? expectedFiles : (realPlan.deltaFiles ?? []);
  const adapterInput: BuildMinimalArchitectPlanAdapterInput = {
    brief,
    skeletonId,
    expectedFiles: effectiveFiles,
  };

  let adapterPlan: ArchitectPlan;
  let readiness: ArchitectReplacementAdapterReadiness;
  try {
    adapterPlan = buildMinimalArchitectPlanAdapter(adapterInput);
    readiness = evaluateArchitectReplacementAdapterReadiness(adapterInput, adapterPlan);
  } catch (buildErr) {
    // Adapter build failed (e.g., malformed brief). Return original plan so
    // existing downstream guards handle the failure exactly as before.
    return {
      plan: realPlan,
      fallbackApplied: false,
      fallbackReason,
      adapterReadinessOk: false,
      diagnostics: [`[ERROR:ADAPTER_BUILD_FAILED] ${(buildErr as Error).message}`],
      telemetry: {
        architect_adapter_fallback_evaluated: true,
        fallback_triggered: true,
        fallback_applied: false,
        fallback_reason: fallbackReason,
        adapter_readiness_ok: false,
        adapter_issue_count: 1,
        adapter_missing_required_fields_count: 0,
        adapter_source: 'controlled-fallback',
      },
    };
  }

  const diagnostics = readiness.issues.map(
    i => `[${i.severity.toUpperCase()}:${i.code}] ${i.message}`,
  );
  const telemetry: ArchitectAdapterFallbackTelemetry = {
    architect_adapter_fallback_evaluated: true,
    fallback_triggered: true,
    fallback_applied: readiness.ready,
    fallback_reason: fallbackReason,
    adapter_readiness_ok: readiness.ready,
    adapter_issue_count: readiness.issues.length,
    adapter_missing_required_fields_count: readiness.missingRequiredFields.length,
    adapter_source: 'controlled-fallback',
  };

  if (readiness.ready) {
    return {
      plan: adapterPlan,
      fallbackApplied: true,
      fallbackReason,
      adapterReadinessOk: true,
      diagnostics,
      telemetry,
    };
  }

  // Adapter not ready — return original (invalid) plan so existing guards handle it.
  return {
    plan: realPlan,
    fallbackApplied: false,
    fallbackReason,
    adapterReadinessOk: false,
    diagnostics,
    telemetry,
  };
}
