/**
 * SkeletonCarcassContent.ts
 *
 * Static content of "carcass files" for rich-skeleton project types.
 *
 * "Carcass files" are the scaffold+markers files (seed.ts, types.ts, config/app.ts,
 * config/navigation.ts) that the skeleton installs with structural exports the coder
 * MUST preserve.  The content here is the verbatim source from the skeleton on disk.
 *
 * Used by two mechanisms:
 *
 *   Б (MERGE, фундамент): mergeSkeletonExports() in SkeletonRegistry reads these
 *      to restore any skeleton export the coder dropped — deterministic, no LLM.
 *
 *   A (INJECT, помощь): buildSkeletonPromptBlock() injects the seed.ts / types.ts
 *      content into the coder system prompt so the coder sees the scaffold and
 *      doesn't duplicate or replace it blindly.
 *
 * Scope: OLD-STYLE skeletons with scaffold+markers (currently only saas-dashboard
 * for pass 1 validation).  New-style stub skeletons are NOT covered here.
 *
 * Path keys use the same convention as filteredFiles in ProtoPipeline apply step:
 * WITHOUT src/ prefix (e.g. "data/seed.ts", not "src/data/seed.ts").
 *
 * Part of: p2/coder-scaffold-merge
 */

export type CarcassFileMap = Record<string, string>;

// ── saas-dashboard scaffold content ──────────────────────────────────────────

const SAAS_DASHBOARD_SEED_TS = `import type { ActivityEvent, ChecklistTask, DataRow, KPIMetric } from './types';

/**
 * SEED: replace with real domain entities.
 * 12 rows is the floor for a believable table with sort/filter behavior.
 */
export const SEED_ROWS: readonly DataRow[] = [
  { id: 'r-1', title: 'Quarterly review', status: 'active', value: 12_400, createdAt: '2026-04-29T10:00:00Z', owner: 'Maya Chen' },
  { id: 'r-2', title: 'Onboarding refresh', status: 'pending', value: 4_200, createdAt: '2026-04-28T09:30:00Z', owner: 'Rohan Patel' },
  { id: 'r-3', title: 'Pricing experiment', status: 'active', value: 28_900, createdAt: '2026-04-27T16:15:00Z', owner: 'Lena Voss' },
  { id: 'r-4', title: 'Customer interviews', status: 'active', value: 1_800, createdAt: '2026-04-26T11:00:00Z', owner: 'Maya Chen' },
  { id: 'r-5', title: 'Sales playbook v3', status: 'archived', value: 6_700, createdAt: '2026-04-22T14:00:00Z', owner: 'James Olu' },
  { id: 'r-6', title: 'Webhook reliability', status: 'pending', value: 9_350, createdAt: '2026-04-25T08:20:00Z', owner: 'Rohan Patel' },
  { id: 'r-7', title: 'Analytics dashboard', status: 'active', value: 17_500, createdAt: '2026-04-24T13:45:00Z', owner: 'Lena Voss' },
  { id: 'r-8', title: 'Brand audit', status: 'archived', value: 3_100, createdAt: '2026-04-21T09:00:00Z', owner: 'James Olu' },
  { id: 'r-9', title: 'API rate limits', status: 'active', value: 8_900, createdAt: '2026-04-23T15:00:00Z', owner: 'Rohan Patel' },
  { id: 'r-10', title: 'Feature flag rollout', status: 'pending', value: 5_600, createdAt: '2026-04-22T10:00:00Z', owner: 'Maya Chen' },
  { id: 'r-11', title: 'Mobile push fix', status: 'active', value: 2_400, createdAt: '2026-04-20T12:00:00Z', owner: 'Lena Voss' },
  { id: 'r-12', title: 'Support response time', status: 'active', value: 11_200, createdAt: '2026-04-19T17:30:00Z', owner: 'James Olu' },
] as const;

export const SEED_KPIS: readonly KPIMetric[] = [
  { id: 'mrr', label: 'Monthly revenue', value: '$48,290', deltaPct: 12.4, trend: 'up' },
  { id: 'active', label: 'Active users', value: '2,847', deltaPct: 8.1, trend: 'up' },
  { id: 'conv', label: 'Conversion', value: '3.2%', deltaPct: -0.4, trend: 'down' },
  { id: 'churn', label: 'Churn', value: '1.8%', deltaPct: -0.2, trend: 'flat' },
] as const;

export const SEED_ACTIVITY: readonly ActivityEvent[] = [
  { id: 'a-1', actor: 'Maya Chen', action: 'updated', target: 'Quarterly review', timestamp: '2026-04-30T11:42:00Z' },
  { id: 'a-2', actor: 'Rohan Patel', action: 'closed', target: 'Webhook reliability', timestamp: '2026-04-30T10:15:00Z' },
  { id: 'a-3', actor: 'Lena Voss', action: 'commented on', target: 'Pricing experiment', timestamp: '2026-04-30T09:33:00Z' },
  { id: 'a-4', actor: 'James Olu', action: 'archived', target: 'Brand audit', timestamp: '2026-04-29T18:02:00Z' },
  { id: 'a-5', actor: 'Maya Chen', action: 'created', target: 'Customer interviews', timestamp: '2026-04-29T14:21:00Z' },
] as const;

export const SEED_SPARKLINE: readonly number[] = [12, 18, 14, 22, 28, 24, 31, 27, 35, 33, 40, 38] as const;

export const DEFAULT_CHECKLIST: readonly ChecklistTask[] = [
  { id: 't-1', label: 'Invite a teammate', done: false },
  { id: 't-2', label: 'Connect a data source', done: false },
  { id: 't-3', label: 'Customize your dashboard', done: false },
  { id: 't-4', label: 'Set up notifications', done: false },
] as const;
`;

const SAAS_DASHBOARD_TYPES_TS = `import type { ThemeChoice } from '@/config/theme';

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
`;

const SAAS_DASHBOARD_APP_TS = `/**
 * Single source of truth for app-wide identity.
 */
export const APP_CONFIG = {
  name: 'AppName',
  /** PRODUCT: short tagline shown in onboarding checklist. */
  tagline: 'The workspace your team has been waiting for.',
  storagePrefix: 'app.v1',
} as const;

export const STORAGE_KEYS = {
  profile: \`\${APP_CONFIG.storagePrefix}.profile\`,
  theme: \`\${APP_CONFIG.storagePrefix}.theme\`,
  data: \`\${APP_CONFIG.storagePrefix}.data\`,
  onboardingChecklist: \`\${APP_CONFIG.storagePrefix}.onboarding\`,
  sidebarCollapsed: \`\${APP_CONFIG.storagePrefix}.sidebar\`,
} as const;
`;

const SAAS_DASHBOARD_NAVIGATION_TS = `import { LayoutDashboard, Database, Settings, type LucideIcon } from 'lucide-react';
import { ROUTES } from './routes';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

/**
 * Sidebar navigation. Each item points at a real registered route.
 * Adding a section means: add to ROUTES, register in App.tsx, add here.
 */
export const SIDEBAR_NAV: readonly NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { to: ROUTES.dashboard, label: 'Dashboard', icon: LayoutDashboard },
      { to: ROUTES.data, label: 'Data', icon: Database },
    ],
  },
  {
    label: 'Account',
    items: [{ to: ROUTES.settings, label: 'Settings', icon: Settings }],
  },
] as const;

/**
 * Bottom tab navigation for mobile/compact viewports.
 * Each entry maps to a real registered route — same source of truth as SIDEBAR_NAV.
 * BottomTabs.tsx imports this array; adding a tab requires updating ROUTES and App.tsx.
 *
 * PRODUCT: agent may rebind labels/icons to match the product domain.
 */
export const BOTTOM_TABS: readonly NavItem[] = [
  { to: ROUTES.dashboard, label: 'Dashboard', icon: LayoutDashboard },
  { to: ROUTES.data, label: 'Data', icon: Database },
  { to: ROUTES.settings, label: 'Settings', icon: Settings },
] as const;
`;

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * Maps skeletonId → (filePath-without-src/ → file content).
 * Covers only "rich-skeleton" skeletons (old 5 with scaffold+markers).
 * Currently only saas-dashboard for pass 1 proof-of-mechanism.
 */
const CARCASS_CONTENT: Partial<Record<string, CarcassFileMap>> = {
  'saas-dashboard': {
    'data/seed.ts':       SAAS_DASHBOARD_SEED_TS,
    'data/types.ts':      SAAS_DASHBOARD_TYPES_TS,
    'config/app.ts':      SAAS_DASHBOARD_APP_TS,
    'config/navigation.ts': SAAS_DASHBOARD_NAVIGATION_TS,
  },
};

/**
 * Returns the skeleton carcass content for a single file.
 * `filePath` must use the normalised key (no src/ prefix) — same as filteredFiles keys.
 */
export function getSkeletonCarcassFile(skeletonId: string, filePath: string): string | undefined {
  return CARCASS_CONTENT[skeletonId]?.[filePath];
}

/**
 * Returns all carcass files for a skeleton, or undefined if the skeleton is not
 * a rich-skeleton (stub skeletons return undefined — no merge applies).
 */
export function getSkeletonCarcassMap(skeletonId: string): CarcassFileMap | undefined {
  return CARCASS_CONTENT[skeletonId];
}

/**
 * Returns true if this skeleton has carcass content (rich-skeleton mode).
 */
export function hasCarcassContent(skeletonId: string): boolean {
  const map = CARCASS_CONTENT[skeletonId];
  return map !== undefined && Object.keys(map).length > 0;
}
