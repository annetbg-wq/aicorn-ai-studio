import { useCallback, useMemo, useState } from 'react';
import type { Item, Workspace } from '@/data/types';

export interface CommandResult {
  id: string;
  type: 'item' | 'workspace';
  title: string;
  subtitle: string;
  /** What clicking the result does. */
  onActivate: () => void;
}

interface UseCommandPaletteInput {
  items: readonly Item[];
  workspaces: readonly Workspace[];
  onOpenItem: (itemId: string) => void;
  onOpenWorkspace: (workspaceId: string) => void;
}

interface UseCommandPaletteResult {
  query: string;
  setQuery: (q: string) => void;
  results: readonly CommandResult[];
}

/**
 * Pure command-palette state: query string + matching results across
 * items and workspaces. Open/close state is owned by the host so that
 * Cmd+K wiring (via useKeyboard) lives in one place.
 */
export function useCommandPalette({
  items,
  workspaces,
  onOpenItem,
  onOpenWorkspace,
}: UseCommandPaletteInput): UseCommandPaletteResult {
  const [query, setQueryState] = useState('');

  const setQuery = useCallback((q: string) => setQueryState(q), []);

  const results = useMemo<readonly CommandResult[]>(() => {
    const q = query.trim().toLowerCase();
    const matches: CommandResult[] = [];

    for (const ws of workspaces) {
      if (!q || ws.name.toLowerCase().includes(q)) {
        matches.push({
          id: `ws-${ws.id}`,
          type: 'workspace',
          title: ws.name,
          subtitle: ws.description,
          onActivate: () => onOpenWorkspace(ws.id),
        });
      }
    }

    for (const item of items) {
      if (!q || item.title.toLowerCase().includes(q)) {
        const ws = workspaces.find((w) => w.id === item.workspaceId);
        matches.push({
          id: `item-${item.id}`,
          type: 'item',
          title: item.title,
          subtitle: ws ? `${ws.name} · ${item.status.replace('_', ' ')}` : item.status,
          onActivate: () => onOpenItem(item.id),
        });
      }
      if (matches.length >= 30) break;
    }

    return matches;
  }, [query, items, workspaces, onOpenItem, onOpenWorkspace]);

  return { query, setQuery, results };
}
