/**
 * PreviewAdapter.ts — ProjectGraph → Preview FileMap
 *
 * Derives the minimal file set needed by SandboxMaterializeService.
 * The preview runtime (Vite ESM + esbuild-wasm) only needs runtime files —
 * toolchain config, SQL schemas, env templates and docs are excluded.
 *
 * This is the ONLY place that decides what goes into the preview sandbox.
 * Generation code must never shape its output to fit preview — the adapter
 * reads from the canonical graph and projects what the runtime needs.
 *
 * Canonical flow:
 *   ProjectGraph
 *     └─ PreviewAdapter.toFileMap(graph)
 *           └─ Record<string,string>   (path → content)
 *                 └─ SandboxMaterializeService.materializeRevision()
 *
 * Mapping:
 *   graph.files where language ∈ RUNTIME_LANGUAGES  →  preview files
 *   Excluded: .sql, .md, .yaml, .env*, toolchain configs (vite/tsconfig/…)
 */

import type { ProjectGraph, FileBlueprint } from '../../shared/projectModel';

// ─── Runtime language set ─────────────────────────────────────────────────────

/** File languages that the Vite ESM runtime can actually execute */
const RUNTIME_LANGUAGES = new Set([
  'tsx', 'ts', 'jsx', 'js', 'css', 'scss', 'html', 'json',
]);

/** Paths that are toolchain config — NOT loaded at runtime by the sandbox */
const TOOLCHAIN_PATHS = new Set([
  'vite.config.ts',
  'vite.config.js',
  'tsconfig.json',
  'tsconfig.node.json',
  'tailwind.config.ts',
  'tailwind.config.js',
  'postcss.config.js',
  'postcss.config.cjs',
  '.eslintrc.json',
  '.eslintrc.js',
  '.prettierrc',
  'package.json',
  'package-lock.json',
  'yarn.lock',
]);

// ─── PreviewFileMap type ──────────────────────────────────────────────────────

/**
 * The exact shape SandboxMaterializeService.materializeRevision() expects.
 * Keys are relative paths from the project root (e.g. "src/App.tsx").
 */
export type PreviewFileMap = Record<string, string>;

/** Metadata about the projection for debugging / audit */
export interface PreviewProjection {
  /** Files included in the preview sandbox */
  fileMap: PreviewFileMap;
  /** Paths that were present in graph but excluded from preview */
  excluded: string[];
  /** True when an entry point was found (App.tsx / main.tsx) */
  hasEntryPoint: boolean;
}

// ─── PreviewAdapter ───────────────────────────────────────────────────────────

export class PreviewAdapter {
  /**
   * toFileMap() — primary entry point.
   *
   * Extracts only the runtime-relevant files from the ProjectGraph and
   * returns a flat Record<path, content> ready for the preview materializer.
   *
   * @example
   *   const fileMap = PreviewAdapter.toFileMap(graph)
   *   await SandboxMaterializeService.materializeRevision({ revisionId, files: fileMap })
   */
  static toFileMap(graph: ProjectGraph): PreviewFileMap {
    return PreviewAdapter.project(graph).fileMap;
  }

  /**
   * project() — same as toFileMap() but returns metadata too.
   * Useful for debugging and for logging which files were excluded.
   */
  static project(graph: ProjectGraph): PreviewProjection {
    const included: PreviewFileMap = {};
    const excluded: string[] = [];

    for (const file of graph.files) {
      if (PreviewAdapter._isRuntimeFile(file)) {
        included[file.path] = file.content;
      } else {
        excluded.push(file.path);
      }
    }

    const hasEntryPoint =
      Object.keys(included).some(p =>
        p === 'App.tsx' || p === 'src/App.tsx' ||
        p === 'main.tsx' || p === 'src/main.tsx'
      );

    return { fileMap: included, excluded, hasEntryPoint };
  }

  /**
   * filterFileMap() — apply the same preview filter to an already-flat FileMap.
   *
   * Used in the canonical revision path where files come back from the source
   * registry as Record<string,string> (not as FileBlueprint[]).
   *
   * @example
   *   const revisionFiles = await readRevisionFiles(sourceRevision)
   *   const previewFiles  = PreviewAdapter.filterFileMap(revisionFiles)
   *   await materializeRevision(previewFiles, opts)
   */
  static filterFileMap(fileMap: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [path, content] of Object.entries(fileMap)) {
      if (PreviewAdapter._isRuntimePath(path)) {
        result[path] = content;
      }
    }
    return result;
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private static _isRuntimeFile(file: FileBlueprint): boolean {
    return PreviewAdapter._isRuntimePath(file.path) &&
      RUNTIME_LANGUAGES.has(file.language);
  }

  /**
   * Pure path-based filter — no FileBlueprint needed.
   * Used by filterFileMap() for the flat-FileMap registry path.
   * Uses file extension as a proxy for language when no FileBlueprint is available.
   */
  static _isRuntimePath(path: string): boolean {
    const basename = path.split('/').pop() ?? path;

    // Exclude known toolchain configs by exact basename
    if (TOOLCHAIN_PATHS.has(basename)) return false;

    // Exclude by path patterns
    if (path.startsWith('supabase/')) return false;
    if (path.startsWith('.github/')) return false;
    if (path.startsWith('scripts/')) return false;
    if (path.endsWith('.env') || path.includes('.env.')) return false;
    if (path.endsWith('.gitignore') || path.endsWith('.npmignore')) return false;
    if (path.endsWith('.md') || path.endsWith('.txt')) return false;
    if (path.endsWith('.lock') || path.endsWith('.toml')) return false;

    // Derive language from extension
    const ext = basename.includes('.') ? basename.split('.').pop()! : '';
    return RUNTIME_LANGUAGES.has(ext as 'tsx' | 'ts' | 'jsx' | 'js' | 'css' | 'scss' | 'html' | 'json');
  }
}
