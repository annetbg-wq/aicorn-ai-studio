import { describe, expect, it } from 'vitest';

import {
  baselineArtifactPath,
  ensureArtifactDir,
  ensureBrowserGlobals,
  loadEvalEnv,
  normalizeGateSuite,
  parseCliSuite,
  readJson,
  requireEvalDeepSeekKey,
  resolveEvalDeepSeekSeedPlan,
  seedBenchmarkConfig,
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

describe('eval baseline runner', () => {
  it(
    'captures benchmark baselines and writes committed artifacts',
    async () => {
      loadEvalEnv();
      ensureBrowserGlobals();

      const rawSuite = parseCliSuite('all');
      const suites = normalizeBaselineSuites(rawSuite);

      // Verify the key is present before running any suite.
      // INVARIANT: resolveEvalDeepSeekSeedPlan never calls ConfigService or writes anywhere.
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

        // Each suite gets its own model (fast=flash, full=pro) from EVAL_MODELS.
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
        console.log(
          `[eval:baseline] ${suite} baseline ready: ` +
          `${Math.round(artifact.aggregate.previewReadyRate * 100)}% preview-ready, ` +
          `${artifact.aggregate.avgFileCount.toFixed(1)} avg files, ` +
          `${(artifact.aggregate.avgDurationMs / 1000).toFixed(1)}s avg duration.`,
        );
      }
    },
    30 * 60 * 1000,
  );
});
