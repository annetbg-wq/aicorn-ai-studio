export const SUPPORTED_APP_LANGUAGES = ['en', 'ru', 'es', 'de', 'fr', 'zh'] as const;
export type SupportedAppLanguage = (typeof SUPPORTED_APP_LANGUAGES)[number];

export function normalizeAppLanguage(language?: string | null): SupportedAppLanguage {
  const base = language?.toLowerCase().split('-')[0] as SupportedAppLanguage | undefined;
  return base && SUPPORTED_APP_LANGUAGES.includes(base) ? base : 'en';
}
