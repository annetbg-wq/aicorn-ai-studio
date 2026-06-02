/**
 * BenchmarkGate — two-axis quality gate for generation benchmarks.
 *
 * Axes are an open list of GateAxis entries. Each axis is evaluated uniformly:
 *   - Zero/missing baseline value → hard error (gate cannot operate vacuously).
 *   - Current value drops below (baseline − threshold) → REGRESSION (blocks pass).
 *   - Current value improves beyond (baseline + threshold) → IMPROVEMENT (logged).
 *
 * Current axes:
 *   Structural (Layer 1 — headless, no backend):
 *     filesProducedRate   — fraction of intents that produced ≥1 file
 *     qualityPassRate     — fraction of intents that passed GenerationQualityService
 *     avgVisualScore      — average VisualQualityService score (0–100)
 *   End-to-end (Layer 2 — requires backend compile):
 *     previewReadyRate    — fraction of intents whose app compiled and mounted
 *
 * Adding a new axis (e.g. apkSuccessRate for native):
 *   1. Add the metric field to AggregateBaseline.
 *   2. Push a new GateAxis entry to GATE_AXES.
 *   That is the entire change. No other gate logic needs touching.
 *
 * Suite modes:
 *   fast — first 5 golden intents (~5 min smoke check)
 *   full — all 15 golden intents (~15 min full regression)
 */

import { BenchmarkService, type BenchmarkRunConfig } from './BenchmarkService';
import { BaselineStore, buildAggregateBaseline, type AggregateBaseline } from './BaselineStore';
import type { BenchmarkReport, BenchmarkSummary } from './BenchmarkReport';
import { goldenIntents } from './goldenIntents';

// ── Axis definition ───────────────────────────────────────────────────────────

/**
 * One regression axis. Adding a new axis = adding one entry to GATE_AXES.
 *
 * threshold: the minimum acceptable drop from baseline before it counts as a
 * regression. Set conservatively (≥ 2 standard deviations of stochastic
 * variance) so normal model variance doesn't trigger false alarms.
 */
export interface GateAxis {
  /** Unique identifier — used in error messages and scorecard. */
  id:              string;
  /** Human-readable description for the scorecard. */
  description:     string;
  /** Key in AggregateBaseline to read. Must be a numeric metric field. */
  metricKey:       keyof Pick<AggregateBaseline,
    'previewReadyRate' | 'designContractOkRate' | 'qualityPassRate' | 'avgVisualScore'
  >;
  /**
   * Regression threshold: current must be >= baseline - threshold.
   * Zero means any drop is a regression. Positive value gives stochastic slack.
   */
  threshold:       number;
  /** Whether higher is better (true for rates/scores; false for e.g. error counts). */
  higherIsBetter:  boolean;
  /**
   * If true, a baseline value of 0 is a hard error — the axis has never been
   * measured and the gate cannot operate. Run eval:baseline first.
   */
  required:        boolean;
}

/**
 * Open list of gate axes. All axes are evaluated uniformly by buildVerdict().
 *
 * Threshold rationale:
 *   designContractOkRate 0.20 — 20% slack: DesignContract is stochastic; model occasionally
 *                               misses a token rule without being worse overall.
 *   qualityPassRate      0.20 — same reasoning; quality checks include guard results.
 *   avgVisualScore       10.0 — 10/100 points covers stochastic visual scoring variance
 *                               (~1–2 standard deviations for typical model outputs).
 *   previewReadyRate     0.0  — any compile regression is a hard regression; no slack.
 */
export const GATE_AXES: readonly GateAxis[] = [
  {
    id:             'designContractOk',
    description:    'Design contract pass rate (apply step: DesignContract.validateDesignContract)',
    metricKey:      'designContractOkRate',
    threshold:      0.20,
    higherIsBetter: true,
    required:       true,
  },
  {
    id:             'qualityPass',
    description:    'Quality pass rate (GenerationQualityService.passed)',
    metricKey:      'qualityPassRate',
    threshold:      0.20,
    higherIsBetter: true,
    required:       true,
  },
  {
    id:             'visualScore',
    description:    'Average visual structural score (0–100)',
    metricKey:      'avgVisualScore',
    threshold:      10.0,
    higherIsBetter: true,
    required:       true,
  },
  {
    id:             'previewReady',
    description:    'Preview ready rate (compile + mount succeeded)',
    metricKey:      'previewReadyRate',
    threshold:      0.0,
    higherIsBetter: true,
    required:       true,
  },
] as const;

// ── Public types ──────────────────────────────────────────────────────────────

export type GateSeverity = 'REGRESSION' | 'WARNING' | 'OK';

export interface GateIssue {
  severity:   GateSeverity;
  axisId:     string;
  metric:     string;
  message:    string;
  baseline:   number;
  current:    number;
}

export interface GateVerdict {
  passed:       boolean;
  regressions:  GateIssue[];
  improvements: GateIssue[];
  warnings:     GateIssue[];
  scorecard:    string;
  report:       BenchmarkReport;
  baselineUsed: AggregateBaseline | null;
}

export interface GateConfig {
  apiKey:      string;
  modelId:     string;
  fixModelId?: string;
  suite?:      'fast' | 'full' | 'smoke';
  baseline?:   AggregateBaseline;
  onProgress?: BenchmarkRunConfig['onProgress'];
  signal?:     AbortSignal;
}

// ── Fast suite ────────────────────────────────────────────────────────────────

// TODO(eval): replace order-sensitive slice(0, 5) with an explicit named fast-suite intent list.
const FAST_INTENT_IDS = goldenIntents.slice(0, 5).map(i => i.id);

// ── BenchmarkGate ─────────────────────────────────────────────────────────────

export const BenchmarkGate = {
  /**
   * Run the gate check against the stored baseline. Throws if the baseline is
   * missing or any required axis has a zero/missing value — the gate must never
   * silently pass when it has no real reference point.
   */
  async check(cfg: GateConfig): Promise<GateVerdict> {
    const suite = cfg.suite === 'smoke' ? 'fast' : (cfg.suite ?? 'fast');
    const intentIds = suite === 'fast' ? FAST_INTENT_IDS : undefined;
    const baseline = cfg.baseline ?? await BaselineStore.getBaseline(cfg.modelId);

    assertBaselineUsable(baseline);

    console.log(`[BenchmarkGate] Starting ${suite} suite | model=${cfg.modelId}`);

    const { report } = await BenchmarkService.run({
      apiKey:     cfg.apiKey,
      modelId:    cfg.modelId,
      fixModelId: cfg.fixModelId,
      intentIds,
      onProgress: cfg.onProgress,
      signal:     cfg.signal,
    });

    return buildVerdict(report, baseline);
  },

  /**
   * Compute a verdict from an already-completed report + baseline.
   * Does NOT throw on invalid baseline — returns passed:false with a regression
   * entry instead. Use this for display/replay only; use check() for gates.
   */
  evaluate(report: BenchmarkReport, baseline: AggregateBaseline | null): GateVerdict {
    return buildVerdict(report, baseline);
  },
};

// ── Baseline validity ─────────────────────────────────────────────────────────

/**
 * Hard-fail if baseline is null or any required axis has a zero/missing value.
 * A zero baseline means eval:baseline was never run with a working pipeline,
 * and the gate would vacuously pass every run — that is not acceptable.
 */
export function assertBaselineUsable(baseline: AggregateBaseline | null): asserts baseline is AggregateBaseline {
  if (!baseline) {
    throw new Error(
      '[eval:gate] No baseline found. Run eval:baseline first to establish a reference point.',
    );
  }
  for (const axis of GATE_AXES) {
    if (!axis.required) continue;
    const value = baseline[axis.metricKey] as number | undefined;
    if (value === undefined || value === null) {
      throw new Error(
        `[eval:gate] Baseline invalid for axis "${axis.id}": ` +
        `metric "${axis.metricKey}" is missing. Re-run eval:baseline.`,
      );
    }
    if (value === 0) {
      throw new Error(
        `[eval:gate] Baseline invalid for axis "${axis.id}": ` +
        `metric "${axis.metricKey}" is 0 — no successful generation was recorded. ` +
        `Ensure the pipeline produces output, then re-run eval:baseline.`,
      );
    }
  }
}

// ── Verdict builder ───────────────────────────────────────────────────────────

function buildVerdict(
  report:   BenchmarkReport,
  baseline: AggregateBaseline | null,
): GateVerdict {
  const regressions:  GateIssue[] = [];
  const warnings:     GateIssue[] = [];
  const improvements: GateIssue[] = [];

  if (baseline) {
    const currentAgg = buildAggregateBaseline(report);

    for (const axis of GATE_AXES) {
      const baselineValue = baseline[axis.metricKey] as number;
      const currentValue  = currentAgg[axis.metricKey] as number;

      if (axis.higherIsBetter) {
        const regressionFloor = baselineValue - axis.threshold;
        if (currentValue < regressionFloor) {
          regressions.push({
            severity: 'REGRESSION',
            axisId:   axis.id,
            metric:   axis.metricKey,
            message:  `${axis.description} dropped ${fmt(axis.metricKey, baselineValue)} → ${fmt(axis.metricKey, currentValue)} (threshold: −${fmt(axis.metricKey, axis.threshold)})`,
            baseline: baselineValue,
            current:  currentValue,
          });
        } else if (currentValue > baselineValue + axis.threshold * 0.5) {
          improvements.push({
            severity: 'OK',
            axisId:   axis.id,
            metric:   axis.metricKey,
            message:  `${axis.description} improved ${fmt(axis.metricKey, baselineValue)} → ${fmt(axis.metricKey, currentValue)}`,
            baseline: baselineValue,
            current:  currentValue,
          });
        }
      }
    }
  }

  const passed = regressions.length === 0;
  const scorecard = renderScorecard(report, baseline, regressions, warnings, improvements, passed);
  return { passed, regressions, improvements, warnings, scorecard, report, baselineUsed: baseline };
}

// ── Format helpers ────────────────────────────────────────────────────────────

function fmt(
  metricKey: keyof Pick<AggregateBaseline, 'previewReadyRate' | 'designContractOkRate' | 'qualityPassRate' | 'avgVisualScore'>,
  value: number,
): string {
  if (metricKey === 'avgVisualScore') return value.toFixed(1);
  return `${(value * 100).toFixed(1)}%`;
}

function pct(v: number): string  { return `${(v * 100).toFixed(1)}%`; }
function ms(v: number): string   { return `${(v / 1000).toFixed(1)}s`; }

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

// ── Scorecard renderer ────────────────────────────────────────────────────────

function renderScorecard(
  report:       BenchmarkReport,
  baseline:     AggregateBaseline | null,
  regressions:  GateIssue[],
  warnings:     GateIssue[],
  improvements: GateIssue[],
  passed:       boolean,
): string {
  const s: BenchmarkSummary = report.summary;
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
    '| Axis | Metric | Value |',
    '|------|--------|-------|',
    `| designContractOk (L1) | design-contract pass rate | ${pct(s.designContractOkRate)} |`,
    `| qualityPass (L1) | quality-pass rate | ${pct(s.qualityPassRate)} |`,
    `| visualScore (L1) | avg visual score | ${(s.visualQuality?.avgScore ?? 0).toFixed(1)} |`,
    `| previewReady (L2) | preview-ready rate | ${pct(currentPreviewRate)} |`,
    `| — | avg duration | ${ms(s.avgDurationMs)} |`,
    `| — | avg file count | ${s.avgFileCount.toFixed(1)} |`,
  ];

  if (baseline) {
    const currentAgg = buildAggregateBaseline(report);
    lines.push(
      '',
      '## vs Baseline',
      '',
      '| Axis | Baseline | Current | Δ |',
      '|------|----------|---------|---|',
      ...GATE_AXES.map(axis => {
        const b = baseline[axis.metricKey] as number;
        const c = currentAgg[axis.metricKey] as number;
        const fmtVal = (v: number) => fmt(axis.metricKey, v);
        return `| ${axis.id} | ${fmtVal(b)} | ${fmtVal(c)} | ${delta(b, c, axis.higherIsBetter)} |`;
      }),
      `| duration | ${ms(baseline.avgDurationMs)} | ${ms(s.avgDurationMs)} | ${delta(baseline.avgDurationMs, s.avgDurationMs, false)} |`,
    );
  }

  if (regressions.length > 0) {
    lines.push('', '## ❌ Regressions', '');
    for (const r of regressions) lines.push(`- **[${r.axisId}]** ${r.message}`);
  }

  if (warnings.length > 0) {
    lines.push('', '## ⚠️ Warnings', '');
    for (const w of warnings) lines.push(`- [${w.axisId}] ${w.message}`);
  }

  if (improvements.length > 0) {
    lines.push('', '## 📈 Improvements', '');
    for (const i of improvements) lines.push(`- [${i.axisId}] ${i.message}`);
  }

  lines.push('');
  return lines.join('\n');
}
