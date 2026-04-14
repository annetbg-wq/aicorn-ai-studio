/**
 * ExportService — multi-target export facade for AI Studio projects.
 *
 * Responsibilities:
 *   1. buildFigmaSpec / downloadSpec — Studio → Figma reverse sync spec
 *   2. downloadZip   — export revision files as a self-contained ZIP
 *                      (includes package.json + vite.config.ts if absent)
 *   3. deployToVercel — deploy FileMap via Vercel API (delegates to DeployService)
 *   4. pushToGitHub   — push FileMap to a GitHub repo (delegates to GitHubSyncService
 *                       after auto-registering GitHubRepoAdapter on first call)
 *
 * All three export targets share the same FileMap type so callers can pass
 * the same snapshot to any combination of outputs.
 */

import type { ProjectTheme } from './FigmaService';
import { ExportAdapter }    from './adapters/ExportAdapter';
import type { ExportFileTree } from './adapters/ExportAdapter';
import { DeployService }    from './DeployService';
import type { DeployProgress, DeployResult } from './DeployService';
import { GitHubSyncService } from './GitHubSyncService';
import type { PushProjectOptions, RepoSyncResult } from './GitHubSyncService';
import { GitHubRepoAdapter }  from './GitHubRepoAdapter';

export type FileMap = Record<string, string>;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ColorMapping {
  hex:        string;
  /** CSS variable name from the linked Figma file (if matched). */
  figmaVar?:  string;
  /** Human-readable style name from Figma. */
  figmaName?: string;
  usageCount: number;
}

export interface TextMapping {
  fontFamily: string;
  /** CSS variable from Figma theme. */
  figmaVar?:  string;
  sizes:      number[];
}

export interface ComponentEntry {
  name:       string;
  propsHint?: string;   // first JSDoc param or first prop name found
}

export interface ExportSpec {
  timestamp:         string;
  figmaFileKey?:     string;
  components:        ComponentEntry[];
  colorMappings:     ColorMapping[];
  textMappings:      TextMapping[];
  unmappedColors:    string[];      // colors in code with NO Figma token match
  fileCount:         number;
  estimatedFrames:   number;
  pluginNote:        string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeHex(hex: string): string {
  hex = hex.toLowerCase().trim();
  if (hex.length === 4) {
    // expand #abc → #aabbcc
    return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex;
}

function extractComponents(allCode: string): ComponentEntry[] {
  const entries: ComponentEntry[] = [];
  const seen = new Set<string>();
  // match: export default function Foo / export function Foo
  const rx = /export\s+(?:default\s+)?function\s+([A-Z]\w*)\s*\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(allCode)) !== null) {
    const name = m[1];
    if (seen.has(name)) continue;
    seen.add(name);
    // extract first prop name from destructured params
    const propsMatch = m[2].match(/\{\s*(\w+)/);
    entries.push({ name, propsHint: propsMatch?.[1] });
  }
  return entries;
}

function countHexOccurrences(code: string, hex: string): number {
  const escaped = hex.replace('#', '\\#');
  return (code.match(new RegExp(escaped, 'gi')) ?? []).length;
}

// ── ZIP helpers (used when no ProjectGraph is available) ──────────────────────

/** Minimal package.json for a plain React+TS+Vite project */
function defaultPackageJson(projectName: string, hasTailwind: boolean): string {
  const devDeps: Record<string, string> = {
    '@types/react':         '^18.2.0',
    '@types/react-dom':     '^18.2.0',
    '@vitejs/plugin-react': '^4.2.1',
    typescript:             '^5.2.2',
    vite:                   '^5.0.8',
  };
  if (hasTailwind) {
    devDeps['tailwindcss']  = '^3.4.1';
    devDeps['autoprefixer'] = '^10.4.17';
    devDeps['postcss']      = '^8.4.35';
  }
  return JSON.stringify({
    name:    projectName,
    version: '0.1.0',
    private: true,
    type:    'module',
    scripts: {
      dev:     'vite',
      build:   'tsc && vite build',
      preview: 'vite preview',
    },
    dependencies:    { react: '^18.2.0', 'react-dom': '^18.2.0' },
    devDependencies: devDeps,
  }, null, 2);
}

/** Minimal vite.config.ts */
function defaultViteConfig(hasTailwind: boolean): string {
  const tailwindImport = hasTailwind
    ? `import tailwindcss from 'tailwindcss'\nimport autoprefixer from 'autoprefixer'\n`
    : '';
  const cssBlock = hasTailwind
    ? `\n  css: { postcss: { plugins: [tailwindcss, autoprefixer] } },`
    : '';
  return `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
${tailwindImport}
export default defineConfig({
  plugins: [react()],${cssBlock}
})
`;
}

/** Detect Tailwind usage from raw file content */
function detectTailwind(files: FileMap): boolean {
  return Object.values(files).some(c => /tailwind|className=["'][^"']*\s/.test(c));
}

// ─── GitHub adapter — registered once on first pushToGitHub call ──────────────
let _githubAdapterRegistered = false;
function ensureGitHubAdapter(): void {
  if (_githubAdapterRegistered) return;
  GitHubSyncService.register(new GitHubRepoAdapter());
  _githubAdapterRegistered = true;
}

// ── Service ───────────────────────────────────────────────────────────────────

export const ExportService = {

  buildFigmaSpec(files: FileMap, theme: ProjectTheme | null): ExportSpec {
    const allCode = Object.values(files).join('\n');

    // Components
    const components = extractComponents(allCode);

    // All hex colors used in code
    const rawHexes = [...new Set(
      (allCode.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) ?? [])
        .map(normalizeHex),
    )].slice(0, 40);

    // Map each hex → Figma token
    const colorMappings: ColorMapping[] = [];
    const unmappedColors: string[] = [];

    for (const hex of rawHexes) {
      const match = theme?.colors.find(
        c => normalizeHex(c.hex) === hex,
      ) ?? theme?.rawColors?.find(
        c => normalizeHex(c.hex) === hex,
      );
      const entry: ColorMapping = {
        hex,
        figmaVar:   match?.cssVar,
        figmaName:  match?.name,
        usageCount: countHexOccurrences(allCode, hex),
      };
      colorMappings.push(entry);
      if (!match) unmappedColors.push(hex);
    }

    // Sort by usage count descending
    colorMappings.sort((a, b) => b.usageCount - a.usageCount);

    // Font families used in code
    const fontRx = /fontFamily[\s:'"]+['"]([^'"]+)['"]/g;
    const fontMap = new Map<string, number[]>();
    const sizeRx  = /fontSize[\s:'"]+(\d+)/g;
    const sizes: number[] = [];
    let sm: RegExpExecArray | null;
    while ((sm = sizeRx.exec(allCode)) !== null) sizes.push(parseInt(sm[1]));

    let fm: RegExpExecArray | null;
    while ((fm = fontRx.exec(allCode)) !== null) {
      const ff = fm[1];
      if (!fontMap.has(ff)) fontMap.set(ff, []);
    }

    const textMappings: TextMapping[] = [...fontMap.keys()].slice(0, 10).map(ff => {
      const match = theme?.textStyles.find(t => t.fontFamily === ff)
        ?? theme?.rawFonts?.find(t => t.fontFamily === ff);
      return {
        fontFamily: ff,
        figmaVar:   match
          ? `--font-${ff.toLowerCase().replace(/\s+/g, '-')}`
          : undefined,
        sizes: [...new Set(sizes)].slice(0, 8),
      };
    });

    return {
      timestamp:       new Date().toISOString(),
      figmaFileKey:    theme?.figmaFileKey,
      components,
      colorMappings,
      textMappings,
      unmappedColors,
      fileCount:       Object.keys(files).length,
      estimatedFrames: Math.max(1, components.length),
      pluginNote:
        'To apply this spec in Figma: open the AIC-RG Studio Plugin, ' +
        'choose "Import Spec", and select this JSON file. ' +
        'All color tokens will be matched to existing Figma styles.',
    };
  },

  downloadSpec(spec: ExportSpec): void {
    const json = JSON.stringify(spec, null, 2);
    const blob  = new Blob([json], { type: 'application/json' });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    a.href      = url;
    a.download  = `figma-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // ── ZIP export ──────────────────────────────────────────────────────────────

  /**
   * Download all revision files as a ZIP archive.
   *
   * Automatically injects `package.json` and `vite.config.ts` into the
   * archive when they are not already present in `files`.
   *
   * @param files       FileMap from the revision snapshot
   * @param projectName Base name used for the ZIP file and package.json `name`
   */
  downloadZip(files: FileMap, projectName = 'project'): void {
    const slug = projectName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const hasTailwind = detectTailwind(files);

    const tree: ExportFileTree = { ...files };
    if (!tree['package.json'])  tree['package.json']  = defaultPackageJson(slug, hasTailwind);
    if (!tree['vite.config.ts']) tree['vite.config.ts'] = defaultViteConfig(hasTailwind);

    ExportAdapter.downloadZipFromFileTree(tree, slug);
  },

  // ── Deploy to Vercel ────────────────────────────────────────────────────────

  /**
   * Deploy revision files directly to Vercel via the Vercel REST API.
   *
   * Delegates to DeployService — see DeployService.deploy() for details.
   *
   * @param files      FileMap from the revision snapshot
   * @param token      Vercel personal access token
   * @param onProgress Optional progress callback
   */
  deployToVercel(
    files: FileMap,
    token: string,
    onProgress: (p: DeployProgress) => void = () => {},
  ): Promise<DeployResult> {
    return DeployService.deploy(files, 'vercel', token, onProgress);
  },

  // ── Push to GitHub ──────────────────────────────────────────────────────────

  /**
   * Push revision files to a GitHub repository via the Git Data API.
   *
   * Automatically injects `package.json` and `vite.config.ts` when absent.
   * Registers `GitHubRepoAdapter` on first call (idempotent).
   *
   * @param files   FileMap from the revision snapshot
   * @param options Credentials, target repo, strategy, progress callback
   *
   * @example
   *   const result = await ExportService.pushToGitHub(files, {
   *     credentials: { provider: 'github', accessToken: 'ghp_…', ownerLogin: 'alice' },
   *     target: { name: 'my-app', owner: 'alice', branch: 'main', createIfMissing: true },
   *     strategy: 'merge',
   *     onProgress: p => console.log(p.message),
   *   });
   */
  async pushToGitHub(
    files: FileMap,
    options: PushProjectOptions,
  ): Promise<RepoSyncResult> {
    ensureGitHubAdapter();

    const hasTailwind = detectTailwind(files);
    const target      = options.target;
    const slug        = target.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    const tree: ExportFileTree = { ...files };
    if (!tree['package.json'])   tree['package.json']   = defaultPackageJson(slug, hasTailwind);
    if (!tree['vite.config.ts']) tree['vite.config.ts'] = defaultViteConfig(hasTailwind);

    return GitHubSyncService.pushProject(tree, options);
  },
};
