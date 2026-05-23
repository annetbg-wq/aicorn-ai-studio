import { useEffect, useState } from 'react';
export function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  return { theme, setTheme, toggleTheme: () => setTheme((current) => current === 'dark' ? 'light' : 'dark') };
}
