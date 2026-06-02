/**
 * BaselineStore — Supabase persistence layer for benchmark baselines.
 *
 * Schema (benchmark_baselines):
 *   id            uuid  PK default gen_random_uuid()
 *   model_id      text  NOT NULL
 *   run_id        text  NOT NULL UNIQUE
 *   intent_id     text  NOT NULL          -- 'ALL' for whole-run aggregate rows
 *   outcome       text  NOT NULL          -- BenchmarkOutcome | 'aggregate'
 *   file_count    int   NOT NULL
 *   route_count   int   NOT NULL
 *   duration_ms   int   NOT NULL
 *   created_at    timestamptz default now()
 *
 * One "aggregate" row per run (intent_id='ALL') stores run-level stats.
 * Individual intent rows are also stored for per-intent regression queries.
 */

import { supabase } from '../../lib/supabase';
import type { BenchmarkReport, IntentRunResult, BenchmarkOutcome } from './BenchmarkReport';

// ── Row shapes ─────────────────────────────────────────────────────────────────

export interface BaselineRow {
  id?:         string;
  model_id:    string;
  run_id:      string;
  intent_id:   string;
  outcome:     BenchmarkOutcome | 'aggregate';
  file_count:  number;
  route_count: number;
  duration_ms: number;
  created_at?: string;
}

export interface AggregateBaseline {
  modelId:           string;
  runId:             string;
  createdAt:         string;
  previewReadyRate:  number;   // 0–1
  avgFileCount:      number;
  avgDurationMs:     number;
  intentCount:       number;
}

export function buildAggregateBaseline(report: BenchmarkReport): AggregateBaseline {
  return {
    modelId: report.modelId,
    runId: report.runId,
    createdAt: report.finishedAt,
    previewReadyRate: report.summary.total > 0
      ? report.summary.previewReady / report.summary.total
      : 0,
    avgFileCount: report.summary.avgFileCount,
    avgDurationMs: report.summary.avgDurationMs,
    intentCount: report.summary.total,
  };
}

// ── Table name ─────────────────────────────────────────────────────────────────

const TABLE = 'benchmark_baselines';

// ── BaselineStore ──────────────────────────────────────────────────────────────

export const BaselineStore = {
  /**
   * Persist all intent rows + one aggregate row for a completed run.
   * No-op (logs warning) when Supabase is unreachable.
   */
  async save(report: BenchmarkReport): Promise<void> {
    const rows: BaselineRow[] = report.results.map((r: IntentRunResult) => ({
      model_id:    r.modelId,
      run_id:      report.runId,
      intent_id:   r.intentId,
      outcome:     r.outcome,
      file_count:  r.fileCount,
      route_count: r.routeCount,
      duration_ms: r.durationMs,
    }));

    // Aggregate row
    rows.push({
      model_id:    report.modelId,
      run_id:      report.runId,
      intent_id:   'ALL',
      outcome:     'aggregate',
      file_count:  report.summary.avgFileCount,
      route_count: report.summary.avgRouteCount,
      duration_ms: report.summary.avgDurationMs,
    });

    const { error } = await supabase.from(TABLE).insert(rows);
    if (error) {
      console.warn('[BaselineStore] save failed:', error.message);
    } else {
      console.log(`[BaselineStore] saved run ${report.runId} (${rows.length} rows)`);
    }
  },

  /**
   * Return the most recent aggregate baseline for a given model, or null.
   */
  async getBaseline(modelId: string): Promise<AggregateBaseline | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('model_id', modelId)
      .eq('intent_id', 'ALL')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[BaselineStore] getBaseline failed:', error.message);
      return null;
    }
    if (!data) return null;
    const aggregate = rowToAggregate(data as BaselineRow, modelId);
    const intents = await this.getRunIntents(aggregate.runId);
    if (intents.length === 0) {
      return aggregate;
    }

    const previewReady = intents.filter((row) => row.outcome === 'preview-ready').length;
    return {
      ...aggregate,
      previewReadyRate: previewReady / intents.length,
      intentCount: intents.length,
    };
  },

  /**
   * Fetch all aggregate rows for a model (newest first).
   */
  async list(modelId?: string): Promise<AggregateBaseline[]> {
    let q = supabase
      .from(TABLE)
      .select('*')
      .eq('intent_id', 'ALL')
      .order('created_at', { ascending: false });

    if (modelId) q = q.eq('model_id', modelId);

    const { data, error } = await q;
    if (error) {
      console.warn('[BaselineStore] list failed:', error.message);
      return [];
    }
    return (data ?? []).map((r: BaselineRow) => rowToAggregate(r, r.model_id));
  },

  /**
   * Promote an existing run as the canonical baseline for its model
   * by re-inserting its aggregate row with a fresh timestamp (bumps recency).
   */
  async promoteAsBaseline(runId: string): Promise<boolean> {
    const { data: existing, error: fetchErr } = await supabase
      .from(TABLE)
      .select('*')
      .eq('run_id', runId)
      .eq('intent_id', 'ALL')
      .maybeSingle();

    if (fetchErr || !existing) {
      console.warn('[BaselineStore] promoteAsBaseline: run not found', runId, fetchErr?.message);
      return false;
    }

    const row = existing as BaselineRow;

    // Insert a duplicate aggregate row with NOW() as created_at so it sorts first.
    const { error: insertErr } = await supabase.from(TABLE).insert({
      model_id:    row.model_id,
      run_id:      `${runId}-promoted`,
      intent_id:   'ALL',
      outcome:     'aggregate',
      file_count:  row.file_count,
      route_count: row.route_count,
      duration_ms: row.duration_ms,
    });

    if (insertErr) {
      console.warn('[BaselineStore] promoteAsBaseline insert failed:', insertErr.message);
      return false;
    }

    console.log(`[BaselineStore] promoted run ${runId} as baseline for model ${row.model_id}`);
    return true;
  },

  /**
   * Return all individual intent rows for a run.
   */
  async getRunIntents(runId: string): Promise<BaselineRow[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('run_id', runId)
      .neq('intent_id', 'ALL');

    if (error) {
      console.warn('[BaselineStore] getRunIntents failed:', error.message);
      return [];
    }
    return (data ?? []) as BaselineRow[];
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function rowToAggregate(row: BaselineRow, modelId: string): AggregateBaseline {
  return {
    modelId,
    runId:            row.run_id,
    createdAt:        row.created_at ?? new Date().toISOString(),
    // previewReadyRate not directly stored — caller must compute from intent rows or pass 0
    previewReadyRate: 0,
    avgFileCount:     row.file_count,
    avgDurationMs:    row.duration_ms,
    intentCount:      0, // populated by getBaseline callers when needed
  };
}
