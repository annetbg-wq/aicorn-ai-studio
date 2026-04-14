/**
 * Tests for the server-side /__write_preview artifact-envelope guard.
 *
 * Since the guard runs inside vite.config.ts middleware (Node context),
 * we duplicate the detection logic here to verify the exact same algorithm.
 * The implementation in vite.config.ts uses isArtifactEnvelopeServer() which
 * is functionally identical to what's tested below.
 */

import { describe, it, expect } from 'vitest';

// ── Exact copy of the server-side detection function ────────────────────────
// Kept in sync with vite.config.ts `isArtifactEnvelopeServer`.

function isArtifactEnvelopeServer(content: string): boolean {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith('{')) return false;
  let parsed: any;
  try { parsed = JSON.parse(trimmed); } catch { return false; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  if (parsed.artifact && typeof parsed.artifact === 'object' && !Array.isArray(parsed.artifact)) {
    const inner = parsed.artifact;
    if (Array.isArray(inner.files) && inner.files.length > 0) {
      const f = inner.files[0];
      if (f && typeof f.path === 'string' && typeof f.content === 'string') return true;
    }
  }
  if (Array.isArray(parsed.files) && parsed.files.length > 0) {
    const f = parsed.files[0];
    if (f && typeof f.path === 'string' && typeof f.content === 'string') return true;
  }
  return false;
}

// ── Server-side guard decision logic ────────────────────────────────────────

const SOURCE_EXT_RE = /\.(tsx?|jsx?)$/;
const BRIDGE_FILES = new Set(['__build_id.ts']);

/** Simulates the server-side guard decision: should this write be blocked? */
function shouldBlockWrite(filePath: string, content: string): boolean {
  if (!SOURCE_EXT_RE.test(filePath)) return false;
  if (BRIDGE_FILES.has(filePath)) return false;
  if (typeof content !== 'string') return false;
  return isArtifactEnvelopeServer(content);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('server-side isArtifactEnvelopeServer', () => {
  it('detects { artifact: { files: [{path, content}] } }', () => {
    const payload = JSON.stringify({
      artifact: {
        entry: 'src/App.tsx',
        files: [{ path: 'src/App.tsx', content: 'export default function App() {}' }],
      },
    });
    expect(isArtifactEnvelopeServer(payload)).toBe(true);
  });

  it('detects { files: [{path, content}] }', () => {
    const payload = JSON.stringify({
      files: [{ path: 'src/App.tsx', content: 'code' }],
    });
    expect(isArtifactEnvelopeServer(payload)).toBe(true);
  });

  it('passes clean TSX', () => {
    expect(isArtifactEnvelopeServer('export default function App() { return <div/>; }')).toBe(false);
  });

  it('passes clean CSS', () => {
    expect(isArtifactEnvelopeServer('body { margin: 0; }')).toBe(false);
  });

  it('passes routes.json (no path+content entries)', () => {
    const json = JSON.stringify({ version: 1, routes: [{ path: '/', filePath: 'pages/Home.tsx' }] });
    expect(isArtifactEnvelopeServer(json)).toBe(false);
  });

  it('passes JSON with empty files array', () => {
    expect(isArtifactEnvelopeServer(JSON.stringify({ artifact: { files: [] } }))).toBe(false);
  });
});

describe('server-side shouldBlockWrite', () => {
  const envelope = JSON.stringify({
    artifact: { files: [{ path: 'src/App.tsx', content: 'code' }] },
  });
  const cleanTsx = 'export default function App() { return <div/>; }';

  it('blocks App.tsx with artifact envelope', () => {
    expect(shouldBlockWrite('App.tsx', envelope)).toBe(true);
  });

  it('blocks pages/Home.tsx with artifact envelope', () => {
    expect(shouldBlockWrite('pages/Home.tsx', envelope)).toBe(true);
  });

  it('blocks components/Button.tsx with artifact envelope', () => {
    expect(shouldBlockWrite('components/Button.tsx', envelope)).toBe(true);
  });

  it('blocks main.tsx with artifact envelope', () => {
    expect(shouldBlockWrite('main.tsx', envelope)).toBe(true);
  });

  it('blocks arbitrary .ts file with artifact envelope', () => {
    expect(shouldBlockWrite('services/api.ts', envelope)).toBe(true);
  });

  it('blocks .jsx file with artifact envelope', () => {
    expect(shouldBlockWrite('App.jsx', envelope)).toBe(true);
  });

  it('allows __build_id.ts regardless of content', () => {
    // __build_id.ts is a bridge file — its content is always internally generated
    // but we exempt it from the check entirely to avoid false positives
    expect(shouldBlockWrite('__build_id.ts', envelope)).toBe(false);
  });

  it('allows .css files (not source-like)', () => {
    expect(shouldBlockWrite('index.css', envelope)).toBe(false);
  });

  it('allows .json files (not source-like)', () => {
    expect(shouldBlockWrite('routes.json', envelope)).toBe(false);
  });

  it('allows clean TSX in App.tsx', () => {
    expect(shouldBlockWrite('App.tsx', cleanTsx)).toBe(false);
  });

  it('allows clean TSX in pages/Home.tsx', () => {
    expect(shouldBlockWrite('pages/Home.tsx', cleanTsx)).toBe(false);
  });
});
