import { Layout, Inbox, Star, Archive, type LucideIcon } from 'lucide-react';

export interface SidebarFilter {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Predicate hint — matched in pages. */
  match: 'all' | 'inbox' | 'starred' | 'archive';
}

/**
 * Static sidebar entries shown above the workspace list.
 * The workspace list itself is dynamic (see Sidebar.tsx).
 */
export const SIDEBAR_FILTERS: readonly SidebarFilter[] = [
  { id: 'all',      label: 'All work',  icon: Layout,  match: 'all' },
  { id: 'inbox',    label: 'Inbox',     icon: Inbox,   match: 'inbox' },
  { id: 'starred',  label: 'Starred',   icon: Star,    match: 'starred' },
  { id: 'archive',  label: 'Archive',   icon: Archive, match: 'archive' },
] as const;
