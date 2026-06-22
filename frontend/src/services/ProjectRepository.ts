/**
 * ProjectRepository — ЕДИНСТВЕННЫЙ сервис для работы с проектами.
 *
 * Canonical flow:
 *   Supabase (user_projects) — источник правды (полные файлы + chatHistory)
 *   localStorage (aic_projects_meta) — кэш метаданных для быстрого списка
 *   ProjectStorage — fallback для оффлайн / legacy данных
 *
 * ProjectStorage и ProjectManager остаются для обратной совместимости,
 * но новый код использует только ProjectRepository.
 */

import { supabase } from '../lib/supabase';
import { ProjectStorage } from './ProjectStorage';
import { BackendProjectStore } from './BackendProjectStore';
import { previewLog, setTimelineContext } from './PreviewController';
import { revisionManager, PRELOAD_SKIP_OWNED_MSG } from './RevisionManager';
import { showToast } from './toastBus';
import { safeSetItem } from '../lib/safeStorage';
import { scanBeforePreviewLoad } from './projectCorruptionScan';
import {
  DEFAULT_PROJECT_BRANCH_ID,
  createProjectBranchArchitecture,
  normalizeProjectBranchArchitecture,
  upsertArchitectureSnapshot,
  type ArchitectureSnapshot,
  type PersistedProjectBranch,
  type ProjectBranchArchitecture,
} from '../shared/projectModel';

// ── Public types ───────────────────────────────────────────────────────────────

export interface ProjectRecord {
  id:          string;
  name:        string;
  description: string;
  theme:       string;
  files:       Record<string, string>;
  chatHistory: unknown[];
  createdAt:   string;
  updatedAt:   string;
  version:     number;
  activeBranchId?: string;
  branches?: Record<string, PersistedProjectBranch>;
  userId?:     string;
  generationPath?: string; // 'skeleton_assembly' | 'blank_canvas'
}

export interface ProjectMetaSummary {
  id:             string;
  name:           string;
  theme:          string;
  updatedAt:      string;
  version:        number;
  activeBranchId?: string;
  branchIds?:     string[];
  branchCount?:   number;
}

// ── Internal constants ─────────────────────────────────────────────────────────

const LOCAL_META_KEY = 'aic_projects_meta'; // только метаданные, не файлы
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getCanonicalProjectName(project: unknown, fallback = 'New Project'): string {
  if (!project || typeof project !== 'object') return fallback;
  const record = project as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (name) return name;
  const legacyTitle = typeof record.title === 'string' ? record.title.trim() : '';
  return legacyTitle || fallback;
}

function normalizeMetaSummary(raw: unknown): ProjectMetaSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (!id) return null;
  const updatedAt =
    typeof record.updatedAt === 'string' && record.updatedAt
      ? record.updatedAt
      : typeof record.last_sync_at === 'string' && record.last_sync_at
        ? record.last_sync_at
        : new Date(0).toISOString();

  const snapshot = record.code_snapshot && typeof record.code_snapshot === 'object'
    ? record.code_snapshot as Record<string, unknown>
    : {};
  const branches = snapshot.branches && typeof snapshot.branches === 'object'
    ? snapshot.branches as Record<string, unknown>
    : undefined;
  const branchIds = Array.isArray(record.branchIds)
    ? record.branchIds.filter((v): v is string => typeof v === 'string')
    : branches
      ? Object.keys(branches)
      : undefined;

  return {
    id,
    name: getCanonicalProjectName(record),
    theme:
      typeof record.theme === 'string' && record.theme
        ? record.theme
        : typeof snapshot.theme === 'string' && snapshot.theme
          ? snapshot.theme
          : 'dark-slate',
    updatedAt,
    version: typeof record.version === 'number' ? record.version : 1,
    activeBranchId:
      typeof record.activeBranchId === 'string'
        ? record.activeBranchId
        : typeof snapshot.activeBranchId === 'string'
          ? snapshot.activeBranchId
          : undefined,
    branchIds,
    branchCount:
      typeof record.branchCount === 'number'
        ? record.branchCount
        : branchIds?.length,
  };
}

function normalizeCachedMetaList(value: string | null): ProjectMetaSummary[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.flatMap(raw => {
      const meta = normalizeMetaSummary(raw);
      if (!meta || seen.has(meta.id) || !ProjectStorage.projectDataExists(meta.id)) return [];
      seen.add(meta.id);
      return [meta];
    });
  } catch {
    return [];
  }
}

function removeRepositoryMeta(id: string): void {
  try {
    const cached = normalizeCachedMetaList(localStorage.getItem(LOCAL_META_KEY));
    safeSetItem(LOCAL_META_KEY, JSON.stringify(cached.filter(p => p.id !== id)));
  } catch { /* non-fatal */ }
}

async function getCurrentSupabaseUserId(): Promise<string | null> {
  const auth = (supabase as {
    auth?: {
      getUser?: () => Promise<{ data?: { user?: { id?: string } | null } | null }>;
    };
  }).auth;
  if (!auth?.getUser) return null;

  try {
    const { data } = await auth.getUser();
    const userId = data?.user?.id;
    return typeof userId === 'string' && userId ? userId : null;
  } catch {
    return null;
  }
}

function createProjectBranchRecord(
  project: ProjectRecord,
  branchId: string,
  now: string,
): PersistedProjectBranch {
  return {
    id: branchId,
    projectId: project.id,
    name: branchId,
    isDefault: (project.activeBranchId ?? DEFAULT_PROJECT_BRANCH_ID) === branchId,
    createdAt: project.createdAt,
    updatedAt: now,
    activeLineageId: undefined,
    files: {},
    chatHistory: [],
    revisions: [],
    architecture: createProjectBranchArchitecture(project.id, branchId, branchId, now),
  };
}

function normalizeProjectBranches(project: ProjectRecord): {
  activeBranchId: string;
  branches: Record<string, PersistedProjectBranch>;
} {
  const now = project.updatedAt || new Date().toISOString();
  const activeBranchId = project.activeBranchId ?? DEFAULT_PROJECT_BRANCH_ID;

  const branchEntries = Object.entries(project.branches ?? {}).map(([branchId, branch]) => {
    const branchName = branch.name || branchId;
    return [
      branchId,
      {
        ...branch,
        id: branch.id ?? branchId,
        projectId: project.id,
        name: branchName,
        isDefault: branch.isDefault ?? branchId === activeBranchId,
        createdAt: branch.createdAt ?? project.createdAt,
        updatedAt: branch.updatedAt ?? now,
        chatThreadId: branch.chatThreadId,
        headRevisionId: branch.headRevisionId,
        activeLineageId: typeof branch.activeLineageId === 'string' ? branch.activeLineageId : undefined,
        files: branch.files ?? {},
        chatHistory: Array.isArray(branch.chatHistory) ? branch.chatHistory : [],
        revisions: Array.isArray(branch.revisions) ? branch.revisions : [],
        architecture: normalizeProjectBranchArchitecture(
          branch.architecture,
          project.id,
          branchId,
          branchName,
          now,
          {
            chatThreadId: branch.chatThreadId,
            headRevisionId: branch.headRevisionId,
          },
        ),
      } satisfies PersistedProjectBranch,
    ] as const;
  });

  const branches = Object.fromEntries(
    branchEntries.map(([branchId, branch]) => [
      branchId,
        {
          ...branch,
          chatThreadId: branch.architecture.branch.chatThreadId ?? branch.chatThreadId,
          headRevisionId: branch.architecture.branch.headRevisionId ?? branch.headRevisionId,
          activeLineageId: branch.activeLineageId,
        },
      ]),
    ) as Record<string, PersistedProjectBranch>;

  if (!branches[activeBranchId]) {
    branches[activeBranchId] = {
      ...createProjectBranchRecord(project, activeBranchId, now),
      isDefault: true,
      files: project.files ?? {},
      chatHistory: project.chatHistory ?? [],
      revisions: (project as any).revisions ?? [],
    };
  }

  return { activeBranchId, branches };
}

function pruneSupersededDraftSnapshots(
  architecture: ProjectBranchArchitecture,
  incomingSnapshot: ArchitectureSnapshot,
): ProjectBranchArchitecture {
  if (incomingSnapshot.phase !== 'pre_build_draft') {
    return architecture;
  }

  const incomingStatus = incomingSnapshot.branchBrief?.status;
  if (incomingStatus !== 'proposed' && incomingStatus !== 'accepted') {
    return architecture;
  }

  return {
    ...architecture,
    snapshots: (architecture.snapshots ?? []).filter(existing => {
      if (existing.id === incomingSnapshot.id) return false;
      if (existing.phase !== 'pre_build_draft') return true;
      return existing.branchBrief?.status !== 'proposed';
    }),
  };
}

// ── Repository ─────────────────────────────────────────────────────────────────

export const ProjectRepository = {

  // ── Список проектов (только метаданные — быстро) ─────────────────────────

  async listProjects(): Promise<ProjectMetaSummary[]> {
    // Filesystem store is the canonical dev persistence (localStorage is too small).
    // Prepend its projects and dedupe everything else against them.
    const backendMetas: ProjectMetaSummary[] = (await BackendProjectStore.list()).map(m => ({
      id:             m.id,
      name:           m.name || 'Project',
      theme:          'dark-slate',
      updatedAt:      m.updatedAt ?? new Date().toISOString(),
      version:        1,
      activeBranchId: undefined,
      branchIds:      undefined,
      branchCount:    undefined,
    }));
    const mergeBackend = (rest: ProjectMetaSummary[]): ProjectMetaSummary[] => {
      const ids = new Set(backendMetas.map(p => p.id));
      return [...backendMetas, ...rest.filter(p => !ids.has(p.id))]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    };

    // Collect local-only (non-UUID) projects — drafts that haven't been synced to Supabase yet
    const localOnlyProjects = (): ProjectMetaSummary[] =>
      ProjectStorage.listProjects()
        .filter(p => !UUID_RE.test(p.id))
        .map(m => ({
          id:             m.id,
          name:           getCanonicalProjectName(m),
          theme:          m.theme ?? 'dark-slate',
          updatedAt:      m.updatedAt,
          version:        1,
          activeBranchId: m.activeBranchId,
          branchIds:      m.branchIds,
          branchCount:    m.branchCount,
        }));

    const currentUserId = await getCurrentSupabaseUserId();
    if (currentUserId) {
      // Сначала пробуем Supabase
      try {
        const { data, error } = await supabase
          .from('user_projects')
          .select('id, name, last_sync_at, version, code_snapshot')
          .order('last_sync_at', { ascending: false })
          .limit(50);

        if (!error && data) {
          const supabaseMeta: ProjectMetaSummary[] = data.flatMap(row => {
            const normalized = normalizeMetaSummary(row);
            return normalized ? [normalized] : [];
          });
          // Merge: Supabase projects first, then local-only drafts not yet in Supabase
          const supabaseIds = new Set(supabaseMeta.map(p => p.id));
          const merged = [
            ...supabaseMeta,
            ...localOnlyProjects().filter(p => !supabaseIds.has(p.id)),
          ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          safeSetItem(LOCAL_META_KEY, JSON.stringify(merged));
          return mergeBackend(merged);
        }
      } catch { /* fall through */ }
    }

    // Fallback: localStorage кэш
    try {
      const cached = localStorage.getItem(LOCAL_META_KEY);
      if (cached) {
        const normalized = normalizeCachedMetaList(cached);
        safeSetItem(LOCAL_META_KEY, JSON.stringify(normalized));
        if (normalized.length > 0) return mergeBackend(normalized);
      }
    } catch { /* fall through */ }

    // Last resort: legacy ProjectStorage meta (still prepend the filesystem store)
    return mergeBackend(ProjectStorage.listProjects().map(m => ({
      id:             m.id,
      name:           getCanonicalProjectName(m),
      theme:          m.theme ?? 'dark-slate',
      updatedAt:      m.updatedAt,
      version:        1,
      activeBranchId: m.activeBranchId,
      branchIds:      m.branchIds,
      branchCount:    m.branchCount,
    })));
  },

  // ── Получить проект по ID (полные файлы) ─────────────────────────────────

  async getProject(id: string): Promise<ProjectRecord | null> {
    // Filesystem store first — canonical dev persistence (saved as a normalized
    // StoredProject, so it can be returned directly).
    const fromBackend = await BackendProjectStore.get(id);
    if (fromBackend) return fromBackend as unknown as ProjectRecord;

    // Сначала Supabase (только для UUID)
    if (UUID_RE.test(id)) {
      const currentUserId = await getCurrentSupabaseUserId();
      if (currentUserId) {
        try {
          const { data, error } = await supabase
            .from('user_projects')
            .select('*')
            .eq('id', id)
            .single();

          if (!error && data) {
            const snap = data.code_snapshot as any;
            const record: ProjectRecord = {
              id:          data.id,
              name:        getCanonicalProjectName({ name: data.name, title: snap?.title }),
              description: snap?.description ?? '',
              theme:       snap?.theme ?? 'dark-slate',
              files:       snap?.files ?? snap ?? {},  // legacy: code_snapshot was FileMap directly
              chatHistory: snap?.chatHistory ?? [],
              createdAt:   snap?.createdAt ?? data.last_sync_at,
              updatedAt:   data.last_sync_at,
              version:     data.version ?? 1,
              activeBranchId: snap?.activeBranchId,
              branches: snap?.branches,
              generationPath: snap?.generationPath ?? undefined,
            };
            if (snap?.revisions) (record as any).revisions = snap.revisions;
            const { activeBranchId, branches } = normalizeProjectBranches(record);
            const activeBranch = branches[activeBranchId];
            record.activeBranchId = activeBranchId;
            record.branches = branches;
            record.chatHistory = activeBranch?.chatHistory ?? record.chatHistory;
            if (activeBranch?.revisions) (record as any).revisions = activeBranch.revisions;
            return record;
          }
        } catch { /* fall through */ }
      }
    }

    // Fallback: ProjectStorage (localStorage)
    const legacy = ProjectStorage.getProject(id);
    if (legacy) {
      const record: ProjectRecord = {
        id:          legacy.id,
        name:        getCanonicalProjectName(legacy),
        description: legacy.description ?? '',
        theme:       legacy.theme ?? 'dark-slate',
        files:       legacy.files ?? {},
        chatHistory: legacy.chatHistory ?? [],
        createdAt:   legacy.createdAt,
        updatedAt:   legacy.updatedAt,
        version:     1,
        activeBranchId: legacy.activeBranchId,
        branches: legacy.branches,
        generationPath: (legacy as any).generationPath ?? undefined,
      };
      const { activeBranchId, branches } = normalizeProjectBranches(record);
      const activeBranch = branches[activeBranchId];
      record.activeBranchId = activeBranchId;
      record.branches = branches;
      record.chatHistory = activeBranch?.chatHistory ?? record.chatHistory;
      if (activeBranch?.revisions) (record as any).revisions = activeBranch.revisions;
      return record;
    }

    return null;
  },

  // ── Сохранить проект ──────────────────────────────────────────────────────

  async saveProject(project: ProjectRecord): Promise<void> {
    const normalizedProject = {
      ...project,
      name: getCanonicalProjectName(project),
    };
    const { activeBranchId, branches } = normalizeProjectBranches(normalizedProject);
    const activeBranch = branches[activeBranchId];
    const mergedProjectFiles = activeBranch
      ? { ...(normalizedProject.files ?? {}), ...(activeBranch.files ?? {}) }
      : (normalizedProject.files ?? {});
    const synchronizedActiveBranch = activeBranch
      ? {
          ...activeBranch,
          files: activeBranch.files ?? {},
          chatHistory: Array.isArray(normalizedProject.chatHistory)
            ? normalizedProject.chatHistory
            : activeBranch.chatHistory,
          updatedAt: normalizedProject.updatedAt,
        }
      : activeBranch;
    const persistedBranches = synchronizedActiveBranch
      ? {
          ...branches,
          [activeBranchId]: synchronizedActiveBranch,
        }
      : branches;
    const snapshot: Record<string, unknown> = {
      files:          mergedProjectFiles,
      chatHistory:    synchronizedActiveBranch?.chatHistory ?? normalizedProject.chatHistory,
      theme:          normalizedProject.theme,
      description:    normalizedProject.description,
      createdAt:      normalizedProject.createdAt,
      activeBranchId,
      branches:       persistedBranches,
      // Extended metadata (v2)
      ...((normalizedProject as any).intent         !== undefined && { intent:         (normalizedProject as any).intent }),
      ...((normalizedProject as any).source         !== undefined && { source:         (normalizedProject as any).source }),
      ...((normalizedProject as any).plan           !== undefined && { plan:           (normalizedProject as any).plan }),
      ...((normalizedProject as any).logs           !== undefined && { logs:           (normalizedProject as any).logs }),
      ...((normalizedProject as any).errors         !== undefined && { errors:         (normalizedProject as any).errors }),
      ...((normalizedProject as any).pagesCount     !== undefined && { pagesCount:     (normalizedProject as any).pagesCount }),
      ...((normalizedProject as any).modelId        !== undefined && { modelId:        (normalizedProject as any).modelId }),
      ...((normalizedProject as any).durationMs     !== undefined && { durationMs:     (normalizedProject as any).durationMs }),
      ...((normalizedProject as any).generationMode !== undefined && { generationMode: (normalizedProject as any).generationMode }),
      ...((normalizedProject as any).generationPath !== undefined && { generationPath: (normalizedProject as any).generationPath }),
      ...((normalizedProject as any).billingCost    !== undefined && { billingCost:    (normalizedProject as any).billingCost }),
      ...((normalizedProject as any).billingTokens  !== undefined && { billingTokens:  (normalizedProject as any).billingTokens }),
      ...((normalizedProject as any).revisions      !== undefined && { revisions:      (normalizedProject as any).revisions }),
    };

    const saveToLocalStorage = () => {
      ProjectStorage.saveProject({
        id:          normalizedProject.id,
        name:        normalizedProject.name,
        description: normalizedProject.description,
        theme:       normalizedProject.theme,
        files:       mergedProjectFiles,
        chatHistory: (synchronizedActiveBranch?.chatHistory ?? normalizedProject.chatHistory) as Array<{ role: string; content: string }>,
        createdAt:   normalizedProject.createdAt,
        updatedAt:   normalizedProject.updatedAt,
        activeBranchId,
        branches:    persistedBranches,
      });
    };

    // Supabase — основное хранилище (только для UUID)
    if (UUID_RE.test(normalizedProject.id)) {
      const currentUserId = await getCurrentSupabaseUserId();
      if (currentUserId) {
        try {
          const { error } = await supabase
            .from('user_projects')
            .upsert({
              id:            normalizedProject.id,
              name:          normalizedProject.name,
              code_snapshot: snapshot,
              last_sync_at:  new Date().toISOString(),
              version:       (normalizedProject.version ?? 0) + 1,
              user_id:       currentUserId,
            }, { onConflict: 'id' });

          if (error) {
            console.error('[ProjectRepository] Supabase save failed:', error.message);
            throw error;
          }

          console.log('[ProjectRepository] ✅ Saved to Supabase:', normalizedProject.id.slice(0, 8));
        } catch (err) {
          // Fallback: сохранить в localStorage через ProjectStorage
          console.warn('[ProjectRepository] Falling back to localStorage:', err);
          showToast('Working offline — changes saved locally', 'warn');
          saveToLocalStorage();
        }
      } else {
        saveToLocalStorage();
      }
    } else {
      // Non-UUID (legacy) — localStorage only
      saveToLocalStorage();
    }

    // Обновить метаданные в localStorage кэше
    try {
      const cached = normalizeCachedMetaList(localStorage.getItem(LOCAL_META_KEY));
      const idx = cached.findIndex(p => p.id === normalizedProject.id);
      const meta: ProjectMetaSummary = {
        id:             normalizedProject.id,
        name:           normalizedProject.name,
        theme:          normalizedProject.theme,
        updatedAt:      new Date().toISOString(),
        version:        normalizedProject.version,
        activeBranchId,
        branchIds:      Object.keys(branches),
        branchCount:    Object.keys(branches).length,
      };
      if (idx >= 0) cached[idx] = meta;
      else cached.unshift(meta);
      localStorage.setItem(LOCAL_META_KEY, JSON.stringify(cached.slice(0, 50)));
    } catch { /* non-fatal */ }

    // Filesystem store — canonical dev persistence (survives reload, no ~5MB quota
    // cap). Fire-and-forget: the in-memory/localStorage path above already returned.
    void BackendProjectStore.save({
      ...(normalizedProject as any),
      files:       mergedProjectFiles,
      chatHistory: (synchronizedActiveBranch?.chatHistory ?? normalizedProject.chatHistory) as any,
      activeBranchId,
      branches:    persistedBranches as any,
      updatedAt:   normalizedProject.updatedAt ?? new Date().toISOString(),
    });
  },

  // ── Удалить проект ────────────────────────────────────────────────────────

  async deleteProject(id: string): Promise<void> {
    // Capture the compiled preview build id BEFORE local deletion wipes it, so we
    // can cascade the delete to the backend builds/<buildId>/ directory.
    const previewBuildId = ProjectStorage.getProject(id)?.previewBuildId;

    if (UUID_RE.test(id)) {
      const currentUserId = await getCurrentSupabaseUserId();
      if (currentUserId) {
        try {
          await supabase.from('user_projects').delete().eq('id', id);
        } catch { /* non-fatal */ }
      }
    }

    // Cascade to backend: remove the orphaned compiled preview build.
    if (previewBuildId) {
      try {
        await fetch(`/api/preview/build/${encodeURIComponent(previewBuildId)}`, { method: 'DELETE' });
      } catch { /* non-fatal — LRU eviction will reclaim it eventually */ }
    }

    // Также из localStorage
    ProjectStorage.deleteProject(id);

    // Cascade to the filesystem store (canonical dev persistence).
    void BackendProjectStore.remove(id);

    // Убрать из метаданных кэша
    removeRepositoryMeta(id);
  },

  removeLocalProjectMeta(id: string): void {
    ProjectStorage.removeProjectMeta(id);
    removeRepositoryMeta(id);
  },

  async projectExists(id: string): Promise<boolean> {
    if (!id) return false;
    if (ProjectStorage.projectDataExists(id)) return true;
    if (!UUID_RE.test(id)) return false;
    const currentUserId = await getCurrentSupabaseUserId();
    if (!currentUserId) return false;

    try {
      const { data, error } = await supabase
        .from('user_projects')
        .select('id')
        .eq('id', id)
        .single();
      return !error && !!data;
    } catch {
      return false;
    }
  },

  async getBranchArchitecture(
    projectId: string,
    branchId: string,
  ): Promise<ProjectBranchArchitecture | null> {
    const project = await this.getProject(projectId);
    return project?.branches?.[branchId]?.architecture ?? null;
  },

  async saveBranchArchitecture(
    projectId: string,
    branchId: string,
    architecture: ProjectBranchArchitecture,
  ): Promise<void> {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error(`[ProjectRepository] Project not found: ${projectId}`);
    }

    const now = new Date().toISOString();
    const existingBranch = project.branches?.[branchId] ?? createProjectBranchRecord(project, branchId, now);
    const normalizedArchitecture = normalizeProjectBranchArchitecture(
      architecture,
      project.id,
      branchId,
      existingBranch.name || branchId,
      now,
      {
        chatThreadId: architecture.branch?.chatThreadId ?? existingBranch.chatThreadId,
        headRevisionId: architecture.branch?.headRevisionId ?? existingBranch.headRevisionId,
      },
    );

    await this.saveProject({
      ...project,
      updatedAt: now,
      branches: {
        ...(project.branches ?? {}),
        [branchId]: {
          ...existingBranch,
          projectId: project.id,
          name: existingBranch.name || branchId,
          updatedAt: now,
          chatThreadId: normalizedArchitecture.branch.chatThreadId,
          headRevisionId: normalizedArchitecture.branch.headRevisionId,
          architecture: normalizedArchitecture,
        },
      },
    });
  },

  async saveBranchArchitectureSnapshot(
    projectId: string,
    branchId: string,
    snapshot: ArchitectureSnapshot,
  ): Promise<void> {
    const baseArchitecture =
      await this.getBranchArchitecture(projectId, branchId)
      ?? createProjectBranchArchitecture(projectId, branchId, branchId, snapshot.createdAt);
    const sanitizedArchitecture = pruneSupersededDraftSnapshots(baseArchitecture, snapshot);

    await this.saveBranchArchitecture(
      projectId,
      branchId,
      upsertArchitectureSnapshot(sanitizedArchitecture, snapshot, snapshot.createdAt),
    );
  },

  // ── Загрузить проект в preview-workspace (канонический путь) ────────────────────
  // Persisted project loads now materialize through RevisionManager using the
  // same candidate → compile(wait preview-mounted) → promote flow as generation.
  // No direct /__clear_preview or /__write_preview mutations from repository lifecycle.

  async loadToPreview(project: ProjectRecord): Promise<void> {
    setTimelineContext({ projectId: project.id });

    // ── Soft-fail: empty file map ─────────────────────────────────────────────
    // If the persisted project has no files (e.g. Supabase returned 406 and
    // the localStorage fallback is empty/stale), creating a candidate that
    // immediately fails would leave the controller in 'failed' state and poison
    // the next generation's watchdog. Fail soft here instead.
    const fileEntries = Object.keys(project.files ?? {});
    if (fileEntries.length === 0) {
      previewLog('preload_not_found_soft_failed', {
        buildId: null,
        projectId: project.id,
        source: 'ProjectRepository.loadToPreview',
        reason: 'empty_file_map',
      });
      return; // do NOT throw — let the caller (loadProject) continue silently
    }

    const scan = scanBeforePreviewLoad(
      project.id,
      project.files ?? {},
      'ProjectRepository.loadToPreview',
    );
    if (!scan.safe) {
      const msg = `[ProjectRepository] Blocked corrupted project load: ${scan.reason}`;
      previewLog('repository_load_to_preview_failed', {
        buildId: null,
        projectId: project.id,
        error: msg,
      });
      throw new Error(msg);
    }

    previewLog('repository_load_to_preview_start', { buildId: null, projectId: project.id });

    // Ensure App.tsx imports visual-pack.css so CSS variables are always loaded.
    // The import is injected by ensureVisualPackImport in ProtoPipeline during generation,
    // but project.files persists the pre-injection version. Patch it here before compile.
    const VISUAL_PACK_IMPORT = "import './styles/visual-pack.css';";
    const appTsxKey = Object.keys(project.files ?? {}).find(
      k => k === 'App.tsx' || k === 'src/App.tsx',
    );
    const hasVisualPackFile = Object.keys(project.files ?? {}).some(
      k => k === 'styles/visual-pack.css' || k === 'src/styles/visual-pack.css',
    );
    let previewFiles = project.files ?? {};
    if (appTsxKey && hasVisualPackFile) {
      const appSrc = previewFiles[appTsxKey];
      if (typeof appSrc === 'string' && !appSrc.includes(VISUAL_PACK_IMPORT)) {
        previewFiles = { ...previewFiles, [appTsxKey]: `${VISUAL_PACK_IMPORT}\n${appSrc}` };
      }
    }

    try {
      const buildId = await revisionManager.materializePersistedFiles(previewFiles, {
        source: 'ProjectRepository.loadToPreview',
        projectId: project.id,
      });
      previewLog('repository_load_to_preview_done', { buildId, projectId: project.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Generation-isolation skip: RevisionManager already logged
      // preload_skipped_stale_project — just return silently here.
      if (msg.includes(PRELOAD_SKIP_OWNED_MSG)) {
        return;
      }
      previewLog('repository_load_to_preview_failed', {
        buildId: null,
        projectId: project.id,
        error: msg,
      });
      throw err;
    }
  },
};
