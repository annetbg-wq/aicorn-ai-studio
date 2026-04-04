/**
 * BaselineSchema — shape for manually entered external-tool baseline results.
 *
 * Populate one of these by hand (or paste from a spreadsheet) then pass it
 * to ComparisonScorecardService.compare().  No external calls are made.
 */

// ── Baseline entry ────────────────────────────────────────────────────────────

export interface BaselineMetrics {
  /** Human-readable tool name, e.g. "Lovable" or "v0". */
  toolName: string;
  /** ISO-8601 timestamp of when these results were recorded. */
  recordedAt: string;
  /** Number of intents / prompts used to produce this baseline. */
  intentCount: number;

  // ── Core metrics (must match ComparisonScorecardService metric keys) ────────

  /** Average wall-clock milliseconds from prompt submit to first preview-ready render. */
  avgTimeToFirstPreviewMs: number;
  /** Fraction 0–1 of intents that produced a working preview on the first pass. */
  firstPassSuccessRate: number;
  /** Average number of source files generated per intent. */
  avgFileCount: number;
  /** Average number of distinct routes generated per intent. */
  avgRouteCount: number;
  /** Average number of distinct features generated per intent. */
  avgFeatureCount: number;
  /** Fraction 0–1 of intents that were blocked or failed (lower is better). */
  blockedOrFailedRate: number;
  /**
   * Export completeness: fraction 0–1 of expected output artefacts that were
   * present and non-empty in the exported project (e.g. 0.95 = 95%).
   */
  exportCompleteness: number;

  /** Free-text notes, methodology caveats, source URL, etc. */
  notes?: string;
}

// ── Thin validation helper ────────────────────────────────────────────────────

const REQUIRED_KEYS: (keyof BaselineMetrics)[] = [
  'toolName',
  'recordedAt',
  'intentCount',
  'avgTimeToFirstPreviewMs',
  'firstPassSuccessRate',
  'avgFileCount',
  'avgRouteCount',
  'avgFeatureCount',
  'blockedOrFailedRate',
  'exportCompleteness',
];

export function validateBaseline(b: unknown): b is BaselineMetrics {
  if (typeof b !== 'object' || b === null) return false;
  const obj = b as Record<string, unknown>;
  return REQUIRED_KEYS.every(k => k in obj && obj[k] !== undefined && obj[k] !== null);
}

// ── Example baseline (Lovable — illustrative, replace with real data) ─────────

export const EXAMPLE_LOVABLE_BASELINE: BaselineMetrics = {
  toolName:                 'Lovable',
  recordedAt:               '2026-03-01T00:00:00.000Z',
  intentCount:              15,
  avgTimeToFirstPreviewMs:  18000,
  firstPassSuccessRate:     0.80,
  avgFileCount:             4,
  avgRouteCount:            2,
  avgFeatureCount:          5,
  blockedOrFailedRate:      0.20,
  exportCompleteness:       0.75,
  notes:                    'Manual audit of 15 identical prompts. Export completeness based on missing component files.',
};
