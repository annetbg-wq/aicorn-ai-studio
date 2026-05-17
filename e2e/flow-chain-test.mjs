/**
 * flow-chain-test.mjs — Fixture-based step chain test for the studio.
 *
 * Tests the full generation chain using pre-defined fixtures instead of LLM.
 * Requires backend (port 3000) to be running.
 * Frontend (port 5183) must also be available for preview checks.
 *
 * Usage: node e2e/flow-chain-test.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Fixtures ──────────────────────────────────────────────────────────────────
const FIXTURES = {
  idea: "Трекер привычек: ежедневные отметки, стрик, статистика",
  architectPlan: {
    appName: "HabitFlow",
    skeleton: "mobile-app",
    deltaFiles: ["src/pages/Home.tsx", "src/config/app.ts"],
    pages: ["Home", "Progress", "Profile"],
  },
  codeOutput: {
    "src/pages/Home.tsx":
      "import React from 'react';\nexport default function Home() { return <div className='p-4'><h1>HabitFlow</h1></div>; }",
    "src/config/app.ts":
      "export const APP_CONFIG = { name: 'HabitFlow', tagline: 'Build your habits.' } as const;\nexport const STORAGE_KEYS = { theme: 'app.v1.theme', profile: 'app.v1.profile' } as const;",
  },
};

const BACKEND_URL = 'http://localhost:3000';

// Unique buildId for this test run so it doesn't collide with user builds
const buildId = 'flow-chain-' + crypto.randomBytes(4).toString('hex');
const previewSession = 'flow-chain-session-' + crypto.randomBytes(12).toString('hex');

/** Accumulated step results */
const steps = [];

/** Result from the compile step (carried forward for save_ready) */
let compileSuccess = false;

// ── Step runner ───────────────────────────────────────────────────────────────

async function runStep(name, fn) {
  const t0 = Date.now();
  const entry = { step: name, status: 'skip', duration_ms: 0, input: null, output: null, error: null };

  try {
    const result = await fn();
    entry.status = 'pass';
    entry.output = result?.output ?? null;
    entry.input  = result?.input  ?? null;
  } catch (err) {
    entry.status = 'fail';
    entry.error  = err.message || String(err);
  }

  entry.duration_ms = Date.now() - t0;
  steps.push(entry);

  const icon   = entry.status === 'pass' ? '✅' : entry.status === 'fail' ? '❌' : '⏭';
  const dur    = entry.duration_ms > 0 ? `${entry.duration_ms}ms` : '';
  const detail = entry.error
    || (typeof entry.output === 'string' ? entry.output : JSON.stringify(entry.output ?? ''));

  console.log(`${icon} ${name.padEnd(18)} ${dur.padStart(8)}   ${String(detail ?? '').slice(0, 80)}`);

  return entry.status === 'pass';
}

// ── Individual step functions ─────────────────────────────────────────────────

async function step_idea() {
  const idea = FIXTURES.idea;
  if (!idea || !idea.trim()) throw new Error('Idea is empty');
  return { input: idea, output: `validated: "${idea.slice(0, 50)}"` };
}

async function step_architecture() {
  const plan = FIXTURES.architectPlan;
  if (!plan.skeleton)                               throw new Error('Plan missing field: skeleton');
  if (!Array.isArray(plan.deltaFiles) || !plan.deltaFiles.length)
    throw new Error('Plan missing field: deltaFiles');
  if (!Array.isArray(plan.pages) || !plan.pages.length)
    throw new Error('Plan missing field: pages');

  return {
    input:  plan,
    output: `skeleton: ${plan.skeleton}, ${plan.deltaFiles.length} delta file(s), pages: ${plan.pages.join(', ')}`,
  };
}

async function step_code_delta() {
  const resp = await fetch(`${BACKEND_URL}/api/preview/${buildId}/compile`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Preview-Session': previewSession,
    },
    body: JSON.stringify({
      files: FIXTURES.codeOutput,
      skeletonId: FIXTURES.architectPlan.skeleton,
      sessionId: previewSession,
    }),
  });

  if (!resp.ok && resp.status !== 200) {
    const text = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = await resp.json();
  if (!data.success) throw new Error(`Compile failed: ${data.error || 'unknown error'}`);

  compileSuccess = true;
  return {
    input:  Object.keys(FIXTURES.codeOutput),
    output: `success: true, buildId: ${buildId}`,
  };
}

async function step_compile() {
  const assetsDir = path.join(ROOT, 'builds', buildId, 'assets');
  if (!fs.existsSync(assetsDir)) {
    throw new Error(`assets/ dir not found: builds/${buildId}/assets`);
  }

  const jsFiles = fs.readdirSync(assetsDir).filter(f => f.endsWith('.js'));
  if (jsFiles.length === 0) throw new Error('No .js files found in assets/');

  return {
    input:  assetsDir,
    output: `${jsFiles.length} JS asset(s): ${jsFiles.join(', ')}`,
  };
}

async function step_preview() {
  const previewUrl = `${BACKEND_URL}/preview/${buildId}?previewSession=${encodeURIComponent(previewSession)}`;
  const resp = await fetch(previewUrl);

  if (resp.status !== 200) {
    throw new Error(`Expected HTTP 200, got ${resp.status}`);
  }

  const html = await resp.text();
  if (!html.includes('<html') && !html.includes('<!DOCTYPE') && !html.includes('<script')) {
    throw new Error(`Response does not look like HTML (${html.length} bytes)`);
  }

  return {
    input:  previewUrl,
    output: `HTTP 200, HTML received (${html.length} bytes)`,
  };
}

async function step_preview_mounted() {
  const mainTsxPath = path.join(ROOT, 'preview-workspace', 'src', 'main.tsx');
  if (!fs.existsSync(mainTsxPath)) {
    throw new Error('main.tsx not found in preview-workspace/src/');
  }

  const content = fs.readFileSync(mainTsxPath, 'utf-8');
  if (!content.includes('preview-mounted')) {
    throw new Error('main.tsx does not contain postMessage({type: "preview-mounted"})');
  }

  return {
    input:  mainTsxPath,
    output: 'postMessage({type: "preview-mounted"}) found in main.tsx',
  };
}

async function step_save_ready() {
  if (!compileSuccess) throw new Error('Compile did not succeed — save-ready state not reached');
  return { output: 'compile success = true → save-ready state confirmed' };
}

async function step_saved_project() {
  // Projects are stored in localStorage (frontend) or Supabase — not as local backend files.
  // Verify no session file was accidentally created for this buildId.
  const sessionsDir = path.join(ROOT, 'backend', 'sessions');
  if (fs.existsSync(sessionsDir)) {
    const entries = fs.readdirSync(sessionsDir);
    const unexpected = entries.find(e => e.includes(buildId));
    if (unexpected) throw new Error(`Unexpected session file created: ${unexpected}`);
  }

  return {
    input:  buildId,
    output: 'No project file created before explicit save (correct)',
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const totalStart = Date.now();

  console.log('');
  console.log('🧪 Flow Chain Test (fixtures — no LLM)');
  console.log(`   buildId : ${buildId}`);
  console.log(`   backend : ${BACKEND_URL}`);
  console.log('');
  console.log(`${'STEP'.padEnd(18)} ${'DURATION'.padStart(8)}   RESULT`);
  console.log('─'.repeat(72));

  await runStep('idea',            step_idea);
  await runStep('architecture',    step_architecture);
  await runStep('code_delta',      step_code_delta);
  await runStep('compile',         step_compile);
  await runStep('preview',         step_preview);
  await runStep('preview_mounted', step_preview_mounted);
  await runStep('save_ready',      step_save_ready);
  await runStep('saved_project',   step_saved_project);

  const totalMs   = Date.now() - totalStart;
  const passed    = steps.filter(s => s.status === 'pass').length;
  const failed    = steps.filter(s => s.status === 'fail').length;
  const skipped   = steps.filter(s => s.status === 'skip').length;
  const brokenAt  = steps.find(s => s.status === 'fail')?.step ?? null;
  const verdict   = failed === 0 ? 'PASS' : passed > 0 ? 'PARTIAL' : 'FAIL';

  const handoffErrors = steps
    .filter(s => s.status === 'fail')
    .map(s => `${s.step}: ${s.error}`);

  const perStep = {};
  for (const s of steps) perStep[s.step] = s.duration_ms;

  const report = {
    verdict,
    buildId,
    timestamp: new Date().toISOString(),
    steps,
    timings: { total_ms: totalMs, per_step: perStep },
    handoff_errors: handoffErrors,
    broken_at: brokenAt,
  };

  const reportPath = path.join(ROOT, 'flow-chain-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  console.log('─'.repeat(72));
  console.log('');

  const verdictIcon = verdict === 'PASS' ? '✅' : verdict === 'PARTIAL' ? '⚠️' : '❌';
  console.log(`VERDICT: ${verdictIcon} ${verdict}`);
  console.log(`Steps  : ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log(`Total  : ${(totalMs / 1000).toFixed(1)}s`);
  if (brokenAt) console.log(`Broken : ${brokenAt}`);
  if (handoffErrors.length > 0) {
    console.log('Errors :');
    handoffErrors.forEach(e => console.log(`  • ${e}`));
  }
  console.log('');
  console.log(`Report saved → flow-chain-report.json`);
  console.log('');

  process.exit(verdict === 'FAIL' ? 1 : 0);
}

main().catch(err => {
  console.error('');
  console.error('Fatal error:', err.message);
  console.error('');
  process.exit(1);
});
