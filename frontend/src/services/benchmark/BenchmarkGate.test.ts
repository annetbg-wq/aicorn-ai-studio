// @vitest-environment node
/**
 * BenchmarkGate unit tests.
 *
 * Five invariants:
 *   1. Null baseline → assertBaselineUsable throws.
 *   2. Zero on any required axis → assertBaselineUsable throws.
 *   3. Regression on each structural axis (filesProduced, qualityPass, visualScore).
 *   4. Regression on previewReady (E2E axis).
 *   5. Passing run with all axes above regression floor → verdict.passed === true.
 */
import { describe, expect, it } from 'vitest';
import { BenchmarkGate, assertBaselineUsable, GATE_AXES } from './BenchmarkGate';
import type { AggregateBaseline } from './BaselineStore';
import type { BenchmarkReport, IntentRunResult } from './BenchmarkReport';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeBaseline(overrides: Partial<AggregateBaseline> = {}): AggregateBaseline {
  return {
    modelId:           'test-model',
    runId:             'base-001',
    createdAt:         '2026-01-01T00:00:00.000Z',
    intentCount:       5,
    avgFileCount:      8,
    avgDurationMs:     20000,
    previewReadyRate:  0.8,
    filesProducedRate: 1.0,
    qualityPassRate:   0.9,
    avgVisualScore:    70,
    ...overrides,
  };
}

function makeResult(overrides: Partial<IntentRunResult> = {}): IntentRunResult {
  return {
    intentId:      'intent-1',
    category:      'dashboard',
    modelId:       'test-model',
    durationMs:    20000,
    fileCount:     8,
    routeCount:    2,
    featureCount:  3,
    outcome:       'preview-ready',
    blockingCodes: [],
    error:         null,
    filesProduced: true,
    qualityPassed: true,
    visualQuality: { score: 70, verdict: 'acceptable', reasons: [] },
    ...overrides,
  };
}

function makeReport(results: IntentRunResult[]): BenchmarkReport {
  const total = results.length;
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
      blocked:         0,
      failed,
      avgDurationMs:   Math.round(avg(results.map(r => r.durationMs))),
      avgFileCount:    Math.round(avg(results.map(r => r.fileCount))),
      avgRouteCount:   Math.round(avg(results.map(r => r.routeCount))),
      avgFeatureCount: Math.round(avg(results.map(r => r.featureCount))),
      byCategory:      {} as never,
      filesProducedRate: total > 0 ? results.filter(r => r.filesProduced).length / total : 0,
      qualityPassRate:   total > 0 ? results.filter(r => r.qualityPassed).length / total : 0,
      visualQuality: {
        measuredIntents: results.filter(r => r.visualQuality).length,
        avgScore: Math.round(avg(results.filter(r => r.visualQuality).map(r => r.visualQuality!.score))),
        verdictDistribution: { strong: 0, acceptable: 1, weak: 0 },
      },
    },
  };
}

// ── 1. Null baseline ──────────────────────────────────────────────────────────

describe('assertBaselineUsable', () => {
  it('throws on null baseline', () => {
    expect(() => assertBaselineUsable(null)).toThrowError(/No baseline found/);
  });

  it('throws when filesProducedRate is 0', () => {
    expect(() => assertBaselineUsable(makeBaseline({ filesProducedRate: 0 })))
      .toThrowError(/filesProduced.*is 0/);
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

// ── 2–4. Regression detection per axis ───────────────────────────────────────

describe('BenchmarkGate.evaluate — structural axes (Layer 1)', () => {
  it('REGRESSION when filesProducedRate drops beyond threshold', () => {
    const baseline = makeBaseline({ filesProducedRate: 1.0 });
    // 1.0 - 0.20 threshold = 0.80 floor; 0.50 is below floor
    const results = Array.from({ length: 5 }, (_, i) =>
      makeResult({ filesProduced: i < 2, fileCount: i < 2 ? 5 : 0 }),
    );
    const report = makeReport(results); // filesProducedRate = 0.40

    const verdict = BenchmarkGate.evaluate(report, baseline);
    expect(verdict.passed).toBe(false);
    expect(verdict.regressions.some(r => r.axisId === 'filesProduced')).toBe(true);
  });

  it('REGRESSION when qualityPassRate drops beyond threshold', () => {
    const baseline = makeBaseline({ qualityPassRate: 1.0 });
    // floor = 0.80; current = 0.40 → regression
    const results = Array.from({ length: 5 }, (_, i) =>
      makeResult({ qualityPassed: i < 2 }),
    );
    const report = makeReport(results);

    const verdict = BenchmarkGate.evaluate(report, baseline);
    expect(verdict.passed).toBe(false);
    expect(verdict.regressions.some(r => r.axisId === 'qualityPass')).toBe(true);
  });

  it('REGRESSION when avgVisualScore drops beyond threshold', () => {
    const baseline = makeBaseline({ avgVisualScore: 75 });
    // floor = 75 - 10 = 65; current ≈ 50 → regression
    const results = Array.from({ length: 5 }, () =>
      makeResult({ visualQuality: { score: 50, verdict: 'weak', reasons: [] } }),
    );
    const report = makeReport(results);

    const verdict = BenchmarkGate.evaluate(report, baseline);
    expect(verdict.passed).toBe(false);
    expect(verdict.regressions.some(r => r.axisId === 'visualScore')).toBe(true);
  });
});

describe('BenchmarkGate.evaluate — E2E axis (Layer 2)', () => {
  it('REGRESSION when previewReadyRate drops at all (threshold = 0)', () => {
    const baseline = makeBaseline({ previewReadyRate: 0.8 });
    // Any drop is a regression; current = 0.6
    const results = Array.from({ length: 5 }, (_, i) =>
      makeResult({ outcome: i < 3 ? 'preview-ready' : 'failed' }),
    );
    const report = makeReport(results); // previewReadyRate = 0.6

    const verdict = BenchmarkGate.evaluate(report, baseline);
    expect(verdict.passed).toBe(false);
    expect(verdict.regressions.some(r => r.axisId === 'previewReady')).toBe(true);
  });
});

// ── 5. Passing case ───────────────────────────────────────────────────────────

describe('BenchmarkGate.evaluate — passing case', () => {
  it('passes when all axes are at or above baseline', () => {
    const baseline = makeBaseline({
      previewReadyRate:  0.8,
      filesProducedRate: 1.0,
      qualityPassRate:   0.9,
      avgVisualScore:    70,
    });
    // All 5 intents succeed; metrics are >= baseline
    const results = Array.from({ length: 5 }, () =>
      makeResult({ outcome: 'preview-ready', filesProduced: true, qualityPassed: true }),
    );
    const report = makeReport(results);

    const verdict = BenchmarkGate.evaluate(report, baseline);
    expect(verdict.passed).toBe(true);
    expect(verdict.regressions).toHaveLength(0);
  });

  it('passes when current is slightly below but within threshold', () => {
    const baseline = makeBaseline({ filesProducedRate: 1.0, qualityPassRate: 1.0, avgVisualScore: 70, previewReadyRate: 0.8 });
    // filesProducedRate 0.9 is within 0.20 threshold of 1.0
    const results = Array.from({ length: 10 }, (_, i) =>
      makeResult({ filesProduced: i < 9, qualityPassed: i < 9 }),
    );
    const report = makeReport(results);

    const verdict = BenchmarkGate.evaluate(report, baseline);
    expect(verdict.regressions.filter(r => r.axisId === 'filesProduced')).toHaveLength(0);
    expect(verdict.regressions.filter(r => r.axisId === 'qualityPass')).toHaveLength(0);
  });
});

// ── 6. GATE_AXES invariants ───────────────────────────────────────────────────

describe('GATE_AXES structure', () => {
  it('contains exactly four axes with unique ids', () => {
    const ids = GATE_AXES.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all required axes have valid thresholds (≥ 0)', () => {
    for (const axis of GATE_AXES) {
      expect(axis.threshold).toBeGreaterThanOrEqual(0);
    }
  });

  it('previewReady axis has zero threshold (any drop = regression)', () => {
    const axis = GATE_AXES.find(a => a.id === 'previewReady');
    expect(axis?.threshold).toBe(0);
  });
});
