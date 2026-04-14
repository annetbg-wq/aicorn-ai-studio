import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Search, Check, ChevronDown, ChevronUp, Eye, EyeOff, Zap, ShieldAlert, Trash2, Plus, Loader2, CheckCircle2, AlertCircle, ExternalLink, Download, Upload, RotateCcw, Save } from 'lucide-react';
import type { FigmaAccount } from '../services/IdentityService';
import type { AgentConfig, ApiProvider } from '../services/ConfigService';
import { ConfigService } from '../services/ConfigService';
import { getMissingProviderKeyWarning } from '../services/agentConfigWarnings';
import { fetchModelsWithCache, Model } from '../services/ModelRegistry';
import { promptRegistry, type AgentName } from '../services/PromptRegistry';
import { llmFetch, llmGet } from '../services/LLMProxy';
import {
  getLocalDevAgentProvider,
  setLocalDevAgentProvider,
  syncLocalDevAgentMode,
  type DevAgentProvider,
} from '../services/devAgentMode';
import { isCreatorMode } from '../services/internalAccess';

/* ── ПОЛНЫЙ КАТАЛОГ МОДЕЛЕЙ OPENROUTER ───────────────────────────────────── */
interface ModelInfo {
  id: string; name: string; provider: string;
  contextK: number; inputPer1M: number; outputPer1M: number;
  speed: 'fast' | 'medium' | 'slow';
  tier: 'flagship' | 'balanced' | 'budget' | 'free';
  description: string;
  modality: string;
  maxCompletionTokens?: number;
}

interface PingResult { status: 'idle' | 'loading' | 'ok' | 'error'; ms?: number; code?: number; }

const CLAUDE_BRIDGE_CFG = JSON.stringify({
  provider: 'claude-bridge',
  modelId: 'claude-sonnet-4-6',
  fallback1Provider: 'openrouter',
});

// ── 5-Agent system ────────────────────────────────────────────────────────────

interface AgentSlotDef {
  key:     'primary' | 'fix' | 'spec' | 'build' | 'qa';
  agentId: string;
  emoji:   string;
  label:   string;
  role:    string;
  stages:  string;
  color:   string;
}

/** Per-agent stage definitions shown in the Max Tokens section */
const AGENT_STAGE_DEFS: Record<string, Array<{ key: string; label: string }>> = {
  agent_primary: [
    { key: 'clarifier',          label: 'Clarifier'    },
    { key: 'architect_landing',  label: 'Landing'      },
    { key: 'architect_app',      label: 'App'          },
    { key: 'architect_superapp', label: 'Super App'    },
    { key: 'tech_lead',          label: 'Tech Lead'    },
  ],
  agent_build: [
    { key: 'coder_landing',  label: 'Landing' },
    { key: 'coder_app',      label: 'App'     },
    { key: 'coder_superapp', label: 'Super'   },
  ],
  agent_fix: [
    { key: 'autofix', label: 'AutoFix' },
  ],
};

const AGENT_SLOTS: AgentSlotDef[] = [
  {
    key: 'primary', agentId: 'agent_primary', emoji: '🤖', label: 'Agent Primary', color: '#60a5fa',
    role:   'Architect · Tech Lead · Clarifier',
    stages: 'план приложения, технический blueprint, уточнение идеи',
  },
  {
    key: 'fix', agentId: 'agent_fix', emoji: '🔧', label: 'Agent Fix', color: '#34d399',
    role:   'AutoFix',
    stages: 'исправление ошибок компиляции, auto-fix после preview error',
  },
  {
    key: 'spec', agentId: 'agent_spec', emoji: '📋', label: 'Spec Agent', color: '#a78bfa',
    role:   'Researcher · Spec Writer',
    stages: 'исследование и спецификация',
  },
  {
    key: 'build', agentId: 'agent_build', emoji: '👨‍💻', label: 'Build Agent', color: '#f59e0b',
    role:   'Coder',
    stages: 'генерация файлов кода, повторная генерация при ошибке',
  },
  {
    key: 'qa', agentId: 'agent_qa', emoji: '🧪', label: 'QA Agent', color: '#f87171',
    role:   'QA · Reviewer',
    stages: 'проверка и отчёт',
  },
];

const PROVIDER_LABELS: Record<ApiProvider, string> = {
  openrouter: 'OpenRouter',
  anthropic:  'Anthropic',
  openai:     'OpenAI',
  google:     'Google',
  deepseek:   'DeepSeek',
  mistral:    'Mistral',
  groq:       'Groq',
};

interface NativeProvider { label: string; baseUrl: string; }
const NATIVE_PROVIDERS: NativeProvider[] = [
  { label: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1'                                    },
  { label: 'OpenAI',    baseUrl: 'https://api.openai.com/v1'                                       },
  { label: 'Google',    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai'         },
  { label: 'DeepSeek',  baseUrl: 'https://api.deepseek.com/v1'                                     },
  { label: 'Mistral',   baseUrl: 'https://api.mistral.ai/v1'                                       },
  { label: 'Groq',      baseUrl: 'https://api.groq.com/openai/v1'                                  },
  { label: 'Custom...', baseUrl: ''                                                                 },
];

const NATIVE_PROVIDER_PREFIXES: Record<string, string> = {
  'Anthropic': 'anthropic/',
  'OpenAI':    'openai/',
  'Mistral':   'mistral/',
  'DeepSeek':  'deepseek/',
  'Groq':      'groq/',
  'Google':    'google/',
};

function getModelsForNativeProvider(provider: string, allModels: ModelInfo[]): ModelInfo[] {
  const prefix = NATIVE_PROVIDER_PREFIXES[provider];
  if (!prefix) return [];
  return allModels.filter(m => m.id.startsWith(prefix));
}

const PROVIDER_KEY_URL: Record<ApiProvider, string> = {
  openrouter: 'https://openrouter.ai/keys',
  anthropic:  'https://console.anthropic.com/keys',
  openai:     'https://platform.openai.com/api-keys',
  google:     'https://aistudio.google.com/apikey',
  deepseek:   'https://platform.deepseek.com/api_keys',
  mistral:    'https://console.mistral.ai/api-keys',
  groq:       'https://console.groq.com/keys',
};

const PROVIDER_FILTER: Record<ApiProvider, string | null> = {
  openrouter: null,         // show all
  anthropic:  'Anthropic',
  openai:     'OpenAI',
  google:     'Google',
  deepseek:   'deepseek',
  mistral:    'mistral',
  groq:       'groq',
};

const TIER_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  flagship: { label: 'Flagship', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  balanced: { label: 'Balanced', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)'  },
  budget:   { label: 'Budget',   color: '#34d399', bg: 'rgba(52,211,153,0.12)'  },
  free:     { label: 'Free',     color: '#fbbf24', bg: 'rgba(251,191,36,0.12)'  },
};

const SPEED_CLR: Record<string, string> = { fast: '#30d158', medium: '#ffd60a', slow: '#ff6b6b' };
const fmtP = (n: number | undefined | null) => {
  const v = n ?? 0;
  return v === 0 ? 'Free' : v < 0.1 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`;
};

const LANG_OPTIONS = [
  { code: 'en', flag: '🇬🇧', label: 'English'    },
  { code: 'ru', flag: '🇷🇺', label: 'Русский'    },
  { code: 'es', flag: '🇪🇸', label: 'Español'    },
  { code: 'de', flag: '🇩🇪', label: 'Deutsch'    },
  { code: 'fr', flag: '🇫🇷', label: 'Français'   },
  { code: 'zh', flag: '🇨🇳', label: '中文'        },
];

interface AgentPreset {
  name: string;
  description: string;
  configs: Record<string, { provider: ApiProvider; modelId: string }>;
}

const PRESETS: AgentPreset[] = [
  {
    name: '⚡ OpenRouter',
    description: 'Настроить всех агентов на OpenRouter без model ID',
    configs: {
      primary: { provider: 'openrouter', modelId: '' },
      fix:     { provider: 'openrouter', modelId: '' },
      spec:    { provider: 'openrouter', modelId: '' },
      build:   { provider: 'openrouter', modelId: '' },
      qa:      { provider: 'openrouter', modelId: '' },
    }
  },
  {
    name: '🧠 Google',
    description: 'Настроить всех агентов на Google без model ID',
    configs: {
      primary: { provider: 'google', modelId: '' },
      fix:     { provider: 'google', modelId: '' },
      spec:    { provider: 'google', modelId: '' },
      build:   { provider: 'google', modelId: '' },
      qa:      { provider: 'google', modelId: '' },
    }
  },
  {
    name: '💰 Mixed',
    description: 'Сменить провайдеры без заполнения model ID',
    configs: {
      primary: { provider: 'openrouter', modelId: '' },
      fix:     { provider: 'openrouter', modelId: '' },
      spec:    { provider: 'google', modelId: '' },
      build:   { provider: 'openrouter', modelId: '' },
      qa:      { provider: 'google', modelId: '' },
    }
  },
];

interface SettingsModalProps {
  isOpen: boolean; onClose: () => void;
  theme?: string; setTheme?: (t: string) => void;
  apiKey: string; setApiKey: (k: string) => void;
  onDownloadSnapshot?: () => void;
  onRestoreFromFile?:  (file: File) => Promise<void>;
  canUndoRestore?:     boolean;
  onUndoRestore?:      () => void;
  appLanguage?: string; setAppLanguage?: (l: string) => void;
  // Figma accounts (PAT management only — sync lives in Platinum Figma module)
  figmaAccounts?:      FigmaAccount[];
  addFigmaAccount?:    (draft: Omit<FigmaAccount, 'id' | 'addedAt'>) => Promise<void>;
  removeFigmaAccount?: (id: string) => void;
  // 5-agent system
  agentConfigs?:    Record<string, AgentConfig>;
  setAgentConfig?:  (agentId: string, config: AgentConfig) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen, onClose, apiKey, setApiKey,
  onDownloadSnapshot, onRestoreFromFile, canUndoRestore, onUndoRestore,
  appLanguage = 'en', setAppLanguage,
  figmaAccounts = [], addFigmaAccount, removeFigmaAccount,
  agentConfigs,
  setAgentConfig,
}) => {
  const [tab, setTab] = useState<'api' | 'models' | 'accounts' | 'engine' | 'prompts'>('api');

  // ── Prompts tab state ────────────────────────────────────────────────────
  const AGENT_NAMES: AgentName[] = ['orchestrator', 'spec', 'clarify', 'build', 'qa'];
  const AGENT_LABELS: Record<AgentName, string> = {
    orchestrator: '🤖 Orchestrator',
    spec:         '📋 SpecAgent',
    clarify:      '❓ ClarifyAgent',
    build:        '👨‍💻 BuildAgent',
    qa:           '🧪 QAAgent',
  };
  const [promptTab,   setPromptTab]   = useState<AgentName>('orchestrator');
  const [promptDrafts, setPromptDrafts] = useState<Record<AgentName, string>>(() => ({
    orchestrator: promptRegistry.getPrompt('orchestrator'),
    spec:         promptRegistry.getPrompt('spec'),
    clarify:      promptRegistry.getPrompt('clarify'),
    build:        promptRegistry.getPrompt('build'),
    qa:           promptRegistry.getPrompt('qa'),
  }));
  const [promptSaved, setPromptSaved] = useState<AgentName | null>(null);
  const restoreFileRef = useRef<HTMLInputElement>(null);
  const [providerKeys, setProviderKeys] = useState<Record<string, string>>(() => ({
    openrouter: ConfigService.getApiKey(),
    anthropic:  ConfigService.getAnthropicApiKey(),
    openai:     ConfigService.getOpenAIApiKey(),
    google:     ConfigService.getGoogleApiKey(),
    deepseek:   ConfigService.getDeepSeekApiKey(),
    mistral:    ConfigService.getMistralApiKey(),
    groq:       ConfigService.getGroqApiKey(),
  }));
  const [deployKeys, setDeployKeys] = useState({ netlify: ConfigService.getNetlifyToken(), vercel: ConfigService.getVercelToken() });
  const [showDeployKey, setShowDeployKey] = useState<Record<string, boolean>>({});
  const [savedDeployKey, setSavedDeployKey] = useState<string | null>(null);
  const [showProviderKey, setShowProviderKey] = useState<Record<string, boolean>>({});
  const [savedProvider, setSavedProvider] = useState<string | null>(null);
  const [openSlot,  setOpenSlot]  = useState<string | null>(null);  // kept for compat
  const [slotSearch,          setSlotSearch]          = useState<Record<string, string>>({});
  const [slotFallback1Search, setSlotFallback1Search] = useState<Record<string, string>>({});
  const [openFallback2, setOpenFallback2] = useState<Record<string, boolean>>({});

  // Local mirror of agentConfigs so edits are batched before save
  const [localAgentConfigs, setLocalAgentConfigs] = useState<Record<string, AgentConfig>>(() =>
    agentConfigs ?? {}
  );

  const [search, setSearch] = useState('');
  const [provFilter, setProvFilter] = useState('All');
  const [devAgentProvider, setDevAgentProvider] = useState<DevAgentProvider>(() => getLocalDevAgentProvider());
  const canSeeDevMode = isCreatorMode();
  // Per-provider dynamic model loading
  const [providerModels, setProviderModels] = useState<Record<string, { models: Model[]; loading: boolean }>>({});
  // PAT form state
  const [patLabel, setPatLabel]       = useState('');
  const [patToken, setPatToken]       = useState('');
  const [showPat,  setShowPat]        = useState(false);
  const [patState, setPatState]       = useState<'idle' | 'verifying' | 'ok' | 'error'>('idle');
  const [patPreview, setPatPreview]   = useState<{ name: string; email: string } | null>(null);
  const [patFormOpen, setPatFormOpen] = useState(true);

  // Load models from OpenRouter API
  const [MODELS, setModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Model Library extras
  const [freeOnly,       setFreeOnly]       = useState(false);
  const [visionOnly,     setVisionOnly]     = useState(false);
  const [sortBy,         setSortBy]         = useState<'price' | 'context' | 'name'>('name');
  const [sortDir,        setSortDir]        = useState<'asc' | 'desc'>('asc');
  const [pingResults,    setPingResults]    = useState<Record<string, PingResult>>({});
  const [testAllRunning, setTestAllRunning] = useState(false);
  const [assignPopup,    setAssignPopup]    = useState<{ modelId: string } | null>(null);
  const [assignAgent,    setAssignAgent]    = useState('primary');
  const [assignSlotKey,  setAssignSlotKey]  = useState<'primary' | 'fallback1' | 'fallback2'>('primary');
  const [toast,          setToast]          = useState<string | null>(null);
  const [expandedDesc,   setExpandedDesc]   = useState<Record<string, boolean>>({});

  useEffect(() => {
    try { localStorage.removeItem('SELECTED_MODEL'); } catch { /* ignore */ }
    setModelsLoading(true);
    llmGet('https://openrouter.ai/api/v1/models')
      .then(r => r.json())
      .then(data => {
        const list = (data.data ?? []).map((m: any) => ({
          id:                  m.id,
          name:                m.name ?? m.id,
          provider:            m.id.split('/')[0],
          contextK:            Math.round((m.context_length ?? 0) / 1000),
          inputPer1M:          parseFloat(m.pricing?.prompt ?? '0') * 1_000_000,
          outputPer1M:         parseFloat(m.pricing?.completion ?? '0') * 1_000_000,
          speed:               'medium' as const,
          tier:                'balanced' as const,
          description:         m.description ?? '',
          modality:            (m.architecture?.modality ?? 'text') as string,
          maxCompletionTokens: m.top_provider?.max_completion_tokens as number | undefined,
        }));
        setModels(list);
      })
      .catch(() => setModels([]))
      .finally(() => setModelsLoading(false));
  }, []);

  const PROVIDERS = useMemo(() =>
    ['All', ...Array.from(new Set(MODELS.map(m => m.provider)))],
    [MODELS]
  );

  const filtered = useMemo(() => {
    let list = MODELS.filter(m => {
      const matchSearch = m.name.toLowerCase().includes(search.toLowerCase()) || m.id.toLowerCase().includes(search.toLowerCase());
      const matchProv   = provFilter === 'All' || m.provider === provFilter;
      const matchFree   = !freeOnly  || m.inputPer1M === 0;
      const matchVision = !visionOnly || m.modality.toLowerCase().includes('image');
      return matchSearch && matchProv && matchFree && matchVision;
    });
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'price')   cmp = a.inputPer1M - b.inputPer1M;
      if (sortBy === 'context') cmp = a.contextK - b.contextK;
      if (sortBy === 'name')    cmp = a.name.localeCompare(b.name);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [search, provFilter, freeOnly, visionOnly, sortBy, sortDir, MODELS]);

  const agentUsage = useMemo(() => {
    const usage: Record<string, string[]> = {};
    AGENT_SLOTS.forEach(slot => {
      const cfg = agentConfigs?.[slot.key];
      if (!cfg) return;
      const add = (mid: string | undefined) => {
        if (!mid) return;
        if (!usage[mid]) usage[mid] = [];
        const lbl = slot.label.replace(' Agent', '').replace('Agent ', '');
        if (!usage[mid].includes(lbl)) usage[mid].push(lbl);
      };
      add(cfg.modelId);
      add(cfg.fallback1ModelId);
      add(cfg.fallback2ModelId);
    });
    return usage;
  }, [agentConfigs]);

  // Load models from OpenRouter (all providers available via filtering)
  const loadProviderModels = async (provider: ApiProvider) => {
    console.log(`[SettingsModal] loadProviderModels called: provider=${provider}`);

    const openrouterKey = apiKey || ConfigService.getApiKey();
    if (!openrouterKey) {
      console.warn(`[SettingsModal] ⚠️ OpenRouter API key needed to load models`);
      setProviderModels(p => ({ ...p, [provider]: { models: [], loading: false } }));
      return;
    }

    console.log(`[SettingsModal] Using OpenRouter key to load ${provider} models...`);
    setProviderModels(p => ({ ...p, [provider]: { models: [], loading: true } }));

    try {
      console.log(`[SettingsModal] Fetching ${provider} models from OpenRouter...`);
      const models = await fetchModelsWithCache(provider, openrouterKey);
      console.log(`[SettingsModal] ✅ Received ${models.length} models for ${provider}`);
      if (models.length > 0) {
        console.log(`[SettingsModal] Sample models:`, models.slice(0, 3));
      } else {
        console.warn(`[SettingsModal] ⚠️ No ${provider} models found in OpenRouter catalog`);
      }
      setProviderModels(p => ({ ...p, [provider]: { models, loading: false } }));
    } catch (err) {
      console.error(`[SettingsModal] ❌ Error loading ${provider} models:`, err);
      setProviderModels(p => ({ ...p, [provider]: { models: [], loading: false } }));
    }
  };

  // ── Model Library helpers ─────────────────────────────────────────────────

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const pingModel = async (modelId: string) => {
    const key = apiKey || ConfigService.getApiKey();
    if (!key) { setPingResults(p => ({ ...p, [modelId]: { status: 'error', code: 401 } })); return; }
    setPingResults(p => ({ ...p, [modelId]: { status: 'loading' } }));
    const start = Date.now();
    try {
      const res = await llmFetch(
        'https://openrouter.ai/api/v1/chat/completions',
        { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        JSON.stringify({ model: modelId, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
      );
      const ms = Date.now() - start;
      setPingResults(p => ({ ...p, [modelId]: { status: res.ok ? 'ok' : 'error', ms: res.ok ? ms : undefined, code: res.ok ? undefined : res.status } }));
    } catch {
      setPingResults(p => ({ ...p, [modelId]: { status: 'error' } }));
    }
  };

  const testAllModels = async () => {
    if (testAllRunning) return;
    setTestAllRunning(true);
    for (const m of filtered.slice(0, 20)) {
      await pingModel(m.id);
      await new Promise(r => setTimeout(r, 500));
    }
    setTestAllRunning(false);
  };

  const doAssign = () => {
    if (!assignPopup || !setAgentConfig) return;
    const agentSlotDef = AGENT_SLOTS.find(s => s.key === assignAgent);
    if (!agentSlotDef) return;
    const cfg = agentConfigs?.[assignAgent] ?? { provider: 'openrouter' as const, modelId: '' };
    let patch: Partial<AgentConfig> = {};
    if (assignSlotKey === 'primary')   patch = { modelId: assignPopup.modelId };
    if (assignSlotKey === 'fallback1') patch = { fallback1ModelId: assignPopup.modelId };
    if (assignSlotKey === 'fallback2') patch = { fallback2ModelId: assignPopup.modelId };
    setAgentConfig(agentSlotDef.agentId, { ...cfg, ...patch } as AgentConfig);
    const slotLabel = { primary: 'Primary', fallback1: 'Fallback 1', fallback2: 'Fallback 2' }[assignSlotKey];
    const modelName = MODELS.find(m => m.id === assignPopup.modelId)?.name ?? assignPopup.modelId;
    showToast(`Assigned ${modelName} to ${agentSlotDef.label} → ${slotLabel}`);
    setAssignPopup(null);
  };

  const setRemoteDevAgentProvider = async (nextProvider: DevAgentProvider) => {
    if (nextProvider === 'claude') {
      const current = localStorage.getItem('AGENT_CONFIG_agent_primary');
      if (current) localStorage.setItem('CLAUDE_MAX_PREV_CONFIG', current);
      localStorage.setItem('AGENT_CONFIG_agent_primary', CLAUDE_BRIDGE_CFG);
      localStorage.setItem('AGENT_CONFIG_agent_build', CLAUDE_BRIDGE_CFG);
    } else {
      const prev = localStorage.getItem('CLAUDE_MAX_PREV_CONFIG');
      if (prev) {
        localStorage.setItem('AGENT_CONFIG_agent_primary', prev);
        localStorage.setItem('AGENT_CONFIG_agent_build', prev);
      } else {
        localStorage.removeItem('AGENT_CONFIG_agent_primary');
        localStorage.removeItem('AGENT_CONFIG_agent_build');
      }
    }

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000'}/dev-agent-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: nextProvider }),
      });
      if (response.ok) {
        const data = await response.json();
        setDevAgentProvider(syncLocalDevAgentMode(data));
        return;
      }
    } catch {
      setLocalDevAgentProvider(nextProvider);
      setDevAgentProvider(nextProvider);
    }
  };

  useEffect(() => {
    if (!isOpen || !canSeeDevMode) return;
    fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000'}/dev-agent-mode`)
      .then(r => r.json())
      .then(data => setDevAgentProvider(syncLocalDevAgentMode(data)))
      .catch(() => {});
  }, [isOpen, canSeeDevMode]);

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)' }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: 1100, margin: '0 16px', background: '#0a0a0c', borderRadius: 28, border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
        
        {/* Header */}
        <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>Settings</h2>
          <button onClick={onClose} style={{ padding: 8, borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: 'none', color: '#666', cursor: 'pointer' }}><X size={20}/></button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, padding: '12px 24px', background: 'rgba(255,255,255,0.02)' }}>
          <button onClick={() => setTab('api')} style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: tab === 'api' ? 'rgba(255,255,255,0.1)' : 'transparent', color: tab === 'api' ? '#fff' : '#666', fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: '0.2s' }}>API Configuration</button>
          <button onClick={() => setTab('models')} style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: tab === 'models' ? 'rgba(255,255,255,0.1)' : 'transparent', color: tab === 'models' ? '#fff' : '#666', fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: '0.2s' }}>Model Library</button>
          <button onClick={() => setTab('accounts')} style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: tab === 'accounts' ? 'rgba(255,255,255,0.1)' : 'transparent', color: tab === 'accounts' ? '#fff' : '#666', fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: '0.2s', position: 'relative' }}>
            External Accounts
            {figmaAccounts.length > 0 && <span style={{ position: 'absolute', top: 8, right: 8, width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />}
          </button>
          <button onClick={() => setTab('engine')} style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: tab === 'engine' ? 'rgba(167,139,250,0.18)' : 'transparent', color: tab === 'engine' ? '#a78bfa' : '#666', fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: '0.2s' }}>
            ⚙ Engine
          </button>
          <button onClick={() => setTab('prompts')} style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: tab === 'prompts' ? 'rgba(251,191,36,0.18)' : 'transparent', color: tab === 'prompts' ? '#fbbf24' : '#666', fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: '0.2s' }}>
            ✏ Prompts
          </button>
        </div>

        <div style={{ padding: 24, maxHeight: '75vh', overflowY: 'auto' }}>
          {tab === 'api' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {canSeeDevMode && (
                <div style={{
                  borderRadius: 16,
                  background: 'rgba(124,58,237,0.08)',
                  border: '1px solid rgba(124,58,237,0.24)',
                  padding: 12,
                }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#c4b5fd', marginBottom: 8, textTransform: 'uppercase' }}>
                    Studio Provider Mode
                  </label>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: 4, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
                    {([
                      { id: 'off', label: 'Standard' },
                      { id: 'claude', label: 'Claude' },
                      { id: 'codex', label: 'Codex' },
                    ] as Array<{ id: DevAgentProvider; label: string }>).map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => void setRemoteDevAgentProvider(opt.id)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 8,
                          border: `1px solid ${devAgentProvider === opt.id ? 'rgba(124,58,237,0.6)' : 'rgba(255,255,255,0.1)'}`,
                          background: devAgentProvider === opt.id ? 'rgba(124,58,237,0.22)' : 'transparent',
                          color: devAgentProvider === opt.id ? '#c4b5fd' : '#9ca3af',
                          fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Global API Configuration — 5 Providers */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#444', marginBottom: 0, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Global Provider Keys</label>

                {/* OpenRouter */}
                <div style={{ borderRadius: 16, background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.15)', padding: 12 }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#a78bfa', marginBottom: 8, textTransform: 'uppercase' }}>OpenRouter</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input type={showProviderKey.openrouter ? 'text' : 'password'} value={providerKeys.openrouter} onChange={(e) => setProviderKeys(p => ({ ...p, openrouter: e.target.value }))} placeholder="sk-or-v1-..." style={{ width: '100%', padding: '10px 12px', borderRadius: 12, background: '#111114', border: '1px solid rgba(167,139,250,0.2)', color: '#fff', fontSize: 12, outline: 'none' }} />
                      <button onClick={() => setShowProviderKey(p => ({ ...p, openrouter: !p.openrouter }))} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>{showProviderKey.openrouter ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
                    </div>
                    <button onClick={() => { ConfigService.setApiKey(providerKeys.openrouter); setApiKey(providerKeys.openrouter); setSavedProvider('openrouter'); setTimeout(() => setSavedProvider(null), 1500); }} style={{ padding: '10px 12px', borderRadius: 12, border: 'none', background: savedProvider === 'openrouter' ? '#4ade80' : '#a78bfa', color: '#000', fontWeight: 600, fontSize: 11, cursor: 'pointer', transition: '0.2s', minWidth: 60 }}>
                      {savedProvider === 'openrouter' ? '✓ Saved' : 'Save'}
                    </button>
                  </div>
                </div>

                {/* Google */}
                <div style={{ borderRadius: 16, background: 'rgba(52,212,153,0.05)', border: '1px solid rgba(52,212,153,0.15)', padding: 12 }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#34d399', marginBottom: 8, textTransform: 'uppercase' }}>Google Gemini</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input type={showProviderKey.google ? 'text' : 'password'} value={providerKeys.google} onChange={(e) => setProviderKeys(p => ({ ...p, google: e.target.value }))} placeholder="AIza..." style={{ width: '100%', padding: '10px 12px', borderRadius: 12, background: '#111114', border: '1px solid rgba(52,212,153,0.2)', color: '#fff', fontSize: 12, outline: 'none' }} />
                      <button onClick={() => setShowProviderKey(p => ({ ...p, google: !p.google }))} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>{showProviderKey.google ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
                    </div>
                    <button onClick={() => { ConfigService.setGoogleApiKey(providerKeys.google); setSavedProvider('google'); setTimeout(() => setSavedProvider(null), 1500); }} style={{ padding: '10px 12px', borderRadius: 12, border: 'none', background: savedProvider === 'google' ? '#4ade80' : '#34d399', color: '#000', fontWeight: 600, fontSize: 11, cursor: 'pointer', transition: '0.2s', minWidth: 60 }}>
                      {savedProvider === 'google' ? '✓ Saved' : 'Save'}
                    </button>
                  </div>
                </div>

                {/* Anthropic */}
                <div style={{ borderRadius: 16, background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)', padding: 12 }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#f59e0b', marginBottom: 8, textTransform: 'uppercase' }}>Anthropic Claude</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input type={showProviderKey.anthropic ? 'text' : 'password'} value={providerKeys.anthropic} onChange={(e) => setProviderKeys(p => ({ ...p, anthropic: e.target.value }))} placeholder="sk-ant-..." style={{ width: '100%', padding: '10px 12px', borderRadius: 12, background: '#111114', border: '1px solid rgba(245,158,11,0.2)', color: '#fff', fontSize: 12, outline: 'none' }} />
                      <button onClick={() => setShowProviderKey(p => ({ ...p, anthropic: !p.anthropic }))} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>{showProviderKey.anthropic ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
                    </div>
                    <button onClick={() => { ConfigService.setAnthropicApiKey(providerKeys.anthropic); setSavedProvider('anthropic'); setTimeout(() => setSavedProvider(null), 1500); }} style={{ padding: '10px 12px', borderRadius: 12, border: 'none', background: savedProvider === 'anthropic' ? '#4ade80' : '#f59e0b', color: '#000', fontWeight: 600, fontSize: 11, cursor: 'pointer', transition: '0.2s', minWidth: 60 }}>
                      {savedProvider === 'anthropic' ? '✓ Saved' : 'Save'}
                    </button>
                  </div>
                </div>

                {/* OpenAI */}
                <div style={{ borderRadius: 16, background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.15)', padding: 12 }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#60a5fa', marginBottom: 8, textTransform: 'uppercase' }}>OpenAI GPT</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input type={showProviderKey.openai ? 'text' : 'password'} value={providerKeys.openai} onChange={(e) => setProviderKeys(p => ({ ...p, openai: e.target.value }))} placeholder="sk-..." style={{ width: '100%', padding: '10px 12px', borderRadius: 12, background: '#111114', border: '1px solid rgba(96,165,250,0.2)', color: '#fff', fontSize: 12, outline: 'none' }} />
                      <button onClick={() => setShowProviderKey(p => ({ ...p, openai: !p.openai }))} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>{showProviderKey.openai ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
                    </div>
                    <button onClick={() => { ConfigService.setOpenAIApiKey(providerKeys.openai); setSavedProvider('openai'); setTimeout(() => setSavedProvider(null), 1500); }} style={{ padding: '10px 12px', borderRadius: 12, border: 'none', background: savedProvider === 'openai' ? '#4ade80' : '#60a5fa', color: '#000', fontWeight: 600, fontSize: 11, cursor: 'pointer', transition: '0.2s', minWidth: 60 }}>
                      {savedProvider === 'openai' ? '✓ Saved' : 'Save'}
                    </button>
                  </div>
                </div>

                {/* DeepSeek */}
                <div style={{ borderRadius: 16, background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.15)', padding: 12 }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#f87171', marginBottom: 8, textTransform: 'uppercase' }}>DeepSeek</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input type={showProviderKey.deepseek ? 'text' : 'password'} value={providerKeys.deepseek ?? ''} onChange={(e) => setProviderKeys(p => ({ ...p, deepseek: e.target.value }))} placeholder="sk-..." style={{ width: '100%', padding: '10px 12px', borderRadius: 12, background: '#111114', border: '1px solid rgba(248,113,113,0.2)', color: '#fff', fontSize: 12, outline: 'none' }} />
                      <button onClick={() => setShowProviderKey(p => ({ ...p, deepseek: !p.deepseek }))} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>{showProviderKey.deepseek ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
                    </div>
                    <button onClick={() => { ConfigService.setProviderKey('deepseek', providerKeys.deepseek ?? ''); setSavedProvider('deepseek'); setTimeout(() => setSavedProvider(null), 1500); }} style={{ padding: '10px 12px', borderRadius: 12, border: 'none', background: savedProvider === 'deepseek' ? '#4ade80' : '#f87171', color: '#000', fontWeight: 600, fontSize: 11, cursor: 'pointer', transition: '0.2s', minWidth: 60 }}>
                      {savedProvider === 'deepseek' ? '✓ Saved' : 'Save'}
                    </button>
                  </div>
                </div>

                {/* Mistral */}
                <div style={{ borderRadius: 16, background: 'rgba(251,146,60,0.05)', border: '1px solid rgba(251,146,60,0.15)', padding: 12 }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#fb923c', marginBottom: 8, textTransform: 'uppercase' }}>Mistral</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input type={showProviderKey.mistral ? 'text' : 'password'} value={providerKeys.mistral ?? ''} onChange={(e) => setProviderKeys(p => ({ ...p, mistral: e.target.value }))} placeholder="..." style={{ width: '100%', padding: '10px 12px', borderRadius: 12, background: '#111114', border: '1px solid rgba(251,146,60,0.2)', color: '#fff', fontSize: 12, outline: 'none' }} />
                      <button onClick={() => setShowProviderKey(p => ({ ...p, mistral: !p.mistral }))} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>{showProviderKey.mistral ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
                    </div>
                    <button onClick={() => { ConfigService.setProviderKey('mistral', providerKeys.mistral ?? ''); setSavedProvider('mistral'); setTimeout(() => setSavedProvider(null), 1500); }} style={{ padding: '10px 12px', borderRadius: 12, border: 'none', background: savedProvider === 'mistral' ? '#4ade80' : '#fb923c', color: '#000', fontWeight: 600, fontSize: 11, cursor: 'pointer', transition: '0.2s', minWidth: 60 }}>
                      {savedProvider === 'mistral' ? '✓ Saved' : 'Save'}
                    </button>
                  </div>
                </div>

                {/* Groq */}
                <div style={{ borderRadius: 16, background: 'rgba(20,184,166,0.05)', border: '1px solid rgba(20,184,166,0.15)', padding: 12 }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#14b8a6', marginBottom: 8, textTransform: 'uppercase' }}>Groq</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input type={showProviderKey.groq ? 'text' : 'password'} value={providerKeys.groq ?? ''} onChange={(e) => setProviderKeys(p => ({ ...p, groq: e.target.value }))} placeholder="gsk_..." style={{ width: '100%', padding: '10px 12px', borderRadius: 12, background: '#111114', border: '1px solid rgba(20,184,166,0.2)', color: '#fff', fontSize: 12, outline: 'none' }} />
                      <button onClick={() => setShowProviderKey(p => ({ ...p, groq: !p.groq }))} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>{showProviderKey.groq ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
                    </div>
<button onClick={() => { ConfigService.setProviderKey('groq', providerKeys.groq ?? ''); setSavedProvider('groq'); setTimeout(() => setSavedProvider(null), 1500); }} style={{ padding: '10px 12px', borderRadius: 12, border: 'none', background: savedProvider === 'groq' ? '#4ade80' : '#14b8a6', color: '#000', fontWeight: 600, fontSize: 11, cursor: 'pointer', transition: '0.2s', minWidth: 60 }}>
                      {savedProvider === 'groq' ? '✓ Saved' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Deploy Tokens */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#444', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Deploy Tokens
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Netlify */}
                  <div style={{ borderRadius: 16, background: 'rgba(0,199,183,0.05)', border: '1px solid rgba(0,199,183,0.15)', padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <label style={{ fontSize: 10, fontWeight: 600, color: '#00c7b7', textTransform: 'uppercase' }}>Netlify</label>
                      <a href="https://app.netlify.com/user/applications#personal-access-tokens" target="_blank" rel="noreferrer" style={{ fontSize: 10, color: '#555', display: 'flex', alignItems: 'center', gap: 3 }}>Get token <ExternalLink size={9} /></a>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <input type={showDeployKey.netlify ? 'text' : 'password'} value={deployKeys.netlify} onChange={(e) => setDeployKeys(p => ({ ...p, netlify: e.target.value }))} placeholder="Personal access token..." style={{ width: '100%', padding: '10px 12px', borderRadius: 12, background: '#111114', border: '1px solid rgba(0,199,183,0.2)', color: '#fff', fontSize: 12, outline: 'none' }} />
                        <button onClick={() => setShowDeployKey(p => ({ ...p, netlify: !p.netlify }))} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>{showDeployKey.netlify ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
                      </div>
                      <button onClick={() => { ConfigService.setNetlifyToken(deployKeys.netlify); setSavedDeployKey('netlify'); setTimeout(() => setSavedDeployKey(null), 1500); }} style={{ padding: '10px 12px', borderRadius: 12, border: 'none', background: savedDeployKey === 'netlify' ? '#4ade80' : '#00c7b7', color: '#000', fontWeight: 600, fontSize: 11, cursor: 'pointer', transition: '0.2s', minWidth: 60 }}>
                        {savedDeployKey === 'netlify' ? '✓ Saved' : 'Save'}
                      </button>
                    </div>
                  </div>
                  {/* Vercel */}
                  <div style={{ borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <label style={{ fontSize: 10, fontWeight: 600, color: '#e5e5e5', textTransform: 'uppercase' }}>Vercel</label>
                      <a href="https://vercel.com/account/tokens" target="_blank" rel="noreferrer" style={{ fontSize: 10, color: '#555', display: 'flex', alignItems: 'center', gap: 3 }}>Get token <ExternalLink size={9} /></a>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <input type={showDeployKey.vercel ? 'text' : 'password'} value={deployKeys.vercel} onChange={(e) => setDeployKeys(p => ({ ...p, vercel: e.target.value }))} placeholder="vercel_..." style={{ width: '100%', padding: '10px 12px', borderRadius: 12, background: '#111114', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 12, outline: 'none' }} />
                        <button onClick={() => setShowDeployKey(p => ({ ...p, vercel: !p.vercel }))} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>{showDeployKey.vercel ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
                      </div>
                      <button onClick={() => { ConfigService.setVercelToken(deployKeys.vercel); setSavedDeployKey('vercel'); setTimeout(() => setSavedDeployKey(null), 1500); }} style={{ padding: '10px 12px', borderRadius: 12, border: 'none', background: savedDeployKey === 'vercel' ? '#4ade80' : '#555', color: '#fff', fontWeight: 600, fontSize: 11, cursor: 'pointer', transition: '0.2s', minWidth: 60 }}>
                        {savedDeployKey === 'vercel' ? '✓ Saved' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Language Selector */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#444', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Interface &amp; AI Language
                </label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {LANG_OPTIONS.map(l => (
                    <button
                      key={l.code}
                      onClick={() => setAppLanguage?.(l.code)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 14px', borderRadius: 12, cursor: 'pointer',
                        fontSize: 13, fontWeight: 600,
                        background: appLanguage === l.code ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${appLanguage === l.code ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
                        color: appLanguage === l.code ? '#fff' : '#555',
                        boxShadow: appLanguage === l.code ? '0 0 0 1px rgba(255,255,255,0.1)' : 'none',
                        transition: 'all 0.15s',
                      }}
                    >
                      <span style={{ fontSize: 16 }}>{l.flag}</span>
                      {l.label}
                    </button>
                  ))}
                </div>
                <p style={{ marginTop: 8, fontSize: 11, color: '#444', lineHeight: 1.5 }}>
                  Applies to UI labels, AI responses, and sidebar ideas.
                </p>
              </div>

              {/* Survival System Section */}
              <div style={{ marginTop: 8, padding: '20px', borderRadius: 20, background: 'rgba(99, 102, 241, 0.03)', border: '1px solid rgba(99, 102, 241, 0.15)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ padding: 8, borderRadius: 10, background: 'rgba(99, 102, 241, 0.1)' }}><ShieldAlert size={16} style={{ color: '#818cf8' }} /></div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Survival Backup System</span>
                </div>
                <p style={{ margin: '0 0 14px', fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
                  Export a full local snapshot (files + all API keys + model configs). No cloud required.
                </p>

                {/* Primary action row */}
                <div style={{ display: 'flex', gap: 10 }}>
                  {/* Download Snapshot */}
                  <button
                    onClick={() => onDownloadSnapshot?.()}
                    style={{ flex: 1, padding: '13px', borderRadius: 14, border: '1px solid rgba(96, 165, 250, 0.25)', background: 'rgba(96, 165, 250, 0.06)', color: '#60a5fa', cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background 0.2s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(96, 165, 250, 0.12)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(96, 165, 250, 0.06)')}
                  >
                    <Download size={16} /> Download Snapshot
                  </button>
                  {/* Restore From File */}
                  <button
                    onClick={() => restoreFileRef.current?.click()}
                    style={{ flex: 1, padding: '13px', borderRadius: 14, border: '1px solid rgba(239, 68, 68, 0.25)', background: 'rgba(239, 68, 68, 0.06)', color: '#f87171', cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background 0.2s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.06)')}
                  >
                    <Upload size={16} /> Restore From File
                  </button>
                </div>

                {/* Undo Restore — visible only after a restore was performed */}
                {canUndoRestore && (
                  <button
                    onClick={() => onUndoRestore?.()}
                    style={{ width: '100%', marginTop: 10, padding: '11px', borderRadius: 14, border: '1px solid rgba(251, 191, 36, 0.3)', background: 'rgba(251, 191, 36, 0.06)', color: '#fbbf24', cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background 0.2s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(251, 191, 36, 0.12)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(251, 191, 36, 0.06)')}
                  >
                    ↩ Undo Restore — Revert to Previous State
                  </button>
                )}

                {/* Security notice */}
                <p style={{ margin: '12px 0 0', fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>
                  ⚠ Snapshot contains sensitive API keys. Keep files secure and never share publicly.
                </p>

                {/* Hidden file input for restore */}
                <input
                  ref={restoreFileRef}
                  type="file"
                  accept=".json,application/json"
                  style={{ display: 'none' }}
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    if (file && onRestoreFromFile) await onRestoreFromFile(file);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
          ) : tab === 'accounts' ? (
            /* ── EXTERNAL ACCOUNTS TAB ─────────────────────────────────────── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* ── Section 1: Account cards ── */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#444', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Connected Accounts
                </div>
                {figmaAccounts.length === 0 ? (
                  <div style={{ padding: '20px', borderRadius: 14, border: '1px dashed rgba(255,255,255,0.07)', textAlign: 'center', color: '#444', fontSize: 13 }}>
                    No accounts connected — add a PAT below to get started.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {figmaAccounts.map(acc => {
                      const info = acc.userInfo;
                      const initials = (info?.name ?? acc.label ?? '?').slice(0, 2).toUpperCase();
                      const daysAgo  = Math.floor((Date.now() - acc.addedAt) / 86_400_000);
                      const added    = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`;
                      return (
                        <div key={acc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          {/* Avatar */}
                          {info?.avatarUrl ? (
                            <img src={info.avatarUrl} alt={info.name} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#818cf8', flexShrink: 0 }}>
                              {initials}
                            </div>
                          )}
                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {info?.name ?? acc.label}
                              </span>
                              <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 5, background: acc.type === 'pat' ? 'rgba(52,211,153,0.15)' : 'rgba(167,139,250,0.15)', color: acc.type === 'pat' ? '#34d399' : '#a78bfa', fontWeight: 800, textTransform: 'uppercase', flexShrink: 0 }}>
                                {acc.type === 'pat' ? 'PAT' : 'OAuth'}
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: '#555' }}>
                              {info?.email ? `${info.email} · ` : ''}{added}
                            </div>
                          </div>
                          {/* Remove */}
                          <button
                            onClick={() => removeFigmaAccount?.(acc.id)}
                            title="Remove account"
                            style={{ padding: 6, borderRadius: 8, background: 'transparent', border: 'none', color: '#444', cursor: 'pointer', flexShrink: 0, transition: 'color 0.15s' }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                            onMouseLeave={e => (e.currentTarget.style.color = '#444')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Section 2: Add PAT form ── */}
              <div style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <button
                  onClick={() => setPatFormOpen(p => !p)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'rgba(255,255,255,0.02)', border: 'none', color: '#888', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Plus size={13} /> Add Figma Account (PAT)</span>
                  {patFormOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {patFormOpen && (
                  <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input
                      type="text"
                      placeholder="Label (e.g. My Account)"
                      value={patLabel}
                      onChange={e => setPatLabel(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: '#111114', border: '1px solid rgba(255,255,255,0.06)', color: '#fff', fontSize: 13, outline: 'none' }}
                    />
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPat ? 'text' : 'password'}
                        placeholder="Figma PAT (figd_...)"
                        value={patToken}
                        onChange={e => { setPatToken(e.target.value); setPatState('idle'); setPatPreview(null); }}
                        style={{ width: '100%', padding: '10px 40px 10px 12px', borderRadius: 10, background: '#111114', border: '1px solid rgba(255,255,255,0.06)', color: '#fff', fontSize: 13, outline: 'none' }}
                      />
                      <button onClick={() => setShowPat(p => !p)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#444', cursor: 'pointer' }}>
                        {showPat ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    {/* Preview after verify */}
                    {patPreview && patState === 'ok' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)' }}>
                        <CheckCircle2 size={14} color="#34d399" />
                        <span style={{ fontSize: 12, color: '#34d399' }}>{patPreview.name}{patPreview.email ? ` · ${patPreview.email}` : ''}</span>
                      </div>
                    )}
                    {patState === 'error' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                        <AlertCircle size={14} color="#ef4444" />
                        <span style={{ fontSize: 12, color: '#ef4444' }}>Invalid token — check your Figma PAT.</span>
                      </div>
                    )}
                    <button
                      disabled={!patToken.trim() || patState === 'verifying'}
                      onClick={async () => {
                        if (!patToken.trim()) return;
                        if (patState === 'ok' && patPreview) {
                          // Already verified — save
                          await addFigmaAccount?.({
                            label: patLabel.trim() || patPreview.name || 'Figma Account',
                            type: 'pat',
                            token: patToken.trim(),
                          });
                          setPatLabel(''); setPatToken(''); setPatState('idle'); setPatPreview(null);
                          setPatFormOpen(false);
                        } else {
                          // Verify first
                          setPatState('verifying');
                          const { FigmaClient } = await import('../services/FigmaClient');
                          const info = await FigmaClient.getUserInfo(patToken.trim());
                          if (info) {
                            setPatPreview({ name: info.name, email: info.email });
                            setPatState('ok');
                          } else {
                            setPatState('error');
                          }
                        }
                      }}
                      style={{ padding: '10px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 13, cursor: patToken.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: '0.15s',
                        background: patState === 'ok' ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.08)',
                        color: patState === 'ok' ? '#34d399' : '#fff',
                        opacity: (!patToken.trim() || patState === 'verifying') ? 0.5 : 1,
                      }}
                    >
                      {patState === 'verifying' ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Verifying…</> :
                       patState === 'ok'        ? <><CheckCircle2 size={13} /> Save Account</> :
                                                  'Verify & Save'}
                    </button>
                  </div>
                )}
              </div>

              {/* ── Hint: full sync in Platinum Figma module ── */}
              {figmaAccounts.length > 0 && (
                <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)', fontSize: 12, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15 }}>◆</span>
                  Open <strong>Figma Platinum</strong> module to sync design tokens and push code to Figma.
                </div>
              )}

              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : tab === 'engine' ? (
            /* ── АГЕНТЫ СТУДИИ ─────────────────────────────────────────────── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* Header */}
              <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.12)', fontSize: 12, color: '#60a5fa', lineHeight: 1.6 }}>
                <strong>⚡ Агенты Студии</strong> — каждый агент работает с собственным провайдером и моделью. Ключи провайдеров хранятся на вкладке <em>API Configuration</em>.
              </div>

              {/* Presets */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Быстрый пресет</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {PRESETS.map((preset, idx) => {
                    const applyPreset = () => {
                      const agentKeys = ['primary', 'fix', 'spec', 'build', 'qa'] as const;
                      agentKeys.forEach(key => {
                        const slotDef = AGENT_SLOTS.find(s => s.key === key);
                        if (slotDef && preset.configs[key]) {
                          const config: AgentConfig = {
                            provider: preset.configs[key].provider,
                            modelId: preset.configs[key].modelId,
                          };
                          setLocalAgentConfigs(p => ({ ...p, [key]: config }));
                          console.log('[Settings] saving agent config key=', slotDef.agentId, 'modelId=', config.modelId);
                          setAgentConfig?.(slotDef.agentId, config);
                        }
                      });
                    };
                    return (
                      <button
                        key={idx}
                        onClick={applyPreset}
                        style={{
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          padding: '10px 12px',
                          borderRadius: 12,
                          border: '1px solid rgba(255,255,255,0.07)',
                          background: 'rgba(255,255,255,0.02)',
                          cursor: 'pointer',
                          transition: '0.15s',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.12)';
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
                          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)';
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', textAlign: 'left' }}>{preset.name}</div>
                        <div style={{ fontSize: 10, color: '#555', textAlign: 'left', lineHeight: 1.3 }}>{preset.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 5 agent cards — horizontal 3-column grid layout */}
              {AGENT_SLOTS.map(slot => {
                const cfg: AgentConfig = localAgentConfigs[slot.key] ?? agentConfigs?.[slot.key] ?? { provider: 'openrouter', modelId: '' };
                const f          = PROVIDER_FILTER[cfg.provider];
                const provModels = f ? MODELS.filter(m => m.provider === f) : MODELS;
                const primSearch = slotSearch[slot.key] ?? '';
                const fb1Search  = slotFallback1Search[slot.key] ?? '';
                const filtered   = provModels.filter(m =>
                  m.name.toLowerCase().includes(primSearch.toLowerCase()) ||
                  m.id.toLowerCase().includes(primSearch.toLowerCase())
                );
                const currentModel = MODELS.find(m => m.id === cfg.modelId);
                const fb1Model     = MODELS.find(m => m.id === cfg.fallback1ModelId);
                const providerKeySet = !!ConfigService.getProviderKey(cfg.provider);
                const fb2open      = openFallback2[slot.key] || !!cfg.fallback2ModelId;

                const updateCfg = (patch: Partial<AgentConfig>) => {
                  const next = { ...cfg, ...patch };
                  if (patch.provider) {
                    const warning = getMissingProviderKeyWarning(patch.provider, provider => ConfigService.getProviderKey(provider));
                    if (warning) showToast(warning);
                  }
                  setLocalAgentConfigs(p => ({ ...p, [slot.key]: next }));
                  console.log('[Settings] saving agent config key=', slot.agentId, 'modelId=', next.modelId);
                  setAgentConfig?.(slot.agentId, next);
                };

                // Resolved primary model list (dynamic first, then OpenRouter fallback)
                const dynModels = providerModels[cfg.provider]?.models ?? [];
                const primaryList = (dynModels.length > 0
                  ? dynModels.filter(m =>
                      m.name.toLowerCase().includes(primSearch.toLowerCase()) ||
                      m.id.toLowerCase().includes(primSearch.toLowerCase())
                    )
                  : filtered) as ModelInfo[];

                return (
                  <div key={slot.key} style={{ borderRadius: 14, border: `1px solid ${slot.color}28`, overflow: 'hidden' }}>

                    {/* ── Card header ── */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: `${slot.color}08` }}>
                      <div style={{ width: 3, height: 36, borderRadius: 2, background: slot.color, flexShrink: 0, marginTop: 3 }} />
                      <span style={{ fontSize: 15, flexShrink: 0, marginTop: 3 }}>{slot.emoji}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: slot.color }}>{slot.label}</span>
                          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#666', fontWeight: 700 }}>{PROVIDER_LABELS[cfg.provider]}</span>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: providerKeySet ? '#34d399' : '#374151', flexShrink: 0 }} title={providerKeySet ? 'API key set' : 'No API key'} />
                        </div>
                        <p style={{ margin: 0, fontSize: 11, color: slot.color, opacity: 0.7, fontWeight: 600, lineHeight: 1.3 }}>{slot.role}</p>
                        <p style={{ margin: '1px 0 0', fontSize: 10, color: '#555', lineHeight: 1.4 }}>{slot.stages}</p>
                      </div>
                      {/* Right: provider tabs */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                          {(['openrouter', 'anthropic', 'openai', 'google', 'mistral', 'groq', 'deepseek'] as ApiProvider[]).map(p => (
                            <button
                              key={p}
                              onClick={() => {
                                updateCfg({ provider: p, modelId: '' });
                                const orKey = apiKey || ConfigService.getApiKey();
                                if (orKey) loadProviderModels(p);
                              }}
                              style={{ padding: '3px 8px', borderRadius: 7, border: `1px solid ${cfg.provider === p ? slot.color + '50' : 'rgba(255,255,255,0.07)'}`, background: cfg.provider === p ? `${slot.color}14` : 'rgba(255,255,255,0.02)', color: cfg.provider === p ? slot.color : '#555', fontSize: 10, fontWeight: 600, cursor: 'pointer', transition: '0.15s' }}
                            >
                              {PROVIDER_LABELS[p]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* ── 3-column grid body ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderTop: `1px solid ${slot.color}18` }}>

                      {/* Col 1 — Primary */}
                      <div style={{ padding: '11px 12px', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 5 }}>
                          Primary
                          {providerModels[cfg.provider]?.loading && <Loader2 size={10} style={{ color: slot.color, animation: 'spin 1s linear infinite' }} />}
                        </div>
                        {currentModel && (
                          <div style={{ fontSize: 10, color: slot.color, fontWeight: 600, marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={currentModel.name}>
                            ✓ {currentModel.name}
                          </div>
                        )}
                        <div style={{ position: 'relative', marginBottom: 5 }}>
                          <Search style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', color: '#444' }} size={11} />
                          <input
                            value={primSearch}
                            onChange={e => setSlotSearch(p => ({ ...p, [slot.key]: e.target.value }))}
                            placeholder="Найти..."
                            style={{ width: '100%', padding: '5px 5px 5px 24px', borderRadius: 8, background: '#111114', border: '1px solid rgba(255,255,255,0.06)', color: '#fff', fontSize: 11, outline: 'none', boxSizing: 'border-box' }}
                          />
                        </div>
                        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                            Ввести model ID вручную:
                          </div>
                          <input
                            placeholder="provider/model-name"
                            value={cfg.modelId ?? ''}
                            onChange={e => {
                              updateCfg({ modelId: e.target.value });
                            }}
                            style={{
                              fontFamily: 'monospace', fontSize: 12, width: '100%',
                              padding: '6px 10px', borderRadius: 6,
                              border: '1px solid var(--border)',
                              background: 'var(--background)', color: 'var(--foreground)',
                              outline: 'none',
                            }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 190, overflowY: 'auto' }}>
                          {primaryList.slice(0, 40).map(m => {
                            const isSel = cfg.modelId === m.id;
                            return (
                              <div
                                key={m.id}
                                onClick={() => updateCfg({ modelId: m.id })}
                                style={{ padding: '5px 8px', borderRadius: 7, cursor: 'pointer', transition: '0.12s', background: isSel ? `${slot.color}14` : 'rgba(255,255,255,0.02)', border: `1px solid ${isSel ? slot.color + '35' : 'transparent'}` }}
                              >
                                <div style={{ fontSize: 11, fontWeight: 600, color: isSel ? slot.color : '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                                <div style={{ fontSize: 9, color: '#444', marginTop: 1 }}>In {fmtP(m.inputPer1M)} · {m.contextK}k</div>
                              </div>
                            );
                          })}
                          {primaryList.length === 0 && (
                            <div style={{ padding: '8px', textAlign: 'center' as const, color: '#444', fontSize: 11 }}>Нет моделей</div>
                          )}
                        </div>
                        <div style={{ fontSize: 9, color: '#333', marginTop: 4 }}>OpenRouter</div>
                      </div>

                      {/* Col 2 — Fallback 1 */}
                      <div style={{ padding: '11px 12px', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>
                          Fallback 1 · OpenRouter
                        </div>
                        {fb1Model && (
                          <div style={{ fontSize: 10, color: '#60a5fa', fontWeight: 600, marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fb1Model.name}>
                            ✓ {fb1Model.name}
                          </div>
                        )}
                        <div
                          onClick={() => updateCfg({ fallback1ModelId: undefined })}
                          style={{ padding: '4px 8px', borderRadius: 7, cursor: 'pointer', marginBottom: 5, background: !cfg.fallback1ModelId ? 'rgba(255,255,255,0.05)' : 'transparent', border: `1px solid ${!cfg.fallback1ModelId ? 'rgba(255,255,255,0.1)' : 'transparent'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                        >
                          <span style={{ fontSize: 10, color: !cfg.fallback1ModelId ? '#aaa' : '#333', fontStyle: 'italic' }}>— отключён —</span>
                          {!cfg.fallback1ModelId && <Check size={9} style={{ color: '#aaa' }} />}
                        </div>
                        <div style={{ position: 'relative', marginBottom: 5 }}>
                          <Search style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', color: '#444' }} size={11} />
                          <input
                            value={fb1Search}
                            onChange={e => setSlotFallback1Search(p => ({ ...p, [slot.key]: e.target.value }))}
                            placeholder="Найти..."
                            style={{ width: '100%', padding: '5px 5px 5px 24px', borderRadius: 8, background: '#111114', border: '1px solid rgba(255,255,255,0.06)', color: '#fff', fontSize: 11, outline: 'none', boxSizing: 'border-box' }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 190, overflowY: 'auto' }}>
                          {MODELS.filter(m =>
                            m.name.toLowerCase().includes(fb1Search.toLowerCase()) ||
                            m.id.toLowerCase().includes(fb1Search.toLowerCase())
                          ).slice(0, 40).map(m => {
                            const isSel = cfg.fallback1ModelId === m.id;
                            return (
                              <div
                                key={m.id}
                                onClick={() => updateCfg({ fallback1ModelId: m.id, fallback1Provider: 'openrouter' })}
                                style={{ padding: '5px 8px', borderRadius: 7, cursor: 'pointer', transition: '0.12s', background: isSel ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.02)', border: `1px solid ${isSel ? 'rgba(96,165,250,0.3)' : 'transparent'}` }}
                              >
                                <div style={{ fontSize: 11, fontWeight: 600, color: isSel ? '#60a5fa' : '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                                <div style={{ fontSize: 9, color: '#444', marginTop: 1 }}>In {fmtP(m.inputPer1M)} · {m.contextK}k</div>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ fontSize: 9, color: '#333', marginTop: 4 }}>OpenRouter</div>
                      </div>

                      {/* Col 3 — Fallback 2 */}
                      <div style={{ padding: '11px 12px' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: slot.color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>Fallback 2 · Native</span>
                          {cfg.fallback2ModelId && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, background: `${slot.color}30`, color: slot.color, fontWeight: 800, boxShadow: `0 0 6px ${slot.color}40` }}>active</span>}
                        </div>
                        {!fb2open ? (
                          <button
                            onClick={() => setOpenFallback2(p => ({ ...p, [slot.key]: true }))}
                            style={{ width: '100%', padding: '8px', borderRadius: 9, border: `1px dashed ${slot.color}40`, background: `${slot.color}08`, color: slot.color, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                          >
                            <Plus size={12} /> Add native fallback
                          </button>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                            {/* Row 1: Provider dropdown + Model ID */}
                            <div style={{ display: 'flex', gap: 6 }}>
                              <div style={{ flex: '0 0 auto', minWidth: 100 }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: slot.color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Provider</div>
                                <div style={{ position: 'relative' }}>
                                  <select
                                    value={cfg.fallback2Provider ?? ''}
                                    onChange={e => {
                                      const label = e.target.value;
                                      const found = NATIVE_PROVIDERS.find(p => p.label === label);
                                      updateCfg({
                                        fallback2Provider: label || undefined,
                                        fallback2BaseUrl:  found && found.baseUrl ? found.baseUrl : (label === 'Custom...' ? cfg.fallback2BaseUrl : undefined),
                                        fallback2ModelId:  undefined,
                                      });
                                    }}
                                    style={{ width: '100%', padding: '6px 22px 6px 9px', borderRadius: 8, background: '#111114', border: `1px solid ${cfg.fallback2Provider ? slot.color + '50' : 'rgba(255,255,255,0.07)'}`, color: cfg.fallback2Provider ? '#fff' : '#555', fontSize: 11, outline: 'none', appearance: 'none', cursor: 'pointer', boxSizing: 'border-box' }}
                                  >
                                    <option value="">— select —</option>
                                    {NATIVE_PROVIDERS.map(p => (
                                      <option key={p.label} value={p.label}>{p.label}</option>
                                    ))}
                                  </select>
                                  <ChevronDown size={10} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', color: '#555', pointerEvents: 'none' }} />
                                </div>
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: '#444', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Model ID</div>
                                {(() => {
                                  const prov = cfg.fallback2Provider;
                                  const inputStyle = { width: '100%', padding: '6px 9px', borderRadius: 8, background: '#111114', border: `1px solid ${cfg.fallback2ModelId ? slot.color + '40' : 'rgba(255,255,255,0.07)'}`, color: '#fff', fontSize: 11, outline: 'none', boxSizing: 'border-box' as const };
                                  if (!prov || prov === 'Custom...') {
                                    return <input type="text" value={cfg.fallback2ModelId ?? ''} onChange={e => updateCfg({ fallback2ModelId: e.target.value || undefined })} placeholder="model-id" style={inputStyle} />;
                                  }
                                  const nativeModels = getModelsForNativeProvider(prov, MODELS);
                                  if (nativeModels.length === 0) {
                                    return (
                                      <>
                                        <input type="text" value={cfg.fallback2ModelId ?? ''} onChange={e => updateCfg({ fallback2ModelId: e.target.value || undefined })} placeholder="model-id" style={inputStyle} />
                                        <div style={{ fontSize: 8, color: '#555', marginTop: 2 }}>No models found for this provider in OpenRouter catalog</div>
                                      </>
                                    );
                                  }
                                  return (
                                    <div style={{ position: 'relative' }}>
                                      <select
                                        value={cfg.fallback2ModelId ?? ''}
                                        onChange={e => {
                                          const modelId = e.target.value;
                                          console.log('[Settings] fallback2 modelId=', modelId, 'provider=', prov);
                                          updateCfg({ fallback2ModelId: modelId || undefined });
                                        }}
                                        style={{ width: '100%', padding: '6px 22px 6px 9px', borderRadius: 8, background: '#111114', border: `1px solid ${cfg.fallback2ModelId ? slot.color + '40' : 'rgba(255,255,255,0.07)'}`, color: cfg.fallback2ModelId ? '#fff' : '#555', fontSize: 11, outline: 'none', appearance: 'none', cursor: 'pointer', boxSizing: 'border-box' }}
                                      >
                                        <option value="">— select model —</option>
                                        {nativeModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                      </select>
                                      <ChevronDown size={10} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', color: '#555', pointerEvents: 'none' }} />
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                            {/* Row 2 (Custom only): Base URL */}
                            {cfg.fallback2Provider === 'Custom...' && (
                              <div>
                                <div style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Base URL</div>
                                <input
                                  type="text"
                                  value={cfg.fallback2BaseUrl ?? ''}
                                  onChange={e => updateCfg({ fallback2BaseUrl: e.target.value || undefined })}
                                  placeholder="https://your-api.example.com/v1"
                                  style={{ width: '100%', padding: '6px 9px', borderRadius: 8, background: '#111114', border: `1px solid ${cfg.fallback2BaseUrl ? '#f59e0b40' : 'rgba(255,255,255,0.07)'}`, color: '#fff', fontSize: 11, outline: 'none', boxSizing: 'border-box' }}
                                />
                              </div>
                            )}
                            <div style={{ fontSize: 9, color: '#444', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ color: slot.color + 'aa' }}>Native API · key from API Configuration tab</span>
                              {!cfg.fallback2ModelId && (
                                <button
                                  onClick={() => setOpenFallback2(p => ({ ...p, [slot.key]: false }))}
                                  style={{ background: 'none', border: 'none', color: '#444', fontSize: 10, cursor: 'pointer', padding: 0 }}
                                >✕ Скрыть</button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                    </div>{/* end 3-col grid */}

                    {/* ── Max Tokens row (only for agents with defined stages) ── */}
                    {AGENT_STAGE_DEFS[slot.agentId] && (
                      <div style={{ padding: '9px 14px', borderTop: `1px solid ${slot.color}18`, background: `${slot.color}04`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>Max Tokens</span>
                        {AGENT_STAGE_DEFS[slot.agentId].map(stage => {
                          const currentVal = cfg.maxTokens?.[stage.key] ?? ConfigService.getMaxTokens(slot.agentId, stage.key);
                          return (
                            <label key={stage.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                              <span style={{ fontSize: 9, color: '#555', whiteSpace: 'nowrap' }}>{stage.label}</span>
                              <input
                                type="number"
                                min={256}
                                max={200000}
                                step={1000}
                                value={currentVal}
                                onChange={e => {
                                  const v = parseInt(e.target.value, 10);
                                  if (!isNaN(v) && v >= 256) {
                                    updateCfg({ maxTokens: { ...(cfg.maxTokens ?? {}), [stage.key]: v } });
                                  }
                                }}
                                style={{
                                  width: 68, padding: '3px 6px', borderRadius: 7,
                                  background: '#0d0d10', border: `1px solid ${slot.color}30`,
                                  color: slot.color, fontSize: 11, fontWeight: 600,
                                  outline: 'none', textAlign: 'center', fontFamily: 'monospace',
                                }}
                              />
                            </label>
                          );
                        })}
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          ) : tab === 'prompts' ? (
            /* ── PROMPT EDITOR ─────────────────────────────────────────────── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Header */}
              <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)', fontSize: 12, color: '#fbbf24', lineHeight: 1.6 }}>
                <strong>✏ Редактор промптов</strong> — изменения сохраняются в localStorage. Используй <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 4 }}>{'{{PLACEHOLDER}}'}</code> для динамических значений.
              </div>

              {/* Agent sub-tabs */}
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {AGENT_NAMES.map(name => {
                  const modified = promptRegistry.isModified(name);
                  const active   = promptTab === name;
                  return (
                    <button
                      key={name}
                      onClick={() => setPromptTab(name)}
                      style={{
                        padding: '7px 12px', borderRadius: 10, border: `1px solid ${active ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.07)'}`,
                        background: active ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.02)',
                        color: active ? '#fbbf24' : '#666', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6, position: 'relative',
                      }}
                    >
                      {AGENT_LABELS[name]}
                      {modified && (
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(251,191,36,0.2)', color: '#fbbf24', fontWeight: 700 }}>
                          Modified
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Textarea */}
              <div style={{ position: 'relative' }}>
                <textarea
                  value={promptDrafts[promptTab]}
                  onChange={e => setPromptDrafts(p => ({ ...p, [promptTab]: e.target.value }))}
                  spellCheck={false}
                  style={{
                    width: '100%', minHeight: 420, padding: '14px', borderRadius: 12,
                    background: '#0a0a0c', border: `1px solid ${promptRegistry.isModified(promptTab) ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.07)'}`,
                    color: '#e5e7eb', fontSize: 11, fontFamily: 'ui-monospace, "Cascadia Code", "Fira Code", monospace',
                    lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <div style={{ position: 'absolute', top: 10, right: 10, fontSize: 10, color: '#444', pointerEvents: 'none' }}>
                  {promptDrafts[promptTab].length.toLocaleString()} chars
                </div>
              </div>

              {/* Action bar */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={() => {
                    promptRegistry.setPrompt(promptTab, promptDrafts[promptTab]);
                    setPromptSaved(promptTab);
                    setTimeout(() => setPromptSaved(null), 2000);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: '1px solid rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.12)', color: '#fbbf24', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  <Save size={13} />
                  {promptSaved === promptTab ? '✓ Сохранено' : 'Save'}
                </button>

                <button
                  onClick={() => {
                    promptRegistry.resetPrompt(promptTab);
                    setPromptDrafts(p => ({ ...p, [promptTab]: promptRegistry.getPrompt(promptTab) }));
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)', color: '#888', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  <RotateCcw size={13} />
                  Reset to Default
                </button>

                {promptRegistry.isModified(promptTab) && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)', fontWeight: 700 }}>
                    ● Modified
                  </span>
                )}
              </div>

              {/* Placeholder reference */}
              <details style={{ borderRadius: 10, overflow: 'hidden' }}>
                <summary style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, fontSize: 11, color: '#555', cursor: 'pointer', userSelect: 'none' }}>
                  Список плейсхолдеров
                </summary>
                <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)', borderTop: 'none', borderRadius: '0 0 10px 10px', fontSize: 10, color: '#555', lineHeight: 2, fontFamily: 'monospace' }}>
                  {promptTab === 'orchestrator' && <>
                    <div><code style={{ color: '#fbbf24' }}>{'{{MEMORY_BLOCK}}'}</code> — PROJECT_MEMORY.md блок</div>
                    <div><code style={{ color: '#fbbf24' }}>{'{{LANG_DIRECTIVE}}'}</code> — директива языка (если не EN)</div>
                    <div><code style={{ color: '#fbbf24' }}>{'{{SCANNER_CTX}}'}</code> — реестр компонентов проекта</div>
                    <div><code style={{ color: '#fbbf24' }}>{'{{FILE_CTX}}'}</code> — текущие файлы проекта</div>
                  </>}
                  {promptTab === 'spec' && <>
                    <div><code style={{ color: '#fbbf24' }}>{'{{MANIFEST_CONTEXT}}'}</code> — манифест проекта</div>
                    <div><code style={{ color: '#fbbf24' }}>{'{{PACKAGE_JSON_PREVIEW}}'}</code> — package.json (300 символов)</div>
                    <div><code style={{ color: '#fbbf24' }}>{'{{PROJECT_DNA_PREVIEW}}'}</code> — компоненты проекта (1000 символов)</div>
                    <div><code style={{ color: '#fbbf24' }}>{'{{EXAMPLE_COMPONENTS}}'}</code> — примеры компонентов</div>
                    <div><code style={{ color: '#fbbf24' }}>{'{{TAILWIND_CONFIG_PREVIEW}}'}</code> — tailwind.config (200 символов)</div>
                    <div><code style={{ color: '#fbbf24' }}>{'{{MODULE_CONTEXT_BLOCK}}'}</code> — модульный контекст (если есть)</div>
                    <div><code style={{ color: '#fbbf24' }}>{'{{BLOCK_NAME}}'}</code> — название блока (встречается дважды)</div>
                  </>}
                  {promptTab === 'clarify' && <>
                    <div><code style={{ color: '#fbbf24' }}>{'{{BLOCK_NAME}}'}</code> — название задачи</div>
                    <div><code style={{ color: '#fbbf24' }}>{'{{MODULE_CONTEXT_LINE}}'}</code> — строка контекста (если есть)</div>
                    <div><code style={{ color: '#fbbf24' }}>{'{{SPEC_JSON}}'}</code> — JSON спецификации</div>
                  </>}
                  {promptTab === 'build' && <>
                    <div><code style={{ color: '#fbbf24' }}>{'{{PROTECTED_FILES_BLOCK}}'}</code> — список защищённых файлов</div>
                    <div><code style={{ color: '#fbbf24' }}>{'{{SPEC_JSON}}'}</code> — JSON спецификации</div>
                    <div><code style={{ color: '#fbbf24' }}>{'{{CLARIFICATION_CONTEXT}}'}</code> — уточнения пользователя</div>
                    <div><code style={{ color: '#fbbf24' }}>{'{{REUSE_COMPONENTS}}'}</code> — компоненты для переиспользования</div>
                    <div><code style={{ color: '#fbbf24' }}>{'{{STYLING}}'}</code> / <code style={{ color: '#fbbf24' }}>{'{{ANIMATIONS}}'}</code> / <code style={{ color: '#fbbf24' }}>{'{{STATE_MGMT}}'}</code></div>
                    <div><code style={{ color: '#fbbf24' }}>{'{{PROJECT_FILES}}'}</code> — файлы проекта (по 1000 символов)</div>
                    <div><code style={{ color: '#fbbf24' }}>{'{{PROTECTED_FILES_NAMES}}'}</code> — имена защищённых файлов</div>
                    <div><code style={{ color: '#fbbf24' }}>{'{{FIX_CONTEXT}}'}</code> — контекст предыдущих ошибок</div>
                  </>}
                  {promptTab === 'qa' && <>
                    <div><code style={{ color: '#fbbf24' }}>{'{{CRITERIA_LIST}}'}</code> — критерии приёмки</div>
                    <div><code style={{ color: '#fbbf24' }}>{'{{MUST_HAVE_LIST}}'}</code> — обязательные фичи</div>
                    <div><code style={{ color: '#fbbf24' }}>{'{{RESULT_FILES}}'}</code> — сгенерированный код</div>
                  </>}
                </div>
              </details>
            </div>
          ) : (
            /* MODEL LIBRARY */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Row 1 — search + provider */}
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ position: 'relative', flex: 2 }}>
                  <Search style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#444' }} size={16}/>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a model..." style={{ width: '100%', padding: '10px 12px 10px 42px', borderRadius: 12, background: '#111114', border: '1px solid rgba(255,255,255,0.05)', color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <select value={provFilter} onChange={(e) => setProvFilter(e.target.value)} style={{ flex: 1, padding: '0 12px', borderRadius: 12, background: '#111114', border: '1px solid rgba(255,255,255,0.05)', color: '#fff', fontSize: 13, cursor: 'pointer', outline: 'none' }}>
                  {PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              {/* Row 2 — filters + sort + Test All */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12, color: freeOnly ? '#fbbf24' : '#555', userSelect: 'none' }}>
                  <input type="checkbox" checked={freeOnly} onChange={e => setFreeOnly(e.target.checked)} style={{ accentColor: '#fbbf24' }} />
                  Free only
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12, color: visionOnly ? '#a78bfa' : '#555', userSelect: 'none' }}>
                  <input type="checkbox" checked={visionOnly} onChange={e => setVisionOnly(e.target.checked)} style={{ accentColor: '#a78bfa' }} />
                  Vision
                </label>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: '#444' }}>Sort:</span>
                {(['name', 'price', 'context'] as const).map(s => (
                  <button key={s} onClick={() => { if (sortBy === s) setSortDir((d: 'asc' | 'desc') => d === 'asc' ? 'desc' : 'asc'); else { setSortBy(s); setSortDir('asc'); } }} style={{ padding: '4px 10px', borderRadius: 8, border: `1px solid ${sortBy === s ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'}`, background: sortBy === s ? 'rgba(255,255,255,0.08)' : 'transparent', color: sortBy === s ? '#fff' : '#555', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    {s === 'price' ? 'Price' : s === 'context' ? 'Context' : 'Name'}{sortBy === s ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                ))}
                <button onClick={testAllModels} disabled={testAllRunning || filtered.length === 0} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 9, border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.08)', color: '#60a5fa', fontSize: 11, fontWeight: 600, cursor: testAllRunning ? 'not-allowed' : 'pointer', opacity: testAllRunning ? 0.6 : 1 }}>
                  {testAllRunning ? <><Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Testing…</> : `Test All (${Math.min(filtered.length, 20)})`}
                </button>
              </div>

              {modelsLoading && <div style={{ textAlign: 'center', padding: 20, color: '#666' }}>Loading models…</div>}

              {/* Model cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filtered.map(m => {
                  const isFree   = m.inputPer1M === 0;
                  const isVision = m.modality.toLowerCase().includes('image');
                  const usedBy   = agentUsage[m.id] ?? [];
                  const ping     = pingResults[m.id] ?? { status: 'idle' as const };
                  const isExpanded  = expandedDesc[m.id];
                  const descTrunc   = m.description.length > 120 ? m.description.slice(0, 120) + '…' : m.description;
                  const showAssign  = assignPopup?.modelId === m.id;
                  const ctxStr      = m.contextK >= 1000 ? `${(m.contextK / 1000).toFixed(0)}M` : `${m.contextK}k`;
                  return (
                    <div key={m.id} style={{ padding: '13px 15px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      {/* Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Name + badges */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>{m.name}</span>
                            <span style={{ fontSize: 10, color: '#444' }}>{m.provider}</span>
                            {isFree   && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 5, background: 'rgba(251,191,36,0.14)', color: '#fbbf24', fontWeight: 800, textTransform: 'uppercase' }}>FREE</span>}
                            {isVision && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 5, background: 'rgba(167,139,250,0.14)', color: '#a78bfa', fontWeight: 800, textTransform: 'uppercase' }}>VISION</span>}
                            {usedBy.map(lbl => (
                              <span key={lbl} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 5, background: 'rgba(52,211,153,0.12)', color: '#34d399', fontWeight: 700 }}>Used: {lbl}</span>
                            ))}
                          </div>
                          {/* Stats */}
                          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#555', flexWrap: 'wrap' }}>
                            <span>{ctxStr} ctx</span>
                            <span>In: {fmtP(m.inputPer1M)}</span>
                            <span>Out: {fmtP(m.outputPer1M)}</span>
                            {m.maxCompletionTokens != null && <span>Max: {m.maxCompletionTokens.toLocaleString()}</span>}
                          </div>
                        </div>
                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                          {ping.status === 'ok'      && <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 600, whiteSpace: 'nowrap' }}>✅ {ping.ms}ms</span>}
                          {ping.status === 'error'   && <span style={{ fontSize: 11, color: '#f87171', fontWeight: 600, whiteSpace: 'nowrap' }}>❌ {ping.code ? `${ping.code}` : 'Err'}</span>}
                          {ping.status === 'loading' && <Loader2 size={12} style={{ color: '#60a5fa', animation: 'spin 1s linear infinite', flexShrink: 0 }} />}
                          <button onClick={() => pingModel(m.id)} disabled={ping.status === 'loading'} style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(96,165,250,0.25)', background: 'rgba(96,165,250,0.08)', color: '#60a5fa', fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: ping.status === 'loading' ? 0.5 : 1 }}>
                            Test
                          </button>
                          <button onClick={() => setAssignPopup(showAssign ? null : { modelId: m.id })} style={{ padding: '4px 10px', borderRadius: 8, border: `1px solid ${showAssign ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.1)'}`, background: showAssign ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.04)', color: showAssign ? '#34d399' : '#777', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                            Assign ▾
                          </button>
                        </div>
                      </div>
                      {/* Description */}
                      {m.description && (
                        <div style={{ marginTop: 6, fontSize: 11, color: '#555', lineHeight: 1.5 }}>
                          {isExpanded ? m.description : descTrunc}
                          {m.description.length > 120 && (
                            <button onClick={() => setExpandedDesc(p => ({ ...p, [m.id]: !p[m.id] }))} style={{ marginLeft: 6, background: 'none', border: 'none', color: '#60a5fa', fontSize: 11, cursor: 'pointer', padding: 0 }}>
                              {isExpanded ? 'less' : 'more'}
                            </button>
                          )}
                        </div>
                      )}
                      {/* Assign popup */}
                      {showAssign && (
                        <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.2)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: '#34d399', fontWeight: 600 }}>Assign to agent:</span>
                          <select value={assignAgent} onChange={e => setAssignAgent(e.target.value)} style={{ padding: '5px 8px', borderRadius: 8, background: '#111114', border: '1px solid rgba(52,211,153,0.3)', color: '#fff', fontSize: 11, outline: 'none', cursor: 'pointer' }}>
                            {AGENT_SLOTS.map(s => <option key={s.key} value={s.key}>{s.emoji} {s.label}</option>)}
                          </select>
                          <select value={assignSlotKey} onChange={e => setAssignSlotKey(e.target.value as 'primary' | 'fallback1' | 'fallback2')} style={{ padding: '5px 8px', borderRadius: 8, background: '#111114', border: '1px solid rgba(52,211,153,0.3)', color: '#fff', fontSize: 11, outline: 'none', cursor: 'pointer' }}>
                            <option value="primary">Primary</option>
                            <option value="fallback1">Fallback 1</option>
                            <option value="fallback2">Fallback 2</option>
                          </select>
                          <button onClick={doAssign} style={{ padding: '5px 14px', borderRadius: 8, border: 'none', background: '#34d399', color: '#000', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>OK</button>
                          <button onClick={() => setAssignPopup(null)} style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#555', fontSize: 11, cursor: 'pointer' }}>✕</button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {!modelsLoading && filtered.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 30, color: '#444', fontSize: 13 }}>No models match your filters.</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', padding: '10px 20px', borderRadius: 12, background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.4)', color: '#34d399', fontSize: 13, fontWeight: 600, zIndex: 10, whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.4)', pointerEvents: 'none' }}>
            {toast}
          </div>
        )}
      </div>
    </div>
  );
};
