/**
 * eval-1intent.mjs — run exactly ONE golden intent with full per-step logging.
 *
 * Usage: node frontend/scripts/eval-1intent.mjs
 * Shows: per-step timing (clarify → architect → coder → apply → build → preview)
 *        and the final outcome (preview-ready / failed / blocked).
 *
 * This is a diagnostic tool — does NOT write baselines.
 */

import path from 'path';
import { pathToFileURL } from 'url';

const repoDir     = path.resolve(import.meta.dirname, '..', '..');
const frontendDir = path.resolve(import.meta.dirname, '..');
const runtimeUrl  = pathToFileURL(path.join(frontendDir, 'scripts', 'eval-runtime.mjs')).href;

const {
  loadEvalEnv,
  ensureBrowserGlobals,
  patchFetchForEval,
  requireEvalDeepSeekKey,
  resolveEvalDeepSeekSeedPlan,
  seedBenchmarkConfig,
  startEvalBackend,
  EVAL_BACKEND_URL,
} = await import(runtimeUrl);

loadEvalEnv();
ensureBrowserGlobals();
patchFetchForEval(EVAL_BACKEND_URL);

requireEvalDeepSeekKey(process.env);
const plan = resolveEvalDeepSeekSeedPlan(process.env, 'fast');
seedBenchmarkConfig(plan);

// ── Start backend ─────────────────────────────────────────────────────────────

console.log('[diag] Starting backend...');
const { url: backendUrl, stop } = await startEvalBackend({ url: EVAL_BACKEND_URL, timeoutMs: 45_000 });
console.log(`[diag] Backend ready at ${backendUrl}`);

// ── Verify compile endpoint ───────────────────────────────────────────────────
// Send a fake compile request with no files to check what the endpoint returns.
// We expect 400 or 422 (invalid build), NOT 404. If 404 → route not registered.

const probeResp = await fetch(`${backendUrl}/api/preview/diag-probe/compile`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ files: {}, skeletonId: 'mobile-app', sessionId: 'diag' }),
});
console.log(`[diag] Compile endpoint probe: status=${probeResp.status} (expected 4xx, NOT 404)`);

// ── Load pipeline ─────────────────────────────────────────────────────────────

const { GenerationEngine } = await import(
  pathToFileURL(path.join(frontendDir, 'src/services/GenerationEngine.ts')).href
);
const { goldenIntents }    = await import(
  pathToFileURL(path.join(frontendDir, 'src/services/benchmark/goldenIntents.ts')).href
);
const { resolveStandardRoute } = await import(
  pathToFileURL(path.join(frontendDir, 'src/services/buildAgentRouting.ts')).href
);

const intent = goldenIntents[0]; // first fast-suite intent
console.log(`\n[diag] Running intent: "${intent.id}" — "${intent.prompt.slice(0, 80)}..."`);

const stepLog = [];
function logStep(label) {
  const ms = Date.now();
  const prev = stepLog.at(-1);
  const delta = prev ? `+${((ms - prev.ms) / 1000).toFixed(1)}s` : '+0.0s';
  stepLog.push({ label, ms });
  console.log(`[diag] ${delta.padStart(7)}  ${label}`);
}

logStep('START');

const primaryRoute = resolveStandardRoute('primary');
const buildRoute   = resolveStandardRoute('build');
const fixRoute     = resolveStandardRoute('fix');
const qaRoute      = resolveStandardRoute('qa');

const intentSignal = AbortSignal.timeout(120_000);

let result = null;
let error  = null;

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
    onPhase:      (e) => {},
    onPlan:       () => {},
    onLog: (msg) => {
      // Surface pipeline step transitions
      if (/^\[(?:clarify|skeleton|pack|architect|coder|apply|build|preview)\]/.test(msg)) {
        logStep(msg.slice(0, 120));
      }
    },
    onStepTrack:  (e) => {
      if (e.status === 'active' || e.status === 'done' || e.status === 'error') {
        logStep(`step:${e.step} status=${e.status}${e.detail ? ` — ${e.detail.slice(0, 60)}` : ''}`);
      }
    },
  });
} catch (err) {
  error = err instanceof Error ? err.message : String(err);
  logStep(`CRASH: ${error.slice(0, 120)}`);
}

logStep('END');

// ── Report ────────────────────────────────────────────────────────────────────

const totalSec = ((stepLog.at(-1).ms - stepLog[0].ms) / 1000).toFixed(1);
console.log('\n── Result ───────────────────────────────────────────────────────');
console.log(`status:             ${result?.status ?? 'null'}`);
console.log(`error:              ${error ?? result?.error ?? 'none'}`);
console.log(`files:              ${result?.graph?.files?.length ?? 0}`);
console.log(`designContractOk:   ${result?.designContractOk ?? 'undefined'}`);
console.log(`qualityPassed:      ${result?.qualitySummary?.passed ?? false}`);
console.log(`visualScore:        ${result?.visualQualitySummary?.score ?? 'n/a'}`);
console.log(`total time:         ${totalSec}s`);

console.log('\n── Steps ────────────────────────────────────────────────────────');
for (let i = 1; i < stepLog.length; i++) {
  const dt = ((stepLog[i].ms - stepLog[i-1].ms) / 1000).toFixed(1);
  console.log(`  ${dt.padStart(6)}s  ${stepLog[i].label}`);
}

// ── Teardown ──────────────────────────────────────────────────────────────────

await stop();
console.log('\n[diag] Backend stopped.');
