import type { ThemeChoice } from '@/config/theme';

export type ID = string;
export type LoadingState = 'idle' | 'loading' | 'ready' | 'error';
export type ViewMode = 'kanban' | 'list';
export type ItemStatus = 'backlog' | 'in_progress' | 'in_review' | 'done';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface Workspace {
  id: ID;
  name: string;
  /** Single-letter / emoji icon shown in the sidebar. */
  icon: string;
  /** Brief one-line summary shown beneath the workspace name. */
  description: string;
  /** Items count for badge — derived from items list, but cached for the sidebar. */
  itemCount: number;
}

export interface Tag {
  id: ID;
  label: string;
  /** One of the design-token color families. */
  color: 'primary' | 'success' | 'warning' | 'rose' | 'violet';
}

export interface Item {
  id: ID;
  workspaceId: ID;
  title: string;
  description: string;
  status: ItemStatus;
  priority: Priority;
  /** ISO date (no time component). Optional — items without due dates are valid. */
  dueDate?: string;
  /** Tag ids referencing the workspace tag set. */
  tagIds: readonly ID[];
  /** Free-form assignee name. PRODUCT: replace with userId reference. */
  assignee?: string;
  createdAt: string;
}

export interface Filters {
  status: ItemStatus | 'all';
  priority: Priority | 'all';
  tagId: ID | 'all';
  query: string;
}

export type { ThemeChoice };
