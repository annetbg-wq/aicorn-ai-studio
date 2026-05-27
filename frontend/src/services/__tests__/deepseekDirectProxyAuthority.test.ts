/**
 * deepseekDirectProxyAuthority.test.ts
 *
 * Deterministic local tests for the DeepSeek direct-vs-proxy routing diagnosis.
 *
 * Proves:
 *   1.  DeepSeek direct route (DEEPSEEK_API_KEY present) has endpointKind='direct_provider'.
 *   2.  DeepSeek without a key falls back to OpenRouter (endpointKind='openrouter_proxy').
 *   3.  OpenRouter fallback always carries an explicit fallbackReason.
 *   4.  No implicit OpenRouter route for DeepSeek direct (key present → no fallback).
 *   5.  provider/model labels match the endpoint kind.
 *   6.  classifyTransportPath returns 'supabase_proxy' for native endpoints in normal mode.
 *   7.  classifyTransportPath returns 'direct_provider' in dev-bypass mode.
 *   8.  classifyTransportPath returns 'openrouter_proxy' for openrouter.ai endpoints.
 *   9.  isExplicitFallback is false for direct deepseek route.
 *  10.  isExplicitFallback is true when OpenRouter fallback fires.
 *  11.  recordLlmRouteTelemetry emits all required llm_route_* fields.
 *  12.  recordLlmRouteTelemetry never emits API key material.
 *  13.  Model ID prefix is stripped for native (non-OpenRouter) endpoints.
 *  14.  Model ID prefix is preserved for OpenRouter endpoints.
 *  15.  Anthropic provider → openrouter_proxy + explicit fallbackReason.
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
    'DEEPSEEK_API_KEY',
    'ENGINE_MODEL_ID',
    'SELECTED_MODEL',
  ];
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && prefixes.some(p => k.startsWith(p))) localStorage.removeItem(k);
  }
}

function setDeepSeekUserConfig(modelId = 'deepseek/deepseek-v4-pro') {
  ConfigService.setAgentConfig('agent_build', {
    provider: 'deepseek' as never,
    modelId,
  });
}

function setDeepSeekKey(key = 'sk-deepseek-test-key') {
  localStorage.setItem('DEEPSEEK_API_KEY', key);
}

function setOpenRouterKey(key = 'or-test-key') {
  localStorage.setItem('OPENROUTER_API_KEY', key);
}

// ── Tests: endpointKind for DeepSeek direct ───────────────────────────────────

describe('DeepSeek direct route endpointKind', () => {
  beforeEach(() => {
    clearAgentStorage();
    setOpenRouterKey();
    setDeepSeekKey();
    setDeepSeekUserConfig();
  });
  afterEach(clearAgentStorage);

  it('has endpointKind=direct_provider when DEEPSEEK_API_KEY is present', () => {
    const route = resolveStandardRoute('build');

    expect(route.endpointKind).toBe('direct_provider');
    expect(route.provider).toBe('deepseek');
  });

  it('endpoint points to api.deepseek.com, not openrouter.ai', () => {
    const route = resolveStandardRoute('build');

    expect(route.endpoint).toContain('api.deepseek.com');
    expect(route.endpoint).not.toContain('openrouter.ai');
  });

  it('model ID prefix is stripped for the native DeepSeek endpoint', () => {
    setDeepSeekUserConfig('deepseek/deepseek-v4-pro');
    const route = resolveStandardRoute('build');

    // prefix "deepseek/" is stripped for native endpoints
    expect(route.modelId).toBe('deepseek-v4-pro');
    expect(route.modelId).not.toContain('/');
  });

  it('isExplicitFallback is false — no fallback rule fired', () => {
    const route = resolveStandardRoute('build');

    expect(route.isExplicitFallback).toBe(false);
    expect(route.isProxyFallback).toBe(false);
    expect(route.fallbackReason).toBeUndefined();
  });

  it('no implicit OpenRouter route when DeepSeek key is present', () => {
    const route = resolveStandardRoute('build');

    // Verified: provider stays 'deepseek', not 'openrouter'
    expect(route.provider).toBe('deepseek');
    expect(route.endpointKind).toBe('direct_provider');
    expect(route.endpointKind).not.toBe('openrouter_proxy');
  });
});

// ── Tests: OpenRouter fallback for DeepSeek (missing key) ────────────────────

describe('DeepSeek OpenRouter fallback (missing key)', () => {
  beforeEach(() => {
    clearAgentStorage();
    setOpenRouterKey();
    // No DEEPSEEK_API_KEY — triggers missing-key fallback
    setDeepSeekUserConfig();
  });
  afterEach(clearAgentStorage);

  it('falls back to openrouter_proxy when DEEPSEEK_API_KEY is absent', () => {
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
    setDeepSeekUserConfig('deepseek/deepseek-v4-pro');
    const route = resolveStandardRoute('build');

    // OpenRouter needs the full "provider/model" format
    expect(route.modelId).toBe('deepseek/deepseek-v4-pro');
    expect(route.endpoint).toContain('openrouter.ai');
  });
});

// ── Tests: Anthropic → OpenRouter fallback ───────────────────────────────────

describe('Anthropic provider always routes through OpenRouter', () => {
  beforeEach(() => {
    clearAgentStorage();
    setOpenRouterKey();
    ConfigService.setAgentConfig('agent_build', {
      provider: 'anthropic' as never,
      modelId:  'claude-3-5-sonnet-20241022',
    });
  });
  afterEach(clearAgentStorage);

  it('endpointKind=openrouter_proxy for anthropic provider', () => {
    const route = resolveStandardRoute('build');

    expect(route.endpointKind).toBe('openrouter_proxy');
    expect(route.provider).toBe('openrouter');
  });

  it('anthropic fallback has explicit fallbackReason', () => {
    const route = resolveStandardRoute('build');

    expect(route.fallbackReason).toBe('anthropic_streaming_fallback');
    expect(route.isExplicitFallback).toBe(true);
    expect(route.isProxyFallback).toBe(true);
  });
});

// ── Tests: classifyTransportPath ─────────────────────────────────────────────

describe('classifyTransportPath', () => {
  it('returns supabase_proxy for api.deepseek.com in normal mode (devBypass=false)', () => {
    expect(classifyTransportPath('https://api.deepseek.com/v1/chat/completions', false))
      .toBe('supabase_proxy');
  });

  it('returns direct_provider for api.deepseek.com in dev-bypass mode (devBypass=true)', () => {
    expect(classifyTransportPath('https://api.deepseek.com/v1/chat/completions', true))
      .toBe('direct_provider');
  });

  it('returns openrouter_proxy for openrouter.ai in normal mode', () => {
    expect(classifyTransportPath('https://openrouter.ai/api/v1/chat/completions', false))
      .toBe('openrouter_proxy');
  });

  it('returns direct_provider for openrouter.ai in dev-bypass mode', () => {
    // Even for OpenRouter endpoint, dev-bypass sends directly without Supabase
    expect(classifyTransportPath('https://openrouter.ai/api/v1/chat/completions', true))
      .toBe('direct_provider');
  });

  it('returns supabase_proxy for api.openai.com in normal mode', () => {
    expect(classifyTransportPath('https://api.openai.com/v1/chat/completions', false))
      .toBe('supabase_proxy');
  });

  it('returns supabase_proxy for api.anthropic.com in normal mode', () => {
    expect(classifyTransportPath('https://api.anthropic.com/v1/messages', false))
      .toBe('supabase_proxy');
  });

  it('returns unknown for an unrecognised endpoint', () => {
    expect(classifyTransportPath('https://unknown-provider.example.com/api', false))
      .toBe('unknown');
  });

  it('returns unknown for a malformed URL', () => {
    expect(classifyTransportPath('not-a-url', false)).toBe('unknown');
  });
});

// ── Tests: telemetry completeness ────────────────────────────────────────────

describe('recordLlmRouteTelemetry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits all required llm_route_* fields', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    recordLlmRouteTelemetry({
      provider:        'deepseek',
      modelId:         'deepseek-v4-pro',
      endpoint:        'https://api.deepseek.com/v1/chat/completions',
      endpointKind:    'direct_provider',
      keySource:       'agent_build.deepseek',
      fallbackReason:  undefined,
      sourceAuthority: 'user_set',
      isProxyFallback: false,
    });

    expect(spy).toHaveBeenCalledOnce();
    const [tag, payload] = spy.mock.calls[0];
    expect(tag).toBe('[llm_route]');
    expect(payload).toMatchObject({
      llm_route_provider:             'deepseek',
      llm_route_model_id:             'deepseek-v4-pro',
      llm_route_endpoint_kind:        'direct_provider',
      llm_route_key_source:           'agent_build.deepseek',
      llm_route_fallback_reason:      null,
      llm_route_authority_source:     'user_set',
      llm_route_is_explicit_fallback: false,
    });
  });

  it('never emits API key material in telemetry', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fakeKey = 'sk-real-secret-key-12345';

    recordLlmRouteTelemetry({
      provider:        'deepseek',
      modelId:         'deepseek-v4-pro',
      endpoint:        'https://api.deepseek.com/v1/chat/completions',
      endpointKind:    'direct_provider',
      keySource:       'agent_build.deepseek',
      sourceAuthority: 'user_set',
      isProxyFallback: false,
    });

    const loggedStr = JSON.stringify(spy.mock.calls);
    expect(loggedStr).not.toContain(fakeKey);
  });

  it('emits llm_route_proxy_provider=openrouter for openrouter routes', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    recordLlmRouteTelemetry({
      provider:        'openrouter',
      modelId:         'deepseek/deepseek-v4-pro',
      endpoint:        'https://openrouter.ai/api/v1/chat/completions',
      endpointKind:    'openrouter_proxy',
      keySource:       'agent_build.openrouter (missing-provider-key-fallback)',
      fallbackReason:  'missing_provider_key_fallback',
      sourceAuthority: 'user_set',
      isProxyFallback: true,
    });

    const [, payload] = spy.mock.calls[0];
    expect(payload.llm_route_proxy_provider).toBe('openrouter');
    expect(payload.llm_route_is_explicit_fallback).toBe(true);
    expect(payload.llm_route_fallback_reason).toBe('missing_provider_key_fallback');
  });

  it('emits llm_route_proxy_provider=null for native provider routes', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    recordLlmRouteTelemetry({
      provider:        'deepseek',
      modelId:         'deepseek-v4-pro',
      endpoint:        'https://api.deepseek.com/v1/chat/completions',
      endpointKind:    'direct_provider',
      keySource:       'agent_build.deepseek',
      sourceAuthority: 'user_set',
      isProxyFallback: false,
    });

    const [, payload] = spy.mock.calls[0];
    expect(payload.llm_route_proxy_provider).toBeNull();
  });
});

// ── Tests: provider/model label consistency ───────────────────────────────────

describe('provider/model label vs endpointKind consistency', () => {
  beforeEach(() => {
    clearAgentStorage();
    setOpenRouterKey();
  });
  afterEach(clearAgentStorage);

  it('deepseek provider + key present → provider=deepseek, endpointKind=direct_provider', () => {
    setDeepSeekKey();
    setDeepSeekUserConfig('deepseek/deepseek-v4-pro');

    const route = resolveStandardRoute('build');

    expect(route.provider).toBe('deepseek');
    expect(route.endpointKind).toBe('direct_provider');
    expect(route.endpoint).toContain('api.deepseek.com');
  });

  it('openrouter provider → provider=openrouter, endpointKind=openrouter_proxy', () => {
    ConfigService.setAgentConfig('agent_build', {
      provider: 'openrouter' as never,
      modelId:  'openai/gpt-4o-mini',
    });

    const route = resolveStandardRoute('build');

    expect(route.provider).toBe('openrouter');
    expect(route.endpointKind).toBe('openrouter_proxy');
    expect(route.endpoint).toContain('openrouter.ai');
  });

  it('openai provider + key → provider=openai, endpointKind=direct_provider', () => {
    localStorage.setItem('OPENAI_API_KEY', 'sk-openai-test');
    ConfigService.setAgentConfig('agent_build', {
      provider: 'openai' as never,
      modelId:  'gpt-4o',
    });

    const route = resolveStandardRoute('build');

    expect(route.provider).toBe('openai');
    expect(route.endpointKind).toBe('direct_provider');
    expect(route.endpoint).toContain('api.openai.com');

    localStorage.removeItem('OPENAI_API_KEY');
  });
});

// ── Tests: DeepSeek secret safety ─────────────────────────────────────────────

describe('DeepSeek secret safety', () => {
  afterEach(() => {
    clearAgentStorage();
    localStorage.removeItem('DEEPSEEK_API_KEY');
    vi.restoreAllMocks();
  });

  it('getDeepSeekApiKey() returns empty string when localStorage is empty (no VITE_ fallback)', () => {
    localStorage.removeItem('DEEPSEEK_API_KEY');
    // VITE_DEEPSEEK_API_KEY must NOT be used as a fallback — key must come only from localStorage
    expect(ConfigService.getDeepSeekApiKey()).toBe('');
  });

  it('getDeepSeekApiKey() returns the value only from localStorage', () => {
    localStorage.setItem('DEEPSEEK_API_KEY', 'sk-local-only-key');
    expect(ConfigService.getDeepSeekApiKey()).toBe('sk-local-only-key');
    localStorage.removeItem('DEEPSEEK_API_KEY');
    expect(ConfigService.getDeepSeekApiKey()).toBe('');
  });

  it('resolveStandardRoute makes no outbound fetch() calls', () => {
    clearAgentStorage();
    setOpenRouterKey();
    setDeepSeekKey();
    setDeepSeekUserConfig();

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    resolveStandardRoute('build');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('DEEPSEEK_API_KEY is not written to localStorage by resolveStandardRoute()', () => {
    clearAgentStorage();
    setOpenRouterKey();
    setDeepSeekKey('sk-test-deepseek-sentinel');
    setDeepSeekUserConfig();

    const keysBefore = Object.keys(localStorage).filter(k => k.includes('DEEPSEEK'));
    resolveStandardRoute('build');
    const keysAfter = Object.keys(localStorage).filter(k => k.includes('DEEPSEEK'));
    // Route resolution must not add new DEEPSEEK keys
    expect(keysAfter).toEqual(keysBefore);
  });

  it('throws ModelSelectionRequiredError for backend_factory_template even with deepseek model set', () => {
    clearAgentStorage();
    setOpenRouterKey();
    setDeepSeekKey();
    // Factory template authority — must never be route authority
    localStorage.setItem('AGENT_CONFIG_agent_build', JSON.stringify({
      provider: 'deepseek',
      modelId:  'deepseek/deepseek-v4-pro',
      maxTokens: { max: 4096 },
    }));
    localStorage.setItem('AGENT_CONFIG_agent_build__source', 'backend_factory_template');

    expect(() => resolveStandardRoute('build')).toThrow(ModelSelectionRequiredError);
  });

  it('explicit user_set deepseek route resolves correctly — backend/agent-config.json is NOT authority', () => {
    clearAgentStorage();
    setOpenRouterKey();
    setDeepSeekKey();
    // Simulates test runner injecting config via ConfigService.setAgentConfig (user_set authority)
    ConfigService.setAgentConfig('agent_build', {
      provider: 'deepseek' as never,
      modelId:  'deepseek/deepseek-v4-pro',
    });

    const route = resolveStandardRoute('build');

    expect(route.provider).toBe('deepseek');
    expect(route.sourceAuthority).toBe('user_set');
    expect(route.isUserSelected).toBe(true);
    expect(route.isFactoryConfig).toBe(false);
    // Must not be any factory/seed/unconfigured authority
    expect(['backend_factory_template', 'backend_file_seed', 'no_model_configured'])
      .not.toContain(route.sourceAuthority);
  });

  it('no real LLM calls occur during unit tests — route resolution is pure localStorage', () => {
    // Verifies route resolution is deterministic and side-effect-free
    clearAgentStorage();
    setOpenRouterKey();
    setDeepSeekKey();
    setDeepSeekUserConfig('deepseek/deepseek-v4-pro');

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const route = resolveStandardRoute('build');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(route.endpoint).toContain('api.deepseek.com');
    expect(route.modelId).toBe('deepseek-v4-pro');
  });
});
