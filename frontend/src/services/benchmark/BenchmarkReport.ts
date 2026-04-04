/**
 * BenchmarkReport — structured report types and markdown summary renderer
 * for golden-intent benchmark runs.
 *
 * Re-exports ComparisonScorecardService types so callers can import everything
 * benchmark-related from this single module.
 */

import type { IntentCategory } from './goldenIntents';

// Re-export scorecard surface so BenchmarkReport is the single benchmark barrel
export type {
  ScorecardVerdict,
  ScorecardRow,
  ComparisonScorecardReport,
  ScorecardOptions,
} from './ComparisonScorecardService';
export { ComparisonScorecardService } from './ComparisonScorecardService';
export type { BaselineMetrics } from './BaselineSchema';
export { validateBaseline, EXAMPLE_LOVABLE_BASELINE } from './BaselineSchema';

// ── Per-intent run result ────────────────────────────────────────────────────

export type BenchmarkOutcome = 'preview-ready' | 'blocked' | 'failed';

export interface IntentRunResult {
  intentId:      string;
  category:      IntentCategory;
  modelId:       string;
  durationMs:    number;
  fileCount:     number;
  routeCount:    number;
  featureCount:  number;
  outcome:       BenchmarkOutcome;
  /** Non-null when outcome is 'blocked' — the guard code(s) that blocked. */
  blockingCodes: string[];
  /** Non-null when outcome is 'failed'. */
  error:         string | null;
}

// ── Full report ──────────────────────────────────────────────────────────────

export interface BenchmarkReport {
  version:    1;
  runId:      string;
  startedAt:  string;
  finishedAt: string;
  modelId:    string;
  totalMs:    number;
  results:    IntentRunResult[];
  summary:    BenchmarkSummary;
}

export interface BenchmarkSummary {
  total:        number;
  previewReady: number;
  blocked:      number;
  failed:       number;
  avgDurationMs:   number;
  avgFileCount:    number;
  avgRouteCount:   number;
  avgFeatureCount: number;
  byCategory:   Record<IntentCategory, CategorySummary>;
}

export interface CategorySummary {
  total:        number;
  previewReady: number;
  blocked:      number;
  failed:       number;
  avgDurationMs: number;
}

// ── Compute summary from results ─────────────────────────────────────────────

export function computeSummary(results: IntentRunResult[]): BenchmarkSummary {
  const total = results.length;
  const previewReady = results.filter(r => r.outcome === 'preview-ready').length;
  const blocked      = results.filter(r => r.outcome === 'blocked').length;
  const failed       = results.filter(r => r.outcome === 'failed').length;

  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

  const cats = [...new Set(results.map(r => r.category))] as IntentCategory[];
  const byCategory = {} as Record<IntentCategory, CategorySummary>;
  for (const cat of cats) {
    const cr = results.filter(r => r.category === cat);
    byCategory[cat] = {
      total:        cr.length,
      previewReady: cr.filter(r => r.outcome === 'preview-ready').length,
      blocked:      cr.filter(r => r.outcome === 'blocked').length,
      failed:       cr.filter(r => r.outcome === 'failed').length,
      avgDurationMs: avg(cr.map(r => r.durationMs)),
    };
  }

  return {
    total,
    previewReady,
    blocked,
    failed,
    avgDurationMs:   avg(results.map(r => r.durationMs)),
    avgFileCount:    avg(results.map(r => r.fileCount)),
    avgRouteCount:   avg(results.map(r => r.routeCount)),
    avgFeatureCount: avg(results.map(r => r.featureCount)),
    byCategory,
  };
}

// ── Markdown summary renderer ───────────────────────────────────────────────

export function renderMarkdownSummary(report: BenchmarkReport): string {
  const s = report.summary;
  const pct = (n: number) => total ? `${Math.round((n / s.total) * 100)}%` : '0%';
  const total = s.total;

  const lines: string[] = [
    `# Benchmark Report — ${report.runId}`,
    '',
    `**Model:** ${report.modelId}`,
    `**Date:** ${report.startedAt}`,
    `**Total time:** ${(report.totalMs / 1000).toFixed(1)}s`,
    '',
    '## Overall',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Intents | ${s.total} |`,
    `| preview-ready | ${s.previewReady} (${pct(s.previewReady)}) |`,
    `| blocked | ${s.blocked} (${pct(s.blocked)}) |`,
    `| failed | ${s.failed} (${pct(s.failed)}) |`,
    `| Avg duration | ${(s.avgDurationMs / 1000).toFixed(1)}s |`,
    `| Avg file count | ${s.avgFileCount} |`,
    `| Avg route count | ${s.avgRouteCount} |`,
    `| Avg feature count | ${s.avgFeatureCount} |`,
    '',
    '## By Category',
    '',
    '| Category | Total | Ready | Blocked | Failed | Avg time |',
    '|----------|-------|-------|---------|--------|----------|',
  ];

  for (const [cat, cs] of Object.entries(s.byCategory)) {
    lines.push(
      `| ${cat} | ${cs.total} | ${cs.previewReady} | ${cs.blocked} | ${cs.failed} | ${(cs.avgDurationMs / 1000).toFixed(1)}s |`,
    );
  }

  lines.push('', '## Per-Intent Results', '');
  lines.push('| ID | Category | Outcome | Files | Routes | Features | Time | Blocking |');
  lines.push('|----|----------|---------|-------|--------|----------|------|----------|');

  for (const r of report.results) {
    const outcomeIcon = r.outcome === 'preview-ready' ? 'ready' : r.outcome;
    const blocking = r.blockingCodes.length > 0 ? r.blockingCodes.join(', ') : '-';
    lines.push(
      `| ${r.intentId} | ${r.category} | ${outcomeIcon} | ${r.fileCount} | ${r.routeCount} | ${r.featureCount} | ${(r.durationMs / 1000).toFixed(1)}s | ${blocking} |`,
    );
  }

  lines.push('');
  return lines.join('\n');
}
