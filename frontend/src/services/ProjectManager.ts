/**
 * ProjectManager — project storage service.
 *
 * Clean API layer over ProjectStorage. Adds:
 *   - getCurrent() / setCurrent(id)
 *   - create() with 20-project limit guard
 *   - saveFiles() for post-generation file persistence
 *   - loadToPreview() by project id
 *
 * All data is stored via ProjectStorage so this layer and useStudio share
 * the same underlying localStorage records with no duplication.
 *
 * Errors thrown:
 *   'Storage full, cannot save project'   — localStorage quota exceeded
 *   'Project limit reached (20) …'        — too many projects
 *   'Project ${id} not found'             — stale / invalid id
 */

import { ProjectStorage } from './ProjectStorage';
import type { StoredProject } from './ProjectStorage';

// ── Public types ──────────────────────────────────────────────────────────────

export interface ProjectMetaLegacy {
  id:          string;
  name:        string;
  theme:       string;
  description: string;
  createdAt:   string;
  updatedAt:   string;
  deployUrl?:  string;
}

/** Full project — files but NOT chatHistory (that lives in ProjectStorage). */
export interface Project extends ProjectMetaLegacy {
  files: Record<string, string>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CURRENT_KEY  = 'aic-current-project';
const MAX_PROJECTS = 20;

// ── Service ───────────────────────────────────────────────────────────────────

export class ProjectManager {
  // ── Read ────────────────────────────────────────────────────────────────────

  /** All projects (metadata only, no files — fast). */
  static getAll(): ProjectMetaLegacy[] {
    return ProjectStorage.listProjects();
  }

  /** Full project (files, no chatHistory). Null if not found. */
  static getById(id: string): Project | null {
    const stored = ProjectStorage.getProject(id);
    if (!stored) return null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { chatHistory: _ch, ...rest } = stored;
    return rest;
  }

  /** Currently active project, or null. */
  static getCurrent(): Project | null {
    const id = localStorage.getItem(CURRENT_KEY);
    if (!id) return null;
    return this.getById(id);
  }

  // ── Write ───────────────────────────────────────────────────────────────────

  /** Marks a project as the active one. */
  static setCurrent(id: string): void {
    localStorage.setItem(CURRENT_KEY, id);
  }

  /**
   * Creates a new project and persists it.
   * Throws if the 20-project limit is reached or localStorage is full.
   */
  static create(
    meta: Omit<ProjectMetaLegacy, 'id' | 'createdAt' | 'updatedAt'>,
  ): Project {
    const all = this.getAll();
    if (all.length >= MAX_PROJECTS) {
      throw new Error(
        `Project limit reached (${MAX_PROJECTS}). Delete an old project to create a new one.`,
      );
    }
    const now     = new Date().toISOString();
    const project: Project = {
      id:          crypto.randomUUID(),
      name:        meta.name,
      theme:       meta.theme,
      description: meta.description,
      createdAt:   now,
      updatedAt:   now,
      files:       {},
    };
    const stored: StoredProject = { ...project, chatHistory: [] };
    const ok = ProjectStorage.saveProject(stored);
    if (!ok) throw new Error('Storage full, cannot save project');
    return project;
  }

  /**
   * Applies a partial patch to a project (any fields except id).
   * updatedAt is always set to now.
   * Throws if project not found or storage is full.
   */
  static update(id: string, patch: Partial<Omit<Project, 'id'>>): void {
    const stored = ProjectStorage.getProject(id);
    if (!stored) throw new Error(`Project ${id} not found`);
    const updated: StoredProject = {
      ...stored,
      ...patch,
      id,                              // never allow id override
      updatedAt: new Date().toISOString(),
    };
    const ok = ProjectStorage.saveProject(updated);
    if (!ok) throw new Error('Storage full, cannot save project');
  }

  /**
   * Replaces the file map for a project.
   * Throws if project not found or storage is full.
   */
  static saveFiles(id: string, files: Record<string, string>): void {
    const stored = ProjectStorage.getProject(id);
    if (!stored) throw new Error(`Project ${id} not found`);
    const updated: StoredProject = {
      ...stored,
      files,
      updatedAt: new Date().toISOString(),
    };
    const ok = ProjectStorage.saveProject(updated);
    if (!ok) throw new Error('Storage full, cannot save project');
  }

  /** Removes a project. Clears CURRENT_KEY if this was the active project. */
  static delete(id: string): void {
    ProjectStorage.deleteProject(id);
    if (localStorage.getItem(CURRENT_KEY) === id) {
      localStorage.removeItem(CURRENT_KEY);
    }
  }

  /**
   * Writes the project files to preview-app/src/ via the Vite bridge.
   * Throws if project not found.
   */
  static async loadToPreview(id: string): Promise<void> {
    const stored = ProjectStorage.getProject(id);
    if (!stored) throw new Error(`Project ${id} not found`);
    await ProjectStorage.loadToPreview(stored);
  }
}
