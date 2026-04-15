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
 *               promoted. Its static build is what the preview iframe shows
 *               at /preview/:activeRevisionId. On rollback or white-screen
 *               recovery the iframe navigates back to this URL — no
 *               re-compile is needed because builds/:activeRevisionId/ is
 *               already on disk (LRU-protected within MAX_BUILDS=20).
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
 *    triggerCompile (POST /api/preview/:buildId/compile)
 *    → backend vite build → builds/:buildId/ static output
 *    → iframe.src = /preview/:buildId
 *    → MountReporter inside the static app posts `preview-mounted` postMessage
 *    → waitForReady() resolves with matching buildId → notifyReady().
 *
 *  Only a `preview-mounted` message whose buildId matches the current cycle
 *  can settle waitForReady — stale or foreign messages are rejected.
 *
 *  ── Rollback / restore semantics (backend-compiler era) ───────────────
 *  Since builds are compiled to immutable static snapshots in builds/:id/,
 *  rollback and undo/redo do NOT need a new compile cycle:
 *    • rollback()        → navigate iframe to /preview/:activeRevisionId
 *    • restoreRevision() → navigate iframe to /preview/:revisionId (fast path)
 *                          or re-materialize if the build was LRU-evicted (rare)
 *    • promote() fallback → navigate iframe back to /preview/:previousActiveRevisionId
 *  ═══════════════════════════════════════════════════════════════════════
 */

import { previewController, previewLog, setTimelineContext } from './PreviewController';
import { checkPreviewWrite } from './previewGuard';
import {
  clearPreview as gatewayClear,
  normalizePath,
} from './PreviewWriteGateway';
import {
  schedulePostReadyCheck,
  cancelPendingCheck,
  WhiteScreenDetector,
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

export interface PersistedMaterializeOptions {
  /** Caller identity for timeline logs. */
  source: string;
  /** Optional project id for log context. */
  projectId?: string | null;
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
   * Canonical materialization entry for persisted project loads/switches/restores.
   *
   * Contract:
   *   1. Buffer persisted files into a candidate revision.
   *   2. Compile and wait for authoritative `preview-mounted`.
   *   3. Promote candidate → active on success.
   *   4. Keep last-good preview untouched on failure (candidate is discarded).
   *
   * This keeps project-load semantics aligned with generation semantics by
   * reusing the same candidate/active lifecycle and ready handshake.
   */
  async materializePersistedFiles(
    files: Record<string, string>,
    opts: PersistedMaterializeOptions,
  ): Promise<string> {
    const revisionId = await this.createCandidate();
    setTimelineContext({ projectId: opts.projectId ?? null });
    previewLog('persisted_materialize_start', {
      buildId: revisionId,
      source: opts.source,
      projectId: opts.projectId ?? null,
      fileCount: Object.keys(files ?? {}).length,
    });

    try {
      for (const [path, content] of Object.entries(files ?? {})) {
        await this.writeCandidateFile(revisionId, path, content);
      }

      const compile = await this.compileCandidate(revisionId);
      if (!compile.success) {
        this.discardCandidate(revisionId);
        throw new Error(compile.errors?.join('\n') ?? 'Persisted project compile failed');
      }

      await this.promote(revisionId);
      previewLog('persisted_materialize_done', {
        buildId: revisionId,
        source: opts.source,
        projectId: opts.projectId ?? null,
      });
      return revisionId;
    } catch (err) {
      if (this.candidateRevisionId === revisionId) {
        this.discardCandidate(revisionId);
      }
      const msg = err instanceof Error ? err.message : String(err);
      previewLog('persisted_materialize_failed', {
        buildId: revisionId,
        source: opts.source,
        projectId: opts.projectId ?? null,
        error: msg,
      });
      throw err;
    }
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
      `[RevisionManager] compiling candidate ${revisionId} (${fileCount} files) via backend build`,
    );

    // Backend compile: POST files → Express → vite build → builds/<buildId>/
    // __build_id.ts is written server-side so MountReporter bakes the correct
    // buildId into the static output and posts `preview-mounted` on load.
    try {
      await triggerCompile(revisionId, files);
    } catch (e: any) {
      const msg: string = e?.message ?? 'Backend compile failed';
      previewLog('write_batch_done', { buildId: revisionId, fileCount, error: msg });
      previewController.setDiagnosticError('iframe-mounted', msg, revisionId);
      previewController.notifyFailed(msg, revisionId);
      return { success: false, errors: [msg], _compiled: false };
    }
    previewLog('write_batch_done', { buildId: revisionId, fileCount });

    // Advance diagnostic stages (build → files written → entry registered)
    previewController.setDiagnosticStage('sandbox-written', revisionId);
    previewController.setDiagnosticStage('bootstrap-written', revisionId);
    previewController.setDiagnosticStage('preview-entry-registered', revisionId);

    // Force-reload the iframe to the newly compiled static URL.
    // (The iframe may have received a 404 during compilation while hidden
    //  behind the compiling overlay — this ensures it loads the built app.)
    const iframe = document.querySelector<HTMLIFrameElement>(
      'iframe[data-testid="preview-iframe"]',
    );
    if (iframe) iframe.src = `/preview/${revisionId}`;

    // 2. Wait for `preview-mounted` from the static build's MountReporter.
    //    MountReporter fires useEffect → window.parent.postMessage({type:'preview-mounted', buildId})
    //    after the React tree commits. Same-origin iframe → originOk passes.
    const timeoutMs = getCompileTimeout(fileCount);
    previewLog('wait_ready_start', { buildId: revisionId, fileCount, timeoutMs });
    const result = await waitForReady(revisionId, timeoutMs, this.previewUrl);

    if (result.success) {
      const previewUrl = `/preview/${revisionId}`;
      // ── Materialize diagnostic: iframe-mounted → iframe-ready ─
      previewController.setDiagnosticStage('iframe-mounted', revisionId);
      previewLog('mount_done', { buildId: revisionId });
      previewController.setDiagnosticStage('iframe-ready', revisionId);

      // Emit enriched mount signal for consumers that need the route-style URL.
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'preview-mounted', buildId: revisionId, previewUrl },
        origin: window.location.origin,
      }));

      // Mark as compiled — promote() will now accept this revision.
      this.compiledRevisionId = revisionId;

      previewController.notifyReady(revisionId, 'static_build_complete');

      // Schedule post-ready white-screen check (runs after delay, non-blocking)
      schedulePostReadyCheck(revisionId);

      return { success: true, _compiled: true };
    } else {
      previewController.setDiagnosticError(
        'iframe-mounted',
        result.errors?.join('\n') ?? 'Compilation failed',
        revisionId,
      );
      previewController.notifyFailed(
        result.errors?.join('\n') ?? 'Compilation failed',
        revisionId,
      );
      return { success: false, errors: result.errors, _compiled: false };
    }
  }

  /** Public wrapper so other call sites (e.g. ProjectRepository.loadToPreview) can wait. */
  async waitForReady(buildId: string): Promise<{ success: boolean; errors?: string[] }> {
    return waitForReady(buildId);
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
   *
   * Two-gate promotion model:
   *   Gate 1 — compileCandidate(): waits for `preview-mounted` from the iframe.
   *   Gate 2 — WhiteScreenDetector.isBlank(): verifies the iframe is not blank
   *             immediately after mount. If Gate 2 fails → last-good is restored,
   *             notifyFailed is called, state is cleaned up, PROMOTE_BLOCKED thrown.
   *
   * Note: SandpackPreview runs its own isBlank() check at +1000 ms after
   * `preview-mounted`. This is NOT a duplicate of Gate 2 — it catches crashes
   * that occur after a successful promotion (e.g. a component throws post-mount).
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

    const previousActiveRevisionId = this.activeRevisionId;
    const iframe = document.querySelector<HTMLIFrameElement>(
      `iframe[data-build-id="${revisionId}"], iframe[data-testid="preview-iframe"], iframe[src*="/__preview"]`,
    );
    const blank = await WhiteScreenDetector.isBlank(iframe);
    if (blank) {
      previewLog('promote_blocked_white_screen', {
        buildId: revisionId,
        previousActiveRevisionId,
      });
      previewController.setDiagnosticError(
        'white-screen-detected',
        'Preview is blank',
        revisionId,
      );

      // Restore last-good: navigate the iframe back to the previous active build.
      // builds/:previousActiveRevisionId/ is already on disk — no re-compile needed.
      // MAX_BUILDS=20 LRU ensures recent builds survive the current session.
      if (previousActiveRevisionId) {
        const lastGoodIframe = document.querySelector<HTMLIFrameElement>(
          'iframe[data-testid="preview-iframe"]',
        );
        if (lastGoodIframe) {
          previewLog('promote_restore_last_good', { buildId: previousActiveRevisionId });
          lastGoodIframe.src = `/preview/${previousActiveRevisionId}`;
        }
      }

      previewController.notifyFailed('Preview is blank', previousActiveRevisionId ?? revisionId);
      // Reset state before throw so candidateRevisionId/compiledRevisionId are
      // not left populated — next createCandidate() must not see a stale orphan.
      this.candidateRevisionId = null;
      this.compiledRevisionId = null;
      this.syncTimelineContext();
      throw new Error('PROMOTE_BLOCKED: white_screen_after_ready');
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
   *   - If an active revision exists, the iframe is navigated to
   *     /preview/:activeRevisionId — the build is already on disk (no
   *     re-compile needed; LRU-protected within MAX_BUILDS=20).
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

    // Restore last-good: navigate the iframe to the existing compiled static build.
    // builds/:activeRevisionId/ is still on disk — no re-compile or HMR write needed.
    if (this.activeRevisionId) {
      console.log(`[RevisionManager] rolling back to active ${this.activeRevisionId}`);
      const iframe = document.querySelector<HTMLIFrameElement>(
        'iframe[data-testid="preview-iframe"]',
      );
      if (iframe) iframe.src = `/preview/${this.activeRevisionId}`;
      previewController.notifyReady(this.activeRevisionId, 'rollback_restore');
      previewLog('rollback_restored', { buildId: this.activeRevisionId });
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

  /**
   * Restore a previously promoted revision (undo/redo).
   *
   * Fast path  — builds/:revisionId/ is still on disk (common; LRU keeps
   *              MAX_BUILDS=20 entries). Navigate the iframe directly to
   *              /preview/:revisionId without any compile step.
   * Slow path  — build was LRU-evicted (rare; requires >20 newer builds).
   *              Re-materialize from the in-memory file store.
   */
  async restoreRevision(revisionId: string): Promise<void> {
    const files = this.store.get(revisionId);
    if (!files) throw new Error(`Unknown revision: ${revisionId}`);

    const buildExists = await this._checkBuildExists(revisionId);
    if (buildExists) {
      // Fast path: compiled output is on disk — just navigate.
      const iframe = document.querySelector<HTMLIFrameElement>(
        'iframe[data-testid="preview-iframe"]',
      );
      if (iframe) iframe.src = `/preview/${revisionId}`;
      this.activeRevisionId = revisionId;
      this.syncTimelineContext();
      previewController.notifyReady(revisionId, 'revision_restored_direct');
      previewLog('revision_restored', { buildId: revisionId, path: 'direct' });
    } else {
      // Slow path: build was LRU-evicted — re-compile from in-memory files.
      previewLog('revision_restore_rematerialize', { buildId: revisionId, reason: 'build_not_on_disk' });
      await this.materializePersistedFiles(files, {
        source: 'RevisionManager.restoreRevision',
      });
      previewLog('revision_restored', { buildId: revisionId, path: 'rematerialized' });
    }
  }

  /** HEAD-check whether builds/:buildId/ exists on the static build server. */
  private async _checkBuildExists(buildId: string): Promise<boolean> {
    try {
      const r = await fetch(`/preview/${buildId}/`, { method: 'HEAD' });
      return r.ok;
    } catch {
      return false;
    }
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
   * Clear all files from preview-workspace/src/ via /__clear_preview.
   * Called by SimpleGeneration as a preflight before NEW-mode generation
   * so stale files from a previous build do not leak into the next compile.
   *
   * NOTE: preview-workspace/vite.config.ts only exposes this endpoint when the
   * Vite dev server is running in HMR mode. In the backend-compiler architecture
   * the endpoint may not exist; the gateway catches the 404 and swallows it.
   */
  async fullClearPreview(buildId?: string): Promise<void> {
    try {
      await gatewayClear({
        source: 'RevisionManager.fullClearPreview',
        buildId,
      });
      console.log('[RevisionManager] Preview workspace cleared');
    } catch (err) {
      console.warn('[RevisionManager] Clear failed (non-fatal):', err);
      // Gateway already logged the error — just swallow here
    }
  }

  /** Remove a failed candidate without mutating last-good preview pixels/state. */
  private discardCandidate(revisionId: string): void {
    this.store.delete(revisionId);
    if (this.candidateRevisionId === revisionId) {
      this.candidateRevisionId = null;
    }
    if (this.compiledRevisionId === revisionId) {
      this.compiledRevisionId = null;
    }
    this.syncTimelineContext();
  }
}

// ── Helpers (module-private) ──────────────────────────────────────

/**
 * POST user files to the backend compile endpoint.
 * The backend writes them into preview-workspace/src/, stamps __build_id.ts,
 * runs `vite build --outDir builds/<buildId>`, and returns when done.
 *
 * Throws on HTTP error or non-200 JSON { success: false }.
 */
async function triggerCompile(
  buildId: string,
  files: Record<string, string>,
): Promise<void> {
  const res = await fetch(`/api/preview/${buildId}/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  });

  let body: { success: boolean; error?: string } | null = null;
  try { body = await res.json(); } catch { /* ignore parse errors */ }

  if (!res.ok || body?.success === false) {
    throw new Error(body?.error ?? `Compile request failed (HTTP ${res.status})`);
  }
}

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

let _revisionManager: RevisionManager | null = null;
export const getRevisionManager = () => {
  if (!_revisionManager) _revisionManager = new RevisionManager(
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
  );
  return _revisionManager;
};
// для обратной совместимости в браузере
export const revisionManager = typeof window !== 'undefined' ? getRevisionManager() : null as any;
