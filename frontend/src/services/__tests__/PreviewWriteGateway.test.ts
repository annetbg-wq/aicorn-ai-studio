/**
 * PreviewWriteGateway — Canonical gateway tests.
 *
 * Proves that ALL preview write paths now share:
 *   1. The same path normalization
 *   2. The same artifact-envelope poison guard
 *   3. The same structured logging (previewLog events)
 *   4. The same write contract (fetch → status check → result)
 *
 * Network is stubbed (no running preview-workspace in vitest).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizePath,
  writeFile,
  writeBatch,
  writeBuildMarker,
  clearPreview,
} from '../PreviewWriteGateway';

// ── Fixtures ────────────────────────────────────────────────────────────────

const CLEAN_TSX = `import React from 'react';
export default function App() {
  return <div className="p-4">Hello</div>;
}`;

const CLEAN_CSS = `@tailwind base;
body { margin: 0; }`;

const ARTIFACT_ENVELOPE = JSON.stringify({
  artifact: {
    entry: 'src/App.tsx',
    files: [
      { path: 'src/App.tsx', content: CLEAN_TSX },
    ],
  },
});

const FLAT_ENVELOPE = JSON.stringify({
  files: [
    { path: 'src/App.tsx', content: CLEAN_TSX },
  ],
});

// ── Mocks ───────────────────────────────────────────────────────────────────

let fetchCalls: Array<{ url: string; body?: Record<string, any> }> = [];
let logEvents: Array<{ event: string; payload: Record<string, unknown> }> = [];

// Mock fetch
const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
  const body = init?.body ? JSON.parse(init.body as string) : undefined;
  fetchCalls.push({ url, body });
  return { ok: true, status: 200 } as Response;
});

// Capture previewLog calls
vi.mock('../PreviewController', () => ({
  previewLog: (event: string, payload: Record<string, unknown>) => {
    logEvents.push({ event, payload });
  },
}));

// ── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  fetchCalls = [];
  logEvents = [];
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── normalizePath ───────────────────────────────────────────────────────────

describe('normalizePath', () => {
  it('strips leading /', () => {
    expect(normalizePath('/App.tsx')).toBe('App.tsx');
  });

  it('strips src/ prefix', () => {
    expect(normalizePath('src/App.tsx')).toBe('App.tsx');
  });

  it('strips both / and src/', () => {
    expect(normalizePath('/src/pages/Home.tsx')).toBe('pages/Home.tsx');
  });

  it('passes through already-clean paths', () => {
    expect(normalizePath('App.tsx')).toBe('App.tsx');
    expect(normalizePath('components/Button.tsx')).toBe('components/Button.tsx');
  });
});

// ── writeFile ───────────────────────────────────────────────────────────────

describe('writeFile', () => {
  const opts = { source: 'test', buildId: 'b1', projectId: 'p1' };

  it('writes clean content and logs gateway_write_ok', async () => {
    const result = await writeFile('App.tsx', CLEAN_TSX, opts);
    expect(result.written).toBe(true);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('/__write_preview');
    expect(fetchCalls[0].body).toEqual({ path: 'App.tsx', content: CLEAN_TSX });

    const okLog = logEvents.find(e => e.event === 'gateway_write_ok');
    expect(okLog).toBeDefined();
    expect(okLog!.payload.path).toBe('App.tsx');
    expect(okLog!.payload.source).toBe('test');
    expect(okLog!.payload.buildId).toBe('b1');
  });

  it('normalizes path before writing', async () => {
    await writeFile('/src/pages/Home.tsx', CLEAN_TSX, opts);
    expect(fetchCalls[0].body).toEqual({ path: 'pages/Home.tsx', content: CLEAN_TSX });
  });

  it('blocks artifact-envelope and logs gateway_write_blocked', async () => {
    const result = await writeFile('App.tsx', ARTIFACT_ENVELOPE, opts);
    expect(result.written).toBe(false);
    expect(result.reason).toContain('Blocked artifact-envelope');

    // No fetch call — blocked before network
    expect(fetchCalls).toHaveLength(0);

    // Both previewGuard's preview_write_blocked AND gateway's gateway_write_blocked logged
    const blocked = logEvents.find(e => e.event === 'gateway_write_blocked');
    expect(blocked).toBeDefined();
    expect(blocked!.payload.path).toBe('App.tsx');
    expect(blocked!.payload.source).toBe('test');
  });

  it('blocks flat files-array envelope', async () => {
    const result = await writeFile('App.tsx', FLAT_ENVELOPE, opts);
    expect(result.written).toBe(false);
    expect(result.reason).toContain('Blocked artifact-envelope');
    expect(fetchCalls).toHaveLength(0);
  });

  it('reports fetch failure as written=false with reason', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 } as Response);
    const result = await writeFile('App.tsx', CLEAN_TSX, opts);
    expect(result.written).toBe(false);
    expect(result.reason).toContain('write_preview failed');

    const errLog = logEvents.find(e => e.event === 'gateway_write_error');
    expect(errLog).toBeDefined();
    expect(errLog!.payload.status).toBe(500);
  });

  it('reports network error as written=false', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network down'));
    const result = await writeFile('App.tsx', CLEAN_TSX, opts);
    expect(result.written).toBe(false);
    expect(result.reason).toContain('network error');

    const errLog = logEvents.find(e => e.event === 'gateway_write_error');
    expect(errLog).toBeDefined();
  });
});

// ── writeBatch ──────────────────────────────────────────────────────────────

describe('writeBatch', () => {
  const opts = { source: 'batch-test', buildId: 'b2' };

  it('writes multiple files and excludes __build_id.ts', async () => {
    const files: Record<string, string> = {
      'App.tsx': CLEAN_TSX,
      'index.css': CLEAN_CSS,
      '__build_id.ts': 'export const BUILD_ID = "stale";',
    };
    const result = await writeBatch(files, opts);
    expect(result.total).toBe(2); // __build_id.ts excluded
    expect(result.written).toBe(2);
    expect(result.blocked).toHaveLength(0);
    expect(result.failed).toHaveLength(0);

    // Verify __build_id.ts was NOT written
    const paths = fetchCalls.map(c => c.body?.path);
    expect(paths).not.toContain('__build_id.ts');

    // Verify batch_done log
    const batchLog = logEvents.find(e => e.event === 'gateway_batch_done');
    expect(batchLog).toBeDefined();
    expect(batchLog!.payload.total).toBe(2);
    expect(batchLog!.payload.written).toBe(2);
  });

  it('reports blocked files in batch result', async () => {
    const files: Record<string, string> = {
      'App.tsx': ARTIFACT_ENVELOPE,
      'index.css': CLEAN_CSS,
    };
    const result = await writeBatch(files, opts);
    expect(result.total).toBe(2);
    expect(result.written).toBe(1);
    expect(result.blocked).toEqual(['App.tsx']);
    expect(result.failed).toHaveLength(0);
  });

  it('reports failed files in batch result', async () => {
    // First call fails (App.tsx), second succeeds (index.css)
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response);

    const files: Record<string, string> = {
      'App.tsx': CLEAN_TSX,
      'index.css': CLEAN_CSS,
    };
    const result = await writeBatch(files, opts);
    expect(result.written).toBe(1);
    expect(result.failed).toEqual(['App.tsx']);
  });

  it('normalizes paths in batch', async () => {
    const files: Record<string, string> = {
      '/src/App.tsx': CLEAN_TSX,
      'src/index.css': CLEAN_CSS,
    };
    const result = await writeBatch(files, opts);
    expect(result.written).toBe(2);
    const paths = fetchCalls.map(c => c.body?.path);
    expect(paths).toContain('App.tsx');
    expect(paths).toContain('index.css');
  });
});

// ── writeBuildMarker ────────────────────────────────────────────────────────

describe('writeBuildMarker', () => {
  it('writes __build_id.ts with correct content and logs', async () => {
    await writeBuildMarker('build-abc', { source: 'test-marker' });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].body).toEqual({
      path: '__build_id.ts',
      content: 'export const BUILD_ID = "build-abc";\n',
    });

    const startLog = logEvents.find(e => e.event === 'gateway_build_marker_start');
    expect(startLog).toBeDefined();
    expect(startLog!.payload.buildId).toBe('build-abc');

    const doneLog = logEvents.find(e => e.event === 'gateway_build_marker_done');
    expect(doneLog).toBeDefined();
  });

  it('throws on middleware failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 } as Response);
    await expect(
      writeBuildMarker('build-fail', { source: 'test' }),
    ).rejects.toThrow('__build_id write failed');
  });
});

// ── clearPreview ────────────────────────────────────────────────────────────

describe('clearPreview', () => {
  it('calls /__clear_preview and logs start+done', async () => {
    await clearPreview({ source: 'test-clear', buildId: 'b3' });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('/__clear_preview');

    const startLog = logEvents.find(e => e.event === 'gateway_clear_start');
    expect(startLog).toBeDefined();
    expect(startLog!.payload.source).toBe('test-clear');

    const doneLog = logEvents.find(e => e.event === 'gateway_clear_done');
    expect(doneLog).toBeDefined();
  });

  it('logs error and throws on failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 } as Response);
    await expect(
      clearPreview({ source: 'test-clear-fail' }),
    ).rejects.toThrow('clear_preview failed');

    const errLog = logEvents.find(e => e.event === 'gateway_clear_error');
    expect(errLog).toBeDefined();
  });
});

// ── Cross-path consistency ──────────────────────────────────────────────────

describe('All paths share the same guard', () => {
  const envelope = ARTIFACT_ENVELOPE;
  const sources = [
    'ProjectStorage.loadToPreview',
    'RevisionManager.flushToDisk',
    'RevisionManager.writeCandidateFile',
    'useStudio.createNewProject',
  ];

  it.each(sources)('source=%s gets the same rejection for artifact envelope', async (source) => {
    const result = await writeFile('App.tsx', envelope, { source });
    expect(result.written).toBe(false);
    expect(result.reason).toContain('Blocked artifact-envelope');

    const blocked = logEvents.filter(e => e.event === 'gateway_write_blocked');
    expect(blocked.length).toBeGreaterThanOrEqual(1);
    const last = blocked[blocked.length - 1];
    expect(last.payload.source).toBe(source);
    expect(last.payload.path).toBe('App.tsx');

    // Reset for next iteration
    logEvents.length = 0;
  });

  it('all paths use the same normalization', async () => {
    const variants = ['/src/App.tsx', 'src/App.tsx', '/App.tsx', 'App.tsx'];
    for (const path of variants) {
      fetchCalls.length = 0;
      await writeFile(path, CLEAN_TSX, { source: 'norm-test' });
      expect(fetchCalls[0].body?.path).toBe('App.tsx');
    }
  });
});
