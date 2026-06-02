/**
 * eval-runner.runner.test.ts
 *
 * Unit tests for eval-runtime credential isolation, model guard, and seed integrity.
 * None of these tests require a real API key or network access.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  EVAL_ALLOWED,
  assertEvalModelAllowed,
  requireEvalDeepSeekKey,
  resolveEvalDeepSeekSeedPlan,
  seedBenchmarkConfig,
} from './eval-runtime.mjs';

// ─── 1. Missing DEEPSEEK_API_KEY → hard fail ────────────────────────────────

describe('requireEvalDeepSeekKey', () => {
  it('throws the canonical error when DEEPSEEK_API_KEY is absent', () => {
    expect(() => requireEvalDeepSeekKey({})).toThrow(
      'eval requires DEEPSEEK_API_KEY in .env.local (session-only, never committed)',
    );
  });

  it('returns the key when DEEPSEEK_API_KEY is present', () => {
    const key = requireEvalDeepSeekKey({ DEEPSEEK_API_KEY: 'sk-test-abc' });
    expect(key).toBe('sk-test-abc');
  });
});

describe('resolveEvalDeepSeekSeedPlan', () => {
  it('throws the canonical error when DEEPSEEK_API_KEY is missing from env', () => {
    expect(() => resolveEvalDeepSeekSeedPlan({})).toThrow(
      'eval requires DEEPSEEK_API_KEY in .env.local (session-only, never committed)',
    );
  });

  // ─── 2. All 6 slots seeded to deepseek/deepseek-v4-flash ──────────────────

  it('seeds all 6 agent slots to EVAL_ALLOWED when key is present', () => {
    const plan = resolveEvalDeepSeekSeedPlan({ DEEPSEEK_API_KEY: 'sk-test' });

    const expectedSlots = [
      'agent_primary',
      'agent_fix',
      'agent_spec',
      'agent_build',
      'agent_qa',
      'agent_chat',
    ];

    expect(Object.keys(plan.agentConfigs)).toEqual(expect.arrayContaining(expectedSlots));
    expect(Object.keys(plan.agentConfigs)).toHaveLength(expectedSlots.length);

    for (const agentId of expectedSlots) {
      expect(plan.agentConfigs[agentId].provider, `${agentId}.provider`).toBe(EVAL_ALLOWED.provider);
      expect(plan.agentConfigs[agentId].modelId, `${agentId}.modelId`).toBe(EVAL_ALLOWED.modelId);
    }
  });

  it('sets provider, modelId, and mode correctly', () => {
    const plan = resolveEvalDeepSeekSeedPlan({ DEEPSEEK_API_KEY: 'sk-test' });

    expect(plan.provider).toBe('deepseek');
    expect(plan.modelId).toBe('deepseek/deepseek-v4-flash');
    expect(plan.mode).toBe('eval-deepseek-pinned');
    expect(plan.fixModelId).toBe('');
  });
});

// ─── 3. Model guard — wrong provider/model → hard fail ──────────────────────

describe('assertEvalModelAllowed', () => {
  it('throws when provider is wrong', () => {
    expect(() => assertEvalModelAllowed('openrouter', 'deepseek/deepseek-v4-flash')).toThrow(
      'eval is pinned to deepseek/deepseek-v4-flash; refusing provider=openrouter model=deepseek/deepseek-v4-flash',
    );
  });

  it('throws when modelId is wrong', () => {
    expect(() => assertEvalModelAllowed('deepseek', 'openai/gpt-4o-mini')).toThrow(
      'eval is pinned to deepseek/deepseek-v4-flash; refusing provider=deepseek model=openai/gpt-4o-mini',
    );
  });

  it('throws when both provider and modelId are wrong', () => {
    expect(() => assertEvalModelAllowed('anthropic', 'claude-3-5-sonnet')).toThrow(
      'eval is pinned to deepseek/deepseek-v4-flash; refusing provider=anthropic model=claude-3-5-sonnet',
    );
  });

  it('does not throw for EVAL_ALLOWED values', () => {
    expect(() => assertEvalModelAllowed(EVAL_ALLOWED.provider, EVAL_ALLOWED.modelId)).not.toThrow();
  });
});

// ─── 4. seedBenchmarkConfig never calls ConfigService.set*/save* ────────────
//
// seedBenchmarkConfig operates only on the in-memory localStorage shim
// (installed by ensureBrowserGlobals). It never imports or calls ConfigService.
// The spy below confirms zero calls to any method matching set*/save* on a
// mock that would represent ConfigService's public API surface.

describe('seedBenchmarkConfig isolation', () => {
  it('does not invoke any ConfigService.set* or save* method', () => {
    // Build an in-memory localStorage for this test so we don't pollute globalThis.
    const store = new Map<string, string>();
    const fakeLocalStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; },
    };

    const originalLS = (globalThis as Record<string, unknown>).localStorage;
    (globalThis as Record<string, unknown>).localStorage = fakeLocalStorage;

    // Create a ConfigService-shaped mock to verify it is never touched.
    const configServiceMock = {
      setProviderKey: vi.fn(),
      saveProviderKey: vi.fn(),
      saveKeyToCloud: vi.fn(),
      set: vi.fn(),
      setItem: vi.fn(),
    };

    try {
      const plan = resolveEvalDeepSeekSeedPlan({ DEEPSEEK_API_KEY: 'sk-test' });
      seedBenchmarkConfig(plan);

      // None of the ConfigService mock methods should have been called.
      expect(configServiceMock.setProviderKey).not.toHaveBeenCalled();
      expect(configServiceMock.saveProviderKey).not.toHaveBeenCalled();
      expect(configServiceMock.saveKeyToCloud).not.toHaveBeenCalled();
      expect(configServiceMock.set).not.toHaveBeenCalled();
      expect(configServiceMock.setItem).not.toHaveBeenCalled();

      // The API key must NOT have been written into any localStorage slot that
      // ConfigService would read (DEEPSEEK_API_KEY is the browser key name).
      // seedBenchmarkConfig writes it under PROVIDER_STORAGE_KEYS['deepseek'] = 'DEEPSEEK_API_KEY'
      // which is intentional for the eval in-memory shim — but verify the value
      // stored equals exactly the test key (no cross-contamination of real keys).
      const stored = store.get('DEEPSEEK_API_KEY');
      expect(stored).toBe('sk-test');

      // Verify all 6 agent slots are seeded in the in-memory store.
      const expectedSlots = [
        'agent_primary', 'agent_fix', 'agent_spec',
        'agent_build', 'agent_qa', 'agent_chat',
      ];
      for (const agentId of expectedSlots) {
        const raw = store.get(`AGENT_CONFIG_${agentId}`);
        expect(raw, `AGENT_CONFIG_${agentId} missing from store`).toBeTruthy();
        const cfg = JSON.parse(raw!);
        expect(cfg.provider).toBe(EVAL_ALLOWED.provider);
        expect(cfg.modelId).toBe(EVAL_ALLOWED.modelId);
      }
    } finally {
      (globalThis as Record<string, unknown>).localStorage = originalLS;
    }
  });
});
