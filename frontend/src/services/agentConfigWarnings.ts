import type { ApiProvider } from './ConfigService';

const PROVIDER_LABELS: Record<ApiProvider, string> = {
  openrouter: 'OpenRouter',
  anthropic:  'Anthropic',
  openai:     'OpenAI',
  google:     'Google',
  deepseek:   'DeepSeek',
  mistral:    'Mistral',
  groq:       'Groq',
};

export function getMissingProviderKeyWarning(
  provider: ApiProvider,
  getProviderKey: (provider: ApiProvider) => string,
): string | null {
  if (getProviderKey(provider)) return null;
  return `⚠ No API key set for ${PROVIDER_LABELS[provider]} — add it in Provider Keys section`;
}