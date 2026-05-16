import { supabase } from '../lib/supabase';
import { ConfigService } from './ConfigService';
import type { AgentConfig, ApiProvider } from './ConfigService';

type AgentSetting = {
  provider?: ApiProvider;
  modelId?: string;
};

type ProviderKeyRef = {
  source: 'user';
  configured: boolean;
};

export type UserDefaultSettings = {
  version: 1;
  userId: string;
  updatedAt: string;
  selectedModel?: string;
  engineModel?: string;
  autoRoute?: boolean;
  fullContext?: boolean;
  agentConfigs?: Record<string, AgentSetting>;
  providerKeyRefs?: Record<string, ProviderKeyRef>;
};

export type ProjectSettingsOverride = {
  version: 1;
  userId: string;
  projectId: string;
  updatedAt: string;
  selectedModel?: string;
  engineModel?: string;
  autoRoute?: boolean;
  fullContext?: boolean;
  agentConfigs?: Record<string, AgentSetting>;
};

export type EffectiveSettings = {
  selectedModel?: string;
  engineModel?: string;
  autoRoute?: boolean;
  fullContext?: boolean;
  agentConfigs?: Record<string, AgentSetting>;
  providerKeyRefs?: Record<string, ProviderKeyRef>;
};

const VERSION = 1 as const;
const LOCAL_USER_NAMESPACE = 'local';
const KNOWN_AGENT_IDS = ['agent_primary', 'agent_fix', 'agent_spec', 'agent_build', 'agent_qa'];
const KNOWN_PROVIDERS: readonly ApiProvider[] = ['openrouter', 'anthropic', 'openai', 'google', 'deepseek', 'mistral', 'groq'];

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeProvider(value: unknown): ApiProvider | undefined {
  const normalized = normalizeString(value);
  if (!normalized) return undefined;
  if (!KNOWN_PROVIDERS.includes(normalized as ApiProvider)) return undefined;
  return normalized as ApiProvider;
}

function normalizeAgentSetting(raw: unknown): AgentSetting | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const provider = normalizeProvider(record.provider);
  const modelId = normalizeString(record.modelId);
  if (!provider && !modelId) return null;
  return {
    ...(provider !== undefined && { provider }),
    ...(modelId !== undefined && { modelId }),
  };
}

function normalizeAgentSettingsMap(raw: unknown): Record<string, AgentSetting> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as Record<string, unknown>;
  const entries = Object.entries(record)
    .map(([agentId, value]) => [agentId, normalizeAgentSetting(value)] as const)
    .filter(([, value]) => value !== null);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries) as Record<string, AgentSetting>;
}

function normalizeUserNamespace(userId: string | null | undefined): string {
  const normalized = normalizeString(userId);
  return normalized ?? LOCAL_USER_NAMESPACE;
}

function userSettingsKey(userId: string | null | undefined): string {
  return `AIC_USER_SETTINGS_${normalizeUserNamespace(userId)}`;
}

function projectSettingsKey(userId: string | null | undefined, projectId: string): string {
  return `AIC_PROJECT_SETTINGS_${normalizeUserNamespace(userId)}_${projectId}`;
}

function getStorageValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStorageValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // non-fatal on quota / storage denial
  }
}

function readSelectedModel(): string | undefined {
  const explicit = normalizeString(getStorageValue('SELECTED_MODEL'));
  if (explicit) return explicit;
  return normalizeString(ConfigService.resolveModel('chat'));
}

function setSelectedModel(value: string): void {
  setStorageValue('SELECTED_MODEL', value);
}

function readAgentSettingsFromConfig(): Record<string, AgentSetting> | undefined {
  const collected = new Map<string, AgentSetting>();

  for (const agentId of KNOWN_AGENT_IDS) {
    const cfg = ConfigService.getAgentConfig(agentId);
    const normalized = normalizeAgentSetting(cfg);
    if (normalized) collected.set(agentId, normalized);
  }

  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('AGENT_CONFIG_')) continue;
      const agentId = key.slice('AGENT_CONFIG_'.length);
      if (!agentId) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as unknown;
      const normalized = normalizeAgentSetting(parsed);
      if (normalized) collected.set(agentId, normalized);
    }
  } catch {
    // ignore malformed/blocked localStorage reads
  }

  if (collected.size === 0) return undefined;
  return Object.fromEntries(collected.entries());
}

function readProviderKeyRefs(): Record<string, ProviderKeyRef> | undefined {
  const entries: Array<[string, ProviderKeyRef]> = [];
  for (const provider of KNOWN_PROVIDERS) {
    const configured = Boolean(ConfigService.getProviderKey(provider).trim());
    entries.push([provider, { source: 'user', configured }]);
  }
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeEffectiveAgentConfigs(
  defaults: Record<string, AgentSetting> | undefined,
  overrides: Record<string, AgentSetting> | undefined,
): Record<string, AgentSetting> | undefined {
  const keys = new Set<string>([
    ...Object.keys(defaults ?? {}),
    ...Object.keys(overrides ?? {}),
  ]);
  if (keys.size === 0) return undefined;

  const merged: Record<string, AgentSetting> = {};
  for (const key of keys) {
    const def = defaults?.[key];
    const over = overrides?.[key];
    const provider = normalizeProvider(over?.provider ?? def?.provider);
    const modelId = normalizeString(over?.modelId ?? def?.modelId);
    if (!provider && !modelId) continue;
    merged[key] = {
      ...(provider !== undefined && { provider }),
      ...(modelId !== undefined && { modelId }),
    };
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function parseUserDefaults(raw: string | null): UserDefaultSettings | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const userId = normalizeString(parsed.userId);
    if (!userId) return null;
    return {
      version: VERSION,
      userId,
      updatedAt: normalizeString(parsed.updatedAt) ?? new Date().toISOString(),
      ...(normalizeString(parsed.selectedModel) !== undefined && { selectedModel: normalizeString(parsed.selectedModel) }),
      ...(normalizeString(parsed.engineModel) !== undefined && { engineModel: normalizeString(parsed.engineModel) }),
      ...(typeof parsed.autoRoute === 'boolean' && { autoRoute: parsed.autoRoute }),
      ...(typeof parsed.fullContext === 'boolean' && { fullContext: parsed.fullContext }),
      ...(normalizeAgentSettingsMap(parsed.agentConfigs) !== undefined && { agentConfigs: normalizeAgentSettingsMap(parsed.agentConfigs) }),
      ...(parsed.providerKeyRefs && typeof parsed.providerKeyRefs === 'object'
        ? {
            providerKeyRefs: Object.fromEntries(
              Object.entries(parsed.providerKeyRefs as Record<string, unknown>).map(([provider, refRaw]) => {
                const ref = refRaw && typeof refRaw === 'object' ? (refRaw as Record<string, unknown>) : {};
                return [
                  provider,
                  {
                    source: 'user' as const,
                    configured: Boolean(ref.configured),
                  },
                ];
              }),
            ),
          }
        : {}),
    };
  } catch {
    return null;
  }
}

function parseProjectOverride(raw: string | null): ProjectSettingsOverride | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const userId = normalizeString(parsed.userId);
    const projectId = normalizeString(parsed.projectId);
    if (!userId || !projectId) return null;
    return {
      version: VERSION,
      userId,
      projectId,
      updatedAt: normalizeString(parsed.updatedAt) ?? new Date().toISOString(),
      ...(normalizeString(parsed.selectedModel) !== undefined && { selectedModel: normalizeString(parsed.selectedModel) }),
      ...(normalizeString(parsed.engineModel) !== undefined && { engineModel: normalizeString(parsed.engineModel) }),
      ...(typeof parsed.autoRoute === 'boolean' && { autoRoute: parsed.autoRoute }),
      ...(typeof parsed.fullContext === 'boolean' && { fullContext: parsed.fullContext }),
      ...(normalizeAgentSettingsMap(parsed.agentConfigs) !== undefined && { agentConfigs: normalizeAgentSettingsMap(parsed.agentConfigs) }),
    };
  } catch {
    return null;
  }
}

function saveJson(key: string, value: object): void {
  setStorageValue(key, JSON.stringify(value));
}

export const UserProjectSettingsService = {
  async getCurrentUserId(): Promise<string | null> {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) return null;
      return normalizeString(data.user?.id) ?? null;
    } catch {
      return null;
    }
  },

  loadUserDefaults(userId?: string): UserDefaultSettings | null {
    return parseUserDefaults(getStorageValue(userSettingsKey(userId)));
  },

  saveUserDefaults(settings: UserDefaultSettings): void {
    const userId = normalizeUserNamespace(settings.userId);
    const sanitized: UserDefaultSettings = {
      ...settings,
      version: VERSION,
      userId,
      updatedAt: settings.updatedAt || new Date().toISOString(),
      ...(normalizeAgentSettingsMap(settings.agentConfigs) !== undefined && {
        agentConfigs: normalizeAgentSettingsMap(settings.agentConfigs),
      }),
      ...(settings.providerKeyRefs && {
        providerKeyRefs: Object.fromEntries(
          Object.entries(settings.providerKeyRefs).map(([provider, ref]) => [
            provider,
            { source: 'user', configured: Boolean(ref?.configured) },
          ]),
        ),
      }),
    };
    saveJson(userSettingsKey(userId), sanitized);
  },

  loadProjectOverride(userId: string | null, projectId: string): ProjectSettingsOverride | null {
    if (!normalizeString(projectId)) return null;
    return parseProjectOverride(getStorageValue(projectSettingsKey(userId, projectId)));
  },

  saveProjectOverride(settings: ProjectSettingsOverride): void {
    const userId = normalizeUserNamespace(settings.userId);
    const projectId = normalizeString(settings.projectId);
    if (!projectId) return;
    const sanitized: ProjectSettingsOverride = {
      ...settings,
      version: VERSION,
      userId,
      projectId,
      updatedAt: settings.updatedAt || new Date().toISOString(),
      ...(normalizeAgentSettingsMap(settings.agentConfigs) !== undefined && {
        agentConfigs: normalizeAgentSettingsMap(settings.agentConfigs),
      }),
    };
    saveJson(projectSettingsKey(userId, projectId), sanitized);
  },

  resolveEffectiveSettings(userId: string | null, projectId: string): EffectiveSettings {
    const defaults = this.loadUserDefaults(normalizeUserNamespace(userId));
    const override = this.loadProjectOverride(userId, projectId);

    return {
      selectedModel: normalizeString(override?.selectedModel ?? defaults?.selectedModel),
      engineModel: normalizeString(override?.engineModel ?? defaults?.engineModel),
      ...(override?.autoRoute !== undefined
        ? { autoRoute: override.autoRoute }
        : defaults?.autoRoute !== undefined
          ? { autoRoute: defaults.autoRoute }
          : {}),
      ...(override?.fullContext !== undefined
        ? { fullContext: override.fullContext }
        : defaults?.fullContext !== undefined
          ? { fullContext: defaults.fullContext }
          : {}),
      ...(normalizeEffectiveAgentConfigs(defaults?.agentConfigs, override?.agentConfigs) !== undefined && {
        agentConfigs: normalizeEffectiveAgentConfigs(defaults?.agentConfigs, override?.agentConfigs),
      }),
      ...(defaults?.providerKeyRefs !== undefined && { providerKeyRefs: defaults.providerKeyRefs }),
    };
  },

  captureCurrentAsUserDefaults(userId: string | null): UserDefaultSettings {
    const normalizedUserId = normalizeUserNamespace(userId);
    return {
      version: VERSION,
      userId: normalizedUserId,
      updatedAt: new Date().toISOString(),
      ...(readSelectedModel() !== undefined && { selectedModel: readSelectedModel() }),
      ...(normalizeString(ConfigService.getEngineModel()) !== undefined && { engineModel: normalizeString(ConfigService.getEngineModel()) }),
      autoRoute: ConfigService.getAutoRoute(),
      fullContext: ConfigService.getFullContext(),
      ...(readAgentSettingsFromConfig() !== undefined && { agentConfigs: readAgentSettingsFromConfig() }),
      ...(readProviderKeyRefs() !== undefined && { providerKeyRefs: readProviderKeyRefs() }),
    };
  },

  captureCurrentAsProjectOverride(userId: string | null, projectId: string): ProjectSettingsOverride {
    const normalizedUserId = normalizeUserNamespace(userId);
    return {
      version: VERSION,
      userId: normalizedUserId,
      projectId,
      updatedAt: new Date().toISOString(),
      ...(readSelectedModel() !== undefined && { selectedModel: readSelectedModel() }),
      ...(normalizeString(ConfigService.getEngineModel()) !== undefined && { engineModel: normalizeString(ConfigService.getEngineModel()) }),
      autoRoute: ConfigService.getAutoRoute(),
      fullContext: ConfigService.getFullContext(),
      ...(readAgentSettingsFromConfig() !== undefined && { agentConfigs: readAgentSettingsFromConfig() }),
    };
  },

  applyEffectiveSettings(userId: string | null, projectId: string): boolean {
    const effective = this.resolveEffectiveSettings(userId, projectId);
    const hasSettings =
      effective.selectedModel !== undefined
      || effective.engineModel !== undefined
      || effective.autoRoute !== undefined
      || effective.fullContext !== undefined
      || (effective.agentConfigs !== undefined && Object.keys(effective.agentConfigs).length > 0);
    if (!hasSettings) return false;

    if (effective.selectedModel !== undefined) {
      setSelectedModel(effective.selectedModel);
    }
    if (effective.engineModel !== undefined) {
      const currentEngineModel = normalizeString(ConfigService.getEngineModel());
      if (currentEngineModel !== effective.engineModel) {
        ConfigService.setEngineModel(effective.engineModel);
      }
    }
    if (effective.autoRoute !== undefined) {
      if (ConfigService.getAutoRoute() !== effective.autoRoute) {
        ConfigService.setAutoRoute(effective.autoRoute);
      }
    }
    if (effective.fullContext !== undefined) {
      if (ConfigService.getFullContext() !== effective.fullContext) {
        ConfigService.setFullContext(effective.fullContext);
      }
    }

    if (effective.agentConfigs) {
      for (const [agentId, agentSettings] of Object.entries(effective.agentConfigs)) {
        const current = ConfigService.getAgentConfig(agentId);
        const nextProvider = normalizeProvider(agentSettings.provider);
        const shouldUpdateProvider =
          nextProvider !== undefined && normalizeProvider(current.provider) !== nextProvider;
        const shouldUpdateModel =
          agentSettings.modelId !== undefined && normalizeString(current.modelId) !== normalizeString(agentSettings.modelId);
        if (!shouldUpdateProvider && !shouldUpdateModel) continue;
        const next: AgentConfig = {
          ...current,
          ...(nextProvider !== undefined && { provider: nextProvider }),
          ...(agentSettings.modelId !== undefined && { modelId: agentSettings.modelId }),
        };
        ConfigService.setAgentConfig(agentId, next);
      }
    }

    return true;
  },
};
