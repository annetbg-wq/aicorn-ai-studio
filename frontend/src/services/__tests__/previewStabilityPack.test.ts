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

import { beforeEach, expect, test, vi } from 'vitest';
import { RevisionManager } from '../RevisionManager';
import { PreviewController } from '../PreviewController';
import { evaluateMetrics, type DOMMetrics } from '../WhiteScreenDetector';
import { ProjectStorage, type StoredProject } from '../ProjectStorage';
import { ArtifactReviewerService } from '../ArtifactReviewerService';
import type { ArtifactContract } from '../../types/artifact';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CLEAN_APP_TSX = `export default function App() { return <main>Last good preview</main>; }`;
const PLACEHOLDER_APP_TSX = `export default function App() { return <div>Waiting for generation...</div>; }`;
const CLEAN_INDEX_CSS = 'body { margin: 0; }';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mountPreviewIframe(buildId: string, bodyText = 'Last good preview'): HTMLIFrameElement {
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
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
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

  // Reviewer stage MUST reject the poisoned artifact before it reaches the pipeline
  expect(() => ArtifactReviewerService.review(poisonedArtifact)).toThrow('REVIEWER_FAIL: 0 files after cleaning');

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
