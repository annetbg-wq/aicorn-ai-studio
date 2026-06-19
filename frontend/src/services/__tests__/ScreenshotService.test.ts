// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  noScreenshotStatus,
  resolveScreenshotStatus,
  buildVisualGateDiagnostics,
  type ScreenshotStatus,
} from '../ScreenshotService';

// ── noScreenshotStatus ────────────────────────────────────────────────────────

describe('noScreenshotStatus', () => {
  it('produces a not-attempted, failed status with the given reason', () => {
    const status = noScreenshotStatus('test reason');
    expect(status.attempted).toBe(false);
    expect(status.succeeded).toBe(false);
    expect(status.source).toBe('none');
    expect(status.unavailableReason).toBe('test reason');
  });

  it('does not set dataUrl or path', () => {
    const status = noScreenshotStatus('no capture');
    expect(status.dataUrl).toBeUndefined();
    expect(status.path).toBeUndefined();
  });
});

// ── resolveScreenshotStatus — success ─────────────────────────────────────────

describe('resolveScreenshotStatus — success', () => {
  it('returns succeeded=true when dataUrl is present and no error', () => {
    const status = resolveScreenshotStatus({
      dataUrl: 'data:image/png;base64,abc123',
      source: 'html2canvas',
    });
    expect(status.succeeded).toBe(true);
    expect(status.attempted).toBe(true);
    expect(status.source).toBe('html2canvas');
    expect(status.dataUrl).toBe('data:image/png;base64,abc123');
    expect(status.unavailableReason).toBeUndefined();
  });

  it('defaults source to html2canvas when not specified', () => {
    const status = resolveScreenshotStatus({ dataUrl: 'data:image/png;base64,abc123' });
    expect(status.source).toBe('html2canvas');
  });

  it('accepts playwright as source', () => {
    const status = resolveScreenshotStatus({
      dataUrl: 'data:image/png;base64,abc123',
      source: 'playwright',
    });
    expect(status.source).toBe('playwright');
    expect(status.succeeded).toBe(true);
  });
});

// ── resolveScreenshotStatus — failure ─────────────────────────────────────────

describe('resolveScreenshotStatus — failure', () => {
  it('returns succeeded=false when error is present', () => {
    const status = resolveScreenshotStatus({
      error: 'screenshot_timeout: html2canvas did not complete in time',
      source: 'html2canvas',
    });
    expect(status.succeeded).toBe(false);
    expect(status.attempted).toBe(true);
    expect(status.unavailableReason).toBe('screenshot_timeout: html2canvas did not complete in time');
    expect(status.dataUrl).toBeUndefined();
  });

  it('returns succeeded=false when dataUrl is null', () => {
    const status = resolveScreenshotStatus({ dataUrl: null });
    expect(status.succeeded).toBe(false);
    expect(status.attempted).toBe(true);
    expect(status.unavailableReason).toMatch(/empty_dataUrl/);
  });

  it('returns succeeded=false when dataUrl is empty string', () => {
    const status = resolveScreenshotStatus({ dataUrl: '' });
    expect(status.succeeded).toBe(false);
    expect(status.unavailableReason).toMatch(/empty_dataUrl/);
  });

  it('returns succeeded=false when dataUrl is whitespace only', () => {
    const status = resolveScreenshotStatus({ dataUrl: '   ' });
    expect(status.succeeded).toBe(false);
    expect(status.unavailableReason).toMatch(/empty_dataUrl/);
  });

  it('error field takes priority over missing dataUrl', () => {
    const status = resolveScreenshotStatus({
      dataUrl: '',
      error: 'empty_canvas: 0x0 dimensions, screenshot not captured',
    });
    expect(status.succeeded).toBe(false);
    expect(status.unavailableReason).toBe('empty_canvas: 0x0 dimensions, screenshot not captured');
  });

  it('empty_canvas reason signals the backend empty-canvas block', () => {
    const status = resolveScreenshotStatus({
      error: 'empty_canvas: 0x0 dimensions, screenshot not captured',
    });
    expect(status.succeeded).toBe(false);
    expect(status.unavailableReason).toMatch(/^empty_canvas/);
  });

  it('screenshot_timeout reason signals the backend timeout block', () => {
    const status = resolveScreenshotStatus({
      error: 'screenshot_timeout: html2canvas did not complete in time',
    });
    expect(status.succeeded).toBe(false);
    expect(status.unavailableReason).toMatch(/^screenshot_timeout/);
  });
});

// ── buildVisualGateDiagnostics — screenshot available ─────────────────────────

describe('buildVisualGateDiagnostics — screenshot succeeded', () => {
  const successStatus: ScreenshotStatus = {
    attempted: true,
    succeeded: true,
    source: 'html2canvas',
    dataUrl: 'data:image/png;base64,abc123',
  };

  it('sets critic_vision_blind=false when screenshot succeeded', () => {
    const diag = buildVisualGateDiagnostics(successStatus);
    expect(diag.critic_vision_blind).toBe(false);
  });

  it('sets visualGateStatus=partial when screenshot succeeded but no vision model check', () => {
    const diag = buildVisualGateDiagnostics(successStatus);
    expect(diag.visualGateStatus).toBe('partial');
  });

  it('sets visualGateStatus=pass when screenshot succeeded AND visualCheckPassed=true', () => {
    const diag = buildVisualGateDiagnostics(successStatus, { visualCheckPassed: true });
    expect(diag.visualGateStatus).toBe('pass');
  });

  it('sets visualGateStatus=fail when screenshot succeeded AND visualCheckPassed=false', () => {
    const diag = buildVisualGateDiagnostics(successStatus, { visualCheckPassed: false });
    expect(diag.visualGateStatus).toBe('fail');
  });

  it('codeOnlyVisualPassBlocked=false when screenshot succeeded', () => {
    const diag = buildVisualGateDiagnostics(successStatus);
    expect(diag.codeOnlyVisualPassBlocked).toBe(false);
  });

  it('screenshotDataPresent=true when dataUrl is populated', () => {
    const diag = buildVisualGateDiagnostics(successStatus);
    expect(diag.screenshotDataPresent).toBe(true);
  });

  it('visionUnavailableReason is undefined when screenshot succeeded', () => {
    const diag = buildVisualGateDiagnostics(successStatus);
    expect(diag.visionUnavailableReason).toBeUndefined();
  });

  it('emptyScreenshotBlocked=false when screenshot succeeded', () => {
    const diag = buildVisualGateDiagnostics(successStatus);
    expect(diag.emptyScreenshotBlocked).toBe(false);
  });

  it('screenshotSucceeded=true and source are threaded through', () => {
    const diag = buildVisualGateDiagnostics(successStatus);
    expect(diag.screenshotSucceeded).toBe(true);
    expect(diag.screenshotSource).toBe('html2canvas');
    expect(diag.screenshotAttempted).toBe(true);
  });
});

// ── buildVisualGateDiagnostics — screenshot failed ────────────────────────────

describe('buildVisualGateDiagnostics — screenshot failed', () => {
  const failedStatus: ScreenshotStatus = {
    attempted: true,
    succeeded: false,
    source: 'html2canvas',
    unavailableReason: 'html2canvas threw an error',
  };

  it('sets critic_vision_blind=true when screenshot failed', () => {
    const diag = buildVisualGateDiagnostics(failedStatus);
    expect(diag.critic_vision_blind).toBe(true);
  });

  it('visualGateStatus is skipped (not pass) when screenshot failed', () => {
    const diag = buildVisualGateDiagnostics(failedStatus);
    expect(diag.visualGateStatus).toBe('skipped');
    expect(diag.visualGateStatus).not.toBe('pass');
  });

  it('code-only critic cannot mark visual pass when screenshot failed', () => {
    const diag = buildVisualGateDiagnostics(failedStatus);
    expect(diag.codeOnlyVisualPassBlocked).toBe(true);
  });

  it('visionUnavailableReason is set from screenshot unavailableReason', () => {
    const diag = buildVisualGateDiagnostics(failedStatus);
    expect(diag.visionUnavailableReason).toBe('html2canvas threw an error');
  });

  it('screenshotUnavailableReasonPresent=true when reason exists', () => {
    const diag = buildVisualGateDiagnostics(failedStatus);
    expect(diag.screenshotUnavailableReasonPresent).toBe(true);
  });

  it('emptyScreenshotBlocked=false for generic (non-empty-canvas) failures', () => {
    const diag = buildVisualGateDiagnostics(failedStatus);
    expect(diag.emptyScreenshotBlocked).toBe(false);
  });

  it('visualCheckPassed hint is ignored when screenshot failed — gate stays skipped', () => {
    // Even if caller erroneously passes visualCheckPassed=true, gate cannot be pass
    const diag = buildVisualGateDiagnostics(failedStatus, { visualCheckPassed: true });
    expect(diag.visualGateStatus).toBe('skipped');
    expect(diag.visualGateStatus).not.toBe('pass');
  });
});

// ── buildVisualGateDiagnostics — empty canvas blocked ─────────────────────────

describe('buildVisualGateDiagnostics — empty canvas', () => {
  const emptyCanvasStatus: ScreenshotStatus = {
    attempted: true,
    succeeded: false,
    source: 'html2canvas',
    unavailableReason: 'empty_canvas: 0x0 dimensions, screenshot not captured',
  };

  it('emptyScreenshotBlocked=true for empty_canvas reason', () => {
    const diag = buildVisualGateDiagnostics(emptyCanvasStatus);
    expect(diag.emptyScreenshotBlocked).toBe(true);
  });

  it('visualGateStatus is skipped (not pass) for empty canvas', () => {
    const diag = buildVisualGateDiagnostics(emptyCanvasStatus);
    expect(diag.visualGateStatus).toBe('skipped');
  });

  it('critic_vision_blind=true for empty canvas', () => {
    const diag = buildVisualGateDiagnostics(emptyCanvasStatus);
    expect(diag.critic_vision_blind).toBe(true);
  });

  it('emptyScreenshotBlocked=true for empty_dataUrl reason', () => {
    const emptyDataUrlStatus: ScreenshotStatus = {
      attempted: true,
      succeeded: false,
      source: 'html2canvas',
      unavailableReason: 'empty_dataUrl: screenshot data was empty',
    };
    const diag = buildVisualGateDiagnostics(emptyDataUrlStatus);
    expect(diag.emptyScreenshotBlocked).toBe(true);
  });
});

// ── buildVisualGateDiagnostics — no screenshot attempted ──────────────────────

describe('buildVisualGateDiagnostics — no screenshot attempted', () => {
  const noStatus: ScreenshotStatus = {
    attempted: false,
    succeeded: false,
    source: 'none',
    unavailableReason: 'screenshot_not_provided: no screenshot at Pass 2 time',
  };

  it('visualGateStatus=skipped when no screenshot attempted', () => {
    const diag = buildVisualGateDiagnostics(noStatus);
    expect(diag.visualGateStatus).toBe('skipped');
  });

  it('critic_vision_blind=true when no screenshot attempted', () => {
    const diag = buildVisualGateDiagnostics(noStatus);
    expect(diag.critic_vision_blind).toBe(true);
  });

  it('visionUnavailableReason is set from unavailableReason when not attempted', () => {
    const diag = buildVisualGateDiagnostics(noStatus);
    expect(diag.visionUnavailableReason).toBe('screenshot_not_provided: no screenshot at Pass 2 time');
  });

  it('screenshotAttempted=false, screenshotSucceeded=false', () => {
    const diag = buildVisualGateDiagnostics(noStatus);
    expect(diag.screenshotAttempted).toBe(false);
    expect(diag.screenshotSucceeded).toBe(false);
  });

  it('Pass 2 still runs code-only analysis when screenshot unavailable — visualGateStatus=skipped does not block code analysis', () => {
    const diag = buildVisualGateDiagnostics(noStatus);
    // critic_vision_blind=true means visual evidence is missing
    expect(diag.critic_vision_blind).toBe(true);
    // visualGateStatus=skipped means the visual gate is not active (not fail, not blocked)
    expect(diag.visualGateStatus).toBe('skipped');
    // codeOnlyVisualPassBlocked prevents claiming visual acceptance — not code completeness
    expect(diag.codeOnlyVisualPassBlocked).toBe(true);
  });

  it('visionUnavailableReason falls back to generic string when no reason provided', () => {
    const statusWithNoReason: ScreenshotStatus = {
      attempted: false,
      succeeded: false,
      source: 'none',
    };
    const diag = buildVisualGateDiagnostics(statusWithNoReason);
    expect(diag.visionUnavailableReason).toBe('screenshot_not_available');
  });
});

// ── vision gate — visual pass requires screenshot succeeded ───────────────────

describe('vision gate — visualGateStatus=pass requires screenshotSucceeded=true', () => {
  it('visualGateStatus cannot be pass when screenshot failed (even with visualCheckPassed=true hint)', () => {
    const failedStatuses: ScreenshotStatus[] = [
      { attempted: false, succeeded: false, source: 'none', unavailableReason: 'not attempted' },
      { attempted: true, succeeded: false, source: 'html2canvas', unavailableReason: 'failed' },
      { attempted: true, succeeded: false, source: 'html2canvas', unavailableReason: 'empty_canvas: 0x0' },
    ];
    for (const status of failedStatuses) {
      const diag = buildVisualGateDiagnostics(status, { visualCheckPassed: true });
      expect(diag.visualGateStatus).not.toBe('pass');
    }
  });

  it('visualGateStatus=pass is possible only when succeeded=true and visualCheckPassed=true', () => {
    const status: ScreenshotStatus = {
      attempted: true,
      succeeded: true,
      source: 'html2canvas',
      dataUrl: 'data:image/png;base64,validdata',
    };
    const diag = buildVisualGateDiagnostics(status, { visualCheckPassed: true });
    expect(diag.visualGateStatus).toBe('pass');
    expect(diag.critic_vision_blind).toBe(false);
    expect(diag.codeOnlyVisualPassBlocked).toBe(false);
  });

  it('screenshotPathPresent=false when path is not set', () => {
    const status: ScreenshotStatus = {
      attempted: true,
      succeeded: true,
      source: 'playwright',
      dataUrl: 'data:image/png;base64,valid',
    };
    const diag = buildVisualGateDiagnostics(status);
    expect(diag.screenshotPathPresent).toBe(false);
  });

  it('screenshotPathPresent=true when path is set', () => {
    const status: ScreenshotStatus = {
      attempted: true,
      succeeded: true,
      source: 'playwright',
      path: '/tmp/screenshot-abc.png',
      dataUrl: 'data:image/png;base64,valid',
    };
    const diag = buildVisualGateDiagnostics(status);
    expect(diag.screenshotPathPresent).toBe(true);
  });
});
