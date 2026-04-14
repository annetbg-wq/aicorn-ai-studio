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
import { previewController } from '../../services/PreviewController';
import { EngineTopBar, DevIdentity } from '../../components/EngineTopBar';
import { ChatErrorBoundary }    from '../../components/boundaries/ChatErrorBoundary';
import { PreviewErrorBoundary } from '../../components/boundaries/PreviewErrorBoundary';
import {
  getLocalDevAgentProvider,
  setLocalDevAgentProvider,
  syncLocalDevAgentMode,
  type DevAgentProvider,
} from '../../services/devAgentMode';
import { isCreatorMode } from '../../services/internalAccess';
import type { Snapshot, FileMap, Attachment } from '../../hooks/useStudio';
import { ProjectExportService }          from '../../services/ProjectExportService';
import { ReactNativeExportService }     from '../../services/ReactNativeExportService';

const CLAUDE_BRIDGE_CFG = JSON.stringify({
  provider: 'claude-bridge',
  modelId: 'claude-sonnet-4-6',
  fallback1Provider: 'openrouter',
});

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

  // ── Blueprint confirmation ────────────────────────────────────
  pendingPlan?:      object | null;
  confirmPlan?:      () => void;
  cancelPlan?:       () => void;

  // ── State machine ─────────────────────────────────────────────
  studioPhase?:      string;
  studioError?:      string | null;
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
  onRollback,
  onRetry,
  attachments = [], addAttachment = () => {}, removeAttachment = () => {},
  pendingPlan = null, confirmPlan = () => {}, cancelPlan = () => {},
  studioPhase,
  studioError = null,
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

  const [devAgentProvider, setDevAgentProvider] = React.useState<DevAgentProvider>(() => getLocalDevAgentProvider());

  const setRemoteDevAgentProvider = React.useCallback(async (nextProvider: DevAgentProvider) => {
    // ── AGENT_CONFIG sync ─────────────────────────────────────────────────
    if (nextProvider === 'claude') {
      const current = localStorage.getItem('AGENT_CONFIG_agent_primary');
      if (current) localStorage.setItem('CLAUDE_MAX_PREV_CONFIG', current);
      localStorage.setItem('AGENT_CONFIG_agent_primary', CLAUDE_BRIDGE_CFG);
      localStorage.setItem('AGENT_CONFIG_agent_build',   CLAUDE_BRIDGE_CFG);
    } else {
      const prev = localStorage.getItem('CLAUDE_MAX_PREV_CONFIG');
      if (prev) {
        localStorage.setItem('AGENT_CONFIG_agent_primary', prev);
        localStorage.setItem('AGENT_CONFIG_agent_build',   prev);
      } else {
        localStorage.removeItem('AGENT_CONFIG_agent_primary');
        localStorage.removeItem('AGENT_CONFIG_agent_build');
      }
    }
    // ── Remote sync ───────────────────────────────────────────────────────
    try {
      const response = await fetch('http://localhost:3107/dev-agent-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: nextProvider }),
      });
      if (response.ok) {
        const data = await response.json();
        setDevAgentProvider(syncLocalDevAgentMode(data));
        return;
      }
    } catch {
      // backend недоступен — переключаем только локально
      setLocalDevAgentProvider(nextProvider);
      setDevAgentProvider(nextProvider);
    }
  }, []);

  React.useEffect(() => {
    fetch('http://localhost:3107/dev-agent-mode')
      .then(r => r.json())
      .then(data => {
        setDevAgentProvider(syncLocalDevAgentMode(data));
      })
      .catch(() => {});
  }, []);

  const isAdmin = isCreatorMode();

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
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {isAdmin && (
              <div
                title="Switch internal provider"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  margin: '8px 10px 0 auto',
                  padding: 4,
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                {([
                  { id: 'off', label: 'Standard' },
                  { id: 'claude', label: 'Claude' },
                  { id: 'codex', label: 'Codex' },
                ] as Array<{ id: DevAgentProvider; label: string }>).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => void setRemoteDevAgentProvider(opt.id)}
                    style={{
                      padding: '5px 9px',
                      borderRadius: 8,
                      border: `1px solid ${devAgentProvider === opt.id ? 'rgba(124,58,237,0.6)' : 'rgba(255,255,255,0.1)'}`,
                      background: devAgentProvider === opt.id ? 'rgba(124,58,237,0.18)' : 'transparent',
                      color: devAgentProvider === opt.id ? '#c4b5fd' : '#9ca3af',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    title={`Switch to ${opt.label}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
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
            onRetry={onRetry}
            studioPhase={studioPhase}
            studioError={studioError}
          />
          </div>
          </ChatErrorBoundary>
          <PreviewErrorBoundary onRetry={() => {
            // Render-error retry: clear preview state to idle so the next real
            // build cycle (or load) is the only thing that can promote to ready.
            previewController.reset();
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
            isGenerating={isGenerating}
            onRollback={onRollback}
            apiKey={apiKey}
          />
          </PreviewErrorBoundary>
        </div>
      </div>
    </EngineErrorBoundary>
  );
});
