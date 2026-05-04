import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useTheme } from '@/hooks/useTheme';
import { STORAGE_KEYS } from '@/config/app';
import { SEED_ITEMS, SEED_TAGS, SEED_WORKSPACES } from '@/data/seed';
import type {
  Filters,
  Item,
  ItemStatus,
  LoadingState,
  Tag,
  ThemeChoice,
  ViewMode,
  Workspace,
} from '@/data/types';
import type { ResolvedTheme } from '@/config/theme';

const DEFAULT_FILTERS: Filters = {
  status: 'all',
  priority: 'all',
  tagId: 'all',
  query: '',
};

interface AppContextValue {
  workspaces: readonly Workspace[];
  tags: readonly Tag[];
  items: readonly Item[];
  /** Currently focused workspace id, or 'all' for the union view. */
  activeWorkspaceId: string;
  setActiveWorkspaceId: (id: string) => void;
  view: ViewMode;
  setView: (view: ViewMode) => void;
  filters: Filters;
  setFilters: (patch: Partial<Filters>) => void;
  /** Item id for the open detail sheet, or null when closed. */
  openItemId: string | null;
  openItem: (id: string | null) => void;
  /** Optimistic status update — used by drag-to-column in Kanban. */
  setItemStatus: (id: string, status: ItemStatus) => void;
  loadingState: LoadingState;
  themeChoice: ThemeChoice;
  resolvedTheme: ResolvedTheme;
  setTheme: (choice: ThemeChoice) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps): JSX.Element {
  /* SEED: replace with items from your storage / API layer. */
  const [items, setItems] = useState<readonly Item[]>(SEED_ITEMS);
  const [activeWorkspaceId, setActiveWorkspaceId] = useLocalStorage<string>(
    STORAGE_KEYS.workspace,
    'all',
  );
  const [view, setView] = useLocalStorage<ViewMode>(STORAGE_KEYS.view, 'kanban');
  const [filterState, setFilterState] = useLocalStorage<Filters>(STORAGE_KEYS.filters, DEFAULT_FILTERS);
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage<boolean>(
    `${STORAGE_KEYS.workspace}.sidebar`,
    false,
  );
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const { choice: themeChoice, resolved: resolvedTheme, setTheme } = useTheme();

  const setFilters = useCallback(
    (patch: Partial<Filters>) => {
      setFilterState((prev) => ({ ...prev, ...patch }));
    },
    [setFilterState],
  );

  const setItemStatus = useCallback((id: string, status: ItemStatus) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status } : it)));
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      workspaces: SEED_WORKSPACES,
      tags: SEED_TAGS,
      items,
      activeWorkspaceId,
      setActiveWorkspaceId,
      view,
      setView,
      filters: filterState,
      setFilters,
      openItemId,
      openItem: setOpenItemId,
      setItemStatus,
      loadingState: 'ready',
      themeChoice,
      resolvedTheme,
      setTheme,
      sidebarCollapsed,
      setSidebarCollapsed,
    }),
    [
      items,
      activeWorkspaceId,
      setActiveWorkspaceId,
      view,
      setView,
      filterState,
      setFilters,
      openItemId,
      setItemStatus,
      themeChoice,
      resolvedTheme,
      setTheme,
      sidebarCollapsed,
      setSidebarCollapsed,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
