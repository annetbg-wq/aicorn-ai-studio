/**
 * BenchmarkService — golden-intent benchmark harness for the studio.
 *
 * Runs a configurable subset of golden intents through the real
 * GenerationPipeline and collects structured results.
 *
 * Usage (from browser console or a UI button):
 *   import { BenchmarkService } from './services/benchmark/BenchmarkService';
 *   const report = await BenchmarkService.run({ apiKey, modelId });
 *   // report.json + report.markdown are ready
 *
 * Does NOT auto-run on app load.
 */

import { SimpleGeneration as GenerationPipeline } from '../SimpleGeneration';
import { goldenIntents, type GoldenIntent, type IntentCategory } from './goldenIntents';
import {
  computeSummary,
  renderMarkdownSummary,
  type BenchmarkReport,
  type BenchmarkOutcome,
  type IntentRunResult,
} from './BenchmarkReport';
import { BaselineStore } from './BaselineStore';
import type { GenerationResult } from '../../shared/projectModel';

// ── Config ──────────────────────────────────────────────────────────────────

export interface BenchmarkRunConfig {
  apiKey:       string;
  modelId:      string;
  fixModelId?:  string;
  /** Run only these intent ids. Omit or [] to run all 15. */
  intentIds?:   string[];
  /** Run only these categories. Omit or [] to run all. */
  categories?:  IntentCategory[];
  /** Called after each intent completes. */
  onProgress?:  (completed: number, total: number, last: IntentRunResult) => void;
  /** AbortSignal to cancel the entire run. */
  signal?:      AbortSignal;
}

export interface BenchmarkRunOutput {
  report:   BenchmarkReport;
  json:     string;
  markdown: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function selectIntents(cfg: BenchmarkRunConfig): GoldenIntent[] {
  let pool = [...goldenIntents];
  if (cfg.categories && cfg.categories.length > 0) {
    const cats = new Set(cfg.categories);
    pool = pool.filter(i => cats.has(i.category));
  }
  if (cfg.intentIds && cfg.intentIds.length > 0) {
    const ids = new Set(cfg.intentIds);
    pool = pool.filter(i => ids.has(i.id));
  }
  return pool;
}

function classifyOutcome(result: GenerationResult): {
  outcome: BenchmarkOutcome;
  blockingCodes: string[];
} {
  // Failed generation
  if (result.status === 'failed' || result.status === 'cancelled') {
    return { outcome: 'failed', blockingCodes: [] };
  }

  // RuntimeGuard blocked preview
  if (result.runtimeGuard && !result.runtimeGuard.passed) {
    return {
      outcome: 'blocked',
      blockingCodes: result.runtimeGuard.repairPayload.reasons.map(r => r.code),
    };
  }

  // IntegrityGuard blocked
  if (result.integrityGuard && !result.integrityGuard.passed) {
    return {
      outcome: 'blocked',
      blockingCodes: result.integrityGuard.errors.map(e => e.code),
    };
  }

  // IntegrationReport unhealthy
  if (result.integrationReport && !result.integrationReport.isHealthy) {
    return {
      outcome: 'blocked',
      blockingCodes: result.integrationReport.unresolvedIssues.map(i => i.kind),
    };
  }

  return { outcome: 'preview-ready', blockingCodes: [] };
}

// ── Main runner ─────────────────────────────────────────────────────────────

async function runSingleIntent(
  intent: GoldenIntent,
  cfg: BenchmarkRunConfig,
): Promise<IntentRunResult> {
  const t0 = performance.now();
  let genResult: GenerationResult | null = null;
  let error: string | null = null;

  try {
    genResult = await GenerationPipeline.run({
      intent:   intent.prompt,
      history:  [],
      files:    {},
      apiKey:   cfg.apiKey,
      modelId:  cfg.modelId,
      fixModelId: cfg.fixModelId,
      onStream: () => {},
      onFiles:  () => {},
      onPhase:  () => {},
      onLog:    () => {},
      onPlan:   () => {},
      signal:   cfg.signal,
    });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const durationMs = Math.round(performance.now() - t0);

  if (!genResult || error) {
    return {
      intentId:      intent.id,
      category:      intent.category,
      modelId:       cfg.modelId,
      durationMs,
      fileCount:     0,
      routeCount:    0,
      featureCount:  0,
      outcome:       'failed',
      blockingCodes: [],
      error:         error ?? genResult?.error ?? 'No result returned',
    };
  }

  const { outcome, blockingCodes } = classifyOutcome(genResult);
  const graph = genResult.graph;

  return {
    intentId:      intent.id,
    category:      intent.category,
    modelId:       genResult.usedModel || cfg.modelId,
    durationMs,
    fileCount:     graph.files.length,
    routeCount:    graph.routes.length,
    featureCount:  graph.features.length,
    outcome,
    blockingCodes,
    error:         genResult.error ?? null,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

export const BenchmarkService = {
  /** All available golden intents. */
  intents: goldenIntents,

  /**
   * Run the benchmark. Returns JSON report and markdown summary.
   * Does NOT run automatically — must be called explicitly.
   */
  async run(cfg: BenchmarkRunConfig): Promise<BenchmarkRunOutput> {
    const intents = selectIntents(cfg);
    if (intents.length === 0) {
      throw new Error('[BenchmarkService] No intents matched the filter — nothing to run.');
    }

    const runId = `bench-${Date.now().toString(36)}`;
    const startedAt = new Date().toISOString();
    const results: IntentRunResult[] = [];

    console.log(
      `[BenchmarkService] ── run started: ${runId} | ${intents.length} intent(s) | model=${cfg.modelId} ──`,
    );

    for (let i = 0; i < intents.length; i++) {
      if (cfg.signal?.aborted) {
        console.warn('[BenchmarkService] Aborted by signal.');
        break;
      }

      const intent = intents[i];
      console.log(`[BenchmarkService] [${i + 1}/${intents.length}] Running: ${intent.id} (${intent.category})`);

      const result = await runSingleIntent(intent, cfg);
      results.push(result);

      console.log(
        `[BenchmarkService] [${i + 1}/${intents.length}] ${intent.id}: ${result.outcome}` +
          ` | files=${result.fileCount} routes=${result.routeCount} features=${result.featureCount}` +
          ` | ${(result.durationMs / 1000).toFixed(1)}s` +
          (result.blockingCodes.length > 0 ? ` | blocking: ${result.blockingCodes.join(',')}` : ''),
      );

      cfg.onProgress?.(i + 1, intents.length, result);
    }

    const finishedAt = new Date().toISOString();
    const totalMs = results.reduce((s, r) => s + r.durationMs, 0);
    const summary = computeSummary(results);

    const report: BenchmarkReport = {
      version: 1,
      runId,
      startedAt,
      finishedAt,
      modelId: cfg.modelId,
      totalMs,
      results,
      summary,
    };

    const json     = JSON.stringify(report, null, 2);
    const markdown = renderMarkdownSummary(report);

    console.log(`[BenchmarkService] ── run complete: ${runId} ──`);
    console.log(markdown);

    return { report, json, markdown };
  },

  /**
   * Persist a completed report to Supabase as a stored baseline.
   * Called automatically by BenchmarkGate; also available for manual promotion.
   */
  async promoteAsBaseline(report: BenchmarkReport): Promise<void> {
    await BaselineStore.save(report);
  },
};
