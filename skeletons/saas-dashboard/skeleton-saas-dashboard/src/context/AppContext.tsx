import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useTheme } from '@/hooks/useTheme';
import { STORAGE_KEYS } from '@/config/app';
import { DEFAULT_CHECKLIST } from '@/data/seed';
import type { ChecklistTask, LoadingState, ThemeChoice, UserProfile } from '@/data/types';
import type { ResolvedTheme } from '@/config/theme';

const DEFAULT_PROFILE: UserProfile = {
  id: 'local-user',
  /** PRODUCT: replace with real session data on first sign-in. */
  name: 'Maya Chen',
  email: 'maya@example.com',
  role: 'owner',
};

interface AppContextValue {
  profile: UserProfile;
  loadingState: LoadingState;
  themeChoice: ThemeChoice;
  resolvedTheme: ResolvedTheme;
  setTheme: (choice: ThemeChoice) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  checklist: readonly ChecklistTask[];
  toggleTask: (id: string) => void;
  dismissChecklist: () => void;
  isChecklistDismissed: boolean;
  updateProfile: (patch: Partial<UserProfile>) => void;
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
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage<boolean>(
    STORAGE_KEYS.sidebarCollapsed,
    false,
  );
  const [checklistState, setChecklistState] = useLocalStorage<{
    tasks: readonly ChecklistTask[];
    dismissed: boolean;
  }>(STORAGE_KEYS.onboardingChecklist, { tasks: DEFAULT_CHECKLIST, dismissed: false });

  const { choice: themeChoice, resolved: resolvedTheme, setTheme } = useTheme();

  const updateProfile = useCallback(
    (patch: Partial<UserProfile>) => {
      setProfile((prev) => ({ ...prev, ...patch }));
    },
    [setProfile],
  );

  const toggleTask = useCallback(
    (id: string) => {
      setChecklistState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
      }));
    },
    [setChecklistState],
  );

  const dismissChecklist = useCallback(() => {
    setChecklistState((prev) => ({ ...prev, dismissed: true }));
  }, [setChecklistState]);

  const value = useMemo<AppContextValue>(
    () => ({
      profile,
      loadingState: 'ready',
      themeChoice,
      resolvedTheme,
      setTheme,
      sidebarCollapsed,
      setSidebarCollapsed,
      checklist: checklistState.tasks,
      toggleTask,
      dismissChecklist,
      isChecklistDismissed: checklistState.dismissed,
      updateProfile,
    }),
    [
      profile,
      themeChoice,
      resolvedTheme,
      setTheme,
      sidebarCollapsed,
      setSidebarCollapsed,
      checklistState,
      toggleTask,
      dismissChecklist,
      updateProfile,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
