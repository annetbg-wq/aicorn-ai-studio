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
import { previewLog, setTimelineContext } from './PreviewController';
import { revisionManager } from './RevisionManager';
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
    // Сначала пробуем Supabase
    try {
      const { data, error } = await supabase
        .from('user_projects')
        .select('id, name, last_sync_at, version, code_snapshot')
        .order('last_sync_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        const meta: ProjectMetaSummary[] = data.map(row => ({
          id:             row.id,
          name:           row.name,
          theme:          (row.code_snapshot as any)?.theme ?? 'dark-slate',
          updatedAt:      row.last_sync_at,
          version:        row.version ?? 1,
          activeBranchId: (row.code_snapshot as any)?.activeBranchId,
          branchIds:      (row.code_snapshot as any)?.branches
            ? Object.keys((row.code_snapshot as any).branches)
            : undefined,
          branchCount:    (row.code_snapshot as any)?.branches
            ? Object.keys((row.code_snapshot as any).branches).length
            : undefined,
        }));
        safeSetItem(LOCAL_META_KEY, JSON.stringify(meta));
        return meta;
      }
    } catch { /* fall through */ }

    // Fallback: localStorage кэш
    try {
      const cached = localStorage.getItem(LOCAL_META_KEY);
      if (cached) return JSON.parse(cached) as ProjectMetaSummary[];
    } catch { /* fall through */ }

    // Last resort: legacy ProjectStorage meta
    return ProjectStorage.listProjects().map(m => ({
      id:             m.id,
      name:           m.name,
      theme:          m.theme ?? 'dark-slate',
      updatedAt:      m.updatedAt,
      version:        1,
      activeBranchId: m.activeBranchId,
      branchIds:      m.branchIds,
      branchCount:    m.branchCount,
    }));
  },

  // ── Получить проект по ID (полные файлы) ─────────────────────────────────

  async getProject(id: string): Promise<ProjectRecord | null> {
    // Сначала Supabase (только для UUID)
    if (UUID_RE.test(id)) {
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
            name:        data.name,
            description: snap?.description ?? '',
            theme:       snap?.theme ?? 'dark-slate',
            files:       snap?.files ?? snap ?? {},  // legacy: code_snapshot was FileMap directly
            chatHistory: snap?.chatHistory ?? [],
            createdAt:   snap?.createdAt ?? data.last_sync_at,
            updatedAt:   data.last_sync_at,
            version:     data.version ?? 1,
            activeBranchId: snap?.activeBranchId,
            branches: snap?.branches,
          };
          if (snap?.revisions) (record as any).revisions = snap.revisions;
          const { activeBranchId, branches } = normalizeProjectBranches(record);
          const activeBranch = branches[activeBranchId];
          record.activeBranchId = activeBranchId;
          record.branches = branches;
          record.files = activeBranch?.files ?? record.files;
          record.chatHistory = activeBranch?.chatHistory ?? record.chatHistory;
          if (activeBranch?.revisions) (record as any).revisions = activeBranch.revisions;
          return record;
        }
      } catch { /* fall through */ }
    }

    // Fallback: ProjectStorage (localStorage)
    const legacy = ProjectStorage.getProject(id);
    if (legacy) {
      const record: ProjectRecord = {
        id:          legacy.id,
        name:        legacy.name,
        description: legacy.description ?? '',
        theme:       legacy.theme ?? 'dark-slate',
        files:       legacy.files ?? {},
        chatHistory: legacy.chatHistory ?? [],
        createdAt:   legacy.createdAt,
        updatedAt:   legacy.updatedAt,
        version:     1,
        activeBranchId: legacy.activeBranchId,
        branches: legacy.branches,
      };
      const { activeBranchId, branches } = normalizeProjectBranches(record);
      const activeBranch = branches[activeBranchId];
      record.activeBranchId = activeBranchId;
      record.branches = branches;
      record.files = activeBranch?.files ?? record.files;
      record.chatHistory = activeBranch?.chatHistory ?? record.chatHistory;
      if (activeBranch?.revisions) (record as any).revisions = activeBranch.revisions;
      return record;
    }

    return null;
  },

  // ── Сохранить проект ──────────────────────────────────────────────────────

  async saveProject(project: ProjectRecord): Promise<void> {
    const { activeBranchId, branches } = normalizeProjectBranches(project);
    const activeBranch = branches[activeBranchId];
    const snapshot: Record<string, unknown> = {
      files:          activeBranch?.files ?? project.files,
      chatHistory:    activeBranch?.chatHistory ?? project.chatHistory,
      theme:          project.theme,
      description:    project.description,
      createdAt:      project.createdAt,
      activeBranchId,
      branches,
      // Extended metadata (v2)
      ...((project as any).intent         !== undefined && { intent:         (project as any).intent }),
      ...((project as any).source         !== undefined && { source:         (project as any).source }),
      ...((project as any).plan           !== undefined && { plan:           (project as any).plan }),
      ...((project as any).logs           !== undefined && { logs:           (project as any).logs }),
      ...((project as any).errors         !== undefined && { errors:         (project as any).errors }),
      ...((project as any).pagesCount     !== undefined && { pagesCount:     (project as any).pagesCount }),
      ...((project as any).modelId        !== undefined && { modelId:        (project as any).modelId }),
      ...((project as any).durationMs     !== undefined && { durationMs:     (project as any).durationMs }),
      ...((project as any).generationMode !== undefined && { generationMode: (project as any).generationMode }),
      ...((project as any).billingCost    !== undefined && { billingCost:    (project as any).billingCost }),
      ...((project as any).billingTokens  !== undefined && { billingTokens:  (project as any).billingTokens }),
      ...((project as any).revisions      !== undefined && { revisions:      (project as any).revisions }),
    };

    // Supabase — основное хранилище (только для UUID)
    if (UUID_RE.test(project.id)) {
      try {
        const { error } = await supabase
          .from('user_projects')
          .upsert({
            id:            project.id,
            name:          project.name,
            code_snapshot: snapshot,
            last_sync_at:  new Date().toISOString(),
            version:       (project.version ?? 0) + 1,
            ...(project.userId && project.userId !== 'anonymous' && { user_id: project.userId }),
          }, { onConflict: 'id' });

        if (error) {
          console.error('[ProjectRepository] Supabase save failed:', error.message);
          throw error;
        }

        console.log('[ProjectRepository] ✅ Saved to Supabase:', project.id.slice(0, 8));
      } catch (err) {
        // Fallback: сохранить в localStorage через ProjectStorage
        console.warn('[ProjectRepository] Falling back to localStorage:', err);
        showToast('Working offline — changes saved locally', 'warn');
        ProjectStorage.saveProject({
          id:          project.id,
          name:        project.name,
          description: project.description,
          theme:       project.theme,
          files:       activeBranch?.files ?? project.files,
          chatHistory: (activeBranch?.chatHistory ?? project.chatHistory) as Array<{ role: string; content: string }>,
          createdAt:   project.createdAt,
          updatedAt:   project.updatedAt,
          activeBranchId,
          branches,
        });
      }
    } else {
      // Non-UUID (legacy) — localStorage only
      ProjectStorage.saveProject({
        id:          project.id,
        name:        project.name,
        description: project.description,
        theme:       project.theme,
        files:       activeBranch?.files ?? project.files,
        chatHistory: (activeBranch?.chatHistory ?? project.chatHistory) as Array<{ role: string; content: string }>,
        createdAt:   project.createdAt,
        updatedAt:   project.updatedAt,
        activeBranchId,
        branches,
      });
    }

    // Обновить метаданные в localStorage кэше
    try {
      const cached: ProjectMetaSummary[] = JSON.parse(
        localStorage.getItem(LOCAL_META_KEY) ?? '[]'
      );
      const idx = cached.findIndex(p => p.id === project.id);
      const meta: ProjectMetaSummary = {
        id:             project.id,
        name:           project.name,
        theme:          project.theme,
        updatedAt:      new Date().toISOString(),
        version:        project.version,
        activeBranchId,
        branchIds:      Object.keys(branches),
        branchCount:    Object.keys(branches).length,
      };
      if (idx >= 0) cached[idx] = meta;
      else cached.unshift(meta);
      localStorage.setItem(LOCAL_META_KEY, JSON.stringify(cached.slice(0, 50)));
    } catch { /* non-fatal */ }
  },

  // ── Удалить проект ────────────────────────────────────────────────────────

  async deleteProject(id: string): Promise<void> {
    if (UUID_RE.test(id)) {
      try {
        await supabase.from('user_projects').delete().eq('id', id);
      } catch { /* non-fatal */ }
    }

    // Также из localStorage
    ProjectStorage.deleteProject(id);

    // Убрать из метаданных кэша
    try {
      const cached: ProjectMetaSummary[] = JSON.parse(
        localStorage.getItem(LOCAL_META_KEY) ?? '[]'
      );
      safeSetItem(LOCAL_META_KEY,
        JSON.stringify(cached.filter(p => p.id !== id))
      );
    } catch { /* non-fatal */ }
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

    try {
      const buildId = await revisionManager.materializePersistedFiles(project.files ?? {}, {
        source: 'ProjectRepository.loadToPreview',
        projectId: project.id,
      });
      previewLog('repository_load_to_preview_done', { buildId, projectId: project.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      previewLog('repository_load_to_preview_failed', {
        buildId: null,
        projectId: project.id,
        error: msg,
      });
      throw err;
    }
  },
};
