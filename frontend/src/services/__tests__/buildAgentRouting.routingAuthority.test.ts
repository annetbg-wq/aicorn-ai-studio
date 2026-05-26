/**
 * buildAgentRouting.routingAuthority.test.ts
 *
 * Deterministic tests for routing authority diagnosis.
 *
 * Proves:
 *   1. User-set build route wins over backend factory config (file-seed).
 *   2. backend/agent-config.json seeded value is labelled 'backend_file_seed',
 *      not 'user_set'.
 *   3. backend/agent-config.json is NOT treated as user-selected authority.
 *   4. When the user has no config, primary-slot fallback is labelled correctly.
 *   5. Fallback reason is explicit when a routing fallback rule fires.
 *   6. No silent switch to another provider/model without fallbackReason.
 *   7. Coder route telemetry includes provider / model / source authority.
 *   8. No real LLM calls — all mocked via localStorage only.
 *   9. sourceAuthority is 'no_model_configured' when nothing is set.
 *  10. isRuntimeConfig is true only for backend_file_seed authority.
 *  11. isUserSelected is true only for user_set authority.
 *  12. isProxyFallback mirrors whether a fallback rule was triggered.
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveStandardRoute } from '../buildAgentRouting';
import { ConfigService } from '../ConfigService';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Wipe every key written by ConfigService so tests start isolated. */
function clearAgentStorage() {
  const prefixes = ['AGENT_CONFIG_', 'OPENROUTER_API_KEY', 'ENGINE_MODEL_ID', 'SELECTED_MODEL'];
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && prefixes.some(p => k.startsWith(p))) localStorage.removeItem(k);
  }
}

function setUserConfig(agentId: string, modelId: string, provider = 'openrouter') {
  // Simulate what ConfigService.setAgentConfig does (writes config + user_set marker).
  ConfigService.setAgentConfig(agentId, { provider: provider as never, modelId });
}

function setFileSeedConfig(agentId: string, modelId: string, provider = 'openrouter') {
  // Simulate what ConfigService.loadFromBackend does when seeding an empty slot.
  localStorage.setItem(`AGENT_CONFIG_${agentId}`, JSON.stringify({ provider, modelId }));
  localStorage.setItem(`AGENT_CONFIG_${agentId}__source`, 'backend_file_seed');
}

function setOpenRouterKey(key: string) {
  localStorage.setItem('OPENROUTER_API_KEY', key);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('routing authority: user_set wins over backend_file_seed', () => {
  beforeEach(() => {
    clearAgentStorage();
    setOpenRouterKey('or-test-key');
  });
  afterEach(clearAgentStorage);

  it('returns user_set authority when user explicitly configured the build slot', () => {
    setUserConfig('agent_build', 'openai/gpt-4o', 'openrouter');

    const route = resolveStandardRoute('build');

    expect(route.sourceAuthority).toBe('user_set');
    expect(route.isUserSelected).toBe(true);
    expect(route.isRuntimeConfig).toBe(false);
    expect(route.modelId).toBe('openai/gpt-4o');
  });

  it('returns backend_file_seed authority when slot was seeded from agent-config.json', () => {
    setFileSeedConfig('agent_build', 'xiaomi/mimo-v2-pro', 'openrouter');

    const route = resolveStandardRoute('build');

    expect(route.sourceAuthority).toBe('backend_file_seed');
    expect(route.isUserSelected).toBe(false);
    expect(route.isRuntimeConfig).toBe(true);
    expect(route.modelId).toBe('xiaomi/mimo-v2-pro');
  });

  it('user_set authority overrides backend_file_seed when both are present', () => {
    // File seed first — simulates startup
    setFileSeedConfig('agent_build', 'xiaomi/mimo-v2-pro', 'openrouter');
    // User then changes via Settings UI — overwrites file seed
    setUserConfig('agent_build', 'deepseek/deepseek-coder', 'openrouter');

    const route = resolveStandardRoute('build');

    expect(route.sourceAuthority).toBe('user_set');
    expect(route.isUserSelected).toBe(true);
    expect(route.isRuntimeConfig).toBe(false);
    expect(route.modelId).toBe('deepseek/deepseek-coder');
  });
});

describe('routing authority: backend/agent-config.json is not treated as user-selected', () => {
  beforeEach(() => {
    clearAgentStorage();
    setOpenRouterKey('or-test-key');
  });
  afterEach(clearAgentStorage);

  it('file-seeded model is NOT treated as user selection', () => {
    // Simulate the exact scenario from the long-observation report:
    // backend/agent-config.json has xiaomi/mimo-v2-pro for agent_build.
    setFileSeedConfig('agent_build', 'xiaomi/mimo-v2-pro', 'openrouter');

    const route = resolveStandardRoute('build');

    expect(route.isUserSelected).toBe(false);
    expect(route.sourceAuthority).not.toBe('user_set');
    expect(route.isRuntimeConfig).toBe(true);
    expect(route.sourceAuthority).toBe('backend_file_seed');
  });
});

describe('routing authority: fallbacks are explicit and labelled', () => {
  beforeEach(() => {
    clearAgentStorage();
    setOpenRouterKey('or-test-key');
  });
  afterEach(clearAgentStorage);

  it('anthropic provider triggers streaming-fallback with explicit fallbackReason', () => {
    ConfigService.setAgentConfig('agent_build', {
      provider: 'anthropic' as never,
      modelId:  'claude-3-5-sonnet-20241022',
    });

    const route = resolveStandardRoute('build');

    expect(route.provider).toBe('openrouter');
    expect(route.fallbackReason).toBe('anthropic_streaming_fallback');
    expect(route.isProxyFallback).toBe(true);
    expect(route.fallbackReason).toBeTruthy();
  });

  it('missing provider key triggers missing-key-fallback with explicit fallbackReason', () => {
    // deepseek provider, but no deepseek API key in localStorage → fallback to openrouter
    ConfigService.setAgentConfig('agent_build', {
      provider: 'deepseek' as never,
      modelId:  'deepseek/deepseek-coder',
    });
    // Ensure no deepseek key is present
    localStorage.removeItem('DEEPSEEK_API_KEY');

    const route = resolveStandardRoute('build');

    expect(route.provider).toBe('openrouter');
    expect(route.fallbackReason).toBe('missing_provider_key_fallback');
    expect(route.isProxyFallback).toBe(true);
  });

  it('no silent provider switch — configured provider is used when key is present', () => {
    ConfigService.setAgentConfig('agent_build', {
      provider: 'openrouter' as never,
      modelId:  'openai/gpt-4o-mini',
    });

    const route = resolveStandardRoute('build');

    // No fallback triggered — configured provider is used
    expect(route.provider).toBe('openrouter');
    expect(route.fallbackReason).toBeUndefined();
    expect(route.isProxyFallback).toBe(false);
    expect(route.modelId).toBe('openai/gpt-4o-mini');
  });
});

describe('routing authority: fallback resolution chain labels', () => {
  beforeEach(() => {
    clearAgentStorage();
    setOpenRouterKey('or-test-key');
  });
  afterEach(clearAgentStorage);

  it('primary_fallback authority when build slot is empty but primary is set', () => {
    // Only primary is configured, build slot is empty
    setUserConfig('agent_primary', 'openai/gpt-4o-mini', 'openrouter');
    // Ensure build slot truly empty
    localStorage.removeItem('AGENT_CONFIG_agent_build');
    localStorage.removeItem('AGENT_CONFIG_agent_build__source');

    const route = resolveStandardRoute('build');

    expect(route.sourceAuthority).toBe('primary_fallback');
    expect(route.isUserSelected).toBe(false);
    expect(route.isRuntimeConfig).toBe(false);
    expect(route.modelId).toBe('openai/gpt-4o-mini');
  });

  it('no_model_configured when nothing is set anywhere', () => {
    // No config at all
    localStorage.removeItem('AGENT_CONFIG_agent_build');
    localStorage.removeItem('AGENT_CONFIG_agent_build__source');
    localStorage.removeItem('AGENT_CONFIG_agent_primary');
    localStorage.removeItem('ENGINE_MODEL_ID');
    localStorage.removeItem('SELECTED_MODEL');

    const route = resolveStandardRoute('build');

    expect(route.sourceAuthority).toBe('no_model_configured');
    expect(route.modelId).toBe('');
    expect(route.isUserSelected).toBe(false);
    expect(route.isRuntimeConfig).toBe(false);
  });
});

describe('routing authority: coder route telemetry completeness', () => {
  beforeEach(() => {
    clearAgentStorage();
    setOpenRouterKey('or-test-key');
  });
  afterEach(clearAgentStorage);

  it('build route includes all required telemetry fields', () => {
    setUserConfig('agent_build', 'deepseek/deepseek-coder-v2', 'openrouter');

    const route = resolveStandardRoute('build');

    // All required generation_route_* fields are present on the route object
    expect(route.slot).toBeDefined();
    expect(route.provider).toBeDefined();
    expect(route.modelId).toBeDefined();
    expect(route.keySource).toBeDefined();
    expect(route.sourceAuthority).toBeDefined();
    // fallbackReason may be absent — that's correct (no fallback triggered)
    expect(route.isUserSelected).toBeDefined();
    expect(route.isRuntimeConfig).toBeDefined();
    expect(route.isProxyFallback).toBeDefined();
  });

  it('build route telemetry slot is always "build"', () => {
    setUserConfig('agent_build', 'openai/gpt-4o', 'openrouter');

    const route = resolveStandardRoute('build');
    expect(route.slot).toBe('build');
  });

  it('does not log API keys in telemetry (apiKey kept separate from diagnostic fields)', () => {
    setUserConfig('agent_build', 'openai/gpt-4o', 'openrouter');

    const route = resolveStandardRoute('build');

    // These diagnostic fields must never contain key material
    expect(route.keySource).not.toContain('or-test-key');
    expect(route.sourceAuthority).not.toContain('or-test-key');
  });
});

describe('routing authority: resolveModelWithAuthority', () => {
  beforeEach(() => {
    clearAgentStorage();
    setOpenRouterKey('or-test-key');
  });
  afterEach(clearAgentStorage);

  it('returns user_set authority for user-configured build slot', () => {
    setUserConfig('agent_build', 'openai/gpt-4o', 'openrouter');

    const { modelId, authority } = ConfigService.resolveModelWithAuthority('build');

    expect(modelId).toBe('openai/gpt-4o');
    expect(authority).toBe('user_set');
  });

  it('returns backend_file_seed for file-seeded build slot', () => {
    setFileSeedConfig('agent_build', 'xiaomi/mimo-v2-pro', 'openrouter');

    const { modelId, authority } = ConfigService.resolveModelWithAuthority('build');

    expect(modelId).toBe('xiaomi/mimo-v2-pro');
    expect(authority).toBe('backend_file_seed');
  });

  it('returns no_model_configured when localStorage is empty', () => {
    localStorage.removeItem('AGENT_CONFIG_agent_build');
    localStorage.removeItem('AGENT_CONFIG_agent_primary');
    localStorage.removeItem('ENGINE_MODEL_ID');
    localStorage.removeItem('SELECTED_MODEL');

    const { modelId, authority } = ConfigService.resolveModelWithAuthority('build');

    expect(modelId).toBe('');
    expect(authority).toBe('no_model_configured');
  });

  it('returns localStorage_unknown for a slot set without a source marker', () => {
    // Simulate pre-existing localStorage entry written before source tracking was added
    localStorage.setItem('AGENT_CONFIG_agent_build', JSON.stringify({
      provider: 'openrouter',
      modelId: 'some/old-model',
    }));
    // No __source marker — simulates pre-migration data

    const { modelId, authority } = ConfigService.resolveModelWithAuthority('build');

    expect(modelId).toBe('some/old-model');
    expect(authority).toBe('localStorage_unknown');
  });
});
