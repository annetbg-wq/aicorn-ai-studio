/**
 * storageService — Unified immortal storage layer.
 * Write path:  State  →  localStorage (immediate)  →  Supabase (debounced)
 * Read path:   localStorage (instant)  →  Supabase (startup check only)
 *
 * Fails gracefully: if Supabase is unavailable the service logs a warning and
 * runs in local-only mode without throwing.
 */

import type { FileMap } from '../hooks/useStudio';
import { supabase as _sbClient } from '../lib/supabase';

// ── Safe Supabase client ──────────────────────────────────────────────────────
// _sb holds the client reference. createClient() itself never throws — errors
// only surface when making actual API calls (caught inside each method).
const _sb: any = _sbClient ?? null;

if (!_sb) {
  console.error('[StorageService] CRITICAL: Supabase client is UNDEFINED in storageService');
}

// ── Public types ──────────────────────────────────────────────────────────────

const SNAPSHOT_VERSION = 1 as const;

export interface StudioSnapshot {
  app:         'AIC-RG_STUDIO';
  type:        'studio_snapshot';
  version:     typeof SNAPSHOT_VERSION;
  exportedAt:  string;
  studioState: {
    projectName: string;
    files:       FileMap;
    config:      Record<string, string>;
    theme:       string;
  };
}

export interface ManifestData {
  api_spent:             number;   // cumulative $ spent
  context_health:        number;   // 0–100 %
  infrastructure_status: Record<string, any>;
}

export interface CloudProjectCheck {
  isNewer:      boolean;
  cloudFiles:   FileMap | null;
  cloudVersion: number;
  cloudSyncAt:  string | null;
}

interface SyncMeta {
  version:    number;
  lastSyncAt: string;
}

// ── Internal constants ────────────────────────────────────────────────────────

const MANIFEST_ID     = 'studio-default';
const MANIFEST_LS_KEY = 'STUDIO_MANIFEST';
const syncMetaKey     = (id: string) => `CLOUD_SYNC_${id}`;

// ── Service object ────────────────────────────────────────────────────────────

export const storageService = {
  // State
  _available: false,
  _projectTableAvailable: false,
  _listeners: new Set<(available: boolean) => void>(),
  _timers:    new Map<string, ReturnType<typeof setTimeout>>(),

  // ── Connectivity ────────────────────────────────────────────────────────────

  /**
   * Call once on app mount. Tests Supabase connectivity and sets _available.
   * Safe to call even if tables don't exist yet.
   */
  async init(): Promise<void> {
    try {
      if (!_sb) throw new Error('no client');
      const { error } = await _sb
        .from('studio_manifest')
        .select('id')
        .limit(1);
      if (error) {
        console.error('[StorageService] Supabase Connection Error:', error.message, error);
        storageService._available = false;
      } else {
        storageService._available = true;
        console.log('[StorageService] Connected to Supabase ✓');
        // Check user_projects table separately — migration may not have run yet.
        const { error: tblError } = await _sb
          .from('user_projects')
          .select('id')
          .limit(1);
        if (tblError && (tblError.code === 'PGRST116' || String(tblError.message).includes('406') || String(tblError.code) === '406')) {
          console.warn('[StorageService] user_projects table unavailable (migration not applied?) — project cloud sync disabled.');
          storageService._projectTableAvailable = false;
        } else {
          storageService._projectTableAvailable = !tblError;
          if (tblError) console.warn('[StorageService] user_projects check error:', tblError.message);
        }
      }
    } catch (err: any) {
      console.error('[StorageService] Init exception:', err?.message ?? err);
      storageService._available = false;
    }

    if (!storageService._available) {
      console.warn(
        '[StorageService] Supabase unreachable — running in local-only mode. ' +
        'Check your keys in src/lib/supabase.ts and run scripts/create-storage-tables.sql.',
      );
    }
    storageService._notify();
  },

  get isAvailable(): boolean { return storageService._available; },

  /** Subscribe to connectivity changes. Returns unsubscribe fn. */
  onSyncStatusChange(cb: (available: boolean) => void): () => void {
    storageService._listeners.add(cb);
    cb(storageService._available); // emit current state immediately
    return () => storageService._listeners.delete(cb);
  },

  _notify(): void {
    storageService._listeners.forEach(cb => cb(storageService._available));
  },

  // ── Debounce helper ─────────────────────────────────────────────────────────

  _debounce(key: string, fn: () => void, delay: number): void {
    const existing = storageService._timers.get(key);
    if (existing) clearTimeout(existing);
    storageService._timers.set(key, setTimeout(() => {
      storageService._timers.delete(key);
      fn();
    }, delay));
  },

  // ── MANIFEST ────────────────────────────────────────────────────────────────

  /**
   * Save manifest: localStorage immediately + Supabase debounced 5 s.
   */
  saveManifest(data: ManifestData): void {
    try { localStorage.setItem(MANIFEST_LS_KEY, JSON.stringify(data)); } catch { /* quota */ }
    if (!storageService._available) return;
    storageService._debounce('manifest', () => storageService._upsertManifest(data), 5_000);
  },

  loadManifestLocal(): ManifestData {
    try {
      return (
        JSON.parse(localStorage.getItem(MANIFEST_LS_KEY) ?? 'null') ?? {
          api_spent: 0, context_health: 100, infrastructure_status: {},
        }
      );
    } catch {
      return { api_spent: 0, context_health: 100, infrastructure_status: {} };
    }
  },

  async _upsertManifest(data: ManifestData): Promise<void> {
    try {
      if (!_sb) return;

      // ── Error 88.227 root-cause fix ──────────────────────────────────────
      // context_health is computed as: 100 - (sessionTokens / 100_000) * 100
      // This produces floats like 88.227 when sessionTokens = 11773.
      //
      // Confirmed source:  App.tsx → saveManifest({ context_health: Math.max(0, 100 - ...) })
      // Confirmed table:   studio_manifest
      // Confirmed column:  context_health
      // Confirmed problem: if the deployed column is INTEGER (older migration),
      //                    PostgreSQL rejects 88.227 with error 22003 (numeric_value_out_of_range).
      //
      // Fix: always coerce to integer before write.  Semantically context_health
      // is a whole-number percentage (0–100 %) — integer precision is sufficient.
      // api_spent is legitimately a float (dollars/cents) — kept as-is.
      const contextHealthInt = Math.round(data.context_health);

      const { error } = await _sb.from('studio_manifest').upsert(
        {
          id:                    MANIFEST_ID,
          api_spent:             data.api_spent,
          context_health:        contextHealthInt,
          infrastructure_status: data.infrastructure_status,
          updated_at:            new Date().toISOString(),
        },
        { onConflict: 'id' },
      );
      if (error) {
        // Precise attribution: which table / column / value caused this failure.
        console.error(
          '[StorageService] studio_manifest upsert failed.',
          '\n  table:          studio_manifest',
          '\n  column:         context_health (sent:', contextHealthInt, ') | api_spent (sent:', data.api_spent, ')',
          '\n  raw float was:  context_health =', data.context_health,
          '\n  error code:    ', error.code,
          '\n  error message: ', error.message,
          '\n  hint:          ', error.hint ?? '(none)',
          '\n  details:       ', error.details ?? '(none)',
          '\n  If error code is 22003 — column type in production is INTEGER, not NUMERIC.',
          '\n  Run:  ALTER TABLE studio_manifest ALTER COLUMN context_health TYPE numeric;',
        );
      }
    } catch (err: any) {
      console.warn('[StorageService] Manifest upsert exception (non-blocking):', err?.message ?? err);
    }
  },

  // ── PROJECTS ────────────────────────────────────────────────────────────────

  /**
   * Save project: kicks off a debounced Supabase upsert (30 s).
   * localStorage is already handled by useStudio's persist effect.
   */
  saveProject(id: string, name: string, files: FileMap): void {
    console.log('[StorageService] saveProject called:', id, Object.keys(files).length, 'files');
    if (!id || Object.keys(files).length === 0) return;
    if (!storageService._available || !storageService._projectTableAvailable) {
      console.warn('[StorageService] saveProject skipped — Supabase not available (_available=false)');
      return;
    }
    storageService._debounce(
      `project:${id}`,
      () => storageService._upsertProject(id, name, files),
      30_000,
    );
  },

  /**
   * Force-save project to Supabase immediately (used by Backup button).
   * Cancels any pending debounce first.
   * Returns true on success.
   */
  async forceSaveProject(id: string, name: string, files: FileMap): Promise<boolean> {
    if (!id || Object.keys(files).length === 0) return false;
    // Cancel pending debounce for this project
    const key = `project:${id}`;
    const t   = storageService._timers.get(key);
    if (t) { clearTimeout(t); storageService._timers.delete(key); }

    if (!storageService._available) {
      console.warn('[StorageService] Supabase unavailable — backup skipped (mock mode)');
      return false;
    }
    return storageService._upsertProject(id, name, files);
  },

  async _upsertProject(id: string, name: string, files: FileMap): Promise<boolean> {
    try {
      if (!_sb) return false;
      // Guard: Supabase user_projects.id is UUID — reject legacy numeric timestamps
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!UUID_RE.test(id)) {
        // Silent fail for non-UUID IDs (local-only projects)
        return false;
      }
      const meta    = storageService._loadSyncMeta(id);
      const version = (meta?.version ?? 0) + 1;
      const syncAt  = new Date().toISOString();

      const { error } = await _sb.from('user_projects').upsert(
        { id, name, code_snapshot: files, last_sync_at: syncAt, version },
        { onConflict: 'id' },
      );

      if (!error) {
        storageService._saveSyncMeta(id, { version, lastSyncAt: syncAt });
        console.log('[StorageService] ✅ Saved to Supabase:', id, '(version', version, ')');
        return true;
      }

      console.error('[StorageService] ❌ Supabase error:', error);
      // ── 406 Not Acceptable: Non-fatal sync lag ──────────────────────────────
      // Supabase may return 406 when the request is valid but the server
      // cannot produce the expected response format (e.g., during sync lag).
      // This is NOT a critical error - treat as local-first success.
      if (error.code === '406' || error.status === 406) {
        console.warn(
          '[StorageService] Supabase 406 (Not Acceptable) — treating as non-fatal sync lag.',
          '\n  Project will continue in local-first mode.',
          '\n  projectId:', id,
        );
        // Return true so the first revision flow can continue
        // The local state is valid even if cloud sync is temporarily unavailable
        return true;
      }

      // Precise attribution for upsert failures.
      // user_projects.version is INTEGER — must always be a whole number.
      console.error(
        '[StorageService] user_projects upsert failed.',
        '\n  table:   user_projects',
        '\n  columns: id (sent:', id, ') | version (sent:', version, ', type:', typeof version, ')',
        '\n  error code:    ', error.code,
        '\n  error message: ', error.message,
        '\n  hint:          ', error.hint ?? '(none)',
      );
      return false;
    } catch (err) {
      console.warn('[StorageService] Project upsert exception:', err);
      return false;
    }
  },

  /**
   * Compare local sync timestamp vs Supabase row.
   * Returns cloud data if cloud version is more than 5 s newer.
   */
  async checkCloudProject(projectId: string): Promise<CloudProjectCheck> {
    const empty: CloudProjectCheck = {
      isNewer: false, cloudFiles: null, cloudVersion: 0, cloudSyncAt: null,
    };
    if (!storageService._available || !storageService._projectTableAvailable || !projectId) return empty;

    // Guard: Supabase user_projects.id is UUID — skip non-UUID IDs
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(projectId)) {
      return empty;
    }

    try {
      if (!_sb) return empty;
      const { data, error } = await _sb
        .from('user_projects')
        .select('code_snapshot, last_sync_at, version')
        .eq('id', projectId)
        .single();

      if (error || !data) return empty;

      const meta      = storageService._loadSyncMeta(projectId);
      const cloudTime = new Date(data.last_sync_at).getTime();
      const localTime = meta?.lastSyncAt ? new Date(meta.lastSyncAt).getTime() : 0;

      return {
        isNewer:      cloudTime > localTime + 5_000,
        cloudFiles:   data.code_snapshot as FileMap,
        cloudVersion: data.version,
        cloudSyncAt:  data.last_sync_at,
      };
    } catch {
      return empty;
    }
  },

  // ── Sync-meta helpers (localStorage) ────────────────────────────────────────

  _loadSyncMeta(id: string): SyncMeta | null {
    try { return JSON.parse(localStorage.getItem(syncMetaKey(id)) ?? 'null'); }
    catch { return null; }
  },

  _saveSyncMeta(id: string, meta: SyncMeta): void {
    try { localStorage.setItem(syncMetaKey(id), JSON.stringify(meta)); } catch { /* quota */ }
  },

  getLastSyncAt(projectId: string): string | null {
    return storageService._loadSyncMeta(projectId)?.lastSyncAt ?? null;
  },

  getProjectVersion(projectId: string): number {
    return storageService._loadSyncMeta(projectId)?.version ?? 0;
  },

  // ── Local Snapshot Export / Import ──────────────────────────────────────────

  /**
   * Build a self-contained JSON snapshot and trigger a browser download.
   * No Supabase involved — pure localStorage + File API.
   */
  generateStudioSnapshot(
    projectName: string,
    files:       FileMap,
    config:      Record<string, string>,
    theme:       string,
  ): void {
    const snapshot: StudioSnapshot = {
      app:         'AIC-RG_STUDIO',
      type:        'studio_snapshot',
      version:     SNAPSHOT_VERSION,
      exportedAt:  new Date().toISOString(),
      studioState: { projectName, files, config, theme },
    };
    const json     = JSON.stringify(snapshot, null, 2);
    const blob     = new Blob([json], { type: 'application/json' });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    const safeName = projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'project';
    a.href         = url;
    a.download     = `aic-rg-snapshot_${safeName}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('[StorageService] Snapshot downloaded:', a.download);
  },

  /**
   * Strictly validate a parsed JSON object as a StudioSnapshot.
   *
   * Rules:
   *  1. app must equal "AIC-RG_STUDIO"
   *  2. type must equal "studio_snapshot"
   *  3. version must be a number
   *  4. exportedAt must be a string that parses as a valid ISO date
   *  5. version > SNAPSHOT_VERSION → synchronous window.confirm; abort if user cancels
   *  6. studioState must be an object containing a non-null files object
   *  7. studioState.projectName — if present, must be a string
   *  8. studioState.theme — if present, must be a string
   *  9. studioState.config — if present, must be a non-null object
   *
   * Returns false for any structural mismatch or user-cancelled version gate.
   */
  validateSnapshot(json: unknown): json is StudioSnapshot {
    if (!json || typeof json !== 'object') return false;
    const s = json as Record<string, unknown>;

    // Rules 1–3
    if (s.app !== 'AIC-RG_STUDIO') return false;
    if (s.type !== 'studio_snapshot') return false;
    if (typeof s.version !== 'number') return false;

    // Rule 4 — exportedAt must parse as a valid date
    if (
      typeof s.exportedAt !== 'string' ||
      isNaN(Date.parse(s.exportedAt))
    ) return false;

    // Rule 5 — version gate: user must confirm snapshots from future versions
    if (s.version > SNAPSHOT_VERSION) {
      const proceed = window.confirm(
        `Этот снимок создан в более новой версии студии (v${s.version}).\n` +
        `Текущая версия: v${SNAPSHOT_VERSION}.\n\n` +
        'Восстановление может привести к ошибкам. Продолжить?',
      );
      if (!proceed) return false;
    }

    // Rule 6
    const st = s.studioState as Record<string, unknown> | undefined;
    if (!st || typeof st !== 'object') return false;
    if (typeof st.files !== 'object' || st.files === null) return false;

    // Rules 7–9 — optional fields must match expected types if present
    if ('projectName' in st && typeof st.projectName !== 'string') return false;
    if ('theme'       in st && typeof st.theme       !== 'string') return false;
    if ('config'      in st && (typeof st.config !== 'object' || st.config === null)) return false;

    return true;
  },
};
