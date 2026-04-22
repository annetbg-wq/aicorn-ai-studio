// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProjectStorage, type StoredProject } from '../ProjectStorage';
import { revisionManager } from '../RevisionManager';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('ProjectStorage workspace truth', () => {
  it('normalizes legacy title into canonical name and prunes stale meta-only entries', () => {
    const now = '2026-04-21T08:00:00.000Z';
    localStorage.setItem('aic-project-meta', JSON.stringify([
      {
        id: 'stale-meta-only',
        title: 'Should Not Render',
        description: '',
        theme: 'dark-slate',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'legacy-title-project',
        title: 'Legacy Title Project',
        description: '',
        theme: 'dark-slate',
        createdAt: now,
        updatedAt: now,
      },
    ]));
    localStorage.setItem('aic-proj-legacy-title-project', JSON.stringify({
      id: 'legacy-title-project',
      title: 'Legacy Title Project',
      description: '',
      theme: 'dark-slate',
      createdAt: now,
      updatedAt: now,
      files: { 'App.tsx': 'export default function App() { return null; }' },
      chatHistory: [],
    }));

    const projects = ProjectStorage.listProjects();

    expect(projects).toHaveLength(1);
    expect(projects[0].id).toBe('legacy-title-project');
    expect(projects[0].name).toBe('Legacy Title Project');
    expect(ProjectStorage.getProject('legacy-title-project')?.name).toBe('Legacy Title Project');
    expect(localStorage.getItem('aic-project-meta')).not.toContain('stale-meta-only');
  });

  it('soft-fails empty persisted project preload without touching the live preview candidate', async () => {
    const materializeSpy = vi.spyOn(revisionManager, 'materializePersistedFiles');
    const emptyProject: StoredProject = {
      id: 'missing-project',
      name: 'Missing Project',
      description: '',
      theme: 'dark-slate',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      files: {},
      chatHistory: [],
    };

    await expect(ProjectStorage.loadToPreview(emptyProject)).resolves.toBeUndefined();
    expect(materializeSpy).not.toHaveBeenCalled();
  });
});
