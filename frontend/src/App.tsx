import React, { Suspense, lazy } from 'react';
import { RootLayout }           from './layouts/RootLayout';
import { AppSidebar }           from './components/AppSidebar';
import ArchitectDashboard       from './modules/architect/ArchitectDashboard';
const EngineWorkspace    = lazy(() => lazyWithRetry(() => import('./modules/engine/EngineWorkspace')).then(m => ({ default: m.EngineWorkspace })));

const Dashboard          = lazy(() => lazyWithRetry(() => import('./components/Dashboard')).then(m => ({ default: m.Dashboard })));
const ProjectsPage       = lazy(() => lazyWithRetry(() => import('./pages/ProjectsPage')));
const PlatinumFigma      = lazy(() => lazyWithRetry(() => import('./components/PlatinumFigma')).then(m => ({ default: m.PlatinumFigma })));
const AgentLabPanel      = lazy(() => lazyWithRetry(() => import('./components/AgentLabPanel')).then(m => ({ default: m.AgentLabPanel })));
const BenchmarkDashboard    = lazy(() => lazyWithRetry(() => import('./components/BenchmarkDashboard')));
const SupabaseConsolePanel  = lazy(() => lazyWithRetry(() => import('./components/SupabaseConsolePanel')).then(m => ({ default: m.SupabaseConsolePanel })));
const CodeStudioWorkspace = lazy(() => lazyWithRetry(() => import('./modules/code-studio/CodeStudioWorkspace')));
const AnalyticsDashboard = lazy(() => lazyWithRetry(() => import('./modules/analytics')).then(m => ({ default: m.AnalyticsDashboard })));
const SettingsModal      = lazy(() => lazyWithRetry(() => import('./components/SettingsModal')).then(m => ({ default: m.SettingsModal })));
const DeployModal        = lazy(() => lazyWithRetry(() => import('./components/DeployModal')).then(m => ({ default: m.DeployModal })));
const CollabModal        = lazy(() => lazyWithRetry(() => import('./components/CollabModal')).then(m => ({ default: m.CollabModal })));
const DiffPreview        = lazy(() => lazyWithRetry(() => import('./components/DiffPreview')).then(m => ({ default: m.DiffPreview })));


const PageLoader = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100%', color: 'var(--muted-foreground)', fontSize: 13 }}>
    Loading…
  </div>
);
import { GlobalErrorBoundary } from './components/GlobalErrorBoundary';
import { StudioToast }          from './components/StudioToast';
import { StudioTerminal }       from './components/StudioTerminal';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useStudio }            from './hooks/useStudio';
import { LoginPage }            from './pages/LoginPage';
import { useProjectSync }      from './hooks/useProjectSync';
import { useUIStore }          from './hooks/useUIStore';
import { supabase }             from './lib/supabase';
import { storageService }          from './services/storageService';
import { ConfigService }           from './services/ConfigService';
import { FigmaOAuthService }       from './services/FigmaOAuthService';
import { metricsService }       from './services/MetricsService';
import { ShareService }            from './services/ShareService';
import { isCreatorMode }          from './services/internalAccess';
import type { ModuleId, ViewId } from './shared/types';

const CODE_STUDIO_INTENT_PREFIX = '__OPEN_CODE_STUDIO__';
const CODE_STUDIO_INPUT_KEY = 'AIC_CODE_STUDIO_INITIAL_INPUT';
const LAZY_RELOAD_KEY = 'AIC_LAZY_RELOAD_DONE';

function lazyWithRetry<T>(importer: () => Promise<T>): Promise<T> {
  return importer().then((module) => {
    try {
      sessionStorage.removeItem(LAZY_RELOAD_KEY);
    } catch {
      // no-op
    }
    return module;
  }).catch((error) => {
    const msg = String((error as Error)?.message ?? error ?? '');
    const isDynamicImportError = /Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg);
    if (!isDynamicImportError) throw error;

    let alreadyReloaded = false;
    try {
      alreadyReloaded = sessionStorage.getItem(LAZY_RELOAD_KEY) === '1';
    } catch {
      alreadyReloaded = false;
    }
    if (!alreadyReloaded) {
      try {
        sessionStorage.setItem(LAZY_RELOAD_KEY, '1');
      } catch {
        // no-op
      }
      window.location.reload();
    }
    throw error;
  });
}

export default function App() {
  const studio  = useStudio();
  const uiStore = useUIStore();
  const creatorMode = isCreatorMode();

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

  // ── Global console capture → Stability Terminal ──────────────────────────
  // Intercepts console.error / console.warn / window errors permanently,
  // forwards to window.__stabilityLog (registered by DevModePanel on mount).
  React.useEffect(() => {
    const origError = console.error.bind(console);
    const origWarn  = console.warn.bind(console);

    const fmt = (args: unknown[]) =>
      args.map(a => {
        if (a instanceof Error) return `${a.name}: ${a.message}${a.stack ? '\n' + a.stack.split('\n').slice(1, 4).join('\n') : ''}`;
        if (typeof a === 'object') { try { return JSON.stringify(a); } catch { return String(a); } }
        return String(a);
      }).join(' ');

    console.error = (...args: unknown[]) => {
      origError(...args);
      const msg = fmt(args);
      if (/Warning: React does not recognize|Each child in a list/.test(msg)) return;
      try {
        (window as any).__stabilityLog?.({
          level: 'error', source: 'console',
          message: msg.slice(0, 120),
          detail: msg.length > 120 ? msg : undefined,
        });
      } catch {}
    };

    console.warn = (...args: unknown[]) => {
      origWarn(...args);
      const msg = fmt(args);
      if (/Warning: React/.test(msg)) return;
      try {
        (window as any).__stabilityLog?.({
          level: 'warn', source: 'console',
          message: msg.slice(0, 120),
          detail: msg.length > 120 ? msg : undefined,
        });
      } catch {}
    };

    const onStabilityError = (e: ErrorEvent) => {
      try {
        (window as any).__stabilityLog?.({
          level: 'error', source: 'window',
          message: e.message,
          detail: e.filename + ':' + e.lineno,
        });
      } catch {}
    };

    const onUnhandledStability = (e: PromiseRejectionEvent) => {
      try {
        (window as any).__stabilityLog?.({
          level: 'error', source: 'promise',
          message: String(e.reason),
        });
      } catch {}
    };

    window.addEventListener('error', onStabilityError);
    window.addEventListener('unhandledrejection', onUnhandledStability);

    return () => {
      console.error = origError;
      console.warn  = origWarn;
      window.removeEventListener('error', onStabilityError);
      window.removeEventListener('unhandledrejection', onUnhandledStability);
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
  const [codeStudioInitialIdea, setCodeStudioInitialIdea] =
    React.useState<{ title: string; description: string } | null>(null);
  const handleOpenInCodeStudio = React.useCallback((idea: {
    title: string;
    description: string;
  }) => {
    setCodeStudioInitialIdea(idea);
    try { localStorage.setItem(CODE_STUDIO_INPUT_KEY, `${idea.title}: ${idea.description}`); } catch { /* ignore quota */ }
    setView('code-studio');
  }, []);


  // ── Ctrl+` navigates to terminal view (except inside Code Studio) ────────────
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        if (view !== 'code-studio') setView(prev => prev === 'terminal' ? 'dashboard' : 'terminal');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [view]);

  // ── Init storageService + subscribe to connectivity ────────────────────────
  React.useEffect(() => {
    localStorage.removeItem('SELECTED_MODEL');
    void ConfigService.loadFromBackend();
    void ConfigService.loadProviderKeysFromBackend();
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
    if (id === 'benchmark')    setView('benchmark');
    if (id === 'code-studio' && creatorMode) setView('code-studio');
    if (id === 'db-console')   setView('db-console');
  };

  const handleLoadProject = (p: any) => {
    studio.loadProject(p);
    setView('engine');
  };

  const handleStartBlueprint = (text: string) => {
    studio.addComposerContextFromPlan(null, text, 'manual');
    setView('engine');
  };

  const handleLaunchWithPlan = React.useCallback((plan: any, intent: string, source?: 'chat' | 'weekly-feed' | 'niche' | 'weekly-feed-code-studio') => {
    const fromWeeklyCodeStudio = source === 'weekly-feed-code-studio' || intent.startsWith(CODE_STUDIO_INTENT_PREFIX);
    if (fromWeeklyCodeStudio) {
      const cleanedIntent = intent.startsWith(CODE_STUDIO_INTENT_PREFIX)
        ? intent.slice(CODE_STUDIO_INTENT_PREFIX.length)
        : intent;
      handleOpenInCodeStudio({
        title: String(plan?.appName ?? ''),
        description: String(plan?.description ?? cleanedIntent ?? ''),
      });
      return;
    }
    setView('engine');
    studio.launchWithPlan(plan, intent, source);
  }, [studio, handleOpenInCodeStudio]);

  // ── Modal openers — stable refs ───────────────────────────────────────────
  const handleDeploy = React.useCallback(() => setShowDeploy(true), []);
  const handleCollab = React.useCallback(() => setShowCollab(true), []);

  // ── Share — instant Supabase snapshot link (no Vercel deploy required) ──────
  const [isDeploying, setIsDeploying] = React.useState(false);
  const [shareUrl,    setShareUrl]    = React.useState<string | null>(null);

  const handleShare = React.useCallback(async () => {
    if (Object.keys(studio.files).length === 0) return alert('Сначала создайте что-нибудь!');
    setIsDeploying(true);
    setShareUrl(null);
    try {
      // Try Supabase instant share first
      const thumbnail = studio.currentProjectId
        ? (await import('./lib/screenshotCache')).getScreenshot(studio.currentProjectId)
        : null;

      const result = await ShareService.createShareLink(studio.files, {
        title:     (studio as any).projectName ?? 'Studio Project',
        thumbnail: thumbnail ?? undefined,
        projectId: studio.currentProjectId ?? undefined,
      });

      if (result.ok && result.url) {
        const fullUrl = window.location.origin + result.url;
        setShareUrl(fullUrl);
        await navigator.clipboard.writeText(fullUrl).catch(() => {});
        alert(`Share link ready!\n${fullUrl}\n\n(Copied to clipboard · expires in 7 days)`);
      } else {
        alert(`Share failed: ${result.error ?? 'Unknown error'}`);
      }
    } catch (e: any) {
      alert(`Share error: ${e?.message ?? e}`);
    } finally {
      setIsDeploying(false);
    }
  }, [studio.files, studio.currentProjectId]);

  // ── Shared-project route (/share/:id) ─────────────────────────────────────
  React.useEffect(() => {
    const checkPath = async () => {
      const path = window.location.pathname;
      if (!path.startsWith('/share/')) return;
      const id = path.split('/')[2];
      if (!id) return;

      // Try shared_snapshots first (new path — share_id lookup)
      const { data: snap } = await supabase
        .from('shared_snapshots')
        .select('html_entry, files')
        .eq('share_id', id)
        .single();
      if (snap) {
        if (snap.html_entry) {
          setSharedCode(snap.html_entry);
          return;
        }
        // Fallback: extract /index.html from files jsonb
        const filesMap = snap.files as Record<string, string> | null;
        if (filesMap) {
          const html = filesMap['/index.html'] ?? filesMap['index.html'] ?? null;
          if (html) { setSharedCode(html); return; }
        }
      }

      // Legacy fallback: old projects table
      const { data: legacy } = await supabase
        .from('user_projects')
        .select('code_snapshot')
        .eq('id', id)
        .single();
      if (legacy?.code_snapshot) {
        try {
          const parsed = JSON.parse(legacy.code_snapshot as string) as Record<string, string>;
          const html = parsed['/index.html'] ?? parsed['index.html'] ?? null;
          if (html) setSharedCode(html);
        } catch {
          setSharedCode(legacy.code_snapshot as string);
        }
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
    : view === 'benchmark'    ? 'benchmark'
    : view === 'code-studio' && creatorMode ? 'code-studio'
    : view === 'terminal'    ? 'terminal'
    : view === 'db-console'  ? 'db-console'
    : 'dashboard';

  return (
    <AuthProvider>
    <AuthGate>
    <GlobalErrorBoundary>
    <RootLayout>
      {/* NOTE: NO single outer Suspense here — each lazy component has its own.
          A single Suspense wrapping everything would unmount EngineWorkspace
          (and its iframe) whenever any other lazy view loads for the first time,
          causing Vite HMR removeChild crashes. */}
      <div className={`flex h-full w-full max-w-none overflow-hidden transition-colors duration-500 ${themes[studio.theme].bg}`}>

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
              lastStableVersion={studio.lastStableVersion}
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
              onRollback={studio.rollbackToStable}
              onRetry={studio.onSend}
              attachments={studio.attachments}
              addAttachment={studio.addAttachment}
              removeAttachment={studio.removeAttachment}
              composerContextItems={studio.composerContextItems}
              removeComposerContextItem={studio.removeComposerContextItem}
              clearComposerContextItems={studio.clearComposerContextItems}
              pendingPlan={studio.pendingPlan}
              confirmPlan={studio.confirmPlan}
              cancelPlan={studio.cancelPlan}
              studioPhase={studio.studioPhase}
              studioError={studio.studioError}
              previewLifecycle={studio.previewLifecycle}
              previewBlockedReason={studio.previewBlockedReason}
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
              <ProjectsPage
                theme={studio.theme}
                currentProjectId={studio.currentProjectId ?? null}
                onLoadProject={(project) => {
                  studio.loadProject(project);
                  setView('engine');
                }}
                onNewProject={() => {
                  studio.onNewProject();
                  setView('engine');
                }}
              />
            </Suspense>
          </div>
        )}

        {view === 'benchmark' && (
          <div className="flex flex-1 overflow-hidden"
               style={{ animation: 'viewFadeIn 0.28s ease' }}>
            <Suspense fallback={<PageLoader />}>
              <BenchmarkDashboard
                apiKey={studio.apiKey ?? ''}
                selectedModel={studio.selectedModel ?? ''}
              />
            </Suspense>
          </div>
        )}

        {creatorMode && view === 'code-studio' && (
          <div className="flex flex-1 overflow-hidden"
               style={{ animation: 'viewFadeIn 0.28s ease' }}>
            <Suspense fallback={<PageLoader />}>
              <CodeStudioWorkspace
                theme={studio.theme}
                files={studio.files ?? {}}
                setFiles={studio.setFiles}
                activeFile={studio.activeFile ?? ''}
                setActiveFile={studio.setActiveFile}
                apiKey={studio.apiKey ?? ''}
                addLog={studio.addLog}
                initialInput={codeStudioInitialIdea
                  ? `${codeStudioInitialIdea.title}: ${codeStudioInitialIdea.description}`
                  : undefined}
                onBack={() => {
                  setCodeStudioInitialIdea(null);
                  setView('dashboard');
                }}
              />
            </Suspense>
          </div>
        )}

        {view === 'terminal' && (
          <div className="flex flex-1 overflow-hidden"
               style={{ animation: 'viewFadeIn 0.28s ease' }}>
            <StudioTerminal
              logs={studio.logs}
              modules={[
                { name: 'LLM',     status: studio.isGenerating ? 'ok' : studio.apiKey ? 'ok' : 'error' },
                { name: 'Preview', status: 'ok' },
                { name: 'Cloud',   status: cloudAvailable ? 'ok' : 'idle' },
              ]}
              supabaseOk={cloudAvailable}
              onClear={studio.clearLogs}
            />
          </div>
        )}

        {view === 'db-console' && (
          <div className="flex flex-1 overflow-hidden"
               style={{ animation: 'viewFadeIn 0.28s ease' }}>
            <Suspense fallback={<PageLoader />}>
              <SupabaseConsolePanel theme={studio.theme} />
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
                onNavigateCodeStudio={creatorMode ? () => setView('code-studio') : undefined}
                onLoadProject={handleLoadProject}
                onStartBlueprint={handleStartBlueprint}
                onLaunchWithPlan={(plan, intent, source) => handleLaunchWithPlan(plan, intent, source)}
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

      {studio.pendingDiff && (
        <Suspense fallback={null}>
          <DiffPreview
            diffs={studio.pendingDiff}
            theme={studio.theme}
            onApply={studio.approveDiff}
            onReject={studio.rejectDiff}
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

      {/* Global terminal is now a sidebar-navigated full-page view (view === 'terminal') */}
      <StudioToast />
    </RootLayout>
    </GlobalErrorBoundary>
    </AuthGate>
    </AuthProvider>
  );
}

/** Gates the app behind authentication. Shows LoginPage when signed out. */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#050505]">
        <div className="w-5 h-5 border-2 border-white/10 border-t-blue-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return <>{children}</>;
}
