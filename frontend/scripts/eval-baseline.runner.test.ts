import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  EVAL_BACKEND_URL,
  baselineArtifactPath,
  envFlagEnabled,
  ensureArtifactDir,
  ensureBrowserGlobals,
  loadEvalEnv,
  normalizeGateSuite,
  parseCliSuite,
  patchFetchForEval,
  readJson,
  requireEvalDeepSeekKey,
  resolveBenchmarkDiagnosticPath,
  resolveEvalDeepSeekSeedPlan,
  seedBenchmarkConfig,
  startEvalBackend,
  writeJson,
  writeJsonWithParentDir,
} from './eval-runtime.mjs';
import { captureBaselineSuite } from './eval-baseline-support.mjs';
import type { BenchmarkIntentDiagnostic } from '../src/services/benchmark/BenchmarkService';
import type { BenchmarkReport } from '../src/services/benchmark/BenchmarkReport';

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

function createDiagnosticDumpWriter(input: {
  suite: 'fast' | 'full';
  filePath: string;
  modelId: string;
  mode: 'diagnostic-only' | 'baseline+diagnostic';
  intentIds: string[] | undefined;
}) {
  const dump: {
    kind: 'benchmark-diagnostic-dump';
    suite: 'fast' | 'full';
    mode: 'diagnostic-only' | 'baseline+diagnostic';
    modelId: string;
    runId: string | null;
    startedAt: string;
    updatedAt: string;
    requestedIntentIds?: string[];
    intents: BenchmarkIntentDiagnostic[];
  } = {
    kind: 'benchmark-diagnostic-dump',
    suite: input.suite,
    mode: input.mode,
    modelId: input.modelId,
    runId: null,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    requestedIntentIds: input.intentIds,
    intents: [],
  };

  const flush = () => {
    dump.updatedAt = new Date().toISOString();
    writeJsonWithParentDir(input.filePath, dump);
  };

  flush();

  return {
    filePath: input.filePath,
    append(detail: BenchmarkIntentDiagnostic) {
      const nextIndex = dump.intents.findIndex((item) => item.intentId === detail.intentId);
      if (nextIndex >= 0) {
        dump.intents[nextIndex] = detail;
      } else {
        dump.intents.push(detail);
      }
      flush();
    },
    finalize(report: BenchmarkReport) {
      dump.runId = report.runId;
      dump.modelId = report.modelId;
      flush();
    },
  };
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

  // Hard-fail: both layers must be non-zero. A silent fallback would allow a
  // baseline with previewReadyRate=0 to be committed, then assertBaselineUsable()
  // would reject every subsequent gate run — S0.1 closed on paper, broken in practice.
  const backend = await startEvalBackend({ url: EVAL_BACKEND_URL, timeoutMs: 45_000 });
  backendStop = backend.stop;
  console.log(`[eval:baseline] Backend ready at ${backend.url}`);
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
      const diagnosticDumpEnabled = envFlagEnabled(process.env.BENCHMARK_DIAGNOSTIC_DUMP);
      const diagnosticOnly = envFlagEnabled(process.env.BENCHMARK_DIAGNOSTIC_ONLY);

      // Verify the key is present before running any suite.
      requireEvalDeepSeekKey(process.env);

      seedBenchmarkConfig(resolveEvalDeepSeekSeedPlan(process.env, suites[0]));
      if (!diagnosticOnly) {
        ensureArtifactDir();
      }

      const [{ BenchmarkService }, { goldenIntents }, { buildAggregateBaseline }] = await Promise.all([
        import('../src/services/benchmark/BenchmarkService'),
        import('../src/services/benchmark/goldenIntents'),
        import('../src/services/benchmark/BaselineStore'),
      ]);
      const reportBySuite = new Map<'fast' | 'full', BenchmarkReport>();
      const diagnosticPaths = new Map<'fast' | 'full', string>();

      for (const suite of suites) {
        const intentIds = suite === 'fast'
          ? goldenIntents.slice(0, 5).map((intent) => intent.id)
          : undefined;

        const suitePlan = resolveEvalDeepSeekSeedPlan(process.env, suite);
        seedBenchmarkConfig(suitePlan);

        const displayModelId = suitePlan.modelId;
        console.log(`[eval:baseline] Running ${suite} benchmark on ${displayModelId}`);
        const diagnosticWriter = diagnosticDumpEnabled
          ? createDiagnosticDumpWriter({
              suite,
              filePath: resolveBenchmarkDiagnosticPath(suite, process.env),
              modelId: displayModelId,
              mode: diagnosticOnly ? 'diagnostic-only' : 'baseline+diagnostic',
              intentIds,
            })
          : null;
        if (diagnosticWriter) {
          diagnosticPaths.set(suite, diagnosticWriter.filePath);
          console.log(`[eval:baseline] Diagnostic dump enabled: ${diagnosticWriter.filePath}`);
        }
        const { report } = await BenchmarkService.run({
          apiKey: suitePlan.apiKey,
          modelId: displayModelId,
          fixModelId: suitePlan.fixModelId || undefined,
          intentIds,
          onIntentDiagnostic: (detail) => diagnosticWriter?.append(detail),
        });
        reportBySuite.set(suite, report);
        diagnosticWriter?.finalize(report);

        if (diagnosticOnly) {
          console.log(`[eval:baseline] Diagnostic-only mode: skipped committed baseline capture for ${suite}`);
        } else {
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
      }

      if (suites.length === 1) {
        const suite = suites[0];
        const diagnosticPath = diagnosticPaths.get(suite);
        if (diagnosticPath) {
          console.log(`[eval:baseline] Diagnostic dump ready: ${diagnosticPath}`);
        }

        if (diagnosticOnly) {
          const report = reportBySuite.get(suite);
          if (!report) {
            throw new Error(`[eval:baseline] Missing in-memory report for ${suite} diagnostic run.`);
          }
          const agg = report.summary;
          console.log(
            `[eval:baseline] ${suite} diagnostic summary: ` +
            `designContractOk=${Math.round(agg.designContractCleanRate * 100)}% ` +
            `qualityPass=${Math.round(agg.qualityPassRate * 100)}% ` +
            `visualScore=${(agg.visualQuality?.avgScore ?? 0).toFixed(1)} ` +
            `previewReady=${Math.round((agg.previewReady / Math.max(agg.total, 1)) * 100)}% ` +
            `(${agg.avgFileCount.toFixed(1)} avg files, ${(agg.avgDurationMs / 1000).toFixed(1)}s avg).`,
          );
          return;
        }

        const artifact = readJson(baselineArtifactPath(suite));
        const agg = artifact.aggregate;
        console.log(
          `[eval:baseline] ${suite} baseline ready: ` +
          `designContractClean=${Math.round(agg.designContractCleanRate * 100)}% ` +
          `designContractFinal=${Math.round(agg.designContractFinalRate * 100)}% ` +
          `qualityPass=${Math.round(agg.qualityPassRate * 100)}% ` +
          `visualScore=${agg.avgVisualScore.toFixed(1)} ` +
          `previewReady=${Math.round(agg.previewReadyRate * 100)}% ` +
          `(${agg.avgFileCount.toFixed(1)} avg files, ${(agg.avgDurationMs / 1000).toFixed(1)}s avg).`,
        );

        // Structural axes (Layer 1) + E2E axis (Layer 2) must all be present.
        // designContractClean: required=false — flash baseline may be 0%, just assert it's a number.
        // designContractFinal: required=true  — repair must succeed for ≥1 intent.
        expect(
          typeof agg.designContractCleanRate,
          'designContractCleanRate must be a number in the aggregate',
        ).toBe('number');
        expect(
          agg.designContractFinalRate,
          'designContractFinalRate must be > 0 — repair must produce passing DesignContract for ≥1 intent',
        ).toBeGreaterThan(0);
        expect(
          agg.qualityPassRate,
          'qualityPassRate must be > 0 — at least one intent must pass quality checks',
        ).toBeGreaterThan(0);
        expect(
          agg.avgVisualScore,
          'avgVisualScore must be > 0 — visual scoring must produce a non-zero result',
        ).toBeGreaterThan(0);
        expect(
          agg.previewReadyRate,
          'previewReadyRate must be > 0 — at least one intent must compile and mount (E2E layer). ' +
          'If this fails, check that startEvalBackend started successfully and the backend is healthy.',
        ).toBeGreaterThan(0);
      }
    },
    30 * 60 * 1000,
  );
});
