// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveStandardRoute } from '../buildAgentRouting';
import type { AgentExecutionRoute } from '../buildAgentRouting';
import { ConfigService } from '../ConfigService';
import type { FinalLivePreviewCheckResult } from '../WhiteScreenDetector';

const llmProxyMock = vi.hoisted(() => ({
  llmFetchStream: vi.fn(),
  llmFetch: vi.fn(),
}));

vi.mock('../LLMProxy', () => llmProxyMock);

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAgentConfig(provider: string, modelId: string) {
  return JSON.stringify({ provider, modelId });
}

function setAgentConfigRaw(agentId: string, provider: string, modelId: string) {
  localStorage.setItem(`AGENT_CONFIG_${agentId}`, makeAgentConfig(provider, modelId));
}

function setProviderKey(provider: string, key: string) {
  const map: Record<string, string> = {
    openrouter: 'OPENROUTER_API_KEY',
    anthropic:  'ANTHROPIC_API_KEY',
    openai:     'OPENAI_API_KEY',
    google:     'GOOGLE_API_KEY',
    mistral:    'MISTRAL_API_KEY',
    deepseek:   'DEEPSEEK_API_KEY',
    groq:       'GROQ_API_KEY',
  };
  if (map[provider]) localStorage.setItem(map[provider], key);
}

function makeStreamingResponse(text: string): Response {
  const stream = new ReadableStream({
    start(controller) {
      const payload =
        `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n` +
        'data: [DONE]\n';
      controller.enqueue(new TextEncoder().encode(payload));
      controller.close();
    },
  });
  return new Response(stream);
}

function makeChatCompletionResponse(content: string): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content } }],
  }));
}

function makePassedFinalCheckResult(
  overrides: Partial<FinalLivePreviewCheckResult> = {},
): FinalLivePreviewCheckResult {
  return {
    buildId: 'test-build',
    status: 'passed',
    reason: null,
    message: 'Final live-preview checks passed',
    controllerStatus: 'ready',
    controllerRevisionId: 'test-build',
    immediateBlank: false,
    probeOutcome: 'healthy',
    probeReason: null,
    ...overrides,
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

afterEach(() => {
  vi.restoreAllMocks();
  llmProxyMock.llmFetchStream.mockReset();
  llmProxyMock.llmFetch.mockReset();
});

describe('resolveStandardRoute', () => {
  beforeEach(() => {
    localStorage.clear();
    // Global OpenRouter key present by default
    setProviderKey('openrouter', 'or-global-key');
  });

  afterEach(() => {
    localStorage.clear();
  });

  // 1. Standard path uses build slot settings deterministically
  it('build slot uses agent_build config, not primary', () => {
    setAgentConfigRaw('agent_build',   'openrouter', 'build-model-id');
    setAgentConfigRaw('agent_primary', 'openrouter', 'primary-model-id');

    const buildRoute   = resolveStandardRoute('build');
    const primaryRoute = resolveStandardRoute('primary');

    expect(buildRoute.modelId).toBe('build-model-id');
    expect(primaryRoute.modelId).toBe('primary-model-id');
    expect(buildRoute.slot).toBe('build');
    expect(primaryRoute.slot).toBe('primary');
  });

  // 2. Primary and build do not collapse into one implicit model path
  it('primary and build routes are independent even when both use openrouter', () => {
    setAgentConfigRaw('agent_primary', 'openrouter', 'model-A');
    setAgentConfigRaw('agent_build',   'openrouter', 'model-B');

    const primaryRoute = resolveStandardRoute('primary');
    const buildRoute   = resolveStandardRoute('build');

    expect(primaryRoute.modelId).not.toBe(buildRoute.modelId);
    expect(primaryRoute.modelId).toBe('model-A');
    expect(buildRoute.modelId).toBe('model-B');
  });

  // 3. Downstream layers cannot re-resolve routing — route object is self-contained
  it('route object carries all routing fields needed for a network call', () => {
    setAgentConfigRaw('agent_build', 'openrouter', 'xiaomi/mimo-v2-pro');
    setProviderKey('openrouter', 'sk-or-abc123');

    const route = resolveStandardRoute('build');

    expect(route.modelId).toBeTruthy();
    expect(route.apiKey).toBeTruthy();
    expect(route.endpoint).toMatch(/openrouter\.ai/);
    expect(route.provider).toBe('openrouter');
    expect(route.slot).toBe('build');
    expect(route.keySource).toContain('agent_build');
    expect(route.reason).toBeTruthy();
  });

  // 4. Missing provider key falls back to OpenRouter
  it('missing provider key triggers openrouter fallback', () => {
    setAgentConfigRaw('agent_build', 'deepseek', 'deepseek-v3');
    // Do NOT set deepseek key
    setProviderKey('openrouter', 'or-fallback-key');

    const route = resolveStandardRoute('build');

    expect(route.provider).toBe('openrouter');
    expect(route.apiKey).toBe('or-fallback-key');
    expect(route.fallbackReason).toBe('missing_provider_key_fallback');
    // modelId is still the configured model (not changed by fallback)
    expect(route.modelId).toBe('deepseek-v3');
  });

  // 5. Anthropic provider always falls back to OpenRouter (streaming incompatibility)
  it('anthropic provider triggers openrouter streaming fallback', () => {
    setAgentConfigRaw('agent_primary', 'anthropic', 'claude-sonnet-4-6');
    setProviderKey('anthropic', 'sk-ant-key');
    setProviderKey('openrouter', 'or-key');

    const route = resolveStandardRoute('primary');

    expect(route.provider).toBe('openrouter');
    expect(route.apiKey).toBe('or-key');
    expect(route.fallbackReason).toBe('anthropic_streaming_fallback');
    expect(route.modelId).toBe('claude-sonnet-4-6');
    expect(route.endpoint).toMatch(/openrouter\.ai/);
  });

  // 6. Standard generation fails loudly if route object is missing (guard in SimpleGeneration)
  it('resolveStandardRoute always returns a complete route object', () => {
    // Even with no config at all, resolver should return a valid (defaulted) route
    const route = resolveStandardRoute('build');

    expect(route).toBeDefined();
    expect(route.slot).toBe('build');
    expect(typeof route.modelId).toBe('string');
    expect(typeof route.apiKey).toBe('string');
    expect(typeof route.endpoint).toBe('string');
    expect(typeof route.provider).toBe('string');
    expect(typeof route.reason).toBe('string');
  });

  // 7. Fix slot resolves independently from primary and build
  it('fix slot has its own model, independent of primary and build', () => {
    setAgentConfigRaw('agent_primary', 'openrouter', 'primary-model');
    setAgentConfigRaw('agent_build',   'openrouter', 'build-model');
    setAgentConfigRaw('agent_fix',     'openrouter', 'fix-model');

    const fixRoute = resolveStandardRoute('fix');

    expect(fixRoute.slot).toBe('fix');
    expect(fixRoute.modelId).toBe('fix-model');
  });

  // 8. OpenRouter with explicit agent key prefers agent key over global key
  it('openrouter prefers agent-specific key over global key when both present', () => {
    setAgentConfigRaw('agent_build', 'openrouter', 'some-model');
    // There's no per-agent-key in the new system (keys are per-provider), so
    // both agent_build and global OpenRouter point to the same key.
    // This test verifies the key is always non-empty.
    setProviderKey('openrouter', 'or-specific-key');

    const route = resolveStandardRoute('build');

    expect(route.apiKey).toBe('or-specific-key');
    expect(route.provider).toBe('openrouter');
  });

  it('prefers legacy inline agent apiKey over stale global provider key for openrouter routes', () => {
    localStorage.setItem('OPENROUTER_API_KEY', 'or-stale-global-key');
    localStorage.setItem('AGENT_CONFIG_agent_primary', JSON.stringify({
      provider: 'openrouter',
      modelId: 'openai/gpt-4o-mini',
      apiKey: 'or-legacy-inline-key',
    }));

    const route = resolveStandardRoute('primary');

    expect(route.provider).toBe('openrouter');
    expect(route.apiKey).toBe('or-legacy-inline-key');
    expect(route.keySource).toContain('legacy-inline-apiKey');
    expect(localStorage.getItem('AGENT_CONFIG_agent_primary')).toContain('"apiKey":"or-legacy-inline-key"');
  });

  // 9. Logs are emitted when onLog is provided
  it('emits log entries when onLog callback is provided', () => {
    setAgentConfigRaw('agent_build', 'openrouter', 'test-model');
    const logs: string[] = [];

    resolveStandardRoute('build', { onLog: (msg) => logs.push(msg) });

    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0]).toContain('slot=build');
    expect(logs[0]).toContain('test-model');
  });

  // 10. No fallback is triggered when everything is correctly configured
  it('does not set fallbackReason when provider and key are correctly configured', () => {
    setAgentConfigRaw('agent_build', 'openai', 'gpt-4o');
    setProviderKey('openai', 'sk-openai-key');

    const route = resolveStandardRoute('build');

    expect(route.provider).toBe('openai');
    expect(route.fallbackReason).toBeUndefined();
    expect(route.endpoint).toMatch(/openai\.com/);
  });

  // 11. Native deepseek provider strips slash prefix from model ID
  it('strips provider prefix from model ID when using native deepseek endpoint', () => {
    setAgentConfigRaw('agent_fix', 'deepseek', 'deepseek/deepseek-v4-flash');
    setProviderKey('deepseek', 'sk-deepseek-key');

    const route = resolveStandardRoute('fix');

    expect(route.provider).toBe('deepseek');
    expect(route.endpoint).toMatch(/deepseek\.com/);
    // Slash prefix must be stripped for native API
    expect(route.modelId).toBe('deepseek-v4-flash');
    expect(route.modelId).not.toContain('/');
  });

  // 12. OpenRouter model IDs with slash prefix are NOT stripped
  it('preserves provider/model prefix for OpenRouter endpoint', () => {
    setAgentConfigRaw('agent_build', 'openrouter', 'deepseek/deepseek-v4-flash');
    setProviderKey('openrouter', 'sk-or-key');

    const route = resolveStandardRoute('build');

    expect(route.provider).toBe('openrouter');
    expect(route.endpoint).toMatch(/openrouter\.ai/);
    // Full model ID must be preserved for OpenRouter
    expect(route.modelId).toBe('deepseek/deepseek-v4-flash');
  });
});

// ── Integration: SimpleGeneration route guard ─────────────────────────────────

describe('SimpleGeneration route guard', () => {
  it('throws ROUTING VIOLATION when run() is called without route objects', async () => {
    // Import lazily to avoid circular resolution during test setup
    const { SimpleGeneration } = await import('../SimpleGeneration');

    await expect(
      (SimpleGeneration as unknown as { run: (c: object) => Promise<unknown> }).run({
        intent:   'test',
        history:  [],
        files:    {},
        apiKey:   'dummy',
        modelId:  'dummy',
        // primaryRoute and buildRoute deliberately absent
        onStream: () => {},
        onFiles:  () => {},
        onPhase:  () => {},
        onLog:    () => {},
        onPlan:   () => {},
      }),
    ).rejects.toThrow('ROUTING VIOLATION');
  });
});

// ── FAIL-repair regression tests ──────────────────────────────────────────────

describe('Dual-routing regression guard: generatePlan requires canonical route', () => {
  beforeEach(() => {
    localStorage.clear();
    setProviderKey('openrouter', 'or-key');
    setAgentConfigRaw('agent_primary', 'openrouter', 'plan-model');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('generatePlan config type includes required route field', async () => {
    const { SimpleGeneration } = await import('../SimpleGeneration');
    const route = resolveStandardRoute('primary');

    // Construct the config with route — this verifies the type contract at runtime.
    const config: Parameters<typeof SimpleGeneration.generatePlan>[0] = {
      intent:   'test intent',
      userLang: 'en',
      apiKey:   route.apiKey,
      route,
      signal:   undefined,
    };

    expect(config.route).toBe(route);
    expect(config.route.slot).toBe('primary');
    expect(config.route.modelId).toBe('plan-model');
    expect(config.route.apiKey).toBe('or-key');
  });

  it('resolveStandardRoute("primary") produces a complete route with no ConfigService fallback needed', () => {
    const route = resolveStandardRoute('primary');
    // If route is complete, callLLM's else branch will not be reached.
    expect(route.modelId).toBeTruthy();
    expect(route.apiKey).toBeTruthy();
    expect(route.endpoint).toBeTruthy();
    expect(route.slot).toBe('primary');
    // No fallback triggered when provider key is present
    expect(route.fallbackReason).toBeUndefined();
  });

  it('generatePlan standard flow uses the provided canonical route and never re-enters ConfigService fallback', async () => {
    const { SimpleGeneration } = await import('../SimpleGeneration');
    const route: AgentExecutionRoute = {
      slot: 'primary',
      provider: 'openrouter',
      modelId: 'canonical-plan-model',
      endpoint: 'https://example.test/chat/completions',
      apiKey: 'canonical-plan-key',
      keySource: 'test.primary',
      reason: 'unit-test canonical route',
    };
    const planJson = JSON.stringify({
      appName: 'Planner',
      summary: 'Canonical route only.',
      pages: ['Home'],
      steps: [{ id: 'think', label: 'Analyze request' }],
      assumptions: [],
    });

    llmProxyMock.llmFetchStream.mockResolvedValue(makeStreamingResponse(planJson));
    const resolveModelSpy = vi.spyOn(ConfigService, 'resolveModel');
    const getKeyForAgentSpy = vi.spyOn(ConfigService, 'getKeyForAgent');
    const getAgentConfigSpy = vi.spyOn(ConfigService, 'getAgentConfig');

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('dev-agent-mode unavailable'));

    try {
      const plan = await SimpleGeneration.generatePlan({
        intent: 'build a planner',
        userLang: 'en',
        apiKey: route.apiKey,
        route,
      });

      expect(plan.appName).toBe('Planner');
      expect(plan.summary).toBe('Canonical route only.');
      expect(resolveModelSpy).not.toHaveBeenCalled();
      expect(getKeyForAgentSpy).not.toHaveBeenCalled();
      expect(getAgentConfigSpy).not.toHaveBeenCalled();
      expect(llmProxyMock.llmFetchStream).toHaveBeenCalledWith(
        route.endpoint,
        expect.objectContaining({
          Authorization: `Bearer ${route.apiKey}`,
        }),
        expect.stringContaining(`"model":"${route.modelId}"`),
        expect.any(AbortSignal),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('generatePlan uses canonical standard route without dev-agent bridge proxy', async () => {
    localStorage.setItem('superadmin_dev_agent_provider', 'codex');
    const { SimpleGeneration } = await import('../SimpleGeneration');
    const route: AgentExecutionRoute = {
      slot: 'primary',
      provider: 'openrouter',
      modelId: 'canonical-plan-model',
      endpoint: 'https://example.test/chat/completions',
      apiKey: 'canonical-plan-key',
      keySource: 'test.primary',
      reason: 'unit-test canonical route',
    };
    const planJson = JSON.stringify({
      appName: 'Bridge fallback planner',
      summary: 'Fallback stayed inside standard flow.',
      pages: ['Home'],
      steps: [{ id: 'think', label: 'Analyze request' }],
      assumptions: [],
    });

    llmProxyMock.llmFetchStream.mockResolvedValue(makeStreamingResponse(planJson));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    try {
      const plan = await SimpleGeneration.generatePlan({
        intent: 'build a planner',
        userLang: 'en',
        apiKey: route.apiKey,
        route,
      });

      expect(plan.appName).toBe('Bridge fallback planner');
      expect(plan.summary).toBe('Fallback stayed inside standard flow.');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(llmProxyMock.llmFetchStream).toHaveBeenCalledWith(
        route.endpoint,
        expect.objectContaining({
          Authorization: `Bearer ${route.apiKey}`,
        }),
        expect.stringContaining(`"model":"${route.modelId}"`),
        expect.any(AbortSignal),
      );
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('bridge unavailable'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('Dual-routing regression guard: analyzeImageWithVision requires specRoute', () => {
  beforeEach(() => {
    localStorage.clear();
    setProviderKey('openrouter', 'or-key');
    setAgentConfigRaw('agent_primary', 'openrouter', 'primary-model');
    setAgentConfigRaw('agent_build',   'openrouter', 'build-model');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('run() with image attachment and no specRoute throws ROUTING VIOLATION before any LLM call', async () => {
    const { SimpleGeneration } = await import('../SimpleGeneration');
    const primaryRoute = resolveStandardRoute('primary');
    const buildRoute   = resolveStandardRoute('build');

    // Intercept fetch so health check passes but LLM calls never run
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('__health_preview')) {
        return Promise.resolve({ ok: true });
      }
      if (typeof url === 'string' && url.includes('__read_all_preview')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: {} }) });
      }
      return Promise.reject(new Error('unexpected fetch in test'));
    });

    try {
      await expect(
        (SimpleGeneration as unknown as { run: (c: object) => Promise<unknown> }).run({
          intent:       'test with image',
          history:      [],
          files:        {},
          primaryRoute,
          buildRoute,
          // specRoute deliberately absent — standard path must throw ROUTING VIOLATION
          apiKey:       'dummy',
          modelId:      'dummy',
          onStream:     () => {},
          onFiles:      () => {},
          onPhase:      () => {},
          onLog:        () => {},
          onPlan:       () => {},
          attachments:  [{ type: 'image', name: 'test.png', data: 'data:image/png;base64,abc', mimeType: 'image/png' }],
        }),
      ).rejects.toThrow('ROUTING VIOLATION');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('resolveStandardRoute("spec") produces a complete route for vision analysis', () => {
    setAgentConfigRaw('agent_spec', 'openrouter', 'vision-model');
    const specRoute = resolveStandardRoute('spec');
    expect(specRoute.slot).toBe('spec');
    expect(specRoute.modelId).toBe('vision-model');
    expect(specRoute.apiKey).toBe('or-key');
    expect(specRoute.endpoint).toBeTruthy();
  });
});

describe('Dual-routing regression guard: PipelineRunConfig includes specRoute', () => {
  it('PipelineRunConfig type accepts specRoute field (compile-time contract)', async () => {
    setProviderKey('openrouter', 'or-key');
    setAgentConfigRaw('agent_spec', 'openrouter', 'spec-model');
    setAgentConfigRaw('agent_primary', 'openrouter', 'primary-model');
    setAgentConfigRaw('agent_build',   'openrouter', 'build-model');
    setAgentConfigRaw('agent_fix',     'openrouter', 'fix-model');

    const primaryRoute = resolveStandardRoute('primary');
    const buildRoute   = resolveStandardRoute('build');
    const specRoute    = resolveStandardRoute('spec');

    const { SimpleGeneration } = await import('../SimpleGeneration');
    type RunConfig = Parameters<typeof SimpleGeneration.run>[0];

    // Construct config object including specRoute — verifies the field exists in the type.
    const config: Partial<RunConfig> = {
      primaryRoute,
      buildRoute,
      specRoute,
    };

    expect(config.specRoute).toBe(specRoute);
    expect(config.specRoute?.slot).toBe('spec');
    expect(config.specRoute?.modelId).toBe('spec-model');
  });
});

describe('Execute-first regression guard: accepted artifacts do not detour through QA reviewer', () => {
  it('standard run stays on candidate execution path without any qa ConfigService re-resolution', async () => {
    const { SimpleGeneration } = await import('../SimpleGeneration');
    const { revisionManager } = await import('../RevisionManager');
    const { VisualQualityService } = await import('../benchmark/VisualQualityService');
    const WhiteScreenDetectorModule = await import('../WhiteScreenDetector');

    const primaryRoute: AgentExecutionRoute = {
      slot: 'primary',
      provider: 'openrouter',
      modelId: 'primary-canonical',
      endpoint: 'https://example.test/primary',
      apiKey: 'primary-key',
      keySource: 'test.primary',
      reason: 'test primary route',
    };
    const buildRoute: AgentExecutionRoute = {
      slot: 'build',
      provider: 'openrouter',
      modelId: 'build-canonical',
      endpoint: 'https://example.test/build',
      apiKey: 'build-key',
      keySource: 'test.build',
      reason: 'test build route',
    };
    const fixRoute: AgentExecutionRoute = {
      slot: 'fix',
      provider: 'openrouter',
      modelId: 'fix-canonical',
      endpoint: 'https://example.test/fix',
      apiKey: 'fix-key',
      keySource: 'test.fix',
      reason: 'test fix route',
    };
    const qaRoute: AgentExecutionRoute = {
      slot: 'qa',
      provider: 'openrouter',
      modelId: 'qa-canonical',
      endpoint: 'https://example.test/qa',
      apiKey: 'qa-key',
      keySource: 'test.qa',
      reason: 'test qa route',
    };

    const prebuiltPlan = {
      appName: 'QA Routed App',
      description: 'integration test plan',
      theme: 'dark-slate',
      layout: { type: 'single', navigation: 'none' },
      pages: [
        {
          path: '/',
          name: 'Home',
          file: 'App.tsx',
          purpose: 'Landing screen',
          isMainScreen: true,
        },
      ],
      shadcnComponents: [],
      icons: [],
    };

    const coderArtifact = JSON.stringify({
      artifact: {
        entry: 'src/App.tsx',
        files: [
          {
            path: 'src/Poison.tsx',
            content: JSON.stringify({
              artifact: {
                entry: 'src/App.tsx',
                files: [
                  {
                    path: 'src/App.tsx',
                    content: 'export default function App() { return <main>Nested</main>; }',
                  },
                ],
              },
            }),
          },
          {
            path: 'src/App.tsx',
            content: 'export default function App() { return <main>Hello</main>; }',
          },
        ],
      },
    });

    llmProxyMock.llmFetchStream
      .mockResolvedValueOnce(makeStreamingResponse('{"technicalBlueprint":{"stack":["react"]}}'))
      .mockResolvedValueOnce(makeStreamingResponse(coderArtifact));

    vi.spyOn(revisionManager, 'fullClearPreview').mockResolvedValue(undefined);
    vi.spyOn(revisionManager, 'compileCandidate').mockResolvedValue({ success: true, attempts: 1 });
    vi.spyOn(WhiteScreenDetectorModule, 'runFinalLivePreviewCheck').mockResolvedValue(
      makePassedFinalCheckResult(),
    );
    vi.spyOn(revisionManager, 'promote').mockResolvedValue(undefined);
    vi.spyOn(VisualQualityService, 'evaluate').mockReturnValue({
      verdict: 'acceptable',
      band: 'medium',
      score: 72,
      reasons: ['test fixture'],
      dimensions: [],
    });

    const resolveModelSpy = vi.spyOn(ConfigService, 'resolveModel');
    const getKeyForAgentSpy = vi.spyOn(ConfigService, 'getKeyForAgent');
    const getAgentConfigSpy = vi.spyOn(ConfigService, 'getAgentConfig');

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url !== 'string') {
        return Promise.reject(new Error('unexpected non-string fetch url'));
      }
      if (url.includes('__health_preview')) {
        return Promise.resolve({ ok: true });
      }
      if (url.includes('__read_all_preview')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: {} }) });
      }
      if (url.includes('__read_preview?path=themes/')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      if (url.includes('/dev-agent-mode')) {
        return Promise.reject(new Error('dev-agent-mode unavailable in test'));
      }
      return Promise.reject(new Error(`unexpected fetch in test: ${url}`));
    });

    try {
      const result = await SimpleGeneration.run({
        intent: 'build a reviewed landing page',
        history: [],
        files: {},
        primaryRoute,
        buildRoute,
        fixRoute,
        qaRoute,
        apiKey: buildRoute.apiKey,
        modelId: buildRoute.modelId,
        fixModelId: fixRoute.modelId,
        onStream: () => {},
        onFiles: () => {},
        onPhase: () => {},
        onLog: () => {},
        onPlan: () => {},
        singlePageSafeMode: true,
        generationMode: 'landing',
        prebuiltPlan,
      });

      expect(result.status).toBe('complete');
      expect(llmProxyMock.llmFetch).not.toHaveBeenCalled();
      expect(resolveModelSpy.mock.calls.filter(([slot]) => slot === 'qa')).toHaveLength(0);
      expect(getKeyForAgentSpy.mock.calls.filter(([slot]) => slot === 'qa')).toHaveLength(0);
      expect(getAgentConfigSpy.mock.calls.filter(([agentKey]) => agentKey === 'agent_qa')).toHaveLength(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('standard run closes the semantic retry loop: broken first artifact, valid retry, no reviewer-first fail', async () => {
    const { SimpleGeneration } = await import('../SimpleGeneration');
    const { revisionManager } = await import('../RevisionManager');
    const { VisualQualityService } = await import('../benchmark/VisualQualityService');
    const WhiteScreenDetectorModule = await import('../WhiteScreenDetector');

    const primaryRoute: AgentExecutionRoute = {
      slot: 'primary',
      provider: 'openrouter',
      modelId: 'primary-canonical',
      endpoint: 'https://example.test/primary',
      apiKey: 'primary-key',
      keySource: 'test.primary',
      reason: 'test primary route',
    };
    const buildRoute: AgentExecutionRoute = {
      slot: 'build',
      provider: 'openrouter',
      modelId: 'build-canonical',
      endpoint: 'https://example.test/build',
      apiKey: 'build-key',
      keySource: 'test.build',
      reason: 'test build route',
    };
    const fixRoute: AgentExecutionRoute = {
      slot: 'fix',
      provider: 'openrouter',
      modelId: 'fix-canonical',
      endpoint: 'https://example.test/fix',
      apiKey: 'fix-key',
      keySource: 'test.fix',
      reason: 'test fix route',
    };
    const qaRoute: AgentExecutionRoute = {
      slot: 'qa',
      provider: 'openrouter',
      modelId: 'qa-canonical',
      endpoint: 'https://example.test/qa',
      apiKey: '',
      keySource: 'test.qa',
      reason: 'test qa route',
    };

    const prebuiltPlan = {
      appName: 'Semantic Retry App',
      description: 'integration test plan',
      theme: 'dark-slate',
      layout: { type: 'single', navigation: 'none' },
      pages: [
        {
          path: '/',
          name: 'Home',
          file: 'App.tsx',
          purpose: 'Landing screen',
          isMainScreen: true,
        },
      ],
      shadcnComponents: [],
      icons: [],
    };

    const poisonedArtifact = JSON.stringify({
      artifact: {
        entry: 'src/App.tsx',
        files: [
          {
            path: 'src/App.tsx',
            content: JSON.stringify({
              artifact: {
                entry: 'src/App.tsx',
                files: [
                  {
                    path: 'src/App.tsx',
                    content: 'plain text that is not real code and should force retry',
                  },
                ],
                content: 'x',
              },
            }),
          },
        ],
      },
    });
    const validRetryArtifact = JSON.stringify({
      artifact: {
        entry: 'src/App.tsx',
        files: [
          {
            path: 'src/App.tsx',
            content: 'export default function App() { return <main>Recovered on retry</main>; }',
          },
        ],
      },
    });

    llmProxyMock.llmFetchStream
      .mockResolvedValueOnce(makeStreamingResponse('{"technicalBlueprint":{"stack":["react"]}}'))
      .mockResolvedValueOnce(makeStreamingResponse(poisonedArtifact))
      .mockResolvedValueOnce(makeStreamingResponse(validRetryArtifact));

    vi.spyOn(revisionManager, 'fullClearPreview').mockResolvedValue(undefined);
    vi.spyOn(revisionManager, 'compileCandidate').mockResolvedValue({ success: true, attempts: 1 });
    vi.spyOn(WhiteScreenDetectorModule, 'runFinalLivePreviewCheck').mockResolvedValue(
      makePassedFinalCheckResult(),
    );
    vi.spyOn(revisionManager, 'promote').mockResolvedValue(undefined);
    vi.spyOn(VisualQualityService, 'evaluate').mockReturnValue({
      verdict: 'acceptable',
      band: 'medium',
      score: 72,
      reasons: ['test fixture'],
      dimensions: [],
    });

    const logs: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url !== 'string') {
        return Promise.reject(new Error('unexpected non-string fetch url'));
      }
      if (url.includes('__health_preview')) {
        return Promise.resolve({ ok: true });
      }
      if (url.includes('__read_all_preview')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: {} }) });
      }
      if (url.includes('__read_preview?path=themes/')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      if (url.includes('/dev-agent-mode')) {
        return Promise.reject(new Error('dev-agent-mode unavailable in test'));
      }
      return Promise.reject(new Error(`unexpected fetch in test: ${url}`));
    });

    try {
      const result = await SimpleGeneration.run({
        intent: 'build an app that succeeds on semantic retry',
        history: [],
        files: {},
        primaryRoute,
        buildRoute,
        fixRoute,
        qaRoute,
        apiKey: buildRoute.apiKey,
        modelId: buildRoute.modelId,
        fixModelId: fixRoute.modelId,
        onStream: () => {},
        onFiles: () => {},
        onPhase: () => {},
        onLog: (msg) => logs.push(msg),
        onPlan: () => {},
        singlePageSafeMode: true,
        generationMode: 'landing',
        prebuiltPlan,
      });

      expect(result.status).toBe('complete');
      expect(llmProxyMock.llmFetchStream).toHaveBeenCalledTimes(3);
      expect(llmProxyMock.llmFetch).not.toHaveBeenCalled();
      expect(logs.some(msg => msg.includes('Artifact ingress issue'))).toBe(true);
      expect(logs.some(msg => msg.includes('retrying with explicit format instruction'))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('standard run returns a classified failure when retry artifact is still semantically broken', async () => {
    const { SimpleGeneration } = await import('../SimpleGeneration');
    const { revisionManager } = await import('../RevisionManager');
    const { VisualQualityService } = await import('../benchmark/VisualQualityService');

    const primaryRoute: AgentExecutionRoute = {
      slot: 'primary',
      provider: 'openrouter',
      modelId: 'primary-canonical',
      endpoint: 'https://example.test/primary',
      apiKey: 'primary-key',
      keySource: 'test.primary',
      reason: 'test primary route',
    };
    const buildRoute: AgentExecutionRoute = {
      slot: 'build',
      provider: 'openrouter',
      modelId: 'build-canonical',
      endpoint: 'https://example.test/build',
      apiKey: 'build-key',
      keySource: 'test.build',
      reason: 'test build route',
    };
    const fixRoute: AgentExecutionRoute = {
      slot: 'fix',
      provider: 'openrouter',
      modelId: 'fix-canonical',
      endpoint: 'https://example.test/fix',
      apiKey: 'fix-key',
      keySource: 'test.fix',
      reason: 'test fix route',
    };
    const qaRoute: AgentExecutionRoute = {
      slot: 'qa',
      provider: 'openrouter',
      modelId: 'qa-canonical',
      endpoint: 'https://example.test/qa',
      apiKey: '',
      keySource: 'test.qa',
      reason: 'test qa route',
    };

    const prebuiltPlan = {
      appName: 'Semantic Retry Fails App',
      description: 'integration test plan',
      theme: 'dark-slate',
      layout: { type: 'single', navigation: 'none' },
      pages: [
        {
          path: '/',
          name: 'Home',
          file: 'App.tsx',
          purpose: 'Landing screen',
          isMainScreen: true,
        },
      ],
      shadcnComponents: [],
      icons: [],
    };

    const poisonedArtifact = JSON.stringify({
      artifact: {
        entry: 'src/App.tsx',
        files: [
          {
            path: 'src/App.tsx',
            content: JSON.stringify({
              artifact: {
                entry: 'src/App.tsx',
                files: [
                  {
                    path: 'src/App.tsx',
                    content: 'plain text that is not real code and should force classified failure',
                  },
                ],
                content: 'x',
              },
            }),
          },
        ],
      },
    });

    llmProxyMock.llmFetchStream
      .mockResolvedValueOnce(makeStreamingResponse('{"technicalBlueprint":{"stack":["react"]}}'))
      .mockResolvedValueOnce(makeStreamingResponse(poisonedArtifact))
      .mockResolvedValueOnce(makeStreamingResponse(poisonedArtifact));

    vi.spyOn(revisionManager, 'fullClearPreview').mockResolvedValue(undefined);
    vi.spyOn(revisionManager, 'compileCandidate').mockResolvedValue({ success: true, attempts: 1 });
    vi.spyOn(revisionManager, 'promote').mockResolvedValue(undefined);
    vi.spyOn(VisualQualityService, 'evaluate').mockReturnValue({
      verdict: 'acceptable',
      band: 'medium',
      score: 72,
      reasons: ['test fixture'],
      dimensions: [],
    });

    const logs: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url !== 'string') {
        return Promise.reject(new Error('unexpected non-string fetch url'));
      }
      if (url.includes('__health_preview')) {
        return Promise.resolve({ ok: true });
      }
      if (url.includes('__read_all_preview')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: {} }) });
      }
      if (url.includes('__read_preview?path=themes/')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      if (url.includes('/dev-agent-mode')) {
        return Promise.reject(new Error('dev-agent-mode unavailable in test'));
      }
      return Promise.reject(new Error(`unexpected fetch in test: ${url}`));
    });

    try {
      const result = await SimpleGeneration.run({
        intent: 'build an app that stays semantically broken after retry',
        history: [],
        files: {},
        primaryRoute,
        buildRoute,
        fixRoute,
        qaRoute,
        apiKey: buildRoute.apiKey,
        modelId: buildRoute.modelId,
        fixModelId: fixRoute.modelId,
        onStream: () => {},
        onFiles: () => {},
        onPhase: () => {},
        onLog: (msg) => logs.push(msg),
        onPlan: () => {},
        singlePageSafeMode: true,
        generationMode: 'landing',
        prebuiltPlan,
      });

      expect(result.status).toBe('failed');
      expect(result.message).toContain('ARTIFACT_POISONED_ENVELOPE');
      expect(llmProxyMock.llmFetchStream).toHaveBeenCalledTimes(3);
      expect(llmProxyMock.llmFetch).not.toHaveBeenCalled();
      expect(logs.some(msg => msg.includes('Artifact ingress failed after retry'))).toBe(true);
      expect(result.message).not.toContain('REVIEWER_FAIL: 0 files');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
