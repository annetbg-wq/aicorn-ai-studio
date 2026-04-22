export interface CanonicalProjectPathOptions {
  allowEmpty?: boolean;
  allowRootSlash?: boolean;
  stripSrcPrefix?: boolean;
  label?: string;
}

export class UnsafeProjectPathError extends Error {
  readonly input: string;

  constructor(message: string, input: string) {
    super(message);
    this.name = 'UnsafeProjectPathError';
    this.input = input;
  }
}

const WINDOWS_DRIVE_RE = /^[a-zA-Z]:/;

function fail(message: string, input: string): never {
  throw new UnsafeProjectPathError(message, input);
}

/**
 * Canonical project-path normalization shared by admission, preview writes,
 * and backend/Vite filesystem boundaries.
 *
 * Security rules:
 * - normalize "\" → "/"
 * - optionally accept one project-root "/" prefix for internal callers
 * - optionally strip one leading "src/" prefix
 * - reject absolute paths, "." segments, ".." traversal, and empty results
 */
export function canonicalizeProjectPath(
  input: string,
  opts: CanonicalProjectPathOptions = {},
): string {
  const {
    allowEmpty = false,
    allowRootSlash = false,
    stripSrcPrefix = false,
    label = 'path',
  } = opts;

  if (typeof input !== 'string') fail(`${label} must be a string`, String(input));
  if (input.includes('\0')) fail(`${label} contains NUL byte`, input);

  let normalized = input.replace(/\\/g, '/');

  if (WINDOWS_DRIVE_RE.test(normalized) || normalized.startsWith('//')) {
    fail(`${label} must be relative`, input);
  }

  if (normalized.startsWith('/')) {
    if (!allowRootSlash) fail(`${label} must be relative`, input);
    const leadingSlashes = normalized.match(/^\/+/)?.[0].length ?? 0;
    if (leadingSlashes > 1) fail(`${label} has an unsafe root prefix`, input);
    normalized = normalized.slice(1);
  }

  if (stripSrcPrefix && normalized.startsWith('src/')) {
    normalized = normalized.slice(4);
  }

  const segments = normalized
    .split('/')
    .filter(Boolean);

  if (segments.length === 0) {
    if (allowEmpty) return '';
    fail(`${label} is empty`, input);
  }

  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      fail(`${label} contains unsafe traversal`, input);
    }
  }

  return segments.join('/');
}

export function tryCanonicalizeProjectPath(
  input: string,
  opts: CanonicalProjectPathOptions = {},
): { ok: true; path: string } | { ok: false; reason: string } {
  try {
    return { ok: true, path: canonicalizeProjectPath(input, opts) };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : `Invalid path: ${String(error)}`,
    };
  }
}

export function toPolicyPath(input: string): string {
  return canonicalizeProjectPath(input, {
    allowRootSlash: true,
    stripSrcPrefix: true,
    label: 'policy path',
  }).toLowerCase();
}
