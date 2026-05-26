import type { ApiProvider, AgentSlot, AgentConfigAuthority } from './ConfigService';
import { ConfigService } from './ConfigService';

// ── Typed error for missing user model selection ──────────────────────────────

/**
 * Thrown by resolveStandardRoute() when the build slot's model originates from
 * a backend factory config or is entirely unconfigured — neither constitutes
 * explicit user selection, so route construction is refused.
 *
 * Callers must catch this and surface a "configure your model" prompt to the user.
 */
export class ModelSelectionRequiredError extends Error {
  readonly slot:      AgentSlot;
  readonly authority: AgentConfigAuthority;

  constructor(slot: AgentSlot, authority: AgentConfigAuthority) {
    super(
      `Model selection required for slot "${slot}" (source authority: ${authority}). ` +
      'Open Settings → Agent Models and choose a model before generating.',
    );
    this.name      = 'ModelSelectionRequiredError';
    this.slot      = slot;
    this.authority = authority;
  }
}

/** Authority values that are NOT acceptable as user-selected route authority. */
const FACTORY_OR_EMPTY_AUTHORITIES: ReadonlySet<AgentConfigAuthority> = new Set([
  'backend_factory_template',
  'backend_file_seed',   // legacy alias for backend_factory_template
  'no_model_configured',
]);

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
  /** True when the config was saved by the user to the runtime file (backend_runtime_saved). */
  isRuntimeConfig:   boolean;
  /** True when the model came from factory config (backend/agent-config.json). Always false
   *  on returned routes because factory authority throws before a route is returned. */
  isFactoryConfig:   boolean;
  /** True when a routing fallback rule was triggered (fallbackReason is set). */
  isProxyFallback:   boolean;
  /** Alias for isProxyFallback — true only when a named fallback rule was explicitly fired. */
  isExplicitFallback: boolean;
  /**
   * Where the Supabase proxy (or dev-bypass) ultimately routes the request.
   *   direct_provider  — endpoint is the provider's own API (not via OpenRouter)
   *   openrouter_proxy — endpoint is OpenRouter (which then routes to the provider)
   *   unknown          — endpoint host not recognised
   * Note: in non-dev-bypass mode ALL calls also go through the Supabase edge function.
   * Use classifyTransportPath() for the full two-level path.
   */
  endpointKind: 'direct_provider' | 'openrouter_proxy' | 'unknown';
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

// ── Transport path classification ─────────────────────────────────────────────

/**
 * The set of native provider hostnames proxied directly by the Supabase edge
 * function (mirrors ALLOWED_HOSTS in supabase/functions/llm-proxy/index.ts).
 */
const NATIVE_PROVIDER_HOSTS = new Set([
  'api.deepseek.com',
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'api.mistral.ai',
  'api.groq.com',
]);

/**
 * Classifies the full LLM transport path given the target endpoint and whether
 * the client is in dev-bypass mode (where the Supabase edge function is skipped).
 *
 *   direct_provider  — dev-bypass active: frontend → provider's native API (no Supabase proxy)
 *   supabase_proxy   — normal mode, native endpoint: frontend → Supabase proxy → provider API
 *   openrouter_proxy — normal mode, OpenRouter endpoint: frontend → Supabase proxy → OpenRouter → provider
 *   unknown          — endpoint host not recognised
 *
 * This is the key function for diagnosing whether OpenRouter is actually in the
 * call chain for a user-selected DeepSeek route.
 */
export function classifyTransportPath(
  endpoint: string,
  devBypassActive: boolean,
): 'direct_provider' | 'supabase_proxy' | 'openrouter_proxy' | 'unknown' {
  if (devBypassActive) return 'direct_provider';
  try {
    const host = new URL(endpoint).hostname;
    if (host.endsWith('openrouter.ai')) return 'openrouter_proxy';
    if (NATIVE_PROVIDER_HOSTS.has(host))  return 'supabase_proxy';
  } catch {
    // malformed endpoint
  }
  return 'unknown';
}

/**
 * Simplified endpoint-kind classification used in AgentExecutionRoute.
 * Describes where the Supabase proxy (or dev-bypass) ultimately sends the request:
 *   direct_provider  — endpoint is the provider's own API (not via OpenRouter)
 *   openrouter_proxy — endpoint is OpenRouter (which then routes to the provider)
 *   unknown          — endpoint host not recognised
 *
 * Note: in non-dev-bypass mode ALL calls also go through the Supabase transport
 * layer first.  Use classifyTransportPath() for the full two-level path.
 */
function endpointKindForRoute(
  endpoint: string,
): 'direct_provider' | 'openrouter_proxy' | 'unknown' {
  try {
    const host = new URL(endpoint).hostname;
    if (host.endsWith('openrouter.ai')) return 'openrouter_proxy';
    if (NATIVE_PROVIDER_HOSTS.has(host))  return 'direct_provider';
  } catch {
    // malformed endpoint
  }
  return 'unknown';
}

// ── Route telemetry ───────────────────────────────────────────────────────────

/**
 * Emits a compact single-line structured diagnostic log for LLM route authority.
 *
 * Fields emitted:
 *   llm_route_provider           — effective provider (after fallback rules)
 *   llm_route_model_id           — normalised model identifier
 *   llm_route_endpoint_kind      — direct_provider | openrouter_proxy | unknown
 *   llm_route_proxy_provider     — set when a proxy intermediary (e.g. openrouter) is used
 *   llm_route_key_source         — human-readable key origin (no raw key material)
 *   llm_route_fallback_reason    — fallback reason if a rule fired, null otherwise
 *   llm_route_authority_source   — model provenance (user_set | backend_runtime_saved | …)
 *   llm_route_is_explicit_fallback — true only when a named fallback rule fired
 *
 * Never logs API keys, raw key material, prompts, or generated code.
 */
export function recordLlmRouteTelemetry(route: {
  provider:        string;
  modelId:         string;
  endpoint:        string;
  endpointKind:    string;
  keySource:       string;
  fallbackReason?: string;
  sourceAuthority: string;
  isProxyFallback: boolean;
}): void {
  console.log('[llm_route]', {
    llm_route_provider:            route.provider,
    llm_route_model_id:            route.modelId,
    llm_route_endpoint_kind:       route.endpointKind,
    llm_route_proxy_provider:      route.provider === 'openrouter' ? 'openrouter' : null,
    llm_route_key_source:          route.keySource,
    llm_route_fallback_reason:     route.fallbackReason ?? null,
    llm_route_authority_source:    route.sourceAuthority,
    llm_route_is_explicit_fallback: route.isProxyFallback,
  });
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

  // ── Enforce user-selection requirement for the build/coder slot ───────────
  // Factory config (backend/agent-config.json) and no-model are both unacceptable
  // as route authority. Generation must not silently use committed factory defaults.
  if (slot === 'build' && FACTORY_OR_EMPTY_AUTHORITIES.has(sourceAuthority)) {
    throw new ModelSelectionRequiredError(slot, sourceAuthority);
  }

  const keyResolution         = ConfigService.getKeyResolutionForAgent(slot);
  const rawProvider           = (cfg.provider ?? keyResolution.provider ?? 'openrouter') as ApiProvider;
  const configuredKey         = keyResolution.key;
  const configuredKeySource   = keyResolution.keySource;
  const fallbackOpenRouterKey = ConfigService.getProviderApiKey('openrouter');

  // Rule 3: Anthropic → OpenRouter fallback (streaming incompatibility)
  if (rawProvider === 'anthropic') {
    const endpoint    = endpointForProvider('openrouter');
    const modelId     = normalizeModelForEndpoint(rawModelId, endpoint);
    const endpointKind = endpointKindForRoute(endpoint);
    const reason      =
      `slot=${slot} model=${modelId} configured-provider=anthropic → openrouter (streaming-fallback)`;
    onLog?.(`[RouteResolver] ${reason} [authority=${sourceAuthority}]`);
    const route: AgentExecutionRoute = {
      slot,
      provider:          'openrouter',
      modelId,
      endpoint,
      apiKey:            fallbackOpenRouterKey,
      keySource:         `${agentKey}.openrouter (anthropic-streaming-fallback)`,
      reason,
      fallbackReason:    'anthropic_streaming_fallback',
      sourceAuthority,
      isUserSelected:    sourceAuthority === 'user_set',
      isRuntimeConfig:   sourceAuthority === 'backend_runtime_saved',
      isFactoryConfig:   false,
      isProxyFallback:   true,
      isExplicitFallback: true,
      endpointKind,
    };
    recordLlmRouteTelemetry(route);
    return route;
  }

  // Rule 2: missing provider key → OpenRouter fallback
  if (!configuredKey && rawProvider !== 'openrouter') {
    const endpoint    = endpointForProvider('openrouter');
    const modelId     = normalizeModelForEndpoint(rawModelId, endpoint);
    const endpointKind = endpointKindForRoute(endpoint);
    const reason      =
      `slot=${slot} model=${modelId} configured-provider=${rawProvider} key=MISSING → openrouter (missing-key-fallback)`;
    onLog?.(`[RouteResolver] ${reason} [authority=${sourceAuthority}]`);
    const route: AgentExecutionRoute = {
      slot,
      provider:          'openrouter',
      modelId,
      endpoint,
      apiKey:            fallbackOpenRouterKey,
      keySource:         `${agentKey}.openrouter (missing-provider-key-fallback)`,
      reason,
      fallbackReason:    'missing_provider_key_fallback',
      sourceAuthority,
      isUserSelected:    sourceAuthority === 'user_set',
      isRuntimeConfig:   sourceAuthority === 'backend_runtime_saved',
      isFactoryConfig:   false,
      isProxyFallback:   true,
      isExplicitFallback: true,
      endpointKind,
    };
    recordLlmRouteTelemetry(route);
    return route;
  }

  // Rule 1: use configured provider (OpenRouter prefers agent key, falls back to global key)
  const resolvedKey  = rawProvider === 'openrouter'
    ? (configuredKey || fallbackOpenRouterKey)
    : configuredKey;
  const endpoint     = endpointForProvider(rawProvider);
  const modelId      = normalizeModelForEndpoint(rawModelId, endpoint);
  const endpointKind = endpointKindForRoute(endpoint);
  const keyTail      = resolvedKey ? `...${resolvedKey.slice(-6)}` : '(none)';
  const reason       =
    `slot=${slot} model=${modelId} provider=${rawProvider} key=${keyTail}`;
  onLog?.(`[RouteResolver] ${reason} [authority=${sourceAuthority}]`);

  const route: AgentExecutionRoute = {
    slot,
    provider:          rawProvider,
    modelId,
    endpoint,
    apiKey:            resolvedKey,
    keySource:         configuredKeySource,
    reason,
    sourceAuthority,
    isUserSelected:    sourceAuthority === 'user_set',
    isRuntimeConfig:   sourceAuthority === 'backend_runtime_saved',
    isFactoryConfig:   false,
    isProxyFallback:   false,
    isExplicitFallback: false,
    endpointKind,
  };
  recordLlmRouteTelemetry(route);
  return route;
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
