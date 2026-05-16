// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryResult = {
  data?: unknown;
  error?: unknown;
  count?: number | null;
};

const supabaseState = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  fromCalls: [] as string[],
  eqCalls: [] as Array<[string, unknown]>,
  insertPayloads: [] as Array<Record<string, unknown>>,
  queue: [] as QueryResult[],
}));

function dequeueResult(): QueryResult {
  return supabaseState.queue.shift() ?? { data: null, error: null, count: null };
}

function createQueryBuilder() {
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn((payload: Record<string, unknown>) => {
      supabaseState.insertPayloads.push(payload);
      return builder;
    }),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      supabaseState.eqCalls.push([column, value]);
      return builder;
    }),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    in: vi.fn(() => builder),
    single: vi.fn(async () => dequeueResult()),
    then: (
      onFulfilled?: ((value: QueryResult) => unknown) | null,
      onRejected?: ((reason: unknown) => unknown) | null,
    ) => Promise.resolve(dequeueResult()).then(onFulfilled ?? undefined, onRejected ?? undefined),
  };

  return builder;
}

const fromMock = vi.hoisted(() => vi.fn((table: string) => {
  supabaseState.fromCalls.push(table);
  return createQueryBuilder();
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: supabaseState.authGetUser,
    },
    from: fromMock,
  },
}));

vi.mock('../ConfigService', () => ({}));

vi.mock('../ScannerService', () => ({
  ScannerService: {
    scan: vi.fn(),
    buildPromptContext: vi.fn(() => 'mock-project-context'),
  },
}));

vi.mock('../MetricsService', () => ({
  metricsService: {
    record: vi.fn(),
  },
  enrichError: vi.fn((error: unknown) => error),
}));

vi.mock('../PromptRegistry', () => ({
  promptRegistry: {
    getPrompt: vi.fn(() => ''),
  },
}));

vi.mock('../LLMProxy', () => ({
  llmFetchStream: vi.fn(),
}));

vi.mock('../SkeletonRegistry', () => ({
  selectSkeleton: vi.fn(() => 'default'),
  buildSkeletonPromptBlock: vi.fn(() => ''),
}));

import { AgentLoopService } from '../AgentLoopService';

beforeEach(() => {
  supabaseState.authGetUser.mockReset();
  supabaseState.authGetUser.mockResolvedValue({ data: { user: null }, error: null });
  supabaseState.fromCalls.length = 0;
  supabaseState.eqCalls.length = 0;
  supabaseState.insertPayloads.length = 0;
  supabaseState.queue.length = 0;
  fromMock.mockClear();
});

describe('AgentLoopService RLS denial handling', () => {
  it('rejects startSession with auth error message when insert fails with RLS 42501', async () => {
    supabaseState.authGetUser.mockResolvedValue({ data: { user: null }, error: null });

    // Phase-cache lookup returns no cached session
    supabaseState.queue.push({ data: null, error: null });
    // INSERT fails with RLS violation
    supabaseState.queue.push({
      data: null,
      error: { code: '42501', message: 'new row violates row-level security policy' },
    });

    await expect(
      AgentLoopService.startSession('MyBlock', {}, 'api-key', 'model-id', vi.fn()),
    ).rejects.toThrow('Agent Lab requires authentication. Please sign in with Google to create agent sessions.');
  });

  it('rejects restartWithSpec with auth error message when insert fails with RLS 42501', async () => {
    supabaseState.authGetUser.mockResolvedValue({ data: { user: null }, error: null });

    // getAgentSessionById fetch
    supabaseState.queue.push({
      data: {
        id: 'src-1',
        block_name: 'MyBlock',
        spec_result: { blockName: 'MyBlock' },
        clarify_questions: null,
        clarify_answers: null,
        isolated_files: {},
        max_iterations: 2,
      },
      error: null,
    });
    // INSERT fails with RLS violation
    supabaseState.queue.push({
      data: null,
      error: { code: '42501', message: 'new row violates row-level security policy' },
    });

    await expect(
      AgentLoopService.restartWithSpec('src-1', vi.fn()),
    ).rejects.toThrow('Agent Lab requires authentication. Please sign in with Google to create agent sessions.');
  });
});

describe('AgentLoopService owner scoping', () => {
  it('includes user_id in insert payloads when an auth user is available', async () => {
    supabaseState.authGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    supabaseState.queue.push(
      {
        data: {
          id: 'rejected-1',
          block_name: 'Landing page',
          spec_result: { blockName: 'Landing page' },
          clarify_questions: null,
          clarify_answers: ['Use a dark hero'],
          isolated_files: { 'src/App.tsx': 'export default function App() {}' },
          max_iterations: 2,
        },
        error: null,
      },
      {
        data: { id: 'session-2' },
        error: null,
      },
    );

    await expect(
      AgentLoopService.restartWithSpec('rejected-1', vi.fn()),
    ).resolves.toBe('session-2');

    expect(supabaseState.insertPayloads).toHaveLength(1);
    expect(supabaseState.insertPayloads[0]).toMatchObject({
      block_name: 'Landing page',
      status: 'spec_review',
      user_id: 'user-123',
    });
  });

  it('adds user_id filtering to getSessions when an auth user is available', async () => {
    supabaseState.authGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    supabaseState.queue.push({
      data: [{ id: 'session-1', status: 'pending' }],
      error: null,
    });

    await expect(AgentLoopService.getSessions()).resolves.toEqual([{ id: 'session-1', status: 'pending' }]);
    expect(supabaseState.eqCalls).toContainEqual(['user_id', 'user-123']);
  });

  it('does not throw when auth lookup fails', async () => {
    supabaseState.authGetUser.mockRejectedValue(new Error('auth unavailable'));
    supabaseState.queue.push({ data: [], error: null });

    await expect(AgentLoopService.getSessions()).resolves.toEqual([]);
    expect(supabaseState.eqCalls.some(([column]) => column === 'user_id')).toBe(false);
  });
});
