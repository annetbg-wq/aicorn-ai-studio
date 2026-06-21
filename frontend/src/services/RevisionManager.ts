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
import { appendPreviewSessionToUrl, getPreviewSessionToken } from './PreviewSessionService';
import { checkPreviewWrite } from './previewGuard';
import {
  clearPreview as gatewayClear,
  normalizePath,
} from './PreviewWriteGateway';
import {
  cancelPendingCheck,
  cancelPostPromotionWatch,
  inspectPreviewRenderSurface,
  startPostPromotionWatch,
  type PostReadyDiagnosticResult,
} from './WhiteScreenDetector';

const MAX_REVISIONS = 20;

/**
 * Sentinel included in the error thrown when materializePersistedFiles is
 * rejected because a generation run owns the preview path. Callers (e.g.
 * ProjectRepository, ProjectStorage) test for this string to distinguish an
 * isolation-skip from a genuine failure.
 */
export const PRELOAD_SKIP_OWNED_MSG = 'generation currently owns the preview path';
export const PREVIEW_BOOTSTRAP_MARKER = 'data-preview-bootstrap="true"';

/**
 * Adaptive compile timeout: scales with file count.
 * - Base: 15s (enough for 1-3 file apps)
 * - Per file: +2s (backend vite build scales with module count)
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

export interface CandidateMaterializeOptions {
  /** Caller identity for timeline logs. */
  source: string;
  /** Optional project id for log context. */
  projectId?: string | null;
}

export type PromotionMode = 'normal' | 'degraded';

export class RevisionManager {
  private activeRevisionId: string | null = null;
  private candidateRevisionId: string | null = null;

  /**
   * Set by compileCandidate on success, checked by promote().
   * Prevents promoting a candidate that was never compiled or whose
   * compilation failed. Reset to null on createCandidate / rollback.
   */
  private compiledRevisionId: string | null = null;

  /**
   * When true, the preview path is owned by an in-progress generation run.
   * Calls to materializePersistedFiles (preload / project-switch) will be
   * rejected early to prevent stale hydration from re-entering the preview
   * cycle while a generation is active.
   */
  private _generationOwned = false;

  /** revisionId → { normalizedPath → content } */
  private store = new Map<string, Record<string, string>>();

  constructor(
    private previewUrl: string =
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
  ) {}

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
    const placeholder = `export default function App() {
  return (
    <main
      data-preview-bootstrap="true"
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        background: 'linear-gradient(135deg, #0f172a 0%, #111827 100%)',
        color: '#e5eefb',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <section
        style={{
          width: 'min(560px, 100%)',
          borderRadius: '18px',
          border: '1px solid rgba(148, 163, 184, 0.28)',
          background: 'rgba(15, 23, 42, 0.92)',
          boxShadow: '0 18px 48px rgba(15, 23, 42, 0.28)',
          padding: '24px',
        }}
      >
        <p style={{ margin: '0 0 8px', fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#93c5fd' }}>
          Studio ready
        </p>
        <h1 style={{ margin: '0 0 12px', fontSize: '28px', lineHeight: 1.2 }}>
          Start your next project
        </h1>
        <p style={{ margin: '0 0 18px', lineHeight: 1.6, color: '#cbd5e1' }}>
          Describe the app, page, or workflow you want to build. The generated preview will appear here.
        </p>
        <button
          type="button"
          style={{
            padding: '12px 16px',
            borderRadius: '12px',
            border: 'none',
            background: '#38bdf8',
            color: '#082f49',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Describe your idea
        </button>
      </section>
    </main>
  );
}\n`;
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
    // Generation-owned isolation guard: refuse preloads while a generation run
    // owns the preview path. This prevents stale project hydration from creating
    // a candidate that would orphan or interfere with the generation's candidate.
    if (this._generationOwned) {
      previewLog('preload_skipped_stale_project', {
        source: opts.source,
        projectId: opts.projectId ?? null,
        reason: 'generation_owns_preview',
        activeRevisionId: this.activeRevisionId,
        candidateRevisionId: this.candidateRevisionId,
      });
      throw new Error(
        `[RevisionManager] Preload skipped: ${PRELOAD_SKIP_OWNED_MSG} ` +
        `(source=${opts.source})`,
      );
    }

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
   * Materialize the candidate workspace in-memory from a flat file map.
   *
   * This is the execute-first truth boundary for generation: once artifact
   * ingress is accepted, the next authoritative state is whether the candidate
   * workspace can actually be materialized and executed.
   */
  async materializeCandidateFiles(
    revisionId: string,
    files: Record<string, string>,
    opts: CandidateMaterializeOptions,
  ): Promise<{ writtenCount: number }> {
    const entries = Object.entries(files ?? {});
    previewLog('candidate_materialization_start', {
      buildId: revisionId,
      source: opts.source,
      projectId: opts.projectId ?? null,
      fileCount: entries.length,
    });

    try {
      let writtenCount = 0;
      for (const [path, content] of entries) {
        await this.writeCandidateFile(revisionId, path, content);
        writtenCount++;
      }

      previewLog('candidate_materialization_success', {
        buildId: revisionId,
        source: opts.source,
        projectId: opts.projectId ?? null,
        fileCount: writtenCount,
      });
      return { writtenCount };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      previewLog('candidate_materialization_failed', {
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
   * Compile the candidate revision via the backend compile endpoint.
   *
   * POSTs files → POST /api/preview/:buildId/compile → vite build →
   * builds/:buildId/ static output. Waits for the authoritative
   * `preview-mounted` postMessage before resolving.
   *
   * On success, sets the internal compiled flag so promote() will accept
   * this revision. On failure, the flag remains unset — promote() will refuse.
   *
   * PROMOTION CONTRACT: promote(revId) requires compileCandidate(revId)
   * to have returned { success: true } first. This is enforced at runtime.
   *
   * NOTE: This is the backend-compiler path. It does NOT use Vite HMR
   * hot-module replacement — it produces immutable static builds in
   * builds/:buildId/ and waits for `preview-mounted` from MountReporter.
   */
  async compileCandidate(
    revisionId: string,
    skeletonId?: string,
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
    // Cancel any pending delayed diagnostic/watch from a previous promotion.
    cancelPendingCheck();
    cancelPostPromotionWatch();

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
      await triggerCompile(revisionId, files, skeletonId);
    } catch (e: any) {
      const msg: string = e?.message ?? 'Backend compile failed';
      previewLog('write_batch_done', { buildId: revisionId, fileCount, error: msg });
      // Staleness guard: only poison the controller if this revision is still
      // authoritative. A preload whose triggerCompile failed after a generation
      // took over must not set the controller to failed.
      if (this._isRevisionAuthoritative(revisionId)) {
        previewController.setDiagnosticError('iframe-mounted', msg, revisionId);
        previewController.notifyFailed(msg, revisionId);
      } else {
        previewLog('stale_compile_result_ignored', {
          buildId: revisionId,
          stage: 'trigger_compile',
          currentCandidateRevisionId: this.candidateRevisionId,
          currentActiveRevisionId: this.activeRevisionId,
        });
      }
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
    const nextPreviewUrl = appendPreviewSessionToUrl(`/preview/${revisionId}`);
    if (iframe) {
      const absoluteNextUrl = new URL(nextPreviewUrl, window.location.origin).toString();
      if (iframe.src === absoluteNextUrl) {
        iframe.src = 'about:blank';
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });
      }
      iframe.src = nextPreviewUrl;
    }

    // 2. Wait for `preview-mounted` from the static build's MountReporter.
    //    MountReporter fires useEffect → window.parent.postMessage({type:'preview-mounted', buildId})
    //    after the React tree commits. Same-origin iframe → originOk passes.
    const timeoutMs = getCompileTimeout(fileCount);
    previewLog('wait_ready_start', { buildId: revisionId, fileCount, timeoutMs });
    const result = await waitForReady(revisionId, timeoutMs, this.previewUrl);

    if (result.success) {
      const previewUrl = nextPreviewUrl;
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

      return { success: true, _compiled: true };
    } else {
      // Staleness guard: a preload's waitForReady timeout can fire long after a
      // generation has taken over. If this revision is no longer the current
      // candidate/compiled/active, suppress notifyFailed to avoid poisoning the
      // controller state for the fresh generation that has already promoted.
      if (this._isRevisionAuthoritative(revisionId)) {
        previewController.setDiagnosticError(
          'iframe-mounted',
          result.errors?.join('\n') ?? 'Compilation failed',
          revisionId,
        );
        previewController.notifyFailed(
          result.errors?.join('\n') ?? 'Compilation failed',
          revisionId,
        );
      } else {
        previewLog('stale_compile_result_ignored', {
          buildId: revisionId,
          stage: 'wait_for_ready_timeout',
          currentCandidateRevisionId: this.candidateRevisionId,
          currentActiveRevisionId: this.activeRevisionId,
        });
      }
      return { success: false, errors: result.errors, _compiled: false };
    }
  }

  /** Public wrapper so other call sites (e.g. ProjectRepository.loadToPreview) can wait. */
  async waitForReady(
    buildId: string,
    timeoutMs?: number,
  ): Promise<{ success: boolean; errors?: string[] }> {
    return waitForReady(buildId, timeoutMs);
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
  *   Gate 2 — immediate render-surface check: verifies the iframe is not blank
  *             or placeholder-only immediately after mount. If Gate 2 fails → last-good is restored,
   *             notifyFailed is called, state is cleaned up, PROMOTE_BLOCKED thrown.
   *
   * After Gate 2 passes, a separate bounded post-promotion watchdog may still
   * revoke the just-promoted revision for a few seconds if delayed diagnostics
   * confirm it became unhealthy. That watchdog is a safety net, not a second
   * promote decision path.
   */
  async promote(
    revisionId: string,
    opts: { mode?: PromotionMode } = {},
  ): Promise<void> {
    const promotionMode = opts.mode ?? 'normal';
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
    // Give React.lazy() chunks up to 600 ms to load before the surface check.
    // Apps with eager routes pass immediately; lazy-route apps need one or two
    // async chunk fetches that complete well within this window.
    {
      const SETTLE_MS = 600;
      const POLL_MS = 80;
      const deadline = Date.now() + SETTLE_MS;
      while (Date.now() < deadline) {
        const probe = inspectPreviewRenderSurface(revisionId);
        if (probe.healthy) break;
        await new Promise(r => setTimeout(r, POLL_MS));
      }
    }
    const immediateSurface = inspectPreviewRenderSurface(revisionId);
    if (!immediateSurface.healthy) {
      previewLog('promote_blocked_white_screen', {
        buildId: revisionId,
        previousActiveRevisionId,
        promotionMode,
        renderFailureReason: immediateSurface.failureReason,
        probeReason: immediateSurface.probeReason,
      });
      previewLog('promotion_blocked_not_rendered', {
        buildId: revisionId,
        previousActiveRevisionId,
        promotionMode,
        renderFailureReason: immediateSurface.failureReason,
        probeReason: immediateSurface.probeReason,
        rootChildCount: immediateSurface.metrics?.rootChildCount ?? null,
        rootTextLength: immediateSurface.metrics?.rootInnerTextLength ?? null,
        rootTextHead: immediateSurface.metrics?.rootTextHead ?? '',
      });
      previewController.setDiagnosticError(
        'white-screen-detected',
        immediateSurface.message.replace('Final live-preview check failed: ', ''),
        revisionId,
      );

      // Restore last-good: navigate the iframe back to the previous active build.
      // builds/:previousActiveRevisionId/ is already on disk — no re-compile needed.
      // MAX_BUILDS=20 LRU ensures recent builds survive the current session.
      //
      // READINESS CONTRACT:
      //   • previousActiveRevisionId exists → notifyCompiling(previousActiveRevisionId) is
      //     called immediately (arms expectingBuildId for last-good mount guard).
      //     notifyFailed / notifyReady then settle asynchronously once waitForReady
      //     resolves for the last-good build (fire-and-forget — does not delay the throw).
      //   • no previousActiveRevisionId → notifyFailed is called synchronously (else-branch).
      // In both cases PROMOTE_BLOCKED is thrown after the synchronous notification.
      // We do NOT signal ready until authoritative preview-mounted confirms the mount.
      if (previousActiveRevisionId) {
        const lastGoodIframe = document.querySelector<HTMLIFrameElement>(
          'iframe[data-testid="preview-iframe"]',
        );
        if (lastGoodIframe) {
          previewLog('promote_restore_last_good', { buildId: previousActiveRevisionId });
          lastGoodIframe.src = appendPreviewSessionToUrl(`/preview/${previousActiveRevisionId}`);
          // Arm the expectingBuildId guard then wait asynchronously for mount.
          // If mount succeeds, transition from failed → ready for the last-good build.
          // If it times out, the UI stays in 'failed' state — honest, no fake-ready.
          previewController.notifyCompiling(previousActiveRevisionId);
          waitForReady(previousActiveRevisionId, 15_000, this.previewUrl).then((r) => {
            if (r.success) {
              this.activeRevisionId = previousActiveRevisionId;
              this.syncTimelineContext();
              previewController.notifyReady(previousActiveRevisionId, 'last_good_mounted');
              previewLog('promote_last_good_mounted', { buildId: previousActiveRevisionId });
            } else {
              // Last-good also failed to mount — leave in failed state.
              previewController.notifyFailed(
                r.errors?.join('\n') ?? 'Last-good preview did not mount',
                previousActiveRevisionId,
              );
              previewLog('promote_last_good_mount_failed', {
                buildId: previousActiveRevisionId,
                errors: r.errors,
              });
            }
          }).catch(() => { /* notifyFailed already called on rejection above */ });
        }
      } else {
        // No previous active revision — nothing to restore.
        previewController.notifyFailed(
          immediateSurface.message.replace('Final live-preview check failed: ', ''),
          revisionId,
        );
      }

      // Reset state before throw so candidateRevisionId/compiledRevisionId are
      // not left populated — next createCandidate() must not see a stale orphan.
      this.candidateRevisionId = null;
      this.compiledRevisionId = null;
      this.syncTimelineContext();
      // notifyFailed lifecycle:
      //   - no previousActiveRevisionId: called in the else-branch above (synchronous).
      //   - previousActiveRevisionId exists: notifyCompiling was called to arm
      //     expectingBuildId; the async waitForReady will call either notifyReady
      //     (on success) or notifyFailed (on timeout/error). The controller is
      //     left in 'compiling' state briefly — that is intentional: it transitions
      //     to 'ready' or 'failed' once the async mount result arrives.
      throw new Error('PROMOTE_BLOCKED: white_screen_after_ready');
    }

    this.activeRevisionId = revisionId;
    this.candidateRevisionId = null;
    this.compiledRevisionId = null; // Consumed — next candidate must compile fresh
    this.syncTimelineContext();

    previewLog('candidate_promoted', {
      buildId: revisionId,
      promotionMode,
      degraded: promotionMode === 'degraded',
    });
    startPostPromotionWatch(revisionId, {
      previousActiveRevisionId,
      promotionMode,
      onUnhealthy: (result) =>
        this.revokePromotedRevision(revisionId, previousActiveRevisionId, result, promotionMode),
    });
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
   *
   * READINESS CONTRACT: notifyReady is NOT called optimistically on iframe
   * navigation. The method waits for an authoritative `preview-mounted`
   * postMessage with a matching buildId before signaling ready. This prevents
   * fake-ready when the browser hasn't yet loaded the static build.
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
    // builds/:activeRevisionId/ is still on disk — no re-compile needed.
    // Wait for authoritative preview-mounted before signaling ready.
    if (this.activeRevisionId) {
      const targetId = this.activeRevisionId;
      console.log(`[RevisionManager] rolling back to active ${targetId}`);
      // Signal compiling so PreviewController sets expectingBuildId — this arms
      // the buildId-mismatch guard inside notifyReady and makes the lifecycle
      // transition explicit in the UI (brief 'compiling' flash is acceptable).
      previewController.notifyCompiling(targetId);
      const iframe = document.querySelector<HTMLIFrameElement>(
        'iframe[data-testid="preview-iframe"]',
      );
      if (iframe) iframe.src = appendPreviewSessionToUrl(`/preview/${targetId}`);
      // Wait for the static build's MountReporter to post preview-mounted.
      // Timeout is short (15 s) — rollback target is an already-compiled build.
      const result = await waitForReady(targetId, 15_000, this.previewUrl);
      if (result.success) {
        previewController.notifyReady(targetId, 'rollback_restore_mounted');
        previewLog('rollback_restored', { buildId: targetId });
      } else {
        previewController.notifyFailed(
          result.errors?.join('\n') ?? 'Rollback preview did not mount',
          targetId,
        );
        previewLog('rollback_restore_failed', {
          buildId: targetId,
          errors: result.errors,
        });
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

  /**
   * Claim preview ownership on behalf of a generation run.
   *
   * After this call, materializePersistedFiles() (the preload/project-switch
   * path) will be rejected until releasePreviewOwnership() is called. This
   * prevents stale project hydration from re-entering the preview cycle while
   * a generation is actively compiling and promoting a candidate.
   *
   * Call before creating the generation candidate; call releasePreviewOwnership()
   * in the generation's finally block (or on cancellation).
   */
  claimPreviewOwnership(source?: string): void {
    this._generationOwned = true;
    previewLog('current_run_preview_isolated', {
      source: source ?? 'unknown',
      activeRevisionId: this.activeRevisionId,
      candidateRevisionId: this.candidateRevisionId,
    });
  }

  /** Release generation ownership so preloads may resume (e.g. after generation completes). */
  releasePreviewOwnership(): void {
    this._generationOwned = false;
    previewLog('generation_preview_ownership_released', {
      activeRevisionId: this.activeRevisionId,
    });
  }

  /**
   * Restore a previously promoted revision (undo/redo).
   *
   * Fast path  — builds/:revisionId/ is still on disk (common; LRU keeps
   *              MAX_BUILDS=20 entries). Navigate the iframe directly to
   *              /preview/:revisionId without any compile step.
   *              READINESS CONTRACT: even on the fast path, notifyReady is
   *              NOT called until the iframe's MountReporter posts an
   *              authoritative `preview-mounted` message with a matching
   *              buildId. This prevents fake-ready before the browser has
   *              actually loaded and rendered the static build.
   * Slow path  — build was LRU-evicted (rare; requires >20 newer builds).
   *              Re-materialize via materializePersistedFiles() which already
   *              waits for the full compile + preview-mounted contract.
   */
  async restoreRevision(revisionId: string): Promise<void> {
    const files = this.store.get(revisionId);
    if (!files) throw new Error(`Unknown revision: ${revisionId}`);

    const buildExists = await this._checkBuildExists(revisionId);
    if (buildExists) {
      // Fast path: compiled output is on disk — navigate and wait for mount.
      // notifyCompiling sets expectingBuildId so the buildId-mismatch guard
      // inside notifyReady is armed before the iframe navigates.
      previewController.notifyCompiling(revisionId);
      const iframe = document.querySelector<HTMLIFrameElement>(
        'iframe[data-testid="preview-iframe"]',
      );
      if (iframe) iframe.src = appendPreviewSessionToUrl(`/preview/${revisionId}`);
      // Wait for authoritative preview-mounted from the static build.
      // Timeout 15 s — build is already compiled; only navigation latency.
      const result = await waitForReady(revisionId, 15_000, this.previewUrl);
      if (result.success) {
        this.activeRevisionId = revisionId;
        this.syncTimelineContext();
        previewController.notifyReady(revisionId, 'revision_restored_mounted');
        previewLog('revision_restored', { buildId: revisionId, path: 'direct' });
      } else {
        previewController.notifyFailed(
          result.errors?.join('\n') ?? 'Restored preview did not mount',
          revisionId,
        );
        previewLog('revision_restore_failed', {
          buildId: revisionId,
          path: 'direct',
          errors: result.errors,
        });
        throw new Error(
          `restoreRevision: preview-mounted not received for ${revisionId}. ` +
          (result.errors?.join('; ') ?? 'timeout'),
        );
      }
    } else {
      // Slow path: build was LRU-evicted — re-compile from in-memory files.
      // materializePersistedFiles already waits for the full compile +
      // preview-mounted contract; no additional waitForReady needed here.
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
      const r = await fetch(appendPreviewSessionToUrl(`/preview/${buildId}/`), { method: 'HEAD' });
      return r.ok;
    } catch {
      return false;
    }
  }

  // ── Context sync ───────────────────────────────────────────────

  /**
   * Returns true if `revisionId` is still authoritative — i.e. it is the
   * current candidate, the last successfully compiled revision, or the active
   * revision. Used as a staleness guard: a revision that is no longer
   * authoritative must not mutate shared controller state (notifyFailed, etc.)
   * because a newer generation may have taken over.
   */
  private _isRevisionAuthoritative(revisionId: string): boolean {
    return (
      revisionId === this.candidateRevisionId ||
      revisionId === this.compiledRevisionId ||
      revisionId === this.activeRevisionId
    );
  }

  /** Push current revision IDs into the ambient previewLog context. */
  private syncTimelineContext(): void {
    setTimelineContext({
      activeRevisionId: this.activeRevisionId,
      candidateRevisionId: this.candidateRevisionId,
    });
  }

  // ── Private helpers ────────────────────────────────────────────

  /**
   * Best-effort preflight clear before NEW-mode generation.
   * Posts to /__clear_preview to remove stale files from preview-workspace/src/
   * so they cannot leak into the next backend compile.
   *
   * COMPATIBILITY / BEST-EFFORT: /__clear_preview is a compatibility endpoint
   * for any Vite dev-server path that may be co-running. It will 404 when no
   * dev server is present, and the gateway silently swallows that error. This
   * call is NOT part of canonical readiness semantics and does NOT affect
   * the preview-mounted(buildId) lifecycle.
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

  private async revokePromotedRevision(
    revisionId: string,
    previousActiveRevisionId: string | null,
    diagnostic: PostReadyDiagnosticResult,
    promotionMode: PromotionMode,
  ): Promise<void> {
    if (this.activeRevisionId !== revisionId) {
      previewLog('promotion_revoked', {
        buildId: revisionId,
        previousActiveRevisionId,
        promotionMode,
        outcome: 'ignored_stale_revision',
        currentActiveRevisionId: this.activeRevisionId,
        diagnosticReason: diagnostic.reason,
        probeReason: diagnostic.probeReason,
      });
      return;
    }

    previewLog('promotion_revoked', {
      buildId: revisionId,
      previousActiveRevisionId,
      promotionMode,
      outcome: 'revoked',
      diagnosticReason: diagnostic.reason,
      probeReason: diagnostic.probeReason,
      controllerStatus: diagnostic.controllerStatus,
      controllerRevisionId: diagnostic.controllerRevisionId,
    });

    if (!previousActiveRevisionId) {
      previewController.notifyFailed(
        `Promoted revision ${revisionId} became unhealthy after promotion`,
        revisionId,
      );
      previewLog('rollback_completed', {
        revokedBuildId: revisionId,
        restoredBuildId: null,
        promotionMode,
        status: 'skipped_no_previous_active',
        diagnosticReason: diagnostic.reason,
        probeReason: diagnostic.probeReason,
      });
      return;
    }

    this.activeRevisionId = previousActiveRevisionId;
    this.syncTimelineContext();
    previewController.notifyCompiling(previousActiveRevisionId);

    const iframe = document.querySelector<HTMLIFrameElement>(
      'iframe[data-testid="preview-iframe"]',
    );
    if (iframe) iframe.src = appendPreviewSessionToUrl(`/preview/${previousActiveRevisionId}`);

    const result = await this.waitForReady(previousActiveRevisionId, 15_000);
    if (result.success) {
      previewController.notifyReady(previousActiveRevisionId, 'post_promotion_rollback_mounted');
      previewLog('rollback_completed', {
        revokedBuildId: revisionId,
        restoredBuildId: previousActiveRevisionId,
        promotionMode,
        status: 'restored',
        diagnosticReason: diagnostic.reason,
        probeReason: diagnostic.probeReason,
      });
      return;
    }

    previewController.notifyFailed(
      result.errors?.join('\n') ?? 'Rollback preview did not mount',
      previousActiveRevisionId,
    );
    previewLog('rollback_completed', {
      revokedBuildId: revisionId,
      restoredBuildId: previousActiveRevisionId,
      promotionMode,
      status: 'failed',
      diagnosticReason: diagnostic.reason,
      probeReason: diagnostic.probeReason,
      errors: result.errors ?? [],
    });
  }

  /**
   * Reject a candidate without mutating the currently shown preview.
   *
   * Used for pre-execution failures (materialization rejected), terminal
   * fast-gate failures, or user cancellation before promotion.
   */
  rejectCandidate(revisionId: string, reason: string, error?: string): void {
    previewLog('candidate_rejected', {
      buildId: revisionId,
      reason,
      error: error ?? null,
      activeRevisionId: this.activeRevisionId,
    });
    this.discardCandidate(revisionId);
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
  skeletonId?: string,
): Promise<void> {
  let res: Response;
  const sessionId = getPreviewSessionToken();
  try {
    res = await fetch(`/api/preview/${buildId}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Preview-Session': sessionId },
      body: JSON.stringify({ files, ...(skeletonId ? { skeletonId } : {}), sessionId }),
    });
  } catch (networkErr: any) {
    throw new Error(
      `Backend server is unreachable. Make sure the backend is running (npm run dev:backend). ` +
      `Network error: ${networkErr?.message ?? String(networkErr)}`,
    );
  }

  let body: {
    success: boolean;
    error?: string;
    diagnostics?: Array<{
      root_cause_type?: string;
      file?: string | null;
      import_path?: string | null;
      expected?: string | null;
      actual?: string | null;
      suggested_fix?: string | null;
    }>;
  } | null = null;
  try { body = await res.json(); } catch { /* non-JSON response — backend likely down or proxy error */ }

  if (!res.ok || body?.success === false) {
    const detail = body?.error
      ?? (res.status === 500 && !body
        ? `Backend server returned an unexpected response (HTTP ${res.status}). ` +
          `Ensure the backend is running (npm run dev:backend).`
        : `Compile request failed (HTTP ${res.status})`);
    const diagnostics = body?.diagnostics ?? [];
    const firstDiagnostic = diagnostics[0];
    if (!firstDiagnostic) {
      throw new Error(detail);
    }
    // Render diagnostics as readable lines instead of a raw JSON dump so the
    // preview error panel shows a scannable report (root cause, file, fix).
    const formatDiagnostic = (d: typeof firstDiagnostic, index: number): string => {
      const lines: string[] = [];
      const heading = diagnostics.length > 1 ? `${index + 1}. ` : '';
      lines.push(`${heading}${d.root_cause_type ?? 'error'}`);
      if (d.file) lines.push(`   file: ${d.file}`);
      if (d.import_path) lines.push(`   import: ${d.import_path}`);
      if (d.expected) lines.push(`   expected: ${d.expected}`);
      if (d.actual) lines.push(`   actual: ${d.actual}`);
      if (d.suggested_fix) lines.push(`   fix: ${d.suggested_fix}`);
      return lines.join('\n');
    };
    const body_ = diagnostics.map(formatDiagnostic).join('\n\n');
    const header = diagnostics.length > 1
      ? `${detail}\n(${diagnostics.length} нарушений контракта генерации)`
      : detail;
    throw new Error([header, '', body_].join('\n'));
  }
}

/**
 * Wait for an authoritative `preview-mounted` postMessage scoped to `expectedBuildId`.
 *
 * Acceptance rules (ALL must hold):
 *   - message origin === window.location.origin (same-origin: /preview/:buildId is
 *     served by the same host as the studio, transparently proxied via vite.config.ts)
 *   - data.type === 'preview-mounted'
 *   - data.buildId === expectedBuildId
 *
 * Stale messages (a previous build's id, or `iframe-ready` from window load) are
 * logged and rejected, never resolve the promise.
 *
 * Hard error channels still settle the wait early:
 *   - `iframe-error` (runtime crash inside preview)
 *   - `vite:error`   (runtime or compilation error from the preview runtime)
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

      // Origin gate — only a message from the preview origin may finish a cycle.
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
  if (!_revisionManager) _revisionManager = new RevisionManager();
  return _revisionManager;
};
// для обратной совместимости в браузере
export const revisionManager = typeof window !== 'undefined' ? getRevisionManager() : null as any;
