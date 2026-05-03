import type { ThemeChoice } from '@/config/theme';

export type ID = string;
export type LoadingState = 'idle' | 'loading' | 'ready' | 'error';

export interface UserProfile {
  id: ID;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  avatarUrl?: string;
}

export type RowStatus = 'active' | 'pending' | 'archived';

/**
 * SEED: agent replaces with the real domain entity.
 * Keep id/title/status/createdAt/value so generic table/filters keep working.
 */
export interface DataRow {
  id: ID;
  title: string;
  status: RowStatus;
  /** Numeric primary metric. PRODUCT: rename to revenue, score, count, etc. */
  value: number;
  /** ISO timestamp. */
  createdAt: string;
  owner: string;
}

export interface KPIMetric {
  id: string;
  label: string;
  value: string;
  /** Delta vs previous period in percent, signed. */
  deltaPct: number;
  trend: 'up' | 'down' | 'flat';
}

export interface ActivityEvent {
  id: ID;
  actor: string;
  action: string;
  target: string;
  timestamp: string;
}

export interface ChecklistTask {
  id: string;
  label: string;
  done: boolean;
}

export type { ThemeChoice };
