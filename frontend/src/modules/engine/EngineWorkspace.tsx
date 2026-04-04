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
import { EngineTopBar, DevIdentity } from '../../components/EngineTopBar';
import { ChatErrorBoundary }    from '../../components/boundaries/ChatErrorBoundary';
import { PreviewErrorBoundary } from '../../components/boundaries/PreviewErrorBoundary';
import type { Snapshot, FileMap, Attachment } from '../../hooks/useStudio';
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
  projects:          any[];
  currentProjectId:  string | null;
  totalVersions:     number;
  currentVersion:    number;

  // ── Chat / generation ─────────────────────────────────────────
  messages:          any[];
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
  onLoadProject:     (p: any) => void;
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
  addLog?: (msg: string) => void;

  // ── Auto-fixer ────────────────────────────────────────────────
  isAutoFixing?: boolean;

  // ── Attachments ───────────────────────────────────────────────
  attachments?:      Attachment[];
  addAttachment?:    (a: Attachment) => void;
  removeAttachment?: (id: string) => void;

  // ── Blueprint confirmation ────────────────────────────────────
  pendingPlan?:      object | null;
  confirmPlan?:      () => void;
  cancelPlan?:       () => void;
}


export const EngineWorkspace = React.memo<EngineWorkspaceProps>(function EngineWorkspace({
  theme, themes, cloudAvailable, onShare, onDeploy, onCollab,
  projects, currentProjectId, totalVersions, currentVersion,
  messages, input, setInput, onSend, onStop, isGenerating, progress, currentPhase, scrollRef,
  onNewProject, onLoadProject, onDeleteProject, onSettings, setTheme,
  snapshots, currentSnapshotId, onRestoreSnapshot, markSnapshotStable,
  canUndo, canRedo, onUndo, onRedo,
  fullContextMode, setFullContextMode, autoRoute, setAutoRoute, generationMode, setGenerationMode, appLanguage,
  files, setFiles, activeFile, setActiveFile, device, setDevice,
  sessionCost, sessionTokens, projectCost, projectTokens, selectedModel, apiKey,
  addLog,
  isAutoFixing = false,
  attachments = [], addAttachment = () => {}, removeAttachment = () => {},
  pendingPlan = null, confirmPlan = () => {}, cancelPlan = () => {},
}) {
  const isDark = theme !== 'light';

  const projectName =
    projects.find((p: { id: string; title?: string }) => p.id === currentProjectId)?.title ?? '';

  // currentVersion is historyIndex + 1 (same as activeRevision used by EngineTopBar)
  const activeRevision   = currentVersion;
  const lastGoodRevision = totalVersions > 0 ? totalVersions : undefined;

  const onBackup = React.useCallback(() => {}, []);

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
          activeBranch="main"
          activeRevision={activeRevision}
          lastGoodRevision={lastGoodRevision}
          devIdentity={devIdentity}
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
            pendingPlan={pendingPlan}
            confirmPlan={confirmPlan}
            cancelPlan={cancelPlan}
          />
          </ChatErrorBoundary>
          <PreviewErrorBoundary onRetry={() => {
            window.dispatchEvent(new CustomEvent('force-preview-reload'));
          }}>
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
            activeBranch="main"
            onShare={onShare}
            onDownloadProject={handleDownloadProject}
            onExportReactNative={Object.keys(files).length > 0 ? handleExportReactNative : undefined}
            rnExporting={rnExporting}
            rnExportChars={rnExportChars}
            isAutoFixing={isAutoFixing}
          />
          </PreviewErrorBoundary>
        </div>
      </div>
    </EngineErrorBoundary>
  );
});
