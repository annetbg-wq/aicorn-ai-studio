import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const frontendDir = path.resolve(__dirname, '..');
export const repoDir = path.resolve(frontendDir, '..');
export const artifactDir = path.join(repoDir, 'artifacts', 'eval-baselines');

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
  build: 'agent_build',
  fix: 'agent_fix',
  qa: 'agent_qa',
};

export function loadEvalEnv() {
  dotenv.config({ path: path.join(repoDir, '.env') });
  dotenv.config({ path: path.join(frontendDir, '.env'), override: false });
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

export function seedBenchmarkConfig({ provider, apiKey, modelId, fixModelId }) {
  const providerKey = PROVIDER_STORAGE_KEYS[provider];
  if (!providerKey) {
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

  localStorage.setItem(providerKey, apiKey);
  if (provider === 'openrouter') {
    localStorage.setItem('OPENROUTER_API_KEY', apiKey);
  }

  localStorage.setItem('SELECTED_MODEL', modelId);
  localStorage.setItem('ENGINE_MODEL_ID', modelId);

  Object.entries(SLOT_TO_AGENT).forEach(([slot, agentId]) => {
    const slotModelId = slot === 'fix' && fixModelId ? fixModelId : modelId;
    localStorage.setItem(
      `AGENT_CONFIG_${agentId}`,
      JSON.stringify({ provider, modelId: slotModelId }),
    );
    localStorage.setItem(`AGENT_CONFIG_${agentId}__source`, 'user_set');
  });
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
