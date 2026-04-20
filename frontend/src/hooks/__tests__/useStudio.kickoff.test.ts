// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  KICKOFF_FAST_START_GRACE_MS,
  recoverKickoffApprovalFailure,
  prepareKickoffBuildApproval,
  scheduleKickoffFastStart,
  useKickoffFastStart,
  useStudio,
} from '../useStudio';
import type { PendingBlueprintPlan } from '../useStudio';
import {
  ArchitectPlannerService,
  buildScopeOptions,
  type KickoffBuildScopeId,
  inferCapabilitiesFromIntent,
  inferProductType,
} from '../../services/ArchitectPlannerService';

const generationPipelineMock = vi.hoisted(() => ({
  autoFix: vi.fn(),
  generatePlan: vi.fn(),
  run: vi.fn(),
}));

const generationRunGate = vi.hoisted(() => ({
  release: null as null | (() => void),
}));

const TEST_PROJECT_ID = vi.hoisted(() => '11111111-1111-4111-8111-111111111111');

vi.mock('../../services/SimpleGeneration', async () => {
  const actual = await vi.importActual<typeof import('../../services/SimpleGeneration')>(
    '../../services/SimpleGeneration',
  );
  return {
    ...actual,
    SimpleGeneration: generationPipelineMock,
  };
});

vi.mock('../useSettingsState', () => ({
  useSettingsState: () => ({
    apiKey: 'test-key',
    setApiKey: vi.fn(),
    selectedModel: 'test-model',
    setSelectedModel: vi.fn(),
    theme: 'dark',
    setTheme: vi.fn(),
    fullContextMode: false,
    setFullContextMode: vi.fn(),
    autoRoute: false,
    setAutoRoute: vi.fn(),
    appLanguage: 'en',
    setAppLanguage: vi.fn(),
    agentConfigs: {},
    setAgentConfig: vi.fn(),
  }),
}));

vi.mock('../useFigmaState', () => ({
  useFigmaState: () => ({
    figmaAccounts: [],
    addFigmaAccount: vi.fn(),
    removeFigmaAccount: vi.fn(),
    refreshFigmaAccounts: vi.fn(),
    figmaLink: '',
    setFigmaLink: vi.fn(),
    figmaAccessResult: null,
    validateFigmaLink: vi.fn(),
    figmaValidating: false,
    currentProjectTheme: null,
    syncProgress: 0,
    syncFigmaUrl: '',
    syncSource: null,
    startFigmaSync: vi.fn(),
    targetMarket: 'global',
    setTargetMarket: vi.fn(),
    auditStrictness: 'standard',
    setAuditStrictness: vi.fn(),
    figmaProjects: [],
    activeFigmaProjectId: null,
    saveFigmaProject: vi.fn(),
    loadFigmaProject: vi.fn(),
    deleteFigmaProject: vi.fn(),
    markFigmaProjectSynced: vi.fn(),
    clearFigmaSync: vi.fn(),
    engineApiKey: '',
    setEngineApiKey: vi.fn(),
    engineModelId: 'test-model',
    setEngineModelId: vi.fn(),
    engineStatus: 'idle',
    engineResult: null,
  }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

vi.mock('../../services/ConfigService', () => ({
  ConfigService: {
    getKeyForAgent: vi.fn(() => ''),
  },
}));

vi.mock('../../services/buildAgentRouting', () => ({
  resolveStandardRoute: (slot: string) => ({
    slot,
    provider: 'test',
    modelId: `${slot}-model`,
    apiKey: 'test-key',
  }),
}));

vi.mock('../../services/ProjectManager', () => ({
  ProjectManager: {
    create: vi.fn(() => ({
      id: TEST_PROJECT_ID,
      name: 'New Project',
      theme: 'dark-slate',
      description: 'New Project',
      createdAt: '2026-04-18T12:00:00.000Z',
      updatedAt: '2026-04-18T12:00:00.000Z',
      activeBranchId: 'main',
    })),
    delete: vi.fn(),
    getById: vi.fn(() => null),
    list: vi.fn(() => []),
    resolveKickoffContext: vi.fn(() => ({
      projectId: TEST_PROJECT_ID,
      branchId: 'main',
    })),
    setCurrent: vi.fn(),
  },
}));

vi.mock('../../services/ProjectStorage', () => ({
  ProjectStorage: {
    getProject: vi.fn(() => null),
    listProjects: vi.fn(() => []),
    saveProject: vi.fn(() => true),
    deleteProject: vi.fn(() => true),
  },
}));

vi.mock('../../services/ProjectRepository', () => ({
  ProjectRepository: {
    deleteProject: vi.fn(() => Promise.resolve()),
    getBranchArchitecture: vi.fn(() => Promise.resolve(null)),
    getProject: vi.fn(() => Promise.resolve(null)),
    listProjects: vi.fn(() => Promise.resolve([])),
    saveBranchArchitecture: vi.fn(() => Promise.resolve()),
    saveProject: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('../../services/ScannerService', () => ({
  ScannerService: {
    scan: vi.fn(() => null),
  },
}));

vi.mock('../../services/benchmark/BenchmarkService', () => ({
  BenchmarkService: {
    check: vi.fn(() => ({
      passed: true,
      score: 100,
      warnings: [],
      blockers: [],
    })),
  },
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  generationRunGate.release = null;
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});

function makePendingKickoffPlan(selectedOptionId: KickoffBuildScopeId = 'core'): PendingBlueprintPlan {
  return {
    id: 'pending-kickoff',
    plan: {
      appName: 'Kickoff Test',
      description: 'Test plan',
      theme: 'dark-slate',
      pages: [],
    } as any,
    blueprintText: '',
    technicalBlueprint: null,
    appName: 'Kickoff Test',
    theme: 'dark-slate',
    pages: [],
    architectKickoff: {
      projectId: 'project-kickoff',
      branchId: 'main',
      selectedOptionId,
      proposedSnapshotId: 'snapshot:main:kickoff:proposed',
      plan: {
        defaultOptionId: 'core',
        scopeOptions: [
          { id: 'core', label: 'Build core', description: 'Core only', capabilityIds: [] },
          { id: 'core_backend', label: 'Build core + backend', description: 'Core with backend', capabilityIds: ['backend', 'auth'] },
          { id: 'core_backend_ai', label: 'Build core + backend + AI', description: 'Core with backend and AI', capabilityIds: ['backend', 'auth', 'ai_chat'] },
          { id: 'revise', label: 'Revise plan', description: 'Revise before build', capabilityIds: [] },
        ],
      } as any,
    },
  };
}

function KickoffFastStartHarness({
  initialOptionId = 'core',
  delayMs = KICKOFF_FAST_START_GRACE_MS,
  onConfirm,
  onLog = () => {},
}: {
  initialOptionId?: KickoffBuildScopeId;
  delayMs?: number;
  onConfirm?: (scopeId: KickoffBuildScopeId | null) => void;
  onLog?: (message: string) => void;
}) {
  const [pendingPlan, setPendingPlan] = React.useState<PendingBlueprintPlan | null>(
    makePendingKickoffPlan(initialOptionId),
  );
  const [startedScope, setStartedScope] = React.useState<KickoffBuildScopeId | null>(null);

  const confirmPlan = React.useCallback(() => {
    const scopeId = pendingPlan?.architectKickoff?.selectedOptionId ?? null;
    setStartedScope(scopeId);
    onConfirm?.(scopeId);
  }, [pendingPlan, onConfirm]);

  useKickoffFastStart({
    pendingPlan,
    confirmPlan,
    addLog: onLog,
    delayMs,
  });

  return React.createElement(
    'div',
    null,
    React.createElement(
      'div',
      { 'data-testid': 'selected-scope' },
      pendingPlan?.architectKickoff?.selectedOptionId ?? 'none',
    ),
    React.createElement(
      'div',
      { 'data-testid': 'started-scope' },
      startedScope ?? 'none',
    ),
    React.createElement(
      'button',
      {
        'data-testid': 'select-core',
        onClick: () => setPendingPlan(prev => prev ? {
          ...prev,
          architectKickoff: {
            ...prev.architectKickoff!,
            selectedOptionId: 'core',
          },
        } : prev),
      },
      'core',
    ),
    React.createElement(
      'button',
      {
        'data-testid': 'select-ai',
        onClick: () => setPendingPlan(prev => prev ? {
          ...prev,
          architectKickoff: {
            ...prev.architectKickoff!,
            selectedOptionId: 'core_backend_ai',
          },
        } : prev),
      },
      'core_backend_ai',
    ),
  );
}

type StudioHook = ReturnType<typeof useStudio>;

function StudioLifecycleHarness({
  onRender,
}: {
  onRender: (studio: StudioHook) => void;
}) {
  const studio = useStudio();

  React.useEffect(() => {
    onRender(studio);
  });

  return React.createElement('div', { 'data-testid': 'studio-kickoff-phase' }, studio.kickoffPhase);
}

function kickoffScopeOptions() {
  return [
    { id: 'core', label: 'Build core', description: 'Core only', capabilityIds: [] },
    { id: 'core_backend', label: 'Build core + backend', description: 'Core with backend', capabilityIds: ['backend', 'auth'] },
    { id: 'core_backend_ai', label: 'Build core + backend + AI', description: 'Core with backend and AI', capabilityIds: ['backend', 'auth', 'ai_chat'] },
    { id: 'revise', label: 'Revise plan', description: 'Revise before build', capabilityIds: [] },
  ];
}

function makeKickoffGenerationPlan() {
  return {
    appName: 'Kickoff Test',
    description: 'Rendered hook lifecycle test',
    theme: 'dark-slate',
    pages: [{ name: 'Home', path: '/', file: 'src/pages/Home.tsx' }],
  };
}

function emitKickoffPlanReady(config: any) {
  config.onPlanReady?.({
    appName: 'Kickoff Test',
    pages: ['Home'],
    steps: [
      { id: 'think', label: 'Understand request', status: 'active' },
      { id: 'architect', label: 'Plan structure', status: 'pending' },
      { id: 'code', label: 'Generate code', status: 'pending' },
      { id: 'theme', label: 'Apply theme', status: 'pending' },
      { id: 'save', label: 'Save result', status: 'pending' },
    ],
    buildStatus: 'draft',
  });
}

function configureKickoffArchitectMocks() {
  vi.spyOn(ArchitectPlannerService, 'analyze').mockResolvedValue({
    defaultOptionId: 'core',
    scopeOptions: kickoffScopeOptions(),
  } as any);
  vi.spyOn(ArchitectPlannerService, 'writeProposedKickoffToMemory').mockResolvedValue({
    id: 'snapshot:main:kickoff:proposed',
  } as any);
  vi.spyOn(ArchitectPlannerService, 'formatPlanForChat').mockReturnValue('Kickoff plan ready.');
  vi.spyOn(ArchitectPlannerService, 'prepareBuildFromKickoff').mockResolvedValue({
    buildPlan: {
      appName: 'Kickoff Test',
      description: 'Rendered hook lifecycle test',
      theme: 'dark-slate',
      pages: [{ name: 'Home', path: '/', file: 'src/pages/Home.tsx' }],
      kickoffScope: {
        id: 'core',
        label: 'Build core',
        description: 'Core only',
        selectedCapabilityIds: [],
        deferredCapabilityIds: ['backend', 'auth', 'ai_chat'],
      },
    },
    snapshot: { id: 'snapshot:main:kickoff:approved' },
  } as any);
}

function configureCompletedKickoffGeneration() {
  generationPipelineMock.generatePlan.mockResolvedValue({
    appName: 'Kickoff Test',
    theme: 'dark-slate',
    pages: [{ name: 'Home', path: '/', file: 'src/pages/Home.tsx' }],
    steps: [
      { id: 'think', label: 'Understand request', status: 'active' },
      { id: 'architect', label: 'Plan structure', status: 'pending' },
      { id: 'code', label: 'Generate code', status: 'pending' },
      { id: 'theme', label: 'Apply theme', status: 'pending' },
      { id: 'save', label: 'Save result', status: 'pending' },
    ],
  });

  generationPipelineMock.run.mockImplementation(async (config: any) => {
    const plan = makeKickoffGenerationPlan();

    emitKickoffPlanReady(config);

    const approval = await config.waitForConfirmation(plan);
    expect(approval).toEqual(expect.objectContaining({
      confirmed: true,
      requiredKickoffScopeId: 'core',
    }));

    config.onPhase?.({ phase: 'think', progress: 20 });

    await new Promise<void>(resolve => {
      generationRunGate.release = resolve;
    });

    config.onPhase?.({ phase: 'idle', progress: 100 });

    return {
      status: 'success',
      message: 'Built your app!',
      operations: [
        {
          op: 'upsert',
          name: 'src/App.tsx',
          content: 'export default function App() { return <main>Kickoff Test</main>; }',
        },
      ],
      graph: { files: [] },
      plan,
      planTheme: 'dark-slate',
      qualitySummary: { severity: 'none' },
    };
  });

  configureKickoffArchitectMocks();
}

function configureFailedKickoffGeneration() {
  generationPipelineMock.generatePlan.mockResolvedValue({
    appName: 'Kickoff Test',
    theme: 'dark-slate',
    pages: [{ name: 'Home', path: '/', file: 'src/pages/Home.tsx' }],
    steps: [
      { id: 'think', label: 'Understand request', status: 'active' },
      { id: 'architect', label: 'Plan structure', status: 'pending' },
      { id: 'code', label: 'Generate code', status: 'pending' },
      { id: 'theme', label: 'Apply theme', status: 'pending' },
      { id: 'save', label: 'Save result', status: 'pending' },
    ],
  });

  generationPipelineMock.run.mockImplementation(async (config: any) => {
    const plan = makeKickoffGenerationPlan();

    emitKickoffPlanReady(config);

    const approval = await config.waitForConfirmation(plan);
    expect(approval).toEqual(expect.objectContaining({
      confirmed: true,
      requiredKickoffScopeId: 'core',
    }));

    config.onPhase?.({ phase: 'think', progress: 20 });

    await new Promise<void>(resolve => {
      generationRunGate.release = resolve;
    });

    return {
      status: 'failed',
      message: 'Controlled kickoff failure',
      error: 'Controlled kickoff failure',
      operations: [],
      graph: { files: [] },
      plan,
      planTheme: 'dark-slate',
      qualitySummary: { severity: 'none' },
    };
  });

  configureKickoffArchitectMocks();
}

describe('useStudio kickoff failure recovery', () => {
  it('rejects the pending confirmation flow immediately when kickoff approval fails', () => {
    const addLog = vi.fn();
    const appendErrorMessage = vi.fn();
    const resolvePendingConfirmation = vi.fn();
    const rejectBlueprint = vi.fn();

    const decision = recoverKickoffApprovalFailure(
      'Draft save failed',
      'plan-123',
      {
        addLog,
        appendErrorMessage,
        resolvePendingConfirmation,
        rejectBlueprint,
      },
    );

    expect(decision).toEqual({ confirmed: false });
    expect(resolvePendingConfirmation).toHaveBeenCalledWith({ confirmed: false });
    expect(addLog).toHaveBeenCalledWith(expect.stringContaining('Kickoff approval failed: Draft save failed'));
    expect(appendErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Build not started.'));
    expect(rejectBlueprint).toHaveBeenCalledWith('plan-123');
  });
});

// ── Session 14.2: Kickoff truth and fast-start ────────────────────────────────

describe('Kickoff fast-start default scope selection', () => {
  it('defaults to core scope for a simple prompt with no backend or AI signals', () => {
    const caps = inferCapabilitiesFromIntent('build a todo list app');
    const { defaultId } = buildScopeOptions(caps);
    // No backend/auth/AI detected → fastest path is 'core'
    expect(defaultId).toBe('core');
  });

  it('defaults to core_backend when backend or auth is detected in the prompt', () => {
    const caps = inferCapabilitiesFromIntent('build a user auth login system with database');
    const { defaultId } = buildScopeOptions(caps);
    expect(defaultId).toBe('core_backend');
  });

  it('defaults to core_backend_ai when AI capability is detected', () => {
    const caps = inferCapabilitiesFromIntent('build a chatbot with openai and user accounts');
    const { defaultId } = buildScopeOptions(caps);
    expect(defaultId).toBe('core_backend_ai');
  });

  it('includes the default option in the returned scope options list', () => {
    const caps = inferCapabilitiesFromIntent('create a portfolio website');
    const { options, defaultId } = buildScopeOptions(caps);
    const defaultOption = options.find(o => o.id === defaultId);
    expect(defaultOption).toBeDefined();
    expect(options.filter(o => o.id !== 'revise').length).toBeGreaterThanOrEqual(1);
  });

  it('infers product type correctly for common prompts', () => {
    expect(inferProductType('build a saas subscription product')).toBe('saas');
    expect(inferProductType('create a landing page for my startup')).toBe('landing');
    expect(inferProductType('build an e-commerce shop with cart')).toBe('e-commerce');
    // Unknown / generic defaults to 'app'
    expect(inferProductType('make something cool')).toBe('app');
  });

  it('default fast-start waits through a grace window before confirming', () => {
    vi.useFakeTimers();
    const confirmPlan = vi.fn();
    const addLog = vi.fn();

    const cleanup = scheduleKickoffFastStart({
      pendingPlan: makePendingKickoffPlan('core'),
      confirmPlan,
      addLog,
    });

    expect(cleanup).toBeTypeOf('function');
    vi.advanceTimersByTime(KICKOFF_FAST_START_GRACE_MS - 1);
    expect(confirmPlan).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(confirmPlan).toHaveBeenCalledTimes(1);
    expect(addLog).toHaveBeenCalledWith(expect.stringContaining('kickoff_scope_defaulted: core'));
    cleanup?.();
  });

  it('fast-start uses the selected scope from the timer that remains armed', () => {
    vi.useFakeTimers();
    const confirmPlan = vi.fn();
    const addLog = vi.fn();

    const cleanupDefault = scheduleKickoffFastStart({
      pendingPlan: makePendingKickoffPlan('core'),
      confirmPlan,
      addLog,
    });

    vi.advanceTimersByTime(Math.floor(KICKOFF_FAST_START_GRACE_MS / 2));
    cleanupDefault?.();

    const cleanupManual = scheduleKickoffFastStart({
      pendingPlan: makePendingKickoffPlan('core_backend_ai'),
      confirmPlan,
      addLog,
    });

    vi.advanceTimersByTime(KICKOFF_FAST_START_GRACE_MS);
    expect(confirmPlan).toHaveBeenCalledTimes(1);
    expect(addLog).toHaveBeenCalledWith(expect.stringContaining('kickoff_scope_defaulted: core_backend_ai'));
    expect(addLog).not.toHaveBeenCalledWith(expect.stringContaining('kickoff_scope_defaulted: core (fast-start auto-confirm)'));
    cleanupManual?.();
  });

  it('re-arms the fast-start timer through the real React lifecycle and starts the newly selected scope', () => {
    vi.useFakeTimers();

    const onConfirm = vi.fn();
    const onLog = vi.fn();
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');

    render(React.createElement(KickoffFastStartHarness, {
      initialOptionId: 'core',
      onConfirm,
      onLog,
    }));

    expect(screen.getByTestId('selected-scope').textContent).toBe('core');
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(KICKOFF_FAST_START_GRACE_MS - 25);
    });

    act(() => {
      screen.getByTestId('select-ai').click();
    });

    expect(screen.getByTestId('selected-scope').textContent).toBe('core_backend_ai');
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy).toHaveBeenCalledTimes(2);

    act(() => {
      vi.advanceTimersByTime(30);
    });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByTestId('started-scope').textContent).toBe('none');

    act(() => {
      vi.advanceTimersByTime(KICKOFF_FAST_START_GRACE_MS - 31);
    });

    expect(onConfirm).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('core_backend_ai');
    expect(screen.getByTestId('started-scope').textContent).toBe('core_backend_ai');
    expect(onLog).toHaveBeenCalledWith(expect.stringContaining('kickoff_scope_defaulted: core_backend_ai'));
    expect(onLog).not.toHaveBeenCalledWith(expect.stringContaining('kickoff_scope_defaulted: core (fast-start auto-confirm)'));
  });
});

describe('Kickoff approval without architectKickoff (non-genesis / re-run path)', () => {
  it('skips kickoff preparation and returns the original plan when architectKickoff is null', async () => {
    const originalPlan = {
      id: 'plan-42',
      appName: 'MyApp',
      description: 'Re-run of existing project',
      pages: [],
    };
    const prepareSpy = vi.spyOn(ArchitectPlannerService, 'prepareBuildFromKickoff');

    const result = await prepareKickoffBuildApproval({
      pendingPlan: {
        id: 'pending-1',
        plan: originalPlan as any,
        blueprintText: '',
        technicalBlueprint: null,
        appName: 'MyApp',
        theme: 'dark',
        pages: [],
        architectKickoff: null, // no architect kickoff → non-genesis
      } as any,
    });

    expect(result.approvedPlan).toEqual(originalPlan);
    expect(result.kickoffSnapshotId).toBeNull();
    expect(prepareSpy).not.toHaveBeenCalled();
  });
});

describe('Kickoff state cleanup', () => {
  it('kickoffPhase returns to idle after a completed generation in the rendered useStudio flow', async () => {
    configureCompletedKickoffGeneration();

    let latestStudio: StudioHook | null = null;
    const phases: string[] = [];

    render(React.createElement(StudioLifecycleHarness, {
      onRender: (studio) => {
        latestStudio = studio;
        phases.push(studio.kickoffPhase);
      },
    }));

    await waitFor(() => expect(latestStudio).not.toBeNull());

    act(() => {
      latestStudio!.setInput('build a simple todo app');
    });

    await waitFor(() => expect(latestStudio!.input).toBe('build a simple todo app'));

    await act(async () => {
      void latestStudio!.handleSend();
    });

    await waitFor(() => {
      expect(latestStudio!.pendingPlan?.architectKickoff?.selectedOptionId).toBe('core');
      expect(latestStudio!.kickoffPhase).toBe('awaiting_confirmation');
    });

    await act(async () => {
      await latestStudio!.confirmPlan();
    });

    await waitFor(() => {
      expect(phases).toContain('building');
      expect(generationRunGate.release).toBeTypeOf('function');
    });

    await act(async () => {
      generationRunGate.release?.();
    });

    await waitFor(() => {
      expect(latestStudio!.isGenerating).toBe(false);
      expect(latestStudio!.kickoffPhase).toBe('idle');
    });

    expect(phases).toEqual(expect.arrayContaining([
      'awaiting_confirmation',
      'build_starting',
      'building',
      'idle',
    ]));
    expect(ArchitectPlannerService.analyze).toHaveBeenCalled();
  });

  it('kickoffPhase returns to idle after a controlled failed generation in the rendered useStudio flow', async () => {
    configureFailedKickoffGeneration();

    let latestStudio: StudioHook | null = null;
    const phases: string[] = [];

    render(React.createElement(StudioLifecycleHarness, {
      onRender: (studio) => {
        latestStudio = studio;
        phases.push(studio.kickoffPhase);
      },
    }));

    await waitFor(() => expect(latestStudio).not.toBeNull());

    act(() => {
      latestStudio!.setInput('build a simple todo app');
    });

    await waitFor(() => expect(latestStudio!.input).toBe('build a simple todo app'));

    await act(async () => {
      void latestStudio!.handleSend();
    });

    await waitFor(() => {
      expect(latestStudio!.pendingPlan?.architectKickoff?.selectedOptionId).toBe('core');
      expect(latestStudio!.kickoffPhase).toBe('awaiting_confirmation');
    });

    await act(async () => {
      await latestStudio!.confirmPlan();
    });

    await waitFor(() => {
      expect(phases).toContain('building');
      expect(generationRunGate.release).toBeTypeOf('function');
    });

    await act(async () => {
      generationRunGate.release?.();
    });

    await waitFor(() => {
      expect(latestStudio!.isGenerating).toBe(false);
      expect(latestStudio!.kickoffPhase).toBe('idle');
    });

    expect(phases).toEqual(expect.arrayContaining([
      'awaiting_confirmation',
      'build_starting',
      'building',
      'idle',
    ]));
    expect(latestStudio!.previewLifecycle).toBe('failed');
  });
});

describe('Canonical generation path (Session 14.1) remains intact', () => {
  it('buildScopeOptions returns deterministic scope options for inferred capabilities', () => {
    const caps = inferCapabilitiesFromIntent('build a task tracker');
    const { options, defaultId } = buildScopeOptions(caps);
    expect(typeof defaultId).toBe('string');
    expect(options.length).toBeGreaterThan(0);
    const ids = options.map(o => o.id);
    expect(ids).toContain('core');
    expect(ids).toContain('revise');
  });

  it('exposes non-default kickoff scope options while keeping the computed default unchanged', () => {
    const caps = inferCapabilitiesFromIntent('build a todo app');
    const { options, defaultId } = buildScopeOptions(caps);

    // For a simple todo app, default should be 'core' (no backend/auth/ai)
    expect(defaultId).toBe('core');

    // The user can still select core_backend explicitly
    const coreBackendOption = options.find(o => o.id === 'core_backend');
    expect(coreBackendOption).toBeDefined();
    expect(coreBackendOption!.id).toBe('core_backend');
    // core_backend capabilityIds include 'backend' and 'auth'
    expect(coreBackendOption!.capabilityIds).toContain('backend');
    expect(coreBackendOption!.capabilityIds).toContain('auth');
  });
});
