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

      const { files } = req.body as { files?: Record<string, string> };
      if (!files || typeof files !== 'object' || Array.isArray(files)) {
        return res.status(400).json({
          success: false,
          error: 'files is required (Record<string, string>)',
        });
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
      const job = compileQueue.then(() => compileBuild(buildId, sanitizedFiles));
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
 * compilation. Template directories (components/, lib/, themes/, hooks/) and
 * permanent fixtures (main.tsx, index.css, vite-env.d.ts) are preserved.
 *
 * This replaces the legacy /__clear_preview Vite dev-server endpoint that the
 * frontend previously called before NEW-mode generation. The backend now owns
 * this cleanup so the generation path has no dependency on the Vite middleware.
 */
async function compileBuild(
  buildId: string,
  files: Record<string, string>,
): Promise<void> {
  const outDir = path.join(BUILDS_WORKSPACE, buildId);
  const srcDir = path.join(PREVIEW_WORKSPACE, 'src');

  // 0-pre. Ensure shadcn/ui accordion is present (idempotent, non-fatal).
  await ensureShadcnComponents(PREVIEW_WORKSPACE);

  // 0. Clear user-generated files from the shared source workspace.
  //    Serialised via compileQueue — no concurrent writes possible here.
  const KEEP_FILES = new Set(['main.tsx', 'index.css', 'vite-env.d.ts', '__build_id.ts']);
  const KEEP_DIRS  = new Set(['components', 'lib', 'themes', 'hooks']);
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

  // 0.5. Mirror section templates into the preview workspace so generated
  // App.tsx imports always resolve to concrete files.
  const { templatesSrc, sectionsDest } = resolveSectionTemplatePaths(PREVIEW_WORKSPACE);
  await fsPromises.rm(sectionsDest, { recursive: true, force: true });
  await fsPromises.cp(templatesSrc, sectionsDest, { recursive: true });

  // 1. Write user source files
  for (const [filePath, content] of Object.entries(files)) {
    const { fullPath } = resolvePreviewSrcPath(srcDir, filePath);
    await fsPromises.mkdir(path.dirname(fullPath), { recursive: true });
    await fsPromises.writeFile(fullPath, content, 'utf-8');
  }

  // 2. Stamp __build_id.ts — MountReporter reads this at build time and posts
  //    `preview-mounted` with the correct buildId when the static app loads.
  await fsPromises.writeFile(
    path.join(srcDir, '__build_id.ts'),
    `export const BUILD_ID = "${buildId}";\n`,
    'utf-8',
  );

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
