// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import {
  computeSummary,
  renderMarkdownSummary,
  type BenchmarkReport,
  type IntentRunResult,
} from '../benchmark/BenchmarkReport';

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

describe('BenchmarkReport visual-quality support', () => {
  it('computes visual aggregate fields and renders a visual-quality section when present', () => {
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
      createResult({
        intentId: 'intent-3',
        outcome: 'failed',
        error: 'compile failed',
      }),
    ];

    const summary = computeSummary(results);
    const report: BenchmarkReport = {
      version: 1,
      runId: 'bench-visual',
      startedAt: '2026-04-19T00:00:00.000Z',
      finishedAt: '2026-04-19T00:01:00.000Z',
      modelId: 'test-model',
      totalMs: 3000,
      results,
      summary,
    };

    const markdown = renderMarkdownSummary(report);

    expect(summary.visualQuality).toEqual({
      measuredIntents: 2,
      avgScore: 75,
      verdictDistribution: {
        strong: 0.5,
        acceptable: 0.5,
        weak: 0,
      },
      notes: ['Visual quality available for 2 of 3 intents.'],
    });
    expect(markdown).toContain('## Visual Quality');
    expect(markdown).toContain('| Avg visual score | 75 |');
    expect(markdown).toContain('| Strong verdict rate | 50% |');
    expect(markdown).toContain('Visual quality available for 2 of 3 intents.');
    expect(markdown).toContain('| ID | Category | Outcome | Files | Routes | Features | Visual score | Visual verdict | Time | Blocking |');
  });

  it('remains backward compatible when no visual-quality data is present', () => {
    const results: IntentRunResult[] = [
      createResult({ intentId: 'intent-1', outcome: 'preview-ready' }),
      createResult({ intentId: 'intent-2', outcome: 'blocked', blockingCodes: ['runtime'] }),
    ];

    const summary = computeSummary(results);
    const report: BenchmarkReport = {
      version: 1,
      runId: 'bench-no-visual',
      startedAt: '2026-04-19T00:00:00.000Z',
      finishedAt: '2026-04-19T00:00:10.000Z',
      modelId: 'test-model',
      totalMs: 2000,
      results,
      summary,
    };

    const markdown = renderMarkdownSummary(report);

    expect(summary.visualQuality).toBeUndefined();
    expect(markdown).not.toContain('## Visual Quality');
    expect(markdown).toContain('| ID | Category | Outcome | Files | Routes | Features | Time | Blocking |');
    expect(markdown).not.toContain('Visual verdict');
  });
});
