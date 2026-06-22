// @vitest-environment jsdom
/**
 * GenerationOutcomeEvent — S0.2 flywheel seed
 *
 * Verifies that every exit path of the generation pipeline emits exactly one
 * canonical GenerationOutcomeEvent through metricsService.logOutcomeEvent().
 *
 * Five invariants:
 *   1. success        → event with real compiled/repairPasses/designContractOk
 *   2. late fail      → event with repairPasses:0 (defined), compiled:false
 *   3. early fail     → event where undefined = "stage not reached" (NOT 0/false)
 *   4. applied_empty  → onFiles throw → outcome 'applied_empty', event with reason
 *   5. runId          → event.runId === generationTracer id for the same run
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { metricsService } from '../MetricsService';
import { generationTracer } from '../GenerationTracer';
import { GenerationEngine, type PipelineRunConfig } from '../GenerationEngine';
import { ProtoPipeline, type ResolvedRoute } from '../ProtoPipeline';
import type { AgentExecutionRoute } from '../buildAgentRouting';
import type { GenerationOutcomeEvent } from '../../shared/projectModel';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../MetricsService', () => ({
  metricsService: {
    logOutcomeEvent: vi.fn(),
    logGeneration:   vi.fn(),
    record:          vi.fn(),
    recordError:     vi.fn(),
    getAll:          () => [],
    getSummary:      () => ({
      totalCalls: 0, totalCost: 0, totalDurationMs: 0,
      totalInputTokens: 0, totalOutputTokens: 0, errors: 0, byPhase: {},
    }),
  },
}));

vi.mock('../GenerationTracer', () => ({
  generationTracer: {
    current:     vi.fn().mockReturnValue(null),
    clearActive: vi.fn(),
    start:       vi.fn(),
    getAll:      vi.fn().mockReturnValue([]),
    getRecent:   vi.fn().mockReturnValue([]),
    recordFirstLLMStep: vi.fn(),
  },
}));

// Mock LLMProxy so ProtoPipeline tests can inject synthetic architect responses.
vi.mock('../LLMProxy', () => ({
  llmFetch:       vi.fn(),
  llmFetchStream: vi.fn(),
  proxyRequestWithSessionFallback: vi.fn(),
}));

// Mock RevisionManager — SimpleGeneration needs it but we don't test revision state here.
vi.mock('../RevisionManager', () => ({
  revisionManager: {
    claimPreviewOwnership:   vi.fn(),
    releasePreviewOwnership: vi.fn(),
    getActiveRevisionId:     vi.fn().mockReturnValue('rev-test-001'),
    getRevisionFiles:        vi.fn().mockReturnValue({}),
    readRevisionFiles:       vi.fn().mockReturnValue({}),
  },
}));

// Stub out analytics services that SimpleGeneration calls after the pipeline.
vi.mock('../benchmark/GenerationQualityService', () => ({
  GenerationQualityService: { evaluate: vi.fn().mockReturnValue({}) },
}));

vi.mock('../benchmark/VisualQualityService', () => ({
  VisualQualityService: { evaluate: vi.fn().mockReturnValue({}) },
}));

// PreviewController — dispatches DOM events; stub it so compile() doesn't crash.
vi.mock('../PreviewController', () => ({
  previewController: {
    notifyCompiling: vi.fn(),
    notifyFailed:    vi.fn(),
    notifyReady:     vi.fn(),
    waitForMount:    vi.fn().mockResolvedValue(true),
  },
}));

// PreviewSessionService — needed by compile() and preview URL generation.
vi.mock('../PreviewSessionService', () => ({
  getPreviewSessionToken:    vi.fn().mockReturnValue('sess-test'),
  appendPreviewSessionToUrl: vi.fn((url: string) => url),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const logOutcomeEventMock = () => metricsService.logOutcomeEvent as Mock;

/** Minimal PipelineRunConfig for SimpleGeneration.run(). */
function makePipelineConfig(overrides: Partial<PipelineRunConfig> = {}): PipelineRunConfig {
  return {
    intent:    'build a simple todo app',
    modelId:   'test-model',
    revisionId: 'rev-test-001',
    onStream:  () => {},
    onFiles:   vi.fn(),
    onPhase:   vi.fn(),
    onLog:     vi.fn(),
    onPlan:    vi.fn(),
    ...overrides,
  } as PipelineRunConfig;
}

/** A minimal architect plan with a single delta file so deltaFiles is non-empty. */
const VALID_ARCHITECT_JSON = JSON.stringify({
  appName:  'TestApp',
  skeleton: 'mobile-app',
  summary:  'A simple todo app',
  fileTree: {
    'pages/TodoScreen.tsx': 'Main todo list screen with add/remove functionality',
  },
});

/** A synthetic architect LLM response (non-streaming JSON body). */
function architectLlmResponse(content: string = VALID_ARCHITECT_JSON): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content, finish_reason: 'stop' } }],
      usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

/**
 * A route override that bypasses ConfigService so architect LLM can be called
 * in tests. Uses openrouter endpoint so llmFetch is used (not the CLI path).
 */
const PRIMARY_ROUTE_OVERRIDE: ResolvedRoute = {
  modelId:          'gpt-4o-mini',
  apiKey:           'sk-fake-key-for-test',
  endpoint:         'https://openrouter.ai/api/v1/chat/completions',
  provider:         'openrouter',
  endpointKind:     'openrouter_proxy',
  sourceAuthority:  'test',
};

function makeExecutionRoute(slot: AgentExecutionRoute['slot']): AgentExecutionRoute {
  return {
    slot,
    provider: 'deepseek',
    modelId: 'deepseek-v4-pro',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    apiKey: `sk-${slot}-test`,
    keySource: `agent_${slot}.deepseek`,
    reason: `${slot}-test-route`,
    sourceAuthority: 'user_set',
    isUserSelected: true,
    isRuntimeConfig: false,
    isFactoryConfig: false,
    isProxyFallback: false,
    isExplicitFallback: false,
    endpointKind: 'direct_provider',
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GenerationOutcomeEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Test 1 — success path emits event with real values ─────────────────────

  it('1. success — emits event with compiled=true, real repairPasses, designContractOk', async () => {
    const tracerId = 'tracer-success-123';
    vi.mocked(generationTracer.current).mockReturnValue({ id: tracerId } as ReturnType<typeof generationTracer.current>);

    // Control ProtoPipeline.run() output to return a fully-formed success result.
    vi.spyOn(ProtoPipeline, 'run').mockResolvedValue({
      success:    true,
      buildId:    'build-001',
      url:        '/preview/build-001',
      files:      { 'App.tsx': 'export default function App() { return <div/> }' },
      plan:       { appName: 'TestApp', summary: 'A test app', fileTree: {}, deltaFiles: [] },
      stepResults: {},
      runTelemetry: {
        brief:       'build a simple todo app',
        skeletonId:  'mobile-app',
        skeletonLabel: 'Mobile App',
        skeletonFiles: [],
        deltaFiles:  ['App.tsx'],
        planSummary: 'A test app',
        designIntent: [],
        steps:       [],
        compileCount: 2,
        finalPreviewMounted: true,
      },
      outcomeData: {
        repairPasses:         1,
        designContractOk:     true,
        designContractFinalOk: true,
        compiled:             true,
      },
    });

    await GenerationEngine.run(makePipelineConfig());

    expect(logOutcomeEventMock()).toHaveBeenCalledOnce();
    const event = logOutcomeEventMock().mock.calls[0][0] as GenerationOutcomeEvent;
    expect(event.outcome).toBe('success');
    expect(event.compiled).toBe(true);
    expect(event.repairPasses).toBe(1);
    expect(event.designContractOk).toBe(true);
    expect(event.runId).toBe(tracerId);
  });

  // ── Test 2 — late fail (after architect) → compiled:false, repairPasses defined ─

  it('2. late fail (skeleton compile) — compiled:false, repairPasses:0 (not undefined)', async () => {
    const { llmFetch, llmFetchStream } = await import('../LLMProxy');

    // Architect LLM returns a valid plan. The pipeline streams the proxy call
    // (llmFetchStream); a plain-JSON Response is passed through by streamCall, so
    // the same fixture works. Mock both transports defensively.
    vi.mocked(llmFetch).mockResolvedValue(architectLlmResponse());
    vi.mocked(llmFetchStream).mockResolvedValue(architectLlmResponse());

    // Make the skeleton compile fetch() call fail.
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network: ECONNREFUSED'));

    const result = await ProtoPipeline.run({
      prompt:    'test app',
      skeletonId: 'mobile-app',
      buildId:   'build-late-fail',
      runId:     'run-late-789',
      onStep:    vi.fn(),
      onLog:     vi.fn(),
      routeOverrides: { primary: PRIMARY_ROUTE_OVERRIDE },
    });

    expect(result.success).toBe(false);
    expect(logOutcomeEventMock()).toHaveBeenCalled();
    const event = logOutcomeEventMock().mock.calls[0][0] as GenerationOutcomeEvent;
    expect(event.runId).toBe('run-late-789');
    expect(event.outcome).toBe('failed');
    // Architect succeeded → capturedPlan is set → repairPasses is 0 (defined), not undefined.
    expect(event.repairPasses).toBe(0);
    expect(typeof event.repairPasses).toBe('number');
    // Skeleton compile failed, not final build → buildCompileAttempted=false → compiled=undefined.
    expect(event.compiled).toBeUndefined();
    // Apply not reached → designContractOk stays undefined.
    expect(event.designContractOk).toBeUndefined();
  });

  // ── Test 3 — early fail (invalid skeletonId) → undefined for unset fields ──

  it('3. early fail (unknown skeletonId) — undefined for stage-gated fields, not 0/false', async () => {
    const result = await ProtoPipeline.run({
      prompt:    'test app',
      skeletonId: '__nonexistent_skeleton__' as import('../SkeletonRegistry').SkeletonId,
      buildId:   'build-early-fail',
      runId:     'run-early-000',
      onStep:    vi.fn(),
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unknown skeletonId/);
    expect(logOutcomeEventMock()).toHaveBeenCalledOnce();

    const event = logOutcomeEventMock().mock.calls[0][0] as GenerationOutcomeEvent;
    expect(event.runId).toBe('run-early-000');
    expect(event.outcome).toBe('failed');
    expect(event.failedStep).toBe('skeleton');

    // Fields requiring later stages MUST be undefined, not 0 or false.
    expect(event.compiled).toBeUndefined();
    expect(event.repairPasses).toBeUndefined();
    expect(event.designContractOk).toBeUndefined();
    expect(event.planSummary).toBeUndefined();
    expect(event.deltaFileCount).toBeUndefined();
  });

  // ── Test 4 — onFiles throw → outcome 'applied_empty', event with reason ────

  it('4. onFiles throw → outcome applied_empty + event with errorMessage', async () => {
    vi.mocked(generationTracer.current).mockReturnValue({ id: 'tracer-onfiles-456' } as ReturnType<typeof generationTracer.current>);

    const onFilesError = new Error('revision storage full');
    vi.spyOn(ProtoPipeline, 'run').mockResolvedValue({
      success:    true,
      buildId:    'build-onfiles',
      url:        '/preview/build-onfiles',
      files:      { 'App.tsx': 'export default function App() {}' },
      plan:       { appName: 'TestApp', summary: 'A test app', fileTree: {}, deltaFiles: [] },
      stepResults: {},
      runTelemetry: {
        brief:       'test',
        skeletonId:  'mobile-app',
        skeletonLabel: 'Mobile App',
        skeletonFiles: [],
        deltaFiles:  ['App.tsx'],
        designIntent: [],
        steps:       [],
        compileCount: 1,
        finalPreviewMounted: true,
      },
      outcomeData: {
        repairPasses:          0,
        designContractOk:      true,
        designContractFinalOk: true,
        compiled:              true,
      },
    });

    await GenerationEngine.run(makePipelineConfig({
      onFiles: vi.fn().mockImplementation(() => { throw onFilesError; }),
    }));

    // logOutcomeEvent should have been called with 'applied_empty'.
    expect(logOutcomeEventMock()).toHaveBeenCalled();
    const event = logOutcomeEventMock().mock.calls[0][0] as GenerationOutcomeEvent;
    expect(event.outcome).toBe('applied_empty');
    expect(event.errorMessage).toBe('revision storage full');
    expect(event.failedStep).toBe('apply_files');
    // The run itself compiled fine — these values should propagate.
    expect(event.compiled).toBe(true);
    expect(event.repairPasses).toBe(0);
  });

  // ── Test 5 — event.runId === generationTracer id ───────────────────────────

  it('5. runId — event runId matches generationTracer.current().id', async () => {
    const expectedRunId = 'tracer-canonical-runid-999';
    vi.mocked(generationTracer.current).mockReturnValue({ id: expectedRunId } as ReturnType<typeof generationTracer.current>);

    const runSpy = vi.spyOn(ProtoPipeline, 'run').mockResolvedValue({
      success:    true,
      buildId:    'build-runid',
      url:        '/preview/build-runid',
      files:      {},
      plan:       { appName: 'App', summary: '', fileTree: {}, deltaFiles: [] },
      stepResults: {},
      outcomeData: { repairPasses: 0, designContractOk: undefined, designContractFinalOk: undefined, compiled: true },
    });

    await GenerationEngine.run(makePipelineConfig());

    // Verify the runId passed to ProtoPipeline.run matches the tracer id.
    expect(runSpy).toHaveBeenCalledWith(
      expect.objectContaining({ runId: expectedRunId }),
    );

    // And the emitted outcome event carries the same runId.
    expect(logOutcomeEventMock()).toHaveBeenCalled();
    const event = logOutcomeEventMock().mock.calls[0][0] as GenerationOutcomeEvent;
    expect(event.runId).toBe(expectedRunId);
  });

  it('6. routeOverrides — forwards build/fix/spec routes into ProtoPipeline with shared transport kind', async () => {
    localStorage.removeItem('AIC_DEV_AUTH_BYPASS');

    const runSpy = vi.spyOn(ProtoPipeline, 'run').mockResolvedValue({
      success: true,
      buildId: 'build-route-overrides',
      url: '/preview/build-route-overrides',
      files: {},
      plan: { appName: 'App', summary: '', fileTree: {}, deltaFiles: [] },
      stepResults: {},
      outcomeData: {
        repairPasses: 0,
        designContractOk: true,
        designContractFinalOk: true,
        compiled: true,
      },
    });

    await GenerationEngine.run(makePipelineConfig({
      primaryRoute: makeExecutionRoute('primary'),
      buildRoute:   makeExecutionRoute('build'),
      fixRoute:     makeExecutionRoute('fix'),
      specRoute:    makeExecutionRoute('spec'),
      qaRoute:      makeExecutionRoute('qa'),
    }));

    expect(runSpy).toHaveBeenCalledOnce();
    const routeOverrides = runSpy.mock.calls[0][0].routeOverrides;
    expect(routeOverrides).toMatchObject({
      primary: expect.objectContaining({
        endpoint: 'https://api.deepseek.com/v1/chat/completions',
        sourceAuthority: 'user_set',
      }),
      build: expect.objectContaining({
        endpoint: 'https://api.deepseek.com/v1/chat/completions',
        endpointKind: 'supabase_proxy',
      }),
      fix: expect.objectContaining({
        endpoint: 'https://api.deepseek.com/v1/chat/completions',
        endpointKind: 'supabase_proxy',
      }),
    });
    expect(routeOverrides?.build?.endpointKind).toBe(routeOverrides?.fix?.endpointKind);
  });
});
