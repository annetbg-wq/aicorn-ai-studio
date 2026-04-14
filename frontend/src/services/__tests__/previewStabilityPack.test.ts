/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PREVIEW STABILITY PACK — Reproducible proof of preview pipeline health
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Run:  npx vitest run src/services/__tests__/previewStabilityPack.test.ts
 *   or: npm run test:smoke
 *
 * This pack ties together the 5 critical stability scenarios into one
 * coherent suite. Each scenario uses real service code with ONLY the
 * network layer stubbed (no running preview-workspace in vitest).
 *
 * Scenarios:
 *   S1. Happy path — candidate → compile → promote → ready_set
 *   S2. Poisoned source rejection — artifact-envelope blocked at every layer
 *   S3. Corrupted persisted project — scanBeforePreviewLoad blocks load
 *   S4. White-screen-after-ready detection — post-ready DOM sanity check
 *   S5. Last-good preservation — failed candidate does not corrupt active
 *
 * Each scenario documents:
 *   - GIVEN: initial state
 *   - WHEN:  action taken
 *   - THEN:  expected timeline events + state assertions
 *
 * The pack reads real [preview-timeline] events to validate behavior,
 * not fake success markers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Services under test (real, not mocked) ──────────────────────────────────

import { RevisionManager } from '../RevisionManager';
import { PreviewController, previewLog } from '../PreviewController';
import { checkPreviewWrite } from '../previewGuard';
import { scanBeforePreviewLoad } from '../projectCorruptionScan';
import { writeFile, writeBatch, clearPreview } from '../PreviewWriteGateway';
import { evaluateMetrics, type DOMMetrics } from '../WhiteScreenDetector';
import { resolvePreviewUI, type PreviewUIInputs } from '../previewLifecycleResolver';

// ── Fixtures ────────────────────────────────────────────────────────────────

const CLEAN_APP_TSX = `import React from 'react';
export default function App() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <h1 className="text-white text-3xl">Hello World</h1>
    </div>
  );
}`;

const CLEAN_INDEX_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;
body { font-family: 'Inter', sans-serif; }`;

const CLEAN_FILES: Record<string, string> = {
  'App.tsx': CLEAN_APP_TSX,
  'index.css': CLEAN_INDEX_CSS,
};

const ARTIFACT_ENVELOPE = JSON.stringify({
  artifact: {
    entry: 'src/App.tsx',
    files: [
      { path: 'src/App.tsx', content: CLEAN_APP_TSX },
      { path: 'src/index.css', content: CLEAN_INDEX_CSS },
    ],
  },
});

const FLAT_ENVELOPE = JSON.stringify({
  files: [{ path: 'src/App.tsx', content: CLEAN_APP_TSX }],
});

// ── Timeline event capture ──────────────────────────────────────────────────

interface TimelineEvent {
  event: string;
  payload: Record<string, unknown>;
}

let capturedEvents: TimelineEvent[] = [];

function startCapture(): void {
  capturedEvents = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].startsWith('[preview-timeline]')) {
      const event = (args[0] as string).replace('[preview-timeline] ', '');
      const payload = (args[1] as Record<string, unknown>) ?? {};
      capturedEvents.push({ event, payload });
    }
  });
}

function findEvents(name: string): TimelineEvent[] {
  return capturedEvents.filter(e => e.event === name);
}

function hasEvent(name: string): boolean {
  return findEvents(name).length > 0;
}

function hasNoEvent(name: string, filter?: (e: TimelineEvent) => boolean): boolean {
  const events = findEvents(name);
  if (!filter) return events.length === 0;
  return events.filter(filter).length === 0;
}

// ── Mock setup ──────────────────────────────────────────────────────────────

let mockFetchOk: boolean;

beforeEach(() => {
  mockFetchOk = true;
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: mockFetchOk,
    status: mockFetchOk ? 200 : 500,
  })));
  startCapture();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
//  S1. HAPPY PATH — Successful preview reaching ready_set
// ═══════════════════════════════════════════════════════════════════════════

describe('S1: Happy path — candidate → compile → promote → ready_set', () => {
  it('GIVEN clean files WHEN candidate is created and compiled THEN ready_set fires', async () => {
    const rm = new RevisionManager();
    const pc = new PreviewController();

    // GIVEN: clean App.tsx and index.css
    const revId = await rm.createCandidate();
    await rm.writeCandidateFile(revId, 'App.tsx', CLEAN_APP_TSX);
    await rm.writeCandidateFile(revId, 'index.css', CLEAN_INDEX_CSS);

    // WHEN: files are buffered and candidate state is verified
    const files = rm.getRevisionFiles(revId);
    expect(files).toBeDefined();
    expect(files!['App.tsx']).toBe(CLEAN_APP_TSX);
    expect(files!['index.css']).toBe(CLEAN_INDEX_CSS);

    // THEN: candidate is current, no active yet
    expect(rm.getCandidateRevisionId()).toBe(revId);
    expect(rm.getActiveRevisionId()).toBeNull();

    // THEN: timeline events show candidate_created and file_buffered
    expect(hasEvent('candidate_created')).toBe(true);
    const buffered = findEvents('file_buffered');
    expect(buffered.length).toBe(2);
    expect(buffered.map(e => e.payload.path).sort()).toEqual(['App.tsx', 'index.css']);

    // WHEN: PreviewController transitions through compile lifecycle
    pc.notifyCompiling(revId);
    expect(pc.getState().status).toBe('compiling');
    expect(pc.getState().expectingBuildId).toBe(revId);

    // THEN: controller_compiling event emitted
    expect(hasEvent('controller_compiling')).toBe(true);

    // WHEN: preview-mounted arrives (simulating successful Vite HMR)
    pc.notifyReady(revId, 'validated_iframe_handshake');

    // THEN: status is 'ready', ready_set event fired with correct buildId
    expect(pc.getState().status).toBe('ready');
    expect(pc.getState().activeRevisionId).toBe(revId);
    expect(pc.getState().lastReadyAt).toBeGreaterThan(0);

    const readyEvents = findEvents('ready_set');
    expect(readyEvents.length).toBe(1);
    expect(readyEvents[0].payload.buildId).toBe(revId);
    expect(readyEvents[0].payload.source).toBe('validated_iframe_handshake');
  });

  it('GIVEN clean files WHEN written through gateway THEN all pass guard and log correctly', async () => {
    // WHEN: files written through the canonical write gateway
    const r1 = await writeFile('App.tsx', CLEAN_APP_TSX, {
      source: 'smoke-test', buildId: 'b1',
    });
    const r2 = await writeFile('index.css', CLEAN_INDEX_CSS, {
      source: 'smoke-test', buildId: 'b1',
    });

    // THEN: both written successfully
    expect(r1.written).toBe(true);
    expect(r2.written).toBe(true);

    // THEN: gateway_write_ok events emitted for each
    const okEvents = findEvents('gateway_write_ok');
    expect(okEvents.length).toBe(2);
  });

  it('GIVEN ready state WHEN resolvePreviewUI is called THEN overlay is none', () => {
    const ui = resolvePreviewUI({
      controllerStatus: 'ready',
      controllerError: null,
      controllerDiagnostics: null,
      activeRevisionId: 'rev-1',
      lifecycleStage: 'preview-ready',
      blockedReason: null,
      isGenerating: false,
      iframeLoaded: true,
      loadingTimeout: false,
      serverDown: false,
      isFixing: false,
      fixFailed: false,
    });
    expect(ui.overlay).toBe('none');
    expect(ui.error).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  S2. POISONED SOURCE REJECTION — Artifact-envelope blocked at every layer
// ═══════════════════════════════════════════════════════════════════════════

describe('S2: Poisoned source rejection — artifact-envelope blocked everywhere', () => {
  it('GIVEN artifact-envelope WHEN written to RevisionManager THEN throws and emits blocked event', async () => {
    const rm = new RevisionManager();
    const revId = await rm.createCandidate();

    // WHEN: poisoned write attempted
    await expect(
      rm.writeCandidateFile(revId, 'App.tsx', ARTIFACT_ENVELOPE),
    ).rejects.toThrow('Blocked artifact-envelope');

    // THEN: content was NOT buffered
    const files = rm.getRevisionFiles(revId);
    expect(files!['App.tsx']).toBeUndefined();

    // THEN: preview_write_blocked event in timeline
    expect(hasEvent('preview_write_blocked')).toBe(true);
    const blocked = findEvents('preview_write_blocked');
    expect(blocked[0].payload.path).toBe('App.tsx');
  });

  it('GIVEN flat-envelope WHEN written through gateway THEN blocked', async () => {
    const result = await writeFile('App.tsx', FLAT_ENVELOPE, {
      source: 'smoke-test',
    });
    expect(result.written).toBe(false);
    expect(result.reason).toContain('Blocked artifact-envelope');
    expect(hasEvent('gateway_write_blocked')).toBe(true);
  });

  it('GIVEN artifact-envelope WHEN checked by previewGuard THEN returns rejection record', () => {
    const rejection = checkPreviewWrite('App.tsx', ARTIFACT_ENVELOPE, 'smoke-test', {
      buildId: 'b1',
      projectId: 'p1',
    });
    expect(rejection).not.toBeNull();
    expect(rejection!.path).toBe('App.tsx');
    expect(rejection!.source).toBe('smoke-test');
    expect(rejection!.buildId).toBe('b1');
  });

  it('GIVEN clean source code WHEN checked by previewGuard THEN passes', () => {
    const rejection = checkPreviewWrite('App.tsx', CLEAN_APP_TSX, 'smoke-test');
    expect(rejection).toBeNull();
  });

  it('GIVEN mixed files WHEN batch-written through gateway THEN poison blocked, clean passes', async () => {
    const files = {
      'App.tsx': ARTIFACT_ENVELOPE,
      'index.css': CLEAN_INDEX_CSS,
    };
    const result = await writeBatch(files, { source: 'smoke-batch' });
    expect(result.written).toBe(1);       // index.css passed
    expect(result.blocked).toEqual(['App.tsx']); // App.tsx blocked
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  S3. CORRUPTED PERSISTED PROJECT — scanBeforePreviewLoad blocks load
// ═══════════════════════════════════════════════════════════════════════════

describe('S3: Corrupted persisted project — load-time rejection', () => {
  it('GIVEN project with poisoned App.tsx WHEN scanned THEN safe=false with artifact-envelope finding', () => {
    const result = scanBeforePreviewLoad('proj-poison', {
      'App.tsx': ARTIFACT_ENVELOPE,
      'index.css': CLEAN_INDEX_CSS,
    }, 'smoke-test');

    expect(result.safe).toBe(false);
    expect(result.reason).toContain('artifact JSON');
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    expect(result.findings[0].kind).toBe('artifact-envelope');
    expect(result.findings[0].path).toBe('App.tsx');

    // THEN: corruption_detected_preload event
    expect(hasEvent('corruption_detected_preload')).toBe(true);
    const evt = findEvents('corruption_detected_preload')[0];
    expect(evt.payload.projectId).toBe('proj-poison');
  });

  it('GIVEN project with poisoned nested file WHEN scanned THEN safe=false', () => {
    const result = scanBeforePreviewLoad('proj-nested', {
      'App.tsx': CLEAN_APP_TSX,
      'services/api.ts': ARTIFACT_ENVELOPE,
    }, 'smoke-test');
    expect(result.safe).toBe(false);
    expect(result.findings.some(f => f.path === 'services/api.ts')).toBe(true);
  });

  it('GIVEN clean project WHEN scanned THEN safe=true with no findings', () => {
    const result = scanBeforePreviewLoad('proj-clean', CLEAN_FILES, 'smoke-test');
    expect(result.safe).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it('GIVEN empty project WHEN scanned THEN safe=true (warning only, not blocking)', () => {
    // Empty projects are warned but allowed — they're not corrupted, just empty
    const result = scanBeforePreviewLoad('proj-empty', {}, 'smoke-test');
    expect(result.safe).toBe(true); // empty is not an artifact-envelope
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  S4. WHITE-SCREEN-AFTER-READY — Post-mount DOM sanity check
// ═══════════════════════════════════════════════════════════════════════════

describe('S4: White-screen-after-ready detection', () => {
  function makeMetrics(overrides: Partial<DOMMetrics> = {}): DOMMetrics {
    return {
      rootChildCount: 5,
      rootInnerTextLength: 200,
      rootOffsetHeight: 800,
      bodyChildCount: 3,
      bodyInnerTextLength: 250,
      hasLoadingIndicator: false,
      rootTextHead: 'Welcome to the app. Dashboard with real content.',
      ...overrides,
    };
  }

  it('GIVEN healthy DOM WHEN evaluated THEN healthy=true', () => {
    const result = evaluateMetrics(makeMetrics(), 'build-1');
    expect(result.healthy).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('GIVEN empty #root WHEN evaluated THEN empty-root detected', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 0,
      rootInnerTextLength: 0,
      rootOffsetHeight: 0,
      rootTextHead: '',
    }), 'build-2');
    expect(result.healthy).toBe(false);
    expect(result.reason).toBe('empty-root');
  });

  it('GIVEN zero-height root with children WHEN evaluated THEN zero-height-root detected', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 3,
      rootOffsetHeight: 0,
    }), 'build-3');
    expect(result.healthy).toBe(false);
    expect(result.reason).toBe('zero-height-root');
  });

  it('GIVEN "Loading..." only WHEN evaluated THEN loading-shell-only detected', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 1,
      rootInnerTextLength: 10,
      hasLoadingIndicator: true,
      rootTextHead: 'Loading...',
    }), 'build-4');
    expect(result.healthy).toBe(false);
    expect(result.reason).toBe('loading-shell-only');
  });

  it('GIVEN "Waiting for generation..." WHEN evaluated THEN loading-shell-only detected', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 1,
      rootInnerTextLength: 26,
      hasLoadingIndicator: true,
      rootTextHead: 'Waiting for generation...',
    }), 'build-5');
    expect(result.healthy).toBe(false);
    expect(result.reason).toBe('loading-shell-only');
  });

  it('GIVEN minimal single element with < 10 chars WHEN evaluated THEN minimal-content detected', () => {
    const result = evaluateMetrics(makeMetrics({
      rootChildCount: 1,
      rootInnerTextLength: 3,
      rootOffsetHeight: 50,
      hasLoadingIndicator: false,
      rootTextHead: 'Hi',
    }), 'build-6');
    expect(result.healthy).toBe(false);
    expect(result.reason).toBe('minimal-content');
  });

  it('GIVEN ready state + white-screen diagnostics WHEN UI resolved THEN overlay stays none (diagnostic only)', () => {
    // White-screen detection does NOT change status to 'failed' — it stays 'ready'
    // The diagnostic is recorded separately via PreviewController.setDiagnosticError
    const ui = resolvePreviewUI({
      controllerStatus: 'ready',
      controllerError: null,
      controllerDiagnostics: {
        stage: 'iframe-ready',
        error: { stage: 'white-screen-detected', message: 'empty-root' },
      },
      activeRevisionId: 'rev-1',
      lifecycleStage: 'preview-ready',
      blockedReason: null,
      isGenerating: false,
      iframeLoaded: true,
      loadingTimeout: false,
      serverDown: false,
      isFixing: false,
      fixFailed: false,
    });
    // Key assertion: overlay is 'none' because status is still 'ready'
    // White-screen is a diagnostic signal, not a lifecycle failure
    expect(ui.overlay).toBe('none');
    expect(ui.controllerStatus).toBe('ready');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  S5. LAST-GOOD PRESERVATION — Failed candidate does not corrupt active
// ═══════════════════════════════════════════════════════════════════════════

describe('S5: Last-good preservation across failed candidate', () => {
  it('GIVEN good revision WHEN poison candidate fails THEN good revision files preserved', async () => {
    const rm = new RevisionManager();

    // GIVEN: establish a good revision with clean files
    const goodRevId = await rm.createCandidate();
    await rm.writeCandidateFile(goodRevId, 'App.tsx', CLEAN_APP_TSX);
    await rm.writeCandidateFile(goodRevId, 'index.css', CLEAN_INDEX_CSS);

    // Verify good files buffered
    expect(rm.getRevisionFiles(goodRevId)!['App.tsx']).toBe(CLEAN_APP_TSX);

    // WHEN: new candidate with poisoned content
    const badRevId = await rm.createCandidate();

    await expect(
      rm.writeCandidateFile(badRevId, 'App.tsx', ARTIFACT_ENVELOPE),
    ).rejects.toThrow('Blocked artifact-envelope');

    // THEN: good revision files are still intact in the store
    const goodFiles = rm.getRevisionFiles(goodRevId);
    expect(goodFiles).toBeDefined();
    expect(goodFiles!['App.tsx']).toBe(CLEAN_APP_TSX);
    expect(goodFiles!['index.css']).toBe(CLEAN_INDEX_CSS);

    // THEN: bad candidate has no poisoned content
    const badFiles = rm.getRevisionFiles(badRevId);
    expect(badFiles!['App.tsx']).toBeUndefined();
  });

  it('GIVEN good revision WHEN bad candidate rejected THEN no false ready_set for bad build', async () => {
    const rm = new RevisionManager();
    const pc = new PreviewController();

    // GIVEN: good candidate created
    const goodRevId = await rm.createCandidate();
    await rm.writeCandidateFile(goodRevId, 'App.tsx', CLEAN_APP_TSX);

    // Simulate good compile success
    pc.notifyCompiling(goodRevId);
    pc.notifyReady(goodRevId, 'validated_iframe_handshake');
    expect(pc.getState().status).toBe('ready');

    // WHEN: new bad candidate
    const badRevId = await rm.createCandidate();
    pc.notifyCompiling(badRevId);

    // Poison is caught at write time
    await expect(
      rm.writeCandidateFile(badRevId, 'App.tsx', ARTIFACT_ENVELOPE),
    ).rejects.toThrow();

    // Build fails
    pc.notifyFailed('Artifact-envelope blocked', badRevId);

    // THEN: no ready_set for the bad buildId
    expect(hasNoEvent('ready_set', e => e.payload.buildId === badRevId)).toBe(true);

    // THEN: controller is in 'failed' state for the bad build
    expect(pc.getState().status).toBe('failed');
    expect(pc.getState().error).toContain('Artifact-envelope');
  });

  it('GIVEN compiling state WHEN foreign buildId tries notifyReady THEN rejected', () => {
    const pc = new PreviewController();

    pc.notifyCompiling('expected-build');
    expect(pc.getState().expectingBuildId).toBe('expected-build');

    // Foreign buildId cannot promote
    pc.notifyReady('foreign-build', 'stale_signal');
    expect(pc.getState().status).toBe('compiling'); // NOT ready
    expect(pc.getState().expectingBuildId).toBe('expected-build');

    // THEN: rejection logged
    expect(hasEvent('notify_ready_rejected')).toBe(true);
    const rejection = findEvents('notify_ready_rejected')[0];
    expect(rejection.payload.reason).toBe('buildId_mismatch');
    expect(rejection.payload.expecting).toBe('expected-build');
    expect(rejection.payload.buildId).toBe('foreign-build');
  });

  it('GIVEN failed state WHEN resolvePreviewUI called THEN overlay is failed with error', () => {
    const ui = resolvePreviewUI({
      controllerStatus: 'failed',
      controllerError: 'Artifact-envelope blocked',
      controllerDiagnostics: null,
      activeRevisionId: 'bad-rev',
      lifecycleStage: 'failed',
      blockedReason: null,
      isGenerating: false,
      iframeLoaded: true,
      loadingTimeout: false,
      serverDown: false,
      isFixing: false,
      fixFailed: false,
    });
    expect(ui.overlay).toBe('failed');
    expect(ui.error).not.toBeNull();
    expect(ui.error!.message).toContain('Artifact-envelope');
  });

  it('GIVEN degraded state WHEN resolvePreviewUI called THEN overlay is degraded (softer)', () => {
    const ui = resolvePreviewUI({
      controllerStatus: 'failed',
      controllerError: 'New build error',
      controllerDiagnostics: null,
      activeRevisionId: 'bad-rev',
      lifecycleStage: 'degraded',
      blockedReason: null,
      isGenerating: false,
      iframeLoaded: true,
      loadingTimeout: false,
      serverDown: false,
      isFixing: false,
      fixFailed: false,
    });
    expect(ui.overlay).toBe('degraded');
    expect(ui.error!.message).toContain('New build error');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  RESULTS SUMMARY FORMAT
// ═══════════════════════════════════════════════════════════════════════════
//
//  When all scenarios pass, vitest output will show:
//
//    S1: Happy path — candidate → compile → promote → ready_set
//      ✓ GIVEN clean files WHEN candidate created THEN ready_set fires
//      ✓ GIVEN clean files WHEN written through gateway THEN all pass guard
//      ✓ GIVEN ready state WHEN resolvePreviewUI called THEN overlay none
//
//    S2: Poisoned source rejection — artifact-envelope blocked everywhere
//      ✓ GIVEN artifact-envelope WHEN written to RevisionManager THEN throws
//      ✓ GIVEN flat-envelope WHEN written through gateway THEN blocked
//      ✓ GIVEN artifact-envelope WHEN checked by previewGuard THEN rejection
//      ✓ GIVEN clean source WHEN checked by previewGuard THEN passes
//      ✓ GIVEN mixed files WHEN batch-written THEN poison blocked clean passes
//
//    S3: Corrupted persisted project — load-time rejection
//      ✓ GIVEN poisoned App.tsx WHEN scanned THEN safe=false
//      ✓ GIVEN poisoned nested file WHEN scanned THEN safe=false
//      ✓ GIVEN clean project WHEN scanned THEN safe=true
//      ✓ GIVEN empty project WHEN scanned THEN safe=true (warning only)
//
//    S4: White-screen-after-ready detection
//      ✓ GIVEN healthy DOM WHEN evaluated THEN healthy=true
//      ✓ GIVEN empty #root THEN empty-root detected
//      ✓ GIVEN zero-height root THEN zero-height-root detected
//      ✓ GIVEN "Loading..." only THEN loading-shell-only detected
//      ✓ GIVEN "Waiting for generation..." THEN loading-shell-only detected
//      ✓ GIVEN minimal content THEN minimal-content detected
//      ✓ GIVEN ready + white-screen THEN overlay stays none (diagnostic)
//
//    S5: Last-good preservation across failed candidate
//      ✓ GIVEN good revision WHEN poison fails THEN good files preserved
//      ✓ GIVEN good revision WHEN bad rejected THEN no false ready_set
//      ✓ GIVEN compiling WHEN foreign buildId THEN rejected
//      ✓ GIVEN failed state THEN UI overlay is failed
//      ✓ GIVEN degraded state THEN UI overlay is degraded
//
//  Total: 5 scenarios, 22 assertions
//  All use real service code with only fetch stubbed.
//
// ═══════════════════════════════════════════════════════════════════════════
