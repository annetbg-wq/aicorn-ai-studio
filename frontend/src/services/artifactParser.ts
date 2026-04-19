import type { ArtifactFile, ArtifactContract, ArtifactParseResult } from '../types/artifact';

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizePath(p: string): string {
  let out = p.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!out.startsWith('src/')) out = 'src/' + out;
  return out;
}

function findMatchingBrace(str: string, start: number): number {
  let depth = 0;
  for (let i = start; i < str.length; i++) {
    if (str[i] === '{') depth++;
    else if (str[i] === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function tryParseJson(str: string): unknown | null {
  try { return JSON.parse(str); } catch { return null; }
}

function detectEntry(files: ArtifactFile[], hint?: string): string {
  if (hint) {
    const norm = normalizePath(hint);
    if (files.some(f => f.path === norm)) return norm;
  }
  const app = files.find(f => /App\.tsx$/i.test(f.path));
  if (app) return app.path;
  return files[0]?.path ?? 'src/App.tsx';
}

// ─── Strategy: fenced ```json block ────────────────────────────────────────

function tryFencedJson(raw: string): unknown | null {
  const re = /```json\s*\n([\s\S]*?)```/i;
  const m = re.exec(raw);
  if (!m) return null;
  return tryParseJson(m[1].trim());
}

// ─── Strategy: first '{' with "artifact" or "files" key ────────────────────

function tryLooseJson(raw: string): unknown | null {
  const idx = raw.search(/\{[\s\S]*?"(?:artifact|files)"/);
  if (idx === -1) return null;
  const end = findMatchingBrace(raw, idx);
  if (end === -1) return null;
  return tryParseJson(raw.slice(idx, end + 1));
}

// ─── Strategy: entire raw is JSON ──────────────────────────────────────────

function tryWholeJson(raw: string): unknown | null {
  return tryParseJson(raw.trim());
}

// ─── Validate files array ──────────────────────────────────────────────────

function extractFiles(obj: unknown): ArtifactFile[] | null {
  if (!obj || typeof obj !== 'object') return null;
  const rec = obj as Record<string, unknown>;

  let arr: unknown[] | null = null;
  if (Array.isArray(rec.files)) arr = rec.files;
  else if (rec.artifact && typeof rec.artifact === 'object') {
    const inner = rec.artifact as Record<string, unknown>;
    if (Array.isArray(inner.files)) arr = inner.files;
  }
  if (!arr || arr.length === 0) return null;

  const out: ArtifactFile[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const f = item as Record<string, unknown>;
    if (typeof f.path !== 'string' || typeof f.content !== 'string') continue;
    if (f.content.length === 0) continue;
    out.push({
      path: normalizePath(f.path),
      content: f.content,
      ...(typeof f.role === 'string' ? { role: f.role as ArtifactFile['role'] } : {}),
    });
  }
  return out.length > 0 ? out : null;
}

function extractMeta(obj: unknown): {
  entry?: string; revisionId?: string; routes?: string[];
  dependencies?: string[]; theme?: string;
} {
  if (!obj || typeof obj !== 'object') return {};
  const rec = obj as Record<string, unknown>;
  const src = (rec.artifact && typeof rec.artifact === 'object')
    ? rec.artifact as Record<string, unknown> : rec;

  return {
    entry: typeof src.entry === 'string' ? src.entry : undefined,
    revisionId: typeof src.revisionId === 'string' ? src.revisionId : undefined,
    routes: Array.isArray(src.routes) ? src.routes.filter((r): r is string => typeof r === 'string') : undefined,
    dependencies: Array.isArray(src.dependencies) ? src.dependencies.filter((d): d is string => typeof d === 'string') : undefined,
    theme: typeof src.theme === 'string' ? src.theme : undefined,
  };
}

// ─── Strategy 6: validate that a block is actually code ───────────────────

function validateFile(content: string): boolean {
  const t = content.trim();
  if (t.length < 30) return false;
  return /(?:import\s|export\s|function\s|const\s|class\s|return\s*[(<]|=>)/.test(t);
}

// ─── Strategy 3: infer filename from export declarations ──────────────────

function inferFileName(content: string, used: Set<string>): string {
  // export default function/class Name
  let m = /export\s+default\s+(?:function|class)\s+([A-Z][A-Za-z0-9]*)/.exec(content);
  if (m) return `src/${m[1]}.tsx`;

  // export const Name: or export const Name = (PascalCase → component)
  m = /export\s+const\s+([A-Z][A-Za-z0-9]*)\s*[:=]/.exec(content);
  if (m) return `src/${m[1]}.tsx`;

  // export function name (any case → capitalise)
  m = /export\s+function\s+([A-Za-z][A-Za-z0-9]*)/.exec(content);
  if (m) return `src/${m[1].charAt(0).toUpperCase() + m[1].slice(1)}.tsx`;

  // fallback — App.tsx unless already used
  if (!used.has('src/App.tsx')) return 'src/App.tsx';
  let i = 2;
  while (used.has(`src/Component${i}.tsx`)) i++;
  return `src/Component${i}.tsx`;
}

// ─── Legacy <!--FILE:--> fallback ──────────────────────────────────────────

export function parseFileMarkers(raw: string): Record<string, string> {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```\w*\s*\n?/, '').replace(/\n?\s*```$/, '');

  const files: Record<string, string> = {};
  const markerRe = /<!--FILE:(\/?.+?)-->/g;
  const markers: Array<{ path: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(cleaned)) !== null) {
    markers.push({ path: m[1].trim(), index: m.index + m[0].length });
  }

  if (markers.length === 0) {
    // Strategy 2: named fenced blocks  ```tsx FileName.tsx
    const fenceRe = /```(?:tsx?|jsx?)\s+(?:\/\/\s*)?([\w/.+-]+\.(?:tsx?|jsx?))[ \t]*\n([\s\S]*?)```/g;
    let fm: RegExpExecArray | null;
    while ((fm = fenceRe.exec(cleaned)) !== null) {
      let path = fm[1].trim();
      if (!path.startsWith('/')) path = '/' + path;
      const content = fm[2].trim();
      if (content.length > 0 && validateFile(content)) files[path] = content;
    }

    if (Object.keys(files).length === 0) {
      // Strategy 3: unnamed fenced blocks — infer filename from export declarations
      const unnamedRe = /```(?:tsx?|jsx?)[ \t]*\n([\s\S]*?)```/g;
      const usedNames = new Set<string>();
      let um: RegExpExecArray | null;
      while ((um = unnamedRe.exec(cleaned)) !== null) {
        const content = um[1].trim();
        if (!validateFile(content)) continue;
        const path = normalizePath(inferFileName(content, usedNames));
        usedNames.add(path);
        files['/' + path.replace(/^src\//, '')] = content;
      }
    }

    if (Object.keys(files).length === 0 && cleaned.length > 50) {
      // Strategy 5: single big block → App.tsx
      const stripped = cleaned.replace(/^```\w*\s*\n?/, '').replace(/\n?\s*```$/, '').trim();
      if (validateFile(stripped)) files['/App.tsx'] = stripped;
    }
    return files;
  }

  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index;
    const end = i + 1 < markers.length
      ? cleaned.lastIndexOf('<!--FILE:', markers[i + 1].index - 1)
      : cleaned.length;
    let content = cleaned.slice(start, end).trim();
    content = content.replace(/<!--\/?FILE[^>]*-->/g, '').trim();
    content = content.replace(/^```\w*\s*\n?/, '').replace(/\n?\s*```$/, '').trim();
    if (content.length > 0) {
      let path = markers[i].path;
      if (!path.startsWith('/')) path = '/' + path;
      files[path] = content;
    }
  }
  return files;
}

// ─── Public: convert legacy Record → ArtifactFile[] ────────────────────────

export function convertLegacyFiles(markers: Record<string, string>): ArtifactFile[] {
  return Object.entries(markers)
    .filter(([, v]) => v.length > 0)
    .map(([path, content]) => ({ path: normalizePath(path.replace(/^\/+/, '')), content }));
}

// ─── Main parser ───────────────────────────────────────────────────────────

export function parseArtifact(raw: string): ArtifactParseResult {
  if (!raw || raw.trim().length === 0) {
    return { success: false, error: 'Empty input', fallbackUsed: false };
  }

  // — JSON strategies (priority order) —
  const strategies = [tryFencedJson, tryLooseJson, tryWholeJson];
  for (const strategy of strategies) {
    const parsed = strategy(raw);
    if (!parsed) continue;

    const files = extractFiles(parsed);
    if (!files) continue;

    const meta = extractMeta(parsed);
    const entry = detectEntry(files, meta.entry);
    const artifact: ArtifactContract = {
      revisionId: meta.revisionId ?? crypto.randomUUID(),
      entry,
      files,
      ...(meta.routes ? { routes: meta.routes } : {}),
      ...(meta.dependencies ? { dependencies: meta.dependencies } : {}),
      ...(meta.theme ? { theme: meta.theme } : {}),
    };
    return { success: true, artifact, fallbackUsed: false };
  }

  // — Legacy <!--FILE:--> / fenced code fallback —
  const legacy = parseFileMarkers(raw);
  const legacyFiles = convertLegacyFiles(legacy);

  if (legacyFiles.length > 0) {
    const entry = detectEntry(legacyFiles);
    return {
      success: true,
      artifact: {
        revisionId: crypto.randomUUID(),
        entry,
        files: legacyFiles,
      },
      fallbackUsed: true,
    };
  }

  return { success: false, error: 'No parseable artifact found', fallbackUsed: true };
}

// ─── Semantic health classification ───────────────────────────────────────────

export const ARTIFACT_FAIL_TRUNCATED         = 'ARTIFACT_TRUNCATED'          as const;
export const ARTIFACT_FAIL_POISONED_ENVELOPE = 'ARTIFACT_POISONED_ENVELOPE'  as const;
export const ARTIFACT_FAIL_SEMANTIC          = 'ARTIFACT_SEMANTIC_PARSE_FAIL' as const;

export type ArtifactSemanticFailClass =
  | typeof ARTIFACT_FAIL_TRUNCATED
  | typeof ARTIFACT_FAIL_POISONED_ENVELOPE
  | typeof ARTIFACT_FAIL_SEMANTIC;

export interface ArtifactSemanticIssue {
  failClass: ArtifactSemanticFailClass;
  detail:    string;
}

/**
 * Lightweight source-code heuristic used only for artifact ingress health
 * checks and nested-envelope extraction. Keep it permissive enough to avoid
 * rejecting minimal valid modules, but still biased toward code-like text.
 */
export function looksLikeSourceCode(content: string): boolean {
  const t = content.trim();
  if (t.length < 8) return false;
  return (
    /(?:^|[\s;])(import|export|function|class|interface|type|const|let|var|enum)\b/.test(t) ||
    /return\s*[(<{[]/.test(t) ||
    /=>/.test(t) ||
    /<[A-Za-z][\w:-]*/.test(t)
  );
}

/**
 * Returns true when the raw output begins like a JSON artifact envelope but
 * does not end with a valid, balanced JSON object. Covers two cases:
 * 1. Stream cut mid-string (no closing brace at all)
 * 2. JSON.parse rejects the full string despite it ending with '}'
 */
export function looksLikeTruncatedArtifact(raw: string): boolean {
  const t = raw.trim();
  if (!t.startsWith('{')) return false;
  if (!/"artifact"\s*:/.test(t) && !/"files"\s*:/.test(t)) return false;
  // Cheapest check: doesn't end with '}'
  if (!t.endsWith('}')) return true;
  // If JSON.parse succeeds the envelope is complete
  try { JSON.parse(t); return false; } catch { /* fall through */ }
  // Ends with '}' but is not valid JSON — likely premature brace closure
  return true;
}

/**
 * Inspects a parsed artifact for semantic problems that would cause
 * ArtifactReviewerService._deepHeuristicRepair to drop all files,
 * ultimately producing "REVIEWER_FAIL: 0 files after heuristic repair".
 *
 * Returns a classified issue when the artifact is semantically unrecoverable,
 * or null when it looks acceptable.
 */
export function classifyArtifactHealth(
  raw: string,
  artifact: ArtifactContract | null,
): ArtifactSemanticIssue | null {
  if (looksLikeTruncatedArtifact(raw)) {
    return { failClass: ARTIFACT_FAIL_TRUNCATED, detail: 'raw output appears truncated' };
  }

  if (!artifact || artifact.files.length === 0) return null;

  // Mirror ArtifactReviewerService.isNestedEnvelope logic — same pattern,
  // kept in sync intentionally to pre-screen before the reviewer runs.
  const isEnvelopeLike = (content: string): boolean => {
    const t = content.trim();
    return (
      t.startsWith('{') &&
      (/"artifact"\s*:/.test(t) || /"files"\s*:/.test(t)) &&
      /"content"\s*:/.test(t)
    );
  };

  // POISONED: every file looks like a nested artifact envelope.
  // Heuristic repair would drop all of them → REVIEWER_FAIL: 0 files.
  if (artifact.files.every(f => isEnvelopeLike(f.content))) {
    return {
      failClass: ARTIFACT_FAIL_POISONED_ENVELOPE,
      detail: `all ${artifact.files.length} file(s) contain nested artifact envelopes — heuristic repair would drop all`,
    };
  }

  // SEMANTIC: non-envelope files exist but none contains recognizable source code.
  const goodFiles = artifact.files.filter(f => !isEnvelopeLike(f.content));
  const hasCode = goodFiles.some(f => looksLikeSourceCode(f.content));
  if (goodFiles.length > 0 && !hasCode) {
    return {
      failClass: ARTIFACT_FAIL_SEMANTIC,
      detail: 'no file contains recognizable source code patterns',
    };
  }

  return null;
}
