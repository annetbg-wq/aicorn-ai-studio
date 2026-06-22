/**
 * project-store.ts — filesystem-backed project persistence for local development.
 *
 * localStorage (~5MB) cannot hold the 58-file materialised projects, so saves
 * silently failed and projects "disappeared" on reload. This stores each project
 * as a folder on disk under projects-store/<id>/:
 *   - project.json          full StoredProject (files, chat, docs, metadata)
 *   - docs/architect/*       extracted product-document files, human-readable
 *
 * Endpoints (loopback backend, port 3000; proxied by Vite under /api):
 *   POST   /api/projects/:id   save (body = StoredProject JSON)
 *   GET    /api/projects       list metas (newest first)
 *   GET    /api/projects/:id   load full project
 *   DELETE /api/projects/:id   delete the project folder
 *
 * Later, when the app leaves local, persistence moves under the user in Supabase;
 * the frontend BackendProjectStore is the seam where that swap happens.
 */
import express from 'express';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

const STORE_ROOT = path.resolve(__dirname, '..', 'projects-store');

/** Project ids are uuids or app-generated slugs — never path separators. */
function safeProjectId(id: unknown): string | null {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{3,128}$/.test(id) ? id : null;
}
function projectDir(id: string): string {
  return path.join(STORE_ROOT, id);
}
function projectFile(id: string): string {
  return path.join(projectDir(id), 'project.json');
}

/** Strips a leading `src/` (and `./`) so doc keys map onto a clean folder tree. */
function normalizeDocPath(key: string): string {
  return key.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '').replace(/^src\//, '');
}

interface StoredProjectLike {
  id?: string;
  name?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  buildStatus?: string;
  generationPath?: string;
  files?: Record<string, unknown>;
  [k: string]: unknown;
}

/** Extracts docs/architect/** files to disk so the doc package is inspectable. */
async function writeReadableDocs(dir: string, files: Record<string, unknown>): Promise<void> {
  const docsRoot = path.join(dir, 'docs');
  await fsPromises.rm(docsRoot, { recursive: true, force: true });
  for (const [rawKey, value] of Object.entries(files)) {
    if (typeof value !== 'string') continue;
    const norm = normalizeDocPath(rawKey);
    if (!norm.startsWith('docs/architect/')) continue;
    const target = path.join(dir, norm);
    // Containment guard: target must stay inside the project dir.
    if (path.relative(dir, target).startsWith('..')) continue;
    await fsPromises.mkdir(path.dirname(target), { recursive: true });
    await fsPromises.writeFile(target, value, 'utf-8');
  }
}

export function registerProjectStoreRoutes(app: express.Express): void {
  // Per-route JSON parser with a large limit — materialised projects exceed the
  // global 10mb body limit used elsewhere.
  app.post('/api/projects/:id', express.json({ limit: '64mb' }), async (req: any, res: any) => {
    const id = safeProjectId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid project id' });
    const project = req.body as StoredProjectLike | undefined;
    if (!project || typeof project !== 'object' || Array.isArray(project)) {
      return res.status(400).json({ success: false, error: 'Project body is required' });
    }
    try {
      const dir = projectDir(id);
      await fsPromises.mkdir(dir, { recursive: true });
      await fsPromises.writeFile(projectFile(id), JSON.stringify(project), 'utf-8');
      const files = (project.files && typeof project.files === 'object' && !Array.isArray(project.files))
        ? project.files as Record<string, unknown>
        : {};
      await writeReadableDocs(dir, files);
      return res.json({ success: true });
    } catch (e: any) {
      console.error(`[project-store] save failed for ${id}:`, e?.message ?? e);
      return res.status(500).json({ success: false, error: e?.message ?? String(e) });
    }
  });

  app.get('/api/projects', async (_req: any, res: any) => {
    try {
      await fsPromises.mkdir(STORE_ROOT, { recursive: true });
      const entries = await fsPromises.readdir(STORE_ROOT, { withFileTypes: true });
      const metas: Array<Record<string, unknown>> = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const id = safeProjectId(entry.name);
        if (!id) continue;
        try {
          const raw = await fsPromises.readFile(projectFile(id), 'utf-8');
          const p = JSON.parse(raw) as StoredProjectLike;
          metas.push({
            id,
            name: p.name ?? id,
            description: p.description ?? '',
            createdAt: p.createdAt ?? null,
            updatedAt: p.updatedAt ?? null,
            buildStatus: p.buildStatus ?? null,
            generationPath: p.generationPath ?? null,
          });
        } catch { /* skip unreadable entry */ }
      }
      metas.sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
      return res.json({ success: true, projects: metas });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e?.message ?? String(e), projects: [] });
    }
  });

  app.get('/api/projects/:id', async (req: any, res: any) => {
    const id = safeProjectId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid project id' });
    try {
      const raw = await fsPromises.readFile(projectFile(id), 'utf-8');
      return res.json({ success: true, project: JSON.parse(raw) });
    } catch {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
  });

  app.delete('/api/projects/:id', async (req: any, res: any) => {
    const id = safeProjectId(req.params.id);
    if (!id) return res.status(400).json({ success: false, error: 'Invalid project id' });
    try {
      const dir = projectDir(id);
      if (path.resolve(dir) !== path.resolve(STORE_ROOT, id)) {
        return res.status(400).json({ success: false, error: 'Invalid project id' });
      }
      await fsPromises.rm(dir, { recursive: true, force: true });
      return res.json({ success: true });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e?.message ?? String(e) });
    }
  });
}

/** Exposed for tests. */
export const __projectStoreInternals = { STORE_ROOT, safeProjectId, normalizeDocPath };
export { fs };
