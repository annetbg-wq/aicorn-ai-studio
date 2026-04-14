/**
 * useFigmaState — Figma identity, sync, Design DNA, and Project Hub state.
 *
 * Extracted from useStudio to isolate Figma re-renders (sync progress ticks,
 * access validation, project hub CRUD) from the main studio state tree.
 */

import { useState, useCallback, useRef } from 'react';
import { IdentityService } from '../services/IdentityService';
import type { FigmaAccount } from '../services/IdentityService';
import { FigmaClient } from '../services/FigmaClient';
import type { AccessResult } from '../services/FigmaClient';
import { FigmaService } from '../services/FigmaService';
import type { ProjectTheme, SyncProgress, TargetMarket, AuditStrictness } from '../services/FigmaService';
import { ProjectStore } from '../services/ProjectStore';
import type { FigmaProject } from '../services/ProjectStore';
import { AIEngineService } from '../services/AIEngineService';
import type { EngineStatus, ValidationResult } from '../services/AIEngineService';
import { ConfigService } from '../services/ConfigService';

export function useFigmaState(addLog: (msg: string) => void) {
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
  const [engineApiKey,  setEngineApiKeyState]  = useState(() => ConfigService.getEngineApiKey());
  const [engineModelId, setEngineModelIdState] = useState(() => ConfigService.getEngineModel());
  const [engineStatus,  setEngineStatus]       = useState<EngineStatus>('idle');
  const [engineResult,  setEngineResult]       = useState<ValidationResult | null>(null);

  const setEngineApiKey = useCallback((v: string) => {
    ConfigService.setEngineApiKey(v);
    setEngineApiKeyState(v);
  }, []);

  const setEngineModelId = useCallback((v: string) => {
    ConfigService.setEngineModel(v);
    setEngineModelIdState(v);
  }, []);

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

      // Silent background engine validation
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

  // ── Figma Project Hub ──────────────────────────────────────────────────────
  const [figmaProjects,        setFigmaProjects]        = useState<FigmaProject[]>(() => ProjectStore.getAll());
  const [activeFigmaProjectId, setActiveFigmaProjectId] = useState<string | null>(null);

  const saveFigmaProject = useCallback((projectName?: string): string | null => {
    if (!currentProjectTheme) return null;
    const name = projectName?.trim() || 'Untitled Project';
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

  const clearFigmaSync = useCallback(() => {
    setFigmaLink('');
    setFigmaAccessResult(null);
    setCurrentProjectTheme(null);
    setSyncFigmaUrl(undefined);
    setSyncProgress({ step: 'idle', message: '', pct: 0 });
    setActiveFigmaProjectId(null);
  }, []);

  return {
    // identity
    figmaAccounts, addFigmaAccount, removeFigmaAccount, refreshFigmaAccounts,
    figmaLink, setFigmaLink,
    figmaAccessResult, validateFigmaLink, figmaValidating,
    // design DNA
    currentProjectTheme, syncProgress, syncFigmaUrl, syncSource, startFigmaSync,
    targetMarket, setTargetMarket, auditStrictness, setAuditStrictness,
    // project hub
    figmaProjects, activeFigmaProjectId,
    saveFigmaProject, loadFigmaProject, deleteFigmaProject,
    markFigmaProjectSynced, clearFigmaSync,
    // engine
    engineApiKey, setEngineApiKey,
    engineModelId, setEngineModelId,
    engineStatus, engineResult,
  } as const;
}
