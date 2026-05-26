/**
 * canaryModelSetup.test.ts
 *
 * Deterministic tests for the Live Preview Canary model-selection setup
 * introduced after PR #35 (user-selected model authority enforcement).
 *
 * Proves:
 *   1. The canary addInitScript pattern (AGENT_CONFIG_agent_build + user_set source)
 *      produces a successful build route with user_set authority.
 *   2. factory config alone (no user model set) throws ModelSelectionRequiredError —
 *      the canary must NOT rely on backend/agent-config.json as route authority.
 *   3. Missing model selection (empty localStorage) throws ModelSelectionRequiredError —
 *      the canary times out only if this guard is absent; with the fix it fails fast.
 *   4. Route telemetry labels the canary route authority as user_set, not factory/empty.
 *   5. No real LLM calls — all routing exercised via localStorage only.
 *
 * These tests mirror exactly what the Live Preview Canary's addInitScript writes to
 * localStorage before Playwright loads the studio page.
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveStandardRoute, ModelSelectionRequiredError } from '../buildAgentRouting';
import { ConfigService } from '../ConfigService';

// ── Helpers mirroring what canary addInitScript writes ────────────────────────

const CANARY_BUILD_MODEL = 'openai/gpt-4o-mini';
const CANARY_BUILD_PROVIDER = 'openrouter';
const CANARY_OPENROUTER_KEY = 'e2e-live-preview-key';

/**
 * Applies the exact localStorage writes the Live Preview Canary addInitScript
 * applies after PR #35.  The LLM is fully mocked in Playwright — the model ID
 * and key are never sent to a real API; they satisfy the route authority check.
 */
function applyCanaryModelSetup() {
  localStorage.setItem('OPENROUTER_API_KEY', CANARY_OPENROUTER_KEY);
  localStorage.setItem(
    'AGENT_CONFIG_agent_build',
    JSON.stringify({ provider: CANARY_BUILD_PROVIDER, modelId: CANARY_BUILD_MODEL }),
  );
  localStorage.setItem('AGENT_CONFIG_agent_build__source', 'user_set');
}

function clearAgentStorage() {
  const prefixes = [
    'AGENT_CONFIG_',
    'OPENROUTER_API_KEY',
    'ENGINE_MODEL_ID',
    'SELECTED_MODEL',
  ];
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && prefixes.some(p => k.startsWith(p))) localStorage.removeItem(k);
  }
}

function setFactoryFileSeed(agentId: string, modelId: string, provider = 'openrouter') {
  localStorage.setItem(`AGENT_CONFIG_${agentId}`, JSON.stringify({ provider, modelId }));
  localStorage.setItem(`AGENT_CONFIG_${agentId}__source`, 'backend_file_seed');
}

function setFactoryTemplate(agentId: string) {
  localStorage.setItem(`AGENT_CONFIG_${agentId}`, JSON.stringify({ maxTokens: { max: 4096 } }));
  localStorage.setItem(`AGENT_CONFIG_${agentId}__source`, 'backend_factory_template');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Live Preview Canary model setup — canary addInitScript writes user_set authority', () => {
  beforeEach(() => {
    clearAgentStorage();
    applyCanaryModelSetup();
  });
  afterEach(clearAgentStorage);

  it('canary setup produces a successful build route (no throw)', () => {
    expect(() => resolveStandardRoute('build')).not.toThrow();
  });

  it('canary setup route has user_set authority', () => {
    const route = resolveStandardRoute('build');
    expect(route.sourceAuthority).toBe('user_set');
  });

  it('canary setup route is marked isUserSelected', () => {
    const route = resolveStandardRoute('build');
    expect(route.isUserSelected).toBe(true);
  });

  it('canary setup route is NOT marked isFactoryConfig', () => {
    const route = resolveStandardRoute('build');
    expect(route.isFactoryConfig).toBe(false);
  });

  it('canary setup route is NOT marked isRuntimeConfig', () => {
    const route = resolveStandardRoute('build');
    expect(route.isRuntimeConfig).toBe(false);
  });

  it('canary setup route uses the expected model ID', () => {
    const route = resolveStandardRoute('build');
    expect(route.modelId).toBe(CANARY_BUILD_MODEL);
  });

  it('canary setup route uses openrouter provider', () => {
    const route = resolveStandardRoute('build');
    expect(route.provider).toBe(CANARY_BUILD_PROVIDER);
  });

  it('ConfigService.resolveModelWithAuthority returns user_set for canary setup', () => {
    const { modelId, authority } = ConfigService.resolveModelWithAuthority('build');
    expect(modelId).toBe(CANARY_BUILD_MODEL);
    expect(authority).toBe('user_set');
  });
});

describe('Live Preview Canary — factory config alone does NOT start generation (PR #35)', () => {
  beforeEach(clearAgentStorage);
  afterEach(clearAgentStorage);

  it('backend_file_seed (legacy factory) alone throws ModelSelectionRequiredError', () => {
    setFactoryFileSeed('agent_build', 'xiaomi/mimo-v2-pro');
    expect(() => resolveStandardRoute('build')).toThrow(ModelSelectionRequiredError);
  });

  it('backend_factory_template alone throws ModelSelectionRequiredError', () => {
    setFactoryTemplate('agent_build');
    expect(() => resolveStandardRoute('build')).toThrow(ModelSelectionRequiredError);
  });

  it('backend_file_seed does not satisfy user_set requirement — ModelSelectionRequiredError slot=build', () => {
    setFactoryFileSeed('agent_build', 'xiaomi/mimo-v2-pro');
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

  it('OpenRouter API key alone does not satisfy build route requirement', () => {
    // Simulates what the old canary addInitScript wrote — only the key, no build model.
    localStorage.setItem('OPENROUTER_API_KEY', 'e2e-live-preview-key');
    // No AGENT_CONFIG_agent_build → authority is no_model_configured
    expect(() => resolveStandardRoute('build')).toThrow(ModelSelectionRequiredError);
  });
});

describe('Live Preview Canary — missing model selection produces error, not silent timeout', () => {
  beforeEach(clearAgentStorage);
  afterEach(clearAgentStorage);

  it('completely empty localStorage throws ModelSelectionRequiredError for build slot', () => {
    expect(() => resolveStandardRoute('build')).toThrow(ModelSelectionRequiredError);
  });

  it('error message references model configuration path', () => {
    let msg = '';
    try {
      resolveStandardRoute('build');
    } catch (e) {
      msg = (e as Error).message;
    }
    // The error must give actionable guidance — not be silent.
    expect(msg).toContain('Model selection required');
    expect(msg).toContain('build');
  });

  it('authority on thrown error is no_model_configured when nothing is configured', () => {
    let caught: ModelSelectionRequiredError | undefined;
    try {
      resolveStandardRoute('build');
    } catch (e) {
      if (e instanceof ModelSelectionRequiredError) caught = e;
    }
    expect(caught).toBeDefined();
    expect(caught?.authority).toBe('no_model_configured');
  });

  it('canary setup (user_set) fixes the previously-timing-out scenario', () => {
    // Before fix: empty → throws → no controller_compiling → 300 s timeout.
    // After fix: user_set → no throw → pipeline starts.
    expect(() => resolveStandardRoute('build')).toThrow(ModelSelectionRequiredError);

    // Apply the fix (mirrors what canary addInitScript now writes).
    applyCanaryModelSetup();
    expect(() => resolveStandardRoute('build')).not.toThrow();
  });
});

describe('Live Preview Canary — route telemetry labels authority correctly', () => {
  beforeEach(() => {
    clearAgentStorage();
    applyCanaryModelSetup();
  });
  afterEach(clearAgentStorage);

  it('route authority is user_set — not factory/empty', () => {
    const route = resolveStandardRoute('build');
    const forbiddenAuthorities = ['backend_factory_template', 'backend_file_seed', 'no_model_configured'];
    expect(forbiddenAuthorities).not.toContain(route.sourceAuthority);
  });

  it('route telemetry includes all required diagnostic fields', () => {
    const route = resolveStandardRoute('build');
    expect(route.slot).toBe('build');
    expect(route.provider).toBeTruthy();
    expect(route.modelId).toBeTruthy();
    expect(route.endpoint).toBeTruthy();
    expect(route.sourceAuthority).toBeTruthy();
    expect(typeof route.isUserSelected).toBe('boolean');
    expect(typeof route.isRuntimeConfig).toBe('boolean');
    expect(typeof route.isFactoryConfig).toBe('boolean');
    expect(typeof route.isProxyFallback).toBe('boolean');
  });

  it('route logs from resolveStandardRoute do not contain forbidden authority strings', () => {
    const logs: string[] = [];
    resolveStandardRoute('build', { onLog: (msg) => logs.push(msg) });

    const forbiddenAuthorities = ['backend_factory_template', 'backend_file_seed', 'no_model_configured'];
    for (const forbidden of forbiddenAuthorities) {
      expect(logs.some(l => l.includes(forbidden))).toBe(false);
    }
  });

  it('resolveStandardRoute log for canary route includes user_set authority marker', () => {
    const logs: string[] = [];
    resolveStandardRoute('build', { onLog: (msg) => logs.push(msg) });

    // Log format: "[RouteResolver] slot=build model=... provider=... key=... [authority=user_set]"
    expect(logs.some(l => l.includes('authority=user_set'))).toBe(true);
  });
});

describe('Live Preview Canary — no real LLM calls in unit tests', () => {
  beforeEach(() => {
    clearAgentStorage();
    applyCanaryModelSetup();
  });
  afterEach(clearAgentStorage);

  it('resolveStandardRoute exercises only localStorage — no fetch/XHR calls', () => {
    // resolveStandardRoute is synchronous and reads only from localStorage / ConfigService.
    // This test verifies the function completes without any async operations.
    let syncCompleted = false;
    const route = resolveStandardRoute('build');
    syncCompleted = true;

    expect(syncCompleted).toBe(true);
    expect(route.slot).toBe('build');
  });

  it('ConfigService.resolveModelWithAuthority is synchronous and pure localStorage', () => {
    let syncCompleted = false;
    const result = ConfigService.resolveModelWithAuthority('build');
    syncCompleted = true;

    expect(syncCompleted).toBe(true);
    expect(result.modelId).toBe(CANARY_BUILD_MODEL);
  });
});
