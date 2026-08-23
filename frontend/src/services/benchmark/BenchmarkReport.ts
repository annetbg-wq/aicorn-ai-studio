/**
 * BenchmarkReport — structured report types and markdown summary renderer
 * for golden-intent benchmark runs.
 *
 * Re-exports ComparisonScorecardService types so callers can import everything
 * benchmark-related from this single module.
 */

import type { IntentCategory } from './goldenIntents';
import type { VisualQualityVerdict } from '../../shared/projectModel';

// Re-export scorecard surface so BenchmarkReport is the single benchmark barrel
export type {
  ScorecardVerdict,
  ScorecardRow,
  ComparisonScorecardReport,
  ScorecardOptions,
} from './ComparisonScorecardService';
export { ComparisonScorecardService } from './ComparisonScorecardService';
export type { BaselineMetrics } from './BaselineSchema';
export { validateBaseline, EXAMPLE_COMPETITOR_BASELINE } from './BaselineSchema';

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
  /** Pre-repair: did the coder's FIRST output pass the DesignContract? */
  designContractCleanPassed: boolean;
  /** Post-repair: does the FINAL committed code pass the DesignContract? */
  designContractFinalPassed: boolean;
  /** true when GenerationQualityService.evaluate().passed — structural quality checks passed. */
  qualityPassed: boolean;
  /** Optional per-intent visual-quality result, distinct from operational outcome. */
  visualQuality?: IntentRunVisualQuality;
}

export interface IntentRunVisualQuality {
  score:   number;
  verdict: VisualQualityVerdict;
  reasons: string[];
  notes?:  string[];
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
  visualQuality?: BenchmarkVisualQualitySummary;
  /** Structural Layer 1 metrics (headless, no backend needed). */
  designContractCleanRate: number;  // 0–1: pre-repair coder quality (substrate signal)
  designContractFinalRate: number;  // 0–1: post-repair committed code quality (repair reliability)
  qualityPassRate:         number;  // 0–1: fraction that passed GenerationQualityService
}

export interface CategorySummary {
  total:        number;
  previewReady: number;
  blocked:      number;
  failed:       number;
  avgDurationMs: number;
}

export interface BenchmarkVisualQualitySummary {
  measuredIntents: number;
  avgScore:        number;
  verdictDistribution: Record<VisualQualityVerdict, number>;
  notes?:          string[];
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

  const visualResults = results.filter(
    (r): r is IntentRunResult & { visualQuality: IntentRunVisualQuality } => Boolean(r.visualQuality),
  );
  const visualQuality = visualResults.length > 0
    ? (() => {
        const verdictCounts: Record<VisualQualityVerdict, number> = {
          strong: 0,
          acceptable: 0,
          weak: 0,
        };

        for (const result of visualResults) {
          verdictCounts[result.visualQuality.verdict] += 1;
        }

        const notes: string[] = [];
        if (visualResults.length < total) {
          notes.push(`Visual quality available for ${visualResults.length} of ${total} intents.`);
        }

        return {
          measuredIntents: visualResults.length,
          avgScore: avg(visualResults.map(r => r.visualQuality.score)),
          verdictDistribution: {
            strong: verdictCounts.strong / visualResults.length,
            acceptable: verdictCounts.acceptable / visualResults.length,
            weak: verdictCounts.weak / visualResults.length,
          },
          notes: notes.length > 0 ? notes : undefined,
        } satisfies BenchmarkVisualQualitySummary;
      })()
    : undefined;

  const designContractCleanRate = total > 0
    ? results.filter(r => r.designContractCleanPassed).length / total
    : 0;
  const designContractFinalRate = total > 0
    ? results.filter(r => r.designContractFinalPassed).length / total
    : 0;
  const qualityPassRate = total > 0
    ? results.filter(r => r.qualityPassed).length / total
    : 0;

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
    visualQuality,
    designContractCleanRate,
    designContractFinalRate,
    qualityPassRate,
  };
}

// ── Markdown summary renderer ───────────────────────────────────────────────

export function renderMarkdownSummary(report: BenchmarkReport): string {
  const s = report.summary;
  const pct = (n: number) => total ? `${Math.round((n / s.total) * 100)}%` : '0%';
  const total = s.total;
  const hasPerIntentVisualQuality = report.results.some(r => r.visualQuality);

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
  ];

  if (s.visualQuality) {
    lines.push(
      '## Visual Quality',
      '',
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Measured intents | ${s.visualQuality.measuredIntents} |`,
      `| Avg visual score | ${s.visualQuality.avgScore} |`,
      `| Strong verdict rate | ${Math.round(s.visualQuality.verdictDistribution.strong * 100)}% |`,
      `| Acceptable verdict rate | ${Math.round(s.visualQuality.verdictDistribution.acceptable * 100)}% |`,
      `| Weak verdict rate | ${Math.round(s.visualQuality.verdictDistribution.weak * 100)}% |`,
      '',
    );

    if (s.visualQuality.notes && s.visualQuality.notes.length > 0) {
      lines.push('Visual notes:');
      for (const note of s.visualQuality.notes) {
        lines.push(`- ${note}`);
      }
      lines.push('');
    }
  }

  lines.push(
    '## By Category',
    '',
    '| Category | Total | Ready | Blocked | Failed | Avg time |',
    '|----------|-------|-------|---------|--------|----------|',
  );

  for (const [cat, cs] of Object.entries(s.byCategory)) {
    lines.push(
      `| ${cat} | ${cs.total} | ${cs.previewReady} | ${cs.blocked} | ${cs.failed} | ${(cs.avgDurationMs / 1000).toFixed(1)}s |`,
    );
  }

  lines.push('', '## Per-Intent Results', '');
  if (hasPerIntentVisualQuality) {
    lines.push('| ID | Category | Outcome | Files | Routes | Features | Visual score | Visual verdict | Time | Blocking |');
    lines.push('|----|----------|---------|-------|--------|----------|--------------|----------------|------|----------|');
  } else {
    lines.push('| ID | Category | Outcome | Files | Routes | Features | Time | Blocking |');
    lines.push('|----|----------|---------|-------|--------|----------|------|----------|');
  }

  for (const r of report.results) {
    const outcomeIcon = r.outcome === 'preview-ready' ? 'ready' : r.outcome;
    const blocking = r.blockingCodes.length > 0 ? r.blockingCodes.join(', ') : '-';
    if (hasPerIntentVisualQuality) {
      lines.push(
        `| ${r.intentId} | ${r.category} | ${outcomeIcon} | ${r.fileCount} | ${r.routeCount} | ${r.featureCount} | ${r.visualQuality?.score ?? '-'} | ${r.visualQuality?.verdict ?? '-'} | ${(r.durationMs / 1000).toFixed(1)}s | ${blocking} |`,
      );
    } else {
      lines.push(
        `| ${r.intentId} | ${r.category} | ${outcomeIcon} | ${r.fileCount} | ${r.routeCount} | ${r.featureCount} | ${(r.durationMs / 1000).toFixed(1)}s | ${blocking} |`,
      );
    }
  }

  lines.push('');
  return lines.join('\n');
}
