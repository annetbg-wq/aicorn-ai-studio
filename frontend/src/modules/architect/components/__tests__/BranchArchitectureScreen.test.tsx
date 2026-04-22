// @vitest-environment jsdom

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { BranchArchitectureScreen } from '../BranchArchitectureScreen';
import {
  createArchitectureSnapshotFromBranchArchitecture,
  createProjectBranchArchitecture,
  type ProjectBranchArchitecture,
} from '../../../../shared/projectModel';
import type { ProjectRecord } from '../../../../services/ProjectRepository';

function buildArchitecture(branchId: string, summary: string, withFeatureData = false): ProjectBranchArchitecture {
  const now = '2026-04-17T12:00:00.000Z';
  const architecture = createProjectBranchArchitecture('proj-architect', branchId, branchId, now, {
    headRevisionId: `rev-${branchId}`,
  });

  if (!withFeatureData) {
    const snapshot = createArchitectureSnapshotFromBranchArchitecture(architecture, 'pre_build_draft', {
      id: `snapshot-${branchId}`,
      createdAt: now,
      branchBrief: {
        summary,
        status: 'accepted',
      },
    });
    architecture.snapshots = [snapshot];
    architecture.draftSnapshot = snapshot;
    return architecture;
  }

  architecture.branch.summary = summary;
  const draftSnapshot = createArchitectureSnapshotFromBranchArchitecture(
    {
      ...architecture,
      implementationPlan: {
        id: 'plan-feature-auth',
        projectId: 'proj-architect',
        branchId,
        title: 'Kickoff plan - auth rollout',
        summary,
        phase: 'pre_build_draft',
        status: 'accepted',
        stepIds: ['step-auth', 'step-payments'],
        steps: [
          {
            id: 'step-auth',
            projectId: 'proj-architect',
            branchId,
            planId: 'plan-feature-auth',
            title: 'Ship authentication flow',
            status: 'accepted',
            plannedCapabilityIds: ['auth', 'backend'],
            implementationState: 'planned',
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'step-payments',
            projectId: 'proj-architect',
            branchId,
            planId: 'plan-feature-auth',
            title: 'Add billing later',
            status: 'accepted',
            plannedCapabilityIds: ['payments'],
            implementationState: 'planned',
            createdAt: now,
            updatedAt: now,
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      capabilityManifest: {
        id: 'manifest-feature-auth',
        projectId: 'proj-architect',
        branchId,
        title: 'Feature manifest',
        phase: 'pre_build_draft',
        status: 'accepted',
        capabilities: [
          {
            id: 'cap-auth',
            projectId: 'proj-architect',
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
            id: 'cap-backend',
            projectId: 'proj-architect',
            branchId,
            capabilityId: 'backend',
            title: 'Backend',
            status: 'accepted',
            plannedState: 'required',
            actualState: 'unknown',
            source: 'manual',
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'cap-payments',
            projectId: 'proj-architect',
            branchId,
            capabilityId: 'payments',
            title: 'Payments',
            status: 'accepted',
            plannedState: 'planned',
            actualState: 'unknown',
            source: 'manual',
            createdAt: now,
            updatedAt: now,
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      capabilityDecisions: [
        {
          id: 'cap-decision-auth',
          projectId: 'proj-architect',
          branchId,
          phase: 'pre_build_draft',
          capabilityId: 'auth',
          title: 'Require auth',
          summary: 'Authentication is required for this branch.',
          status: 'accepted',
          plannedState: 'required',
          actualState: 'unknown',
          createdAt: now,
          updatedAt: now,
        },
      ],
      architectureDecisions: [
        {
          id: 'decision-accepted',
          projectId: 'proj-architect',
          branchId,
          phase: 'pre_build_draft',
          title: 'Use Supabase auth',
          summary: 'Accepted direction for authentication and persistence.',
          status: 'accepted',
          source: 'branch_chat',
          chatLink: {
            source: 'branch_chat',
            conversationRef: `branch-chat:proj-architect:${branchId}`,
            chatThreadId: `branch-chat:proj-architect:${branchId}`,
            messageId: 'msg-auth-decision',
            messageTimestamp: Date.parse(now),
            messageRole: 'user',
            itemType: 'architecture_decision',
            extractedLanguage: 'en',
          },
          category: 'security',
          affectedCapabilityIds: ['auth', 'backend'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'decision-open',
          projectId: 'proj-architect',
          branchId,
          phase: 'pre_build_draft',
          title: 'Need tenant model decision',
          summary: 'Still open until data boundaries are clarified.',
          status: 'open',
          category: 'data',
          affectedCapabilityIds: ['backend'],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'decision-superseded',
          projectId: 'proj-architect',
          branchId,
          phase: 'pre_build_draft',
          title: 'Drop local-only auth',
          summary: 'Superseded after moving to server-backed auth.',
          status: 'superseded',
          category: 'system',
          affectedCapabilityIds: ['auth'],
          createdAt: now,
          updatedAt: now,
        },
      ],
      constraints: [
        {
          id: 'constraint-no-custom-backend',
          projectId: 'proj-architect',
          branchId,
          phase: 'pre_build_draft',
          title: 'Stay on Supabase for the first pass',
          summary: 'Do not introduce a separate backend service before the branch ships its first pass.',
          status: 'accepted',
          source: 'branch_chat',
          chatLink: {
            source: 'branch_chat',
            conversationRef: `branch-chat:proj-architect:${branchId}`,
            chatThreadId: `branch-chat:proj-architect:${branchId}`,
            messageId: 'msg-auth-constraint',
            messageTimestamp: Date.parse(now) + 1,
            messageRole: 'assistant',
            itemType: 'architecture_constraint',
            extractedLanguage: 'en',
          },
          constraintType: 'technical',
          affectedCapabilityIds: ['backend', 'auth'],
          createdAt: now,
          updatedAt: now,
        },
      ],
      openQuestions: [
        {
          id: 'question-tenancy',
          projectId: 'proj-architect',
          branchId,
          phase: 'pre_build_draft',
          title: 'Do we need tenant isolation before launch?',
          summary: 'Keep tenancy open until customer segmentation is confirmed.',
          status: 'open',
          source: 'branch_chat',
          chatLink: {
            source: 'branch_chat',
            conversationRef: `branch-chat:proj-architect:${branchId}`,
            chatThreadId: `branch-chat:proj-architect:${branchId}`,
            messageId: 'msg-auth-question',
            messageTimestamp: Date.parse(now) + 2,
            messageRole: 'user',
            itemType: 'open_architecture_question',
            extractedLanguage: 'en',
          },
          affectedCapabilityIds: ['backend'],
          createdAt: now,
          updatedAt: now,
        },
      ],
      deferredItems: [
        {
          id: 'deferred-sso',
          projectId: 'proj-architect',
          branchId,
          phase: 'pre_build_draft',
          title: 'Defer enterprise SSO',
          summary: 'Keep enterprise identity work out of the first pass.',
          status: 'deferred',
          source: 'branch_chat',
          chatLink: {
            source: 'branch_chat',
            conversationRef: `branch-chat:proj-architect:${branchId}`,
            chatThreadId: `branch-chat:proj-architect:${branchId}`,
            messageId: 'msg-auth-deferred',
            messageTimestamp: Date.parse(now) + 3,
            messageRole: 'assistant',
            itemType: 'deferred_item',
            extractedLanguage: 'en',
          },
          reason: 'Needs real customer validation',
          relatedCapabilityIds: ['auth'],
          deferredUntilPhase: 'post_build_actual',
          createdAt: now,
          updatedAt: now,
        },
      ],
    },
    'pre_build_draft',
    {
      id: 'snapshot-feature-auth',
      createdAt: now,
      branchBrief: {
        summary,
        status: 'accepted',
      },
    },
  );

  architecture.snapshots = [draftSnapshot];
  architecture.draftSnapshot = draftSnapshot;
  return architecture;
}

function buildRootOnlyArchitecture(branchId: string, summary: string): ProjectBranchArchitecture {
  const now = '2026-04-17T12:00:00.000Z';
  const architecture = createProjectBranchArchitecture('proj-architect', branchId, branchId, now, {
    headRevisionId: `rev-${branchId}`,
  });

  architecture.branch.summary = summary;
  architecture.branch.status = 'accepted';
  architecture.implementationPlan = {
    id: `plan-root-${branchId}`,
    projectId: 'proj-architect',
    branchId,
    title: 'Root memory plan',
    summary,
    phase: 'pre_build_draft',
    status: 'accepted',
    stepIds: ['root-step'],
    steps: [
      {
        id: 'root-step',
        projectId: 'proj-architect',
        branchId,
        planId: `plan-root-${branchId}`,
        title: 'Keep branch memory visible without snapshots',
        status: 'accepted',
        plannedCapabilityIds: ['backend'],
        implementationState: 'planned',
        createdAt: now,
        updatedAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  architecture.capabilityManifest = {
    id: `manifest-root-${branchId}`,
    projectId: 'proj-architect',
    branchId,
    title: 'Root capability manifest',
    phase: 'pre_build_draft',
    status: 'accepted',
    capabilities: [
      {
        id: 'cap-root-backend',
        projectId: 'proj-architect',
        branchId,
        capabilityId: 'backend',
        title: 'Backend',
        status: 'accepted',
        plannedState: 'required',
        actualState: 'unknown',
        source: 'manual',
        createdAt: now,
        updatedAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  return architecture;
}

function buildProject(): ProjectRecord {
  const now = '2026-04-17T12:00:00.000Z';
  return {
    id: 'proj-architect',
    name: 'Architect Studio',
    description: 'Branch architecture screen test',
    theme: 'dark-slate',
    files: {},
    chatHistory: [],
    createdAt: now,
    updatedAt: now,
    version: 1,
    activeBranchId: 'feature-auth',
    branches: {
      main: {
        id: 'main',
        projectId: 'proj-architect',
        name: 'main',
        isDefault: false,
        createdAt: now,
        updatedAt: now,
        files: {
          'App.tsx': 'export default function App(){ return <div>Main branch</div>; }',
        },
        chatHistory: [],
        revisions: [],
        architecture: buildArchitecture('main', 'Main branch summary'),
      },
      'feature-auth': {
        id: 'feature-auth',
        projectId: 'proj-architect',
        name: 'feature-auth',
        isDefault: true,
        createdAt: now,
        updatedAt: now,
        files: {
          '/route-manifest.json': JSON.stringify({
            version: 1,
            layout: 'tabs',
            routes: [
              { path: '/login', component: 'Login', filePath: 'pages/Login.tsx', title: 'Login', isHome: false, isProtected: false },
              { path: '/dashboard', component: 'Dashboard', filePath: 'pages/Dashboard.tsx', title: 'Dashboard', isHome: false, isProtected: true },
              { path: '/billing', component: 'Billing', filePath: 'pages/Billing.tsx', title: 'Billing', isHome: false, isProtected: true },
            ],
          }),
          'App.tsx': `
            import { createClient } from '@supabase/supabase-js';
            import { PostHogProvider } from 'posthog-js/react';
            import { Route, Routes } from 'react-router-dom';
            const client = createClient('url', 'key');
            export default function App() {
              return (
                <PostHogProvider client={client as any}>
                  <Routes>
                    <Route path="/login" element={<div>Login</div>} />
                    <Route path="/dashboard" element={<div>Dashboard</div>} />
                    <Route path="/settings" element={<div>Settings</div>} />
                  </Routes>
                </PostHogProvider>
              );
            }
          `,
          'pages/Login.tsx': 'export default function Login(){ return <div>Login</div>; }',
          'pages/Dashboard.tsx': 'export default function Dashboard(){ return <div>Dashboard</div>; }',
          'pages/Settings.tsx': 'export default function Settings(){ return <div>Settings</div>; }',
          'src/backend.ts': 'import { createClient } from "@supabase/supabase-js"; export const client = createClient("url", "key");',
          'src/auth.ts': 'export async function signIn(){ return supabase.auth.signInWithPassword({ email: "a", password: "b" }); }',
          'src/analytics.ts': 'export const analytics = "posthog";',
          'src/config.ts': 'export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;',
        },
        chatHistory: [],
        revisions: [],
        architecture: buildArchitecture(
          'feature-auth',
          'Feature branch summary for auth rollout',
          true,
        ),
      },
    },
  };
}

describe('BranchArchitectureScreen', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the active branch instead of another branch', () => {
    render(
      <BranchArchitectureScreen theme="dark" project={buildProject()} appLanguage="en" />,
    );

    expect(screen.getByTestId('architect-branch-brief')).toHaveTextContent('Feature branch summary for auth rollout');
    expect(screen.queryByText('Main branch summary')).not.toBeInTheDocument();
    expect(screen.getByTestId('architect-branch-brief')).toHaveTextContent('feature-auth');
  });

  it('groups accepted, open, and superseded decisions', () => {
    render(
      <BranchArchitectureScreen theme="dark" project={buildProject()} appLanguage="en" />,
    );

    const decisions = within(screen.getByTestId('architect-decisions'));
    expect(decisions.getByText('Use Supabase auth')).toBeInTheDocument();
    expect(decisions.getByText('Stay on Supabase for the first pass')).toBeInTheDocument();
    expect(decisions.getByText('Do we need tenant isolation before launch?')).toBeInTheDocument();
    expect(decisions.getByText('Need tenant model decision')).toBeInTheDocument();
    expect(decisions.getByText('Drop local-only auth')).toBeInTheDocument();
  });

  it('shows deferred items for the active branch', () => {
    render(
      <BranchArchitectureScreen theme="dark" project={buildProject()} appLanguage="en" />,
    );

    const deferred = within(screen.getByTestId('architect-deferred'));
    expect(deferred.getByText('Defer enterprise SSO')).toBeInTheDocument();
    expect(deferred.getByText(/Needs real customer validation/)).toBeInTheDocument();
    expect(deferred.getByText(/Source: Branch conversation/)).toBeInTheDocument();
    expect(deferred.getByText(/Message: msg-auth-deferred/)).toBeInTheDocument();
  });

  it('shows chat provenance for chat-derived decisions, constraints, and questions', () => {
    render(
      <BranchArchitectureScreen theme="dark" project={buildProject()} appLanguage="en" />,
    );

    const decisions = within(screen.getByTestId('architect-decisions'));
    expect(decisions.getAllByText('Source: Branch conversation').length).toBeGreaterThan(0);
    expect(decisions.getByText('Message: msg-auth-decision')).toBeInTheDocument();
    expect(decisions.getAllByText('Thread: branch-chat:proj-architect:feature-auth').length).toBeGreaterThan(0);
  });

  it('renders the plan-vs-reality section with planned gaps and unplanned implementation', () => {
    render(
      <BranchArchitectureScreen theme="dark" project={buildProject()} appLanguage="en" />,
    );

    const suggestedNextStep = screen.getByTestId('architect-suggested-next-step');
    expect(suggestedNextStep).toHaveTextContent('Suggested next step');
    expect(suggestedNextStep).toHaveTextContent('Settings');
    expect(suggestedNextStep).toHaveTextContent('Reconcile branch drift around "Settings" before expanding scope.');

    const planVsReality = screen.getByTestId('architect-plan-vs-reality');
    expect(planVsReality).toHaveTextContent('Planned, not implemented');
    expect(planVsReality).toHaveTextContent('Payments');
    expect(planVsReality).toHaveTextContent('Add billing later');
    expect(planVsReality).toHaveTextContent('Current implementation plan: Partial — Payments');
    expect(planVsReality).toHaveTextContent('Implemented, not in plan');
    expect(planVsReality).toHaveTextContent('Analytics');
    expect(planVsReality).toHaveTextContent('Decisions now superseded');
    expect(planVsReality).toHaveTextContent('Drop local-only auth');
  });

  it('renders the branch reality block with aligned, missing, and drifting signals', () => {
    render(
      <BranchArchitectureScreen theme="dark" project={buildProject()} appLanguage="en" />,
    );

    const reality = within(screen.getByTestId('architect-branch-reality'));
    expect(reality.getByText('Branch reality')).toBeInTheDocument();
    expect(reality.getByText('Drifted')).toBeInTheDocument();
    expect(reality.getByText('Login')).toBeInTheDocument();
    expect(reality.getByText('Billing')).toBeInTheDocument();
    expect(reality.getAllByText('Settings').length).toBeGreaterThan(0);
    expect(reality.getByText('Next pass')).toBeInTheDocument();
  });

  it('renders visible Architect copy in the selected user language', () => {
    render(
      <BranchArchitectureScreen theme="dark" project={buildProject()} appLanguage="ru" />,
    );

    expect(screen.getByText('Кратко по ветке')).toBeInTheDocument();
    expect(screen.getByText('Текущий план реализации')).toBeInTheDocument();
    expect(screen.getAllByText('Рекомендуемый следующий шаг').length).toBeGreaterThan(0);
    expect(screen.getByText('План и реальность')).toBeInTheDocument();
    expect(screen.getByText('Реальность ветки')).toBeInTheDocument();
    expect(screen.getByText('Текущее фактическое состояние проекта')).toBeInTheDocument();
    expect(screen.getAllByText('Источник: Разговор в ветке').length).toBeGreaterThan(0);
  });

  it('renders compact mode and trust indicators for the active branch', () => {
    render(
      <BranchArchitectureScreen theme="dark" project={buildProject()} appLanguage="en" />,
    );

    const trust = within(screen.getByTestId('architect-generation-trust'));
    expect(trust.getByText('Generation trust')).toBeInTheDocument();
    expect(trust.getByText('Architect-guided mode')).toBeInTheDocument();
    expect(trust.getByText('Trust basis: Using accepted branch architecture')).toBeInTheDocument();
    expect(trust.getByText('Using accepted branch architecture')).toBeInTheDocument();
    expect(trust.getByText('Deferred items excluded from scope')).toBeInTheDocument();
  });

  it('renders chat-derived user-facing architecture text in the original user language', () => {
    const project = buildProject();
    const featureArchitecture = project.branches?.['feature-auth']?.architecture;
    if (!featureArchitecture) {
      throw new Error('Expected feature-auth architecture in test fixture');
    }

    featureArchitecture.architectureDecisions.unshift({
      id: 'decision-ru-chat',
      projectId: 'proj-architect',
      branchId: 'feature-auth',
      phase: 'pre_build_draft',
      title: 'Используем Supabase Auth для первого прохода',
      summary: 'Используем Supabase Auth для первого прохода и хранения сессий.',
      status: 'accepted',
      source: 'branch_chat',
      chatLink: {
        source: 'branch_chat',
        conversationRef: 'branch-chat:proj-architect:feature-auth',
        chatThreadId: 'branch-chat:proj-architect:feature-auth',
        messageId: 'msg-ru-chat',
        messageTimestamp: Date.parse(project.createdAt),
        messageRole: 'user',
        itemType: 'architecture_decision',
        extractedLanguage: 'ru',
      },
      category: 'security',
      affectedCapabilityIds: ['auth', 'backend'],
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });

    render(
      <BranchArchitectureScreen theme="dark" project={project} appLanguage="ru" />,
    );

    expect(screen.getByText('Используем Supabase Auth для первого прохода')).toBeInTheDocument();
    expect(screen.getByText('Используем Supabase Auth для первого прохода и хранения сессий.')).toBeInTheDocument();
  });

  it('shows a visible proposed-draft indicator for unconfirmed branch architecture', () => {
    const project = buildProject();
    const featureArchitecture = project.branches?.['feature-auth']?.architecture;
    if (!featureArchitecture?.draftSnapshot) {
      throw new Error('Expected feature-auth draft snapshot in test fixture');
    }

    featureArchitecture.branch.status = 'proposed';
    featureArchitecture.draftSnapshot.branchBrief.status = 'proposed';
    if (featureArchitecture.draftSnapshot.implementationPlan) {
      featureArchitecture.draftSnapshot.implementationPlan.status = 'proposed';
      featureArchitecture.draftSnapshot.implementationPlan.steps = featureArchitecture.draftSnapshot.implementationPlan.steps.map(step => ({
        ...step,
        status: 'proposed',
      }));
    }
    if (featureArchitecture.draftSnapshot.capabilityManifest) {
      featureArchitecture.draftSnapshot.capabilityManifest.status = 'proposed';
      featureArchitecture.draftSnapshot.capabilityManifest.capabilities = featureArchitecture.draftSnapshot.capabilityManifest.capabilities.map(capability => ({
        ...capability,
        status: capability.status === 'deferred' ? capability.status : 'proposed',
      }));
    }
    featureArchitecture.architectureDecisions = featureArchitecture.architectureDecisions.map(decision => ({
      ...decision,
      status: decision.status === 'superseded' ? decision.status : 'proposed',
    }));
    featureArchitecture.constraints = featureArchitecture.constraints.map(constraint => ({
      ...constraint,
      status: 'proposed',
    }));
    featureArchitecture.capabilityDecisions = featureArchitecture.capabilityDecisions.map(decision => ({
      ...decision,
      status: 'proposed',
    }));
    featureArchitecture.draftSnapshot.architectureDecisions = featureArchitecture.draftSnapshot.architectureDecisions.map(decision => ({
      ...decision,
      status: decision.status === 'superseded' ? decision.status : 'proposed',
    }));
    featureArchitecture.draftSnapshot.constraints = featureArchitecture.draftSnapshot.constraints.map(constraint => ({
      ...constraint,
      status: 'proposed',
    }));
    featureArchitecture.draftSnapshot.capabilityDecisions = featureArchitecture.draftSnapshot.capabilityDecisions.map(decision => ({
      ...decision,
      status: 'proposed',
    }));

    render(
      <BranchArchitectureScreen theme="dark" project={project} appLanguage="en" />,
    );

    const branchBrief = screen.getByTestId('architect-branch-brief');
    expect(branchBrief).toHaveTextContent('Proposed draft');
    expect(screen.getByTestId('architect-generation-trust')).toHaveTextContent('Proposed experiment mode');
    expect(screen.getByTestId('architect-generation-trust')).toHaveTextContent('Using proposed draft guidance');
  });

  it('falls back to root branch architecture memory when snapshots are absent', () => {
    const project = buildProject();
    project.activeBranchId = 'feature-root-only';
    project.branches = {
      ...project.branches,
      'feature-root-only': {
        id: 'feature-root-only',
        projectId: 'proj-architect',
        name: 'feature-root-only',
        isDefault: true,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        files: {
          'src/api.ts': 'export const api = "/api";',
        },
        chatHistory: [],
        revisions: [],
        architecture: buildRootOnlyArchitecture('feature-root-only', 'Root-only architecture memory'),
      },
    };

    render(
      <BranchArchitectureScreen theme="dark" project={project} appLanguage="en" />,
    );

    expect(screen.getByTestId('architect-branch-brief')).toHaveTextContent('Root-only architecture memory');
    expect(screen.getByTestId('architect-plan')).toHaveTextContent('Root memory plan');
    expect(screen.getByTestId('architect-capabilities')).toHaveTextContent('Backend');
  });

  it('renders actual branch state details from real branch files', () => {
    render(
      <BranchArchitectureScreen theme="dark" project={buildProject()} appLanguage="en" />,
    );

    const actualState = within(screen.getByTestId('architect-actual-state'));
    expect(actualState.getByText('Observed surfaces')).toBeInTheDocument();
    expect(actualState.getByText('Authentication: Implemented')).toBeInTheDocument();
    expect(actualState.getByText('@supabase/supabase-js')).toBeInTheDocument();
    expect(actualState.getByText('VITE_SUPABASE_URL')).toBeInTheDocument();
  });

  it('falls back unsupported locales to English trust labels', () => {
    render(
      <BranchArchitectureScreen theme="dark" project={buildProject()} appLanguage="it-IT" />,
    );

    const trust = within(screen.getByTestId('architect-generation-trust'));
    expect(trust.getByText('Generation trust')).toBeInTheDocument();
    expect(trust.getByText('Architect-guided mode')).toBeInTheDocument();
  });
});
