import React, { Suspense, lazy } from 'react';
import { RootLayout }           from './layouts/RootLayout';
import { AppSidebar }           from './components/AppSidebar';
import ArchitectDashboard       from './modules/architect/ArchitectDashboard';
const EngineWorkspace    = lazy(() => import('./modules/engine/EngineWorkspace').then(m => ({ default: m.EngineWorkspace })));

const Dashboard          = lazy(() => import('./components/Dashboard').then(m => ({ default: m.Dashboard })));
const ProjectsScreen     = lazy(() => import('./components/ProjectsScreen').then(m => ({ default: m.ProjectsScreen })));
const PlatinumFigma      = lazy(() => import('./components/PlatinumFigma').then(m => ({ default: m.PlatinumFigma })));
const AgentLabPanel      = lazy(() => import('./components/AgentLabPanel').then(m => ({ default: m.AgentLabPanel })));
const AnalyticsDashboard = lazy(() => import('./modules/analytics').then(m => ({ default: m.AnalyticsDashboard })));
const SettingsModal      = lazy(() => import('./components/SettingsModal').then(m => ({ default: m.SettingsModal })));
const DeployModal        = lazy(() => import('./components/DeployModal').then(m => ({ default: m.DeployModal })));
const CollabModal        = lazy(() => import('./components/CollabModal').then(m => ({ default: m.CollabModal })));

const PageLoader = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100%', color: 'var(--muted-foreground)', fontSize: 13 }}>
    Loading…
  </div>
);
import { GlobalErrorBoundary } from './components/GlobalErrorBoundary';
import { AuthProvider }         from './contexts/AuthContext';
import { useStudio }            from './hooks/useStudio';
import { useProjectSync }      from './hooks/useProjectSync';
import { useUIStore }          from './hooks/useUIStore';
import { supabase }             from './lib/supabase';
import { storageService }          from './services/storageService';
import { FigmaOAuthService }       from './services/FigmaOAuthService';
import { metricsService }       from './services/MetricsService';
import { ShareService }            from './services/ShareService';
import type { ModuleId, ViewId } from './shared/types';

export default function App() {
  const studio  = useStudio();
  const uiStore = useUIStore();

  // ── Local snapshot export / restore (Survival Backup System) ───────────────
  const _projectName = React.useMemo(
    () => (studio.projects as any[]).find((p: any) => p.id === studio.currentProjectId)?.name ?? 'Untitled',
    [studio.projects, studio.currentProjectId],
  );
  const _onRestoreFiles = React.useCallback(
    (restoredFiles: Parameters<typeof studio.setFiles>[0]) => studio.setFiles(restoredFiles),
    [studio.setFiles],
  );
  const _onRestoreConfig = React.useCallback(
    (config: Record<string, string>) => {
      if (config.OPENROUTER_API_KEY) studio.setApiKey(config.OPENROUTER_API_KEY);
      if (config.SELECTED_MODEL)     studio.setSelectedModel(config.SELECTED_MODEL);
      if (config.APP_THEME)          studio.setTheme(config.APP_THEME as 'dark' | 'medium' | 'light');
    },
    [studio.setApiKey, studio.setSelectedModel, studio.setTheme],
  );
  const sync = useProjectSync(
    studio.files ?? {},
    studio.currentProjectId ?? null,
    _projectName,
    studio.theme,
    _onRestoreFiles,
    _onRestoreConfig,
  );

  // Global error handlers → MetricsService
  React.useEffect(() => {
    const onError = (event: ErrorEvent) => {
      metricsService.recordError('orchestrator', event.message, { filename: event.filename, lineno: event.lineno });
      document.title = event.message.slice(0, 50);
    };
    const onUnhandled = (event: PromiseRejectionEvent) => {
      const msg = event.reason instanceof Error ? event.reason.message : String(event.reason);
      metricsService.recordError('orchestrator', `Unhandled rejection: ${msg}`);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandled);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandled);
    };
  }, []);

  const themes = React.useMemo(() => ({
    dark:   { bg: 'bg-[#050505]', border: 'border-white/5',  panel: 'bg-[#080808]', text: 'text-white/90', card: 'bg-white/[0.03]' },
    medium: { bg: 'bg-[#121212]', border: 'border-white/10', panel: 'bg-[#181818]', text: 'text-white/80', card: 'bg-white/[0.05]' },
    light:  { bg: 'bg-[#f5f5f5]', border: 'border-black/5',  panel: 'bg-white',     text: 'text-black',    card: 'bg-black/[0.02]' },
  }), []);

  const [view,           setView]           = React.useState<ViewId>('dashboard');
  const [sharedCode,     setSharedCode]     = React.useState<string | null>(null);
  const [showDeploy,     setShowDeploy]     = React.useState(false);
  const [showCollab,     setShowCollab]     = React.useState(false);
  const [cloudAvailable, setCloudAvailable] = React.useState(false);

  // ── Init storageService + subscribe to connectivity ────────────────────────
  React.useEffect(() => {
    localStorage.removeItem('SELECTED_MODEL');
    const unsub = storageService.onSyncStatusChange(setCloudAvailable);
    storageService.init(); // async; updates _available + notifies listeners
    return unsub;
  }, []);


  // ── Figma OAuth callback — detect ?code=&state= after redirect ────────────
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get('code');
    const state  = params.get('state');
    if (!code || !state) return;

    const redirectUri = FigmaOAuthService.redirectUri();
    FigmaOAuthService.completeOAuth(code, state, redirectUri).then(result => {
      if ('account' in result) {
        studio.refreshFigmaAccounts();
        // Restore the view the user was in before the OAuth redirect
        const preView = FigmaOAuthService.popPreOAuthView();
        if (preView === 'figma') setView('figma');
      } else {
        console.error('[OAuth] Failed:', result.error);
      }
    }).finally(() => {
      // Always clean the URL so params don't persist on refresh
      window.history.replaceState({}, '', window.location.pathname);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // runs once on mount only

  // ── Sync Studio Manifest whenever billing changes ──────────────────────────
  const { sessionCost, sessionTokens, selectedModel } = studio;
  React.useEffect(() => {
    if (sessionCost > 0 || sessionTokens > 0) {
      storageService.saveManifest({
        api_spent:             sessionCost,
        context_health:        Math.max(0, 100 - (sessionTokens / 100_000) * 100),
        infrastructure_status: { model: selectedModel ?? '' },
      });
    }
  }, [sessionCost, sessionTokens, selectedModel]);

  // ── Computed resource percentages (for sidebar bars) ─────────────────────
  const apiWalletPct     = Math.min((studio.sessionCost   / 1)       * 100, 100);
  const contextHealthPct = Math.min((studio.sessionTokens / 100_000) * 100, 100);

  // ── Navigation ────────────────────────────────────────────────────────────
  const handleNavigate = (id: ModuleId) => {
    // Analytics + AgentLab → floating overlays, not view changes
    if (id === 'analytics') {
      uiStore.setShowAnalytics(!uiStore.showAnalytics);
      uiStore.setShowAgentLab(false);
      return;
    }
    if (id === 'agentlab') {
      uiStore.setShowAgentLab(!uiStore.showAgentLab);
      uiStore.setShowAnalytics(false);
      return;
    }
    uiStore.closeAll();
    if (id === 'engine')    setView('engine');
    if (id === 'figma')     setView('figma');
    if (id === 'architect') setView('architect');
    if (id === 'projects')  setView('projects');
  };

  const handleLoadProject = (p: any) => {
    studio.loadProject(p);
    setView('engine');
  };

  const handleStartBlueprint = (text: string) => {
    studio.setInput(text);
    setView('engine');
  };

  const handleLaunchWithPlan = React.useCallback((plan: any, intent: string, source?: 'chat' | 'weekly-feed' | 'niche') => {
    setView('engine');
    studio.launchWithPlan(plan, intent, source);
  }, [studio]);

  // ── Modal openers — stable refs ───────────────────────────────────────────
  const handleDeploy = React.useCallback(() => setShowDeploy(true), []);
  const handleCollab = React.useCallback(() => setShowCollab(true), []);

  // ── Share (Vercel CLI deploy) ─────────────────────────────────────────────
  const [isDeploying, setIsDeploying] = React.useState(false);
  const handleShare = React.useCallback(async () => {
    if (Object.keys(studio.files).length === 0) return alert('Сначала создайте что-нибудь!');
    setIsDeploying(true);
    try {
      const result = await ShareService.deployToVercel();
      if (result.ok && result.url) {
        await navigator.clipboard.writeText(result.url);
        window.open(result.url, '_blank');
        alert(`Deployed! URL copied:\n${result.url}`);
      } else {
        alert(`Deploy failed: ${result.error ?? 'Unknown error'}`);
      }
    } catch (e: any) {
      alert(`Deploy error: ${e?.message ?? e}`);
    } finally {
      setIsDeploying(false);
    }
  }, [studio.files]);

  // ── Shared-project route (/share/:id) ─────────────────────────────────────
  React.useEffect(() => {
    const checkPath = async () => {
      const path = window.location.pathname;
      if (path.startsWith('/share/')) {
        const id = path.split('/')[2];
        const { data } = await supabase.from('projects').select('code').eq('id', id).single();
        if (data) setSharedCode(data.code);
      }
    };
    checkPath();
  }, []);

  if (sharedCode) return <iframe srcDoc={sharedCode} className="w-full h-full border-none" />;

  const activeModule: ViewId = uiStore.showAnalytics ? 'analytics'
    : uiStore.showAgentLab  ? 'agentlab'
    : view === 'engine'     ? 'engine'
    : view === 'figma'      ? 'figma'
    : view === 'architect'  ? 'architect'
    : view === 'projects'   ? 'projects'
    : 'dashboard';

  return (
    <AuthProvider>
    <GlobalErrorBoundary>
    <RootLayout>
      {/* NOTE: NO single outer Suspense here — each lazy component has its own.
          A single Suspense wrapping everything would unmount EngineWorkspace
          (and its iframe) whenever any other lazy view loads for the first time,
          causing Vite HMR removeChild crashes. */}
      <div className={`flex h-screen w-full overflow-hidden transition-colors duration-500 ${themes[studio.theme].bg}`}>

        {/* ── Vertical module sidebar — always visible ── */}
        <AppSidebar
          activeModule={activeModule}
          onNavigate={handleNavigate}
          onHome={() => setView('dashboard')}
          apiWalletPct={apiWalletPct}
          contextHealthPct={contextHealthPct}
          cloudAvailable={cloudAvailable}
          onStartBlueprint={handleStartBlueprint}
          onLaunchWithPlan={handleLaunchWithPlan}
          appLanguage={studio.appLanguage}
        />

        {/* ── EngineWorkspace — ALWAYS mounted, own Suspense so other lazy views
            loading never affect this subtree and never destroy the iframe ── */}
        <div style={{
          display: view === 'engine' ? 'flex' : 'none',
          flex: 1,
          overflow: 'hidden',
        }}>
          <Suspense fallback={<PageLoader />}>
            <EngineWorkspace
              theme={studio.theme}
              themes={themes}
              cloudAvailable={cloudAvailable}
              onShare={handleShare}
              onDeploy={handleDeploy}
              onCollab={handleCollab}
              projects={studio.projects ?? []}
              currentProjectId={studio.currentProjectId ?? null}
              totalVersions={studio.totalVersions ?? 0}
              currentVersion={studio.currentVersion ?? 0}
              messages={studio.messages}
              input={studio.input}
              setInput={studio.setInput}
              onSend={studio.onSend}
              onStop={studio.onStop}
              isGenerating={studio.isGenerating ?? false}
              progress={studio.progress ?? 0}
              currentPhase={studio.currentPhase ?? ''}
              scrollRef={studio.scrollRef}
              onNewProject={studio.onNewProject}
              onLoadProject={studio.onLoadProject}
              onDeleteProject={studio.onDeleteProject}
              onSettings={studio.onSettings}
              setTheme={studio.setTheme}
              snapshots={studio.snapshots ?? []}
              currentSnapshotId={studio.currentSnapshotId ?? null}
              onRestoreSnapshot={studio.onRestoreSnapshot}
              markSnapshotStable={studio.markSnapshotStable}
              canUndo={studio.canUndo ?? false}
              canRedo={studio.canRedo ?? false}
              onUndo={studio.onUndo}
              onRedo={studio.onRedo}
              fullContextMode={studio.fullContextMode ?? false}
              setFullContextMode={studio.setFullContextMode}
              autoRoute={studio.autoRoute}
              setAutoRoute={studio.setAutoRoute}
              generationMode={studio.generationMode as 'landing' | 'app' | 'superapp'}
              setGenerationMode={studio.setGenerationMode as (v: 'landing' | 'app' | 'superapp') => void}
              appLanguage={studio.appLanguage}
              files={studio.files ?? {}}
              setFiles={studio.setFiles}
              activeFile={studio.activeFile ?? ''}
              setActiveFile={studio.setActiveFile}
              device={studio.device ?? 'web'}
              setDevice={(d) => studio.setDevice(d as import('./hooks/useStudio').DeviceType)}
              sessionCost={studio.sessionCost ?? 0}
              sessionTokens={studio.sessionTokens ?? 0}
              projectCost={studio.projectCost ?? 0}
              projectTokens={studio.projectTokens ?? 0}
              selectedModel={studio.selectedModel ?? ''}
              apiKey={studio.apiKey}
              addLog={studio.addLog}
              isAutoFixing={studio.isAutoFixing ?? false}
              attachments={studio.attachments}
              addAttachment={studio.addAttachment}
              removeAttachment={studio.removeAttachment}
              pendingPlan={studio.pendingPlan}
              confirmPlan={studio.confirmPlan}
              cancelPlan={studio.cancelPlan}
            />
          </Suspense>
        </div>

        {/* ── Other views — each has its own Suspense so loading never
            propagates upward and never unmounts EngineWorkspace ── */}
        {view === 'architect' && (
          <div className="flex flex-1 overflow-hidden"
               style={{ animation: 'viewFadeIn 0.28s ease' }}>
            <ArchitectDashboard
              theme={studio.theme}
              projects={(studio.projects ?? []) as any[]}
              currentProjectId={studio.currentProjectId ?? null}
              onLoadProject={handleLoadProject}
              onNavigateEngine={() => setView('engine')}
            />
          </div>
        )}

        {view === 'figma' && (
          <div className="flex flex-1 overflow-hidden"
               style={{ animation: 'viewFadeIn 0.28s ease' }}>
            <Suspense fallback={<PageLoader />}>
              <PlatinumFigma
                onBack={() => setView('engine')}
                theme={studio.theme}
                figmaAccounts={studio.figmaAccounts        ?? []}
                figmaLink={studio.figmaLink                ?? ''}
                setFigmaLink={studio.setFigmaLink}
                figmaAccessResult={studio.figmaAccessResult ?? null}
                validateFigmaLink={studio.validateFigmaLink}
                figmaValidating={studio.figmaValidating    ?? false}
                currentProjectTheme={studio.currentProjectTheme ?? null}
                syncProgress={studio.syncProgress          ?? { step: 'idle', message: '', pct: 0 }}
                syncFigmaUrl={studio.syncFigmaUrl}
                startFigmaSync={studio.startFigmaSync}
                files={studio.files                        ?? {}}
                addSystemMessage={studio.addSystemMessage}
                targetMarket={studio.targetMarket          ?? 'USA'}
                setTargetMarket={studio.setTargetMarket}
                auditStrictness={studio.auditStrictness    ?? 'normal'}
                setAuditStrictness={studio.setAuditStrictness}
                apiKey={studio.apiKey                    ?? ''}
                selectedModel={studio.selectedModel      ?? ''}
                figmaProjects={studio.figmaProjects        ?? []}
                activeFigmaProjectId={studio.activeFigmaProjectId ?? null}
                saveFigmaProject={studio.saveFigmaProject}
                loadFigmaProject={studio.loadFigmaProject}
                deleteFigmaProject={studio.deleteFigmaProject}
                markFigmaProjectSynced={studio.markFigmaProjectSynced}
                clearFigmaSync={studio.clearFigmaSync}
              />
            </Suspense>
          </div>
        )}

        {view === 'projects' && (
          <div className="flex flex-1 overflow-hidden"
               style={{ animation: 'viewFadeIn 0.28s ease' }}>
            <Suspense fallback={<PageLoader />}>
              <ProjectsScreen
                projects={studio.projects ?? []}
                currentProjectId={studio.currentProjectId ?? null}
                onLoadProject={handleLoadProject}
                onDeleteProject={studio.onDeleteProject}
                onNewProject={studio.onNewProject}
                onRefreshProjects={studio.refreshProjects}
                theme={studio.theme}
              />
            </Suspense>
          </div>
        )}

        {view === 'dashboard' && (
          <div className="flex flex-1 overflow-hidden"
               style={{ animation: 'viewFadeIn 0.28s ease' }}>
            <Suspense fallback={<PageLoader />}>
              <Dashboard
                sessionCost={studio.sessionCost     ?? 0}
                sessionTokens={studio.sessionTokens ?? 0}
                cloudAvailable={cloudAvailable}
                projects={studio.projects ?? []}
                onEnterEngine={() => setView('engine')}
                onNavigateFigma={() => setView('figma')}
                onLoadProject={handleLoadProject}
                onStartBlueprint={handleStartBlueprint}
                appLanguage={studio.appLanguage}
              />
            </Suspense>
          </div>
        )}
      </div>

      {/* ── Modals — each has its own Suspense ── */}
      {studio.showSettings && (
        <Suspense fallback={null}>
          <SettingsModal
            isOpen={studio.showSettings}
            onClose={() => studio.setShowSettings(false)}
            theme={studio.theme}
            setTheme={(t: string) => studio.setTheme(t as 'dark' | 'medium' | 'light')}
            apiKey={studio.apiKey ?? ''}
            setApiKey={studio.setApiKey}
            appLanguage={studio.appLanguage}
            setAppLanguage={studio.setAppLanguage}
            onDownloadSnapshot={sync.handleDownloadSnapshot}
            onRestoreFromFile={sync.handleRestoreFromFile}
            canUndoRestore={sync.canUndoRestore}
            onUndoRestore={sync.handleUndoRestore}
            figmaAccounts={studio.figmaAccounts}
            addFigmaAccount={studio.addFigmaAccount}
            removeFigmaAccount={studio.removeFigmaAccount}
            agentConfigs={studio.agentConfigs}
            setAgentConfig={studio.setAgentConfig}
          />
        </Suspense>
      )}

      {showCollab && (
        <Suspense fallback={null}>
          <CollabModal
            isOpen={showCollab}
            onClose={() => setShowCollab(false)}
            files={studio.files ?? {}}
            onFilesChange={studio.setFiles}
            currentTheme={studio.theme}
          />
        </Suspense>
      )}

      {showDeploy && (
        <Suspense fallback={null}>
          <DeployModal
            isOpen={showDeploy}
            onClose={() => setShowDeploy(false)}
            files={studio.files ?? {}}
            currentTheme={studio.theme}
            currentProjectId={studio.currentProjectId ?? null}
          />
        </Suspense>
      )}

      {/* ── Analytics floating panel — right slide-in ── */}
      {uiStore.showAnalytics && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', justifyContent: 'flex-end' }}>
          <div
            onClick={() => uiStore.setShowAnalytics(false)}
            style={{ flex: 1, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
          />
          <div style={{
            width: 480, height: '100vh', background: '#050505',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            animation: 'slideInRight 0.22s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, background: '#080810' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Analytics</span>
              <button onClick={() => uiStore.setShowAnalytics(false)} style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>×</button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <Suspense fallback={<PageLoader />}>
                <AnalyticsDashboard
                  onSendToAgent={(task) => uiStore.openAgentLabWithTask(task)}
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {/* ── AgentLab modal — centre overlay ── */}
      {uiStore.showAgentLab && (
        <div
          onClick={() => uiStore.setShowAgentLab(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 400,
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '80vw', height: '80vh', background: '#06060a',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16,
              overflow: 'hidden', display: 'flex', flexDirection: 'column',
              animation: 'scaleIn 0.22s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, background: '#080810' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Agent Lab</span>
              <button onClick={() => uiStore.setShowAgentLab(false)} style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>×</button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <Suspense fallback={<PageLoader />}>
                <AgentLabPanel
                  files={studio.files ?? {}}
                  agentConfigs={studio.agentConfigs ?? {}}
                  currentTheme={studio.theme}
                  onApplyFiles={studio.setFiles}
                  addLog={studio.addLog}
                  initialTask={uiStore.agentLabTask}
                  onNavigate={(v) => { uiStore.setShowAgentLab(false); setView(v as ViewId); }}
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes viewFadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0);    }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1);    }
        }
      `}</style>
    </RootLayout>
    </GlobalErrorBoundary>
    </AuthProvider>
  );
}
