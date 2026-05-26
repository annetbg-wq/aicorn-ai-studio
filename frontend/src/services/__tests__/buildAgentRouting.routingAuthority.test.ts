/**
 * buildAgentRouting.routingAuthority.test.ts
 *
 * Deterministic tests for routing authority diagnosis and enforcement.
 *
 * Proves:
 *   1. User-set build route wins over backend factory config.
 *   2. backend/agent-config.json seeded value throws ModelSelectionRequiredError.
 *   3. backend/agent-config.json is NOT treated as user-selected authority.
 *   4. When the user has no config, resolveStandardRoute('build') throws.
 *   5. Fallback reason is explicit when a routing fallback rule fires.
 *   6. No silent switch to another provider/model without fallbackReason.
 *   7. Coder route telemetry includes provider / model / source authority / isFactoryConfig.
 *   8. No real LLM calls — all mocked via localStorage only.
 *   9. isRuntimeConfig is true only for backend_runtime_saved authority.
 *  10. isUserSelected is true only for user_set authority.
 *  11. isProxyFallback mirrors whether a fallback rule was triggered.
 *  12. isFactoryConfig is always false on returned routes (factory throws before returning).
 *  13. backend runtime config (user-saved Settings) allows route construction.
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveStandardRoute, ModelSelectionRequiredError } from '../buildAgentRouting';
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

/** Simulates legacy backend_file_seed (old behaviour — factory config written to localStorage). */
function setFileSeedConfig(agentId: string, modelId: string, provider = 'openrouter') {
  localStorage.setItem(`AGENT_CONFIG_${agentId}`, JSON.stringify({ provider, modelId }));
  localStorage.setItem(`AGENT_CONFIG_${agentId}__source`, 'backend_file_seed');
}

/** Simulates backend_factory_template (new behaviour — factory config without modelId/provider). */
function setFactoryTemplateConfig(agentId: string) {
  // Factory template seeds only maxTokens, no modelId/provider
  localStorage.setItem(`AGENT_CONFIG_${agentId}`, JSON.stringify({ maxTokens: { max: 4096 } }));
  localStorage.setItem(`AGENT_CONFIG_${agentId}__source`, 'backend_factory_template');
}

/** Simulates backend_runtime_saved (user saved settings → runtime file). */
function setRuntimeConfig(agentId: string, modelId: string, provider = 'openrouter') {
  localStorage.setItem(`AGENT_CONFIG_${agentId}`, JSON.stringify({ provider, modelId }));
  localStorage.setItem(`AGENT_CONFIG_${agentId}__source`, 'backend_runtime_saved');
}

function setOpenRouterKey(key: string) {
  localStorage.setItem('OPENROUTER_API_KEY', key);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('routing authority: user_set wins over factory config', () => {
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
    expect(route.isFactoryConfig).toBe(false);
    expect(route.modelId).toBe('openai/gpt-4o');
  });

  it('throws ModelSelectionRequiredError for backend_file_seed (legacy factory seed)', () => {
    setFileSeedConfig('agent_build', 'xiaomi/mimo-v2-pro', 'openrouter');

    expect(() => resolveStandardRoute('build')).toThrow(ModelSelectionRequiredError);
  });

  it('throws ModelSelectionRequiredError for backend_factory_template (new factory template)', () => {
    setFactoryTemplateConfig('agent_build');

    expect(() => resolveStandardRoute('build')).toThrow(ModelSelectionRequiredError);
  });

  it('ModelSelectionRequiredError carries slot and authority fields', () => {
    setFileSeedConfig('agent_build', 'xiaomi/mimo-v2-pro', 'openrouter');

    let caught: ModelSelectionRequiredError | undefined;
    try {
      resolveStandardRoute('build');
    } catch (e) {
      if (e instanceof ModelSelectionRequiredError) caught = e;
    }

    expect(caught).toBeDefined();
    expect(caught?.slot).toBe('build');
    expect(['backend_factory_template', 'backend_file_seed', 'no_model_configured'])
      .toContain(caught?.authority);
  });

  it('user_set authority overrides backend_file_seed when user has configured the slot', () => {
    // File seed first — simulates startup seeding
    setFileSeedConfig('agent_build', 'xiaomi/mimo-v2-pro', 'openrouter');
    // User then changes via Settings UI — overwrites file seed
    setUserConfig('agent_build', 'deepseek/deepseek-coder', 'openrouter');

    const route = resolveStandardRoute('build');

    expect(route.sourceAuthority).toBe('user_set');
    expect(route.isUserSelected).toBe(true);
    expect(route.isRuntimeConfig).toBe(false);
    expect(route.isFactoryConfig).toBe(false);
    expect(route.modelId).toBe('deepseek/deepseek-coder');
  });
});

describe('routing authority: backend/agent-config.json is not treated as user-selected', () => {
  beforeEach(() => {
    clearAgentStorage();
    setOpenRouterKey('or-test-key');
  });
  afterEach(clearAgentStorage);

  it('file-seeded xiaomi/mimo-v2-pro throws — NOT treated as user selection', () => {
    // Simulate the exact scenario from the long-observation report:
    // backend/agent-config.json has xiaomi/mimo-v2-pro for agent_build.
    setFileSeedConfig('agent_build', 'xiaomi/mimo-v2-pro', 'openrouter');

    expect(() => resolveStandardRoute('build')).toThrow(ModelSelectionRequiredError);
  });

  it('factory template config throws — NOT treated as user selection', () => {
    setFactoryTemplateConfig('agent_build');

    expect(() => resolveStandardRoute('build')).toThrow(ModelSelectionRequiredError);
  });
});

describe('routing authority: backend runtime config allows route construction', () => {
  beforeEach(() => {
    clearAgentStorage();
    setOpenRouterKey('or-test-key');
  });
  afterEach(clearAgentStorage);

  it('backend_runtime_saved authority allows route construction (user saved Settings)', () => {
    setRuntimeConfig('agent_build', 'deepseek/deepseek-coder', 'openrouter');

    const route = resolveStandardRoute('build');

    expect(route.sourceAuthority).toBe('backend_runtime_saved');
    expect(route.isUserSelected).toBe(false);   // not user_set, but runtime (user-saved)
    expect(route.isRuntimeConfig).toBe(true);
    expect(route.isFactoryConfig).toBe(false);
    expect(route.modelId).toBe('deepseek/deepseek-coder');
  });

  it('backend_runtime_saved route does not throw', () => {
    setRuntimeConfig('agent_build', 'openai/gpt-4o', 'openrouter');

    expect(() => resolveStandardRoute('build')).not.toThrow();
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
    expect(route.isFactoryConfig).toBe(false);
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
    expect(route.isFactoryConfig).toBe(false);
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
    expect(route.isFactoryConfig).toBe(false);
    expect(route.modelId).toBe('openai/gpt-4o-mini');
  });
});

describe('routing authority: factory config blocks route construction', () => {
  beforeEach(() => {
    clearAgentStorage();
    setOpenRouterKey('or-test-key');
  });
  afterEach(clearAgentStorage);

  it('cleared localStorage + backend factory config → throws ModelSelectionRequiredError', () => {
    // Simulate: fresh install, loadFromBackend ran, only factory template in localStorage
    setFactoryTemplateConfig('agent_build');

    expect(() => resolveStandardRoute('build')).toThrow(ModelSelectionRequiredError);
  });

  it('backend factory config is not route authority — no silent fallback to any factory model', () => {
    setFileSeedConfig('agent_build', 'xiaomi/mimo-v2-pro', 'openrouter');

    let threw = false;
    try {
      resolveStandardRoute('build');
    } catch (e) {
      threw = e instanceof ModelSelectionRequiredError;
    }
    expect(threw).toBe(true);
  });

  it('factory config for non-build slot does NOT throw (only build slot is enforced)', () => {
    // Factory-seeded primary slot should not throw
    setFileSeedConfig('agent_primary', 'some-factory-model', 'openrouter');

    // Primary slot does not enforce user-selection requirement
    expect(() => resolveStandardRoute('primary')).not.toThrow(ModelSelectionRequiredError);
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
    expect(route.isFactoryConfig).toBe(false);
    expect(route.modelId).toBe('openai/gpt-4o-mini');
  });

  it('no_model_configured → throws ModelSelectionRequiredError for build slot', () => {
    // No config at all — build slot should throw
    localStorage.removeItem('AGENT_CONFIG_agent_build');
    localStorage.removeItem('AGENT_CONFIG_agent_build__source');
    localStorage.removeItem('AGENT_CONFIG_agent_primary');
    localStorage.removeItem('ENGINE_MODEL_ID');
    localStorage.removeItem('SELECTED_MODEL');

    expect(() => resolveStandardRoute('build')).toThrow(ModelSelectionRequiredError);
  });
});

describe('routing authority: coder route telemetry completeness', () => {
  beforeEach(() => {
    clearAgentStorage();
    setOpenRouterKey('or-test-key');
  });
  afterEach(clearAgentStorage);

  it('build route includes all required telemetry fields including isFactoryConfig', () => {
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
    expect(route.isFactoryConfig).toBeDefined();
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

  it('isFactoryConfig is always false on returned routes (factory throws before returning)', () => {
    setUserConfig('agent_build', 'openai/gpt-4o', 'openrouter');

    const route = resolveStandardRoute('build');
    expect(route.isFactoryConfig).toBe(false);
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

  it('returns backend_factory_template for file-seeded build slot (legacy backend_file_seed mapped)', () => {
    setFileSeedConfig('agent_build', 'xiaomi/mimo-v2-pro', 'openrouter');

    const { modelId, authority } = ConfigService.resolveModelWithAuthority('build');

    // resolveModelWithAuthority maps both backend_file_seed and backend_factory_template
    // to backend_factory_template authority
    expect(modelId).toBe('xiaomi/mimo-v2-pro');
    expect(authority).toBe('backend_factory_template');
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

  it('returns backend_runtime_saved for runtime-config build slot', () => {
    setRuntimeConfig('agent_build', 'deepseek/deepseek-coder', 'openrouter');

    const { modelId, authority } = ConfigService.resolveModelWithAuthority('build');

    expect(modelId).toBe('deepseek/deepseek-coder');
    expect(authority).toBe('backend_runtime_saved');
  });
});
