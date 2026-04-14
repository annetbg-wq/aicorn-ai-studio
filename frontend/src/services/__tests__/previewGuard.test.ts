import { describe, it, expect } from 'vitest';
import { isArtifactEnvelope, checkPreviewWrite } from '../previewGuard';

// ── isArtifactEnvelope ──────────────────────────────────────────────────────

describe('isArtifactEnvelope', () => {
  it('detects standard artifact envelope with nested artifact.files', () => {
    const payload = JSON.stringify({
      artifact: {
        entry: 'src/App.tsx',
        files: [
          { path: 'src/App.tsx', content: 'export default function App() {}' },
          { path: 'src/index.css', content: 'body {}' },
        ],
      },
    });
    expect(isArtifactEnvelope(payload)).toBe(true);
  });

  it('detects flat files-array envelope', () => {
    const payload = JSON.stringify({
      files: [
        { path: 'src/App.tsx', content: 'export default function App() {}' },
      ],
    });
    expect(isArtifactEnvelope(payload)).toBe(true);
  });

  it('detects envelope with leading whitespace', () => {
    const payload = '  \n  ' + JSON.stringify({
      artifact: {
        files: [{ path: 'src/App.tsx', content: 'code' }],
      },
    });
    expect(isArtifactEnvelope(payload)).toBe(true);
  });

  it('passes clean TSX source code', () => {
    const tsx = `import React from 'react';
export default function App() {
  return <div>Hello</div>;
}`;
    expect(isArtifactEnvelope(tsx)).toBe(false);
  });

  it('passes clean CSS', () => {
    expect(isArtifactEnvelope('body { margin: 0; }')).toBe(false);
  });

  it('passes TypeScript with JSON-like string literals', () => {
    const ts = `const config = { artifact: true, files: [] };
export default config;`;
    expect(isArtifactEnvelope(ts)).toBe(false);
  });

  it('passes empty string', () => {
    expect(isArtifactEnvelope('')).toBe(false);
  });

  it('passes plain JSON that is NOT an artifact envelope', () => {
    const json = JSON.stringify({ version: 1, routes: [{ path: '/' }] });
    expect(isArtifactEnvelope(json)).toBe(false);
  });

  it('rejects artifact even if files array has extra fields', () => {
    const payload = JSON.stringify({
      artifact: {
        entry: 'src/App.tsx',
        files: [
          { path: 'src/App.tsx', content: 'code', language: 'tsx' },
        ],
      },
    });
    expect(isArtifactEnvelope(payload)).toBe(true);
  });

  it('passes JSON object with files array but entries lack content key', () => {
    const payload = JSON.stringify({
      files: [{ path: 'src/App.tsx', size: 42 }],
    });
    expect(isArtifactEnvelope(payload)).toBe(false);
  });

  it('passes JSON object with empty files array', () => {
    const payload = JSON.stringify({ artifact: { files: [] } });
    expect(isArtifactEnvelope(payload)).toBe(false);
  });
});

// ── checkPreviewWrite ───────────────────────────────────────────────────────

describe('checkPreviewWrite', () => {
  it('returns null for clean source code', () => {
    const result = checkPreviewWrite(
      'App.tsx',
      'export default function App() { return <div/>; }',
      'test',
    );
    expect(result).toBeNull();
  });

  it('returns rejection for artifact-envelope content', () => {
    const envelope = JSON.stringify({
      artifact: {
        entry: 'src/App.tsx',
        files: [{ path: 'src/App.tsx', content: 'code' }],
      },
    });
    const result = checkPreviewWrite('App.tsx', envelope, 'test', {
      buildId: 'build-123',
      projectId: 'proj-456',
    });
    expect(result).not.toBeNull();
    expect(result!.path).toBe('App.tsx');
    expect(result!.source).toBe('test');
    expect(result!.buildId).toBe('build-123');
    expect(result!.projectId).toBe('proj-456');
    expect(result!.reason).toContain('artifact-envelope');
  });

  it('simulates ProjectStorage.loadToPreview protection', () => {
    // This simulates what happens when a saved project has poisoned App.tsx
    const poisonedFiles: Record<string, string> = {
      'App.tsx': JSON.stringify({
        artifact: { files: [{ path: 'src/App.tsx', content: 'real code' }] },
      }),
      'index.css': 'body { margin: 0; }',
    };

    const results: Array<{ path: string; blocked: boolean }> = [];
    for (const [path, content] of Object.entries(poisonedFiles)) {
      const rejection = checkPreviewWrite(path, content, 'ProjectStorage.loadToPreview');
      results.push({ path, blocked: rejection !== null });
    }

    // App.tsx should be blocked, index.css should pass
    expect(results.find(r => r.path === 'App.tsx')?.blocked).toBe(true);
    expect(results.find(r => r.path === 'index.css')?.blocked).toBe(false);
  });
});
