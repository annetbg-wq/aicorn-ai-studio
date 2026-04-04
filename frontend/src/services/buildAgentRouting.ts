import type { ApiProvider } from './ConfigService';
import { ConfigService } from './ConfigService';

export type BuildAgentRoutingReason =
  | 'configured_provider'
  | 'missing_provider_key_fallback'
  | 'anthropic_streaming_fallback';

export interface BuildAgentRoutingResult {
  effectiveProvider: ApiProvider;
  effectiveKey: string;
  effectiveEndpoint: string;
  reason: BuildAgentRoutingReason;
}

/**
 * Resolves the build-agent endpoint, API key, and provider.
 *
 * RULES:
 *   1. Endpoint and key are ALWAYS derived from the agent's configured
 *      `provider` field — NEVER inferred from the model ID string.
 *   2. When the configured provider's key is empty, fall back to
 *      OpenRouter (the actual OPENROUTER_API_KEY, not the caller's apiKey).
 *   3. Anthropic provider always falls back to OpenRouter (no streaming compat).
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

  // Always read the real OpenRouter key from ConfigService — never trust
  // the caller's apiKey which may be a different provider's key.
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

  // Provider is explicitly configured and has a key (or is openrouter).
  // For openrouter: prefer the build-agent key, but fall back to the real OR key.
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
