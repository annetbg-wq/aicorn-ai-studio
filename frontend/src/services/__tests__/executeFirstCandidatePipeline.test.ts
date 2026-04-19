// @vitest-environment jsdom

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentExecutionRoute } from '../buildAgentRouting';
import { clearTimelineContext } from '../PreviewController';
import { ArtifactReviewerService } from '../ArtifactReviewerService';

const llmProxyMock = vi.hoisted(() => ({
  llmFetchStream: vi.fn(),
  llmFetch: vi.fn(),
}));

vi.mock('../LLMProxy', () => llmProxyMock);

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

function makeRoute(slot: AgentExecutionRoute['slot'], modelId: string): AgentExecutionRoute {
  return {
    slot,
    provider: 'openrouter',
    modelId,
    endpoint: `https://example.test/${slot}`,
    apiKey: `${slot}-key`,
    keySource: `test.${slot}`,
    reason: `test ${slot} route`,
  };
}

function makePlan() {
  return {
    appName: 'Execute First App',
    description: 'test plan',
    theme: 'dark-slate',
    layout: { type: 'single', navigation: 'none' },
    pages: [
      {
        path: '/',
        name: 'Home',
        file: 'App.tsx',
        purpose: 'Landing screen',
        isMainScreen: true,
      },
    ],
    shadcnComponents: [],
    icons: [],
  };
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

function resetRevisionManagerSingleton(revisionManager: unknown) {
  const rm = revisionManager as {
    activeRevisionId: string | null;
    candidateRevisionId: string | null;
    compiledRevisionId: string | null;
    store: Map<string, Record<string, string>>;
  };
  rm.activeRevisionId = null;
  rm.candidateRevisionId = null;
  rm.compiledRevisionId = null;
  rm.store = new Map();
}

describe('Execute-first candidate pipeline', () => {
  beforeEach(() => {
    localStorage.clear();
    clearTimelineContext();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (typeof url !== 'string') {
        return Promise.reject(new Error('unexpected non-string fetch url'));
      }
      if (url.includes('__health_preview')) {
        return Promise.resolve({ ok: true });
      }
      if (url.includes('__read_all_preview')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: {} }) });
      }
      if (url.includes('__read_preview?path=themes/')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      if (url.includes('__read_preview?path=')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            ok: true,
            content: 'export default function App() { return <main>Existing preview file</main>; }',
          }),
        });
      }
      if (url.includes('/dev-agent-mode')) {
        return Promise.reject(new Error('dev-agent-mode unavailable in test'));
      }
      return Promise.reject(new Error(`unexpected fetch in test: ${url}`));
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    llmProxyMock.llmFetchStream.mockReset();
    llmProxyMock.llmFetch.mockReset();
  });

  it('materializes the candidate immediately after ingress acceptance and does not run reviewer first', async () => {
    const { SimpleGeneration } = await import('../SimpleGeneration');
    const { revisionManager } = await import('../RevisionManager');
    const { VisualQualityService } = await import('../benchmark/VisualQualityService');

    resetRevisionManagerSingleton(revisionManager);
    const events = captureTimelineEvents();
    const logs: string[] = [];

    const artifact = JSON.stringify({
      artifact: {
        entry: 'src/App.tsx',
        files: [
          {
            path: 'src/Garbage.tsx',
            content: JSON.stringify({
              artifact: {
                entry: 'src/Garbage.tsx',
                files: [{ path: 'src/Garbage.tsx', content: 'broken envelope payload' }],
              },
            }),
          },
          {
            path: 'src/App.tsx',
            content: 'export default function App() { return <main>Execute first</main>; }',
          },
        ],
      },
    });

    llmProxyMock.llmFetchStream
      .mockResolvedValueOnce(makeStreamingResponse('{"technicalBlueprint":{"stack":["react"]}}'))
      .mockResolvedValueOnce(makeStreamingResponse(artifact));

    vi.spyOn(revisionManager, 'fullClearPreview').mockResolvedValue(undefined);
    const materializeSpy = vi.spyOn(revisionManager, 'materializeCandidateFiles');
    const compileSpy = vi.spyOn(revisionManager, 'compileCandidate')
      .mockResolvedValue({ success: true, _compiled: true });
    const promoteSpy = vi.spyOn(revisionManager, 'promote').mockResolvedValue(undefined);
    const reviewerAiSpy = vi.spyOn(ArtifactReviewerService, 'reviewWithAI');
    const reviewerSyncSpy = vi.spyOn(ArtifactReviewerService, 'review');
    vi.spyOn(VisualQualityService, 'evaluate').mockReturnValue({
      verdict: 'acceptable',
      band: 'medium',
      score: 72,
      reasons: ['test fixture'],
      dimensions: [],
    });

    const result = await SimpleGeneration.run({
      intent: 'build an execute-first landing page',
      history: [],
      files: {},
      primaryRoute: makeRoute('primary', 'primary-model'),
      buildRoute: makeRoute('build', 'build-model'),
      fixRoute: makeRoute('fix', 'fix-model'),
      qaRoute: makeRoute('qa', 'qa-model'),
      apiKey: 'build-key',
      modelId: 'build-model',
      fixModelId: 'fix-model',
      onStream: () => {},
      onFiles: () => {},
      onPhase: () => {},
      onLog: (msg) => logs.push(msg),
      onPlan: () => {},
      singlePageSafeMode: true,
      generationMode: 'landing',
      prebuiltPlan: makePlan(),
    });

    expect(result.status).toBe('complete');
    expect(materializeSpy).toHaveBeenCalledTimes(1);
    expect(compileSpy).toHaveBeenCalledTimes(1);
    expect(promoteSpy).toHaveBeenCalledTimes(1);
    expect(reviewerAiSpy).not.toHaveBeenCalled();
    expect(reviewerSyncSpy).not.toHaveBeenCalled();
    expect(logs.some(msg => msg.includes('Artifact accepted for execution'))).toBe(true);
    expect(logs.some(msg => msg.includes('Candidate materialization success'))).toBe(true);
    expect(logs.some(msg => msg.includes('Fast gate passed'))).toBe(true);
    expect(logs.some(msg => msg.includes('Repair decision: not needed'))).toBe(true);

    expect(events.some(e => e.event === 'artifact_accepted_for_execution')).toBe(true);
    expect(events.some(e => e.event === 'candidate_materialization_start')).toBe(true);
    expect(events.some(e => e.event === 'candidate_materialization_success')).toBe(true);
    expect(events.some(e => e.event === 'fast_gate_start')).toBe(true);
    expect(events.some(e => e.event === 'fast_gate_result' && e.payload.result === 'passed')).toBe(true);
    expect(events.some(e => e.event === 'repair_decision' && e.payload.decision === 'not_needed')).toBe(true);
  });

  it('fails honestly after fast-gate failure and clears the candidate lifecycle state', async () => {
    const { SimpleGeneration } = await import('../SimpleGeneration');
    const { revisionManager } = await import('../RevisionManager');

    resetRevisionManagerSingleton(revisionManager);
    const events = captureTimelineEvents();
    const logs: string[] = [];

    const artifact = JSON.stringify({
      artifact: {
        entry: 'src/App.tsx',
        files: [
          {
            path: 'src/App.tsx',
            content: 'export default function App() { return <main>Will fail fast gate</main>; }',
          },
        ],
      },
    });

    llmProxyMock.llmFetchStream
      .mockResolvedValueOnce(makeStreamingResponse('{"technicalBlueprint":{"stack":["react"]}}'))
      .mockResolvedValueOnce(makeStreamingResponse(artifact))
      .mockResolvedValueOnce(makeStreamingResponse(''));

    vi.spyOn(revisionManager, 'fullClearPreview').mockResolvedValue(undefined);
    const compileSpy = vi.spyOn(revisionManager, 'compileCandidate')
      .mockResolvedValueOnce({ success: false, errors: ['compile boom'], _compiled: false });
    const promoteSpy = vi.spyOn(revisionManager, 'promote').mockResolvedValue(undefined);
    const rejectSpy = vi.spyOn(revisionManager, 'rejectCandidate');
    const reviewerAiSpy = vi.spyOn(ArtifactReviewerService, 'reviewWithAI');
    const reviewerSyncSpy = vi.spyOn(ArtifactReviewerService, 'review');

    const result = await SimpleGeneration.run({
      intent: 'build an app that fails the fast gate',
      history: [],
      files: {},
      primaryRoute: makeRoute('primary', 'primary-model'),
      buildRoute: makeRoute('build', 'build-model'),
      fixRoute: makeRoute('fix', 'fix-model'),
      qaRoute: makeRoute('qa', 'qa-model'),
      apiKey: 'build-key',
      modelId: 'build-model',
      fixModelId: 'fix-model',
      onStream: () => {},
      onFiles: () => {},
      onPhase: () => {},
      onLog: (msg) => logs.push(msg),
      onPlan: () => {},
      singlePageSafeMode: true,
      generationMode: 'landing',
      prebuiltPlan: makePlan(),
    });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('compile boom');
    expect(result.message).toContain('compile boom');
    expect(compileSpy).toHaveBeenCalledTimes(1);
    expect(promoteSpy).not.toHaveBeenCalled();
    expect(rejectSpy).toHaveBeenCalledTimes(1);
    expect(revisionManager.getCandidateRevisionId()).toBeNull();
    expect(reviewerAiSpy).not.toHaveBeenCalled();
    expect(reviewerSyncSpy).not.toHaveBeenCalled();
    expect(logs.some(msg => msg.includes('Fast gate failed'))).toBe(true);
    expect(logs.some(msg => msg.includes('Repair decision: fast gate failed'))).toBe(true);
    expect(logs.some(msg => msg.includes('Promotion blocked because fast gate failed'))).toBe(true);

    expect(events.some(e => e.event === 'artifact_accepted_for_execution')).toBe(true);
    expect(events.some(e => e.event === 'candidate_materialization_success')).toBe(true);
    expect(events.some(e => e.event === 'fast_gate_result' && e.payload.result === 'failed')).toBe(true);
    expect(events.some(e => e.event === 'repair_decision' && e.payload.decision === 'needed')).toBe(true);
    expect(events.some(e => e.event === 'promotion_blocked_fast_gate_failed')).toBe(true);
    expect(events.some(e => e.event === 'candidate_rejected')).toBe(true);
    expect(events.some(e => e.event === 'candidate_promoted')).toBe(false);
  });

  it('does not discard a non-fatal candidate when degraded acceptable viability exists', async () => {
    const { SimpleGeneration } = await import('../SimpleGeneration');
    const { revisionManager } = await import('../RevisionManager');

    resetRevisionManagerSingleton(revisionManager);
    const events = captureTimelineEvents();
    const logs: string[] = [];

    const artifact = JSON.stringify({
      artifact: {
        entry: 'src/App.tsx',
        files: [
          {
            path: 'src/App.tsx',
            content: [
              "import BrokenPage from './BrokenPage';",
              '',
              'export default function App() {',
              '  return <BrokenPage />;',
              '}',
            ].join('\n'),
          },
          {
            path: 'src/BrokenPage.tsx',
            content: 'export default function BrokenPage() { return <main>Decorative asset path</main>; }',
          },
        ],
      },
    });

    llmProxyMock.llmFetchStream
      .mockResolvedValueOnce(makeStreamingResponse('{"technicalBlueprint":{"stack":["react"]}}'))
      .mockResolvedValueOnce(makeStreamingResponse(artifact));

    vi.spyOn(revisionManager, 'fullClearPreview').mockResolvedValue(undefined);
    const compileSpy = vi.spyOn(revisionManager, 'compileCandidate')
      .mockResolvedValueOnce({
        success: false,
        errors: ['Failed to resolve import "./logo.svg" from "src/BrokenPage.tsx"'],
        _compiled: false,
      })
      .mockResolvedValueOnce({
        success: true,
        _compiled: true,
      });
    const promoteSpy = vi.spyOn(revisionManager, 'promote').mockResolvedValue(undefined);
    const rejectSpy = vi.spyOn(revisionManager, 'rejectCandidate');

    const result = await SimpleGeneration.run({
      intent: 'build an app with a non-fatal decorative asset issue',
      history: [],
      files: {},
      primaryRoute: makeRoute('primary', 'primary-model'),
      buildRoute: makeRoute('build', 'build-model'),
      fixRoute: makeRoute('fix', 'fix-model'),
      qaRoute: makeRoute('qa', 'qa-model'),
      apiKey: 'build-key',
      modelId: 'build-model',
      fixModelId: 'fix-model',
      onStream: () => {},
      onFiles: () => {},
      onPhase: () => {},
      onLog: (msg) => logs.push(msg),
      onPlan: () => {},
      singlePageSafeMode: true,
      generationMode: 'landing',
      prebuiltPlan: makePlan(),
    });

    expect(result.status).toBe('complete');
    expect(result.message).toContain('Partial ship:');
    expect(result.warnings[0]?.code).toBe('PARTIAL_SHIP_ACTIVE');
    expect(compileSpy).toHaveBeenCalledTimes(2);
    expect(promoteSpy).toHaveBeenCalledTimes(1);
    expect(rejectSpy).not.toHaveBeenCalled();
    expect(llmProxyMock.llmFetchStream).toHaveBeenCalledTimes(2);
    expect(logs.some(msg => msg.includes('Fast gate failed'))).toBe(true);
    expect(logs.some(msg => msg.includes('Partial ship active: degraded candidate promoted'))).toBe(true);
    expect(logs.some(msg => msg.includes('candidate promoted'))).toBe(true);

    expect(events.some(e => e.event === 'fast_gate_result' && e.payload.result === 'failed')).toBe(true);
    expect(events.some(e => e.event === 'final_stop_reason' && e.payload.stopReason === 'non_fatal_degraded_acceptable')).toBe(true);
    expect(events.some(e => e.event === 'candidate_rejected')).toBe(false);
  });

  it('does not overwrite last-good when the bounded repair budget is exhausted', async () => {
    const { SimpleGeneration } = await import('../SimpleGeneration');
    const { revisionManager } = await import('../RevisionManager');

    resetRevisionManagerSingleton(revisionManager);
    (revisionManager as unknown as { activeRevisionId: string | null }).activeRevisionId = 'last-good-rev';
    const events = captureTimelineEvents();
    const logs: string[] = [];

    const artifact = JSON.stringify({
      artifact: {
        entry: 'src/App.tsx',
        files: [
          {
            path: 'src/App.tsx',
            content: 'export default function App() { return <main>Budget failure path</main>; }',
          },
        ],
      },
    });

    llmProxyMock.llmFetchStream
      .mockResolvedValueOnce(makeStreamingResponse('{"technicalBlueprint":{"stack":["react"]}}'))
      .mockResolvedValueOnce(makeStreamingResponse(artifact))
      .mockResolvedValueOnce(makeStreamingResponse(JSON.stringify({
        artifact: {
          files: [{ path: 'src/App.tsx', content: 'export default function App() { return <main>Fix 1</main>; }' }],
        },
      })))
      .mockResolvedValueOnce(makeStreamingResponse(JSON.stringify({
        artifact: {
          files: [{ path: 'src/App.tsx', content: 'export default function App() { return <main>Fix 2</main>; }' }],
        },
      })));

    vi.spyOn(revisionManager, 'fullClearPreview').mockResolvedValue(undefined);
    const compileSpy = vi.spyOn(revisionManager, 'compileCandidate')
      .mockResolvedValueOnce({
        success: false,
        errors: ['Failed to resolve import "./Panel" from "src/App.tsx"'],
        _compiled: false,
      })
      .mockResolvedValueOnce({
        success: false,
        errors: ['Runtime bootstrap changed in src/App.tsx'],
        _compiled: false,
      })
      .mockResolvedValueOnce({
        success: false,
        errors: ['Yet another runtime break in src/App.tsx'],
        _compiled: false,
      })
      .mockResolvedValueOnce({
        success: false,
        errors: ['Partial ship also failed'],
        _compiled: false,
      });
    const promoteSpy = vi.spyOn(revisionManager, 'promote').mockResolvedValue(undefined);

    const result = await SimpleGeneration.run({
      intent: 'build an app that burns the bounded repair budget',
      history: [],
      files: {},
      primaryRoute: makeRoute('primary', 'primary-model'),
      buildRoute: makeRoute('build', 'build-model'),
      fixRoute: makeRoute('fix', 'fix-model'),
      qaRoute: makeRoute('qa', 'qa-model'),
      apiKey: 'build-key',
      modelId: 'build-model',
      fixModelId: 'fix-model',
      onStream: () => {},
      onFiles: () => {},
      onPhase: () => {},
      onLog: (msg) => logs.push(msg),
      onPlan: () => {},
      singlePageSafeMode: true,
      generationMode: 'landing',
      prebuiltPlan: makePlan(),
    });

    expect(result.status).toBe('failed');
    expect(compileSpy).toHaveBeenCalledTimes(4);
    expect(promoteSpy).not.toHaveBeenCalled();
    expect(revisionManager.getActiveRevisionId()).toBe('last-good-rev');
    expect(logs.some(msg => msg.includes('Repair budget exhausted'))).toBe(true);
    expect(events.some(e => e.event === 'repair_budget_exhausted')).toBe(true);
    expect(events.some(e => e.event === 'candidate_promoted')).toBe(false);
  });
});
