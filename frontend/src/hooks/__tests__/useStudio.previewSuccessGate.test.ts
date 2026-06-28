import { describe, expect, it } from 'vitest';

import { resolvePreviewSuccessGate, type PreviewSuccessGateInput } from '../useStudioPreviewSuccessGate';

function makeInput(overrides: Partial<PreviewSuccessGateInput> = {}): PreviewSuccessGateInput {
  return {
    state: {
      status: 'ready',
      readySource: 'proto_pipeline_complete',
      activeRevisionId: 'rev-skeleton-1',
      ...overrides.state,
    },
    previewLifecycle: 'materializing',
    previewReady: false,
    awaiting: true,
    filesCommitted: true,
    hasSnapshot: true,
    lastPreviewReadyRevisionId: null,
    ...overrides,
  };
}

describe('resolvePreviewSuccessGate', () => {
  it('promotes a proto pipeline ready preview once files are committed and a snapshot exists', () => {
    const result = resolvePreviewSuccessGate(makeInput());

    expect(result.action).toBe('promote-ready');
    expect(result.nextLifecycle).toBe('preview-ready');
    expect(result.nextPreviewReady).toBe(true);
    expect(result.pendingProjectSavePreviewReady).toBe(true);
  });

  it('holds the lifecycle at materializing while committed files are still missing', () => {
    const result = resolvePreviewSuccessGate(makeInput({
      filesCommitted: false,
      hasSnapshot: false,
    }));

    expect(result.action).toBe('wait-for-files-commit');
    expect(result.nextLifecycle).toBe('materializing');
    expect(result.nextPreviewReady).toBe(true);
    expect(result.pendingProjectSavePreviewReady).toBe(false);
  });

  it('suppresses the early static build ready signal', () => {
    const result = resolvePreviewSuccessGate(makeInput({
      state: {
        status: 'ready',
        readySource: 'static_build_complete',
        activeRevisionId: 'rev-static-1',
      },
      previewLifecycle: 'generating',
      previewReady: false,
      awaiting: true,
      filesCommitted: false,
      hasSnapshot: false,
    }));

    expect(result.action).toBe('suppress-static-build');
    expect(result.nextLifecycle).toBe('skeleton-ready');
    expect(result.nextPreviewReady).toBe(false);
    expect(result.pendingProjectSavePreviewReady).toBe(false);
  });

  it('requests snapshot creation when proto ready arrived before snapshot state caught up', () => {
    const result = resolvePreviewSuccessGate(makeInput({
      hasSnapshot: false,
    }));

    expect(result.action).toBe('ensure-snapshot');
    expect(result.nextLifecycle).toBe('materializing');
    expect(result.nextPreviewReady).toBe(true);
    expect(result.pendingProjectSavePreviewReady).toBe(false);
  });
});
