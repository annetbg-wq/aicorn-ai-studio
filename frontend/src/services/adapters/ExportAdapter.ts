/**
 * ExportAdapter.ts — ProjectGraph → Downloadable React/Vite/TypeScript Project
 *
 * Derives a complete, developer-readable project tree from a ProjectGraph
 * and triggers a browser download as a ZIP archive.
 *
 * Unlike PreviewAdapter (which projects for the Vite sandbox), ExportAdapter
 * produces a self-contained project a developer can `npm install && npm run dev`.
 *
 * Generated artefacts (not in graph, synthesised from manifest/deps):
 *   package.json     — from graph.manifest + graph.externalDependencies
 *   tsconfig.json    — standard React/Vite baseline
 *   vite.config.ts   — standard React plugin config
 *   index.html       — Vite entry HTML (if not already in graph)
 *   .env.example     — from env DependencySpec entries
 *   .gitignore       — standard Node gitignore
 *   README.md        — project name + quick-start instructions
 *
 * Canonical flow:
 *   ProjectGraph
 *     └─ ExportAdapter.toFileTree(graph)
 *           └─ Record<string,string>   (path → content, full project)
 *                 └─ ExportAdapter.downloadZip(graph, name)
 *                       └─ <project-name>.zip  (browser download)
 *
 * ZIP implementation: minimal RFC 4.4 STORE encoder — no external deps.
 */

import type { ProjectGraph, DependencySpec } from '../../shared/projectModel';
import { getEnvDescription } from '../../shared/SandboxPackageRegistry';

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Full project file tree — path → content.
 * Paths are relative from the project root (e.g. "src/App.tsx").
 */
export type ExportFileTree = Record<string, string>;

export interface ExportProjection {
  /** Complete file tree ready for download */
  fileTree: ExportFileTree;
  /** Files that came directly from the graph */
  sourceFiles: string[];
  /** Files that were synthesised (package.json, tsconfig, etc.) */
  generatedFiles: string[];
  /** npm package names from externalDependencies */
  packages: { name: string; version: string; dev: boolean }[];
}

// ─── Template builders ────────────────────────────────────────────────────────

function buildPackageJson(graph: ProjectGraph): string {
  const name = graph.manifest.name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  const deps: Record<string, string> = {};
  const devDeps: Record<string, string> = {};

  // Collect npm dependencies from graph
  for (const dep of graph.externalDependencies) {
    if (dep.kind !== 'npm') continue;
    const target = dep.isDevDependency ? devDeps : deps;
    target[dep.name] = dep.version ?? 'latest';
  }

  // Ensure required baseline packages are always present
  const baselineDeps: Record<string, string> = {
    react:         '^18.2.0',
    'react-dom':   '^18.2.0',
  };
  const baselineDevDeps: Record<string, string> = {
    '@types/react':            '^18.2.0',
    '@types/react-dom':        '^18.2.0',
    '@vitejs/plugin-react':    '^4.2.1',
    typescript:                '^5.2.2',
    vite:                      '^5.0.8',
  };
  const techStack = graph.manifest.techStack;
  if (techStack.styling === 'tailwind') {
    baselineDevDeps['tailwindcss']          = '^3.4.1';
    baselineDevDeps['autoprefixer']         = '^10.4.17';
    baselineDevDeps['postcss']              = '^8.4.35';
  }

  const merged = {
    ...baselineDeps,
    ...deps,
  };
  const mergedDev = {
    ...baselineDevDeps,
    ...devDeps,
  };

  return JSON.stringify({
    name,
    version: '0.1.0',
    private: true,
    type:    'module',
    scripts: {
      dev:     'vite',
      build:   'tsc && vite build',
      preview: 'vite preview',
      lint:    'eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0',
    },
    dependencies:    merged,
    devDependencies: mergedDev,
  }, null, 2);
}

function buildTsConfig(): string {
  return JSON.stringify({
    compilerOptions: {
      target:            'ES2020',
      useDefineForClassFields: true,
      lib:               ['ES2020', 'DOM', 'DOM.Iterable'],
      module:            'ESNext',
      skipLibCheck:      true,
      moduleResolution:  'bundler',
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      isolatedModules:   true,
      noEmit:            true,
      jsx:               'react-jsx',
      strict:            true,
      noUnusedLocals:    true,
      noUnusedParameters: true,
      noFallthroughCasesInSwitch: true,
    },
    include: ['src'],
    references: [{ path: './tsconfig.node.json' }],
  }, null, 2);
}

function buildTsConfigNode(): string {
  return JSON.stringify({
    compilerOptions: {
      composite:        true,
      skipLibCheck:     true,
      module:           'ESNext',
      moduleResolution: 'bundler',
      allowSyntheticDefaultImports: true,
    },
    include: ['vite.config.ts'],
  }, null, 2);
}

function buildViteConfig(hasTailwind: boolean): string {
  const tailwindImport = hasTailwind ? `import tailwindcss from 'tailwindcss'\nimport autoprefixer from 'autoprefixer'\n` : '';
  const cssConfig = hasTailwind
    ? `\n  css: {\n    postcss: {\n      plugins: [tailwindcss, autoprefixer],\n    },\n  },`
    : '';
  return `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
${tailwindImport}
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],${cssConfig}
})
`;
}

function buildIndexHtml(projectName: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

function buildEnvExample(deps: DependencySpec[]): string | null {
  const envVars = deps.filter(d => d.kind === 'env');
  if (envVars.length === 0) return null;
  const lines = ['# Environment variables — copy to .env and fill in values', ''];
  for (const d of envVars) {
    // Look up the description from SandboxPackageRegistry so .env.example
    // includes a helpful comment for each variable.
    const desc = getEnvDescription(d.name);
    if (desc) lines.push(`# ${desc}`);
    lines.push(`${d.name}=`);
  }
  return lines.join('\n') + '\n';
}

function buildGitignore(): string {
  return `# Logs
logs
*.log
npm-debug.log*

# Dependencies
node_modules
.pnp
.pnp.js

# Build
dist
dist-ssr
*.local

# Editor
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# Environment
.env
.env.*
!.env.example
`;
}

function buildReadme(name: string): string {
  const title = name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return `# ${title}

A React + TypeScript + Vite application.

## Quick start

\`\`\`bash
npm install
npm run dev
\`\`\`

## Build

\`\`\`bash
npm run build
\`\`\`

## Stack

- React 18
- TypeScript 5
- Vite 5
- Tailwind CSS
`;
}

// ─── ExportAdapter ────────────────────────────────────────────────────────────

export class ExportAdapter {
  /**
   * toFileTree() — primary projection.
   *
   * Merges all graph source files with synthesised toolchain/config files.
   * The result is a complete project a developer can `npm install && npm run dev`.
   *
   * @example
   *   const { fileTree } = ExportAdapter.toFileTree(graph)
   */
  static toFileTree(graph: ProjectGraph): ExportProjection {
    const fileTree: ExportFileTree = {};
    const sourceFiles: string[] = [];
    const generatedFiles: string[] = [];

    // ── 1. Source files from graph ──────────────────────────────────────────
    for (const file of graph.files) {
      fileTree[file.path] = file.content;
      sourceFiles.push(file.path);
    }

    const hasTailwind = graph.manifest.techStack.styling === 'tailwind';
    const projectName = graph.manifest.name;

    // ── 2. Synthesised toolchain files ──────────────────────────────────────
    const synthesised: Record<string, string | null> = {
      'package.json':       !fileTree['package.json']       ? buildPackageJson(graph) : null,
      'tsconfig.json':      !fileTree['tsconfig.json']      ? buildTsConfig()         : null,
      'tsconfig.node.json': !fileTree['tsconfig.node.json'] ? buildTsConfigNode()     : null,
      'vite.config.ts':     !fileTree['vite.config.ts']     ? buildViteConfig(hasTailwind) : null,
      'index.html':         !fileTree['index.html']         ? buildIndexHtml(projectName) : null,
      '.gitignore':         !fileTree['.gitignore']         ? buildGitignore()        : null,
      'README.md':          !fileTree['README.md']          ? buildReadme(projectName) : null,
    };

    // .env.example (conditional on env vars being present)
    if (!fileTree['.env.example']) {
      const envExample = buildEnvExample(graph.externalDependencies);
      if (envExample) synthesised['.env.example'] = envExample;
    }

    for (const [path, content] of Object.entries(synthesised)) {
      if (content !== null) {
        fileTree[path] = content;
        generatedFiles.push(path);
      }
    }

    // ── 3. Package list for display ─────────────────────────────────────────
    const packages = graph.externalDependencies
      .filter(d => d.kind === 'npm')
      .map(d => ({
        name:    d.name,
        version: d.version ?? 'latest',
        dev:     d.isDevDependency,
      }));

    return { fileTree, sourceFiles, generatedFiles, packages };
  }

  /**
   * downloadZipFromFileTree() — trigger browser download of a ZIP archive
   * directly from an ExportFileTree (path → content map), without requiring
   * a full ProjectGraph.
   *
   * Use this when you already have a flat file map (e.g. from a revision
   * snapshot or when calling from ExportService).
   *
   * @param fileTree  path → UTF-8 content map
   * @param zipName   Base name without extension
   */
  static downloadZipFromFileTree(fileTree: ExportFileTree, zipName: string): void {
    const zipBytes = ExportAdapter._buildZip(fileTree);
    ExportAdapter._triggerDownload(zipBytes, `${zipName}.zip`, 'application/zip');
  }

  /**
   * buildZipBytes() — build ZIP bytes from an ExportFileTree without triggering
   * a browser download.  Useful for upload flows (Vercel, GitHub).
   */
  static buildZipBytes(fileTree: ExportFileTree): Uint8Array {
    return ExportAdapter._buildZip(fileTree);
  }

  /**
   * downloadZip() — trigger browser download of a ZIP archive.
   *
   * Uses a minimal RFC 4.4 STORE encoder — no external dependencies.
   * STORE format means no compression (files are already text, and this
   * avoids DecompressionStream availability issues across browsers).
   *
   * @param graph     The canonical ProjectGraph
   * @param zipName   Base name without extension (default: project name)
   */
  static downloadZip(graph: ProjectGraph, zipName?: string): void {
    const { fileTree } = ExportAdapter.toFileTree(graph);
    const name = zipName ?? graph.manifest.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    const zipBytes = ExportAdapter._buildZip(fileTree);
    ExportAdapter._triggerDownload(zipBytes, `${name}.zip`, 'application/zip');
  }

  // ─── Internal: minimal ZIP STORE encoder ──────────────────────────────────

  private static _buildZip(files: ExportFileTree): Uint8Array {
    const enc = new TextEncoder();
    const localHeaders: Uint8Array[] = [];
    const centralDir: Uint8Array[]   = [];
    let offset = 0;

    for (const [path, content] of Object.entries(files)) {
      const name  = enc.encode(path);
      const data  = enc.encode(content);
      const crc   = ExportAdapter._crc32(data);
      const size  = data.length;
      const now   = ExportAdapter._dosDateTime();

      // Local file header (30 bytes + name + data)
      const local = new Uint8Array(30 + name.length + size);
      const lv = new DataView(local.buffer);
      lv.setUint32(0,  0x04034b50, true); // signature
      lv.setUint16(4,  20,         true); // version needed
      lv.setUint16(6,  0,          true); // flags
      lv.setUint16(8,  0,          true); // compression (STORE)
      lv.setUint16(10, now.time,   true); // mod time
      lv.setUint16(12, now.date,   true); // mod date
      lv.setUint32(14, crc,        true); // CRC-32
      lv.setUint32(18, size,       true); // compressed size
      lv.setUint32(22, size,       true); // uncompressed size
      lv.setUint16(26, name.length, true); // filename length
      lv.setUint16(28, 0,           true); // extra field length
      local.set(name, 30);
      local.set(data, 30 + name.length);
      localHeaders.push(local);

      // Central directory header (46 bytes + name)
      const central = new Uint8Array(46 + name.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0,  0x02014b50, true); // signature
      cv.setUint16(4,  20,         true); // version made by
      cv.setUint16(6,  20,         true); // version needed
      cv.setUint16(8,  0,          true); // flags
      cv.setUint16(10, 0,          true); // compression (STORE)
      cv.setUint16(12, now.time,   true); // mod time
      cv.setUint16(14, now.date,   true); // mod date
      cv.setUint32(16, crc,        true); // CRC-32
      cv.setUint32(20, size,       true); // compressed size
      cv.setUint32(24, size,       true); // uncompressed size
      cv.setUint16(28, name.length, true); // filename length
      cv.setUint16(30, 0,           true); // extra field length
      cv.setUint16(32, 0,           true); // file comment length
      cv.setUint16(34, 0,           true); // disk number start
      cv.setUint16(36, 0,           true); // internal attr
      cv.setUint32(38, 0,           true); // external attr
      cv.setUint32(42, offset,      true); // local header offset
      central.set(name, 46);
      centralDir.push(central);

      offset += local.length;
    }

    const centralOffset = offset;
    const centralSize   = centralDir.reduce((n, c) => n + c.length, 0);

    // End of central directory record (22 bytes)
    const eocd  = new Uint8Array(22);
    const ev    = new DataView(eocd.buffer);
    const count = centralDir.length;
    ev.setUint32(0,  0x06054b50,  true); // signature
    ev.setUint16(4,  0,           true); // disk number
    ev.setUint16(6,  0,           true); // disk with central dir
    ev.setUint16(8,  count,       true); // entries on this disk
    ev.setUint16(10, count,       true); // total entries
    ev.setUint32(12, centralSize, true); // size of central dir
    ev.setUint32(16, centralOffset, true); // offset of central dir
    ev.setUint16(20, 0,           true); // comment length

    // Concatenate all sections
    const totalSize = offset + centralSize + eocd.length;
    const zip = new Uint8Array(totalSize);
    let pos = 0;
    for (const b of [...localHeaders, ...centralDir]) {
      zip.set(b, pos);
      pos += b.length;
    }
    zip.set(eocd, pos);
    return zip;
  }

  /** CRC-32 implementation (no external deps) */
  private static _crcTable: Uint32Array | null = null;
  private static _makeCrcTable(): Uint32Array {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c;
    }
    return table;
  }
  private static _crc32(data: Uint8Array): number {
    if (!ExportAdapter._crcTable) ExportAdapter._crcTable = ExportAdapter._makeCrcTable();
    const table = ExportAdapter._crcTable;
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  /** MS-DOS date/time encoding for ZIP headers */
  private static _dosDateTime(): { time: number; date: number } {
    const d  = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time, date };
  }

  /** Trigger a browser file download */
  private static _triggerDownload(data: Uint8Array, filename: string, mime: string): void {
    const blob = new Blob([data.buffer as ArrayBuffer], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
