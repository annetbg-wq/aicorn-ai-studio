/**
 * useStudio.ts — v4 DECOMPOSED
 *
 * Domain hooks extracted:
 *   useFigmaState    — Figma identity, sync, Design DNA, Project Hub, Engine
 *   useSettingsState  — API keys, models, theme, auto-route, agent configs
 *
 * This file remains the public facade — all consumers still call useStudio()
 * and get the same return shape.
 */

import { useState, useEffect, useRef, useCallback, useMemo, startTransition, useReducer } from 'react';
import type { LogEntry } from '../components/StudioTerminal';
import {
  createMessageId,
  chatReducer,
  normalizeMessages,
  normalizeMessage,
  type ChatMessage,
  type ChatAction,
} from '../lib/chat';
import { supabase } from '../lib/supabase';
import {
  Orchestrator,  // kept for applyOperations / resetSession — NOT for run() or planTask()
  applyOperations,
  type FileOperation,
  type PhaseEvent,
  type UsageData,
} from '../services/Orchestrator';
import { SimpleGeneration as GenerationPipeline } from '../services/SimpleGeneration';
import type { ProjectPlan } from '../services/SimpleGeneration';
import {
  classifyIdea,
  fallbackClassify,
  buildDesignSystemPrompt,
  type ClassificationResult,
} from '../services/designSystem';
import { ResourceManager } from '../services/ai/resourceManager';
import { CollabService } from '../services/CollabService';
import { ConfigService } from '../services/ConfigService';
import { FigmaService } from '../services/FigmaService';
import { useAuth } from '../contexts/AuthContext';
import { commandBus } from '../services/studioCommandBus';
import { transition, INITIAL_STATE, type StudioState as MachineState } from '../services/studioStateMachine';
import { ScannerService } from '../services/ScannerService';
import type { ComponentRegistry } from '../services/ScannerService';
import { ProjectStorage } from '../services/ProjectStorage';
import type { ProjectMeta, StoredProject, ProjectRevision } from '../services/ProjectStorage';
import { ProjectManager } from '../services/ProjectManager';
import type { Project } from '../services/ProjectManager';
import { ProjectRepository } from '../services/ProjectRepository';
import { BenchmarkService } from '../services/benchmark/BenchmarkService';
import { revisionManager } from '../services/RevisionManager';
import { previewController } from '../services/PreviewController';
import { normalizePath } from '../services/PreviewWriteGateway';
import { safeSetItem } from '../lib/safeStorage';
import { getLocalDevAgentProvider, isLocalDevAgentEnabled } from '../services/devAgentMode';
import { buildFileDiff, type FileDiff } from '../components/DiffPreview';
import { EditAdmissionService } from '../services/EditAdmissionService';
import type { AdmissionDecision } from '../services/EditAdmissionService';
import {
  projectGraphToFileMap,
  fileMapToProjectGraph,
  type ProjectGraph,
  type PreviewLifecycleStage,
} from '../shared/projectModel';
import { useFigmaState } from './useFigmaState';
import { useSettingsState } from './useSettingsState';

export type DeviceType = 'desktop' | 'iphone' | 'pixel' | 'ipad';
export type FileMap     = Record<string, string>;

/**
 * Snapshot status lifecycle (mirrors RevisionManager glossary):
 *   candidate → stable
 *
 *   candidate — AI generation wrote this snapshot; preview iframe has NOT
 *               confirmed it. Never used as crash-recovery fallback.
 *   stable    — The iframe mounted without errors (markSnapshotStable called).
 *               Eligible as crash-recovery fallback on next startup.
 *   undefined — Legacy snapshot (pre-status-tracking). Treated as stable.
 */
export type SnapshotStatus = 'candidate' | 'stable';

/** Returns true if a snapshot is considered stable (explicit or legacy). */
export function isSnapshotStable(s: Snapshot): boolean {
  return !s.status || s.status === 'stable';
}

export interface Snapshot {
  id:        string;
  files:     FileMap;
  label:     string;
  createdAt: string;
  /** 1-indexed position in the undo/redo history (= historyIndex + 1). */
  version:   number;
  /** See SnapshotStatus type for canonical lifecycle. */
  status?:   SnapshotStatus;
  /** RevisionManager revision id — enables preview restore on undo/redo. */
  revisionId?: string;
}

export interface Attachment {
  id:           string;
  name:         string;
  type:         'image' | 'text' | 'code' | 'pdf';
  data:         string;           // base64 data URI for images/PDFs, raw text for others
  mimeType:     string;
  textContent?: string;           // extracted text for PDFs
}

export interface ComposerContextItem {
  id:        string;
  source:    'weekly-feed' | 'niche' | 'dashboard' | 'manual';
  title:     string;
  intent:    string;
  summary:   string;
  createdAt: number;
  plan?:     ProjectPlan;
}

// ── helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_FILENAME = '/App.tsx';

const normalizeToFileMap = (raw: string | FileMap | null | undefined): FileMap => {
  if (!raw) return {};
  if (typeof raw === 'string') return raw ? { [DEFAULT_FILENAME]: raw } : {};
  return raw;
};

export const getPrimaryCode = (files: FileMap): string =>
  files[DEFAULT_FILENAME] ?? files[Object.keys(files)[0]] ?? '';

// ── Billing ───────────────────────────────────────────────────────────────────

const PRICE_MAP: Record<string, { in: number; out: number }> = {
  // prices in USD per 1M tokens
  'anthropic/claude-3.5-sonnet':              { in: 3.00,  out: 15.00 },
  'anthropic/claude-sonnet-4-5':              { in: 3.00,  out: 15.00 },
  'anthropic/claude-sonnet-4-6':              { in: 3.00,  out: 15.00 },
  'anthropic/claude-3-opus':                  { in: 15.00, out: 75.00 },
  'anthropic/claude-opus-4-6':               { in: 15.00, out: 75.00 },
  'anthropic/claude-3.5-haiku':               { in: 0.80,  out: 4.00  },
  'anthropic/claude-haiku-4-5-20251001':      { in: 0.80,  out: 4.00  },
  'openai/gpt-4o':                            { in: 2.50,  out: 10.00 },
  'openai/gpt-4o-mini':                       { in: 0.15,  out: 0.60  },
  'openai/o1-preview':                        { in: 15.00, out: 60.00 },
  'openai/o1-mini':                           { in: 3.00,  out: 12.00 },
  'openai/o3-mini':                           { in: 1.10,  out: 4.40  },
  'google/gemini-2.0-pro-exp-02-05:free':     { in: 0,     out: 0     },
  'google/gemini-2.0-flash-001':              { in: 0.10,  out: 0.40  },
  'deepseek/deepseek-r1':                     { in: 0.55,  out: 2.19  },
  'deepseek/deepseek-chat':                   { in: 0.14,  out: 0.28  },
  'deepseek/deepseek-v3':                     { in: 0.14,  out: 0.28  },
  'meta-llama/llama-3.3-70b-instruct':        { in: 0.59,  out: 0.79  },
  'meta-llama/llama-3.1-8b-instruct:free':    { in: 0,     out: 0     },
  'mistralai/mistral-large':                  { in: 2.00,  out: 6.00  },
  'qwen/qwen-2.5-coder-32b-instruct':         { in: 0.07,  out: 0.16  },
};

const calcCost = (model: string, usage: UsageData): number => {
  const p = PRICE_MAP[model];
  if (!p) return 0;
  return (usage.promptTokens * p.in + usage.completionTokens * p.out) / 1_000_000;
};

const loadBilling = (projectId: string) => {
  try {
    return JSON.parse(localStorage.getItem(`BILLING_${projectId}`) || 'null') ?? { cost: 0, tokens: 0 };
  } catch { return { cost: 0, tokens: 0 }; }
};

// ── revision helper ─────────────────────────────────────────────────────────

const MAX_REVISIONS = 5;

function addRevision(
  existing: StoredProject,
  patch: {
    prompt:      string;
    source:      'chat' | 'weekly-feed' | 'niche';
    files:       Record<string, string>;
    modelId?:    string;
    durationMs?: number;
    pagesCount?: number;
  },
): ProjectRevision[] | null {
  const current = existing.revisions ?? [];
  if (current.length >= MAX_REVISIONS) return null;

  const rev: ProjectRevision = {
    id:           crypto.randomUUID(),
    prompt:       patch.prompt,
    source:       patch.source,
    files:        patch.files,
    createdAt:    new Date().toISOString(),
    modelId:      patch.modelId,
    durationMs:   patch.durationMs,
    isBookmarked: false,
    pagesCount:   patch.pagesCount,
  };
  return [rev, ...current];
}

interface PendingProjectSave {
  projectId: string;
  projectTitle: string;
  finalFiles: FileMap;
  chatHistoryToSave: any[];
  userPrompt: string;
  source: 'chat' | 'weekly-feed' | 'niche';
  effectiveModel: string;
  generationStartMs: number;
  generationLogs: string[];
  generationErrors: string[];
  plan: ProjectPlan | null;
  planTheme: string;
  reqUsage: UsageData;
}

// ── hook ─────────────────────────────────────────────────────────────────────

export const useStudio = () => {
  const { user: authUser } = useAuth();
  // ── chat ─────────────────────────────────────────────────────────────────
  const [messages, dispatch] = useReducer(
    chatReducer,
    [],
    () => normalizeMessages(JSON.parse(localStorage.getItem('CHAT_HISTORY') || '[]')),
  );

  // Tracks the id of the last blueprint message so ACCEPT/REJECT subscribers
  // can hide it without scanning the messages array.
  const blueprintIdRef = useRef<string | null>(null);
  // Guard: prevents double-dispatch when user clicks confirm twice quickly.
  const confirmingRef = useRef(false);

  // ── chat dispatch helpers ─────────────────────────────────────────────────
  const chatAppend = useCallback((partial: Omit<ChatMessage, 'id' | 'timestamp'> & Partial<Pick<ChatMessage, 'id' | 'timestamp'>>) => {
    dispatch({ type: 'APPEND', payload: partial });
  }, []);

  const chatLoadHistory = useCallback((history: any[]) => {
    dispatch({ type: 'LOAD_HISTORY', payload: history });
  }, []);

  const chatReset = useCallback(() => {
    dispatch({ type: 'RESET', payload: [] });
  }, []);

  const chatUpdate = useCallback((id: string, patch: Partial<ChatMessage>) => {
    dispatch({ type: 'UPDATE_BY_ID', id, patch });
  }, []);

  const chatPatchLast = useCallback((patch: Partial<ChatMessage>, when?: (msg: ChatMessage) => boolean) => {
    dispatch({ type: 'PATCH_LAST', patch, when });
  }, []);

  const chatRemoveByType = useCallback((msgType: string) => {
    dispatch({ type: 'REMOVE_BY_TYPE', msgType });
  }, []);

  // Ref flag: set by createNewProject() so _sendImpl uses empty history even if
  // React hasn't re-rendered yet (stale closure guard).
  const pendingHistoryClear = useRef(false);

  // Blueprint confirmation — set when Architect plan is ready, cleared on confirm/cancel.
  // resolver lives in a ref (not state) so resolve() fires only after React commits the cleanup.
  const [pendingPlan, setPendingPlan] = useState<{
    id:            string;
    plan:          object;
    blueprintText: string;
    technicalBlueprint?: object | null;
    appName:       string;
    theme:         string;
    pages:         string[];
  } | null>(null);
  const planResolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const planDecisionRef = useRef<boolean | null>(null);

  // Diff review — set when edit candidate is compiled and has significant changes.
  // Resolver receives the selected file paths (partial apply) or false (reject all).
  const [pendingDiff, setPendingDiff] = useState<FileDiff[] | null>(null);
  const diffResolverRef = useRef<((result: string[] | false) => void) | null>(null);

  // Edit admission — set when EditAdmissionService classifies an incoming edit
  // as 'risky' or 'destructive'. Resolver receives true (proceed) or false (deny).
  const [pendingAdmission, setPendingAdmission] = useState<AdmissionDecision | null>(null);
  const admissionResolverRef = useRef<((approved: boolean) => void) | null>(null);

  // ── files ─────────────────────────────────────────────────────────────────
  // On startup always restore from the last *stable* snapshot to avoid showing
  // a broken candidate that was in-flight when the tab was closed.
  //
  // Architecture:
  //   filesRaw    — raw FileMap state (streaming optimistic updates + manual edits)
  //   projectGraph — authoritative ProjectGraph set from GenerationResult.graph
  //   files       — DERIVED: projectGraphToFileMap(projectGraph) when graph is set,
  //                 else filesRaw. This is the "primary state" in the public API.
  //                 Downstream consumers should prefer reading projectGraph directly.
  const [filesRaw, setFilesRaw] = useState<FileMap>(() => {
    const snaps: Snapshot[] = JSON.parse(localStorage.getItem('SNAPSHOTS') || '[]');
    const stableId = localStorage.getItem('STABLE_SNAPSHOT_ID');
    // 1. Try the explicitly-stored stable snapshot ID
    if (stableId) {
      const snap = snaps.find(s => s.id === stableId);
      if (snap) return normalizeToFileMap(snap.files);
    }
    // 2. Walk backwards to find the last stable snapshot (see isSnapshotStable)
    for (let i = snaps.length - 1; i >= 0; i--) {
      if (isSnapshotStable(snaps[i])) return normalizeToFileMap(snaps[i].files);
    }
    // 3. No stable snapshot at all — fall back to LAST_FILES / LAST_CODE
    return normalizeToFileMap(
      JSON.parse(localStorage.getItem('LAST_FILES') || 'null') ||
      localStorage.getItem('LAST_CODE')
    );
  });

  // Authoritative ProjectGraph — set from GenerationResult.graph after each generation.
  // Null before first generation or after a snapshot restore / manual file edit.
  const [projectGraph, setProjectGraph] = useState<ProjectGraph | null>(null);

  // Derived "files" — authoritative projection when projectGraph is available,
  // raw FileMap otherwise.  This is the value exposed to all consumers.
  // Use useMemo so the reference is stable when neither input changes.
  const files = useMemo<FileMap>(
    () => (projectGraph ? projectGraphToFileMap(projectGraph) : filesRaw),
    [projectGraph, filesRaw],
  );

  // Exposed setFiles — updates raw state and clears projectGraph so filesRaw takes
  // ownership again (user edit, snapshot restore, streaming optimistic update).
  // After a successful generation, setFilesRaw + setProjectGraph are called
  // directly (atomically) to avoid the intermediate null-graph state.
  const setFiles = useCallback((newFiles: FileMap) => {
    setFilesRaw(newFiles);
    setProjectGraph(null);
  }, []);

  const [activeFile, setActiveFileRaw] = useState<string>(DEFAULT_FILENAME);

  // ── EMERGENCY RESTORE (Машина времени из recover.html) ───────────────────
  useEffect(() => {
    const emergencyBackup = localStorage.getItem('aic_files_backup');
    if (emergencyBackup) {
      try {
        const parsedFiles = JSON.parse(emergencyBackup);
        setFiles(parsedFiles);
        localStorage.removeItem('aic_files_backup');
        console.log('🚀 SYSTEM RESTORED VIA EMERGENCY CHANNEL');
      } catch (e) {
        console.error('Failed to restore from emergency backup:', e);
      }
    }
  }, []);

  const setActiveFile = useCallback((name: string) => {
    setActiveFileRaw(name);
    CollabService.updateActiveFile(name);
  }, []);

  // ── snapshots / history ───────────────────────────────────────────────────
  const [snapshots, setSnapshots] = useState<Snapshot[]>(() =>
    JSON.parse(localStorage.getItem('SNAPSHOTS') || '[]')
  );
  const [currentSnapshotId, setCurrentSnapshotId] = useState<string | null>(
    localStorage.getItem('CURRENT_SNAPSHOT_ID')
  );
  const [stableSnapshotId, setStableSnapshotId] = useState<string | null>(
    localStorage.getItem('STABLE_SNAPSHOT_ID')
  );
  const [historyIndex, setHistoryIndex] = useState<number>(() => {
    const s: Snapshot[] = JSON.parse(localStorage.getItem('SNAPSHOTS') || '[]');
    // Start at the last stable snapshot, not the last one in the list,
    // so that broken candidates don't become the default history position.
    const stableId = localStorage.getItem('STABLE_SNAPSHOT_ID');
    if (stableId) {
      const idx = s.findIndex(snap => snap.id === stableId);
      if (idx !== -1) return idx;
    }
    for (let i = s.length - 1; i >= 0; i--) {
      if (isSnapshotStable(s[i])) return i;
    }
    return s.length - 1;
  });

  const addSnapshot = useCallback((newFiles: FileMap, label: string, revId?: string) => {
    // Compute snapshot data eagerly so we can call all setters at the same level
    // (never call setState inside another setState updater — that creates render-phase
    // updates which can corrupt the hooks linked list and trigger "Should have a queue").
    const base    = snapshots.slice(0, historyIndex + 1);
    const version = base.length + 1;
    const snap: Snapshot = {
      id: Date.now().toString(),
      files: newFiles,
      label: label.slice(0, 48),
      createdAt: new Date().toISOString(),
      version,
      status: 'candidate',
      revisionId: revId ?? revisionManager.getActiveRevisionId() ?? undefined,
    };
    const updated = [...base, snap];
    safeSetItem('SNAPSHOTS', JSON.stringify(updated));
    safeSetItem('CURRENT_SNAPSHOT_ID', snap.id);
    setSnapshots(updated);
    setCurrentSnapshotId(snap.id);
    setHistoryIndex(updated.length - 1);
  }, [historyIndex, snapshots]);

  const restoreSnapshot = useCallback((snap: Snapshot) => {
    const restored = normalizeToFileMap(snap.files);
    setFiles(restored);
    setCurrentSnapshotId(snap.id);
    safeSetItem('CURRENT_SNAPSHOT_ID', snap.id);
    const idx = snapshots.findIndex(s => s.id === snap.id);
    if (idx !== -1) setHistoryIndex(idx);
    if (!restored[activeFile]) setActiveFile(Object.keys(restored)[0] ?? DEFAULT_FILENAME);

    // Flush to preview via RevisionManager so the iframe updates
    if (snap.revisionId) {
      revisionManager.restoreRevision(snap.revisionId).catch((err: unknown) => {
        console.warn('[useStudio] revision restore failed, falling back to files state:', err);
      });
    }
  }, [snapshots, activeFile]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const snap = snapshots[historyIndex - 1];
      if (snap) restoreSnapshot(snap);
    }
  }, [historyIndex, snapshots, restoreSnapshot]);

  const redo = useCallback(() => {
    if (historyIndex < snapshots.length - 1) {
      const snap = snapshots[historyIndex + 1];
      if (snap) restoreSnapshot(snap);
    }
  }, [historyIndex, snapshots, restoreSnapshot]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < snapshots.length - 1 && snapshots.length > 0;

  const clearSnapshots = useCallback(() => {
    setSnapshots([]);
    setCurrentSnapshotId(null);
    setStableSnapshotId(null);
    setHistoryIndex(-1);
    localStorage.removeItem('SNAPSHOTS');
    localStorage.removeItem('CURRENT_SNAPSHOT_ID');
    localStorage.removeItem('STABLE_SNAPSHOT_ID');
  }, []);

  /** rollbackToStable — restore the last snapshot marked as 'stable'.
   *  Called when the user clicks "Rollback" after a preview failure. */
  const rollbackToStable = useCallback(() => {
    const sid = stableSnapshotId;
    if (!sid) return;
    const snap = snapshots.find(s => s.id === sid);
    if (!snap) return;
    restoreSnapshot(snap);
  }, [stableSnapshotId, snapshots, restoreSnapshot]);

  /**
   * markSnapshotStable — called after the preview successfully mounts without
   * errors (driven by the preview-mounted(buildId) → ready lifecycle). Promotes
   * `snapshotId` from candidate → stable and writes STABLE_SNAPSHOT_ID to
   * localStorage so the next restart opens this revision.
   *
   * Invariant: a broken candidate (iframe-error, or a timed-out preview-mounted)
   * is never passed here, so stable is never replaced by broken code.
   */
  const markSnapshotStable = useCallback((snapshotId: string) => {
    setSnapshots(prev => {
      const updated = prev.map(s =>
        s.id === snapshotId ? { ...s, status: 'stable' as const } : s
      );
      safeSetItem('SNAPSHOTS', JSON.stringify(updated));
      return updated;
    });
    setStableSnapshotId(snapshotId);
    safeSetItem('STABLE_SNAPSHOT_ID', snapshotId);
    // Mark the active generation-plan card as ready (iframe loaded without errors)
    if (currentPlanMsgIdRef.current) {
      chatUpdate(currentPlanMsgIdRef.current, { buildStatus: 'ready' });
    }
    // Preview lifecycle — iframe loaded successfully
    setPreviewLifecycle('preview-ready');
    commitPendingProjectSaveRef.current('preview-ready');
  }, []);

  useEffect(() => {
    const syncPreviewState = (state: ReturnType<typeof previewController.getState>) => {
      if (state.status === 'compiling' && state.activeRevisionId) {
        const nextUrl = `/preview/${state.activeRevisionId}`;
        setPreviewUrl(prev => (prev === nextUrl ? prev : nextUrl));
        setPreviewReady(false);
        setPreviewBlockedReason(null);
        return;
      }

      if (state.status === 'ready' && state.activeRevisionId) {
        const nextUrl = `/preview/${state.activeRevisionId}`;
        setPreviewUrl(prev => (prev === nextUrl ? prev : nextUrl));
        setPreviewReady(true);
        setPreviewBlockedReason(null);
        if (!currentSnapshotId) {
          setPreviewLifecycle('preview-ready');
          return;
        }
        if (lastPreviewReadyRevisionRef.current === state.activeRevisionId) return;
        lastPreviewReadyRevisionRef.current = state.activeRevisionId;
        markSnapshotStable(currentSnapshotId);
        return;
      }

      if (state.status === 'failed') {
        setPreviewReady(false);
        if (state.error) setPreviewBlockedReason(state.error);
      }
    };

    syncPreviewState(previewController.getState());
    return previewController.subscribe(syncPreviewState);
  }, [currentSnapshotId, markSnapshotStable]);

  // ═══════════════════════════════════════════════════════════════════════════
  //  SEMANTIC GLOSSARY — revision / version / snapshot disambiguation
  // ═══════════════════════════════════════════════════════════════════════════
  //
  //  1. SNAPSHOT (this layer — useStudio undo/redo)
  //     - A full file-map checkpoint in the undo/redo history.
  //     - snapshotIndex:      1-indexed position of the user in history.
  //     - snapshotCount:      total number of snapshots.
  //     - lastStableSnapshot: index of the most recent snapshot whose iframe
  //                           mounted without errors (crash-recovery fallback).
  //     - Snapshot.status:    'candidate' (untested) → 'stable' (iframe ok).
  //
  //  2. BUILD REVISION (RevisionManager layer)
  //     - A UUID-scoped backend compile cycle (POST /api/preview/:buildId/compile).
  //     - candidateRevisionId: in-flight build being compiled.
  //     - activeRevisionId:    last successfully compiled build (shown in iframe).
  //     - Also called "buildId" in the preview-timeline.
  //     - One snapshot can link to one build revision via Snapshot.revisionId.
  //
  //  3. PROJECT REVISION (persistence layer — ProjectStorage)
  //     - A full file snapshot saved to StoredProject.revisions[].
  //     - Max 5 per project. Shown in ProjectsScreen as "versions".
  //     - Completely separate from snapshots and build revisions.
  //
  //  4. PROJECT RECORD VERSION (Supabase layer — ProjectRepository)
  //     - ProjectRecord.version: optimistic concurrency counter.
  //     - Incremented on each DB save. Not user-visible. Not related to any
  //       of the above.
  // ═══════════════════════════════════════════════════════════════════════════

  /** 1-indexed position of the user in undo/redo history. UI: "snap #N". */
  const snapshotIndex  = historyIndex + 1 || snapshots.length;
  /** Total number of snapshots in undo/redo history. */
  const snapshotCount  = snapshots.length;

  /**
   * 1-indexed version of the most recent *stable* snapshot (iframe mounted
   * without errors). This is the crash-recovery fallback and the true
   * "last good" state shown with the green checkmark in EngineTopBar.
   *
   * Returns undefined when no stable snapshot exists yet.
   */
  const lastStableSnapshotIndex: number | undefined = useMemo(() => {
    for (let i = snapshots.length - 1; i >= 0; i--) {
      if (isSnapshotStable(snapshots[i])) return snapshots[i].version;
    }
    return undefined;
  }, [snapshots]);

  // ── backward-compat aliases (deprecated — use canonical names above) ────
  const currentVersion    = snapshotIndex;
  const totalVersions     = snapshotCount;
  const lastStableVersion = lastStableSnapshotIndex;

  // ── logs ──────────────────────────────────────────────────────────────────
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback((msg: string, level: LogEntry['level'] = 'info') => {
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [...prev.slice(-199), { level, message: msg, time }]);
    // Forward to Stability Terminal (DevModePanel)
    try {
      (window as any).__stabilityLog?.({
        level: level === 'warn' ? 'warn' : level === 'error' ? 'error' : 'info',
        source: 'studio',
        message: msg,
      });
    } catch { /* ignore */ }
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  const downloadLogs = useCallback(() => {
    if (logs.length === 0) return;
    const content = `AIC-RG Studio — Event Log\n${'─'.repeat(40)}\n${
      logs.map(l => `[${l.time}] ${l.level.toUpperCase()}: ${l.message}`).join('\n')
    }`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `studio-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [logs]);

  // ── attachments ───────────────────────────────────────────────────────────
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const addAttachment = useCallback((att: Attachment) => {
    setAttachments(prev => [...prev, att]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }, []);

  const clearAttachments = useCallback(() => setAttachments([]), []);

  const removeComposerContextItem = useCallback((id: string) => {
    setComposerContextItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const clearComposerContextItems = useCallback(() => {
    setComposerContextItems([]);
  }, []);

  const addComposerContextFromPlan = useCallback((
    plan: ProjectPlan | null | undefined,
    intent: string,
    source: 'weekly-feed' | 'niche' | 'dashboard' | 'manual' = 'weekly-feed',
  ) => {
    const appName = (plan?.appName ?? '').trim();
    const title = appName || intent.slice(0, 64) || 'Imported context';
    const summaryParts: string[] = [];
    if (plan?.description) summaryParts.push(String(plan.description));
    if (plan?.targetUser) summaryParts.push(`Target: ${String(plan.targetUser)}`);
    if (source === 'niche' && (plan as any)?.competitorGap) {
      summaryParts.push(`Gap: ${String((plan as any).competitorGap)}`);
    }
    const summary = summaryParts.join(' · ').slice(0, 320);
    const normalizedIntent = intent.trim();
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const id = `${source}:${slug}:${Date.now()}`;

    setComposerContextItems(prev => {
      const duplicateIndex = prev.findIndex(item =>
        item.source === source &&
        item.title.toLowerCase() === title.toLowerCase() &&
        item.intent.trim() === normalizedIntent,
      );
      const next = duplicateIndex >= 0
        ? [...prev.slice(0, duplicateIndex), ...prev.slice(duplicateIndex + 1)]
        : [...prev];
      next.push({
        id,
        source,
        title,
        intent: normalizedIntent,
        summary,
        createdAt: Date.now(),
        plan: plan ?? undefined,
      });
      return next.slice(-6);
    });

    if (source === 'weekly-feed' || source === 'niche') {
      setGenerationSource(source);
    }

    if (plan?.pages?.length) {
      if (plan.pages.length >= 8) setGenerationMode('superapp');
      else if (plan.pages.length <= 1) setGenerationMode('landing');
      else setGenerationMode('app');
    }

    setInput(prev => {
      const trimmed = prev.trim();
      if (trimmed.length > 0) return prev;
      return normalizedIntent;
    });
  }, []);

  // ── projects ──────────────────────────────────────────────────────────────
  const [projects, setProjects] = useState<ProjectMeta[]>(() =>
    ProjectStorage.listProjects()
  );
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(() => {
    const saved = localStorage.getItem('CURRENT_PROJECT_ID');
    if (!saved) return null;
    // Migrate: discard legacy numeric-timestamp IDs (Supabase expects UUID)
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return UUID_RE.test(saved) ? saved : null;
  });

  // Refresh project list from Supabase on mount (async — sync init above is the initial state)
  useEffect(() => {
    ProjectRepository.listProjects().then(meta => {
      setProjects(meta.map(m => ({
        id:          m.id,
        name:        m.name,
        theme:       m.theme,
        description: '',
        createdAt:   m.updatedAt,
        updatedAt:   m.updatedAt,
      })));
    }).catch(() => { /* already have localStorage fallback from useState init */ });
  }, []);

  // ── ui state (lazy initialisers — ConfigService reads run once on mount) ──
  const [input,           setInput]           = useState('');
  const [showSettings,    setShowSettings]    = useState(false);
  const [isGenerating,    setIsGenerating]    = useState(false);
  const [device,          setDevice]          = useState<DeviceType>('desktop');
  // ── Settings (extracted hook) ───────────────────────────────────────────────
  const settings = useSettingsState();
  const { apiKey, setApiKey, selectedModel, setSelectedModel, theme, setTheme,
          fullContextMode, setFullContextMode, autoRoute, setAutoRoute,
          appLanguage, setAppLanguage, agentConfigs, setAgentConfig } = settings;

  const [progress,        setProgress]        = useState(0);
  const [currentPhase,    setCurrentPhase]    = useState<string>('');
  const [machineState,    setMachineState]    = useState<MachineState>(INITIAL_STATE);
  const [generationMode,  setGenerationMode]  = useState<'landing' | 'app' | 'superapp'>('app');
  const [generationSource, setGenerationSource] = useState<'chat' | 'weekly-feed' | 'niche'>('chat');
  const [designClassification, setDesignClassification] = useState<ClassificationResult | null>(null);
  const [composerContextItems, setComposerContextItems] = useState<ComposerContextItem[]>([]);


  // ── Figma state (extracted hook) ─────────────────────────────────────────────
  const figma = useFigmaState(addLog);
  const { figmaAccounts, addFigmaAccount, removeFigmaAccount, refreshFigmaAccounts,
          figmaLink, setFigmaLink, figmaAccessResult, validateFigmaLink, figmaValidating,
          currentProjectTheme, syncProgress, syncFigmaUrl, syncSource, startFigmaSync,
          targetMarket, setTargetMarket, auditStrictness, setAuditStrictness,
          figmaProjects, activeFigmaProjectId,
          saveFigmaProject, loadFigmaProject, deleteFigmaProject,
          markFigmaProjectSynced, clearFigmaSync,
          engineApiKey, setEngineApiKey, engineModelId, setEngineModelId,
          engineStatus, engineResult } = figma;

  // ── ScannerService (Fusion Protocol) ───────────────────────────────────────
  const [componentRegistry, setComponentRegistry] = useState<ComponentRegistry | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── ScannerService: auto-scan project files (debounced 3 s) ──────────────
  useEffect(() => {
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    scanTimerRef.current = setTimeout(() => {
      if (Object.keys(files).length === 0) return;
      const reg = ScannerService.scan(files);
      setComponentRegistry(reg);
    }, 3_000);
    return () => {
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    };
  }, [files]); // eslint-disable-line react-hooks/exhaustive-deps

  const addSystemMessage = useCallback((content: string) => {
    chatAppend({ role: 'assistant', content });
  }, [chatAppend]);

  const scrollRef          = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const consecutiveErrors  = useRef(0);
  const lastErrorTime      = useRef(0);
  const networkRetryCountRef   = useRef(0);
  const networkRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the active generation-plan message ID so markSnapshotStable can set buildStatus:'ready'
  const currentPlanMsgIdRef = useRef<string | null>(null);
  const commitPendingProjectSaveRef = useRef<(reason: 'preview-ready' | 'manual-no-preview') => boolean>(() => false);
  const lastPreviewReadyRevisionRef = useRef<string | null>(null);

  // ── Preview lifecycle — honest completion handshake ───────────────────────
  const [previewLifecycle, setPreviewLifecycle] = useState<PreviewLifecycleStage>('idle');
  /** Human-readable reason when previewLifecycle === 'blocked'. Null otherwise. */
  const [previewBlockedReason, setPreviewBlockedReason] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewReady, setPreviewReady] = useState(false);

  // ── Level 2: Auto-fixer ───────────────────────────────────────────────────
  const fixAttemptsRef   = useRef(0);
  const MAX_FIX_ATTEMPTS = 2;
  const [isAutoFixing, setIsAutoFixing] = useState(false);

  // ── billing ───────────────────────────────────────────────────────────────
  const [sessionCost,    setSessionCost]    = useState(0);
  const [sessionTokens,  setSessionTokens]  = useState(0);
  const [projectCost,    setProjectCost]    = useState(() => {
    const id = localStorage.getItem('CURRENT_PROJECT_ID');
    return id ? loadBilling(id).cost : 0;
  });
  const [projectTokens,  setProjectTokens]  = useState(() => {
    const id = localStorage.getItem('CURRENT_PROJECT_ID');
    return id ? loadBilling(id).tokens : 0;
  });

  // Generated project is persisted only after preview success,
  // or after explicit user confirmation if preview failed/blocked.
  const pendingProjectSaveRef = useRef<PendingProjectSave | null>(null);
  const pendingSavePromptShownRef = useRef(false);

  const commitPendingProjectSave = useCallback((reason: 'preview-ready' | 'manual-no-preview') => {
    const pending = pendingProjectSaveRef.current;
    if (!pending) return false;
    pendingProjectSaveRef.current = null;
    pendingSavePromptShownRef.current = false;

    const reqTokens = pending.reqUsage.promptTokens + pending.reqUsage.completionTokens;
    if (reqTokens > 0) {
      const reqCost = calcCost(pending.effectiveModel, pending.reqUsage);
      setProjectCost((prev: number) => {
        const next = prev + reqCost;
        const savedTokens = (loadBilling(pending.projectId).tokens || 0) + reqTokens;
        safeSetItem(`BILLING_${pending.projectId}`, JSON.stringify({ cost: next, tokens: savedTokens }));
        return next;
      });
      setProjectTokens((prev: number) => prev + reqTokens);
    }

    const existing = ProjectStorage.getProject(pending.projectId);
    const revisionPatch = {
      prompt:     pending.userPrompt,
      source:     pending.source,
      files:      pending.finalFiles,
      modelId:    pending.effectiveModel,
      durationMs: Date.now() - pending.generationStartMs,
      pagesCount: pending.plan?.pages?.length ?? 0,
    };
    let newRevisions: ProjectRevision[] | null = null;
    if (existing) {
      newRevisions = addRevision(existing, revisionPatch);
      if (!newRevisions) {
        chatAppend({
          role: 'assistant',
          content: [
            '\u26A0\uFE0F **Version limit reached**',
            '',
            `Project "${pending.projectTitle}" already has 5 saved versions.`,
            'Open the Projects page \u2192 select this project \u2192 History tab',
            'to delete old versions before saving new ones.',
            '',
            'Your changes were applied to the preview but not saved as a new version.',
          ].join('\n'),
          timestamp: Date.now(),
        });
      }
    }

    if (existing) {
      try {
        ProjectManager.saveFiles(pending.projectId, {
          ...existing.files,
          ...pending.finalFiles,
        });
      } catch (saveErr: unknown) {
        addLog(`[Project] ${(saveErr as Error)?.message ?? 'File save failed'}`);
      }
      const afterFilesSave = ProjectStorage.getProject(pending.projectId);
      if (afterFilesSave) {
        ProjectStorage.saveProject({
          ...afterFilesSave,
          chatHistory:    pending.chatHistoryToSave,
          updatedAt:      new Date().toISOString(),
          intent:         pending.userPrompt,
          source:         pending.source,
          plan:           pending.plan ?? afterFilesSave.plan ?? undefined,
          logs:           pending.generationLogs,
          errors:         pending.generationErrors.filter(e => e.includes('❌') || e.toLowerCase().includes('error')),
          pagesCount:     pending.plan?.pages?.length ?? afterFilesSave.pagesCount ?? 0,
          modelId:        pending.effectiveModel,
          durationMs:     Date.now() - pending.generationStartMs,
          generationMode,
          billingCost:    projectCost,
          billingTokens:  projectTokens,
          revisions:      newRevisions ?? afterFilesSave.revisions,
        });
      }
    } else {
      const firstRevision: ProjectRevision = {
        id:           crypto.randomUUID(),
        prompt:       pending.userPrompt,
        source:       pending.source,
        files:        pending.finalFiles,
        createdAt:    new Date().toISOString(),
        modelId:      pending.effectiveModel,
        durationMs:   Date.now() - pending.generationStartMs,
        isBookmarked: false,
        pagesCount:   pending.plan?.pages?.length ?? 0,
      };
      const fallback: StoredProject = {
        id:             pending.projectId,
        name:           pending.projectTitle,
        description:    pending.userPrompt.slice(0, 120),
        theme:          pending.planTheme,
        createdAt:      new Date().toISOString(),
        updatedAt:      new Date().toISOString(),
        files:          pending.finalFiles,
        chatHistory:    pending.chatHistoryToSave,
        intent:         pending.userPrompt,
        source:         pending.source,
        plan:           pending.plan ?? undefined,
        logs:           pending.generationLogs,
        errors:         pending.generationErrors.filter(e => e.includes('❌') || e.toLowerCase().includes('error')),
        pagesCount:     pending.plan?.pages?.length ?? 0,
        modelId:        pending.effectiveModel,
        durationMs:     Date.now() - pending.generationStartMs,
        generationMode,
        billingCost:    projectCost,
        billingTokens:  projectTokens,
        revisions:      [firstRevision],
      };
      const ok = ProjectStorage.saveProject(fallback);
      if (!ok) addLog('[Project] Storage full â€” project not saved');
    }

    setCurrentProjectId(pending.projectId);
    setProjects(ProjectStorage.listProjects());

    const existingForCloud = ProjectStorage.getProject(pending.projectId);
    ProjectRepository.saveProject({
      id:          pending.projectId,
      name:        pending.projectTitle,
      userId:      authUser?.id ?? 'anonymous',
      description: pending.userPrompt.slice(0, 120),
      theme:       pending.planTheme,
      files:       existingForCloud?.files
                     ? { ...existingForCloud.files, ...pending.finalFiles }
                     : pending.finalFiles,
      chatHistory: pending.chatHistoryToSave,
      createdAt:   existingForCloud?.createdAt ?? new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
      version:     1,
      intent:         pending.userPrompt,
      source:         pending.source,
      plan:           pending.plan ?? undefined,
      logs:           pending.generationLogs,
      errors:         pending.generationErrors.filter(e => e.includes('❌') || e.toLowerCase().includes('error')),
      pagesCount:     pending.plan?.pages?.length ?? 0,
      modelId:        pending.effectiveModel,
      durationMs:     Date.now() - pending.generationStartMs,
      generationMode,
      billingCost:    projectCost,
      billingTokens:  projectTokens,
      revisions:      existingForCloud?.revisions ?? [],
    } as any).catch((err: any) => addLog(`[Project] Cloud save error: ${err}`));

    addLog(
      reason === 'preview-ready'
        ? `[Project] Saved after preview ready: ${pending.projectTitle}`
        : `[Project] Saved without preview (confirmed): ${pending.projectTitle}`,
    );
    return true;
  }, [addLog, authUser?.id, generationMode, projectCost, projectTokens]);
  commitPendingProjectSaveRef.current = commitPendingProjectSave;

  useEffect(() => {
    if (isGenerating) return;
    if (!pendingProjectSaveRef.current) return;
    if (previewLifecycle !== 'failed' && previewLifecycle !== 'blocked') return;
    if (pendingSavePromptShownRef.current) return;

    pendingSavePromptShownRef.current = true;
    const pending = pendingProjectSaveRef.current;
    const ok = window.confirm(
      `Превью не загрузилось.\n\nСохранить проект "${pending?.projectTitle ?? 'Untitled'}" для дальнейшей работы?`,
    );
    if (ok) {
      commitPendingProjectSave('manual-no-preview');
      chatAppend({
        role: 'assistant',
        content: 'Проект сохранён без превью. Вы сможете продолжить работу позже.',
        timestamp: Date.now(),
      });
    } else {
      pendingProjectSaveRef.current = null;
      pendingSavePromptShownRef.current = false;
      addLog('[Project] User skipped save because preview did not load');
      chatAppend({
        role: 'assistant',
        content: 'Проект не сохранён, так как превью не загрузилось.',
        timestamp: Date.now(),
      });
    }
  }, [previewLifecycle, isGenerating, commitPendingProjectSave, addLog, chatAppend]);

  // ── persist (data only — config keys are written immediately by their setters) ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    safeSetItem('CHAT_HISTORY',  JSON.stringify(messages));
    // Persist the derived `files` value — includes graph-derived files when graph is set.
    safeSetItem('LAST_FILES',    JSON.stringify(files));
    safeSetItem('LAST_CODE',     getPrimaryCode(files));
    if (currentProjectId) safeSetItem('CURRENT_PROJECT_ID', currentProjectId);
    else localStorage.removeItem('CURRENT_PROJECT_ID');
  }, [messages, files, currentProjectId]); // `files` is a useMemo — stable ref unless projectGraph or filesRaw changes

  // ── auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // ── Level 2: Auto-fixer listener ─────────────────────────────────────────
  // Captures apiKey, addLog via ref so the effect never needs to be re-registered.
  const _autoFixHandlerRef = useRef<(e: MessageEvent) => void>(() => {});
  _autoFixHandlerRef.current = (e: MessageEvent) => {
    if (e.origin !== window.location.origin) return;
    if (e.data?.type !== 'iframe-error') return;
    // Preview lifecycle — mark as failed/degraded on first error after generation
    setPreviewLifecycle(prev =>
      prev === 'committing' || prev === 'generating' ? 'failed' : prev === 'preview-ready' ? 'degraded' : prev,
    );
    if (isGenerating) return;                         // don't race with active generation
    if (fixAttemptsRef.current >= MAX_FIX_ATTEMPTS) {
      addLog(`[AutoFix] Max attempts (${MAX_FIX_ATTEMPTS}) reached. Manual fix required.`);
      return;
    }
    const errorMsg: string = typeof e.data.message === 'string' ? e.data.message : '';
    if (!errorMsg) return;
    fixAttemptsRef.current += 1;
    const attempt = fixAttemptsRef.current;
    const effectiveKey = ConfigService.getKeyForAgent('fix') || apiKey;
    if (!effectiveKey) {
      addLog('[AutoFix] Fix agent key not configured. Set it in Settings → Agent Fix.');
      return;
    }
    setIsAutoFixing(true);
    addLog(`[AutoFix] Attempt ${attempt}/${MAX_FIX_ATTEMPTS}: ${errorMsg.slice(0, 100)}`);
    GenerationPipeline.autoFix({ errorMsg, apiKey: effectiveKey, onLog: addLog })
      .then(success => {
        if (success) {
          setPreviewLifecycle('committing'); // waiting for backend recompile + preview-mounted
          addLog('[AutoFix] Fix applied — waiting for backend recompile...');
          chatAppend({
            role: 'assistant',
            content: `🔧 **Auto-fix applied** (attempt ${attempt}/${MAX_FIX_ATTEMPTS})\n\nFound and repaired a runtime error in the generated code. Preview is reloading…`,
          });
        } else {
          addLog('[AutoFix] Could not determine file to fix');
          if (attempt >= MAX_FIX_ATTEMPTS) {
            chatAppend({
              role: 'assistant',
              content: `❌ **Auto-fix failed** after ${MAX_FIX_ATTEMPTS} attempts.\n\nError: ${errorMsg.slice(0, 200)}\n\nTry describing what you want differently, or regenerate the project.`,
            });
          }
        }
      })
      .catch((err: unknown) => {
        addLog(`[AutoFix] Error: ${(err as Error)?.message ?? String(err)}`);
      })
      .finally(() => setIsAutoFixing(false));
  };
  useEffect(() => {
    const handler = (e: MessageEvent) => _autoFixHandlerRef.current(e);
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stable refs — latest state values without adding them to callback deps ──
  // (prevents studioMemo from invalidating on every token / file update)
  const _latestFilesRef    = useRef(files);
  _latestFilesRef.current  = files;
  const _latestMsgsRef    = useRef<any[]>(messages);
  _latestMsgsRef.current  = messages;

  // Stable refs for admission-check dirty-workspace detection (avoids closure staleness)
  const _pendingDiffRef         = useRef(pendingDiff);
  _pendingDiffRef.current       = pendingDiff;
  const _previewLifecycleRef    = useRef(previewLifecycle);
  _previewLifecycleRef.current  = previewLifecycle;

  // Register admission checker with SimpleGeneration via waitForAdmission callback.
  // Uses refs so the callback captures current state without a re-registration cycle.
  // Runs once on mount; cleans up on unmount.
  useEffect(() => {
    return () => {
      // On unmount: deny any pending admission promise so the pipeline does not hang.
      if (admissionResolverRef.current) {
        admissionResolverRef.current(false);
        admissionResolverRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── project actions ───────────────────────────────────────────────────────
  const createNewProject = useCallback(async () => {
    pendingProjectSaveRef.current = null;
    pendingSavePromptShownRef.current = false;
    currentPlanMsgIdRef.current = null;
    // Auto-save the current project before clearing so history is not lost
    if (currentProjectId && Object.keys(_latestFilesRef.current).length > 0) {
      const existing = ProjectStorage.getProject(currentProjectId);
      if (existing) {
        ProjectStorage.saveProject({
          ...existing,
          files:       _latestFilesRef.current,
          chatHistory: _latestMsgsRef.current,
          updatedAt:   new Date().toISOString(),
        });
        addLog('[Project] Auto-saved before new project');
      }
    }
    pendingHistoryClear.current = true;
    setInput('');
    chatReset();
    setPendingPlan(null);
    setPendingDiff(null);
    setIsGenerating(false);
    setProgress(0);
    setCurrentPhase('');
    setFiles({});
    setCurrentProjectId(null);
    setProjectCost(0);
    setProjectTokens(0);
    setGenerationSource('chat');
    clearSnapshots();
    clearLogs();
    clearAttachments();
    clearComposerContextItems();
    setPreviewLifecycle('idle');
    setPreviewUrl('');
    setPreviewReady(false);
    localStorage.removeItem('CHAT_HISTORY');
    localStorage.removeItem('LAST_FILES');
    localStorage.removeItem('LAST_CODE');
    localStorage.removeItem('CURRENT_PROJECT_ID');
    Orchestrator.resetSession();
    await revisionManager.createEmptyCandidate();
    // Immediately provision a blank project so currentProjectId is never null
    // and PreviewCanvas always has a valid projectId to render the device frame.
    try {
      const proj = ProjectManager.create({ name: 'New Project', theme: 'dark-slate', description: '' });
      ProjectManager.setCurrent(proj.id);
      setCurrentProjectId(proj.id);
      setProjects(ProjectStorage.listProjects());
    } catch {
      // Storage full or limit reached — UI stays in "no project" state gracefully.
    }
  }, [currentProjectId, clearSnapshots, clearLogs, clearAttachments, clearComposerContextItems, addLog]);

  const loadProject = useCallback(async (project: { id: string }) => {
    pendingProjectSaveRef.current = null;
    pendingSavePromptShownRef.current = false;
    clearComposerContextItems();
    addLog(`[Project] Loading ${project.id.slice(0, 8)}…`);
    try {
      // Supabase first, localStorage fallback
      const full = await ProjectRepository.getProject(project.id);
      if (!full) {
        addLog('[Project] Not found in Supabase or localStorage');
        return;
      }

      // 1. Compile project files — await so backend compile + preview-mounted(buildId) complete before React state update
      try {
        await ProjectRepository.loadToPreview(full);
        addLog('[Project] ✅ Loaded to preview');

        // Integrity check: warn about imports that reference missing files
        const appCode = full.files['App.tsx'] ?? full.files['src/App.tsx'] ?? '';
        if (appCode) {
          const importMatches = [...appCode.matchAll(/from ['"]\.\/([^'"]+)['"]/g)];
          for (const match of importMatches) {
            const base = match[1];
            const exists =
              (`${base}.tsx` in full.files) ||
              (`${base}.ts` in full.files) ||
              (`src/${base}.tsx` in full.files) ||
              (`${base}/index.tsx` in full.files);
            if (!exists) {
              addLog(`[Project] Missing file detected: ${base}.tsx — AutoFix will handle via Vite error`);
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        addLog(`[Project] ❌ Preview load failed: ${msg}`);
        chatAppend({
          role: 'assistant',
          content: `⚠️ Preview failed to load: ${msg}\n\nTry clicking Retry in the preview panel.`,
          timestamp: Date.now(),
        });
      }

      // 2. Now update React state — preview-workspace already has the files on disk.
      // startTransition: these are non-critical UI updates; batching prevents
      // intermediate renders where iframe and React state are out of sync.
      const b = loadBilling(full.id);
      startTransition(() => {
        chatLoadHistory(full.chatHistory as any[]);
        setFiles(normalizeToFileMap(full.files));
        setCurrentProjectId(full.id);
        setProjectCost(b.cost);
        setProjectTokens(b.tokens);
        clearSnapshots();
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`[Project] ❌ Load failed: ${msg}`);
      chatAppend({
        role: 'assistant',
        content: `⚠️ Could not load project: ${msg}`,
        timestamp: Date.now(),
      });
    }
  }, [clearSnapshots, addLog]);

  const deleteProject = useCallback(async (id: string) => {
    await ProjectRepository.deleteProject(id);
    // Refresh list from Supabase (falls back to localStorage on error)
    const meta = await ProjectRepository.listProjects();
    setProjects(meta.map(m => ({
      id:          m.id,
      name:        m.name,
      theme:       m.theme,
      description: '',
      createdAt:   m.updatedAt,
      updatedAt:   m.updatedAt,
    })));
    if (currentProjectId === id) createNewProject();
  }, [currentProjectId, createNewProject]);

  /** Full current project (files included). Null when no project is active. */
  const currentProject = useMemo<Project | null>(
    () => (currentProjectId ? ProjectManager.getById(currentProjectId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentProjectId, projects],  // re-derive when id or project list changes
  );

  /**
   * Creates a named project record and sets it as current.
   * Does NOT clear chat/files — use createNewProject() for full UI reset.
   * Throws (and logs) on storage full or 20-project limit.
   */
  const createProject = useCallback((
    meta: { name: string; theme?: string; description?: string },
  ): string | null => {
    try {
      const proj = ProjectManager.create({
        name:        meta.name,
        theme:       meta.theme       ?? 'dark-slate',
        description: meta.description ?? meta.name,
      });
      ProjectManager.setCurrent(proj.id);
      setCurrentProjectId(proj.id);
      setProjects(ProjectStorage.listProjects());
      addLog(`[Project] Created: ${proj.name} (${proj.id.slice(0, 8)}…)`);
      return proj.id;
    } catch (err: unknown) {
      addLog(`[Project] ${(err as Error)?.message ?? 'Failed to create project'}`);
      return null;
    }
  }, [addLog, clearComposerContextItems]);

  const refreshProjects = useCallback(() => {
    setProjects(ProjectStorage.listProjects());
  }, []);

  /** Load an existing project into the active workspace (alias for loadProject with PM sync). */
  const switchProject = useCallback((project: { id: string }) => {
    ProjectManager.setCurrent(project.id);
    void loadProject(project);
  }, [loadProject]);

  // ── Auto-init: ensure a project is always active on first load ──────────────
  // Runs once after mount. Always calls loadProject() so the compiled preview
  // is rebuilt from scratch.
  //
  // HARD-REFRESH STARTUP BEHAVIOR — INTENTIONAL DESIGN DECISION (Option A):
  //   When the page loads after a hard refresh or server restart, if an active
  //   project exists in localStorage, it is automatically loaded and a fresh
  //   backend compile is triggered. The preview transitions through:
  //     idle → compiling → (preview-mounted) → ready
  //   The user does NOT need to take any action to restore the preview.
  //
  // Why we always recompile on startup (not restore a cached iframe URL):
  //   Compiled static builds (builds/:buildId/) are ephemeral — they live only
  //   for the duration of a backend server session. A hard refresh or server
  //   restart clears them. We therefore cannot rely on a previously-compiled
  //   build being present, and must trigger a fresh compile via the canonical
  //   materializePersistedFiles → triggerCompile path for every cold start.
  //
  //   This keeps the startup path identical to the project-switch path
  //   (no special cases, no silent stale-iframe risk).
  useEffect(() => {
    const init = async () => {
      if (currentProjectId) {
        // Hard-refresh case: currentProjectId is restored from localStorage,
        // but the compiled build is gone. loadProject() fetches files and
        // triggers a fresh backend compile so the preview is live again.
        await loadProject({ id: currentProjectId });
        return;
      }

      // No active project — try the most-recent saved one first.
      const list = ProjectStorage.listProjects();
      if (list.length > 0) {
        const recent = list[list.length - 1];
        await loadProject({ id: recent.id });
        return;
      }

      // Nothing saved — create a blank "New Project" silently.
      createProject({ name: 'New Project' });
    };

    init().catch(() => {/* ignore — addLog already records errors inside loadProject */});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setProgress(0);
    setCurrentPhase('');
    setPreviewLifecycle('idle');
    addLog('⚡ Generation stopped by user');
    chatPatchLast(
      { role: 'assistant', content: '⚡ Остановлено.' },
      (msg) => msg.role === 'assistant' && (msg.content === '...' || msg.content === ''),
    );
  }, [addLog, chatPatchLast]);

  const _publishImpl = async (): Promise<string | null> => {
    const code = getPrimaryCode(files);
    if (!code) {
      console.warn('publishProject: files are empty — Supabase insert skipped');
      return null;
    }
    console.log('publishProject: uploading snapshot, code length =', code.length);
    try {
      const { data, error } = await supabase
        .from('projects')
        .insert([{ code }])
        .select()
        .single();
      if (error) throw error;
      console.log('✅ Cloud Snapshot created! ID:', data.id);
      return data.id;
    } catch (err) {
      console.error('Publish error:', err);
      return null;
    }
  };
  const _publishRef = useRef(_publishImpl);
  _publishRef.current = _publishImpl;
  const publishProject = useCallback((): Promise<string | null> => _publishRef.current(), []);

  const classifyAndStore = useCallback(async (
    idea: string,
    apiKeyToUse: string,
  ): Promise<ClassificationResult> => {
    try {
      const result = await classifyIdea(idea, apiKeyToUse);
      setDesignClassification(result);
      console.log(`[design] Classified: ${result.category} / ${result.style} (${Math.round(result.confidence * 100)}%)`);
      return result;
    } catch {
      const fallback = fallbackClassify(idea);
      setDesignClassification(fallback);
      console.log(`[design] Fallback: ${fallback.category} / ${fallback.style}`);
      return fallback;
    }
  }, []);

  // ── handleSend ────────────────────────────────────────────────────────────
  // overridePrompt: used by REQUEST_PLAN_REVISION to bypass the textarea state.
  const _sendImpl = async (overridePrompt?: string) => {
    const effectiveInput = overridePrompt ?? input;
    if ((effectiveInput.trim().length === 0 && composerContextItems.length === 0 && attachments.length === 0) || isGenerating) return;

    if (import.meta.env.VITE_PLAYWRIGHT_TEST === '1') {
      console.log(' Test mode: hardcoded plan');
      // Remove previous pending plans in chat to prevent duplicate plan cards.
      dispatch({ type: 'CLEAR_PENDING_PLANS' });
      const testPlan = {
        id: 'test-plan-1',
        title: 'Counter App',
        description: 'Счетчик с кнопками + и -',
        screens: [{ name: 'Page1', description: 'Отображение и изменение значения счетчика' }],
        technicalBlueprint: { framework: 'react', state: 'useState' },
      };

      const planMessage = {
        id: String(Date.now()),
        role: 'assistant' as const,
        // Keep blueprint type so LeftPanel renders the pending card/buttons in E2E.
        type: 'blueprint',
        blueprintText: '### Screens\n1. **Page1** — Отображение и изменение значения счетчика',
        technicalBlueprint: testPlan.technicalBlueprint,
        pendingPlan: testPlan,
        isPending: true,
        appName: testPlan.title,
        pages: ['Page1'],
        blueprintVisible: true,
        timestamp: Date.now(),
      };

      dispatch({ type: 'APPEND', payload: planMessage });
      setPendingPlan({
        id: testPlan.id,
        plan: testPlan,
        blueprintText: planMessage.blueprintText,
        technicalBlueprint: testPlan.technicalBlueprint,
        appName: testPlan.title,
        theme: 'default',
        pages: ['Page1'],
      });
      setInput('');
      clearAttachments();
      return;
    }

    setGenerationSource('chat');
    const startMs = Date.now();

    const devAgentProvider = getLocalDevAgentProvider();
    const devAgentActive = devAgentProvider !== 'off';

    // ── Effective API key: use provider key for primary agent, global key as fallback
    const effectiveApiKey = ConfigService.getKeyForAgent('primary') || apiKey;

    if (!devAgentActive && !effectiveApiKey) {
      alert('Добавь OpenRouter API Key в настройках!');
      setShowSettings(true);
      return;
    }

    // ── Spam / retry protection: block after 3 consecutive errors for 30s ──
    const now = Date.now();
    if (consecutiveErrors.current >= 3 && now - lastErrorTime.current < 30_000) {
      const wait = Math.ceil((30_000 - (now - lastErrorTime.current)) / 1000);
      addLog(`⛔ Too many errors. Wait ${wait}s before retrying.`);
      alert(`Too many consecutive errors. Wait ${wait} seconds before retrying.`);
      return;
    }

    // ── Abort any previous request and create a fresh controller ──────────
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    pendingProjectSaveRef.current = null;
    pendingSavePromptShownRef.current = false;
    fixAttemptsRef.current = 0;  // reset auto-fix counter for this generation
    setIsGenerating(true);
    setProgress(5);
    setCurrentPhase('think');
    setPreviewLifecycle('generating');
    setPreviewBlockedReason(null);
    commandBus.dispatch({ type: 'START_GENERATION', intent: effectiveInput, plan: {} });
    addLog('─'.repeat(40));

    // (planning is handled inside GenerationPipeline via onPlan callback)

    const userPrompt = effectiveInput.trim();
    const hasComposerContext = composerContextItems.length > 0;
    const documentAttachmentContext = attachments
      .filter(a => a.type === 'pdf' || a.type === 'text' || a.type === 'code')
      .map((a, index) => {
        const body = (a.textContent ?? a.data ?? '').replace(/\s+/g, ' ').trim();
        const excerpt = body.slice(0, 800);
        return `${index + 1}. ${a.name}${excerpt ? `: ${excerpt}` : ''}`;
      });
    const attachmentContextText = documentAttachmentContext.length > 0
      ? [
          'ATTACHMENT CONTEXT (provided by user):',
          ...documentAttachmentContext,
        ].join('\n')
      : '';
    const contextPackText = hasComposerContext
      ? [
          'CONTEXT PACK (selected by user):',
          ...composerContextItems.map((item, index) => {
            const lines = [
              `${index + 1}. [${item.source}] ${item.title}`,
              item.intent ? `Intent: ${item.intent}` : '',
              item.summary ? `Notes: ${item.summary}` : '',
            ].filter(Boolean);
            return lines.join('\n');
          }),
        ].join('\n\n')
      : '';
    const generationModeLabel =
      generationMode === 'landing' ? 'Landing page'
      : generationMode === 'superapp' ? 'Super app'
      : 'Application';
    const languageLabelMap: Record<string, string> = {
      ru: 'Russian',
      en: 'English',
      es: 'Spanish',
      de: 'German',
      fr: 'French',
      zh: 'Chinese',
    };
    const buildPreferencesText = [
      'BUILD PREFERENCES (user-selected defaults):',
      `- Project type: ${generationModeLabel}`,
      `- Interface language: ${languageLabelMap[appLanguage] ?? appLanguage}`,
    ].join('\n');
    const baseIntent = [
      userPrompt || (hasComposerContext ? 'Continue with selected context pack.' : ''),
      buildPreferencesText,
      contextPackText,
      attachmentContextText,
    ].filter(Boolean).join('\n\n');
    const effectiveSource: 'chat' | 'weekly-feed' | 'niche' =
      composerContextItems.length === 1 &&
      (composerContextItems[0].source === 'weekly-feed' || composerContextItems[0].source === 'niche')
        ? composerContextItems[0].source
        : generationSource;
    const prebuiltPlanFromContext = composerContextItems.length === 1
      ? composerContextItems[0].plan
      : undefined;
    const generationStartMs = Date.now();
    const generationLogs: string[] = [];
    const generationErrors: string[] = [];

    let messageContent: any = userPrompt || 'Use selected context pack.';
    const imageAttachments = attachments.filter(a => a.type === 'image');
    if (imageAttachments.length > 0) {
      messageContent = [
        ...imageAttachments.map(a => ({
          type: 'image_url',
          image_url: { url: a.data },
        })),
        { type: 'text', text: userPrompt || 'Use selected context pack.' },
      ];
    }

    const userMsg = { role: 'user' as const, content: messageContent };
    // Use empty history if createNewProject() was called but React hasn't re-rendered yet.
    const baseMessages = pendingHistoryClear.current ? [] : messages;
    pendingHistoryClear.current = false;
    const history = [...baseMessages, userMsg];
    console.log('[handleSend] history length:', history.length,
      'first msg:', history[0]?.content?.toString().slice(0, 50));

    // Capture before clearing so we can pass to run() below
    const capturedAttachments = [...attachments];

    // Reset chat to show conversation history while plan loads.
    dispatch({ type: 'RESET', payload: history });

    // ── Optimistic blueprint card — shown immediately while plan generates ─────
    const optimisticPlanMsgId = crypto.randomUUID();
    currentPlanMsgIdRef.current = optimisticPlanMsgId;
    dispatch({ type: 'APPEND', payload: {
      id:             optimisticPlanMsgId,
      role:           'assistant' as const,
      type:           'blueprint',
      timestamp:      Date.now(),
      content:        `Plan: ${userPrompt.slice(0, 80)}`,
      blueprintVisible: true,
      progress:       0,
      buildStatus:    'generating' as const,
    } });

    // ── Language detection ────────────────────────────────────────────────────
    let userLang = /[а-яА-Я]/.test(userPrompt) ? 'ru' : 'en';
    if (import.meta.env.VITE_PLAYWRIGHT_TEST === '1') userLang = 'ru';

    // ── Generate plan — replace optimistic card with real plan data ───────────
    let plan: Awaited<ReturnType<typeof GenerationPipeline.generatePlan>>;
    try {
      plan = await GenerationPipeline.generatePlan({
        intent:   userPrompt,
        userLang,
        apiKey:   effectiveApiKey,
        signal:   controller.signal,
      });
    } catch (planErr) {
      // Remove optimistic card so UI doesn't show a stuck skeleton.
      dispatch({ type: 'REMOVE_BY_ID', id: optimisticPlanMsgId });
      throw planErr;
    }
    console.log('[planner] plan generated, dispatching', plan);

    // Update the optimistic card with real plan data (reuse same id — no remount).
    const planMsgId = optimisticPlanMsgId;
    dispatch({ type: 'UPDATE_BY_ID', id: planMsgId, patch: {
      appName:      plan.appName,
      pages:        plan.pages,
      steps:        plan.steps,
      content:      undefined,
      blueprintVisible: true,
      buildStatus:  'generating' as const,
      streamingCode: '',
    } });
    const updateStep = (stepId: string, stepStatus: string) =>
      dispatch({ type: 'UPDATE_STEPS', id: planMsgId, stepId, stepStatus });
    const updatePlan = (patch: object) =>
      chatUpdate(planMsgId, patch as Partial<ChatMessage>);
    setInput('');
    clearAttachments();

    const contextFiles = fullContextMode
      ? files
      : activeFile && files[activeFile]
        ? { [activeFile]: files[activeFile] }
        : files;

    // ── Inject project ID for memory persistence ─────────────────────────
    const contextWithProjectId = {
      ...contextFiles,
      ...(currentProjectId ? { '_projectId': currentProjectId } : {}),
    };

    // ── Inject Figma design tokens + cultural audit as virtual context file ─
    const contextWithTheme = currentProjectTheme
      ? {
          ...contextWithProjectId,
          '_figma_theme.css': FigmaService.injectFigmaContext(
            currentProjectTheme,
            { targetMarket, auditStrictness },
          ),
        }
      : contextWithProjectId;

    // ── Resolve primary model: agent config → ConfigService fallback chain ─
    const resolvedPrimary = agentConfigs.primary.modelId || ConfigService.resolveModel('primary');

    // ── Auto-routing: select optimal model for this task ──────────────────
    let effectiveModel = resolvedPrimary;
    if (autoRoute) {
      const decision = ResourceManager.selectModel(baseIntent || userPrompt, contextFiles);
      effectiveModel  = decision.model.id;
      addLog(`🤖 ${decision.reason}`);
      addLog(`   Cost tier: ${ResourceManager.tierLabel(decision.tier)} · ~$${decision.model.costPer1k.toFixed(4)}/1k tokens`);
    }
    console.log('[useStudio] resolved model=', effectiveModel);

    try {
      let optimisticFiles: FileMap | null = null;
      const filesSnapshot = { ...files };
      const systemEvents: string[] = [];
      let reqUsage: UsageData = { promptTokens: 0, completionTokens: 0 };
      let capturedAppName = '';

      // Vision analysis is now handled inside GenerationPipeline.run() via config.attachments.

      // Classify idea for design system
      const classification = devAgentActive
        ? fallbackClassify(baseIntent)
        : await classifyAndStore(baseIntent, effectiveApiKey);

      if (devAgentActive) {
        addLog(`[handleSend] ${devAgentProvider} dev agent active: skipped OpenRouter classification`);
      }
      const designPrompt = buildDesignSystemPrompt({
        category: classification.category,
        style: classification.style,
        idea: baseIntent,
        classification,
      });

      console.log('[DEBUG] pipeline input files:', Object.keys(contextWithTheme));
      const projectFiles = Object.keys(files);
      const existingCodeCount = projectFiles?.length || 0;
      const runOnce = (intentArg: string, modelArg: string) => GenerationPipeline.run({
        intent:    intentArg,
        history,
        files:     contextWithTheme,
        apiKey:    effectiveApiKey,
        modelId:   modelArg,
        fixModelId: agentConfigs.fix.modelId || ConfigService.resolveModel('fix'),
        designSystemPrompt: designPrompt,
        // Enable single-page safe mode on genesis (no existing code files).
        // This prevents the model from generating broken multi-page output
        // on the very first request when there's no context to ground on.
        singlePageSafeMode: existingCodeCount === 0,
        generationMode,
        attachments: capturedAttachments,
        prebuiltPlan: prebuiltPlanFromContext,
        onStream: (streamText) => {
          // Update streamingCode on the plan card (replaces old last-message overwrite)
          startTransition(() => {
            updatePlan({ streamingCode: streamText });
          });
        },
        onFiles: (ops: FileOperation[]) => {
          const base = optimisticFiles ?? filesSnapshot; // accumulate across multiple onFiles calls
          const applied = applyOperations(base, ops);
          optimisticFiles = applied;
          // Use setFilesRaw directly during streaming — projectGraph is null at this point
          // and calling the full setFiles() (which calls setProjectGraph(null)) is redundant.
          // startTransition: file-panel re-renders during streaming are non-critical
          const first = ops.find(o => o.op !== 'delete');
          startTransition(() => {
            setFilesRaw(applied);
            if (first && 'name' in first) setActiveFile((first as any).name);
          });
          for (const op of ops) {
            if ('name' in op) {
              const verb = op.op === 'delete' ? 'Deleted' : op.op === 'patch' ? 'Patched' : 'Updated';
              systemEvents.push(`⚙️ ${verb}: \`${op.name}\``);
            }
          }
        },
        onPhase: (event: PhaseEvent) => {
          startTransition(() => {
            setProgress(event.progress);
            setCurrentPhase(event.phase);
            if (event.phase === 'think')  { updateStep('think', 'done'); updateStep('architect', 'active'); updatePlan({ progress: 20 }); }
            if (event.phase === 'code')   { updateStep('architect', 'done'); updateStep('code', 'active'); updatePlan({ progress: 40 }); }
            if (event.phase === 'verify') { updateStep('code', 'done'); updateStep('theme', 'active'); updatePlan({ progress: 80 }); }
            if (event.phase === 'idle')   { updateStep('theme', 'done'); updateStep('save', 'done'); updatePlan({ progress: 100, buildStatus: 'building' }); }
          });
        },
        onLog: (msg: string) => {
          addLog(msg);
          generationLogs.push(msg);
          if (msg.includes('❌') || msg.toLowerCase().includes('error')) {
            generationErrors.push(msg);
          }
        },
        onPlan: (steps, appName) => {
          capturedAppName = appName ?? '';
          if (steps.length > 0) {
            addLog(`[PLAN] ${steps.length} pages: ${steps.join(', ')}`);
          }
          startTransition(() => {
            updatePlan({
              appName: appName ?? '',
              pages:   steps,
            });
          });
        },
        onPlanReady: (data) => {
          // Synchronous dispatch — no startTransition, no commandBus indirection.
          // All chat mutations go through the reducer in order.
          // commandBus.dispatch(SHOW_BLUEPRINT) is intentionally omitted here:
          // chat state is already mutated above; firing SHOW_BLUEPRINT via commandBus
          // would create a second asynchronous mutation path and introduce races.
          const bpId = `blueprint-${Date.now()}`;
          blueprintIdRef.current = bpId;
          dispatch({
            type: 'APPEND',
            payload: {
              role:             'assistant',
              type:             'blueprint',
              id:               bpId,
              timestamp:        Date.now(),
              blueprintVisible: true,
              ...data,
            },
          });
        },
        waitForConfirmation: (_plan) => new Promise((resolve) => {
          planResolverRef.current = resolve;
          setPendingPlan({
            id:            `plan_${Date.now()}`,
            plan:          _plan,
            blueprintText: '', // already shown via onPlanReady
            technicalBlueprint: null, // already shown via onPlanReady
            appName:       (_plan as any).appName ?? '',
            theme:         (_plan as any).theme ?? '',
            pages:         ((_plan as any).pages ?? []).map((p: any) => p.name ?? p),
          });
        }),
        waitForDiffReview: (diffs) => new Promise<string[] | false>((resolve) => {
          diffResolverRef.current = resolve;
          setPendingDiff(diffs);
        }),
        waitForAdmission: (decision) => {
          // Dirty-workspace detection (reads refs to avoid stale closure values)
          const isDirty =
            _pendingDiffRef.current !== null ||
            _previewLifecycleRef.current === 'committing';

          // Re-classify with dirty-workspace state injected (the pipeline has no
          // access to React state — we augment the decision here if needed).
          const augmented = isDirty && !decision.isDirtyWorkspace
            ? EditAdmissionService.classify(
                {
                  candidatePaths:  decision.protectedPathsHit.length > 0
                    ? decision.protectedPathsHit  // use already-known protected paths
                    : [],
                  activePaths: [],
                },
                true,
              )
            : decision;

          // If the augmented decision is still safe (e.g. only dirty-workspace was
          // the escalation reason but that went away), proceed without blocking.
          if (!augmented.requiresConfirmation) return Promise.resolve(true);

          return new Promise<boolean>((resolve) => {
            admissionResolverRef.current = resolve;
            setPendingAdmission(decision.requiresConfirmation ? decision : augmented);
          });
        },
        signal:   controller.signal,
        onUsage:  (usage: UsageData) => {
          reqUsage = usage;
          const cost = calcCost(modelArg, usage);
          setSessionCost(prev => prev + cost);
          setSessionTokens(prev => prev + usage.promptTokens + usage.completionTokens);
        },
        language: appLanguage,
      });

      let result;
      try {
        result = await runOnce(baseIntent, effectiveModel);
      } catch (firstErr: any) {
        const firstErrMsg = String(firstErr?.message ?? '');
        const isTimeout = /timed out|timeout/i.test(firstErrMsg);
        if (!isTimeout || controller.signal.aborted) throw firstErr;

        const fallbackModel = agentConfigs.fix.modelId || ConfigService.resolveModel('fix') || effectiveModel;
        const compactContextPack = hasComposerContext
          ? [
              'CONTEXT PACK (compact):',
              ...composerContextItems.map((item, index) => `${index + 1}. [${item.source}] ${item.title}`),
            ].join('\n')
          : '';
        const retryIntent = [
          userPrompt || 'Continue with selected context.',
          buildPreferencesText,
          compactContextPack,
        ].filter(Boolean).join('\n\n');

        addLog(`[Retry] Timeout on ${effectiveModel}. Retrying once with ${fallbackModel}.`, 'warn');
        startTransition(() => updatePlan({ buildStatus: 'generating', streamingCode: '' }));
        result = await runOnce(retryIntent, fallbackModel);
      }

      if (result.status === 'cancelled') {
        addLog('[Generation] Cancelled by user');
        setProgress(0);
        setCurrentPhase('');
        setPreviewLifecycle('idle');
        return;
      }

      if (result.status === 'failed') {
        const failMsg = result.error ?? result.message ?? '';
        commandBus.dispatch({ type: 'GENERATION_FAILED', error: failMsg });
        const isParseFailure = /parse/i.test(failMsg) || failMsg.includes('No parseable');
        if (isParseFailure) {
          addLog('LLM returned invalid format — no parseable artifact found', 'error');
        } else {
          addLog(`[GenerationPipeline] failed: ${failMsg}`, 'error');
        }
        startTransition(() => {
          chatPatchLast({
            role: 'assistant',
            type: 'text',
            content: isParseFailure
              ? '❌ **LLM returned invalid format.** The model response could not be parsed into code files. Please retry.'
              : result.message || `❌ Ошибка: ${failMsg}`,
            retryable: true,
          });
        });
        setProgress(100);
        setCurrentPhase('');
        setPreviewLifecycle('failed');
        return;
      }

      // Success — reset error counter
      consecutiveErrors.current = 0;
      commandBus.dispatch({ type: 'GENERATION_COMPLETE', result });

      // Hard guarantee: a blueprint message is present after generation response.
      // If onPlanReady did not fire for any reason, append a fallback plan card.
      if (!blueprintIdRef.current) {
        const planMessage = {
          id: createMessageId(),
          role: 'system',
          type: 'blueprint',
          content: (result as any)?.planSummary ?? 'Plan: Create todo app with Supabase',
          timestamp: Date.now(),
          raw: result,
          blueprintVisible: true,
        };
        blueprintIdRef.current = planMessage.id;
        dispatch({ type: 'APPEND', payload: planMessage });
      }

      // Progress bar — critical, applied immediately
      setProgress(100);

      // Derive the full file map from the canonical graph (pure computation, no side effects).
      // All files are stored in the source registry and shown in the code editor.
      // PreviewAdapter filtering happens at the materializer boundary (SandpackPreview),
      // not here — so the registry retains the complete canonical snapshot.
      //
      // Scaffold files (shadcn/ui, design tokens, blocks) are injected BEFORE generation
      // in GenerationPipeline.run() — they are already part of the graph. No post-merge needed.
      const finalFiles = (result.graph.files.length > 0
          ? projectGraphToFileMap(result.graph)
          : optimisticFiles)
        ?? (result.operations.length > 0 ? applyOperations(files, result.operations) : files);

      // ── Benchmark quality check ────────────────────────────────────────────
      const benchmark = BenchmarkService.check(finalFiles, (result as any)?.plan);
      addLog(`[Benchmark] Score: ${benchmark.score}/100`);
      benchmark.warnings.forEach(w => addLog(`[Benchmark] ⚠ ${w}`));
      if (!benchmark.passed) {
        benchmark.blockers.forEach(b => addLog(`[Benchmark] ❌ ${b}`));
        startTransition(() => {
          chatAppend({
            role: 'assistant',
            type: 'text',
            content: [
              '❌ Generation quality check failed:',
              ...benchmark.blockers.map(b => `• ${b}`),
              '',
              'Please try again or rephrase your prompt.',
            ].join('\n'),
          });
        });
        setCurrentPhase('');
        setPreviewLifecycle('failed');
        return;
      }

      // Non-critical UI updates — startTransition lets React apply them as one batch
      // without intermediate renders that could leave the iframe in an inconsistent state.
      startTransition(() => {
        setCurrentPhase('');
        // Plan card status is managed via onPhase('idle') → buildStatus:'building'
        // and markSnapshotStable → buildStatus:'ready'. No overwrite of messages[last] needed.

        if (Object.keys(finalFiles).length > 0) {
          // Atomic update: set raw FileMap AND promote ProjectGraph simultaneously.
          // filesRaw + projectGraph stay in sync; derived `files` will read from graph.
          // Do NOT call setFiles() here — that would clear projectGraph immediately.
          setFilesRaw(finalFiles);
          setProjectGraph(result.graph);
          addSnapshot(finalFiles, userPrompt);
          const first = result.operations.find(o => o.op !== 'delete');
          if (!optimisticFiles && first && 'name' in first) setActiveFile(first.name as string);

          // ── Generation report ────────────────────────────────────────────
          const isEditMode = Object.keys(filesSnapshot).filter(
            k => /\.(tsx?|jsx?)$/.test(k) && !k.startsWith('_'),
          ).length > 0;
          const reportableFiles = Object.keys(finalFiles).filter(k => !k.startsWith('_'));
          const touchedNames: string[] = [];
          for (const op of result.operations) {
            if (op.op !== 'rename' && !op.name.startsWith('_')) {
              touchedNames.push(op.name);
            }
          }
          const reportFilesCreated = isEditMode
            ? touchedNames.filter(f => !filesSnapshot[f])
            : reportableFiles;
          const reportFilesModified = isEditMode
            ? touchedNames.filter(f => !!filesSnapshot[f])
            : [];
          const reportContent = isEditMode
            ? `Updated ${touchedNames.length} file${touchedNames.length !== 1 ? 's' : ''}`
            : 'Built your app!';
          chatAppend({
            role: 'assistant',
            type: 'generation-report',
            content: reportContent,
            report: {
              mode: isEditMode ? 'EDIT' : 'NEW',
              theme: result.planTheme ?? 'default',
              filesCreated: reportFilesCreated,
              filesModified: reportFilesModified,
              pageCount: reportableFiles.filter(f => f.includes('pages/')).length,
              duration: Math.round((Date.now() - startMs) / 1000),
            },
          });
        }
      });

      // ── Preview lifecycle — committing or blocked ──────────────────────────
      // Files compiled; now waiting for preview-mounted(buildId) confirmation or iframe-error.
      const severity = result.qualitySummary?.severity;
      if (severity === 'blocking') {
        const blockers = result.qualitySummary?.blockers ?? [];
        const reason = blockers.join('; ') || 'Quality check failed';
        setPreviewLifecycle('blocked');
        setPreviewBlockedReason(reason);
        startTransition(() => {
          chatAppend({
            role: 'assistant',
            content: `⚠️ Files were generated, but preview is blocked.\n\n${blockers.map(b => `• ${b}`).join('\n')}`,
          });
        });
        addLog(`[Preview] Blocked: ${reason}`);
      } else {
        // Not blocking — wait for iframe handshake
        setPreviewLifecycle('committing');
        setPreviewBlockedReason(null);
      }

      const projectId = currentProjectId ?? crypto.randomUUID();

      console.log('[Project] Name debug:', {
        capturedAppName,
        planAppName: (result as any)?.planAppName,
        planName: (result as any)?.plan?.appName,
        userPrompt: userPrompt?.slice(0, 50),
      });
      const ideaTitle =
        effectiveSource !== 'chat'
          ? userPrompt.split(':')[0]?.trim()?.slice(0, 80)
          : '';
      const projectTitle =
        ideaTitle
        || capturedAppName
        || (result as any)?.planAppName
        || (result as any)?.plan?.appName
        || userPrompt?.slice(0, 40)
        || 'New Project';

      if (Object.keys(finalFiles).length > 0) {
        pendingProjectSaveRef.current = {
          projectId,
          projectTitle,
          finalFiles,
          chatHistoryToSave: [
            ...history,
            { role: 'assistant' as const, content: result.message || '✅ Готово' },
          ],
          userPrompt,
          source: effectiveSource,
          effectiveModel,
          generationStartMs,
          generationLogs: [...generationLogs],
          generationErrors: [...generationErrors],
          plan: ((result as any).plan ?? null) as ProjectPlan | null,
          planTheme: result.planTheme ?? 'dark-slate',
          reqUsage,
        };
        pendingSavePromptShownRef.current = false;
        addLog(`[Project] Save queued: waiting for preview (${projectTitle})`);
        setComposerContextItems([]);
      }

    } catch (err: any) {
      // User-initiated abort — soft stop, no error counter
      if (err?.name === 'AbortError') {
        addLog('⚡ Generation stopped by user');
        chatPatchLast(
          { role: 'assistant', content: '⚡ Остановлено.' },
          (msg) => msg.role === 'assistant' && (msg.content === '...' || msg.content === ''),
        );
        setCurrentPhase('');
        setPreviewLifecycle('idle');
        return;
      }

      // Network error — auto-retry once after 3 s
      const isNetworkError = err instanceof TypeError &&
        /fetch|network|ERR_|failed to fetch/i.test(err.message ?? '');

      if (isNetworkError && networkRetryCountRef.current < 1) {
        networkRetryCountRef.current += 1;
        addLog('Connection lost — retrying in 3 s…', 'error');
        chatPatchLast({
          role: 'assistant',
          type: 'text',
          content: '🔌 **Connection lost.** Retrying in 3 seconds…',
        });
        if (networkRetryTimeoutRef.current) clearTimeout(networkRetryTimeoutRef.current);
        networkRetryTimeoutRef.current = setTimeout(() => {
          networkRetryCountRef.current = 0;
          _sendRef.current();
        }, 3000);
        setCurrentPhase('');
        setPreviewLifecycle('failed');
        return;
      }

      // Real error — track for spam protection
      consecutiveErrors.current += 1;
      lastErrorTime.current = Date.now();
      networkRetryCountRef.current = 0;
      commandBus.dispatch({ type: 'GENERATION_FAILED', error: err?.message ?? 'Unknown error' });

      console.error('Studio Error:', err);
      addLog(`${isNetworkError ? 'Connection lost' : 'Error'} #${consecutiveErrors.current}: ${err?.message ?? 'Unknown error'}`, 'error');
      chatPatchLast({
        role: 'assistant',
        type: 'text',
        content: isNetworkError
          ? '🔌 **Connection lost.** Check your internet and retry.'
          : `❌ Ошибка: ${err?.message ?? 'Проверь API Key.'}`,
        retryable: true,
      });
      setCurrentPhase('');
      setPreviewLifecycle('failed');
    } finally {
      abortControllerRef.current = null;
      setIsGenerating(false);
      setTimeout(() => setProgress(0), 1200);
    }
  };
  const _sendRef = useRef(_sendImpl);
  _sendRef.current = _sendImpl;
  const handleSend = useCallback(() => _sendRef.current(), []);

  // ── launchWithPlan ────────────────────────────────────────────────────────
  // Unified UX: external idea sources enrich chat context; generation starts
  // only when user sends from the chat composer.
  const launchWithPlan = useCallback(async (
    plan: ProjectPlan,
    intent: string,
    source?: 'chat' | 'weekly-feed' | 'niche',
  ) => {
    const mappedSource: 'weekly-feed' | 'niche' | 'dashboard' =
      source === 'niche' ? 'niche' : source === 'weekly-feed' ? 'weekly-feed' : 'dashboard';
    addComposerContextFromPlan(plan, intent, mappedSource);
    addSystemMessage(
      `🧩 Context added: **${plan.appName || 'Imported idea'}**. Review and press Send to generate with this context pack.`,
    );
  }, [addComposerContextFromPlan, addSystemMessage]);

  const onSettings = useCallback(() => setShowSettings(true), []);


  const confirmPlan = useCallback((plan?: object) => {
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    // Immediately remove fallback blueprint cards so double-click is impossible.
    dispatch({ type: 'REMOVE_BY_TYPE', msgType: 'blueprint' });
    commandBus.dispatch({
      type: 'PLAN_APPROVED',
      payload: plan ?? pendingPlan?.plan ?? {},
    });
    if (currentProjectId) {
      setPreviewReady(false);
    }
    commandBus.dispatch({ type: 'ACCEPT_BLUEPRINT', planId: pendingPlan?.id ?? '' });
    // Reset guard after a tick so the same instance can be reused if generation is re-triggered.
    setTimeout(() => { confirmingRef.current = false; }, 500);
  }, [pendingPlan, currentProjectId]);

  const cancelPlan = useCallback(() => {
    commandBus.dispatch({ type: 'REJECT_BLUEPRINT', planId: pendingPlan?.id ?? '' });
  }, [pendingPlan]);

  // Alias exposed to LeftPanel's GenerationPlanCard (same action as confirmPlan).
  const onConfirmPlan = confirmPlan;

  // Dispatches REQUEST_PLAN_REVISION → commandBus subscriber re-runs generation.
  const onSubmitClarification = useCallback((text: string) => {
    commandBus.dispatch({ type: 'REQUEST_PLAN_REVISION', payload: text });
  }, []);

  // Opens clarification flow from plan cards that do not have inline textarea.
  const onClarifyPlan = useCallback((_messageId: string) => {
    setInput(prev => (prev && prev.trim().length > 0 ? prev : 'Уточнение по плану: '));
  }, [setInput]);

  const approveDiff = useCallback((selectedPaths: string[]) => {
    if (diffResolverRef.current) {
      diffResolverRef.current(selectedPaths);
      diffResolverRef.current = null;
    }
    setPendingDiff(null);
  }, []);

  const rejectDiff = useCallback(() => {
    if (diffResolverRef.current) {
      diffResolverRef.current(false);
      diffResolverRef.current = null;
    }
    setPendingDiff(null);
  }, []);

  // ── Edit admission callbacks ──────────────────────────────────────────────
  /** User clicked "Continue" or "I understand, proceed" — resolve the gate. */
  const confirmAdmission = useCallback(() => {
    if (admissionResolverRef.current) {
      admissionResolverRef.current(true);
      admissionResolverRef.current = null;
    }
    setPendingAdmission(null);
  }, []);

  /** User clicked "Cancel" — reject the gate; pipeline will rollback. */
  const denyAdmission = useCallback(() => {
    if (admissionResolverRef.current) {
      admissionResolverRef.current(false);
      admissionResolverRef.current = null;
    }
    setPendingAdmission(null);
    addLog('[AdmissionControl] Edit cancelled by user');
  }, [addLog]);

  // ── Playwright / e2e test hooks ───────────────────────────────────────────
  // Only active when VITE_PLAYWRIGHT_TEST=1 (baked at build time by Vite;
  // dead-code-eliminated in production builds).
  // window.__E2E_PREVIEW_TEST.mountPreview(files) — compile a deterministic
  //   real preview build without routing through the full chat generation stack.
  // window.__E2E_DIFF_TEST.setPendingDiff(diffs) — inject a fake diff review
  //   so narrow browser tests can drive DiffPreview without running SimpleGeneration.
  // window.__E2E_DIFF_TEST.stageCandidateFiles(files) — stage candidate file
  //   contents so DiffPreview resolves into visible editor state after apply.
  // window.__E2E_DIFF_RESULT — set to the resolved value after approveDiff/rejectDiff.
  useEffect(() => {
    if (import.meta.env.VITE_PLAYWRIGHT_TEST !== '1') return;
    (window as any).__E2E_PREVIEW_TEST = {
      mountPreview: async (previewFiles: FileMap) => {
        setFiles(previewFiles);
        setPreviewBlockedReason(null);
        setPreviewReady(false);
        setPreviewLifecycle('materializing');
        setPreviewUrl('');
        lastPreviewReadyRevisionRef.current = null;

        const buildId = crypto.randomUUID();
        const res = await fetch(`/api/preview/${buildId}/compile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: Object.fromEntries(
              Object.entries(previewFiles).map(([path, content]) => [normalizePath(path), content]),
            ),
          }),
        });

        let body: { success?: boolean; url?: string; error?: string } | null = null;
        try { body = await res.json(); } catch { /* ignore parse failures */ }

        if (!res.ok || body?.success === false) {
          throw new Error(body?.error ?? `Preview seed compile failed (HTTP ${res.status})`);
        }

        const nextUrl = body?.url ?? `/preview/${buildId}`;
        setPreviewUrl(nextUrl);
        await new Promise<void>((resolve, reject) => {
          const timeoutId = window.setTimeout(() => {
            window.removeEventListener('message', handleMessage);
            reject(new Error(`Preview seed timeout: no preview-mounted for ${buildId}`));
          }, 30_000);

          const handleMessage = (event: MessageEvent) => {
            if (event.data?.type !== 'preview-mounted') return;
            if (event.data?.buildId !== buildId) return;
            window.clearTimeout(timeoutId);
            window.removeEventListener('message', handleMessage);
            resolve();
          };

          window.addEventListener('message', handleMessage);
        });

        setPreviewReady(true);
        setPreviewLifecycle('preview-ready');
        return { buildId, url: nextUrl };
      },
    };
    (window as any).__E2E_DIFF_TEST = {
      setPendingDiff: (diffs: FileDiff[]) => {
        // Wire up a resolver that captures the result for test assertions
        diffResolverRef.current = (result: string[] | false) => {
          (window as any).__E2E_DIFF_RESULT = result;
        };
        setPendingDiff(diffs);
      },
      stageCandidateFiles: (candidateFiles: FileMap) => {
        const baseFiles = { ...files };
        const diffs = Object.entries(candidateFiles)
          .map(([path, nextContent]) => buildFileDiff(path, baseFiles[path] ?? '', nextContent))
          .filter(diff => diff.changedCount > 0);

        if (diffs.length === 0) {
          throw new Error('stageCandidateFiles requires at least one changed file');
        }

        (window as any).__E2E_DIFF_RESULT = undefined;

        // Create the promote promise before any user interaction so awaitPromote()
        // is callable as soon as stageCandidateFiles returns.  The promise settles
        // when revisionManager.promote() completes on approve, or immediately with
        // { success: false } on reject or compile failure.
        const promoteHolder: { resolve: ((r: { success: boolean }) => void) | null } =
          { resolve: null };
        (window as any).__E2E_DIFF_PROMOTE_PROMISE = new Promise<{ success: boolean }>(
          r => { promoteHolder.resolve = r; },
        );

        diffResolverRef.current = (result: string[] | false) => {
          (window as any).__E2E_DIFF_RESULT = result;
          if (result === false) {
            // Reject-all: no compile needed — settle the promise so tests don't hang.
            promoteHolder.resolve?.({ success: false });
            return;
          }
          const selectedPaths = new Set(result);
          const nextFiles = { ...baseFiles };
          for (const [path, nextContent] of Object.entries(candidateFiles)) {
            if (selectedPaths.has(path)) nextFiles[path] = nextContent;
          }
          setFiles(nextFiles);

          // Trigger the real RevisionManager candidate → compile → promote cycle so
          // the preview iframe is reloaded with the partially-accepted build.
          // This is the primary observable proof: after promote the live iframe
          // shows the accepted files, not just the in-memory editor state.
          revisionManager.createCandidate().then(revId => {
            const writes = Object.entries(nextFiles).map(
              ([p, c]) => revisionManager.writeCandidateFile(revId, p, c),
            );
            return Promise.all(writes)
              .then(() => revisionManager.compileCandidate(revId))
              .then(async compileResult => {
                if (compileResult.success) {
                  try {
                    await revisionManager.promote(revId);
                    promoteHolder.resolve?.({ success: true });
                  } catch {
                    // PROMOTE_BLOCKED (white-screen gate) or similar
                    promoteHolder.resolve?.({ success: false });
                  }
                } else {
                  promoteHolder.resolve?.({ success: false });
                }
              });
          }).catch(() => promoteHolder.resolve?.({ success: false }));
        };
        setPendingDiff(diffs);
      },
      /**
       * Returns a Promise that resolves with { success: boolean } once the
       * compile+promote cycle triggered by the last stageCandidateFiles approve
       * completes.  On reject or compile failure resolves with { success: false }.
       *
       * page.evaluate(() => window.__E2E_DIFF_TEST.awaitPromote()) in Playwright
       * automatically awaits the returned Promise and surfaces the resolved value.
       */
      awaitPromote: (): Promise<{ success: boolean }> =>
        (window as any).__E2E_DIFF_PROMOTE_PROMISE ?? Promise.resolve({ success: false }),
    };
    return () => {
      delete (window as any).__E2E_PREVIEW_TEST;
      delete (window as any).__E2E_DIFF_TEST;
    };
  }, [files, setFiles]);

  // Resolve the waitForConfirmation promise AFTER React has committed the
  // pendingPlan cleanup.  pendingPlan === null is the commit signal.
  useEffect(() => {
    if (pendingPlan !== null) return;
    if (planDecisionRef.current === null) return;
    if (!planResolverRef.current) return;

    const confirmed = planDecisionRef.current;
    const resolve   = planResolverRef.current;
    planDecisionRef.current  = null;
    planResolverRef.current  = null;

    resolve(confirmed);
  }, [pendingPlan]);

  // Guard: if the component unmounts while waiting for confirmation, cancel the
  // dangling promise so the generation pipeline doesn't hang.
  useEffect(() => {
    return () => {
      if (planResolverRef.current) {
        planResolverRef.current(false);
        planResolverRef.current = null;
        planDecisionRef.current = null;
      }
      if (diffResolverRef.current) {
        diffResolverRef.current(false);
        diffResolverRef.current = null;
      }
      if (admissionResolverRef.current) {
        admissionResolverRef.current(false);
        admissionResolverRef.current = null;
      }
    };
  }, []);

  // ── useStudioCommands — CommandBus → React state bridge ─────────────────
  useEffect(() => {
    const unsubs = [
      commandBus.subscribe('ACCEPT_BLUEPRINT', () => {
        planDecisionRef.current = true;
        setPendingPlan(null);
        // 1. Hide blueprint card — DOM node stays mounted, no insertBefore crash.
        if (blueprintIdRef.current) {
          dispatch({ type: 'SET_BLUEPRINT_VISIBLE', id: blueprintIdRef.current, visible: false });
        }
        // 2. Append "Building…" after the (now hidden) blueprint — order guaranteed.
        dispatch({
          type: 'APPEND',
          payload: { role: 'assistant', type: 'text', content: '⚙️ Building…' },
        });
      }),
      commandBus.subscribe('REJECT_BLUEPRINT', () => {
        planDecisionRef.current = false;
        setPendingPlan(null);
        // Hide instead of remove — preserves fiber identity, avoids DOM conflicts.
        if (blueprintIdRef.current) {
          dispatch({ type: 'SET_BLUEPRINT_VISIBLE', id: blueprintIdRef.current, visible: false });
        }
        blueprintIdRef.current = null;
      }),
      commandBus.subscribe('REQUEST_PLAN_REVISION', (cmd) => {
        const text = (cmd as Extract<typeof cmd, { type: 'REQUEST_PLAN_REVISION' }>).payload;
        // Clear the pending blueprint so its card hides, then re-run generation
        // with the revision text as the new prompt (bypasses textarea state).
        planDecisionRef.current = false;
        setPendingPlan(null);
        if (blueprintIdRef.current) {
          dispatch({ type: 'SET_BLUEPRINT_VISIBLE', id: blueprintIdRef.current, visible: false });
        }
        blueprintIdRef.current = null;
        _sendRef.current(text);
      }),
      commandBus.subscribe('PREVIEW_READY', (cmd) => {
        const data = (cmd as Extract<typeof cmd, { type: 'PREVIEW_READY' }>).payload;
        if (data?.url) {
          setPreviewUrl(data.url);
          setPreviewReady(true);
          if (import.meta.env.VITE_PLAYWRIGHT_TEST === '1') {
            (window as any).__E2E_PREVIEW_URL__ = data.url;
          }
          // Extract buildId from URL and notify SandpackPreview
          const buildId = data.url.split('/preview/')[1]?.split('?')[0] ?? '';
          window.dispatchEvent(new CustomEvent('preview-mounted', {
            detail: { buildId, previewUrl: data.url },
          }));
        }
      }),
      // State machine — mirror every command into read-only machineState
      commandBus.subscribeAll((cmd) => {
        setMachineState(prev => transition(prev, cmd));
      }),
    ];
    return () => unsubs.forEach(fn => fn());
  }, [chatRemoveByType]);

  const studioMemo = useMemo(() => ({
    isGenerating,
    device, setDevice, theme, setTheme,
    progress, currentPhase, scrollRef,
    apiKey, setApiKey,
    files, setFiles, activeFile, setActiveFile,
    /** Authoritative ProjectGraph from the last completed generation. Null before first generation. */
    projectGraph,
    projects, currentProjectId, currentProject, snapshots,
    fullContextMode, setFullContextMode,
    selectedModel, setSelectedModel,
    // Canonical snapshot-layer names
    snapshotIndex, snapshotCount, lastStableSnapshotIndex,
    // Deprecated aliases (backward compat for existing consumers)
    currentVersion, totalVersions, lastStableVersion,
    currentSnapshotId, historyIndex,
    logs, addLog, clearLogs, downloadLogs,
    attachments, addAttachment, removeAttachment, clearAttachments,
    composerContextItems, addComposerContextFromPlan, removeComposerContextItem, clearComposerContextItems,
    handleSend,
    onSend: handleSend,
    launchWithPlan,
    stopGeneration,
    onStop: stopGeneration,
    publishProject,
    createNewProject,
    onNewProject: createNewProject,
    createProject,
    loadProject,
    onLoadProject: loadProject,
    switchProject,
    deleteProject,
    onDeleteProject: deleteProject,
    refreshProjects,
    restoreSnapshot,
    onRestoreSnapshot: restoreSnapshot,
    markSnapshotStable,
    rollbackToStable,
    clearSnapshots,
    stableSnapshotId,
    undo,
    onUndo: undo,
    redo,
    onRedo: redo,
    canUndo,
    canRedo,
    showSettings, setShowSettings,
    onSettings,
    currentTheme: theme,
    // auto-routing
    autoRoute, setAutoRoute,
    // generation mode
    generationMode, setGenerationMode,
    generationSource, setGenerationSource,
    designClassification,
    classifyAndStore,
    // language
    appLanguage, setAppLanguage,
    // billing
    sessionCost, sessionTokens,
    projectCost, projectTokens,
    // figma identity
    figmaAccounts, addFigmaAccount, removeFigmaAccount, refreshFigmaAccounts,
    figmaLink, setFigmaLink,
    figmaAccessResult, validateFigmaLink, figmaValidating,
    // figma design DNA
    currentProjectTheme, syncProgress, syncFigmaUrl, syncSource, startFigmaSync,
    targetMarket, setTargetMarket, auditStrictness, setAuditStrictness,
    // chat injection
    addSystemMessage,
    // figma project hub
    figmaProjects, activeFigmaProjectId,
    saveFigmaProject, loadFigmaProject, deleteFigmaProject,
    markFigmaProjectSynced, clearFigmaSync,
    // background engine (isolated from chat)
    engineApiKey,  setEngineApiKey,
    engineModelId, setEngineModelId,
    engineStatus,  engineResult,
    // 5-agent system
    agentConfigs, setAgentConfig,
    // fusion protocol — component registry
    componentRegistry,
    // auto-fixer
    isAutoFixing,
    // preview lifecycle — honest completion handshake
    previewLifecycle,
    previewBlockedReason,
    previewUrl,
    previewReady,
    // blueprint confirmation
    pendingPlan, confirmPlan, cancelPlan,
    // diff review
    pendingDiff, approveDiff, rejectDiff,
    // edit admission
    pendingAdmission, confirmAdmission, denyAdmission,
    // state machine (read-only)
    studioPhase: machineState.phase,
    studioError: machineState.error ?? null,
  }), [
    // state — re-memoize only when actual data changes
    // messages/input intentionally excluded — returned directly below
    files, activeFile, theme, apiKey, selectedModel,
    isGenerating, device, progress, currentPhase, fullContextMode, autoRoute, generationMode, previewLifecycle, previewBlockedReason, previewUrl, previewReady, machineState,
    designClassification,
    projectGraph,
    snapshots, historyIndex, currentProjectId, currentProject, currentSnapshotId, stableSnapshotId,
    projects, showSettings, logs, attachments, composerContextItems,
    sessionCost, sessionTokens, projectCost, projectTokens,
    appLanguage,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(agentConfigs),
    syncProgress, syncFigmaUrl, syncSource,
    figmaAccounts, figmaLink, figmaAccessResult, figmaValidating,
    figmaProjects, activeFigmaProjectId, currentProjectTheme,
    targetMarket, auditStrictness,
    engineApiKey, engineModelId, engineStatus, engineResult,
    componentRegistry,
    pendingPlan, pendingDiff, pendingAdmission,
    // stable callbacks (useCallback — listed for ESLint correctness, never change)
    setInput, setDevice, setTheme, setApiKey, setSelectedModel, setFullContextMode, setAutoRoute, setGenerationMode,
    setActiveFile, addSnapshot, restoreSnapshot, undo, redo, clearSnapshots, markSnapshotStable, rollbackToStable,
    addLog, clearLogs, downloadLogs,
    addAttachment, removeAttachment, clearAttachments,
    addComposerContextFromPlan, removeComposerContextItem, clearComposerContextItems,
    createNewProject, createProject, switchProject, loadProject, deleteProject, refreshProjects, stopGeneration,
    handleSend, launchWithPlan, publishProject, classifyAndStore,
    onSettings, setShowSettings,
    addFigmaAccount, removeFigmaAccount, refreshFigmaAccounts, validateFigmaLink,
    setEngineApiKey, setEngineModelId, setAgentConfig,
    startFigmaSync, addSystemMessage,
    saveFigmaProject, loadFigmaProject, deleteFigmaProject, markFigmaProjectSynced, clearFigmaSync,
    setAppLanguage, setFigmaLink, setTargetMarket, setAuditStrictness,
    confirmPlan, cancelPlan,
    onConfirmPlan, onClarifyPlan, onSubmitClarification,
    approveDiff, rejectDiff,
    confirmAdmission, denyAdmission,
  ]);

  // messages / input / setInput returned directly (not memoized) so their
  // high-frequency updates (every token, every keypress) do NOT invalidate
  // the stable studioMemo and retrigger deep re-renders of the full tree.
  return { ...studioMemo, messages, input, setInput };
};
