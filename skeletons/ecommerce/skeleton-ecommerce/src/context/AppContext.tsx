import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useCart, type UseCartResult } from '@/hooks/useCart';
import { useWishlist, type UseWishlistResult } from '@/hooks/useWishlist';
import type { LoadingState, ThemeChoice } from '@/data/types';
import type { ResolvedTheme } from '@/config/theme';

interface AppContextValue {
  cart: UseCartResult;
  wishlist: UseWishlistResult;
  loadingState: LoadingState;
  themeChoice: ThemeChoice;
  resolvedTheme: ResolvedTheme;
  setTheme: (choice: ThemeChoice) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps): JSX.Element {
  const cart = useCart();
  const wishlist = useWishlist();
  const { choice: themeChoice, resolved: resolvedTheme, setTheme } = useTheme();

  const value = useMemo<AppContextValue>(
    () => ({
      cart,
      wishlist,
      loadingState: 'ready',
      themeChoice,
      resolvedTheme,
      setTheme,
    }),
    [cart, wishlist, themeChoice, resolvedTheme, setTheme],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
