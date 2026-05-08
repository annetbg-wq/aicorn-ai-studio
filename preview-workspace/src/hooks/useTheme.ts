import { useCallback, useEffect, useMemo } from 'react';
import { DEFAULT_THEME, resolveTheme, type ResolvedTheme, type ThemeChoice } from '@/config/theme';
import { useLocalStorage } from './useLocalStorage';

interface UseThemeResult {
  /** What the user picked: 'light' | 'dark' | 'system'. */
  choice: ThemeChoice;
  /** What is actually applied to the DOM right now. */
  resolved: ResolvedTheme;
  setTheme: (choice: ThemeChoice) => void;
}

/**
 * Owns the theme: persists user choice, listens to system changes when
 * 'system' is picked, applies/removes the `dark` class on <html>.
 */
export function useTheme(): UseThemeResult {
  const [choice, setChoice] = useLocalStorage<ThemeChoice>('app_theme_preference', DEFAULT_THEME);

  const resolved = useMemo<ResolvedTheme>(() => resolveTheme(choice), [choice]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);

  // When the user picked 'system', re-render on OS-level changes.
  useEffect(() => {
    if (choice !== 'system' || typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (): void => {
      document.documentElement.classList.toggle('dark', media.matches);
    };
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [choice]);

  const setTheme = useCallback(
    (next: ThemeChoice) => {
      setChoice(next);
    },
    [setChoice],
  );

  return { choice, resolved, setTheme };
}
