/**
 * ScreenshotService.ts — Screenshot status model and vision gate diagnostics (WI-8).
 *
 * Centralises the ScreenshotStatus type and vision gate semantics so that:
 *   - Pass 2 critic can record whether visual evidence exists
 *   - The system cannot claim a visual pass without a successful screenshot
 *   - All screenshot telemetry flows from one place
 *
 * Hard rule enforced here:
 *   visualGateStatus cannot be 'pass' when critic_vision_blind is true.
 *   code-only critic cannot mark visual acceptance as pass.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ScreenshotSource = 'html2canvas' | 'playwright' | 'manual' | 'none';

/**
 * Structured result of a screenshot capture attempt.
 * `succeeded` is the single authoritative flag for downstream logic.
 * An empty/0x0 canvas is NOT a success — it must have `succeeded: false`
 * and an `unavailableReason` starting with 'empty_canvas'.
 */
export interface ScreenshotStatus {
  attempted: boolean;
  succeeded: boolean;
  source: ScreenshotSource;
  /** Server-side path to the screenshot, if saved to disk. */
  path?: string;
  /** Base64 data URL of the captured image. Only set when succeeded=true. */
  dataUrl?: string;
  /** Explicit reason why the screenshot was not captured or failed. Required when succeeded=false. */
  unavailableReason?: string;
}

/** Status of the visual quality gate, separate from the completeness (code) gate. */
export type VisualGateStatus = 'pass' | 'partial' | 'skipped' | 'fail';

/**
 * Vision gate diagnostic payload.
 * Tells callers whether visual evidence exists and whether the critic may claim a visual pass.
 */
export interface VisualGateDiagnostics {
  /** Aggregate visual gate verdict. Cannot be 'pass' when critic_vision_blind is true. */
  visualGateStatus: VisualGateStatus;
  /** True when no screenshot is available — critic is operating on code only. */
  critic_vision_blind: boolean;
  /** Explicit reason for the critic being vision-blind. Required when critic_vision_blind=true. */
  visionUnavailableReason?: string;
  screenshotAttempted: boolean;
  screenshotSucceeded: boolean;
  screenshotSource: ScreenshotSource;
  /** True when the screenshot dataUrl field is populated. */
  screenshotDataPresent: boolean;
  /** True when the screenshot path field is populated (server-side path). */
  screenshotPathPresent: boolean;
  /** True when an unavailableReason string is present. */
  screenshotUnavailableReasonPresent: boolean;
  /** True when a 0x0 or empty canvas was detected and blocked from being reported as success. */
  emptyScreenshotBlocked: boolean;
  /** True when the code-only critic is blocked from marking visual acceptance as pass. */
  codeOnlyVisualPassBlocked: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a "no screenshot taken" status with an explicit unavailable reason. */
export function noScreenshotStatus(unavailableReason: string): ScreenshotStatus {
  return {
    attempted: false,
    succeeded: false,
    source: 'none',
    unavailableReason,
  };
}

/**
 * Convert raw screenshot message data (e.g. from an iframe postMessage) to a typed ScreenshotStatus.
 *
 * Rules:
 *   - A non-empty `error` field always produces succeeded=false.
 *   - A missing or empty `dataUrl` also produces succeeded=false (empty_dataUrl reason).
 *   - `source` defaults to 'html2canvas' when not specified (matching the preview runtime).
 */
export function resolveScreenshotStatus(raw: {
  dataUrl?: string | null;
  error?: string | null;
  source?: ScreenshotSource;
}): ScreenshotStatus {
  const source: ScreenshotSource = raw.source ?? 'html2canvas';

  if (raw.error) {
    return {
      attempted: true,
      succeeded: false,
      source,
      unavailableReason: raw.error,
    };
  }

  if (!raw.dataUrl || raw.dataUrl.trim() === '') {
    return {
      attempted: true,
      succeeded: false,
      source,
      unavailableReason: 'empty_dataUrl: screenshot data was empty',
    };
  }

  return {
    attempted: true,
    succeeded: true,
    source,
    dataUrl: raw.dataUrl,
  };
}

/**
 * Build vision gate diagnostics from a ScreenshotStatus.
 *
 * @param opts.visualCheckPassed
 *   true  — a vision model evaluated the screenshot and found it acceptable → 'pass'
 *   false — a vision model evaluated and found issues → 'fail'
 *   undefined — screenshot captured but no vision model check done → 'partial'
 *   (ignored entirely when screenshot failed → always 'skipped')
 */
export function buildVisualGateDiagnostics(
  status: ScreenshotStatus,
  opts: { visualCheckPassed?: boolean } = {},
): VisualGateDiagnostics {
  const visionBlind = !status.succeeded;

  const emptyBlocked =
    status.attempted &&
    !status.succeeded &&
    Boolean(
      status.unavailableReason?.startsWith('empty_canvas') ||
        status.unavailableReason?.startsWith('empty_dataUrl'),
    );

  // Hard rule: visualGateStatus cannot be 'pass' when critic is vision-blind.
  let visualGateStatus: VisualGateStatus;
  if (!status.attempted || !status.succeeded) {
    visualGateStatus = 'skipped';
  } else if (opts.visualCheckPassed === true) {
    visualGateStatus = 'pass';
  } else if (opts.visualCheckPassed === false) {
    visualGateStatus = 'fail';
  } else {
    // Screenshot captured but no vision model check performed yet.
    visualGateStatus = 'partial';
  }

  return {
    visualGateStatus,
    critic_vision_blind: visionBlind,
    visionUnavailableReason: visionBlind
      ? (status.unavailableReason ?? 'screenshot_not_available')
      : undefined,
    screenshotAttempted: status.attempted,
    screenshotSucceeded: status.succeeded,
    screenshotSource: status.source,
    screenshotDataPresent: Boolean(status.dataUrl),
    screenshotPathPresent: Boolean(status.path),
    screenshotUnavailableReasonPresent: Boolean(status.unavailableReason),
    emptyScreenshotBlocked: emptyBlocked,
    codeOnlyVisualPassBlocked: visionBlind,
  };
}
