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
const PRESERVED_PREVIEW_DIRS = ['components', 'config', 'context', 'data', 'hooks', 'lib', 'pages', 'themes'];

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

const previewSessionBindings = new Map<string, string>();

export function normalizePreviewSessionToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  if (token.length < 16 || token.length > 200) return null;
  return token;
}

export function bindPreviewBuildSession(
  buildId: string,
  sessionToken: string,
  bindings: Map<string, string> = previewSessionBindings,
): 'bound' | 'already-bound' | 'conflict' {
  const token = normalizePreviewSessionToken(sessionToken);
  if (!token) return 'conflict';

  const existingToken = bindings.get(buildId);
  if (!existingToken) {
    bindings.set(buildId, token);
    return 'bound';
  }
  return existingToken === token ? 'already-bound' : 'conflict';
}

export function validatePreviewBuildSession(
  buildId: string,
  sessionToken: string,
  bindings: Map<string, string> = previewSessionBindings,
): boolean {
  const token = normalizePreviewSessionToken(sessionToken);
  return token !== null && bindings.get(buildId) === token;
}

export function prunePreviewSessionBindings(
  existingBuildIds: Set<string>,
  bindings: Map<string, string> = previewSessionBindings,
): number {
  let pruned = 0;
  for (const buildId of bindings.keys()) {
    if (!existingBuildIds.has(buildId)) {
      bindings.delete(buildId);
      pruned += 1;
    }
  }
  return pruned;
}

export interface PreviewBuildReadOptions {
  nodeEnv?: string;
  serverMode?: string;
}

export function canReadPreviewBuild(
  buildId: string,
  sessionToken: unknown,
  bindings: Map<string, string> = previewSessionBindings,
  options: PreviewBuildReadOptions = {},
): boolean {
  const boundToken = bindings.get(buildId);
  if (boundToken) {
    return normalizePreviewSessionToken(sessionToken) === boundToken;
  }

  return options.nodeEnv !== 'production' && options.serverMode !== 'production';
}

export function appendPreviewSessionToPreviewAssetUrl(assetUrl: string, sessionToken: string): string {
  const token = normalizePreviewSessionToken(sessionToken);
  if (!token) return assetUrl;
  if (/^https?:\/\//i.test(assetUrl) || assetUrl.startsWith('//')) return assetUrl;

  const hashIndex = assetUrl.indexOf('#');
  const beforeHash = hashIndex >= 0 ? assetUrl.slice(0, hashIndex) : assetUrl;
  const hash = hashIndex >= 0 ? assetUrl.slice(hashIndex) : '';
  const queryIndex = beforeHash.indexOf('?');
  const assetPath = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : '';

  if (!/^\.\/assets\/[^?#]+\.(?:js|css)$/i.test(assetPath)) return assetUrl;
  if (new URLSearchParams(query).has('previewSession')) return assetUrl;

  const separator = query ? '&' : '?';
  return `${beforeHash}${separator}previewSession=${encodeURIComponent(token)}${hash}`;
}

export function injectPreviewSessionIntoHtmlAssetUrls(html: string, sessionToken: string): string {
  const token = normalizePreviewSessionToken(sessionToken);
  if (!token) return html;

  return html.replace(
    /(<[^>]*?\s)(src|href)=("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (match, prefix: string, attribute: string, _rawValue: string, doubleQuoted?: string, singleQuoted?: string, bare?: string) => {
      const value = doubleQuoted ?? singleQuoted ?? bare ?? '';
      const nextValue = appendPreviewSessionToPreviewAssetUrl(value, token);
      if (nextValue === value) return match;
      if (doubleQuoted !== undefined) return `${prefix}${attribute}="${nextValue}"`;
      if (singleQuoted !== undefined) return `${prefix}${attribute}='${nextValue}'`;
      return `${prefix}${attribute}=${nextValue}`;
    },
  );
}

export function getPreviewDocumentTrailingSlashRedirectPath(originalUrl: string, buildId: string): string | null {
  const parsed = new URL(originalUrl, 'http://preview.local');
  const previewPath = `/preview/${buildId}`;
  if (parsed.pathname !== previewPath) return null;
  return `${previewPath}/${parsed.search}`;
}

function isPreviewIndexRequest(req: express.Request): boolean {
  return req.path === '/' || req.path === '/index.html';
}

async function sendPreviewIndexHtml(
  res: express.Response,
  buildPath: string,
  sessionToken: string | null,
): Promise<void> {
  const html = await fsPromises.readFile(path.join(buildPath, 'index.html'), 'utf-8');
  const body = sessionToken ? injectPreviewSessionIntoHtmlAssetUrls(html, sessionToken) : html;
  res.type('html').send(body);
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Mount static route for immutable build snapshots.
 * Expected URL: /preview/:buildId
 */
export function registerPreviewBuildRoute(app: express.Express): void {
  app.use('/preview/:buildId', (req, res, next) => {
    const { buildId } = req.params;
    const buildPath = path.join(BUILDS_WORKSPACE, buildId);
    if (!fs.existsSync(buildPath)) return res.status(404).send('Build not found');

    const queryToken = normalizePreviewSessionToken(req.query.previewSession);
    const headerToken = normalizePreviewSessionToken(req.get('X-Preview-Session'));
    if (!canReadPreviewBuild(buildId, queryToken ?? headerToken, previewSessionBindings, {
      nodeEnv: process.env.NODE_ENV,
      serverMode: process.env.AIC_SERVER_MODE,
    })) {
      return res.status(403).send('Preview access denied');
    }

    const sessionToken = queryToken ?? headerToken;
    const redirectPath = getPreviewDocumentTrailingSlashRedirectPath(req.originalUrl, buildId);
    if (redirectPath) {
      return res.redirect(302, redirectPath);
    }

    if (isPreviewIndexRequest(req)) {
      return sendPreviewIndexHtml(res, buildPath, sessionToken).catch(next);
    }

    return express.static(buildPath, { index: false })(req, res, (err) => {
      if (err) return next(err);
      // SPA fallback — serve index.html for any unmatched path inside the build
      return sendPreviewIndexHtml(res, buildPath, sessionToken).catch(next);
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

      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? req.body as { files?: Record<string, string>; skeletonId?: string; sessionId?: unknown }
        : {};
      const rawSessionToken = req.get('X-Preview-Session') ?? body.sessionId;
      if (rawSessionToken === undefined || rawSessionToken === null) {
        return res.status(401).json({ success: false, error: 'Preview session token is required' });
      }
      const sessionToken = normalizePreviewSessionToken(rawSessionToken);
      if (!sessionToken) {
        return res.status(400).json({ success: false, error: 'Invalid preview session token' });
      }
      const boundSessionToken = previewSessionBindings.get(buildId);
      if (boundSessionToken && boundSessionToken !== sessionToken) {
        return res.status(409).json({ success: false, error: 'Preview build is bound to another session' });
      }

      const { files, skeletonId } = body;
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

      const bindingResult = bindPreviewBuildSession(buildId, sessionToken);
      if (bindingResult === 'conflict') {
        return res.status(409).json({ success: false, error: 'Preview build is bound to another session' });
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

export interface UiPrimitiveImport {
  primitive: string;
  importedBy: string;
  specifier: string;
}

export interface UiPrimitiveGuardResult {
  imports: UiPrimitiveImport[];
  materialized: string[];
}

const UI_PRIMITIVE_SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const KNOWN_MATERIALIZABLE_UI_PRIMITIVES = new Set(['scroll-area']);

function stripModuleExtension(value: string): string {
  return value.replace(/\.(?:tsx?|jsx?)$/i, '');
}

export function extractUiPrimitiveImportName(specifier: string): string | null {
  const normalized = stripModuleExtension(specifier.replace(/\\/g, '/'));
  const match = normalized.match(/(?:^|\/)components\/ui\/([^/]+)$/);
  if (!match) return null;
  const primitive = match[1].trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(primitive) ? primitive : null;
}

export function findUiPrimitiveImportsInSource(source: string, importedBy: string): UiPrimitiveImport[] {
  const imports: UiPrimitiveImport[] = [];
  const seen = new Set<string>();
  const addSpecifier = (specifier: string) => {
    const primitive = extractUiPrimitiveImportName(specifier);
    if (!primitive) return;
    const key = `${primitive}\0${specifier}`;
    if (seen.has(key)) return;
    seen.add(key);
    imports.push({ primitive, importedBy, specifier });
  };

  for (const match of source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)) {
    addSpecifier(match[1]);
  }
  for (const match of source.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) {
    addSpecifier(match[1]);
  }

  return imports;
}

function hasUiPrimitiveFile(uiRoot: string, primitive: string): boolean {
  const candidates = [
    `${primitive}.ts`,
    `${primitive}.tsx`,
    path.join(primitive, 'index.ts'),
    path.join(primitive, 'index.tsx'),
  ];
  return candidates.some(candidate => fs.existsSync(path.join(uiRoot, candidate)));
}

function canonicalUiPrimitiveCandidates(primitive: string, skeletonId?: string): string[] {
  const skeletonIds = [
    skeletonId && /^[a-zA-Z0-9-]+$/.test(skeletonId) ? skeletonId : null,
    'mobile-app',
  ].filter((value, index, arr): value is string => Boolean(value) && arr.indexOf(value) === index);

  return skeletonIds.flatMap(id => {
    const uiRoot = path.join(SKELETONS_ROOT, id, `skeleton-${id}`, 'src', 'components', 'ui');
    return [
      path.join(uiRoot, `${primitive}.tsx`),
      path.join(uiRoot, `${primitive}.ts`),
      path.join(uiRoot, primitive, 'index.tsx'),
      path.join(uiRoot, primitive, 'index.ts'),
    ];
  });
}

async function materializeKnownUiPrimitive(
  uiRoot: string,
  primitive: string,
  skeletonId?: string,
): Promise<string> {
  if (!KNOWN_MATERIALIZABLE_UI_PRIMITIVES.has(primitive)) {
    throw new Error(`Missing UI primitive import: components/ui/${primitive}`);
  }

  const canonicalSource = canonicalUiPrimitiveCandidates(primitive, skeletonId)
    .find(candidate => fs.existsSync(candidate));

  if (!canonicalSource) {
    throw new Error(`Missing UI primitive import: components/ui/${primitive} (canonical source not found)`);
  }

  const targetPath = path.join(uiRoot, `${primitive}${path.extname(canonicalSource) || '.tsx'}`);
  await fsPromises.mkdir(path.dirname(targetPath), { recursive: true });
  await fsPromises.copyFile(canonicalSource, targetPath);
  return targetPath;
}

async function collectSourceFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const visit = async (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = await fsPromises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue;
        await visit(entryPath);
      } else if (UI_PRIMITIVE_SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        out.push(entryPath);
      }
    }
  };

  await visit(root);
  return out;
}

export async function ensureImportedUiPrimitives(
  srcDir: string,
  skeletonId?: string,
): Promise<UiPrimitiveGuardResult> {
  const uiRoot = path.join(srcDir, 'components', 'ui');
  const sourceFiles = await collectSourceFiles(srcDir);
  const imports: UiPrimitiveImport[] = [];
  const importByPrimitive = new Map<string, UiPrimitiveImport>();

  for (const sourceFile of sourceFiles) {
    const content = await fsPromises.readFile(sourceFile, 'utf-8');
    const importedBy = `src/${path.relative(srcDir, sourceFile).replace(/\\/g, '/')}`;
    for (const uiImport of findUiPrimitiveImportsInSource(content, importedBy)) {
      imports.push(uiImport);
      if (!importByPrimitive.has(uiImport.primitive)) {
        importByPrimitive.set(uiImport.primitive, uiImport);
      }
    }
  }

  const materialized: string[] = [];
  for (const [primitive, uiImport] of importByPrimitive) {
    if (hasUiPrimitiveFile(uiRoot, primitive)) continue;

    if (KNOWN_MATERIALIZABLE_UI_PRIMITIVES.has(primitive)) {
      const targetPath = await materializeKnownUiPrimitive(uiRoot, primitive, skeletonId);
      materialized.push(path.relative(srcDir, targetPath).replace(/\\/g, '/'));
      continue;
    }

    throw new Error(
      `Missing UI primitive import: components/ui/${primitive} (imported by ${uiImport.importedBy})`,
    );
  }

  return { imports, materialized };
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
    // Preserve root skeleton files so a prior skeleton install can be followed by
    // delta-only compile calls without losing App.tsx / route wiring.
    const KEEP_FILES = new Set([
      'App.tsx',
      '__build_id.ts',
      'index.css',
      'main.tsx',
      'route-manifest.json',
      'vite-env.d.ts',
    ]);
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

  const uiPrimitiveGuard = await ensureImportedUiPrimitives(srcDir, skeletonId);
  for (const materializedPath of uiPrimitiveGuard.materialized) {
    console.log(`[preview-manager] Materialized UI primitive: ${materializedPath}`);
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

  if (dirs.length <= MAX_BUILDS) {
    prunePreviewSessionBindings(new Set(dirs.map(({ name }) => name)));
    return;
  }

  dirs.sort((a, b) => a.mtime - b.mtime); // oldest first
  const toEvict = dirs.slice(0, dirs.length - MAX_BUILDS);

  for (const { name } of toEvict) {
    await fsPromises.rm(path.join(BUILDS_WORKSPACE, name), { recursive: true, force: true });
    console.log(`[preview-manager] LRU evicted: ${name}`);
  }

  const evictedBuildIds = new Set(toEvict.map(({ name }) => name));
  const existingBuildIds = new Set(dirs.filter(({ name }) => !evictedBuildIds.has(name)).map(({ name }) => name));
  prunePreviewSessionBindings(existingBuildIds);
}
