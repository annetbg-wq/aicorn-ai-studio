/**
 * ProjectStorage — per-project localStorage storage.
 * Meta index (aic-project-meta): array of project metadata (no files/chat).
 * Full project (aic-proj-{id}): complete StoredProject including files + chatHistory.
 */

import { scanBeforePreviewLoad } from './projectCorruptionScan';
import { revisionManager, PRELOAD_SKIP_OWNED_MSG } from './RevisionManager';
import { previewLog } from './PreviewController';
import {
  DEFAULT_PROJECT_BRANCH_ID,
  createProjectBranchArchitecture,
  normalizeProjectBranchArchitecture,
  upsertArchitectureSnapshot,
  type ArchitectureSnapshot,
  type PersistedProjectBranch,
  type ProjectBranchArchitecture,
  type ProjectMeta,
} from '../shared/projectModel';

export interface ProjectRevision {
  id:           string;    // crypto.randomUUID()
  prompt:       string;    // prompt for this iteration
  source:       'chat' | 'weekly-feed' | 'niche';
  files:        Record<string, string>;  // full file snapshot
  createdAt:    string;    // ISO
  modelId?:     string;
  durationMs?:  number;
  isBookmarked: boolean;
  pagesCount?:  number;
}

export interface StoredProject {
  id: string;
  name: string;
  description: string;
  theme: string;
  createdAt: string;
  updatedAt: string;
  version?: number;
  files: Record<string, string>;  // path → content
  chatHistory: Array<{ role: string; content: string; type?: string }>;
  deployUrl?: string;
  activeBranchId?: string;
  branches?: Record<string, PersistedProjectBranch>;

  // Extended metadata (v2)
  intent?:         string;                        // full original prompt
  source?:         'chat' | 'weekly-feed' | 'niche';
  plan?:           object;                        // Architect JSON plan
  logs?:           string[];                      // generation log lines
  errors?:         string[];                      // AutoFix / runtime errors
  pagesCount?:     number;
  modelId?:        string;
  durationMs?:     number;
  generationMode?: string;                        // 'landing' | 'app' | 'superapp'
  billingCost?:    number;
  billingTokens?:  number;
  revisions?:      ProjectRevision[];              // max 5, newest first
}

// ProjectMeta is the canonical type — re-exported from shared/projectModel.ts.
export type { ProjectMeta } from '../shared/projectModel';

function createStoredBranch(
  project: StoredProject,
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

function normalizeStoredProjectBranches(project: StoredProject): {
  activeBranchId: string;
  branches: Record<string, PersistedProjectBranch>;
} {
  const now = project.updatedAt || new Date().toISOString();
  const activeBranchId = project.activeBranchId ?? DEFAULT_PROJECT_BRANCH_ID;

  const existingBranches = project.branches ?? {};
  const normalizedEntries = Object.entries(existingBranches).map(([branchId, branch]) => {
    const name = branch.name || branchId;
    return [
      branchId,
      {
        ...branch,
        id: branch.id ?? branchId,
        projectId: project.id,
        name,
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
          name,
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
    normalizedEntries.map(([branchId, branch]) => [
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
      ...createStoredBranch(project, activeBranchId, now),
      isDefault: true,
      files: project.files ?? {},
      chatHistory: project.chatHistory ?? [],
      revisions: project.revisions ?? [],
    };
  }

  return { activeBranchId, branches };
}

export class ProjectStorage {
  private static readonly META_KEY = 'aic-project-meta';

  /** Returns metadata for all projects (no files/chatHistory — fast). */
  static listProjects(): ProjectMeta[] {
    try {
      return JSON.parse(localStorage.getItem(this.META_KEY) || '[]');
    } catch { return []; }
  }

  /** Returns the full project including files and chatHistory. */
  static getProject(id: string): StoredProject | null {
    try {
      const raw = localStorage.getItem(`aic-proj-${id}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredProject;
      const { activeBranchId, branches } = normalizeStoredProjectBranches(parsed);
      const activeBranch = branches[activeBranchId];
      return {
        ...parsed,
        activeBranchId,
        branches,
        files: activeBranch?.files ?? parsed.files ?? {},
        chatHistory: (activeBranch?.chatHistory as Array<{ role: string; content: string; type?: string }>)
          ?? parsed.chatHistory
          ?? [],
        revisions: (activeBranch?.revisions as ProjectRevision[]) ?? parsed.revisions,
      };
    } catch { return null; }
  }

  /** Saves full project data and updates the meta index. Returns false if storage is full. */
  static saveProject(project: StoredProject): boolean {
    try {
      const { activeBranchId, branches } = normalizeStoredProjectBranches(project);
      const activeBranch = branches[activeBranchId];
      const materializedProject: StoredProject = {
        ...project,
        activeBranchId,
        branches,
        files: activeBranch?.files ?? project.files ?? {},
        chatHistory: (activeBranch?.chatHistory as Array<{ role: string; content: string; type?: string }>)
          ?? project.chatHistory
          ?? [],
        revisions: (activeBranch?.revisions as ProjectRevision[]) ?? project.revisions,
      };

      localStorage.setItem(`aic-proj-${project.id}`, JSON.stringify(materializedProject));
      const meta = this.listProjects();
      const idx = meta.findIndex(m => m.id === materializedProject.id);
      const metaEntry: ProjectMeta = {
        id:          materializedProject.id,
        name:        materializedProject.name,
        description: materializedProject.description,
        theme:       materializedProject.theme,
        createdAt:   materializedProject.createdAt,
        updatedAt:   new Date().toISOString(),
        activeBranchId,
        branchIds:      Object.keys(branches),
        branchCount:    Object.keys(branches).length,
        ...(materializedProject.deployUrl      !== undefined && { deployUrl:      materializedProject.deployUrl }),
        ...(materializedProject.intent         !== undefined && { intent:         materializedProject.intent }),
        ...(materializedProject.source         !== undefined && { source:         materializedProject.source }),
        ...(materializedProject.pagesCount     !== undefined && { pagesCount:     materializedProject.pagesCount }),
        ...(materializedProject.generationMode !== undefined && { generationMode: materializedProject.generationMode }),
        ...(materializedProject.modelId        !== undefined && { modelId:        materializedProject.modelId }),
        ...(materializedProject.durationMs     !== undefined && { durationMs:     materializedProject.durationMs }),
        ...(materializedProject.billingCost    !== undefined && { billingCost:    materializedProject.billingCost }),
        ...(materializedProject.billingTokens  !== undefined && { billingTokens:  materializedProject.billingTokens }),
      };
      if (idx >= 0) meta[idx] = metaEntry;
      else meta.unshift(metaEntry);
      localStorage.setItem(this.META_KEY, JSON.stringify(meta));
      return true;
    } catch (e) {
      console.error('[ProjectStorage] Save failed (storage full?):', e);
      return false;
    }
  }

  /** Deletes a project and removes it from the meta index. */
  static deleteProject(id: string): void {
    try { localStorage.removeItem(`aic-proj-${id}`); } catch { /* ignore */ }
    const meta = this.listProjects().filter(m => m.id !== id);
    try { localStorage.setItem(this.META_KEY, JSON.stringify(meta)); } catch { /* ignore */ }
  }

  static getBranch(projectId: string, branchId: string): PersistedProjectBranch | null {
    return this.getProject(projectId)?.branches?.[branchId] ?? null;
  }

  static getBranchArchitecture(projectId: string, branchId: string): ProjectBranchArchitecture | null {
    return this.getBranch(projectId, branchId)?.architecture ?? null;
  }

  static saveBranchArchitecture(
    projectId: string,
    branchId: string,
    architecture: ProjectBranchArchitecture,
  ): boolean {
    const project = this.getProject(projectId);
    if (!project) return false;

    const now = new Date().toISOString();
    const existingBranch = project.branches?.[branchId] ?? createStoredBranch(project, branchId, now);
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

    return this.saveProject({
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
  }

  static saveBranchArchitectureSnapshot(
    projectId: string,
    branchId: string,
    snapshot: ArchitectureSnapshot,
  ): boolean {
    const baseArchitecture =
      this.getBranchArchitecture(projectId, branchId)
      ?? createProjectBranchArchitecture(projectId, branchId, branchId, snapshot.createdAt);

    return this.saveBranchArchitecture(
      projectId,
      branchId,
      upsertArchitectureSnapshot(baseArchitecture, snapshot, snapshot.createdAt),
    );
  }

  /**
   * Legacy compatibility entry point.
   *
   * Canonical behavior: route persisted project materialization through
   * RevisionManager (candidate → compile → preview-mounted handshake → promote),
   * same as generation.
   */
  static async loadToPreview(project: StoredProject, _buildId?: string): Promise<void> {
    const fileEntries = Object.keys(project.files ?? {});
    if (fileEntries.length === 0) {
      previewLog('preload_not_found_soft_failed', {
        buildId: null,
        projectId: project.id,
        source: 'ProjectStorage.loadToPreview',
        reason: 'empty_file_map',
      });
      return;
    }

    // ── Pre-load corruption scan ─────────────────────────────────
    // Detects artifact-envelope JSON and other corruption BEFORE any
    // preview writes. If critical corruption found, abort the load
    // entirely — preserving whatever is currently in preview (last-good).
    const scan = scanBeforePreviewLoad(project.id, project.files ?? {}, 'ProjectStorage.loadToPreview');
    if (!scan.safe) {
      const msg = `[ProjectStorage] Blocked corrupted project load: ${scan.reason}`;
      console.error(msg, scan.findings);
      throw new Error(msg);
    }

    try {
      await revisionManager.materializePersistedFiles(project.files ?? {}, {
        source: 'ProjectStorage.loadToPreview',
        projectId: project.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Generation-isolation skip: RevisionManager already logged the event.
      if (msg.includes(PRELOAD_SKIP_OWNED_MSG)) return;
      throw err;
    }
  }
}
