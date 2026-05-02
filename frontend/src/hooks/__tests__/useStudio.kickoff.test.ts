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
import { ProjectRepository } from '../../services/ProjectRepository';
import { ProjectStorage } from '../../services/ProjectStorage';
import { revisionManager } from '../../services/RevisionManager';
import { previewController } from '../../services/PreviewController';

const generationPipelineMock = vi.hoisted(() => ({
  autoFix: vi.fn(),
  generatePlan: vi.fn(),
  run: vi.fn(),
}));

const generationRunGate = vi.hoisted(() => ({
  release: null as null | (() => void),
}));

const TEST_PROJECT_ID = vi.hoisted(() => '11111111-1111-4111-8111-111111111111');
const resolveStandardRouteMock = vi.hoisted(() => vi.fn((slot: string) => ({
  slot,
  provider: 'test',
  modelId: `${slot}-model`,
  apiKey: 'test-key',
  endpoint: `https://example.com/${slot}`,
  keySource: `${slot}.key`,
})));

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
  resolveStandardRoute: resolveStandardRouteMock,
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
    getCurrentId: vi.fn(() => TEST_PROJECT_ID),
  },
}));

vi.mock('../../services/ProjectStorage', () => ({
  ProjectStorage: {
    getProject: vi.fn(() => null),
    listProjects: vi.fn(() => []),
    projectDataExists: vi.fn(() => false),
    saveProject: vi.fn(() => true),
    deleteProject: vi.fn(() => true),
  },
}));

vi.mock('../../services/ProjectRepository', () => ({
  getCanonicalProjectName: (project: { name?: string; title?: string }) =>
    project?.name || project?.title || 'New Project',
  ProjectRepository: {
    deleteProject: vi.fn(() => Promise.resolve()),
    getBranchArchitecture: vi.fn(() => Promise.resolve(null)),
    getProject: vi.fn(() => Promise.resolve(null)),
    listProjects: vi.fn(() => Promise.resolve([])),
    loadToPreview: vi.fn(() => Promise.resolve()),
    removeLocalProjectMeta: vi.fn(),
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
  previewController.reset();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  resolveStandardRouteMock.mockImplementation((slot: string) => ({
    slot,
    provider: 'test',
    modelId: `${slot}-model`,
    apiKey: 'test-key',
    endpoint: `https://example.com/${slot}`,
    keySource: `${slot}.key`,
  }));
  vi.mocked(ProjectStorage.getProject).mockImplementation(() => null);
  vi.mocked(ProjectStorage.projectDataExists).mockImplementation(() => false);
  vi.mocked(ProjectRepository.getProject).mockResolvedValue(null);
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

function configureBlockedPreviewKickoffGeneration() {
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

    return {
      status: 'success',
      message: 'Built with preview blockers',
      operations: [
        {
          op: 'upsert',
          name: 'src/App.tsx',
          content: 'export default function App() { return <main>Blocked Preview</main>; }',
        },
      ],
      graph: { files: [] },
      plan,
      planTheme: 'dark-slate',
      qualitySummary: {
        severity: 'blocking',
        blockers: ['Preview blocked in test'],
      },
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

describe('Existing-project explicit continuation', () => {
  it('reuses the saved project plan for "Продолжай" and skips primary re-planning', async () => {
    const savedPlan = {
      appName: 'Resume Project',
      description: 'Continue the interrupted implementation',
      theme: 'dark-slate',
      pages: [{ name: 'Home', path: '/', file: 'src/pages/Home.tsx' }],
    };
    const storedProject = {
      id: TEST_PROJECT_ID,
      name: 'Resume Project',
      description: 'Existing project',
      theme: 'dark-slate',
      files: {
        'src/App.tsx': 'export default function App() { return <main>Resume</main>; }',
      },
      chatHistory: [],
      createdAt: '2026-04-18T12:00:00.000Z',
      updatedAt: '2026-04-18T12:00:00.000Z',
      version: 1,
      plan: savedPlan,
      activeBranchId: 'main',
      branches: {
        main: {
          id: 'main',
          projectId: TEST_PROJECT_ID,
          name: 'main',
          isDefault: true,
          createdAt: '2026-04-18T12:00:00.000Z',
          updatedAt: '2026-04-18T12:00:00.000Z',
          files: {
            'src/App.tsx': 'export default function App() { return <main>Resume</main>; }',
          },
          chatHistory: [],
          revisions: [],
          architecture: null as any,
        },
      },
    } as any;

    let latestStudio: StudioHook | null = null;
    let capturedRunConfig: any = null;

    localStorage.setItem('CURRENT_PROJECT_ID', TEST_PROJECT_ID);

    vi.mocked(ProjectStorage.projectDataExists).mockImplementation((id: string) => id === TEST_PROJECT_ID);
    vi.mocked(ProjectStorage.getProject).mockImplementation((id: string) => (
      id === TEST_PROJECT_ID ? storedProject : null
    ));
    vi.mocked(ProjectRepository.getProject).mockResolvedValue(storedProject);
    resolveStandardRouteMock.mockImplementation((slot: string) => ({
      slot,
      provider: 'openrouter',
      modelId: `${slot}-model`,
      apiKey: slot === 'build' ? 'valid-build-key' : 'stale-primary-key',
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      keySource: `${slot}.key`,
    }));
    generationPipelineMock.generatePlan.mockRejectedValue(new Error('generatePlan should be skipped'));
    generationPipelineMock.run.mockImplementation(async (config: any) => {
      capturedRunConfig = config;
      emitKickoffPlanReady(config);
      await config.waitForConfirmation(savedPlan);
      return {
        status: 'cancelled',
        message: 'cancelled',
        operations: [],
        graph: { files: [] },
        plan: savedPlan,
        planTheme: 'dark-slate',
        qualitySummary: { severity: 'none' },
      };
    });

    render(React.createElement(StudioLifecycleHarness, {
      onRender: (studio) => {
        latestStudio = studio;
      },
    }));

    await waitFor(() => expect(latestStudio).not.toBeNull());

    act(() => {
      latestStudio!.setInput('Продолжай');
    });

    await act(async () => {
      void latestStudio!.handleSend();
    });

    await waitFor(() => {
      expect(latestStudio!.pendingPlan?.plan).toEqual(savedPlan);
    });

    expect(generationPipelineMock.generatePlan).not.toHaveBeenCalled();

    await act(async () => {
      await latestStudio!.confirmPlan();
    });

    await waitFor(() => {
      expect(capturedRunConfig).not.toBeNull();
    });

    expect(capturedRunConfig.prebuiltPlan).toBe(savedPlan);
    expect(capturedRunConfig.buildRoute.apiKey).toBe('valid-build-key');
    expect(capturedRunConfig.primaryRoute.apiKey).toBe('stale-primary-key');
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

describe('Project repository missing-state truth', () => {
  it('starts in a fresh draft instead of auto-loading the most recent saved project on cold start', async () => {
    let latestStudio: StudioHook | null = null;
    const savedProjectId = '44444444-4444-4444-8444-444444444444';

    vi.mocked(ProjectStorage.listProjects).mockReturnValue([{
      id: savedProjectId,
      name: 'Recent Project',
      description: 'Should not auto-open',
      theme: 'dark-slate',
      createdAt: '2026-04-18T12:00:00.000Z',
      updatedAt: '2026-04-18T12:00:00.000Z',
      activeBranchId: 'main',
      branchIds: ['main'],
      branchCount: 1,
    } as any]);

    render(React.createElement(StudioLifecycleHarness, {
      onRender: (studio) => {
        latestStudio = studio;
      },
    }));

    await waitFor(() => {
      expect(latestStudio!.currentProjectId).toMatch(/^draft_/);
      expect(latestStudio!.persistedProjectExists).not.toBe(true);
    });

    expect(vi.mocked(ProjectRepository.getProject)).not.toHaveBeenCalled();
    expect(localStorage.getItem('CURRENT_PROJECT_ID')).toBeNull();
    expect(localStorage.getItem('AIC_DRAFT_SESSION_ID')).toBe(latestStudio!.currentProjectId);
  });

  it('does not convert a stale missing project load into a fresh blank project', async () => {
    let latestStudio: StudioHook | null = null;

    render(React.createElement(StudioLifecycleHarness, {
      onRender: (studio) => {
        latestStudio = studio;
      },
    }));

    await waitFor(() => expect(latestStudio).not.toBeNull());

    await act(async () => {
      await latestStudio!.loadProject({ id: 'missing-project' });
    });

    await waitFor(() => {
      expect(latestStudio!.currentProjectId).toBe('missing-project');
      expect(latestStudio!.persistedProjectExists).toBe(false);
    });

    expect(latestStudio!.files).toEqual({});
    expect(latestStudio!.previewLifecycle).toBe('blocked');
    expect(latestStudio!.previewBlockedReason).toContain('Project not found: missing-project');
    expect(vi.mocked(ProjectRepository.removeLocalProjectMeta)).toHaveBeenCalledWith('missing-project');
    expect(latestStudio!.messages.some(message =>
      String(message.content).includes('not opened as a new blank project'),
    )).toBe(true);
  }, 10_000);

  it('keeps hydrated project chat intact when preview preload fails', async () => {
    let latestStudio: StudioHook | null = null;
    const projectId = '33333333-3333-4333-8333-333333333333';
    const loadedHistory = [
      { id: 'msg-user', role: 'user', content: 'Build the dashboard' },
      { id: 'msg-plan', role: 'assistant', type: 'blueprint', content: 'Blueprint ready', appName: 'Dash', pages: ['Home'] },
      { id: 'msg-report', role: 'assistant', type: 'generation-report', content: 'Built your app!', report: { mode: 'CREATE', filesCreated: ['src/App.tsx'], filesModified: [] } },
    ];

    vi.mocked(ProjectRepository.getProject).mockResolvedValue({
      id: projectId,
      name: 'Dash',
      description: 'Hydrated project',
      theme: 'dark-slate',
      files: { 'src/App.tsx': 'export default function App() { return <main>Dash</main>; }' },
      chatHistory: loadedHistory as any,
      createdAt: '2026-04-18T12:00:00.000Z',
      updatedAt: '2026-04-18T12:00:00.000Z',
      version: 1,
      activeBranchId: 'main',
      branches: {
        main: {
          id: 'main',
          projectId,
          name: 'main',
          isDefault: true,
          createdAt: '2026-04-18T12:00:00.000Z',
          updatedAt: '2026-04-18T12:00:00.000Z',
          files: { 'src/App.tsx': 'export default function App() { return <main>Dash</main>; }' },
          chatHistory: loadedHistory as any,
          revisions: [],
          architecture: {} as any,
        },
      },
    } as any);
    vi.mocked(ProjectRepository.loadToPreview).mockRejectedValue(new Error('PROMOTE_BLOCKED: white_screen_after_ready'));

    render(React.createElement(StudioLifecycleHarness, {
      onRender: (studio) => {
        latestStudio = studio;
      },
    }));

    await waitFor(() => expect(latestStudio).not.toBeNull());

    await act(async () => {
      await latestStudio!.loadProject({ id: projectId });
    });

    await waitFor(() => {
      expect(latestStudio!.currentProjectId).toBe(projectId);
      expect(latestStudio!.previewBlockedReason).toContain('PROMOTE_BLOCKED: white_screen_after_ready');
    });

    expect(latestStudio!.messages.map(message => message.id)).toEqual(['msg-user', 'msg-plan', 'msg-report']);
    expect(latestStudio!.messages.some(message =>
      String(message.content).includes('Preview failed to load'),
    )).toBe(false);
  });

  it('ignores stale project hydration when a newer switch starts before the older load resolves', async () => {
    let latestStudio: StudioHook | null = null;
    const projectA = {
      id: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      name: 'Project A',
      description: 'Older load',
      theme: 'dark-slate',
      files: { 'src/App.tsx': 'export default function App() { return <main>Project A</main>; }' },
      chatHistory: [
        { id: 'a-user', role: 'user', content: 'Build project A' },
        { id: 'a-report', role: 'assistant', content: 'Project A done' },
      ],
      createdAt: '2026-04-18T12:00:00.000Z',
      updatedAt: '2026-04-18T12:00:00.000Z',
      version: 1,
      activeBranchId: 'main',
      branches: {},
    };
    const projectB = {
      id: 'bbbbbbb2-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      name: 'Project B',
      description: 'Latest load',
      theme: 'dark-slate',
      files: { 'src/App.tsx': 'export default function App() { return <main>Project B</main>; }' },
      chatHistory: [
        { id: 'b-user', role: 'user', content: 'Build project B' },
        { id: 'b-plan', role: 'assistant', content: 'Blueprint B ready' },
        { id: 'b-report', role: 'assistant', content: 'Project B done' },
      ],
      createdAt: '2026-04-18T12:00:00.000Z',
      updatedAt: '2026-04-18T12:00:00.000Z',
      version: 1,
      activeBranchId: 'main',
      branches: {},
    };
    let resolveProjectA: ((value: any) => void) | null = null;
    let resolveProjectB: ((value: any) => void) | null = null;

    vi.mocked(ProjectRepository.getProject).mockImplementation((id: string) => new Promise((resolve) => {
      if (id === projectA.id) {
        resolveProjectA = resolve;
        return;
      }
      if (id === projectB.id) {
        resolveProjectB = resolve;
        return;
      }
      resolve(null);
    }));

    render(React.createElement(StudioLifecycleHarness, {
      onRender: (studio) => {
        latestStudio = studio;
      },
    }));

    await waitFor(() => expect(latestStudio).not.toBeNull());

    act(() => {
      void latestStudio!.loadProject({ id: projectA.id });
    });

    act(() => {
      void latestStudio!.loadProject({ id: projectB.id });
    });

    await act(async () => {
      resolveProjectB?.(projectB as any);
    });

    await waitFor(() => {
      expect(latestStudio!.currentProjectId).toBe(projectB.id);
      expect(latestStudio!.messages.map(message => message.id)).toEqual(['b-user', 'b-plan', 'b-report']);
      expect(latestStudio!.chatThreadKey).toContain(`project:${projectB.id}:`);
    });

    await act(async () => {
      resolveProjectA?.(projectA as any);
    });

    await waitFor(() => {
      expect(latestStudio!.currentProjectId).toBe(projectB.id);
      expect(latestStudio!.messages.map(message => message.id)).toEqual(['b-user', 'b-plan', 'b-report']);
    });

    expect(vi.mocked(ProjectRepository.loadToPreview)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ProjectRepository.loadToPreview)).toHaveBeenCalledWith(
      expect.objectContaining({ id: projectB.id }),
    );
  });

  it('marks the latest saved report as restorable when the preview snapshot is behind chat history', async () => {
    let latestStudio: StudioHook | null = null;
    const projectId = '66666666-6666-4666-8666-666666666666';
    const loadedHistory = [
      { id: 'msg-user', role: 'user', content: 'Ship dashboard v1' },
      { id: 'msg-report', role: 'assistant', type: 'generation-report', content: 'Built your app!', report: { mode: 'EDIT', filesCreated: [], filesModified: ['src/App.tsx'], pageCount: 1, duration: 7 } },
    ];
    const latestRevisionFiles = {
      'src/App.tsx': 'export default function App() { return <main>New revision</main>; }',
    };

    vi.mocked(ProjectRepository.getProject).mockResolvedValue({
      id: projectId,
      name: 'Dash',
      description: 'Needs reconciliation',
      theme: 'dark-slate',
      files: { 'src/App.tsx': 'export default function App() { return <main>Old preview</main>; }' },
      chatHistory: loadedHistory as any,
      createdAt: '2026-04-18T12:00:00.000Z',
      updatedAt: '2026-04-18T12:00:00.000Z',
      version: 1,
      activeBranchId: 'main',
      branches: {
        main: {
          id: 'main',
          projectId,
          name: 'main',
          isDefault: true,
          createdAt: '2026-04-18T12:00:00.000Z',
          updatedAt: '2026-04-18T12:00:00.000Z',
          headRevisionId: 'rev-old',
          files: { 'src/App.tsx': 'export default function App() { return <main>Old preview</main>; }' },
          chatHistory: loadedHistory as any,
          revisions: [{
            id: 'rev-latest',
            prompt: 'Ship dashboard v1',
            source: 'chat',
            files: latestRevisionFiles,
            createdAt: '2026-04-18T12:05:00.000Z',
            isBookmarked: false,
          }],
          architecture: {} as any,
        },
      },
    } as any);

    render(React.createElement(StudioLifecycleHarness, {
      onRender: (studio) => {
        latestStudio = studio;
      },
    }));

    await waitFor(() => expect(latestStudio).not.toBeNull());

    await act(async () => {
      await latestStudio!.loadProject({ id: projectId });
    });

    await waitFor(() => {
      const reportMessage = latestStudio!.messages.find(message => message.id === 'msg-report');
      expect(reportMessage?.revisionId).toBe('rev-latest');
      expect(reportMessage?.restoreAvailable).toBe(true);
    });
  });

  it('restores the revision linked from chat history and clears the restore CTA', async () => {
    let latestStudio: StudioHook | null = null;
    const projectId = '77777777-7777-4777-8777-777777777777';
    const loadedHistory = [
      { id: 'msg-user', role: 'user', content: 'Ship dashboard v1' },
      {
        id: 'msg-report',
        role: 'assistant',
        type: 'generation-report',
        content: 'Built your app!',
        revisionId: 'rev-latest',
        restoreAvailable: true,
        report: {
          mode: 'EDIT',
          filesCreated: [],
          filesModified: ['src/App.tsx'],
          pageCount: 1,
          duration: 7,
        },
      },
    ];
    const latestRevisionFiles = {
      'src/App.tsx': 'export default function App() { return <main>New revision</main>; }',
    };
    const projectRecord = {
      id: projectId,
      name: 'Dash',
      description: 'Needs reconciliation',
      theme: 'dark-slate',
      files: { 'src/App.tsx': 'export default function App() { return <main>Old preview</main>; }' },
      chatHistory: loadedHistory as any,
      createdAt: '2026-04-18T12:00:00.000Z',
      updatedAt: '2026-04-18T12:00:00.000Z',
      version: 1,
      activeBranchId: 'main',
      branches: {
        main: {
          id: 'main',
          projectId,
          name: 'main',
          isDefault: true,
          createdAt: '2026-04-18T12:00:00.000Z',
          updatedAt: '2026-04-18T12:00:00.000Z',
          headRevisionId: 'rev-old',
          files: { 'src/App.tsx': 'export default function App() { return <main>Old preview</main>; }' },
          chatHistory: loadedHistory as any,
          revisions: [{
            id: 'rev-latest',
            prompt: 'Ship dashboard v1',
            source: 'chat',
            files: latestRevisionFiles,
            createdAt: '2026-04-18T12:05:00.000Z',
            isBookmarked: false,
          }],
          architecture: {} as any,
        },
      },
    };

    vi.mocked(ProjectRepository.getProject).mockResolvedValue(projectRecord as any);
    const materializePersistedFilesSpy = vi.spyOn(revisionManager, 'materializePersistedFiles').mockResolvedValue('build-restored');

    render(React.createElement(StudioLifecycleHarness, {
      onRender: (studio) => {
        latestStudio = studio;
      },
    }));

    await waitFor(() => expect(latestStudio).not.toBeNull());

    await act(async () => {
      await latestStudio!.loadProject({ id: projectId });
    });

    await act(async () => {
      await latestStudio!.restoreMessageRevision('msg-report');
    });

    await waitFor(() => {
      expect(latestStudio!.files).toEqual(latestRevisionFiles);
      const reportMessage = latestStudio!.messages.find(message => message.id === 'msg-report');
      expect(reportMessage?.restoreAvailable).toBe(false);
    });

    expect(materializePersistedFilesSpy).toHaveBeenCalledWith(
      latestRevisionFiles,
      expect.objectContaining({
        source: 'useStudio.restoreMessageRevision',
        projectId,
      }),
    );
    expect(vi.mocked(ProjectStorage.saveProject)).toHaveBeenCalledWith(expect.objectContaining({
      files: latestRevisionFiles,
      branches: expect.objectContaining({
        main: expect.objectContaining({
          files: latestRevisionFiles,
          headRevisionId: 'rev-latest',
        }),
      }),
    }));
    expect(vi.mocked(ProjectRepository.saveProject)).toHaveBeenCalledWith(expect.objectContaining({
      id: projectId,
      files: latestRevisionFiles,
    }));
  });

  it('restores the last saved revision from a historical blueprint lineage', async () => {
    let latestStudio: StudioHook | null = null;
    const projectId = '88888888-8888-4888-8888-888888888888';
    const oldRevisionFiles = {
      'src/App.tsx': 'export default function App() { return <main>Legacy lineage</main>; }',
    };
    const currentRevisionFiles = {
      'src/App.tsx': 'export default function App() { return <main>Current lineage</main>; }',
    };
    const loadedHistory = [
      {
        id: 'bp-old',
        role: 'assistant',
        type: 'blueprint',
        content: 'Legacy blueprint',
        startsLineage: true,
        lineageId: 'lineage:bp-old',
        lineageRootMessageId: 'bp-old',
      },
      {
        id: 'report-old',
        role: 'assistant',
        type: 'generation-report',
        content: 'Built legacy',
        revisionId: 'rev-old',
        lineageId: 'lineage:bp-old',
        lineageRootMessageId: 'bp-old',
        report: { mode: 'EDIT', filesCreated: [], filesModified: ['src/App.tsx'], pageCount: 1, duration: 5 },
      },
      {
        id: 'bp-new',
        role: 'assistant',
        type: 'blueprint',
        content: 'Current blueprint',
        startsLineage: true,
        lineageId: 'lineage:bp-new',
        lineageRootMessageId: 'bp-new',
      },
      {
        id: 'report-new',
        role: 'assistant',
        type: 'generation-report',
        content: 'Built current',
        revisionId: 'rev-new',
        lineageId: 'lineage:bp-new',
        lineageRootMessageId: 'bp-new',
        report: { mode: 'EDIT', filesCreated: [], filesModified: ['src/App.tsx'], pageCount: 1, duration: 5 },
      },
    ];
    const projectRecord = {
      id: projectId,
      name: 'Dash',
      description: 'Needs blueprint rollback',
      theme: 'dark-slate',
      files: currentRevisionFiles,
      chatHistory: loadedHistory as any,
      createdAt: '2026-04-18T12:00:00.000Z',
      updatedAt: '2026-04-18T12:00:00.000Z',
      version: 1,
      activeBranchId: 'main',
      branches: {
        main: {
          id: 'main',
          projectId,
          name: 'main',
          isDefault: true,
          createdAt: '2026-04-18T12:00:00.000Z',
          updatedAt: '2026-04-18T12:00:00.000Z',
          headRevisionId: 'rev-new',
          activeLineageId: 'lineage:bp-new',
          files: currentRevisionFiles,
          chatHistory: loadedHistory as any,
          revisions: [
            {
              id: 'rev-new',
              prompt: 'Refresh dashboard',
              source: 'chat',
              files: currentRevisionFiles,
              createdAt: '2026-04-18T12:10:00.000Z',
              isBookmarked: false,
              lineageId: 'lineage:bp-new',
              lineageRootMessageId: 'bp-new',
              reportMessageId: 'report-new',
            },
            {
              id: 'rev-old',
              prompt: 'Legacy dashboard',
              source: 'chat',
              files: oldRevisionFiles,
              createdAt: '2026-04-18T12:05:00.000Z',
              isBookmarked: false,
              lineageId: 'lineage:bp-old',
              lineageRootMessageId: 'bp-old',
              reportMessageId: 'report-old',
            },
          ],
          architecture: {} as any,
        },
      },
    };

    vi.mocked(ProjectRepository.getProject).mockResolvedValue(projectRecord as any);
    const materializePersistedFilesSpy = vi.spyOn(revisionManager, 'materializePersistedFiles').mockResolvedValue('build-restored-blueprint');

    render(React.createElement(StudioLifecycleHarness, {
      onRender: (studio) => {
        latestStudio = studio;
      },
    }));

    await waitFor(() => expect(latestStudio).not.toBeNull());

    await act(async () => {
      await latestStudio!.loadProject({ id: projectId });
    });

    await waitFor(() => {
      const legacyBlueprint = latestStudio!.messages.find(message => message.id === 'bp-old');
      expect(legacyBlueprint?.restoreAvailable).toBe(true);
      expect(legacyBlueprint?.lineageStatus).toBe('historical');
    });

    await act(async () => {
      await latestStudio!.restoreBlueprintLineage('bp-old');
    });

    await waitFor(() => {
      expect(latestStudio!.files).toEqual(oldRevisionFiles);
      const legacyBlueprint = latestStudio!.messages.find(message => message.id === 'bp-old');
      expect(legacyBlueprint?.restoreAvailable).toBe(false);
      expect(legacyBlueprint?.lineageStatus).toBe('current');
    });

    expect(materializePersistedFilesSpy).toHaveBeenCalledWith(
      oldRevisionFiles,
      expect.objectContaining({
        source: 'useStudio.restoreBlueprintLineage',
        projectId,
      }),
    );
    expect(vi.mocked(ProjectStorage.saveProject)).toHaveBeenCalledWith(expect.objectContaining({
      files: oldRevisionFiles,
      branches: expect.objectContaining({
        main: expect.objectContaining({
          files: oldRevisionFiles,
          headRevisionId: 'rev-old',
          activeLineageId: 'lineage:bp-old',
        }),
      }),
    }));
  });

  it('treats start-over prompts in existing projects as a fresh lineage kickoff', async () => {
    let latestStudio: StudioHook | null = null;
    const projectId = '89898989-8989-4898-8898-898989898989';
    const persistedProject = {
      id: projectId,
      name: 'Existing app',
      description: 'Existing project',
      theme: 'dark-slate',
      files: { 'src/App.tsx': 'export default function App() { return <main>Existing</main>; }' },
      chatHistory: [
        {
          id: 'bp-old',
          role: 'assistant',
          type: 'blueprint',
          content: 'Current blueprint',
          startsLineage: true,
          lineageId: 'lineage:bp-old',
          lineageRootMessageId: 'bp-old',
        },
        {
          id: 'report-old',
          role: 'assistant',
          type: 'generation-report',
          content: 'Built current',
          revisionId: 'rev-old',
          lineageId: 'lineage:bp-old',
          lineageRootMessageId: 'bp-old',
          report: { mode: 'EDIT', filesCreated: [], filesModified: ['src/App.tsx'], pageCount: 1, duration: 5 },
        },
      ] as any,
      createdAt: '2026-04-18T12:00:00.000Z',
      updatedAt: '2026-04-18T12:00:00.000Z',
      version: 1,
      activeBranchId: 'main',
      branches: {
        main: {
          id: 'main',
          projectId,
          name: 'main',
          isDefault: true,
          createdAt: '2026-04-18T12:00:00.000Z',
          updatedAt: '2026-04-18T12:00:00.000Z',
          headRevisionId: 'rev-old',
          activeLineageId: 'lineage:bp-old',
          files: { 'src/App.tsx': 'export default function App() { return <main>Existing</main>; }' },
          chatHistory: [
            {
              id: 'bp-old',
              role: 'assistant',
              type: 'blueprint',
              content: 'Current blueprint',
              startsLineage: true,
              lineageId: 'lineage:bp-old',
              lineageRootMessageId: 'bp-old',
            },
            {
              id: 'report-old',
              role: 'assistant',
              type: 'generation-report',
              content: 'Built current',
              revisionId: 'rev-old',
              lineageId: 'lineage:bp-old',
              lineageRootMessageId: 'bp-old',
              report: { mode: 'EDIT', filesCreated: [], filesModified: ['src/App.tsx'], pageCount: 1, duration: 5 },
            },
          ] as any,
          revisions: [{
            id: 'rev-old',
            prompt: 'Current app',
            source: 'chat',
            files: { 'src/App.tsx': 'export default function App() { return <main>Existing</main>; }' },
            createdAt: '2026-04-18T12:05:00.000Z',
            isBookmarked: false,
            lineageId: 'lineage:bp-old',
            lineageRootMessageId: 'bp-old',
            reportMessageId: 'report-old',
          }],
          architecture: {} as any,
        },
      },
    };

    configureKickoffArchitectMocks();
    vi.mocked(ProjectRepository.getProject).mockResolvedValue(persistedProject as any);
    vi.mocked(ProjectStorage.getProject).mockImplementation((id: string) =>
      id === projectId ? (persistedProject as any) : null,
    );
    vi.mocked(ProjectStorage.projectDataExists).mockImplementation((id: string) => id === projectId);
    generationPipelineMock.generatePlan.mockResolvedValue({
      appName: 'Restarted app',
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
      expect(Object.keys(config.files)).toEqual(['_projectId']);
      expect(config.singlePageSafeMode).toBe(true);
      emitKickoffPlanReady(config);
      const approval = await config.waitForConfirmation(makeKickoffGenerationPlan());
      expect(approval).toEqual(expect.objectContaining({ confirmed: true }));
      return {
        status: 'success',
        message: 'Built your app!',
        operations: [{
          op: 'upsert',
          name: 'src/App.tsx',
          content: 'export default function App() { return <main>Restarted</main>; }',
        }],
        graph: { files: [] },
        plan: makeKickoffGenerationPlan(),
        planTheme: 'dark-slate',
        qualitySummary: { severity: 'none' },
      } as any;
    });

    render(React.createElement(StudioLifecycleHarness, {
      onRender: (studio) => {
        latestStudio = studio;
      },
    }));

    await waitFor(() => expect(latestStudio).not.toBeNull());

    await act(async () => {
      await latestStudio!.loadProject({ id: projectId });
    });

    await waitFor(() => {
      expect(latestStudio!.currentProjectId).toBe(projectId);
    });

    act(() => {
      latestStudio!.setInput('Start over with a brand new dashboard');
    });

    await act(async () => {
      void latestStudio!.handleSend();
    });

    await waitFor(() => {
      expect(latestStudio!.pendingPlan?.architectKickoff?.selectedOptionId).toBe('core');
    });

    await act(async () => {
      await latestStudio!.confirmPlan();
    });

    await waitFor(() => {
      const blueprintMessages = latestStudio!.messages.filter(message =>
        message.type === 'blueprint' && message.startsLineage === true,
      );
      expect(blueprintMessages.length).toBeGreaterThan(1);
      const newestBlueprint = blueprintMessages[blueprintMessages.length - 1];
      expect(newestBlueprint.lineageId).toBeTruthy();
      expect(newestBlueprint.lineageId).not.toBe('lineage:bp-old');
    });
  });
});

describe('Draft persistence guard', () => {
  it('silently aborts the active generation when starting a new project', async () => {
    let latestStudio: StudioHook | null = null;
    configureKickoffArchitectMocks();
    vi.spyOn(revisionManager, 'createEmptyCandidate').mockResolvedValue('candidate:test');

    generationPipelineMock.generatePlan.mockResolvedValue({
      appName: 'Abort Test',
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
      await config.waitForConfirmation(plan);
      await new Promise((_, reject) => {
        config.signal.addEventListener('abort', () => {
          reject(new DOMException('Context switched', 'AbortError'));
        }, { once: true });
      });
      return {
        status: 'aborted',
        message: 'aborted',
        operations: [],
        graph: { files: [] },
        plan,
        planTheme: 'dark-slate',
        qualitySummary: { severity: 'none' },
      };
    });

    render(React.createElement(StudioLifecycleHarness, {
      onRender: (studio) => {
        latestStudio = studio;
      },
    }));

    await waitFor(() => expect(latestStudio).not.toBeNull());

    act(() => {
      latestStudio!.setInput('build a simple todo app');
    });

    await act(async () => {
      void latestStudio!.handleSend();
    });

    await waitFor(() => {
      expect(latestStudio!.pendingPlan?.architectKickoff?.selectedOptionId).toBe('core');
    });

    await act(async () => {
      await latestStudio!.confirmPlan();
    });

    await waitFor(() => {
      expect(latestStudio!.isGenerating).toBe(true);
    });

    await act(async () => {
      await latestStudio!.createNewProject();
    });

    await waitFor(() => {
      expect(latestStudio!.currentProjectId).toMatch(/^draft_/);
      expect(latestStudio!.isGenerating).toBe(false);
    });

    expect(latestStudio!.messages.some(message =>
      String(message.content).includes('⚡ Остановлено.'),
    )).toBe(false);
  }, 10_000);

  it('silently aborts the active generation and hydrates the selected project history on switchProject', async () => {
    let latestStudio: StudioHook | null = null;
    const projectId = '55555555-5555-4555-8555-555555555555';
    const loadedHistory = [
      { id: 'msg-user', role: 'user', content: 'Build project B' },
      { id: 'msg-plan', role: 'assistant', type: 'blueprint', content: 'Blueprint B ready' },
      { id: 'msg-report', role: 'assistant', type: 'generation-report', content: 'Built project B!' },
    ];

    configureKickoffArchitectMocks();
    vi.mocked(ProjectStorage.projectDataExists).mockImplementation((id: string) => id === projectId);
    vi.mocked(ProjectRepository.getProject).mockResolvedValue({
      id: projectId,
      name: 'Project B',
      description: 'Hydrated after switch',
      theme: 'dark-slate',
      files: { 'src/App.tsx': 'export default function App() { return <main>Project B</main>; }' },
      chatHistory: loadedHistory as any,
      createdAt: '2026-04-18T12:00:00.000Z',
      updatedAt: '2026-04-18T12:00:00.000Z',
      version: 1,
      activeBranchId: 'main',
      branches: {
        main: {
          id: 'main',
          projectId,
          name: 'main',
          isDefault: true,
          createdAt: '2026-04-18T12:00:00.000Z',
          updatedAt: '2026-04-18T12:00:00.000Z',
          files: { 'src/App.tsx': 'export default function App() { return <main>Project B</main>; }' },
          chatHistory: loadedHistory as any,
          revisions: [],
          architecture: {} as any,
        },
      },
    } as any);
    generationPipelineMock.generatePlan.mockResolvedValue({
      appName: 'Abort Test',
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
      await config.waitForConfirmation(plan);
      await new Promise((_, reject) => {
        config.signal.addEventListener('abort', () => {
          reject(new DOMException('Context switched', 'AbortError'));
        }, { once: true });
      });
      return {
        status: 'aborted',
        message: 'aborted',
        operations: [],
        graph: { files: [] },
        plan,
        planTheme: 'dark-slate',
        qualitySummary: { severity: 'none' },
      };
    });

    render(React.createElement(StudioLifecycleHarness, {
      onRender: (studio) => {
        latestStudio = studio;
      },
    }));

    await waitFor(() => expect(latestStudio).not.toBeNull());

    act(() => {
      latestStudio!.setInput('build a simple todo app');
    });

    await act(async () => {
      void latestStudio!.handleSend();
    });

    await waitFor(() => {
      expect(latestStudio!.pendingPlan?.architectKickoff?.selectedOptionId).toBe('core');
    });

    await act(async () => {
      await latestStudio!.confirmPlan();
    });

    await waitFor(() => {
      expect(latestStudio!.isGenerating).toBe(true);
    });

    await act(async () => {
      await latestStudio!.switchProject({ id: projectId });
    });

    await waitFor(() => {
      expect(latestStudio!.currentProjectId).toBe(projectId);
      expect(latestStudio!.isGenerating).toBe(false);
      expect(latestStudio!.messages.map(message => message.id)).toEqual(['msg-user', 'msg-plan', 'msg-report']);
      expect(latestStudio!.chatThreadKey).toContain(`project:${projectId}:`);
    });

    expect(latestStudio!.messages.some(message =>
      String(message.content).includes('⚡ Остановлено.'),
    )).toBe(false);
  }, 10_000);

  it('keeps blocked generation as in-session draft and does not persist before explicit Save', async () => {
    configureBlockedPreviewKickoffGeneration();

    let latestStudio: StudioHook | null = null;

    render(React.createElement(StudioLifecycleHarness, {
      onRender: (studio) => {
        latestStudio = studio;
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
      expect(latestStudio!.isGenerating).toBe(false);
      expect(latestStudio!.previewLifecycle).toBe('blocked');
      expect(latestStudio!.pendingProjectSave?.previewReady).toBe(false);
      expect(latestStudio!.persistedProjectExists).not.toBe(true);
    });

    expect(vi.mocked(ProjectStorage.saveProject)).not.toHaveBeenCalled();
    expect(vi.mocked(ProjectRepository.saveProject)).not.toHaveBeenCalled();
  });

  it('keeps draft-only state before preview-ready and persists exactly once after explicit save', async () => {
    configureCompletedKickoffGeneration();

    let latestStudio: StudioHook | null = null;

    render(React.createElement(StudioLifecycleHarness, {
      onRender: (studio) => {
        latestStudio = studio;
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
      expect(generationRunGate.release).toBeTypeOf('function');
    });

    await act(async () => {
      generationRunGate.release?.();
    });

    await waitFor(() => {
      expect(latestStudio!.isGenerating).toBe(false);
      expect(latestStudio!.pendingProjectSave?.previewReady).toBe(false);
    });

    await act(async () => {
      expect(latestStudio!.savePendingProject()).toBe(false);
    });
    expect(vi.mocked(ProjectStorage.saveProject)).not.toHaveBeenCalled();
    expect(vi.mocked(ProjectRepository.saveProject)).not.toHaveBeenCalled();

    act(() => {
      previewController.notifyReady('test-build', 'unit-test');
    });

    await waitFor(() => {
      expect(latestStudio!.previewLifecycle).toBe('preview-ready');
      expect(latestStudio!.pendingProjectSave?.previewReady).toBe(true);
    });

    await act(async () => {
      expect(latestStudio!.savePendingProject()).toBe(true);
    });

    await act(async () => {
      expect(latestStudio!.savePendingProject()).toBe(false);
    });

    expect(vi.mocked(ProjectRepository.saveProject)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ProjectStorage.saveProject)).toHaveBeenCalledTimes(1);
    const saveArg = vi.mocked(ProjectStorage.saveProject).mock.calls[0]?.[0] as { name?: string; chatHistory?: any[] } | undefined;
    expect((saveArg?.name ?? '').trim().length).toBeGreaterThan(0);
    expect(Array.isArray(saveArg?.chatHistory)).toBe(true);
    expect(saveArg?.chatHistory?.some((message: any) => message.type === 'blueprint')).toBe(true);
    expect(saveArg?.chatHistory?.some((message: any) => message.type === 'generation-report')).toBe(true);
  }, 10_000);

  it('clears the pending save only after explicit reject without persisting the project', async () => {
    configureCompletedKickoffGeneration();

    let latestStudio: StudioHook | null = null;

    render(React.createElement(StudioLifecycleHarness, {
      onRender: (studio) => {
        latestStudio = studio;
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
      expect(generationRunGate.release).toBeTypeOf('function');
    });

    await act(async () => {
      generationRunGate.release?.();
    });

    act(() => {
      previewController.notifyReady('test-build', 'unit-test');
    });

    await waitFor(() => {
      expect(latestStudio!.pendingProjectSave?.previewReady).toBe(true);
    });

    await act(async () => {
      expect(latestStudio!.rejectPendingProjectSave()).toBe(true);
    });

    expect(latestStudio!.pendingProjectSave).toBeNull();
    expect(latestStudio!.savePendingProject()).toBe(false);
    expect(vi.mocked(ProjectStorage.saveProject)).not.toHaveBeenCalled();
    expect(vi.mocked(ProjectRepository.saveProject)).not.toHaveBeenCalled();
  }, 10_000);
});

describe('launchWithPlan context handoff', () => {
  it('adds trend-niche brief into composer context and chat state', async () => {
    let latestStudio: StudioHook | null = null;
    const createEmptyCandidateSpy = vi.spyOn(revisionManager, 'createEmptyCandidate').mockResolvedValue('candidate:test');

    render(
      React.createElement(StudioLifecycleHarness, {
        onRender: (studio) => {
          latestStudio = studio;
        },
      }),
    );

    await waitFor(() => expect(latestStudio).not.toBeNull());

    await act(async () => {
      await latestStudio!.launchWithPlan({
        appName: 'Разговорный английский',
        description: 'Приложение для ежедневной тренировки живой речи.',
        theme: 'dark-slate',
        layout: { type: 'tabs', navigation: 'bottom-tabs' },
        pages: [],
        shadcnComponents: [],
        icons: [],
      } as any, 'Founder-ready brief\n\nНазвание: Разговорный английский', 'trend-niche');
    });

    await waitFor(() => {
      expect(latestStudio!.composerContextItems).toHaveLength(1);
      expect(latestStudio!.composerContextItems[0].source).toBe('trend-niche');
      expect(latestStudio!.composerContextItems[0].title).toBe('Разговорный английский');
      expect(latestStudio!.input).toContain('Founder-ready brief');
      expect(latestStudio!.messages.some((message) =>
        typeof message.content === 'string' && message.content.includes('Context added: **Разговорный английский**'),
      )).toBe(true);
      expect(latestStudio!.currentProjectId).toMatch(/^draft_/);
    });

    expect(createEmptyCandidateSpy).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('CURRENT_PROJECT_ID')).toBeNull();
    expect(localStorage.getItem('AIC_DRAFT_SESSION_ID')).toBe(latestStudio!.currentProjectId);
    expect(vi.mocked(ProjectStorage.saveProject)).not.toHaveBeenCalled();
    expect(vi.mocked(ProjectRepository.saveProject)).not.toHaveBeenCalled();
  });
});

describe('Founder packaged build auto-start', () => {
  it('auto-confirms packaged trend builds without entering awaiting_confirmation', async () => {
    let latestStudio: StudioHook | null = null;
    const phases: string[] = [];
    const approvalHolder: { value: any } = { value: null };

    vi.spyOn(revisionManager, 'createEmptyCandidate').mockResolvedValue('candidate:test');
    configureKickoffArchitectMocks();

    generationPipelineMock.generatePlan.mockResolvedValue({
      appName: 'Founder Builder',
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
      approvalHolder.value = await config.waitForConfirmation(plan);
      config.onPhase?.({ phase: 'think', progress: 20 });
      config.onPhase?.({ phase: 'idle', progress: 100 });
      return {
        status: 'success',
        message: 'Built your app!',
        operations: [
          {
            op: 'upsert',
            name: 'src/App.tsx',
            content: 'export default function App() { return <main>Founder Build</main>; }',
          },
        ],
        graph: { files: [] },
        plan,
        planTheme: 'dark-slate',
        qualitySummary: { severity: 'none' },
      };
    });

    render(
      React.createElement(StudioLifecycleHarness, {
        onRender: (studio) => {
          latestStudio = studio;
          phases.push(studio.kickoffPhase);
        },
      }),
    );

    await waitFor(() => expect(latestStudio).not.toBeNull());

    await act(async () => {
      await latestStudio!.launchWithPlan({
        appName: 'Founder Builder',
        description: 'Packaged founder blueprint',
        theme: 'dark-slate',
        layout: { type: 'tabs', navigation: 'bottom-tabs' },
        pages: [{ name: 'Home', path: '/', file: 'src/pages/Home.tsx' }],
        shadcnComponents: [],
        icons: [],
      } as any, 'Build packaged founder trend idea', 'trend-niche');
      await latestStudio!.handleSend();
    });

    await waitFor(() => {
      expect(approvalHolder.value).toEqual(expect.objectContaining({ confirmed: true }));
    });

    expect(latestStudio!.pendingPlan).toBeNull();
    expect(phases).not.toContain('awaiting_confirmation');
    expect(latestStudio!.messages.some((message) =>
      typeof message.content === 'string' &&
      message.content.includes('Packaged trend idea confirmed automatically'),
    )).toBe(false);
  });
});

describe('Direct chat context import', () => {
  it('imports trend brief into a fresh isolated draft session without persistence', async () => {
    let latestStudio: StudioHook | null = null;
    const createEmptyCandidateSpy = vi.spyOn(revisionManager, 'createEmptyCandidate').mockResolvedValue('candidate:test');

    render(
      React.createElement(StudioLifecycleHarness, {
        onRender: (studio) => {
          latestStudio = studio;
        },
      }),
    );

    await waitFor(() => expect(latestStudio).not.toBeNull());

    await act(async () => {
      await latestStudio!.startTrendIdeaDraftSession('chat');
      latestStudio!.setChatContext('Founder-ready brief for discussion', 'trend-niche');
    });

    await waitFor(() => {
      expect(latestStudio!.composerContextItems).toHaveLength(1);
      expect(latestStudio!.composerContextItems[0].source).toBe('trend-niche');
      expect(latestStudio!.input).toContain('Founder-ready brief for discussion');
      expect(latestStudio!.currentProjectId).toMatch(/^draft_/);
    });

    expect(latestStudio!.persistedProjectExists).not.toBe(true);
    expect(createEmptyCandidateSpy).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ProjectStorage.saveProject)).not.toHaveBeenCalled();
    expect(vi.mocked(ProjectRepository.saveProject)).not.toHaveBeenCalled();
    expect(localStorage.getItem('CURRENT_PROJECT_ID')).toBeNull();
    expect(localStorage.getItem('AIC_DRAFT_SESSION_ID')).toBe(latestStudio!.currentProjectId);
    expect(latestStudio!.messages.some((message) =>
      typeof message.content === 'string' && message.content.includes('Failed to import trend brief'),
    )).toBe(false);
  });

  it('does not auto-save the current persisted project when a trend draft starts', async () => {
    let latestStudio: StudioHook | null = null;
    const persistedProjectId = '22222222-2222-4222-8222-222222222222';
    const persistedProject = {
      id: persistedProjectId,
      name: 'Saved Project',
      description: 'Already persisted',
      theme: 'dark-slate',
      files: { 'src/App.tsx': 'export default function App() { return <main>Saved Project</main>; }' },
      chatHistory: [{ role: 'assistant', content: 'Saved project chat' }],
      createdAt: '2026-04-18T12:00:00.000Z',
      updatedAt: '2026-04-18T12:00:00.000Z',
      version: 1,
      activeBranchId: 'main',
    };

    vi.spyOn(revisionManager, 'createEmptyCandidate').mockResolvedValue('candidate:test');
    vi.mocked(ProjectStorage.listProjects).mockReturnValue([{
      id: persistedProjectId,
      name: 'Saved Project',
      description: 'Already persisted',
      theme: 'dark-slate',
      createdAt: persistedProject.createdAt,
      updatedAt: persistedProject.updatedAt,
      activeBranchId: 'main',
      branchIds: ['main'],
      branchCount: 1,
    } as any]);
    vi.mocked(ProjectStorage.projectDataExists).mockImplementation((id: string) => id === persistedProjectId);
    vi.mocked(ProjectStorage.getProject).mockImplementation((id: string) => (
      id === persistedProjectId ? persistedProject as any : null
    ));
    vi.mocked(ProjectRepository.listProjects).mockResolvedValue([{
      id: persistedProjectId,
      name: 'Saved Project',
      theme: 'dark-slate',
      updatedAt: persistedProject.updatedAt,
      version: 1,
      activeBranchId: 'main',
      branchIds: ['main'],
      branchCount: 1,
    }]);
    vi.mocked(ProjectRepository.getProject).mockResolvedValue(persistedProject as any);
    localStorage.setItem('CURRENT_PROJECT_ID', persistedProjectId);
    localStorage.setItem('aic-current-project', persistedProjectId);

    render(
      React.createElement(StudioLifecycleHarness, {
        onRender: (studio) => {
          latestStudio = studio;
        },
      }),
    );

    await waitFor(() => {
      expect(latestStudio!.currentProjectId).toBe(persistedProjectId);
      expect(latestStudio!.persistedProjectExists).toBe(true);
    });

    vi.clearAllMocks();
    vi.spyOn(revisionManager, 'createEmptyCandidate').mockResolvedValue('candidate:test');

    await act(async () => {
      await latestStudio!.startTrendIdeaDraftSession('chat');
    });

    await waitFor(() => {
      expect(latestStudio!.currentProjectId).toMatch(/^draft_/);
      expect(latestStudio!.persistedProjectExists).not.toBe(true);
    });

    expect(vi.mocked(ProjectStorage.saveProject)).not.toHaveBeenCalled();
    expect(vi.mocked(ProjectRepository.saveProject)).not.toHaveBeenCalled();
    expect(localStorage.getItem('CURRENT_PROJECT_ID')).toBeNull();
    expect(localStorage.getItem('AIC_DRAFT_SESSION_ID')).toBe(latestStudio!.currentProjectId);
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
