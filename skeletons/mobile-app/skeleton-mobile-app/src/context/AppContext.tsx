import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useTheme } from '@/hooks/useTheme';
import { STORAGE_KEYS } from '@/config/app';
import type {
  LoadingState,
  SubscriptionPlan,
  ThemeChoice,
  UserProfile,
} from '@/data/types';
import type { ResolvedTheme } from '@/config/theme';

const DEFAULT_PROFILE: UserProfile = {
  id: '',
  name: '',
  goal: '',
  createdAt: '',
  onboardingComplete: false,
  plan: 'free',
  usageCount: 0,
};

/**
 * Studio-preview detection — captured ONCE at module load.
 *
 * The Studio preview iframe boots at `/preview/<rev>?previewSession=<token>` (the
 * backend stamps `previewSession` onto every preview URL). Inside the preview we
 * want the generated feature to be visible immediately instead of gated behind
 * the onboarding wizard, so `isOnboarded` is forced true. This is preview-only
 * and NON-destructive: it never writes to localStorage and never mutates the
 * profile — a real deployed build (whose URL carries no `previewSession`) keeps
 * the onboarding gate fully intact.
 *
 * Captured once, never re-read: react-router navigations drop the query string,
 * so reading `location.search` after the first redirect would lose the signal.
 */
const IS_STUDIO_PREVIEW =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('previewSession');

interface AppContextValue {
  profile: UserProfile;
  isOnboarded: boolean;
  isPremium: boolean;
  loadingState: LoadingState;
  themeChoice: ThemeChoice;
  resolvedTheme: ResolvedTheme;
  setTheme: (choice: ThemeChoice) => void;
  updateProfile: (patch: Partial<UserProfile>) => void;
  completeOnboarding: (input: { name: string; goal: string }) => void;
  /** Increments usage on free plan. Returns true if still under the limit. */
  consumeAction: (limit: number) => boolean;
  setPlan: (plan: SubscriptionPlan) => void;
  resetProfile: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps): JSX.Element {
  const [profile, setProfile] = useLocalStorage<UserProfile>(
    STORAGE_KEYS.profile,
    DEFAULT_PROFILE,
  );
  const { choice: themeChoice, resolved: resolvedTheme, setTheme } = useTheme();

  const updateProfile = useCallback(
    (patch: Partial<UserProfile>) => {
      setProfile((prev) => ({ ...prev, ...patch }));
    },
    [setProfile],
  );

  const completeOnboarding = useCallback(
    (input: { name: string; goal: string }) => {
      setProfile((prev) => ({
        ...prev,
        id: prev.id || crypto.randomUUID(),
        name: input.name.trim(),
        goal: input.goal.trim(),
        createdAt: prev.createdAt || new Date().toISOString(),
        onboardingComplete: true,
      }));
    },
    [setProfile],
  );

  const consumeAction = useCallback(
    (limit: number): boolean => {
      let allowed = true;
      setProfile((prev) => {
        if (prev.plan !== 'free') return prev;
        const next = prev.usageCount + 1;
        allowed = next <= limit;
        return { ...prev, usageCount: next };
      });
      return allowed;
    },
    [setProfile],
  );

  const setPlan = useCallback(
    (plan: SubscriptionPlan) => {
      setProfile((prev) => ({
        ...prev,
        plan,
        usageCount: plan === 'free' ? prev.usageCount : 0,
      }));
    },
    [setProfile],
  );

  const resetProfile = useCallback(() => {
    setProfile(DEFAULT_PROFILE);
  }, [setProfile]);

  const value = useMemo<AppContextValue>(
    () => ({
      profile,
      isOnboarded:
        IS_STUDIO_PREVIEW ||
        (profile.onboardingComplete && profile.name.length > 0),
      isPremium: profile.plan !== 'free',
      // Profile is loaded synchronously from localStorage; for skeleton purposes
      // it is always 'ready'. PRODUCT: flip to 'loading' while fetching from API.
      loadingState: 'ready',
      themeChoice,
      resolvedTheme,
      setTheme,
      updateProfile,
      completeOnboarding,
      consumeAction,
      setPlan,
      resetProfile,
    }),
    [
      profile,
      themeChoice,
      resolvedTheme,
      setTheme,
      updateProfile,
      completeOnboarding,
      consumeAction,
      setPlan,
      resetProfile,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
