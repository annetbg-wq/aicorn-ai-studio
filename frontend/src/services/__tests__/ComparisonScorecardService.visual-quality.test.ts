// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { ComparisonScorecardService } from '../benchmark/ComparisonScorecardService';
import type { BaselineMetrics } from '../benchmark/BaselineSchema';
import { computeSummary, type BenchmarkReport, type IntentRunResult } from '../benchmark/BenchmarkReport';

function createResult(
  partial: Partial<IntentRunResult> & Pick<IntentRunResult, 'intentId' | 'outcome'>,
): IntentRunResult {
  return {
    intentId: partial.intentId,
    category: partial.category ?? ('dashboard' as any),
    modelId: partial.modelId ?? 'test-model',
    durationMs: partial.durationMs ?? 1000,
    fileCount: partial.fileCount ?? 4,
    routeCount: partial.routeCount ?? 1,
    featureCount: partial.featureCount ?? 2,
    outcome: partial.outcome,
    blockingCodes: partial.blockingCodes ?? [],
    error: partial.error ?? null,
    visualQuality: partial.visualQuality,
  };
}

function createBenchmarkReport(): BenchmarkReport {
  const results: IntentRunResult[] = [
    createResult({
      intentId: 'intent-1',
      outcome: 'preview-ready',
      visualQuality: {
        score: 82,
        verdict: 'strong',
        reasons: ['Clear hierarchy'],
      },
    }),
    createResult({
      intentId: 'intent-2',
      outcome: 'preview-ready',
      visualQuality: {
        score: 68,
        verdict: 'acceptable',
        reasons: ['CTA clarity is workable'],
      },
    }),
  ];

  return {
    version: 1,
    runId: 'bench-scorecard',
    startedAt: '2026-04-19T00:00:00.000Z',
    finishedAt: '2026-04-19T00:00:20.000Z',
    modelId: 'test-model',
    totalMs: 2000,
    results,
    summary: computeSummary(results),
  };
}

describe('ComparisonScorecardService visual-quality support', () => {
  it('includes visual-quality rows when both studio and baseline visual data exist', () => {
    const report = createBenchmarkReport();
    const baseline: BaselineMetrics = {
      toolName: 'Lovable',
      recordedAt: '2026-04-18T00:00:00.000Z',
      intentCount: 2,
      avgTimeToFirstPreviewMs: 2500,
      firstPassSuccessRate: 0.8,
      avgFileCount: 3,
      avgRouteCount: 1,
      avgFeatureCount: 2,
      blockedOrFailedRate: 0.2,
      exportCompleteness: 0.9,
      visualQuality: {
        avgScore: 70,
        verdictDistribution: {
          strong: 0.25,
          weak: 0.5,
        },
        notes: ['Manual visual audit from side-by-side review.'],
      },
    };

    const scorecard = ComparisonScorecardService.compare(report, baseline);
    const visualRows = scorecard.rows.filter(row => row.section === 'visual-quality');

    expect(visualRows.map(row => row.metric)).toEqual([
      'visual-score',
      'strong-visual-verdict-rate',
      'weak-visual-verdict-rate',
    ]);
    expect(visualRows[0]?.note).toContain('Manual visual audit');
    expect(scorecard.markdown).toContain('## Visual Quality');
    expect(scorecard.markdown).toContain('Visual quality score (avg)');
    expect(scorecard.markdown).toContain('Strong visual verdict rate');
    expect(scorecard.markdown).toContain('Weak visual verdict rate');
  });

  it('stays backward compatible when baseline visual data is absent', () => {
    const report = createBenchmarkReport();
    const baseline: BaselineMetrics = {
      toolName: 'Lovable',
      recordedAt: '2026-04-18T00:00:00.000Z',
      intentCount: 2,
      avgTimeToFirstPreviewMs: 2500,
      firstPassSuccessRate: 0.8,
      avgFileCount: 3,
      avgRouteCount: 1,
      avgFeatureCount: 2,
      blockedOrFailedRate: 0.2,
      exportCompleteness: 0.9,
    };

    const scorecard = ComparisonScorecardService.compare(report, baseline);

    expect(scorecard.rows.some(row => row.section === 'visual-quality')).toBe(false);
    expect(scorecard.markdown).toContain('## Operational Metrics');
    expect(scorecard.markdown).not.toContain('## Visual Quality');
  });
});
