/**
 * RevisionManager — candidate / active revision lifecycle.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  CANONICAL REVISION GLOSSARY  (single source of truth)
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  candidate  — A revision whose files are buffered in memory and may be
 *               being compiled. At most one candidate exists at a time.
 *               A candidate either promotes to active (on compile success)
 *               or is discarded (on compile failure / user rejection).
 *               ID: `candidateRevisionId`.
 *
 *  active     — The last revision that was successfully compiled and
 *               promoted. Its files are what the preview iframe shows.
 *               On rollback, the previous active is restored to disk.
 *               ID: `activeRevisionId`.  (Also exposed as buildId in
 *               the preview-timeline and PreviewController.)
 *
 *  stable     — A *snapshot-layer* concept (useStudio.Snapshot.status).
 *               A snapshot becomes "stable" when its corresponding iframe
 *               mounts without errors (markSnapshotStable). The most
 *               recent stable snapshot is the crash-recovery fallback on
 *               startup. RevisionManager does NOT track stable — it lives
 *               in the snapshot/undo layer above.
 *
 *  Lifecycle:
 *    createCandidate → writeCandidateFile(×N) → compileCandidate
 *      ┣━ success → promote (candidate → active)
 *      ┗━ failure → rollback (discard candidate, restore previous active)
 *
 *  The revisionId doubles as a buildId through the full preview cycle:
 *    clear → write batch → __build_id.ts (last) → preview-workspace HMR accept →
 *    `preview-mounted` postMessage → waitForReady() resolves → notifyReady().
 *
 *  Only a `preview-mounted` message whose buildId matches the current cycle
 *  can settle waitForReady — stale or foreign messages are rejected.
 * ═══════════════════════════════════════════════════════════════════════
 */

import { previewController, previewLog, setTimelineContext } from './PreviewController';
import { checkPreviewWrite } from './previewGuard';
import {
  clearPreview as gatewayClear,
  normalizePath,
  writeBatch,
  writeBuildMarker,
} from './PreviewWriteGateway';
import {
  schedulePostReadyCheck,
  cancelPendingCheck,
} from './WhiteScreenDetector';

const MAX_REVISIONS = 20;

/**
 * Adaptive compile timeout: scales with file count.
 * - Base: 15s (enough for 1-3 file apps)
 * - Per file: +2s (Vite HMR per-module overhead)
 * - Cap: 90s (absolute upper bound)
 */
function getCompileTimeout(fileCount: number): number {
  const BASE_MS    = 15_000;
  const PER_FILE   = 2_000;
  const MAX_MS     = 90_000;
  return Math.min(BASE_MS + fileCount * PER_FILE, MAX_MS);
}

/** Atomic snapshot of the revision manager's canonical state. */
export interface RevisionSummary {
  /** UUID of the last successfully compiled & promoted revision. */
  activeRevisionId:    string | null;
  /** UUID of the revision currently being built (null when idle). */
  candidateRevisionId: string | null;
  /** True when a candidate exists but has not yet been promoted or discarded. */
  hasPendingCandidate: boolean;
  /** Number of revisions retained in the in-memory store. */
  storedRevisionCount: number;
}

/**
 * Result returned by compileCandidate(). Carries a typed `compiled` flag
 * that promote() checks — a candidate CANNOT be promoted without passing
 * through compileCandidate first.
 */
export interface CompileResult {
  success:   boolean;
  errors?:   string[];
  /** Opaque token set by compileCandidate on success. promote() requires this. */
  _compiled: boolean;
}

export class RevisionManager {
  private activeRevisionId: string | null = null;
  private candidateRevisionId: string | null = null;

  /**
   * Set by compileCandidate on success, checked by promote().
   * Prevents promoting a candidate that was never compiled or whose
   * compilation failed. Reset to null on createCandidate / rollback.
   */
  private compiledRevisionId: string | null = null;

  /** revisionId → { normalizedPath → content } */
  private store = new Map<string, Record<string, string>>();

  constructor(private previewUrl: string) {}

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Create a new empty candidate revision. Returns its id.
   *
   * If a previous candidate exists and was never promoted, it is silently
   * discarded (but NOT removed from the store — callers may still reference
   * its files). The compiled flag is reset so the new candidate must pass
   * through compileCandidate before it can be promoted.
   */
  async createCandidate(): Promise<string> {
    // Discard any orphaned candidate (never promoted or rolled back)
    if (this.candidateRevisionId && this.candidateRevisionId !== this.activeRevisionId) {
      previewLog('candidate_orphaned', {
        orphanedId: this.candidateRevisionId,
        reason: 'new_candidate_created',
      });
    }

    // Evict oldest revisions (excluding active) when store exceeds limit
    if (this.store.size >= MAX_REVISIONS) {
      for (const key of this.store.keys()) {
        if (key === this.activeRevisionId) continue;
        this.store.delete(key);
        console.log(`[RevisionManager] evicted old revision: ${key}`);
        if (this.store.size < MAX_REVISIONS) break;
      }
    }

    const id = crypto.randomUUID();
    this.store.set(id, {});
    this.candidateRevisionId = id;
    this.compiledRevisionId = null; // New candidate must compile before promotion
    this.syncTimelineContext();
    previewLog('candidate_created', {
      buildId: id,
      storeSize: this.store.size,
    });
    return id;
  }

  async createEmptyCandidate(): Promise<string> {
    const id = await this.createCandidate();
    const placeholder = 'export default function App() { return <div>Waiting for generation...</div>; }\n';
    await this.writeCandidateFile(id, 'App.tsx', placeholder);
    const result = await this.compileCandidate(id);
    if (!result.success) {
      throw new Error(result.errors?.join('\n') || 'Failed to compile empty candidate');
    }
    await this.promote(id);
    return id;
  }

  /**
   * Buffer a file into the candidate (memory only — disk untouched).
   *
   * ARTIFACT-ENVELOPE GUARD: If the content looks like transport-level
   * artifact JSON rather than source code, the write is rejected with an
   * error. This prevents poisoned content from reaching preview-workspace.
   */
  async writeCandidateFile(
    revisionId: string,
    path: string,
    content: string,
  ): Promise<void> {
    const files = this.store.get(revisionId);
    if (!files) throw new Error(`Unknown revision: ${revisionId}`);
    if (revisionId !== this.candidateRevisionId) {
      throw new Error(`Revision ${revisionId} is not the current candidate`);
    }
    const normalised = normalizePath(path);

    // ── Artifact-envelope poison check ──────────────────────────
    const rejection = checkPreviewWrite(normalised, content, 'RevisionManager.writeCandidateFile', {
      buildId: revisionId,
    });
    if (rejection) {
      throw new Error(
        `[RevisionManager] Blocked artifact-envelope write to ${normalised} ` +
        `(buildId=${revisionId}). Content is transport JSON, not source code.`,
      );
    }

    files[normalised] = content;
    previewLog('file_buffered', {
      buildId: revisionId,
      path: normalised,
      size: content.length,
    });
  }

  /**
   * Flush candidate files to preview-workspace/src/ and wait for Vite verdict.
   *
   * Files are written to disk (Vite HMR picks them up automatically).
   * We listen for `vite:error` / `iframe-error` within a timeout window.
   * If no errors arrive before the timeout — compilation is considered successful.
   */
  /**
   * Flush candidate files to preview-workspace/src/ and wait for Vite HMR verdict.
   *
   * On success, sets the internal compiled flag so promote() will accept
   * this revision. On failure, the flag remains unset — promote() will refuse.
   *
   * PROMOTION CONTRACT: promote(revId) requires compileCandidate(revId)
   * to have returned { success: true } first. This is enforced at runtime.
   */
  async compileCandidate(
    revisionId: string,
  ): Promise<CompileResult> {
    if (revisionId !== this.candidateRevisionId) {
      return { success: false, errors: ['Not the current candidate'], _compiled: false };
    }
    const files = this.store.get(revisionId);
    if (!files || Object.keys(files).length === 0) {
      return { success: false, errors: ['Candidate has no files'], _compiled: false };
    }

    // ── Materialize diagnostic: source-ready ──────────────────────
    // All candidate files are buffered in memory — ready to flush.
    const entryPath = files['App.tsx'] ? 'App.tsx'
      : files['main.tsx'] ? 'main.tsx'
      : Object.keys(files).find(p => /App\.(tsx?|jsx?)$/.test(p)) ?? null;
    previewController.setDiagnosticStage('source-ready', revisionId, entryPath);

    // 1. Signal compiling state
    // Cancel any pending white-screen check from a previous build
    cancelPendingCheck();

    const fileCount = Object.keys(files).length;
    previewLog('compile_start', { buildId: revisionId, fileCount });
    previewController.notifyCompiling(revisionId);

    // ── Materialize diagnostic: entry-resolved ──────────────────
    previewController.setDiagnosticStage('entry-resolved', revisionId, entryPath);
    previewLog('write_batch_start', { buildId: revisionId, fileCount });

    console.log(
      `[RevisionManager] compiling candidate ${revisionId} (${Object.keys(files).length} files)`,
    );
    await this.flushToDisk(files, revisionId);
    previewLog('write_batch_done', { buildId: revisionId, fileCount: Object.keys(files).length });

    // ── Materialize diagnostic: sandbox-written ─────────────────
    // All source files flushed to preview-workspace/src/ (excluding __build_id.ts
    // which was written last inside flushToDisk → bootstrap-written).
    previewController.setDiagnosticStage('sandbox-written', revisionId);

    // ── Materialize diagnostic: bootstrap-written ───────────────
    // __build_id.ts was written by flushToDisk (buildId param present),
    // triggering Vite HMR accept hook.
    previewController.setDiagnosticStage('bootstrap-written', revisionId);

    // ── Materialize diagnostic: preview-entry-registered ────────
    // Vite is now processing the files. We wait for the iframe signal.
    previewController.setDiagnosticStage('preview-entry-registered', revisionId);

    // 2. Wait for an authoritative `preview-mounted` postMessage that carries
    //    OUR buildId. Stale / foreign messages are rejected.
    const timeoutMs = getCompileTimeout(fileCount);
    previewLog('wait_ready_start', { buildId: revisionId, fileCount, timeoutMs });
    const result = await waitForReady(revisionId, timeoutMs, this.previewUrl);

    if (result.success) {
      // ── Materialize diagnostic: iframe-mounted → iframe-ready ─
      previewController.setDiagnosticStage('iframe-mounted', revisionId);
      previewLog('mount_done', { buildId: revisionId });
      previewController.setDiagnosticStage('iframe-ready', revisionId);

      // Mark as compiled — promote() will now accept this revision.
      this.compiledRevisionId = revisionId;

      previewController.notifyReady(revisionId, 'validated_iframe_handshake');

      // Schedule post-ready white-screen check (runs after delay, non-blocking)
      schedulePostReadyCheck(revisionId);

      return { success: true, _compiled: true };
    } else {
      // Record error at the stage where the failure occurred.
      // Last successful stage was 'preview-entry-registered' (Vite was processing).
      previewController.setDiagnosticError(
        'iframe-mounted',
        result.errors?.join('\n') ?? 'Compilation failed',
        revisionId,
      );
      previewController.notifyFailed(
        result.errors?.join('\n') ?? 'Compilation failed',
        revisionId,
      );
      // compiledRevisionId stays null — promote() will refuse this revision.
      return { success: false, errors: result.errors, _compiled: false };
    }
  }

  /** Public wrapper so other call sites (e.g. ProjectRepository.loadToPreview) can wait. */
  async waitForReady(buildId: string): Promise<{ success: boolean; errors?: string[] }> {
    return waitForReady(buildId);
  }

  /**
   * Write `__build_id.ts` to preview-workspace/src/. Triggers main.tsx's HMR accept hook,
   * which posts the `preview-mounted` message that settles waitForReady.
   * Should be called LAST in any write batch.
   */
  async writeBuildIdMarker(buildId: string): Promise<void> {
    await writeBuildMarker(buildId, {
      source: 'RevisionManager.writeBuildIdMarker',
      buildId,
    });
  }

  /**
   * Promote candidate → active.
   *
   * PROMOTION CONTRACT (enforced):
   *   1. revisionId must be the current candidateRevisionId.
   *   2. revisionId must exist in the store.
   *   3. compileCandidate(revisionId) must have returned success.
   *
   * Does NOT call notifyReady — that was already done by compileCandidate
   * when the iframe handshake succeeded. promote() is purely an ownership
   * transfer: candidate slot → active slot.
   */
  async promote(revisionId: string): Promise<void> {
    if (revisionId !== this.candidateRevisionId) {
      throw new Error('Can only promote the current candidate');
    }
    if (!this.store.has(revisionId)) {
      throw new Error(`Unknown revision: ${revisionId}`);
    }
    if (this.compiledRevisionId !== revisionId) {
      throw new Error(
        `Cannot promote revision ${revisionId}: compileCandidate() did not succeed. ` +
        `compiledRevisionId=${this.compiledRevisionId}`,
      );
    }

    this.activeRevisionId = revisionId;
    this.candidateRevisionId = null;
    this.compiledRevisionId = null; // Consumed — next candidate must compile fresh
    this.syncTimelineContext();

    previewLog('candidate_promoted', { buildId: revisionId });
    // NOTE: notifyReady is NOT called here — compileCandidate already did it
    // when the iframe handshake succeeded. Calling it twice would be harmless
    // (same buildId) but semantically wrong: readiness is a compile outcome,
    // not a promotion outcome.
  }

  /**
   * Discard the current candidate and restore the last-good active revision.
   *
   * REJECTION SEMANTICS:
   *   - The candidate is removed from the store (cannot be promoted later).
   *   - The compiled flag is cleared (no stale promotion possible).
   *   - If an active revision exists, its files are flushed back to disk
   *     and the preview is signaled as ready (last-good semantics).
   *   - If no active revision exists (first-ever generation failed),
   *     the preview stays in its current state (idle or failed).
   */
  async rollback(): Promise<void> {
    const discardedId = this.candidateRevisionId;
    previewLog('rollback_start', {
      discardedCandidateId: discardedId,
      activeRevisionId: this.activeRevisionId,
    });

    // Discard candidate — cannot be promoted after this point
    if (discardedId) {
      this.store.delete(discardedId);
      this.candidateRevisionId = null;
      this.compiledRevisionId = null; // Prevent stale promotion
      this.syncTimelineContext();
    }

    // Restore active revision files (last-good preview)
    if (this.activeRevisionId) {
      const files = this.store.get(this.activeRevisionId);
      if (files && Object.keys(files).length > 0) {
        console.log(
          `[RevisionManager] rolling back to active ${this.activeRevisionId}`,
        );
        await this.clearPreview();
        await this.flushToDisk(files);
        previewController.notifyReady(this.activeRevisionId, 'rollback_restore');
      }
    }
  }

  getActiveRevisionId(): string | null {
    return this.activeRevisionId;
  }
  getCandidateRevisionId(): string | null {
    return this.candidateRevisionId;
  }

  /**
   * Snapshot of the canonical revision state.
   * Use this when you need both IDs together (e.g. diagnostics, logging)
   * instead of calling getActive/getCandidate separately and risking
   * reading them across a state change.
   */
  getRevisionSummary(): RevisionSummary {
    return {
      activeRevisionId:    this.activeRevisionId,
      candidateRevisionId: this.candidateRevisionId,
      hasPendingCandidate: this.candidateRevisionId !== null,
      storedRevisionCount: this.store.size,
    };
  }

  /** Read files snapshot for any stored revision (shallow copy). */
  getRevisionFiles(revisionId: string): Record<string, string> | undefined {
    const files = this.store.get(revisionId);
    return files ? { ...files } : undefined;
  }

  /** Restore a previously promoted revision to disk and set it as active. */
  async restoreRevision(revisionId: string): Promise<void> {
    const files = this.store.get(revisionId);
    if (!files) throw new Error(`Unknown revision: ${revisionId}`);
    await this.clearPreview();
    await this.flushToDisk(files);
    this.activeRevisionId = revisionId;
    this.syncTimelineContext();
    previewLog('revision_restored', { buildId: revisionId });
    previewController.notifyReady(revisionId);
  }

  // ── Context sync ───────────────────────────────────────────────

  /** Push current revision IDs into the ambient previewLog context. */
  private syncTimelineContext(): void {
    setTimelineContext({
      activeRevisionId: this.activeRevisionId,
      candidateRevisionId: this.candidateRevisionId,
    });
  }

  // ── Private helpers ────────────────────────────────────────────

  /**
   * Write a batch of files to preview-workspace/src/ via Vite middleware.
   * If buildId is provided, writes `__build_id.ts` LAST so HMR accept fires
   * after every other module has been replaced.
   */
  private async flushToDisk(
    files: Record<string, string>,
    buildId?: string,
  ): Promise<void> {
    const gwOpts = {
      source: 'RevisionManager.flushToDisk',
      buildId,
    };
    await writeBatch(files, gwOpts);
    if (buildId) {
      await writeBuildMarker(buildId, gwOpts);
    }
  }

  async fullClearPreview(buildId?: string): Promise<void> {
    try {
      await gatewayClear({
        source: 'RevisionManager.fullClearPreview',
        buildId,
      });
      console.log('[RevisionManager] Preview cleared');
    } catch (err) {
      console.warn('[RevisionManager] Clear failed:', err);
      // Gateway already logged the error — just swallow here
    }
  }

  private async clearPreview(buildId?: string): Promise<void> {
    await this.fullClearPreview(buildId);
  }
}

// ── Helpers (module-private) ──────────────────────────────────────

/**
 * Wait for an authoritative `preview-mounted` postMessage scoped to `expectedBuildId`.
 *
 * Acceptance rules (ALL must hold):
 *   - message origin === PREVIEW_ORIGIN (the preview-workspace dev server)
 *   - data.type === 'preview-mounted'
 *   - data.buildId === expectedBuildId
 *
 * Stale messages (a previous build's id, or `iframe-ready` from initial load) are
 * logged and rejected, never resolve the promise.
 *
 * Hard error channels still settle the wait early:
 *   - `iframe-error` (runtime crash inside preview)
 *   - `vite:error`   (compile error reported by preview-workspace HMR)
 */
function waitForReady(
  expectedBuildId: string,
  timeoutMs = 45_000,
  previewUrl = window.location.origin,
): Promise<{ success: boolean; errors?: string[] }> {
  return new Promise((resolve) => {
    const errors: string[] = [];
    let settled = false;
    const previewOrigin = new URL(previewUrl).origin;

    const settle = (success: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(success ? { success: true } : { success: false, errors });
    };

    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      const type = (d as { type?: string }).type;
      if (!type) return;

      // Origin gate — only the preview-workspace dev server may finish a cycle.
      const originOk = e.origin === previewOrigin;

      if (type === 'preview-mounted') {
        const msgBuildId = (d as { buildId?: string }).buildId;
        const accepted = originOk && msgBuildId === expectedBuildId;
        previewLog('message_received', {
          type,
          buildIdFromMsg: msgBuildId,
          origin: e.origin,
          sourceMatched: originOk,
        });
        previewLog('ready_received', {
          buildIdFromMsg: msgBuildId,
          expectedBuildId,
          accepted,
          rejectReason: accepted
            ? null
            : !originOk
              ? 'origin_mismatch'
              : 'buildId_mismatch',
        });
        if (accepted) settle(true);
        return;
      }

      // Legacy iframe-ready: log + ignore. It is no longer authoritative.
      if (type === 'iframe-ready') {
        previewLog('message_received', {
          type,
          buildIdFromMsg: null,
          origin: e.origin,
          sourceMatched: originOk,
        });
        previewLog('ready_received', {
          buildIdFromMsg: null,
          expectedBuildId,
          accepted: false,
          rejectReason: 'legacy_iframe_ready_no_buildId',
        });
        return;
      }

      if (type === 'iframe-error') {
        if (!originOk) return;
        errors.push((d as { message?: string }).message || 'Unknown iframe error');
        settle(false);
        return;
      }

      if (type === 'vite:error') {
        if (!originOk) return;
        const err = (d as { err?: { message?: string }; message?: string });
        const msg = err.err?.message || err.message || 'Vite compilation error';
        errors.push(msg);
        settle(false);
        return;
      }
    };

    const timer = window.setTimeout(() => {
      const msg = `Preview timeout: no preview-mounted for ${expectedBuildId}`;
      errors.push(msg);
      console.warn('[RevisionManager]', msg);
      previewLog('wait_ready_timeout', { buildId: expectedBuildId });
      settle(false);
    }, timeoutMs);
    window.addEventListener('message', onMessage);
  });
}

// ── Singleton ─────────────────────────────────────────────────────

export const revisionManager = new RevisionManager(window.location.origin);
