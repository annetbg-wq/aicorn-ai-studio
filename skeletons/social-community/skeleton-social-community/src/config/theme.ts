/**
 * Theme contract. Light/dark/system are the supported user choices.
 * The resolver reduces 'system' to 'light' or 'dark' based on prefers-color-scheme.
 */
export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const DEFAULT_THEME: ThemeChoice = 'system';

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice === 'system') {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return choice;
}
