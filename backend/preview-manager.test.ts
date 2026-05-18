import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import { describe, expect, it } from 'vitest';
import {
  ensureImportedUiPrimitives,
  findUiPrimitiveImportsInSource,
  getPreviewDocumentTrailingSlashRedirectPath,
  injectPreviewSessionIntoHtmlAssetUrls,
  bindPreviewBuildSession,
  canReadPreviewBuild,
  getPreservedPreviewDirs,
  normalizePreviewSessionToken,
  prunePreviewSessionBindings,
  resolvePreviewSrcPath,
  resolveSectionTemplatePaths,
  sanitizeCompileFiles,
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
});

describe('preview-manager preview asset sessions', () => {
  const validToken = 'preview-session-token-123';

  it('appends previewSession to Vite JS asset URLs in HTML', () => {
    const html = '<script type="module" crossorigin src="./assets/index-abc123.js"></script>';

    expect(injectPreviewSessionIntoHtmlAssetUrls(html, validToken)).toBe(
      '<script type="module" crossorigin src="./assets/index-abc123.js?previewSession=preview-session-token-123"></script>',
    );
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
