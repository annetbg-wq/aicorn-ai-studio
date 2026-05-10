/**
 * preview-manager.ts — Static build route + backend Vite compiler.
 *
 * Two responsibilities:
 *   1. registerPreviewBuildRoute  — serves compiled builds from builds/<buildId>/
 *   2. registerPreviewCompileRoute — POST /api/preview/:buildId/compile
 *        • writes user files into preview-workspace/src/
 *        • writes __build_id.ts so MountReporter posts the correct buildId
 *        • runs `vite build --outDir builds/<buildId>` (output is outside cwd)
 *        • calls cleanupLRU to evict oldest builds
 *
 * Directory layout:
 *   preview-workspace/   — Vite source project (template + user src files)
 *   builds/<buildId>/    — compiled static output (served via /preview/:buildId)
 *
 * Builds are serialised: only one `vite build` runs at a time to avoid
 * concurrent writes to preview-workspace/src/.
 */

import { spawn } from 'child_process';
import express from 'express';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { canonicalizeProjectPath } from '../frontend/src/shared/safePaths';

// ── constants ─────────────────────────────────────────────────────────────────

/** Vite source project — files are written here before each build. */
const PREVIEW_WORKSPACE = path.resolve(__dirname, '..', 'preview-workspace');

/**
 * Compiled build output — each build gets its own sub-directory.
 * Must be OUTSIDE preview-workspace/ to satisfy Vite's outDir-in-root check.
 */
const BUILDS_WORKSPACE = path.resolve(__dirname, '..', 'builds');

/** Maximum compiled builds to keep on disk (LRU). */
const MAX_BUILDS = 20;
const PRESERVED_PREVIEW_DIRS = ['components', 'config', 'context', 'lib', 'themes', 'hooks'];

/** Root directory where skeleton source trees live: skeletons/<id>/skeleton-<id>/src */
const SKELETONS_ROOT = path.resolve(__dirname, '..', 'skeletons');

export function getPreservedPreviewDirs(): string[] {
  return [...PRESERVED_PREVIEW_DIRS];
}

export function resolveSectionTemplatePaths(previewWorkspace: string = PREVIEW_WORKSPACE): {
  templatesSrc: string;
  sectionsDest: string;
} {
  return {
    templatesSrc: path.resolve(__dirname, '..', 'frontend', 'src', 'templates', 'components'),
    sectionsDest: path.join(previewWorkspace, 'src', 'components', 'sections'),
  };
}

function assertWithinRoot(root: string, target: string, label: string): void {
  const normalizedRoot = path.resolve(root);
  const normalizedTarget = path.resolve(target);
  const rootPrefix = normalizedRoot.endsWith(path.sep)
    ? normalizedRoot
    : `${normalizedRoot}${path.sep}`;

  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(rootPrefix)) {
    throw new Error(`${label} escapes preview root`);
  }
}

export function resolvePreviewSrcPath(
  srcRoot: string,
  inputPath: string,
): { canonicalPath: string; fullPath: string } {
  const canonicalPath = canonicalizeProjectPath(inputPath, {
    allowRootSlash: false,
    stripSrcPrefix: true,
    label: 'preview compile path',
  });
  const fullPath = path.resolve(srcRoot, canonicalPath);
  assertWithinRoot(srcRoot, fullPath, `preview compile path "${inputPath}"`);
  return { canonicalPath, fullPath };
}

export function sanitizeCompileFiles(
  files: Record<string, string>,
  srcRoot: string,
): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [filePath, content] of Object.entries(files)) {
    if (typeof content !== 'string') {
      throw new Error(`preview compile content for "${filePath}" must be a string`);
    }
    const { canonicalPath } = resolvePreviewSrcPath(srcRoot, filePath);
    sanitized[canonicalPath] = content;
  }

  return sanitized;
}

// ── compile queue (serialise builds) ─────────────────────────────────────────

/** Ensures only one `vite build` runs at a time. */
let compileQueue: Promise<void> = Promise.resolve();

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Mount static route for immutable build snapshots.
 * Expected URL: /preview/:buildId
 */
export function registerPreviewBuildRoute(app: express.Express): void {
  app.use('/preview/:buildId', (req, res, next) => {
    const buildPath = path.join(BUILDS_WORKSPACE, req.params.buildId);
    if (!fs.existsSync(buildPath)) return res.status(404).send('Build not found');
    return express.static(buildPath)(req, res, (err) => {
      if (err) return next(err);
      // SPA fallback — serve index.html for any unmatched path inside the build
      return res.sendFile(path.join(buildPath, 'index.html'));
    });
  });
}

/**
 * Mount compile endpoint.
 * POST /api/preview/:buildId/compile  { files: Record<string, string> }
 * Returns { success, buildId, url } on success, { success: false, error } on failure.
 */
export function registerPreviewCompileRoute(app: express.Express): void {
  app.post(
    '/api/preview/:buildId/compile',
    express.json({ limit: '10mb' }),
    async (req, res) => {
      const { buildId } = req.params;

      // Basic buildId validation — must be a UUID-like string
      if (!buildId || !/^[\w-]{8,}$/.test(buildId)) {
        return res.status(400).json({ success: false, error: 'Invalid buildId' });
      }

      const { files, skeletonId } = req.body as { files?: Record<string, string>; skeletonId?: string };
      if (!files || typeof files !== 'object' || Array.isArray(files)) {
        return res.status(400).json({
          success: false,
          error: 'files is required (Record<string, string>)',
        });
      }
      if (skeletonId !== undefined && typeof skeletonId !== 'string') {
        return res.status(400).json({ success: false, error: 'skeletonId must be a string' });
      }

      const srcDir = path.join(PREVIEW_WORKSPACE, 'src');
      let sanitizedFiles: Record<string, string>;
      try {
        sanitizedFiles = sanitizeCompileFiles(files, srcDir);
      } catch (e: any) {
        return res.status(400).json({
          success: false,
          error: e?.message ?? String(e),
        });
      }

      // Enqueue — only one build runs at a time
      const job = compileQueue.then(() => compileBuild(buildId, sanitizedFiles, skeletonId));
      compileQueue = job.then(() => undefined, () => undefined);

      try {
        await job;
        await cleanupLRU();
        res.json({ success: true, buildId, url: `/preview/${buildId}` });
      } catch (e: any) {
        console.error(`[preview-manager] compile failed for ${buildId}:`, e.message);
        res.status(500).json({ success: false, error: e.message ?? String(e) });
      }
    },
  );
}

// ── internal helpers ──────────────────────────────────────────────────────────

/**
 * Ensure shadcn/ui accordion (and peer components) are installed in
 * preview-workspace/src/components/ui/.
 *
 * Idempotent: skips entirely when accordion.tsx already exists.
 * Non-fatal: a failed shadcn add is logged but does not abort the build.
 */
async function ensureShadcnComponents(workspaceRoot: string): Promise<void> {
  const accordionPath = path.join(workspaceRoot, 'src', 'components', 'ui', 'accordion.tsx');
  if (fs.existsSync(accordionPath)) return;

  // Overwrite components.json with the Lyra/Vega preset (new-york + neutral, radius 0.75)
  const componentsJson = {
    $schema: 'https://ui.shadcn.com/schema.json',
    style: 'new-york',
    rsc: false,
    tsx: true,
    tailwind: {
      config: 'tailwind.config.js',
      css: 'src/index.css',
      baseColor: 'neutral',
      cssVariables: true,
    },
    aliases: {
      components: '@/components',
      utils: '@/lib/utils',
    },
    radius: 0.75,
  };
  await fsPromises.writeFile(
    path.join(workspaceRoot, 'components.json'),
    JSON.stringify(componentsJson, null, 2),
    'utf-8',
  );

  console.log('[preview-manager] Installing shadcn/ui...');
  await new Promise<void>((resolve) => {
    const child = spawn(
      'npx',
      ['shadcn@latest', 'add', 'accordion', 'button', 'card', 'input', 'label', 'textarea', '--overwrite', '-y'],
      {
        cwd: workspaceRoot,
        stdio: 'pipe',
        shell: process.platform === 'win32',
      },
    );
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.stdout?.on('data', () => {});
    child.on('close', (code) => {
      if (code === 0) {
        console.log('[preview-manager] shadcn/ui ready');
      } else {
        // Non-fatal: templates using accordion will fail to compile, but the
        // build is not aborted — simpler components continue to work.
        console.warn('[preview-manager] shadcn add exited', code, stderr.slice(0, 400));
      }
      resolve();
    });
  });
}

/**
 * Write user files into preview-workspace/src/, stamp __build_id.ts,
 * then run `vite build --outDir builds/<buildId>`.
 *
 * Owns workspace cleanup: clears user-generated files before writing new build
 * files so stale files from previous builds cannot contaminate the Vite
 * compilation. Template/skeleton directories (components/, config/, context/,
 * lib/, themes/, hooks/) and permanent fixtures (main.tsx, index.css,
 * vite-env.d.ts) are preserved.
 *
 * This replaces the legacy /__clear_preview Vite dev-server endpoint that the
 * frontend previously called before NEW-mode generation. The backend now owns
 * this cleanup so the generation path has no dependency on the Vite middleware.
 */
async function compileBuild(
  buildId: string,
  files: Record<string, string>,
  skeletonId?: string,
): Promise<void> {
  const outDir = path.join(BUILDS_WORKSPACE, buildId);
  const srcDir = path.join(PREVIEW_WORKSPACE, 'src');

  // 0-pre. Ensure shadcn/ui accordion is present (idempotent, non-fatal).
  await ensureShadcnComponents(PREVIEW_WORKSPACE);

  // 0. Workspace reset — two modes:
  //    a) Skeleton mode (skeletonId provided): wipe src/* entirely, then copy
  //       the skeleton so there is no contamination from previous projects.
  //    b) Legacy mode: keep PRESERVED_PREVIEW_DIRS, only delete unknown files.
  if (skeletonId) {
    const skeletonSrc = path.join(SKELETONS_ROOT, skeletonId, `skeleton-${skeletonId}`, 'src');
    if (!fs.existsSync(skeletonSrc)) {
      throw new Error(`Skeleton not found: ${skeletonId} (expected at ${skeletonSrc})`);
    }
    console.log(`[preview-manager] Atomic skeleton install: wiping src/ → copying ${skeletonId}`);
    // 0a-i. Wipe everything in src/
    try {
      const items = await fsPromises.readdir(srcDir, { withFileTypes: true });
      for (const item of items) {
        await fsPromises.rm(path.join(srcDir, item.name), { recursive: true, force: true });
      }
    } catch {
      // Non-fatal: proceed even if wipe partially fails
    }
    // 0a-ii. Copy skeleton src/* into preview-workspace/src/
    await fsPromises.cp(skeletonSrc, srcDir, { recursive: true });
    console.log(`[preview-manager] Skeleton ${skeletonId} installed into src/`);
  } else {
    // 0b. Legacy cleanup — preserve skeleton infra dirs, remove unknown files.
    const KEEP_FILES = new Set(['main.tsx', 'index.css', 'vite-env.d.ts', '__build_id.ts']);
    const KEEP_DIRS  = new Set(PRESERVED_PREVIEW_DIRS);
    try {
      const items = await fsPromises.readdir(srcDir, { withFileTypes: true });
      for (const item of items) {
        const itemPath = path.join(srcDir, item.name);
        if (item.isDirectory()) {
          if (!KEEP_DIRS.has(item.name)) {
            await fsPromises.rm(itemPath, { recursive: true, force: true });
          }
        } else if (!KEEP_FILES.has(item.name)) {
          await fsPromises.rm(itemPath, { force: true });
        }
      }
    } catch {
      // Non-fatal: proceed with compilation even if cleanup fails
    }
  }

  // 0.5. Mirror section templates into the preview workspace so generated
  // App.tsx imports always resolve to concrete files.
  const { templatesSrc, sectionsDest } = resolveSectionTemplatePaths(PREVIEW_WORKSPACE);
  await fsPromises.rm(sectionsDest, { recursive: true, force: true });
  await fsPromises.cp(templatesSrc, sectionsDest, { recursive: true });

  // 1. Write user source files (delta over the skeleton base)
  for (const [filePath, content] of Object.entries(files)) {
    const { fullPath } = resolvePreviewSrcPath(srcDir, filePath);
    await fsPromises.mkdir(path.dirname(fullPath), { recursive: true });
    await fsPromises.writeFile(fullPath, content, 'utf-8');
  }

  // 1.5a. In skeleton mode: force-restore skeleton's index.css after user file writes
  //       so LLM-emitted index.css cannot strip the design-system CSS variables.
  //       Works for all skeletons automatically — each has a canonical index.css.
  if (skeletonId) {
    const skeletonCss = path.join(SKELETONS_ROOT, skeletonId, `skeleton-${skeletonId}`, 'src', 'index.css');
    if (fs.existsSync(skeletonCss)) {
      await fsPromises.copyFile(skeletonCss, path.join(srcDir, 'index.css'));
      console.log(`[preview-manager] Skeleton CSS preserved: index.css from ${skeletonId}`);
    }
  }

  // 1.5. Guard: ensure src/config/app.ts exports STORAGE_KEYS.
  //      Skeleton hooks (useLocalStorage, useApp) import STORAGE_KEYS from
  //      '@/config/app'. If the LLM-generated app.ts omits it, the build
  //      fails with an unresolved-import error. Auto-append when missing.
  const appConfigPath = path.join(srcDir, 'config', 'app.ts');
  try {
    if (fs.existsSync(appConfigPath)) {
      const appConfigContent = await fsPromises.readFile(appConfigPath, 'utf-8');
      if (!appConfigContent.includes('STORAGE_KEYS')) {
        const storageKeysBlock = `
// Auto-patched by preview-manager: required by skeleton hooks.
export const STORAGE_KEYS = {
  profile: \`\${typeof APP_CONFIG !== 'undefined' ? APP_CONFIG.storagePrefix : 'app.v1'}.profile\`,
  theme: \`\${typeof APP_CONFIG !== 'undefined' ? APP_CONFIG.storagePrefix : 'app.v1'}.theme\`,
  feed: \`\${typeof APP_CONFIG !== 'undefined' ? APP_CONFIG.storagePrefix : 'app.v1'}.feed\`,
  progress: \`\${typeof APP_CONFIG !== 'undefined' ? APP_CONFIG.storagePrefix : 'app.v1'}.progress\`,
} as const;
`;
        await fsPromises.appendFile(appConfigPath, storageKeysBlock, 'utf-8');
        console.log('[preview-manager] Auto-patched STORAGE_KEYS into src/config/app.ts');
      }
    }
  } catch {
    // Non-fatal: if the patch fails the build error will surface naturally
  }

  // 2. Stamp __build_id.ts — MountReporter reads this at build time and posts
  //    `preview-mounted` with the correct buildId when the static app loads.
  await fsPromises.writeFile(
    path.join(srcDir, '__build_id.ts'),
    `export const BUILD_ID = "${buildId}";\n`,
    'utf-8',
  );

  // 2.5. Force-write canonical main.tsx with the preview-mounted handshake.
  //      Skeletons ship a vanilla main.tsx and the LLM may emit its own; either
  //      would silence the host handshake. Writing it last guarantees the
  //      iframe always reports back to the studio.
  const canonicalMainTsx = `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { BUILD_ID } from './__build_id';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in document');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

function notifyMounted(): void {
  if (typeof window === 'undefined' || window.parent === window) return;
  try {
    window.parent.postMessage(
      { type: 'preview-mounted', buildId: BUILD_ID },
      '*',
    );
  } catch { /* parent may be cross-origin; ignore */ }
}
requestAnimationFrame(() => {
  notifyMounted();
  setTimeout(notifyMounted, 100);
  setTimeout(notifyMounted, 500);
  setTimeout(notifyMounted, 1500);
});

window.addEventListener('error', (e) => {
  if (window.parent === window) return;
  try {
    window.parent.postMessage(
      { type: 'iframe-error', buildId: BUILD_ID, message: String(e.message ?? e.error ?? 'error') },
      '*',
    );
  } catch { /* ignore */ }
});
window.addEventListener('unhandledrejection', (e) => {
  if (window.parent === window) return;
  try {
    window.parent.postMessage(
      { type: 'iframe-error', buildId: BUILD_ID, message: String(e.reason ?? 'unhandled rejection') },
      '*',
    );
  } catch { /* ignore */ }
});
`;
  await fsPromises.writeFile(path.join(srcDir, 'main.tsx'), canonicalMainTsx, 'utf-8');

  // 3. Ensure builds/ exists and run vite build
  //    outDir is outside preview-workspace/ so Vite's root-check passes.
  await fsPromises.mkdir(BUILDS_WORKSPACE, { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'npx',
      ['vite', 'build', '--outDir', outDir, '--emptyOutDir'],
      {
        cwd: PREVIEW_WORKSPACE,
        stdio: 'pipe',
        shell: process.platform === 'win32',
      },
    );

    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.stdout?.on('data', () => {}); // drain to avoid backpressure

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`[preview-manager] build complete: ${buildId}`);
        resolve();
      } else {
        reject(new Error(`vite build exited ${code}:\n${stderr.slice(0, 1000)}`));
      }
    });
  });
}

/**
 * Public API for running a compile job directly (used by quality endpoint).
 * Sanitises files, enqueues the build, cleans up LRU — same as the HTTP route.
 */
export async function runCompileJob(
  buildId: string,
  files: Record<string, string>,
  skeletonId?: string,
): Promise<void> {
  const srcDir = path.join(PREVIEW_WORKSPACE, 'src');
  const sanitized = sanitizeCompileFiles(files, srcDir);
  const job = compileQueue.then(() => compileBuild(buildId, sanitized, skeletonId));
  compileQueue = job.then(() => undefined, () => undefined);
  await job;
  await cleanupLRU();
}

/**
 * Evict the oldest build directories when the count exceeds MAX_BUILDS.
 */
async function cleanupLRU(): Promise<void> {
  await fsPromises.mkdir(BUILDS_WORKSPACE, { recursive: true });

  let entries: string[];
  try {
    entries = await fsPromises.readdir(BUILDS_WORKSPACE);
  } catch {
    return;
  }

  // Stat each entry; keep only directories
  const dirs: { name: string; mtime: number }[] = [];
  for (const entry of entries) {
    try {
      const st = await fsPromises.stat(path.join(BUILDS_WORKSPACE, entry));
      if (st.isDirectory()) dirs.push({ name: entry, mtime: st.mtimeMs });
    } catch { /* skip unreadable entries */ }
  }

  if (dirs.length <= MAX_BUILDS) return;

  dirs.sort((a, b) => a.mtime - b.mtime); // oldest first
  const toEvict = dirs.slice(0, dirs.length - MAX_BUILDS);

  for (const { name } of toEvict) {
    await fsPromises.rm(path.join(BUILDS_WORKSPACE, name), { recursive: true, force: true });
    console.log(`[preview-manager] LRU evicted: ${name}`);
  }
}
