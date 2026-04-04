/**
 * ProjectStorage — per-project localStorage storage.
 * Meta index (aic-project-meta): array of project metadata (no files/chat).
 * Full project (aic-proj-{id}): complete StoredProject including files + chatHistory.
 */

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

export type ProjectMeta = Omit<StoredProject, 'files' | 'chatHistory' | 'logs' | 'plan' | 'revisions'>;

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
    localStorage.removeItem(`aic-proj-${id}`);
    const meta = this.listProjects().filter(m => m.id !== id);
    localStorage.setItem(this.META_KEY, JSON.stringify(meta));
  }

  /**
   * Loads a project into preview-app by:
   * 1. Clearing old generated files via /__clear_preview
   * 2. Writing the project theme to index.css
   * 3. Writing all project files via /__write_preview (parallel batches)
   */
  static async loadToPreview(project: StoredProject): Promise<void> {
    const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
      const timer = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Preview bridge timeout after ${ms}ms`)), ms),
      );
      return Promise.race([promise, timer]);
    };

    // Step 1: Clear old files
    await withTimeout(
      fetch('/__clear_preview', { method: 'POST' }).then(r => {
        if (!r.ok) throw new Error(`clear_preview failed: ${r.status}`);
      }),
      5000,
    );

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
            await fetch('/__write_preview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: 'index.css', content: fullCss }),
            });
          }
        }
      } catch { /* theme apply is best-effort */ }
    }

    // Step 3: Write all project files in parallel batches
    const entries = Object.entries(project.files);
    const BATCH_SIZE = 5;

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      await withTimeout(
        Promise.all(batch.map(([filePath, content]) => {
          let cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
          cleanPath = cleanPath.startsWith('src/') ? cleanPath.slice(4) : cleanPath;
          if (!cleanPath || cleanPath === 'index.css') return Promise.resolve();
          return fetch('/__write_preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: cleanPath, content }),
          }).then(r => {
            if (!r.ok) throw new Error(`write_preview failed for ${cleanPath}: ${r.status}`);
          });
        })),
        8000,
      );
    }
  }
}
