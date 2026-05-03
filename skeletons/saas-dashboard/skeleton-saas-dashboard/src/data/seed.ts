import type { ActivityEvent, ChecklistTask, DataRow, KPIMetric } from './types';

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
