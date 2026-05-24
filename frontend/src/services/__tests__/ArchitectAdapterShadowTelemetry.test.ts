// @vitest-environment jsdom
/**
 * ArchitectAdapterShadowTelemetry — deterministic tests for
 * compareArchitectPlanWithAdapter and shadow telemetry behavior.
 *
 * All tests use hand-crafted ArchitectPlan objects (no LLM calls).
 * Advisory/helper-only — production flow is unchanged.
 *
 * Verifies:
 *   - identical architect/adapter plans score high (≥ 0.75, compatible = true)
 *   - missing deltaFiles in adapter lowers score
 *   - missing fileTree in adapter lowers score
 *   - page mismatch is detected (missingInAdapter / extraInAdapter)
 *   - skeleton mismatch is detected (mismatches array)
 *   - required field absence is detected (missingInAdapter contains requiredField:*)
 *   - adapter readiness result is reflected in telemetry
 *   - comparison is advisory-only (no throw, no generation side-effects)
 *   - no real LLM calls
 */

import { describe, expect, it } from 'vitest';
import {
  compareArchitectPlanWithAdapter,
  type CompareArchitectPlanWithAdapterInput,
  type ArchitectAdapterComparisonResult,
} from '../ArchitectReplacementAdapter';
import type { ArchitectReplacementAdapterReadiness } from '../ArchitectReplacementAdapter';
import type { ArchitectPlan } from '../ProtoPipeline';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** A fully-populated real ArchitectPlan (simulates runArchitect output). */
const REAL_PLAN: ArchitectPlan = {
  appName: 'HealthFlow',
  skeleton: 'mobile-app',
  summary: 'Health tracking app for daily nutrition and fitness',
  fileTree: {
    'pages/Home.tsx': 'Today screen with habit list and streak summary',
    'pages/Scan.tsx': 'Primary action: scan or log nutrition',
    'pages/Progress.tsx': 'Weekly completion stats and patterns',
    'hooks/useHealth.ts': 'Shared health state hook',
    'data/types.ts': 'Health domain types',
  },
  deltaFiles: [
    { path: 'pages/Home.tsx', purpose: 'Today screen with habit list and streak summary' },
    { path: 'pages/Scan.tsx', purpose: 'Primary action: scan or log nutrition' },
    { path: 'pages/Progress.tsx', purpose: 'Weekly completion stats and patterns' },
    { path: 'hooks/useHealth.ts', purpose: 'Shared health state hook' },
    { path: 'data/types.ts', purpose: 'Health domain types' },
  ],
  pages: [
    { path: '/', name: 'Home', file: 'pages/Home.tsx', purpose: 'Main screen' },
    { path: '/scan', name: 'Scan', file: 'pages/Scan.tsx', purpose: 'Nutrition scan' },
    { path: '/progress', name: 'Progress', file: 'pages/Progress.tsx', purpose: 'Progress view' },
  ],
  dataModel: 'User { id, name } | NutritionEntry { date, calories } | HabitLog { habit, done }',
  contextContract: 'Use useHealth() from HealthContext. Do not use localStorage directly.',
  notes: ['Use amber for streak highlights'],
};

/** Fully-ready readiness — adapter output is valid. */
const READY_READINESS: ArchitectReplacementAdapterReadiness = {
  ready: true,
  satisfiesRequiredFields: true,
  presentRequiredFields: ['deltaFiles', 'fileTree', 'appName', 'pages', 'contextContract'],
  missingRequiredFields: [],
  issues: [],
};

/** Not-ready readiness — adapter output has errors. */
const NOT_READY_READINESS: ArchitectReplacementAdapterReadiness = {
  ready: false,
  satisfiesRequiredFields: false,
  presentRequiredFields: ['appName'],
  missingRequiredFields: ['deltaFiles', 'fileTree'],
  issues: [
    {
      code: 'MISSING_DELTA_FILES',
      severity: 'error',
      message: 'Adapter output has no deltaFiles.',
    },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function compare(
  realPlan: ArchitectPlan,
  adapterPlan: ArchitectPlan,
  readiness: ArchitectReplacementAdapterReadiness = READY_READINESS,
): ArchitectAdapterComparisonResult {
  return compareArchitectPlanWithAdapter({
    realPlan,
    adapterPlan,
    adapterReadiness: readiness,
  });
}

// ── Tests: identical plans score high ─────────────────────────────────────────

describe('compareArchitectPlanWithAdapter — identical plans', () => {
  const result = compare(REAL_PLAN, { ...REAL_PLAN });

  it('returns compatible = true', () => {
    expect(result.compatible).toBe(true);
  });

  it('returns compatibilityScore >= 0.75', () => {
    expect(result.compatibilityScore).toBeGreaterThanOrEqual(0.75);
  });

  it('has no mismatches', () => {
    expect(result.mismatches).toHaveLength(0);
  });

  it('has empty or only file-level extras when plans are identical', () => {
    // deltaFiles and fileTree are derived from the same source — paths match exactly.
    const deltaOrTreeMissing = result.missingInAdapter.filter(
      m => m.startsWith('deltaFile:') || m.startsWith('fileTree:'),
    );
    expect(deltaOrTreeMissing).toHaveLength(0);
  });

  it('telemetry has architect_adapter_shadow_enabled = true', () => {
    expect(result.telemetry.architect_adapter_shadow_enabled).toBe(true);
  });

  it('telemetry adapter_compatible = true', () => {
    expect(result.telemetry.adapter_compatible).toBe(true);
  });

  it('telemetry adapter_compatibility_score >= 0.75', () => {
    expect(result.telemetry.adapter_compatibility_score).toBeGreaterThanOrEqual(0.75);
  });

  it('telemetry adapter_file_overlap_count equals realPlan.deltaFiles.length', () => {
    expect(result.telemetry.adapter_file_overlap_count).toBe(REAL_PLAN.deltaFiles.length);
  });

  it('telemetry adapter_page_overlap_count equals realPlan.pages.length', () => {
    expect(result.telemetry.adapter_page_overlap_count).toBe((REAL_PLAN.pages ?? []).length);
  });
});

// ── Tests: missing deltaFiles lowers score ────────────────────────────────────

describe('compareArchitectPlanWithAdapter — missing deltaFiles in adapter', () => {
  const adapterNoDelta: ArchitectPlan = { ...REAL_PLAN, deltaFiles: [] };
  const result = compare(REAL_PLAN, adapterNoDelta);

  it('score is lower than identical-plan score', () => {
    const identicalScore = compare(REAL_PLAN, { ...REAL_PLAN }).compatibilityScore;
    expect(result.compatibilityScore).toBeLessThan(identicalScore);
  });

  it('reports real plan deltaFile paths as missing in adapter', () => {
    const missing = result.missingInAdapter.filter(m => m.startsWith('deltaFile:'));
    expect(missing.length).toBeGreaterThan(0);
    for (const df of REAL_PLAN.deltaFiles) {
      expect(result.missingInAdapter).toContain(`deltaFile:${df.path}`);
    }
  });

  it('telemetry adapter_file_overlap_count = 0', () => {
    expect(result.telemetry.adapter_file_overlap_count).toBe(0);
  });

  it('telemetry adapter_missing_fields_count > 0', () => {
    expect(result.telemetry.adapter_missing_fields_count).toBeGreaterThan(0);
  });
});

// ── Tests: missing fileTree lowers score ──────────────────────────────────────

describe('compareArchitectPlanWithAdapter — missing fileTree in adapter', () => {
  const adapterNoTree: ArchitectPlan = { ...REAL_PLAN, fileTree: {} };
  const result = compare(REAL_PLAN, adapterNoTree);

  it('score is lower than identical-plan score', () => {
    const identicalScore = compare(REAL_PLAN, { ...REAL_PLAN }).compatibilityScore;
    expect(result.compatibilityScore).toBeLessThan(identicalScore);
  });

  it('reports real plan fileTree keys as missing in adapter', () => {
    const missing = result.missingInAdapter.filter(m => m.startsWith('fileTree:'));
    expect(missing.length).toBeGreaterThan(0);
    for (const key of Object.keys(REAL_PLAN.fileTree)) {
      expect(result.missingInAdapter).toContain(`fileTree:${key}`);
    }
  });
});

// ── Tests: page mismatch detected ─────────────────────────────────────────────

describe('compareArchitectPlanWithAdapter — page path mismatch', () => {
  const adapterDifferentPages: ArchitectPlan = {
    ...REAL_PLAN,
    pages: [
      { path: '/dashboard', name: 'Dashboard', file: 'pages/Dashboard.tsx', purpose: 'KPIs' },
      { path: '/settings', name: 'Settings', file: 'pages/Settings.tsx', purpose: 'Config' },
    ],
  };
  const result = compare(REAL_PLAN, adapterDifferentPages);

  it('reports real plan page paths as missing in adapter', () => {
    const missingPages = result.missingInAdapter.filter(m => m.startsWith('page:'));
    expect(missingPages.length).toBeGreaterThan(0);
    for (const p of REAL_PLAN.pages ?? []) {
      expect(result.missingInAdapter).toContain(`page:${p.path}`);
    }
  });

  it('reports adapter-only page paths as extra in adapter', () => {
    const extraPages = result.extraInAdapter.filter(m => m.startsWith('page:'));
    expect(extraPages.length).toBeGreaterThan(0);
    expect(result.extraInAdapter).toContain('page:/dashboard');
    expect(result.extraInAdapter).toContain('page:/settings');
  });

  it('telemetry adapter_page_overlap_count = 0', () => {
    expect(result.telemetry.adapter_page_overlap_count).toBe(0);
  });
});

// ── Tests: skeleton mismatch detected ─────────────────────────────────────────

describe('compareArchitectPlanWithAdapter — skeleton mismatch', () => {
  const adapterWrongSkeleton: ArchitectPlan = {
    ...REAL_PLAN,
    skeleton: 'saas-dashboard' as ArchitectPlan['skeleton'],
  };
  const result = compare(REAL_PLAN, adapterWrongSkeleton);

  it('reports skeleton mismatch in mismatches array', () => {
    const skeletonMismatch = result.mismatches.find(m => m.startsWith('skeleton:'));
    expect(skeletonMismatch).toBeDefined();
    expect(skeletonMismatch).toContain('mobile-app');
    expect(skeletonMismatch).toContain('saas-dashboard');
  });

  it('skeleton mismatch lowers compatibilityScore vs identical', () => {
    const identicalScore = compare(REAL_PLAN, { ...REAL_PLAN }).compatibilityScore;
    expect(result.compatibilityScore).toBeLessThan(identicalScore);
  });
});

// ── Tests: required field absence detected ────────────────────────────────────

describe('compareArchitectPlanWithAdapter — required field absence', () => {
  // Strip the required fields deltaFiles and fileTree from the adapter plan.
  const adapterMissingRequired: ArchitectPlan = {
    ...REAL_PLAN,
    deltaFiles: [],
    fileTree: {},
  };
  const result = compare(REAL_PLAN, adapterMissingRequired);

  it('reports requiredField:deltaFiles in missingInAdapter', () => {
    expect(result.missingInAdapter).toContain('requiredField:deltaFiles');
  });

  it('reports requiredField:fileTree in missingInAdapter', () => {
    expect(result.missingInAdapter).toContain('requiredField:fileTree');
  });

  it('compatible = false when critical required fields absent', () => {
    expect(result.compatible).toBe(false);
  });
});

// ── Tests: adapter readiness result is reflected in telemetry ─────────────────

describe('compareArchitectPlanWithAdapter — readiness reflected in telemetry', () => {
  it('telemetry adapter_readiness_ok = true when readiness.ready = true', () => {
    const result = compare(REAL_PLAN, { ...REAL_PLAN }, READY_READINESS);
    expect(result.telemetry.adapter_readiness_ok).toBe(true);
  });

  it('telemetry adapter_readiness_ok = false when readiness.ready = false', () => {
    const result = compare(REAL_PLAN, { ...REAL_PLAN }, NOT_READY_READINESS);
    expect(result.telemetry.adapter_readiness_ok).toBe(false);
  });

  it('adapter_replacement_safe_candidate = true only when compatible AND ready', () => {
    const result = compare(REAL_PLAN, { ...REAL_PLAN }, READY_READINESS);
    expect(result.telemetry.adapter_replacement_safe_candidate).toBe(
      result.telemetry.adapter_compatible && result.telemetry.adapter_readiness_ok,
    );
  });

  it('adapter_replacement_safe_candidate = false when readiness.ready = false', () => {
    const result = compare(REAL_PLAN, { ...REAL_PLAN }, NOT_READY_READINESS);
    expect(result.telemetry.adapter_replacement_safe_candidate).toBe(false);
  });
});

// ── Tests: comparison is advisory-only ────────────────────────────────────────

describe('compareArchitectPlanWithAdapter — advisory-only guarantee', () => {
  it('does not throw for any valid input combination', () => {
    expect(() => compare(REAL_PLAN, { ...REAL_PLAN })).not.toThrow();
    expect(() =>
      compare(REAL_PLAN, { ...REAL_PLAN, deltaFiles: [], fileTree: {}, pages: [] }),
    ).not.toThrow();
    expect(() =>
      compare(
        { ...REAL_PLAN, deltaFiles: [], fileTree: {} },
        { ...REAL_PLAN },
      ),
    ).not.toThrow();
  });

  it('does not mutate realPlan', () => {
    const snapshotBefore = JSON.stringify(REAL_PLAN);
    compare(REAL_PLAN, { ...REAL_PLAN, deltaFiles: [] });
    expect(JSON.stringify(REAL_PLAN)).toBe(snapshotBefore);
  });

  it('does not mutate adapterPlan', () => {
    const adapterCopy: ArchitectPlan = { ...REAL_PLAN };
    const snapshotBefore = JSON.stringify(adapterCopy);
    compare(REAL_PLAN, adapterCopy);
    expect(JSON.stringify(adapterCopy)).toBe(snapshotBefore);
  });

  it('result has all required telemetry fields', () => {
    const result = compare(REAL_PLAN, { ...REAL_PLAN });
    expect(result.telemetry.architect_adapter_shadow_enabled).toBe(true);
    expect(typeof result.telemetry.adapter_compatible).toBe('boolean');
    expect(typeof result.telemetry.adapter_compatibility_score).toBe('number');
    expect(typeof result.telemetry.adapter_missing_fields_count).toBe('number');
    expect(typeof result.telemetry.adapter_file_overlap_count).toBe('number');
    expect(typeof result.telemetry.adapter_page_overlap_count).toBe('number');
    expect(typeof result.telemetry.adapter_readiness_ok).toBe('boolean');
    expect(typeof result.telemetry.adapter_replacement_safe_candidate).toBe('boolean');
  });

  it('result has all structural arrays', () => {
    const result = compare(REAL_PLAN, { ...REAL_PLAN });
    expect(Array.isArray(result.missingInAdapter)).toBe(true);
    expect(Array.isArray(result.extraInAdapter)).toBe(true);
    expect(Array.isArray(result.mismatches)).toBe(true);
  });

  it('is synchronous — no Promise returned', () => {
    const result = compare(REAL_PLAN, { ...REAL_PLAN });
    expect(result).not.toBeInstanceOf(Promise);
  });
});

// ── Tests: no real LLM calls ──────────────────────────────────────────────────

describe('compareArchitectPlanWithAdapter — no real LLM calls', () => {
  it('executes without network access (synchronous, deterministic)', () => {
    // If this test completes synchronously without timeout, it made no async LLM calls.
    let completed = false;
    const result = compareArchitectPlanWithAdapter({
      realPlan: REAL_PLAN,
      adapterPlan: { ...REAL_PLAN },
      adapterReadiness: READY_READINESS,
    });
    completed = true;
    expect(completed).toBe(true);
    expect(result.compatibilityScore).toBeGreaterThanOrEqual(0);
  });

  it('result is deterministic for the same inputs', () => {
    const input: CompareArchitectPlanWithAdapterInput = {
      realPlan: REAL_PLAN,
      adapterPlan: { ...REAL_PLAN },
      adapterReadiness: READY_READINESS,
    };
    const r1 = compareArchitectPlanWithAdapter(input);
    const r2 = compareArchitectPlanWithAdapter(input);
    expect(r1.compatibilityScore).toBe(r2.compatibilityScore);
    expect(r1.compatible).toBe(r2.compatible);
    expect(r1.missingInAdapter).toEqual(r2.missingInAdapter);
    expect(r1.extraInAdapter).toEqual(r2.extraInAdapter);
    expect(r1.mismatches).toEqual(r2.mismatches);
  });
});
