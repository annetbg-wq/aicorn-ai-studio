import { useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { STORAGE_KEYS } from '@/config/app';

export interface UseWishlistResult {
  ids: readonly string[];
  has: (productId: string) => boolean;
  toggle: (productId: string) => void;
  count: number;
}

/**
 * Saved/wishlist set. Stores only product ids — re-resolves against the
 * catalog at render time.
 */
export function useWishlist(): UseWishlistResult {
  const [ids, setIds] = useLocalStorage<readonly string[]>(STORAGE_KEYS.wishlist, []);

  const has = useCallback((productId: string) => ids.includes(productId), [ids]);

  const toggle = useCallback(
    (productId: string) => {
      setIds((prev) =>
        prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId],
      );
    },
    [setIds],
  );

  return { ids, has, toggle, count: ids.length };
}
