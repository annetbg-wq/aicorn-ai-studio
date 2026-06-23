// @vitest-environment jsdom
/**
 * ProtoPipelineFallbackRoute.test.ts
 *
 * Regression test for the coder/build model-unavailable fallback.
 *
 * Bug history (verified live via CDP browser run, 2026-06-23):
 *   The build slot's primary model (a dead backend-default id) returned HTTP 404
 *   from OpenRouter, and the run failed instantly with no fallback — even though
 *   the slot had a valid fallback1ModelId configured. Root cause: resolveFallbackRoute
 *   short-circuited to null whenever a routeOverride was present for the slot, and
 *   GenerationEngine.buildPipelineRouteOverrides passes a resolved override for
 *   EVERY slot on every production run. The override is the resolved PRIMARY route,
 *   not a "pin this exact model, never fall back" signal — so the fallback reserve
 *   was unreachable in the real app while unit tests (which called the layer with no
 *   overrides) stayed green.
 *
 * These tests lock the corrected contract: the fallback route is derived from the
 * slot's agent config fallback1 independently of any override, with a provider-correct
 * key, and is skipped only when there is no fallback1 or it equals the primary model.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveFallbackRoute } from '../ProtoPipeline';
import { ConfigService } from '../ConfigService';
import { Orchestrator } from '../Orchestrator';

vi.mock('../../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ data: null, error: new Error('disabled') }) }) },
}));

const BUILD_CFG = {
  provider: 'openrouter',
  modelId: 'xiaomi/mimo-v2-pro',
  fallback1Provider: 'openrouter',
  fallback1ModelId: 'z-ai/glm-5.1',
};
type AgentCfg = ReturnType<typeof ConfigService.getAgentConfig>;
const asCfg = (c: typeof BUILD_CFG): AgentCfg => c as unknown as AgentCfg;

afterEach(() => vi.restoreAllMocks());

describe('resolveFallbackRoute — model-unavailable fallback (override-independent)', () => {
  it('returns the configured fallback1 route even though production always passes an override', () => {
    vi.spyOn(ConfigService, 'getAgentConfig').mockReturnValue(asCfg(BUILD_CFG));
    vi.spyOn(ConfigService, 'getProviderKey').mockReturnValue('or-key');
    vi.spyOn(Orchestrator, 'getEndpoint').mockReturnValue('https://openrouter.ai/api/v1/chat/completions');

    const route = resolveFallbackRoute('build', 'xiaomi/mimo-v2-pro');

    expect(route).not.toBeNull();
    expect(route!.modelId).toBe('z-ai/glm-5.1');
    expect(route!.provider).toBe('openrouter');
    expect(route!.sourceAuthority).toBe('fallback1');
    expect(route!.apiKey).toBe('or-key');
  });

  it('returns null when the fallback equals the primary model (retrying a dead id is pointless)', () => {
    vi.spyOn(ConfigService, 'getAgentConfig').mockReturnValue(asCfg({ ...BUILD_CFG, fallback1ModelId: 'xiaomi/mimo-v2-pro' }));
    vi.spyOn(ConfigService, 'getProviderKey').mockReturnValue('or-key');
    vi.spyOn(Orchestrator, 'getEndpoint').mockReturnValue('https://openrouter.ai/api/v1/chat/completions');

    expect(resolveFallbackRoute('build', 'xiaomi/mimo-v2-pro')).toBeNull();
  });

  it('returns null when no fallback1 is configured', () => {
    vi.spyOn(ConfigService, 'getAgentConfig').mockReturnValue(asCfg({ ...BUILD_CFG, fallback1ModelId: '' }));
    vi.spyOn(Orchestrator, 'getEndpoint').mockReturnValue('https://openrouter.ai/api/v1/chat/completions');

    expect(resolveFallbackRoute('build', 'xiaomi/mimo-v2-pro')).toBeNull();
  });

  it('returns null when no API key resolves for the fallback provider', () => {
    vi.spyOn(ConfigService, 'getAgentConfig').mockReturnValue(asCfg(BUILD_CFG));
    vi.spyOn(ConfigService, 'getProviderKey').mockReturnValue('');
    vi.spyOn(ConfigService, 'getApiKey').mockReturnValue('');
    vi.spyOn(Orchestrator, 'getEndpoint').mockReturnValue('https://openrouter.ai/api/v1/chat/completions');

    expect(resolveFallbackRoute('build', 'xiaomi/mimo-v2-pro')).toBeNull();
  });
});
