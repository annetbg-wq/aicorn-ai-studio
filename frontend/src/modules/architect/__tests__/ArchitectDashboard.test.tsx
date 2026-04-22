// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ArchitectDashboard from '../ArchitectDashboard';
import { ProjectRepository } from '../../../services/ProjectRepository';
import type { ProjectRecord } from '../../../services/ProjectRepository';
import type { StudioProject } from '../components/ProjectsHub';

vi.mock('../../../services/ProjectRepository', () => ({
  ProjectRepository: {
    getProject: vi.fn(),
  },
}));

vi.mock('../components/ProjectsHub', () => ({
  ProjectsHub: () => <div data-testid="projects-hub">ProjectsHub</div>,
}));

vi.mock('../components/BranchArchitectureScreen', () => ({
  BranchArchitectureScreen: ({ appLanguage }: { appLanguage: string }) => (
    <div data-testid="branch-architecture-screen">{appLanguage}</div>
  ),
}));

const project: ProjectRecord = {
  id: 'proj-architect',
  name: 'Architect Studio',
  description: 'Architect dashboard test',
  theme: 'dark-slate',
  files: {},
  chatHistory: [],
  createdAt: '2026-04-17T12:00:00.000Z',
  updatedAt: '2026-04-17T12:00:00.000Z',
  version: 1,
  activeBranchId: 'feature-auth',
  branches: {
    'feature-auth': {
      id: 'feature-auth',
      projectId: 'proj-architect',
      name: 'feature-auth',
      isDefault: true,
      createdAt: '2026-04-17T12:00:00.000Z',
      updatedAt: '2026-04-17T12:00:00.000Z',
      files: {},
      chatHistory: [],
      revisions: [],
      architecture: {
        id: 'feature-auth',
        projectId: 'proj-architect',
        branchId: 'feature-auth',
        modelVersion: 1,
        branch: {
          id: 'branch-brief-feature-auth',
          projectId: 'proj-architect',
          branchId: 'feature-auth',
          branchName: 'feature-auth',
          summary: 'Feature auth branch',
          status: 'accepted',
          createdAt: '2026-04-17T12:00:00.000Z',
          updatedAt: '2026-04-17T12:00:00.000Z',
        },
        draftSnapshot: null,
        actualSnapshot: null,
        snapshots: [],
        implementationPlan: null,
        capabilityManifest: null,
        capabilityDecisions: [],
        architectureDecisions: [],
        constraints: [],
        openQuestions: [],
        deferredItems: [],
        createdAt: '2026-04-17T12:00:00.000Z',
        updatedAt: '2026-04-17T12:00:00.000Z',
      },
    },
  },
};

const projects: StudioProject[] = [
  {
    id: 'proj-architect',
    title: 'Architect Studio',
    updatedAt: '2026-04-17T12:00:00.000Z',
  },
];

describe('ArchitectDashboard', () => {
  beforeEach(() => {
    vi.mocked(ProjectRepository.getProject).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders localized Architect chrome for the active user language', async () => {
    vi.mocked(ProjectRepository.getProject).mockResolvedValue(project);

    render(
      <ArchitectDashboard
        theme="dark"
        projects={projects}
        currentProjectId="proj-architect"
        onLoadProject={vi.fn()}
        onNavigateEngine={vi.fn()}
        appLanguage="ru"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('branch-architecture-screen')).toBeInTheDocument();
    });

    expect(screen.getByText('Архитектор продукта')).toBeInTheDocument();
    expect(screen.getByText('— архитектура ветки')).toBeInTheDocument();
    expect(screen.getByText('feature-auth')).toBeInTheDocument();
  });

  it('shows an honest loading state while the branch project is being read', async () => {
    vi.mocked(ProjectRepository.getProject).mockReturnValue(new Promise(() => {}));

    render(
      <ArchitectDashboard
        theme="dark"
        projects={projects}
        currentProjectId="proj-architect"
        onLoadProject={vi.fn()}
        onNavigateEngine={vi.fn()}
        appLanguage="en"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Loading branch architecture…')).toBeInTheDocument();
    });

    expect(
      screen.getByText('Reading the active project, branch memory, and current implementation state.'),
    ).toBeInTheDocument();
  });

  it('shows an honest error state when the active branch project cannot be loaded', async () => {
    vi.mocked(ProjectRepository.getProject).mockRejectedValue(new Error('boom'));

    render(
      <ArchitectDashboard
        theme="dark"
        projects={projects}
        currentProjectId="proj-architect"
        onLoadProject={vi.fn()}
        onNavigateEngine={vi.fn()}
        appLanguage="en"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Could not load branch architecture')).toBeInTheDocument();
    });

    expect(
      screen.getByText('The Architect screen could not read the active branch state. boom'),
    ).toBeInTheDocument();
  });

  it('does not refetch the active project only because the app language changes', async () => {
    vi.mocked(ProjectRepository.getProject).mockResolvedValue(project);

    const { rerender } = render(
      <ArchitectDashboard
        theme="dark"
        projects={projects}
        currentProjectId="proj-architect"
        onLoadProject={vi.fn()}
        onNavigateEngine={vi.fn()}
        appLanguage="en"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('branch-architecture-screen')).toBeInTheDocument();
    });

    rerender(
      <ArchitectDashboard
        theme="dark"
        projects={projects}
        currentProjectId="proj-architect"
        onLoadProject={vi.fn()}
        onNavigateEngine={vi.fn()}
        appLanguage="ru"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('branch-architecture-screen')).toHaveTextContent('ru');
    });

    expect(ProjectRepository.getProject).toHaveBeenCalledTimes(1);
  });
});
