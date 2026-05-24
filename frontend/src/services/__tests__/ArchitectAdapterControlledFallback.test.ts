// @vitest-environment jsdom
/**
 * ArchitectAdapterControlledFallback — deterministic unit tests for the
 * controlled adapter fallback introduced in p2/architect-adapter-controlled-fallback.
 *
 * All tests use hand-crafted inputs (no LLM calls).
 * Tests are advisory-only from the pipeline perspective — they verify helper
 * behavior and do NOT alter production flow.
 *
 * Verifies:
 *   - valid architect plan does not trigger fallback
 *   - empty deltaFiles triggers fallback
 *   - missing fileTree triggers fallback
 *   - missing appName triggers fallback
 *   - adapter readiness ok replaces plan
 *   - adapter readiness failure does not replace plan and returns failure diagnostics
 *   - fallback plan is marked adapter-generated
 *   - production path remains unchanged for valid plan
 *   - no real LLM calls
 */

import { describe, expect, it } from 'vitest';
import {
  isArchitectPlanUsableForPipeline,
  maybeApplyArchitectAdapterFallback,
  type ArchitectAdapterFallbackInput,
} from '../ArchitectReplacementAdapter';
import { buildMarketAwareBuilderBrief, type MarketAwareBuilderBrief } from '../MarketAwareBuilderBrief';
import type { ArchitectPlan } from '../ProtoPipeline';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BRIEF: MarketAwareBuilderBrief = buildMarketAwareBuilderBrief({
  brief: 'A health and wellness app for daily nutrition tracking and fitness coaching',
  skeletonId: 'mobile-app',
});

const VALID_FILES = [
  { path: 'pages/Home.tsx', purpose: 'Today screen with habit list and streak summary' },
  { path: 'pages/Scan.tsx', purpose: 'Primary action: scan or log nutrition' },
  { path: 'pages/Progress.tsx', purpose: 'Weekly completion stats and patterns' },
  { path: 'hooks/useHealth.ts', purpose: 'Shared health state hook' },
];

/** A fully-valid ArchitectPlan that passes all pipeline requirements. */
const VALID_PLAN: ArchitectPlan = {
  appName: 'HealthFlow',
  skeleton: 'mobile-app',
  summary: 'Health tracking app for daily nutrition and fitness',
  fileTree: {
    'pages/Home.tsx': 'Today screen with habit list and streak summary',
    'pages/Scan.tsx': 'Primary action: scan or log nutrition',
    'pages/Progress.tsx': 'Weekly completion stats and patterns',
    'hooks/useHealth.ts': 'Shared health state hook',
  },
  deltaFiles: [
    { path: 'pages/Home.tsx', purpose: 'Today screen with habit list and streak summary' },
    { path: 'pages/Scan.tsx', purpose: 'Primary action: scan or log nutrition' },
    { path: 'pages/Progress.tsx', purpose: 'Weekly completion stats and patterns' },
    { path: 'hooks/useHealth.ts', purpose: 'Shared health state hook' },
  ],
  pages: [
    { path: '/', name: 'Home', file: 'pages/Home.tsx', purpose: 'Today screen' },
    { path: '/scan', name: 'Scan', file: 'pages/Scan.tsx', purpose: 'Log nutrition' },
  ],
  dataModel: 'User { id, name } | NutritionLog { id, calories }',
  contextContract: 'Use useHealth() from HealthContext',
  notes: ['Track daily nutrition'],
  rawResponse: '{}',
};

/** Base fallback input for valid plan tests. */
const VALID_FALLBACK_INPUT: ArchitectAdapterFallbackInput = {
  realPlan: VALID_PLAN,
  brief: BRIEF,
  skeletonId: 'mobile-app',
  expectedFiles: VALID_FILES,
};

// ── isArchitectPlanUsableForPipeline ──────────────────────────────────────────

describe('isArchitectPlanUsableForPipeline', () => {
  it('returns true for a fully-valid plan', () => {
    expect(isArchitectPlanUsableForPipeline(VALID_PLAN)).toBe(true);
  });

  it('returns false when deltaFiles is empty', () => {
    expect(isArchitectPlanUsableForPipeline({ ...VALID_PLAN, deltaFiles: [] })).toBe(false);
  });

  it('returns false when fileTree is empty', () => {
    expect(isArchitectPlanUsableForPipeline({ ...VALID_PLAN, fileTree: {} })).toBe(false);
  });

  it('returns false when appName is empty string', () => {
    expect(isArchitectPlanUsableForPipeline({ ...VALID_PLAN, appName: '' })).toBe(false);
  });

  it('returns false when appName is whitespace only', () => {
    expect(isArchitectPlanUsableForPipeline({ ...VALID_PLAN, appName: '   ' })).toBe(false);
  });

  it('returns false when pages is empty', () => {
    expect(isArchitectPlanUsableForPipeline({ ...VALID_PLAN, pages: [] })).toBe(false);
  });

  it('returns false when pages is undefined', () => {
    expect(isArchitectPlanUsableForPipeline({ ...VALID_PLAN, pages: undefined })).toBe(false);
  });

  it('returns false when fileTree is undefined', () => {
    // ArchitectPlan.fileTree is typed non-optional but cast here to test the guard.
    expect(isArchitectPlanUsableForPipeline({ ...VALID_PLAN, fileTree: undefined as unknown as Record<string, string> })).toBe(false);
  });

  it('is synchronous and does not return a Promise', () => {
    const result = isArchitectPlanUsableForPipeline(VALID_PLAN);
    expect(typeof result).toBe('boolean');
  });
});

// ── valid plan does not trigger fallback ──────────────────────────────────────

describe('maybeApplyArchitectAdapterFallback — valid plan passthrough', () => {
  const result = maybeApplyArchitectAdapterFallback(VALID_FALLBACK_INPUT);

  it('fallbackApplied is false for a valid plan', () => {
    expect(result.fallbackApplied).toBe(false);
  });

  it('returns the original real plan unchanged', () => {
    expect(result.plan).toBe(VALID_PLAN);
  });

  it('adapterReadinessOk is true (fast path, adapter not evaluated)', () => {
    expect(result.adapterReadinessOk).toBe(true);
  });

  it('diagnostics are empty for a valid plan', () => {
    expect(result.diagnostics).toHaveLength(0);
  });

  it('telemetry marks fallback as not evaluated', () => {
    expect(result.telemetry.architect_adapter_fallback_evaluated).toBe(false);
    expect(result.telemetry.fallback_triggered).toBe(false);
    expect(result.telemetry.fallback_applied).toBe(false);
  });

  it('production path: original plan deltaFiles are unchanged', () => {
    expect(result.plan.deltaFiles).toEqual(VALID_PLAN.deltaFiles);
  });

  it('production path: original plan appName is unchanged', () => {
    expect(result.plan.appName).toBe(VALID_PLAN.appName);
  });
});

// ── empty deltaFiles triggers fallback ────────────────────────────────────────

describe('maybeApplyArchitectAdapterFallback — empty deltaFiles', () => {
  const invalidPlan: ArchitectPlan = { ...VALID_PLAN, deltaFiles: [] };
  const result = maybeApplyArchitectAdapterFallback({
    ...VALID_FALLBACK_INPUT,
    realPlan: invalidPlan,
    expectedFiles: [], // real plan has no files
  });

  it('fallbackApplied is true when deltaFiles is empty and adapter is ready', () => {
    expect(result.fallbackApplied).toBe(true);
  });

  it('adapterReadinessOk is true', () => {
    expect(result.adapterReadinessOk).toBe(true);
  });

  it('fallbackReason contains deltaFiles_empty', () => {
    expect(result.fallbackReason).toContain('deltaFiles_empty');
  });

  it('returned plan has non-empty deltaFiles (from adapter safe default)', () => {
    expect(result.plan.deltaFiles.length).toBeGreaterThan(0);
  });

  it('telemetry marks fallback as triggered and applied', () => {
    expect(result.telemetry.fallback_triggered).toBe(true);
    expect(result.telemetry.fallback_applied).toBe(true);
  });
});

// ── missing fileTree triggers fallback ───────────────────────────────────────

describe('maybeApplyArchitectAdapterFallback — missing fileTree', () => {
  const invalidPlan: ArchitectPlan = { ...VALID_PLAN, fileTree: {} };
  const result = maybeApplyArchitectAdapterFallback({
    ...VALID_FALLBACK_INPUT,
    realPlan: invalidPlan,
    expectedFiles: VALID_FILES, // files are available
  });

  it('fallbackApplied is true when fileTree is empty', () => {
    expect(result.fallbackApplied).toBe(true);
  });

  it('fallbackReason contains fileTree_empty', () => {
    expect(result.fallbackReason).toContain('fileTree_empty');
  });

  it('returned plan has non-empty fileTree (built from expectedFiles)', () => {
    expect(Object.keys(result.plan.fileTree).length).toBeGreaterThan(0);
  });

  it('adapterReadinessOk is true when files are available', () => {
    expect(result.adapterReadinessOk).toBe(true);
  });
});

// ── missing appName triggers fallback ────────────────────────────────────────

describe('maybeApplyArchitectAdapterFallback — missing appName', () => {
  const invalidPlan: ArchitectPlan = { ...VALID_PLAN, appName: '' };
  const result = maybeApplyArchitectAdapterFallback({
    ...VALID_FALLBACK_INPUT,
    realPlan: invalidPlan,
  });

  it('fallbackApplied is true when appName is missing', () => {
    expect(result.fallbackApplied).toBe(true);
  });

  it('fallbackReason contains appName_missing', () => {
    expect(result.fallbackReason).toContain('appName_missing');
  });

  it('returned plan has a non-empty appName (derived from brief)', () => {
    expect(result.plan.appName).toBeTruthy();
    expect(result.plan.appName.trim().length).toBeGreaterThan(0);
  });
});

// ── adapter readiness ok replaces plan ───────────────────────────────────────

describe('maybeApplyArchitectAdapterFallback — adapter readiness ok, plan replaced', () => {
  const invalidPlan: ArchitectPlan = {
    ...VALID_PLAN,
    deltaFiles: [],
    fileTree: {},
    appName: '',
    pages: [],
  };
  const result = maybeApplyArchitectAdapterFallback({
    ...VALID_FALLBACK_INPUT,
    realPlan: invalidPlan,
    expectedFiles: VALID_FILES,
  });

  it('fallbackApplied is true', () => {
    expect(result.fallbackApplied).toBe(true);
  });

  it('adapterReadinessOk is true', () => {
    expect(result.adapterReadinessOk).toBe(true);
  });

  it('returned plan is not the original invalid plan', () => {
    expect(result.plan).not.toBe(invalidPlan);
  });

  it('returned plan has non-empty deltaFiles', () => {
    expect(result.plan.deltaFiles.length).toBeGreaterThan(0);
  });

  it('returned plan has non-empty fileTree', () => {
    expect(Object.keys(result.plan.fileTree).length).toBeGreaterThan(0);
  });

  it('returned plan has non-empty pages', () => {
    expect((result.plan.pages ?? []).length).toBeGreaterThan(0);
  });

  it('returned plan has non-empty appName', () => {
    expect(result.plan.appName.trim().length).toBeGreaterThan(0);
  });

  it('telemetry marks adapter_source as controlled-fallback', () => {
    expect(result.telemetry.adapter_source).toBe('controlled-fallback');
  });
});

// ── fallback plan is marked adapter-generated ─────────────────────────────────

describe('maybeApplyArchitectAdapterFallback — fallback plan adapter markers', () => {
  const invalidPlan: ArchitectPlan = { ...VALID_PLAN, deltaFiles: [], fileTree: {}, pages: [] };
  const result = maybeApplyArchitectAdapterFallback({
    ...VALID_FALLBACK_INPUT,
    realPlan: invalidPlan,
    expectedFiles: VALID_FILES,
  });

  it('rawResponse is "architect-replacement-adapter"', () => {
    expect(result.plan.rawResponse).toBe('architect-replacement-adapter');
  });

  it('notes[0] contains "adapter-generated"', () => {
    expect(result.plan.notes).toBeDefined();
    expect(result.plan.notes![0]).toContain('adapter-generated');
  });

  it('contextContract contains "[adapter-generated]" marker', () => {
    expect(result.plan.contextContract).toContain('[adapter-generated]');
  });

  it('contextContract contains "[builder-owned]" marker', () => {
    expect(result.plan.contextContract).toContain('[builder-owned]');
  });

  it('contextContract contains "[market-aware-source]" marker', () => {
    expect(result.plan.contextContract).toContain('[market-aware-source]');
  });
});

// ── adapter readiness failure does not replace plan ───────────────────────────

describe('maybeApplyArchitectAdapterFallback — adapter readiness failure', () => {
  // To force adapter build failure, pass a null brief (causes a runtime error inside
  // buildMinimalArchitectPlanAdapter which is caught and converted to a controlled failure).
  const invalidPlan: ArchitectPlan = { ...VALID_PLAN, deltaFiles: [] };
  const result = maybeApplyArchitectAdapterFallback({
    realPlan: invalidPlan,
    brief: null as unknown as MarketAwareBuilderBrief, // deliberate null to trigger adapter throw
    skeletonId: 'mobile-app',
    expectedFiles: [],
  });

  it('fallbackApplied is false when adapter build fails', () => {
    expect(result.fallbackApplied).toBe(false);
  });

  it('adapterReadinessOk is false when adapter build fails', () => {
    expect(result.adapterReadinessOk).toBe(false);
  });

  it('returns the original (invalid) real plan', () => {
    expect(result.plan).toBe(invalidPlan);
  });

  it('diagnostics contain at least one message', () => {
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('telemetry marks fallback_triggered true but fallback_applied false', () => {
    expect(result.telemetry.fallback_triggered).toBe(true);
    expect(result.telemetry.fallback_applied).toBe(false);
  });

  it('telemetry marks adapter_readiness_ok false', () => {
    expect(result.telemetry.adapter_readiness_ok).toBe(false);
  });
});

// ── production path unchanged for valid plan ─────────────────────────────────

describe('production path — valid plan is never replaced', () => {
  it('valid plan with all required fields returns fallbackApplied: false', () => {
    const result = maybeApplyArchitectAdapterFallback(VALID_FALLBACK_INPUT);
    expect(result.fallbackApplied).toBe(false);
  });

  it('valid plan result plan reference is identical to input plan', () => {
    const result = maybeApplyArchitectAdapterFallback(VALID_FALLBACK_INPUT);
    expect(result.plan).toBe(VALID_PLAN);
  });

  it('valid plan result has empty diagnostics (no evaluation performed)', () => {
    const result = maybeApplyArchitectAdapterFallback(VALID_FALLBACK_INPUT);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('valid plan result telemetry evaluated=false (adapter never invoked)', () => {
    const result = maybeApplyArchitectAdapterFallback(VALID_FALLBACK_INPUT);
    expect(result.telemetry.architect_adapter_fallback_evaluated).toBe(false);
  });

  it('valid plan with different valid files still does not trigger fallback', () => {
    const altPlan: ArchitectPlan = {
      ...VALID_PLAN,
      appName: 'AltApp',
      deltaFiles: [{ path: 'pages/Alt.tsx', purpose: 'Alt screen' }],
      fileTree: { 'pages/Alt.tsx': 'Alt screen' },
      pages: [{ path: '/', name: 'Alt', file: 'pages/Alt.tsx', purpose: 'Alt' }],
    };
    const result = maybeApplyArchitectAdapterFallback({
      realPlan: altPlan,
      brief: BRIEF,
      skeletonId: 'mobile-app',
    });
    expect(result.fallbackApplied).toBe(false);
    expect(result.plan).toBe(altPlan);
  });
});

// ── no real LLM calls ─────────────────────────────────────────────────────────

describe('no real LLM calls', () => {
  it('isArchitectPlanUsableForPipeline is synchronous (returns boolean)', () => {
    const result = isArchitectPlanUsableForPipeline(VALID_PLAN);
    expect(typeof result).toBe('boolean');
  });

  it('maybeApplyArchitectAdapterFallback is synchronous (valid plan path)', () => {
    const result = maybeApplyArchitectAdapterFallback(VALID_FALLBACK_INPUT);
    expect(result).toBeDefined();
    expect(typeof result.fallbackApplied).toBe('boolean');
  });

  it('maybeApplyArchitectAdapterFallback is synchronous (fallback path)', () => {
    const invalidPlan: ArchitectPlan = { ...VALID_PLAN, deltaFiles: [], fileTree: {} };
    const result = maybeApplyArchitectAdapterFallback({
      ...VALID_FALLBACK_INPUT,
      realPlan: invalidPlan,
      expectedFiles: VALID_FILES,
    });
    expect(result).toBeDefined();
    expect(typeof result.fallbackApplied).toBe('boolean');
  });
});
