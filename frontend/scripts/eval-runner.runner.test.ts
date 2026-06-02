/**
 * eval-runner.runner.test.ts
 *
 * Unit tests for eval-runtime credential isolation, model guard, and seed integrity.
 * None of these tests require a real API key or network access.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  EVAL_MODELS,
  assertEvalModelAllowed,
  requireEvalDeepSeekKey,
  resolveEvalDeepSeekSeedPlan,
  seedBenchmarkConfig,
} from './eval-runtime.mjs';

const EXPECTED_SLOTS = [
  'agent_primary', 'agent_fix', 'agent_spec',
  'agent_build', 'agent_qa', 'agent_chat',
];

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

  // ─── 2. All 6 slots seeded per suite to EVAL_MODELS ───────────────────────

  it('fast suite: seeds all 6 slots to deepseek/deepseek-v4-flash', () => {
    const plan = resolveEvalDeepSeekSeedPlan({ DEEPSEEK_API_KEY: 'sk-test' }, 'fast');

    expect(Object.keys(plan.agentConfigs)).toEqual(expect.arrayContaining(EXPECTED_SLOTS));
    expect(Object.keys(plan.agentConfigs)).toHaveLength(EXPECTED_SLOTS.length);

    for (const agentId of EXPECTED_SLOTS) {
      expect(plan.agentConfigs[agentId].provider, `${agentId}.provider`).toBe(EVAL_MODELS.fast.provider);
      expect(plan.agentConfigs[agentId].modelId, `${agentId}.modelId`).toBe(EVAL_MODELS.fast.modelId);
    }
    expect(plan.modelId).toBe('deepseek/deepseek-v4-flash');
    expect(plan.mode).toBe('eval-deepseek-pinned');
  });

  it('full suite: seeds all 6 slots to deepseek/deepseek-v4-pro', () => {
    const plan = resolveEvalDeepSeekSeedPlan({ DEEPSEEK_API_KEY: 'sk-test' }, 'full');

    expect(Object.keys(plan.agentConfigs)).toHaveLength(EXPECTED_SLOTS.length);
    for (const agentId of EXPECTED_SLOTS) {
      expect(plan.agentConfigs[agentId].provider, `${agentId}.provider`).toBe(EVAL_MODELS.full.provider);
      expect(plan.agentConfigs[agentId].modelId, `${agentId}.modelId`).toBe(EVAL_MODELS.full.modelId);
    }
    expect(plan.modelId).toBe('deepseek/deepseek-v4-pro');
  });

  it('defaults to fast when suite is omitted', () => {
    const plan = resolveEvalDeepSeekSeedPlan({ DEEPSEEK_API_KEY: 'sk-test' });
    expect(plan.modelId).toBe(EVAL_MODELS.fast.modelId);
  });

  it('fixModelId is empty string (no separate fix model)', () => {
    const plan = resolveEvalDeepSeekSeedPlan({ DEEPSEEK_API_KEY: 'sk-test' }, 'full');
    expect(plan.fixModelId).toBe('');
  });
});

// ─── 3. Model guard — allowlist is both deepseek models; others → hard fail ──

describe('assertEvalModelAllowed', () => {
  it('allows deepseek/deepseek-v4-flash (fast model)', () => {
    expect(() => assertEvalModelAllowed('deepseek', 'deepseek/deepseek-v4-flash')).not.toThrow();
  });

  it('allows deepseek/deepseek-v4-pro (full model)', () => {
    expect(() => assertEvalModelAllowed('deepseek', 'deepseek/deepseek-v4-pro')).not.toThrow();
  });

  it('rejects a non-deepseek provider even with a valid modelId', () => {
    expect(() => assertEvalModelAllowed('openrouter', 'deepseek/deepseek-v4-flash')).toThrow(
      /refusing provider=openrouter model=deepseek\/deepseek-v4-flash/,
    );
  });

  it('rejects deepseek provider with a non-allowlist model (deepseek-v3)', () => {
    expect(() => assertEvalModelAllowed('deepseek', 'deepseek/deepseek-v3')).toThrow(
      /refusing provider=deepseek model=deepseek\/deepseek-v3/,
    );
  });

  it('rejects anthropic + claude', () => {
    expect(() => assertEvalModelAllowed('anthropic', 'claude-3-5-sonnet')).toThrow(
      /refusing provider=anthropic model=claude-3-5-sonnet/,
    );
  });
});

// ─── 4. seedBenchmarkConfig never calls ConfigService.set*/save* ────────────

describe('seedBenchmarkConfig isolation', () => {
  it('does not invoke any ConfigService.set* or save* method', () => {
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

    const configServiceMock = {
      setProviderKey: vi.fn(),
      saveProviderKey: vi.fn(),
      saveKeyToCloud: vi.fn(),
      set: vi.fn(),
      setItem: vi.fn(),
    };

    try {
      // Use full suite so we cover deepseek-v4-pro as well.
      const plan = resolveEvalDeepSeekSeedPlan({ DEEPSEEK_API_KEY: 'sk-test' }, 'full');
      seedBenchmarkConfig(plan);

      expect(configServiceMock.setProviderKey).not.toHaveBeenCalled();
      expect(configServiceMock.saveProviderKey).not.toHaveBeenCalled();
      expect(configServiceMock.saveKeyToCloud).not.toHaveBeenCalled();
      expect(configServiceMock.set).not.toHaveBeenCalled();
      expect(configServiceMock.setItem).not.toHaveBeenCalled();

      // Key stored in the in-memory shim equals exactly what was passed.
      expect(store.get('DEEPSEEK_API_KEY')).toBe('sk-test');

      // All 6 slots seeded with the full-suite model.
      for (const agentId of EXPECTED_SLOTS) {
        const raw = store.get(`AGENT_CONFIG_${agentId}`);
        expect(raw, `AGENT_CONFIG_${agentId} missing`).toBeTruthy();
        const cfg = JSON.parse(raw!);
        expect(cfg.provider).toBe(EVAL_MODELS.full.provider);
        expect(cfg.modelId).toBe(EVAL_MODELS.full.modelId);
      }
    } finally {
      (globalThis as Record<string, unknown>).localStorage = originalLS;
    }
  });
});
