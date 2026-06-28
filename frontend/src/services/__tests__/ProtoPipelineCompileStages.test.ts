// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const evaluateCompletenessGateMock = vi.hoisted(() => vi.fn());

vi.mock('../CompletenessGate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../CompletenessGate')>();
  return {
    ...actual,
    evaluateCompletenessGate: evaluateCompletenessGateMock,
  };
});

import { ProtoPipeline, type ResolvedRoute } from '../ProtoPipeline';

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
  getPreviewSessionToken: vi.fn().mockReturnValue('sess-compile-stage-test'),
  appendPreviewSessionToUrl: vi.fn((url: string) => url),
}));

const PRIMARY_ROUTE_OVERRIDE: ResolvedRoute = {
  modelId: 'gpt-4o-mini',
  apiKey: 'sk-fake-key-for-test',
  endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  provider: 'openrouter',
  endpointKind: 'openrouter_proxy',
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

const ARCHITECT_PLAN = JSON.stringify({
  appName: 'Pipeline Pulse',
  skeleton: 'saas-dashboard',
  summary: 'Revenue operations workspace for pipeline velocity, forecast risk, and rep execution.',
  fileTree: {
    'pages/Dashboard.tsx': 'Revenue operations command center with stage health, forecast risks, and rep actions.',
  },
});

const CODER_OUTPUT = [
  '<<<FILE: config/app.ts>>>',
  'export const STORAGE_KEYS = {',
  "  profile: 'pipeline-pulse.profile',",
  "  theme: 'pipeline-pulse.theme',",
  "  sidebarCollapsed: 'pipeline-pulse.sidebar-collapsed',",
  "  checklist: 'pipeline-pulse.checklist',",
  "  checklistDismissed: 'pipeline-pulse.checklist-dismissed',",
  '} as const;',
  '',
  'export const APP_CONFIG = {',
  "  name: 'Pipeline Pulse',",
  "  tagline: 'Revenue command center for modern ops teams',",
  "  description: 'Track pipeline health, forecast risk, and rep follow-through in one workspace.',",
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
  'export const DEFAULT_CHECKLIST = [',
  "  { id: 'inspect-stage-slippage', label: 'Inspect stage slippage for enterprise renewals', done: true },",
  "  { id: 'approve-recovery-plan', label: 'Approve recovery plan for Q4 forecast gap', done: false },",
  "  { id: 'coach-ae-handoff', label: 'Coach AE handoff notes before Friday pipeline review', done: false },",
  '] as const;',
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
  '          <p className="max-w-2xl text-sm text-muted-foreground">',
  '            Surface stage health, forecast risk, and the next rep actions without losing the operator view.',
  '          </p>',
  '        </header>',
  '        <section className="grid gap-4 md:grid-cols-3">',
  '          <article className="rounded-2xl border border-border bg-card p-4">',
  '            <p className="text-sm text-muted-foreground">Pipeline coverage</p>',
  '            <p className="mt-3 text-2xl font-semibold">3.4x</p>',
  '          </article>',
  '          <article className="rounded-2xl border border-border bg-card p-4">',
  '            <p className="text-sm text-muted-foreground">Forecast at risk</p>',
  '            <p className="mt-3 text-2xl font-semibold">12%</p>',
  '          </article>',
  '          <article className="rounded-2xl border border-border bg-card p-4">',
  '            <p className="text-sm text-muted-foreground">Follow-ups due today</p>',
  '            <p className="mt-3 text-2xl font-semibold">18</p>',
  '          </article>',
  '        </section>',
  '      </section>',
  '    </main>',
  '  );',
  '}',
  '<<<END>>>',
].join('\n');

describe('ProtoPipeline compile-stage telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    evaluateCompletenessGateMock.mockImplementation(() => ({
      ok: true,
      blockingReasons: [],
      repairInstructions: [],
      coverage: {
        mustTotal: 4,
        mustCovered: 4,
        shouldTotal: 0,
        shouldCovered: 0,
        coverageRatioMust: 1,
        coverageRatioAll: 1,
        uncoveredMust: [],
        uncoveredShould: [],
        completenessGateStatus: 'pass',
        completenessGateReason: 'all must items covered',
        requiredPageCount: 1,
        coveredPageCount: 1,
        missingPageFiles: [],
        requiredCapabilityCount: 1,
        coveredCapabilityCount: 1,
        missingCapabilities: [],
      },
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('runs a final compile after coder success and sends coder-filled files with buildStage=final', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { llmFetch, llmFetchStream } = await import('../LLMProxy');
    const onLog = vi.fn();

    vi.mocked(llmFetch).mockResolvedValueOnce(architectLlmResponse(ARCHITECT_PLAN));
    vi.mocked(llmFetchStream).mockImplementation(async () => coderLlmResponse(CODER_OUTPUT));

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
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
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await ProtoPipeline.run({
      prompt: 'Build a revenue operations command center for pipeline health and forecast risk.',
      skeletonId: 'saas-dashboard',
      buildId: 'build-compile-stage-test',
      onStep: vi.fn(),
      onLog,
      onPreviewReady: vi.fn(),
      routeOverrides: {
        primary: PRIMARY_ROUTE_OVERRIDE,
        build: PRIMARY_ROUTE_OVERRIDE,
      },
    });

    if (!result.success) {
      throw new Error([
        `Pipeline failed: ${result.error ?? 'unknown error'}`,
        ...onLog.mock.calls.map(([message]) => String(message)),
      ].join('\n'));
    }
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const compileLogs = consoleLogSpy.mock.calls.filter(call => call[0] === '[compile-stage]');
    expect(compileLogs).toHaveLength(2);
    expect(compileLogs[0][1]).toMatchObject({
      buildId: 'build-compile-stage-test',
      buildStage: 'skeleton',
      callsite: 'run:skeleton-render',
      fileCount: 0,
    });
    expect(compileLogs[1][1]).toMatchObject({
      buildId: 'build-compile-stage-test',
      buildStage: 'final',
      callsite: 'run:final-build',
    });
    expect((compileLogs[1][1] as { fileCount: number }).fileCount).toBeGreaterThan(0);

    const firstCompilePayload = JSON.parse(((fetchMock.mock.calls[0][1] as RequestInit).body as string));
    expect(firstCompilePayload.files).toEqual({});

    const finalCompilePayload = JSON.parse(((fetchMock.mock.calls[1][1] as RequestInit).body as string));
    expect(finalCompilePayload.files).toHaveProperty('pages/Dashboard.tsx');
    expect(finalCompilePayload.files['pages/Dashboard.tsx']).toContain('Revenue command center');
    expect(finalCompilePayload.files).toHaveProperty('config/app.ts');
    expect(finalCompilePayload.files['config/app.ts']).toContain('Pipeline Pulse');
  });
});
