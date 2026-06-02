import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  EVAL_BACKEND_URL,
  baselineArtifactPath,
  ensureArtifactDir,
  ensureBrowserGlobals,
  loadEvalEnv,
  normalizeGateSuite,
  parseCliSuite,
  patchFetchForEval,
  readJson,
  requireEvalDeepSeekKey,
  resolveEvalDeepSeekSeedPlan,
  seedBenchmarkConfig,
  startEvalBackend,
  writeJson,
} from './eval-runtime.mjs';
import { captureBaselineSuite } from './eval-baseline-support.mjs';

function normalizeBaselineSuites(rawSuite: string): Array<'fast' | 'full'> {
  if (rawSuite === 'all') {
    return ['fast', 'full'];
  }

  const normalized = normalizeGateSuite(rawSuite, '__invalid__');
  if (normalized === '__invalid__') {
    throw new Error(`[eval:baseline] Unknown BENCHMARK_SUITE="${rawSuite}". Use fast, full, smoke, or all.`);
  }

  return [normalized];
}

// ── Backend lifecycle ─────────────────────────────────────────────────────────
// The backend compile-endpoint must be running for the E2E layer (previewReadyRate).
// Structural metrics (filesProduced, qualityPass, visualScore) are headless and
// do not depend on the backend — they are captured regardless.

let backendStop: (() => Promise<unknown>) | null = null;

beforeAll(async () => {
  loadEvalEnv();
  ensureBrowserGlobals();
  patchFetchForEval(EVAL_BACKEND_URL);

  try {
    const backend = await startEvalBackend({ url: EVAL_BACKEND_URL, timeoutMs: 45_000 });
    backendStop = backend.stop;
    console.log(`[eval:baseline] Backend ready at ${backend.url}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[eval:baseline] Backend did not start (${msg}). ` +
      'previewReadyRate will be 0 — only structural metrics will be captured. ' +
      'Start the backend manually or set EVAL_BACKEND_URL to enable E2E layer.',
    );
  }
}, 60_000);

afterAll(async () => {
  if (backendStop) {
    await backendStop();
    console.log('[eval:baseline] Backend stopped.');
  }
});

// ── Baseline capture ──────────────────────────────────────────────────────────

describe('eval baseline runner', () => {
  it(
    'captures benchmark baselines and writes committed artifacts',
    async () => {
      const rawSuite = parseCliSuite('all');
      const suites = normalizeBaselineSuites(rawSuite);

      // Verify the key is present before running any suite.
      requireEvalDeepSeekKey(process.env);

      seedBenchmarkConfig(resolveEvalDeepSeekSeedPlan(process.env, suites[0]));
      ensureArtifactDir();

      const [{ BenchmarkService }, { goldenIntents }, { buildAggregateBaseline }] = await Promise.all([
        import('../src/services/benchmark/BenchmarkService'),
        import('../src/services/benchmark/goldenIntents'),
        import('../src/services/benchmark/BaselineStore'),
      ]);

      for (const suite of suites) {
        const intentIds = suite === 'fast'
          ? goldenIntents.slice(0, 5).map((intent) => intent.id)
          : undefined;

        const suitePlan = resolveEvalDeepSeekSeedPlan(process.env, suite);
        seedBenchmarkConfig(suitePlan);

        const displayModelId = suitePlan.modelId;
        console.log(`[eval:baseline] Running ${suite} benchmark on ${displayModelId}`);
        const { report } = await BenchmarkService.run({
          apiKey: suitePlan.apiKey,
          modelId: displayModelId,
          fixModelId: suitePlan.fixModelId || undefined,
          intentIds,
        });

        const { artifactPath } = await captureBaselineSuite({
          suite,
          report,
          buildAggregateBaseline,
          baselineArtifactPath,
          writeJson,
          promoteAsBaseline: BenchmarkService.promoteAsBaseline,
        });
        console.log(`[eval:baseline] Wrote ${artifactPath}`);
      }

      if (suites.length === 1) {
        const suite = suites[0];
        const artifact = readJson(baselineArtifactPath(suite));
        const agg = artifact.aggregate;
        console.log(
          `[eval:baseline] ${suite} baseline ready: ` +
          `filesProduced=${Math.round(agg.filesProducedRate * 100)}% ` +
          `qualityPass=${Math.round(agg.qualityPassRate * 100)}% ` +
          `visualScore=${agg.avgVisualScore.toFixed(1)} ` +
          `previewReady=${Math.round(agg.previewReadyRate * 100)}% ` +
          `(${agg.avgFileCount.toFixed(1)} avg files, ${(agg.avgDurationMs / 1000).toFixed(1)}s avg).`,
        );

        // Structural metrics must be non-zero; previewReady may be 0 if no backend.
        expect(
          agg.filesProducedRate,
          'filesProducedRate must be > 0 — generation must produce files',
        ).toBeGreaterThan(0);
        expect(
          agg.qualityPassRate,
          'qualityPassRate must be > 0 — at least one intent must pass quality checks',
        ).toBeGreaterThan(0);
        expect(
          agg.avgVisualScore,
          'avgVisualScore must be > 0 — visual scoring must produce a non-zero result',
        ).toBeGreaterThan(0);
      }
    },
    30 * 60 * 1000,
  );
});
