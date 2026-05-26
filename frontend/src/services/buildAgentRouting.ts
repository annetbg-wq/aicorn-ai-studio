import type { ApiProvider, AgentSlot, AgentConfigAuthority } from './ConfigService';
import { ConfigService } from './ConfigService';

// ── Canonical routing contract ────────────────────────────────────────────────

/**
 * The single execution-routing object for a standard-path generation call.
 *
 * Produced ONCE by resolveStandardRoute() at the top of the call stack
 * (in useStudio), then passed downward through every pipeline layer.
 *
 * INVARIANTS:
 *   - No layer below the resolver may call ConfigService.resolveModel(),
 *     ConfigService.getKeyForAgent(), or infer provider from modelId.
 *   - provider is always the effective provider after fallback rules.
 *   - apiKey is always the key that matches the effective provider.
 *   - If a standard-path generation starts without this object, it MUST throw.
 */
export interface AgentExecutionRoute {
  /** Agent slot this route serves. */
  slot:            AgentSlot;
  /** Effective provider after fallback rules (may differ from configured). */
  provider:        ApiProvider;
  /** Model ID for this slot (read from agent config, never inferred). */
  modelId:         string;
  /** Fully-qualified API endpoint URL for this provider. */
  endpoint:        string;
  /** Resolved API key (correct for the effective provider). */
  apiKey:          string;
  /** Human-readable source description for the key (for logs). */
  keySource:       string;
  /** Primary routing reason (for logs and telemetry). */
  reason:          string;
  /** Secondary reason when a fallback rule was triggered. */
  fallbackReason?: string;

  // ── Diagnostic fields (telemetry only — do not affect routing) ─────────────

  /** Where the resolved modelId came from in the resolution chain. */
  sourceAuthority:   AgentConfigAuthority;
  /** True only when the user explicitly saved this slot via the Settings UI. */
  isUserSelected:    boolean;
  /** True when the config was seeded from backend/agent-config.json at startup. */
  isRuntimeConfig:   boolean;
  /** True when a routing fallback rule was triggered (fallbackReason is set). */
  isProxyFallback:   boolean;
}

// ── Endpoint resolution (mirrors Orchestrator.getEndpoint without the import) ─

function endpointForProvider(provider: ApiProvider): string {
  switch (provider) {
    case 'anthropic': return 'https://api.anthropic.com/v1/messages';
    case 'openai':    return 'https://api.openai.com/v1/chat/completions';
    case 'google':    return 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
    case 'deepseek':  return 'https://api.deepseek.com/v1/chat/completions';
    case 'mistral':   return 'https://api.mistral.ai/v1/chat/completions';
    case 'groq':      return 'https://api.groq.com/openai/v1/chat/completions';
    default:          return 'https://openrouter.ai/api/v1/chat/completions';
  }
}

/**
 * Strip the provider prefix from a model ID when targeting a native API.
 * e.g. "deepseek/deepseek-v4-flash" → "deepseek-v4-flash" for DeepSeek's own endpoint.
 * OpenRouter model IDs (which need the prefix) are left untouched.
 */
function normalizeModelForEndpoint(modelId: string, endpoint: string): string {
  const isOpenRouter = endpoint.includes('openrouter.ai');
  if (!isOpenRouter && modelId.includes('/')) {
    return modelId.split('/').slice(1).join('/');
  }
  return modelId;
}

const SLOT_AGENT_KEY: Record<AgentSlot, string> = {
  primary: 'agent_primary',
  fix:     'agent_fix',
  spec:    'agent_spec',
  build:   'agent_build',
  qa:      'agent_qa',
  chat:    'agent_primary',
};

// ── Canonical resolver ────────────────────────────────────────────────────────

/**
 * Resolves a complete AgentExecutionRoute for the given agent slot.
 *
 * RULES (applies to every slot, not just build):
 *   1. Provider and endpoint ALWAYS come from the slot's configured provider.
 *      Never inferred from the model ID string.
 *   2. When the configured provider's key is empty and the provider is not
 *      openrouter, fall back to OpenRouter + the global OpenRouter key.
 *   3. Anthropic provider always falls back to OpenRouter (no streaming compat).
 *   4. The returned object is the single source of truth for routing; no
 *      downstream layer may re-resolve any field.
 */
export function resolveStandardRoute(
  slot: AgentSlot,
  opts?: { onLog?: (msg: string) => void },
): AgentExecutionRoute {
  const { onLog } = opts ?? {};

  const agentKey              = SLOT_AGENT_KEY[slot];
  const cfg                   = ConfigService.getAgentConfig(agentKey);
  const { modelId: rawModelId, authority: sourceAuthority }
                              = ConfigService.resolveModelWithAuthority(slot);
  const keyResolution         = ConfigService.getKeyResolutionForAgent(slot);
  const rawProvider           = (cfg.provider ?? keyResolution.provider ?? 'openrouter') as ApiProvider;
  const configuredKey         = keyResolution.key;
  const configuredKeySource   = keyResolution.keySource;
  const fallbackOpenRouterKey = ConfigService.getProviderApiKey('openrouter');

  // Rule 3: Anthropic → OpenRouter fallback (streaming incompatibility)
  if (rawProvider === 'anthropic') {
    const endpoint = endpointForProvider('openrouter');
    const modelId  = normalizeModelForEndpoint(rawModelId, endpoint);
    const reason   =
      `slot=${slot} model=${modelId} configured-provider=anthropic → openrouter (streaming-fallback)`;
    onLog?.(`[RouteResolver] ${reason} [authority=${sourceAuthority}]`);
    return {
      slot,
      provider:       'openrouter',
      modelId,
      endpoint,
      apiKey:         fallbackOpenRouterKey,
      keySource:      `${agentKey}.openrouter (anthropic-streaming-fallback)`,
      reason,
      fallbackReason: 'anthropic_streaming_fallback',
      sourceAuthority,
      isUserSelected:  sourceAuthority === 'user_set',
      isRuntimeConfig: sourceAuthority === 'backend_file_seed',
      isProxyFallback: true,
    };
  }

  // Rule 2: missing provider key → OpenRouter fallback
  if (!configuredKey && rawProvider !== 'openrouter') {
    const endpoint = endpointForProvider('openrouter');
    const modelId  = normalizeModelForEndpoint(rawModelId, endpoint);
    const reason   =
      `slot=${slot} model=${modelId} configured-provider=${rawProvider} key=MISSING → openrouter (missing-key-fallback)`;
    onLog?.(`[RouteResolver] ${reason} [authority=${sourceAuthority}]`);
    return {
      slot,
      provider:       'openrouter',
      modelId,
      endpoint,
      apiKey:         fallbackOpenRouterKey,
      keySource:      `${agentKey}.openrouter (missing-provider-key-fallback)`,
      reason,
      fallbackReason: 'missing_provider_key_fallback',
      sourceAuthority,
      isUserSelected:  sourceAuthority === 'user_set',
      isRuntimeConfig: sourceAuthority === 'backend_file_seed',
      isProxyFallback: true,
    };
  }

  // Rule 1: use configured provider (OpenRouter prefers agent key, falls back to global key)
  const resolvedKey = rawProvider === 'openrouter'
    ? (configuredKey || fallbackOpenRouterKey)
    : configuredKey;
  const endpoint    = endpointForProvider(rawProvider);
  const modelId     = normalizeModelForEndpoint(rawModelId, endpoint);
  const keyTail     = resolvedKey ? `...${resolvedKey.slice(-6)}` : '(none)';
  const reason      =
    `slot=${slot} model=${modelId} provider=${rawProvider} key=${keyTail}`;
  onLog?.(`[RouteResolver] ${reason} [authority=${sourceAuthority}]`);

  return {
    slot,
    provider:  rawProvider,
    modelId,
    endpoint,
    apiKey:    resolvedKey,
    keySource: configuredKeySource,
    reason,
    sourceAuthority,
    isUserSelected:  sourceAuthority === 'user_set',
    isRuntimeConfig: sourceAuthority === 'backend_file_seed',
    isProxyFallback: false,
  };
}

// ── Legacy types & function (kept for backward compat in AgentLoopService) ────

export type BuildAgentRoutingReason =
  | 'configured_provider'
  | 'missing_provider_key_fallback'
  | 'anthropic_streaming_fallback';

/** @deprecated Use AgentExecutionRoute + resolveStandardRoute() instead. */
export interface BuildAgentRoutingResult {
  effectiveProvider: ApiProvider;
  effectiveKey: string;
  effectiveEndpoint: string;
  reason: BuildAgentRoutingReason;
}

/**
 * @deprecated Use resolveStandardRoute() instead.
 *
 * Preserved for AgentLoopService's build-agent path until it is migrated
 * to the AgentExecutionRoute contract.
 */
export function resolveBuildAgentRouting(config: {
  buildModelId: string;
  buildProvider?: ApiProvider;
  buildApiKey: string;
  openRouterApiKey: string;
  resolveEndpoint: (provider: ApiProvider) => string;
  onLog?: (msg: string) => void;
}): BuildAgentRoutingResult {
  const {
    buildModelId,
    buildProvider = 'openrouter',
    buildApiKey,
    resolveEndpoint,
    onLog,
  } = config;

  const realOpenRouterKey = ConfigService.getApiKey();

  if (buildProvider === 'anthropic') {
    onLog?.(
      `[BuildAgentRouting] reason=anthropic_streaming_fallback provider=${buildProvider} model=${buildModelId} → openrouter`,
    );
    return {
      effectiveProvider: 'openrouter',
      effectiveKey: realOpenRouterKey,
      effectiveEndpoint: resolveEndpoint('openrouter'),
      reason: 'anthropic_streaming_fallback',
    };
  }

  if (!buildApiKey && buildProvider !== 'openrouter') {
    onLog?.(
      `[BuildAgentRouting] reason=missing_provider_key_fallback provider=${buildProvider} model=${buildModelId} → openrouter`,
    );
    return {
      effectiveProvider: 'openrouter',
      effectiveKey: realOpenRouterKey,
      effectiveEndpoint: resolveEndpoint('openrouter'),
      reason: 'missing_provider_key_fallback',
    };
  }

  const key = buildProvider === 'openrouter'
    ? (buildApiKey || realOpenRouterKey)
    : buildApiKey;

  onLog?.(
    `[BuildAgentRouting] reason=configured_provider provider=${buildProvider} model=${buildModelId} keyTail=...${key.slice(-6) || '(none)'}`,
  );

  return {
    effectiveProvider: buildProvider,
    effectiveKey: key,
    effectiveEndpoint: resolveEndpoint(buildProvider),
    reason: 'configured_provider',
  };
}
