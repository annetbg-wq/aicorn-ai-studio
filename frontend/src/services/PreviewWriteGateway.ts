/**
 * PreviewWriteGateway — Low-level transport for preview-workspace writes.
 *
 * Provides guarded access to the /__write_preview and /__clear_preview
 * Vite middleware endpoints. Every write goes through:
 *   1. Path normalization  (strips leading / and src/ prefix)
 *   2. Artifact-envelope poison check  (rejects transport JSON masquerading as source)
 *   3. Structured logging  (previewLog events for timeline grep)
 *   4. HTTP write with status check  (returns WriteResult, never throws on 4xx/5xx)
 *
 * Callers (backend-compiler era):
 *   - RevisionManager.fullClearPreview  — best-effort preflight clear before NEW-mode generation
 *     (non-fatal: /__clear_preview is a compatibility endpoint; it will 404 when no
 *      dev server is co-running, and the gateway silently swallows the error)
 *
 * NOT called by:
 *   - Generation compile  → uses triggerCompile (POST /api/preview/:buildId/compile)
 *   - Rollback            → navigates iframe to /preview/:activeRevisionId, then
 *                           waits for authoritative preview-mounted via waitForReady
 *   - restoreRevision     → navigates iframe to /preview/:revisionId (fast path)
 *                           then waits for preview-mounted; or materializePersistedFiles
 *                           (slow path) — never optimistic
 *   - promote fallback    → navigates iframe to /preview/:previousActiveRevisionId,
 *                           then waits for preview-mounted asynchronously
 *
 * This module does NOT manage lifecycle (compiling/ready/failed) — that stays
 * in PreviewController. It does NOT manage revision state — that stays in
 * RevisionManager. It is purely the write transport layer with guards.
 */

import { checkPreviewWrite } from './previewGuard';
import { previewLog } from './PreviewController';

// ── Types ────────────────────────────────────────────────────────────────────

export interface WriteOptions {
  /** Identifies the caller for logging/diagnostics. */
  source: string;
  /** Current buildId if available (attached to logs and guard rejections). */
  buildId?: string | null;
  /** Current projectId if available (attached to guard rejections). */
  projectId?: string | null;
}

export interface WriteResult {
  /** Whether the write was accepted and sent to the middleware. */
  written: boolean;
  /** If not written, the reason (guard rejection or fetch error). */
  reason?: string;
}

export interface BatchResult {
  /** Total files attempted. */
  total: number;
  /** Files successfully written. */
  written: number;
  /** Files blocked by the content guard. */
  blocked: string[];
  /** Files that failed due to network/middleware errors. */
  failed: string[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const BATCH_SIZE = 5;
const WRITE_TIMEOUT_BASE_MS = 8_000;
const WRITE_TIMEOUT_PER_FILE_MS = 1_000;
const CLEAR_TIMEOUT_MS = 5_000;
const MARKER_TIMEOUT_MS = 5_000;

/** Adaptive write timeout: base + per-file in batch (large files take longer). */
function getWriteTimeout(batchSize: number): number {
  return WRITE_TIMEOUT_BASE_MS + batchSize * WRITE_TIMEOUT_PER_FILE_MS;
}

// ── Path normalization ──────────────────────────────────────────────────────

/**
 * Canonical path normalization for preview writes.
 * Strips leading `/` and `src/` prefix — the middleware writes into preview-workspace/src/.
 */
export function normalizePath(p: string): string {
  let clean = p.startsWith('/') ? p.slice(1) : p;
  if (clean.startsWith('src/')) clean = clean.slice(4);
  return clean;
}

// ── Timeout helper ──────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Preview bridge timeout after ${ms}ms`)), ms),
  );
  return Promise.race([promise, timer]);
}

// ── Single file write ───────────────────────────────────────────────────────

/**
 * Write a single file to preview-workspace/src/ via the Vite middleware.
 *
 * Applies:
 *   1. Path normalization
 *   2. Artifact-envelope poison check (checkPreviewWrite)
 *   3. Structured logging (previewLog)
 *   4. HTTP write with status check
 *
 * Returns a WriteResult — callers decide whether to throw or skip on rejection.
 */
export async function writeFile(
  path: string,
  content: string,
  opts: WriteOptions,
): Promise<WriteResult> {
  const cleanPath = normalizePath(path);

  // ── Guard: artifact-envelope poison check ──────────────────────
  const rejection = checkPreviewWrite(cleanPath, content, opts.source, {
    buildId: opts.buildId,
    projectId: opts.projectId,
  });
  if (rejection) {
    previewLog('gateway_write_blocked', {
      path: cleanPath,
      source: opts.source,
      buildId: opts.buildId ?? null,
      projectId: opts.projectId ?? null,
      contentLength: content.length,
    });
    return {
      written: false,
      reason: `Blocked artifact-envelope write to ${cleanPath}: ${rejection.reason}`,
    };
  }

  // ── Write via middleware ────────────────────────────────────────
  try {
    const r = await fetch('/__write_preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: cleanPath, content }),
    });
    if (!r.ok) {
      const reason = `write_preview failed for ${cleanPath}: ${r.status}`;
      previewLog('gateway_write_error', {
        path: cleanPath,
        source: opts.source,
        buildId: opts.buildId ?? null,
        status: r.status,
      });
      return { written: false, reason };
    }
  } catch (err) {
    const reason = `write_preview network error for ${cleanPath}: ${err}`;
    previewLog('gateway_write_error', {
      path: cleanPath,
      source: opts.source,
      buildId: opts.buildId ?? null,
      error: String(err),
    });
    return { written: false, reason };
  }

  previewLog('gateway_write_ok', {
    path: cleanPath,
    source: opts.source,
    buildId: opts.buildId ?? null,
    size: content.length,
  });
  return { written: true };
}

// ── Batch write ─────────────────────────────────────────────────────────────

/**
 * Write multiple files in parallel batches of 5.
 *
 * Each file goes through the same normalization + guard + logging as writeFile.
 * Files that fail the guard are skipped (not written), and reported in the result.
 *
 * Excludes `__build_id.ts` — use writeBuildMarker() for that.
 */
export async function writeBatch(
  files: Record<string, string>,
  opts: WriteOptions,
): Promise<BatchResult> {
  const entries = Object.entries(files).filter(
    ([p]) => normalizePath(p) !== '__build_id.ts',
  );

  const result: BatchResult = {
    total: entries.length,
    written: 0,
    blocked: [],
    failed: [],
  };

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const results = await withTimeout(
      Promise.all(
        batch.map(async ([filePath, content]) => {
          const cleanPath = normalizePath(filePath);
          if (!cleanPath) return; // empty path after normalization
          const wr = await writeFile(filePath, content, opts);
          if (wr.written) {
            result.written++;
          } else if (wr.reason?.includes('Blocked artifact-envelope')) {
            result.blocked.push(cleanPath);
          } else {
            result.failed.push(cleanPath);
          }
        }),
      ),
      getWriteTimeout(batch.length),
    );
  }

  previewLog('gateway_batch_done', {
    source: opts.source,
    buildId: opts.buildId ?? null,
    total: result.total,
    written: result.written,
    blocked: result.blocked.length,
    failed: result.failed.length,
  });

  return result;
}

// ── Build marker write ──────────────────────────────────────────────────────

/**
 * Write `__build_id.ts` to preview-workspace/src/.
 *
 * In the Vite dev-server (HMR) path: triggers main.tsx's hot.accept hook
 * which updates buildId state → MountReporter re-runs its useEffect →
 * posts `preview-mounted` to settle waitForReady.
 *
 * In the backend-compiler (production) path: the backend stamps __build_id.ts
 * server-side during `vite build`, so this function is NOT called in the
 * canonical compile flow. It is retained for compatibility with any dev-mode
 * or test paths that use the Vite dev server directly.
 *
 * This MUST be called LAST in any write batch (dev-server path only).
 * No poison check needed — content is system-generated.
 */
export async function writeBuildMarker(
  buildId: string,
  opts: WriteOptions,
): Promise<void> {
  const content = `export const BUILD_ID = ${JSON.stringify(buildId)};\n`;

  previewLog('gateway_build_marker_start', {
    buildId,
    source: opts.source,
  });

  await withTimeout(
    fetch('/__write_preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '__build_id.ts', content }),
    }).then((r) => {
      if (!r.ok) throw new Error(`__build_id write failed: ${r.status}`);
    }),
    MARKER_TIMEOUT_MS,
  );

  previewLog('gateway_build_marker_done', {
    buildId,
    source: opts.source,
  });
}

// ── Clear preview ───────────────────────────────────────────────────────────

/**
 * Best-effort compatibility clear of preview-workspace/src/ via /__clear_preview.
 *
 * NON-CANONICAL / PREFLIGHT ONLY: this is a compatibility shim and is NOT part of
 * readiness semantics. The preview-mounted(buildId) lifecycle proceeds regardless
 * of whether this call succeeds or 404s (e.g. when no dev server is co-running).
 *
 * @param opts.source — caller identification for logging
 * @param opts.buildId — optional, for log correlation
 */
export async function clearPreview(opts: WriteOptions): Promise<void> {
  previewLog('gateway_clear_start', {
    source: opts.source,
    buildId: opts.buildId ?? null,
  });

  try {
    const r = await withTimeout(
      fetch('/__clear_preview', { method: 'POST' }),
      CLEAR_TIMEOUT_MS,
    );
    if (!r.ok) throw new Error(`clear_preview failed: ${r.status}`);
    previewLog('gateway_clear_done', {
      source: opts.source,
      buildId: opts.buildId ?? null,
    });
  } catch (err) {
    previewLog('gateway_clear_error', {
      source: opts.source,
      buildId: opts.buildId ?? null,
      error: String(err),
    });
    throw err;
  }
}
