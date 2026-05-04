import { useCallback, useEffect, useState } from 'react';

type Setter<T> = (value: T | ((prev: T) => T)) => void;

/**
 * Typed localStorage state, SSR-safe and tab-synced.
 * - Reads once on mount; defaults to `initial` on first run or parse failure.
 * - Writes JSON-serialized on every change.
 * - `storage` events from other tabs trigger re-render with the new value.
 */
export function useLocalStorage<T>(key: string, initial: T): [T, Setter<T>] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  const update = useCallback<Setter<T>>(
    (next) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* quota exceeded or private mode — silently ignore */
        }
        return resolved;
      });
    },
    [key],
  );

  useEffect(() => {
    function onStorage(event: StorageEvent): void {
      if (event.key !== key || event.newValue === null) return;
      try {
        setValue(JSON.parse(event.newValue) as T);
      } catch {
        /* ignore malformed cross-tab value */
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);

  return [value, update];
}
