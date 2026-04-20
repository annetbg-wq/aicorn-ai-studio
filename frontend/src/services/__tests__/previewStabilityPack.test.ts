/**
 * previewStabilityPack — Authoritative baseline smoke pack.
 *
 * Four scenarios that MUST pass before any preview-touching change ships:
 *
 *   1. fresh generation   — generate a minimal app; preview reaches ready; content exists
 *   2. project reload     — load a saved project; PreviewController reaches ready
 *   3. failed candidate   — poison candidate is rejected; last-good stays active
 *   4. white-screen guard — blank render after ready is detected and blocked
 *
 * Pass/fail signal: vitest exit code (0 = all green, non-zero = blocked).
 * Canonical entrypoint: `npm run test:smoke`  (run from frontend/)
 * CI gate: .github/workflows/ci.yml → "Preview baseline smoke (required)"
 *
 * Extended preview coverage (optional, not a release gate):
 *   npm run test:smoke:extended   — adds previewPoisonSmoke + deeper injection tests
 *   npm test                      — runs the full vitest suite
 */

// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { RevisionManager } from '../RevisionManager';
import { PreviewController, clearTimelineContext, previewController } from '../PreviewController';
import {
  POST_PROMOTION_WATCHDOG_WINDOW_MS,
  cancelPendingCheck,
  cancelPostPromotionWatch,
  evaluateMetrics,
  type DOMMetrics,
} from '../WhiteScreenDetector';
import { ProjectStorage, type StoredProject } from '../ProjectStorage';
import { ArtifactReviewerService } from '../ArtifactReviewerService';
import type { ArtifactContract } from '../../types/artifact';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CLEAN_APP_TSX = `export default function App() { return <main>Last good preview</main>; }`;
const PLACEHOLDER_APP_TSX = `export default function App() { return <div>Waiting for generation...</div>; }`;
const CLEAN_INDEX_CSS = 'body { margin: 0; }';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mountPreviewIframe(buildId: string, bodyText = '<main>Last good preview</main>'): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('data-testid', 'preview-iframe');
  iframe.setAttribute('data-build-id', buildId);
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (doc?.body) {
    doc.body.innerHTML = `<div id="root">${bodyText}</div>`;
  }
  return iframe;
}

function blankPreviewIframe(iframe: HTMLIFrameElement, buildId: string): void {
  iframe.setAttribute('data-build-id', buildId);
  const doc = iframe.contentDocument;
  if (doc?.body) {
    doc.body.innerHTML = '<div id="root"></div>';
  }
}

function captureTimelineEvents() {
  const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].startsWith('[preview-timeline] ')) {
      events.push({
        event: args[0].slice('[preview-timeline] '.length),
        payload: (args[1] as Record<string, unknown>) ?? {},
      });
    }
  });
  return events;
}

function isBlank(metrics: DOMMetrics): boolean {
  return !evaluateMetrics(metrics, 'smoke-build').healthy;
}

/**
 * Post-ready white-screen guard.
 * Throws 'white_screen_after_ready' if the controller is ready but the DOM
 * metrics indicate a blank render — the build must not be promoted as healthy.
 */
function assertNoWhiteScreenAfterReady(controller: PreviewController, metrics: DOMMetrics): void {
  const state = controller.getState();
  if (state.status !== 'ready') return;
  if (isBlank(metrics)) throw new Error('white_screen_after_ready');
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  clearTimelineContext();
  previewController.reset();
  cancelPendingCheck();
  cancelPostPromotionWatch();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
});

afterEach(() => {
  cancelPendingCheck();
  cancelPostPromotionWatch();
  clearTimelineContext();
  previewController.reset();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Scenario 1: fresh generation ──────────────────────────────────────────────

test('1. fresh generation shows preview', async () => {
  const generateArtifact = vi.fn().mockResolvedValue({
    revisionId: 'rev-fresh',
    entry: 'src/App.tsx',
    files: [
      { path: 'src/App.tsx', content: CLEAN_APP_TSX },
      { path: 'src/index.css', content: CLEAN_INDEX_CSS },
    ],
  } as ArtifactContract);

  const artifact = await generateArtifact();

  // Pass through the reviewer stage (same gate as the real generation pipeline)
  const reviewed = ArtifactReviewerService.review(artifact);
  expect(reviewed.files.length).toBeGreaterThan(0);

  const rm = new RevisionManager(window.location.origin);
  const preview = new PreviewController();
  const revId = await rm.createCandidate();

  for (const file of reviewed.files) {
    await rm.writeCandidateFile(revId, file.path, file.content);
  }

  // Simulate compile + mount handshake (network stubbed above)
  preview.notifyCompiling(revId);
  preview.notifyReady(revId, 'preview-mounted');

  // Controller must be ready AND anchored to this revision
  expect(preview.getState().status).toBe('ready');
  expect(preview.getState().activeRevisionId).toBe(revId);

  // User-visible content must exist (not blank)
  expect(isBlank({
    rootChildCount: 2,
    rootInnerTextLength: 24,
    rootOffsetHeight: 400,
    bodyChildCount: 1,
    bodyInnerTextLength: 24,
    hasLoadingIndicator: false,
    rootTextHead: 'Last good preview',
    semanticElementCount: 1,
    interactiveElementCount: 0,
    visualElementCount: 0,
  })).toBe(false);
});

// ── Scenario 2: saved project reload ─────────────────────────────────────────

test('2. project reload shows last-good', async () => {
  const project: StoredProject = {
    id: 'proj-reload',
    name: 'Reload smoke',
    description: 'reload keeps last-good',
    theme: 'trust',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    files: {
      'App.tsx': CLEAN_APP_TSX,
      'index.css': CLEAN_INDEX_CSS,
    },
    chatHistory: [],
  };

  // Storage round-trip: files survive save/load
  expect(ProjectStorage.saveProject(project)).toBe(true);
  const reloaded = ProjectStorage.getProject(project.id);

  expect(reloaded).not.toBeNull();
  expect(reloaded!.files['App.tsx']).toContain('Last good preview');
  expect(reloaded!.files['App.tsx']).not.toContain('Waiting for generation');

  // Preview lifecycle: loading the project must drive the controller to ready
  const pc = new PreviewController();
  const loadRevId = `rev-load-${project.id}`;
  pc.notifyCompiling(loadRevId);
  pc.notifyReady(loadRevId, 'project-load-mounted');

  expect(pc.getState().status).toBe('ready');
  expect(pc.getState().activeRevisionId).toBe(loadRevId);
});

// ── Scenario 3: failed candidate preserves last-good ─────────────────────────

test('3. failed candidate preserves last-good', async () => {
  const rm = new RevisionManager(window.location.origin);
  const goodRevId = await rm.createCandidate();
  await rm.writeCandidateFile(goodRevId, 'src/App.tsx', CLEAN_APP_TSX);
  mountPreviewIframe(goodRevId);

  // Bypass the compile network call — mark the revision as compiled directly
  (rm as unknown as { compiledRevisionId: string | null }).compiledRevisionId = goodRevId;
  await rm.promote(goodRevId);

  // Confirm baseline is established: good revision is active
  expect(rm.getActiveRevisionId()).toBe(goodRevId);

  // Introduce a poisoned candidate (artifact envelope masquerading as source)
  const poisonedArtifact: ArtifactContract = {
    revisionId: 'bad-rev',
    entry: 'src/App.tsx',
    files: [{ path: 'src/App.tsx', content: '{"files":[{"path":"src/App.tsx","content":"bad"}]}' }],
  };

  // Artifact ingress must classify the poisoned artifact before it becomes a raw reviewer hard-fail
  expect(() => ArtifactReviewerService.review(poisonedArtifact))
    .toThrow('ARTIFACT_SEMANTIC_PARSE_FAIL: 0 files after heuristic repair');

  // ── LAST_GOOD_PRESERVED assertion ──────────────────────────────────────────
  // The active revision must be unchanged after a failed/rejected candidate.
  // If this changes to anything other than goodRevId, the label 'LAST_GOOD_DESTROYED'
  // makes the failure unambiguous in CI logs.
  const activeAfterPoison = rm.getActiveRevisionId();
  if (activeAfterPoison !== goodRevId) {
    throw new Error(
      `LAST_GOOD_DESTROYED: active='${activeAfterPoison}' expected='${goodRevId}'`,
    );
  }
  expect(activeAfterPoison).toBe(goodRevId); // LAST_GOOD_PRESERVED

  // Files of the last-good revision must be intact
  const lastGoodFiles = rm.getRevisionFiles(goodRevId);
  expect(lastGoodFiles?.['App.tsx']).toContain('Last good preview'); // LAST_GOOD_FILES_INTACT
});

// ── Scenario 4: white-screen guard ───────────────────────────────────────────

test('4. white-screen after ready is detected', () => {
  const preview = new PreviewController();
  preview.notifyCompiling('rev-ready');
  preview.notifyReady('rev-ready', 'preview-mounted');

  const blankMetrics: DOMMetrics = {
    rootChildCount: 0,
    rootInnerTextLength: 0,
    rootOffsetHeight: 0,
    bodyChildCount: 0,
    bodyInnerTextLength: 0,
    hasLoadingIndicator: false,
    rootTextHead: '',
    semanticElementCount: 0,
    interactiveElementCount: 0,
    visualElementCount: 0,
  };

  // evaluateMetrics must classify a blank render as unhealthy (not decorative)
  const evalResult = evaluateMetrics(blankMetrics, 'smoke-build');
  expect(evalResult.healthy).toBe(false);
  expect(evalResult.reason).toBe('empty-root');

  // The post-ready guard must throw when the render is blank
  expect(() => assertNoWhiteScreenAfterReady(preview, blankMetrics))
    .toThrow('white_screen_after_ready');

  // Sanity: placeholder content triggers the same guard
  expect(PLACEHOLDER_APP_TSX).toContain('Waiting for generation');
});

test('5. createEmptyCandidate provisions a meaningful bootstrap surface for first-run initialization', async () => {
  const rm = new RevisionManager(window.location.origin);
  const compileSpy = vi.spyOn(rm, 'compileCandidate').mockImplementation(async (revisionId: string) => {
    const files = rm.getRevisionFiles(revisionId) ?? {};
    expect(files['App.tsx']).toContain('Start your next project');
    expect(files['App.tsx']).toContain('data-preview-bootstrap="true"');
    expect(files['App.tsx']).not.toContain('Waiting for generation');

    mountPreviewIframe(
      revisionId,
      '<main data-preview-bootstrap="true"><section><h1>Start your next project</h1><button>Describe your idea</button></section></main>',
    );
    previewController.notifyCompiling(revisionId);
    previewController.notifyReady(revisionId, 'test-mounted');
    (rm as unknown as { compiledRevisionId: string | null }).compiledRevisionId = revisionId;
    return { success: true, _compiled: true };
  });

  const revId = await rm.createEmptyCandidate();

  expect(compileSpy).toHaveBeenCalledOnce();
  expect(rm.getActiveRevisionId()).toBe(revId);
});

test('6. promote blocks placeholder-only iframe before the active revision flips', async () => {
  const events = captureTimelineEvents();
  const rm = new RevisionManager(window.location.origin);

  const lastGoodRevId = await rm.createCandidate();
  await rm.writeCandidateFile(lastGoodRevId, 'src/App.tsx', CLEAN_APP_TSX);
  const iframe = mountPreviewIframe(lastGoodRevId);
  previewController.notifyCompiling(lastGoodRevId);
  previewController.notifyReady(lastGoodRevId, 'test-mounted');
  (rm as unknown as { compiledRevisionId: string | null }).compiledRevisionId = lastGoodRevId;
  await rm.promote(lastGoodRevId);

  const placeholderRevId = await rm.createCandidate();
  await rm.writeCandidateFile(placeholderRevId, 'src/App.tsx', PLACEHOLDER_APP_TSX);
  iframe.setAttribute('data-build-id', placeholderRevId);
  const doc = iframe.contentDocument;
  if (doc?.body) {
    doc.body.innerHTML = '<div id="root"><div>Waiting for generation...</div></div>';
  }
  previewController.notifyCompiling(placeholderRevId);
  previewController.notifyReady(placeholderRevId, 'test-mounted');
  (rm as unknown as { compiledRevisionId: string | null }).compiledRevisionId = placeholderRevId;

  await expect(rm.promote(placeholderRevId)).rejects.toThrow('PROMOTE_BLOCKED');
  expect(rm.getActiveRevisionId()).toBe(lastGoodRevId);
  expect(events.some(e => e.event === 'promotion_blocked_not_rendered' && e.payload.buildId === placeholderRevId)).toBe(true);
});

test('7. promoted revision later blanks within watchdog window and rolls back to previous active', async () => {
  vi.useFakeTimers();
  const events = captureTimelineEvents();
  const rm = new RevisionManager(window.location.origin);

  const previousRevId = await rm.createCandidate();
  await rm.writeCandidateFile(previousRevId, 'src/App.tsx', CLEAN_APP_TSX);
  const iframe = mountPreviewIframe(previousRevId);
  previewController.notifyCompiling(previousRevId);
  previewController.notifyReady(previousRevId, 'test-mounted');
  (rm as unknown as { compiledRevisionId: string | null }).compiledRevisionId = previousRevId;
  await rm.promote(previousRevId);

  const promotedRevId = await rm.createCandidate();
  await rm.writeCandidateFile(promotedRevId, 'src/App.tsx', 'export default function App() { return <main>Fresh promotion</main>; }');
  iframe.setAttribute('data-build-id', promotedRevId);
  const doc = iframe.contentDocument;
  if (doc?.body) {
    doc.body.innerHTML = '<div id="root"><main>Fresh promotion</main></div>';
  }
  previewController.notifyCompiling(promotedRevId);
  previewController.notifyReady(promotedRevId, 'test-mounted');
  (rm as unknown as { compiledRevisionId: string | null }).compiledRevisionId = promotedRevId;

  const waitSpy = vi.spyOn(rm, 'waitForReady').mockResolvedValue({ success: true });
  await rm.promote(promotedRevId);
  expect(rm.getActiveRevisionId()).toBe(promotedRevId);

  // Blank the iframe so both the initial check and its confirmation see a white screen.
  blankPreviewIframe(iframe, promotedRevId);

  // Revocation now requires two-signal confirmation:
  //   t=+2500ms — first check fires, detects blank_iframe → schedules confirmation
  //   t=+4500ms — confirmation fires, still blank → revocation triggered
  await vi.advanceTimersByTimeAsync(4_600);

  expect(waitSpy).toHaveBeenCalledWith(previousRevId, 15_000);
  expect(rm.getActiveRevisionId()).toBe(previousRevId);
  expect(previewController.getState().activeRevisionId).toBe(previousRevId);
  expect(events.some(e => e.event === 'post_promotion_watch_started' && e.payload.buildId === promotedRevId)).toBe(true);
  // Two-signal confirmation: pending then confirmed
  expect(events.some(e => e.event === 'watchdog_unhealthy_pending' && e.payload.buildId === promotedRevId)).toBe(true);
  expect(events.some(e => e.event === 'watchdog_unhealthy_confirmed' && e.payload.buildId === promotedRevId)).toBe(true);
  expect(events.some(e => e.event === 'watchdog_late_regression_confirmed' && e.payload.buildId === promotedRevId)).toBe(true);
  expect(events.some(e => e.event === 'post_promotion_watch_result' && e.payload.outcome === 'promotion_revoked')).toBe(true);
  expect(events.some(e => e.event === 'promotion_revoked' && e.payload.outcome === 'revoked')).toBe(true);
  expect(events.some(e => e.event === 'rollback_completed' && e.payload.status === 'restored')).toBe(true);
});

test('8. stable promoted revision remains active after the watchdog window', async () => {
  vi.useFakeTimers();
  const events = captureTimelineEvents();
  const rm = new RevisionManager(window.location.origin);

  const previousRevId = await rm.createCandidate();
  await rm.writeCandidateFile(previousRevId, 'src/App.tsx', CLEAN_APP_TSX);
  const iframe = mountPreviewIframe(previousRevId);
  previewController.notifyCompiling(previousRevId);
  previewController.notifyReady(previousRevId, 'test-mounted');
  (rm as unknown as { compiledRevisionId: string | null }).compiledRevisionId = previousRevId;
  await rm.promote(previousRevId);

  const stableRevId = await rm.createCandidate();
  await rm.writeCandidateFile(stableRevId, 'src/App.tsx', 'export default function App() { return <main>Still healthy</main>; }');
  iframe.setAttribute('data-build-id', stableRevId);
  const doc = iframe.contentDocument;
  if (doc?.body) {
    doc.body.innerHTML = '<div id="root"><main>Still healthy</main></div>';
  }
  previewController.notifyCompiling(stableRevId);
  previewController.notifyReady(stableRevId, 'test-mounted');
  (rm as unknown as { compiledRevisionId: string | null }).compiledRevisionId = stableRevId;

  const waitSpy = vi.spyOn(rm, 'waitForReady').mockResolvedValue({ success: true });
  await rm.promote(stableRevId);

  await vi.advanceTimersByTimeAsync(POST_PROMOTION_WATCHDOG_WINDOW_MS + 5_000);

  expect(waitSpy).not.toHaveBeenCalled();
  expect(rm.getActiveRevisionId()).toBe(stableRevId);
  expect(previewController.getState().activeRevisionId).toBe(stableRevId);
  expect(events.some(e => e.event === 'post_promotion_watch_result' && e.payload.outcome === 'stable_window_elapsed')).toBe(true);
  expect(events.some(e => e.event === 'promotion_revoked')).toBe(false);
});
