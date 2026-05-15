// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseFrom = vi.hoisted(() => vi.fn());
const supabaseGetUser = vi.hoisted(() => vi.fn());

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: supabaseFrom,
    auth: {
      getUser: supabaseGetUser,
    },
  },
}));

vi.mock('../PreviewController', () => ({
  previewLog: vi.fn(),
  setTimelineContext: vi.fn(),
}));

vi.mock('../RevisionManager', () => ({
  PRELOAD_SKIP_OWNED_MSG: 'PRELOAD_SKIP_OWNED',
  revisionManager: {
    materializePersistedFiles: vi.fn(),
  },
}));

vi.mock('../toastBus', () => ({
  showToast: vi.fn(),
}));

vi.mock('../projectCorruptionScan', () => ({
  scanBeforePreviewLoad: vi.fn(() => ({ safe: true, findings: [] })),
}));

import { ProjectRepository, type ProjectRecord } from '../ProjectRepository';
import { ProjectStorage } from '../ProjectStorage';

const uuid = '11111111-1111-4111-8111-111111111111';
const now = '2026-04-21T08:00:00.000Z';

function supabaseMiss() {
  const builder: any = {
    select: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve({ data: null, error: { message: 'offline' } })),
    eq: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve({ data: null, error: { code: 'PGRST116' } })),
    delete: vi.fn(() => builder),
  };
  return builder;
}

function buildUuidProject(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: uuid,
    name: 'Cloud Project',
    description: '',
    theme: 'dark-slate',
    files: { 'App.tsx': 'export default function App(){return null;}' },
    chatHistory: [],
    createdAt: now,
    updatedAt: now,
    version: 1,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  supabaseFrom.mockReset();
  supabaseGetUser.mockReset();
  supabaseGetUser.mockResolvedValue({ data: { user: null }, error: null });
  supabaseFrom.mockReturnValue(supabaseMiss());
});

describe('ProjectRepository hygiene', () => {
  it('does not treat stale metadata alone as project existence', async () => {
    localStorage.setItem('aic_projects_meta', JSON.stringify([
      { id: uuid, name: 'Stale Meta', theme: 'dark-slate', updatedAt: now, version: 1 },
    ]));

    await expect(ProjectRepository.projectExists(uuid)).resolves.toBe(false);
  });

  it('filters stale cached entries and keeps loadable local projects in repository lists', async () => {
    ProjectStorage.saveProject({
      id: 'local-project',
      name: 'Local Project',
      description: '',
      theme: 'dark-slate',
      createdAt: now,
      updatedAt: now,
      files: { 'App.tsx': 'export default function App() { return null; }' },
      chatHistory: [],
    });
    localStorage.setItem('aic_projects_meta', JSON.stringify([
      { id: 'stale-cached', name: 'Stale Cached', theme: 'dark-slate', updatedAt: now, version: 1 },
      { id: 'local-project', name: 'Local Project', theme: 'dark-slate', updatedAt: now, version: 1 },
    ]));

    const projects = await ProjectRepository.listProjects();

    expect(projects.map(project => project.id)).toEqual(['local-project']);
    expect(projects[0].name).toBe('Local Project');
    expect(localStorage.getItem('aic_projects_meta')).not.toContain('stale-cached');
  });

  it('skips Supabase upsert for UUID projects when no auth user exists', async () => {
    const upsert = vi.fn(() => Promise.resolve({ error: null }));
    supabaseFrom.mockReturnValue({ upsert });
    supabaseGetUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(ProjectRepository.saveProject(buildUuidProject())).resolves.toBeUndefined();

    expect(upsert).not.toHaveBeenCalled();
    expect(ProjectStorage.getProject(uuid)?.id).toBe(uuid);
  });

  it('writes auth user_id into Supabase upsert payload for UUID projects', async () => {
    const upsert = vi.fn(() => Promise.resolve({ error: null }));
    supabaseFrom.mockReturnValue({ upsert });
    supabaseGetUser.mockResolvedValue({ data: { user: { id: 'owner-uid-1' } }, error: null });

    await expect(ProjectRepository.saveProject(buildUuidProject({ userId: 'anonymous' }))).resolves.toBeUndefined();

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: uuid,
        user_id: 'owner-uid-1',
      }),
      expect.objectContaining({ onConflict: 'id' }),
    );
  });

  it('falls back to local storage when auth lookup fails', async () => {
    const upsert = vi.fn(() => Promise.resolve({ error: null }));
    supabaseFrom.mockReturnValue({ upsert });
    supabaseGetUser.mockRejectedValue(new Error('auth unavailable'));

    await expect(ProjectRepository.saveProject(buildUuidProject())).resolves.toBeUndefined();

    expect(upsert).not.toHaveBeenCalled();
    expect(ProjectStorage.getProject(uuid)?.id).toBe(uuid);
  });
});
