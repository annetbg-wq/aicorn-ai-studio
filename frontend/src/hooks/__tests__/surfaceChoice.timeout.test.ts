import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { autoSelectSurface, SURFACE_CHOICE_TIMEOUT_MS } from '../../lib/surfaceHeuristic';

/**
 * Inline implementation of the core waiter logic, mirroring waitForSurfaceChoice
 * in useStudio.ts, so that timeout behaviour can be exercised in isolation
 * without mounting the full hook.
 */
function createWaiter(
  signal: AbortSignal,
  prompt: string,
  resolverRef: { current: ((s: 'app' | 'superapp') => void) | null },
  timeoutMs: number,
): Promise<'app' | 'superapp' | null> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(null); return; }

    let timerId: ReturnType<typeof setTimeout> | null = null;

    const onAbort = () => {
      if (timerId !== null) { clearTimeout(timerId); timerId = null; }
      resolverRef.current = null;
      resolve(null);
    };

    signal.addEventListener('abort', onAbort, { once: true });

    resolverRef.current = (surface) => {
      if (timerId !== null) { clearTimeout(timerId); timerId = null; }
      resolverRef.current = null;
      signal.removeEventListener('abort', onAbort);
      resolve(surface);
    };

    timerId = setTimeout(() => {
      timerId = null;
      resolverRef.current = null;
      signal.removeEventListener('abort', onAbort);
      resolve(autoSelectSurface(prompt));
    }, timeoutMs);
  });
}

describe('surface-choice waiter — user interaction', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resolves with "app" when user explicitly picks APP before timeout', async () => {
    const ctrl = new AbortController();
    const resolverRef: { current: ((s: 'app' | 'superapp') => void) | null } = { current: null };
    const p = createWaiter(ctrl.signal, 'todo app', resolverRef, SURFACE_CHOICE_TIMEOUT_MS);
    resolverRef.current?.('app');
    await vi.runAllTimersAsync();
    expect(await p).toBe('app');
  });

  it('resolves with "superapp" when user explicitly picks SUPER before timeout', async () => {
    const ctrl = new AbortController();
    const resolverRef: { current: ((s: 'app' | 'superapp') => void) | null } = { current: null };
    const p = createWaiter(ctrl.signal, 'todo app', resolverRef, SURFACE_CHOICE_TIMEOUT_MS);
    resolverRef.current?.('superapp');
    await vi.runAllTimersAsync();
    expect(await p).toBe('superapp');
  });

  it('clears resolver after user picks', async () => {
    const ctrl = new AbortController();
    const resolverRef: { current: ((s: 'app' | 'superapp') => void) | null } = { current: null };
    const p = createWaiter(ctrl.signal, 'todo app', resolverRef, SURFACE_CHOICE_TIMEOUT_MS);
    resolverRef.current?.('app');
    await vi.runAllTimersAsync();
    await p;
    expect(resolverRef.current).toBeNull();
  });
});

describe('surface-choice waiter — timeout auto-selection', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('auto-selects "app" after timeout for a generic prompt', async () => {
    const ctrl = new AbortController();
    const resolverRef: { current: ((s: 'app' | 'superapp') => void) | null } = { current: null };
    const p = createWaiter(ctrl.signal, 'build me a task tracker', resolverRef, SURFACE_CHOICE_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(SURFACE_CHOICE_TIMEOUT_MS);
    expect(await p).toBe('app');
    expect(resolverRef.current).toBeNull();
  });

  it('auto-selects "app" by default for an empty prompt', async () => {
    const ctrl = new AbortController();
    const resolverRef: { current: ((s: 'app' | 'superapp') => void) | null } = { current: null };
    const p = createWaiter(ctrl.signal, '', resolverRef, SURFACE_CHOICE_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(SURFACE_CHOICE_TIMEOUT_MS);
    expect(await p).toBe('app');
  });

  it('auto-selects "superapp" after timeout for a clear super-app prompt', async () => {
    const ctrl = new AbortController();
    const resolverRef: { current: ((s: 'app' | 'superapp') => void) | null } = { current: null };
    const p = createWaiter(ctrl.signal, 'Build a super app with everything', resolverRef, SURFACE_CHOICE_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(SURFACE_CHOICE_TIMEOUT_MS);
    expect(await p).toBe('superapp');
  });

  it('does not resolve before the timeout elapses', async () => {
    const ctrl = new AbortController();
    const resolverRef: { current: ((s: 'app' | 'superapp') => void) | null } = { current: null };
    let resolved = false;
    createWaiter(ctrl.signal, 'task tracker', resolverRef, SURFACE_CHOICE_TIMEOUT_MS).then(() => { resolved = true; });
    await vi.advanceTimersByTimeAsync(SURFACE_CHOICE_TIMEOUT_MS - 1);
    expect(resolved).toBe(false);
  });
});

describe('surface-choice waiter — abort / cancellation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resolves null when signal is aborted before timeout', async () => {
    const ctrl = new AbortController();
    const resolverRef: { current: ((s: 'app' | 'superapp') => void) | null } = { current: null };
    const p = createWaiter(ctrl.signal, 'counter app', resolverRef, SURFACE_CHOICE_TIMEOUT_MS);
    ctrl.abort();
    await vi.runAllTimersAsync();
    expect(await p).toBeNull();
    expect(resolverRef.current).toBeNull();
  });

  it('resolves null immediately when signal is already aborted at call time', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const resolverRef: { current: ((s: 'app' | 'superapp') => void) | null } = { current: null };
    const p = createWaiter(ctrl.signal, 'counter app', resolverRef, SURFACE_CHOICE_TIMEOUT_MS);
    await vi.runAllTimersAsync();
    expect(await p).toBeNull();
  });
});
