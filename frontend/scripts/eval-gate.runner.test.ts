import fs from 'fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  EVAL_BACKEND_URL,
  assertEvalModelAllowed,
  baselineArtifactPath,
  ensureBrowserGlobals,
  loadEvalEnv,
  normalizeGateSuite,
  parseCliSuite,
  patchFetchForEval,
  readJson,
  resolveEvalDeepSeekSeedPlan,
  seedBenchmarkConfig,
  startEvalBackend,
} from './eval-runtime.mjs';

function assertBaselineArtifact(raw: unknown, filePath: string) {
  if (!raw || typeof raw !== 'object' || !('aggregate' in raw) || typeof raw.aggregate !== 'object' || raw.aggregate === null) {
    throw new Error(`[eval:gate] Invalid baseline artifact: ${filePath}`);
  }

  const aggregate = raw.aggregate as Record<string, unknown>;
  const requiredKeys = [
    'modelId', 'runId', 'createdAt',
    'previewReadyRate', 'avgFileCount', 'avgDurationMs', 'intentCount',
    'filesProducedRate', 'qualityPassRate', 'avgVisualScore',
  ];
  const missing = requiredKeys.filter((key) => !(key in aggregate));
  if (missing.length > 0) {
    throw new Error(`[eval:gate] Baseline artifact is missing keys: ${missing.join(', ')}`);
  }

  return aggregate;
}

// ── Backend lifecycle ─────────────────────────────────────────────────────────

let backendStop: (() => Promise<unknown>) | null = null;

beforeAll(async () => {
  loadEvalEnv();
  ensureBrowserGlobals();
  patchFetchForEval(EVAL_BACKEND_URL);

  try {
    const backend = await startEvalBackend({ url: EVAL_BACKEND_URL, timeoutMs: 45_000 });
    backendStop = backend.stop;
    console.log(`[eval:gate] Backend ready at ${backend.url}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[eval:gate] Backend did not start (${msg}). ` +
      'previewReadyRate will be 0; gate will reject baseline if previewReadyRate was > 0 there.',
    );
  }
}, 60_000);

afterAll(async () => {
  if (backendStop) {
    await backendStop();
    console.log('[eval:gate] Backend stopped.');
  }
});

// ── Gate check ────────────────────────────────────────────────────────────────

describe('eval gate runner', () => {
  it(
    'replays the benchmark suite against the committed baseline',
    async () => {
      const rawSuite = parseCliSuite('fast');
      const suite = normalizeGateSuite(rawSuite, '__invalid__');
      if (suite === '__invalid__') {
        throw new Error(`[eval:gate] Unknown BENCHMARK_SUITE="${rawSuite}". Use fast, full, or smoke.`);
      }

      // Resolve credentials exclusively from process.env (loaded from .env.local).
      // If DEEPSEEK_API_KEY is absent, skip gracefully so CI stays green without a key.
      let seedPlan: ReturnType<typeof resolveEvalDeepSeekSeedPlan>;
      try {
        seedPlan = resolveEvalDeepSeekSeedPlan(process.env, suite);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[eval:gate] ${msg} — skipping gate.`);
        return;
      }

      assertEvalModelAllowed(seedPlan.provider, seedPlan.modelId);

      const artifactPath = baselineArtifactPath(suite);
      expect(fs.existsSync(artifactPath), `Baseline artifact not found: ${artifactPath}`).toBe(true);

      seedBenchmarkConfig(seedPlan);

      const artifact = readJson(artifactPath);
      const baseline = assertBaselineArtifact(artifact, artifactPath);
      const { BenchmarkGate } = await import('../src/services/benchmark/BenchmarkGate');
      const displayModelId = seedPlan.modelId;

      console.log(`[eval:gate] Suite=${suite} Model=${displayModelId} Baseline=${artifactPath}`);
      if (baseline.modelId !== displayModelId) {
        console.warn(
          `[eval:gate] Baseline model mismatch: artifact=${baseline.modelId} current=${displayModelId}. ` +
          'Continuing because the caller may be deliberately comparing against a pinned baseline.',
        );
      }

      // assertBaselineUsable throws if any required axis is 0/missing.
      // This ensures the gate cannot go vacuous on an empty baseline.
      const { assertBaselineUsable } = await import('../src/services/benchmark/BenchmarkGate');
      assertBaselineUsable(baseline as import('../src/services/benchmark/BaselineStore').AggregateBaseline);

      const verdict = await BenchmarkGate.check({
        apiKey:    seedPlan.apiKey,
        modelId:   displayModelId,
        fixModelId: seedPlan.fixModelId || undefined,
        suite,
        baseline:  baseline as import('../src/services/benchmark/BaselineStore').AggregateBaseline,
      });

      if (verdict.scorecard) {
        console.log(`\n${verdict.scorecard}`);
      }

      expect(
        verdict.passed,
        verdict.regressions.map((issue) => `[${issue.axisId}] ${issue.message}`).join('\n'),
      ).toBe(true);
    },
    15 * 60 * 1000,
  );
});
