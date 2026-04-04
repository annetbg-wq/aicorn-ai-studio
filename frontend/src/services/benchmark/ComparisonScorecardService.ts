/**
 * ComparisonScorecardService — compares a studio BenchmarkReport against a
 * manually supplied external-tool BaselineMetrics and produces a structured
 * scorecard with win / tie / lose verdicts per metric.
 *
 * No external calls are made.  Feed it the output of BenchmarkService.run()
 * plus a hand-filled BaselineMetrics object.
 *
 * Usage:
 *   const scorecard = ComparisonScorecardService.compare(benchReport, baseline);
 *   console.log(scorecard.markdown);
 *   downloadJson(scorecard.json);
 */

import type { BenchmarkReport } from './BenchmarkReport';
import type { BaselineMetrics } from './BaselineSchema';
import { BaselineStore } from './BaselineStore';

// ── Regression types ──────────────────────────────────────────────────────────

export type RegressionSeverity = 'REGRESSION' | 'WARNING';

export interface RegressionEntry {
  severity: RegressionSeverity;
  metric:   string;
  message:  string;
  /** Previous (baseline) value */
  previous: number;
  /** Current value */
  current:  number;
}

// ── Verdict ───────────────────────────────────────────────────────────────────

export type ScorecardVerdict = 'win' | 'tie' | 'lose';

// ── Per-metric row ────────────────────────────────────────────────────────────

export interface ScorecardRow {
  /** Metric identifier, matches BaselineMetrics keys where applicable. */
  metric: string;
  /** Human-readable label for display. */
  label: string;
  /** Studio (our tool) value — formatted string for display. */
  studioValue: string;
  /** Baseline (external tool) value — formatted string for display. */
  baselineValue: string;
  /** win = studio is better, tie = roughly equal, lose = baseline is better. */
  verdict: ScorecardVerdict;
  /** Optional short rationale appended to the markdown row. */
  note?: string;
}

// ── Comparison report ─────────────────────────────────────────────────────────

export interface ComparisonScorecardReport {
  version:      1;
  scorecardId:  string;
  generatedAt:  string;
  studioRunId:  string;
  studioModel:  string;
  baselineTool: string;
  rows:         ScorecardRow[];
  totals: {
    wins:  number;
    ties:  number;
    loses: number;
  };
  /** Detected regressions vs stored self-baseline (populated by compareWithStoredBaseline). */
  regressions:  RegressionEntry[];
  /** Detected improvements vs stored self-baseline. */
  improvements: RegressionEntry[];
  /** Metrics that are within threshold (no change). */
  unchanged:    string[];
  /** Full JSON string of this report. */
  json:     string;
  /** Markdown comparison table. */
  markdown: string;
}

// ── Comparison helpers ────────────────────────────────────────────────────────

/**
 * Fractional relative difference between a and b.
 * Returns 0 when both are 0 to avoid division-by-zero.
 */
function relDiff(a: number, b: number): number {
  const denom = Math.abs(b) || Math.abs(a) || 1;
  return Math.abs(a - b) / denom;
}

const TIE_THRESHOLD = 0.05; // within 5% is a tie

/**
 * Compare two numeric values where HIGHER is better.
 * Returns win when studio is meaningfully higher, lose when lower, tie otherwise.
 */
function compareHigherBetter(studio: number, baseline: number): ScorecardVerdict {
  if (relDiff(studio, baseline) < TIE_THRESHOLD) return 'tie';
  return studio > baseline ? 'win' : 'lose';
}

/**
 * Compare two numeric values where LOWER is better.
 */
function compareLowerBetter(studio: number, baseline: number): ScorecardVerdict {
  if (relDiff(studio, baseline) < TIE_THRESHOLD) return 'tie';
  return studio < baseline ? 'win' : 'lose';
}

// ── Metric definitions ────────────────────────────────────────────────────────

interface MetricDef {
  key:         string;
  label:       string;
  direction:   'higher' | 'lower';
  format:      (v: number) => string;
  studioGet:   (r: BenchmarkReport) => number;
  baselineGet: (b: BaselineMetrics) => number;
}

const METRIC_DEFS: MetricDef[] = [
  {
    key:         'time-to-first-preview-ready',
    label:       'Time to first preview-ready',
    direction:   'lower',
    format:      v => `${(v / 1000).toFixed(1)}s`,
    studioGet:   r => r.summary.avgDurationMs,
    baselineGet: b => b.avgTimeToFirstPreviewMs,
  },
  {
    key:         'first-pass success rate',
    label:       'First-pass success rate',
    direction:   'higher',
    format:      v => `${(v * 100).toFixed(1)}%`,
    studioGet:   r => r.summary.total > 0 ? r.summary.previewReady / r.summary.total : 0,
    baselineGet: b => b.firstPassSuccessRate,
  },
  {
    key:         'file-count',
    label:       'File count (avg)',
    direction:   'higher',
    format:      v => v.toFixed(1),
    studioGet:   r => r.summary.avgFileCount,
    baselineGet: b => b.avgFileCount,
  },
  {
    key:         'route-count',
    label:       'Route count (avg)',
    direction:   'higher',
    format:      v => v.toFixed(1),
    studioGet:   r => r.summary.avgRouteCount,
    baselineGet: b => b.avgRouteCount,
  },
  {
    key:         'feature-count',
    label:       'Feature count (avg)',
    direction:   'higher',
    format:      v => v.toFixed(1),
    studioGet:   r => r.summary.avgFeatureCount,
    baselineGet: b => b.avgFeatureCount,
  },
  {
    key:         'blocked-or-failure-rate',
    label:       'Blocked/failure rate',
    direction:   'lower',
    format:      v => `${(v * 100).toFixed(1)}%`,
    studioGet:   r => r.summary.total > 0 ? (r.summary.blocked + r.summary.failed) / r.summary.total : 0,
    baselineGet: b => b.blockedOrFailedRate,
  },
  {
    key:         'export completeness',
    label:       'Export completeness',
    direction:   'higher',
    format:      v => `${(v * 100).toFixed(1)}%`,
    // Studio always exports every generated file → 1.0 unless intentionally overridden.
    // Callers may pass a custom studioExportCompleteness via ScorecardOptions.
    studioGet:   _r => 1.0,
    baselineGet: b => b.exportCompleteness,
  },
];

// ── Options ───────────────────────────────────────────────────────────────────

export interface ScorecardOptions {
  /**
   * Override the studio export completeness (0–1).  Defaults to 1.0 (all files
   * generated are considered fully exported).  Pass a measured value if you
   * have one from a manual audit.
   */
  studioExportCompleteness?: number;
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function verdictEmoji(v: ScorecardVerdict): string {
  return v === 'win' ? '✅ win' : v === 'tie' ? '➖ tie' : '❌ lose';
}

function renderMarkdownComparison(
  report: Omit<ComparisonScorecardReport, 'json' | 'markdown'>,
): string {
  const lines: string[] = [
    `# Comparison Scorecard — Studio vs ${report.baselineTool}`,
    '',
    `**Studio run:** \`${report.studioRunId}\`  `,
    `**Model:** ${report.studioModel}  `,
    `**Generated:** ${report.generatedAt}`,
    '',
    `| Metric | Studio | ${report.baselineTool} | Verdict |`,
    `|--------|--------|${''.padEnd(report.baselineTool.length + 2, '-')}|---------|`,
  ];

  for (const row of report.rows) {
    lines.push(
      `| ${row.label} | ${row.studioValue} | ${row.baselineValue} | ${verdictEmoji(row.verdict)}${row.note ? ` — ${row.note}` : ''} |`,
    );
  }

  lines.push(
    '',
    '## Summary',
    '',
    `| | Count |`,
    `|---|---|`,
    `| ✅ Wins | ${report.totals.wins} |`,
    `| ➖ Ties | ${report.totals.ties} |`,
    `| ❌ Losses | ${report.totals.loses} |`,
    '',
  );

  const total = report.totals.wins + report.totals.ties + report.totals.loses;
  const winPct = total ? Math.round((report.totals.wins / total) * 100) : 0;
  lines.push(`> Studio wins **${winPct}%** of compared metrics against ${report.baselineTool}.`);
  lines.push('');

  return lines.join('\n');
}

// ── Regression detection ──────────────────────────────────────────────────────

const REGRESSION_RATE_MIN_DROP  = 0;     // any drop triggers regression
const WARNING_FILE_COUNT_DROP   = 0.30;  // >30% drop
const WARNING_DURATION_RATIO    = 2.0;   // >2× increase

function detectRegressions(
  report:   BenchmarkReport,
  baseline: import('./BaselineStore').AggregateBaseline | null,
): { regressions: RegressionEntry[]; improvements: RegressionEntry[]; unchanged: string[] } {
  const regressions:  RegressionEntry[] = [];
  const improvements: RegressionEntry[] = [];
  const unchanged:    string[]          = [];

  if (!baseline) return { regressions, improvements, unchanged: ['no-baseline'] };

  const s = report.summary;
  const currentRate = s.total > 0 ? s.previewReady / s.total : 0;

  // ── Preview-ready rate ────────────────────────────────────────────────────
  if (baseline.previewReadyRate > 0 && currentRate < baseline.previewReadyRate - REGRESSION_RATE_MIN_DROP) {
    regressions.push({
      severity: 'REGRESSION',
      metric:   'previewReadyRate',
      message:  `preview-ready rate dropped ${fmtPct(baseline.previewReadyRate)} → ${fmtPct(currentRate)}`,
      previous: baseline.previewReadyRate,
      current:  currentRate,
    });
  } else if (currentRate > baseline.previewReadyRate + 0.01) {
    improvements.push({
      severity: 'WARNING',
      metric:   'previewReadyRate',
      message:  `preview-ready rate improved ${fmtPct(baseline.previewReadyRate)} → ${fmtPct(currentRate)}`,
      previous: baseline.previewReadyRate,
      current:  currentRate,
    });
  } else {
    unchanged.push('previewReadyRate');
  }

  // ── Avg file count ────────────────────────────────────────────────────────
  if (baseline.avgFileCount > 0) {
    const drop = (baseline.avgFileCount - s.avgFileCount) / baseline.avgFileCount;
    if (drop > WARNING_FILE_COUNT_DROP) {
      regressions.push({
        severity: 'WARNING',
        metric:   'avgFileCount',
        message:  `avg file count dropped ${baseline.avgFileCount.toFixed(1)} → ${s.avgFileCount.toFixed(1)} (${fmtPct(drop)} drop)`,
        previous: baseline.avgFileCount,
        current:  s.avgFileCount,
      });
    } else if (s.avgFileCount > baseline.avgFileCount * 1.1) {
      improvements.push({
        severity: 'WARNING',
        metric:   'avgFileCount',
        message:  `avg file count increased ${baseline.avgFileCount.toFixed(1)} → ${s.avgFileCount.toFixed(1)}`,
        previous: baseline.avgFileCount,
        current:  s.avgFileCount,
      });
    } else {
      unchanged.push('avgFileCount');
    }
  }

  // ── Avg duration ──────────────────────────────────────────────────────────
  if (baseline.avgDurationMs > 0) {
    const ratio = s.avgDurationMs / baseline.avgDurationMs;
    if (ratio > WARNING_DURATION_RATIO) {
      regressions.push({
        severity: 'WARNING',
        metric:   'avgDurationMs',
        message:  `avg duration increased ${fmtMs(baseline.avgDurationMs)} → ${fmtMs(s.avgDurationMs)} (${ratio.toFixed(1)}×)`,
        previous: baseline.avgDurationMs,
        current:  s.avgDurationMs,
      });
    } else if (ratio < 0.8) {
      improvements.push({
        severity: 'WARNING',
        metric:   'avgDurationMs',
        message:  `avg duration improved ${fmtMs(baseline.avgDurationMs)} → ${fmtMs(s.avgDurationMs)} (${ratio.toFixed(2)}×)`,
        previous: baseline.avgDurationMs,
        current:  s.avgDurationMs,
      });
    } else {
      unchanged.push('avgDurationMs');
    }
  }

  return { regressions, improvements, unchanged };
}

function fmtPct(v: number): string { return `${(v * 100).toFixed(1)}%`; }
function fmtMs(v: number):  string { return `${(v / 1000).toFixed(1)}s`; }

// ── Public API ────────────────────────────────────────────────────────────────

export const ComparisonScorecardService = {
  /**
   * Compare a completed BenchmarkReport against a manually supplied baseline.
   * Returns a fully populated ComparisonScorecardReport including JSON + markdown.
   */
  compare(
    benchReport: BenchmarkReport,
    baseline:    BaselineMetrics,
    options:     ScorecardOptions = {},
  ): ComparisonScorecardReport {
    const scorecardId = `sc-${Date.now().toString(36)}`;
    const generatedAt = new Date().toISOString();

    const rows: ScorecardRow[] = METRIC_DEFS.map(def => {
      let studioRaw = def.studioGet(benchReport);
      // Allow caller to override export completeness
      if (def.key === 'export completeness' && options.studioExportCompleteness !== undefined) {
        studioRaw = options.studioExportCompleteness;
      }
      const baselineRaw = def.baselineGet(baseline);

      const verdict: ScorecardVerdict =
        def.direction === 'lower'
          ? compareLowerBetter(studioRaw, baselineRaw)
          : compareHigherBetter(studioRaw, baselineRaw);

      return {
        metric:        def.key,
        label:         def.label,
        studioValue:   def.format(studioRaw),
        baselineValue: def.format(baselineRaw),
        verdict,
      };
    });

    const wins  = rows.filter(r => r.verdict === 'win').length;
    const ties  = rows.filter(r => r.verdict === 'tie').length;
    const loses = rows.filter(r => r.verdict === 'lose').length;

    const partial: Omit<ComparisonScorecardReport, 'json' | 'markdown'> = {
      version:      1,
      scorecardId,
      generatedAt,
      studioRunId:  benchReport.runId,
      studioModel:  benchReport.modelId,
      baselineTool: baseline.toolName,
      rows,
      totals: { wins, ties, loses },
      regressions:  [],
      improvements: [],
      unchanged:    [],
    };

    const markdown = renderMarkdownComparison(partial);
    const json     = JSON.stringify({ ...partial, markdown }, null, 2);

    console.log(
      `[ComparisonScorecardService] ${scorecardId} | studio=${benchReport.runId}` +
      ` vs baseline=${baseline.toolName} | wins=${wins} ties=${ties} loses=${loses}`,
    );

    return { ...partial, json, markdown };
  },

  /**
   * Compare a report against its own stored Supabase baseline and produce
   * regressions / improvements / unchanged lists with defined thresholds:
   *   - preview-ready rate drop (any)       → REGRESSION
   *   - avg file count drop > 30%           → WARNING
   *   - avg duration increase > 2×          → WARNING
   */
  async compareWithStoredBaseline(
    benchReport: BenchmarkReport,
  ): Promise<{ regressions: RegressionEntry[]; improvements: RegressionEntry[]; unchanged: string[] }> {
    const stored = await BaselineStore.getBaseline(benchReport.modelId);
    return detectRegressions(benchReport, stored);
  },

  /**
   * Synchronous regression check against an already-fetched baseline.
   */
  detectRegressions,

  /**
   * Convenience: derive a BaselineMetrics object directly from another
   * BenchmarkReport so two studio runs can be cross-compared.
   */
  baselineFromReport(report: BenchmarkReport, toolName: string): BaselineMetrics {
    const s = report.summary;
    return {
      toolName,
      recordedAt:               report.startedAt,
      intentCount:              s.total,
      avgTimeToFirstPreviewMs:  s.avgDurationMs,
      firstPassSuccessRate:     s.total > 0 ? s.previewReady / s.total : 0,
      avgFileCount:             s.avgFileCount,
      avgRouteCount:            s.avgRouteCount,
      avgFeatureCount:          s.avgFeatureCount,
      blockedOrFailedRate:      s.total > 0 ? (s.blocked + s.failed) / s.total : 0,
      exportCompleteness:       1.0,
    };
  },
};
