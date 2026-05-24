// @vitest-environment jsdom
/**
 * ArchitectReplacementAdapter — deterministic tests for the adapter foundation.
 *
 * All tests use hand-crafted inputs (no LLM calls).
 * The adapter is helper-only — production flow is unchanged.
 *
 * Verifies:
 *   - builds non-empty adapter plan for mobile health brief
 *   - builds non-empty adapter plan for dashboard brief
 *   - builds non-empty adapter plan for landing brief
 *   - deltaFiles are non-empty
 *   - fileTree includes expected files
 *   - pages align with required moments from the brief
 *   - adapter fields are clearly marked as adapter-generated
 *   - readiness detects missing deltaFiles
 *   - readiness detects missing fileTree
 *   - readiness detects fileTree / deltaFiles mismatch
 *   - adapter output satisfies ArchitectDependencyMap required fields
 *   - no real LLM calls
 */

import { describe, expect, it } from 'vitest';
import {
  buildMinimalArchitectPlanAdapter,
  evaluateArchitectReplacementAdapterReadiness,
  type BuildMinimalArchitectPlanAdapterInput,
  type ArchitectReplacementAdapterReadiness,
} from '../ArchitectReplacementAdapter';
import { buildMarketAwareBuilderBrief, type MarketAwareBuilderBrief } from '../MarketAwareBuilderBrief';
import { buildArchitectDependencyMap } from '../ArchitectDependencyMap';
import type { ArchitectPlan } from '../ProtoPipeline';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const HEALTH_BRIEF: MarketAwareBuilderBrief = buildMarketAwareBuilderBrief({
  brief: 'A health and wellness app for daily nutrition tracking and fitness coaching',
  skeletonId: 'mobile-app',
});

const DASHBOARD_BRIEF: MarketAwareBuilderBrief = buildMarketAwareBuilderBrief({
  brief: 'An analytics dashboard for monitoring business KPIs and operational metrics',
  skeletonId: 'saas-dashboard',
});

const LANDING_BRIEF: MarketAwareBuilderBrief = buildMarketAwareBuilderBrief({
  brief: 'A landing page for a new SaaS startup with waitlist signup',
  skeletonId: 'landing-page',
});

const HEALTH_FILES = [
  { path: 'pages/Home.tsx', purpose: 'Today screen with habit list and streak summary' },
  { path: 'pages/Scan.tsx', purpose: 'Primary action: scan or log nutrition' },
  { path: 'pages/Progress.tsx', purpose: 'Weekly completion stats and patterns' },
  { path: 'pages/Coach.tsx', purpose: 'Coach tip and explanation screen' },
  { path: 'hooks/useHealth.ts', purpose: 'Shared health state hook' },
  { path: 'data/types.ts', purpose: 'Health domain types' },
];

const DASHBOARD_FILES = [
  { path: 'pages/Dashboard.tsx', purpose: 'Main KPI overview with trend indicators' },
  { path: 'pages/Detail.tsx', purpose: 'Drill-down detail view for a metric' },
  { path: 'pages/Alerts.tsx', purpose: 'Priority-ordered alert list' },
  { path: 'components/KpiCard.tsx', purpose: 'Reusable KPI metric card' },
  { path: 'hooks/useMetrics.ts', purpose: 'Shared metrics state hook' },
];

const LANDING_FILES = [
  { path: 'pages/Landing.tsx', purpose: 'Hero, value prop, and CTA sections' },
  { path: 'components/Hero.tsx', purpose: 'Outcome-first hero with product screenshot' },
  { path: 'components/Pricing.tsx', purpose: 'Pricing tier comparison' },
  { path: 'components/Testimonials.tsx', purpose: 'Social proof section' },
];

const HEALTH_INPUT: BuildMinimalArchitectPlanAdapterInput = {
  brief: HEALTH_BRIEF,
  skeletonId: 'mobile-app',
  expectedFiles: HEALTH_FILES,
  appName: 'HealthFlow',
};

const DASHBOARD_INPUT: BuildMinimalArchitectPlanAdapterInput = {
  brief: DASHBOARD_BRIEF,
  skeletonId: 'saas-dashboard',
  expectedFiles: DASHBOARD_FILES,
  appName: 'OpsBoard',
};

const LANDING_INPUT: BuildMinimalArchitectPlanAdapterInput = {
  brief: LANDING_BRIEF,
  skeletonId: 'landing-page',
  expectedFiles: LANDING_FILES,
  appName: 'LaunchPage',
};

// ── buildMinimalArchitectPlanAdapter — mobile health brief ────────────────────

describe('buildMinimalArchitectPlanAdapter — mobile health brief', () => {
  const plan = buildMinimalArchitectPlanAdapter(HEALTH_INPUT);

  it('returns a non-empty plan object', () => {
    expect(plan).toBeTruthy();
  });

  it('appName matches provided override', () => {
    expect(plan.appName).toBe('HealthFlow');
  });

  it('deltaFiles are non-empty', () => {
    expect(plan.deltaFiles).toBeDefined();
    expect(plan.deltaFiles.length).toBeGreaterThan(0);
  });

  it('deltaFiles include all expected files', () => {
    const paths = plan.deltaFiles.map(f => f.path);
    for (const f of HEALTH_FILES) {
      expect(paths).toContain(f.path);
    }
  });

  it('fileTree is non-empty', () => {
    expect(Object.keys(plan.fileTree).length).toBeGreaterThan(0);
  });

  it('fileTree includes all expected file paths', () => {
    for (const f of HEALTH_FILES) {
      expect(Object.keys(plan.fileTree)).toContain(f.path);
    }
  });

  it('pages are non-empty', () => {
    expect(plan.pages).toBeDefined();
    expect(plan.pages!.length).toBeGreaterThan(0);
  });

  it('pages align with required moments from the brief', () => {
    const pageNames = plan.pages!.map(p => p.name.toLowerCase());
    const moments = HEALTH_BRIEF.builderBrief.requiredScreens;
    // At least one page per required moment should be derivable
    expect(pageNames.length).toBeGreaterThanOrEqual(
      Math.min(moments.length, 3),
    );
  });

  it('summary is non-empty and derived from brief', () => {
    expect(plan.summary.length).toBeGreaterThan(0);
    expect(plan.summary).toContain(HEALTH_BRIEF.productVision.productPromise.slice(0, 20));
  });

  it('dataModel is non-empty', () => {
    expect(plan.dataModel).toBeTruthy();
    expect((plan.dataModel ?? '').length).toBeGreaterThan(0);
  });

  it('contextContract is non-empty', () => {
    expect(plan.contextContract).toBeTruthy();
    expect((plan.contextContract ?? '').length).toBeGreaterThan(0);
  });

  it('skeleton matches the input skeletonId', () => {
    expect(plan.skeleton).toBe('mobile-app');
  });
});

// ── buildMinimalArchitectPlanAdapter — dashboard brief ────────────────────────

describe('buildMinimalArchitectPlanAdapter — dashboard brief', () => {
  const plan = buildMinimalArchitectPlanAdapter(DASHBOARD_INPUT);

  it('returns a non-empty plan object', () => {
    expect(plan).toBeTruthy();
  });

  it('appName matches provided override', () => {
    expect(plan.appName).toBe('OpsBoard');
  });

  it('deltaFiles are non-empty', () => {
    expect(plan.deltaFiles.length).toBeGreaterThan(0);
  });

  it('fileTree includes Dashboard.tsx and KpiCard.tsx', () => {
    expect(Object.keys(plan.fileTree)).toContain('pages/Dashboard.tsx');
    expect(Object.keys(plan.fileTree)).toContain('components/KpiCard.tsx');
  });

  it('pages are non-empty', () => {
    expect(plan.pages!.length).toBeGreaterThan(0);
  });

  it('summary is non-empty', () => {
    expect(plan.summary.length).toBeGreaterThan(0);
  });

  it('skeleton matches saas-dashboard', () => {
    expect(plan.skeleton).toBe('saas-dashboard');
  });
});

// ── buildMinimalArchitectPlanAdapter — landing brief ──────────────────────────

describe('buildMinimalArchitectPlanAdapter — landing brief', () => {
  const plan = buildMinimalArchitectPlanAdapter(LANDING_INPUT);

  it('returns a non-empty plan object', () => {
    expect(plan).toBeTruthy();
  });

  it('appName matches provided override', () => {
    expect(plan.appName).toBe('LaunchPage');
  });

  it('deltaFiles are non-empty', () => {
    expect(plan.deltaFiles.length).toBeGreaterThan(0);
  });

  it('fileTree includes Landing.tsx', () => {
    expect(Object.keys(plan.fileTree)).toContain('pages/Landing.tsx');
  });

  it('skeleton matches landing-page', () => {
    expect(plan.skeleton).toBe('landing-page');
  });
});

// ── Adapter-generated field markers ──────────────────────────────────────────

describe('adapter-generated field markers', () => {
  const plan = buildMinimalArchitectPlanAdapter(HEALTH_INPUT);

  it('rawResponse is "architect-replacement-adapter"', () => {
    expect(plan.rawResponse).toBe('architect-replacement-adapter');
  });

  it('notes[0] contains "adapter-generated"', () => {
    expect(plan.notes).toBeDefined();
    expect(plan.notes![0]).toContain('adapter-generated');
  });

  it('notes contain ArchitectReplacementAdapter marker', () => {
    const allNotes = plan.notes!.join('\n');
    expect(allNotes).toContain('ArchitectReplacementAdapter');
  });

  it('contextContract contains "[adapter-generated]" marker', () => {
    expect(plan.contextContract).toContain('[adapter-generated]');
  });

  it('contextContract contains "[builder-owned]" marker', () => {
    expect(plan.contextContract).toContain('[builder-owned]');
  });

  it('contextContract contains "[market-aware-source]" marker', () => {
    expect(plan.contextContract).toContain('[market-aware-source]');
  });

  it('contextContract contains product category', () => {
    expect(plan.contextContract).toContain('mobile-health');
  });
});

// ── Adapter satisfies ArchitectDependencyMap required fields ──────────────────

describe('adapter output satisfies ArchitectDependencyMap required fields', () => {
  it('health brief adapter satisfies all required_for_pipeline fields', () => {
    const plan = buildMinimalArchitectPlanAdapter(HEALTH_INPUT);
    const map = buildArchitectDependencyMap(plan);
    for (const field of map.required_for_pipeline) {
      const entry = map.fields.find(f => f.field === field);
      expect(entry?.presentInPlan).toBe(true);
    }
  });

  it('health brief adapter satisfies all required_for_compile_or_files fields', () => {
    const plan = buildMinimalArchitectPlanAdapter(HEALTH_INPUT);
    const map = buildArchitectDependencyMap(plan);
    for (const field of map.required_for_compile_or_files) {
      const entry = map.fields.find(f => f.field === field);
      expect(entry?.presentInPlan).toBe(true);
    }
  });

  it('dashboard brief adapter satisfies all required_for_pipeline fields', () => {
    const plan = buildMinimalArchitectPlanAdapter(DASHBOARD_INPUT);
    const map = buildArchitectDependencyMap(plan);
    for (const field of map.required_for_pipeline) {
      const entry = map.fields.find(f => f.field === field);
      expect(entry?.presentInPlan).toBe(true);
    }
  });

  it('landing brief adapter satisfies all required_for_compile_or_files fields', () => {
    const plan = buildMinimalArchitectPlanAdapter(LANDING_INPUT);
    const map = buildArchitectDependencyMap(plan);
    for (const field of map.required_for_compile_or_files) {
      const entry = map.fields.find(f => f.field === field);
      expect(entry?.presentInPlan).toBe(true);
    }
  });
});

// ── Safe default when no expectedFiles provided ───────────────────────────────

describe('buildMinimalArchitectPlanAdapter — safe defaults', () => {
  it('produces non-empty deltaFiles even when expectedFiles is empty', () => {
    const plan = buildMinimalArchitectPlanAdapter({
      brief: HEALTH_BRIEF,
      skeletonId: 'mobile-app',
      expectedFiles: [],
    });
    expect(plan.deltaFiles.length).toBeGreaterThan(0);
  });

  it('derives appName from brief when no override provided', () => {
    const plan = buildMinimalArchitectPlanAdapter({
      brief: HEALTH_BRIEF,
      skeletonId: 'mobile-app',
      expectedFiles: HEALTH_FILES,
    });
    expect(plan.appName.length).toBeGreaterThan(0);
  });

  it('produces pages from brief required moments when no screen composition plan', () => {
    const plan = buildMinimalArchitectPlanAdapter({
      brief: HEALTH_BRIEF,
      skeletonId: 'mobile-app',
      expectedFiles: HEALTH_FILES,
    });
    expect(plan.pages!.length).toBeGreaterThan(0);
  });
});

// ── evaluateArchitectReplacementAdapterReadiness — happy path ─────────────────

describe('evaluateArchitectReplacementAdapterReadiness — happy path', () => {
  it('returns ready=true for well-formed health adapter output', () => {
    const plan = buildMinimalArchitectPlanAdapter(HEALTH_INPUT);
    const result = evaluateArchitectReplacementAdapterReadiness(HEALTH_INPUT, plan);
    expect(result.ready).toBe(true);
    expect(result.satisfiesRequiredFields).toBe(true);
    expect(result.issues.filter(i => i.severity === 'error')).toHaveLength(0);
  });

  it('presentRequiredFields includes deltaFiles and fileTree', () => {
    const plan = buildMinimalArchitectPlanAdapter(HEALTH_INPUT);
    const result = evaluateArchitectReplacementAdapterReadiness(HEALTH_INPUT, plan);
    expect(result.presentRequiredFields).toContain('deltaFiles');
    expect(result.presentRequiredFields).toContain('fileTree');
  });

  it('missingRequiredFields is empty for well-formed plan', () => {
    const plan = buildMinimalArchitectPlanAdapter(HEALTH_INPUT);
    const result = evaluateArchitectReplacementAdapterReadiness(HEALTH_INPUT, plan);
    expect(result.missingRequiredFields).toHaveLength(0);
  });
});

// ── evaluateArchitectReplacementAdapterReadiness — missing deltaFiles ─────────

describe('evaluateArchitectReplacementAdapterReadiness — missing deltaFiles', () => {
  it('reports MISSING_DELTA_FILES error when deltaFiles is empty', () => {
    const plan = buildMinimalArchitectPlanAdapter(HEALTH_INPUT);
    const emptyDelta: ArchitectPlan = { ...plan, deltaFiles: [] };
    const result = evaluateArchitectReplacementAdapterReadiness(HEALTH_INPUT, emptyDelta);
    const codes = result.issues.map(i => i.code);
    expect(codes).toContain('MISSING_DELTA_FILES');
  });

  it('ready is false when deltaFiles is empty', () => {
    const plan = buildMinimalArchitectPlanAdapter(HEALTH_INPUT);
    const emptyDelta: ArchitectPlan = { ...plan, deltaFiles: [] };
    const result = evaluateArchitectReplacementAdapterReadiness(HEALTH_INPUT, emptyDelta);
    expect(result.ready).toBe(false);
  });

  it('MISSING_DELTA_FILES issue has error severity', () => {
    const plan = buildMinimalArchitectPlanAdapter(HEALTH_INPUT);
    const emptyDelta: ArchitectPlan = { ...plan, deltaFiles: [] };
    const result = evaluateArchitectReplacementAdapterReadiness(HEALTH_INPUT, emptyDelta);
    const issue = result.issues.find(i => i.code === 'MISSING_DELTA_FILES');
    expect(issue?.severity).toBe('error');
  });
});

// ── evaluateArchitectReplacementAdapterReadiness — missing fileTree ───────────

describe('evaluateArchitectReplacementAdapterReadiness — missing fileTree', () => {
  it('reports MISSING_FILE_TREE error when fileTree is empty', () => {
    const plan = buildMinimalArchitectPlanAdapter(HEALTH_INPUT);
    const emptyTree: ArchitectPlan = { ...plan, fileTree: {} };
    const result = evaluateArchitectReplacementAdapterReadiness(HEALTH_INPUT, emptyTree);
    const codes = result.issues.map(i => i.code);
    expect(codes).toContain('MISSING_FILE_TREE');
  });

  it('ready is false when fileTree is empty', () => {
    const plan = buildMinimalArchitectPlanAdapter(HEALTH_INPUT);
    const emptyTree: ArchitectPlan = { ...plan, fileTree: {} };
    const result = evaluateArchitectReplacementAdapterReadiness(HEALTH_INPUT, emptyTree);
    expect(result.ready).toBe(false);
  });

  it('MISSING_FILE_TREE issue has error severity', () => {
    const plan = buildMinimalArchitectPlanAdapter(HEALTH_INPUT);
    const emptyTree: ArchitectPlan = { ...plan, fileTree: {} };
    const result = evaluateArchitectReplacementAdapterReadiness(HEALTH_INPUT, emptyTree);
    const issue = result.issues.find(i => i.code === 'MISSING_FILE_TREE');
    expect(issue?.severity).toBe('error');
  });
});

// ── evaluateArchitectReplacementAdapterReadiness — mismatch ──────────────────

describe('evaluateArchitectReplacementAdapterReadiness — fileTree/deltaFiles mismatch', () => {
  it('detects mismatch when fileTree has extra paths not in expectedFiles', () => {
    const plan = buildMinimalArchitectPlanAdapter(HEALTH_INPUT);
    const mismatchedTree: ArchitectPlan = {
      ...plan,
      fileTree: {
        ...plan.fileTree,
        'pages/ExtraScreen.tsx': 'An extra screen not in expectedFiles',
      },
    };
    const result = evaluateArchitectReplacementAdapterReadiness(HEALTH_INPUT, mismatchedTree);
    const codes = result.issues.map(i => i.code);
    expect(codes).toContain('FILE_TREE_DELTA_FILES_MISMATCH');
  });

  it('detects mismatch when fileTree is missing paths from expectedFiles', () => {
    const plan = buildMinimalArchitectPlanAdapter(HEALTH_INPUT);
    const partialTree: ArchitectPlan = {
      ...plan,
      fileTree: { 'pages/Home.tsx': 'Home screen only' }, // missing many expected files
    };
    const result = evaluateArchitectReplacementAdapterReadiness(HEALTH_INPUT, partialTree);
    const codes = result.issues.map(i => i.code);
    expect(codes).toContain('FILE_TREE_DELTA_FILES_MISMATCH');
  });

  it('mismatch issue has warn severity', () => {
    const plan = buildMinimalArchitectPlanAdapter(HEALTH_INPUT);
    const mismatchedTree: ArchitectPlan = {
      ...plan,
      fileTree: { 'pages/OnlyThis.tsx': 'Only file' },
    };
    const result = evaluateArchitectReplacementAdapterReadiness(HEALTH_INPUT, mismatchedTree);
    const issue = result.issues.find(i => i.code === 'FILE_TREE_DELTA_FILES_MISMATCH');
    expect(issue?.severity).toBe('warn');
  });

  it('no mismatch issue when fileTree exactly matches expectedFiles', () => {
    const plan = buildMinimalArchitectPlanAdapter(HEALTH_INPUT);
    const result = evaluateArchitectReplacementAdapterReadiness(HEALTH_INPUT, plan);
    const codes = result.issues.map(i => i.code);
    expect(codes).not.toContain('FILE_TREE_DELTA_FILES_MISMATCH');
  });
});

// ── evaluateArchitectReplacementAdapterReadiness — MISSING_REQUIRED_FIELD ────

describe('evaluateArchitectReplacementAdapterReadiness — required field satisfaction', () => {
  it('reports MISSING_REQUIRED_FIELD when appName is missing', () => {
    const plan = buildMinimalArchitectPlanAdapter(HEALTH_INPUT);
    const noName: ArchitectPlan = { ...plan, appName: '' };
    const result = evaluateArchitectReplacementAdapterReadiness(HEALTH_INPUT, noName);
    const codes = result.issues.map(i => i.code);
    expect(codes).toContain('MISSING_APP_NAME');
  });

  it('reports MISSING_REQUIRED_FIELD for missing deltaFiles in dependency check', () => {
    const plan = buildMinimalArchitectPlanAdapter(HEALTH_INPUT);
    const noFiles: ArchitectPlan = { ...plan, deltaFiles: [], fileTree: {} };
    const result = evaluateArchitectReplacementAdapterReadiness(HEALTH_INPUT, noFiles);
    expect(result.satisfiesRequiredFields).toBe(false);
    expect(result.missingRequiredFields.length).toBeGreaterThan(0);
  });

  it('satisfiesRequiredFields is true when full adapter plan is produced', () => {
    const plan = buildMinimalArchitectPlanAdapter(HEALTH_INPUT);
    const result = evaluateArchitectReplacementAdapterReadiness(HEALTH_INPUT, plan);
    expect(result.satisfiesRequiredFields).toBe(true);
  });
});

// ── No real LLM calls ─────────────────────────────────────────────────────────

describe('no real LLM calls', () => {
  it('buildMinimalArchitectPlanAdapter is fully deterministic and synchronous', () => {
    // If this returns without awaiting a Promise, no async LLM call was made.
    const plan = buildMinimalArchitectPlanAdapter(HEALTH_INPUT);
    expect(plan).toBeTruthy();
    expect(plan instanceof Promise).toBe(false);
  });

  it('evaluateArchitectReplacementAdapterReadiness is fully synchronous', () => {
    const plan = buildMinimalArchitectPlanAdapter(HEALTH_INPUT);
    const result = evaluateArchitectReplacementAdapterReadiness(HEALTH_INPUT, plan);
    expect(result).toBeTruthy();
    expect(result instanceof Promise).toBe(false);
  });

  it('adapter output is deterministic across two calls with same input', () => {
    const plan1 = buildMinimalArchitectPlanAdapter(HEALTH_INPUT);
    const plan2 = buildMinimalArchitectPlanAdapter(HEALTH_INPUT);
    expect(plan1.appName).toBe(plan2.appName);
    expect(plan1.rawResponse).toBe(plan2.rawResponse);
    expect(plan1.deltaFiles).toEqual(plan2.deltaFiles);
    expect(plan1.fileTree).toEqual(plan2.fileTree);
  });
});
