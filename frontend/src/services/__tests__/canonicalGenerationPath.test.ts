/**
 * Session 14.1 — Canonical generation path tests.
 *
 * Verifies that:
 *   1. Live generation no longer calls any legacy preview bridge endpoint
 *      (__health_preview, __read_all_preview, __read_preview, __clear_preview)
 *   2. Generation still reaches the canonical pipeline:
 *      claimPreviewOwnership → createCandidate → compileCandidate → promote
 *   3. Theme bridge drift (missing themes/*.css) does not block or contaminate
 *      live generation
 *   4. Sessions 13.1–13.4 protections still hold after bridge excision:
 *      - claimPreviewOwnership before createCandidate (13.1)
 *      - releasePreviewOwnership on all terminal paths (13.1)
 *      - stale preloads blocked while generation owns preview (13.1)
 *      - truthful non-blank promotion guard intact (13.2)
 */

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// ── LLM proxy stub — must be at top level ──────────────────────────────────
vi.mock('../LLMProxy', () => ({
  llmFetchStream: vi.fn(async () => ''),
  llmFetch:       vi.fn(async () => ''),
}));

import { llmFetchStream } from '../LLMProxy';
import { PRELOAD_SKIP_OWNED_MSG, revisionManager } from '../RevisionManager';
import { previewController, clearTimelineContext } from '../PreviewController';
import * as WhiteScreenDetectorModule from '../WhiteScreenDetector';
import { cancelPendingCheck, cancelPostPromotionWatch } from '../WhiteScreenDetector';
import { SimpleGeneration } from '../SimpleGeneration';
import type { PipelineRunConfig } from '../SimpleGeneration';
import type { AgentExecutionRoute } from '../buildAgentRouting';

// ── Helpers ────────────────────────────────────────────────────────────────

function captureTimelineEvents() {
  const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].startsWith('[preview-timeline] ')) {
      events.push({
        event:   args[0].slice('[preview-timeline] '.length),
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

const MINIMAL_PLAN = {
  appName:     'Test App',
  description: 'Integration test',
  theme:       'dark-slate',
  layout:      { type: 'single-page', navigation: 'none' },
  pages:       [{ path: '/', name: 'Home', file: 'App.tsx', purpose: 'main', isMainScreen: true }],
  shadcnComponents: [] as string[],
  icons:            [] as string[],
};

const DUMMY_ROUTE: AgentExecutionRoute = {
  slot:      'primary',
  provider:  'openrouter',
  modelId:   'test-model',
  endpoint:  'https://openrouter.ai/api/v1/chat/completions',
  apiKey:    'sk-test-key',
  keySource: 'test.agent_primary.openrouter',
  reason:    'test',
};

const SIMPLE_ARTIFACT = JSON.stringify({
  artifact: {
    entry: 'src/App.tsx',
    files: [{
      path:    'src/App.tsx',
      content: 'export default function App() { return <main>Test</main>; }',
    }],
  },
});

function makeConfig(overrides: Partial<PipelineRunConfig> = {}): PipelineRunConfig {
  return {
    intent:        'Build a test app',
    history:       [],
    files:         {},
    primaryRoute:  DUMMY_ROUTE,
    buildRoute:    { ...DUMMY_ROUTE, slot: 'build' },
    apiKey:        'sk-test-key',
    modelId:       'test-model',
    onStream:      () => {},
    onFiles:       () => {},
    onPhase:       () => {},
    onLog:         () => {},
    onPlan:        () => {},
    prebuiltPlan:  MINIMAL_PLAN,
    singlePageSafeMode:      true,   // force NEW mode (no existing files)
    waitForConfirmation: async () => false, // cancel at plan review by default
    ...overrides,
  } as PipelineRunConfig;
}

/** Queue LLM responses sufficient to reach the compile step. */
function queueRunToCompile() {
  vi.mocked(llmFetchStream)
    .mockResolvedValueOnce(makeStreamingResponse('{"technicalBlueprint":{"stack":["react"]}}'))
    .mockResolvedValueOnce(makeStreamingResponse(SIMPLE_ARTIFACT));
}

// ── Setup / teardown ───────────────────────────────────────────────────────

let calledUrls: string[] = [];

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  clearTimelineContext();
  previewController.reset();
  cancelPendingCheck();
  cancelPostPromotionWatch();
  calledUrls = [];

  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calledUrls.push(String(url));
    return { ok: true, status: 200, json: async () => ({ success: true }) };
  }));
});

afterEach(() => {
  cancelPendingCheck();
  cancelPostPromotionWatch();
  clearTimelineContext();
  previewController.reset();
  // Restore all spies/mocks BEFORE calling releasePreviewOwnership so the
  // cleanup call is never counted by a spy set up in the test body.
  vi.useRealTimers();
  vi.restoreAllMocks();
  revisionManager.releasePreviewOwnership();
});

// ── Tests: legacy bridge endpoints not called ──────────────────────────────

describe('Session 14.1 — legacy bridge endpoints removed from live generation', () => {
  test('__health_preview is not called during generation', async () => {
    await SimpleGeneration.run(makeConfig());
    expect(calledUrls.some(u => u.includes('__health_preview'))).toBe(false);
  });

  test('__read_all_preview is not called during generation', async () => {
    await SimpleGeneration.run(makeConfig());
    expect(calledUrls.some(u => u.includes('__read_all_preview'))).toBe(false);
  });

  test('__read_preview is not called during generation (includes theme path)', async () => {
    await SimpleGeneration.run(makeConfig());
    expect(calledUrls.some(u => u.includes('__read_preview'))).toBe(false);
  });

  test('__clear_preview is not called during generation', async () => {
    await SimpleGeneration.run(makeConfig());
    expect(calledUrls.some(u => u.includes('__clear_preview'))).toBe(false);
  });

  test('cancellation at plan confirmation calls no legacy bridge endpoints', async () => {
    await SimpleGeneration.run(makeConfig({ waitForConfirmation: async () => false }));
    const bridgeCalls = calledUrls.filter(u =>
      u.includes('__health_preview') ||
      u.includes('__read_all_preview') ||
      u.includes('__read_preview') ||
      u.includes('__clear_preview')
    );
    expect(bridgeCalls).toHaveLength(0);
  });

  test('no legacy bridge calls even when config.files has content (replaces __read_all_preview)', async () => {
    // Use NEW mode (singlePageSafeMode:true default) but with files in config to verify
    // that config.files → existingFiles substitution itself produces no bridge calls.
    // EDIT mode would reach the LLM before cancellation; stay in NEW mode for this check.
    await SimpleGeneration.run(makeConfig({
      files: { 'App.tsx': 'export default function App() { return <div>Existing</div>; }' },
      singlePageSafeMode: true,   // stays NEW mode so prebuiltPlan cancels quickly
    }));
    const bridgeCalls = calledUrls.filter(u =>
      u.includes('__health_preview') ||
      u.includes('__read_all_preview') ||
      u.includes('__read_preview') ||
      u.includes('__clear_preview')
    );
    expect(bridgeCalls).toHaveLength(0);
  });
});

// ── Tests: theme bridge drift does not contaminate generation ──────────────

describe('Session 14.1 — theme bridge drift does not block generation', () => {
  test('generation with a named theme reaches a terminal state without bridge read', async () => {
    const result = await SimpleGeneration.run(makeConfig({
      prebuiltPlan: { ...MINIMAL_PLAN, theme: 'dark-slate' },
    }));
    // Cancelled at plan confirmation — not failed from a missing theme file
    expect(result.status).toBe('cancelled');
    expect(calledUrls.some(u => u.includes('themes'))).toBe(false);
  });

  test('__read_preview is not called with any theme path variant', async () => {
    for (const theme of ['dark-slate', 'trust', 'warm', 'neon', 'bloom']) {
      calledUrls = [];
      await SimpleGeneration.run(makeConfig({ prebuiltPlan: { ...MINIMAL_PLAN, theme } }));
      expect(calledUrls.some(u => u.includes('__read_preview'))).toBe(false);
    }
  }, 30_000);
});

// ── Tests: canonical pipeline still reached ────────────────────────────────

describe('Session 14.1 — canonical pipeline reached after bridge excision', () => {
  test('claimPreviewOwnership and createCandidate are still called', async () => {
    const claimSpy  = vi.spyOn(revisionManager, 'claimPreviewOwnership');
    const createSpy = vi.spyOn(revisionManager, 'createCandidate');

    await SimpleGeneration.run(makeConfig());

    expect(claimSpy).toHaveBeenCalledWith('SimpleGeneration.run');
    expect(createSpy).toHaveBeenCalled();
    // claim MUST precede createCandidate
    expect(claimSpy.mock.invocationCallOrder[0]).toBeLessThan(createSpy.mock.invocationCallOrder[0]);
  });

  test('compileCandidate and promote are reached when waitForConfirmation returns true', async () => {
    queueRunToCompile();
    const compileSpy = vi.spyOn(revisionManager, 'compileCandidate').mockResolvedValue({
      success: true, _compiled: true,
    });
    vi.spyOn(WhiteScreenDetectorModule, 'runFinalLivePreviewCheck').mockResolvedValue({
      buildId:             'test-build',
      status:              'passed',
      reason:              null,
      message:             'Final live-preview checks passed',
      controllerStatus:    'ready',
      controllerRevisionId: 'test-build',
      immediateBlank:      false,
      probeOutcome:        'healthy',
      probeReason:         null,
    });
    const promoteSpy = vi.spyOn(revisionManager, 'promote').mockResolvedValue(undefined);

    const result = await SimpleGeneration.run(makeConfig({
      waitForConfirmation: async () => true,
    }));

    expect(result.status).toBe('complete');
    expect(compileSpy).toHaveBeenCalled();
    expect(promoteSpy).toHaveBeenCalled();
  });
});

// ── Tests: canonical path log events emitted ──────────────────────────────

describe('Session 14.1 — canonical path log events', () => {
  test('canonical_generation_path_selected is emitted', async () => {
    const events = captureTimelineEvents();
    await SimpleGeneration.run(makeConfig());
    expect(events.some(e => e.event === 'canonical_generation_path_selected')).toBe(true);
  });

  test('legacy_preview_bridge_bypassed is emitted (for __read_all_preview)', async () => {
    const events = captureTimelineEvents();
    await SimpleGeneration.run(makeConfig());
    expect(events.some(e =>
      e.event === 'legacy_preview_bridge_bypassed' &&
      (e.payload.endpoint as string) === '__read_all_preview',
    )).toBe(true);
  });

  test('generation_path_unified is emitted in NEW mode', async () => {
    queueRunToCompile();
    vi.spyOn(revisionManager, 'compileCandidate').mockResolvedValue({ success: true, _compiled: true });
    vi.spyOn(WhiteScreenDetectorModule, 'runFinalLivePreviewCheck').mockResolvedValue({
      buildId: 'test-build', status: 'passed', reason: null,
      message: 'ok', controllerStatus: 'ready', controllerRevisionId: 'test-build',
      immediateBlank: false, probeOutcome: 'healthy', probeReason: null,
    });
    vi.spyOn(revisionManager, 'promote').mockResolvedValue(undefined);

    const events = captureTimelineEvents();
    await SimpleGeneration.run(makeConfig({ waitForConfirmation: async () => true }));
    expect(events.some(e => e.event === 'generation_path_unified')).toBe(true);
  });

  test('legacy_theme_bridge_bypassed is emitted in NEW mode (reaching theme step)', async () => {
    queueRunToCompile();
    vi.spyOn(revisionManager, 'compileCandidate').mockResolvedValue({ success: true, _compiled: true });
    vi.spyOn(WhiteScreenDetectorModule, 'runFinalLivePreviewCheck').mockResolvedValue({
      buildId: 'test-build', status: 'passed', reason: null,
      message: 'ok', controllerStatus: 'ready', controllerRevisionId: 'test-build',
      immediateBlank: false, probeOutcome: 'healthy', probeReason: null,
    });
    vi.spyOn(revisionManager, 'promote').mockResolvedValue(undefined);

    const events = captureTimelineEvents();
    const result = await SimpleGeneration.run(makeConfig({ waitForConfirmation: async () => true }));
    expect(result.status).toBe('complete');
    expect(events.some(e => e.event === 'legacy_theme_bridge_bypassed')).toBe(true);
  });
});

// ── Tests: Sessions 13.1–13.4 protections intact ──────────────────────────

describe('Session 14.1 — Sessions 13.1–13.4 protections survive bridge excision', () => {
  test('13.1 — releasePreviewOwnership called on cancellation terminal path', async () => {
    const releaseSpy = vi.spyOn(revisionManager, 'releasePreviewOwnership');
    const result = await SimpleGeneration.run(makeConfig({ waitForConfirmation: async () => false }));
    expect(result.status).toBe('cancelled');
    expect(releaseSpy).toHaveBeenCalledTimes(1);
  });

  test('13.1 — releasePreviewOwnership called on successful complete path', async () => {
    queueRunToCompile();
    vi.spyOn(revisionManager, 'compileCandidate').mockResolvedValue({ success: true, _compiled: true });
    vi.spyOn(WhiteScreenDetectorModule, 'runFinalLivePreviewCheck').mockResolvedValue({
      buildId: 'test-build', status: 'passed', reason: null,
      message: 'ok', controllerStatus: 'ready', controllerRevisionId: 'test-build',
      immediateBlank: false, probeOutcome: 'healthy', probeReason: null,
    });
    vi.spyOn(revisionManager, 'promote').mockResolvedValue(undefined);
    const releaseSpy = vi.spyOn(revisionManager, 'releasePreviewOwnership');

    const result = await SimpleGeneration.run(makeConfig({ waitForConfirmation: async () => true }));
    expect(result.status).toBe('complete');
    expect(releaseSpy).toHaveBeenCalledTimes(1);
  });

  test('13.1 — stale preload is blocked while generation holds ownership', async () => {
    const events = captureTimelineEvents();
    let blockedDuringGeneration = false;

    const origClaim = revisionManager.claimPreviewOwnership.bind(revisionManager);
    vi.spyOn(revisionManager, 'claimPreviewOwnership').mockImplementationOnce((src) => {
      origClaim(src);
      revisionManager.materializePersistedFiles(
        { 'App.tsx': 'export default function App() { return <div>Stale</div>; }' },
        { source: 'test_stale_preload', projectId: 'proj-stale' },
      ).catch((err: Error) => {
        if (err.message.includes(PRELOAD_SKIP_OWNED_MSG)) blockedDuringGeneration = true;
      });
    });

    await SimpleGeneration.run(makeConfig());
    expect(blockedDuringGeneration).toBe(true);
    expect(events.some(e =>
      e.event === 'preload_skipped_stale_project' &&
      e.payload.reason === 'generation_owns_preview',
    )).toBe(true);
  });

  test('13.2 — truthful non-blank promotion: promote is not called when final check fails', async () => {
    queueRunToCompile();
    vi.spyOn(revisionManager, 'compileCandidate').mockResolvedValue({ success: true, _compiled: true });
    vi.spyOn(WhiteScreenDetectorModule, 'runFinalLivePreviewCheck').mockResolvedValue({
      buildId:             'test-build',
      status:              'failed',
      reason:              'blank_iframe',
      message:             'Final live-preview check failed: preview is blank after boot',
      controllerStatus:    'ready',
      controllerRevisionId: 'test-build',
      immediateBlank:      true,
      probeOutcome:        'inconclusive',
      probeReason:         null,
    });
    vi.spyOn(revisionManager, 'rollback').mockResolvedValue(undefined);
    const promoteSpy = vi.spyOn(revisionManager, 'promote');

    const result = await SimpleGeneration.run(makeConfig({ waitForConfirmation: async () => true }));
    expect(result.status).toBe('failed');
    expect(promoteSpy).not.toHaveBeenCalled();
  });
});
