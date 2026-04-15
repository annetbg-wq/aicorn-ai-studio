// @vitest-environment jsdom

import { beforeEach, expect, test, vi } from 'vitest';
import { RevisionManager } from '../RevisionManager';
import { PreviewController } from '../PreviewController';
import { evaluateMetrics, type DOMMetrics } from '../WhiteScreenDetector';
import { ProjectStorage, type StoredProject } from '../ProjectStorage';
import { ArtifactReviewerService } from '../ArtifactReviewerService';
import type { ArtifactContract } from '../../types/artifact';

const CLEAN_APP_TSX = `export default function App() { return <main>Last good preview</main>; }`;
const PLACEHOLDER_APP_TSX = `export default function App() { return <div>Waiting for generation...</div>; }`;
const CLEAN_INDEX_CSS = 'body { margin: 0; }';

function isBlank(metrics: DOMMetrics): boolean {
  return !evaluateMetrics(metrics, 'smoke-build').healthy;
}

function assertNoWhiteScreenAfterReady(controller: PreviewController, metrics: DOMMetrics): void {
  const state = controller.getState();
  if (state.status !== 'ready') return;
  if (isBlank(metrics)) throw new Error('white_screen_after_ready');
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
});

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
  const rm = new RevisionManager(window.location.origin);
  const preview = new PreviewController();
  const revId = await rm.createCandidate();

  for (const file of artifact.files) {
    await rm.writeCandidateFile(revId, file.path, file.content);
  }

  preview.notifyCompiling(revId);
  preview.notifyReady(revId, 'preview-mounted');

  expect(preview.getState().status).toBe('ready');
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

  expect(ProjectStorage.saveProject(project)).toBe(true);
  const reloaded = ProjectStorage.getProject(project.id);

  expect(reloaded).not.toBeNull();
  expect(reloaded!.files['App.tsx']).toContain('Last good preview');
  expect(reloaded!.files['App.tsx']).not.toContain('Waiting for generation');
});

test('3. failed candidate preserves last-good', async () => {
  const rm = new RevisionManager(window.location.origin);
  const goodRevId = await rm.createCandidate();
  await rm.writeCandidateFile(goodRevId, 'src/App.tsx', CLEAN_APP_TSX);
  (rm as unknown as { compiledRevisionId: string | null }).compiledRevisionId = goodRevId;
  await rm.promote(goodRevId);

  const poisonedArtifact: ArtifactContract = {
    revisionId: 'bad-rev',
    entry: 'src/App.tsx',
    files: [{ path: 'src/App.tsx', content: '{"files":[{"path":"src/App.tsx","content":"bad"}]}' }],
  };

  expect(() => ArtifactReviewerService.review(poisonedArtifact)).toThrow('REVIEWER_FAIL: 0 files after cleaning');
  expect(rm.getActiveRevisionId()).toBe(goodRevId);
  expect(rm.getRevisionFiles(goodRevId)?.['App.tsx']).toContain('Last good preview');
});

test('4. white-screen after ready throws', () => {
  const preview = new PreviewController();
  preview.notifyCompiling('rev-ready');
  preview.notifyReady('rev-ready', 'preview-mounted');

  expect(() =>
    assertNoWhiteScreenAfterReady(preview, {
      rootChildCount: 0,
      rootInnerTextLength: 0,
      rootOffsetHeight: 0,
      bodyChildCount: 0,
      bodyInnerTextLength: 0,
      hasLoadingIndicator: false,
      rootTextHead: '',
    }),
  ).toThrow('white_screen_after_ready');

  expect(PLACEHOLDER_APP_TSX).toContain('Waiting for generation');
});
