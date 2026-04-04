/**
 * ProjectStore — localStorage CRUD for Figma project hub.
 *
 * Each Figma import becomes a FigmaProject: persisted tokens + visual nodes
 * so users can switch between imported files without re-syncing.
 */

import type { ProjectTheme } from './FigmaService';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FigmaProject {
  id:           string;
  name:         string;          // Figma file name
  fileKey:      string;          // Figma file key (extracted from URL)
  figmaUrl?:    string;          // synced/cloned file URL
  theme:        ProjectTheme;    // full Design DNA + visualNodes
  status:       'imported' | 'active' | 'synced';
  createdAt:    number;
  updatedAt:    number;
  accentColor?: string;          // first color from theme.colors, for visual ID
}

// ── Store ─────────────────────────────────────────────────────────────────────

const KEY = 'FIGMA_PROJECTS';

export const ProjectStore = {

  getAll(): FigmaProject[] {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '[]');
    } catch { return []; }
  },

  get(id: string): FigmaProject | null {
    return this.getAll().find(p => p.id === id) ?? null;
  },

  /**
   * Upsert: if a project with the same id exists, replace it.
   * New projects are prepended (newest first).
   */
  save(project: FigmaProject): void {
    const all = this.getAll();
    const idx = all.findIndex(p => p.id === project.id);
    if (idx > -1) {
      all[idx] = project;
    } else {
      all.unshift(project);
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch (e) {
      // localStorage quota exceeded — drop oldest
      const trimmed = all.slice(0, 5);
      localStorage.setItem(KEY, JSON.stringify(trimmed));
    }
  },

  delete(id: string): void {
    const all = this.getAll().filter(p => p.id !== id);
    localStorage.setItem(KEY, JSON.stringify(all));
  },

  clear(): void {
    localStorage.removeItem(KEY);
  },
};
