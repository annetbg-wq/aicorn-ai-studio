/**
 * previewLifecycleResolver — Pure function that resolves the canonical preview
 * UI state from all contributing signal sources.
 *
 * Today the preview render path depends on 7+ independent booleans/strings:
 *   PreviewController.status, previewLifecycle, previewBlockedReason,
 *   runtimeError, showLoadingOverlay, iframeLoaded, previewServerDown,
 *   isFixing, fixFailed, isGenerating
 *
 * This module collapses them into ONE typed object: PreviewUIState.
 * Each overlay in SandpackPreview reads `.overlay` to decide what (if anything)
 * to show. Each overlay reads its sub-struct for content/context.
 *
 * DESIGN RULES:
 *   - Pure function, no side effects, no subscriptions.
 *   - Deterministic: same inputs always produce same output.
 *   - Priority-ordered: one overlay wins. No ambiguity.
 *   - Backward-compatible: maps FROM existing signals, doesn't replace them.
 *   - PreviewController remains the authoritative source for status and diagnostics.
 */

import type { PreviewMaterializeStage } from '../shared/projectModel';

// ── Input signals ───────────────────────────────────────────────────────────

export interface PreviewUIInputs {
  /** PreviewController.status — the 5-value authoritative status. */
  controllerStatus: 'idle' | 'generating' | 'compiling' | 'ready' | 'failed';
  /** PreviewController.error — error string on failure. */
  controllerError: string | null;
  /** PreviewController.diagnostics — fine-grained materialize stage. */
  controllerDiagnostics: {
    stage: PreviewMaterializeStage;
    error: { stage: PreviewMaterializeStage; message: string } | null;
  } | null;
  /** PreviewController.activeRevisionId */
  activeRevisionId: string | null;
  /** PreviewLifecycleStage from useStudio — 9-value richer lifecycle. */
  lifecycleStage: string;
  /** Human-readable reason when lifecycleStage === 'blocked'. */
  blockedReason: string | null;
  /** True while AI is generating — suppresses overlays. */
  isGenerating: boolean;
  /** True when iframe has fired its onLoad event. */
  iframeLoaded: boolean;
  /** True when compiling has exceeded 20s threshold. */
  loadingTimeout: boolean;
  /** True when preview server is unreachable. */
  serverDown: boolean;
  /** True when auto-fix is in progress. */
  isFixing: boolean;
  /** True when auto-fix has failed. */
  fixFailed: boolean;
}

// ── Output: canonical UI state ──────────────────────────────────────────────

/**
 * Which overlay (if any) should be visible. Exactly one or 'none'.
 * Priority order (highest first):
 *   1. blocked      — quality check prevented preview
 *   2. failed       — hard failure (compile/runtime error)
 *   3. degraded     — new revision failed, last-good still showing
 *   4. loading-timeout — compiling >20s without result
 *   5. compiling    — normal compile spinner
 *   6. none         — preview is healthy or idle
 */
export type PreviewOverlay =
  | 'none'
  | 'compiling'
  | 'loading-timeout'
  | 'failed'
  | 'degraded'
  | 'blocked';

export interface PreviewUIState {
  /** Which overlay should be visible. */
  overlay: PreviewOverlay;
  /** Whether the Vite iframe should be display:block (vs srcdoc). */
  showViteIframe: boolean;

  // ── Overlay-specific payloads ─────────────────────────────────

  /** Present when overlay is 'failed' or 'degraded'. */
  error: {
    message: string;
    /** Truncated to 200 chars for display. */
    displayMessage: string;
    /** Auto-fix state. */
    isFixing: boolean;
    fixFailed: boolean;
  } | null;

  /** Present when overlay is 'blocked'. */
  blocked: {
    reason: string;
  } | null;

  /** Present when overlay is 'failed' or 'degraded' and diagnostics exist. */
  diagnostics: {
    lastStage: PreviewMaterializeStage;
    failedAtStage: PreviewMaterializeStage | null;
  } | null;

  /** Active build/revision ID if available. */
  revisionId: string | null;

  /** The raw controller status — preserved for any legacy reads. */
  controllerStatus: 'idle' | 'generating' | 'compiling' | 'ready' | 'failed';

  /** The raw lifecycle stage — preserved for any legacy reads. */
  lifecycleStage: string;
}

// ── Resolver ────────────────────────────────────────────────────────────────

/**
 * Resolve the canonical preview UI state from all signal sources.
 *
 * This is a PURE FUNCTION. Call it in a useMemo or directly in render.
 * Priority rules are evaluated in strict order — first match wins.
 */
export function resolvePreviewUI(inputs: PreviewUIInputs): PreviewUIState {
  const {
    controllerStatus,
    controllerError,
    controllerDiagnostics,
    activeRevisionId,
    lifecycleStage,
    blockedReason,
    isGenerating,
    iframeLoaded,
    loadingTimeout,
    serverDown,
    isFixing,
    fixFailed,
  } = inputs;

  // ── Common payloads ────────────────────────────────────────────

  const errorPayload = controllerError ? {
    message: controllerError,
    displayMessage: controllerError.length > 200
      ? controllerError.slice(0, 200) + '…'
      : controllerError,
    isFixing,
    fixFailed,
  } : null;

  const diagnosticsPayload = controllerDiagnostics?.error ? {
    lastStage: controllerDiagnostics.stage,
    failedAtStage: controllerDiagnostics.error.stage !== controllerDiagnostics.stage
      ? controllerDiagnostics.error.stage
      : null,
  } : null;

  const base = {
    revisionId: activeRevisionId,
    controllerStatus,
    lifecycleStage,
    showViteIframe: true,
  };

  // ── Priority 0: Generating — suppress all overlays ─────────────
  // While AI is actively streaming, no overlay should block the view.
  // The iframe shows whatever it last had; the generation progress
  // is shown in the left panel.
  if (isGenerating) {
    return {
      ...base,
      overlay: 'none',
      error: null,
      blocked: null,
      diagnostics: null,
    };
  }

  // ── Priority 1: Blocked ────────────────────────────────────────
  if (lifecycleStage === 'blocked') {
    return {
      ...base,
      overlay: 'blocked',
      error: null,
      blocked: { reason: blockedReason ?? 'Preview blocked by quality check' },
      diagnostics: null,
    };
  }

  // ── Priority 2: Failed (hard) ──────────────────────────────────
  if (controllerStatus === 'failed' && lifecycleStage !== 'degraded') {
    return {
      ...base,
      overlay: 'failed',
      error: errorPayload,
      blocked: null,
      diagnostics: diagnosticsPayload,
    };
  }

  // ── Priority 3: Degraded ───────────────────────────────────────
  if (controllerStatus === 'failed' && lifecycleStage === 'degraded') {
    return {
      ...base,
      overlay: 'degraded',
      error: errorPayload,
      blocked: null,
      diagnostics: diagnosticsPayload,
    };
  }

  // ── Priority 4: Loading timeout ────────────────────────────────
  if (controllerStatus === 'compiling' && loadingTimeout) {
    return {
      ...base,
      overlay: 'loading-timeout',
      error: null,
      blocked: null,
      diagnostics: null,
    };
  }

  // ── Priority 5: Normal compiling spinner ───────────────────────
  if (controllerStatus === 'compiling' || !iframeLoaded) {
    return {
      ...base,
      overlay: 'compiling',
      error: null,
      blocked: null,
      diagnostics: null,
    };
  }

  // ── Default: no overlay ────────────────────────────────────────
  return {
    ...base,
    overlay: 'none',
    error: null,
    blocked: null,
    diagnostics: null,
  };
}
