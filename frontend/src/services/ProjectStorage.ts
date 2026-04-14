/**
 * ProjectStorage — per-project localStorage storage.
 * Meta index (aic-project-meta): array of project metadata (no files/chat).
 * Full project (aic-proj-{id}): complete StoredProject including files + chatHistory.
 */

import { scanBeforePreviewLoad } from './projectCorruptionScan';
import {
  clearPreview,
  writeBatch,
  writeFile,
} from './PreviewWriteGateway';
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
   * Loads a project into preview-workspace by:
   * 1. Clearing old generated files via /__clear_preview
   * 2. Writing the project theme to index.css
   * 3. Writing all project files via /__write_preview (parallel batches)
   * 4. (Optional) Writing __build_id.ts LAST so the preview-workspace HMR accept hook
   *    posts a `preview-mounted` message tied to this build cycle.
   */
  static async loadToPreview(project: StoredProject, buildId?: string): Promise<void> {
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

    const gwOpts = {
      source: 'ProjectStorage.loadToPreview',
      buildId,
      projectId: project.id,
    };

    // Step 1: Clear old files
    await clearPreview(gwOpts);

    // Step 2: Apply theme (best-effort — don't block on failure)
    if (project.theme) {
      try {
        const themeResp = await fetch(`/__read_preview?path=themes/${project.theme}.css`);
        if (themeResp.ok) {
          const data: { content?: string } = await themeResp.json();
          if (data.content) {
            const fullCss = [
              '@tailwind base;',
              '@tailwind components;',
              '@tailwind utilities;',
              '',
              '@layer base {',
              data.content,
              '}',
              '',
              '@layer base {',
              '  * { @apply border-border; }',
              '  body { @apply bg-background text-foreground; }',
              '}',
              '',
              'body {',
              "  font-family: 'Inter', system-ui, -apple-system, sans-serif;",
              '  -webkit-font-smoothing: antialiased;',
              '}',
            ].join('\n');
            await writeFile('index.css', fullCss, gwOpts);
          }
        }
      } catch { /* theme apply is best-effort */ }
    }

    // Step 3: Write all project files in parallel batches.
    // index.css is skipped here because it was already written with the theme in step 2.
    const filesWithoutCss = Object.fromEntries(
      Object.entries(project.files).filter(([p]) => {
        const clean = p.startsWith('/') ? p.slice(1) : p;
        const norm = clean.startsWith('src/') ? clean.slice(4) : clean;
        return norm !== 'index.css';
      }),
    );
    await writeBatch(filesWithoutCss, gwOpts);

    // Step 4: Give Vite's polling watcher (interval: 100ms) time to pick up
    // the written files before the preview iframe is considered ready.
    await new Promise<void>(resolve => setTimeout(resolve, 100));
  }
}
