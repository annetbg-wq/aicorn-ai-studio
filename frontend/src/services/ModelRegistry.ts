/**
 * ModelRegistry — Dynamic model loading per provider.
 * Loads ALL models from OpenRouter and filters by provider prefix.
 * This is simpler and more reliable than hitting individual provider APIs.
 */
import { llmGet } from './LLMProxy';

export interface Model {
  id: string;
  name: string;
}

/**
 * Fetch models from OpenRouter, filtering by provider.
 * Uses OpenRouter's catalog which includes all major providers:
 * - google/... (Google models)
 * - anthropic/... (Anthropic Claude models)
 * - openai/... (OpenAI models)
 * - deepseek/... (DeepSeek models)
 * - openrouter (native OpenRouter models)
 */
export async function fetchModels(
  provider: string,
  openrouterKey: string
): Promise<Model[]> {
  console.log(`[ModelRegistry] Fetching ${provider} models from OpenRouter...`);

  if (!openrouterKey) {
    console.warn(`[ModelRegistry] No OpenRouter API key provided`);
    return [];
  }

  try {
    const resp = await llmGet('https://openrouter.ai/api/v1/models', {
      'Authorization': `Bearer ${openrouterKey}`,
    });

    console.log(`[ModelRegistry] Response status: ${resp.status}`);
    if (!resp.ok) {
      console.error(`[ModelRegistry] HTTP error: ${resp.status}`);
      return [];
    }

    const data = await resp.json();
    const allModels = data.data ?? [];
    console.log(`[ModelRegistry] Total models from OpenRouter: ${allModels.length}`);

    // Map provider names to model ID prefixes
    const providerFilters: Record<string, string> = {
      google: 'google/',
      anthropic: 'anthropic/',
      openai: 'openai/',
      deepseek: 'deepseek/',
      openrouter: '', // Return all
    };

    const filter = providerFilters[provider] ?? '';
    console.log(`[ModelRegistry] Filtering for provider='${provider}', prefix='${filter}'`);

    const filtered = allModels
      .filter((m: any) => {
        if (filter === '') return true; // openrouter gets all
        return m.id.startsWith(filter);
      });

    console.log(`[ModelRegistry] After filter: ${filtered.length} models`);

    const models = filtered
      .map((m: any) => ({
        id: m.id,
        name: m.name ?? m.id,
      }))
      .sort((a: { id: string; name: string }, b: { id: string; name: string }) => a.name.localeCompare(b.name));

    console.log(`[ModelRegistry] Final count: ${models.length}`);
    if (models.length > 0) {
      console.log(`[ModelRegistry] First ${provider} model:`, models[0]);
    }

    return models;
  } catch (err) {
    console.error(`[ModelRegistry] Error fetching models:`, err);
    return [];
  }
}

/**
 * Cache for model lists (provider:apiKey -> models[])
 * Prevents repeated API calls during the session
 */
const modelCache = new Map<string, { models: Model[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchModelsWithCache(
  provider: string,
  apiKey: string
): Promise<Model[]> {
  const cacheKey = `${provider}:${apiKey.slice(0, 10)}`; // Partial key for privacy
  const cached = modelCache.get(cacheKey);

  // Return cached if still fresh
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[ModelRegistry] ✅ Cache hit for ${provider} (${cached.models.length} models)`);
    return cached.models;
  }

  if (cached) {
    console.log(`[ModelRegistry] Cache expired for ${provider}, fetching fresh...`);
  } else {
    console.log(`[ModelRegistry] No cache for ${provider}, fetching...`);
  }

  // Fetch fresh and cache
  const models = await fetchModels(provider, apiKey);
  console.log(`[ModelRegistry] Caching ${models.length} models for ${provider}`);
  modelCache.set(cacheKey, { models, timestamp: Date.now() });
  return models;
}

export function clearModelCache(): void {
  modelCache.clear();
}
