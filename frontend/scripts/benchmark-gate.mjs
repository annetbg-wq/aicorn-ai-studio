/**
 * benchmark-gate.mjs — CI entry point for BenchmarkGate quality check.
 *
 * Usage (CI):
 *   node --experimental-vm-modules scripts/benchmark-gate.mjs
 *
 * Required env vars:
 *   OPENROUTER_API_KEY   — API key for LLM calls
 *   BENCHMARK_MODEL_ID   — model to benchmark (default: openai/gpt-4o-mini)
 *   BENCHMARK_SUITE      — 'smoke' (5 intents) or 'full' (all 15)
 *
 * Optional env vars:
 *   VITE_SUPABASE_URL      — for baseline storage
 *   VITE_SUPABASE_ANON_KEY — for baseline storage
 *
 * Exit codes:
 *   0 — gate passed
 *   1 — gate failed (regression) or fatal error
 */

import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = new URL('.', import.meta.url).pathname;
const rootDir   = path.resolve(__dirname, '..');

// ── Environment validation ─────────────────────────────────────────────────

const apiKey   = process.env.OPENROUTER_API_KEY ?? '';
const modelId  = process.env.BENCHMARK_MODEL_ID ?? 'openai/gpt-4o-mini';
const suite    = (process.env.BENCHMARK_SUITE ?? 'smoke');

if (!apiKey) {
  console.error('[BenchmarkGate CI] OPENROUTER_API_KEY is not set — skipping gate.');
  process.exit(0); // soft skip when no key (forks, etc.)
}

if (suite !== 'smoke' && suite !== 'full') {
  console.error(`[BenchmarkGate CI] Unknown BENCHMARK_SUITE="${suite}". Use 'smoke' or 'full'.`);
  process.exit(1);
}

// ── Patch browser globals needed by the service layer ─────────────────────

if (!globalThis.localStorage) {
  const _store = {};
  globalThis.localStorage = {
    getItem:    (k) => _store[k] ?? null,
    setItem:    (k, v) => { _store[k] = String(v); },
    removeItem: (k) => { delete _store[k]; },
    clear:      () => Object.keys(_store).forEach(k => delete _store[k]),
    get length() { return Object.keys(_store).length; },
    key:        (i) => Object.keys(_store)[i] ?? null,
  };
}

if (!globalThis.window) {
  globalThis.window = globalThis;
  globalThis.window.dispatchEvent = () => true;
  globalThis.window.addEventListener = () => {};
  globalThis.window.removeEventListener = () => {};
}

// ── Dynamic import via Vite / tsx transform ────────────────────────────────
// BenchmarkGate uses TypeScript imports; we use tsx for the transform.

let BenchmarkGate;
try {
  // Try tsx register if available
  const { register } = await import('node:module');
  const tsxPath = path.join(rootDir, 'node_modules', 'tsx', 'esm', 'index.js');
  if (fs.existsSync(tsxPath)) {
    register(pathToFileURL(tsxPath).href, import.meta.url);
  }
  const mod = await import(pathToFileURL(
    path.join(rootDir, 'src', 'services', 'benchmark', 'BenchmarkGate.ts'),
  ).href);
  BenchmarkGate = mod.BenchmarkGate;
} catch (e) {
  console.error('[BenchmarkGate CI] Failed to import BenchmarkGate:', e.message);
  console.error('Ensure tsx is installed: npm install -D tsx');
  process.exit(1);
}

// ── Run the gate ───────────────────────────────────────────────────────────

console.log(`[BenchmarkGate CI] Suite=${suite} Model=${modelId}`);

try {
  const verdict = await BenchmarkGate.check({
    apiKey,
    modelId,
    suite,
  });

  // Write scorecard to stdout
  if (verdict.scorecard) console.log('\n' + verdict.scorecard);

  if (!verdict.passed) {
    console.error('\n[BenchmarkGate CI] ❌ GATE FAILED — regression detected');
    console.error(`Reasons: ${verdict.failReasons?.join(', ') ?? 'unknown'}`);
    process.exit(1);
  }

  console.log('\n[BenchmarkGate CI] ✅ Gate passed');
  process.exit(0);

} catch (err) {
  console.error('[BenchmarkGate CI] Fatal error:', err?.message ?? err);
  process.exit(1);
}
