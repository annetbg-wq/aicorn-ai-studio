/**
 * PreviewController — reactive preview state machine.
 *
 * Single source of truth for preview lifecycle status.
 * RevisionManager calls notify*() methods; UI subscribes via subscribe().
 * No setTimeout, no polling — pure event-driven state transitions.
 */

import type {
  PreviewMaterializeStage,
  PreviewDiagnosticState,
} from '../shared/projectModel';

export interface GenerationFileProgress {
  /** File currently being streamed by the LLM. */
  currentFile: string;
  /** Files whose <!--FILE:--> block is fully closed. */
  completedFiles: string[];
  /** Expected total (from plan pages count). 0 = unknown. */
  totalExpected: number;
}

export interface PreviewState {
  status: 'idle' | 'generating' | 'compiling' | 'ready' | 'failed';
  fileProgress?: GenerationFileProgress;
  activeRevisionId?: string;
  /** Build cycle currently expected to mount. Equals activeRevisionId during compile. */
  expectingBuildId?: string;
  error?: string;
  lastReadyAt?: number;
  /**
   * Fine-grained materialize diagnostic. Updated at each checkpoint inside
   * compileCandidate → triggerCompile → waitForReady → mount.
   * Null before the first compile cycle.
   */
  diagnostics?: PreviewDiagnosticState | null;
}

// ── Ambient timeline context ────────────────────────────────────────
// RevisionManager (and other pipeline stages) call setTimelineContext()
// to update ambient fields. previewLog() auto-merges them into every event
// so callers don't need to pass projectId / revisionId / etc. every time.

let _timelineCtx: Record<string, unknown> = {};

/** Update ambient fields merged into every previewLog event. Additive — pass only changed keys. */
export function setTimelineContext(patch: Record<string, unknown>): void {
  _timelineCtx = { ..._timelineCtx, ...patch };
}

/** Reset ambient context (e.g. on project switch). */
export function clearTimelineContext(): void {
  _timelineCtx = {};
}

/** Structured preview-pipeline logger. Single grep target for the full timeline. */
export function previewLog(
  event: string,
  payload: Record<string, unknown> = {},
): void {
  // Merge ambient context under event-specific payload (payload wins on conflict).
  const merged = { ..._timelineCtx, ...payload, _t: Date.now() };
  // Single-line, sortable, easy to grep with `[preview-timeline]`.
  console.log(`[preview-timeline] ${event}`, merged);
}

export class PreviewController {
  private state: PreviewState = { status: 'idle' };
  private listeners = new Set<(state: PreviewState) => void>();

  // ── Notify (called by RevisionManager / SimpleGeneration) ──────

  notifyGenerating(progress: GenerationFileProgress): void {
    this.setState({
      ...this.state,
      status: 'generating',
      fileProgress: progress,
      error: undefined,
    });
  }

  notifyCompiling(revisionId?: string): void {
    this.setState({
      status: 'compiling',
      activeRevisionId: revisionId,
      expectingBuildId: revisionId,
      error: undefined,
      fileProgress: undefined,
    });
    previewLog('controller_compiling', { buildId: revisionId });
  }

  /**
   * Final ready transition. Refuses if a different build is currently expected,
   * which makes this the single authoritative ready source — stale or unrelated
   * callers cannot promote a foreign build.
   */
  notifyReady(revisionId?: string, source: string = 'unknown'): void {
    const expecting = this.state.expectingBuildId;
    if (expecting && revisionId && revisionId !== expecting) {
      previewLog('notify_ready_rejected', {
        source,
        buildId: revisionId,
        reason: 'buildId_mismatch',
        expecting,
      });
      return;
    }
    this.setState({
      ...this.state,
      status: 'ready',
      activeRevisionId: revisionId ?? this.state.activeRevisionId,
      expectingBuildId: undefined,
      error: undefined,
      lastReadyAt: Date.now(),
      fileProgress: undefined,
    });
    previewLog('ready_set', { source, buildId: revisionId });
  }

  notifyFailed(error: string, revisionId?: string): void {
    this.setState({
      ...this.state,
      status: 'failed',
      activeRevisionId: revisionId ?? this.state.activeRevisionId,
      expectingBuildId: undefined,
      error,
      fileProgress: undefined,
    });
    previewLog('controller_failed', { buildId: revisionId, error });
  }

  reset(): void {
    this.setState({ status: 'idle', diagnostics: null });
    previewLog('controller_reset', {});
  }

  // ── Materialize diagnostics ─────────────────────────────────────

  /**
   * Advance the fine-grained materialize stage. Called by RevisionManager
   * at each checkpoint during compileCandidate / flush / waitForReady.
   */
  setDiagnosticStage(
    stage: PreviewMaterializeStage,
    revisionId: string | null,
    entryPath?: string | null,
  ): void {
    const diag: PreviewDiagnosticState = {
      stage,
      revisionId,
      entryPath: entryPath ?? this.state.diagnostics?.entryPath ?? null,
      error: null,
      updatedAt: new Date().toISOString(),
    };
    this.setState({ ...this.state, diagnostics: diag });
    previewLog('materialize_stage', { stage, buildId: revisionId, entryPath: diag.entryPath });
  }

  /**
   * Record an error at a specific materialize stage. The diagnostic snapshot
   * retains the last successfully reached stage for post-mortem.
   */
  setDiagnosticError(
    failedAtStage: PreviewMaterializeStage,
    message: string,
    revisionId: string | null,
  ): void {
    const prev = this.state.diagnostics;
    const diag: PreviewDiagnosticState = {
      // Keep the last *successful* stage — that's what the caller passed before the error
      stage:     prev?.stage ?? failedAtStage,
      revisionId,
      entryPath: prev?.entryPath ?? null,
      error:     { stage: failedAtStage, message },
      updatedAt: new Date().toISOString(),
    };
    this.setState({ ...this.state, diagnostics: diag });
    previewLog('materialize_error', {
      failedAtStage,
      lastGoodStage: diag.stage,
      buildId: revisionId,
      error: message,
    });
  }

  getDiagnostics(): PreviewDiagnosticState | null {
    return this.state.diagnostics ?? null;
  }

  // ── Subscribe (called by UI) ────────────────────────────────────

  subscribe(listener: (state: PreviewState) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  getState(): PreviewState {
    return this.state;
  }

  // ── Internal ────────────────────────────────────────────────────

  private setState(next: PreviewState): void {
    this.state = next;
    for (const fn of this.listeners) {
      fn(this.state);
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────

export const previewController = new PreviewController();
