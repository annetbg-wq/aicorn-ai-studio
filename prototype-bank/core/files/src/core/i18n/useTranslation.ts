import { useState, useEffect } from 'react';
import { t, setLocale, getCurrentLocale } from './i18n';

export function useTranslation() {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const handler = () => forceUpdate(n => n + 1);
    window.addEventListener('locale-changed', handler);
    return () => window.removeEventListener('locale-changed', handler);
  }, []);

  return { t, setLocale, currentLocale: getCurrentLocale() };
}
