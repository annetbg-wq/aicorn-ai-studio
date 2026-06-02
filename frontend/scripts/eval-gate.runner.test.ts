import fs from 'fs';

import { describe, expect, it } from 'vitest';

import {
  baselineArtifactPath,
  ensureBrowserGlobals,
  loadEvalEnv,
  normalizeGateSuite,
  parseCliSuite,
  readJson,
  resolveEvalConfig,
  seedBenchmarkConfig,
} from './eval-runtime.mjs';

function assertBaselineArtifact(raw: unknown, filePath: string) {
  if (!raw || typeof raw !== 'object' || !('aggregate' in raw) || typeof raw.aggregate !== 'object' || raw.aggregate === null) {
    throw new Error(`[eval:gate] Invalid baseline artifact: ${filePath}`);
  }

  const aggregate = raw.aggregate as Record<string, unknown>;
  const requiredKeys = ['modelId', 'runId', 'createdAt', 'previewReadyRate', 'avgFileCount', 'avgDurationMs', 'intentCount'];
  const missing = requiredKeys.filter((key) => !(key in aggregate));
  if (missing.length > 0) {
    throw new Error(`[eval:gate] Baseline artifact is missing keys: ${missing.join(', ')}`);
  }

  return aggregate;
}

describe('eval gate runner', () => {
  it(
    'replays the benchmark suite against the committed baseline',
    async () => {
      loadEvalEnv();
      ensureBrowserGlobals();

      const rawSuite = parseCliSuite('fast');
      const suite = normalizeGateSuite(rawSuite, '__invalid__');
      if (suite === '__invalid__') {
        throw new Error(`[eval:gate] Unknown BENCHMARK_SUITE="${rawSuite}". Use fast, full, or smoke.`);
      }

      const { provider, apiKey, modelId, fixModelId } = resolveEvalConfig();
      if (!apiKey) {
        console.warn('[eval:gate] API key is not configured. Skipping gate.');
        return;
      }

      const artifactPath = baselineArtifactPath(suite);
      expect(fs.existsSync(artifactPath), `Baseline artifact not found: ${artifactPath}`).toBe(true);

      seedBenchmarkConfig({ provider, apiKey, modelId, fixModelId });

      const artifact = readJson(artifactPath);
      const baseline = assertBaselineArtifact(artifact, artifactPath);
      const { BenchmarkGate } = await import('../src/services/benchmark/BenchmarkGate');

      console.log(`[eval:gate] Suite=${suite} Model=${modelId} Baseline=${artifactPath}`);
      if (baseline.modelId !== modelId) {
        console.warn(
          `[eval:gate] Baseline model mismatch: artifact=${baseline.modelId} current=${modelId}. ` +
          'Continuing because the caller may be deliberately comparing against a pinned baseline.',
        );
      }

      const verdict = await BenchmarkGate.check({
        apiKey,
        modelId,
        fixModelId: fixModelId || undefined,
        suite,
        baseline: baseline as import('../src/services/benchmark/BaselineStore').AggregateBaseline,
      });

      if (verdict.scorecard) {
        console.log(`\n${verdict.scorecard}`);
      }

      expect(verdict.passed, verdict.regressions.map((issue) => `${issue.metric}: ${issue.message}`).join('\n')).toBe(true);
    },
    15 * 60 * 1000,
  );
});
