import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useTheme } from '@/hooks/useTheme';
import { STORAGE_KEYS } from '@/config/app';
import { CURRENT_USER_ID, SEED_USERS } from '@/data/seed';
import type { LoadingState, ThemeChoice, User } from '@/data/types';
import type { ResolvedTheme } from '@/config/theme';

const DEFAULT_FOLLOWS: readonly string[] = ['u-2', 'u-3'] as const;

interface AppContextValue {
  currentUser: User;
  loadingState: LoadingState;
  themeChoice: ThemeChoice;
  resolvedTheme: ResolvedTheme;
  setTheme: (choice: ThemeChoice) => void;
  /** User ids the current user follows. */
  follows: readonly string[];
  isFollowing: (userId: string) => boolean;
  toggleFollow: (userId: string) => void;
  unreadNotifications: number;
  markNotificationsRead: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps): JSX.Element {
  const [follows, setFollows] = useLocalStorage<readonly string[]>(
    STORAGE_KEYS.follows,
    DEFAULT_FOLLOWS,
  );
  const [unreadCount, setUnreadCount] = useLocalStorage<number>(
    STORAGE_KEYS.notifications,
    3, // PRODUCT: derive from real notifications.
  );
  const { choice: themeChoice, resolved: resolvedTheme, setTheme } = useTheme();

  const currentUser = useMemo(
    () => SEED_USERS.find((u) => u.id === CURRENT_USER_ID) ?? SEED_USERS[0],
    [],
  );

  const isFollowing = useCallback(
    (userId: string): boolean => follows.includes(userId),
    [follows],
  );

  const toggleFollow = useCallback(
    (userId: string) => {
      setFollows((prev) =>
        prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
      );
    },
    [setFollows],
  );

  const markNotificationsRead = useCallback(() => {
    setUnreadCount(0);
  }, [setUnreadCount]);

  const value = useMemo<AppContextValue>(
    () => ({
      currentUser,
      loadingState: 'ready',
      themeChoice,
      resolvedTheme,
      setTheme,
      follows,
      isFollowing,
      toggleFollow,
      unreadNotifications: unreadCount,
      markNotificationsRead,
    }),
    [
      currentUser,
      themeChoice,
      resolvedTheme,
      setTheme,
      follows,
      isFollowing,
      toggleFollow,
      unreadCount,
      markNotificationsRead,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
