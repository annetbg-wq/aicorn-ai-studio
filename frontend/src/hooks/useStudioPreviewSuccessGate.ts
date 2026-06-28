import type { PreviewState } from '../services/PreviewController';
import type { PreviewLifecycleStage } from '../shared/projectModel';

export type PreviewSuccessGateAction =
  | 'noop'
  | 'suppress-static-build'
  | 'wait-for-files-commit'
  | 'ensure-snapshot'
  | 'wait-for-snapshot'
  | 'show-preview-ready'
  | 'skip-duplicate-ready'
  | 'promote-ready';

export interface PreviewSuccessGateInput {
  state: Pick<PreviewState, 'status' | 'readySource' | 'activeRevisionId'>;
  previewLifecycle: PreviewLifecycleStage;
  previewReady: boolean;
  awaiting: boolean;
  filesCommitted: boolean;
  hasSnapshot: boolean;
  lastPreviewReadyRevisionId: string | null;
}

export interface PreviewSuccessGateResult {
  action: PreviewSuccessGateAction;
  nextLifecycle: PreviewLifecycleStage;
  nextPreviewReady: boolean;
  pendingProjectSavePreviewReady: boolean;
}

export function resolvePreviewSuccessGate(
  input: PreviewSuccessGateInput,
): PreviewSuccessGateResult {
  if (input.state.status !== 'ready' || !input.state.activeRevisionId) {
    return {
      action: 'noop',
      nextLifecycle: input.previewLifecycle,
      nextPreviewReady: input.previewReady,
      pendingProjectSavePreviewReady: false,
    };
  }

  if (input.state.readySource === 'static_build_complete') {
    return {
      action: 'suppress-static-build',
      nextLifecycle: input.previewLifecycle === 'preview-ready' ? 'preview-ready' : 'skeleton-ready',
      nextPreviewReady: input.previewReady,
      pendingProjectSavePreviewReady: false,
    };
  }

  if (input.awaiting && !input.filesCommitted) {
    return {
      action: 'wait-for-files-commit',
      nextLifecycle: 'materializing',
      nextPreviewReady: true,
      pendingProjectSavePreviewReady: false,
    };
  }

  if (input.awaiting && !input.hasSnapshot) {
    return {
      action: input.state.readySource === 'proto_pipeline_complete' ? 'ensure-snapshot' : 'wait-for-snapshot',
      nextLifecycle: input.previewLifecycle,
      nextPreviewReady: true,
      pendingProjectSavePreviewReady: false,
    };
  }

  if (!input.awaiting && !input.hasSnapshot) {
    return {
      action: 'show-preview-ready',
      nextLifecycle: 'preview-ready',
      nextPreviewReady: true,
      pendingProjectSavePreviewReady: false,
    };
  }

  if (input.lastPreviewReadyRevisionId === input.state.activeRevisionId) {
    return {
      action: 'skip-duplicate-ready',
      nextLifecycle: input.previewLifecycle,
      nextPreviewReady: true,
      pendingProjectSavePreviewReady: false,
    };
  }

  return {
    action: 'promote-ready',
    nextLifecycle: 'preview-ready',
    nextPreviewReady: true,
    pendingProjectSavePreviewReady: true,
  };
}
