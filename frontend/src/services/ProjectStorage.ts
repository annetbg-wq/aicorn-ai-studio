/**
 * ProjectStorage — per-project localStorage storage.
 * Meta index (aic-project-meta): array of project metadata (no files/chat).
 * Full project (aic-proj-{id}): complete StoredProject including files + chatHistory.
 */

import { scanBeforePreviewLoad } from './projectCorruptionScan';
import { revisionManager } from './RevisionManager';
import type { ProjectMeta } from '../shared/projectModel';

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
  files: Record<string, string>;  // path → content
  chatHistory: Array<{ role: string; content: string; type?: string }>;
  deployUrl?: string;

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
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  /** Saves full project data and updates the meta index. Returns false if storage is full. */
  static saveProject(project: StoredProject): boolean {
    try {
      localStorage.setItem(`aic-proj-${project.id}`, JSON.stringify(project));
      const meta = this.listProjects();
      const idx = meta.findIndex(m => m.id === project.id);
      const metaEntry: ProjectMeta = {
        id:          project.id,
        name:        project.name,
        description: project.description,
        theme:       project.theme,
        createdAt:   project.createdAt,
        updatedAt:   new Date().toISOString(),
        ...(project.deployUrl      !== undefined && { deployUrl:      project.deployUrl }),
        ...(project.intent         !== undefined && { intent:         project.intent }),
        ...(project.source         !== undefined && { source:         project.source }),
        ...(project.pagesCount     !== undefined && { pagesCount:     project.pagesCount }),
        ...(project.generationMode !== undefined && { generationMode: project.generationMode }),
        ...(project.modelId        !== undefined && { modelId:        project.modelId }),
        ...(project.durationMs     !== undefined && { durationMs:     project.durationMs }),
        ...(project.billingCost    !== undefined && { billingCost:    project.billingCost }),
        ...(project.billingTokens  !== undefined && { billingTokens:  project.billingTokens }),
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

  /**
   * Legacy compatibility entry point.
   *
   * Canonical behavior: route persisted project materialization through
   * RevisionManager (candidate → compile → preview-mounted handshake → promote),
   * same as generation.
   */
  static async loadToPreview(project: StoredProject, _buildId?: string): Promise<void> {
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

    await revisionManager.materializePersistedFiles(project.files ?? {}, {
      source: 'ProjectStorage.loadToPreview',
      projectId: project.id,
    });
  }
}
