/**
 * useStudio.ts — v3 AGENTIC (Restoration Enhanced)
 */

import { useState, useEffect, useRef, useCallback, useMemo, startTransition, useReducer } from 'react';
import {
  chatReducer,
  normalizeMessages,
  normalizeMessage,
  type ChatMessage,
} from '../types/chat';
import { supabase } from '../lib/supabase';
import {
  Orchestrator,  // kept for applyOperations / resetSession — NOT for run() or planTask()
  applyOperations,
  type FileOperation,
  type PhaseEvent,
  type UsageData,
} from '../services/Orchestrator';
// All chat-to-generation requests are routed through GenerationPipeline.run().
// import { GenerationPipeline } from '../services/GenerationPipeline';
// import { MinimalPipeline as GenerationPipeline } from '../services/MinimalPipeline';
import { SimpleGeneration as GenerationPipeline } from '../services/SimpleGeneration';
import type { ProjectPlan } from '../services/SimpleGeneration';
import { ResourceManager } from '../services/ai/resourceManager';
import { CollabService } from '../services/CollabService';
import { IdentityService } from '../services/IdentityService';
import type { FigmaAccount } from '../services/IdentityService';
import { FigmaClient } from '../services/FigmaClient';
import type { AccessResult } from '../services/FigmaClient';
import { ConfigService } from '../services/ConfigService';
import type { AgentConfig } from '../services/ConfigService';
import { FigmaService } from '../services/FigmaService';
import type { ProjectTheme, SyncProgress, TargetMarket, AuditStrictness } from '../services/FigmaService';
import { ProjectStore } from '../services/ProjectStore';
import type { FigmaProject } from '../services/ProjectStore';
import { useAuth } from '../contexts/AuthContext';
import { AIEngineService } from '../services/AIEngineService';
import type { EngineStatus, ValidationResult } from '../services/AIEngineService';
import { ScannerService } from '../services/ScannerService';
import type { ComponentRegistry } from '../services/ScannerService';
import { ProjectStorage } from '../services/ProjectStorage';
import type { ProjectMeta, StoredProject, ProjectRevision } from '../services/ProjectStorage';
import { ProjectManager } from '../services/ProjectManager';
import type { Project } from '../services/ProjectManager';
import { ProjectRepository } from '../services/ProjectRepository';
import {
  projectGraphToFileMap,
  fileMapToProjectGraph,
  type ProjectGraph,
  type PreviewLifecycleStage,
} from '../shared/projectModel';

export type DeviceType = 'mobile' | 'tablet' | 'web';
export type FileMap     = Record<string, string>;

export interface Snapshot {
  id:        string;
  files:     FileMap;
  label:     string;
  createdAt: string;
  version:   number;
  /** candidate = written by AI turn, not yet confirmed by iframe-ready.
   *  stable    = iframe mounted without errors within the grace window.
   *  Existing snapshots without status are treated as stable (legacy compat). */
  status?:   'candidate' | 'stable';
}

export interface Attachment {
  id:           string;
  name:         string;
  type:         'image' | 'text' | 'code' | 'pdf';
  data:         string;           // base64 data URI for images/PDFs, raw text for others
  mimeType:     string;
  textContent?: string;           // extracted text for PDFs
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

// ── hook ─────────────────────────────────────────────────────────────────────

export const useStudio = () => {
  const { user: authUser } = useAuth();
  // ── chat ─────────────────────────────────────────────────────────────────
  const [messages, dispatch] = useReducer(
    chatReducer,
    [],
    () => normalizeMessages(JSON.parse(localStorage.getItem('CHAT_HISTORY') || '[]')),
  );

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

  // Original user intent saved when we pause for clarification questions.
  // On the next send, it gets merged with the user's answer before generation.
  const [pendingClarification, setPendingClarification] = useState<string | null>(null);

  // Blueprint confirmation — set when Architect plan is ready, cleared on confirm/cancel.
  // resolver lives in a ref (not state) so resolve() fires only after React commits the cleanup.
  const [pendingPlan, setPendingPlan] = useState<{
    plan:          object;
    blueprintText: string;
    technicalBlueprint?: object | null;
    appName:       string;
    theme:         string;
    pages:         string[];
  } | null>(null);
  const planResolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const planDecisionRef = useRef<boolean | null>(null);

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
    // 2. Walk backwards to find the last snapshot with status === 'stable'
    //    (or no status — treated as stable for legacy compatibility)
    for (let i = snaps.length - 1; i >= 0; i--) {
      if (!snaps[i].status || snaps[i].status === 'stable') {
        return normalizeToFileMap(snaps[i].files);
      }
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
      if (!s[i].status || s[i].status === 'stable') return i;
    }
    return s.length - 1;
  });

  const addSnapshot = useCallback((newFiles: FileMap, label: string) => {
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
    };
    const updated = [...base, snap];
    localStorage.setItem('SNAPSHOTS', JSON.stringify(updated));
    localStorage.setItem('CURRENT_SNAPSHOT_ID', snap.id);
    setSnapshots(updated);
    setCurrentSnapshotId(snap.id);
    setHistoryIndex(updated.length - 1);
  }, [historyIndex, snapshots]);

  const restoreSnapshot = useCallback((snap: Snapshot) => {
    const restored = normalizeToFileMap(snap.files);
    setFiles(restored);
    setCurrentSnapshotId(snap.id);
    localStorage.setItem('CURRENT_SNAPSHOT_ID', snap.id);
    const idx = snapshots.findIndex(s => s.id === snap.id);
    if (idx !== -1) setHistoryIndex(idx);
    if (!restored[activeFile]) setActiveFile(Object.keys(restored)[0] ?? DEFAULT_FILENAME);
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

  /**
   * markSnapshotStable — called by the preview when iframe-ready fires without
   * errors. Promotes `snapshotId` from candidate → stable and writes
   * STABLE_SNAPSHOT_ID to localStorage so the next restart opens this revision.
   *
   * Invariant: a broken candidate (iframe-error instead of iframe-ready) is
   * never passed here, so stable is never replaced by broken code.
   */
  const markSnapshotStable = useCallback((snapshotId: string) => {
    setSnapshots(prev => {
      const updated = prev.map(s =>
        s.id === snapshotId ? { ...s, status: 'stable' as const } : s
      );
      localStorage.setItem('SNAPSHOTS', JSON.stringify(updated));
      return updated;
    });
    setStableSnapshotId(snapshotId);
    localStorage.setItem('STABLE_SNAPSHOT_ID', snapshotId);
    // Mark the active generation-plan card as ready (iframe loaded without errors)
    if (currentPlanMsgIdRef.current) {
      chatUpdate(currentPlanMsgIdRef.current, { buildStatus: 'ready' });
    }
    // Preview lifecycle — iframe loaded successfully
    setPreviewLifecycle('preview-ready');
  }, []);

  const currentVersion  = historyIndex + 1 || snapshots.length;
  const totalVersions   = snapshots.length;

  // ── logs ──────────────────────────────────────────────────────────────────
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [...prev.slice(-199), `[${time}] ${msg}`]);
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  const downloadLogs = useCallback(() => {
    if (logs.length === 0) return;
    const content = `AIC-RG Studio — Event Log\n${'─'.repeat(40)}\n${logs.join('\n')}`;
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
  const [device,          setDevice]          = useState<DeviceType>('web');
  const [theme,           setThemeState]      = useState<'dark' | 'medium' | 'light'>(() => ConfigService.getTheme());
  const [progress,        setProgress]        = useState(0);
  const [apiKey,          setApiKeyState]     = useState(() => ConfigService.getApiKey());
  const [selectedModel,   setModelState]      = useState(() => ConfigService.resolveModel('chat'));
  const [fullContextMode, setFullCtxState]    = useState(() => ConfigService.getFullContext());
  const [currentPhase,    setCurrentPhase]    = useState<string>('');
  const [autoRoute,       setAutoRouteRaw]    = useState<boolean>(() => ConfigService.getAutoRoute());
  const [generationMode,  setGenerationMode]  = useState<'landing' | 'app' | 'superapp'>('app');
  const [generationSource, setGenerationSource] = useState<'chat' | 'weekly-feed' | 'niche'>('chat');


  // ── Immediate-write setters (write to localStorage synchronously) ──────────

  const setApiKey = useCallback((v: string) => {
    ConfigService.setApiKey(v);
    setApiKeyState(v);
  }, []);

  const setSelectedModel = useCallback((v: string) => {
    setModelState(v);
  }, []);

  const setTheme = useCallback((v: 'dark' | 'medium' | 'light') => {
    ConfigService.setTheme(v);
    setThemeState(v);
  }, []);

  const setFullContextMode = useCallback((v: boolean) => {
    ConfigService.setFullContext(v);
    setFullCtxState(v);
  }, []);

  const setAutoRoute = useCallback((v: boolean) => {
    ConfigService.setAutoRoute(v);
    setAutoRouteRaw(v);
  }, []);

  // ── Figma identity ─────────────────────────────────────────────────────────
  const [figmaAccounts,     setFigmaAccounts]     = useState<FigmaAccount[]>(() => IdentityService.getAll());
  const [figmaLink,         setFigmaLink]         = useState('');
  const [figmaAccessResult, setFigmaAccessResult] = useState<AccessResult | null>(null);
  const [figmaValidating,   setFigmaValidating]   = useState(false);

  const addFigmaAccount = useCallback(async (draft: Omit<FigmaAccount, 'id' | 'addedAt'>) => {
    const userInfo = await FigmaClient.getUserInfo(draft.token);
    const enriched = userInfo ? { ...draft, userInfo } : draft;
    IdentityService.add(enriched);
    setFigmaAccounts(IdentityService.getAll());
  }, []);

  const removeFigmaAccount = useCallback((id: string) => {
    IdentityService.remove(id);
    setFigmaAccounts(IdentityService.getAll());
  }, []);

  /** Re-read figmaAccounts from IdentityService (call after OAuth completes). */
  const refreshFigmaAccounts = useCallback(() => {
    setFigmaAccounts(IdentityService.getAll());
  }, []);

  const validateFigmaLink = useCallback(async (url: string) => {
    setFigmaValidating(true);
    const result = await FigmaClient.validateAccess(url);
    setFigmaAccessResult(result);
    setFigmaValidating(false);
  }, []);

  // ── Background Engine config (ISOLATED from chat) ─────────────────────────
  // These are read from ConfigService directly at validation time — changing
  // the chat model never affects the engine model.
  const [engineApiKey,  setEngineApiKeyState]  = useState(() => ConfigService.getEngineApiKey());
  const [engineModelId, setEngineModelIdState] = useState(() => ConfigService.getEngineModel());
  const [engineStatus,  setEngineStatus]       = useState<EngineStatus>('idle');
  const [engineResult,  setEngineResult]       = useState<ValidationResult | null>(null);

  // ── 5-agent system ────────────────────────────────────────────────────────
  const [agentConfigs, setAgentConfigsState] = useState(() => ({
    primary: ConfigService.getAgentConfig('agent_primary'),
    fix:     ConfigService.getAgentConfig('agent_fix'),
    spec:    ConfigService.getAgentConfig('agent_spec'),
    build:   ConfigService.getAgentConfig('agent_build'),
    qa:      ConfigService.getAgentConfig('agent_qa'),
  }));

  // ── ScannerService (Fusion Protocol) ───────────────────────────────────────
  const [componentRegistry, setComponentRegistry] = useState<ComponentRegistry | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setEngineApiKey = useCallback((v: string) => {
    ConfigService.setEngineApiKey(v);
    setEngineApiKeyState(v);
  }, []);

  const setEngineModelId = useCallback((v: string) => {
    ConfigService.setEngineModel(v);
    setEngineModelIdState(v);
  }, []);

  const setAgentConfig = useCallback((agentId: string, config: AgentConfig) => {
    ConfigService.setAgentConfig(agentId, config);
    const key = agentId.replace('agent_', '') as keyof typeof agentConfigs;
    setAgentConfigsState(prev => ({ ...prev, [key]: config }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Figma Design DNA sync ─────────────────────────────────────────────────
  const [currentProjectTheme, setCurrentProjectTheme] = useState<ProjectTheme | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({ step: 'idle', message: '', pct: 0 });
  const [syncFigmaUrl, setSyncFigmaUrl] = useState<string | undefined>();
  const [syncSource,   setSyncSource]   = useState<'proxy' | 'direct' | null>(null);
  const [targetMarket,    setTargetMarket]    = useState<TargetMarket>('USA');
  const [auditStrictness, setAuditStrictness] = useState<AuditStrictness>('normal');

  const startFigmaSync = useCallback(async (fileUrl: string) => {
    setSyncFigmaUrl(undefined);
    const result = await FigmaService.startSyncProcess(fileUrl, setSyncProgress, {
      targetMarket,
      auditStrictness,
    });
    if (result.ok) {
      setCurrentProjectTheme(result.theme);
      setSyncFigmaUrl(result.figmaUrl);
      setSyncSource(result.syncSource ?? 'direct');

      // ── Silent background engine validation ─────────────────────────────
      // Runs AFTER sync completes, fully non-blocking (no await).
      // Uses ConfigService.getEngineApiKey() / getEngineModel() directly —
      // NEVER touches selectedModel or apiKey from chat state.
      const nodes = result.theme.visualNodes ?? [];
      if (nodes.length > 0 && !AIEngineService.isBusy) {
        setEngineStatus('validating');
        AIEngineService.validate(
          nodes,
          result.theme,
          (status, msg) => {
            setEngineStatus(status);
            addLog(`[Engine] ${msg}`);
          },
        ).then(vr => {
          setEngineResult(vr);
          setEngineStatus(vr.ok ? 'done' : 'error');
          // If engine pruned noise nodes, silently update the visual tree
          if (vr.ok && vr.cleanedNodes.length < nodes.length) {
            const removed = nodes.length - vr.cleanedNodes.length;
            setCurrentProjectTheme(prev =>
              prev ? { ...prev, visualNodes: vr.cleanedNodes } : prev,
            );
            addLog(`[Engine] ✓ Pruned ${removed} noise node(s) from MirrorCanvas`);
          }
        }).catch(err => {
          setEngineStatus('error');
          addLog(`[Engine] ✗ ${err?.message ?? 'Unknown error'}`);
        });
      }
    }
  }, [targetMarket, auditStrictness, addLog]);

  const addSystemMessage = useCallback((content: string) => {
    chatAppend({ role: 'assistant', content });
  }, [chatAppend]);

  // ── Figma Project Hub ──────────────────────────────────────────────────────
  const [figmaProjects,        setFigmaProjects]        = useState<FigmaProject[]>(() => ProjectStore.getAll());
  const [activeFigmaProjectId, setActiveFigmaProjectId] = useState<string | null>(null);

  /** Upsert a project from the current sync state. Returns the new id. */
  const saveFigmaProject = useCallback((projectName?: string): string | null => {
    if (!currentProjectTheme) return null;
    const name = projectName?.trim() || 'Untitled Project';
    // Re-use existing entry for same file key (update instead of duplicate)
    const existing = figmaProjects.find(p => p.fileKey === currentProjectTheme.figmaFileKey);
    const id       = existing?.id ?? crypto.randomUUID();
    const project: FigmaProject = {
      id,
      name,
      fileKey:     currentProjectTheme.figmaFileKey,
      figmaUrl:    syncFigmaUrl,
      theme:       currentProjectTheme,
      status:      'imported',
      createdAt:   existing?.createdAt ?? Date.now(),
      updatedAt:   Date.now(),
      accentColor: currentProjectTheme.colors[0]?.hex,
    };
    ProjectStore.save(project);
    setFigmaProjects(ProjectStore.getAll());
    setActiveFigmaProjectId(id);
    return id;
  }, [currentProjectTheme, syncFigmaUrl, figmaProjects]);

  /** Restore a previously saved project (no network request). */
  const loadFigmaProject = useCallback((project: FigmaProject) => {
    setCurrentProjectTheme(project.theme);
    if (project.figmaUrl) {
      setSyncFigmaUrl(project.figmaUrl);
      setFigmaLink(project.figmaUrl);
    }
    setFigmaAccessResult(null);
    setActiveFigmaProjectId(project.id);
    setSyncProgress({ step: 'done', message: 'Loaded from Project Hub', pct: 100 });
    const updated: FigmaProject = { ...project, status: 'active', updatedAt: Date.now() };
    ProjectStore.save(updated);
    setFigmaProjects(ProjectStore.getAll());
  }, []);

  const deleteFigmaProject = useCallback((id: string) => {
    ProjectStore.delete(id);
    setFigmaProjects(ProjectStore.getAll());
    if (activeFigmaProjectId === id) setActiveFigmaProjectId(null);
  }, [activeFigmaProjectId]);

  const markFigmaProjectSynced = useCallback((id: string) => {
    const p = ProjectStore.get(id);
    if (!p) return;
    ProjectStore.save({ ...p, status: 'synced', updatedAt: Date.now() });
    setFigmaProjects(ProjectStore.getAll());
  }, []);

  /** Clear all Figma sync state for a fresh import. */
  const clearFigmaSync = useCallback(() => {
    setFigmaLink('');
    setFigmaAccessResult(null);
    setCurrentProjectTheme(null);
    setSyncFigmaUrl(undefined);
    setSyncProgress({ step: 'idle', message: '', pct: 0 });
    setActiveFigmaProjectId(null);
  }, []);

  const [appLanguage, setAppLanguageRaw] = useState<string>(() => ConfigService.getLanguage());

  const setAppLanguage = useCallback((lang: string) => {
    ConfigService.setLanguage(lang);
    setAppLanguageRaw(lang);
  }, []);

  const scrollRef          = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const consecutiveErrors  = useRef(0);
  const lastErrorTime      = useRef(0);
  // Tracks the active generation-plan message ID so markSnapshotStable can set buildStatus:'ready'
  const currentPlanMsgIdRef = useRef<string | null>(null);

  // ── Preview lifecycle — honest completion handshake ───────────────────────
  const [previewLifecycle, setPreviewLifecycle] = useState<PreviewLifecycleStage>('idle');

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

  // ── persist (data only — config keys are written immediately by their setters) ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    localStorage.setItem('CHAT_HISTORY',  JSON.stringify(messages));
    // Persist the derived `files` value — includes graph-derived files when graph is set.
    localStorage.setItem('LAST_FILES',    JSON.stringify(files));
    localStorage.setItem('LAST_CODE',     getPrimaryCode(files));
    if (currentProjectId) localStorage.setItem('CURRENT_PROJECT_ID', currentProjectId);
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
    if (e.origin !== 'http://localhost:3100') return;
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
          setPreviewLifecycle('committing'); // waiting for HMR reload
          addLog('[AutoFix] Fix applied — waiting for Vite HMR...');
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

  // ── project actions ───────────────────────────────────────────────────────
  const createNewProject = useCallback(() => {
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
    chatReset();
    setFiles({});
    setCurrentProjectId(null);
    setProjectCost(0);
    setProjectTokens(0);
    clearSnapshots();
    clearLogs();
    clearAttachments();
    setPreviewLifecycle('idle');
    localStorage.removeItem('CHAT_HISTORY');
    localStorage.removeItem('LAST_FILES');
    localStorage.removeItem('LAST_CODE');
    Orchestrator.resetSession();
    // Clear preview-app/src/ so next generation starts fresh
    fetch('/__clear_preview', { method: 'POST' }).catch(() => {});
  }, [currentProjectId, clearSnapshots, clearLogs, clearAttachments, addLog]);

  const loadProject = useCallback(async (project: { id: string }) => {
    addLog(`[Project] Loading ${project.id.slice(0, 8)}…`);
    try {
      // Supabase first, localStorage fallback
      const full = await ProjectRepository.getProject(project.id);
      if (!full) {
        addLog('[Project] Not found in Supabase or localStorage');
        return;
      }

      // 1. Write files to preview-app first — await so HMR triggers before React state update
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

      // 2. Now update React state — preview-app already has the files on disk.
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
  }, [addLog]);

  const refreshProjects = useCallback(() => {
    setProjects(ProjectStorage.listProjects());
  }, []);

  /** Load an existing project into the active workspace (alias for loadProject with PM sync). */
  const switchProject = useCallback((project: { id: string }) => {
    ProjectManager.setCurrent(project.id);
    const full = ProjectStorage.getProject(project.id);
    if (!full) return;
    ProjectStorage.loadToPreview(full).catch(() => {});
    // Restore saved chat history; start with empty messages if none saved.
    const history = full.chatHistory as any[];
    chatLoadHistory(history);
    const loaded = normalizeToFileMap(full.files);
    setFiles(loaded);
    setCurrentProjectId(full.id);
    const b = loadBilling(full.id);
    setProjectCost(b.cost);
    setProjectTokens(b.tokens);
    clearSnapshots();
  }, [clearSnapshots]);  // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── handleSend ────────────────────────────────────────────────────────────
  const _sendImpl = async () => {
    if (!input.trim() || isGenerating) return;
    setGenerationSource('chat');
    const startMs = Date.now();

    // ── Effective API key: use provider key for primary agent, global key as fallback
    const effectiveApiKey = ConfigService.getKeyForAgent('primary') || apiKey;

    if (!effectiveApiKey) {
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

    fixAttemptsRef.current = 0;  // reset auto-fix counter for this generation
    setIsGenerating(true);
    setProgress(5);
    setCurrentPhase('think');
    setPreviewLifecycle('generating');
    addLog('─'.repeat(40));

    // (planning is handled inside GenerationPipeline via onPlan callback)

    const userPrompt = input;
    const generationStartMs = Date.now();
    const generationLogs: string[] = [];
    const generationErrors: string[] = [];

    let messageContent: any = userPrompt;
    const imageAttachments = attachments.filter(a => a.type === 'image');
    if (imageAttachments.length > 0) {
      messageContent = [
        ...imageAttachments.map(a => ({
          type: 'image_url',
          image_url: { url: a.data },
        })),
        { type: 'text', text: userPrompt },
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

    // Generation-plan card replaces the old '...' placeholder.
    // Helpers defined here close over planMsgId so they're stable for the run() scope.
    const planMsgId = `plan-${Date.now()}`;
    currentPlanMsgIdRef.current = planMsgId;
    dispatch({ type: 'RESET', payload: [...history, {
      role: 'assistant' as const,
      type: 'generation-plan',
      id: planMsgId,
      timestamp: Date.now(),
      appName: '',
      pages: [] as string[],
      steps: [
        { id: 'think',     label: 'Analyzing your idea',    status: 'active'  },
        { id: 'architect', label: 'Designing architecture', status: 'pending' },
        { id: 'code',      label: 'Writing code',           status: 'pending' },
        { id: 'theme',     label: 'Applying theme',         status: 'pending' },
        { id: 'save',      label: 'Saving project',         status: 'pending' },
      ],
      progress: 0,
      buildStatus: 'generating' as const,
      streamingCode: '',
    }] });
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
      const decision = ResourceManager.selectModel(userPrompt, contextFiles);
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

      // ── Clarifier step ─────────────────────────────────────────────────────
      // Only runs on new-app requests (no existing .tsx/.ts files).
      // If the intent is vague, shows questions and waits for the next send.
      // If pendingClarification is set, the user is answering those questions —
      // merge original intent + answer, then proceed to generation.
      const existingCodeCount = Object.keys(filesSnapshot).filter(
        k => /\.(tsx?|jsx?)$/.test(k) && !k.startsWith('_'),
      ).length;
      let effectiveIntent = userPrompt;

      if (pendingClarification) {
        effectiveIntent = pendingClarification + '\n\nUser clarification: ' + userPrompt;
        setPendingClarification(null);
        addLog('[Clarifier] Intent enriched with user clarification');
      } else if (existingCodeCount === 0) {
        addLog('[Clarifier] Analyzing intent clarity...');
        const clarResult = await GenerationPipeline.clarify({
          intent: userPrompt,
          apiKey: effectiveApiKey,
          signal: controller.signal,
        });
        if (clarResult && clarResult.questions.length > 0) {
          chatUpdate(planMsgId, {
            role: 'assistant',
            type: 'clarification',
            content: clarResult.questions.join('\n'),
            questions: clarResult.questions,
          });
          setPendingClarification(userPrompt);
          addLog('[Clarifier] Waiting for user clarification');
          return; // finally block resets isGenerating / progress
        }
        addLog('[Clarifier] Intent is clear — proceeding to generation');
      }

      // Vision analysis is now handled inside GenerationPipeline.run() via config.attachments.

      console.log('[DEBUG] pipeline input files:', Object.keys(contextWithTheme));
      const result = await GenerationPipeline.run({
        intent:    effectiveIntent,
        history,
        files:     contextWithTheme,
        apiKey:    effectiveApiKey,
        modelId:   effectiveModel,
        fixModelId: agentConfigs.fix.modelId || ConfigService.resolveModel('fix'),
        // Enable single-page safe mode on genesis (no existing code files).
        // This prevents the model from generating broken multi-page output
        // on the very first request when there's no context to ground on.
        singlePageSafeMode: existingCodeCount === 0,
        generationMode,
        attachments: capturedAttachments,
        onStream: (streamText) => {
          // Update streamingCode on the plan card (replaces old last-message overwrite)
          updatePlan({ streamingCode: streamText });
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
          setProgress(event.progress);
          setCurrentPhase(event.phase);
          if (event.phase === 'think')  { updateStep('think', 'done'); updateStep('architect', 'active'); updatePlan({ progress: 20 }); }
          if (event.phase === 'code')   { updateStep('architect', 'done'); updateStep('code', 'active'); updatePlan({ progress: 40 }); }
          if (event.phase === 'verify') { updateStep('code', 'done'); updateStep('theme', 'active'); updatePlan({ progress: 80 }); }
          if (event.phase === 'idle')   { updateStep('theme', 'done'); updateStep('save', 'done'); updatePlan({ progress: 100, buildStatus: 'building' }); }
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
          updatePlan({
            appName: appName ?? '',
            pages:   steps,
          });
        },
        onPlanReady: (data) => {
          // Show Blueprint in chat as a message
          chatAppend({
            role:      'assistant',
            type:      'blueprint',
            id:        `blueprint-${Date.now()}`,
            timestamp: Date.now(),
            ...data,
          });
        },
        waitForConfirmation: (_plan) => new Promise((resolve) => {
          planResolverRef.current = resolve;
          setPendingPlan({
            plan:          _plan,
            blueprintText: '', // already shown via onPlanReady
            technicalBlueprint: null, // already shown via onPlanReady
            appName:       (_plan as any).appName ?? '',
            theme:         (_plan as any).theme ?? '',
            pages:         ((_plan as any).pages ?? []).map((p: any) => p.name ?? p),
          });
        }),
        signal:   controller.signal,
        onUsage:  (usage: UsageData) => {
          reqUsage = usage;
          const cost = calcCost(effectiveModel, usage);
          setSessionCost(prev => prev + cost);
          setSessionTokens(prev => prev + usage.promptTokens + usage.completionTokens);
        },
        language: appLanguage,
      });

      if (result.status === 'cancelled') {
        addLog('[Generation] Cancelled by user');
        setProgress(0);
        setCurrentPhase('');
        setPreviewLifecycle('idle');
        return;
      }

      if (result.status === 'failed') {
        addLog(`[GenerationPipeline] failed result returned: ${result.error ?? result.message}`);
        chatPatchLast({
          role: 'assistant',
          type: 'text',
          content: result.message || `❌ Ошибка: ${result.error ?? 'Generation failed'}`,
        });
        setProgress(100);
        setCurrentPhase('');
        setPreviewLifecycle('failed');
        return;
      }

      // Success — reset error counter
      consecutiveErrors.current = 0;

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
      // Files are written; now waiting for iframe-ready / iframe-error handshake.
      const severity = result.qualitySummary?.severity;
      if (severity === 'blocking') {
        setPreviewLifecycle('blocked');
        const blockers = result.qualitySummary?.blockers ?? [];
        chatAppend({
          role: 'assistant',
          content: `⚠️ Files were generated, but preview is blocked.\n\n${blockers.map(b => `• ${b}`).join('\n')}`,
        });
        addLog(`[Preview] Blocked: ${blockers.join('; ')}`);
      } else {
        // Not blocking — wait for iframe handshake
        setPreviewLifecycle('committing');
      }

      // Preview is handled by preview-app on port 3100 via Vite HMR.
      // SimpleGeneration writes files directly to preview-app/src/.
      // No revision commits, no materialization needed.

      console.log('[Project] Name debug:', {
        capturedAppName,
        planAppName: (result as any)?.planAppName,
        planName: (result as any)?.plan?.appName,
        userPrompt: userPrompt?.slice(0, 50),
      });
      const projectTitle =
        capturedAppName
        || (result as any)?.planAppName
        || (result as any)?.plan?.appName
        || userPrompt?.slice(0, 40)
        || 'New Project';
      let projectId = currentProjectId;

      // Pre-assign project record for new projects (genesis — no existing code files).
      const isNewProject = Object.keys(filesSnapshot).filter(
        k => /\.(tsx?|jsx?)$/.test(k) && !k.startsWith('_'),
      ).length === 0;
      if (isNewProject && !projectId) {
        try {
          const newProj = ProjectManager.create({
            name:        projectTitle,
            description: userPrompt.slice(0, 120),
            theme:       result.planTheme ?? 'dark-slate',
          });
          ProjectManager.setCurrent(newProj.id);
          projectId = newProj.id;
          setCurrentProjectId(newProj.id);
          addLog(`[Project] Created: ${newProj.name} (${newProj.id.slice(0, 8)}…)`);
        } catch (projErr: unknown) {
          // Storage full / limit reached — fall back to ephemeral UUID so billing still works
          addLog(`[Project] ${(projErr as Error)?.message ?? 'Could not persist project'}`);
          projectId = crypto.randomUUID();
          setCurrentProjectId(projectId);
        }
      }

      // ── Persist project billing (now that projectId is known) ────────────
      if (reqUsage.promptTokens > 0 || reqUsage.completionTokens > 0) {
        const reqCost   = calcCost(effectiveModel, reqUsage);
        const reqTokens = reqUsage.promptTokens + reqUsage.completionTokens;
        setProjectCost((prev: number) => {
          const next = prev + reqCost;
          const savedTokens = (loadBilling(projectId ?? '').tokens || 0) + reqTokens;
          localStorage.setItem(`BILLING_${projectId}`, JSON.stringify({ cost: next, tokens: savedTokens }));
          return next;
        });
        setProjectTokens((prev: number) => prev + reqTokens);
      }

      // ── Save / update project in ProjectStorage ───────────────────────────
      if (Object.keys(finalFiles).length > 0 && projectId) {
        const chatHistoryToSave: any[] = [
          ...history,
          { role: 'assistant' as const, content: result.message || '✓ Готово' },
        ];
        const existing = ProjectStorage.getProject(projectId);

        // ── Revision management ──────────────────────────────────────────
        const revisionPatch = {
          prompt:     userPrompt,
          source:     generationSource,
          files:      finalFiles,
          modelId:    effectiveModel,
          durationMs: Date.now() - generationStartMs,
          pagesCount: (result as any).plan?.pages?.length ?? 0,
        };
        let newRevisions: ProjectRevision[] | null = null;
        if (existing) {
          newRevisions = addRevision(existing, revisionPatch);
          if (!newRevisions) {
            // Limit reached — warn user but still save files
            chatAppend({
              role: 'assistant',
              content: [
                '\u26A0\uFE0F **Version limit reached**',
                '',
                `Project "${projectTitle}" already has 5 saved versions.`,
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
          // Project record already exists (created above for genesis, or carried over from
          // previous generation) — update files via ProjectManager and patch chatHistory.
          try {
            ProjectManager.saveFiles(projectId, { ...existing.files, ...finalFiles });
          } catch (saveErr: unknown) {
            addLog(`[Project] ${(saveErr as Error)?.message ?? 'File save failed'}`);
          }
          // chatHistory lives in StoredProject (outside ProjectManager.Project scope).
          const afterFilesSave = ProjectStorage.getProject(projectId);
          if (afterFilesSave) {
            ProjectStorage.saveProject({
              ...afterFilesSave,
              chatHistory:    chatHistoryToSave,
              updatedAt:      new Date().toISOString(),
              intent:         userPrompt,
              source:         generationSource,
              plan:           (result as any).plan ?? afterFilesSave.plan ?? null,
              logs:           generationLogs,
              errors:         generationErrors.filter(e => e.includes('❌') || e.toLowerCase().includes('error')),
              pagesCount:     (result as any).plan?.pages?.length ?? afterFilesSave.pagesCount ?? 0,
              modelId:        effectiveModel,
              durationMs:     Date.now() - generationStartMs,
              generationMode,
              billingCost:    projectCost,
              billingTokens:  projectTokens,
              revisions:      newRevisions ?? afterFilesSave.revisions,
            });
          }
        } else {
          // EDIT mode but no stored project record yet — create one via ProjectStorage directly.
          const firstRevision: ProjectRevision = {
            id:           crypto.randomUUID(),
            prompt:       userPrompt,
            source:       generationSource,
            files:        finalFiles,
            createdAt:    new Date().toISOString(),
            modelId:      effectiveModel,
            durationMs:   Date.now() - generationStartMs,
            isBookmarked: false,
            pagesCount:   (result as any).plan?.pages?.length ?? 0,
          };
          const fallback: StoredProject = {
            id:             projectId,
            name:           projectTitle,
            description:    userPrompt.slice(0, 120),
            theme:          result.planTheme ?? 'dark-slate',
            createdAt:      new Date().toISOString(),
            updatedAt:      new Date().toISOString(),
            files:          finalFiles,
            chatHistory:    chatHistoryToSave,
            intent:         userPrompt,
            source:         generationSource,
            plan:           (result as any).plan ?? null,
            logs:           generationLogs,
            errors:         generationErrors.filter(e => e.includes('❌') || e.toLowerCase().includes('error')),
            pagesCount:     (result as any).plan?.pages?.length ?? 0,
            modelId:        effectiveModel,
            durationMs:     Date.now() - generationStartMs,
            generationMode,
            billingCost:    projectCost,
            billingTokens:  projectTokens,
            revisions:      [firstRevision],
          };
          const ok = ProjectStorage.saveProject(fallback);
          if (!ok) addLog('[Project] Storage full — project not saved');
        }
        setProjects(ProjectStorage.listProjects());

        // ── Cloud save via ProjectRepository (non-blocking, Supabase) ─────────
        const existingForCloud = ProjectStorage.getProject(projectId);
        ProjectRepository.saveProject({
          id:          projectId,
          name:        projectTitle,
          userId:      authUser?.id ?? 'anonymous',
          description: userPrompt.slice(0, 120),
          theme:       result.planTheme ?? 'dark-slate',
          files:       existingForCloud?.files
                         ? { ...existingForCloud.files, ...finalFiles }
                         : finalFiles,
          chatHistory: chatHistoryToSave,
          createdAt:   existingForCloud?.createdAt ?? new Date().toISOString(),
          updatedAt:   new Date().toISOString(),
          version:     1,
          // Extended metadata (v2) — forwarded to code_snapshot via ProjectRepository
          intent:         userPrompt,
          source:         generationSource,
          plan:           (result as any).plan ?? null,
          logs:           generationLogs,
          errors:         generationErrors.filter(e => e.includes('❌') || e.toLowerCase().includes('error')),
          pagesCount:     (result as any).plan?.pages?.length ?? 0,
          modelId:        effectiveModel,
          durationMs:     Date.now() - generationStartMs,
          generationMode,
          billingCost:    projectCost,
          billingTokens:  projectTokens,
          revisions:      existingForCloud?.revisions ?? [],
        } as any).catch((err: any) => addLog(`[Project] Cloud save error: ${err}`));
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

      // Real error — track for spam protection
      consecutiveErrors.current += 1;
      lastErrorTime.current = Date.now();

      console.error('Studio Error:', err);
      addLog(`❌ Ошибка #${consecutiveErrors.current}: ${err?.message ?? 'Неизвестная ошибка'}`);
      chatPatchLast({
        role: 'assistant',
        type: 'text',
        content: `❌ Ошибка: ${err?.message ?? 'Проверь API Key.'}`,
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
  const launchWithPlan = useCallback(async (plan: ProjectPlan, intent: string, source?: 'chat' | 'weekly-feed' | 'niche') => {
    setGenerationSource(source ?? 'weekly-feed');
    const effectiveApiKey = ConfigService.getKeyForAgent('primary') || apiKey;
    if (!effectiveApiKey) {
      alert('Добавь API Key в настройках!');
      setShowSettings(true);
      return;
    }
    if (isGenerating) return;

    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsGenerating(true);
    setProgress(5);
    setCurrentPhase('think');
    setPreviewLifecycle('generating');
    addLog('─'.repeat(40));

    // Show user prompt in chat so the conversation has context
    chatAppend({ role: 'user', content: intent, timestamp: Date.now() });

    // Add chat context
    addSystemMessage(
      `🚀 Запускаю **${plan.appName}** из банка идей.\n\nArchitect пропущен — план уже готов на основе актуальных рыночных данных.`,
    );

    const effectiveModel = ConfigService.resolveModel('primary');
    let optimisticFiles: FileMap | null = null;
    const filesSnapshot = { ...files };

    try {
      const result = await GenerationPipeline.run({
        intent,
        history:  messages,
        files:    filesSnapshot,
        apiKey:   effectiveApiKey,
        modelId:  effectiveModel,
        fixModelId: agentConfigs.fix.modelId || ConfigService.resolveModel('fix'),
        singlePageSafeMode: Object.keys(files).length === 0,
        generationMode: 'app',
        prebuiltPlan: plan,
        onStream: (streamText) => {
          chatPatchLast({ role: 'assistant', content: streamText || '...' });
        },
        onFiles: (ops: FileOperation[]) => {
          const base = optimisticFiles ?? filesSnapshot;
          const applied = applyOperations(base, ops);
          optimisticFiles = applied;
          setFilesRaw(applied);
          const first = ops.find(o => o.op !== 'delete');
          if (first && 'name' in first) setActiveFile((first as { name: string }).name);
        },
        onPhase: (event: PhaseEvent) => {
          setProgress(event.progress);
          setCurrentPhase(event.phase);
        },
        onLog:  addLog,
        onPlan: (steps) => {
          if (steps.length > 1) {
            addLog(`[PLAN] ${steps.length} steps identified:`);
            steps.forEach((step, i) => addLog(`  ${i + 1}. ${step}`));
          }
        },
        signal: controller.signal,
      });

      if (result.status !== 'failed') {
        const finalFiles = result.graph.files.length > 0
          ? projectGraphToFileMap(result.graph)
          : (optimisticFiles ?? filesSnapshot);
        setFilesRaw(finalFiles);
        setProjectGraph(result.graph);
        addSnapshot(finalFiles, plan.appName);
        chatPatchLast({ role: 'assistant', content: result.message || '✓ Готово' });
        // Preview lifecycle — files written, waiting for iframe handshake
        const severity = result.qualitySummary?.severity;
        if (severity === 'blocking') {
          setPreviewLifecycle('blocked');
          chatAppend({
            role: 'assistant',
            content: `⚠️ Files were generated, but preview is blocked.\n\n${(result.qualitySummary?.blockers ?? []).map(b => `• ${b}`).join('\n')}`,
          });
        } else {
          setPreviewLifecycle('committing');
        }
      } else {
        setPreviewLifecycle('failed');
        addLog(`[launchWithPlan] failed: ${result.error ?? result.message}`);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        addLog('[launchWithPlan] aborted by user');
      } else {
        addLog(`[launchWithPlan] error: ${err}`);
      }
    } finally {
      abortControllerRef.current = null;
      setIsGenerating(false);
      setTimeout(() => setProgress(0), 1200);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, isGenerating, files, messages, agentConfigs, addLog, addSystemMessage, addSnapshot]);

  const onSettings = useCallback(() => setShowSettings(true), []);

  const confirmPlan = useCallback(() => {
    planDecisionRef.current = true;
    setPendingPlan(null);
  }, []);

  const cancelPlan = useCallback(() => {
    planDecisionRef.current = false;
    setPendingPlan(null);
    // Remove blueprint message from chat
    chatRemoveByType('blueprint');
  }, [chatRemoveByType]);

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
    };
  }, []);

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
    currentVersion, totalVersions,
    currentSnapshotId, historyIndex,
    logs, addLog, clearLogs, downloadLogs,
    attachments, addAttachment, removeAttachment, clearAttachments,
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
    // blueprint confirmation
    pendingPlan, confirmPlan, cancelPlan,
  }), [
    // state — re-memoize only when actual data changes
    // messages/input intentionally excluded — returned directly below
    files, activeFile, theme, apiKey, selectedModel,
    isGenerating, device, progress, currentPhase, fullContextMode, autoRoute, generationMode, previewLifecycle,
    projectGraph,
    snapshots, historyIndex, currentProjectId, currentProject, currentSnapshotId, stableSnapshotId,
    projects, showSettings, logs, attachments,
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
    pendingPlan,
    // stable callbacks (useCallback — listed for ESLint correctness, never change)
    setInput, setDevice, setTheme, setApiKey, setSelectedModel, setFullContextMode, setAutoRoute, setGenerationMode,
    setActiveFile, addSnapshot, restoreSnapshot, undo, redo, clearSnapshots, markSnapshotStable,
    addLog, clearLogs, downloadLogs,
    addAttachment, removeAttachment, clearAttachments,
    createNewProject, createProject, switchProject, loadProject, deleteProject, refreshProjects, stopGeneration,
    handleSend, launchWithPlan, publishProject,
    onSettings, setShowSettings,
    addFigmaAccount, removeFigmaAccount, refreshFigmaAccounts, validateFigmaLink,
    setEngineApiKey, setEngineModelId, setAgentConfig,
    startFigmaSync, addSystemMessage,
    saveFigmaProject, loadFigmaProject, deleteFigmaProject, markFigmaProjectSynced, clearFigmaSync,
    setAppLanguage, setFigmaLink, setTargetMarket, setAuditStrictness,
    confirmPlan, cancelPlan,
  ]);

  // messages / input / setInput returned directly (not memoized) so their
  // high-frequency updates (every token, every keypress) do NOT invalidate
  // the stable studioMemo and retrigger deep re-renders of the full tree.
  return { ...studioMemo, messages, input, setInput };
};