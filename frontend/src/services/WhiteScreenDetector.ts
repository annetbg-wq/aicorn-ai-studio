/**
 * WhiteScreenDetector — immediate promotion gate plus delayed post-ready diagnostics.
 *
 * Two distinct layers:
 *   1. Hard gate in RevisionManager.promote(): immediate blank iframe blocks promotion.
 *   2. Post-promotion watchdog/diagnostic: a delayed cheap probe can still revoke the
 *      just-promoted revision for a short bounded window, then falls back to telemetry only.
 *
 * For the deeper same-origin iframe probe (#root metrics, offsetHeight, loading shell, etc.)
 * use schedulePostReadyCheck / probeIframe below.
 */

import { previewController, previewLog } from './PreviewController';

export class WhiteScreenDetector {
  // Баг 4 fix: убран `async` — функция синхронна, await внутри нет.
  // Баг 2 fix: проверяем #root, а не body. В Vite iframe body.children.length
  // всегда равно 1 (только #root), поэтому `body.children.length > 1` никогда
  // не было true → visual-only приложения (canvas, SVG, изображения без текста)
  // ложно считались пустыми.
  static isBlank(iframe: HTMLIFrameElement | null): boolean {
    return !inspectIframeRenderSurface(iframe).healthy;
  }
}

export type FinalLivePreviewCheckStatus = 'passed' | 'failed' | 'skipped';
export type FinalLivePreviewCheckFailureReason =
  | 'candidate_not_viable'
  | 'controller_failed'
  | 'controller_not_ready'
  | 'revision_mismatch'
  | 'blank_root'
  | 'placeholder_only'
  | 'blank_iframe'
  | 'probe_failed';

export interface FinalLivePreviewCheckResult {
  buildId: string;
  status: FinalLivePreviewCheckStatus;
  reason: FinalLivePreviewCheckFailureReason | null;
  message: string;
  controllerStatus: ReturnType<typeof previewController.getState>['status'];
  controllerRevisionId: string | null;
  immediateBlank: boolean;
  probeOutcome: 'healthy' | 'unhealthy' | 'inconclusive';
  probeReason: WhiteScreenReason | null;
}

export type PostReadyDiagnosticStatus = 'healthy' | 'unhealthy' | 'inconclusive';
export type PostReadyDiagnosticReason =
  | FinalLivePreviewCheckFailureReason
  | 'probe_timeout';

export interface PostReadyDiagnosticResult {
  buildId: string;
  status: PostReadyDiagnosticStatus;
  reason: PostReadyDiagnosticReason | null;
  message: string;
  controllerStatus: ReturnType<typeof previewController.getState>['status'];
  controllerRevisionId: string | null;
  immediateBlank: boolean;
  probeOutcome: 'healthy' | 'unhealthy' | 'inconclusive';
  probeReason: WhiteScreenReason | null;
  metrics: DOMMetrics | null;
}

export interface PostPromotionWatchOptions {
  previousActiveRevisionId: string | null;
  promotionMode?: 'normal' | 'degraded';
  onUnhealthy: (result: PostReadyDiagnosticResult) => Promise<void> | void;
}

interface PostPromotionWatchContext extends PostPromotionWatchOptions {
  buildId: string;
  startedAt: number;
  expiresAt: number;
}

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
  | 'zero-height-root'   // #root has 0 computed height (collapsed / display:none)
  | 'runtime-error-screen'; // rendered an application error fallback instead of the app

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
  /** Count of meaningful layout/semantic elements visible in the root subtree. */
  semanticElementCount: number;
  /** Count of interactive controls in the root subtree. */
  interactiveElementCount: number;
  /** Count of media/visual elements in the root subtree. */
  visualElementCount: number;
}

export interface ImmediateRenderSurfaceResult {
  healthy: boolean;
  failureReason: Extract<FinalLivePreviewCheckFailureReason, 'blank_root' | 'placeholder_only'> | null;
  probeReason: WhiteScreenReason | null;
  message: string;
  metrics: DOMMetrics | null;
}

interface FinalCheckSettleResult {
  initialSurface: ImmediateRenderSurfaceResult;
  finalSurface: ImmediateRenderSurfaceResult;
  controllerStatus: ReturnType<typeof previewController.getState>['status'];
  controllerRevisionId: string | null;
  controllerReady: boolean;
  revisionMismatch: boolean;
  settled: boolean;
  attempts: number;
  elapsedMs: number;
}

interface RenderFailureDescriptor {
  failureReason: Extract<FinalLivePreviewCheckFailureReason, 'blank_root' | 'placeholder_only'>;
  logEvent: 'final_check_blank_root' | 'final_check_placeholder_only' | 'final_check_runtime_error';
  message: string;
}

function findPreviewIframe(buildId: string): HTMLIFrameElement | null {
  return document.querySelector<HTMLIFrameElement>(
    `iframe[data-build-id="${buildId}"], iframe[data-testid="preview-iframe"], iframe[src*="/__preview"]`,
  );
}

function getNodeText(node: Element | HTMLBodyElement): string {
  return (node.textContent ?? '').trim();
}

function matchesLoadingShellText(text: string): boolean {
  return LOADING_PATTERNS.some(pattern => pattern.test(text.trim()));
}

const SEMANTIC_SURFACE_SELECTOR = [
  'main',
  'section',
  'article',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  '[role="main"]',
  '[role="region"]',
  '[role="dialog"]',
  '[data-testid]',
].join(',');

const INTERACTIVE_SURFACE_SELECTOR = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
].join(',');

const VISUAL_SURFACE_SELECTOR = 'svg,canvas,img,picture,video';

function countMatchingNodes(root: Element, selector: string): number {
  let count = root.matches(selector) ? 1 : 0;
  count += root.querySelectorAll(selector).length;
  return count;
}

function collectSurfaceSignals(root: Element): Pick<DOMMetrics, 'semanticElementCount' | 'interactiveElementCount' | 'visualElementCount'> {
  return {
    semanticElementCount: countMatchingNodes(root, SEMANTIC_SURFACE_SELECTOR),
    interactiveElementCount: countMatchingNodes(root, INTERACTIVE_SURFACE_SELECTOR),
    visualElementCount: countMatchingNodes(root, VISUAL_SURFACE_SELECTOR),
  };
}

function collectIframeMetrics(iframe: HTMLIFrameElement | null): DOMMetrics | null {
  if (!iframe) return null;
  const doc = iframe.contentDocument;
  if (!doc?.body) return null;

  const root = doc.getElementById('root') ?? doc.body;
  const rootText = getNodeText(root);
  const bodyText = getNodeText(doc.body);
  const rootElement = root instanceof HTMLElement ? root : null;
  const surfaceSignals = collectSurfaceSignals(root);

  return {
    rootChildCount: root.children.length,
    rootInnerTextLength: rootText.length,
    rootOffsetHeight: rootElement?.offsetHeight ?? 0,
    bodyChildCount: doc.body.children.length,
    bodyInnerTextLength: bodyText.length,
    hasLoadingIndicator: matchesLoadingShellText(rootText),
    rootTextHead: rootText.slice(0, 200),
    ...surfaceSignals,
  };
}

function describeRenderFailure(reason: WhiteScreenReason): RenderFailureDescriptor {
  switch (reason) {
    case 'loading-shell-only':
    case 'minimal-content':
      return {
        failureReason: 'placeholder_only',
        logEvent: 'final_check_placeholder_only',
        message: 'Final live-preview check failed: preview is only showing placeholder content',
      };
    case 'runtime-error-screen':
      return {
        failureReason: 'placeholder_only',
        logEvent: 'final_check_runtime_error',
        message: 'Final live-preview check failed: preview is showing a runtime application error',
      };
    case 'empty-root':
    case 'blank-body':
    case 'zero-height-root':
    default:
      return {
        failureReason: 'blank_root',
        logEvent: 'final_check_blank_root',
        message: 'Final live-preview check failed: preview root is blank after boot',
      };
  }
}

function isLikelyLoadingShell(metrics: DOMMetrics): boolean {
  if (!metrics.hasLoadingIndicator) return false;

  const lowStructure = metrics.rootChildCount <= MAX_LOADING_SHELL_ELEMENTS;
  const noInteractive = metrics.interactiveElementCount === 0;
  const noVisualSurface = metrics.visualElementCount === 0;

  return lowStructure && noInteractive && noVisualSurface;
}

function isStructurallyPlaceholderLike(metrics: DOMMetrics): boolean {
  const lowStructure = metrics.rootChildCount < MIN_MEANINGFUL_ELEMENTS;
  const lowText = metrics.rootInnerTextLength < MIN_TEXT_LENGTH;
  const noInteractive = metrics.interactiveElementCount === 0;
  const noVisualSurface = metrics.visualElementCount === 0;
  const collapsed = metrics.rootOffsetHeight < MIN_SPARSE_RENDER_HEIGHT;

  return lowStructure && lowText && noInteractive && noVisualSurface && collapsed;
}

function isRuntimeErrorScreen(metrics: DOMMetrics): boolean {
  const rootText = metrics.rootTextHead.trim();

  return (
    metrics.rootChildCount > 0 &&
    metrics.rootInnerTextLength > 0 &&
    rootText.length > 0 &&
    RUNTIME_ERROR_PATTERNS.some(pattern => pattern.test(rootText))
  );
}

function inspectIframeRenderSurface(iframe: HTMLIFrameElement | null): ImmediateRenderSurfaceResult {
  // If the iframe is not visible in the parent page (preview panel hidden, user on
  // dashboard, etc.), DOM measurements inside it are unreliable — skip the gate.
  if (iframe) {
    const rect = iframe.getBoundingClientRect();
    if (rect.height === 0 || rect.width === 0) {
      return {
        healthy: true,
        failureReason: null,
        probeReason: null,
        message: 'Preview render surface skipped — iframe not visible in layout',
        metrics: null,
      };
    }
  }

  const metrics = collectIframeMetrics(iframe);
  if (!metrics) {
    return {
      healthy: false,
      failureReason: 'blank_root',
      probeReason: 'blank-body',
      message: 'Final live-preview check failed: preview iframe is missing or empty',
      metrics: null,
    };
  }

  if (metrics.bodyChildCount === 0) {
    const failure = describeRenderFailure('blank-body');
    return {
      healthy: false,
      failureReason: failure.failureReason,
      probeReason: 'blank-body',
      message: failure.message,
      metrics,
    };
  }

  if (metrics.rootChildCount === 0) {
    const failure = describeRenderFailure('empty-root');
    return {
      healthy: false,
      failureReason: failure.failureReason,
      probeReason: 'empty-root',
      message: failure.message,
      metrics,
    };
  }

  if (isLikelyLoadingShell(metrics)) {
    const failure = describeRenderFailure('loading-shell-only');
    return {
      healthy: false,
      failureReason: failure.failureReason,
      probeReason: 'loading-shell-only',
      message: failure.message,
      metrics,
    };
  }

  if (isStructurallyPlaceholderLike(metrics)) {
    const failure = describeRenderFailure('minimal-content');
    return {
      healthy: false,
      failureReason: failure.failureReason,
      probeReason: 'minimal-content',
      message: failure.message,
      metrics,
    };
  }

  return {
    healthy: true,
    failureReason: null,
    probeReason: null,
    message: 'Preview render surface looks meaningful',
    metrics,
  };
}

export function inspectPreviewRenderSurface(buildId: string): ImmediateRenderSurfaceResult {
  return inspectIframeRenderSurface(findPreviewIframe(buildId));
}

function buildMetricsPayload(metrics: DOMMetrics | null): Record<string, unknown> {
  return {
    rootChildCount: metrics?.rootChildCount ?? null,
    rootTextLength: metrics?.rootInnerTextLength ?? null,
    rootHeight: metrics?.rootOffsetHeight ?? null,
    rootTextHead: metrics?.rootTextHead ?? '',
    semanticElementCount: metrics?.semanticElementCount ?? null,
    interactiveElementCount: metrics?.interactiveElementCount ?? null,
    visualElementCount: metrics?.visualElementCount ?? null,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function logFinalRenderFailure(buildId: string, failureReason: WhiteScreenReason | null, metrics: DOMMetrics | null): void {
  const descriptor = describeRenderFailure(failureReason ?? 'empty-root');
  if (descriptor.failureReason === 'placeholder_only') {
    previewLog('final_check_placeholder_confirmed', {
      buildId,
      reason: failureReason,
      ...buildMetricsPayload(metrics),
    });
  }
  previewLog(descriptor.logEvent, {
    buildId,
    reason: failureReason,
    ...buildMetricsPayload(metrics),
  });
}

async function waitForFinalCheckSettle(buildId: string): Promise<FinalCheckSettleResult> {
  const startedAt = Date.now();
  let attempts = 0;
  let initialSurface: ImmediateRenderSurfaceResult | null = null;

  previewLog('final_check_settle_started', {
    buildId,
    settleWindowMs: FINAL_CHECK_SETTLE_WINDOW_MS,
    pollIntervalMs: FINAL_CHECK_SETTLE_POLL_MS,
  });

  while (true) {
    const state = previewController.getState();
    const controllerRevisionId = state.activeRevisionId ?? null;
    const revisionMismatch = Boolean(
      state.status === 'ready' &&
      controllerRevisionId &&
      controllerRevisionId !== buildId,
    );
    const controllerReady = Boolean(
      state.status === 'ready' &&
      !revisionMismatch,
    );
    const surface = inspectPreviewRenderSurface(buildId);
    initialSurface ??= surface;
    attempts += 1;
    const elapsedMs = Date.now() - startedAt;

    previewLog('final_check_settle_progress', {
      buildId,
      attempt: attempts,
      elapsedMs,
      controllerStatus: state.status,
      controllerRevisionId,
      controllerReady,
      revisionMismatch,
      healthy: surface.healthy,
      failureReason: surface.failureReason,
      probeReason: surface.probeReason,
      ...buildMetricsPayload(surface.metrics),
    });

    if (surface.healthy && controllerReady) {
      previewLog('final_check_settle_satisfied', {
        buildId,
        attempt: attempts,
        elapsedMs,
        controllerStatus: state.status,
        controllerRevisionId,
        ...buildMetricsPayload(surface.metrics),
      });
      return {
        initialSurface,
        finalSurface: surface,
        controllerStatus: state.status,
        controllerRevisionId,
        controllerReady,
        revisionMismatch,
        settled: true,
        attempts,
        elapsedMs,
      };
    }

    if (elapsedMs >= FINAL_CHECK_SETTLE_WINDOW_MS) {
      previewLog('final_check_settle_timeout', {
        buildId,
        attempt: attempts,
        elapsedMs,
        controllerStatus: state.status,
        controllerRevisionId,
        controllerReady,
        revisionMismatch,
        failureReason: surface.failureReason,
        probeReason: surface.probeReason,
        ...buildMetricsPayload(surface.metrics),
      });
      return {
        initialSurface,
        finalSurface: surface,
        controllerStatus: state.status,
        controllerRevisionId,
        controllerReady,
        revisionMismatch,
        settled: false,
        attempts,
        elapsedMs,
      };
    }

    await delay(Math.min(FINAL_CHECK_SETTLE_POLL_MS, FINAL_CHECK_SETTLE_WINDOW_MS - elapsedMs));
  }
}

export function buildSkippedFinalLivePreviewCheck(
  buildId: string,
  reason: Extract<FinalLivePreviewCheckFailureReason, 'candidate_not_viable'>,
  message = 'Skipped final live-preview check because the candidate is not viable',
): FinalLivePreviewCheckResult {
  const state = previewController.getState();
  return {
    buildId,
    status: 'skipped',
    reason,
    message,
    controllerStatus: state.status,
    controllerRevisionId: state.activeRevisionId ?? null,
    immediateBlank: false,
    probeOutcome: 'inconclusive',
    probeReason: null,
  };
}

export async function runFinalLivePreviewCheck(
  buildId: string,
): Promise<FinalLivePreviewCheckResult> {
  const state = previewController.getState();
  const controllerRevisionId = state.activeRevisionId ?? null;

  if (state.status === 'failed') {
    return {
      buildId,
      status: 'failed',
      reason: 'controller_failed',
      message: `Final live-preview check failed: preview controller is already failed${
        state.error ? ` (${state.error})` : ''
      }`,
      controllerStatus: state.status,
      controllerRevisionId,
      immediateBlank: false,
      probeOutcome: 'inconclusive',
      probeReason: null,
    };
  }

  if (state.status === 'ready' && controllerRevisionId && controllerRevisionId !== buildId) {
    return {
      buildId,
      status: 'failed',
      reason: 'revision_mismatch',
      message: `Final live-preview check failed: controller is showing ${controllerRevisionId}, expected ${buildId}`,
      controllerStatus: state.status,
      controllerRevisionId,
      immediateBlank: false,
      probeOutcome: 'inconclusive',
      probeReason: null,
    };
  }

  const settle = await waitForFinalCheckSettle(buildId);
  const immediateBlank = !settle.initialSurface.healthy;

  if (settle.revisionMismatch) {
    return {
      buildId,
      status: 'failed',
      reason: 'revision_mismatch',
      message: `Final live-preview check failed: controller is showing ${settle.controllerRevisionId}, expected ${buildId}`,
      controllerStatus: settle.controllerStatus,
      controllerRevisionId: settle.controllerRevisionId,
      immediateBlank,
      probeOutcome: 'inconclusive',
      probeReason: null,
    };
  }

  if (!settle.finalSurface.healthy) {
    logFinalRenderFailure(buildId, settle.finalSurface.probeReason, settle.finalSurface.metrics);
    return {
      buildId,
      status: 'failed',
      reason: settle.finalSurface.failureReason,
      message: settle.finalSurface.message,
      controllerStatus: settle.controllerStatus,
      controllerRevisionId: settle.controllerRevisionId,
      immediateBlank,
      probeOutcome: 'unhealthy',
      probeReason: settle.finalSurface.probeReason,
    };
  }

  if (!settle.controllerReady) {
    return {
      buildId,
      status: 'failed',
      reason: 'controller_not_ready',
      message: `Final live-preview check failed: preview controller is ${settle.controllerStatus}, not ready after render settle`,
      controllerStatus: settle.controllerStatus,
      controllerRevisionId: settle.controllerRevisionId,
      immediateBlank,
      probeOutcome: 'inconclusive',
      probeReason: null,
    };
  }

  const probe = await probeIframe(buildId);
  if (probe && !probe.healthy) {
    logFinalRenderFailure(buildId, probe.reason ?? null, probe.metrics);
    const descriptor = describeRenderFailure(probe.reason ?? 'empty-root');
    return {
      buildId,
      status: 'failed',
      reason: descriptor.failureReason,
      message: descriptor.message,
      controllerStatus: settle.controllerStatus,
      controllerRevisionId: settle.controllerRevisionId,
      immediateBlank,
      probeOutcome: 'unhealthy',
      probeReason: probe.reason ?? null,
    };
  }

  return {
    buildId,
    status: 'passed',
    reason: null,
    message: probe
      ? 'Final live-preview checks passed'
      : 'Final live-preview checks passed (probe inconclusive, fallback signals healthy)',
    controllerStatus: settle.controllerStatus,
    controllerRevisionId: settle.controllerRevisionId,
    immediateBlank,
    probeOutcome: probe ? 'healthy' : 'inconclusive',
    probeReason: null,
  };
}

// ── Constants ────────────────────────────────────────────────────────────────

// Same-origin: preview is served at /preview/:buildId on the same host as the studio.
// Proxied transparently by vite.config.ts (/preview → backend port 3000).
const STUDIO_ORIGIN =
  typeof window !== 'undefined' && window.location
    ? window.location.origin
    : 'http://localhost';

/** Delay after ready_set before running the probe. Allows async renders. */
const POST_READY_DELAY_MS = 2_500;

/** Final live-preview check waits up to this long for the first meaningful render to settle. */
export const FINAL_CHECK_SETTLE_WINDOW_MS = POST_READY_DELAY_MS;

/** Poll cadence for the bounded final-check settle window. */
const FINAL_CHECK_SETTLE_POLL_MS = 250;

/** Short probation window after promotion where delayed diagnostics can still revoke it. */
export const POST_PROMOTION_WATCHDOG_WINDOW_MS = 5_000;

/**
 * After the first genuine blank-screen signal, wait this long before running
 * a confirmation check. Two consecutive unhealthy signals within the window
 * are required before revocation — prevents hair-trigger rollbacks on a single
 * weak or transient diagnostic.
 */
const WATCHDOG_CONFIRMATION_DELAY_MS = 2_000;

/** Timeout waiting for the iframe to respond to the probe. */
const PROBE_TIMEOUT_MS = 5_000;

/** Minimum number of root children before the surface is clearly non-trivial. */
const MIN_MEANINGFUL_ELEMENTS = 2;

/** Maximum child count still considered a likely loading shell. */
const MAX_LOADING_SHELL_ELEMENTS = 2;

/** Minimum text length before sparse text is considered obviously meaningful. */
const MIN_TEXT_LENGTH = 10;

/** Sparse single-node renders below this height still look like placeholders. */
const MIN_SPARSE_RENDER_HEIGHT = 24;

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

const RUNTIME_ERROR_PATTERNS = [
  /must be used within/i,
  /failed to load/i,
  /cannot read propert/i,
  /hook used outside/i,
  /is not a function/i,
  /application error/i,
  /something went wrong/i,
  /unexpected error/i,
  /unhandled runtime error/i,
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
      if (e.origin !== STUDIO_ORIGIN) return;
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
        semanticElementCount: 0,
        interactiveElementCount: 0,
        visualElementCount: 0,
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
    const iframe = findPreviewIframe(buildId);
    if (iframe?.contentWindow) {
      // If the iframe itself is not visible (preview panel hidden / on dashboard),
      // DOM measurements inside it are unreliable — treat as inconclusive.
      const iframeRect = iframe.getBoundingClientRect();
      if (iframeRect.height === 0 || iframeRect.width === 0) {
        previewLog('white_screen_probe_skipped_hidden', { buildId });
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        settle(null);
        return;
      }
      iframe.contentWindow.postMessage(
        { type: 'white-screen-check', buildId },
        STUDIO_ORIGIN,
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
 *   4. loading-shell-only— loading text with no real interactive/visual surface
 *   5. minimal-content   — sparse, low-text, collapsed content that still looks like a placeholder
 *   6. runtime-error-screen — rendered an application error fallback instead of the app
 *   7. healthy           — passed all checks
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
  if (isLikelyLoadingShell(metrics)) {
    return { healthy: false, reason: 'loading-shell-only', buildId, metrics };
  }

  // 5. Minimal content — sparse, tiny, collapsed content with no real surface
  if (isStructurallyPlaceholderLike(metrics)) {
    return { healthy: false, reason: 'minimal-content', buildId, metrics };
  }

  // 6. Runtime application error fallback
  if (isRuntimeErrorScreen(metrics)) {
    return { healthy: false, reason: 'runtime-error-screen', buildId, metrics };
  }

  // 7. Healthy
  return { healthy: true, buildId, metrics };
}

// ── Scheduled post-ready check ──────────────────────────────────────────────

/** Active timer handle — at most one check runs at a time. */
let _pendingTimer: ReturnType<typeof setTimeout> | null = null;
let _watchdogExpiryTimer: ReturnType<typeof setTimeout> | null = null;
let _postPromotionWatch: PostPromotionWatchContext | null = null;

/**
 * Tracks the buildId of the first unhealthy signal within the current watchdog
 * window. Revocation requires a second confirmation check to also be unhealthy.
 * Cleared when the watchdog is cancelled or a healthy/inconclusive confirmation fires.
 */
let _firstUnhealthyBuildId: string | null = null;

function clearWatchdogTimer(): void {
  if (_watchdogExpiryTimer !== null) {
    clearTimeout(_watchdogExpiryTimer);
    _watchdogExpiryTimer = null;
  }
}

function buildDiagnosticMessage(result: PostReadyDiagnosticResult): string {
  if (result.reason === 'probe_failed') {
    return `Post-ready diagnostic failed: ${result.probeReason ?? 'probe_failed'}`;
  }
  if (result.reason === 'probe_timeout') {
    return 'Post-ready diagnostic was inconclusive: preview did not respond';
  }
  return result.message;
}

async function handleWatchdogDiagnostic(result: PostReadyDiagnosticResult): Promise<void> {
  const watch = _postPromotionWatch;
  if (!watch) return;

  if (watch.buildId !== result.buildId) {
    previewLog('post_promotion_watch_result', {
      buildId: result.buildId,
      currentWatchBuildId: watch.buildId,
      outcome: 'ignored_stale_diagnostic',
      actionable: false,
      diagnosticStatus: result.status,
      diagnosticReason: result.reason,
      probeReason: result.probeReason,
    });
    return;
  }

  if (Date.now() > watch.expiresAt) {
    previewLog('post_promotion_watch_result', {
      buildId: result.buildId,
      previousActiveRevisionId: watch.previousActiveRevisionId,
      promotionMode: watch.promotionMode ?? 'normal',
      outcome: 'telemetry_only_after_window',
      actionable: false,
      diagnosticStatus: result.status,
      diagnosticReason: result.reason,
      probeReason: result.probeReason,
    });
    return;
  }

  if (result.status !== 'unhealthy') {
    // Inconclusive signals (controller state anomalies, probe timeouts) are logged
    // but never cause revocation — they may be stale preload artifacts.
    previewLog('watchdog_inconclusive', {
      buildId: result.buildId,
      reason: result.reason,
      controllerStatus: result.controllerStatus,
    });
    return;
  }

  // ── Two-signal confirmation gate ─────────────────────────────────────────────
  // A single unhealthy signal (blank_iframe / probe_failed) schedules a confirmation
  // check. Revocation only fires when TWO consecutive unhealthy signals are seen.
  // This prevents hair-trigger rollbacks from transient renders or stale diagnostics.
  if (_firstUnhealthyBuildId !== result.buildId) {
    _firstUnhealthyBuildId = result.buildId;
    previewLog('watchdog_unhealthy_pending', {
      buildId: result.buildId,
      reason: result.reason,
      probeReason: result.probeReason,
      confirmationDelayMs: WATCHDOG_CONFIRMATION_DELAY_MS,
    });
    // Schedule confirmation check. If it runs after the window expires,
    // handleWatchdogDiagnostic will see Date.now() > expiresAt → telemetry only.
    _pendingTimer = setTimeout(async () => {
      _pendingTimer = null;
      const confirmation = await runPostReadyDiagnostic(result.buildId);
      previewLog('watchdog_confirmation_result', {
        buildId: result.buildId,
        status: confirmation.status,
        reason: confirmation.reason,
        probeOutcome: confirmation.probeOutcome,
      });
      if (confirmation.status === 'unhealthy') {
        previewLog('watchdog_unhealthy_confirmed', {
          buildId: result.buildId,
          firstReason: result.reason,
          confirmationReason: confirmation.reason,
        });
          previewLog('watchdog_late_regression_confirmed', {
            buildId: result.buildId,
            firstReason: result.reason,
            confirmationReason: confirmation.reason,
            probeReason: confirmation.probeReason,
          });
        await handleWatchdogDiagnostic(confirmation);
      } else {
        previewLog('revoke_blocked_insufficient_evidence', {
          buildId: result.buildId,
          firstReason: result.reason,
          confirmationStatus: confirmation.status,
          confirmationReason: confirmation.reason,
        });
        _firstUnhealthyBuildId = null;
      }
    }, WATCHDOG_CONFIRMATION_DELAY_MS);
    return;
  }

  // ── Second consecutive unhealthy signal confirmed — proceed with revocation ──
  _firstUnhealthyBuildId = null;
  clearWatchdogTimer();
  _postPromotionWatch = null;
  previewLog('post_promotion_watch_result', {
    buildId: result.buildId,
    previousActiveRevisionId: watch.previousActiveRevisionId,
    promotionMode: watch.promotionMode ?? 'normal',
    outcome: 'promotion_revoked',
    actionable: true,
    diagnosticStatus: result.status,
    diagnosticReason: result.reason,
    probeReason: result.probeReason,
  });
  await watch.onUnhealthy(result);
}

export function startPostPromotionWatch(
  buildId: string,
  options: PostPromotionWatchOptions,
): void {
  cancelPendingCheck();
  cancelPostPromotionWatch();

  const startedAt = Date.now();
  _postPromotionWatch = {
    buildId,
    startedAt,
    expiresAt: startedAt + POST_PROMOTION_WATCHDOG_WINDOW_MS,
    ...options,
  };

  previewLog('post_promotion_watch_started', {
    buildId,
    previousActiveRevisionId: options.previousActiveRevisionId,
    promotionMode: options.promotionMode ?? 'normal',
    windowMs: POST_PROMOTION_WATCHDOG_WINDOW_MS,
    diagnosticDelayMs: POST_READY_DELAY_MS,
  });

  _watchdogExpiryTimer = setTimeout(() => {
    const watch = _postPromotionWatch;
    if (!watch || watch.buildId !== buildId) return;
    previewLog('post_promotion_watch_result', {
      buildId,
      previousActiveRevisionId: watch.previousActiveRevisionId,
      promotionMode: watch.promotionMode ?? 'normal',
      outcome: 'stable_window_elapsed',
      actionable: false,
      windowMs: POST_PROMOTION_WATCHDOG_WINDOW_MS,
    });
    _postPromotionWatch = null;
    clearWatchdogTimer();
  }, POST_PROMOTION_WATCHDOG_WINDOW_MS);

  schedulePostReadyCheck(buildId);
}

export function cancelPostPromotionWatch(): void {
  _postPromotionWatch = null;
  _firstUnhealthyBuildId = null;
  clearWatchdogTimer();
}

export async function runPostReadyDiagnostic(
  buildId: string,
): Promise<PostReadyDiagnosticResult> {
  const state = previewController.getState();
  const controllerRevisionId = state.activeRevisionId ?? null;

  if (controllerRevisionId && controllerRevisionId !== buildId) {
    return {
      buildId,
      status: 'inconclusive',
      reason: 'revision_mismatch',
      message: `Post-ready diagnostic ignored: controller is showing ${controllerRevisionId}, expected ${buildId}`,
      controllerStatus: state.status,
      controllerRevisionId,
      immediateBlank: false,
      probeOutcome: 'inconclusive',
      probeReason: null,
      metrics: null,
    };
  }

  if (state.status === 'failed') {
    // Controller-failed is inconclusive, not unhealthy: the failure may be from a
    // stale preload timeout that fired after generation was already promoted. A
    // controller state anomaly alone is not evidence of a white screen.
    return {
      buildId,
      status: 'inconclusive',
      reason: 'controller_failed',
      message: `Post-ready diagnostic inconclusive: preview controller is failed (may be stale preload)${
        state.error ? ` (${state.error})` : ''
      }`,
      controllerStatus: state.status,
      controllerRevisionId,
      immediateBlank: false,
      probeOutcome: 'inconclusive',
      probeReason: null,
      metrics: null,
    };
  }

  if (state.status !== 'ready') {
    // Transient non-ready state (compiling, generating) — not white-screen evidence.
    return {
      buildId,
      status: 'inconclusive',
      reason: 'controller_not_ready',
      message: `Post-ready diagnostic inconclusive: preview controller is ${state.status} (transient state)`,
      controllerStatus: state.status,
      controllerRevisionId,
      immediateBlank: false,
      probeOutcome: 'inconclusive',
      probeReason: null,
      metrics: null,
    };
  }

  const immediateSurface = inspectPreviewRenderSurface(buildId);
  const immediateBlank = !immediateSurface.healthy;
  if (!immediateSurface.healthy) {
    return {
      buildId,
      status: 'unhealthy',
      reason: immediateSurface.failureReason,
      message: immediateSurface.message.replace('Final live-preview check', 'Post-ready diagnostic'),
      controllerStatus: state.status,
      controllerRevisionId,
      immediateBlank,
      probeOutcome: 'unhealthy',
      probeReason: immediateSurface.probeReason,
      metrics: immediateSurface.metrics,
    };
  }

  const probe = await probeIframe(buildId);
  if (!probe) {
    return {
      buildId,
      status: 'inconclusive',
      reason: 'probe_timeout',
      message: 'Post-ready diagnostic was inconclusive: preview did not respond',
      controllerStatus: state.status,
      controllerRevisionId,
      immediateBlank,
      probeOutcome: 'inconclusive',
      probeReason: null,
      metrics: null,
    };
  }

  if (!probe.healthy) {
    const descriptor = describeRenderFailure(probe.reason ?? 'empty-root');
    return {
      buildId,
      status: 'unhealthy',
      reason: descriptor.failureReason,
      message: descriptor.message.replace('Final live-preview check', 'Post-ready diagnostic'),
      controllerStatus: state.status,
      controllerRevisionId,
      immediateBlank,
      probeOutcome: 'unhealthy',
      probeReason: probe.reason ?? null,
      metrics: probe.metrics,
    };
  }

  return {
    buildId,
    status: 'healthy',
    reason: null,
    message: 'Post-ready diagnostic passed',
    controllerStatus: state.status,
    controllerRevisionId,
    immediateBlank,
    probeOutcome: 'healthy',
    probeReason: null,
    metrics: probe.metrics,
  };
}

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
    watchdogBuildId: _postPromotionWatch?.buildId ?? null,
  });

  _pendingTimer = setTimeout(async () => {
    _pendingTimer = null;
    previewLog('white_screen_check_start', { buildId });

    const result = await runPostReadyDiagnostic(buildId);

    previewLog('post_ready_diagnostic_result', {
      buildId,
      status: result.status,
      reason: result.reason,
      controllerStatus: result.controllerStatus,
      controllerRevisionId: result.controllerRevisionId,
      immediateBlank: result.immediateBlank,
      probeOutcome: result.probeOutcome,
      probeReason: result.probeReason,
    });

    if (result.status === 'healthy') {
      previewLog('white_screen_check_passed', {
        buildId,
        rootChildCount: result.metrics?.rootChildCount ?? null,
        rootTextLength: result.metrics?.rootInnerTextLength ?? null,
        rootHeight: result.metrics?.rootOffsetHeight ?? null,
      });
      return;
    }

    if (result.status === 'inconclusive') {
      previewLog('white_screen_check_inconclusive', {
        buildId,
        reason: result.reason,
      });
      await handleWatchdogDiagnostic(result);
      return;
    }

    previewLog('white_screen_detected', {
      buildId,
      reason: result.probeReason ?? result.reason,
      diagnosticReason: result.reason,
      rootChildCount: result.metrics?.rootChildCount ?? null,
      rootTextLength: result.metrics?.rootInnerTextLength ?? null,
      rootHeight: result.metrics?.rootOffsetHeight ?? null,
      rootTextHead: result.metrics?.rootTextHead ?? '',
    });
    previewController.setDiagnosticError(
      'white-screen-detected',
      buildDiagnosticMessage(result),
      buildId,
    );
    await handleWatchdogDiagnostic(result);
  }, POST_READY_DELAY_MS);
}

/**
 * Cancel any pending white-screen check (initial or confirmation). Called
 * when a new compile starts (the previous ready state is no longer relevant).
 */
export function cancelPendingCheck(): void {
  if (_pendingTimer !== null) {
    clearTimeout(_pendingTimer);
    _pendingTimer = null;
  }
  // Also clear the first-signal tracker — if we cancel mid-confirmation, start fresh
  _firstUnhealthyBuildId = null;
}
