import type { ApiProvider, AgentSlot } from './ConfigService';
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
  const modelId               = ConfigService.resolveModel(slot);
  const keyResolution         = ConfigService.getKeyResolutionForAgent(slot);
  const rawProvider           = (cfg.provider ?? keyResolution.provider ?? 'openrouter') as ApiProvider;
  const configuredKey         = keyResolution.key;
  const configuredKeySource   = keyResolution.keySource;
  const fallbackOpenRouterKey = ConfigService.getProviderApiKey('openrouter');

  // Rule 3: Anthropic → OpenRouter fallback (streaming incompatibility)
  if (rawProvider === 'anthropic') {
    const endpoint = endpointForProvider('openrouter');
    const reason   =
      `slot=${slot} model=${modelId} configured-provider=anthropic → openrouter (streaming-fallback)`;
    onLog?.(`[RouteResolver] ${reason}`);
    return {
      slot,
      provider:       'openrouter',
      modelId,
      endpoint,
      apiKey:         fallbackOpenRouterKey,
      keySource:      `${agentKey}.openrouter (anthropic-streaming-fallback)`,
      reason,
      fallbackReason: 'anthropic_streaming_fallback',
    };
  }

  // Rule 2: missing provider key → OpenRouter fallback
  if (!configuredKey && rawProvider !== 'openrouter') {
    const endpoint = endpointForProvider('openrouter');
    const reason   =
      `slot=${slot} model=${modelId} configured-provider=${rawProvider} key=MISSING → openrouter (missing-key-fallback)`;
    onLog?.(`[RouteResolver] ${reason}`);
    return {
      slot,
      provider:       'openrouter',
      modelId,
      endpoint,
      apiKey:         fallbackOpenRouterKey,
      keySource:      `${agentKey}.openrouter (missing-provider-key-fallback)`,
      reason,
      fallbackReason: 'missing_provider_key_fallback',
    };
  }

  // Rule 1: use configured provider (OpenRouter prefers agent key, falls back to global key)
  const resolvedKey = rawProvider === 'openrouter'
    ? (configuredKey || fallbackOpenRouterKey)
    : configuredKey;
  const endpoint    = endpointForProvider(rawProvider);
  const keyTail     = resolvedKey ? `...${resolvedKey.slice(-6)}` : '(none)';
  const reason      =
    `slot=${slot} model=${modelId} provider=${rawProvider} key=${keyTail}`;
  onLog?.(`[RouteResolver] ${reason}`);

  return {
    slot,
    provider:  rawProvider,
    modelId,
    endpoint,
    apiKey:    resolvedKey,
    keySource: configuredKeySource,
    reason,
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
