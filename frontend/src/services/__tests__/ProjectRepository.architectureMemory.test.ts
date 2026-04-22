import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn().mockReturnThis(),
    })),
  },
}));

vi.mock('../PreviewController', () => ({
  previewLog: vi.fn(),
  setTimelineContext: vi.fn(),
}));

vi.mock('../RevisionManager', () => ({
  revisionManager: {
    materializePersistedFiles: vi.fn(),
  },
}));

vi.mock('../toastBus', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../lib/safeStorage', () => ({
  safeSetItem: vi.fn(),
}));

vi.mock('../projectCorruptionScan', () => ({
  scanBeforePreviewLoad: vi.fn(() => ({ safe: true, findings: [] })),
}));

import { ProjectRepository } from '../ProjectRepository';
import { ArchitectPlannerService, type ArchitectKickoffPlan } from '../ArchitectPlannerService';
import {
  ARCHITECTURE_MEMORY_MODEL_VERSION,
  createArchitectureSnapshotFromBranchArchitecture,
  createProjectBranchArchitecture,
  type CapabilityManifest,
  type ImplementationPlan,
} from '../../shared/projectModel';

describe('ProjectRepository architecture memory helpers', () => {
  const now = '2026-04-17T11:00:00.000Z';

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

  it('reads and writes branch architecture through repository helpers', async () => {
    const architecture = createProjectBranchArchitecture('proj-repo', 'feature-auth', 'feature-auth', now);

    await ProjectRepository.saveProject({
      id: 'proj-repo',
      name: 'Repo Helpers',
      description: 'Repository helper coverage',
      theme: 'dark-slate',
      files: { 'App.tsx': 'feature-auth' },
      chatHistory: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
      activeBranchId: 'feature-auth',
      branches: {
        'feature-auth': {
          id: 'feature-auth',
          projectId: 'proj-repo',
          name: 'feature-auth',
          isDefault: true,
          createdAt: now,
          updatedAt: now,
          files: { 'App.tsx': 'feature-auth' },
          chatHistory: [],
          revisions: [],
          architecture,
        },
      },
    });

    const current = await ProjectRepository.getBranchArchitecture('proj-repo', 'feature-auth');
    expect(current?.modelVersion).toBe(ARCHITECTURE_MEMORY_MODEL_VERSION);

    await ProjectRepository.saveBranchArchitecture('proj-repo', 'feature-auth', {
      ...current!,
      branch: {
        ...current!.branch,
        summary: 'Auth work branch',
        chatThreadId: 'thread-auth',
        headRevisionId: 'rev-auth-1',
      },
    });

    const restored = await ProjectRepository.getProject('proj-repo');
    expect(restored?.branches?.['feature-auth'].architecture.branch.summary).toBe('Auth work branch');
    expect(restored?.branches?.['feature-auth'].chatThreadId).toBe('thread-auth');
    expect(restored?.branches?.['feature-auth'].headRevisionId).toBe('rev-auth-1');
  });

  it('persists planned and actual snapshots through repository helper methods', async () => {
    const architecture = createProjectBranchArchitecture(
      'proj-repo-snap',
      'feature-map',
      'feature-map',
      now,
      { chatThreadId: 'thread-map', headRevisionId: 'rev-map-2' },
    );

    const implementationPlan: ImplementationPlan = {
      id: 'plan-map',
      projectId: 'proj-repo-snap',
      branchId: 'feature-map',
      title: 'Map rollout',
      summary: 'Plan the map capability before build.',
      phase: 'pre_build_draft',
      status: 'accepted',
      stepIds: [],
      steps: [],
      createdAt: now,
      updatedAt: now,
    };

    const capabilityManifest: CapabilityManifest = {
      id: 'manifest-map',
      projectId: 'proj-repo-snap',
      branchId: 'feature-map',
      title: 'Map capability state',
      phase: 'post_build_actual',
      status: 'accepted',
      basedOnRevisionId: 'rev-map-2',
      capabilities: [
        {
          id: 'cap-map',
          projectId: 'proj-repo-snap',
          branchId: 'feature-map',
          capabilityId: 'map',
          title: 'Mapping',
          status: 'accepted',
          plannedState: 'required',
          actualState: 'implemented',
          source: 'detected',
          createdAt: now,
          updatedAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    architecture.implementationPlan = implementationPlan;
    architecture.capabilityManifest = capabilityManifest;

    await ProjectRepository.saveProject({
      id: 'proj-repo-snap',
      name: 'Repo Snapshots',
      description: 'Snapshot helper coverage',
      theme: 'dark-slate',
      files: { 'App.tsx': 'feature-map' },
      chatHistory: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
      activeBranchId: 'feature-map',
      branches: {
        'feature-map': {
          id: 'feature-map',
          projectId: 'proj-repo-snap',
          name: 'feature-map',
          isDefault: true,
          createdAt: now,
          updatedAt: now,
          files: { 'App.tsx': 'feature-map' },
          chatHistory: [],
          revisions: [],
          chatThreadId: 'thread-map',
          headRevisionId: 'rev-map-2',
          architecture,
        },
      },
    });

    const plannedSnapshot = createArchitectureSnapshotFromBranchArchitecture(
      architecture,
      'pre_build_draft',
      {
        id: 'snapshot-map-plan',
        createdAt: now,
        sourcePlanId: implementationPlan.id,
      },
    );
    const actualSnapshot = createArchitectureSnapshotFromBranchArchitecture(
      architecture,
      'post_build_actual',
      {
        id: 'snapshot-map-actual',
        createdAt: '2026-04-18T11:00:00.000Z',
        basedOnRevisionId: 'rev-map-2',
        previousSnapshotId: plannedSnapshot.id,
      },
    );

    await ProjectRepository.saveBranchArchitectureSnapshot('proj-repo-snap', 'feature-map', plannedSnapshot);
    await ProjectRepository.saveBranchArchitectureSnapshot('proj-repo-snap', 'feature-map', actualSnapshot);

    const restored = await ProjectRepository.getBranchArchitecture('proj-repo-snap', 'feature-map');

    expect(restored?.draftSnapshot?.id).toBe('snapshot-map-plan');
    expect(restored?.actualSnapshot?.id).toBe('snapshot-map-actual');
    expect(restored?.actualSnapshot?.previousSnapshotId).toBe('snapshot-map-plan');
    expect(restored?.snapshots).toHaveLength(2);
    expect(restored?.actualSnapshot?.capabilityManifest?.capabilities[0].actualState).toBe('implemented');
  });

  it('writes kickoff snapshots to the requested active branch instead of falling back to main', async () => {
    const architecture = createProjectBranchArchitecture('proj-branch-aware', 'main', 'main', now);

    await ProjectRepository.saveProject({
      id: 'proj-branch-aware',
      name: 'Branch Aware',
      description: 'Kickoff branch persistence',
      theme: 'dark-slate',
      files: {},
      chatHistory: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
      activeBranchId: 'feature-ai',
      branches: {
        main: {
          id: 'main',
          projectId: 'proj-branch-aware',
          name: 'main',
          isDefault: false,
          createdAt: now,
          updatedAt: now,
          files: {},
          chatHistory: [],
          revisions: [],
          architecture,
        },
        'feature-ai': {
          id: 'feature-ai',
          projectId: 'proj-branch-aware',
          name: 'feature-ai',
          isDefault: true,
          createdAt: now,
          updatedAt: now,
          files: {},
          chatHistory: [],
          revisions: [],
          architecture: createProjectBranchArchitecture('proj-branch-aware', 'feature-ai', 'feature-ai', now),
        },
      },
    });

    const draftSnapshot = createArchitectureSnapshotFromBranchArchitecture(
      createProjectBranchArchitecture('proj-branch-aware', 'feature-ai', 'feature-ai', now),
      'pre_build_draft',
      {
        id: 'snapshot-feature-ai',
        createdAt: now,
      },
    );

    await ProjectRepository.saveBranchArchitectureSnapshot('proj-branch-aware', 'feature-ai', draftSnapshot);

    const featureArchitecture = await ProjectRepository.getBranchArchitecture('proj-branch-aware', 'feature-ai');
    const mainArchitecture = await ProjectRepository.getBranchArchitecture('proj-branch-aware', 'main');

    expect(featureArchitecture?.draftSnapshot?.id).toBe('snapshot-feature-ai');
    expect(mainArchitecture?.draftSnapshot).toBeNull();
  });

  it('replaces the proposed kickoff draft instead of endlessly accumulating retry snapshots', async () => {
    const plan: ArchitectKickoffPlan = {
      productType: 'app',
      branchBriefSummary: 'Retry-safe kickoff draft',
      capabilities: [
        { id: 'backend', title: 'Backend', reason: 'Persist data', scope: 'first_pass', priority: 'must' },
      ],
      implementationSteps: [
        { id: 'step-1', title: 'Create schema', capabilityIds: ['backend'], scope: 'first_pass' },
      ],
      openQuestions: [],
      scopeOptions: [
        { id: 'core', label: 'Build core', description: 'Core only', capabilityIds: [] },
        { id: 'core_backend', label: 'Build core + backend', description: 'With backend', capabilityIds: ['backend'] },
        { id: 'core_backend_ai', label: 'Build core + backend + AI', description: 'With backend and AI', capabilityIds: ['backend', 'ai_chat', 'ai_generation'] },
        { id: 'revise', label: 'Revise plan', description: 'Revise', capabilityIds: [] },
      ],
      defaultOptionId: 'core_backend',
    };

    const architecture = createProjectBranchArchitecture('proj-retry-safe', 'feature-retry', 'feature-retry', now);
    await ProjectRepository.saveProject({
      id: 'proj-retry-safe',
      name: 'Retry Safe',
      description: 'Proposed draft replacement',
      theme: 'dark-slate',
      files: {},
      chatHistory: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
      activeBranchId: 'feature-retry',
      branches: {
        'feature-retry': {
          id: 'feature-retry',
          projectId: 'proj-retry-safe',
          name: 'feature-retry',
          isDefault: true,
          createdAt: now,
          updatedAt: now,
          files: {},
          chatHistory: [],
          revisions: [],
          architecture,
        },
      },
    });

    const first = await ArchitectPlannerService.writeProposedKickoffToMemory(
      'proj-retry-safe',
      'feature-retry',
      plan,
      now,
    );
    const second = await ArchitectPlannerService.writeProposedKickoffToMemory(
      'proj-retry-safe',
      'feature-retry',
      plan,
      '2026-04-18T11:00:00.000Z',
    );

    const restored = await ProjectRepository.getBranchArchitecture('proj-retry-safe', 'feature-retry');
    const matchingSnapshots = restored?.snapshots.filter(snapshot => snapshot.id === second.id) ?? [];

    expect(first.id).toBe(second.id);
    expect(matchingSnapshots).toHaveLength(1);
    expect(restored?.draftSnapshot?.id).toBe(second.id);
    expect(restored?.draftSnapshot?.branchBrief.status).toBe('proposed');
  });

  it('cleans up abandoned proposed drafts when a confirmed kickoff snapshot is saved', async () => {
    const architecture = createProjectBranchArchitecture(
      'proj-confirm-cleanup',
      'feature-cleanup',
      'feature-cleanup',
      now,
    );

    await ProjectRepository.saveProject({
      id: 'proj-confirm-cleanup',
      name: 'Confirm Cleanup',
      description: 'Removes stale proposed kickoff drafts',
      theme: 'dark-slate',
      files: {},
      chatHistory: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
      activeBranchId: 'feature-cleanup',
      branches: {
        'feature-cleanup': {
          id: 'feature-cleanup',
          projectId: 'proj-confirm-cleanup',
          name: 'feature-cleanup',
          isDefault: true,
          createdAt: now,
          updatedAt: now,
          files: {},
          chatHistory: [],
          revisions: [],
          architecture: {
            ...architecture,
            snapshots: [
              {
                ...createArchitectureSnapshotFromBranchArchitecture(architecture, 'pre_build_draft', {
                  id: 'snapshot:feature-cleanup:kickoff:proposed:legacy-1',
                  createdAt: '2026-04-16T11:00:00.000Z',
                }),
                branchBrief: {
                  ...architecture.branch,
                  status: 'proposed',
                  updatedAt: '2026-04-16T11:00:00.000Z',
                },
              },
              {
                ...createArchitectureSnapshotFromBranchArchitecture(architecture, 'pre_build_draft', {
                  id: 'snapshot:feature-cleanup:kickoff:proposed:legacy-2',
                  createdAt: '2026-04-17T11:00:00.000Z',
                }),
                branchBrief: {
                  ...architecture.branch,
                  status: 'proposed',
                  updatedAt: '2026-04-17T11:00:00.000Z',
                },
              },
            ],
          },
        },
      },
    });

    const acceptedSnapshot = createArchitectureSnapshotFromBranchArchitecture(
      architecture,
      'pre_build_draft',
      {
        id: 'snapshot:feature-cleanup:kickoff:accepted:1',
        createdAt: '2026-04-18T11:00:00.000Z',
      },
    );

    acceptedSnapshot.branchBrief.status = 'accepted';

    await ProjectRepository.saveBranchArchitectureSnapshot(
      'proj-confirm-cleanup',
      'feature-cleanup',
      acceptedSnapshot,
    );

    const restored = await ProjectRepository.getBranchArchitecture('proj-confirm-cleanup', 'feature-cleanup');
    const remainingProposed = restored?.snapshots.filter(
      snapshot => snapshot.phase === 'pre_build_draft' && snapshot.branchBrief.status === 'proposed',
    ) ?? [];

    expect(remainingProposed).toHaveLength(0);
    expect(restored?.draftSnapshot?.id).toBe(acceptedSnapshot.id);
    expect(restored?.draftSnapshot?.branchBrief.status).toBe('accepted');
  });
});
