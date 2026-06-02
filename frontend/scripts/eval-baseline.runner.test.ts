import { describe, expect, it } from 'vitest';

import {
  baselineArtifactPath,
  ensureArtifactDir,
  ensureBrowserGlobals,
  loadEvalEnv,
  normalizeGateSuite,
  parseCliSuite,
  readJson,
  resolveEvalConfig,
  seedBenchmarkConfig,
  writeJson,
} from './eval-runtime.mjs';

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

function artifactFromRun(
  suite: 'fast' | 'full',
  report: {
    runId: string;
    modelId: string;
    startedAt: string;
    finishedAt: string;
    summary: unknown;
  },
  aggregate: {
    modelId: string;
    runId: string;
    createdAt: string;
    previewReadyRate: number;
    avgFileCount: number;
    avgDurationMs: number;
    intentCount: number;
  },
) {
  return {
    version: 1,
    kind: 'benchmark-baseline',
    suite,
    generatedAt: new Date().toISOString(),
    source: {
      runId: report.runId,
      modelId: report.modelId,
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
    },
    aggregate,
    summary: report.summary,
  };
}

describe('eval baseline runner', () => {
  it(
    'captures benchmark baselines and writes committed artifacts',
    async () => {
      loadEvalEnv();
      ensureBrowserGlobals();

      const rawSuite = parseCliSuite('all');
      const suites = normalizeBaselineSuites(rawSuite);
      const { provider, apiKey, modelId, fixModelId } = resolveEvalConfig();

      expect(apiKey, 'Missing API key. Set OPENROUTER_API_KEY or the provider-specific key env var.').toBeTruthy();

      seedBenchmarkConfig({ provider, apiKey, modelId, fixModelId });
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

        console.log(`[eval:baseline] Running ${suite} benchmark on ${modelId}`);
        const { report } = await BenchmarkService.run({
          apiKey,
          modelId,
          fixModelId: fixModelId || undefined,
          intentIds,
        });

        const aggregate = buildAggregateBaseline(report);
        const artifactPath = baselineArtifactPath(suite);
        writeJson(artifactPath, artifactFromRun(suite, report, aggregate));
        console.log(`[eval:baseline] Wrote ${artifactPath}`);

        if (suite === 'full') {
          await BenchmarkService.promoteAsBaseline(report);
          console.log('[eval:baseline] Promoted full-suite report through BaselineStore.save()');
        }
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
