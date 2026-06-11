import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import express from 'express';
import { describe, expect, it } from 'vitest';
import { LIVE_GENERATION_ALLOWED_UI_PRIMITIVES } from '../frontend/src/services/LiveGenerationUiPrimitives';
import { validateImportExportContract } from '../frontend/src/services/LiveGenerationContractValidator';
import {
  registerPreviewBuildRoute,
  registerPreviewStatusRoute,
  ensureImportedUiPrimitives,
  ensurePreviewLibShims,
  findUiPrimitiveImportsInSource,
  getKnownMaterializableUiPrimitives,
  getPreviewDocumentTrailingSlashRedirectPath,
  injectPreviewSessionIntoHtmlAssetUrls,
  bindPreviewBuildSession,
  canReadPreviewBuild,
  clearPreviewBuildStatuses,
  getPreservedPreviewDirs,
  getPreviewBuildStatus,
  normalizePreviewSessionToken,
  prunePreviewSessionBindings,
  resolvePreviewSrcPath,
  resolveSectionTemplatePaths,
  sanitizeCompileFiles,
  setPreviewBuildStatus,
  validatePreviewBuildSession,
} from './preview-manager';

describe('preview-manager path hardening', () => {
  const srcRoot = path.resolve('c:/ai_studio/preview-workspace/src');

  it('rejects ../ traversal in compile writes', () => {
    expect(() => resolvePreviewSrcPath(srcRoot, '../outside.ts')).toThrow(/must be relative|unsafe traversal/i);
  });

  it('rejects backslash traversal in compile writes', () => {
    expect(() => resolvePreviewSrcPath(srcRoot, '..\\outside.ts')).toThrow(/must be relative|unsafe traversal/i);
  });

  it('canonicalizes safe compile paths', () => {
    const resolved = resolvePreviewSrcPath(srcRoot, 'src/components/Button.tsx');
    expect(resolved.canonicalPath).toBe('components/Button.tsx');
    expect(resolved.fullPath).toBe(path.resolve(srcRoot, 'components/Button.tsx'));
  });

  it('sanitizes compile file maps to canonical relative paths', () => {
    const files = sanitizeCompileFiles(
      {
        'src/App.tsx': 'export default function App() { return null; }',
        'components\\Button.tsx': 'export const Button = () => null;',
      },
      srcRoot,
    );

    expect(Object.keys(files)).toEqual(['App.tsx', 'components/Button.tsx']);
  });

  it('resolves section template source and preview destination paths', () => {
    const paths = resolveSectionTemplatePaths(path.resolve('c:/ai_studio/preview-workspace'));

    expect(paths.templatesSrc.toLowerCase()).toBe(path.resolve('frontend/src/templates/components').toLowerCase());
    expect(paths.sectionsDest.toLowerCase()).toBe(path.resolve('c:/ai_studio/preview-workspace/src/components/sections').toLowerCase());
  });

  it('preserves skeleton infrastructure directories during compile cleanup', () => {
    expect(getPreservedPreviewDirs()).toEqual(
      expect.arrayContaining(['components', 'config', 'context', 'hooks', 'lib', 'themes']),
    );
  });

  it('materializes a legacy utils shim for section imports that still target @/lib/utils', async () => {
    const workspaceRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'preview-lib-shim-'));

    try {
      const libDir = path.join(workspaceRoot, 'src', 'lib');
      await fsPromises.mkdir(libDir, { recursive: true });
      await fsPromises.writeFile(
        path.join(libDir, 'cn.ts'),
        'export function cn(...values: string[]) { return values.join(" "); }\n',
        'utf-8',
      );

      await ensurePreviewLibShims(workspaceRoot);

      expect(await fsPromises.readFile(path.join(libDir, 'utils.ts'), 'utf-8')).toBe(
        "export { cn } from './cn';\nexport * from './cn';\n",
      );
    } finally {
      await fsPromises.rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});

async function withTempSrc<T>(run: (srcDir: string) => Promise<T>): Promise<T> {
  const root = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'preview-ui-guard-'));
  const srcDir = path.join(root, 'src');
  try {
    await fsPromises.mkdir(srcDir, { recursive: true });
    return await run(srcDir);
  } finally {
    await fsPromises.rm(root, { recursive: true, force: true });
  }
}

describe('preview-manager UI primitive guard', () => {
  it('uses the shared live-generation primitive set for backend materialization', () => {
    expect(getKnownMaterializableUiPrimitives()).toEqual([...LIVE_GENERATION_ALLOWED_UI_PRIMITIVES].sort());
  });

  it('detects aliased and relative UI primitive import specifiers', () => {
    const imports = findUiPrimitiveImportsInSource(
      [
        "import { ScrollArea } from '@/components/ui/scroll-area';",
        "export { ScrollBar } from '../components/ui/scroll-area';",
      ].join('\n'),
      'src/pages/Home.tsx',
    );

    expect(imports.map(item => item.primitive)).toEqual(['scroll-area', 'scroll-area']);
    expect(imports[0].importedBy).toBe('src/pages/Home.tsx');
  });

  it('materializes missing scroll-area from the canonical skeleton before Vite runs', async () => {
    await withTempSrc(async (srcDir) => {
      await fsPromises.mkdir(path.join(srcDir, 'pages'), { recursive: true });
      await fsPromises.writeFile(
        path.join(srcDir, 'pages', 'Home.tsx'),
        "import { ScrollArea } from '@/components/ui/scroll-area';\nexport function Home() { return <ScrollArea />; }\n",
        'utf-8',
      );

      const result = await ensureImportedUiPrimitives(srcDir, 'mobile-app');

      expect(result.materialized).toContain('components/ui/scroll-area.tsx');
      expect(fs.existsSync(path.join(srcDir, 'components', 'ui', 'scroll-area.tsx'))).toBe(true);
    });
  });

  it('materializes missing accordion from the canonical skeleton before flow-chain FAQ builds run', async () => {
    await withTempSrc(async (srcDir) => {
      await fsPromises.mkdir(path.join(srcDir, 'components', 'sections'), { recursive: true });
      await fsPromises.writeFile(
        path.join(srcDir, 'components', 'sections', 'FAQ.tsx'),
        [
          "import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';",
          'export function FAQ() {',
          '  return <Accordion type="single"><AccordionItem value="faq"><AccordionTrigger>Q</AccordionTrigger><AccordionContent>A</AccordionContent></AccordionItem></Accordion>;',
          '}',
          '',
        ].join('\n'),
        'utf-8',
      );

      const result = await ensureImportedUiPrimitives(srcDir, 'mobile-app');

      expect(result.materialized).toContain('components/ui/accordion.tsx');
      expect(fs.existsSync(path.join(srcDir, 'components', 'ui', 'accordion.tsx'))).toBe(true);
    });
  });

  it('accepts scroll-area when the primitive file already exists', async () => {
    await withTempSrc(async (srcDir) => {
      await fsPromises.mkdir(path.join(srcDir, 'components', 'ui'), { recursive: true });
      await fsPromises.mkdir(path.join(srcDir, 'pages'), { recursive: true });
      await fsPromises.writeFile(
        path.join(srcDir, 'components', 'ui', 'scroll-area.tsx'),
        'export const ScrollArea = () => null;\nexport const ScrollBar = () => null;\n',
        'utf-8',
      );
      await fsPromises.writeFile(
        path.join(srcDir, 'pages', 'Home.tsx'),
        "import { ScrollArea } from '@/components/ui/scroll-area';\nexport function Home() { return <ScrollArea />; }\n",
        'utf-8',
      );

      const result = await ensureImportedUiPrimitives(srcDir, 'mobile-app');

      expect(result.materialized).toEqual([]);
    });
  });

  it('fails unknown UI primitive imports with a clear pre-compile diagnostic', async () => {
    await withTempSrc(async (srcDir) => {
      await fsPromises.mkdir(path.join(srcDir, 'pages'), { recursive: true });
      await fsPromises.writeFile(
        path.join(srcDir, 'pages', 'Home.tsx'),
        "import { MysteryBox } from '@/components/ui/mystery-box';\nexport function Home() { return <MysteryBox />; }\n",
        'utf-8',
      );

      await expect(ensureImportedUiPrimitives(srcDir, 'mobile-app')).rejects.toThrow(
        /Missing UI primitive import: components\/ui\/mystery-box \(imported by src\/pages\/Home\.tsx\)/,
      );
    });
  });

  it('accordion is in the known materializable primitives set', () => {
    expect(getKnownMaterializableUiPrimitives()).toContain('accordion');
  });

  it('preview-manager compile path contains no runtime shadcn generation', async () => {
    const src = await fsPromises.readFile(path.resolve('backend/preview-manager.ts'), 'utf-8');
    expect(src, 'shadcn@latest must not appear in compile path').not.toContain('shadcn@latest');
    expect(src, 'npx shadcn must not appear in compile path').not.toContain('npx shadcn');
    expect(src, 'ensureShadcnComponents must not exist').not.toContain('ensureShadcnComponents');
  });

  it('keeps every exported skeleton UI barrel backed by a physical file', async () => {
    const barrelPaths = [
      path.resolve('preview-workspace/src/components/ui/index.ts'),
      path.resolve('skeletons/mobile-app/skeleton-mobile-app/src/components/ui/index.ts'),
      path.resolve('skeletons/ecommerce/skeleton-ecommerce/src/components/ui/index.ts'),
      path.resolve('skeletons/landing-page/skeleton-landing-page/src/components/ui/index.ts'),
      path.resolve('skeletons/productivity-tool/skeleton-productivity-tool/src/components/ui/index.ts'),
      path.resolve('skeletons/saas-dashboard/skeleton-saas-dashboard/src/components/ui/index.ts'),
      path.resolve('skeletons/social-community/skeleton-social-community/src/components/ui/index.ts'),
    ];

    for (const barrelPath of barrelPaths) {
      const content = await fsPromises.readFile(barrelPath, 'utf-8');
      const uiRoot = path.dirname(barrelPath);
      const exportedModules = Array.from(content.matchAll(/export\s+\*\s+from\s+['"]\.\/([^'"]+)['"]/g)).map(match => match[1]);

      for (const exportedModule of exportedModules) {
        const hasBackingFile = [
          path.join(uiRoot, `${exportedModule}.ts`),
          path.join(uiRoot, `${exportedModule}.tsx`),
          path.join(uiRoot, exportedModule, 'index.ts'),
          path.join(uiRoot, exportedModule, 'index.tsx'),
        ].some(candidate => fs.existsSync(candidate));

        expect(hasBackingFile, `${path.relative(process.cwd(), barrelPath)} -> ${exportedModule}`).toBe(true);
      }
    }
  });
});

describe('preview-manager preview asset sessions', () => {
  const validToken = 'preview-session-token-123';

  it('does not append previewSession to Vite JS asset URLs in HTML', () => {
    const html = '<script type="module" crossorigin src="./assets/index-abc123.js"></script>';

    expect(injectPreviewSessionIntoHtmlAssetUrls(html, validToken)).toBe(html);
  });

  it('appends previewSession to Vite CSS asset URLs in HTML', () => {
    const html = '<link rel="stylesheet" crossorigin href="./assets/index-def456.css">';

    expect(injectPreviewSessionIntoHtmlAssetUrls(html, validToken)).toBe(
      '<link rel="stylesheet" crossorigin href="./assets/index-def456.css?previewSession=preview-session-token-123">',
    );
  });

  it('does not double-add previewSession to asset URLs', () => {
    const html = '<script type="module" src="./assets/index-abc123.js?previewSession=existing-session-token"></script>';

    expect(injectPreviewSessionIntoHtmlAssetUrls(html, validToken)).toBe(html);
  });

  it('does not inject previewSession into external http(s) URLs', () => {
    const html = [
      '<script src="https://cdn.example.com/assets/index.js"></script>',
      '<link rel="stylesheet" href="http://cdn.example.com/assets/index.css">',
    ].join('');

    expect(injectPreviewSessionIntoHtmlAssetUrls(html, validToken)).toBe(html);
  });

  it('preserves non-asset HTML', () => {
    const html = [
      '<main data-testid="smoke-root">',
      '<img src="./logo.svg" alt="Logo">',
      '<div data-src="./assets/index-abc123.js">Preview</div>',
      '</main>',
    ].join('');

    expect(injectPreviewSessionIntoHtmlAssetUrls(html, validToken)).toBe(html);
  });

  it('builds a trailing-slash redirect path and preserves previewSession', () => {
    expect(
      getPreviewDocumentTrailingSlashRedirectPath(
        '/preview/build-1?previewSession=preview-session-token-123&view=full',
        'build-1',
      ),
    ).toBe('/preview/build-1/?previewSession=preview-session-token-123&view=full');
    expect(getPreviewDocumentTrailingSlashRedirectPath('/preview/build-1/?previewSession=preview-session-token-123', 'build-1')).toBeNull();
    expect(getPreviewDocumentTrailingSlashRedirectPath('/preview/build-1/assets/index.js?previewSession=preview-session-token-123', 'build-1')).toBeNull();
  });
});

describe('preview-manager session binding', () => {
  const validToken = 'preview-session-token-123';

  it('rejects missing, empty, too-short, and too-long session tokens', () => {
    expect(normalizePreviewSessionToken(undefined)).toBeNull();
    expect(normalizePreviewSessionToken(null)).toBeNull();
    expect(normalizePreviewSessionToken(123)).toBeNull();
    expect(normalizePreviewSessionToken('')).toBeNull();
    expect(normalizePreviewSessionToken('   ')).toBeNull();
    expect(normalizePreviewSessionToken('123456789012345')).toBeNull();
    expect(normalizePreviewSessionToken('x'.repeat(201))).toBeNull();
  });

  it('accepts and trims valid session tokens', () => {
    expect(normalizePreviewSessionToken(`  ${validToken}  `)).toBe(validToken);
  });

  it('binds a buildId the first time', () => {
    const bindings = new Map<string, string>();
    expect(bindPreviewBuildSession('build-1', validToken, bindings)).toBe('bound');
    expect(bindings.get('build-1')).toBe(validToken);
  });

  it('allows the same buildId and same token', () => {
    const bindings = new Map<string, string>([['build-1', validToken]]);
    expect(bindPreviewBuildSession('build-1', validToken, bindings)).toBe('already-bound');
  });

  it('rejects the same buildId with a different token', () => {
    const bindings = new Map<string, string>([['build-1', validToken]]);
    expect(bindPreviewBuildSession('build-1', 'different-session-token', bindings)).toBe('conflict');
    expect(bindings.get('build-1')).toBe(validToken);
  });

  it('validates only a matching buildId and token', () => {
    const bindings = new Map<string, string>([['build-1', validToken]]);
    expect(validatePreviewBuildSession('build-1', validToken, bindings)).toBe(true);
    expect(validatePreviewBuildSession('build-1', 'different-session-token', bindings)).toBe(false);
    expect(validatePreviewBuildSession('build-2', validToken, bindings)).toBe(false);
  });

  it('prunes bindings whose buildId no longer exists', () => {
    const bindings = new Map<string, string>([
      ['build-1', validToken],
      ['build-2', 'another-session-token'],
    ]);

    expect(prunePreviewSessionBindings(new Set(['build-1']), bindings)).toBe(1);
    expect(bindings.has('build-1')).toBe(true);
    expect(bindings.has('build-2')).toBe(false);
  });

  it('keeps bindings whose buildId exists', () => {
    const bindings = new Map<string, string>([['build-1', validToken]]);
    expect(prunePreviewSessionBindings(new Set(['build-1']), bindings)).toBe(0);
    expect(bindings.get('build-1')).toBe(validToken);
  });
});

describe('preview-manager read access binding', () => {
  const validToken = 'preview-session-token-123';

  it('allows a bound build with a matching token', () => {
    const bindings = new Map<string, string>([['build-1', validToken]]);
    expect(canReadPreviewBuild('build-1', validToken, bindings, {
      nodeEnv: 'production',
      serverMode: 'production',
    })).toBe(true);
  });

  it('denies a bound build with a missing token', () => {
    const bindings = new Map<string, string>([['build-1', validToken]]);
    expect(canReadPreviewBuild('build-1', null, bindings, {
      nodeEnv: 'development',
      serverMode: 'development',
    })).toBe(false);
  });

  it('denies a bound build with an invalid token', () => {
    const bindings = new Map<string, string>([['build-1', validToken]]);
    expect(canReadPreviewBuild('build-1', 'too-short', bindings, {
      nodeEnv: 'development',
      serverMode: 'development',
    })).toBe(false);
  });

  it('denies a bound build with a different token', () => {
    const bindings = new Map<string, string>([['build-1', validToken]]);
    expect(canReadPreviewBuild('build-1', 'different-session-token', bindings, {
      nodeEnv: 'development',
      serverMode: 'development',
    })).toBe(false);
  });

  it('allows an unbound build in dev legacy mode', () => {
    const bindings = new Map<string, string>();
    expect(canReadPreviewBuild('build-1', null, bindings, {
      nodeEnv: 'development',
      serverMode: 'development',
    })).toBe(true);
  });

  it('denies an unbound build in production', () => {
    const bindings = new Map<string, string>();
    expect(canReadPreviewBuild('build-1', validToken, bindings, {
      nodeEnv: 'production',
      serverMode: 'production',
    })).toBe(false);
  });
});

describe('preview-manager build route access', () => {
  const validToken = 'preview-session-token-123';

  async function withPreviewBuildRoute<T>(
    run: (baseUrl: string, buildId: string) => Promise<T>,
  ): Promise<T> {
    const buildId = `preview-build-${Date.now()}`;
    const buildPath = path.resolve('c:/ai_studio/builds', buildId);
    let server: ReturnType<typeof express.prototype.listen> | null = null;

    try {
      await fsPromises.mkdir(path.join(buildPath, 'assets'), { recursive: true });
      await fsPromises.writeFile(
        path.join(buildPath, 'index.html'),
        [
          '<!doctype html>',
          '<html>',
          '<head>',
          '  <script type="module" src="./assets/index.js"></script>',
          '</head>',
          '<body><div id="root">Preview</div></body>',
          '</html>',
          '',
        ].join('\n'),
        'utf-8',
      );
      await fsPromises.writeFile(path.join(buildPath, 'assets', 'index.js'), 'console.log("ok");\n', 'utf-8');
      await fsPromises.writeFile(
        path.join(buildPath, 'assets', 'Dashboard-Chunk.js'),
        'export const dashboardChunk = "ok";\n',
        'utf-8',
      );

      bindPreviewBuildSession(buildId, validToken);

      const app = express();
      registerPreviewBuildRoute(app);
      server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
        const nextServer = app.listen(0, '127.0.0.1', () => resolve(nextServer));
      });

      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Failed to resolve preview route test server address');
      }

      return await run(`http://127.0.0.1:${address.port}`, buildId);
    } finally {
      if (server) {
        await new Promise<void>((resolve, reject) => server!.close((error) => (error ? reject(error) : resolve())));
      }
      await fsPromises.rm(buildPath, { recursive: true, force: true });
      prunePreviewSessionBindings(new Set());
    }
  }

  it('keeps preview documents session-gated', async () => {
    await withPreviewBuildRoute(async (baseUrl, buildId) => {
      const response = await fetch(`${baseUrl}/preview/${buildId}/`);
      expect(response.status).toBe(403);
      expect(await response.text()).toContain('Preview access denied');
    });
  });

  it('serves preview documents with a valid session token', async () => {
    await withPreviewBuildRoute(async (baseUrl, buildId) => {
      const response = await fetch(`${baseUrl}/preview/${buildId}/?previewSession=${validToken}`);
      expect(response.status).toBe(200);
      expect(await response.text()).not.toContain('previewSession=preview-session-token-123');
    });
  });

  it('serves explicit static asset requests without requiring previewSession', async () => {
    await withPreviewBuildRoute(async (baseUrl, buildId) => {
      const response = await fetch(`${baseUrl}/preview/${buildId}/assets/index.js`);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('console.log("ok")');
    });
  });

  it('serves lazy chunk assets after a valid preview entry without requiring previewSession on the chunk request', async () => {
    await withPreviewBuildRoute(async (baseUrl, buildId) => {
      const entryResponse = await fetch(`${baseUrl}/preview/${buildId}/?previewSession=${validToken}`, {
        headers: { Origin: 'http://localhost:5183' },
      });
      expect(entryResponse.status).toBe(200);

      const chunkResponse = await fetch(`${baseUrl}/preview/${buildId}/assets/Dashboard-Chunk.js`, {
        headers: { Origin: 'http://localhost:5183' },
      });

      expect(chunkResponse.status).toBe(200);
      expect(await chunkResponse.text()).toContain('dashboardChunk');
    });
  });

  it('returns 404 for missing assets instead of a false preview-session 403', async () => {
    await withPreviewBuildRoute(async (baseUrl, buildId) => {
      const response = await fetch(`${baseUrl}/preview/${buildId}/assets/Missing-Chunk.js`, {
        headers: { Origin: 'http://localhost:5183' },
      });

      expect(response.status).toBe(404);
      expect(await response.text()).toContain('Asset not found');
    });
  });
});

describe('preview-manager build status', () => {
  const validToken = 'preview-session-status-tok';

  async function withStatusRoute<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
    const app = express();
    registerPreviewStatusRoute(app);
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const nextServer = app.listen(0, '127.0.0.1', () => resolve(nextServer));
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to resolve status route test server address');
    }
    try {
      return await run(`http://127.0.0.1:${address.port}`);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      clearPreviewBuildStatuses();
      prunePreviewSessionBindings(new Set());
    }
  }

  it('returns 404 for an unknown buildId', async () => {
    await withStatusRoute(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/preview/unknown-build-xyz/status`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBeTruthy();
    });
  });

  it('returns 403 for a session-bound build when previewSession is missing', async () => {
    await withStatusRoute(async (baseUrl) => {
      const buildId = `status-bound-${Date.now()}`;
      bindPreviewBuildSession(buildId, validToken);
      setPreviewBuildStatus({ buildId, status: 'building', updatedAt: new Date().toISOString() });

      const res = await fetch(`${baseUrl}/api/preview/${buildId}/status`);
      expect(res.status).toBe(403);
    });
  });

  it('returns 403 for a session-bound build when previewSession is wrong', async () => {
    await withStatusRoute(async (baseUrl) => {
      const buildId = `status-wrong-token-${Date.now()}`;
      bindPreviewBuildSession(buildId, validToken);
      setPreviewBuildStatus({ buildId, status: 'ready', previewPath: `/preview/${buildId}`, updatedAt: new Date().toISOString() });

      const res = await fetch(`${baseUrl}/api/preview/${buildId}/status`, {
        headers: { 'X-Preview-Session': 'different-session-token' },
      });
      expect(res.status).toBe(403);
    });
  });

  it('returns status JSON for a session-bound build with the correct previewSession', async () => {
    await withStatusRoute(async (baseUrl) => {
      const buildId = `status-valid-${Date.now()}`;
      bindPreviewBuildSession(buildId, validToken);
      setPreviewBuildStatus({
        buildId,
        status: 'ready',
        previewPath: `/preview/${buildId}`,
        durationMs: 1234,
        updatedAt: new Date().toISOString(),
      });

      const res = await fetch(`${baseUrl}/api/preview/${buildId}/status`, {
        headers: { 'X-Preview-Session': validToken },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.buildId).toBe(buildId);
      expect(body.status).toBe('ready');
      expect(body.previewPath).toBe(`/preview/${buildId}`);
      expect(body.durationMs).toBe(1234);
    });
  });

  it('records building then ready transitions in the status store', () => {
    const buildId = `status-lifecycle-${Date.now()}`;
    setPreviewBuildStatus({ buildId, status: 'building', updatedAt: new Date().toISOString() });
    expect(getPreviewBuildStatus(buildId)?.status).toBe('building');

    setPreviewBuildStatus({
      buildId,
      status: 'ready',
      previewPath: `/preview/${buildId}`,
      durationMs: 500,
      updatedAt: new Date().toISOString(),
    });
    expect(getPreviewBuildStatus(buildId)?.status).toBe('ready');
    expect(getPreviewBuildStatus(buildId)?.previewPath).toBe(`/preview/${buildId}`);
    clearPreviewBuildStatuses();
    expect(getPreviewBuildStatus(buildId)).toBeUndefined();
  });

  it('records failed status with error and diagnostics', () => {
    const buildId = `status-failed-${Date.now()}`;
    const diagnostics = [{ root_cause_type: 'vite_build_error', message: 'TS error in App.tsx' }];
    setPreviewBuildStatus({
      buildId,
      status: 'failed',
      error: 'Build failed',
      diagnostics,
      durationMs: 300,
      updatedAt: new Date().toISOString(),
    });

    const record = getPreviewBuildStatus(buildId);
    expect(record?.status).toBe('failed');
    expect(record?.error).toBe('Build failed');
    expect(record?.diagnostics).toEqual(diagnostics);
    clearPreviewBuildStatuses();
  });
});

describe('preview-manager skeleton-only compile section preservation', () => {
  it('source contains isSkeletonOnlyCompile guard for files={}', () => {
    const src = fs.readFileSync(path.resolve('backend/preview-manager.ts'), 'utf-8');
    expect(src).toContain('isSkeletonOnlyCompile');
    expect(src).toContain('Object.keys(files).length === 0');
  });

  it('template section overwrite is skipped for skeletons that ship their own sections (and for skeleton-only compiles)', () => {
    const src = fs.readFileSync(path.resolve('backend/preview-manager.ts'), 'utf-8');
    // The overwrite must be gated by BOTH guards: never clobber a skeleton that
    // supplies its own protected sections (e.g. landing-page Hero/SocialProof),
    // nor a skeleton-only compile. The combined guard must precede rm(sectionsDest).
    expect(src).toContain('skeletonShipsSections');
    expect(src).toContain('if (!isSkeletonOnlyCompile && !skeletonShipsSections)');
    const guardIdx = src.indexOf('if (!isSkeletonOnlyCompile && !skeletonShipsSections)');
    const rmIdx = src.indexOf('fsPromises.rm(sectionsDest');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(rmIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(rmIdx);
  });

  it('validateImportExportContract passes when skeleton sections are preserved (skeleton-only compile)', () => {
    // Mirrors what happens after step 0 skeleton install with files={}: skeleton
    // sections exist in the candidate graph so all imports in App.tsx resolve.
    const sectionNames = ['Hero', 'SocialProof', 'Features', 'HowItWorks', 'Pricing', 'FinalCTA'];
    const appContent = [
      ...sectionNames.map(n => `import ${n} from '@/components/sections/${n}';`),
      `export default function App() { return null; }`,
      '',
    ].join('\n');

    const candidateFiles: Record<string, string> = { 'App.tsx': appContent };
    for (const name of sectionNames) {
      candidateFiles[`components/sections/${name}.tsx`] = `export default function ${name}() { return null; }\n`;
    }

    const result = validateImportExportContract({
      finalFiles: candidateFiles,
      skeletonId: 'landing-page',
      generatedDeltaFiles: {},
      materializedFiles: {},
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics.filter(d => d.root_cause_type === 'missing_local_import')).toHaveLength(0);
  });

  it('validateImportExportContract fails with missing_local_import when template overwrite destroys skeleton sections', () => {
    // Reproduces the pre-fix bug: template files replaced skeleton sections,
    // so App.tsx imports no longer resolved. Confirms the validator is not weakened.
    const appContent = [
      "import Hero from '@/components/sections/Hero';",
      "import SocialProof from '@/components/sections/SocialProof';",
      "export default function App() { return null; }",
      '',
    ].join('\n');

    // Template files present, but Hero/SocialProof missing — exactly what
    // step 0.5 produced before the fix when skeleton sections were wiped.
    const candidateFiles: Record<string, string> = {
      'App.tsx': appContent,
      'components/sections/PricingSection.tsx': 'export default function PricingSection() { return null; }\n',
      'components/sections/CTA.tsx': 'export default function CTA() { return null; }\n',
    };

    const result = validateImportExportContract({
      finalFiles: candidateFiles,
      skeletonId: 'landing-page',
      generatedDeltaFiles: {},
      materializedFiles: {},
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.some(d => d.root_cause_type === 'missing_local_import')).toBe(true);
  });

  it('landing-page skeleton section files exist on disk (skeleton install would provide them)', () => {
    const skeletonSectionsDir = path.resolve(
      'skeletons/landing-page/skeleton-landing-page/src/components/sections',
    );
    expect(fs.existsSync(skeletonSectionsDir)).toBe(true);
    const sectionNames = ['Hero', 'SocialProof', 'Features', 'HowItWorks', 'Pricing', 'FinalCTA'];
    for (const name of sectionNames) {
      const filePath = path.join(skeletonSectionsDir, `${name}.tsx`);
      expect(fs.existsSync(filePath), `${name}.tsx should exist in landing-page skeleton`).toBe(true);
    }
  });
});
