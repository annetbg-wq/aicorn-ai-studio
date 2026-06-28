// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const evaluateCompletenessGateMock = vi.hoisted(() => vi.fn());

vi.mock('../../lib/supabase', () => {
  const unavailable = new Error('Supabase is intentionally disabled in ProtoPipeline unit tests.');
  const fallback = { data: null, error: unavailable };
  const query = {
    data: null,
    error: unavailable,
    eq: () => ({ single: async () => fallback }),
    single: async () => fallback,
  };

  return {
    supabase: {
      from: () => ({
        select: () => query,
      }),
    },
  };
});

vi.mock('../LLMProxy', () => ({
  llmFetch: vi.fn(),
  llmFetchStream: vi.fn(),
  proxyRequestWithSessionFallback: vi.fn(),
}));

vi.mock('../PreviewSessionService', () => ({
  getPreviewSessionToken: vi.fn().mockReturnValue('sess-release-gate-test'),
  appendPreviewSessionToUrl: vi.fn((url: string) => url),
}));

vi.mock('../CompletenessGate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../CompletenessGate')>();
  return {
    ...actual,
    evaluateCompletenessGate: evaluateCompletenessGateMock,
  };
});

import { ProtoPipeline, type ResolvedRoute } from '../ProtoPipeline';

const PRIMARY_ROUTE_OVERRIDE: ResolvedRoute = {
  modelId: 'gpt-4o-mini',
  apiKey: 'sk-fake-key-for-test',
  endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  provider: 'openrouter',
  endpointKind: 'openrouter_proxy',
  sourceAuthority: 'test',
};

const FIX_ROUTE_OVERRIDE: ResolvedRoute = {
  modelId: 'test-fix-model',
  apiKey: 'sk-fix-key-for-test',
  endpoint: 'https://test.example.com/api',
  provider: 'claude-cli',
  sourceAuthority: 'test',
};

function architectLlmResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function coderLlmResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 300, completion_tokens: 700, total_tokens: 1_000 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

const SAAS_ARCHITECT_PLAN = JSON.stringify({
  appName: 'Pipeline Pulse',
  skeleton: 'saas-dashboard',
  summary: 'Revenue operations workspace for pipeline velocity, forecast risk, and rep execution.',
  fileTree: {
    'data/types.ts': 'Shared revenue operations types for health metrics, forecasts, and action queues.',
    'pages/Dashboard.tsx': 'Revenue operations command center with stage health, forecast risks, and rep actions.',
  },
});

const MOBILE_ARCHITECT_PLAN = JSON.stringify({
  appName: 'Ritual Flow',
  skeleton: 'mobile-app',
  summary: 'Wellness routine app for guided habits, breathwork, and streak recovery.',
  fileTree: {
    'data/types.ts': 'Ritual domain types for daily sessions, streak summaries, and recovery prompts.',
    'pages/Home.tsx': 'Daily ritual feed with habit cards, streak summaries, and recovery prompts.',
  },
});

const SAAS_VALID_OUTPUT = [
  '<<<FILE: config/app.ts>>>',
  'export const STORAGE_KEYS = {',
  "  profile: 'pipeline-pulse.profile',",
  "  theme: 'pipeline-pulse.theme',",
  "} as const;",
  '',
  'export const APP_CONFIG = {',
  "  name: 'Pipeline Pulse',",
  "  tagline: 'Revenue command center for modern ops teams',",
  '} as const;',
  '<<<END>>>',
  '',
  '<<<FILE: config/navigation.ts>>>',
  'export const SIDEBAR_NAV = [',
  "  { label: 'Dashboard', to: '/dashboard', icon: 'LayoutDashboard' },",
  "  { label: 'Forecast', to: '/dashboard?view=forecast', icon: 'LineChart' },",
  "  { label: 'Action Queue', to: '/dashboard?view=actions', icon: 'CheckSquare' },",
  '] as const;',
  '<<<END>>>',
  '',
  '<<<FILE: data/seed.ts>>>',
  'import type { ChecklistTask } from "./types";',
  '',
  'export const DEFAULT_CHECKLIST: readonly ChecklistTask[] = [',
  "  { id: 'inspect-stage-slippage', label: 'Inspect stage slippage for enterprise renewals', done: true },",
  "  { id: 'approve-recovery-plan', label: 'Approve recovery plan for Q4 forecast gap', done: false },",
  '] as const;',
  '<<<END>>>',
  '',
  '<<<FILE: data/types.ts>>>',
  "import type { ThemeChoice } from '@/config/theme';",
  '',
  'export type ID = string;',
  "export type LoadingState = 'idle' | 'loading' | 'ready' | 'error';",
  "export type RowStatus = 'active' | 'pending' | 'archived';",
  '',
  'export interface ChecklistTask {',
  '  id: string;',
  '  label: string;',
  '  done: boolean;',
  '}',
  '',
  'export interface UserProfile {',
  '  id: ID;',
  '  name: string;',
  '  email: string;',
  "  role: 'owner' | 'admin' | 'member';",
  '  avatarUrl?: string;',
  '}',
  '',
  "export type ForecastRiskLevel = 'healthy' | 'watch' | 'at-risk';",
  '',
  'export interface DealHealthMetric {',
  "  id: 'pipeline-coverage' | 'stage-slippage' | 'forecast-gap';",
  "  label: 'Pipeline coverage' | 'Stage slippage' | 'Forecast gap';",
  '  value: string;',
  '  trend: "up" | "flat" | "down";',
  '  risk: ForecastRiskLevel;',
  '}',
  '',
  'export interface KPIMetric extends DealHealthMetric {',
  '  deltaPct: number;',
  '}',
  '',
  'export interface DataRow {',
  '  id: ID;',
  '  title: string;',
  '  status: RowStatus;',
  '  value: number;',
  '  createdAt: string;',
  '  owner: string;',
  '}',
  '',
  'export type { ThemeChoice };',
  '<<<END>>>',
  '',
  '<<<FILE: pages/Dashboard.tsx>>>',
  'export default function Dashboard() {',
  '  return (',
  '    <main className="min-h-screen bg-background px-6 py-8 text-foreground">',
  '      <section className="mx-auto flex max-w-5xl flex-col gap-6">',
  '        <header className="space-y-2">',
  '          <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">Pipeline Pulse</p>',
  '          <h1 className="text-3xl font-semibold">Revenue command center</h1>',
  '          <p className="max-w-2xl text-sm text-muted-foreground">Stage health, forecast risk, and rep action coverage.</p>',
  '        </header>',
  '      </section>',
  '    </main>',
  '  );',
  '}',
  '<<<END>>>',
].join('\n');

const SAAS_GENERIC_OUTPUT = SAAS_VALID_OUTPUT.replace(
  'Revenue command center',
  'Feature 1',
);

const GENERIC_REPAIR_PATCH = [
  '<<<FILE: pages/Dashboard.tsx>>>',
  'export default function Dashboard() {',
  '  return (',
  '    <main className="min-h-screen bg-background px-6 py-8 text-foreground">',
  '      <section className="mx-auto flex max-w-5xl flex-col gap-6">',
  '        <header className="space-y-2">',
  '          <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">Pipeline Pulse</p>',
  '          <h1 className="text-3xl font-semibold">Feature 1</h1>',
  '          <p className="max-w-2xl text-sm text-muted-foreground">Feature 1 keeps placeholder copy in the hero.</p>',
  '        </header>',
  '      </section>',
  '    </main>',
  '  );',
  '}',
  '<<<END>>>',
].join('\n');

const MOBILE_SOFT_ONLY_OUTPUT = [
  '<<<FILE: config/app.ts>>>',
  'export const STORAGE_KEYS = {',
  "  rituals: 'ritual-flow.rituals',",
  "  profile: 'ritual-flow.profile',",
  '} as const;',
  '',
  'export const APP_CONFIG = {',
  "  name: 'Ritual Flow',",
  "  tagline: 'Guided routines for calm, focus, and recovery',",
  '  freeActionLimit: 3,',
  '} as const;',
  '<<<END>>>',
  '',
  '<<<FILE: config/navigation.ts>>>',
  'export const BOTTOM_TABS = [',
  "  { label: 'Today', to: '/', icon: 'SunMedium' },",
  "  { label: 'Coach', to: '/coach', icon: 'Sparkles' },",
  "  { label: 'Streaks', to: '/streaks', icon: 'Flame' },",
  "  { label: 'Library', to: '/library', icon: 'BookOpen' },",
  '] as const;',
  '<<<END>>>',
  '',
  '<<<FILE: data/seed.ts>>>',
  "import { APP_CONFIG } from '@/config/app';",
  "import type { FeedItem, PricingTier, ProgressEntry } from './types';",
  '',
  'export const SEED_FEED: readonly FeedItem[] = [',
  "  { id: 'ritual-breath-reset', title: 'Breath reset', subtitle: 'Four calming breaths before the next meeting', kind: 'calm', accent: 'brand', createdAt: '2026-05-01T07:10:00Z', meta: { duration: 4, anchor: 'morning' } },",
  "  { id: 'ritual-focus-primer', title: 'Focus sprint primer', subtitle: 'Clear the desk and set one intention for the next deep-work block', kind: 'focus', accent: 'violet', createdAt: '2026-05-01T09:00:00Z', meta: { duration: 8, anchor: 'workday' } },",
  "  { id: 'ritual-reset-walk', title: 'Reset walk', subtitle: 'Ten-minute recovery walk after lunch', kind: 'recovery', accent: 'success', createdAt: '2026-05-01T12:40:00Z', meta: { duration: 10, anchor: 'midday' } },",
  "  { id: 'ritual-evening-journal', title: 'Evening journal', subtitle: 'Capture one win and one release before shutdown', kind: 'reflection', accent: 'warning', createdAt: '2026-05-01T19:30:00Z', meta: { duration: 6, anchor: 'evening' } },",
  "  { id: 'ritual-sleep-ladder', title: 'Sleep ladder', subtitle: 'Dim screens, stretch, and settle into recovery mode', kind: 'rest', accent: 'rose', createdAt: '2026-05-01T21:45:00Z', meta: { duration: 12, anchor: 'night' } },",
  '] as const;',
  '',
  'export const SEED_PROGRESS: readonly ProgressEntry[] = [',
  "  { date: '2026-04-25', value: 2, goalMet: false },",
  "  { date: '2026-04-26', value: 3, goalMet: true },",
  "  { date: '2026-04-27', value: 4, goalMet: true },",
  "  { date: '2026-04-28', value: 3, goalMet: true },",
  "  { date: '2026-04-29', value: 5, goalMet: true },",
  "  { date: '2026-04-30', value: 2, goalMet: false },",
  "  { date: '2026-05-01', value: 4, goalMet: true },",
  '] as const;',
  '',
  'export const PRICING_TIERS: readonly PricingTier[] = [',
  "  { id: 'free', name: 'Free', pricePerMonth: 0, features: ['Three guided rituals per day', `Up to ${APP_CONFIG.freeActionLimit} coach actions`, 'Basic streak history'] },",
  "  { id: 'pro', name: 'Flow Plus', pricePerMonth: 12, highlight: true, features: ['Unlimited rituals', 'Weekly reflection packs', 'Recovery trend summaries'] },",
  "  { id: 'premium', name: 'Coach Circle', pricePerMonth: 24, features: ['Everything in Flow Plus', 'Monthly coach prompts', 'Premium recovery plans'] },",
  '] as const;',
  '',
  'export const DAILY_RITUALS = SEED_FEED;',
  '<<<END>>>',
  '',
  '<<<FILE: data/types.ts>>>',
  'export type ID = string;',
  "export type SubscriptionPlan = 'free' | 'pro' | 'premium';",
  "export type LoadingState = 'idle' | 'loading' | 'ready' | 'error';",
  '',
  "export type RitualCategory = 'calm' | 'focus' | 'recovery' | 'reflection' | 'rest';",
  '',
  'export interface UserProfile {',
  '  id: ID;',
  '  name: string;',
  '  goal: string;',
  '  createdAt: string;',
  '  onboardingComplete: boolean;',
  '  plan: SubscriptionPlan;',
  '  usageCount: number;',
  '}',
  '',
  'export interface FeedItem {',
  '  id: ID;',
  '  title: string;',
  '  subtitle: string;',
  '  kind: RitualCategory | string;',
  "  accent?: 'brand' | 'success' | 'warning' | 'rose' | 'violet';",
  '  createdAt: string;',
  '  meta?: Record<string, string | number | boolean>;',
  '}',
  '',
  'export interface ProgressEntry {',
  '  date: string;',
  '  value: number;',
  '  goalMet: boolean;',
  '}',
  '',
  'export interface PricingTier {',
  '  id: SubscriptionPlan;',
  '  name: string;',
  '  pricePerMonth: number;',
  '  highlight?: boolean;',
  '  features: readonly string[];',
  '}',
  '',
  'export interface RitualEntry extends FeedItem {',
  '  kind: RitualCategory;',
  '}',
  '<<<END>>>',
  '',
  '<<<FILE: pages/Home.tsx>>>',
  'export default function Home() {',
  '  return (',
  '    <main className="min-h-screen bg-background px-4 py-6 text-foreground">',
  '      <section className="mx-auto flex max-w-md flex-col gap-5">',
  '        <header className="space-y-2">',
  '          <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">Ritual Flow</p>',
  '          <h1 className="text-3xl font-semibold">Daily ritual stack</h1>',
  '          <p className="text-sm text-muted-foreground">Blend calm, focus, and recovery routines around your workday.</p>',
  '        </header>',
  '      </section>',
  '    </main>',
  '  );',
  '}',
  '<<<END>>>',
].join('\n');

const MOBILE_SHELL_OWNERSHIP_OUTPUT = MOBILE_SOFT_ONLY_OUTPUT
  .replace(
    '<<<FILE: pages/Home.tsx>>>\nexport default function Home() {',
    "<<<FILE: pages/Home.tsx>>>\nimport { AppProvider } from '@/context/AppContext';\nexport default function Home() {",
  )
  .replace(
    '    <main className="min-h-screen bg-background px-4 py-6 text-foreground">',
    '    <AppProvider>\n      <main className="min-h-screen bg-background px-4 py-6 text-foreground">',
  )
  .replace(
    '    </main>',
    '      </main>\n    </AppProvider>',
  );

const DANGLING_IMPORT_OUTPUT = [
  '<<<FILE: config/app.ts>>>',
  'export const STORAGE_KEYS = {',
  "  profile: 'pipeline-pulse.profile',",
  "  theme: 'pipeline-pulse.theme',",
  '} as const;',
  '',
  'export const APP_CONFIG = {',
  "  name: 'Pipeline Pulse',",
  "  tagline: 'Revenue command center for modern ops teams',",
  '} as const;',
  '<<<END>>>',
  '',
  '<<<FILE: config/navigation.ts>>>',
  'export const SIDEBAR_NAV = [',
  "  { label: 'Dashboard', to: '/dashboard', icon: 'LayoutDashboard' },",
  "  { label: 'Forecast', to: '/dashboard?view=forecast', icon: 'LineChart' },",
  '] as const;',
  '<<<END>>>',
  '',
  '<<<FILE: data/seed.ts>>>',
  'import type { ChecklistTask } from "./types";',
  '',
  'export const DEFAULT_CHECKLIST: readonly ChecklistTask[] = [',
  "  { id: 'inspect-stage-slippage', label: 'Inspect stage slippage for enterprise renewals', done: true },",
  '] as const;',
  '<<<END>>>',
  '',
  '<<<FILE: data/types.ts>>>',
  "import type { ThemeChoice } from '@/config/theme';",
  '',
  'export type ID = string;',
  "export type LoadingState = 'idle' | 'loading' | 'ready' | 'error';",
  "export type RowStatus = 'active' | 'pending' | 'archived';",
  '',
  'export interface ChecklistTask {',
  '  id: string;',
  '  label: string;',
  '  done: boolean;',
  '}',
  '',
  'export interface UserProfile {',
  '  id: ID;',
  '  name: string;',
  '  email: string;',
  "  role: 'owner' | 'admin' | 'member';",
  '  avatarUrl?: string;',
  '}',
  '',
  "export type ForecastRiskLevel = 'healthy' | 'watch' | 'at-risk';",
  '',
  'export interface DealHealthMetric {',
  "  id: 'pipeline-coverage' | 'stage-slippage' | 'forecast-gap';",
  "  label: 'Pipeline coverage' | 'Stage slippage' | 'Forecast gap';",
  '  value: string;',
  '  risk: ForecastRiskLevel;',
  '}',
  '',
  'export interface KPIMetric extends DealHealthMetric {',
  '  deltaPct: number;',
  '  trend: "up" | "flat" | "down";',
  '}',
  '',
  'export interface DataRow {',
  '  id: ID;',
  '  title: string;',
  '  status: RowStatus;',
  '  value: number;',
  '  createdAt: string;',
  '  owner: string;',
  '}',
  '',
  'export type { ThemeChoice };',
  '<<<END>>>',
  '',
  '<<<FILE: pages/Dashboard.tsx>>>',
  "import { financeColumns } from '../types/finance';",
  'export default function Dashboard() {',
  '  return (',
  '    <main className="min-h-screen bg-background px-6 py-8 text-foreground">',
  '      <section className="mx-auto flex max-w-5xl flex-col gap-6">',
  '        <header className="space-y-2">',
  '          <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">Pipeline Pulse</p>',
  '          <h1 className="text-3xl font-semibold">Revenue command center</h1>',
  '          <p className="max-w-2xl text-sm text-muted-foreground">{financeColumns.join(", ")}</p>',
  '        </header>',
  '      </section>',
  '    </main>',
  '  );',
  '}',
  '<<<END>>>',
].join('\n');

const DANGLING_IMPORT_NOOP_REPAIR_PATCH = [
  '<<<FILE: pages/Dashboard.tsx>>>',
  "import { financeColumns } from '../types/finance';",
  'export default function Dashboard() {',
  '  return (',
  '    <main className="min-h-screen bg-background px-6 py-8 text-foreground">',
  '      <section className="mx-auto flex max-w-5xl flex-col gap-6">',
  '        <header className="space-y-2">',
  '          <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">Pipeline Pulse</p>',
  '          <h1 className="text-3xl font-semibold">Revenue command center</h1>',
  '          <p className="max-w-2xl text-sm text-muted-foreground">{financeColumns.join(", ")}</p>',
  '        </header>',
  '      </section>',
  '    </main>',
  '  );',
  '}',
  '<<<END>>>',
].join('\n');

const SHELL_OWNERSHIP_NOOP_REPAIR_PATCH = [
  '<<<FILE: pages/Home.tsx>>>',
  "import { AppProvider } from '@/context/AppContext';",
  'export default function Home() {',
  '  return (',
  '    <AppProvider>',
  '      <main className="min-h-screen bg-background px-4 py-6 text-foreground">',
  '        <section className="mx-auto flex max-w-md flex-col gap-5">',
  '          <header className="space-y-2">',
  '            <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">Ritual Flow</p>',
  '            <h1 className="text-3xl font-semibold">Daily ritual stack</h1>',
  '            <p className="text-sm text-muted-foreground">Blend calm, focus, and recovery routines around your workday.</p>',
  '          </header>',
  '        </section>',
  '      </main>',
  '    </AppProvider>',
  '  );',
  '}',
  '<<<END>>>',
].join('\n');

function makeCoverageResult(ok: boolean, coverageRatioMust: number) {
  return {
    ok,
    blockingReasons: ok ? [] : ['coverage below threshold'],
    repairInstructions: ok ? [] : ['cover missing must-have functionality'],
    coverage: {
      mustTotal: 5,
      mustCovered: Math.round(5 * coverageRatioMust),
      shouldTotal: 2,
      shouldCovered: 1,
      coverageRatioMust,
      coverageRatioAll: coverageRatioMust,
      uncoveredMust: ok ? [] : ['Checklist item: primary must-flow'],
      uncoveredShould: [],
      completenessGateStatus: ok ? 'pass' : 'fail',
      completenessGateReason: ok ? 'all must items covered' : 'must coverage below threshold',
      requiredPageCount: 1,
      coveredPageCount: ok ? 1 : 0,
      missingPageFiles: ok ? [] : ['pages/Dashboard.tsx'],
      requiredCapabilityCount: 1,
      coveredCapabilityCount: ok ? 1 : 0,
      missingCapabilities: ok ? [] : ['analytics'],
    },
  };
}

function createFetchMock(options?: { qualityRepairBodies?: string[] }) {
  const qualityRepairBodies = [...(options?.qualityRepairBodies ?? [])];
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/preview/')) {
      const buildId = /\/api\/preview\/([^/]+)\/compile/.exec(url)?.[1] ?? 'unknown-build';
      window.setTimeout(() => {
        window.dispatchEvent(new MessageEvent('message', {
          origin: window.location.origin,
          data: { type: 'preview-mounted', buildId },
        }));
      }, 0);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url === '/api/quality/llm-run' || url === FIX_ROUTE_OVERRIDE.endpoint) {
      if (qualityRepairBodies.length === 0) {
        throw new Error(`Unexpected quality repair call for ${url}`);
      }
      return new Response(
        JSON.stringify({
          output_text: qualityRepairBodies.shift(),
          finish_reason: 'stop',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });
}

async function runPipelineScenario(input: {
  prompt: string;
  skeletonId: 'saas-dashboard' | 'mobile-app';
  architectPlan: string;
  coderOutput: string;
  fetchMock: ReturnType<typeof vi.fn>;
  routeOverrides: Record<string, ResolvedRoute>;
  llmFetchResponses?: Response[];
}) {
  const { llmFetch, llmFetchStream } = await import('../LLMProxy');
  const onLog = vi.fn();

  const llmFetchResponses = input.llmFetchResponses ?? [architectLlmResponse(input.architectPlan)];
  vi.mocked(llmFetch).mockReset();
  for (const response of llmFetchResponses) {
    vi.mocked(llmFetch).mockResolvedValueOnce(response);
  }
  vi.mocked(llmFetch).mockResolvedValue(architectLlmResponse(''));
  vi.mocked(llmFetchStream).mockImplementation(async () => coderLlmResponse(input.coderOutput));
  vi.stubGlobal('fetch', input.fetchMock);

  const result = await ProtoPipeline.run({
    prompt: input.prompt,
    skeletonId: input.skeletonId,
    buildId: `build-${input.skeletonId}-release-gate`,
    onStep: vi.fn(),
    onLog,
    onPreviewReady: vi.fn(),
    routeOverrides: input.routeOverrides,
  });

  return { result, onLog };
}

describe('ProtoPipeline release gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    evaluateCompletenessGateMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns success=false when must coverage stays below 0.8', async () => {
    evaluateCompletenessGateMock.mockImplementation(() => makeCoverageResult(false, 0.6));
    const fetchMock = createFetchMock();

    const { result } = await runPipelineScenario({
      prompt: 'Build a revenue operations command center for pipeline health and forecast risk.',
      skeletonId: 'saas-dashboard',
      architectPlan: SAAS_ARCHITECT_PLAN,
      coderOutput: SAAS_VALID_OUTPUT,
      fetchMock,
      routeOverrides: {
        primary: PRIMARY_ROUTE_OVERRIDE,
        build: PRIMARY_ROUTE_OVERRIDE,
      },
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('coverage_below_threshold');
    expect(result.error).toMatch(/^coverage_below_threshold:/);

    const compileCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/preview/'));
    expect(compileCalls).toHaveLength(1);
  });

  it('returns success=false when a hard blocker remains after two quality repair passes', async () => {
    evaluateCompletenessGateMock.mockImplementation(() => makeCoverageResult(true, 1));
    const fetchMock = createFetchMock({
      qualityRepairBodies: [GENERIC_REPAIR_PATCH, GENERIC_REPAIR_PATCH],
    });

    const { result, onLog } = await runPipelineScenario({
      prompt: 'Build a revenue operations command center for pipeline health and forecast risk.',
      skeletonId: 'saas-dashboard',
      architectPlan: SAAS_ARCHITECT_PLAN,
      coderOutput: SAAS_GENERIC_OUTPUT,
      fetchMock,
      routeOverrides: {
        primary: PRIMARY_ROUTE_OVERRIDE,
        build: PRIMARY_ROUTE_OVERRIDE,
        fix: FIX_ROUTE_OVERRIDE,
      },
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('hard_quality_gate_failed');
    expect(result.error).toMatch(/^hard_quality_gate_failed:/);

    const qualityRepairCalls = fetchMock.mock.calls.filter(
      ([url]) => String(url) === '/api/quality/llm-run' || String(url) === FIX_ROUTE_OVERRIDE.endpoint,
    );
    expect(qualityRepairCalls).toHaveLength(2);

    const compileCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/preview/'));
    expect(compileCalls).toHaveLength(1);
    expect(onLog.mock.calls.some(([message]) => String(message).includes('attempting quality repair pass 2/2'))).toBe(true);
  });

  it('returns success=true when only soft advisory issues remain', async () => {
    evaluateCompletenessGateMock.mockImplementation(() => makeCoverageResult(true, 1));
    const fetchMock = createFetchMock();

    const { result, onLog } = await runPipelineScenario({
      prompt: 'wellness mobile app for guided rituals and breathwork',
      skeletonId: 'mobile-app',
      architectPlan: MOBILE_ARCHITECT_PLAN,
      coderOutput: MOBILE_SOFT_ONLY_OUTPUT,
      fetchMock,
      routeOverrides: {
        primary: PRIMARY_ROUTE_OVERRIDE,
        build: PRIMARY_ROUTE_OVERRIDE,
      },
    });

    expect(result.success).toBe(true);
    expect(result.reason).toBeUndefined();

    const applyOutput = result.stepResults?.apply?.output as {
      selected_premium_component_ids?: string[];
      materialized_media_files?: string[];
    } | undefined;
    expect((applyOutput?.selected_premium_component_ids ?? []).length).toBeGreaterThan(0);
    expect((applyOutput?.materialized_media_files ?? []).length).toBeGreaterThan(0);
    expect(onLog.mock.calls.some(([message]) => String(message).includes('advisory issue(s)'))).toBe(true);

    const qualityRepairCalls = fetchMock.mock.calls.filter(
      ([url]) => String(url) === '/api/quality/llm-run' || String(url) === FIX_ROUTE_OVERRIDE.endpoint,
    );
    expect(qualityRepairCalls).toHaveLength(0);
  });

  it('fails hard when a dangling import survives the healer and live contract validation catches it', async () => {
    evaluateCompletenessGateMock.mockImplementation(() => makeCoverageResult(true, 1));
    const fetchMock = createFetchMock({
      qualityRepairBodies: [DANGLING_IMPORT_NOOP_REPAIR_PATCH, DANGLING_IMPORT_NOOP_REPAIR_PATCH],
    });

    const { result, onLog } = await runPipelineScenario({
      prompt: 'Build a revenue operations command center for pipeline health and forecast risk.',
      skeletonId: 'saas-dashboard',
      architectPlan: SAAS_ARCHITECT_PLAN,
      coderOutput: DANGLING_IMPORT_OUTPUT,
      fetchMock,
      llmFetchResponses: [
        architectLlmResponse(SAAS_ARCHITECT_PLAN),
        architectLlmResponse('No additional modules were needed.'),
      ],
      routeOverrides: {
        primary: PRIMARY_ROUTE_OVERRIDE,
        build: PRIMARY_ROUTE_OVERRIDE,
        fix: FIX_ROUTE_OVERRIDE,
      },
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('live_generation_contract_failed');
    expect(result.error).toContain('missing_local_import');
    expect(onLog.mock.calls.some(([message]) => String(message).includes('dangling local imports'))).toBe(true);
    expect(onLog.mock.calls.some(([message]) => String(message).includes('[live-contract]'))).toBe(true);

    const compileCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/preview/'));
    expect(compileCalls).toHaveLength(1);
  });

  it('fails hard when a page keeps trying to own the shell provider layer after repairs', async () => {
    evaluateCompletenessGateMock.mockImplementation(() => makeCoverageResult(true, 1));
    const fetchMock = createFetchMock({
      qualityRepairBodies: [SHELL_OWNERSHIP_NOOP_REPAIR_PATCH, SHELL_OWNERSHIP_NOOP_REPAIR_PATCH],
    });

    const { result, onLog } = await runPipelineScenario({
      prompt: 'Build a wellness mobile app for guided rituals, breathwork, and streak recovery.',
      skeletonId: 'mobile-app',
      architectPlan: MOBILE_ARCHITECT_PLAN,
      coderOutput: MOBILE_SHELL_OWNERSHIP_OUTPUT,
      fetchMock,
      routeOverrides: {
        primary: PRIMARY_ROUTE_OVERRIDE,
        build: PRIMARY_ROUTE_OVERRIDE,
        fix: FIX_ROUTE_OVERRIDE,
      },
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('live_generation_contract_failed');
    expect(result.error).toContain('tries to own shell layer provider layer');
    expect(onLog.mock.calls.some(([message]) => String(message).includes('[live-contract]'))).toBe(true);
  });
});
