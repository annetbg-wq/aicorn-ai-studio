/**
 * BackendProjectStore — filesystem-backed project persistence (dev).
 *
 * localStorage (~5MB) cannot hold the materialised 58-file projects, so saves
 * failed and projects vanished on reload. This routes project persistence to the
 * backend filesystem store (backend/projects-store/<id>/) over the same /api proxy
 * the preview pipeline uses. It is the seam where, once the app leaves local, the
 * implementation swaps to per-user Supabase storage.
 *
 * All methods degrade gracefully (return false / [] / null) so the existing
 * localStorage path keeps working as a cache/fallback when the backend is down.
 */
import type { StoredProject } from './ProjectStorage';

const BASE = '/api/projects';

export interface BackendProjectMeta {
  id: string;
  name: string;
  description: string;
  createdAt: string | null;
  updatedAt: string | null;
  buildStatus: 'ready' | 'failed' | null;
  generationPath: 'skeleton_assembly' | 'blank_canvas' | null;
}

export const BackendProjectStore = {
  /** Persist a full project to disk. Returns true on success. */
  async save(project: StoredProject): Promise<boolean> {
    if (!project?.id) return false;
    try {
      const res = await fetch(`${BASE}/${encodeURIComponent(project.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  /** List project metadata (newest first). Empty array if backend unavailable. */
  async list(): Promise<BackendProjectMeta[]> {
    try {
      const res = await fetch(BASE);
      if (!res.ok) return [];
      const body = await res.json();
      return Array.isArray(body?.projects) ? body.projects as BackendProjectMeta[] : [];
    } catch {
      return [];
    }
  },

  /** Load a full project by id, or null if absent/unavailable. */
  async get(id: string): Promise<StoredProject | null> {
    if (!id) return null;
    try {
      const res = await fetch(`${BASE}/${encodeURIComponent(id)}`);
      if (!res.ok) return null;
      const body = await res.json();
      return (body?.project ?? null) as StoredProject | null;
    } catch {
      return null;
    }
  },

  /** Delete a project folder. Non-fatal on failure. */
  async remove(id: string): Promise<void> {
    if (!id) return;
    try {
      await fetch(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch {
      /* non-fatal */
    }
  },
};
