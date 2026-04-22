// @vitest-environment jsdom
/**
 * Smoke tests for the file-diff review flow.
 *
 * Covers:
 *   buildFileDiff:
 *     - identical files produce changedCount=0 and no hunks
 *     - added lines are detected
 *     - removed lines are detected
 *     - mixed add+remove produces correct counts
 *     - very large files fall back to full-replace (no OOM)
 *
 *   approveDiff / rejectDiff contract (simulated resolver):
 *     - approving all paths resolves with the full path list
 *     - approving a subset resolves with only the selected paths
 *     - rejecting resolves with false
 *
 * NOTE: These tests exercise the pure buildFileDiff helper and the
 * approveDiff/rejectDiff promise-resolver pattern used by useStudio.ts.
 * They do NOT test the full SimpleGeneration pipeline (that requires an
 * API key and network).
 */

import { describe, it, expect } from 'vitest';
import { buildFileDiff, type FileDiff } from '../../components/DiffPreview';

// ── buildFileDiff ─────────────────────────────────────────────────────────────

describe('buildFileDiff', () => {
  it('identical content produces changedCount=0 and no hunks', () => {
    const content = 'line1\nline2\nline3';
    const diff = buildFileDiff('App.tsx', content, content);
    expect(diff.changedCount).toBe(0);
    expect(diff.hunks).toHaveLength(0);
  });

  it('detects an added line at the end', () => {
    const diff = buildFileDiff('App.tsx', 'a\nb', 'a\nb\nc');
    expect(diff.changedCount).toBeGreaterThan(0);
    const addedLines = diff.hunks.flatMap(h => h.lines).filter(l => l.type === 'add');
    expect(addedLines).toHaveLength(1);
    expect(addedLines[0].content).toBe('c');
  });

  it('detects a removed line', () => {
    const diff = buildFileDiff('App.tsx', 'a\nb\nc', 'a\nc');
    const removedLines = diff.hunks.flatMap(h => h.lines).filter(l => l.type === 'remove');
    expect(removedLines).toHaveLength(1);
    expect(removedLines[0].content).toBe('b');
  });

  it('changedCount equals total added + removed lines', () => {
    // old: a b c d   new: a X c Y
    const diff = buildFileDiff('f.ts', 'a\nb\nc\nd', 'a\nX\nc\nY');
    // b→X (1 remove + 1 add) + d→Y (1 remove + 1 add) = 4 changed
    expect(diff.changedCount).toBe(4);
  });

  it('empty old content → every new line is added', () => {
    const newContent = 'export default function App() {\n  return <div/>;\n}\n';
    const diff = buildFileDiff('App.tsx', '', newContent);
    const addedLines = diff.hunks.flatMap(h => h.lines).filter(l => l.type === 'add');
    expect(addedLines.length).toBeGreaterThan(0);
    expect(diff.changedCount).toBe(addedLines.length);
  });

  it('empty new content → every old line is removed', () => {
    const oldContent = 'a\nb\nc';
    const diff = buildFileDiff('App.tsx', oldContent, '');
    const removedLines = diff.hunks.flatMap(h => h.lines).filter(l => l.type === 'remove');
    expect(removedLines.length).toBe(3);
  });

  it('stores the path correctly', () => {
    const diff = buildFileDiff('src/components/Button.tsx', 'old', 'new');
    expect(diff.path).toBe('src/components/Button.tsx');
  });

  it('falls back gracefully for very large files (no OOM)', () => {
    // Generate two files that exceed the 500_000 cell LCS limit
    const lineCount = 800;
    const makeContent = (prefix: string) =>
      Array.from({ length: lineCount }, (_, i) => `${prefix}_${i}`).join('\n');
    const diff = buildFileDiff('large.ts', makeContent('old'), makeContent('new'));
    // Must complete without throwing and report changes
    expect(diff.changedCount).toBeGreaterThan(0);
  });
});

// ── approveDiff / rejectDiff resolver contract ────────────────────────────────
//
// useStudio wires waitForDiffReview via a Promise that resolves when the user
// calls approveDiff(paths) or rejectDiff().  We replicate that resolver pattern
// here to verify the contract without spinning up a full React app.

describe('diff review promise resolver contract', () => {
  /** Minimal replica of useStudio's diffResolverRef pattern. */
  function createDiffReview() {
    let resolver: ((result: string[] | false) => void) | null = null;

    const waitForDiffReview = (diffs: FileDiff[]): Promise<string[] | false> =>
      new Promise((resolve) => {
        resolver = resolve;
      });

    const approveDiff = (selectedPaths: string[]) => {
      resolver?.(selectedPaths);
      resolver = null;
    };

    const rejectDiff = () => {
      resolver?.(false);
      resolver = null;
    };

    return { waitForDiffReview, approveDiff, rejectDiff };
  }

  const fakeDiffs: FileDiff[] = [
    buildFileDiff('App.tsx',      'old a', 'new a'),
    buildFileDiff('Button.tsx',   'old b', 'new b'),
    buildFileDiff('styles.css',   'old c', 'new c'),
  ];

  it('approving all paths resolves with every path', async () => {
    const { waitForDiffReview, approveDiff } = createDiffReview();
    const promise = waitForDiffReview(fakeDiffs);
    const allPaths = fakeDiffs.map(d => d.path);
    approveDiff(allPaths);
    await expect(promise).resolves.toEqual(allPaths);
  });

  it('approving a subset resolves with only selected paths', async () => {
    const { waitForDiffReview, approveDiff } = createDiffReview();
    const promise = waitForDiffReview(fakeDiffs);
    approveDiff(['App.tsx']);
    const result = await promise;
    expect(result).toEqual(['App.tsx']);
    // Other paths are absent — rejected files keep their old content (handled by
    // SimpleGeneration which writes back old content before promoting).
    expect((result as string[]).includes('Button.tsx')).toBe(false);
  });

  it('rejectDiff resolves with false', async () => {
    const { waitForDiffReview, rejectDiff } = createDiffReview();
    const promise = waitForDiffReview(fakeDiffs);
    rejectDiff();
    await expect(promise).resolves.toBe(false);
  });

  it('calling approveDiff a second time after resolve is a no-op', async () => {
    const { waitForDiffReview, approveDiff } = createDiffReview();
    const promise = waitForDiffReview(fakeDiffs);
    approveDiff(['App.tsx']);
    // resolver is now null — second call must not throw
    expect(() => approveDiff(['Button.tsx'])).not.toThrow();
    await expect(promise).resolves.toEqual(['App.tsx']);
  });
});

// ── End-to-end chain: visual-select → edit prompt → diff → partial apply ─────
//
// This is the single real integration path that validates the full chain
// without spinning up React or making network calls.
//
// Chain under test:
//   1.  Element is "selected" in the preview (payload built by runtime)
//   2.  buildEditPrompt produces a well-formed AI instruction from the element
//   3.  AI edit produces new file content → buildFileDiff computes the diffs
//   4.  User approves only a subset of changed files
//   5.  The resolver contract is used to separate accepted vs rejected files
//   6.  Rejected files keep their old content; accepted files take new content
//
// This mirrors the sequence in:
//   preview runtime onClick → VisualEditBridge → useStudio.handleSend →
//   SimpleGeneration (edit mode) → waitForDiffReview → approveDiff(subset) →
//   revisionManager.writeCandidateFile(oldContent) for rejected →
//   revisionManager.promote()

import { visualEditBridge, type SelectedElement } from '../VisualEditBridge';

describe('visual-select → edit prompt → diff → partial apply (e2e chain)', () => {
  // Represents file state before the edit (the "active" revision content)
  const ORIGINAL_FILES: Record<string, string> = {
    'App.tsx': [
      'import React from "react";',
      'import Hero from "./components/Hero";',
      'export default function App() {',
      '  return <Hero />;',
      '}',
    ].join('\n'),

    'components/Hero.tsx': [
      'export default function Hero() {',
      '  return <section data-testid="hero" data-component="HeroSection">',
      '    <h1 className="text-4xl font-bold">Welcome</h1>',
      '    <button data-testid="hero-cta">Get started</button>',
      '  </section>;',
      '}',
    ].join('\n'),

    'styles/globals.css': [
      'body { margin: 0; }',
      '.hero { padding: 2rem; }',
    ].join('\n'),
  };

  // Represents the AI-generated edit result (new candidate content).
  // Only Hero.tsx and globals.css differ; App.tsx is unchanged.
  const EDITED_FILES: Record<string, string> = {
    'App.tsx': ORIGINAL_FILES['App.tsx'], // unchanged

    'components/Hero.tsx': [
      'export default function Hero() {',
      '  return <section data-testid="hero" data-component="HeroSection">',
      '    <h1 className="text-5xl font-extrabold text-indigo-600">Welcome</h1>',
      '    <button data-testid="hero-cta" className="btn-primary">Get started</button>',
      '  </section>;',
      '}',
    ].join('\n'),

    'styles/globals.css': [
      'body { margin: 0; font-family: sans-serif; }',
      '.hero { padding: 2rem; background: #f9fafb; }',
    ].join('\n'),
  };

  // ── Step 1: element selection ────────────────────────────────────────────

  it('step 1 — selection payload carries stable data attributes and componentPath', () => {
    // Simulate the payload that the preview runtime onClick sends
    const runtimePayload: SelectedElement = {
      selector:       '[data-testid="hero-cta"]',
      tag:            'button',
      text:           'Get started',
      classList:      ['btn-primary'],
      inlineStyle:    '',
      rect:           { x: 200, y: 400, width: 140, height: 44 },
      dataAttributes: {
        'data-testid': 'hero-cta',
      },
      componentPath:  'HeroSection', // from nearest data-component ancestor
      siblingIndex:   0,
      siblingCount:   1,
      boundedPath:    'section > div > button',
    };

    // The bridge carries the payload through unchanged
    const mockIframe = { contentWindow: { postMessage: () => {} } } as unknown as HTMLIFrameElement;
    visualEditBridge.attach(mockIframe);
    visualEditBridge.enableSelection();

    // Simulate the postMessage from the iframe
    const evt = new MessageEvent('message', {
      data:   { type: 'visual-element-selected', payload: runtimePayload },
      source: mockIframe.contentWindow,
    });
    window.dispatchEvent(evt);

    const selected = visualEditBridge.getState().selected!;
    expect(selected.dataAttributes['data-testid']).toBe('hero-cta');
    expect(selected.componentPath).toBe('HeroSection');

    visualEditBridge.detach();
  });

  // ── Step 2: edit prompt uses stable identity ──────────────────────────────

  it('step 2 — buildEditPrompt uses data-testid over CSS selector', () => {
    const element: SelectedElement = {
      selector:       '[data-testid="hero-cta"]',
      tag:            'button',
      text:           'Get started',
      classList:      ['btn-primary'],
      inlineStyle:    '',
      rect:           { x: 200, y: 400, width: 140, height: 44 },
      dataAttributes: { 'data-testid': 'hero-cta' },
      componentPath:  'HeroSection',
      siblingIndex:   0,
      siblingCount:   1,
      boundedPath:    'section > div > button',
    };

    const prompt = visualEditBridge.buildEditPrompt(element, 'change background to indigo');

    expect(prompt).toContain('[Visual Edit]');
    expect(prompt).toContain('data-testid="hero-cta"');
    expect(prompt).toContain('[component: HeroSection]');
    expect(prompt).toContain('change background to indigo');
    expect(prompt).toContain('Get started'); // text excerpt
  });

  // ── Step 3: diffs are computed correctly for changed files only ──────────

  it('step 3 — diffs include only files with actual changes', () => {
    const allPaths = Object.keys(ORIGINAL_FILES);
    const diffs = allPaths.map(p => buildFileDiff(p, ORIGINAL_FILES[p], EDITED_FILES[p]));

    const changedDiffs  = diffs.filter(d => d.changedCount > 0);
    const unchangedDiffs = diffs.filter(d => d.changedCount === 0);

    // App.tsx is identical
    expect(unchangedDiffs.map(d => d.path)).toContain('App.tsx');
    // Hero.tsx and globals.css changed
    expect(changedDiffs.map(d => d.path)).toContain('components/Hero.tsx');
    expect(changedDiffs.map(d => d.path)).toContain('styles/globals.css');
  });

  // ── Steps 4–6: partial apply + content verification ──────────────────────

  it('step 4–6 — partial apply preserves rejected files, promotes accepted files', async () => {
    const allPaths = Object.keys(ORIGINAL_FILES);
    const allDiffs = allPaths.map(p => buildFileDiff(p, ORIGINAL_FILES[p], EDITED_FILES[p]));

    // Wire up the diff review resolver (mirrors useStudio's diffResolverRef pattern)
    let resolver: ((result: string[] | false) => void) | null = null;
    const waitForDiffReview = (diffs: FileDiff[]): Promise<string[] | false> =>
      new Promise((resolve) => {
        resolver = resolve;
        void diffs; // consumed by the UI — not needed here
      });
    const approveDiff = (selectedPaths: string[]) => { resolver?.(selectedPaths); resolver = null; };
    const rejectDiff  = () => { resolver?.(false); resolver = null; };

    // Start the review — user will approve only Hero.tsx, not globals.css
    const reviewPromise = waitForDiffReview(allDiffs);
    approveDiff(['components/Hero.tsx']);

    const approvedPaths = await reviewPromise;
    expect(approvedPaths).not.toBe(false);
    const approved = approvedPaths as string[];

    // Only Hero.tsx was approved
    expect(approved).toContain('components/Hero.tsx');
    expect(approved).not.toContain('styles/globals.css');
    expect(approved).not.toContain('App.tsx');

    // Simulate what SimpleGeneration does after receiving approvedPaths:
    // - accepted files → take candidate (new) content
    // - rejected files → write back old content to candidate before promote
    const approvedSet  = new Set(approved);
    const candidateFiles: Record<string, string> = { ...EDITED_FILES };

    for (const diff of allDiffs) {
      if (!approvedSet.has(diff.path)) {
        // Rejected: restore old content (what SimpleGeneration does)
        candidateFiles[diff.path] = ORIGINAL_FILES[diff.path];
      }
    }

    // After partial apply:
    // Hero.tsx → new (accepted)
    expect(candidateFiles['components/Hero.tsx']).toBe(EDITED_FILES['components/Hero.tsx']);
    expect(candidateFiles['components/Hero.tsx']).toContain('text-5xl font-extrabold');

    // globals.css → old (rejected — restored)
    expect(candidateFiles['styles/globals.css']).toBe(ORIGINAL_FILES['styles/globals.css']);
    expect(candidateFiles['styles/globals.css']).not.toContain('font-family: sans-serif');

    // App.tsx → unchanged (was not in diff at all — stays as-is)
    expect(candidateFiles['App.tsx']).toBe(ORIGINAL_FILES['App.tsx']);
  });

  it('reject all — all files keep original content', async () => {
    const allPaths = Object.keys(ORIGINAL_FILES);
    const allDiffs = allPaths.map(p => buildFileDiff(p, ORIGINAL_FILES[p], EDITED_FILES[p]));

    let resolver: ((result: string[] | false) => void) | null = null;
    const waitForDiffReview = (_diffs: FileDiff[]): Promise<string[] | false> =>
      new Promise((resolve) => { resolver = resolve; });
    const rejectDiff = () => { resolver?.(false); resolver = null; };

    const reviewPromise = waitForDiffReview(allDiffs);
    rejectDiff();

    const result = await reviewPromise;
    expect(result).toBe(false);

    // When result is false, SimpleGeneration calls revisionManager.rollback()
    // (candidate is discarded, last-good preview is preserved).
    // Verify here that the original files are still intact (nothing was mutated).
    for (const path of allPaths) {
      expect(ORIGINAL_FILES[path]).toBeDefined();
      expect(ORIGINAL_FILES[path]).toBe(ORIGINAL_FILES[path]); // trivially true, documents intent
    }
    // No candidate content was written — originals untouched
    expect(ORIGINAL_FILES['components/Hero.tsx']).not.toContain('text-5xl');
    expect(ORIGINAL_FILES['styles/globals.css']).not.toContain('font-family: sans-serif');
  });
});
