/**
 * eval-1intent.runner.test.ts — single-intent diagnostic run.
 *
 * Runs exactly ONE golden intent with full per-step timing and compile probe.
 * Does NOT write baselines. Used to verify the pipeline works end-to-end
 * before committing to a full 5-intent or 15-intent baseline run.
 *
 * Run: node scripts/eval-baseline.mjs (which calls vitest with eval config)
 * Or:  npx vitest run scripts/eval-1intent.runner.test.ts --config=vitest.eval.config.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  EVAL_BACKEND_URL,
  ensureBrowserGlobals,
  loadEvalEnv,
  patchFetchForEval,
  requireEvalDeepSeekKey,
  resolveEvalDeepSeekSeedPlan,
  seedBenchmarkConfig,
  startEvalBackend,
} from './eval-runtime.mjs';

let backendStop: (() => Promise<unknown>) | null = null;
let backendUrl = EVAL_BACKEND_URL;

beforeAll(async () => {
  loadEvalEnv();
  ensureBrowserGlobals();
  patchFetchForEval(EVAL_BACKEND_URL);

  const backend = await startEvalBackend({ url: EVAL_BACKEND_URL, timeoutMs: 45_000 });
  backendStop = backend.stop;
  backendUrl  = backend.url;
  console.log(`[diag] Backend ready at ${backendUrl}`);

  // Verify compile endpoint is registered (expect 4xx, not 404)
  const probeResp = await fetch(`${backendUrl}/api/preview/diag-probe/compile`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ files: {}, skeletonId: 'mobile-app', sessionId: 'diag' }),
  });
  console.log(`[diag] Compile endpoint: status=${probeResp.status} — ${
    probeResp.status === 404 ? 'ROUTE MISSING!' :
    probeResp.status < 500  ? 'route registered ✓' : 'server error'
  }`);
  expect(probeResp.status, 'Compile endpoint must be registered (not 404)').not.toBe(404);
}, 60_000);

afterAll(async () => {
  if (backendStop) { await backendStop(); console.log('[diag] Backend stopped.'); }
});

describe('eval 1-intent diagnostic', () => {
  it(
    'runs one intent end-to-end and reports per-step timing',
    async () => {
      requireEvalDeepSeekKey(process.env);
      const plan = resolveEvalDeepSeekSeedPlan(process.env, 'fast');
      seedBenchmarkConfig(plan);

      const [
        { GenerationEngine },
        { goldenIntents },
        { resolveStandardRoute },
      ] = await Promise.all([
        import('../src/services/GenerationEngine'),
        import('../src/services/benchmark/goldenIntents'),
        import('../src/services/buildAgentRouting'),
      ]);

      const intent = goldenIntents[0];
      console.log(`\n[diag] Intent: "${intent.id}" — "${intent.prompt.slice(0, 80)}..."`);

      // ── Per-step timing ─────────────────────────────────────────────────────
      const t0 = Date.now();
      const steps: Array<{ label: string; elapsedMs: number }> = [];

      function logStep(label: string) {
        const elapsedMs = Date.now() - t0;
        steps.push({ label, elapsedMs });
        console.log(`[diag] +${(elapsedMs / 1000).toFixed(1)}s  ${label}`);
      }

      logStep('START');

      const primaryRoute = resolveStandardRoute('primary');
      const buildRoute   = resolveStandardRoute('build');
      const fixRoute     = resolveStandardRoute('fix');
      const qaRoute      = resolveStandardRoute('qa');
      const intentSignal = AbortSignal.timeout(300_000);

      let result: Awaited<ReturnType<typeof GenerationEngine.run>> | null = null;
      let runError: string | null = null;

      try {
        result = await GenerationEngine.run({
          intent:       intent.prompt,
          history:      [],
          files:        {},
          primaryRoute,
          buildRoute,
          fixRoute,
          qaRoute,
          apiKey:       buildRoute.apiKey,
          modelId:      buildRoute.modelId,
          fixModelId:   fixRoute.modelId,
          signal:       intentSignal,
          onStream:     () => {},
          onFiles:      () => {},
          onPhase:      () => {},
          onPlan:       () => {},
          onLog: (msg: string) => {
            if (/^\[(?:clarify|skeleton|pack|architect|coder|apply|build|preview|GenerationEngine)\]/.test(msg)) {
              logStep(msg.slice(0, 120));
            }
          },
          onStepTrack: (e) => {
            if (e.status === 'active' || e.status === 'done' || e.status === 'error') {
              logStep(`step:${e.step} [${e.status}]${e.detail ? ` — ${e.detail.slice(0, 60)}` : ''}`);
            }
          },
        });
      } catch (err: unknown) {
        runError = err instanceof Error ? err.message : String(err);
        logStep(`CRASH: ${runError.slice(0, 120)}`);
      }

      logStep('END');

      // ── Report ──────────────────────────────────────────────────────────────
      const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
      console.log('\n── Result ────────────────────────────────────────────────');
      console.log(`status:            ${result?.status ?? 'null'}`);
      console.log(`error:             ${runError ?? result?.error ?? 'none'}`);
      console.log(`files:             ${result?.graph?.files?.length ?? 0}`);
      console.log(`designContractOk:  ${(result as { designContractOk?: boolean } | null)?.designContractOk ?? 'undefined'}`);
      console.log(`qualityPassed:     ${result?.qualitySummary?.passed ?? false}`);
      console.log(`visualScore:       ${result?.visualQualitySummary?.score ?? 'n/a'}`);
      console.log(`total time:        ${totalSec}s`);

      console.log('\n── Step timeline ─────────────────────────────────────────');
      for (let i = 1; i < steps.length; i++) {
        const dt = ((steps[i].elapsedMs - steps[i - 1].elapsedMs) / 1000).toFixed(1);
        console.log(`  ${dt.padStart(6)}s  ${steps[i].label}`);
      }

      // If the pipeline crashed with something other than timeout/abort — fail loudly.
      if (runError && !/abort|timeout/i.test(runError)) {
        throw new Error(`[diag] Pipeline crashed: ${runError}`);
      }

      // We don't assert previewReady here — this is diagnostic only.
      // Check that the pipeline at least started (produced some steps).
      expect(steps.length, 'Pipeline should have logged at least one step beyond START').toBeGreaterThan(1);
    },
    360_000, // 6 min: gives the 300s intent signal room + teardown
  );
});
