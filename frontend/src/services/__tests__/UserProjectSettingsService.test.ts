// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseGetUser = vi.hoisted(() => vi.fn());
const configSetEngineModel = vi.hoisted(() => vi.fn());
const configSetAutoRoute = vi.hoisted(() => vi.fn());
const configSetFullContext = vi.hoisted(() => vi.fn());
const configSetAgentConfig = vi.hoisted(() => vi.fn());
const configState = vi.hoisted(() => ({
  engineModel: 'engine-default',
  autoRoute: true,
  fullContext: true,
  providerKeys: {
    openrouter: '',
    anthropic: '',
    openai: 'sk-live-openai-secret',
    google: '',
    deepseek: '',
    mistral: '',
    groq: '',
  } as Record<string, string>,
  agentConfigs: {
    agent_primary: { provider: 'openrouter', modelId: 'openai/gpt-4o-mini' },
    agent_fix: { provider: 'openrouter', modelId: 'openai/gpt-4o-mini' },
    agent_spec: { provider: 'google', modelId: 'gemini-1.5-pro' },
    agent_build: { provider: 'openrouter', modelId: 'deepseek-v3' },
    agent_qa: { provider: 'anthropic', modelId: 'claude-3-5-sonnet' },
  } as Record<string, { provider?: string; modelId?: string }>,
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: supabaseGetUser,
    },
  },
}));

vi.mock('../ConfigService', () => ({
  ConfigService: {
    resolveModel: vi.fn(() => 'openai/gpt-4o-mini'),
    getEngineModel: vi.fn(() => configState.engineModel),
    setEngineModel: configSetEngineModel,
    getAutoRoute: vi.fn(() => configState.autoRoute),
    setAutoRoute: configSetAutoRoute,
    getFullContext: vi.fn(() => configState.fullContext),
    setFullContext: configSetFullContext,
    getProviderKey: vi.fn((provider: string) => configState.providerKeys[provider] ?? ''),
    getAgentConfig: vi.fn((agentId: string) => ({
      provider: configState.agentConfigs[agentId]?.provider ?? 'openrouter',
      modelId: configState.agentConfigs[agentId]?.modelId ?? '',
    })),
    setAgentConfig: configSetAgentConfig,
  },
}));

import { UserProjectSettingsService } from '../UserProjectSettingsService';

beforeEach(() => {
  localStorage.clear();
  supabaseGetUser.mockReset();
  configSetEngineModel.mockReset();
  configSetAutoRoute.mockReset();
  configSetFullContext.mockReset();
  configSetAgentConfig.mockReset();
  configState.engineModel = 'engine-default';
  configState.autoRoute = true;
  configState.fullContext = true;
  configState.providerKeys.openai = 'sk-live-openai-secret';
  configState.agentConfigs.agent_primary = { provider: 'openrouter', modelId: 'openai/gpt-4o-mini' };
});

describe('UserProjectSettingsService', () => {
  it('saves and loads user defaults by user id', () => {
    UserProjectSettingsService.saveUserDefaults({
      version: 1,
      userId: 'user-123',
      updatedAt: '2026-05-15T00:00:00.000Z',
      selectedModel: 'openai/gpt-4.1',
      autoRoute: false,
      fullContext: true,
      agentConfigs: {
        agent_primary: { provider: 'openai', modelId: 'gpt-4.1' },
      },
      providerKeyRefs: {
        openai: { source: 'user', configured: true },
      },
    });

    const loaded = UserProjectSettingsService.loadUserDefaults('user-123');
    expect(loaded).toMatchObject({
      userId: 'user-123',
      selectedModel: 'openai/gpt-4.1',
      autoRoute: false,
      fullContext: true,
      agentConfigs: {
        agent_primary: { provider: 'openai', modelId: 'gpt-4.1' },
      },
      providerKeyRefs: {
        openai: { source: 'user', configured: true },
      },
    });
    expect(localStorage.getItem('AIC_USER_SETTINGS_user-123')).toBeTruthy();
  });

  it('saves and loads project overrides by project id', () => {
    UserProjectSettingsService.saveProjectOverride({
      version: 1,
      userId: 'user-123',
      projectId: 'project-1',
      updatedAt: '2026-05-15T00:00:00.000Z',
      selectedModel: 'anthropic/claude-3.7-sonnet',
      autoRoute: true,
      agentConfigs: {
        agent_primary: { provider: 'anthropic', modelId: 'claude-3.7-sonnet' },
      },
    });

    const loaded = UserProjectSettingsService.loadProjectOverride('user-123', 'project-1');
    expect(loaded).toMatchObject({
      userId: 'user-123',
      projectId: 'project-1',
      selectedModel: 'anthropic/claude-3.7-sonnet',
      autoRoute: true,
      agentConfigs: {
        agent_primary: { provider: 'anthropic', modelId: 'claude-3.7-sonnet' },
      },
    });
    expect(localStorage.getItem('AIC_PROJECT_SETTINGS_user-123_project-1')).toBeTruthy();
  });

  it('merges defaults with override and lets project override win', () => {
    UserProjectSettingsService.saveUserDefaults({
      version: 1,
      userId: 'user-123',
      updatedAt: '2026-05-15T00:00:00.000Z',
      selectedModel: 'openai/gpt-4.1',
      engineModel: 'engine-default',
      autoRoute: false,
      fullContext: true,
      agentConfigs: {
        agent_primary: { provider: 'openai', modelId: 'gpt-4.1' },
      },
    });

    UserProjectSettingsService.saveProjectOverride({
      version: 1,
      userId: 'user-123',
      projectId: 'project-1',
      updatedAt: '2026-05-15T00:01:00.000Z',
      selectedModel: 'anthropic/claude-3.7-sonnet',
      autoRoute: true,
      agentConfigs: {
        agent_primary: { provider: 'anthropic' },
      },
    });

    const effective = UserProjectSettingsService.resolveEffectiveSettings('user-123', 'project-1');
    expect(effective).toMatchObject({
      selectedModel: 'anthropic/claude-3.7-sonnet',
      engineModel: 'engine-default',
      autoRoute: true,
      fullContext: true,
      agentConfigs: {
        agent_primary: { provider: 'anthropic', modelId: 'gpt-4.1' },
      },
    });
  });

  it('does not leak override between different project ids', () => {
    UserProjectSettingsService.saveProjectOverride({
      version: 1,
      userId: 'user-123',
      projectId: 'project-1',
      updatedAt: '2026-05-15T00:00:00.000Z',
      selectedModel: 'anthropic/claude-3.7-sonnet',
    });

    const otherProject = UserProjectSettingsService.loadProjectOverride('user-123', 'project-2');
    expect(otherProject).toBeNull();
  });

  it('uses local namespace when user id is missing', () => {
    const defaults = UserProjectSettingsService.captureCurrentAsUserDefaults(null);
    UserProjectSettingsService.saveUserDefaults(defaults);
    const override = UserProjectSettingsService.captureCurrentAsProjectOverride(null, 'project-local');
    UserProjectSettingsService.saveProjectOverride(override);

    expect(localStorage.getItem('AIC_USER_SETTINGS_local')).toBeTruthy();
    expect(localStorage.getItem('AIC_PROJECT_SETTINGS_local_project-local')).toBeTruthy();
  });

  it('does not store raw api keys inside project override payload', () => {
    localStorage.setItem('SELECTED_MODEL', 'openai/gpt-4o-mini');
    configState.providerKeys.openai = 'sk-live-openai-secret';

    const override = UserProjectSettingsService.captureCurrentAsProjectOverride('user-123', 'project-safe');
    UserProjectSettingsService.saveProjectOverride(override);

    const raw = localStorage.getItem('AIC_PROJECT_SETTINGS_user-123_project-safe') ?? '';
    expect(raw).not.toContain('sk-live-openai-secret');
    expect(raw).not.toContain('apiKey');
    expect(raw).not.toContain('providerKeys');
  });
});
