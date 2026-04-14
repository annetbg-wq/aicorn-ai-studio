/**
 * WhiteScreenDetector — Post-ready sanity check for preview iframe.
 *
 * Runs AFTER the authoritative ready_set handshake. Detects cases where
 * the preview technically mounted (MountReporter fired) but the user
 * sees an empty or effectively blank screen.
 *
 * Detection happens via a postMessage probe:
 *   1. Parent sends `{ type: 'white-screen-check', buildId }` to iframe
 *   2. Iframe inspects its own DOM and replies with `{ type: 'white-screen-result', ... }`
 *   3. This service evaluates the result and emits a structured diagnostic
 *
 * This is a DIAGNOSTIC LAYER — it never blocks or replaces the ready gate.
 * It runs after a configurable delay to allow for async renders, data loading,
 * and transition animations to complete.
 */

import { previewController, previewLog } from './PreviewController';

// ── Types ────────────────────────────────────────────────────────────────────

export interface WhiteScreenProbeResult {
  /** Whether the check found a meaningful render. */
  healthy: boolean;
  /** Reason category when unhealthy. */
  reason?: WhiteScreenReason;
  /** buildId this check was scoped to. */
  buildId: string;
  /** Raw metrics from the iframe's DOM inspection. */
  metrics: DOMMetrics;
}

export type WhiteScreenReason =
  | 'empty-root'         // #root has no child elements
  | 'blank-body'         // document.body has zero visible content
  | 'minimal-content'    // root has < MIN_MEANINGFUL_ELEMENTS elements and < MIN_TEXT_LENGTH text
  | 'loading-shell-only' // only a "loading" / "waiting" placeholder rendered
  | 'zero-height-root';  // #root has 0 computed height (collapsed / display:none)

/** Raw DOM metrics collected inside the iframe. */
export interface DOMMetrics {
  rootChildCount: number;
  rootInnerTextLength: number;
  rootOffsetHeight: number;
  bodyChildCount: number;
  bodyInnerTextLength: number;
  hasLoadingIndicator: boolean;
  /** First 200 chars of root's innerText for diagnostics. */
  rootTextHead: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const PREVIEW_ORIGIN = window.location.origin;

/** Delay after ready_set before running the probe. Allows async renders. */
const POST_READY_DELAY_MS = 2_500;

/** Timeout waiting for the iframe to respond to the probe. */
const PROBE_TIMEOUT_MS = 5_000;

/** Minimum number of elements in #root to be considered meaningful. */
const MIN_MEANINGFUL_ELEMENTS = 2;

/** Minimum text length in #root to be considered meaningful. */
const MIN_TEXT_LENGTH = 10;

/**
 * Text patterns that indicate a loading/waiting placeholder, not real content.
 * Matched case-insensitively against root's innerText.
 */
const LOADING_PATTERNS = [
  /^loading\.{0,3}$/i,
  /^waiting for generation/i,
  /^please wait/i,
  /^initializing/i,
];

// ── Core probe ──────────────────────────────────────────────────────────────

/**
 * Request the preview iframe to inspect its own DOM and report back.
 *
 * Returns null if the iframe doesn't respond within PROBE_TIMEOUT_MS
 * (e.g. iframe navigated away, crashed, or doesn't have the handler).
 */
export function probeIframe(
  buildId: string,
): Promise<WhiteScreenProbeResult | null> {
  return new Promise((resolve) => {
    let settled = false;

    const settle = (result: WhiteScreenProbeResult | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(result);
    };

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== PREVIEW_ORIGIN) return;
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type !== 'white-screen-result') return;
      if (d.buildId !== buildId) return;

      const metrics: DOMMetrics = d.metrics ?? {
        rootChildCount: 0,
        rootInnerTextLength: 0,
        rootOffsetHeight: 0,
        bodyChildCount: 0,
        bodyInnerTextLength: 0,
        hasLoadingIndicator: false,
        rootTextHead: '',
      };

      const result = evaluateMetrics(metrics, buildId);
      settle(result);
    };

    const timer = window.setTimeout(() => {
      previewLog('white_screen_probe_timeout', { buildId });
      settle(null);
    }, PROBE_TIMEOUT_MS);

    window.addEventListener('message', onMessage);

    // Send the probe request to the iframe
    const iframe = document.querySelector<HTMLIFrameElement>('[data-testid="preview-iframe"], iframe[src*="/__preview"]');
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(
        { type: 'white-screen-check', buildId },
        PREVIEW_ORIGIN,
      );
    } else {
      // No iframe found — can't probe
      previewLog('white_screen_no_iframe', { buildId });
      settle(null);
    }
  });
}

// ── Evaluation logic ────────────────────────────────────────────────────────

/**
 * Evaluate DOM metrics and classify the result.
 *
 * Classification rules (checked in order, first match wins):
 *   1. zero-height-root  — #root has 0px height (collapsed/hidden)
 *   2. empty-root        — #root has 0 child elements
 *   3. blank-body        — body has 0 child elements (no root at all)
 *   4. loading-shell-only— root text matches known loading patterns
 *   5. minimal-content   — root has < MIN elements AND < MIN text chars
 *   6. healthy           — passed all checks
 */
export function evaluateMetrics(
  metrics: DOMMetrics,
  buildId: string,
): WhiteScreenProbeResult {
  // 1. Root has zero height — collapsed or display:none
  if (metrics.rootOffsetHeight === 0 && metrics.rootChildCount > 0) {
    return { healthy: false, reason: 'zero-height-root', buildId, metrics };
  }

  // 2. Root has no children
  if (metrics.rootChildCount === 0) {
    return { healthy: false, reason: 'empty-root', buildId, metrics };
  }

  // 3. Body has no children (edge case — no #root at all)
  if (metrics.bodyChildCount === 0) {
    return { healthy: false, reason: 'blank-body', buildId, metrics };
  }

  // 4. Only a loading placeholder rendered
  if (metrics.hasLoadingIndicator) {
    const textTrimmed = metrics.rootTextHead.trim();
    const isLoadingOnly = LOADING_PATTERNS.some(p => p.test(textTrimmed));
    if (isLoadingOnly) {
      return { healthy: false, reason: 'loading-shell-only', buildId, metrics };
    }
  }

  // 5. Minimal content — few elements AND very little text
  if (
    metrics.rootChildCount < MIN_MEANINGFUL_ELEMENTS &&
    metrics.rootInnerTextLength < MIN_TEXT_LENGTH
  ) {
    return { healthy: false, reason: 'minimal-content', buildId, metrics };
  }

  // 6. Healthy
  return { healthy: true, buildId, metrics };
}

// ── Scheduled post-ready check ──────────────────────────────────────────────

/** Active timer handle — at most one check runs at a time. */
let _pendingTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedule a white-screen check to run POST_READY_DELAY_MS after ready_set.
 *
 * Called by RevisionManager after successful compile+promote.
 * If a new compile starts before the check runs, the pending check is cancelled.
 */
export function schedulePostReadyCheck(buildId: string): void {
  cancelPendingCheck();

  previewLog('white_screen_check_scheduled', {
    buildId,
    delayMs: POST_READY_DELAY_MS,
  });

  _pendingTimer = setTimeout(async () => {
    _pendingTimer = null;

    // Verify we're still in ready state for this build
    const state = previewController.getState();
    if (state.status !== 'ready') {
      previewLog('white_screen_check_skipped', {
        buildId,
        reason: 'status_changed',
        currentStatus: state.status,
      });
      return;
    }
    if (state.activeRevisionId && state.activeRevisionId !== buildId) {
      previewLog('white_screen_check_skipped', {
        buildId,
        reason: 'revision_changed',
        currentRevision: state.activeRevisionId,
      });
      return;
    }

    previewLog('white_screen_check_start', { buildId });

    const result = await probeIframe(buildId);

    if (!result) {
      previewLog('white_screen_check_inconclusive', {
        buildId,
        reason: 'no_response',
      });
      return;
    }

    if (result.healthy) {
      previewLog('white_screen_check_passed', {
        buildId,
        rootChildCount: result.metrics.rootChildCount,
        rootTextLength: result.metrics.rootInnerTextLength,
        rootHeight: result.metrics.rootOffsetHeight,
      });
      return;
    }

    // ── White screen detected ────────────────────────────────
    previewLog('white_screen_detected', {
      buildId,
      reason: result.reason,
      rootChildCount: result.metrics.rootChildCount,
      rootTextLength: result.metrics.rootInnerTextLength,
      rootHeight: result.metrics.rootOffsetHeight,
      rootTextHead: result.metrics.rootTextHead,
    });

    // Set diagnostic stage — does NOT change status to 'failed'.
    // The preview stays in 'ready' because the handshake was legitimate.
    // This creates a detectable diagnostic trail for the UI to act on.
    previewController.setDiagnosticError(
      'white-screen-detected',
      `White screen after ready: ${result.reason}` +
        ` (rootChildren=${result.metrics.rootChildCount},` +
        ` textLen=${result.metrics.rootInnerTextLength},` +
        ` height=${result.metrics.rootOffsetHeight})`,
      buildId,
    );
  }, POST_READY_DELAY_MS);
}

/**
 * Cancel any pending white-screen check. Called when a new compile starts
 * (the previous ready state is no longer relevant).
 */
export function cancelPendingCheck(): void {
  if (_pendingTimer !== null) {
    clearTimeout(_pendingTimer);
    _pendingTimer = null;
  }
}
