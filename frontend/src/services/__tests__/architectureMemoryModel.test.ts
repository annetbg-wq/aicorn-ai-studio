import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../RevisionManager', () => ({
  revisionManager: {
    materializePersistedFiles: vi.fn(),
  },
}));

vi.mock('../projectCorruptionScan', () => ({
  scanBeforePreviewLoad: vi.fn(() => ({ safe: true, findings: [] })),
}));

import { ProjectStorage, type StoredProject } from '../ProjectStorage';
import {
  ARCHITECTURE_MEMORY_MODEL_VERSION,
  canTransitionArchitectureStatus,
  createArchitectureSnapshotFromBranchArchitecture,
  createProjectBranchArchitecture,
  getCurrentArchitectureDecisions,
  normalizeProjectBranchArchitecture,
  parseArchitectureSnapshot,
  serializeArchitectureSnapshot,
  type ArchitectureDecision,
  type ArchitectureSnapshot,
  type CapabilityManifest,
  type DeferredItem,
  type ImplementationPlan,
  type PlanStep,
} from '../../shared/projectModel';

describe('architecture memory model', () => {
  const now = '2026-04-17T10:00:00.000Z';
  const createLocalStorageMock = () => {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
      key: (index: number) => Object.keys(store)[index] ?? null,
      get length() {
        return Object.keys(store).length;
      },
    };
  };

  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock());
    localStorage.clear();
  });

  it('keeps architecture memory branch-scoped in persistence', () => {
    const mainArchitecture = createProjectBranchArchitecture('proj-1', 'main', 'main', now);
    const featureArchitecture = createProjectBranchArchitecture('proj-1', 'feature-auth', 'feature-auth', now);

    featureArchitecture.branch.summary = 'Auth branch';
    featureArchitecture.architectureDecisions = [
      {
        id: 'decision-auth-stack',
        projectId: 'proj-1',
        branchId: 'feature-auth',
        phase: 'pre_build_draft',
        title: 'Use server-backed auth',
        summary: 'Auth capability is accepted on the feature branch.',
        status: 'accepted',
        category: 'security',
        affectedCapabilityIds: ['auth', 'backend'],
        createdAt: now,
        updatedAt: now,
      },
    ];

    const project: StoredProject = {
      id: 'proj-1',
      name: 'Studio',
      description: 'Architecture memory test',
      theme: 'dark-slate',
      createdAt: now,
      updatedAt: now,
      files: { 'App.tsx': 'root' },
      chatHistory: [],
      activeBranchId: 'feature-auth',
      branches: {
        main: {
          id: 'main',
          projectId: 'proj-1',
          name: 'main',
          isDefault: false,
          createdAt: now,
          updatedAt: now,
          files: { 'App.tsx': 'main branch' },
          chatHistory: [{ role: 'assistant', content: 'main thread' }],
          revisions: [],
          architecture: mainArchitecture,
        },
        'feature-auth': {
          id: 'feature-auth',
          projectId: 'proj-1',
          name: 'feature-auth',
          isDefault: true,
          createdAt: now,
          updatedAt: now,
          files: { 'App.tsx': 'feature branch' },
          chatHistory: [{ role: 'assistant', content: 'feature thread' }],
          revisions: [],
          architecture: featureArchitecture,
        },
      },
    };

    expect(ProjectStorage.saveProject(project)).toBe(true);

    const restored = ProjectStorage.getProject('proj-1');
    expect(restored?.activeBranchId).toBe('feature-auth');
    expect(restored?.files['App.tsx']).toBe('feature branch');
    expect(restored?.branches?.main.files['App.tsx']).toBe('main branch');
    expect(restored?.branches?.['feature-auth'].architecture.architectureDecisions[0].branchId).toBe('feature-auth');
    expect(restored?.branches?.main.architecture.architectureDecisions).toHaveLength(0);
  });

  it('supports the canonical status transitions', () => {
    expect(canTransitionArchitectureStatus('open', 'proposed')).toBe(true);
    expect(canTransitionArchitectureStatus('proposed', 'accepted')).toBe(true);
    expect(canTransitionArchitectureStatus('accepted', 'superseded')).toBe(true);
    expect(canTransitionArchitectureStatus('superseded', 'accepted')).toBe(false);
  });

  it('persists deferred items inside branch architecture memory', () => {
    const architecture = createProjectBranchArchitecture('proj-2', 'scanner', 'scanner', now);
    const deferred: DeferredItem = {
      id: 'deferred-scanner-hardening',
      projectId: 'proj-2',
      branchId: 'scanner',
      phase: 'pre_build_draft',
      title: 'Harden scanner retries',
      summary: 'Keep scanner resilience work in deferred backlog until after build.',
      status: 'deferred',
      reason: 'Needs real device validation',
      relatedCapabilityIds: ['scanner', 'notifications'],
      deferredUntilPhase: 'post_build_actual',
      createdAt: now,
      updatedAt: now,
    };
    architecture.deferredItems = [deferred];

    ProjectStorage.saveProject({
      id: 'proj-2',
      name: 'Scanner',
      description: 'Deferred item test',
      theme: 'dark-slate',
      createdAt: now,
      updatedAt: now,
      files: { 'App.tsx': 'scanner' },
      chatHistory: [],
      activeBranchId: 'scanner',
      branches: {
        scanner: {
          id: 'scanner',
          projectId: 'proj-2',
          name: 'scanner',
          isDefault: true,
          createdAt: now,
          updatedAt: now,
          files: { 'App.tsx': 'scanner' },
          chatHistory: [],
          revisions: [],
          architecture,
        },
      },
    });

    const restored = ProjectStorage.getProject('proj-2');
    expect(restored?.branches?.scanner.architecture.deferredItems).toEqual([deferred]);
  });

  it('preserves accepted and superseded decisions distinctly', () => {
    const accepted: ArchitectureDecision = {
      id: 'decision-storage-v1',
      projectId: 'proj-3',
      branchId: 'main',
      phase: 'pre_build_draft',
      title: 'Use local first storage',
      summary: 'Initial accepted storage direction.',
      status: 'accepted',
      category: 'data',
      affectedCapabilityIds: ['storage'],
      createdAt: now,
      updatedAt: now,
    };
    const superseded: ArchitectureDecision = {
      id: 'decision-storage-v2',
      projectId: 'proj-3',
      branchId: 'main',
      phase: 'pre_build_draft',
      title: 'Switch to branch-aware storage model',
      summary: 'Supersedes the earlier storage-only assumption.',
      status: 'superseded',
      category: 'data',
      affectedCapabilityIds: ['storage', 'backend'],
      supersedesDecisionId: accepted.id,
      createdAt: now,
      updatedAt: now,
    };
    const current: ArchitectureDecision = {
      id: 'decision-storage-v3',
      projectId: 'proj-3',
      branchId: 'main',
      phase: 'post_build_actual',
      title: 'Keep branch-aware storage as canonical',
      summary: 'Accepted actual-state decision after validating branch persistence.',
      status: 'accepted',
      category: 'data',
      affectedCapabilityIds: ['storage', 'backend'],
      supersedesDecisionId: superseded.id,
      createdAt: now,
      updatedAt: now,
    };

    const architecture = normalizeProjectBranchArchitecture(
      {
        architectureDecisions: [accepted, superseded, current],
      },
      'proj-3',
      'main',
      'main',
      now,
    );

    expect(architecture.architectureDecisions[0].status).toBe('accepted');
    expect(architecture.architectureDecisions[1].status).toBe('superseded');
    expect(architecture.architectureDecisions[1].supersedesDecisionId).toBe(accepted.id);
    expect(getCurrentArchitectureDecisions(architecture.architectureDecisions).map(decision => decision.id))
      .toEqual([current.id]);
  });

  it('serializes plan snapshots with planned and actual state separated', () => {
    const steps: PlanStep[] = [
      {
        id: 'step-auth-schema',
        projectId: 'proj-4',
        branchId: 'feature-auth',
        planId: 'plan-auth',
        title: 'Add auth persistence',
        status: 'accepted',
        plannedCapabilityIds: ['auth', 'backend'],
        implementationState: 'planned',
        createdAt: now,
        updatedAt: now,
      },
    ];

    const implementationPlan: ImplementationPlan = {
      id: 'plan-auth',
      projectId: 'proj-4',
      branchId: 'feature-auth',
      title: 'Auth rollout',
      summary: 'Plan auth before build, detect actual state after build.',
      phase: 'pre_build_draft',
      status: 'accepted',
      stepIds: steps.map(step => step.id),
      steps,
      createdAt: now,
      updatedAt: now,
    };

    const capabilityManifest: CapabilityManifest = {
      id: 'manifest-auth',
      projectId: 'proj-4',
      branchId: 'feature-auth',
      title: 'Capabilities',
      phase: 'post_build_actual',
      status: 'accepted',
      capabilities: [
        {
          id: 'cap-auth',
          projectId: 'proj-4',
          branchId: 'feature-auth',
          capabilityId: 'auth',
          title: 'Authentication',
          status: 'accepted',
          plannedState: 'required',
          actualState: 'implemented',
          source: 'mixed',
          createdAt: now,
          updatedAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    const architecture = createProjectBranchArchitecture(
      'proj-4',
      'feature-auth',
      'feature-auth',
      now,
      { chatThreadId: 'thread-auth', headRevisionId: 'rev-auth' },
    );
    architecture.branch.summary = 'Auth branch';
    architecture.branch.status = 'accepted';
    architecture.implementationPlan = implementationPlan;
    architecture.capabilityManifest = capabilityManifest;
    architecture.capabilityDecisions = [
      {
        id: 'cap-decision-auth-plan',
        projectId: 'proj-4',
        branchId: 'feature-auth',
        phase: 'pre_build_draft',
        capabilityId: 'auth',
        title: 'Require auth capability',
        summary: 'Plan the auth capability before build.',
        status: 'accepted',
        plannedState: 'required',
        actualState: 'unknown',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'cap-decision-auth-actual',
        projectId: 'proj-4',
        branchId: 'feature-auth',
        phase: 'post_build_actual',
        capabilityId: 'auth',
        title: 'Auth capability detected',
        summary: 'Actual branch state confirms auth persistence exists.',
        status: 'accepted',
        plannedState: 'required',
        actualState: 'implemented',
        createdAt: now,
        updatedAt: now,
      },
    ];
    architecture.architectureDecisions = [
      {
        id: 'decision-auth-plan',
        projectId: 'proj-4',
        branchId: 'feature-auth',
        phase: 'pre_build_draft',
        title: 'Plan auth service boundaries',
        summary: 'Kickoff planning decision.',
        status: 'accepted',
        category: 'system',
        affectedCapabilityIds: ['auth', 'backend'],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'decision-auth-actual',
        projectId: 'proj-4',
        branchId: 'feature-auth',
        phase: 'post_build_actual',
        title: 'Auth runtime matches branch plan',
        summary: 'Detected branch state after build.',
        status: 'accepted',
        category: 'security',
        affectedCapabilityIds: ['auth'],
        createdAt: now,
        updatedAt: now,
      },
    ];
    architecture.deferredItems = [
      {
        id: 'deferred-auth-sso',
        projectId: 'proj-4',
        branchId: 'feature-auth',
        phase: 'pre_build_draft',
        title: 'Defer SSO',
        summary: 'Keep enterprise auth out of this branch kickoff.',
        status: 'deferred',
        relatedCapabilityIds: ['auth'],
        deferredUntilPhase: 'post_build_actual',
        createdAt: now,
        updatedAt: now,
      },
    ];

    const plannedSnapshot = createArchitectureSnapshotFromBranchArchitecture(
      architecture,
      'pre_build_draft',
      {
        id: 'snapshot-auth-plan',
        createdAt: now,
        sourcePlanId: implementationPlan.id,
      },
    );
    const actualSnapshot = createArchitectureSnapshotFromBranchArchitecture(
      architecture,
      'post_build_actual',
      {
        id: 'snapshot-auth-actual',
        createdAt: '2026-04-18T10:00:00.000Z',
        basedOnRevisionId: 'rev-auth',
        previousSnapshotId: plannedSnapshot.id,
      },
    );

    const restored = parseArchitectureSnapshot(serializeArchitectureSnapshot(actualSnapshot));

    expect(plannedSnapshot.modelVersion).toBe(ARCHITECTURE_MEMORY_MODEL_VERSION);
    expect(plannedSnapshot.implementationPlan?.id).toBe(implementationPlan.id);
    expect(plannedSnapshot.capabilityManifest).toBeNull();
    expect(plannedSnapshot.deferredItems).toHaveLength(1);
    expect(actualSnapshot.implementationPlan).toBeNull();
    expect(actualSnapshot.capabilityManifest?.capabilities[0].plannedState).toBe('required');
    expect(actualSnapshot.capabilityManifest?.capabilities[0].actualState).toBe('implemented');
    expect(restored.phase).toBe('post_build_actual');
    expect(restored.sourcePlanId).toBe(implementationPlan.id);
    expect(restored.previousSnapshotId).toBe(plannedSnapshot.id);
    expect(restored.architectureDecisions[0].phase).toBe('post_build_actual');
  });

  it('saves branch architecture snapshots through storage helpers', () => {
    const architecture = createProjectBranchArchitecture('proj-5', 'main', 'main', now);

    expect(ProjectStorage.saveProject({
      id: 'proj-5',
      name: 'Storage Helpers',
      description: 'Branch architecture helper test',
      theme: 'dark-slate',
      createdAt: now,
      updatedAt: now,
      files: { 'App.tsx': 'main' },
      chatHistory: [],
      activeBranchId: 'main',
      branches: {
        main: {
          id: 'main',
          projectId: 'proj-5',
          name: 'main',
          isDefault: true,
          createdAt: now,
          updatedAt: now,
          files: { 'App.tsx': 'main' },
          chatHistory: [],
          revisions: [],
          architecture,
        },
      },
    })).toBe(true);

    const snapshot: ArchitectureSnapshot = {
      id: 'snapshot-main-actual',
      modelVersion: ARCHITECTURE_MEMORY_MODEL_VERSION,
      projectId: 'proj-5',
      branchId: 'main',
      phase: 'post_build_actual',
      createdAt: now,
      basedOnRevisionId: 'rev-main-actual',
      sourcePlanId: 'plan-main',
      branchBrief: {
        id: 'branch-brief:main',
        projectId: 'proj-5',
        branchId: 'main',
        branchName: 'main',
        summary: 'Main branch',
        status: 'accepted',
        chatThreadId: 'thread-main',
        headRevisionId: 'rev-main-actual',
        createdAt: now,
        updatedAt: now,
      },
      implementationPlan: null,
      capabilityManifest: null,
      capabilityDecisions: [],
      architectureDecisions: [],
      constraints: [],
      openQuestions: [],
      deferredItems: [],
    };

    expect(ProjectStorage.saveBranchArchitectureSnapshot('proj-5', 'main', snapshot)).toBe(true);

    const storedBranch = ProjectStorage.getBranch('proj-5', 'main');
    const storedArchitecture = ProjectStorage.getBranchArchitecture('proj-5', 'main');

    expect(storedBranch?.chatThreadId).toBe('thread-main');
    expect(storedBranch?.headRevisionId).toBe('rev-main-actual');
    expect(storedArchitecture?.actualSnapshot?.id).toBe('snapshot-main-actual');
    expect(storedArchitecture?.snapshots).toHaveLength(1);
  });
});
