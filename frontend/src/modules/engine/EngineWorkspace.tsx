/**
 * EngineWorkspace — System Engine module container.
 *
 * Layout (column):
 *   ┌─────────────────────────────────┐  ← EngineTopBar (38px)
 *   │ [project name] · [sync] · Backup│
 *   ├─────────────────────────────────┤  ← RecoveryBanner (conditionally)
 *   │ LeftPanel │ PreviewCanvas       │  ← existing workspace (flex-1)
 *   └─────────────────────────────────┘
 */

import React from 'react';
import { LeftPanel }      from '../../components/LeftPanel';
import { PreviewCanvas }  from '../../components/PreviewCanvas';
import { visualEditBridge, type SelectedElement } from '../../services/VisualEditBridge';
import { previewController } from '../../services/PreviewController';
import { EngineTopBar, DevIdentity } from '../../components/EngineTopBar';
import { ChatErrorBoundary }    from '../../components/boundaries/ChatErrorBoundary';
import type { Snapshot, FileMap, Attachment, ComposerContextItem } from '../../hooks/useStudio';
import type { ChatMessage } from '../../types/chat';
import { ProjectExportService }          from '../../services/ProjectExportService';
import { ReactNativeExportService }     from '../../services/ReactNativeExportService';

interface EngineErrorBoundaryProps {
  children: React.ReactNode;
}

interface EngineErrorBoundaryState {
  error: Error | null;
}

class EngineErrorBoundary extends React.Component<
  EngineErrorBoundaryProps,
  EngineErrorBoundaryState
> {
  state: EngineErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): EngineErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      console.error('[EW] CRASH:', this.state.error?.message, this.state.error?.stack);
      return (
        <div style={{ padding: 32, color: '#f87171', fontFamily: 'monospace', fontSize: 13 }}>
          <strong>EngineWorkspace crash:</strong><br />
          {this.state.error.message}<br /><br />
          <pre style={{ whiteSpace: 'pre-wrap', opacity: 0.7 }}>
            {this.state.error.stack?.slice(0, 600)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export interface EngineWorkspaceProps {
  // ── Themes / layout ───────────────────────────────────────────
  theme:            'dark' | 'medium' | 'light';
  themes:           Record<string, { bg: string; border: string; panel: string; text: string; card: string }>;
  cloudAvailable:   boolean;
  onShare:          () => void;
  onDeploy:         () => void;
  onCollab:         () => void;

  // ── Project context ───────────────────────────────────────────
  projects:          Array<{ id: string; name: string; description: string; theme: string; createdAt: string; updatedAt: string; [key: string]: any }>;
  currentProjectId:  string | null;
  /** Total snapshots in undo/redo history. */
  totalVersions:     number;
  /** 1-indexed snapshot position in undo/redo history. */
  currentVersion:    number;
  /** 1-indexed version of the last stable (iframe-ok) snapshot. See useStudio glossary. */
  lastStableVersion?: number;

  // ── Chat / generation ─────────────────────────────────────────
  messages:          ChatMessage[];
  input:             string;
  setInput:          (v: string) => void;
  onSend:            () => void;
  onStop:            () => void;
  isGenerating:      boolean;
  progress:          number;
  currentPhase:      string;
  scrollRef:         React.RefObject<HTMLDivElement>;

  // ── Project CRUD ──────────────────────────────────────────────
  onNewProject:      () => void;
  onLoadProject:     (p: { id: string; name: string; [key: string]: any }) => void;
  onDeleteProject:   (id: string) => void;
  onSettings:        () => void;
  setTheme:          (t: 'dark' | 'medium' | 'light') => void;

  // ── Snapshots / undo ──────────────────────────────────────────
  snapshots:           Snapshot[];
  currentSnapshotId:   string | null;
  onRestoreSnapshot:   (s: Snapshot) => void;
  markSnapshotStable?: (snapshotId: string) => void;
  canUndo:             boolean;
  canRedo:             boolean;
  onUndo:              () => void;
  onRedo:              () => void;

  // ── Context / AI settings ─────────────────────────────────────
  fullContextMode:      boolean;
  setFullContextMode:   (v: boolean) => void;
  autoRoute?:           boolean;
  setAutoRoute?:        (v: boolean) => void;
  generationMode?:      'landing' | 'app' | 'superapp';
  setGenerationMode?:   (v: 'landing' | 'app' | 'superapp') => void;
  appLanguage?:         string;

  // ── Files / editor ────────────────────────────────────────────
  files:         FileMap;
  setFiles:      (f: FileMap) => void;
  activeFile:    string;
  setActiveFile: (n: string) => void;
  device:        string;
  setDevice:     (d: string) => void;

  // ── Billing ───────────────────────────────────────────────────
  sessionCost:   number;
  sessionTokens: number;
  projectCost:   number;
  projectTokens: number;
  selectedModel: string;
  apiKey?:       string;

  // ── Logging ───────────────────────────────────────────────────
  addLog?: (msg: string, level?: 'info' | 'warn' | 'error') => void;

  // ── Auto-fixer ────────────────────────────────────────────────
  isAutoFixing?: boolean;

  // ── Error recovery ────────────────────────────────────────────
  onRollback?: () => void;
  onRetry?:    () => void;

  // ── Attachments ───────────────────────────────────────────────
  attachments?:      Attachment[];
  addAttachment?:    (a: Attachment) => void;
  removeAttachment?: (id: string) => void;
  composerContextItems?: ComposerContextItem[];
  removeComposerContextItem?: (id: string) => void;
  clearComposerContextItems?: () => void;

  // ── Blueprint confirmation ────────────────────────────────────
  kickoffPhase?:     import('../../hooks/useStudio').KickoffPhase;
  pendingPlan?:      object | null;
  confirmPlan?:      () => void;
  cancelPlan?:       () => void;
  onConfirmPlan?:    (plan: object) => void;
  selectKickoffScope?: (optionId: 'core' | 'core_backend' | 'core_backend_ai') => void;
  onClarifyPlan?:    (messageId: string) => void;
  onSubmitClarification?: (text: string) => void;

  // ── State machine ─────────────────────────────────────────────
  studioPhase?:      string;
  studioError?:      string | null;

  // ── Preview lifecycle (from useStudio) ────────────────────────
  previewLifecycle?:      string;
  previewBlockedReason?:  string | null;
  previewUrl?:            string;
}


export const EngineWorkspace = React.memo<EngineWorkspaceProps>(function EngineWorkspace({
  theme, themes, cloudAvailable, onShare, onDeploy, onCollab,
  projects, currentProjectId, totalVersions, currentVersion, lastStableVersion,
  messages, input, setInput, onSend, onStop, isGenerating, progress, currentPhase, scrollRef,
  onNewProject, onLoadProject, onDeleteProject, onSettings, setTheme,
  snapshots, currentSnapshotId, onRestoreSnapshot, markSnapshotStable,
  canUndo, canRedo, onUndo, onRedo,
  fullContextMode, setFullContextMode, autoRoute, setAutoRoute, generationMode, setGenerationMode, appLanguage,
  files, setFiles, activeFile, setActiveFile, device, setDevice,
  sessionCost, sessionTokens, projectCost, projectTokens, selectedModel, apiKey,
  addLog,
  isAutoFixing = false,
  onRollback,
  onRetry,
  attachments = [], addAttachment = () => {}, removeAttachment = () => {},
  composerContextItems = [], removeComposerContextItem = () => {}, clearComposerContextItems = () => {},
  kickoffPhase = 'idle' as import('../../hooks/useStudio').KickoffPhase,
  pendingPlan = null, confirmPlan = () => {}, cancelPlan = () => {},
  onConfirmPlan = () => confirmPlan(), selectKickoffScope = () => {}, onClarifyPlan = () => {}, onSubmitClarification = () => {},
  studioPhase,
  studioError = null,
  previewLifecycle,
  previewBlockedReason = null,
  previewUrl = '',
}) {
  const isDark = theme !== 'light';

  const currentProjectMeta =
    projects.find((p: { id: string; title?: string; name?: string; activeBranchId?: string }) => p.id === currentProjectId);
  const projectName = currentProjectMeta?.title ?? currentProjectMeta?.name ?? '';
  const activeBranchId = currentProjectMeta?.activeBranchId ?? 'main';
  const persistedProjectExists = currentProjectId ? projects.some(p => p.id === currentProjectId) : undefined;

  // ── Snapshot layer (undo/redo) — see useStudio glossary ─────────
  // These are snapshot counters, NOT RevisionManager build-revision UUIDs.
  // EngineTopBar shows these as "snap #N".
  const currentSnapshotNum = currentVersion;
  // lastStableSnapshotNum = the version number of the most recent *stable*
  // snapshot (iframe confirmed without errors). Falls back to totalVersions
  // for compat when not yet available (first load before any generation).
  const lastStableSnapshotNum = lastStableVersion ?? (totalVersions > 0 ? totalVersions : undefined);

  const onBackup = React.useCallback(() => {}, []);

  // Visual-edit: when user clicks a preview element, prefill the chat input
  // with the element context so they only need to type the edit description.
  const handleVisualElementSelected = React.useCallback((el: SelectedElement) => {
    setInput(visualEditBridge.buildEditPrompt(el, ''));
  }, [setInput]);

  // ── Playwright / e2e test hooks ────────────────────────────────────────────
  // window.__E2E_VISUAL_SELECT(payload) — secondary: simulate a visual element
  //   selection without needing a live iframe click (bypasses iframe origin
  //   guard).  Only used when the real click path is unavailable.
  // window.__E2E_VISUAL_BRIDGE.waitForSelectReady() — primary synchronisation:
  //   returns a Promise that resolves once the iframe has confirmed it entered
  //   selection mode (via 'visual-select-ready' postMessage).  Await this before
  //   dispatching a real click inside the iframe to eliminate the delivery race.
  // Only active when VITE_PLAYWRIGHT_TEST=1; dead-code-eliminated otherwise.
  React.useEffect(() => {
    if (import.meta.env.VITE_PLAYWRIGHT_TEST !== '1') return;
    (window as any).__E2E_VISUAL_SELECT = (payload: SelectedElement) => {
      visualEditBridge._testForceSelected(payload);
    };
    (window as any).__E2E_VISUAL_BRIDGE = {
      waitForSelectReady: (timeoutMs?: number) =>
        visualEditBridge.waitForSelectReady(timeoutMs),
    };
    return () => {
      delete (window as any).__E2E_VISUAL_SELECT;
      delete (window as any).__E2E_VISUAL_BRIDGE;
    };
  }, []); // stable: bridge singleton, no deps needed

  const handleDownloadProject = React.useCallback(() => {
    ProjectExportService.downloadProjectZip(files, {
      projectId:   currentProjectId ?? undefined,
      projectName: projectName || 'my-app',
    });
  }, [files, currentProjectId, projectName]);

  const [rnExporting, setRnExporting] = React.useState(false);
  const [rnExportChars, setRnExportChars] = React.useState(0);
  const handleExportReactNative = React.useCallback(async () => {
    if (rnExporting) return;
    setRnExporting(true);
    setRnExportChars(0);
    try {
      const name = projectName || 'my-app';
      const rnFiles = await ReactNativeExportService.generateExpoProject({
        files,
        projectName: name,
        apiKey:      apiKey ?? '',
        onLog:       addLog,
        onStream:    (chunk) => setRnExportChars(prev => prev + chunk.length),
      });
      if (Object.keys(rnFiles).length === 0) {
        addLog?.('[RNExport] No files generated — check model config');
        return;
      }
      ReactNativeExportService.downloadAsZip(rnFiles, name);
      addLog?.(`[RNExport] Downloaded ${name}-expo.zip`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog?.(`[RNExport] Error: ${msg}`);
    } finally {
      setRnExporting(false);
    }
  }, [files, projectName, apiKey, addLog, rnExporting]);

  const [devIdentity, setDevIdentity] = React.useState<DevIdentity | null>(null);
  React.useEffect(() => {
    fetch('/__dev_identity')
      .then(r => r.ok ? r.json() : null)
      .then((data: DevIdentity | null) => { if (data) setDevIdentity(data); })
      .catch(() => {/* dev server may be unreachable — ignore */});
  }, []);

  return (
    <EngineErrorBoundary>
      <div style={{display:'flex', flexDirection:'column', flex:1, overflow:'hidden'}}>
        {/* ── Canonical project axis: project → branch → revision → last good ── */}
        <EngineTopBar
          projectName={projectName}
          isSyncing={false}
          lastSyncAt={null}
          cloudAvailable={cloudAvailable}
          isDark={isDark}
          onBackup={onBackup}
          activeBranch={activeBranchId}
          snapshotNum={currentSnapshotNum}
          lastStableSnapshotNum={lastStableSnapshotNum}
          devIdentity={devIdentity}
          onNewProject={onNewProject}
          onSettings={onSettings}
          currentTheme={theme}
          setTheme={setTheme}
        />

        {/* ── Workspace: chat + canvas ── */}
        <div style={{display:'flex', flex:1, overflow:'hidden'}}>
          <ChatErrorBoundary>
          <LeftPanel
            messages={messages}
            input={input}
            setInput={setInput}
            onSend={onSend}
            onStop={onStop}
            isGenerating={isGenerating}
            progress={progress}
            currentPhase={currentPhase}
            scrollRef={scrollRef}
            projects={projects}
            currentProjectId={currentProjectId}
            onNewProject={onNewProject}
            onLoadProject={onLoadProject}
            onDeleteProject={onDeleteProject}
            onSettings={onSettings}
            setTheme={setTheme}
            currentTheme={theme}
            snapshots={snapshots}
            currentSnapshotId={currentSnapshotId}
            currentVersion={currentVersion}
            onRestoreSnapshot={onRestoreSnapshot}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={onUndo}
            onRedo={onRedo}
            fullContextMode={fullContextMode}
            setFullContextMode={setFullContextMode}
            activeFile={activeFile}
            sessionCost={sessionCost}
            sessionTokens={sessionTokens}
            projectCost={projectCost}
            selectedModel={selectedModel}
            autoRoute={autoRoute}
            setAutoRoute={setAutoRoute}
            generationMode={generationMode}
            setGenerationMode={setGenerationMode}
            appLanguage={appLanguage}
            attachments={attachments}
            addAttachment={addAttachment}
            removeAttachment={removeAttachment}
            composerContextItems={composerContextItems}
            removeComposerContextItem={removeComposerContextItem}
            clearComposerContextItems={clearComposerContextItems}
            kickoffPhase={kickoffPhase}
            pendingPlan={pendingPlan}
            confirmPlan={confirmPlan}
            cancelPlan={cancelPlan}
            onConfirmPlan={onConfirmPlan}
            selectKickoffScope={selectKickoffScope}
            onClarifyPlan={onClarifyPlan}
            onSubmitClarification={onSubmitClarification}
          />
          </ChatErrorBoundary>
          <PreviewCanvas
            device={device}
            setDevice={setDevice}
            files={files}
            setFiles={setFiles}
            activeFile={activeFile}
            setActiveFile={setActiveFile}
            currentTheme={theme}
            currentVersion={currentVersion}
            totalVersions={totalVersions}
            addLog={addLog}
            currentSnapshotId={currentSnapshotId}
            markSnapshotStable={markSnapshotStable}
            currentProjectId={currentProjectId}
            projectName={projectName}
            activeBranch={activeBranchId}
            persistedProjectExists={persistedProjectExists}
            onShare={onShare}
            onDownloadProject={handleDownloadProject}
            onExportReactNative={Object.keys(files).length > 0 ? handleExportReactNative : undefined}
            rnExporting={rnExporting}
            rnExportChars={rnExportChars}
            isAutoFixing={isAutoFixing}
            isGenerating={isGenerating}
            onRollback={onRollback}
            apiKey={apiKey}
            previewLifecycle={previewLifecycle}
            previewBlockedReason={previewBlockedReason}
            projectId={currentProjectId ?? ''}
            previewUrl={previewUrl}
            onVisualElementSelected={handleVisualElementSelected}
          />
        </div>
      </div>
    </EngineErrorBoundary>
  );
});
