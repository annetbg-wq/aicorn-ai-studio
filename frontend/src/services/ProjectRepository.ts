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
  userId?:     string;
}

export interface ProjectMeta {
  id:        string;
  name:      string;
  theme:     string;
  updatedAt: string;
  version:   number;
}

// ── Internal constants ─────────────────────────────────────────────────────────

const LOCAL_META_KEY = 'aic_projects_meta'; // только метаданные, не файлы
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Repository ─────────────────────────────────────────────────────────────────

export const ProjectRepository = {

  // ── Список проектов (только метаданные — быстро) ─────────────────────────

  async listProjects(): Promise<ProjectMeta[]> {
    // Сначала пробуем Supabase
    try {
      const { data, error } = await supabase
        .from('user_projects')
        .select('id, name, last_sync_at, version, code_snapshot')
        .order('last_sync_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        const meta: ProjectMeta[] = data.map(row => ({
          id:        row.id,
          name:      row.name,
          theme:     (row.code_snapshot as any)?.theme ?? 'dark-slate',
          updatedAt: row.last_sync_at,
          version:   row.version ?? 1,
        }));
        localStorage.setItem(LOCAL_META_KEY, JSON.stringify(meta));
        return meta;
      }
    } catch { /* fall through */ }

    // Fallback: localStorage кэш
    try {
      const cached = localStorage.getItem(LOCAL_META_KEY);
      if (cached) return JSON.parse(cached) as ProjectMeta[];
    } catch { /* fall through */ }

    // Last resort: legacy ProjectStorage meta
    return ProjectStorage.listProjects().map(m => ({
      id:        m.id,
      name:      m.name,
      theme:     m.theme ?? 'dark-slate',
      updatedAt: m.updatedAt,
      version:   1,
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
          };
          if (snap?.revisions) (record as any).revisions = snap.revisions;
          return record;
        }
      } catch { /* fall through */ }
    }

    // Fallback: ProjectStorage (localStorage)
    const legacy = ProjectStorage.getProject(id);
    if (legacy) {
      return {
        id:          legacy.id,
        name:        legacy.name,
        description: legacy.description ?? '',
        theme:       legacy.theme ?? 'dark-slate',
        files:       legacy.files ?? {},
        chatHistory: legacy.chatHistory ?? [],
        createdAt:   legacy.createdAt,
        updatedAt:   legacy.updatedAt,
        version:     1,
      };
    }

    return null;
  },

  // ── Сохранить проект ──────────────────────────────────────────────────────

  async saveProject(project: ProjectRecord): Promise<void> {
    const snapshot: Record<string, unknown> = {
      files:       project.files,
      chatHistory: project.chatHistory,
      theme:       project.theme,
      description: project.description,
      createdAt:   project.createdAt,
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
        ProjectStorage.saveProject({
          id:          project.id,
          name:        project.name,
          description: project.description,
          theme:       project.theme,
          files:       project.files,
          chatHistory: project.chatHistory as Array<{ role: string; content: string }>,
          createdAt:   project.createdAt,
          updatedAt:   project.updatedAt,
        });
      }
    } else {
      // Non-UUID (legacy) — localStorage only
      ProjectStorage.saveProject({
        id:          project.id,
        name:        project.name,
        description: project.description,
        theme:       project.theme,
        files:       project.files,
        chatHistory: project.chatHistory as Array<{ role: string; content: string }>,
        createdAt:   project.createdAt,
        updatedAt:   project.updatedAt,
      });
    }

    // Обновить метаданные в localStorage кэше
    try {
      const cached: ProjectMeta[] = JSON.parse(
        localStorage.getItem(LOCAL_META_KEY) ?? '[]'
      );
      const idx = cached.findIndex(p => p.id === project.id);
      const meta: ProjectMeta = {
        id:        project.id,
        name:      project.name,
        theme:     project.theme,
        updatedAt: new Date().toISOString(),
        version:   project.version,
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
      const cached: ProjectMeta[] = JSON.parse(
        localStorage.getItem(LOCAL_META_KEY) ?? '[]'
      );
      localStorage.setItem(LOCAL_META_KEY,
        JSON.stringify(cached.filter(p => p.id !== id))
      );
    } catch { /* non-fatal */ }
  },

  // ── Загрузить проект в preview-app ───────────────────────────────────────
  // Delegates to ProjectStorage.loadToPreview which has battle-tested theme CSS
  // handling (proper Tailwind wrapper, @layer base, etc.)

  async loadToPreview(project: ProjectRecord): Promise<void> {
    await ProjectStorage.loadToPreview({
      id:          project.id,
      name:        project.name,
      description: project.description,
      theme:       project.theme,
      files:       project.files,
      chatHistory: project.chatHistory as Array<{ role: string; content: string }>,
      createdAt:   project.createdAt,
      updatedAt:   project.updatedAt,
    });
    // Signal Vite HMR after files are written
    await new Promise(r => setTimeout(r, 1500));
    window.dispatchEvent(new CustomEvent('force-preview-reload'));
  },
};
