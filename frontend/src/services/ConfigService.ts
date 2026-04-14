// ── Public types ─────────────────────────────────────────────────────────────

import { supabase } from '../lib/supabase';

export type ApiProvider = 'openrouter' | 'anthropic' | 'openai' | 'google' | 'deepseek' | 'mistral' | 'groq';

export type AgentSlot = 'primary' | 'fix' | 'spec' | 'build' | 'qa' | 'chat';

export interface AgentConfig {
  provider:           ApiProvider;
  modelId:            string;
  // Fallback 1 — same OpenRouter, reserve model
  fallback1ModelId?:  string;
  fallback1Provider?: string;
  // Fallback 2 — native API (endpoint only — key comes from global PROVIDER_KEYS)
  fallback2Provider?: string;   // label from NATIVE_PROVIDERS (e.g. 'Anthropic', 'Custom...')
  fallback2ModelId?:  string;
  fallback2BaseUrl?:  string;
  // Per-stage max token overrides (loaded from backend/agent-config.json)
  maxTokens?:         Record<string, number>;
}

const DEFAULT_GENERAL_MODEL_ID = 'openai/gpt-4o-mini';
const DEFAULT_BUILD_MODEL_ID = 'xiaomi/mimo-v2-pro';

const AGENT_DEFAULTS: Record<string, AgentConfig> = {
  agent_primary: { provider: 'openrouter', modelId: DEFAULT_GENERAL_MODEL_ID },
  agent_fix:     { provider: 'openrouter', modelId: DEFAULT_GENERAL_MODEL_ID },
  agent_spec:    { provider: 'openrouter', modelId: DEFAULT_GENERAL_MODEL_ID },
  agent_build:   { provider: 'openrouter', modelId: DEFAULT_BUILD_MODEL_ID },
  agent_qa:      { provider: 'openrouter', modelId: DEFAULT_GENERAL_MODEL_ID },
};

/**
 * ConfigService — synchronous, immediate-write config persistence.
 *
 * All writes go to localStorage the instant a value is set (no batched
 * useEffect gap). This makes HMR and rapid page refreshes safe: any setter
 * call guarantees the value survives a reload.
 *
 * Covers every "config" field in useStudio that was previously relying on
 * a deferred useEffect to reach localStorage.
 */

// ── Key registry ─────────────────────────────────────────────────────────────

const K = {
  API_KEY:        'OPENROUTER_API_KEY',
  MODEL:          'SELECTED_MODEL',
  THEME:          'APP_THEME',
  LANGUAGE:       'APP_LANGUAGE',
  AUTO_ROUTE:     'AUTO_ROUTE',
  FULL_CONTEXT:   'FULL_CONTEXT_MODE',
  // ── Background Engine (isolated from chat) ─────────────────────────────
  ENGINE_API_KEY:        'ENGINE_API_KEY',
  ENGINE_MODEL:          'ENGINE_MODEL_ID',
  // ── Agent models ────────────────────────────────────────────────────────
  AGENT_PRIMARY_MODEL:   'AGENT_PRIMARY_MODEL',
  AGENT_FIX_MODEL:       'AGENT_FIX_MODEL',
  // ── Mobile Publishing ────────────────────────────────────────────────
  EAS_TOKEN:          'EAS_TOKEN',
  ASC_ISSUER_ID:      'ASC_ISSUER_ID',
  ASC_KEY_ID:         'ASC_KEY_ID',
  ASC_PRIVATE_KEY:    'ASC_PRIVATE_KEY',
  GOOGLE_SERVICE_ACC: 'GOOGLE_SERVICE_ACCOUNT',
} as const;

/** Maps provider ID → localStorage key */
const PROVIDER_KEYS: Record<string, string> = {
  openrouter: 'OPENROUTER_API_KEY',
  anthropic:  'ANTHROPIC_API_KEY',
  openai:     'OPENAI_API_KEY',
  google:     'GOOGLE_API_KEY',
  mistral:    'MISTRAL_API_KEY',
  deepseek:   'DEEPSEEK_API_KEY',
  groq:       'GROQ_API_KEY',
};

/**
 * Maps NATIVE_PROVIDERS labels (e.g., 'Anthropic') → provider key IDs
 * Used when resolving fallback2Provider for API key lookup.
 */
const LABEL_TO_PROVIDER: Record<string, string> = {
  'Anthropic': 'anthropic',
  'OpenAI':    'openai',
  'Google':    'google',
  'DeepSeek':  'deepseek',
  'Mistral':   'mistral',
  'Groq':      'groq',
};

/** Maps AgentSlot to the localStorage agent config key. */
const SLOT_TO_AGENT_KEY: Record<AgentSlot, string | null> = {
  primary: 'agent_primary',
  fix:     'agent_fix',
  spec:    'agent_spec',
  build:   'agent_build',
  qa:      'agent_qa',
  chat:    null,   // no dedicated chat agent — falls straight to primary
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function get(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function set(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* storage full / blocked */ }
}

// ── Service ──────────────────────────────────────────────────────────────────

export const ConfigService = {

  // ── OpenRouter API Key ────────────────────────────────────────────────────

  getApiKey(): string        { return get(K.API_KEY) ?? import.meta.env.VITE_OPENROUTER_API_KEY ?? ''; },
  setApiKey(v: string): void {
    set(K.API_KEY, v);
    if (v.trim()) void this.saveKeyToCloud(K.API_KEY, v);
    if (v.trim()) void this.saveProviderKey('openrouter', v);
  },

  // ── AI Model ─────────────────────────────────────────────────────────────

  getModel(): string         { return this.resolveModel('chat'); },
  setModel(_v: string): void { console.warn('[ConfigService] setModel deprecated, use setAgentConfig'); },

  // ── UI Theme ─────────────────────────────────────────────────────────────

  getTheme(): 'dark' | 'medium' | 'light' {
    const v = get(K.THEME);
    return (v === 'dark' || v === 'medium' || v === 'light') ? v : 'dark';
  },
  setTheme(v: string): void { set(K.THEME, v); },

  // ── Interface Language ────────────────────────────────────────────────────

  getLanguage(): string {
    const saved = get(K.LANGUAGE);
    if (saved) return saved;
    const br = (typeof navigator !== 'undefined' ? navigator.language?.slice(0, 2) : null) ?? 'en';
    return ['en', 'ru', 'es', 'de', 'fr', 'zh'].includes(br) ? br : 'en';
  },
  setLanguage(v: string): void { set(K.LANGUAGE, v); },

  // ── Auto-Route ────────────────────────────────────────────────────────────

  getAutoRoute(): boolean        { return get(K.AUTO_ROUTE) === 'true'; },
  setAutoRoute(v: boolean): void { set(K.AUTO_ROUTE, String(v)); },

  // ── Full Context Mode ─────────────────────────────────────────────────────

  /** Default true — returns false only if explicitly set to 'false'. */
  getFullContext(): boolean        { return get(K.FULL_CONTEXT) !== 'false'; },
  setFullContext(v: boolean): void { set(K.FULL_CONTEXT, String(v)); },

  // ── Background Engine config (ISOLATED from chat API key / model) ─────────
  //
  //   engineApiKey  — can be the same key or a dedicated key.
  //                   Empty = heuristic-only mode (no OpenRouter call).
  //   engineModelId — the model used exclusively for geometry validation.
  //                   Defaults to the Build Agent model when ENGINE_MODEL
  //                   is not explicitly set. Never uses the chat model.

  getEngineApiKey(): string          { return get(K.ENGINE_API_KEY) ?? ''; },
  setEngineApiKey(v: string): void   { set(K.ENGINE_API_KEY, v); },

  getEngineModel(): string           { return get(K.ENGINE_MODEL) || ConfigService.resolveModel('build'); },
  setEngineModel(v: string): void    { set(K.ENGINE_MODEL, v); },

  // ── Agent models ─────────────────────────────────────────────────────────

  getAgentPrimaryModel(): string          { return get(K.AGENT_PRIMARY_MODEL) ?? ''; },
  setAgentPrimaryModel(v: string): void   { set(K.AGENT_PRIMARY_MODEL, v); },

  getAgentFixModel(): string              { return get(K.AGENT_FIX_MODEL) ?? ''; },
  setAgentFixModel(v: string): void       { set(K.AGENT_FIX_MODEL, v); },

  // ── Global Provider API Keys ────────────────────────────────────────────

  /**
   * Generic getter — reads the localStorage key for the given provider ID.
   * provider: 'openrouter' | 'anthropic' | 'openai' | 'google' | 'mistral' | 'deepseek' | 'groq'
   */
  getProviderKey(provider: string): string {
    const storageKey = PROVIDER_KEYS[provider];
    if (!storageKey) return '';
    return get(storageKey) ?? '';
  },

  /** Generic setter — writes the given key for the provider. */
  setProviderKey(provider: string, value: string): void {
    const storageKey = PROVIDER_KEYS[provider];
    if (!storageKey) return;
    set(storageKey, value);
    if (value.trim()) void this.saveKeyToCloud(storageKey, value);
    if (value.trim()) void this.saveProviderKey(provider, value);
  },

  /**
   * Returns the API key for a given agent slot by looking up the agent's
   * configured provider and reading the corresponding global provider key.
   */
  getKeyForAgent(agentSlot: AgentSlot): string {
    const agentKey = SLOT_TO_AGENT_KEY[agentSlot];
    if (!agentKey) return this.getProviderKey('openrouter');
    const raw = get(`AGENT_CONFIG_${agentKey}`);
    let provider = 'openrouter';
    if (raw) {
      try { const cfg = JSON.parse(raw) as Partial<AgentConfig>; provider = cfg.provider ?? 'openrouter'; } catch { /* ignore */ }
    } else {
      provider = AGENT_DEFAULTS[agentKey]?.provider ?? 'openrouter';
    }
    return this.getProviderKey(provider);
  },

  /**
   * Resolves an API key from a NATIVE_PROVIDERS label (e.g., 'Anthropic').
   * Used for fallback2Provider resolution in Orchestrator.
   */
  getProviderKeyByLabel(label: string): string {
    const provider = LABEL_TO_PROVIDER[label];
    if (!provider) return '';
    return this.getProviderKey(provider);
  },

  // ── Named provider shortcuts (backward compat) ─────────────────────────

  getGoogleApiKey(): string            { return this.getProviderKey('google') || (import.meta.env.VITE_GOOGLE_API_KEY ?? ''); },
  setGoogleApiKey(v: string): void     { this.setProviderKey('google', v); },

  getAnthropicApiKey(): string         { return this.getProviderKey('anthropic') || (import.meta.env.VITE_ANTHROPIC_API_KEY ?? ''); },
  setAnthropicApiKey(v: string): void  { this.setProviderKey('anthropic', v); },

  getOpenAIApiKey(): string            { return this.getProviderKey('openai') || (import.meta.env.VITE_OPENAI_API_KEY ?? ''); },
  setOpenAIApiKey(v: string): void     { this.setProviderKey('openai', v); },

  getDeepSeekApiKey(): string          { return this.getProviderKey('deepseek') || (import.meta.env.VITE_DEEPSEEK_API_KEY ?? ''); },
  setDeepSeekApiKey(v: string): void   { this.setProviderKey('deepseek', v); },

  getMistralApiKey(): string           { return this.getProviderKey('mistral') || (import.meta.env.VITE_MISTRAL_API_KEY ?? ''); },
  setMistralApiKey(v: string): void    { this.setProviderKey('mistral', v); },

  getGroqApiKey(): string              { return this.getProviderKey('groq') || (import.meta.env.VITE_GROQ_API_KEY ?? ''); },
  setGroqApiKey(v: string): void       { this.setProviderKey('groq', v); },

  // ── Deploy tokens ─────────────────────────────────────────────────────────

  getNetlifyToken(): string            { return get('netlify_token') ?? ''; },
  setNetlifyToken(v: string): void     { set('netlify_token', v); },

  getVercelToken(): string             { return get('vercel_token') ?? ''; },
  setVercelToken(v: string): void      { set('vercel_token', v); },

  // ── Mobile Publishing tokens ──────────────────────────────────────────

  getEASToken(): string              { return get(K.EAS_TOKEN) ?? ''; },
  setEASToken(v: string): void       { set(K.EAS_TOKEN, v); },

  getASCIssuerId(): string           { return get(K.ASC_ISSUER_ID) ?? ''; },
  setASCIssuerId(v: string): void    { set(K.ASC_ISSUER_ID, v); },

  getASCKeyId(): string              { return get(K.ASC_KEY_ID) ?? ''; },
  setASCKeyId(v: string): void       { set(K.ASC_KEY_ID, v); },

  getASCPrivateKey(): string         { return get(K.ASC_PRIVATE_KEY) ?? ''; },
  setASCPrivateKey(v: string): void  { set(K.ASC_PRIVATE_KEY, v); },

  getGoogleServiceAccount(): string          { return get(K.GOOGLE_SERVICE_ACC) ?? ''; },
  setGoogleServiceAccount(v: string): void   { set(K.GOOGLE_SERVICE_ACC, v); },

  // ── Unified model resolver ────────────────────────────────────────────────
  //
  //   Resolution chain (first non-empty value wins):
  //     a) agentConfigs[slot].modelId  (from localStorage AGENT_CONFIG_agent_*)
  //     b) agentConfigs.primary.modelId
  //     c) ENGINE_MODEL_ID from localStorage
  //     d) empty string

  resolveModel(slot: AgentSlot): string {
    const agentKey = SLOT_TO_AGENT_KEY[slot];
    const slotDefaultModel = agentKey ? (AGENT_DEFAULTS[agentKey]?.modelId ?? '') : '';

    // a) slot-specific stored config
    if (agentKey) {
      const raw = get(`AGENT_CONFIG_${agentKey}`);
      if (raw) {
        try {
          const cfg = JSON.parse(raw);
          if (typeof cfg?.modelId === 'string' && cfg.modelId.trim()) return cfg.modelId;
        } catch { /* ignore */ }
      }
      if (slotDefaultModel) return slotDefaultModel;
    }

    // b) primary agent stored config
    const primaryRaw = get('AGENT_CONFIG_agent_primary');
    if (primaryRaw) {
      try { const cfg = JSON.parse(primaryRaw); if (cfg?.modelId) return cfg.modelId; } catch { /* ignore */ }
    }

    // c) ENGINE_MODEL_ID
    const engineModel = get(K.ENGINE_MODEL);
    if (engineModel) return engineModel;

    // d) globally selected model (SELECTED_MODEL — set via UI model picker)
    const selectedModel = get(K.MODEL);
    if (selectedModel) return selectedModel;

    return DEFAULT_GENERAL_MODEL_ID;
  },

  // ── Agent configs (5-agent system) ───────────────────────────────────────

  getAgentConfig(agentId: string): AgentConfig {
    const raw = get(`AGENT_CONFIG_${agentId}`);
    const def = AGENT_DEFAULTS[agentId] ?? { provider: 'openrouter' as ApiProvider, modelId: '' };

    if (!raw) return { ...def };

    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(raw) as Record<string, unknown>; } catch { return { ...def }; }

    // ── Migration: move legacy apiKey → global PROVIDER_KEYS ────────────────
    if (parsed['apiKey'] && typeof parsed['apiKey'] === 'string') {
      const provider = (parsed['provider'] as string | undefined) ?? 'openrouter';
      const storageKey = PROVIDER_KEYS[provider] ?? PROVIDER_KEYS['openrouter'];
      if (storageKey && !get(storageKey)) {
        set(storageKey, parsed['apiKey']);
      }
      delete parsed['apiKey'];
      // Persist cleaned config
      set(`AGENT_CONFIG_${agentId}`, JSON.stringify(parsed));
    }

    // ── Migration: move legacy fallback2ApiKey → global PROVIDER_KEYS ───────
    if (parsed['fallback2ApiKey'] && typeof parsed['fallback2ApiKey'] === 'string') {
      const f2Label = parsed['fallback2Provider'] as string | undefined;
      const mappedProvider = f2Label ? (LABEL_TO_PROVIDER[f2Label] ?? f2Label.toLowerCase()) : null;
      if (mappedProvider && PROVIDER_KEYS[mappedProvider] && !get(PROVIDER_KEYS[mappedProvider])) {
        set(PROVIDER_KEYS[mappedProvider], parsed['fallback2ApiKey']);
      }
      delete parsed['fallback2ApiKey'];
      // Persist cleaned config
      set(`AGENT_CONFIG_${agentId}`, JSON.stringify(parsed));
    }

    return { ...def, ...parsed } as AgentConfig;
  },

  setAgentConfig(agentId: string, config: AgentConfig): void {
    const key = `AGENT_CONFIG_${agentId}`;
    const value = JSON.stringify(config);
    set(key, value);
    void this.saveKeyToCloud(key, value);
    void this.saveToBackend(agentId, config);
  },

  // ── Per-stage max token limits ───────────────────────────────────────────
  //
  //   Priority: AGENT_CONFIG_{agentId}.maxTokens[stage]  →  built-in defaults
  //   These defaults match the values in backend/agent-config.json so that
  //   a fresh install without a config file still behaves identically.

  getMaxTokens(agentId: string, stage: string): number {
    const DEFAULTS: Record<string, Record<string, number>> = {
      agent_primary: {
        clarifier:          6000,
        architect_landing:  8000,
        architect_app:     12000,
        architect_superapp:16000,
        tech_lead:         10000,
      },
      agent_build: {
        coder_landing:  8000,
        coder_app:     16000,
        coder_superapp:32000,
      },
      agent_fix: {
        autofix: 4000,
      },
    };

    const raw = get(`AGENT_CONFIG_${agentId}`);
    if (raw) {
      try {
        const cfg = JSON.parse(raw) as Partial<AgentConfig>;
        const stageVal = cfg.maxTokens?.[stage];
        if (typeof stageVal === 'number' && stageVal > 0) return stageVal;
      } catch { /* ignore */ }
    }

    return DEFAULTS[agentId]?.[stage] ?? 4000;
  },

  // ── Helper: Get API key by provider (generic) ──────────────────────────

  getProviderApiKey(provider: ApiProvider): string {
    return this.getProviderKey(provider) || this.getApiKey();
  },

  // ── Save key with empty value check ────────────────────────────────────
  //
  //   Saves to BOTH LocalStorage AND Supabase (user_config table).
  //   If value is empty (empty string or whitespace only), the save is ignored.

  saveKey(name: string, value: string): void {
    // Проверка: игнорируем пустые значения
    if (!value || value.trim() === '') {
      return;
    }

    // Сначала сохраняем в LocalStorage (мгновенно)
    set(name, value);

    // Затем синхронизируем с Supabase (фоновая операция)
    this.saveKeyToCloud(name, value);
  },

  // ── Save single key to cloud ───────────────────────────────────────────

  async saveKeyToCloud(name: string, value: string): Promise<void> {
    try {
      // Проверяем, существует ли ключ
      const { data: existing, error: fetchError } = await supabase
        .from('user_config')
        .select('key_value')
        .eq('key_name', name)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        // PGRST116 = row not found, это нормально
        // Тихо падаем на localStorage без console.error
        return;
      }

      if (existing) {
        // Обновляем существующий ключ
        const { error: updateError } = await supabase
          .from('user_config')
          .update({ key_value: value })
          .eq('key_name', name);

        if (updateError) {
          // Тихо падаем на localStorage без console.error
          return;
        }
      } else {
        // Создаем новый ключ
        const { error: insertError } = await supabase
          .from('user_config')
          .insert({ key_name: name, key_value: value });

        if (insertError) {
          // Тихо падаем на localStorage без console.error
          return;
        }
      }
    } catch (err) {
      // При любой ошибке (404, PGRST205, network и т.д.) тихо падаем на localStorage
      void err;
    }
  },

  // ── Backend .env provider key sync ───────────────────────────────────────

  /**
   * Saves a provider API key to the backend .env file via POST /provider-keys.
   * Also stores in localStorage as a fallback.
   */
  async saveProviderKey(provider: string, key: string): Promise<void> {
    // Always update localStorage first (instant, no network)
    const storageKey = PROVIDER_KEYS[provider];
    if (storageKey) set(storageKey, key);
    try {
      await fetch('http://localhost:3107/provider-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key }),
      });
    } catch {
      // backend not running — localStorage-only save is fine
    }
  },

  /**
   * Loads all provider API keys from the backend (.env via /provider-key/:provider)
   * and writes them into localStorage.  Runs once on app startup.
   */
  async loadProviderKeysFromBackend(): Promise<void> {
    const providers = Object.keys(PROVIDER_KEYS);
    try {
      const results = await Promise.allSettled(
        providers.map(async (provider) => {
          const res = await fetch(`http://localhost:3107/provider-key/${provider}`);
          if (!res.ok) return;
          const data = await res.json() as { key?: string };
          if (data.key) {
            const storageKey = PROVIDER_KEYS[provider];
            if (storageKey) set(storageKey, data.key);
          }
        }),
      );
      const loaded = results.filter(r => r.status === 'fulfilled').length;
      if (loaded > 0) console.log('[ConfigService] Loaded provider keys from backend .env');
    } catch {
      // backend not running — silently fall back to localStorage
    }
  },

  // ── Backend agent-config.json sync ───────────────────────────────────────

  /**
   * Loads all agent configs from the local backend (GET /agent-config)
   * and writes each one into localStorage under AGENT_CONFIG_{agentId}.
   * Called once on app startup so the disk file is authoritative.
   */
  async loadFromBackend(): Promise<void> {
    try {
      const res = await fetch('http://localhost:3107/agent-config');
      if (!res.ok) return;
      const fileData = await res.json() as Record<string, unknown>;

      const toSync: Array<{ agentId: string; config: AgentConfig }> = [];

      for (const [agentId, fileConfig] of Object.entries(fileData)) {
        if (!fileConfig || typeof fileConfig !== 'object') continue;
        const lsKey = `AGENT_CONFIG_${agentId}`;
        const lsRaw = get(lsKey);

        if (lsRaw !== null) {
          // localStorage has a value (user set it via UI).
          // Push it to the file if it differs — localStorage is the user's intent.
          try {
            const lsCfg = JSON.parse(lsRaw) as AgentConfig;
            const lsNorm   = JSON.stringify(JSON.parse(lsRaw));
            const fileNorm = JSON.stringify(fileConfig);
            if (lsNorm !== fileNorm) {
              toSync.push({ agentId, config: lsCfg });
            }
          } catch {
            // Corrupted localStorage entry — fall back to file value
            set(lsKey, JSON.stringify(fileConfig));
          }
        } else {
          // Slot is empty in localStorage — populate from file
          set(lsKey, JSON.stringify(fileConfig));
        }
      }

      // Push any localStorage-diverged values back to the file
      if (toSync.length > 0) {
        await Promise.allSettled(toSync.map(({ agentId, config }) => this.saveToBackend(agentId, config)));
        console.log(`[ConfigService] Synced ${toSync.length} agent config(s) from localStorage → backend`);
      } else {
        console.log('[ConfigService] Agent configs in sync with backend');
      }
    } catch {
      // backend not running or unreachable — silently fall back to localStorage
    }
  },

  /**
   * Persists a single agent config update to the backend file
   * (POST /agent-config) in addition to localStorage.
   */
  async saveToBackend(agentId: string, config: AgentConfig): Promise<void> {
    try {
      await fetch('http://localhost:3107/agent-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, config }),
      });
    } catch {
      // backend not running — localStorage-only save is fine
    }
  },

  // ── Sync all keys from cloud to LocalStorage ───────────────────────────
  //
  //   Loads all keys from Supabase user_config table and merges them into
  //   LocalStorage. This is called on app startup to ensure local state
  //   is up-to-date with cloud state.
  //
  //   If the database is unavailable, LocalStorage is preserved and not cleared.

  async syncWithCloud(): Promise<void> {
    try {
      // Загружаем все ключи из Supabase
      const { data: configKeys, error } = await supabase
        .from('user_config')
        .select('key_name, key_value')
        .order('updated_at', { ascending: false });

      if (error) {
        // Тихо падаем на localStorage без console.error
        return;
      }

      if (!configKeys || configKeys.length === 0) {
        return;
      }

      // Сохраняем каждый ключ в LocalStorage
      // Пустые строки и undefined не перезаписывают существующие значения
      for (const { key_name, key_value } of configKeys) {
        if (!key_name) continue;
        // NEVER overwrite agent configs from cloud — local is authoritative
        // Re-enable bidirectional sync when proper conflict resolution is implemented
        if (key_name.startsWith('AGENT_CONFIG_')) continue;
        // Проверяем существующее значение в localStorage
        const existingValue = localStorage.getItem(key_name);
        // Не перезаписываем, если key_value пустая строка, undefined или null
        if (key_value === null || key_value === undefined || key_value === '') {
          continue;
        }
        // Не перезаписываем пустой строкой существующее значение
        if (existingValue !== null && key_value === '') {
          continue;
        }
        set(key_name, key_value);
      }
    } catch (err) {
      // При любой ошибке сохраняем локальные данные без console.error
      void err;
    }
  },
};
