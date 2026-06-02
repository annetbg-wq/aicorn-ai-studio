import { describe, expect, it } from 'vitest';

import { BenchmarkGate } from '../benchmark/BenchmarkGate';
import { computeSummary, type BenchmarkReport, type IntentRunResult } from '../benchmark/BenchmarkReport';
import { buildAggregateBaseline } from '../benchmark/BaselineStore';

function makeResult(
  intentId: string,
  outcome: IntentRunResult['outcome'],
  fileCount: number,
  durationMs: number,
): IntentRunResult {
  return {
    intentId,
    category: 'dashboard',
    modelId: 'openai/gpt-4o-mini',
    durationMs,
    fileCount,
    routeCount: 2,
    featureCount: 4,
    outcome,
    blockingCodes: outcome === 'blocked' ? ['runtime-guard'] : [],
    error: outcome === 'failed' ? 'boom' : null,
    filesProduced: fileCount > 0,
    qualityPassed: outcome === 'preview-ready',
  };
}

function makeReport(results: IntentRunResult[]): BenchmarkReport {
  return {
    version: 1,
    runId: 'bench-test',
    startedAt: '2026-06-02T00:00:00.000Z',
    finishedAt: '2026-06-02T00:01:00.000Z',
    modelId: 'openai/gpt-4o-mini',
    totalMs: results.reduce((sum, result) => sum + result.durationMs, 0),
    results,
    summary: computeSummary(results),
  };
}

describe('BenchmarkGate', () => {
  it('flags preview-ready rate drops as regressions', () => {
    const baselineReport = makeReport([
      makeResult('a', 'preview-ready', 6, 10_000),
      makeResult('b', 'preview-ready', 6, 11_000),
      makeResult('c', 'preview-ready', 7, 9_000),
      makeResult('d', 'preview-ready', 6, 10_000),
      makeResult('e', 'preview-ready', 5, 10_000),
    ]);
    const currentReport = makeReport([
      makeResult('a', 'preview-ready', 6, 10_000),
      makeResult('b', 'blocked', 6, 10_500),
      makeResult('c', 'preview-ready', 6, 10_000),
      makeResult('d', 'preview-ready', 5, 10_500),
      makeResult('e', 'preview-ready', 5, 10_000),
    ]);

    const verdict = BenchmarkGate.evaluate(currentReport, buildAggregateBaseline(baselineReport));

    expect(verdict.passed).toBe(false);
    expect(verdict.regressions).toHaveLength(1);
    expect(verdict.regressions[0]?.metric).toBe('previewReadyRate');
  });

  it('passes when file count and duration change but all axes stay above regression floors', () => {
    // File count and duration are NOT regression axes — only GATE_AXES (filesProduced,
    // qualityPass, visualScore, previewReady) can block the gate.
    const baselineReport = makeReport([
      makeResult('a', 'preview-ready', 10, 10_000),
      makeResult('b', 'preview-ready', 10, 10_000),
      makeResult('c', 'preview-ready', 10, 10_000),
      makeResult('d', 'preview-ready', 10, 10_000),
      makeResult('e', 'preview-ready', 10, 10_000),
    ]);
    const currentReport = makeReport([
      makeResult('a', 'preview-ready', 6, 25_000),
      makeResult('b', 'preview-ready', 6, 25_000),
      makeResult('c', 'preview-ready', 6, 25_000),
      makeResult('d', 'preview-ready', 6, 25_000),
      makeResult('e', 'preview-ready', 6, 25_000),
    ]);

    const verdict = BenchmarkGate.evaluate(currentReport, buildAggregateBaseline(baselineReport));

    expect(verdict.passed).toBe(true);
    expect(verdict.regressions).toHaveLength(0);
    // No warnings in axis-based model — all relevant checks are REGRESSION axes
    expect(verdict.warnings).toHaveLength(0);
  });
});
