/**
 * generationOwnership — Integration tests for preview ownership wiring in the
 * real SimpleGeneration.run() production path (Session 13.1).
 *
 * Verifies that:
 *   1. SimpleGeneration.run() calls claimPreviewOwnership before createCandidate
 *   2. A concurrent stale preload is blocked while run() holds ownership
 *   3. releasePreviewOwnership is called on all terminal paths (cancel / fail / success)
 *   4. Fresh candidate preview survives preload noise injected during generation
 *
 * Uses vi.mock for the LLM layer so no real network calls are made.
 * Uses prebuiltPlan + waitForConfirmation:false to reach the cancellation
 * terminal path with minimal infrastructure mock surface.
 */

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// ── LLM proxy stub — must be at top level ─────────────────────────────────────
// Prevents real network calls; returns empty string for all LLM requests.
vi.mock('../LLMProxy', () => ({
  llmFetchStream: vi.fn(async () => ''),
  llmFetch: vi.fn(async () => ''),
}));

import { llmFetchStream } from '../LLMProxy';
import { PRELOAD_SKIP_OWNED_MSG, revisionManager } from '../RevisionManager';
import { previewController, clearTimelineContext } from '../PreviewController';
import * as WhiteScreenDetectorModule from '../WhiteScreenDetector';
import { cancelPendingCheck, cancelPostPromotionWatch } from '../WhiteScreenDetector';
import { SimpleGeneration } from '../SimpleGeneration';
import type { PipelineRunConfig } from '../SimpleGeneration';
import type { AgentExecutionRoute } from '../buildAgentRouting';

// ── Helpers ───────────────────────────────────────────────────────────────────

function captureTimeline() {
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

function makeStreamingResponse(text: string): Response {
  const stream = new ReadableStream({
    start(controller) {
      const payload =
        `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n` +
        'data: [DONE]\n';
      controller.enqueue(new TextEncoder().encode(payload));
      controller.close();
    },
  });
  return new Response(stream);
}

/** Minimal prebuilt plan that bypasses the architect LLM call. */
const MINIMAL_PLAN = {
  appName: 'Test App',
  description: 'Integration test',
  theme: 'dark',
  layout: { type: 'single-page', navigation: 'none' },
  pages: [{ path: '/', name: 'Home', file: 'App.tsx', purpose: 'main', isMainScreen: true }],
  shadcnComponents: [] as string[],
  icons: [] as string[],
};

/** Dummy resolved route sufficient to pass the route guard. */
const DUMMY_ROUTE: AgentExecutionRoute = {
  slot: 'primary',
  provider: 'openrouter',
  modelId: 'test-model',
  endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  apiKey: 'sk-test-key',
  keySource: 'test.agent_primary.openrouter',
  reason: 'test',
};

const SIMPLE_ARTIFACT_RESPONSE = JSON.stringify({
  artifact: {
    entry: 'src/App.tsx',
    files: [
      {
        path: 'src/App.tsx',
        content: 'export default function App() { return <main>Ownership test</main>; }',
      },
    ],
  },
});

function makeConfig(overrides: Partial<PipelineRunConfig> = {}): PipelineRunConfig {
  return {
    intent: 'Build a test app',
    history: [],
    files: {},
    primaryRoute: DUMMY_ROUTE,
    buildRoute: { ...DUMMY_ROUTE, slot: 'build' },
    apiKey: 'sk-test-key',
    modelId: 'test-model',
    onStream: () => {},
    onFiles: () => {},
    onPhase: () => {},
    onLog: () => {},
    onPlan: () => {},
    prebuiltPlan: MINIMAL_PLAN,
    singlePageSafeMode: true, // force NEW mode (no existing files)
    waitForConfirmation: async () => false, // cancel at plan review
    ...overrides,
  } as PipelineRunConfig;
}

function queueExecutableRunResponses() {
  vi.mocked(llmFetchStream)
    .mockResolvedValueOnce(makeStreamingResponse('{"technicalBlueprint":{"stack":["react"]}}'))
    .mockResolvedValueOnce(makeStreamingResponse(SIMPLE_ARTIFACT_RESPONSE));
}

async function expectPreloadAllowedAfterRun(projectId: string) {
  const createSpy = vi.spyOn(revisionManager, 'createCandidate').mockRejectedValueOnce(
    new Error('test-stop-after-ownership-guard'),
  );
  let blockedByOwnership = false;

  await revisionManager.materializePersistedFiles(
    { 'App.tsx': 'export default function App() { return <div>After</div>; }' },
    { source: 'post_run_preload', projectId },
  ).catch((err: Error) => {
    if (err.message.includes(PRELOAD_SKIP_OWNED_MSG)) {
      blockedByOwnership = true;
    }
  });

  expect(createSpy).toHaveBeenCalled();
  expect(blockedByOwnership).toBe(false);
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  clearTimelineContext();
  previewController.reset();
  cancelPendingCheck();
  cancelPostPromotionWatch();

  // Legacy __health_preview and __read_all_preview bridge stubs removed:
  // SimpleGeneration no longer calls those endpoints (Session 14.1 excision).
  vi.stubGlobal('fetch', vi.fn(async () => {
    // Compile endpoint and any other fetch calls succeed trivially
    return { ok: true, status: 200, json: async () => ({ success: true }) };
  }));
});

afterEach(() => {
  cancelPendingCheck();
  cancelPostPromotionWatch();
  clearTimelineContext();
  previewController.reset();
  // Always release ownership so subsequent tests start clean
  revisionManager.releasePreviewOwnership();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SimpleGeneration.run() preview ownership wiring', () => {
  test('claims preview ownership before createCandidate and emits current_run_preview_isolated', async () => {
    const events = captureTimeline();
    const claimSpy = vi.spyOn(revisionManager, 'claimPreviewOwnership');
    const createSpy = vi.spyOn(revisionManager, 'createCandidate');

    await SimpleGeneration.run(makeConfig());

    // Both should have been called
    expect(claimSpy).toHaveBeenCalledWith('SimpleGeneration.run');
    expect(createSpy).toHaveBeenCalled();

    // Claim must happen BEFORE createCandidate
    const claimOrder  = claimSpy.mock.invocationCallOrder[0];
    const createOrder = createSpy.mock.invocationCallOrder[0];
    expect(claimOrder).toBeLessThan(createOrder);

    // Ownership log event must be emitted
    expect(events.some(e => e.event === 'current_run_preview_isolated')).toBe(true);
  });

  test('releases preview ownership on cancellation terminal path', async () => {
    const releaseSpy = vi.spyOn(revisionManager, 'releasePreviewOwnership');

    // Cancel at plan confirmation (waitForConfirmation: false)
    const result = await SimpleGeneration.run(makeConfig({
      waitForConfirmation: async () => false,
    }));

    expect(result.status).toBe('cancelled');
    expect(releaseSpy).toHaveBeenCalledTimes(1);
    await expectPreloadAllowedAfterRun('proj-after-cancel');
  });

  test('releases preview ownership on terminal success in the real run path', async () => {
    queueExecutableRunResponses();
    vi.spyOn(revisionManager, 'fullClearPreview').mockResolvedValue(undefined);
    vi.spyOn(revisionManager, 'compileCandidate').mockResolvedValue({
      success: true,
      _compiled: true,
    });
    vi.spyOn(WhiteScreenDetectorModule, 'runFinalLivePreviewCheck').mockResolvedValue({
      buildId: 'test-build',
      status: 'passed',
      reason: null,
      message: 'Final live-preview checks passed',
      controllerStatus: 'ready',
      controllerRevisionId: 'test-build',
      immediateBlank: false,
      probeOutcome: 'healthy',
      probeReason: null,
    });
    vi.spyOn(revisionManager, 'promote').mockResolvedValue(undefined);
    const releaseSpy = vi.spyOn(revisionManager, 'releasePreviewOwnership');

    const result = await SimpleGeneration.run(makeConfig({
      waitForConfirmation: async () => true,
    }));

    expect(result.status).toBe('complete');
    expect(releaseSpy).toHaveBeenCalledTimes(1);
    await expectPreloadAllowedAfterRun('proj-after-success');
  });

  test('releases preview ownership on terminal failure in the real run path', async () => {
    queueExecutableRunResponses();
    vi.spyOn(revisionManager, 'fullClearPreview').mockResolvedValue(undefined);
    vi.spyOn(revisionManager, 'compileCandidate').mockResolvedValue({
      success: true,
      _compiled: true,
    });
    vi.spyOn(WhiteScreenDetectorModule, 'runFinalLivePreviewCheck').mockResolvedValue({
      buildId: 'test-build',
      status: 'failed',
      reason: 'blank_iframe',
      message: 'Final live-preview check failed: preview is blank after boot',
      controllerStatus: 'ready',
      controllerRevisionId: 'test-build',
      immediateBlank: true,
      probeOutcome: 'inconclusive',
      probeReason: null,
    });
    vi.spyOn(revisionManager, 'rollback').mockResolvedValue(undefined);
    const releaseSpy = vi.spyOn(revisionManager, 'releasePreviewOwnership');

    const result = await SimpleGeneration.run(makeConfig({
      waitForConfirmation: async () => true,
    }));

    expect(result.status).toBe('failed');
    expect(releaseSpy).toHaveBeenCalledTimes(1);
    await expectPreloadAllowedAfterRun('proj-after-failure');
  });

  test('stale preload is blocked while run() holds ownership — emits preload_skipped_stale_project', async () => {
    const events = captureTimeline();

    // Track when claimPreviewOwnership fires so we can inject the preload attempt
    let preloadAttemptedDuringGeneration = false;
    const origClaim = revisionManager.claimPreviewOwnership.bind(revisionManager);
    vi.spyOn(revisionManager, 'claimPreviewOwnership').mockImplementationOnce(async (src) => {
      origClaim(src);
      // Inject preload attempt immediately after claim — generation now owns preview
      try {
        await revisionManager.materializePersistedFiles(
          { 'App.tsx': 'export default function App() { return <div>Stale</div>; }' },
          { source: 'test_stale_preload', projectId: 'proj-stale' },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes(PRELOAD_SKIP_OWNED_MSG)) {
          preloadAttemptedDuringGeneration = true;
        }
      }
    });

    await SimpleGeneration.run(makeConfig());

    expect(preloadAttemptedDuringGeneration).toBe(true);
    expect(events.some(e =>
      e.event === 'preload_skipped_stale_project' &&
      e.payload.reason === 'generation_owns_preview',
    )).toBe(true);
  });

  test('unexpected throw after claimPreviewOwnership does not leak preview ownership', async () => {
    const releaseSpy = vi.spyOn(revisionManager, 'releasePreviewOwnership');
    vi.spyOn(revisionManager, 'createCandidate').mockRejectedValueOnce(
      new Error('unexpected createCandidate failure'),
    );

    await expect(SimpleGeneration.run(makeConfig())).rejects.toThrow('unexpected createCandidate failure');

    expect(releaseSpy).toHaveBeenCalledTimes(1);
    await expectPreloadAllowedAfterRun('proj-after-unexpected-throw');
  });
});
