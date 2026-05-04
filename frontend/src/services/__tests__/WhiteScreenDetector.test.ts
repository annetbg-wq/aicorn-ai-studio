// @vitest-environment jsdom

/**
 * WhiteScreenDetector — Tests for post-ready sanity check.
 *
 * Proves that:
 *   1. evaluateMetrics correctly classifies DOM states
 *   2. Different white-screen reasons are distinguished
 *   3. Healthy renders pass
 *   4. Edge cases (loading shells, zero-height, minimal content) are caught
 *   5. The check does NOT weaken the ready_set contract
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FINAL_CHECK_SETTLE_WINDOW_MS,
  POST_PROMOTION_WATCHDOG_WINDOW_MS,
  cancelPendingCheck,
  cancelPostPromotionWatch,
  evaluateMetrics,
  runFinalLivePreviewCheck,
  schedulePostReadyCheck,
  startPostPromotionWatch,
  type DOMMetrics,
  type WhiteScreenReason,
} from '../WhiteScreenDetector';

// ── Mock PreviewController (imported by WhiteScreenDetector) ────────────────

const previewControllerState = vi.hoisted(() => ({
  value: { status: 'ready', activeRevisionId: 'test-build', error: undefined as string | undefined },
}));

const previewControllerMock = vi.hoisted(() => ({
  setDiagnosticError: vi.fn(),
}));

const previewLogMock = vi.hoisted(() => vi.fn());

vi.mock('../PreviewController', () => ({
  previewController: {
    getState: () => previewControllerState.value,
    setDiagnosticError: previewControllerMock.setDiagnosticError,
  },
  previewLog: previewLogMock,
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeMetrics(overrides: Partial<DOMMetrics> = {}): DOMMetrics {
  return {
    rootChildCount: 5,
    rootInnerTextLength: 200,
    rootOffsetHeight: 800,
    bodyChildCount: 3,
    bodyInnerTextLength: 250,
    hasLoadingIndicator: false,
    rootTextHead: 'Welcome to my app. This is the dashboard with several sections.',
    semanticElementCount: 0,
    interactiveElementCount: 0,
    visualElementCount: 0,
    ...overrides,
  };
}

const BUILD = 'test-build-abc';

function mountPreviewIframe(buildId: string, bodyText = '<main>Healthy preview content</main>'): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('data-testid', 'preview-iframe');
  iframe.setAttribute('data-build-id', buildId);
  iframe.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    width: 390,
    height: 844,
    top: 0,
    right: 390,
    bottom: 844,
    left: 0,
    toJSON: () => ({}),
  });
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (doc?.body) {
    doc.body.innerHTML = `<div id="root">${bodyText}</div>`;
  }
  return iframe;
}

function findLoggedEvent(event: string, predicate: (payload: Record<string, unknown>) => boolean = () => true) {
  return previewLogMock.mock.calls.find(
    ([loggedEvent, payload]) =>
      loggedEvent === event && predicate((payload as Record<string, unknown>) ?? {}),
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
  previewControllerState.value = { status: 'ready', activeRevisionId: 'test-build', error: undefined };
  previewControllerMock.setDiagnosticError.mockReset();
  previewLogMock.mockReset();
  cancelPendingCheck();
  cancelPostPromotionWatch();
});

afterEach(() => {
  cancelPendingCheck();
  cancelPostPromotionWatch();
  vi.useRealTimers();
});

// ── evaluateMetrics ─────────────────────────────────────────────────────────

describe('evaluateMetrics', () => {

  // ── Healthy cases ───────────────────────────────────────────────

  it('marks a normal render as healthy', () => {
    const result = evaluateMetrics(makeMetrics(), BUILD);
    expect(result.healthy).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.buildId).toBe(BUILD);
  });

  it('marks a text-heavy single-element render as healthy', () => {
    // Single child but lots of text — e.g. a full-page article
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 1,
      rootInnerTextLength: 500,
      rootTextHead: 'This is a long article with lots of content about various topics...',
    }), BUILD);
    expect(result.healthy).toBe(true);
  });

  it('marks multi-element low-text render as healthy', () => {
    // Several elements but little text — e.g. icon dashboard
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 10,
      rootInnerTextLength: 5,
    }), BUILD);
    expect(result.healthy).toBe(true);
  });

  it('does NOT flag normal app content as runtime-error-screen', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 4,
      rootInnerTextLength: 72,
      rootTextHead: 'Dashboard loaded with usage charts, team activity, and recent project updates',
    }), BUILD);
    expect(result.healthy).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  // ── empty-root ──────────────────────────────────────────────────

  it('detects empty-root: #root has no children', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 0,
      rootInnerTextLength: 0,
      rootOffsetHeight: 0,
      rootTextHead: '',
    }), BUILD);
    expect(result.healthy).toBe(false);
    expect(result.reason).toBe('empty-root' satisfies WhiteScreenReason);
  });

  // ── blank-body ──────────────────────────────────────────────────

  it('detects blank-body: body has no children', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 0,
      bodyChildCount: 0,
      rootInnerTextLength: 0,
      bodyInnerTextLength: 0,
      rootTextHead: '',
    }), BUILD);
    expect(result.healthy).toBe(false);
    // empty-root fires first (rootChildCount=0), which is correct —
    // blank-body is a deeper fallback
    expect(result.reason).toBe('empty-root');
  });

  it('detects blank-body when root somehow has children but body does not', () => {
    // Edge case: rootChildCount > 0 but bodyChildCount = 0
    // (shouldn't happen in practice, but tests the priority)
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 2,
      bodyChildCount: 0,
      rootInnerTextLength: 0,
      rootOffsetHeight: 100,
      rootTextHead: '',
    }), BUILD);
    expect(result.healthy).toBe(false);
    expect(result.reason).toBe('blank-body');
  });

  // ── zero-height-root ────────────────────────────────────────────

  it('detects zero-height-root: root has children but 0 height', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 3,
      rootOffsetHeight: 0,
      rootInnerTextLength: 50,
    }), BUILD);
    expect(result.healthy).toBe(false);
    expect(result.reason).toBe('zero-height-root' satisfies WhiteScreenReason);
  });

  it('does NOT flag zero-height when root has no children (that is empty-root)', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 0,
      rootOffsetHeight: 0,
    }), BUILD);
    // Should be empty-root, not zero-height-root
    expect(result.reason).toBe('empty-root');
  });

  // ── loading-shell-only ──────────────────────────────────────────

  it('detects loading-shell-only: "Loading..." placeholder', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 1,
      rootInnerTextLength: 10,
      hasLoadingIndicator: true,
      rootTextHead: 'Loading...',
    }), BUILD);
    expect(result.healthy).toBe(false);
    expect(result.reason).toBe('loading-shell-only' satisfies WhiteScreenReason);
  });

  it('detects loading-shell-only: "Waiting for generation..." placeholder', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 1,
      rootInnerTextLength: 26,
      hasLoadingIndicator: true,
      rootTextHead: 'Waiting for generation...',
    }), BUILD);
    expect(result.healthy).toBe(false);
    expect(result.reason).toBe('loading-shell-only');
  });

  it('does NOT flag loading indicator with real content around it', () => {
    // App has a loading spinner but also real content text
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 8,
      rootInnerTextLength: 300,
      hasLoadingIndicator: true,
      rootTextHead: 'Dashboard - Welcome back! Loading more items...',
    }), BUILD);
    expect(result.healthy).toBe(true);
  });

  // ── minimal-content ─────────────────────────────────────────────

  it('detects minimal-content only when sparse content is also visually collapsed', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 1,
      rootInnerTextLength: 3,
      rootOffsetHeight: 8,
      hasLoadingIndicator: false,
      rootTextHead: 'Hi',
    }), BUILD);
    expect(result.healthy).toBe(false);
    expect(result.reason).toBe('minimal-content' satisfies WhiteScreenReason);
  });

  it('does NOT flag a visible short single-node UI as placeholder-only', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 1,
      rootInnerTextLength: 5,
      rootOffsetHeight: 56,
      hasLoadingIndicator: false,
      rootTextHead: 'Hello',
    }), BUILD);
    expect(result.healthy).toBe(true);
  });

  it('does NOT flag a visual-only render when the surface is real', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 1,
      rootInnerTextLength: 0,
      rootOffsetHeight: 180,
      hasLoadingIndicator: false,
      rootTextHead: '',
      visualElementCount: 1,
    }), BUILD);
    expect(result.healthy).toBe(true);
  });

  it('does NOT flag minimal-content when element count >= 2', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 2,
      rootInnerTextLength: 3,
      rootOffsetHeight: 50,
    }), BUILD);
    expect(result.healthy).toBe(true);
  });

  it('does NOT flag minimal-content when text length >= 10', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 1,
      rootInnerTextLength: 15,
      rootOffsetHeight: 50,
      rootTextHead: 'Hello World!!!',
    }), BUILD);
    expect(result.healthy).toBe(true);
  });

  // ── runtime-error-screen ───────────────────────────────────────

  it('detects runtime-error-screen: provider usage error fallback', () => {
    const text = 'must be used within AppProvider';
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 3,
      rootInnerTextLength: text.length,
      rootOffsetHeight: 320,
      rootTextHead: text,
      interactiveElementCount: 1,
    }), BUILD);
    expect(result.healthy).toBe(false);
    expect(result.reason).toBe('runtime-error-screen' satisfies WhiteScreenReason);
  });

  it('detects runtime-error-screen: failed load fallback', () => {
    const text = 'Dashboard failed to load';
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 4,
      rootInnerTextLength: text.length,
      rootOffsetHeight: 360,
      rootTextHead: text,
      interactiveElementCount: 2,
    }), BUILD);
    expect(result.healthy).toBe(false);
    expect(result.reason).toBe('runtime-error-screen');
  });

  it('detects runtime-error-screen: compileGuard page error fallback', () => {
    const text = 'This page encountered an error vite build exited 1';
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 3,
      rootInnerTextLength: text.length,
      rootOffsetHeight: 360,
      rootTextHead: text,
      semanticElementCount: 1,
    }), BUILD);
    expect(result.healthy).toBe(false);
    expect(result.reason).toBe('runtime-error-screen');
  });

  it('keeps empty-root priority over runtime error text', () => {
    const text = 'must be used within AppProvider';
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 0,
      rootInnerTextLength: text.length,
      rootOffsetHeight: 0,
      rootTextHead: text,
    }), BUILD);
    expect(result.healthy).toBe(false);
    expect(result.reason).toBe('empty-root');
  });

  // ── Metrics are preserved in result ─────────────────────────────

  it('always includes metrics in the result', () => {
    const metrics = makeMetrics();
    const result = evaluateMetrics(metrics, BUILD);
    expect(result.metrics).toBe(metrics);
    expect(result.buildId).toBe(BUILD);
  });

  // ── Priority ordering ──────────────────────────────────────────

  it('zero-height-root takes priority over loading-shell-only', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 1,
      rootOffsetHeight: 0,
      hasLoadingIndicator: true,
      rootTextHead: 'Loading...',
    }), BUILD);
    expect(result.reason).toBe('zero-height-root');
  });

  it('empty-root takes priority over minimal-content', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 0,
      rootInnerTextLength: 0,
      rootOffsetHeight: 0,
    }), BUILD);
    expect(result.reason).toBe('empty-root');
  });
});

// ── Integration-level: proves check doesn't weaken ready_set ────────────────

describe('White-screen check does not weaken ready_set', () => {
  it('evaluateMetrics never returns a "not ready" or "block" reason', () => {
    // The detector only returns WhiteScreenReason categories —
    // never 'timeout', 'blocked', 'compile_error', etc.
    const allReasons = new Set<string>();

    // Test a variety of unhealthy states
    const unhealthyCases: Partial<DOMMetrics>[] = [
      { rootChildCount: 0 },
      { bodyChildCount: 0, rootChildCount: 2, rootInnerTextLength: 0, rootOffsetHeight: 100 },
      { rootChildCount: 3, rootOffsetHeight: 0 },
      { rootChildCount: 1, rootInnerTextLength: 5, hasLoadingIndicator: true, rootTextHead: 'Loading' },
      { rootChildCount: 1, rootInnerTextLength: 3 },
      { rootChildCount: 3, rootInnerTextLength: 30, rootOffsetHeight: 120, rootTextHead: 'must be used within AppProvider' },
    ];

    for (const c of unhealthyCases) {
      const result = evaluateMetrics(makeMetrics(c), BUILD);
      if (result.reason) allReasons.add(result.reason);
    }

    // All reasons must be white-screen-specific, not lifecycle reasons
    const validReasons: Set<string> = new Set([
      'empty-root',
      'blank-body',
      'minimal-content',
      'loading-shell-only',
      'zero-height-root',
      'runtime-error-screen',
    ]);
    for (const r of allReasons) {
      expect(validReasons.has(r)).toBe(true);
    }
  });

  it('waits for a meaningful render to settle before passing final promotion', async () => {
    vi.useFakeTimers();
    const buildId = 'settle-success-build';
    previewControllerState.value = { status: 'ready', activeRevisionId: buildId, error: undefined };
    const iframe = mountPreviewIframe(buildId, '<div>Waiting for generation...</div>');

    const resultPromise = runFinalLivePreviewCheck(buildId);

    window.setTimeout(() => {
      const doc = iframe.contentDocument;
      if (doc?.body) {
        doc.body.innerHTML = [
          '<div id="root">',
          '  <main>',
          '    <section data-testid="live-canary-surface">',
          '      <h1>Live preview canary</h1>',
          '      <button>Open</button>',
          '    </section>',
          '  </main>',
          '</div>',
        ].join('');
      }
    }, 500);

    window.setTimeout(() => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: window.location.origin,
        data: {
          type: 'white-screen-result',
          buildId,
          metrics: makeMetrics({
            rootChildCount: 2,
            rootInnerTextLength: 32,
            rootOffsetHeight: 120,
            bodyInnerTextLength: 32,
            hasLoadingIndicator: false,
            rootTextHead: 'Live preview canary Open',
            semanticElementCount: 2,
            interactiveElementCount: 1,
            visualElementCount: 0,
          }),
        },
      }));
    }, 800);

    await vi.advanceTimersByTimeAsync(900);
    const result = await resultPromise;

    expect(result.status).toBe('passed');
    expect(result.reason).toBeNull();
    expect(findLoggedEvent(
      'final_check_settle_started',
      payload => payload.buildId === buildId,
    )).toBeTruthy();
    expect(findLoggedEvent(
      'final_check_settle_progress',
      payload => payload.buildId === buildId && payload.failureReason === 'placeholder_only',
    )).toBeTruthy();
    expect(findLoggedEvent(
      'final_check_settle_satisfied',
      payload => payload.buildId === buildId,
    )).toBeTruthy();
    expect(findLoggedEvent(
      'final_check_settle_timeout',
      payload => payload.buildId === buildId,
    )).toBeFalsy();
  });

  it('waits for a transitional controller_not_ready state to become ready before deciding', async () => {
    vi.useFakeTimers();
    const buildId = 'controller-settle-success-build';
    previewControllerState.value = { status: 'compiling', activeRevisionId: buildId, error: undefined };
    const iframe = mountPreviewIframe(buildId, '<main>Initial surface already rendered</main>');

    const resultPromise = runFinalLivePreviewCheck(buildId);

    window.setTimeout(() => {
      previewControllerState.value = { status: 'ready', activeRevisionId: buildId, error: undefined };
      const doc = iframe.contentDocument;
      if (doc?.body) {
        doc.body.innerHTML = '<div id="root"><main><section>Controller settled preview</section></main></div>';
      }
    }, 500);

    window.setTimeout(() => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: window.location.origin,
        data: {
          type: 'white-screen-result',
          buildId,
          metrics: makeMetrics({
            rootChildCount: 2,
            rootInnerTextLength: 26,
            rootOffsetHeight: 120,
            bodyInnerTextLength: 26,
            rootTextHead: 'Controller settled preview',
            semanticElementCount: 2,
          }),
        },
      }));
    }, 800);

    await vi.advanceTimersByTimeAsync(900);
    const result = await resultPromise;

    expect(result.status).toBe('passed');
    expect(result.reason).toBeNull();
    expect(findLoggedEvent(
      'final_check_settle_progress',
      payload => payload.buildId === buildId && payload.controllerReady === false,
    )).toBeTruthy();
    expect(findLoggedEvent(
      'final_check_settle_satisfied',
      payload => payload.buildId === buildId && payload.controllerStatus === 'ready',
    )).toBeTruthy();
  });

  it('fails controller_not_ready only after the bounded settle window when render is otherwise healthy', async () => {
    vi.useFakeTimers();
    const buildId = 'controller-settle-timeout-build';
    previewControllerState.value = { status: 'compiling', activeRevisionId: buildId, error: undefined };
    mountPreviewIframe(buildId, '<main>Healthy pixels but controller not ready</main>');

    const resultPromise = runFinalLivePreviewCheck(buildId);
    await vi.advanceTimersByTimeAsync(FINAL_CHECK_SETTLE_WINDOW_MS + 50);
    const result = await resultPromise;

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('controller_not_ready');
    expect(result.probeOutcome).toBe('inconclusive');
    expect(findLoggedEvent(
      'final_check_settle_timeout',
      payload => payload.buildId === buildId && payload.controllerReady === false,
    )).toBeTruthy();
    expect(findLoggedEvent(
      'final_check_blank_root',
      payload => payload.buildId === buildId,
    )).toBeFalsy();
  });

  it('blocks final promotion when the mounted root is blank', async () => {
    vi.useFakeTimers();
    const buildId = 'blank-root-build';
    previewControllerState.value = { status: 'ready', activeRevisionId: buildId, error: undefined };
    mountPreviewIframe(buildId, '');

    const resultPromise = runFinalLivePreviewCheck(buildId);
    await vi.advanceTimersByTimeAsync(FINAL_CHECK_SETTLE_WINDOW_MS + 50);
    const result = await resultPromise;

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('blank_root');
    expect(result.probeReason).toBe('empty-root');
    expect(findLoggedEvent(
      'final_check_settle_timeout',
      payload => payload.buildId === buildId && payload.failureReason === 'blank_root',
    )).toBeTruthy();
    expect(findLoggedEvent(
      'final_check_blank_root',
      payload => payload.buildId === buildId && payload.reason === 'empty-root',
    )).toBeTruthy();
  });

  it('blocks final promotion when only a loading placeholder is rendered', async () => {
    vi.useFakeTimers();
    const buildId = 'placeholder-only-build';
    previewControllerState.value = { status: 'ready', activeRevisionId: buildId, error: undefined };
    mountPreviewIframe(buildId, '<div>Waiting for generation...</div>');

    const resultPromise = runFinalLivePreviewCheck(buildId);
    await vi.advanceTimersByTimeAsync(FINAL_CHECK_SETTLE_WINDOW_MS + 50);
    const result = await resultPromise;

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('placeholder_only');
    expect(result.probeReason).toBe('loading-shell-only');
    expect(findLoggedEvent(
      'final_check_settle_timeout',
      payload => payload.buildId === buildId && payload.failureReason === 'placeholder_only',
    )).toBeTruthy();
    expect(findLoggedEvent(
      'final_check_placeholder_confirmed',
      payload => payload.buildId === buildId && payload.reason === 'loading-shell-only',
    )).toBeTruthy();
    expect(findLoggedEvent(
      'final_check_placeholder_only',
      payload => payload.buildId === buildId && payload.reason === 'loading-shell-only',
    )).toBeTruthy();
  });
});

describe('post-promotion watchdog', () => {
  it('requires two consecutive unhealthy signals before invoking the watchdog failure callback', async () => {
    vi.useFakeTimers();
    const buildId = 'watchdog-two-signal-build';
    const onUnhealthy = vi.fn();

    previewControllerState.value = { status: 'ready', activeRevisionId: buildId, error: undefined };
    mountPreviewIframe(buildId, '');

    startPostPromotionWatch(buildId, {
      previousActiveRevisionId: 'last-good',
      onUnhealthy,
    });

    await vi.advanceTimersByTimeAsync(2_500);

    expect(onUnhealthy).not.toHaveBeenCalled();
    expect(findLoggedEvent(
      'watchdog_unhealthy_pending',
      payload => payload.buildId === buildId,
    )).toBeTruthy();

    await vi.advanceTimersByTimeAsync(2_100);

    expect(onUnhealthy).toHaveBeenCalledTimes(1);
    expect(findLoggedEvent(
      'watchdog_unhealthy_confirmed',
      payload => payload.buildId === buildId,
    )).toBeTruthy();
    expect(findLoggedEvent(
      'watchdog_late_regression_confirmed',
      payload => payload.buildId === buildId,
    )).toBeTruthy();
    expect(findLoggedEvent(
      'post_promotion_watch_result',
      payload => payload.buildId === buildId && payload.outcome === 'promotion_revoked',
    )).toBeTruthy();
  });

  it('confirms an actual late regression after an initially healthy post-promotion surface', async () => {
    vi.useFakeTimers();
    const buildId = 'watchdog-late-regression-build';
    const onUnhealthy = vi.fn();
    const iframe = mountPreviewIframe(buildId, '<main>Promoted healthy surface</main>');

    previewControllerState.value = { status: 'ready', activeRevisionId: buildId, error: undefined };
    startPostPromotionWatch(buildId, {
      previousActiveRevisionId: 'last-good',
      onUnhealthy,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    const doc = iframe.contentDocument;
    if (doc?.body) {
      doc.body.innerHTML = '<div id="root"></div>';
    }

    await vi.advanceTimersByTimeAsync(3_600);

    expect(onUnhealthy).toHaveBeenCalledTimes(1);
    expect(onUnhealthy.mock.calls[0][0]).toMatchObject({
      buildId,
      status: 'unhealthy',
      reason: 'blank_root',
    });
    expect(findLoggedEvent(
      'watchdog_late_regression_confirmed',
      payload => payload.buildId === buildId,
    )).toBeTruthy();
  });

  it('does not revoke on stale or inconclusive diagnostics', async () => {
    vi.useFakeTimers();
    const buildId = 'watchdog-inconclusive-build';
    const onUnhealthy = vi.fn();

    previewControllerState.value = { status: 'compiling', activeRevisionId: buildId, error: undefined };
    mountPreviewIframe(buildId, '<main>Rendered, but controller is still settling</main>');

    startPostPromotionWatch(buildId, {
      previousActiveRevisionId: 'last-good',
      onUnhealthy,
    });

    await vi.advanceTimersByTimeAsync(POST_PROMOTION_WATCHDOG_WINDOW_MS + 1_000);

    expect(onUnhealthy).not.toHaveBeenCalled();
    expect(findLoggedEvent(
      'watchdog_inconclusive',
      payload => payload.buildId === buildId && payload.reason === 'controller_not_ready',
    )).toBeTruthy();
    expect(findLoggedEvent(
      'watchdog_unhealthy_confirmed',
      payload => payload.buildId === buildId,
    )).toBeFalsy();
    expect(findLoggedEvent(
      'post_promotion_watch_result',
      payload => payload.buildId === buildId && payload.outcome === 'promotion_revoked',
    )).toBeFalsy();
  });

  it('ignores a stale diagnostic from an old build', async () => {
    vi.useFakeTimers();
    const onUnhealthy = vi.fn();

    previewControllerState.value = { status: 'ready', activeRevisionId: 'current-build', error: undefined };
    startPostPromotionWatch('current-build', {
      previousActiveRevisionId: 'last-good',
      onUnhealthy,
    });

    schedulePostReadyCheck('stale-build');
    await vi.advanceTimersByTimeAsync(2_500);

    expect(onUnhealthy).not.toHaveBeenCalled();
    expect(findLoggedEvent(
      'post_promotion_watch_result',
      payload => payload.outcome === 'ignored_stale_diagnostic' && payload.buildId === 'stale-build',
    )).toBeTruthy();
  });

  it('does not revoke after the watchdog window has expired', async () => {
    vi.useFakeTimers();
    const onUnhealthy = vi.fn();

    previewControllerState.value = { status: 'ready', activeRevisionId: 'stable-build', error: undefined };
    const iframe = mountPreviewIframe('stable-build', '<main>Still healthy preview content</main>');
    startPostPromotionWatch('stable-build', {
      previousActiveRevisionId: 'last-good',
      onUnhealthy,
    });

    await vi.advanceTimersByTimeAsync(POST_PROMOTION_WATCHDOG_WINDOW_MS + 2_500);

    const doc = iframe.contentDocument;
    if (doc?.body) {
      doc.body.innerHTML = '<div id="root"></div>';
    }

    schedulePostReadyCheck('stable-build');
    await vi.advanceTimersByTimeAsync(2_500);

    expect(onUnhealthy).not.toHaveBeenCalled();
    expect(findLoggedEvent(
      'post_promotion_watch_result',
      payload => payload.outcome === 'stable_window_elapsed' && payload.buildId === 'stable-build',
    )).toBeTruthy();
  });
});
