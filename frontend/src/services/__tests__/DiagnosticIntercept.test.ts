// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type QueryResult = { data?: unknown; error?: unknown; count?: number | null };

const state = vi.hoisted(() => ({
  queue: [] as QueryResult[],
  insertPayloads: [] as Array<Record<string, unknown>>,
  fromCalls: [] as string[],
}));

function dequeue(): QueryResult {
  return state.queue.shift() ?? { data: null, error: null, count: null };
}

function createQueryBuilder() {
  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn((payload: Record<string, unknown>) => {
      state.insertPayloads.push(payload);
      return builder;
    }),
    eq: vi.fn(() => builder),
    single: vi.fn(async () => dequeue()),
    maybeSingle: vi.fn(async () => dequeue()),
    then: (
      onFulfilled?: ((value: QueryResult) => unknown) | null,
      onRejected?: ((reason: unknown) => unknown) | null,
    ) => Promise.resolve(dequeue()).then(onFulfilled ?? undefined, onRejected ?? undefined),
  };
  return builder;
}

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      state.fromCalls.push(table);
      return createQueryBuilder();
    }),
  },
}));

import {
  activeDiagnosticRunId,
  interceptForDiagnosticRun,
  interceptForDiagnosticRunStream,
  setActiveDiagnosticRun,
} from '../DiagnosticIntercept';

describe('DiagnosticIntercept', () => {
  beforeEach(() => {
    state.queue = [];
    state.insertPayloads = [];
    state.fromCalls = [];
    setActiveDiagnosticRun(null);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('activates/deactivates via sessionStorage', () => {
    expect(activeDiagnosticRunId()).toBeNull();
    setActiveDiagnosticRun('run-1');
    expect(activeDiagnosticRunId()).toBe('run-1');
    setActiveDiagnosticRun(null);
    expect(activeDiagnosticRunId()).toBeNull();
  });

  it('is a no-op when no diagnostic run is active — never touches supabase', async () => {
    const result = await interceptForDiagnosticRun('https://api.example.com/chat', {}, '{}');
    expect(result).toBeNull();
    expect(state.fromCalls).toHaveLength(0);
  });

  it('pauses the call, records the exact request, and returns the externally-submitted result', async () => {
    setActiveDiagnosticRun('run-1');
    // 1) count existing steps  2) insert -> id  3) run status poll  4) step status poll (pending)
    // 5) run status poll  6) step status poll (resolved)
    state.queue.push(
      { count: 0 },
      { data: { id: 'step-1' }, error: null },
      { data: { status: 'running' } },
      { data: { status: 'pending' } },
      { data: { status: 'running' } },
      { data: { status: 'resolved', resolved_result: { text: 'hello from reviewer' } } },
    );

    const headers = { Authorization: 'Bearer sk-real-secret-key', 'Content-Type': 'application/json' };
    const promise = interceptForDiagnosticRun(
      'https://openrouter.ai/api/v1/chat/completions',
      headers,
      JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] }),
      'architect',
    );

    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await promise;

    expect(result).not.toBeNull();
    expect(await result!.text()).toBe(JSON.stringify({ text: 'hello from reviewer' }));

    // the captured step recorded the real request the LLM would have received...
    expect(state.insertPayloads[0]).toMatchObject({
      run_id: 'run-1',
      step_index: 0,
      step_name: 'architect',
      status: 'pending',
      request_endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      request_body: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] },
    });
    // ...but the provider API key never got stored.
    const storedHeaders = state.insertPayloads[0].request_headers as Record<string, string>;
    expect(storedHeaders.Authorization).toBe('[redacted]');
  });

  it('throws if the run is stopped while a step is pending', async () => {
    setActiveDiagnosticRun('run-1');
    state.queue.push(
      { count: 0 },
      { data: { id: 'step-1' }, error: null },
      { data: { status: 'stopped' } },
    );

    const promise = interceptForDiagnosticRun('https://api.example.com/chat', {}, '{}');
    const assertion = expect(promise).rejects.toThrow('Run was stopped externally');
    await vi.advanceTimersByTimeAsync(2_000);
    await assertion;
  });

  it('streaming variant wraps the resolved result as a single SSE chunk', async () => {
    setActiveDiagnosticRun('run-1');
    state.queue.push(
      { count: 0 },
      { data: { id: 'step-1' }, error: null },
      { data: { status: 'running' } },
      { data: { status: 'resolved', resolved_result: '{"ok":true}' } },
    );

    const promise = interceptForDiagnosticRunStream('https://api.example.com/chat', {}, '{}');
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await promise;
    const text = await result!.text();
    expect(text).toContain('data: {"ok":true}');
    expect(text).toContain('data: [DONE]');
  });
});
