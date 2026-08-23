/**
 * eval-admin-s21b.runner.test.ts — S2.1-b export-integrity contract probe.
 *
 * Targeted single-intent E2E run: admin-users (saas-dashboard, flash model).
 * Verifies DEFAULT_CHECKLIST and the other 10 required exports survive to previewReady.
 *
 * Run:
 *   npx vitest run scripts/eval-admin-s21b.runner.test.ts --config=vitest.eval.config.ts
 *
 * Or via npm alias (from frontend/):
 *   node scripts/eval-admin-s21b.mjs   (launches vitest the same way as eval-baseline.mjs)
 *
 * Requires: DEEPSEEK_API_KEY in .env.local
 * Output:   diag-admin-s21b.json (repo root — gitignored)
 */

import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, describe, it } from 'vitest';

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

const repoDir     = path.resolve(import.meta.dirname, '..', '..');
const DUMP_PATH   = path.join(repoDir, 'diag-admin-s21b.json');

let backendStop: (() => Promise<unknown>) | null = null;

beforeAll(async () => {
  loadEvalEnv();
  ensureBrowserGlobals();
  patchFetchForEval(EVAL_BACKEND_URL);

  const backend = await startEvalBackend({ url: EVAL_BACKEND_URL, timeoutMs: 45_000 });
  backendStop = backend.stop;
  console.log(`[s21b] Backend ready at ${backend.url}`);

  const probeResp = await fetch(`${backend.url}/api/preview/diag-probe/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: {}, skeletonId: 'saas-dashboard', sessionId: 'diag' }),
  });
  console.log(`[s21b] Compile endpoint probe: status=${probeResp.status}`);
}, 60_000);

afterAll(async () => {
  if (backendStop) {
    await backendStop();
    console.log('[s21b] Backend stopped.');
  }
});

describe('S2.1-b admin-users export-integrity probe', () => {
  it(
    'runs admin-users end-to-end and dumps export-integrity telemetry',
    async () => {
      requireEvalDeepSeekKey(process.env);
      const plan = resolveEvalDeepSeekSeedPlan(process.env, 'fast'); // flash
      seedBenchmarkConfig(plan);

      const [
        { GenerationEngine },
        { goldenIntents },
        { resolveStandardRoute },
        { checkExportIntegrity },
      ] = await Promise.all([
        import('../src/services/GenerationEngine'),
        import('../src/services/benchmark/goldenIntents'),
        import('../src/services/buildAgentRouting'),
        import('../src/services/SkeletonRegistry'),
      ]);

      const intent = goldenIntents.find((i: { id: string }) => i.id === 'admin-users');
      if (!intent) throw new Error('[s21b] admin-users not found in goldenIntents');

      console.log(`\n[s21b] Intent: "${intent.id}"`);
      console.log(`[s21b] Prompt: "${intent.prompt}"`);
      console.log(`[s21b] Model:  ${plan.modelId}\n`);

      const t0 = Date.now();
      const steps: Array<{ label: string; elapsedMs: number }> = [];
      const allLogs: string[] = [];

      // Export-integrity signals extracted from pipeline logs
      const exportSignals = {
        retryTriggered:    false,
        violationsOnFirst: [] as string[],
        retryUpdated:      [] as string[],
        retryFailed:       false,
      };

      function logStep(label: string) {
        const elapsedMs = Date.now() - t0;
        steps.push({ label, elapsedMs });
        console.log(`[s21b] +${(elapsedMs / 1000).toFixed(1)}s  ${label}`);
      }

      function onLog(msg: string) {
        allLogs.push(msg);
        if (/^\[(?:clarify|skeleton|pack|architect|coder|apply|build|preview|repair|quality-repair)\]/.test(msg)) {
          logStep(msg.slice(0, 160));
        }
        if (msg.includes('export-integrity violations')) {
          exportSignals.retryTriggered = true;
          const m = msg.match(/violations \(\d+\): (.+)/);
          if (m) exportSignals.violationsOnFirst = m[1].split(' | ').map(s => s.trim()).filter(Boolean);
        }
        if (msg.includes('export-integrity retry: updated')) {
          const m = msg.match(/updated (.+)$/);
          if (m) exportSignals.retryUpdated.push(m[1].trim());
        }
        if (msg.includes('export-integrity retry failed')) {
          exportSignals.retryFailed = true;
        }
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
          intent:      intent.prompt,
          history:     [],
          files:       {},
          primaryRoute,
          buildRoute,
          fixRoute,
          qaRoute,
          apiKey:      buildRoute.apiKey,
          modelId:     buildRoute.modelId,
          fixModelId:  fixRoute.modelId,
          signal:      intentSignal,
          onStream:    () => {},
          onFiles:     () => {},
          onPhase:     () => {},
          onPlan:      () => {},
          onLog,
          onStepTrack: (e: { step: string; status: string; detail?: string }) => {
            if (e.status === 'active' || e.status === 'done' || e.status === 'error') {
              logStep(`step:${e.step} [${e.status}]${e.detail ? ` — ${e.detail.slice(0, 80)}` : ''}`);
            }
          },
        });
      } catch (err: unknown) {
        runError = err instanceof Error ? err.message : String(err);
        logStep(`CRASH: ${runError.slice(0, 140)}`);
      }

      logStep('END');

      // ── Post-run export integrity analysis ──────────────────────────────────
      const finalFiles: Record<string, string> = {};
      if (result?.graph?.files) {
        for (const f of result.graph.files) {
          finalFiles[(f.path as string).replace(/^src\//, '')] = (f.content as string) ?? '';
        }
      }
      const finalViolations = checkExportIntegrity('saas-dashboard', finalFiles);

      const seedContent = finalFiles['data/seed.ts'] ?? '';
      const defaultChecklistPresent =
        /\bexport\s+(?:const|function|type|interface|enum|class)\s+DEFAULT_CHECKLIST\b/.test(seedContent) ||
        /\bexport\s+\{[^}]*\bDEFAULT_CHECKLIST\b[^}]*\}/.test(seedContent);

      const buildError = result?.error ?? runError ?? '';
      const routesExportMissing =
        String(buildError).toLowerCase().includes('routes') ||
        allLogs.some(l => l.toLowerCase().includes('routes') && (l.toLowerCase().includes('missing') || l.toLowerCase().includes('export')));

      function classifyOutcome(r: typeof result): string {
        if (!r || r.status === 'failed' || r.status === 'cancelled') return 'failed';
        if (r.runtimeGuard && !r.runtimeGuard.passed) return 'blocked';
        if (r.integrityGuard && !r.integrityGuard.passed) return 'blocked';
        if (r.integrationReport && !r.integrationReport.isHealthy) return 'blocked';
        return 'preview-ready';
      }

      const totalMs = Date.now() - t0;
      const diag = {
        meta: {
          runAt:     new Date().toISOString(),
          branch:    'p2/coder-product-identity-substitution',
          milestone: 'S2.1-b',
          intentId:  intent.id,
          prompt:    intent.prompt,
          model:     plan.modelId,
          totalMs,
          totalSec:  (totalMs / 1000).toFixed(1),
        },
        outcome:   classifyOutcome(result),
        status:    result?.status ?? 'null',
        failedStep: (result as { pipelineFailureDiagnostics?: { failedStep?: string } } | null)
          ?.pipelineFailureDiagnostics?.failedStep ?? null,
        error: buildError?.slice?.(0, 500) || null,

        exportIntegrity: {
          retryTriggered:       exportSignals.retryTriggered,
          violationsOnFirstPass: exportSignals.violationsOnFirst,
          retryUpdatedFiles:    exportSignals.retryUpdated,
          retryFailed:          exportSignals.retryFailed,
          retryResolvedAll:     exportSignals.retryTriggered
            ? finalViolations.length === 0 && !exportSignals.retryFailed
            : null,
          finalViolations,
          finalViolationCount:  finalViolations.length,
          defaultChecklist: {
            present:       defaultChecklistPresent,
            firstPass:     !exportSignals.violationsOnFirst.some(v => v.includes('DEFAULT_CHECKLIST')),
            viaRetry:      exportSignals.retryUpdated.includes('data/seed.ts'),
          },
        },
        routesExportMissing,
        routesNote: routesExportMissing
          ? 'ROUTES missing is S2.1-c scope (App.tsx-protection) — NOT a S2.1-b failure'
          : null,
        fileCount:        result?.graph?.files?.length ?? 0,
        designContractOk: (result as { designContractOk?: boolean } | null)?.designContractOk ?? null,
        qualityPassed:    result?.qualitySummary?.passed ?? null,
        steps: steps.map((s, i) => ({
          step:      s.label.slice(0, 120),
          elapsedMs: s.elapsedMs,
          deltaMs:   i > 0 ? s.elapsedMs - steps[i - 1].elapsedMs : 0,
        })),
        keyLogs: allLogs
          .filter(l =>
            l.includes('export-integrity') ||
            l.includes('REQUIRED EXPORTS') ||
            l.includes('[repair]') ||
            l.includes('[quality-repair]') ||
            l.includes('missing') ||
            l.toLowerCase().includes('error'),
          )
          .slice(0, 80)
          .map(l => l.slice(0, 200)),
      };

      fs.writeFileSync(DUMP_PATH, JSON.stringify(diag, null, 2));

      // ── Console summary ──────────────────────────────────────────────────────
      console.log('\n════════════════════════════════════════════════════════');
      console.log(' S2.1-b ADMIN-USERS RESULTS');
      console.log('════════════════════════════════════════════════════════');
      console.log(`outcome:                       ${diag.outcome}`);
      console.log(`failedStep:                    ${diag.failedStep ?? 'none'}`);
      console.log(`error:                         ${String(diag.error ?? 'none').slice(0, 120)}`);
      console.log('');
      console.log('── Export Integrity ─────────────────────────────────────');
      console.log(`DEFAULT_CHECKLIST present:     ${diag.exportIntegrity.defaultChecklist.present}`);
      console.log(`  → first pass (no retry):     ${diag.exportIntegrity.defaultChecklist.firstPass}`);
      console.log(`  → via targeted-retry:        ${diag.exportIntegrity.defaultChecklist.viaRetry}`);
      console.log(`retryTriggered:                ${diag.exportIntegrity.retryTriggered}`);
      console.log(`retryResolvedAll:              ${diag.exportIntegrity.retryResolvedAll}`);
      console.log(`finalViolationCount:           ${diag.exportIntegrity.finalViolationCount}`);
      if (diag.exportIntegrity.violationsOnFirstPass.length > 0) {
        console.log('violationsOnFirstPass:');
        for (const v of diag.exportIntegrity.violationsOnFirstPass) {
          console.log(`  - ${v}`);
        }
      }
      if (finalViolations.length > 0) {
        console.log('remaining violations:');
        for (const v of finalViolations) {
          console.log(`  - ${v.file}: ${v.name}`);
        }
      }
      console.log('');
      console.log('── ROUTES / App.tsx (S2.1-c scope) ─────────────────────');
      console.log(`routesExportMissing:           ${diag.routesExportMissing}`);
      if (diag.routesNote) console.log(`note: ${diag.routesNote}`);
      console.log('');
      console.log(`fileCount:                     ${diag.fileCount}`);
      console.log(`total time:                    ${diag.meta.totalSec}s`);
      console.log(`dump:                          ${DUMP_PATH}`);
      console.log('════════════════════════════════════════════════════════');

      // Minimal assertion: pipeline must have started (more than just START logged)
      if (steps.length <= 1 && !runError) {
        throw new Error('[s21b] Pipeline produced no steps — likely failed to start');
      }
    },
    360_000, // 6 min budget
  );
});
