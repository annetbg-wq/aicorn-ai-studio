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
import type { SkeletonId } from '../frontend/src/services/SkeletonRegistry';
import {
  LIVE_GENERATION_ALLOWED_UI_PRIMITIVES,
  canonicalUiPrimitiveId,
  preferredUiPrimitiveWorkspaceRoots,
  uiPrimitiveWorkspaceCandidates,
} from '../frontend/src/services/LiveGenerationUiPrimitives';
import {
  LiveGenerationContractError,
  createViteBuildDiagnostic,
  isLiveGenerationContractError,
  validateLiveGenerationContract,
} from '../frontend/src/services/LiveGenerationContractValidator';

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
const PRESERVED_PREVIEW_DIRS: string[] = [];
const REPO_ROOT = path.resolve(__dirname, '..');

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

// ── build status store ────────────────────────────────────────────────────────

export type PreviewBuildStatusCode = 'building' | 'ready' | 'failed';

export interface PreviewBuildStatus {
  buildId: string;
  status: PreviewBuildStatusCode;
  previewPath?: string;
  error?: string;
  diagnostics?: unknown[];
  durationMs?: number;
  updatedAt: string;
}

const _buildStatuses = new Map<string, PreviewBuildStatus>();

export function getPreviewBuildStatus(buildId: string): PreviewBuildStatus | undefined {
  return _buildStatuses.get(buildId);
}

export function setPreviewBuildStatus(record: PreviewBuildStatus): void {
  _buildStatuses.set(record.buildId, record);
}

export function clearPreviewBuildStatuses(): void {
  _buildStatuses.clear();
}

export function clearPreviewBuildStatus(buildId: string): void {
  _buildStatuses.delete(buildId);
}

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

  // Rewriting module script URLs with previewSession creates a second module
  // graph when lazy chunks import the same file without that query string.
  if (!/^\.\/assets\/[^?#]+\.css$/i.test(assetPath)) return assetUrl;
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

function isPreviewAssetRequest(req: express.Request): boolean {
  return req.path.startsWith('/assets/');
}

async function sendPreviewStaticAsset(
  res: express.Response,
  buildPath: string,
  assetRequestPath: string,
): Promise<void> {
  const relativeAssetPath = assetRequestPath.replace(/^\/+/, '');
  const assetPath = path.resolve(buildPath, relativeAssetPath);
  assertWithinRoot(buildPath, assetPath, `preview asset path "${assetRequestPath}"`);

  let assetStats: fs.Stats;
  try {
    assetStats = await fsPromises.stat(assetPath);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      res.status(404).send('Asset not found');
      return;
    }
    throw error;
  }

  if (!assetStats.isFile()) {
    res.status(404).send('Asset not found');
    return;
  }

  await new Promise<void>((resolve, reject) => {
    res.sendFile(assetPath, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
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
    const sessionToken = queryToken ?? headerToken;
    const redirectPath = getPreviewDocumentTrailingSlashRedirectPath(req.originalUrl, buildId);
    if (redirectPath) {
      return res.redirect(302, redirectPath);
    }

    if (isPreviewIndexRequest(req)) {
      if (!canReadPreviewBuild(buildId, sessionToken, previewSessionBindings, {
        nodeEnv: process.env.NODE_ENV,
        serverMode: process.env.AIC_SERVER_MODE,
      })) {
        return res.status(403).send('Preview access denied');
      }
      return sendPreviewIndexHtml(res, buildPath, sessionToken).catch(next);
    }

    if (isPreviewAssetRequest(req)) {
      return sendPreviewStaticAsset(res, buildPath, req.path).catch(next);
    }

    return express.static(buildPath, { index: false })(req, res, (err) => {
      if (err) return next(err);
      // SPA fallback — serve index.html for any unmatched path inside the build
      if (!canReadPreviewBuild(buildId, sessionToken, previewSessionBindings, {
        nodeEnv: process.env.NODE_ENV,
        serverMode: process.env.AIC_SERVER_MODE,
      })) {
        return res.status(403).send('Preview access denied');
      }
      return sendPreviewIndexHtml(res, buildPath, sessionToken).catch(next);
    });
  });
}

/**
 * Mount build status endpoint.
 * GET /api/preview/:buildId/status
 * Returns PreviewBuildStatus JSON; 404 if unknown, 403 if session invalid.
 */
export function registerPreviewStatusRoute(app: express.Express): void {
  app.get('/api/preview/:buildId/status', (req, res) => {
    const { buildId } = req.params;

    const record = _buildStatuses.get(buildId);
    if (!record) {
      return res.status(404).json({ error: 'Build not found' });
    }

    const queryToken = normalizePreviewSessionToken(req.query.previewSession);
    const headerToken = normalizePreviewSessionToken(req.get('X-Preview-Session'));
    const sessionToken = queryToken ?? headerToken;

    if (!canReadPreviewBuild(buildId, sessionToken, previewSessionBindings, {
      nodeEnv: process.env.NODE_ENV,
      serverMode: process.env.AIC_SERVER_MODE,
    })) {
      return res.status(403).json({ error: 'Preview access denied' });
    }

    return res.json(record);
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
        ? req.body as { files?: Record<string, string>; skeletonId?: SkeletonId; sessionId?: unknown }
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
      const buildStartMs = Date.now();
      setPreviewBuildStatus({ buildId, status: 'building', updatedAt: new Date().toISOString() });
      const job = compileQueue.then(() => compileBuild(buildId, sanitizedFiles, skeletonId));
      compileQueue = job.then(() => undefined, () => undefined);

      try {
        await job;
        const durationMs = Date.now() - buildStartMs;
        await cleanupLRU();
        setPreviewBuildStatus({
          buildId,
          status: 'ready',
          previewPath: `/preview/${buildId}`,
          durationMs,
          updatedAt: new Date().toISOString(),
        });
        res.json({ success: true, buildId, url: `/preview/${buildId}` });
      } catch (e: any) {
        const durationMs = Date.now() - buildStartMs;
        if (isLiveGenerationContractError(e)) {
          const rootCause = e.diagnostics?.[0]?.root_cause_type;
          const statusCode = rootCause === 'vite_build_error' ? 500 : 422;
          console.error(`[preview-manager] compile contract failed for ${buildId}:`, e.message);
          setPreviewBuildStatus({
            buildId,
            status: 'failed',
            error: e.message ?? String(e),
            diagnostics: e.diagnostics,
            durationMs,
            updatedAt: new Date().toISOString(),
          });
          return res.status(statusCode).json({
            success: false,
            error: e.message ?? String(e),
            diagnostics: e.diagnostics,
            candidateGraphSummary: e.candidateGraphSummary,
          });
        }
        console.error(`[preview-manager] compile failed for ${buildId}:`, e.message);
        setPreviewBuildStatus({
          buildId,
          status: 'failed',
          error: e.message ?? String(e),
          durationMs,
          updatedAt: new Date().toISOString(),
        });
        res.status(500).json({ success: false, error: e.message ?? String(e) });
      }
    },
  );

  // Cascade cleanup: when a project is deleted in the UI, its compiled preview
  // build (builds/<buildId>/) is an orphan on the server until LRU eviction. This
  // endpoint removes it eagerly so deleting a project also removes its backend copy.
  // Idempotent — returns success even if the build directory no longer exists.
  app.delete('/api/preview/build/:buildId', async (req, res) => {
    const { buildId } = req.params;
    if (!buildId || !/^[\w-]{8,}$/.test(buildId)) {
      return res.status(400).json({ success: false, error: 'Invalid buildId' });
    }
    const outDir = path.join(BUILDS_WORKSPACE, buildId);
    // Guard against path traversal: the resolved dir must stay inside BUILDS_WORKSPACE.
    const resolved = path.resolve(outDir);
    if (resolved !== path.resolve(BUILDS_WORKSPACE, buildId)) {
      return res.status(400).json({ success: false, error: 'Invalid buildId' });
    }
    try {
      await fsPromises.rm(resolved, { recursive: true, force: true });
      previewSessionBindings.delete(buildId);
      clearPreviewBuildStatus(buildId);
      console.log(`[preview-manager] Deleted preview build: ${buildId}`);
      return res.status(200).json({ success: true });
    } catch (e: any) {
      console.error(`[preview-manager] failed to delete build ${buildId}:`, e?.message ?? e);
      return res.status(500).json({ success: false, error: e?.message ?? String(e) });
    }
  });
}

// ── internal helpers ──────────────────────────────────────────────────────────

export async function ensurePreviewLibShims(workspaceRoot: string): Promise<void> {
  const libDir = path.join(workspaceRoot, 'src', 'lib');
  const utilsPath = path.join(libDir, 'utils.ts');
  if (fs.existsSync(utilsPath)) return;

  await fsPromises.mkdir(libDir, { recursive: true });
  await fsPromises.writeFile(
    utilsPath,
    [
      "export { cn } from './cn';",
      "export * from './cn';",
      '',
    ].join('\n'),
    'utf-8',
  );
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
const CANDIDATE_GRAPH_TEXT_EXTENSIONS = new Set(['.css', '.js', '.json', '.jsx', '.ts', '.tsx']);
const KNOWN_MATERIALIZABLE_UI_PRIMITIVES = new Set(LIVE_GENERATION_ALLOWED_UI_PRIMITIVES);

export function getKnownMaterializableUiPrimitives(): string[] {
  return Array.from(KNOWN_MATERIALIZABLE_UI_PRIMITIVES).sort((left, right) => left.localeCompare(right));
}

function stripModuleExtension(value: string): string {
  return value.replace(/\.(?:tsx?|jsx?)$/i, '');
}

function normalizeUiPrimitiveName(value: string): string {
  const trimmed = stripModuleExtension(value.trim());
  if (!trimmed) return '';
  if (trimmed.includes('-')) return trimmed.toLowerCase();
  return trimmed
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();
}

export function extractUiPrimitiveImportName(specifier: string): string | null {
  const cleaned = specifier.replace(/\\/g, '/');
  const normalized = stripModuleExtension(cleaned);
  // Alias / absolute form: @/components/ui/<name> or .../components/ui/<name>
  let match = normalized.match(/(?:^|\/)components\/ui\/([^/]+)$/);
  // Relative sibling form used by skeleton shell components (PaywallSheet, BottomTabs):
  // ./ui/<name>, ../ui/<name>. Restricted to relative specifiers so unrelated
  // paths like 'src/features/ui/Foo' are not mistaken for primitives.
  if (!match && /^\.\.?\//.test(cleaned)) {
    match = normalized.match(/(?:^|\/)ui\/([^/]+)$/);
  }
  if (!match) return null;
  // normalizeUiPrimitiveName lowercases (Sheet → sheet), so casing is handled here.
  const primitive = normalizeUiPrimitiveName(match[1]);
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(primitive) ? primitive : null;
}

// ── UI primitive contract guard (pre-write) ───────────────────────────────────

export interface GeneratedUiPrimitiveViolation {
  filePath: string;
  kind: 'ui_primitive_write' | 'direct_radix_import';
  detail: string;
}

const DIRECT_RADIX_IMPORT_RE = /\bfrom\s*['"](@radix-ui(?:\/[^'"]*)?|radix-ui)['"]/g;

/**
 * Extracts all direct radix-ui / @radix-ui import specifiers from source text.
 * Used both by the contract guard and by tests.
 */
export function extractDirectRadixImports(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(DIRECT_RADIX_IMPORT_RE)) {
    found.push(match[1] ?? '');
  }
  return found;
}

/**
 * Validates generated files BEFORE they are written to preview-workspace.
 * Rejects:
 *   - any generated write to src/components/ui/ (system-owned directory)
 *   - any direct import from @radix-ui/* or radix-ui in generated code
 *     (generated code must import only @/components/ui/* wrappers)
 */
export function validateGeneratedUiPrimitiveContracts(
  files: Record<string, string>,
): GeneratedUiPrimitiveViolation[] {
  const violations: GeneratedUiPrimitiveViolation[] = [];

  for (const [rawPath, content] of Object.entries(files)) {
    const normalized = rawPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '').replace(/^src\//, '');

    if (normalized.startsWith('components/ui/')) {
      const filename = normalized.slice('components/ui/'.length);
      violations.push({
        filePath: rawPath,
        kind: 'ui_primitive_write',
        detail:
          `Generated code must not write src/components/ui/${filename}. ` +
          `Import from '@/components/ui/<name>' — the system owns and materializes canonical primitives.`,
      });
      continue;
    }

    for (const specifier of extractDirectRadixImports(content)) {
      violations.push({
        filePath: rawPath,
        kind: 'direct_radix_import',
        detail:
          `Generated code in '${rawPath}' imports directly from '${specifier}'. ` +
          `Use '@/components/ui/<name>' wrappers instead of direct Radix imports.`,
      });
    }
  }

  return violations;
}

// ── Stale UI primitive cleanup ────────────────────────────────────────────────

const CANONICAL_UI_LOWERCASE_IDS = new Set<string>(LIVE_GENERATION_ALLOWED_UI_PRIMITIVES);

/**
 * Removes stale non-canonical files from the preview-workspace src/components/ui/ directory.
 *
 * A PascalCase file (Button.tsx, Dialog.tsx) is deleted ONLY when its canonical
 * lowercase counterpart (button.tsx, dialog.tsx) ALSO exists in the same directory —
 * a true Windows case-shadow that would make Vite resolve the wrong module.
 *
 * Skeletons ship their primitives in PascalCase (Dialog.tsx) and re-export them from a
 * components/ui/index.ts barrel (`export * from './Dialog'`). Those are AUTHORITATIVE,
 * not residue: deleting them breaks the barrel (root cause of
 * `missing_ui_primitive ./Dialog`). When no lowercase shadow exists, the PascalCase
 * file IS the primitive and is kept. The workspace is fully wiped before a skeleton
 * copy, so there is no stale residue to clean in skeleton mode anyway.
 */
export async function cleanStaleUiPrimitiveFiles(uiRoot: string): Promise<string[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fsPromises.readdir(uiRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  // Canonical lowercase primitive filenames physically present in the directory.
  const presentCanonicalIds = new Set(
    entries
      .filter(entry => entry.isFile())
      .map(entry => entry.name.replace(/\.(?:tsx?|jsx?)$/i, ''))
      .filter(base => CANONICAL_UI_LOWERCASE_IDS.has(base)),
  );

  const removed: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (name === 'index.ts' || name === 'index.tsx') continue;
    const basename = name.replace(/\.(?:tsx?|jsx?)$/i, '');
    if (CANONICAL_UI_LOWERCASE_IDS.has(basename)) continue; // canonical lowercase — keep
    // Non-canonical-cased file (e.g. Dialog.tsx). Delete only when its lowercase
    // canonical counterpart also exists as a distinct file (true shadow); otherwise
    // it is the authoritative primitive (skeleton-shipped) and must survive.
    const canonicalId = normalizeUiPrimitiveName(basename);
    if (!presentCanonicalIds.has(canonicalId)) continue;
    try {
      await fsPromises.rm(path.join(uiRoot, name), { force: true });
      removed.push(name);
    } catch {
      // Non-fatal: compile will surface any remaining issues
    }
  }
  return removed;
}

// ── Build-system file contract guard (pre-write) ──────────────────────────────

/**
 * File names that must NEVER be written into preview-workspace/src/.
 * These are owned by the Vite/TypeScript build infrastructure. Landing any of
 * them in src/ causes Vite/esbuild to mis-resolve references (e.g. tsconfig.json
 * referencing tsconfig.node.json which does not exist inside src/).
 */
const BUILD_SYSTEM_BLOCKLIST_RE =
  /^(?:tsconfig(?:\.[^/]*)?\.json|vite\.config\.[tj]s|vitest\.config\.[tj]s|postcss\.config\.[tj]s?|tailwind\.config\.[tj]s|package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|\.env(?:\.\w+)?|__build_id\.ts|vite-env\.d\.ts)$/i;

export interface GeneratedBuildSystemViolation {
  filePath: string;
  kind: 'build_system_file';
  detail: string;
}

/**
 * Validates generated files BEFORE they are written to preview-workspace.
 * Rejects any file whose canonical name (after stripping the leading src/ prefix)
 * matches the build-system blocklist — tsconfig.json, vite.config.ts, package.json, etc.
 * The LLM must not own these files; they belong to the static Vite workspace template.
 */
export function validateGeneratedBuildSystemContracts(
  files: Record<string, string>,
): GeneratedBuildSystemViolation[] {
  const violations: GeneratedBuildSystemViolation[] = [];

  for (const rawPath of Object.keys(files)) {
    const normalized = rawPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '').replace(/^src\//, '');
    const basename = normalized.split('/').pop() ?? '';
    if (BUILD_SYSTEM_BLOCKLIST_RE.test(basename)) {
      violations.push({
        filePath: rawPath,
        kind: 'build_system_file',
        detail:
          `Generated code must not write '${basename}'. ` +
          `This file is owned by the Vite/TypeScript build system. ` +
          `Only generate application source files (App.tsx, pages/, components/, hooks/, etc.).`,
      });
    }
  }

  return violations;
}

/**
 * Removes stale build-system config files from the root of preview-workspace/src/.
 * These files (tsconfig.json, vite.config.ts, package.json, etc.) should only live
 * at the preview-workspace root — never inside src/. When an LLM session writes them
 * into src/, they break Vite's esbuild parser on subsequent builds. This cleanup runs
 * before user-file writes so even freshly-generated files are caught by the pre-write
 * guard instead of reaching the file system.
 * Only inspects the immediate src/ directory — does NOT descend into subdirectories.
 */
export async function cleanStaleBuildSystemFiles(srcDir: string): Promise<string[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fsPromises.readdir(srcDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const removed: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (BUILD_SYSTEM_BLOCKLIST_RE.test(entry.name)) {
      try {
        await fsPromises.rm(path.join(srcDir, entry.name), { force: true });
        removed.push(entry.name);
      } catch {
        // Non-fatal
      }
    }
  }
  return removed;
}

// ── Unified admission gate ────────────────────────────────────────────────────

export interface PreviewFileViolation {
  filePath: string;
  kind: 'ui_primitive_write' | 'direct_radix_import' | 'build_system_file' | 'system_zone_write';
  detail: string;
}

/**
 * Partition of an incoming generated-files payload into ownership channels.
 *
 *   - appFiles            — application source the build system writes to the workspace.
 *   - strippedSystemFiles — components/ui/** the LLM tried to author; silently dropped
 *                           because the build system materializes canonical primitives.
 *   - docsFiles           — docs/architect/** product-document package; persisted/surfaced,
 *                           never fed to the compiler.
 *   - designFiles         — design-pack/** system design channel; not a compile input.
 *   - rejectedFiles       — files that triggered a FATAL violation.
 *   - fatalViolations     — build-system files + direct Radix imports; abort the build.
 *
 * `acceptedFiles` / `violations` are retained as aliases of `appFiles` / `fatalViolations`
 * so existing call sites keep their meaning (only fatal violations abort a compile now).
 */
export interface PreviewFileAdmissionResult {
  appFiles: Record<string, string>;
  strippedSystemFiles: Record<string, string>;
  docsFiles: Record<string, string>;
  designFiles: Record<string, string>;
  rejectedFiles: Record<string, string>;
  fatalViolations: PreviewFileViolation[];
  /** @deprecated alias of appFiles */
  acceptedFiles: Record<string, string>;
  /** @deprecated alias of fatalViolations */
  violations: PreviewFileViolation[];
}

/**
 * System-owned directory prefixes (relative, src/ stripped) that generated
 * code must never write into. The build system materializes these.
 */
const SYSTEM_ZONE_PREFIXES = [
  'components/ui/',
  'design-pack/',
  'docs/architect/',
] as const;

/**
 * Partition layer for a generated-files payload — runs in a single pass before
 * anything is written to preview-workspace. The single payload plays many roles
 * (LLM output, project snapshot, UI primitives, product docs, compile input);
 * this routes each file to its owner instead of failing the whole build.
 *
 * STRIPPED (system-owned, not fatal — dropped from compile input):
 *   - components/ui/**   → strippedSystemFiles (canonical primitives are materialized)
 *   - docs/architect/**  → docsFiles (product-document package; persisted/surfaced)
 *   - design-pack/**     → designFiles (system design channel)
 *
 * FATAL (abort the build — these break Vite/esbuild or the UI contract):
 *   - Build-system config files (tsconfig, vite.config, package.json, __build_id.ts, vite-env.d.ts, …)
 *   - Direct imports from @radix-ui/* or radix-ui
 *
 * Everything else → appFiles (App.tsx, pages/**, components/** except ui/, hooks/**, lib/**, …).
 * compileBuild throws only when fatalViolations.length > 0.
 */
export function validatePreviewGeneratedFiles(
  files: Record<string, string>,
): PreviewFileAdmissionResult {
  const appFiles: Record<string, string> = {};
  const strippedSystemFiles: Record<string, string> = {};
  const docsFiles: Record<string, string> = {};
  const designFiles: Record<string, string> = {};
  const rejectedFiles: Record<string, string> = {};
  const fatalViolations: PreviewFileViolation[] = [];

  for (const [rawPath, content] of Object.entries(files)) {
    const normalized = rawPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '').replace(/^src\//, '');
    const basename = normalized.split('/').pop() ?? '';

    // 1. System-owned zones — stripped, never fatal. The build system owns these
    //    channels: UI primitives are materialized, docs/design are routed elsewhere.
    if (normalized.startsWith('components/ui/')) {
      strippedSystemFiles[rawPath] = content;
      continue;
    }
    if (normalized.startsWith('docs/architect/')) {
      docsFiles[rawPath] = content;
      continue;
    }
    // design-pack/** are system-materialized premium components (materializePremium
    // Components copies them from the canonical bank; the coder cannot author them —
    // its output is filtered to plan delta paths). The app imports them via
    // '@/design-pack/...', so they MUST be written. Being vetted bank components they
    // may import Radix directly, so they are written as-is, bypassing the app-code
    // Radix ban and build-system checks below.
    if (normalized.startsWith('design-pack/')) {
      appFiles[rawPath] = content;
      continue;
    }

    // 2. Build-system config files (basename match at ANY depth — catches
    //    src/config/tsconfig.json as well as src/tsconfig.json). FATAL.
    if (BUILD_SYSTEM_BLOCKLIST_RE.test(basename)) {
      fatalViolations.push({
        filePath: rawPath,
        kind: 'build_system_file',
        detail:
          `Generated code must not write '${normalized}'. ` +
          `This file is owned by the Vite/TypeScript build system. ` +
          `Only generate application source files (App.tsx, pages/, components/, hooks/, etc.).`,
      });
      rejectedFiles[rawPath] = content;
      continue;
    }

    // 3. Direct Radix UI imports (generated code must use @/components/ui/* wrappers). FATAL.
    const radixSpecifiers = extractDirectRadixImports(content);
    if (radixSpecifiers.length > 0) {
      for (const specifier of radixSpecifiers) {
        fatalViolations.push({
          filePath: rawPath,
          kind: 'direct_radix_import',
          detail:
            `Generated code in '${rawPath}' imports directly from '${specifier}'. ` +
            `Use '@/components/ui/<name>' wrappers instead of direct Radix imports.`,
        });
      }
      rejectedFiles[rawPath] = content;
      continue;
    }

    // 4. Application source — safe to write.
    appFiles[rawPath] = content;
  }

  return {
    appFiles,
    strippedSystemFiles,
    docsFiles,
    designFiles,
    rejectedFiles,
    fatalViolations,
    acceptedFiles: appFiles,
    violations: fatalViolations,
  };
}

// ── Legacy src/ workspace healing ─────────────────────────────────────────────

/**
 * System scaffold files (relative paths under src/) that must survive the
 * legacy-mode wipe. They are snapshotted before the wipe and restored after.
 *   - vite-env.d.ts  — TypeScript Vite env types
 *   - index.css      — base design-system styles
 *   - lib/cn.ts      — system shim required by ensurePreviewLibShims
 */
const LEGACY_SYSTEM_SNAPSHOT_RELPATHS = [
  'vite-env.d.ts',
  'index.css',
  'lib/cn.ts',
] as const;

/**
 * Wipes all generated content from preview-workspace/src/ for legacy (no-skeleton) builds.
 * Makes src/ fully disposable: stale generated directories (components, hooks, lib, pages,
 * themes, data, config, context, …) are deleted in their entirety so files from previous
 * builds cannot contaminate the next Vite compilation.
 *
 * System scaffold files (vite-env.d.ts, index.css, lib/cn.ts) are snapshotted before the
 * wipe and restored after so Vite always has a complete build environment.
 *
 * Returns a list of names of top-level items that were removed.
 */
export async function cleanLegacySrcDirs(srcDir: string): Promise<string[]> {
  // 1. Snapshot system scaffold files before the wipe
  const snapshots: Array<{ rel: string; content: string }> = [];
  for (const rel of LEGACY_SYSTEM_SNAPSHOT_RELPATHS) {
    try {
      const content = await fsPromises.readFile(path.join(srcDir, rel), 'utf-8');
      snapshots.push({ rel, content });
    } catch {
      // Not present — skip; ensurePreviewLibShims or Vite will surface any build errors naturally
    }
  }

  // 2. Wipe every top-level entry in src/
  const removed: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = await fsPromises.readdir(srcDir, { withFileTypes: true });
  } catch {
    return removed;
  }

  for (const entry of entries) {
    try {
      await fsPromises.rm(path.join(srcDir, entry.name), { recursive: true, force: true });
      removed.push(entry.isDirectory() ? `${entry.name}/` : entry.name);
    } catch {
      // Non-fatal: compile will surface any remaining issues
    }
  }

  // 3. Restore system scaffold files
  for (const { rel, content } of snapshots) {
    const full = path.join(srcDir, rel);
    try {
      await fsPromises.mkdir(path.dirname(full), { recursive: true });
      await fsPromises.writeFile(full, content, 'utf-8');
    } catch {
      // Non-fatal: missing scaffold files will produce a clear Vite build error
    }
  }

  return removed;
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
  let rootEntries: fs.Dirent[];
  try {
    rootEntries = fs.readdirSync(uiRoot, { withFileTypes: true });
  } catch {
    return false;
  }

  if (rootEntries.some(entry =>
    entry.isFile() && (entry.name === `${primitive}.ts` || entry.name === `${primitive}.tsx`)
  )) {
    return true;
  }

  const primitiveDir = rootEntries.find(entry => entry.isDirectory() && entry.name === primitive);
  if (!primitiveDir) return false;

  try {
    const nestedEntries = fs.readdirSync(path.join(uiRoot, primitiveDir.name), { withFileTypes: true });
    return nestedEntries.some(entry =>
      entry.isFile() && (entry.name === 'index.ts' || entry.name === 'index.tsx')
    );
  } catch {
    return false;
  }
}

function canonicalUiPrimitiveCandidates(primitive: string, skeletonId?: string): string[] {
  const canonicalPrimitive = canonicalUiPrimitiveId(primitive);
  if (!canonicalPrimitive) return [];

  return uiPrimitiveWorkspaceCandidates(
    canonicalPrimitive,
    preferredUiPrimitiveWorkspaceRoots(skeletonId),
  ).map(candidate => path.join(REPO_ROOT, candidate));
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

async function collectCandidateGraphFiles(root: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
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
        continue;
      }

      if (!CANDIDATE_GRAPH_TEXT_EXTENSIONS.has(path.extname(entry.name))) continue;
      const relativePath = path.relative(root, entryPath).replace(/\\/g, '/');
      out[relativePath] = await fsPromises.readFile(entryPath, 'utf-8');
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
 * Workspace healing: preview-workspace/src/ is fully disposable every build.
 *   - Skeleton mode: wipe src/* entirely, copy skeleton source tree.
 *   - Legacy mode: cleanLegacySrcDirs() wipes all generated directories; only
 *     system scaffold files (vite-env.d.ts, index.css, lib/cn.ts) survive via
 *     snapshot+restore. Stale files from previous builds cannot contaminate Vite.
 *
 * Admission gate: validatePreviewGeneratedFiles() runs before any write so
 * system-owned zones (components/ui/**, design-pack/**), build-system files,
 * and direct Radix imports are rejected before touching the file system.
 */
async function compileBuild(
  buildId: string,
  files: Record<string, string>,
  skeletonId?: SkeletonId,
): Promise<void> {
  const outDir = path.join(BUILDS_WORKSPACE, buildId);
  const srcDir = path.join(PREVIEW_WORKSPACE, 'src');

  // Pre-write partition layer: routes each file to its ownership channel in one
  // pass before any workspace mutation. System-owned files (components/ui/**,
  // docs/architect/**, design-pack/**) are stripped from the compile input rather
  // than failing the build; only build-system files and direct Radix imports are fatal.
  const admission = validatePreviewGeneratedFiles(files);
  if (admission.fatalViolations.length > 0) {
    const lines = admission.fatalViolations.map(v => `  [${v.kind}] ${v.detail}`);
    throw new Error(
      `Live generation contract violated (${admission.fatalViolations.length} violation(s)):\n${lines.join('\n')}`,
    );
  }
  const appFiles = admission.appFiles;
  const strippedCount =
    Object.keys(admission.strippedSystemFiles).length +
    Object.keys(admission.docsFiles).length +
    Object.keys(admission.designFiles).length;
  if (strippedCount > 0) {
    console.log(
      `[preview-manager] Partitioned payload: ${Object.keys(appFiles).length} app file(s) written; ` +
      `stripped ${Object.keys(admission.strippedSystemFiles).length} ui, ` +
      `${Object.keys(admission.docsFiles).length} docs, ` +
      `${Object.keys(admission.designFiles).length} design file(s) from compile input`,
    );
  }

  // 0. Workspace reset — src/ is fully disposable. Two modes:
  //    a) Skeleton mode (skeletonId provided): wipe src/* entirely, then copy
  //       the skeleton so there is no contamination from previous projects.
  //    b) Legacy mode: cleanLegacySrcDirs() wipes all generated directories;
  //       system scaffold files survive via snapshot+restore.
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
    await ensurePreviewLibShims(PREVIEW_WORKSPACE);
    console.log(`[preview-manager] Skeleton ${skeletonId} installed into src/`);
  } else {
    // 0b. Legacy workspace heal — wipe ALL generated directories so stale files
    //     from previous builds cannot contaminate this compile. System scaffold
    //     files (vite-env.d.ts, index.css, lib/cn.ts) are snapshotted and
    //     restored by cleanLegacySrcDirs.
    try {
      const wiped = await cleanLegacySrcDirs(srcDir);
      if (wiped.length > 0) {
        console.log(`[preview-manager] Legacy src/ rebuild: wiped ${wiped.length} item(s) — src/ is clean`);
      }
    } catch {
      // Non-fatal: proceed with compilation even if cleanup fails
    }
  }

  // Skeleton-only compile: files={} means the skeleton src is the full source
  // of truth. Skeleton App.tsx imports section files that were just copied in
  // step 0 — overwriting them with generic template files breaks those imports.
  const isSkeletonOnlyCompile = Object.keys(appFiles).length === 0;

  await ensurePreviewLibShims(PREVIEW_WORKSPACE);

  // 0.5. The generic section templates (frontend/src/templates/components:
  //      HeroLamp, BentoGrid, Logos, …) exist only to give the LEGACY,
  //      pre-skeleton generation path concrete @/components/sections/* files so a
  //      generated App.tsx resolves. A skeleton that ships its OWN named sections
  //      — manifest marks src/components/sections/** protected; currently only
  //      landing-page, whose App.tsx imports { Hero }, { SocialProof }, … — must
  //      NOT be overwritten: the rm+cp deletes the skeleton's real components and
  //      breaks those named imports (root cause of land-saas/land-portfolio
  //      missing_local_import / missing_named_export). So mirror the templates
  //      ONLY when the active skeleton does not supply its own sections (the
  //      legacy/no-skeleton path, or a sectionless skeleton). This respects
  //      manifest.protectedFiles: constrain-then-generate is not clobbered.
  const skeletonShipsSections = Boolean(skeletonId) && fs.existsSync(
    path.join(SKELETONS_ROOT, skeletonId, `skeleton-${skeletonId}`, 'src', 'components', 'sections'),
  );
  if (!isSkeletonOnlyCompile && !skeletonShipsSections) {
    const { templatesSrc, sectionsDest } = resolveSectionTemplatePaths(PREVIEW_WORKSPACE);
    await fsPromises.rm(sectionsDest, { recursive: true, force: true });
    await fsPromises.cp(templatesSrc, sectionsDest, { recursive: true });
  }

  // 1. Write user source files (delta over the skeleton base) — only partitioned
  //    appFiles; system-owned files were stripped by the admission partition.
  for (const [filePath, content] of Object.entries(appFiles)) {
    const { fullPath } = resolvePreviewSrcPath(srcDir, filePath);
    await fsPromises.mkdir(path.dirname(fullPath), { recursive: true });
    await fsPromises.writeFile(fullPath, content, 'utf-8');
  }

  // 1.1. Remove stale non-canonical UI primitive files (PascalCase residues such as Button.tsx,
  //      Card.tsx, etc.) before materialization. On Windows case-insensitive file systems these
  //      shadow canonical lowercase files and cause Vite to resolve @/components/ui/button →
  //      Button.tsx which may import from packages not installed in preview-workspace.
  const staleUiCleaned = await cleanStaleUiPrimitiveFiles(path.join(srcDir, 'components', 'ui'));
  for (const removed of staleUiCleaned) {
    console.log(`[preview-manager] Removed stale UI primitive: components/ui/${removed}`);
  }

  // 1.2. Remove stale build-system config files from src/ root (tsconfig.json, vite.config.ts,
  //      package.json, etc.). These should only live at preview-workspace root. When an LLM
  //      session writes them into src/, Vite/esbuild picks them up and crashes on missing
  //      references. Runs only against the immediate src/ root — not subdirectories.
  const staleBuildSysCleaned = await cleanStaleBuildSystemFiles(srcDir);
  for (const removed of staleBuildSysCleaned) {
    console.log(`[preview-manager] Removed stale build-system file: ${removed}`);
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

async function captureScreenshot(): Promise<void> {
  if (typeof window === 'undefined' || window.parent === window) return;
  try {
    if ('fonts' in document) {
      await (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready;
    }
    const { default: html2canvas } = await import('html2canvas');
    // WI-8: Timeout guard — html2canvas must not hang capture indefinitely.
    const SCREENSHOT_TIMEOUT_MS = 10_000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error('screenshot_timeout: html2canvas did not complete in time')),
        SCREENSHOT_TIMEOUT_MS,
      );
    });
    const canvas = await Promise.race([
      html2canvas(document.documentElement, {
        backgroundColor: null,
        logging: false,
        scale: Math.min(window.devicePixelRatio || 1, 2),
        useCORS: true,
      }),
      timeoutPromise,
    ]);
    // WI-8: Empty canvas guard — a 0x0 screenshot is not a valid capture.
    if (canvas.width === 0 || canvas.height === 0) {
      window.parent.postMessage(
        {
          type: 'screenshot-result',
          buildId: BUILD_ID,
          error: 'empty_canvas: 0x0 dimensions, screenshot not captured',
        },
        '*',
      );
      return;
    }
    window.parent.postMessage(
      { type: 'screenshot-result', buildId: BUILD_ID, dataUrl: canvas.toDataURL('image/png') },
      '*',
    );
  } catch (error) {
    window.parent.postMessage(
      {
        type: 'screenshot-result',
        buildId: BUILD_ID,
        error: String(error instanceof Error ? error.message : error ?? 'screenshot_failed'),
      },
      '*',
    );
  }
}

window.addEventListener('message', (event) => {
  if (event.data?.type !== 'capture-screenshot') return;
  void captureScreenshot();
});
`;
  await fsPromises.writeFile(path.join(srcDir, 'main.tsx'), canonicalMainTsx, 'utf-8');

  const finalCandidateFiles = await collectCandidateGraphFiles(srcDir);
  const materializedFiles: Record<string, string> = {};
  for (const materializedPath of uiPrimitiveGuard.materialized) {
    const fullPath = path.join(srcDir, materializedPath);
    if (!fs.existsSync(fullPath)) continue;
    materializedFiles[materializedPath] = await fsPromises.readFile(fullPath, 'utf-8');
  }
  const contract = validateLiveGenerationContract({
    finalFiles: finalCandidateFiles,
    skeletonId,
    generatedDeltaFiles: appFiles,
    materializedFiles,
  });
  if (!contract.ok) {
    throw new LiveGenerationContractError(contract.diagnostics, contract.candidateGraphSummary);
  }

  // 3. Ensure builds/ exists and run vite build
  //    outDir is outside preview-workspace/ so Vite's root-check passes.
  await fsPromises.mkdir(BUILDS_WORKSPACE, { recursive: true });

  try {
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
  } catch (err) {
    const excerpt = err instanceof Error ? err.message : String(err);
    throw new LiveGenerationContractError(
      [createViteBuildDiagnostic(contract.candidateGraphSummary, excerpt)],
      contract.candidateGraphSummary,
    );
  }
}

/**
 * Public API for running a compile job directly (used by quality endpoint).
 * Sanitises files, enqueues the build, cleans up LRU — same as the HTTP route.
 */
export async function runCompileJob(
  buildId: string,
  files: Record<string, string>,
  skeletonId?: SkeletonId,
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
