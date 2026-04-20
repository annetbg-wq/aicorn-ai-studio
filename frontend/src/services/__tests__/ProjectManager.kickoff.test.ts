import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ProjectRepository', () => ({
  ProjectRepository: {
    getProject: vi.fn(),
    loadToPreview: vi.fn(),
  },
}));

import { ProjectStorage } from '../ProjectStorage';
import { ProjectManager } from '../ProjectManager';

describe('ProjectManager kickoff context', () => {
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

  it('uses the intended active branch from stored project state on first genesis', () => {
    const now = '2026-04-17T22:00:00.000Z';
    const project = ProjectManager.create({
      name: 'Genesis Project',
      theme: 'dark-slate',
      description: '',
    });

    ProjectStorage.saveProject({
      ...ProjectStorage.getProject(project.id)!,
      activeBranchId: 'feature-genesis',
      updatedAt: now,
    });
    ProjectManager.setCurrent(project.id);

    expect(ProjectManager.resolveKickoffContext(null)).toEqual({
      projectId: project.id,
      branchId: 'feature-genesis',
    });
  });

  it('returns main only when no stored active branch exists', () => {
    expect(ProjectManager.resolveKickoffContext(null)).toEqual({
      projectId: null,
      branchId: 'main',
    });
  });
});
