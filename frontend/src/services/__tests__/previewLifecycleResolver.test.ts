/**
 * previewLifecycleResolver — Tests for the canonical preview UI state resolver.
 *
 * Proves:
 *   1. Priority ordering is correct (blocked > failed > degraded > timeout > compiling > none)
 *   2. isGenerating suppresses all overlays
 *   3. Error/diagnostics/blocked payloads are correctly structured
 *   4. Edge cases (no error but failed status, etc.) are handled
 *   5. Legacy fields (controllerStatus, lifecycleStage) are always preserved
 */

import { describe, it, expect } from 'vitest';
import {
  resolvePreviewUI,
  type PreviewUIInputs,
  type PreviewOverlay,
} from '../previewLifecycleResolver';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeInputs(overrides: Partial<PreviewUIInputs> = {}): PreviewUIInputs {
  return {
    controllerStatus: 'ready',
    controllerError: null,
    controllerDiagnostics: null,
    activeRevisionId: 'rev-123',
    lifecycleStage: 'preview-ready',
    blockedReason: null,
    isGenerating: false,
    iframeLoaded: true,
    loadingTimeout: false,
    serverDown: false,
    isFixing: false,
    fixFailed: false,
    ...overrides,
  };
}

// ── Basic resolution ────────────────────────────────────────────────────────

describe('resolvePreviewUI — basic states', () => {
  it('healthy ready state → overlay: none', () => {
    const result = resolvePreviewUI(makeInputs());
    expect(result.overlay).toBe('none');
    expect(result.error).toBeNull();
    expect(result.blocked).toBeNull();
    expect(result.diagnostics).toBeNull();
    expect(result.showViteIframe).toBe(true);
  });

  it('idle state with iframe loaded → overlay: none', () => {
    const result = resolvePreviewUI(makeInputs({
      controllerStatus: 'idle',
      lifecycleStage: 'idle',
    }));
    expect(result.overlay).toBe('none');
  });

  it('compiling state → overlay: compiling', () => {
    const result = resolvePreviewUI(makeInputs({
      controllerStatus: 'compiling',
      lifecycleStage: 'materializing',
      iframeLoaded: false,
    }));
    expect(result.overlay).toBe('compiling');
  });

  it('iframe not loaded (even if ready) → overlay: compiling', () => {
    const result = resolvePreviewUI(makeInputs({
      controllerStatus: 'ready',
      iframeLoaded: false,
    }));
    expect(result.overlay).toBe('compiling');
  });
});

// ── Priority ordering ───────────────────────────────────────────────────────

describe('resolvePreviewUI — priority ordering', () => {
  it('blocked wins over failed', () => {
    const result = resolvePreviewUI(makeInputs({
      controllerStatus: 'failed',
      controllerError: 'some error',
      lifecycleStage: 'blocked',
      blockedReason: 'Quality check failed',
    }));
    expect(result.overlay).toBe('blocked');
    expect(result.blocked?.reason).toBe('Quality check failed');
    expect(result.error).toBeNull();
  });

  it('failed wins over loading-timeout', () => {
    const result = resolvePreviewUI(makeInputs({
      controllerStatus: 'failed',
      controllerError: 'Vite error',
      lifecycleStage: 'failed',
      loadingTimeout: true,
    }));
    expect(result.overlay).toBe('failed');
  });

  it('degraded shows when failed + lifecycle=degraded', () => {
    const result = resolvePreviewUI(makeInputs({
      controllerStatus: 'failed',
      controllerError: 'New build error',
      lifecycleStage: 'degraded',
    }));
    expect(result.overlay).toBe('degraded');
    expect(result.error?.message).toBe('New build error');
  });

  it('loading-timeout wins over normal compiling', () => {
    const result = resolvePreviewUI(makeInputs({
      controllerStatus: 'compiling',
      loadingTimeout: true,
      iframeLoaded: false,
    }));
    expect(result.overlay).toBe('loading-timeout');
  });

  it('compiling wins over none', () => {
    const result = resolvePreviewUI(makeInputs({
      controllerStatus: 'compiling',
      loadingTimeout: false,
      iframeLoaded: false,
    }));
    expect(result.overlay).toBe('compiling');
  });
});

// ── isGenerating suppression ────────────────────────────────────────────────

describe('resolvePreviewUI — isGenerating suppresses overlays', () => {
  const scenarios: Array<{ name: string; overrides: Partial<PreviewUIInputs>; expectedWithout: PreviewOverlay }> = [
    {
      name: 'suppresses failed',
      overrides: { controllerStatus: 'failed', controllerError: 'err', lifecycleStage: 'failed' },
      expectedWithout: 'failed',
    },
    {
      name: 'suppresses blocked',
      overrides: { lifecycleStage: 'blocked', blockedReason: 'reason' },
      expectedWithout: 'blocked',
    },
    {
      name: 'suppresses degraded',
      overrides: { controllerStatus: 'failed', controllerError: 'err', lifecycleStage: 'degraded' },
      expectedWithout: 'degraded',
    },
    {
      name: 'suppresses loading-timeout',
      overrides: { controllerStatus: 'compiling', loadingTimeout: true },
      expectedWithout: 'loading-timeout',
    },
  ];

  for (const { name, overrides, expectedWithout } of scenarios) {
    it(`${name} (isGenerating=false → ${expectedWithout})`, () => {
      const result = resolvePreviewUI(makeInputs({ ...overrides, isGenerating: false }));
      expect(result.overlay).toBe(expectedWithout);
    });

    it(`${name} (isGenerating=true → none)`, () => {
      const result = resolvePreviewUI(makeInputs({ ...overrides, isGenerating: true }));
      expect(result.overlay).toBe('none');
    });
  }
});

// ── Error payload ───────────────────────────────────────────────────────────

describe('resolvePreviewUI — error payload', () => {
  it('error payload has message and displayMessage', () => {
    const result = resolvePreviewUI(makeInputs({
      controllerStatus: 'failed',
      controllerError: 'Module not found: ./components/Missing',
      lifecycleStage: 'failed',
    }));
    expect(result.error).not.toBeNull();
    expect(result.error!.message).toBe('Module not found: ./components/Missing');
    expect(result.error!.displayMessage).toBe('Module not found: ./components/Missing');
  });

  it('displayMessage is truncated at 200 chars', () => {
    const longError = 'x'.repeat(300);
    const result = resolvePreviewUI(makeInputs({
      controllerStatus: 'failed',
      controllerError: longError,
      lifecycleStage: 'failed',
    }));
    expect(result.error!.displayMessage).toHaveLength(201); // 200 + '…'
    expect(result.error!.displayMessage.endsWith('…')).toBe(true);
    expect(result.error!.message).toBe(longError); // full message preserved
  });

  it('isFixing and fixFailed are reflected', () => {
    const result = resolvePreviewUI(makeInputs({
      controllerStatus: 'failed',
      controllerError: 'err',
      lifecycleStage: 'failed',
      isFixing: true,
      fixFailed: false,
    }));
    expect(result.error!.isFixing).toBe(true);
    expect(result.error!.fixFailed).toBe(false);
  });

  it('error is null when controllerError is null (even in failed status)', () => {
    const result = resolvePreviewUI(makeInputs({
      controllerStatus: 'failed',
      controllerError: null,
      lifecycleStage: 'failed',
    }));
    expect(result.overlay).toBe('failed');
    expect(result.error).toBeNull();
  });
});

// ── Blocked payload ─────────────────────────────────────────────────────────

describe('resolvePreviewUI — blocked payload', () => {
  it('carries the reason from input', () => {
    const result = resolvePreviewUI(makeInputs({
      lifecycleStage: 'blocked',
      blockedReason: 'Missing App.tsx entry file',
    }));
    expect(result.overlay).toBe('blocked');
    expect(result.blocked?.reason).toBe('Missing App.tsx entry file');
  });

  it('provides default reason when blockedReason is null', () => {
    const result = resolvePreviewUI(makeInputs({
      lifecycleStage: 'blocked',
      blockedReason: null,
    }));
    expect(result.blocked?.reason).toContain('quality check');
  });
});

// ── Diagnostics payload ─────────────────────────────────────────────────────

describe('resolvePreviewUI — diagnostics payload', () => {
  it('includes diagnostics when error stage differs from last stage', () => {
    const result = resolvePreviewUI(makeInputs({
      controllerStatus: 'failed',
      controllerError: 'Compile error',
      lifecycleStage: 'failed',
      controllerDiagnostics: {
        stage: 'sandbox-written',
        error: { stage: 'iframe-mounted', message: 'Compile error' },
      },
    }));
    expect(result.diagnostics).not.toBeNull();
    expect(result.diagnostics!.lastStage).toBe('sandbox-written');
    expect(result.diagnostics!.failedAtStage).toBe('iframe-mounted');
  });

  it('failedAtStage is null when error stage equals last stage', () => {
    const result = resolvePreviewUI(makeInputs({
      controllerStatus: 'failed',
      controllerError: 'Compile error',
      lifecycleStage: 'failed',
      controllerDiagnostics: {
        stage: 'iframe-mounted',
        error: { stage: 'iframe-mounted', message: 'Compile error' },
      },
    }));
    expect(result.diagnostics!.failedAtStage).toBeNull();
  });

  it('diagnostics is null when no error in diagnostics', () => {
    const result = resolvePreviewUI(makeInputs({
      controllerStatus: 'failed',
      controllerError: 'err',
      lifecycleStage: 'failed',
      controllerDiagnostics: {
        stage: 'iframe-ready',
        error: null,
      },
    }));
    expect(result.diagnostics).toBeNull();
  });
});

// ── Legacy fields always preserved ──────────────────────────────────────────

describe('resolvePreviewUI — legacy fields', () => {
  it('always includes controllerStatus', () => {
    for (const s of ['idle', 'generating', 'compiling', 'ready', 'failed'] as const) {
      const result = resolvePreviewUI(makeInputs({ controllerStatus: s }));
      expect(result.controllerStatus).toBe(s);
    }
  });

  it('always includes lifecycleStage', () => {
    for (const s of ['idle', 'generating', 'preview-ready', 'blocked', 'failed', 'degraded']) {
      const result = resolvePreviewUI(makeInputs({ lifecycleStage: s }));
      expect(result.lifecycleStage).toBe(s);
    }
  });

  it('always includes revisionId', () => {
    const result = resolvePreviewUI(makeInputs({ activeRevisionId: 'abc-123' }));
    expect(result.revisionId).toBe('abc-123');
  });
});
