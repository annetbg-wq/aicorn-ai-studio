import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ProjectRepository', () => ({
  ProjectRepository: {
    getBranchArchitecture: vi.fn(),
    saveBranchArchitecture: vi.fn(),
    saveBranchArchitectureSnapshot: vi.fn(),
    getProject: vi.fn(),
    saveProject: vi.fn(),
  },
}));

vi.mock('../LLMProxy', () => ({
  llmFetch: vi.fn(),
}));

vi.mock('../RevisionManager', () => ({
  revisionManager: { materializePersistedFiles: vi.fn() },
}));

vi.mock('../projectCorruptionScan', () => ({
  scanBeforePreviewLoad: vi.fn(() => ({ safe: true, findings: [] })),
}));

import { ProjectRepository } from '../ProjectRepository';
import { llmFetch } from '../LLMProxy';
import {
  ArchitectPlannerService,
  applyKickoffSelectionToBuildPlan,
  assertKickoffScopeApplied,
  inferCapabilitiesFromIntent,
  inferProductType,
  buildScopeOptions,
  getKickoffScopeOption,
  type ArchitectKickoffPlan,
} from '../ArchitectPlannerService';
import {
  ARCHITECTURE_MEMORY_MODEL_VERSION,
} from '../../shared/projectModel';
import type { ProjectPlan } from '../SimpleGeneration';

const now = '2026-04-18T12:00:00.000Z';

// ─── inferCapabilitiesFromIntent ─────────────────────────────────────────────

describe('inferCapabilitiesFromIntent', () => {
  it('detects auth capability from login keyword', () => {
    const caps = inferCapabilitiesFromIntent('Build a todo app with user login and registration');
    const ids = caps.map(c => c.id);
    expect(ids).toContain('auth');
  });

  it('detects backend from database keyword', () => {
    const caps = inferCapabilitiesFromIntent('App with database storage and CRUD');
    expect(caps.map(c => c.id)).toContain('backend');
  });

  it('detects ai_chat from chatbot keyword', () => {
    const caps = inferCapabilitiesFromIntent('AI chatbot powered by GPT');
    expect(caps.map(c => c.id)).toContain('ai_chat');
  });

  it('defers payments by default', () => {
    const caps = inferCapabilitiesFromIntent('SaaS app with Stripe subscription billing');
    const pay = caps.find(c => c.id === 'payments');
    expect(pay).toBeDefined();
    expect(pay!.scope).toBe('deferred');
  });

  it('returns empty array for generic intent with no known keywords', () => {
    const caps = inferCapabilitiesFromIntent('Build a simple counter');
    expect(caps).toHaveLength(0);
  });

  it('each inferred capability has required fields', () => {
    const caps = inferCapabilitiesFromIntent('Map app with location tracking');
    expect(caps.length).toBeGreaterThan(0);
    for (const cap of caps) {
      expect(cap.id).toBeTruthy();
      expect(cap.title).toBeTruthy();
      expect(cap.reason).toBeTruthy();
      expect(['first_pass', 'deferred']).toContain(cap.scope);
      expect(['must', 'should', 'could']).toContain(cap.priority);
    }
  });
});

// ─── inferProductType ────────────────────────────────────────────────────────

describe('inferProductType', () => {
  it('returns dashboard for analytics intent', () => {
    expect(inferProductType('Build a sales dashboard with KPIs and charts')).toBe('dashboard');
  });

  it('returns e-commerce for shop intent', () => {
    expect(inferProductType('Online shop with product catalogue and cart')).toBe('e-commerce');
  });

  it('returns app as fallback for generic intent', () => {
    expect(inferProductType('Something completely generic')).toBe('app');
  });

  it('returns landing for landing page intent', () => {
    expect(inferProductType('Landing page for waitlist signup')).toBe('landing');
  });
});

// ─── buildScopeOptions ───────────────────────────────────────────────────────

describe('buildScopeOptions', () => {
  it('always includes the three build options and a revise option', () => {
    const { options } = buildScopeOptions([]);
    const ids = options.map(o => o.id);
    expect(ids).toContain('core');
    expect(ids).toContain('core_backend');
    expect(ids).toContain('core_backend_ai');
    expect(ids).toContain('revise');
  });

  it('includes backend and ai options even before they are inferred so the user can choose them', () => {
    const caps = inferCapabilitiesFromIntent('App with database and user auth');
    const { options } = buildScopeOptions(caps);
    expect(options.map(o => o.id)).toContain('core_backend');
    expect(options.map(o => o.id)).toContain('core_backend_ai');
  });

  it('defaults to the ai option when ai capability is inferred', () => {
    const caps = inferCapabilitiesFromIntent('AI chatbot with GPT and database');
    const { options, defaultId } = buildScopeOptions(caps);
    expect(options.map(o => o.id)).toContain('core_backend_ai');
    expect(defaultId).toBe('core_backend_ai');
  });

  it('each scope option has id, label, description, capabilityIds', () => {
    const { options } = buildScopeOptions(inferCapabilitiesFromIntent('Todo app with auth'));
    for (const opt of options) {
      expect(opt.id).toBeTruthy();
      expect(opt.label).toBeTruthy();
      expect(opt.description).toBeTruthy();
      expect(Array.isArray(opt.capabilityIds)).toBe(true);
    }
  });

  it('defaultId defaults to core when no backend or ai detected', () => {
    const { defaultId } = buildScopeOptions([]);
    expect(defaultId).toBe('core');
  });
});

// ─── ArchitectPlannerService.analyze ─────────────────────────────────────────

describe('ArchitectPlannerService.analyze — plan generation structure', () => {
  beforeEach(() => {
    vi.mocked(llmFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              productType: 'saas',
              branchBriefSummary: 'SaaS project management tool with AI assistance',
              firstPassCapabilities: ['backend', 'auth', 'ai_chat'],
              deferredCapabilities: ['payments', 'notifications'],
              implementationOrder: [
                'Set up Supabase schema and auth',
                'Build project list and task views',
                'Wire Claude AI for task suggestions',
                'Polish responsive layout',
              ],
              openQuestions: ['Is data scoped per-organization or per-user?'],
            }),
          },
        }],
      }),
    } as Response);
  });

  it('returns a plan with all required top-level fields', async () => {
    const plan = await ArchitectPlannerService.analyze({
      intent: 'Build a project management SaaS with AI task suggestions and Stripe billing',
      projectId: 'proj-test',
      branchId: 'main',
      apiKey: 'test-key',
      modelId: 'openai/gpt-4o-mini',
    });

    expect(plan.productType).toBe('saas');
    expect(plan.branchBriefSummary).toBeTruthy();
    expect(Array.isArray(plan.capabilities)).toBe(true);
    expect(Array.isArray(plan.implementationSteps)).toBe(true);
    expect(Array.isArray(plan.openQuestions)).toBe(true);
    expect(Array.isArray(plan.scopeOptions)).toBe(true);
    expect(['core', 'core_backend', 'core_backend_ai']).toContain(plan.defaultOptionId);
  });

  it('merges LLM firstPassCapabilities into capability list with correct scope', async () => {
    const plan = await ArchitectPlannerService.analyze({
      intent: 'AI SaaS with auth and payments',
      projectId: 'proj-test',
      branchId: 'main',
      apiKey: 'test-key',
      modelId: 'openai/gpt-4o-mini',
    });

    const firstPass = plan.capabilities.filter(c => c.scope === 'first_pass');
    const deferred = plan.capabilities.filter(c => c.scope === 'deferred');

    expect(firstPass.some(c => c.id === 'auth')).toBe(true);
    expect(firstPass.some(c => c.id === 'backend')).toBe(true);
    expect(firstPass.some(c => c.id === 'ai_chat')).toBe(true);
    expect(deferred.some(c => c.id === 'payments')).toBe(true);
  });

  it('has at most 3 open questions', async () => {
    const plan = await ArchitectPlannerService.analyze({
      intent: 'Complex SaaS',
      projectId: 'proj-test',
      branchId: 'main',
      apiKey: 'test-key',
      modelId: 'openai/gpt-4o-mini',
    });
    expect(plan.openQuestions.length).toBeLessThanOrEqual(3);
  });

  it('falls back to heuristic when LLM fails', async () => {
    vi.mocked(llmFetch).mockRejectedValue(new Error('Network error'));

    const plan = await ArchitectPlannerService.analyze({
      intent: 'Todo app with user login and database storage',
      projectId: 'proj-test',
      branchId: 'main',
      apiKey: 'test-key',
      modelId: 'openai/gpt-4o-mini',
    });

    expect(plan).toBeDefined();
    expect(Array.isArray(plan.capabilities)).toBe(true);
    expect(plan.capabilities.some(c => c.id === 'auth')).toBe(true);
    expect(plan.capabilities.some(c => c.id === 'backend')).toBe(true);
  });

  it('works with no API key (local heuristic only)', async () => {
    const plan = await ArchitectPlannerService.analyze({
      intent: 'Analytics dashboard with charts and reports',
      projectId: 'proj-test',
      branchId: 'main',
      apiKey: '',
      modelId: '',
    });

    expect(plan.productType).toBeTruthy();
    expect(plan.capabilities.length).toBeGreaterThanOrEqual(0);
    expect(plan.scopeOptions.length).toBeGreaterThan(0);
  });
});

// ─── Capability inference persistence ────────────────────────────────────────

describe('capability inference persistence — ArchitectPlannerService.writeKickoffToMemory', () => {
  beforeEach(() => {
    vi.mocked(ProjectRepository.saveBranchArchitectureSnapshot).mockClear();
    vi.mocked(ProjectRepository.saveBranchArchitectureSnapshot).mockResolvedValue(undefined);
  });

  it('calls saveBranchArchitectureSnapshot with pre_build_draft phase', async () => {
    const plan: ArchitectKickoffPlan = {
      productType: 'app',
      branchBriefSummary: 'Todo app with auth and database',
      capabilities: [
        { id: 'auth', title: 'Authentication', reason: 'Login flow', scope: 'first_pass', priority: 'must' },
        { id: 'backend', title: 'Backend', reason: 'Data persistence', scope: 'first_pass', priority: 'must' },
        { id: 'payments', title: 'Payments', reason: 'Billing', scope: 'deferred', priority: 'should' },
      ],
      implementationSteps: [
        { id: 'step-1', title: 'Set up Supabase', capabilityIds: ['backend'], scope: 'first_pass' },
        { id: 'step-2', title: 'Implement auth', capabilityIds: ['auth', 'backend'], scope: 'first_pass' },
      ],
      openQuestions: [],
      scopeOptions: [
        { id: 'core', label: 'Build core', description: 'Core only', capabilityIds: [] },
        { id: 'core_backend', label: 'Core + backend', description: 'With backend', capabilityIds: ['backend', 'auth'] },
        { id: 'revise', label: 'Revise', description: 'Revise plan', capabilityIds: [] },
      ],
      defaultOptionId: 'core_backend',
    };

    const snapshot = await ArchitectPlannerService.writeKickoffToMemory(
      'proj-persist',
      'main',
      plan,
      'core_backend',
      now,
    );

    expect(ProjectRepository.saveBranchArchitectureSnapshot).toHaveBeenCalledOnce();
    expect(ProjectRepository.saveBranchArchitectureSnapshot).toHaveBeenCalledWith(
      'proj-persist',
      'main',
      expect.objectContaining({ phase: 'pre_build_draft' }),
    );
    expect(snapshot.phase).toBe('pre_build_draft');
    expect(snapshot.modelVersion).toBe(ARCHITECTURE_MEMORY_MODEL_VERSION);
  });

  it('snapshot has implementationPlan with steps from the plan', async () => {
    const plan: ArchitectKickoffPlan = {
      productType: 'dashboard',
      branchBriefSummary: 'Analytics dashboard',
      capabilities: [
        { id: 'analytics', title: 'Analytics', reason: 'Charts required', scope: 'first_pass', priority: 'must' },
      ],
      implementationSteps: [
        { id: 'step-1', title: 'Build chart views', capabilityIds: ['analytics'], scope: 'first_pass' },
        { id: 'step-2', title: 'Connect data API', capabilityIds: [], scope: 'first_pass' },
      ],
      openQuestions: [],
      scopeOptions: [
        { id: 'core', label: 'Build core', description: 'Core', capabilityIds: ['analytics'] },
        { id: 'revise', label: 'Revise', description: 'Revise', capabilityIds: [] },
      ],
      defaultOptionId: 'core',
    };

    const snapshot = await ArchitectPlannerService.writeKickoffToMemory(
      'proj-dash',
      'main',
      plan,
      'core',
      now,
    );

    expect(snapshot.implementationPlan).not.toBeNull();
    expect(snapshot.implementationPlan?.steps).toHaveLength(2);
    expect(snapshot.implementationPlan?.steps[0].title).toBe('Build chart views');
  });
});

// ─── Deferred item persistence ───────────────────────────────────────────────

describe('deferred item persistence', () => {
  beforeEach(() => {
    vi.mocked(ProjectRepository.saveBranchArchitectureSnapshot).mockResolvedValue(undefined);
  });

  it('deferred capabilities become DeferredItems in the snapshot', async () => {
    const plan: ArchitectKickoffPlan = {
      productType: 'saas',
      branchBriefSummary: 'SaaS with deferred payments and notifications',
      capabilities: [
        { id: 'backend', title: 'Backend', reason: 'Data', scope: 'first_pass', priority: 'must' },
        { id: 'payments', title: 'Payments', reason: 'Billing', scope: 'deferred', priority: 'should' },
        { id: 'notifications', title: 'Notifications', reason: 'Alerts', scope: 'deferred', priority: 'could' },
      ],
      implementationSteps: [
        { id: 'step-1', title: 'Set up backend', capabilityIds: ['backend'], scope: 'first_pass' },
      ],
      openQuestions: [],
      scopeOptions: [
        { id: 'core', label: 'Core', description: 'Core only', capabilityIds: ['backend'] },
        { id: 'revise', label: 'Revise', description: 'Revise', capabilityIds: [] },
      ],
      defaultOptionId: 'core',
    };

    const snapshot = await ArchitectPlannerService.writeKickoffToMemory(
      'proj-deferred',
      'main',
      plan,
      'core',
      now,
    );

    expect(snapshot.deferredItems.length).toBeGreaterThan(0);
    const deferredIds = snapshot.deferredItems.map(d => d.relatedCapabilityIds).flat();
    expect(deferredIds).toContain('payments');
    expect(deferredIds).toContain('notifications');
  });

  it('deferred items have deferredUntilPhase set to post_build_actual', async () => {
    const plan: ArchitectKickoffPlan = {
      productType: 'app',
      branchBriefSummary: 'App',
      capabilities: [
        { id: 'admin', title: 'Admin', reason: 'Management', scope: 'deferred', priority: 'could' },
      ],
      implementationSteps: [],
      openQuestions: [],
      scopeOptions: [
        { id: 'core', label: 'Core', description: 'Core', capabilityIds: [] },
        { id: 'revise', label: 'Revise', description: 'Revise', capabilityIds: [] },
      ],
      defaultOptionId: 'core',
    };

    const snapshot = await ArchitectPlannerService.writeKickoffToMemory(
      'proj-admin',
      'main',
      plan,
      'core',
      now,
    );

    for (const item of snapshot.deferredItems) {
      expect(item.deferredUntilPhase).toBe('post_build_actual');
      expect(item.status).toBe('deferred');
    }
  });
});

// ─── Branch memory write on kickoff ──────────────────────────────────────────

describe('branch memory write on kickoff', () => {
  beforeEach(() => {
    vi.mocked(ProjectRepository.saveBranchArchitectureSnapshot).mockResolvedValue(undefined);
  });

  it('snapshot projectId and branchId match the input', async () => {
    const plan: ArchitectKickoffPlan = {
      productType: 'tool',
      branchBriefSummary: 'Utility tool',
      capabilities: [],
      implementationSteps: [],
      openQuestions: [],
      scopeOptions: [
        { id: 'core', label: 'Core', description: 'Core', capabilityIds: [] },
        { id: 'revise', label: 'Revise', description: 'Revise', capabilityIds: [] },
      ],
      defaultOptionId: 'core',
    };

    const snapshot = await ArchitectPlannerService.writeKickoffToMemory(
      'proj-branch-test',
      'feature-new',
      plan,
      'core',
      now,
    );

    expect(snapshot.projectId).toBe('proj-branch-test');
    expect(snapshot.branchId).toBe('feature-new');
  });

  it('capability manifest has entries for all inferred capabilities', async () => {
    const plan: ArchitectKickoffPlan = {
      productType: 'app',
      branchBriefSummary: 'App',
      capabilities: [
        { id: 'auth', title: 'Auth', reason: 'Login', scope: 'first_pass', priority: 'must' },
        { id: 'backend', title: 'Backend', reason: 'Data', scope: 'first_pass', priority: 'must' },
        { id: 'payments', title: 'Payments', reason: 'Billing', scope: 'deferred', priority: 'should' },
      ],
      implementationSteps: [],
      openQuestions: [],
      scopeOptions: [
        { id: 'core_backend', label: 'Core + backend', description: 'With backend', capabilityIds: ['auth', 'backend'] },
        { id: 'revise', label: 'Revise', description: 'Revise', capabilityIds: [] },
      ],
      defaultOptionId: 'core_backend',
    };

    const snapshot = await ArchitectPlannerService.writeKickoffToMemory(
      'proj-manifest',
      'main',
      plan,
      'core_backend',
      now,
    );

    expect(snapshot.capabilityManifest).not.toBeNull();
    const capIds = snapshot.capabilityManifest?.capabilities.map(c => c.capabilityId) ?? [];
    expect(capIds).toContain('auth');
    expect(capIds).toContain('backend');
    expect(capIds).toContain('payments');

    const authEntry = snapshot.capabilityManifest?.capabilities.find(c => c.capabilityId === 'auth');
    expect(authEntry?.plannedState).toBe('required');
    expect(authEntry?.actualState).toBe('unknown');

    const payEntry = snapshot.capabilityManifest?.capabilities.find(c => c.capabilityId === 'payments');
    expect(payEntry?.plannedState).toBe('deferred');
  });
});

// ─── Snapshot creation ────────────────────────────────────────────────────────

describe('snapshot creation structure', () => {
  beforeEach(() => {
    vi.mocked(ProjectRepository.saveBranchArchitectureSnapshot).mockResolvedValue(undefined);
  });

  it('snapshot has modelVersion matching ARCHITECTURE_MEMORY_MODEL_VERSION', async () => {
    const plan: ArchitectKickoffPlan = {
      productType: 'app',
      branchBriefSummary: 'App',
      capabilities: [],
      implementationSteps: [],
      openQuestions: [],
      scopeOptions: [{ id: 'core', label: 'Core', description: 'Core', capabilityIds: [] }, { id: 'revise', label: 'Revise', description: 'Revise', capabilityIds: [] }],
      defaultOptionId: 'core',
    };
    const snapshot = await ArchitectPlannerService.writeKickoffToMemory('proj-ver', 'main', plan, 'core', now);
    expect(snapshot.modelVersion).toBe(ARCHITECTURE_MEMORY_MODEL_VERSION);
  });

  it('snapshot contains at least one accepted architectureDecision (product type)', async () => {
    const plan: ArchitectKickoffPlan = {
      productType: 'saas',
      branchBriefSummary: 'SaaS tool',
      capabilities: [],
      implementationSteps: [],
      openQuestions: [],
      scopeOptions: [{ id: 'core', label: 'Core', description: 'Core', capabilityIds: [] }, { id: 'revise', label: 'Revise', description: 'Revise', capabilityIds: [] }],
      defaultOptionId: 'core',
    };
    const snapshot = await ArchitectPlannerService.writeKickoffToMemory('proj-adec', 'main', plan, 'core', now);
    const productTypeDecision = snapshot.architectureDecisions.find(d => d.id === 'adec:main:product-type');
    expect(productTypeDecision).toBeDefined();
    expect(productTypeDecision?.status).toBe('accepted');
  });

  it('snapshot sourcePlanId links to the implementationPlan id', async () => {
    const plan: ArchitectKickoffPlan = {
      productType: 'tool',
      branchBriefSummary: 'Tool',
      capabilities: [],
      implementationSteps: [
        { id: 'step-1', title: 'Build UI', capabilityIds: [], scope: 'first_pass' },
      ],
      openQuestions: [],
      scopeOptions: [{ id: 'core', label: 'Core', description: 'Core', capabilityIds: [] }, { id: 'revise', label: 'Revise', description: 'Revise', capabilityIds: [] }],
      defaultOptionId: 'core',
    };
    const snapshot = await ArchitectPlannerService.writeKickoffToMemory('proj-link', 'main', plan, 'core', now);
    expect(snapshot.sourcePlanId).toBeTruthy();
    expect(snapshot.implementationPlan?.id).toBe(snapshot.sourcePlanId);
  });

  it('open questions are persisted in the snapshot', async () => {
    const plan: ArchitectKickoffPlan = {
      productType: 'saas',
      branchBriefSummary: 'SaaS',
      capabilities: [
        { id: 'auth', title: 'Auth', reason: 'Login', scope: 'first_pass', priority: 'must' },
      ],
      implementationSteps: [],
      openQuestions: [
        { id: 'oq-1', title: 'Is data multi-tenant?', capabilityIds: ['auth', 'backend'], impact: 'high' },
      ],
      scopeOptions: [{ id: 'core', label: 'Core', description: 'Core', capabilityIds: [] }, { id: 'revise', label: 'Revise', description: 'Revise', capabilityIds: [] }],
      defaultOptionId: 'core',
    };
    const snapshot = await ArchitectPlannerService.writeKickoffToMemory('proj-oq', 'main', plan, 'core', now);
    expect(snapshot.openQuestions).toHaveLength(1);
    expect(snapshot.openQuestions[0].title).toBe('Is data multi-tenant?');
    expect(snapshot.openQuestions[0].status).toBe('open');
  });
});

describe('kickoff build preparation', () => {
  beforeEach(() => {
    vi.mocked(ProjectRepository.saveBranchArchitectureSnapshot).mockResolvedValue(undefined);
  });

  const kickoffPlan: ArchitectKickoffPlan = {
    productType: 'app',
    branchBriefSummary: 'Task app with optional backend and AI',
    capabilities: [
      { id: 'analytics', title: 'Analytics', reason: 'Dashboard reporting', scope: 'first_pass', priority: 'should' },
    ],
    implementationSteps: [
      { id: 'step-1', title: 'Build dashboard shell', capabilityIds: ['analytics'], scope: 'first_pass' },
    ],
    openQuestions: [],
    scopeOptions: buildScopeOptions([]).options,
    defaultOptionId: 'core',
  };

  const buildPlan: ProjectPlan = {
    appName: 'TaskScope',
    description: 'Project dashboard',
    theme: 'dark-slate',
    layout: { type: 'dashboard', navigation: 'sidebar' },
    pages: [
      {
        path: '/',
        name: 'Dashboard',
        file: 'src/pages/Dashboard.tsx',
        purpose: 'Overview',
        isMainScreen: true,
      },
    ],
    shadcnComponents: ['card'],
    icons: ['BarChart3'],
  };

  it('getKickoffScopeOption resolves non-revise build choices', () => {
    const selected = getKickoffScopeOption(kickoffPlan, 'core_backend_ai');
    expect(selected.id).toBe('core_backend_ai');
    expect(selected.label).toContain('AI');
  });

  it('applyKickoffSelectionToBuildPlan injects selected and deferred scope into build input', () => {
    const adjusted = applyKickoffSelectionToBuildPlan(buildPlan, kickoffPlan, 'core_backend');

    expect(adjusted.kickoffScope).toEqual(expect.objectContaining({
      id: 'core_backend',
      selectedCapabilityIds: expect.arrayContaining(['backend', 'auth']),
    }));
    expect(adjusted.criticalUiRules).toEqual(expect.arrayContaining([
      expect.stringContaining('Do not add AI integrations'),
    ]));
  });

  it('prepareBuildFromKickoff writes the draft snapshot before returning the scoped build plan', async () => {
    const result = await ArchitectPlannerService.prepareBuildFromKickoff(
      'proj-kickoff',
      'feature-branch',
      kickoffPlan,
      'core_backend_ai',
      buildPlan,
      now,
    );

    expect(ProjectRepository.saveBranchArchitectureSnapshot).toHaveBeenCalledWith(
      'proj-kickoff',
      'feature-branch',
      expect.objectContaining({
        phase: 'pre_build_draft',
        branchId: 'feature-branch',
      }),
    );
    expect(result.snapshot.phase).toBe('pre_build_draft');
    expect(result.buildPlan.kickoffScope).toEqual(expect.objectContaining({
      id: 'core_backend_ai',
      selectedCapabilityIds: expect.arrayContaining(['backend', 'auth', 'ai_chat', 'ai_generation']),
    }));
  });

  it('writeProposedKickoffToMemory persists an honest proposed draft before confirmation', async () => {
    const snapshot = await ArchitectPlannerService.writeProposedKickoffToMemory(
      'proj-proposed',
      'feature-proposed',
      kickoffPlan,
      now,
    );

    expect(ProjectRepository.saveBranchArchitectureSnapshot).toHaveBeenCalledWith(
      'proj-proposed',
      'feature-proposed',
      expect.objectContaining({
        phase: 'pre_build_draft',
        branchId: 'feature-proposed',
      }),
    );
    expect(snapshot.branchBrief.status).toBe('proposed');
    expect(snapshot.implementationPlan?.status).toBe('proposed');
    expect(snapshot.capabilityManifest?.status).toBe('proposed');
    expect(snapshot.architectureDecisions.every(decision => ['proposed', 'deferred'].includes(decision.status))).toBe(true);
  });

  it('pre-build draft data already exists even if the first build never completes', async () => {
    const result = await ArchitectPlannerService.prepareBuildFromKickoff(
      'proj-kickoff-cancelled',
      'feature-cancelled',
      kickoffPlan,
      'core_backend',
      buildPlan,
      now,
    );

    expect(result.snapshot.branchBrief.summary).toBe(kickoffPlan.branchBriefSummary);
    expect(result.snapshot.implementationPlan).not.toBeNull();
    expect(result.snapshot.capabilityManifest).not.toBeNull();
    expect(Array.isArray(result.snapshot.deferredItems)).toBe(true);
    expect(Array.isArray(result.snapshot.openQuestions)).toBe(true);
    expect(ProjectRepository.saveBranchArchitectureSnapshot).toHaveBeenLastCalledWith(
      'proj-kickoff-cancelled',
      'feature-cancelled',
      expect.objectContaining({
        phase: 'pre_build_draft',
        branchId: 'feature-cancelled',
      }),
    );
  });

  it('assertKickoffScopeApplied throws when the selected scope is missing from the approved plan', () => {
    expect(() =>
      assertKickoffScopeApplied(buildPlan, 'core_backend_ai'),
    ).toThrow(/Kickoff scope handoff failed/);
  });

  it('formatPlanForChat localizes visible Architect summary content', () => {
    const summary = ArchitectPlannerService.formatPlanForChat(kickoffPlan, 'ru');

    expect(summary).toContain('**Анализ Architect — Приложение**');
    expect(summary).toContain('**Объём первого прохода:**');
    expect(summary).toContain('Аналитика');
    expect(summary).toContain('**Варианты сборки:**');
    expect(summary).toContain('**Собрать core**');
    expect(summary).toContain('Перед первым запуском сборки вы выберете один из этих объёмов.');
  });
});
