import type { Item, Tag, Workspace } from './types';

export const SEED_WORKSPACES: readonly Workspace[] = [
  { id: 'ws-product',     name: 'Product',     icon: '◆', description: 'Discovery, design, delivery',     itemCount: 7 },
  { id: 'ws-engineering', name: 'Engineering', icon: '▲', description: 'Platform, infra, fixes',          itemCount: 5 },
  { id: 'ws-marketing',   name: 'Marketing',   icon: '●', description: 'Launches, content, campaigns',    itemCount: 3 },
] as const;

export const SEED_TAGS: readonly Tag[] = [
  { id: 't-design',   label: 'design',     color: 'primary' },
  { id: 't-research', label: 'research',   color: 'violet'  },
  { id: 't-bug',      label: 'bug',        color: 'rose'    },
  { id: 't-feature',  label: 'feature',    color: 'success' },
  { id: 't-urgent',   label: 'urgent',     color: 'warning' },
  { id: 't-docs',     label: 'docs',       color: 'primary' },
] as const;

/* SEED: 15 items across 3 workspaces. Replace ids/titles with real entities. */
export const SEED_ITEMS: readonly Item[] = [
  // Product (7)
  { id: 'i-1',  workspaceId: 'ws-product',     title: 'Onboarding redesign',           description: 'Rework the first-run flow to surface the core value in under 60 seconds.',                       status: 'in_progress', priority: 'high',   dueDate: '2026-05-08', tagIds: ['t-design', 't-feature'],  assignee: 'Maya Chen',    createdAt: '2026-04-22T10:00:00Z' },
  { id: 'i-2',  workspaceId: 'ws-product',     title: 'Pricing page copy v3',          description: 'Tighten the value-prop sentence and fix the toggle wording.',                                       status: 'in_review',   priority: 'medium', dueDate: '2026-05-04', tagIds: ['t-design'],               assignee: 'Lena Voss',    createdAt: '2026-04-25T09:30:00Z' },
  { id: 'i-3',  workspaceId: 'ws-product',     title: 'Customer interviews · cohort 4', description: 'Five conversations with new signups from last quarter.',                                          status: 'backlog',     priority: 'low',                       tagIds: ['t-research'],              assignee: 'Maya Chen',    createdAt: '2026-04-26T14:15:00Z' },
  { id: 'i-4',  workspaceId: 'ws-product',     title: 'Annotation tool MVP',           description: 'Inline highlight + comment thread on long-form content.',                                          status: 'in_progress', priority: 'high',                       tagIds: ['t-feature'],               assignee: 'Lena Voss',    createdAt: '2026-04-20T11:00:00Z' },
  { id: 'i-5',  workspaceId: 'ws-product',     title: 'Empty-state illustrations',     description: 'Three new states for feed, search, archive.',                                                       status: 'done',        priority: 'low',                       tagIds: ['t-design'],                assignee: 'James Olu',    createdAt: '2026-04-15T08:00:00Z' },
  { id: 'i-6',  workspaceId: 'ws-product',     title: 'Roadmap for Q3',                description: 'Align on three big bets and write the narrative.',                                                  status: 'backlog',     priority: 'medium', dueDate: '2026-05-15', tagIds: ['t-research', 't-docs'],   assignee: 'Maya Chen',    createdAt: '2026-04-28T16:00:00Z' },
  { id: 'i-7',  workspaceId: 'ws-product',     title: 'Activation funnel report',      description: 'Identify the two largest drop-offs and propose experiments.',                                       status: 'in_review',   priority: 'high',   dueDate: '2026-05-02', tagIds: ['t-research', 't-urgent'], assignee: 'Lena Voss',    createdAt: '2026-04-23T09:00:00Z' },
  // Engineering (5)
  { id: 'i-8',  workspaceId: 'ws-engineering', title: 'Replace flaky cron with queue', description: 'Migrate hourly job to a managed queue worker.',                                                     status: 'done',        priority: 'medium',                    tagIds: ['t-bug'],                   assignee: 'Rohan Patel',  createdAt: '2026-04-18T13:30:00Z' },
  { id: 'i-9',  workspaceId: 'ws-engineering', title: 'Webhook reliability — phase 1', description: 'Retries, dead-letter queue, observability.',                                                         status: 'in_progress', priority: 'high',   dueDate: '2026-05-09', tagIds: ['t-feature'],               assignee: 'Rohan Patel',  createdAt: '2026-04-21T10:15:00Z' },
  { id: 'i-10', workspaceId: 'ws-engineering', title: 'Mobile push reliability fix',   description: 'Investigate occasional missed deliveries on Android 14.',                                            status: 'backlog',     priority: 'urgent', dueDate: '2026-05-03', tagIds: ['t-bug', 't-urgent'],       assignee: 'Rohan Patel',  createdAt: '2026-04-29T17:00:00Z' },
  { id: 'i-11', workspaceId: 'ws-engineering', title: 'API rate-limit headers',        description: 'Add standardized rate-limit response headers across all endpoints.',                               status: 'in_review',   priority: 'medium', dueDate: '2026-05-06', tagIds: ['t-feature', 't-docs'],     assignee: 'Rohan Patel',  createdAt: '2026-04-24T11:30:00Z' },
  { id: 'i-12', workspaceId: 'ws-engineering', title: 'Audit log retention policy',    description: 'Define and implement the 13-month retention window.',                                                status: 'backlog',     priority: 'low',                       tagIds: ['t-docs'],                  assignee: 'Rohan Patel',  createdAt: '2026-04-26T09:45:00Z' },
  // Marketing (3)
  { id: 'i-13', workspaceId: 'ws-marketing',   title: 'Launch announcement post',      description: 'Long-form blog post + Twitter thread for v3 launch.',                                              status: 'in_progress', priority: 'high',   dueDate: '2026-05-12', tagIds: ['t-feature'],               assignee: 'James Olu',    createdAt: '2026-04-25T15:00:00Z' },
  { id: 'i-14', workspaceId: 'ws-marketing',   title: 'Customer story — NorthBeam',    description: 'Interview, draft, and publish the case study.',                                                     status: 'in_review',   priority: 'medium',                    tagIds: ['t-research', 't-docs'],   assignee: 'James Olu',    createdAt: '2026-04-19T12:00:00Z' },
  { id: 'i-15', workspaceId: 'ws-marketing',   title: 'Newsletter Q2 retro issue',     description: 'Recap the quarter: shipped, learned, next.',                                                        status: 'done',        priority: 'low',                       tagIds: ['t-docs'],                  assignee: 'James Olu',    createdAt: '2026-04-12T10:00:00Z' },
] as const;
