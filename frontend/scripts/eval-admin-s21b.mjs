/**
 * eval-admin-s21b.mjs — targeted single-intent probe for S2.1-b export-integrity contract.
 *
 * Intent: admin-users (saas-dashboard skeleton, flash model)
 * Purpose: verify that DEFAULT_CHECKLIST and the other 10 required exports survive
 *          to previewReady — either from the first coder pass (prompt contract works)
 *          or via targeted-retry in apply (reject-at-parse fallback).
 *
 * Usage:
 *   node frontend/scripts/eval-admin-s21b.mjs
 *
 * Requires: DEEPSEEK_API_KEY in .env.local
 * Output:   diag-admin-s21b.json (repo root — not committed, in .gitignore)
 *
 * What to read in the dump:
 *   exportIntegrity.violations        — symbols that were missing after first coder pass
 *   exportIntegrity.retryTriggered    — true if reject-at-parse fired
 *   exportIntegrity.retryResolvedAll  — true if retry fixed all violations
 *   exportIntegrity.defaultChecklist  — final state of DEFAULT_CHECKLIST export
 *   outcome                           — preview-ready | failed | blocked
 *   failedStep                        — null if previewReady, step name if not
 *   parsedBuildError.symbol           — if outcome=failed, what symbol caused the build error
 *   routesExportMissing               — true if ROUTES from config/routes caused the error
 *                                       (expected, scope of S2.1-c — NOT a S2.1-b failure)
 */

import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';

const repoDir     = path.resolve(import.meta.dirname, '..', '..');
const frontendDir = path.resolve(import.meta.dirname, '..');
const runtimeUrl  = pathToFileURL(path.join(frontendDir, 'scripts', 'eval-runtime.mjs')).href;
const DUMP_PATH   = path.join(repoDir, 'diag-admin-s21b.json');

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
const plan = resolveEvalDeepSeekSeedPlan(process.env, 'fast'); // flash model
seedBenchmarkConfig(plan);

// ── Start backend ─────────────────────────────────────────────────────────────

console.log('[s21b] Starting backend...');
const { url: backendUrl, stop } = await startEvalBackend({ url: EVAL_BACKEND_URL, timeoutMs: 45_000 });
console.log(`[s21b] Backend ready at ${backendUrl}`);

// ── Load pipeline and utilities ───────────────────────────────────────────────

const { GenerationEngine } = await import(
  pathToFileURL(path.join(frontendDir, 'src/services/GenerationEngine.ts')).href
);
const { goldenIntents } = await import(
  pathToFileURL(path.join(frontendDir, 'src/services/benchmark/goldenIntents.ts')).href
);
const { resolveStandardRoute } = await import(
  pathToFileURL(path.join(frontendDir, 'src/services/buildAgentRouting.ts')).href
);
const { checkExportIntegrity } = await import(
  pathToFileURL(path.join(frontendDir, 'src/services/SkeletonRegistry.ts')).href
);

// admin-users is the target intent
const intent = goldenIntents.find(i => i.id === 'admin-users');
if (!intent) throw new Error('[s21b] admin-users intent not found in goldenIntents');

console.log(`\n[s21b] Intent: "${intent.id}"`);
console.log(`[s21b] Prompt: "${intent.prompt}"`);
console.log(`[s21b] Model: ${plan.modelId} (flash)\n`);

// ── Per-step logging ──────────────────────────────────────────────────────────

const stepLog = [];
const allLogs = [];

function logStep(label) {
  const ms = Date.now();
  const prev = stepLog.at(-1);
  const delta = prev ? `+${((ms - prev.ms) / 1000).toFixed(1)}s` : '+0.0s';
  stepLog.push({ label, ms, delta });
  console.log(`[s21b] ${delta.padStart(7)}  ${label}`);
}

// Track export-integrity signals from pipeline logs
const exportIntegritySignals = {
  contractInPrompt:   false,    // REQUIRED EXPORTS CONTRACT seen in prompt-block-sizes log
  violationsDetected: [],       // [file: symbol] pairs from [apply] export-integrity log lines
  retryTriggered:     false,    // "[apply] export-integrity violations" log seen
  retrySucceeded:     null,     // null=unknown, true/false after apply completes
  retryUpdatedFiles:  [],       // files updated by retry
};

function onLog(msg) {
  allLogs.push(msg);
  // Surface key pipeline step transitions
  if (/^\[(?:clarify|skeleton|pack|architect|coder|apply|build|preview)\]/.test(msg)) {
    logStep(msg.slice(0, 140));
  }
  // Export-integrity signals
  if (msg.includes('export-integrity violations')) {
    exportIntegritySignals.retryTriggered = true;
    // Extract violation list: "[apply] export-integrity violations (N): file is missing..."
    const match = msg.match(/violations \((\d+)\): (.+)/);
    if (match) {
      exportIntegritySignals.violationsDetected = match[2]
        .split(' | ')
        .map(s => s.trim())
        .filter(Boolean);
    }
  }
  if (msg.includes('export-integrity retry: updated')) {
    const fileMatch = msg.match(/updated (.+)$/);
    if (fileMatch) exportIntegritySignals.retryUpdatedFiles.push(fileMatch[1].trim());
  }
  if (msg.includes('export-integrity retry failed')) {
    exportIntegritySignals.retrySucceeded = false;
  }
  if (msg.includes('REQUIRED EXPORTS CONTRACT') || msg.includes('requiredExports')) {
    exportIntegritySignals.contractInPrompt = true;
  }
  // Also flag repair (should NOT run for S2.1-b target violations)
  if (msg.includes('[repair]') || msg.includes('[quality-repair]')) {
    logStep(`⚠️  REPAIR TRIGGERED: ${msg.slice(0, 100)}`);
  }
}

// ── Run generation ────────────────────────────────────────────────────────────

logStep('START');

const primaryRoute = resolveStandardRoute('primary');
const buildRoute   = resolveStandardRoute('build');
const fixRoute     = resolveStandardRoute('fix');
const qaRoute      = resolveStandardRoute('qa');

const intentSignal = AbortSignal.timeout(300_000); // 5 min

let result = null;
let crashError = null;

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
    onLog,
    onStepTrack: (e) => {
      if (e.status === 'active' || e.status === 'done' || e.status === 'error') {
        logStep(`step:${e.step} status=${e.status}${e.detail ? ` — ${e.detail.slice(0, 80)}` : ''}`);
      }
    },
  });
} catch (err) {
  crashError = err instanceof Error ? err.message : String(err);
  logStep(`CRASH: ${crashError.slice(0, 140)}`);
}

logStep('END');

// ── Post-run export integrity analysis ───────────────────────────────────────

// Run checkExportIntegrity on the final generated files to confirm state
let finalExportViolations = [];
let finalFiles = {};
if (result?.graph?.files) {
  for (const f of result.graph.files) {
    finalFiles[f.path.replace(/^src\//, '')] = f.content ?? '';
  }
  finalExportViolations = checkExportIntegrity('saas-dashboard', finalFiles);
}

// DEFAULT_CHECKLIST specific check
const seedFile = finalFiles['data/seed.ts'] ?? '';
const defaultChecklistPresent = /\bexport\s+(?:const|function|type|interface|enum|class)\s+DEFAULT_CHECKLIST\b/.test(seedFile)
  || /\bexport\s+\{[^}]*\bDEFAULT_CHECKLIST\b[^}]*\}/.test(seedFile);

// ROUTES check — this is outside S2.1-b scope; detect if it's the cause of failure
const buildError = result?.error ?? crashError ?? '';
const routesExportMissing = buildError.toLowerCase().includes('routes') ||
  allLogs.some(l => l.toLowerCase().includes('routes') && l.toLowerCase().includes('missing'));

// Determine if retry resolved all violations
if (exportIntegritySignals.retryTriggered) {
  exportIntegritySignals.retrySucceeded = finalExportViolations.length === 0;
}

// ── Classify outcome ──────────────────────────────────────────────────────────

function classifyOutcome(result) {
  if (!result || result.status === 'failed' || result.status === 'cancelled') return 'failed';
  if (result.runtimeGuard && !result.runtimeGuard.passed) return 'blocked';
  if (result.integrityGuard && !result.integrityGuard.passed) return 'blocked';
  if (result.integrationReport && !result.integrationReport.isHealthy) return 'blocked';
  return 'preview-ready';
}

// ── Assemble diagnostic dump ──────────────────────────────────────────────────

const totalMs = stepLog.at(-1)?.ms && stepLog[0]?.ms
  ? (stepLog.at(-1).ms - stepLog[0].ms)
  : 0;

const diag = {
  meta: {
    runAt:     new Date().toISOString(),
    branch:    'p2/coder-product-identity-substitution',
    milestone: 'S2.1-b',
    intentId:  intent.id,
    prompt:    intent.prompt,
    model:     plan.modelId,
    suite:     'fast',
    totalMs,
    totalSec:  (totalMs / 1000).toFixed(1),
  },
  outcome: classifyOutcome(result),
  status:  result?.status ?? 'null',
  failedStep: result?.pipelineFailureDiagnostics?.failedStep ?? null,
  error: crashError ?? result?.error ?? null,

  // ── S2.1-b primary signals ──────────────────────────────────────────────────
  exportIntegrity: {
    // Did the prompt block contain the REQUIRED EXPORTS CONTRACT?
    contractSeenInLogs:       exportIntegritySignals.contractInPrompt,
    // Were violations detected after first coder pass? (reject-at-parse triggered)
    retryTriggered:           exportIntegritySignals.retryTriggered,
    // What violations did the pipeline detect?
    violationsOnFirstPass:    exportIntegritySignals.violationsDetected,
    // Did retry fix them?
    retryResolvedAll:         exportIntegritySignals.retrySucceeded,
    // Which files did retry update?
    retryUpdatedFiles:        exportIntegritySignals.retryUpdatedFiles,
    // Final state after all passes
    finalViolations:          finalExportViolations,
    finalViolationCount:      finalExportViolations.length,
    // DEFAULT_CHECKLIST specifically
    defaultChecklist: {
      present:          defaultChecklistPresent,
      firstPass:        !exportIntegritySignals.violationsDetected.some(v =>
                          v.includes('DEFAULT_CHECKLIST')),
      viaRetry:         exportIntegritySignals.retryUpdatedFiles.includes('data/seed.ts'),
    },
  },

  // ── ROUTES / App.tsx signal (S2.1-c scope — NOT S2.1-b failure) ────────────
  routesExportMissing,
  routesNote: routesExportMissing
    ? 'ROUTES missing is S2.1-c scope (App.tsx-protection), NOT a S2.1-b failure'
    : null,

  // ── Build error detail ──────────────────────────────────────────────────────
  buildError: buildError.slice(0, 500) || null,

  // ── Generation quality ──────────────────────────────────────────────────────
  fileCount:     result?.graph?.files?.length ?? 0,
  designContractOk: result?.designContractOk ?? null,
  qualityPassed:    result?.qualitySummary?.passed ?? null,

  // ── Step timeline ───────────────────────────────────────────────────────────
  steps: stepLog.map((s, i) => ({
    step:    s.label.slice(0, 120),
    delta:   s.delta,
    elapsedMs: i > 0 ? s.ms - stepLog[0].ms : 0,
  })),

  // ── Key log lines (export-integrity + errors) ────────────────────────────────
  keyLogs: allLogs
    .filter(l =>
      l.includes('export-integrity') ||
      l.includes('REQUIRED EXPORTS') ||
      l.includes('[apply]') ||
      l.includes('[repair]') ||
      l.includes('[quality-repair]') ||
      l.includes('missing') ||
      l.includes('error') ||
      l.includes('Error')
    )
    .slice(0, 80)
    .map(l => l.slice(0, 200)),
};

// ── Write dump ────────────────────────────────────────────────────────────────

fs.writeFileSync(DUMP_PATH, JSON.stringify(diag, null, 2));
console.log(`\n[s21b] Dump written → ${DUMP_PATH}`);

// ── Console summary ───────────────────────────────────────────────────────────

console.log('\n════════════════════════════════════════════════════════');
console.log(' S2.1-b ADMIN-USERS PROBE RESULTS');
console.log('════════════════════════════════════════════════════════');
console.log(`outcome:                  ${diag.outcome}`);
console.log(`failedStep:               ${diag.failedStep ?? 'none'}`);
console.log(`error:                    ${diag.error?.slice(0, 120) ?? 'none'}`);
console.log('');
console.log('── Export Integrity ────────────────────────────────────');
console.log(`DEFAULT_CHECKLIST present:      ${diag.exportIntegrity.defaultChecklist.present}`);
console.log(`  → from first coder pass:      ${diag.exportIntegrity.defaultChecklist.firstPass}`);
console.log(`  → via targeted-retry:         ${diag.exportIntegrity.defaultChecklist.viaRetry}`);
console.log(`retryTriggered (violations):    ${diag.exportIntegrity.retryTriggered}`);
console.log(`retryResolvedAll:               ${diag.exportIntegrity.retryResolvedAll}`);
console.log(`finalViolationCount:            ${diag.exportIntegrity.finalViolationCount}`);
if (diag.exportIntegrity.violationsOnFirstPass.length > 0) {
  console.log(`violationsOnFirstPass:`);
  for (const v of diag.exportIntegrity.violationsOnFirstPass) {
    console.log(`  - ${v}`);
  }
}
if (diag.exportIntegrity.finalViolations.length > 0) {
  console.log(`remaining violations:`);
  for (const v of diag.exportIntegrity.finalViolations) {
    console.log(`  - ${v.file}: ${v.name}`);
  }
}
console.log('');
console.log('── ROUTES / App.tsx (S2.1-c scope) ─────────────────────');
console.log(`routesExportMissing:      ${diag.routesExportMissing}`);
if (diag.routesNote) console.log(`note: ${diag.routesNote}`);
console.log('');
console.log(`fileCount:                ${diag.fileCount}`);
console.log(`designContractOk:         ${diag.designContractOk}`);
console.log(`total time:               ${diag.meta.totalSec}s`);
console.log('════════════════════════════════════════════════════════');

// ── Teardown ──────────────────────────────────────────────────────────────────

await stop();
console.log('[s21b] Backend stopped.');
