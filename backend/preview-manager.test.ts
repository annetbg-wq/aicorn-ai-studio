import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  resolvePreviewSrcPath,
  resolveSectionTemplatePaths,
  sanitizeCompileFiles,
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

    expect(paths.templatesSrc.toLowerCase()).toBe(path.resolve('c:/ai_studio/frontend/src/templates/components').toLowerCase());
    expect(paths.sectionsDest.toLowerCase()).toBe(path.resolve('c:/ai_studio/preview-workspace/src/components/sections').toLowerCase());
  });
});
