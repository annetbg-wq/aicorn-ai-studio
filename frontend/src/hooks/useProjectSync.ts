/**
 * useProjectSync — React hook connecting EngineWorkspace to storageService.
 *
 * Responsibilities:
 *  1. Trigger debounced cloud save whenever files or projectId changes.
 *  2. Check for a newer cloud version on every project switch (hybrid recovery).
 *  3. Expose handleDownloadSnapshot() — local JSON export (replaces cloud backup).
 *  4. Expose handleRestoreFromFile(file) — import + emergency backup + state restore.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { storageService } from '../services/storageService';
import type { FileMap } from './useStudio';

// All localStorage keys managed by ConfigService that belong in the snapshot
const CONFIG_KEYS = [
  'OPENROUTER_API_KEY',
  // 'SELECTED_MODEL' removed — model is now resolved via agent configs, not a single global key
  'APP_THEME',
  'APP_LANGUAGE',
  'AUTO_ROUTE',
  'FULL_CONTEXT_MODE',
  'ENGINE_API_KEY',
  'ENGINE_MODEL_ID',
  'AGENT_PRIMARY_MODEL',
  'AGENT_FIX_MODEL',
  'GOOGLE_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'DEEPSEEK_API_KEY',
  'AGENT_CONFIG_agent_primary',
  'AGENT_CONFIG_agent_fix',
  'AGENT_CONFIG_agent_spec',
  'AGENT_CONFIG_agent_build',
  'AGENT_CONFIG_agent_qa',
] as const;

export interface ProjectSyncState {
  isSyncing:               boolean;
  lastSyncAt:              string | null;
  // Hybrid recovery
  cloudNewer:              boolean;
  cloudFiles:              FileMap | null;
  cloudVersion:            number;
  cloudSyncAt:             string | null;
  // Actions
  handleDownloadSnapshot:  () => void;
  handleRestoreFromFile:   (file: File) => Promise<void>;
  canUndoRestore:          boolean;
  handleUndoRestore:       () => void;
  dismissRecovery:         () => void;
  acceptRecovery:          () => void;
}

export function useProjectSync(
  files:             FileMap,
  currentProjectId:  string | null,
  projectName:       string,
  currentTheme:      string,
  onRestoreFiles:    (files: FileMap) => void,
  onRestoreConfig?:  (config: Record<string, string>) => void,
): ProjectSyncState {
  const [isSyncing,       setIsSyncing]       = useState(false);
  const [canUndoRestore,  setCanUndoRestore]  = useState(
    () => localStorage.getItem('emergency_snapshot_backup') !== null,
  );
  const [lastSyncAt,   setLastSyncAt]   = useState<string | null>(
    currentProjectId ? storageService.getLastSyncAt(currentProjectId) : null,
  );
  const [cloudNewer,   setCloudNewer]   = useState(false);
  const [cloudFiles,   setCloudFiles]   = useState<FileMap | null>(null);
  const [cloudVersion, setCloudVersion] = useState(0);
  const [cloudSyncAt,  setCloudSyncAt]  = useState<string | null>(null);

  const prevProjectId = useRef<string | null>(null);

  // ── 1. Auto-save: debounced cloud sync whenever files change ───────────────
  useEffect(() => {
    if (!currentProjectId || Object.keys(files).length === 0) return;
    try {
      storageService.saveProject(currentProjectId, projectName, files);
    } catch (error) {
      console.error('[useProjectSync]', error);
    }
  }, [files, currentProjectId, projectName]);

  // ── 2. Hybrid recovery: check cloud on project switch ─────────────────────
  useEffect(() => {
    if (!currentProjectId || currentProjectId === prevProjectId.current) return;
    prevProjectId.current = currentProjectId;

    setCloudNewer(false);
    setCloudFiles(null);
    setLastSyncAt(storageService.getLastSyncAt(currentProjectId));

    storageService.checkCloudProject(currentProjectId).then(result => {
      if (result.isNewer) {
        setCloudNewer(true);
        setCloudFiles(result.cloudFiles);
        setCloudVersion(result.cloudVersion);
        setCloudSyncAt(result.cloudSyncAt);
      }
    }).catch(error => {
      console.error('[useProjectSync]', error);
    });
  }, [currentProjectId]);

  // ── 3. Download Snapshot — local JSON export, no cloud ────────────────────
  const handleDownloadSnapshot = useCallback(() => {
    const config: Record<string, string> = {};
    for (const key of CONFIG_KEYS) {
      const val = localStorage.getItem(key);
      if (val !== null) config[key] = val;
    }
    storageService.generateStudioSnapshot(projectName, files, config, currentTheme);
  }, [projectName, files, currentTheme]);

  // ── 4. Restore From File — validate, full emergency backup, white-list apply
  const handleRestoreFromFile = useCallback(async (file: File) => {
    let parsed: unknown;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch {
      alert('Cannot read file: invalid JSON.');
      return;
    }

    if (!storageService.validateSnapshot(parsed)) {
      alert(
        'Invalid snapshot file.\n' +
        'Expected: app="AIC-RG_STUDIO", type="studio_snapshot", studioState.files object.',
      );
      return;
    }

    const snapshot = parsed; // typed as StudioSnapshot
    const { files: snapFiles, config: snapConfig, theme: snapTheme } = snapshot.studioState;

    // Full emergency backup: files + all current config keys + current theme
    const emergencyConfig: Record<string, string> = {};
    for (const key of CONFIG_KEYS) {
      const val = localStorage.getItem(key);
      if (val !== null) emergencyConfig[key] = val;
    }
    try {
      localStorage.setItem(
        'emergency_snapshot_backup',
        JSON.stringify({ files, config: emergencyConfig, theme: currentTheme }),
      );
      console.log('[useProjectSync] Full emergency backup saved (files + config + theme)');
    } catch {
      console.warn('[useProjectSync] Emergency backup failed (storage full?)');
    }

    // White-list restore: only apply known CONFIG_KEYS — never write arbitrary props
    const restoredConfig: Record<string, string> = {};
    for (const key of CONFIG_KEYS) {
      const val = snapConfig[key];
      if (val) {
        try { localStorage.setItem(key, val); } catch { /* storage full */ }
        restoredConfig[key] = val;
      }
    }

    // Update React state for config + theme
    onRestoreConfig?.(restoredConfig);

    // Restore files into React state — immediate, no page reload
    onRestoreFiles(snapFiles);

    setCanUndoRestore(true);
    console.log(
      `[useProjectSync] Restored "${snapshot.studioState.projectName}" ` +
      `(theme: ${snapTheme}, exported: ${snapshot.exportedAt})`,
    );
  }, [files, currentTheme, onRestoreFiles, onRestoreConfig]);

  // ── 5. Undo Restore — reinstate the full emergency backup ─────────────────
  const handleUndoRestore = useCallback(() => {
    const raw = localStorage.getItem('emergency_snapshot_backup');
    if (!raw) return;
    try {
      const backup = JSON.parse(raw) as {
        files:  FileMap;
        config: Record<string, string>;
        theme:  string;
      };

      // Restore config keys (white-listed)
      const undoConfig: Record<string, string> = {};
      for (const key of CONFIG_KEYS) {
        const val = backup.config?.[key];
        if (val) {
          try { localStorage.setItem(key, val); } catch {}
          undoConfig[key] = val;
        }
      }
      onRestoreConfig?.(undoConfig);
      onRestoreFiles(backup.files);

      localStorage.removeItem('emergency_snapshot_backup');
      setCanUndoRestore(false);
      console.log('[useProjectSync] Undo restore complete — emergency backup cleared');
    } catch {
      console.error('[useProjectSync] Undo restore failed: corrupted backup data');
    }
  }, [onRestoreFiles, onRestoreConfig]);

  // ── Recovery actions ───────────────────────────────────────────────────────
  const dismissRecovery = useCallback(() => {
    setCloudNewer(false);
    setCloudFiles(null);
  }, []);

  const acceptRecovery = useCallback(() => {
    if (cloudFiles) onRestoreFiles(cloudFiles);
    setCloudNewer(false);
    setCloudFiles(null);
  }, [cloudFiles, onRestoreFiles]);

  return {
    isSyncing, lastSyncAt,
    cloudNewer, cloudFiles, cloudVersion, cloudSyncAt,
    handleDownloadSnapshot, handleRestoreFromFile,
    canUndoRestore, handleUndoRestore,
    dismissRecovery, acceptRecovery,
  };
}
