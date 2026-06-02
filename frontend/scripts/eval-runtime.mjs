import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const frontendDir = path.resolve(__dirname, '..');
export const repoDir = path.resolve(frontendDir, '..');
export const artifactDir = path.join(repoDir, 'artifacts', 'eval-baselines');
export const runtimeAgentConfigPath = path.join(repoDir, 'backend', 'agent-config.runtime.json');

const PROVIDER_STORAGE_KEYS = {
  openrouter: 'OPENROUTER_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  groq: 'GROQ_API_KEY',
};

const PROVIDER_ENV_KEYS = {
  openrouter: ['OPENROUTER_API_KEY', 'VITE_OPENROUTER_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY', 'VITE_ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY', 'VITE_OPENAI_API_KEY'],
  google: ['GOOGLE_API_KEY', 'VITE_GOOGLE_API_KEY'],
  mistral: ['MISTRAL_API_KEY', 'VITE_MISTRAL_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY', 'VITE_DEEPSEEK_API_KEY'],
  groq: ['GROQ_API_KEY', 'VITE_GROQ_API_KEY'],
};

const SLOT_TO_AGENT = {
  primary: 'agent_primary',
  spec: 'agent_spec',
  build: 'agent_build',
  fix: 'agent_fix',
  qa: 'agent_qa',
};

/**
 * EVAL_MODELS — single source of truth for eval provider/model per suite.
 *
 * - fast  → deepseek/deepseek-v4-flash  (5-intent smoke sweep)
 * - full  → deepseek/deepseek-v4-pro    (15-intent full benchmark)
 *
 * modelId values use the full "provider/model" format.
 * The backend (auth-token.ts:887) strips the "deepseek/" prefix for the native
 * DeepSeek endpoint automatically — the runner must NOT pre-strip it.
 *
 * ISOLATION INVARIANT (eval path):
 *   - The eval path reads DEEPSEEK_API_KEY ONLY from process.env (loaded from .env.local).
 *   - It NEVER calls ConfigService.getProviderKey / setProviderKey / saveKeyToCloud.
 *   - It NEVER writes to localStorage, .env, Supabase, or any store reachable by the
 *     browser-side ConfigService — so eval credentials cannot leak into user sessions.
 *   - Browser-side ConfigService is never imported or invoked from this module.
 */
export const EVAL_MODELS = Object.freeze({
  fast: Object.freeze({ provider: 'deepseek', modelId: 'deepseek/deepseek-v4-flash' }),
  full: Object.freeze({ provider: 'deepseek', modelId: 'deepseek/deepseek-v4-pro' }),
});

// All 6 agent slots that the eval pipeline must seed.
const EVAL_AGENT_IDS = [
  'agent_primary',
  'agent_fix',
  'agent_spec',
  'agent_build',
  'agent_qa',
  'agent_chat',
];

export function loadEvalEnv() {
  dotenv.config({ path: path.join(repoDir, '.env') });
  dotenv.config({ path: path.join(frontendDir, '.env'), override: false });
  // .env.local holds session-only credentials (DEEPSEEK_API_KEY) — in .gitignore, never committed.
  dotenv.config({ path: path.join(repoDir, '.env.local'), override: true });
  dotenv.config({ path: path.join(frontendDir, '.env.local'), override: true });
  dotenv.config({ path: path.join(repoDir, '.env.eval-session'), override: true });
  dotenv.config({ path: path.join(frontendDir, '.env.eval-session'), override: true });
}

/**
 * Reads DEEPSEEK_API_KEY exclusively from process.env (populated by loadEvalEnv from .env.local).
 * NEVER falls back to ConfigService, localStorage, or any browser-side credential store.
 * NEVER writes the key anywhere.
 * Throws immediately if the key is absent so eval runners fail loudly.
 */
export function requireEvalDeepSeekKey(env = process.env) {
  const key = env.DEEPSEEK_API_KEY;
  if (!key) {
    throw new Error(
      'eval requires DEEPSEEK_API_KEY in .env.local (session-only, never committed)',
    );
  }
  return key;
}

/**
 * Hard-fail model guard.
 * provider must be 'deepseek'; modelId must be one of the EVAL_MODELS values.
 * Any other combination → immediate throw. Never silently substitutes a default.
 */
export function assertEvalModelAllowed(provider, modelId) {
  const allowedModels = Object.values(EVAL_MODELS).map((m) => m.modelId);
  if (provider !== 'deepseek' || !allowedModels.includes(modelId)) {
    throw new Error(
      `eval is pinned to deepseek allowlist [${allowedModels.join(', ')}]; refusing provider=${provider} model=${modelId}`,
    );
  }
}

/**
 * Builds a seed plan for all 6 agent slots, choosing the model by suite.
 * Sources the API key ONLY from process.env via requireEvalDeepSeekKey().
 *
 * INVARIANT: does NOT call ConfigService.getProviderKey / setProviderKey / saveKeyToCloud.
 *            Does NOT read or write localStorage, Supabase, or backend defaults.
 *            Eval credentials obtained here cannot reach browser ConfigService paths.
 *
 * modelId is stored in "provider/model" format (e.g. "deepseek/deepseek-v4-pro").
 * The backend (auth-token.ts:887) strips the "deepseek/" prefix for the native endpoint —
 * the runner must NOT pre-strip it.
 */
export function resolveEvalDeepSeekSeedPlan(env = process.env, suite = 'fast') {
  const apiKey = requireEvalDeepSeekKey(env);
  const model = EVAL_MODELS[suite] ?? EVAL_MODELS.fast;
  assertEvalModelAllowed(model.provider, model.modelId);
  return {
    mode: 'eval-deepseek-pinned',
    provider: model.provider,
    apiKey,
    modelId: model.modelId,
    fixModelId: '',
    agentConfigs: Object.fromEntries(
      EVAL_AGENT_IDS.map((agentId) => [
        agentId,
        { provider: model.provider, modelId: model.modelId },
      ]),
    ),
  };
}

export function ensureBrowserGlobals() {
  if (!globalThis.localStorage) {
    const store = new Map();
    globalThis.localStorage = {
      getItem(key) {
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) {
        store.set(String(key), String(value));
      },
      removeItem(key) {
        store.delete(String(key));
      },
      clear() {
        store.clear();
      },
      key(index) {
        return Array.from(store.keys())[index] ?? null;
      },
      get length() {
        return store.size;
      },
    };
  }

  if (!globalThis.window) {
    globalThis.window = globalThis;
  }

  if (!globalThis.window.dispatchEvent) {
    globalThis.window.dispatchEvent = () => true;
  }
  if (!globalThis.window.addEventListener) {
    globalThis.window.addEventListener = () => {};
  }
  if (!globalThis.window.removeEventListener) {
    globalThis.window.removeEventListener = () => {};
  }
  if (!globalThis.location) {
    globalThis.location = new URL('http://127.0.0.1:5173');
  }
  if (!globalThis.window.location) {
    globalThis.window.location = globalThis.location;
  }
}

export function normalizeGateSuite(rawSuite, fallback = 'fast') {
  if (rawSuite === 'smoke') return 'fast';
  if (rawSuite === 'fast' || rawSuite === 'full') return rawSuite;
  return fallback;
}

export function parseCliSuite(defaultSuite = 'fast') {
  const suiteArgIndex = process.argv.findIndex((arg) => arg === '--suite');
  if (suiteArgIndex >= 0) {
    return process.argv[suiteArgIndex + 1] ?? defaultSuite;
  }

  const inlineArg = process.argv.find((arg) => arg.startsWith('--suite='));
  if (inlineArg) {
    return inlineArg.slice('--suite='.length) || defaultSuite;
  }

  return process.env.BENCHMARK_SUITE ?? defaultSuite;
}

export function resolveEvalConfig() {
  const provider = process.env.BENCHMARK_PROVIDER ?? 'openrouter';
  const apiKey = (PROVIDER_ENV_KEYS[provider] ?? []).reduce(
    (value, key) => value || process.env[key] || '',
    '',
  );

  return {
    provider,
    apiKey,
    modelId: process.env.BENCHMARK_MODEL_ID ?? 'openai/gpt-4o-mini',
    fixModelId: process.env.BENCHMARK_FIX_MODEL_ID ?? '',
  };
}

export function readRuntimeAgentConfig() {
  if (!fs.existsSync(runtimeAgentConfigPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(runtimeAgentConfigPath, 'utf8'));
  } catch {
    return null;
  }
}

export function getEnvProviderKeys(env = process.env) {
  return Object.fromEntries(
    Object.entries(PROVIDER_ENV_KEYS)
      .map(([provider, keys]) => {
        const value = keys.reduce((found, key) => found || env[key] || '', '');
        return [provider, value];
      })
      .filter(([, value]) => Boolean(value)),
  );
}

export function resolveEvalSeedPlan(
  env = process.env,
  runtimeConfig = readRuntimeAgentConfig(),
) {
  const hasExplicitRouteOverride = Boolean(
    env.BENCHMARK_PROVIDER || env.BENCHMARK_MODEL_ID || env.BENCHMARK_FIX_MODEL_ID,
  );

  if (!hasExplicitRouteOverride && runtimeConfig && typeof runtimeConfig === 'object') {
    const agentEntries = Object.entries(runtimeConfig)
      .filter(([agentId, config]) => agentId.startsWith('agent_') && config && typeof config === 'object');

    if (agentEntries.length > 0) {
      return {
        mode: 'runtime',
        provider: null,
        apiKey: '',
        modelId: null,
        fixModelId: '',
        agentConfigs: Object.fromEntries(agentEntries),
      };
    }
  }

  const provider = env.BENCHMARK_PROVIDER ?? 'openrouter';
  const modelId = env.BENCHMARK_MODEL_ID ?? 'openai/gpt-4o-mini';
  const fixModelId = env.BENCHMARK_FIX_MODEL_ID ?? '';
  const apiKey = (PROVIDER_ENV_KEYS[provider] ?? []).reduce(
    (value, key) => value || env[key] || '',
    '',
  );

  return {
    mode: 'explicit',
    provider,
    apiKey,
    modelId,
    fixModelId,
    agentConfigs: Object.fromEntries(
      Object.values(SLOT_TO_AGENT).map((agentId) => [
        agentId,
        {
          provider,
          modelId: agentId === 'agent_fix' && fixModelId ? fixModelId : modelId,
        },
      ]),
    ),
  };
}

export function seedBenchmarkConfig({ provider, apiKey, modelId, fixModelId, agentConfigs }) {
  const providerKey = PROVIDER_STORAGE_KEYS[provider];
  if (provider && !providerKey) {
    throw new Error(`[eval] Unsupported BENCHMARK_PROVIDER="${provider}".`);
  }

  if (!localStorage.getItem('SUPABASE_URL')) {
    localStorage.setItem(
      'SUPABASE_URL',
      process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co',
    );
  }
  if (!localStorage.getItem('SUPABASE_ANON_KEY')) {
    localStorage.setItem(
      'SUPABASE_ANON_KEY',
      process.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key',
    );
  }

  Object.entries(getEnvProviderKeys()).forEach(([envProvider, envKey]) => {
    const storageKey = PROVIDER_STORAGE_KEYS[envProvider];
    if (storageKey && envKey) {
      localStorage.setItem(storageKey, envKey);
    }
  });

  if (providerKey && apiKey) {
    localStorage.setItem(providerKey, apiKey);
    if (provider === 'openrouter') {
      localStorage.setItem('OPENROUTER_API_KEY', apiKey);
    }
  }

  if (modelId) {
    localStorage.setItem('SELECTED_MODEL', modelId);
    localStorage.setItem('ENGINE_MODEL_ID', modelId);
  }

  Object.entries(agentConfigs ?? {}).forEach(([agentId, config]) => {
    localStorage.setItem(
      `AGENT_CONFIG_${agentId}`,
      JSON.stringify(config),
    );
    localStorage.setItem(
      `AGENT_CONFIG_${agentId}__source`,
      provider ? 'user_set' : 'backend_runtime_saved',
    );
  });

  // TRANSPORT INVARIANT: activate dev-bypass so LLMProxy routes ALL eval LLM
  // calls through directLLMRequest (LLMProxy.ts:125-126), bypassing the
  // Supabase edge function entirely. This eliminates the "401 User not found"
  // root cause (stale JWT on deleted user) and removes the Supabase session
  // dependency for eval runs. Requires hostname 127.0.0.1 (set by
  // ensureBrowserGlobals) + this flag being '1'.
  localStorage.setItem('AIC_DEV_AUTH_BYPASS', '1');
}

// ── Backend URL (configurable for CI / remote environments) ──────────────────

/**
 * Backend URL read from env. Defaulting to localhost:3000 for local dev.
 * Override via EVAL_BACKEND_URL (e.g. "http://ci-host:3001") to run eval
 * against a remote or differently-ported backend without touching this code.
 */
export const EVAL_BACKEND_URL = process.env.EVAL_BACKEND_URL ?? 'http://127.0.0.1:3000';

/**
 * Patch globalThis.fetch so that relative URLs (e.g. "/api/preview/…") resolve
 * against EVAL_BACKEND_URL. ProtoPipeline uses relative fetch in browser
 * context; in Node.js eval the URL must be absolute. The structural layer
 * (headless, no backend) does not call fetch at all — this patch only matters
 * for the E2E layer.
 *
 * Safe to call multiple times; each call wraps the current fetch exactly once.
 */
export function patchFetchForEval(backendUrl = EVAL_BACKEND_URL) {
  const normalized = backendUrl.replace(/\/$/, '');
  const original = globalThis.fetch;
  globalThis.fetch = function patchedFetch(input, init) {
    const rawUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : (input && typeof input === 'object' && 'url' in input)
          ? input.url
          : String(input);
    if (typeof rawUrl === 'string' && rawUrl.startsWith('/')) {
      const absolute = normalized + rawUrl;
      const newInput = typeof input === 'string' ? absolute : new Request(absolute, input);
      return original.call(this, newInput, init);
    }
    return original.call(this, input, init);
  };
}

/**
 * Start the backend server and wait until it accepts requests.
 *
 * The port is read from EVAL_BACKEND_URL (or EVAL_BACKEND_PORT as a fallback).
 * The backend process receives BACKEND_PORT so auth-token.ts listens on the
 * same port this function probes.
 *
 * Returns { url, stop }:
 *   url  — the absolute backend URL (identical to EVAL_BACKEND_URL/default)
 *   stop — call to send SIGTERM and wait for exit (max 5 s)
 *
 * Throws if the backend does not become ready within timeoutMs (default 30 s).
 */
export async function startEvalBackend(opts = {}) {
  const { spawn } = await import('child_process');
  const url = opts.url ?? EVAL_BACKEND_URL;
  const parsed = new URL(url);
  const port = opts.port ?? parseInt(process.env.EVAL_BACKEND_PORT ?? parsed.port ?? '3000', 10);
  const timeoutMs = opts.timeoutMs ?? 30_000;

  // Direct tsx invocation: node <tsx-cli> backend/auth-token.ts
  // Avoids shell entirely → no .cmd extension (Windows EINVAL) and clean SIGTERM on all platforms.
  // tsx ships dist/cli.mjs which can be run with process.execPath (the local node binary).
  const tsxSearchBases = [repoDir, frontendDir];
  let tsxCliPath = null;
  for (const base of tsxSearchBases) {
    const candidate = path.join(base, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    if (fs.existsSync(candidate)) { tsxCliPath = candidate; break; }
  }
  if (!tsxCliPath) {
    throw new Error(
      '[eval:backend] tsx not found in node_modules. ' +
      `Searched: ${tsxSearchBases.map(b => path.join(b, 'node_modules/tsx')).join(', ')}. ` +
      'Add tsx to devDependencies or run `npm install tsx` in the project root.',
    );
  }

  const backendEntry = path.join(repoDir, 'backend', 'auth-token.ts');
  const proc = spawn(
    process.execPath,          // local node binary — no .cmd, no shell, cross-platform
    [tsxCliPath, backendEntry],
    {
      cwd: repoDir,
      env: { ...process.env, BACKEND_PORT: String(port) },
      stdio: 'pipe',
    },
  );

  proc.on('error', (err) => {
    // Hard error: if spawn itself fails, re-throw so the caller sees it immediately.
    console.error(`[eval:backend] spawn failed: ${err.message}`);
  });

  // Probe healthcheck: GET /api/preview/eval-probe/status returns 404 JSON when
  // the server is up (build not found), which is fine — it proves the server
  // is listening. Any non-network error means it's up.
  const probeUrl = `${url.replace(/\/$/, '')}/api/preview/eval-probe/status`;
  const started = Date.now();
  let ready = false;

  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const resp = await fetch(probeUrl);
      // 404 = server up but build unknown — exactly what we expect
      if (resp.status === 404 || resp.ok) { ready = true; break; }
    } catch {
      // ECONNREFUSED → server not up yet, keep polling
    }
  }

  if (!ready) {
    proc.kill('SIGTERM');
    throw new Error(
      `[eval:backend] Backend did not become ready within ${timeoutMs}ms on ${url}. ` +
      'Ensure the backend compiles and port is not occupied.',
    );
  }

  console.log(`[eval:backend] Ready at ${url} (pid=${proc.pid} port=${port} tsx=${tsxCliPath})`);

  function stop() {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => { proc.kill('SIGKILL'); resolve(); }, 5_000);
      proc.once('exit', () => { clearTimeout(timeout); resolve(); });
      proc.kill('SIGTERM');
    });
  }

  return { url, stop };
}

export async function importFrontendModule(relativePath) {
  return import(pathToFileURL(path.join(frontendDir, relativePath)).href);
}

export function ensureArtifactDir() {
  fs.mkdirSync(artifactDir, { recursive: true });
}

export function baselineArtifactPath(suite) {
  return path.join(artifactDir, `benchmark.${suite}.baseline.json`);
}

export function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
