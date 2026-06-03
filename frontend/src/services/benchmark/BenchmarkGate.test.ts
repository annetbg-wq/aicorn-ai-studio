// @vitest-environment node
/**
 * BenchmarkGate unit tests — two design-contract axes.
 *
 * Invariants:
 *   1. Null baseline → assertBaselineUsable throws.
 *   2. Zero on required axis → throws; zero on non-required (designContractClean) does NOT throw.
 *   3. Regression on each axis (clean, final, qualityPass, visualScore, previewReady).
 *   4. KEY PROOF: clean ≠ final on an intent that had violation + repair
 *      (clean=false, final=true) — axes are not collapsed.
 *   5. Passing run above regression floors → verdict.passed === true.
 *   6. GATE_AXES structure invariants.
 */
import { describe, expect, it } from 'vitest';
import { BenchmarkGate, assertBaselineUsable, GATE_AXES } from './BenchmarkGate';
import type { AggregateBaseline } from './BaselineStore';
import type { BenchmarkReport, IntentRunResult } from './BenchmarkReport';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeBaseline(overrides: Partial<AggregateBaseline> = {}): AggregateBaseline {
  return {
    modelId:                 'test-model',
    runId:                   'base-001',
    createdAt:               '2026-01-01T00:00:00.000Z',
    intentCount:             5,
    avgFileCount:            8,
    avgDurationMs:           20000,
    previewReadyRate:        0.8,
    designContractCleanRate: 0.4,  // flash rarely clean on first pass — realistic baseline
    designContractFinalRate: 0.9,  // repair reliably fixes violations
    qualityPassRate:         0.9,
    avgVisualScore:          70,
    ...overrides,
  };
}

function makeResult(overrides: Partial<IntentRunResult> = {}): IntentRunResult {
  return {
    intentId:                  'intent-1',
    category:                  'dashboard',
    modelId:                   'test-model',
    durationMs:                20000,
    fileCount:                 8,
    routeCount:                2,
    featureCount:              3,
    outcome:                   'preview-ready',
    blockingCodes:             [],
    error:                     null,
    designContractCleanPassed: true,
    designContractFinalPassed: true,
    qualityPassed:             true,
    visualQuality:             { score: 70, verdict: 'acceptable', reasons: [] },
    ...overrides,
  };
}

function makeReport(results: IntentRunResult[]): BenchmarkReport {
  const total        = results.length;
  const previewReady = results.filter(r => r.outcome === 'preview-ready').length;
  const failed       = results.filter(r => r.outcome === 'failed').length;
  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  return {
    version:    1,
    runId:      'run-001',
    startedAt:  '2026-01-02T00:00:00.000Z',
    finishedAt: '2026-01-02T00:10:00.000Z',
    modelId:    'test-model',
    totalMs:    results.reduce((s, r) => s + r.durationMs, 0),
    results,
    summary: {
      total,
      previewReady,
      blocked:                 0,
      failed,
      avgDurationMs:           Math.round(avg(results.map(r => r.durationMs))),
      avgFileCount:            Math.round(avg(results.map(r => r.fileCount))),
      avgRouteCount:           Math.round(avg(results.map(r => r.routeCount))),
      avgFeatureCount:         Math.round(avg(results.map(r => r.featureCount))),
      byCategory:              {} as never,
      designContractCleanRate: total > 0 ? results.filter(r => r.designContractCleanPassed).length / total : 0,
      designContractFinalRate: total > 0 ? results.filter(r => r.designContractFinalPassed).length / total : 0,
      qualityPassRate:         total > 0 ? results.filter(r => r.qualityPassed).length / total : 0,
      visualQuality: {
        measuredIntents:     results.filter(r => r.visualQuality).length,
        avgScore:            Math.round(avg(results.filter(r => r.visualQuality).map(r => r.visualQuality!.score))),
        verdictDistribution: { strong: 0, acceptable: 1, weak: 0 },
      },
    },
  };
}

// ── 1. assertBaselineUsable ────────────────────────────────────────────────────

describe('assertBaselineUsable', () => {
  it('throws on null baseline', () => {
    expect(() => assertBaselineUsable(null)).toThrowError(/No baseline found/);
  });

  it('does NOT throw when designContractCleanRate is 0 (non-required axis)', () => {
    // clean is non-required: flash always starts with violations, baseline=0% is expected
    expect(() => assertBaselineUsable(makeBaseline({ designContractCleanRate: 0 }))).not.toThrow();
  });

  it('throws when designContractFinalRate is 0 (required axis)', () => {
    expect(() => assertBaselineUsable(makeBaseline({ designContractFinalRate: 0 })))
      .toThrowError(/designContractFinal.*is 0/);
  });

  it('throws when qualityPassRate is 0', () => {
    expect(() => assertBaselineUsable(makeBaseline({ qualityPassRate: 0 })))
      .toThrowError(/qualityPass.*is 0/);
  });

  it('throws when avgVisualScore is 0', () => {
    expect(() => assertBaselineUsable(makeBaseline({ avgVisualScore: 0 })))
      .toThrowError(/visualScore.*is 0/);
  });

  it('throws when previewReadyRate is 0', () => {
    expect(() => assertBaselineUsable(makeBaseline({ previewReadyRate: 0 })))
      .toThrowError(/previewReady.*is 0/);
  });

  it('passes a fully populated baseline', () => {
    expect(() => assertBaselineUsable(makeBaseline())).not.toThrow();
  });
});

// ── KEY PROOF: clean ≠ final — axes are not collapsed ────────────────────────

describe('clean vs final axes — proof of independence', () => {
  it('clean=false, final=true when violation happened + repair succeeded', () => {
    // Simulates the typical flash scenario:
    //   coder violates contract (bg-blue-500) → clean=false
    //   repair fixes it → final=true
    //   build succeeds → pipeline completes
    const results = Array.from({ length: 5 }, () =>
      makeResult({
        designContractCleanPassed: false,   // coder first pass: violated
        designContractFinalPassed: true,    // after repair: contract satisfied
        outcome: 'preview-ready',
      }),
    );
    const report = makeReport(results);

    expect(report.summary.designContractCleanRate).toBe(0);   // 0/5 clean
    expect(report.summary.designContractFinalRate).toBe(1.0); // 5/5 final

    // Gate: clean drops from 0.4 → 0 (within 0.10 threshold → no regression)
    //        final stays at 1.0 (> baseline 0.9 → no regression)
    const baseline = makeBaseline({ designContractCleanRate: 0.4, designContractFinalRate: 0.9 });
    const verdict = BenchmarkGate.evaluate(report, baseline);
    expect(verdict.regressions.some(r => r.axisId === 'designContractFinal')).toBe(false);
  });

  it('clean=false, final=false when violation happened + repair FAILED', () => {
    // Repair ran but could not fix the violations (or infra failure)
    const results = Array.from({ length: 5 }, () =>
      makeResult({
        designContractCleanPassed: false,
        designContractFinalPassed: false,
      }),
    );
    const report = makeReport(results);

    expect(report.summary.designContractCleanRate).toBe(0);
    expect(report.summary.designContractFinalRate).toBe(0);

    // Gate: final drops from 0.9 → 0, well below 0.75 floor → REGRESSION
    const baseline = makeBaseline({ designContractFinalRate: 0.9 });
    const verdict = BenchmarkGate.evaluate(report, baseline);
    expect(verdict.regressions.some(r => r.axisId === 'designContractFinal')).toBe(true);
  });

  it('clean=true, final=true when coder was already clean (no repair needed)', () => {
    const results = Array.from({ length: 5 }, () =>
      makeResult({ designContractCleanPassed: true, designContractFinalPassed: true }),
    );
    const report = makeReport(results);

    expect(report.summary.designContractCleanRate).toBe(1.0);
    expect(report.summary.designContractFinalRate).toBe(1.0);
  });
});

// ── Regression detection per axis ─────────────────────────────────────────────

describe('BenchmarkGate.evaluate — structural axes (Layer 1)', () => {
  it('REGRESSION when designContractCleanRate drops beyond threshold (0.10)', () => {
    // baseline=0.4 → floor=0.30; current=0/5=0.0 < 0.30 → regression
    const baseline = makeBaseline({ designContractCleanRate: 0.4 });
    const results  = Array.from({ length: 5 }, () =>
      makeResult({ designContractCleanPassed: false }),
    );
    const verdict = BenchmarkGate.evaluate(makeReport(results), baseline);
    expect(verdict.passed).toBe(false);
    expect(verdict.regressions.some(r => r.axisId === 'designContractClean')).toBe(true);
  });

  it('does NOT regress when designContractCleanRate is within threshold', () => {
    // baseline=0.4 → floor=0.30; current=2/5=0.40 → no regression
    const baseline = makeBaseline({ designContractCleanRate: 0.4 });
    const results  = Array.from({ length: 5 }, (_, i) =>
      makeResult({ designContractCleanPassed: i < 2 }),
    );
    const verdict = BenchmarkGate.evaluate(makeReport(results), baseline);
    expect(verdict.regressions.some(r => r.axisId === 'designContractClean')).toBe(false);
  });

  it('REGRESSION when designContractFinalRate drops beyond threshold (0.15)', () => {
    // baseline=0.9 → floor=0.75; current=2/5=0.40 < 0.75 → regression
    const baseline = makeBaseline({ designContractFinalRate: 0.9 });
    const results  = Array.from({ length: 5 }, (_, i) =>
      makeResult({ designContractFinalPassed: i < 2 }),
    );
    const verdict = BenchmarkGate.evaluate(makeReport(results), baseline);
    expect(verdict.passed).toBe(false);
    expect(verdict.regressions.some(r => r.axisId === 'designContractFinal')).toBe(true);
  });

  it('REGRESSION when qualityPassRate drops beyond threshold', () => {
    const baseline = makeBaseline({ qualityPassRate: 1.0 });
    const results  = Array.from({ length: 5 }, (_, i) =>
      makeResult({ qualityPassed: i < 2 }),
    );
    const verdict = BenchmarkGate.evaluate(makeReport(results), baseline);
    expect(verdict.passed).toBe(false);
    expect(verdict.regressions.some(r => r.axisId === 'qualityPass')).toBe(true);
  });

  it('REGRESSION when avgVisualScore drops beyond threshold', () => {
    const baseline = makeBaseline({ avgVisualScore: 75 });
    const results  = Array.from({ length: 5 }, () =>
      makeResult({ visualQuality: { score: 50, verdict: 'weak', reasons: [] } }),
    );
    const verdict = BenchmarkGate.evaluate(makeReport(results), baseline);
    expect(verdict.passed).toBe(false);
    expect(verdict.regressions.some(r => r.axisId === 'visualScore')).toBe(true);
  });
});

describe('BenchmarkGate.evaluate — E2E axis (Layer 2)', () => {
  it('REGRESSION when previewReadyRate drops at all (threshold = 0)', () => {
    const baseline = makeBaseline({ previewReadyRate: 0.8 });
    const results  = Array.from({ length: 5 }, (_, i) =>
      makeResult({ outcome: i < 3 ? 'preview-ready' : 'failed' }),
    );
    const verdict = BenchmarkGate.evaluate(makeReport(results), baseline);
    expect(verdict.passed).toBe(false);
    expect(verdict.regressions.some(r => r.axisId === 'previewReady')).toBe(true);
  });
});

// ── Passing case ──────────────────────────────────────────────────────────────

describe('BenchmarkGate.evaluate — passing case', () => {
  it('passes when all required axes are at or above baseline', () => {
    const baseline = makeBaseline();
    const results  = Array.from({ length: 5 }, () =>
      makeResult({ outcome: 'preview-ready', designContractCleanPassed: true, designContractFinalPassed: true }),
    );
    const verdict = BenchmarkGate.evaluate(makeReport(results), baseline);
    expect(verdict.passed).toBe(true);
    expect(verdict.regressions).toHaveLength(0);
  });

  it('passes even when designContractClean drops (non-required, within threshold)', () => {
    // clean is non-required; small drops don't block the gate
    const baseline = makeBaseline({ designContractCleanRate: 0.4 });
    const results  = Array.from({ length: 5 }, (_, i) =>
      makeResult({ designContractCleanPassed: i < 2 }), // 0.40 — at baseline, no regression
    );
    const verdict = BenchmarkGate.evaluate(makeReport(results), baseline);
    expect(verdict.regressions.filter(r => r.axisId === 'designContractClean')).toHaveLength(0);
  });
});

// ── GATE_AXES structure ────────────────────────────────────────────────────────

describe('GATE_AXES structure', () => {
  it('contains five axes with unique ids', () => {
    const ids = GATE_AXES.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('designContractClean');
    expect(ids).toContain('designContractFinal');
    expect(ids).toContain('qualityPass');
    expect(ids).toContain('visualScore');
    expect(ids).toContain('previewReady');
  });

  it('designContractClean is non-required (flash baseline=0 allowed)', () => {
    const axis = GATE_AXES.find(a => a.id === 'designContractClean');
    expect(axis?.required).toBe(false);
  });

  it('designContractFinal is required (repair must work)', () => {
    const axis = GATE_AXES.find(a => a.id === 'designContractFinal');
    expect(axis?.required).toBe(true);
  });

  it('previewReady axis has zero threshold (any drop = regression)', () => {
    const axis = GATE_AXES.find(a => a.id === 'previewReady');
    expect(axis?.threshold).toBe(0);
  });

  it('all thresholds are non-negative', () => {
    for (const axis of GATE_AXES) {
      expect(axis.threshold).toBeGreaterThanOrEqual(0);
    }
  });
});
