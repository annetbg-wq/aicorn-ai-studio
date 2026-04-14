/**
 * previewGuard — Artifact-envelope poison detector for preview writes.
 *
 * Prevents transport-level artifact JSON from being written into preview-workspace
 * source files (e.g. App.tsx). The artifact envelope has this shape:
 *
 *   { "artifact": { "entry": "src/App.tsx", "files": [...] } }
 *
 * If such content reaches preview-workspace/src/App.tsx, Vite will fail with
 * a parse error because it expects JSX/TS, not JSON.
 *
 * This module provides a single shared detector used by every preview
 * write path (RevisionManager, ProjectStorage).
 */

import { previewLog } from './PreviewController';

// ── Detection ────────────────────────────────────────────────────────────────

/**
 * Returns true if `content` looks like an artifact-envelope JSON payload
 * rather than actual source code.
 *
 * Heuristics (ALL must hold for a positive match):
 *   1. Content starts with `{` (after optional whitespace)
 *   2. Content parses as valid JSON
 *   3. The parsed object has an `artifact` key with a nested `files` array,
 *      OR has a top-level `files` array where entries have `path` + `content` keys.
 *
 * This deliberately does NOT flag partial matches or loose JSON fragments
 * inside otherwise valid source code (e.g. a string literal containing "artifact").
 */
export function isArtifactEnvelope(content: string): boolean {
  const trimmed = content.trimStart();
  // Fast reject: source code almost never starts with `{`
  // (arrow functions `() => {` don't — the `(` comes first)
  if (!trimmed.startsWith('{')) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return false; // Not valid JSON — probably real source code
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const obj = parsed as Record<string, unknown>;

  // Shape 1: { "artifact": { "files": [...] } }
  if (obj.artifact && typeof obj.artifact === 'object' && !Array.isArray(obj.artifact)) {
    const inner = obj.artifact as Record<string, unknown>;
    if (Array.isArray(inner.files) && inner.files.length > 0) {
      const first = inner.files[0] as Record<string, unknown> | null;
      if (first && typeof first.path === 'string' && typeof first.content === 'string') {
        return true;
      }
    }
  }

  // Shape 2: { "files": [{ "path": "...", "content": "..." }] }
  if (Array.isArray(obj.files) && obj.files.length > 0) {
    const first = obj.files[0] as Record<string, unknown> | null;
    if (first && typeof first.path === 'string' && typeof first.content === 'string') {
      return true;
    }
  }

  return false;
}

// ── Enforcement ──────────────────────────────────────────────────────────────

export interface PreviewWriteRejection {
  path:       string;
  source:     string;
  reason:     string;
  buildId?:   string | null;
  projectId?: string | null;
}

/**
 * Validate content before writing to preview-workspace. Returns null if safe,
 * or a rejection record if the content is an artifact envelope.
 *
 * Callers MUST check the return and refuse to write if non-null.
 */
export function checkPreviewWrite(
  path: string,
  content: string,
  source: string,
  opts?: { buildId?: string | null; projectId?: string | null },
): PreviewWriteRejection | null {
  if (!isArtifactEnvelope(content)) return null;

  const rejection: PreviewWriteRejection = {
    path,
    source,
    reason: 'Content is an artifact-envelope JSON payload, not source code',
    buildId:   opts?.buildId ?? null,
    projectId: opts?.projectId ?? null,
  };

  previewLog('preview_write_blocked', {
    path,
    source,
    buildId:   rejection.buildId,
    projectId: rejection.projectId,
    contentLength: content.length,
    contentHead: content.slice(0, 120),
  });

  return rejection;
}
