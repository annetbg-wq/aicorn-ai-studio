/**
 * importValidator.ts — Pre-write import resolution checker.
 *
 * Before files are flushed to preview-app, this module validates that all
 * relative imports between generated files actually resolve.
 *
 * Returns a list of missing files so the self-correction loop can
 * generate them instead of waiting for Vite to crash.
 */

/** A relative import that doesn't resolve to any known file. */
export interface UnresolvedImport {
  /** File that contains the broken import. */
  sourceFile: string;
  /** The import specifier (e.g., './pages/Profile'). */
  specifier:  string;
  /** Candidate paths we checked. */
  candidates: string[];
}

/**
 * Extract all relative import specifiers from TypeScript/TSX source.
 * Matches: import X from './...'  and  import('./...')
 */
function extractRelativeImports(source: string): string[] {
  const results: string[] = [];
  // Static imports: import ... from './path'
  const staticRe = /from\s+['"](\.[^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = staticRe.exec(source)) !== null) results.push(m[1]);
  // Dynamic imports: import('./path')
  const dynamicRe = /import\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  while ((m = dynamicRe.exec(source)) !== null) results.push(m[1]);
  return results;
}

/**
 * Normalize a file path: strip leading /, src/ prefix, ensure consistent format.
 */
function normalizePath(p: string): string {
  let n = p;
  if (n.startsWith('/')) n = n.slice(1);
  if (n.startsWith('src/')) n = n.slice(4);
  return n;
}

/**
 * Given an import specifier and the importing file, resolve to possible file paths.
 * E.g., from 'pages/Home.tsx' importing './components/Card' →
 *   ['pages/components/Card.tsx', 'pages/components/Card.ts', 'pages/components/Card/index.tsx', ...]
 *
 * From 'App.tsx' importing './pages/Home' →
 *   ['pages/Home.tsx', 'pages/Home.ts', 'pages/Home/index.tsx', ...]
 */
function resolveCandidates(specifier: string, fromFile: string): string[] {
  const dir = normalizePath(fromFile).split('/').slice(0, -1).join('/');
  const raw = specifier.startsWith('./')
    ? specifier.slice(2)
    : specifier.startsWith('../')
      ? resolveDotDot(dir, specifier)
      : specifier;

  const base = dir ? `${dir}/${raw}` : raw;
  const normalized = normalizePath(base);

  // If it already has an extension, just return it
  if (/\.(tsx?|jsx?|css|json)$/.test(normalized)) {
    return [normalized];
  }

  // Try common extensions
  return [
    `${normalized}.tsx`,
    `${normalized}.ts`,
    `${normalized}.jsx`,
    `${normalized}.js`,
    `${normalized}/index.tsx`,
    `${normalized}/index.ts`,
  ];
}

function resolveDotDot(dir: string, specifier: string): string {
  const parts = dir.split('/');
  let spec = specifier;
  while (spec.startsWith('../')) {
    parts.pop();
    spec = spec.slice(3);
  }
  if (spec.startsWith('./')) spec = spec.slice(2);
  return parts.length > 0 ? parts.join('/') + '/' + spec : spec;
}

/**
 * Validate all relative imports in a set of files.
 *
 * @param files — Map of normalized path → content (e.g., 'App.tsx' → code)
 * @param existingFiles — Files already on disk (not in this generation batch)
 * @returns List of unresolved imports
 */
export function validateImports(
  files: Record<string, string>,
  existingFiles?: Record<string, string>,
): UnresolvedImport[] {
  // Build a set of all known file paths (normalized, without leading / or src/)
  const allPaths = new Set<string>();

  for (const p of Object.keys(files)) {
    allPaths.add(normalizePath(p));
  }
  if (existingFiles) {
    for (const p of Object.keys(existingFiles)) {
      allPaths.add(normalizePath(p));
    }
  }

  // Well-known scaffold paths that always exist in preview-app
  const scaffoldPrefixes = [
    'components/ui/',
    'components/layout/',
    'lib/',
    'hooks/',
  ];

  const unresolved: UnresolvedImport[] = [];

  for (const [filePath, content] of Object.entries(files)) {
    // Only check TS/TSX/JS/JSX files
    if (!/\.(tsx?|jsx?)$/.test(filePath)) continue;

    const imports = extractRelativeImports(content);

    for (const specifier of imports) {
      const candidates = resolveCandidates(specifier, filePath);

      const resolved = candidates.some(c => {
        if (allPaths.has(c)) return true;
        // Check scaffold directories
        return scaffoldPrefixes.some(prefix => c.startsWith(prefix));
      });

      if (!resolved) {
        unresolved.push({
          sourceFile: normalizePath(filePath),
          specifier,
          candidates,
        });
      }
    }
  }

  return unresolved;
}

/**
 * Format unresolved imports into a compact string for LLM context.
 */
export function formatUnresolved(unresolved: UnresolvedImport[]): string {
  if (unresolved.length === 0) return '';
  return unresolved
    .map(u => `${u.sourceFile}: import '${u.specifier}' → not found (tried: ${u.candidates.join(', ')})`)
    .join('\n');
}
