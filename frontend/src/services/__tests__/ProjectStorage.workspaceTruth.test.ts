// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProjectStorage, type StoredProject } from '../ProjectStorage';
import { revisionManager } from '../RevisionManager';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('ProjectStorage workspace truth', () => {
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
