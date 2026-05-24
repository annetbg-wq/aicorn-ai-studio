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

  const fileTree = buildFileTree(expectedFiles);

  // Guarantee non-empty deltaFiles; insert a safe default only if nothing provided.
  const deltaFiles =
    expectedFiles.length > 0
      ? expectedFiles
      : [{ path: 'pages/Home.tsx', purpose: 'Main application screen (safe default)' }];

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
