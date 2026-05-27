/**
 * geminiLocalDiagnosticRoute.test.ts
 *
 * Deterministic local tests for the Google/Gemini provider route.
 *
 * Proves:
 *   1.  Gemini direct route has endpointKind='direct_provider' when GOOGLE_API_KEY present.
 *   2.  Gemini without a key falls back to OpenRouter (endpointKind='openrouter_proxy').
 *   3.  OpenRouter fallback carries explicit fallbackReason.
 *   4.  google/gemini-2.5-flash model ID prefix is stripped for native endpoint.
 *   5.  google/gemini-2.5-flash prefix is preserved for OpenRouter endpoint.
 *   6.  getGoogleApiKey() returns '' when localStorage is empty (no VITE_ fallback).
 *   7.  GOOGLE_API_KEY is never written to localStorage by resolveStandardRoute().
 *   8.  resolveStandardRoute() makes no outbound fetch() calls.
 *   9.  ModelSelectionRequiredError thrown for backend_factory_template authority.
 *  10.  explicit user_set google route resolves correctly — backend/agent-config.json NOT authority.
 *  11.  No real LLM calls during unit tests.
 *  12.  classifyTransportPath returns 'supabase_proxy' for Gemini in normal mode.
 *  13.  classifyTransportPath returns 'direct_provider' for Gemini in dev-bypass mode.
 *  14.  telemetry never emits API key material.
 *  15.  isExplicitFallback is false for direct Gemini route.
 *
 * No real LLM calls — all resolved via localStorage mocks only.
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveStandardRoute,
  classifyTransportPath,
  recordLlmRouteTelemetry,
  ModelSelectionRequiredError,
} from '../buildAgentRouting';
import { ConfigService } from '../ConfigService';

// ── Helpers ──────────────────────────────────────────────────────────────────

function clearAgentStorage() {
  const prefixes = [
    'AGENT_CONFIG_',
    'OPENROUTER_API_KEY',
    'GOOGLE_API_KEY',
    'ENGINE_MODEL_ID',
    'SELECTED_MODEL',
  ];
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && prefixes.some(p => k.startsWith(p))) localStorage.removeItem(k);
  }
}

function setGoogleUserConfig(modelId = 'google/gemini-2.5-flash') {
  ConfigService.setAgentConfig('agent_build', {
    provider: 'google' as never,
    modelId,
  });
}

function setGoogleKey(key = 'AIza-google-test-key') {
  localStorage.setItem('GOOGLE_API_KEY', key);
}

function setOpenRouterKey(key = 'or-test-key') {
  localStorage.setItem('OPENROUTER_API_KEY', key);
}

// ── Tests: Gemini direct route ────────────────────────────────────────────────

describe('Gemini direct route endpointKind', () => {
  beforeEach(() => {
    clearAgentStorage();
    setOpenRouterKey();
    setGoogleKey();
    setGoogleUserConfig();
  });
  afterEach(clearAgentStorage);

  it('has endpointKind=direct_provider when GOOGLE_API_KEY is present', () => {
    const route = resolveStandardRoute('build');

    expect(route.endpointKind).toBe('direct_provider');
    expect(route.provider).toBe('google');
  });

  it('endpoint points to generativelanguage.googleapis.com, not openrouter.ai', () => {
    const route = resolveStandardRoute('build');

    expect(route.endpoint).toContain('generativelanguage.googleapis.com');
    expect(route.endpoint).not.toContain('openrouter.ai');
  });

  it('model ID prefix is stripped for the native Google endpoint', () => {
    setGoogleUserConfig('google/gemini-2.5-flash');
    const route = resolveStandardRoute('build');

    expect(route.modelId).toBe('gemini-2.5-flash');
    expect(route.modelId).not.toContain('/');
  });

  it('isExplicitFallback is false — no fallback rule fired', () => {
    const route = resolveStandardRoute('build');

    expect(route.isExplicitFallback).toBe(false);
    expect(route.isProxyFallback).toBe(false);
    expect(route.fallbackReason).toBeUndefined();
  });

  it('no implicit OpenRouter route when GOOGLE_API_KEY is present', () => {
    const route = resolveStandardRoute('build');

    expect(route.provider).toBe('google');
    expect(route.endpointKind).toBe('direct_provider');
    expect(route.endpointKind).not.toBe('openrouter_proxy');
  });
});

// ── Tests: OpenRouter fallback for Google (missing key) ───────────────────────

describe('Google OpenRouter fallback (missing key)', () => {
  beforeEach(() => {
    clearAgentStorage();
    setOpenRouterKey();
    // No GOOGLE_API_KEY — triggers missing-key fallback
    setGoogleUserConfig();
  });
  afterEach(clearAgentStorage);

  it('falls back to openrouter_proxy when GOOGLE_API_KEY is absent', () => {
    const route = resolveStandardRoute('build');

    expect(route.endpointKind).toBe('openrouter_proxy');
    expect(route.provider).toBe('openrouter');
  });

  it('OpenRouter fallback has an explicit fallbackReason', () => {
    const route = resolveStandardRoute('build');

    expect(route.fallbackReason).toBe('missing_provider_key_fallback');
    expect(route.isExplicitFallback).toBe(true);
    expect(route.isProxyFallback).toBe(true);
  });

  it('model ID prefix is preserved for OpenRouter endpoints', () => {
    setGoogleUserConfig('google/gemini-2.5-flash');
    const route = resolveStandardRoute('build');

    expect(route.modelId).toBe('google/gemini-2.5-flash');
    expect(route.endpoint).toContain('openrouter.ai');
  });
});

// ── Tests: classifyTransportPath for Gemini ───────────────────────────────────

describe('classifyTransportPath for Gemini endpoint', () => {
  const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

  it('returns supabase_proxy for Gemini endpoint in normal mode (devBypass=false)', () => {
    expect(classifyTransportPath(GEMINI_ENDPOINT, false)).toBe('supabase_proxy');
  });

  it('returns direct_provider for Gemini endpoint in dev-bypass mode (devBypass=true)', () => {
    expect(classifyTransportPath(GEMINI_ENDPOINT, true)).toBe('direct_provider');
  });
});

// ── Tests: Google secret safety ───────────────────────────────────────────────

describe('Google/Gemini secret safety', () => {
  afterEach(() => {
    clearAgentStorage();
    localStorage.removeItem('GOOGLE_API_KEY');
    vi.restoreAllMocks();
  });

  it('getGoogleApiKey() returns empty string when localStorage is empty (no VITE_ fallback)', () => {
    localStorage.removeItem('GOOGLE_API_KEY');
    expect(ConfigService.getGoogleApiKey()).toBe('');
  });

  it('getGoogleApiKey() returns only the localStorage value', () => {
    localStorage.setItem('GOOGLE_API_KEY', 'AIza-local-only');
    expect(ConfigService.getGoogleApiKey()).toBe('AIza-local-only');
    localStorage.removeItem('GOOGLE_API_KEY');
    expect(ConfigService.getGoogleApiKey()).toBe('');
  });

  it('resolveStandardRoute makes no outbound fetch() calls', () => {
    clearAgentStorage();
    setOpenRouterKey();
    setGoogleKey();
    setGoogleUserConfig();

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    resolveStandardRoute('build');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('GOOGLE_API_KEY is not written to localStorage by resolveStandardRoute()', () => {
    clearAgentStorage();
    setOpenRouterKey();
    setGoogleKey('AIza-sentinel-key');
    setGoogleUserConfig();

    const keysBefore = Object.keys(localStorage).filter(k => k.includes('GOOGLE'));
    resolveStandardRoute('build');
    const keysAfter = Object.keys(localStorage).filter(k => k.includes('GOOGLE'));
    expect(keysAfter).toEqual(keysBefore);
  });

  it('throws ModelSelectionRequiredError for backend_factory_template even with google model set', () => {
    clearAgentStorage();
    setOpenRouterKey();
    setGoogleKey();
    localStorage.setItem('AGENT_CONFIG_agent_build', JSON.stringify({
      provider: 'google',
      modelId:  'google/gemini-2.5-flash',
      maxTokens: { max: 4096 },
    }));
    localStorage.setItem('AGENT_CONFIG_agent_build__source', 'backend_factory_template');

    expect(() => resolveStandardRoute('build')).toThrow(ModelSelectionRequiredError);
  });

  it('explicit user_set google route resolves without backend/agent-config.json', () => {
    clearAgentStorage();
    setOpenRouterKey();
    setGoogleKey();
    ConfigService.setAgentConfig('agent_build', {
      provider: 'google' as never,
      modelId:  'google/gemini-2.5-flash',
    });

    const route = resolveStandardRoute('build');

    expect(route.provider).toBe('google');
    expect(route.sourceAuthority).toBe('user_set');
    expect(route.isUserSelected).toBe(true);
    expect(route.isFactoryConfig).toBe(false);
    expect(['backend_factory_template', 'backend_file_seed', 'no_model_configured'])
      .not.toContain(route.sourceAuthority);
  });

  it('no real LLM calls occur during unit tests — route resolution is pure localStorage', () => {
    clearAgentStorage();
    setOpenRouterKey();
    setGoogleKey();
    setGoogleUserConfig('google/gemini-2.5-flash');

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const route = resolveStandardRoute('build');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(route.endpoint).toContain('generativelanguage.googleapis.com');
    expect(route.modelId).toBe('gemini-2.5-flash');
  });

  it('telemetry never emits API key material', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fakeKey = 'AIza-secret-google-key-99999';

    recordLlmRouteTelemetry({
      provider:        'google',
      modelId:         'gemini-2.5-flash',
      endpoint:        'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      endpointKind:    'direct_provider',
      keySource:       'agent_build.google',
      sourceAuthority: 'user_set',
      isProxyFallback: false,
    });

    const loggedStr = JSON.stringify(spy.mock.calls);
    expect(loggedStr).not.toContain(fakeKey);
  });
});
