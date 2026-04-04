/**
 * BenchmarkGate — mandatory quality gate for generation benchmarks.
 *
 * Runs a subset of golden intents, compares results against the stored
 * baseline, and returns a structured pass/fail verdict.
 *
 * Regression thresholds:
 *   - outcome preview-ready → blocked/failed    : REGRESSION  (blocks pass)
 *   - avgFileCount drops > 30%                  : WARNING
 *   - avgDurationMs increases > 2×              : WARNING
 *
 * Suite modes:
 *   fast — first 5 golden intents (quick smoke check, ~5 min)
 *   full — all 15 golden intents  (complete regression, ~15 min)
 */

import { BenchmarkService, type BenchmarkRunConfig } from './BenchmarkService';
import { BaselineStore, type AggregateBaseline } from './BaselineStore';
import type { BenchmarkReport, BenchmarkSummary } from './BenchmarkReport';
import { goldenIntents } from './goldenIntents';

// ── Types ─────────────────────────────────────────────────────────────────────

export type GateSeverity = 'REGRESSION' | 'WARNING' | 'OK';

export interface GateIssue {
  severity:  GateSeverity;
  metric:    string;
  message:   string;
  baseline:  number;
  current:   number;
}

export interface GateVerdict {
  passed:       boolean;
  regressions:  GateIssue[];
  improvements: GateIssue[];
  warnings:     GateIssue[];
  scorecard:    string;       // human-readable markdown summary
  report:       BenchmarkReport;
  baselineUsed: AggregateBaseline | null;
}

export interface GateConfig {
  apiKey:      string;
  modelId:     string;
  fixModelId?: string;
  /** 'fast' = 5 intents (default), 'full' = all 15 */
  suite?:      'fast' | 'full';
  /** Override: compare against this baseline instead of Supabase lookup */
  baseline?:   AggregateBaseline;
  onProgress?: BenchmarkRunConfig['onProgress'];
  signal?:     AbortSignal;
}

// ── Thresholds ────────────────────────────────────────────────────────────────

const REGRESSION_OUTCOME_DROP_THRESHOLD = 0;   // any drop in preview-ready rate = regression
const WARNING_FILE_COUNT_DROP_RATIO     = 0.30; // >30% drop in avg file count
const WARNING_DURATION_INCREASE_RATIO   = 2.0;  // >2× duration increase

// ── Fast suite — first 5 intents ──────────────────────────────────────────────

const FAST_INTENT_IDS = goldenIntents.slice(0, 5).map(i => i.id);

// ── BenchmarkGate ─────────────────────────────────────────────────────────────

export const BenchmarkGate = {
  /**
   * Run the gate check and return a structured verdict.
   * Always auto-saves the run to Supabase (BaselineStore).
   */
  async check(cfg: GateConfig): Promise<GateVerdict> {
    const suite = cfg.suite ?? 'fast';
    const intentIds = suite === 'fast' ? FAST_INTENT_IDS : undefined;

    console.log(`[BenchmarkGate] Starting ${suite} suite | model=${cfg.modelId}`);

    // 1. Run benchmark
    const { report } = await BenchmarkService.run({
      apiKey:      cfg.apiKey,
      modelId:     cfg.modelId,
      fixModelId:  cfg.fixModelId,
      intentIds,
      onProgress:  cfg.onProgress,
      signal:      cfg.signal,
    });

    // 2. Persist this run
    await BenchmarkService.promoteAsBaseline(report);

    // 3. Fetch baseline to compare against
    const baseline = cfg.baseline ?? await BaselineStore.getBaseline(cfg.modelId);

    // 4. Build verdict
    return buildVerdict(report, baseline);
  },

  /**
   * Compute a verdict from an already-completed report + optional baseline.
   * Useful for re-evaluating stored runs without re-running generation.
   */
  evaluate(report: BenchmarkReport, baseline: AggregateBaseline | null): GateVerdict {
    return buildVerdict(report, baseline);
  },
};

// ── Internal ──────────────────────────────────────────────────────────────────

function buildVerdict(
  report:   BenchmarkReport,
  baseline: AggregateBaseline | null,
): GateVerdict {
  const regressions:  GateIssue[] = [];
  const warnings:     GateIssue[] = [];
  const improvements: GateIssue[] = [];

  const s: BenchmarkSummary = report.summary;
  const currentPreviewRate = s.total > 0 ? s.previewReady / s.total : 0;

  if (baseline) {
    // ── Outcome regression ──────────────────────────────────────────────────
    if (
      baseline.previewReadyRate > 0 &&
      currentPreviewRate < baseline.previewReadyRate - REGRESSION_OUTCOME_DROP_THRESHOLD
    ) {
      regressions.push({
        severity: 'REGRESSION',
        metric:   'previewReadyRate',
        message:  `preview-ready rate dropped from ${pct(baseline.previewReadyRate)} → ${pct(currentPreviewRate)}`,
        baseline: baseline.previewReadyRate,
        current:  currentPreviewRate,
      });
    } else if (currentPreviewRate > baseline.previewReadyRate + 0.01) {
      improvements.push({
        severity: 'OK',
        metric:   'previewReadyRate',
        message:  `preview-ready rate improved ${pct(baseline.previewReadyRate)} → ${pct(currentPreviewRate)}`,
        baseline: baseline.previewReadyRate,
        current:  currentPreviewRate,
      });
    }

    // ── File count warning ──────────────────────────────────────────────────
    if (baseline.avgFileCount > 0) {
      const drop = (baseline.avgFileCount - s.avgFileCount) / baseline.avgFileCount;
      if (drop > WARNING_FILE_COUNT_DROP_RATIO) {
        warnings.push({
          severity: 'WARNING',
          metric:   'avgFileCount',
          message:  `avg file count dropped ${baseline.avgFileCount.toFixed(1)} → ${s.avgFileCount.toFixed(1)} (${pct(drop)} drop)`,
          baseline: baseline.avgFileCount,
          current:  s.avgFileCount,
        });
      } else if (s.avgFileCount > baseline.avgFileCount * 1.1) {
        improvements.push({
          severity: 'OK',
          metric:   'avgFileCount',
          message:  `avg file count increased ${baseline.avgFileCount.toFixed(1)} → ${s.avgFileCount.toFixed(1)}`,
          baseline: baseline.avgFileCount,
          current:  s.avgFileCount,
        });
      }
    }

    // ── Duration warning ────────────────────────────────────────────────────
    if (baseline.avgDurationMs > 0) {
      const ratio = s.avgDurationMs / baseline.avgDurationMs;
      if (ratio > WARNING_DURATION_INCREASE_RATIO) {
        warnings.push({
          severity: 'WARNING',
          metric:   'avgDurationMs',
          message:  `avg duration increased ${ms(baseline.avgDurationMs)} → ${ms(s.avgDurationMs)} (${ratio.toFixed(1)}×)`,
          baseline: baseline.avgDurationMs,
          current:  s.avgDurationMs,
        });
      } else if (ratio < 0.8) {
        improvements.push({
          severity: 'OK',
          metric:   'avgDurationMs',
          message:  `avg duration decreased ${ms(baseline.avgDurationMs)} → ${ms(s.avgDurationMs)} (${ratio.toFixed(2)}×)`,
          baseline: baseline.avgDurationMs,
          current:  s.avgDurationMs,
        });
      }
    }
  }

  const passed = regressions.length === 0;
  const scorecard = renderScorecard(report, baseline, regressions, warnings, improvements, passed);

  return { passed, regressions, improvements, warnings, scorecard, report, baselineUsed: baseline };
}

// ── Markdown scorecard ────────────────────────────────────────────────────────

function renderScorecard(
  report:       BenchmarkReport,
  baseline:     AggregateBaseline | null,
  regressions:  GateIssue[],
  warnings:     GateIssue[],
  improvements: GateIssue[],
  passed:       boolean,
): string {
  const s = report.summary;
  const currentPreviewRate = s.total > 0 ? s.previewReady / s.total : 0;

  const lines: string[] = [
    `# BenchmarkGate Scorecard — ${report.runId}`,
    '',
    `**Status:** ${passed ? '✅ PASSED' : '❌ FAILED (regression detected)'}`,
    `**Model:** ${report.modelId}`,
    `**Suite:** ${s.total} intent(s) | **Date:** ${report.startedAt}`,
    '',
    '## Current Run',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| preview-ready | ${s.previewReady}/${s.total} (${pct(currentPreviewRate)}) |`,
    `| blocked | ${s.blocked} | failed | ${s.failed} |`,
    `| avg duration | ${ms(s.avgDurationMs)} |`,
    `| avg file count | ${s.avgFileCount.toFixed(1)} |`,
  ];

  if (baseline) {
    lines.push(
      '',
      '## vs Baseline',
      '',
      `| Metric | Baseline | Current | Δ |`,
      `|--------|----------|---------|---|`,
      `| preview-ready rate | ${pct(baseline.previewReadyRate)} | ${pct(currentPreviewRate)} | ${delta(baseline.previewReadyRate, currentPreviewRate, true)} |`,
      `| avg file count | ${baseline.avgFileCount.toFixed(1)} | ${s.avgFileCount.toFixed(1)} | ${delta(baseline.avgFileCount, s.avgFileCount, true)} |`,
      `| avg duration | ${ms(baseline.avgDurationMs)} | ${ms(s.avgDurationMs)} | ${delta(baseline.avgDurationMs, s.avgDurationMs, false)} |`,
    );
  }

  if (regressions.length > 0) {
    lines.push('', '## ❌ Regressions', '');
    for (const r of regressions) lines.push(`- **${r.metric}**: ${r.message}`);
  }

  if (warnings.length > 0) {
    lines.push('', '## ⚠️ Warnings', '');
    for (const w of warnings) lines.push(`- ${w.metric}: ${w.message}`);
  }

  if (improvements.length > 0) {
    lines.push('', '## 📈 Improvements', '');
    for (const i of improvements) lines.push(`- ${i.metric}: ${i.message}`);
  }

  lines.push('');
  return lines.join('\n');
}

// ── Format helpers ────────────────────────────────────────────────────────────

function pct(v: number): string { return `${(v * 100).toFixed(1)}%`; }
function ms(v: number):  string { return `${(v / 1000).toFixed(1)}s`; }

function delta(baseline: number, current: number, higherBetter: boolean): string {
  if (baseline === 0) return '—';
  const pctDiff = ((current - baseline) / baseline) * 100;
  const sign = pctDiff >= 0 ? '+' : '';
  const arrow = pctDiff > 0
    ? (higherBetter ? '▲' : '▼')
    : pctDiff < 0
      ? (higherBetter ? '▼' : '▲')
      : '→';
  return `${arrow} ${sign}${pctDiff.toFixed(1)}%`;
}
