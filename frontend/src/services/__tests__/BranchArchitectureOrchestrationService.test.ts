import { describe, expect, it } from 'vitest';

import {
  buildBranchGenerationGuidance,
  buildBranchTrustUiSummary,
  formatBranchArchitecturePrompt,
  refreshArchitectureAfterBuild,
} from '../BranchArchitectureOrchestrationService';
import {
  createArchitectureSnapshotFromBranchArchitecture,
  createProjectBranchArchitecture,
  type ProjectBranchArchitecture,
} from '../../shared/projectModel';

function buildArchitecture(): ProjectBranchArchitecture {
  const now = '2026-04-18T12:00:00.000Z';
  const branchId = 'feature-auth';
  const architecture = createProjectBranchArchitecture('proj-session-5', branchId, branchId, now);

  architecture.branch.summary = 'Ship auth first, analytics second, keep payments deferred.';
  architecture.branch.status = 'accepted';
  architecture.implementationPlan = {
    id: 'plan:feature-auth',
    projectId: 'proj-session-5',
    branchId,
    title: 'Branch rollout',
    summary: architecture.branch.summary,
    phase: 'pre_build_draft',
    status: 'accepted',
    stepIds: ['step-auth', 'step-analytics'],
    steps: [
      {
        id: 'step-auth',
        projectId: 'proj-session-5',
        branchId,
        planId: 'plan:feature-auth',
        title: 'Ship authentication flow',
        status: 'accepted',
        plannedCapabilityIds: ['auth'],
        implementationState: 'planned',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'step-analytics',
        projectId: 'proj-session-5',
        branchId,
        planId: 'plan:feature-auth',
        title: 'Ship analytics dashboard',
        status: 'accepted',
        plannedCapabilityIds: ['analytics'],
        implementationState: 'planned',
        createdAt: now,
        updatedAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  architecture.capabilityManifest = {
    id: 'manifest:feature-auth',
    projectId: 'proj-session-5',
    branchId,
    title: 'Branch capabilities',
    phase: 'pre_build_draft',
    status: 'accepted',
    capabilities: [
      {
        id: 'cap-auth',
        projectId: 'proj-session-5',
        branchId,
        capabilityId: 'auth',
        title: 'Authentication',
        status: 'accepted',
        plannedState: 'required',
        actualState: 'unknown',
        source: 'manual',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'cap-analytics',
        projectId: 'proj-session-5',
        branchId,
        capabilityId: 'analytics',
        title: 'Analytics',
        status: 'accepted',
        plannedState: 'required',
        actualState: 'unknown',
        source: 'manual',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'cap-payments',
        projectId: 'proj-session-5',
        branchId,
        capabilityId: 'payments',
        title: 'Payments',
        status: 'deferred',
        plannedState: 'deferred',
        actualState: 'unknown',
        source: 'manual',
        createdAt: now,
        updatedAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  architecture.capabilityDecisions = [
    {
      id: 'cap-decision-auth',
      projectId: 'proj-session-5',
      branchId,
      phase: 'pre_build_draft',
      capabilityId: 'auth',
      title: 'Accept auth',
      summary: 'Authentication is required in this branch.',
      status: 'accepted',
      plannedState: 'required',
      actualState: 'unknown',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'cap-decision-analytics',
      projectId: 'proj-session-5',
      branchId,
      phase: 'pre_build_draft',
      capabilityId: 'analytics',
      title: 'Accept analytics',
      summary: 'Analytics comes after auth.',
      status: 'accepted',
      plannedState: 'required',
      actualState: 'unknown',
      createdAt: now,
      updatedAt: now,
    },
  ];
  architecture.architectureDecisions = [
    {
      id: 'decision-auth',
      projectId: 'proj-session-5',
      branchId,
      phase: 'pre_build_draft',
      title: 'Use Supabase auth',
      summary: 'Supabase auth is the accepted auth direction for this branch.',
      status: 'accepted',
      category: 'security',
      affectedCapabilityIds: ['auth', 'backend'],
      createdAt: now,
      updatedAt: now,
    },
  ];
  architecture.constraints = [
    {
      id: 'constraint-auth',
      projectId: 'proj-session-5',
      branchId,
      phase: 'pre_build_draft',
      title: 'Stay on Supabase',
      summary: 'Do not introduce a custom backend in this branch.',
      status: 'accepted',
      constraintType: 'technical',
      affectedCapabilityIds: ['auth', 'backend'],
      createdAt: now,
      updatedAt: now,
    },
  ];
  architecture.deferredItems = [
    {
      id: 'deferred-payments',
      projectId: 'proj-session-5',
      branchId,
      phase: 'pre_build_draft',
      title: 'Defer payments',
      summary: 'Do not build billing until the accepted scope is complete.',
      status: 'deferred',
      relatedCapabilityIds: ['payments'],
      deferredUntilPhase: 'post_build_actual',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const snapshot = createArchitectureSnapshotFromBranchArchitecture(architecture, 'pre_build_draft', {
    id: 'snapshot:feature-auth:draft',
    createdAt: now,
    branchBrief: {
      summary: architecture.branch.summary,
      status: 'accepted',
    },
  });
  architecture.draftSnapshot = snapshot;
  architecture.snapshots = [snapshot];
  return architecture;
}

function buildProposedArchitecture(): ProjectBranchArchitecture {
  const architecture = buildArchitecture();
  architecture.branch.status = 'proposed';
  architecture.implementationPlan = architecture.implementationPlan && {
    ...architecture.implementationPlan,
    status: 'proposed',
    steps: architecture.implementationPlan.steps.map(step => ({
      ...step,
      status: 'proposed',
    })),
  };
  architecture.capabilityManifest = architecture.capabilityManifest && {
    ...architecture.capabilityManifest,
    status: 'proposed',
    capabilities: architecture.capabilityManifest.capabilities.map(capability => ({
      ...capability,
      status: capability.status === 'deferred' ? capability.status : 'proposed',
    })),
  };
  architecture.capabilityDecisions = architecture.capabilityDecisions.map(decision => ({
    ...decision,
    status: 'proposed',
  }));
  architecture.architectureDecisions = architecture.architectureDecisions.map(decision => ({
    ...decision,
    status: 'proposed',
  }));
  architecture.constraints = architecture.constraints.map(constraint => ({
    ...constraint,
    status: 'proposed',
  }));

  const snapshot = createArchitectureSnapshotFromBranchArchitecture(architecture, 'pre_build_draft', {
    id: 'snapshot:feature-auth:proposed',
    createdAt: architecture.updatedAt,
    branchBrief: {
      summary: architecture.branch.summary,
      status: 'proposed',
    },
  });
  architecture.draftSnapshot = snapshot;
  architecture.snapshots = [snapshot];
  return architecture;
}

function buildAlignedFiles(): Record<string, string> {
  return {
    '/route-manifest.json': JSON.stringify({
      version: 1,
      layout: 'tabs',
      routes: [
        { path: '/login', component: 'Login', filePath: 'pages/Login.tsx', title: 'Login', isHome: false, isProtected: false },
        { path: '/dashboard', component: 'Dashboard', filePath: 'pages/Dashboard.tsx', title: 'Dashboard', isHome: false, isProtected: true },
      ],
    }),
    'App.tsx': `
      import { Route, Routes } from 'react-router-dom';
      export default function App() {
        return (
          <Routes>
            <Route path="/login" element={<div>Login</div>} />
            <Route path="/dashboard" element={<div>Dashboard</div>} />
          </Routes>
        );
      }
    `,
    'pages/Login.tsx': 'export default function Login(){ return <div>Login</div>; }',
    'pages/Dashboard.tsx': 'export default function Dashboard(){ return <div>Dashboard</div>; }',
    'src/backend.ts': 'import { createClient } from "@supabase/supabase-js"; export const client = createClient("url", "key");',
    'src/auth.ts': 'export const signIn = () => supabase.auth.signInWithPassword({ email: "a", password: "b" });',
    'src/analytics.ts': 'export const analytics = "posthog";',
  };
}

function buildPartialFiles(): Record<string, string> {
  return {
    '/route-manifest.json': JSON.stringify({
      version: 1,
      layout: 'tabs',
      routes: [
        { path: '/login', component: 'Login', filePath: 'pages/Login.tsx', title: 'Login', isHome: false, isProtected: false },
        { path: '/dashboard', component: 'Dashboard', filePath: 'pages/Dashboard.tsx', title: 'Dashboard', isHome: false, isProtected: true },
      ],
    }),
    'App.tsx': `
      import { Route, Routes } from 'react-router-dom';
      export default function App() {
        return (
          <Routes>
            <Route path="/login" element={<div>Login</div>} />
          </Routes>
        );
      }
    `,
    'pages/Login.tsx': 'export default function Login(){ return <div>Login</div>; }',
    'src/auth.ts': 'export const signIn = () => supabase.auth.signInWithPassword({ email: "a", password: "b" });',
  };
}

function buildDriftFiles(): Record<string, string> {
  return {
    '/route-manifest.json': JSON.stringify({
      version: 1,
      layout: 'tabs',
      routes: [
        { path: '/login', component: 'Login', filePath: 'pages/Login.tsx', title: 'Login', isHome: false, isProtected: false },
        { path: '/dashboard', component: 'Dashboard', filePath: 'pages/Dashboard.tsx', title: 'Dashboard', isHome: false, isProtected: true },
      ],
    }),
    'App.tsx': `
      import { Route, Routes } from 'react-router-dom';
      export default function App() {
        return (
          <Routes>
            <Route path="/login" element={<div>Login</div>} />
            <Route path="/dashboard" element={<div>Dashboard</div>} />
            <Route path="/settings" element={<div>Settings</div>} />
          </Routes>
        );
      }
    `,
    'pages/Login.tsx': 'export default function Login(){ return <div>Login</div>; }',
    'pages/Dashboard.tsx': 'export default function Dashboard(){ return <div>Dashboard</div>; }',
    'pages/Settings.tsx': 'export default function Settings(){ return <div>Settings</div>; }',
    'src/firebase.ts': 'export const auth = firebase.initializeApp({});',
    'src/analytics.ts': 'export const analytics = "posthog";',
  };
}

describe('BranchArchitectureOrchestrationService', () => {
  it('builds an aligned branch reality summary when planned routes and decisions match the branch', () => {
    const guidance = buildBranchGenerationGuidance(buildArchitecture(), buildAlignedFiles(), 'en');

    expect(guidance?.reality.state).toBe('aligned');
    expect(guidance?.reality.plannedScreensImplemented.map(route => route.path).sort()).toEqual(['/dashboard', '/login']);
    expect(guidance?.reality.plannedScreensMissing).toHaveLength(0);
    expect(guidance?.reality.untrackedImplementedRoutes).toHaveLength(0);
    expect(guidance?.reality.decisionsNotReflected).toHaveLength(0);
  });

  it('builds a partial branch reality summary when planned implementation is still missing', () => {
    const guidance = buildBranchGenerationGuidance(buildArchitecture(), buildPartialFiles(), 'en');

    expect(guidance?.reality.state).toBe('partial');
    expect(guidance?.reality.plannedScreensMissing.map(route => route.path)).toContain('/dashboard');
    expect(guidance?.reality.ui.nextPassSummary).toContain('Dashboard');
  });

  it('builds a drifted branch reality summary when untracked routes and overrides appear in the branch', () => {
    const guidance = buildBranchGenerationGuidance(buildArchitecture(), buildDriftFiles(), 'en');

    expect(guidance?.reality.state).toBe('drifted');
    expect(guidance?.reality.untrackedImplementedRoutes.map(route => route.path)).toContain('/settings');
    expect(guidance?.reality.overridingImplementation.some(item => item.title === 'Use Supabase auth')).toBe(true);
    expect(guidance?.reality.ui.driftingItems.some(item => item.title === 'Settings')).toBe(true);
  });

  it('localizes user-facing branch reality summaries', () => {
    const guidance = buildBranchGenerationGuidance(buildArchitecture(), buildDriftFiles(), 'ru');

    expect(guidance?.reality.ui.sectionTitle).toBe('Реальность ветки');
    expect(guidance?.reality.ui.stateLabel).toBe('Дрейфует');
    expect(guidance?.reality.ui.nextPassLabel).toBe('Следующий проход');
    expect(guidance?.reality.ui.driftingItems[0].summary).not.toContain('Route');
  });

  it('builds generation context with accepted decisions and the current implementation step', () => {
    const guidance = buildBranchGenerationGuidance(buildArchitecture(), {}, 'en');
    const prompt = formatBranchArchitecturePrompt(guidance, 'en');

    expect(prompt).toContain('Use Supabase auth');
    expect(prompt).toContain('Stay on Supabase');
    expect(prompt).toContain('Ship authentication flow');
  });

  it('keeps deferred items out of the active build scope', () => {
    const guidance = buildBranchGenerationGuidance(buildArchitecture(), {}, 'en');

    expect(guidance?.activeCapabilityIds).toEqual(['auth']);
    expect(guidance?.activeCapabilityIds).not.toContain('payments');
    expect(guidance?.deferredItems.map(item => item.title)).toContain('Defer payments');
  });

  it('keeps lightweight requests in fast prototype mode without forcing accepted architecture as authority', () => {
    const guidance = buildBranchGenerationGuidance(buildArchitecture(), {}, 'en', {
      requestIntent: 'Sketch a simple landing page hero with a CTA only.',
      generationMode: 'landing',
    });
    const prompt = formatBranchArchitecturePrompt(guidance, 'en');

    expect(guidance?.operatingMode).toBe('fast_prototype');
    expect(guidance?.authoritative).toBe(false);
    expect(guidance?.trustBasis).toBe('accepted_branch_architecture');
    expect(guidance?.trustIndicators).toContain('fast_prototype_mode');
    expect(prompt).toContain('Architect operating mode: Fast prototype mode');
    expect(prompt).toContain('Keep this request lightweight.');
  });

  it('does not treat a simple prototype request as a proposed experiment', () => {
    const guidance = buildBranchGenerationGuidance(buildArchitecture(), {}, 'en', {
      requestIntent: 'Build a simple mobile prototype for the login screen.',
      generationMode: 'app',
    });

    expect(guidance?.operatingMode).toBe('fast_prototype');
    expect(guidance?.conflict.kind).toBe('none');
  });

  it('does not silently ignore accepted architecture when the request explicitly conflicts with it', () => {
    const guidance = buildBranchGenerationGuidance(buildArchitecture(), {}, 'en', {
      requestIntent: 'Replace the current Supabase auth direction with Firebase auth instead.',
      generationMode: 'app',
    });
    const prompt = formatBranchArchitecturePrompt(guidance, 'en');

    expect(guidance?.operatingMode).toBe('architect_guided');
    expect(guidance?.authoritative).toBe(true);
    expect(guidance?.conflict.kind).toBe('override_request');
    expect(prompt).toContain('Conflict handling: Override request');
    expect(prompt).toContain('Accepted branch architecture is authoritative for this build.');
  });

  it('distinguishes proposed draft guidance from accepted branch truth', () => {
    const guidance = buildBranchGenerationGuidance(buildProposedArchitecture(), {}, 'en');
    const prompt = formatBranchArchitecturePrompt(guidance, 'en');
    const trust = buildBranchTrustUiSummary(guidance, 'en');

    expect(guidance?.trustBasis).toBe('proposed_draft_guidance');
    expect(guidance?.guidanceDecisions.map(item => item.status)).toEqual(['proposed']);
    expect(prompt).toContain('Trust basis: Using proposed draft guidance');
    expect(prompt).toContain('Proposed draft decisions');
    expect(prompt).not.toContain('Accepted branch architecture is authoritative for this build.');
    expect(trust.trustLabel).toBe('Using proposed draft guidance');
    expect(trust.summary).toContain('exploratory');
  });

  it('refreshes plan progress from actual state after implementation', () => {
    const refreshed = refreshArchitectureAfterBuild(
      buildArchitecture(),
      {
        'src/auth.ts': 'export const signIn = () => supabase.auth.signInWithPassword({ email: "a", password: "b" });',
        'src/routes/login.tsx': 'export function Login(){ return <div>login</div>; }',
      },
      {
        language: 'en',
        now: '2026-04-18T13:00:00.000Z',
        revisionId: 'rev-auth-1',
      },
    );

    expect(
      refreshed.actualSnapshot?.capabilityManifest?.capabilities.find(capability => capability.capabilityId === 'auth')?.actualState,
    ).toBe('implemented');
    expect(
      refreshed.actualSnapshot?.implementationPlan?.steps.find(step => step.id === 'step-auth')?.implementationState,
    ).toBe('implemented');
  });

  it('changes the suggested next step when actual branch state changes', () => {
    const before = buildBranchGenerationGuidance(buildArchitecture(), {}, 'en');
    const afterRefresh = refreshArchitectureAfterBuild(
      buildArchitecture(),
      {
        'src/auth.ts': 'export const signIn = () => supabase.auth.signInWithPassword({ email: "a", password: "b" });',
        'src/routes/login.tsx': 'export function Login(){ return <div>login</div>; }',
      },
      {
        language: 'en',
        now: '2026-04-18T13:00:00.000Z',
      },
    );

    expect(before?.suggestedNextStep?.title).toBe('Ship authentication flow');
    expect(afterRefresh.guidance?.suggestedNextStep?.title).toBe('Ship analytics dashboard');
  });

  it('returns user-facing next-step text in the user language', () => {
    const guidance = buildBranchGenerationGuidance(buildArchitecture(), {}, 'ru');
    const prompt = formatBranchArchitecturePrompt(guidance, 'ru');

    expect(guidance?.suggestedNextStep?.summary).toContain('Продолжить активный шаг плана');
    expect(prompt).toContain('Архитектурные указания для текущей ветки');
    expect(prompt).toContain('Режим архитектора');
    expect(prompt).toContain('Текущий шаг реализации');
  });

  it('falls back unsupported locales to English instead of Russian', () => {
    const guidance = buildBranchGenerationGuidance(buildArchitecture(), {}, 'it-IT');
    const prompt = formatBranchArchitecturePrompt(guidance, 'it-IT');

    expect(guidance?.suggestedNextStep?.summary).toContain('Continue the active implementation step');
    expect(prompt).toContain('Current branch architecture guidance');
    expect(prompt).toContain('Observed current state');
  });
});
