type Locale = 'ru' | 'en';

const translations: Record<Locale, Record<string, string>> = {
  ru: {},
  en: {},
};

let currentLocale: Locale = 'ru';

export function setLocale(locale: Locale) {
  currentLocale = locale;
  localStorage.setItem('app_language', locale);
  window.dispatchEvent(new CustomEvent('locale-changed', { detail: locale }));
}

export function t(key: string, fallback?: string): string {
  return translations[currentLocale][key] ?? translations['en'][key] ?? fallback ?? key;
}

export function initLocale() {
  const saved = localStorage.getItem('app_language') as Locale | null;
  const browser: Locale = navigator.language.startsWith('ru') ? 'ru' : 'en';
  currentLocale = saved ?? browser;
}

export function loadTranslations(locale: Locale, keys: Record<string, string>) {
  translations[locale] = { ...translations[locale], ...keys };
}

export function getCurrentLocale(): Locale { return currentLocale; }
