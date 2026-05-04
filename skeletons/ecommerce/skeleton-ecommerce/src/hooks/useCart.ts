import { useCallback, useMemo } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { STORAGE_KEYS } from '@/config/app';
import { SEED_PRODUCTS } from '@/data/seed';
import type { CartLine } from '@/data/types';

interface CartLineHydrated extends CartLine {
  productTitle: string;
  variantLabel: string;
  unitPrice: number;
  vendor: string;
  imageKey?: string;
  inStock: boolean;
}

export interface UseCartResult {
  lines: readonly CartLineHydrated[];
  itemCount: number;
  subtotal: number;
  add: (productId: string, variantId: string, quantity?: number) => void;
  remove: (productId: string, variantId: string) => void;
  setQuantity: (productId: string, variantId: string, quantity: number) => void;
  clear: () => void;
}

/**
 * Cart state, persisted to localStorage. Hydrates lines with product
 * details on read so consumers do not have to join with the catalog.
 *
 * PRODUCT: lookup `SEED_PRODUCTS` is replaced with a real catalog source.
 */
export function useCart(): UseCartResult {
  const [rawLines, setLines] = useLocalStorage<readonly CartLine[]>(STORAGE_KEYS.cart, []);

  const hydrated = useMemo<readonly CartLineHydrated[]>(() => {
    const out: CartLineHydrated[] = [];
    for (const line of rawLines) {
      const product = SEED_PRODUCTS.find((p) => p.id === line.productId);
      if (!product) continue;
      const variant = product.variants.find((v) => v.id === line.variantId);
      if (!variant) continue;
      out.push({
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
        productTitle: product.title,
        variantLabel: variant.label,
        unitPrice: product.price,
        vendor: product.vendor,
        imageKey: product.imageKeys[0],
        inStock: variant.inStock,
      });
    }
    return out;
  }, [rawLines]);

  const itemCount = useMemo(
    () => hydrated.reduce((sum, l) => sum + l.quantity, 0),
    [hydrated],
  );

  const subtotal = useMemo(
    () => hydrated.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0),
    [hydrated],
  );

  const add = useCallback(
    (productId: string, variantId: string, quantity: number = 1) => {
      setLines((prev) => {
        const existing = prev.find((l) => l.productId === productId && l.variantId === variantId);
        if (existing) {
          return prev.map((l) =>
            l.productId === productId && l.variantId === variantId
              ? { ...l, quantity: l.quantity + quantity }
              : l,
          );
        }
        return [...prev, { productId, variantId, quantity }];
      });
    },
    [setLines],
  );

  const remove = useCallback(
    (productId: string, variantId: string) => {
      setLines((prev) =>
        prev.filter((l) => !(l.productId === productId && l.variantId === variantId)),
      );
    },
    [setLines],
  );

  const setQuantity = useCallback(
    (productId: string, variantId: string, quantity: number) => {
      if (quantity <= 0) {
        remove(productId, variantId);
        return;
      }
      setLines((prev) =>
        prev.map((l) =>
          l.productId === productId && l.variantId === variantId ? { ...l, quantity } : l,
        ),
      );
    },
    [setLines, remove],
  );

  const clear = useCallback(() => setLines([]), [setLines]);

  return { lines: hydrated, itemCount, subtotal, add, remove, setQuantity, clear };
}
