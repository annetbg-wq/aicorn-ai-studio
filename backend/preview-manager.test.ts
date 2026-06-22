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
  validateGeneratedUiPrimitiveContracts,
  cleanStaleUiPrimitiveFiles,
  extractDirectRadixImports,
  validateGeneratedBuildSystemContracts,
  cleanStaleBuildSystemFiles,
  validatePreviewGeneratedFiles,
  cleanLegacySrcDirs,
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

  it('PRESERVED_PREVIEW_DIRS is now empty — all generated app directories are wiped by cleanLegacySrcDirs', () => {
    // Legacy mode uses cleanLegacySrcDirs() which disposes src/ entirely;
    // no generated directory is preserved between builds any more.
    expect(getPreservedPreviewDirs()).toEqual([]);
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

  it('detects relative sibling ./ui/<Name> imports used by skeleton shell components', () => {
    const imports = findUiPrimitiveImportsInSource(
      [
        "import { Sheet, SheetContent } from './ui/Sheet';",
        "import { Button } from './ui/Button';",
        "import { Tabs } from '../ui/Tabs';",
      ].join('\n'),
      'src/components/PaywallSheet.tsx',
    );

    expect(imports.map(item => item.primitive).sort()).toEqual(['button', 'sheet', 'tabs']);
  });

  it('re-materializes a relative ./ui/Sheet primitive after stale PascalCase cleanup', async () => {
    await withTempSrc(async (srcDir) => {
      await fsPromises.mkdir(path.join(srcDir, 'components'), { recursive: true });
      await fsPromises.writeFile(
        path.join(srcDir, 'components', 'PaywallSheet.tsx'),
        "import { Sheet, SheetContent } from './ui/Sheet';\nexport function PaywallSheet() { return <Sheet><SheetContent /></Sheet>; }\n",
        'utf-8',
      );

      const result = await ensureImportedUiPrimitives(srcDir, 'mobile-app');

      expect(result.materialized).toContain('components/ui/sheet.tsx');
      expect(fs.existsSync(path.join(srcDir, 'components', 'ui', 'sheet.tsx'))).toBe(true);
    });
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

  it('materializes canonical lowercase primitives even when a legacy PascalCase file already exists', async () => {
    await withTempSrc(async (srcDir) => {
      await fsPromises.mkdir(path.join(srcDir, 'components', 'ui'), { recursive: true });
      await fsPromises.mkdir(path.join(srcDir, 'pages'), { recursive: true });
      await fsPromises.writeFile(
        path.join(srcDir, 'components', 'ui', 'Button.tsx'),
        'export const Button = () => null;\n',
        'utf-8',
      );
      await fsPromises.writeFile(
        path.join(srcDir, 'pages', 'Home.tsx'),
        "import Button from '@/components/ui/button';\nexport function Home() { return <Button />; }\n",
        'utf-8',
      );

      const result = await ensureImportedUiPrimitives(srcDir, 'mobile-app');

      expect(result.materialized).toContain('components/ui/button.tsx');
      expect(fs.existsSync(path.join(srcDir, 'components', 'ui', 'button.tsx'))).toBe(true);
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

  it('canonical preview main.tsx contains the screenshot capture handshake', async () => {
    const src = await fsPromises.readFile(path.resolve('backend/preview-manager.ts'), 'utf-8');
    expect(src).toContain('capture-screenshot');
    expect(src).toContain('screenshot-result');
    expect(src).toContain("import('html2canvas')");
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

// ── WI-8: Screenshot handshake tests ─────────────────────────────────────────

describe('preview-manager screenshot handshake (WI-8)', () => {
  it('canonical main.tsx responds to capture-screenshot by invoking captureScreenshot', async () => {
    const src = await fsPromises.readFile(path.resolve('backend/preview-manager.ts'), 'utf-8');
    expect(src).toContain("event.data?.type !== 'capture-screenshot'");
    expect(src).toContain('captureScreenshot()');
  });

  it('canonical main.tsx posts screenshot-result with dataUrl on success', async () => {
    const src = await fsPromises.readFile(path.resolve('backend/preview-manager.ts'), 'utf-8');
    expect(src).toContain("type: 'screenshot-result'");
    expect(src).toContain('dataUrl: canvas.toDataURL');
  });

  it('canonical main.tsx posts screenshot-result with explicit error reason on failure', async () => {
    const src = await fsPromises.readFile(path.resolve('backend/preview-manager.ts'), 'utf-8');
    // Error is always a string reason — not a raw Error object
    expect(src).toContain('error: String(error instanceof Error');
  });

  it('canonical main.tsx blocks empty/0x0 canvas — width=0 or height=0 produces failure result', async () => {
    const src = await fsPromises.readFile(path.resolve('backend/preview-manager.ts'), 'utf-8');
    expect(src).toMatch(/canvas\.width\s*===\s*0\s*\|\|\s*canvas\.height\s*===\s*0/);
    expect(src).toContain('empty_canvas');
  });

  it('empty_canvas failure posts screenshot-result with error field (not dataUrl)', async () => {
    const src = await fsPromises.readFile(path.resolve('backend/preview-manager.ts'), 'utf-8');
    // Verify structural ordering: guard → error message → early return → success dataUrl
    // This does not depend on any comment placement or first-occurrence of canvas.toDataURL.
    const emptyGuardIdx    = src.indexOf('canvas.width === 0 || canvas.height === 0');
    const emptyErrorIdx    = src.indexOf("error: 'empty_canvas:");
    const earlyReturnIdx   = src.indexOf('return;', emptyGuardIdx);
    const successDataUrlIdx = src.indexOf('dataUrl: canvas.toDataURL');
    expect(emptyGuardIdx).toBeGreaterThan(-1);
    // error message appears inside the guard block (after the check)
    expect(emptyErrorIdx).toBeGreaterThan(emptyGuardIdx);
    // early return follows the error message
    expect(earlyReturnIdx).toBeGreaterThan(emptyErrorIdx);
    // success dataUrl branch appears only AFTER the early return — guard is actually early
    expect(successDataUrlIdx).toBeGreaterThan(earlyReturnIdx);
  });

  it('canonical main.tsx has a timeout guard so html2canvas failure does not hang', async () => {
    const src = await fsPromises.readFile(path.resolve('backend/preview-manager.ts'), 'utf-8');
    expect(src).toContain('Promise.race');
    expect(src).toContain('screenshot_timeout');
  });

  it('timeout rejection becomes the error reason in the catch branch', async () => {
    const src = await fsPromises.readFile(path.resolve('backend/preview-manager.ts'), 'utf-8');
    // The timeout rejects with an Error whose message starts with screenshot_timeout.
    // The catch block stringifies it as the reason.
    expect(src).toContain("new Error('screenshot_timeout:");
    expect(src).toContain('String(error instanceof Error');
  });

  it('SCREENSHOT_TIMEOUT_MS is defined so the timeout duration is explicit', async () => {
    const src = await fsPromises.readFile(path.resolve('backend/preview-manager.ts'), 'utf-8');
    expect(src).toContain('SCREENSHOT_TIMEOUT_MS');
  });

  it('html2canvas is still dynamically imported (not statically bundled)', async () => {
    const src = await fsPromises.readFile(path.resolve('backend/preview-manager.ts'), 'utf-8');
    expect(src).toContain("import('html2canvas')");
  });
});

describe('preview-manager skeleton-only compile section preservation', () => {
  it('source contains isSkeletonOnlyCompile guard for files={}', () => {
    const src = fs.readFileSync(path.resolve('backend/preview-manager.ts'), 'utf-8');
    expect(src).toContain('isSkeletonOnlyCompile');
    expect(src).toContain('Object.keys(appFiles).length === 0');
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

// ── P0: UI primitive contract guard — pre-Vite enforcement ───────────────────

describe('preview-manager UI primitive contract — generated file guard', () => {
  it('rejects generated src/components/ui/Button.tsx before Vite', () => {
    const violations = validateGeneratedUiPrimitiveContracts({
      'src/components/ui/Button.tsx': 'export const Button = () => null;',
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe('ui_primitive_write');
    expect(violations[0].detail).toMatch(/components\/ui\/Button\.tsx/);
  });

  it('rejects generated src/components/ui/Card.tsx before Vite', () => {
    const violations = validateGeneratedUiPrimitiveContracts({
      'src/components/ui/Card.tsx': 'export const Card = () => null;',
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe('ui_primitive_write');
  });

  it('rejects generated src/components/ui/Switch.tsx before Vite', () => {
    const violations = validateGeneratedUiPrimitiveContracts({
      'src/components/ui/Switch.tsx': 'export const Switch = () => null;',
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe('ui_primitive_write');
  });

  it('rejects any non-catalog file under src/components/ui/ before Vite', () => {
    const violations = validateGeneratedUiPrimitiveContracts({
      'src/components/ui/MyCustomWidget.tsx': 'export const MyCustomWidget = () => null;',
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe('ui_primitive_write');
  });

  it('rejects generated direct @radix-ui/react-slot import before Vite', () => {
    const violations = validateGeneratedUiPrimitiveContracts({
      'src/components/MyComp.tsx': [
        "import { Slot } from '@radix-ui/react-slot';",
        "export const MyComp = () => <Slot />;",
      ].join('\n'),
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe('direct_radix_import');
    expect(violations[0].detail).toMatch(/@radix-ui\/react-slot/);
  });

  it('rejects generated direct @radix-ui/react-dialog import before Vite', () => {
    const violations = validateGeneratedUiPrimitiveContracts({
      'src/components/MyDialog.tsx': "import * as D from '@radix-ui/react-dialog';",
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe('direct_radix_import');
    expect(violations[0].detail).toMatch(/@radix-ui\/react-dialog/);
  });

  it('rejects generated direct radix-ui (unified) import before Vite', () => {
    const violations = validateGeneratedUiPrimitiveContracts({
      'src/components/MyComp.tsx': "import { Slot } from 'radix-ui';",
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe('direct_radix_import');
    expect(violations[0].detail).toMatch(/radix-ui/);
  });

  it('allows valid import from @/components/ui/button', () => {
    const violations = validateGeneratedUiPrimitiveContracts({
      'src/components/MyComp.tsx': "import { Button } from '@/components/ui/button';",
    });
    expect(violations).toHaveLength(0);
  });

  it('allows multiple canonical imports without violations', () => {
    const violations = validateGeneratedUiPrimitiveContracts({
      'src/pages/Dashboard.tsx': [
        "import { Button } from '@/components/ui/button';",
        "import { Card, CardContent } from '@/components/ui/card';",
        "import { Badge } from '@/components/ui/badge';",
        "import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';",
        "export function Dashboard() { return null; }",
      ].join('\n'),
    });
    expect(violations).toHaveLength(0);
  });

  it('LV path cannot reach Vite with direct @radix-ui import', () => {
    const violations = validateGeneratedUiPrimitiveContracts({
      'src/pages/TrendNiches.tsx': [
        "import * as RadixSlot from '@radix-ui/react-slot';",
        "import { cn } from '@/lib/utils';",
        "export function TrendNiches() { return <RadixSlot.Slot />; }",
      ].join('\n'),
    });
    expect(violations.some(v => v.kind === 'direct_radix_import')).toBe(true);
  });

  it('skeleton_assembly path cannot reach Vite with direct @radix-ui import', () => {
    const violations = validateGeneratedUiPrimitiveContracts({
      'src/components/ChatWidget.tsx': "import * as RadixDialog from '@radix-ui/react-dialog';",
    });
    expect(violations.some(v => v.kind === 'direct_radix_import')).toBe(true);
  });

  it('extractDirectRadixImports detects @radix-ui/* and radix-ui patterns', () => {
    const source = [
      "import { Slot } from '@radix-ui/react-slot';",
      "import * as D from '@radix-ui/react-dialog';",
      "import { X } from 'radix-ui';",
      "import { Button } from '@/components/ui/button';",
      "import { cn } from '@/lib/utils';",
    ].join('\n');

    const found = extractDirectRadixImports(source);
    expect(found).toContain('@radix-ui/react-slot');
    expect(found).toContain('@radix-ui/react-dialog');
    expect(found).toContain('radix-ui');
    expect(found).not.toContain('@/components/ui/button');
    expect(found).not.toContain('@/lib/utils');
  });
});

describe('preview-manager UI primitive contract — stale file cleanup', () => {
  it('keeps a lone PascalCase Button.tsx (no lowercase shadow) and canonical lowercase files', async () => {
    // On a case-insensitive FS a true Button.tsx/button.tsx shadow cannot coexist, so a
    // lone PascalCase primitive is authoritative and must be kept (the barrel references it).
    await withTempSrc(async (srcDir) => {
      const uiRoot = path.join(srcDir, 'components', 'ui');
      await fsPromises.mkdir(uiRoot, { recursive: true });
      await fsPromises.writeFile(path.join(uiRoot, 'Button.tsx'), 'export const Button = () => null;\n', 'utf-8');
      await fsPromises.writeFile(path.join(uiRoot, 'index.ts'), "export * from './Button';\n", 'utf-8');
      await fsPromises.writeFile(path.join(uiRoot, 'scroll-area.tsx'), 'export const ScrollArea = () => null;\n', 'utf-8');

      const removed = await cleanStaleUiPrimitiveFiles(uiRoot);

      expect(removed).toHaveLength(0);
      expect(fs.existsSync(path.join(uiRoot, 'Button.tsx'))).toBe(true);
      expect(fs.existsSync(path.join(uiRoot, 'index.ts'))).toBe(true);
      expect(fs.existsSync(path.join(uiRoot, 'scroll-area.tsx'))).toBe(true);
    });
  });

  it('keeps authoritative skeleton PascalCase primitives that have no lowercase shadow', async () => {
    // Skeletons ship Dialog.tsx/Button.tsx and re-export them from index.ts. With no
    // lowercase shadow these ARE the primitives — deleting them broke the barrel
    // (`missing_ui_primitive ./Dialog`). They must survive cleanup.
    await withTempSrc(async (srcDir) => {
      const uiRoot = path.join(srcDir, 'components', 'ui');
      await fsPromises.mkdir(uiRoot, { recursive: true });
      const skeletonPrimitives = ['Button.tsx', 'Card.tsx', 'Badge.tsx', 'Avatar.tsx', 'Dialog.tsx',
        'Input.tsx', 'Progress.tsx', 'Select.tsx', 'Sheet.tsx', 'Skeleton.tsx', 'Tabs.tsx'];
      for (const name of skeletonPrimitives) {
        await fsPromises.writeFile(path.join(uiRoot, name), 'export const X = () => null;\n', 'utf-8');
      }
      await fsPromises.writeFile(
        path.join(uiRoot, 'index.ts'),
        skeletonPrimitives.map(n => `export * from './${n.replace(/\.tsx$/, '')}';`).join('\n') + '\n',
        'utf-8',
      );

      const removed = await cleanStaleUiPrimitiveFiles(uiRoot);

      expect(removed).toHaveLength(0);
      for (const name of skeletonPrimitives) {
        expect(fs.existsSync(path.join(uiRoot, name)), `${name} must survive`).toBe(true);
      }
    });
  });

  it('does not remove canonical lowercase primitive files', async () => {
    await withTempSrc(async (srcDir) => {
      const uiRoot = path.join(srcDir, 'components', 'ui');
      await fsPromises.mkdir(uiRoot, { recursive: true });
      const canonical = ['button.tsx', 'card.tsx', 'badge.tsx', 'scroll-area.tsx', 'dialog.tsx'];
      for (const name of canonical) {
        await fsPromises.writeFile(path.join(uiRoot, name), '// canonical\n', 'utf-8');
      }

      const removed = await cleanStaleUiPrimitiveFiles(uiRoot);

      expect(removed).toHaveLength(0);
      for (const name of canonical) {
        expect(fs.existsSync(path.join(uiRoot, name))).toBe(true);
      }
    });
  });

  it('returns empty array when ui directory does not exist', async () => {
    await withTempSrc(async (srcDir) => {
      const uiRoot = path.join(srcDir, 'components', 'ui');
      const removed = await cleanStaleUiPrimitiveFiles(uiRoot);
      expect(removed).toEqual([]);
    });
  });

  it('canonical button.tsx source no longer imports from radix-ui unified package', async () => {
    const src = await fsPromises.readFile(
      path.resolve('frontend/src/components/ui/button.tsx'),
      'utf-8',
    );
    expect(src).not.toContain("from \"radix-ui\"");
    expect(src).not.toContain("from 'radix-ui'");
    expect(src).toContain('@radix-ui/react-slot');
  });

  it('canonical button.tsx uses Slot directly (not Slot.Root)', async () => {
    const src = await fsPromises.readFile(
      path.resolve('frontend/src/components/ui/button.tsx'),
      'utf-8',
    );
    expect(src).not.toContain('Slot.Root');
    expect(src).toMatch(/asChild\s*\?\s*Slot\s*:/);
  });
});

// ── P0: Build-system file contract guard ─────────────────────────────────────

describe('preview-manager build-system contract — generated file guard', () => {
  it('rejects generated tsconfig.json before Vite', () => {
    const v = validateGeneratedBuildSystemContracts({ 'src/tsconfig.json': '{}' });
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe('build_system_file');
    expect(v[0].detail).toMatch(/tsconfig\.json/);
  });

  it('rejects tsconfig.app.json and tsconfig.node.json variants', () => {
    const v = validateGeneratedBuildSystemContracts({
      'src/tsconfig.app.json': '{}',
      'src/tsconfig.node.json': '{}',
    });
    expect(v).toHaveLength(2);
    expect(v.every(x => x.kind === 'build_system_file')).toBe(true);
  });

  it('rejects vite.config.ts before Vite', () => {
    const v = validateGeneratedBuildSystemContracts({ 'src/vite.config.ts': 'export default {}' });
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe('build_system_file');
  });

  it('rejects postcss.config.js before Vite', () => {
    const v = validateGeneratedBuildSystemContracts({ 'src/postcss.config.js': 'module.exports = {}' });
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe('build_system_file');
  });

  it('rejects tailwind.config.js before Vite', () => {
    const v = validateGeneratedBuildSystemContracts({ 'tailwind.config.js': 'module.exports = {}' });
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe('build_system_file');
  });

  it('rejects package.json before Vite', () => {
    const v = validateGeneratedBuildSystemContracts({ 'package.json': '{"name":"x"}' });
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe('build_system_file');
  });

  it('rejects __build_id.ts (system-injected, must not be overwritten)', () => {
    const v = validateGeneratedBuildSystemContracts({ 'src/__build_id.ts': 'export const BUILD_ID = "x";' });
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe('build_system_file');
  });

  it('rejects .env.local', () => {
    const v = validateGeneratedBuildSystemContracts({ '.env.local': 'VITE_KEY=secret' });
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe('build_system_file');
  });

  it('allows App.tsx, pages/Home.tsx, components/Feature.tsx, hooks/useData.ts', () => {
    const v = validateGeneratedBuildSystemContracts({
      'src/App.tsx': 'export default function App() { return null; }',
      'src/pages/Home.tsx': 'export function Home() { return null; }',
      'src/components/Feature.tsx': 'export function Feature() { return null; }',
      'src/hooks/useData.ts': 'export function useData() { return {}; }',
    });
    expect(v).toHaveLength(0);
  });

  it('allows route-manifest.json (legitimate data file at src root)', () => {
    const v = validateGeneratedBuildSystemContracts({ 'src/route-manifest.json': '{"routes":[]}' });
    expect(v).toHaveLength(0);
  });
});

describe('preview-manager build-system contract — stale file cleanup', () => {
  it('removes tsconfig.json from src/ root', async () => {
    await withTempSrc(async (srcDir) => {
      await fsPromises.writeFile(path.join(srcDir, 'tsconfig.json'), '{}', 'utf-8');
      await fsPromises.writeFile(path.join(srcDir, 'App.tsx'), 'export default () => null;\n', 'utf-8');

      const removed = await cleanStaleBuildSystemFiles(srcDir);

      expect(removed).toContain('tsconfig.json');
      expect(fs.existsSync(path.join(srcDir, 'tsconfig.json'))).toBe(false);
      expect(fs.existsSync(path.join(srcDir, 'App.tsx'))).toBe(true);
    });
  });

  it('removes all stale build-system config files in one pass', async () => {
    await withTempSrc(async (srcDir) => {
      const stale = ['tsconfig.json', 'tsconfig.app.json', 'vite.config.ts',
        'postcss.config.js', 'tailwind.config.js', 'package.json'];
      for (const name of stale) {
        await fsPromises.writeFile(path.join(srcDir, name), '{}', 'utf-8');
      }

      const removed = await cleanStaleBuildSystemFiles(srcDir);

      for (const name of stale) {
        expect(removed, `${name} should be removed`).toContain(name);
        expect(fs.existsSync(path.join(srcDir, name))).toBe(false);
      }
    });
  });

  it('does NOT remove files inside subdirectories', async () => {
    await withTempSrc(async (srcDir) => {
      const pagesDir = path.join(srcDir, 'pages');
      await fsPromises.mkdir(pagesDir, { recursive: true });
      await fsPromises.writeFile(path.join(pagesDir, 'tsconfig.json'), '{}', 'utf-8');
      await fsPromises.writeFile(path.join(srcDir, 'tsconfig.json'), '{}', 'utf-8');

      const removed = await cleanStaleBuildSystemFiles(srcDir);

      expect(removed).toContain('tsconfig.json');
      expect(fs.existsSync(path.join(srcDir, 'tsconfig.json'))).toBe(false);
      expect(fs.existsSync(path.join(pagesDir, 'tsconfig.json'))).toBe(true);
    });
  });

  it('does NOT remove route-manifest.json', async () => {
    await withTempSrc(async (srcDir) => {
      await fsPromises.writeFile(path.join(srcDir, 'route-manifest.json'), '{"routes":[]}', 'utf-8');
      await fsPromises.writeFile(path.join(srcDir, 'tsconfig.json'), '{}', 'utf-8');

      const removed = await cleanStaleBuildSystemFiles(srcDir);

      expect(removed).toContain('tsconfig.json');
      expect(removed).not.toContain('route-manifest.json');
      expect(fs.existsSync(path.join(srcDir, 'route-manifest.json'))).toBe(true);
    });
  });

  it('returns empty array when srcDir has no stale build-system files', async () => {
    await withTempSrc(async (srcDir) => {
      await fsPromises.writeFile(path.join(srcDir, 'App.tsx'), 'export default () => null;\n', 'utf-8');
      const removed = await cleanStaleBuildSystemFiles(srcDir);
      expect(removed).toEqual([]);
    });
  });
});

// ── LIVE WORKSPACE HEALING — unified admission gate ───────────────────────────

describe('preview-manager workspace healing — validatePreviewGeneratedFiles', () => {
  it('strips generated src/components/ui/Button.tsx (system zone — not fatal)', () => {
    const result = validatePreviewGeneratedFiles({
      'src/components/ui/Button.tsx': 'export const Button = () => null;',
    });
    expect(result.fatalViolations).toHaveLength(0);
    expect(result.violations).toHaveLength(0);
    expect(result.strippedSystemFiles).toHaveProperty('src/components/ui/Button.tsx');
    expect(result.appFiles).not.toHaveProperty('src/components/ui/Button.tsx');
    expect(result.rejectedFiles).not.toHaveProperty('src/components/ui/Button.tsx');
  });

  it('rejects generated src/tsconfig.json (build-system file)', () => {
    const result = validatePreviewGeneratedFiles({ 'src/tsconfig.json': '{}' });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].kind).toBe('build_system_file');
    expect(result.rejectedFiles).toHaveProperty('src/tsconfig.json');
    expect(result.acceptedFiles).not.toHaveProperty('src/tsconfig.json');
  });

  it('rejects generated direct @radix-ui import', () => {
    const result = validatePreviewGeneratedFiles({
      'src/components/MyComp.tsx': "import { Slot } from '@radix-ui/react-slot';",
    });
    expect(result.violations.some(v => v.kind === 'direct_radix_import')).toBe(true);
    expect(result.rejectedFiles).toHaveProperty('src/components/MyComp.tsx');
    expect(result.acceptedFiles).not.toHaveProperty('src/components/MyComp.tsx');
  });

  it('rejects generated direct radix-ui (unified) import', () => {
    const result = validatePreviewGeneratedFiles({
      'src/components/MyComp.tsx': "import { Slot } from 'radix-ui';",
    });
    expect(result.violations.some(v => v.kind === 'direct_radix_import')).toBe(true);
  });

  it('rejects src/__build_id.ts (build-system singleton)', () => {
    const result = validatePreviewGeneratedFiles({
      'src/__build_id.ts': 'export const BUILD_ID = "x";',
    });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].kind).toBe('build_system_file');
  });

  it('rejects src/vite-env.d.ts (build-system singleton)', () => {
    const result = validatePreviewGeneratedFiles({
      'vite-env.d.ts': '/// <reference types="vite/client" />',
    });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].kind).toBe('build_system_file');
  });

  it('writes src/design-pack/ files (system-materialized premium components, not fatal)', () => {
    const result = validatePreviewGeneratedFiles({
      'src/design-pack/premium-components/x/component.tsx': 'export const X = () => null;',
    });
    expect(result.fatalViolations).toHaveLength(0);
    expect(result.appFiles).toHaveProperty('src/design-pack/premium-components/x/component.tsx');
  });

  it('routes src/docs/architect/ writes into docsFiles (not fatal)', () => {
    const result = validatePreviewGeneratedFiles({
      'src/docs/architect/README.md': '# docs',
    });
    expect(result.fatalViolations).toHaveLength(0);
    expect(result.docsFiles).toHaveProperty('src/docs/architect/README.md');
    expect(result.appFiles).not.toHaveProperty('src/docs/architect/README.md');
  });

  it('writes src/design-pack/ premium components (system-materialized, imported by app)', () => {
    const result = validatePreviewGeneratedFiles({
      'src/design-pack/premium-components/mobile/nav-01/component.tsx':
        "import * as Tabs from '@radix-ui/react-tabs';\nexport const Nav = () => null;",
    });
    // Written so '@/design-pack/...' imports resolve; vetted bank components may
    // import Radix directly, so this must NOT be a direct_radix_import fatal.
    expect(result.fatalViolations).toHaveLength(0);
    expect(result.appFiles).toHaveProperty('src/design-pack/premium-components/mobile/nav-01/component.tsx');
  });

  it('accepts valid App.tsx, pages/Home.tsx, components/Feature.tsx, hooks/useData.ts', () => {
    const result = validatePreviewGeneratedFiles({
      'src/App.tsx': 'export default function App() { return null; }',
      'src/pages/Home.tsx': 'export function Home() { return null; }',
      'src/components/Feature.tsx': 'export function Feature() { return null; }',
      'src/hooks/useData.ts': 'export function useData() { return {}; }',
    });
    expect(result.violations).toHaveLength(0);
    expect(Object.keys(result.acceptedFiles)).toHaveLength(4);
    expect(result.rejectedFiles).toEqual({});
  });

  it('allows route-manifest.json (legitimate src-root data file)', () => {
    const result = validatePreviewGeneratedFiles({
      'src/route-manifest.json': '{"routes":[]}',
    });
    expect(result.violations).toHaveLength(0);
    expect(result.acceptedFiles).toHaveProperty('src/route-manifest.json');
  });

  it('partitions a mixed batch: app written, ui stripped, build-system fatal', () => {
    const result = validatePreviewGeneratedFiles({
      'src/App.tsx': 'export default function App() { return null; }',
      'src/components/ui/Button.tsx': 'export const Button = () => null;', // stripped
      'src/pages/Home.tsx': 'export function Home() { return null; }',
      'src/tsconfig.json': '{}',                                           // fatal
    });
    expect(Object.keys(result.appFiles)).toHaveLength(2);
    expect(Object.keys(result.strippedSystemFiles)).toHaveLength(1);
    expect(Object.keys(result.rejectedFiles)).toHaveLength(1);
    expect(result.fatalViolations).toHaveLength(1);
    expect(result.fatalViolations[0].kind).toBe('build_system_file');
  });

  it('treats a build-system file at any depth as fatal (src/config/tsconfig.json)', () => {
    const result = validatePreviewGeneratedFiles({
      'src/config/tsconfig.json': '{}',
    });
    expect(result.fatalViolations).toHaveLength(1);
    expect(result.fatalViolations[0].kind).toBe('build_system_file');
    expect(result.rejectedFiles).toHaveProperty('src/config/tsconfig.json');
  });

  it('each fatal violation carries filePath, kind, and detail', () => {
    const result = validatePreviewGeneratedFiles({
      'src/tsconfig.json': '{}',
    });
    const [v] = result.fatalViolations;
    expect(v.filePath).toBe('src/tsconfig.json');
    expect(v.kind).toBeTruthy();
    expect(typeof v.detail).toBe('string');
    expect(v.detail.length).toBeGreaterThan(0);
  });
});

// ── LIVE WORKSPACE HEALING — legacy src cleanup ───────────────────────────────

describe('preview-manager workspace healing — cleanLegacySrcDirs', () => {
  it('removes stale src/components/OldBroken.tsx when not in current files', async () => {
    await withTempSrc(async (srcDir) => {
      const compDir = path.join(srcDir, 'components');
      await fsPromises.mkdir(compDir, { recursive: true });
      await fsPromises.writeFile(path.join(compDir, 'OldBroken.tsx'), '// stale\n', 'utf-8');

      await cleanLegacySrcDirs(srcDir);

      expect(fs.existsSync(path.join(compDir, 'OldBroken.tsx'))).toBe(false);
    });
  });

  it('removes stale src/hooks/useOld.ts when not in current files', async () => {
    await withTempSrc(async (srcDir) => {
      const hooksDir = path.join(srcDir, 'hooks');
      await fsPromises.mkdir(hooksDir, { recursive: true });
      await fsPromises.writeFile(path.join(hooksDir, 'useOld.ts'), '// stale\n', 'utf-8');

      await cleanLegacySrcDirs(srcDir);

      expect(fs.existsSync(path.join(hooksDir, 'useOld.ts'))).toBe(false);
    });
  });

  it('removes stale src/lib/broken.ts when not in current files', async () => {
    await withTempSrc(async (srcDir) => {
      const libDir = path.join(srcDir, 'lib');
      await fsPromises.mkdir(libDir, { recursive: true });
      await fsPromises.writeFile(
        path.join(libDir, 'cn.ts'),
        'export function cn(...v: string[]) { return v.join(" "); }\n',
        'utf-8',
      );
      await fsPromises.writeFile(path.join(libDir, 'broken.ts'), '// stale\n', 'utf-8');

      await cleanLegacySrcDirs(srcDir);

      expect(fs.existsSync(path.join(libDir, 'broken.ts'))).toBe(false);
    });
  });

  it('removes stale src/pages/Old.tsx when not in current files', async () => {
    await withTempSrc(async (srcDir) => {
      const pagesDir = path.join(srcDir, 'pages');
      await fsPromises.mkdir(pagesDir, { recursive: true });
      await fsPromises.writeFile(path.join(pagesDir, 'Old.tsx'), '// stale\n', 'utf-8');

      await cleanLegacySrcDirs(srcDir);

      expect(fs.existsSync(path.join(pagesDir, 'Old.tsx'))).toBe(false);
    });
  });

  it('removes stale src/components/ui/Button.tsx — system zone is wiped entirely', async () => {
    await withTempSrc(async (srcDir) => {
      const uiDir = path.join(srcDir, 'components', 'ui');
      await fsPromises.mkdir(uiDir, { recursive: true });
      await fsPromises.writeFile(path.join(uiDir, 'Button.tsx'), '// stale\n', 'utf-8');

      await cleanLegacySrcDirs(srcDir);

      expect(fs.existsSync(path.join(uiDir, 'Button.tsx'))).toBe(false);
      expect(fs.existsSync(uiDir)).toBe(false);
    });
  });

  it('removes stale src/tsconfig.json from src root', async () => {
    await withTempSrc(async (srcDir) => {
      await fsPromises.writeFile(path.join(srcDir, 'tsconfig.json'), '{}', 'utf-8');
      await fsPromises.writeFile(path.join(srcDir, 'vite-env.d.ts'), '/// <reference types="vite/client" />\n', 'utf-8');

      await cleanLegacySrcDirs(srcDir);

      expect(fs.existsSync(path.join(srcDir, 'tsconfig.json'))).toBe(false);
    });
  });

  it('current accepted generated files can be written into the clean src/ after cleanup', async () => {
    await withTempSrc(async (srcDir) => {
      // Plant a stale file
      const pagesDir = path.join(srcDir, 'pages');
      await fsPromises.mkdir(pagesDir, { recursive: true });
      await fsPromises.writeFile(path.join(pagesDir, 'Stale.tsx'), '// stale\n', 'utf-8');

      // Run cleanup (simulates compileBuild step 0b)
      await cleanLegacySrcDirs(srcDir);

      // Write new files (simulates compileBuild step 1)
      const newFiles: Record<string, string> = {
        'pages/Home.tsx': 'export function Home() { return null; }\n',
        'components/Feature.tsx': 'export function Feature() { return null; }\n',
      };
      for (const [rel, content] of Object.entries(newFiles)) {
        const full = path.join(srcDir, rel);
        await fsPromises.mkdir(path.dirname(full), { recursive: true });
        await fsPromises.writeFile(full, content, 'utf-8');
      }

      expect(fs.existsSync(path.join(pagesDir, 'Stale.tsx'))).toBe(false);
      expect(fs.existsSync(path.join(srcDir, 'pages', 'Home.tsx'))).toBe(true);
      expect(fs.existsSync(path.join(srcDir, 'components', 'Feature.tsx'))).toBe(true);
    });
  });

  it('preserves vite-env.d.ts after the wipe (system scaffold snapshot)', async () => {
    await withTempSrc(async (srcDir) => {
      const content = '/// <reference types="vite/client" />\n';
      await fsPromises.writeFile(path.join(srcDir, 'vite-env.d.ts'), content, 'utf-8');

      await cleanLegacySrcDirs(srcDir);

      expect(fs.existsSync(path.join(srcDir, 'vite-env.d.ts'))).toBe(true);
      expect(await fsPromises.readFile(path.join(srcDir, 'vite-env.d.ts'), 'utf-8')).toBe(content);
    });
  });

  it('preserves index.css after the wipe (system scaffold snapshot)', async () => {
    await withTempSrc(async (srcDir) => {
      const content = ':root { --bg: #000; }\n';
      await fsPromises.writeFile(path.join(srcDir, 'index.css'), content, 'utf-8');

      await cleanLegacySrcDirs(srcDir);

      expect(fs.existsSync(path.join(srcDir, 'index.css'))).toBe(true);
      expect(await fsPromises.readFile(path.join(srcDir, 'index.css'), 'utf-8')).toBe(content);
    });
  });

  it('preserves lib/cn.ts after the wipe (system shim snapshot)', async () => {
    await withTempSrc(async (srcDir) => {
      const libDir = path.join(srcDir, 'lib');
      await fsPromises.mkdir(libDir, { recursive: true });
      const cnContent = 'export function cn(...v: string[]) { return v.join(" "); }\n';
      await fsPromises.writeFile(path.join(libDir, 'cn.ts'), cnContent, 'utf-8');
      // Also plant a stale lib file that must NOT survive
      await fsPromises.writeFile(path.join(libDir, 'staleUtil.ts'), '// stale\n', 'utf-8');

      await cleanLegacySrcDirs(srcDir);

      expect(fs.existsSync(path.join(srcDir, 'lib', 'cn.ts'))).toBe(true);
      expect(await fsPromises.readFile(path.join(srcDir, 'lib', 'cn.ts'), 'utf-8')).toBe(cnContent);
      expect(fs.existsSync(path.join(srcDir, 'lib', 'staleUtil.ts'))).toBe(false);
    });
  });

  it('system-injected __build_id.ts does not survive cleanup (compileBuild force-writes it after)', async () => {
    await withTempSrc(async (srcDir) => {
      await fsPromises.writeFile(
        path.join(srcDir, '__build_id.ts'),
        'export const BUILD_ID = "old-build";\n',
        'utf-8',
      );

      await cleanLegacySrcDirs(srcDir);

      // __build_id.ts is NOT a system scaffold snapshot — compileBuild injects it after cleanup
      expect(fs.existsSync(path.join(srcDir, '__build_id.ts'))).toBe(false);
    });
  });

  it('route-manifest.json is allowed (not a system snapshot, can be re-provided via files)', async () => {
    await withTempSrc(async (srcDir) => {
      // route-manifest.json is allowed by validatePreviewGeneratedFiles;
      // it can be provided in `files` and written after cleanup.
      const admission = validatePreviewGeneratedFiles({
        'src/route-manifest.json': '{"routes":[]}',
      });
      expect(admission.violations).toHaveLength(0);
      expect(admission.acceptedFiles).toHaveProperty('src/route-manifest.json');
    });
  });

  it('removes stale themes, data, and context directories', async () => {
    await withTempSrc(async (srcDir) => {
      for (const dir of ['themes', 'data', 'context']) {
        const p = path.join(srcDir, dir);
        await fsPromises.mkdir(p, { recursive: true });
        await fsPromises.writeFile(path.join(p, 'stale.ts'), '// stale\n', 'utf-8');
      }

      await cleanLegacySrcDirs(srcDir);

      for (const dir of ['themes', 'data', 'context']) {
        expect(fs.existsSync(path.join(srcDir, dir))).toBe(false);
      }
    });
  });

  it('returns empty array when srcDir is empty', async () => {
    await withTempSrc(async (srcDir) => {
      const removed = await cleanLegacySrcDirs(srcDir);
      expect(removed).toEqual([]);
    });
  });
});
