import { describe, it, expect } from 'vitest';
import {
  scanFileMap,
  scanBeforePreviewLoad,
} from '../projectCorruptionScan';

// ── Fixtures ────────────────────────────────────────────────────────────────

const CLEAN_APP = `import React from 'react';
export default function App() {
  return <div className="min-h-screen">Hello World</div>;
}`;

const CLEAN_FILES: Record<string, string> = {
  'App.tsx': CLEAN_APP,
  'index.css': 'body { margin: 0; }',
  'components/Button.tsx': 'export function Button() { return <button/>; }',
};

const ARTIFACT_ENVELOPE = JSON.stringify({
  artifact: {
    entry: 'src/App.tsx',
    files: [
      { path: 'src/App.tsx', content: CLEAN_APP },
      { path: 'src/index.css', content: 'body {}' },
    ],
  },
});

const POISONED_FILES: Record<string, string> = {
  'App.tsx': ARTIFACT_ENVELOPE,
  'index.css': 'body { margin: 0; }',
};

// ── scanFileMap ─────────────────────────────────────────────────────────────

describe('scanFileMap', () => {
  it('returns clean for a healthy project', () => {
    const result = scanFileMap(CLEAN_FILES);
    expect(result.clean).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it('detects artifact-envelope in App.tsx', () => {
    const result = scanFileMap(POISONED_FILES);
    expect(result.clean).toBe(false);
    const envelope = result.findings.find(f => f.kind === 'artifact-envelope');
    expect(envelope).toBeDefined();
    expect(envelope!.path).toBe('App.tsx');
    expect(envelope!.message).toContain('artifact JSON');
  });

  it('detects artifact-envelope in nested page file', () => {
    const result = scanFileMap({
      'App.tsx': CLEAN_APP,
      'pages/Home.tsx': ARTIFACT_ENVELOPE,
    });
    expect(result.clean).toBe(false);
    expect(result.findings[0].path).toBe('pages/Home.tsx');
  });

  it('detects missing entry file', () => {
    const result = scanFileMap({
      'components/Button.tsx': 'export function Button() { return <button/>; }',
      'index.css': 'body {}',
    });
    expect(result.clean).toBe(false);
    expect(result.findings.some(f => f.kind === 'missing-entry')).toBe(true);
  });

  it('detects empty file map', () => {
    const result = scanFileMap({});
    expect(result.clean).toBe(false);
    expect(result.findings[0].kind).toBe('empty-file-map');
  });

  it('does NOT flag CSS files even if they look like JSON', () => {
    const result = scanFileMap({
      'App.tsx': CLEAN_APP,
      'index.css': JSON.stringify({ artifact: { files: [{ path: 'x', content: 'y' }] } }),
    });
    expect(result.clean).toBe(true);
  });

  it('does NOT flag .json files', () => {
    const result = scanFileMap({
      'App.tsx': CLEAN_APP,
      'routes.json': JSON.stringify({ artifact: { files: [{ path: 'x', content: 'y' }] } }),
    });
    expect(result.clean).toBe(true);
  });

  it('skips __build_id.ts', () => {
    const result = scanFileMap({
      'App.tsx': CLEAN_APP,
      '__build_id.ts': 'export const BUILD_ID = "abc";',
    });
    expect(result.clean).toBe(true);
  });

  it('handles src/ prefix in paths', () => {
    const result = scanFileMap({
      'src/App.tsx': CLEAN_APP,
      'src/index.css': 'body {}',
    });
    expect(result.clean).toBe(true);
  });

  it('detects poisoned file with leading-slash path', () => {
    const result = scanFileMap({
      '/App.tsx': ARTIFACT_ENVELOPE,
    });
    expect(result.clean).toBe(false);
    expect(result.findings[0].kind).toBe('artifact-envelope');
  });

  it('detects flat files-array envelope', () => {
    const flat = JSON.stringify({
      files: [{ path: 'src/App.tsx', content: 'code' }],
    });
    const result = scanFileMap({ 'App.tsx': flat });
    expect(result.clean).toBe(false);
    expect(result.findings[0].kind).toBe('artifact-envelope');
  });
});

// ── scanBeforePreviewLoad ───────────────────────────────────────────────────

describe('scanBeforePreviewLoad', () => {
  it('returns safe=true for clean project', () => {
    const result = scanBeforePreviewLoad('proj-1', CLEAN_FILES, 'test');
    expect(result.safe).toBe(true);
  });

  it('returns safe=false for project with poisoned App.tsx', () => {
    const result = scanBeforePreviewLoad('proj-2', POISONED_FILES, 'test');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('artifact JSON');
  });

  it('returns safe=true for project with missing entry (warning only)', () => {
    // Missing entry is a warning, not a blocker — some projects are HTML/Alpine
    const result = scanBeforePreviewLoad('proj-3', {
      'components/Button.tsx': 'export function Button() { return <button/>; }',
    }, 'test');
    expect(result.safe).toBe(true);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it('blocks project where any source file is an artifact envelope', () => {
    const result = scanBeforePreviewLoad('proj-4', {
      'App.tsx': CLEAN_APP,
      'services/api.ts': ARTIFACT_ENVELOPE,
    }, 'test');
    expect(result.safe).toBe(false);
  });
});
