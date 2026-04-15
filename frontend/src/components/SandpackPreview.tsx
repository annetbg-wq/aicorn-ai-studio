/**
 * SandpackPreview.tsx — Preview display layer.
 *
 * This component is a DISPLAY layer only.
 *
 * Architecture:
 *   - React/TSX projects → iframe pointing to dynamic preview-manager URL
 *   - HTML/Alpine projects → srcdoc iframe (no sandbox involved)
 *   - Empty state → welcome screen (srcdoc)
 *
 * Preview pipeline:
 *   SimpleGeneration writes to preview workspace → Vite HMR → iframe
 *
 * No materialization, no revisions, no sandbox. One canonical path.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { FileMap } from '../hooks/useStudio';
import { previewController, type PreviewState } from '../services/PreviewController';
import { revisionManager } from '../services/RevisionManager';
import { SimpleGeneration } from '../services/SimpleGeneration';
import { useProjectScreenshot } from '../hooks/useProjectScreenshot';
import { resolvePreviewUI } from '../services/previewLifecycleResolver';
import { visualEditBridge, type VisualEditState, type SelectedElement } from '../services/VisualEditBridge';
import { WhiteScreenDetector } from '../services/WhiteScreenDetector';

const PREVIEW_URL = (import.meta.env.VITE_PREVIEW_ORIGIN || 'http://127.0.0.1:5183').replace(/\/$/, '');

/* ── Welcome / Loading bundles (IIFE, used for srcdoc path only) ─────────────── */

const WELCOME_BUNDLE = `
var __AppBundle__ = (function() {
  function App() {
    var s = React.useState(''); var dots = s[0]; var setDots = s[1];
    React.useEffect(function() {
      var t = setInterval(function() { setDots(function(d) { return d.length >= 3 ? '' : d + '.'; }); }, 500);
      return function() { clearInterval(t); };
    }, []);
    return React.createElement('div', {
      style: { minHeight:'100vh', backgroundColor:'#050508', display:'flex', flexDirection:'column',
               alignItems:'center', justifyContent:'center',
               fontFamily:"'Inter', system-ui, sans-serif", color:'rgba(255,255,255,0.85)' }
    },
      React.createElement('div', { style: { fontSize:56, marginBottom:20, lineHeight:'1' } }, '\u26a1'),
      React.createElement('h1', { style: { fontSize:24, fontWeight:800, letterSpacing:'-0.04em', margin:'0 0 10px 0' } },
        'AIC-RG Studio'),
      React.createElement('p', { style: { color:'rgba(255,255,255,0.35)', fontSize:14, margin:'0' } },
        'Describe your idea \u2014 AI builds the app' + dots)
    );
  }
  return { default: App };
})();
`.trim();

const LOADING_BUNDLE = `
var __AppBundle__ = (function() {
  function App() {
    return React.createElement('div', {
      style: { minHeight:'100vh', backgroundColor:'#050508', display:'flex', alignItems:'center',
               justifyContent:'center', fontFamily:"'Inter',system-ui,sans-serif",
               color:'rgba(255,255,255,0.3)', fontSize:13, gap:8 }
    },
      React.createElement('span', { style: { animation:'spin 1s linear infinite', display:'inline-block' } }, '\u29d7'),
      'Building\u2026'
    );
  }
  return { default: App };
})();
`.trim();

const WAITING_BUNDLE = `
var __AppBundle__ = (function() {
  function App() {
    return React.createElement('div', {
      style: { minHeight:'100vh', backgroundColor:'#050508', display:'flex', flexDirection:'column',
               alignItems:'center', justifyContent:'center',
               fontFamily:"'Inter',system-ui,sans-serif", color:'rgba(255,255,255,0.4)', gap:12 }
    },
      React.createElement('div', { style: { fontSize:36, opacity:0.5 } }, '\u23f3'),
      React.createElement('div', { style: { fontSize:13, fontWeight:500 } }, 'Waiting for first build\u2026'),
      React.createElement('div', { style: { fontSize:11, opacity:0.5 } }, 'Describe your idea in the chat and press Send')
    );
  }
  return { default: App };
})();
`.trim();

/* ── HTML Builder (srcdoc path — HTML/Alpine + welcome/loading) ─────────────── */

const buildHtml = (bundledCode: string): string => {
  const safeCode = bundledCode.replace(/<\/script>/gi, '<\\/script>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js" crossorigin></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js" crossorigin></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body, #root { width: 100%; height: 100%; margin: 0; padding: 0; }
    body { font-family: 'Inter', system-ui, sans-serif; background: #0a0a0a; }
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="root"></div>
  <div id="error-overlay" style="display:none;position:fixed;inset:0;background:#0d0010;color:#ff6b9d;font-family:monospace;font-size:13px;padding:24px;overflow:auto;z-index:99999;white-space:pre-wrap;line-height:1.6;"></div>
  <script>
    window.__showError = function(msg) {
      var el = document.getElementById('error-overlay');
      if (el) { el.style.display = 'block'; el.textContent = '\uD83D\uDD34 Runtime Error: ' + msg; }
      try { window.parent.postMessage({ type: 'iframe-error', message: String(msg).slice(0, 600) }, '*'); } catch(e) {}
    };
    window.onerror = function(msg, src, line, col, err) {
      window.__showError((err ? err.stack : msg) || msg);
    };
    window.addEventListener('unhandledrejection', function(e) {
      window.__showError(e.reason ? (e.reason.stack || e.reason.toString()) : 'Unhandled promise rejection');
    });
  </script>
  <script>
    if (window.__REACT_LOADED__) { console.warn('[preview] React already loaded, skipping bundle'); }
    window.__REACT_LOADED__ = true;
    window.React = window.React || {};
    window.ReactDOM = window.ReactDOM || {};
  </script>
  <script>${safeCode}</script>
  <script>
    (function() {
      var rootEl = document.getElementById('root');
      if (!rootEl) return;
      var App = (typeof __AppBundle__ !== 'undefined')
        ? (__AppBundle__['default'] || __AppBundle__)
        : null;
      if (typeof App !== 'function') {
        rootEl.innerHTML = '<div style="padding:24px;color:#ff6b9d;font-family:monospace;font-size:13px;background:#0d0010;min-height:100vh">\uD83D\uDD34 Error: <b>App</b> not found in bundle.<br><br>Make sure your entry file has: <b>export default function App()</b></div>';
        try { window.parent.postMessage({ type: 'iframe-error', message: 'App not found in bundle' }, '*'); } catch(e) {}
        return;
      }
      try {
        var root = ReactDOM.createRoot(rootEl);
        root.render(React.createElement(App));
      } catch(e) {
        window.__showError(e.stack || e.message);
      }
    })();
  </script>
</body>
</html>`;
};

/* ── HTML/Alpine builder ─────────────────────────────────────────────────────── */

const buildAlpineHtml = (files: FileMap): string => {
  const htmlKey = Object.keys(files).find(k => k.endsWith('.html'));
  const raw = (htmlKey ? files[htmlKey] : Object.values(files)[0]) ?? '';
  const t = raw.trim();
  if (!t) return '';
  const l = t.toLowerCase();
  if (l.startsWith('<!doctype') || l.startsWith('<html')) return t;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <script src="https://cdn.tailwindcss.com/3.4.1"></script>
  <script defer src="https://unpkg.com/alpinejs@3.13.5/dist/cdn.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>*,*::before,*::after{box-sizing:border-box}body{margin:0;font-family:'Inter',system-ui}</style>
</head>
<body>${t}</body>
</html>`;
};

/* ── Project type detection ──────────────────────────────────────────────────── */

const isHtmlProject = (files: FileMap): boolean => {
  const keys = Object.keys(files);
  const hasTsx  = keys.some(k => /\.(tsx|jsx)$/.test(k));
  const hasHtml = keys.some(k => k.endsWith('.html'));
  return hasHtml && !hasTsx;
};

/* ── Content hash (for stable srcdoc iframe key) ────────────────────────────── */

const hashCode = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
};

/* ── Simple Code Editor ──────────────────────────────────────────────────────── */

interface CodeEditorProps {
  files:         FileMap;
  setFiles:      (f: FileMap) => void;
  activeFile:    string;
  setActiveFile: (n: string) => void;
  theme:         'dark' | 'light';
}

export const SimpleCodeEditor: React.FC<CodeEditorProps> = ({
  files, setFiles, activeFile, setActiveFile, theme,
}) => {
  const code    = files[activeFile] ?? '';
  const isDark  = theme === 'dark';
  const bg      = isDark ? '#0d0d14' : '#fafafa';
  const fg      = isDark ? 'rgba(255,255,255,0.82)' : '#1a1a2e';
  const tabBg   = isDark ? '#080810' : '#f0f0f5';
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', backgroundColor: bg }}>
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        borderBottom: `1px solid ${isDark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.08)'}`,
        backgroundColor: tabBg, flexShrink:0, paddingRight: 8,
      }}>
        <div style={{ display:'flex', overflowX:'auto' }}>
          {Object.keys(files).map(name => (
            <button key={name} onClick={() => setActiveFile(name)}
              style={{
                padding:'7px 14px', fontSize:11, fontFamily:'monospace', border:'none', cursor:'pointer',
                whiteSpace:'nowrap', backgroundColor: name===activeFile ? bg : 'transparent',
                color: name===activeFile ? (isDark?'#fff':'#000') : (isDark?'rgba(255,255,255,0.4)':'rgba(0,0,0,0.45)'),
                borderBottom: name===activeFile ? '2px solid #6366f1' : '2px solid transparent',
                transition:'all 0.15s',
              }}>
              {name.replace(/^\//,'')}
            </button>
          ))}
        </div>
        <button onClick={copy} style={{
          padding:'4px 10px', fontSize:10, borderRadius:6, border:'none', cursor:'pointer', flexShrink:0,
          backgroundColor: copied ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.06)',
          color: copied ? '#818cf8' : (isDark?'rgba(255,255,255,0.4)':'rgba(0,0,0,0.4)'),
          fontFamily:'monospace', transition:'all 0.2s',
        }}>
          {copied ? '\u2713 Copied' : 'Copy'}
        </button>
      </div>
      <textarea
        value={code}
        onChange={e => setFiles({ ...files, [activeFile]: e.target.value })}
        spellCheck={false}
        style={{
          flex:1, border:'none', outline:'none', resize:'none',
          padding:'16px 20px', fontSize:13, lineHeight:1.7,
          fontFamily:"'JetBrains Mono','Fira Code','Cascadia Code','Courier New',monospace",
          backgroundColor: bg, color: fg, tabSize: 2,
        }}
        onKeyDown={e => {
          if (e.key === 'Tab') {
            e.preventDefault();
            const el = e.currentTarget;
            const start = el.selectionStart;
            const end   = el.selectionEnd;
            const newCode = code.substring(0, start) + '  ' + code.substring(end);
            setFiles({ ...files, [activeFile]: newCode });
            requestAnimationFrame(() => {
              el.selectionStart = el.selectionEnd = start + 2;
            });
          }
        }}
      />
    </div>
  );
};

/* ── Props ───────────────────────────────────────────────────────────────────── */

interface SandpackViewProps {
  files:            FileMap;
  activeFile:       string;
  setActiveFile:    (n: string) => void;
  theme?:           'dark' | 'light';
  studioTheme?:     'dark' | 'medium' | 'light';
  /** Current device key (desktop | iphone | pixel | ipad). Forwarded to preview-workspace
   *  via postMessage so the app can set html[data-device]. */
  device?:          string;
  /** Project ID used to cache screenshots in localStorage. */
  projectId?:       string | null;
  onError?:         (msg: string) => void;
  onPreviewReady?:  () => void;
  onFixWithAI?:     () => void;
  onRollback?:      () => void;
  isAutoFixing?:    boolean;
  /** True while AI is generating — shows "Building your app…" overlay instead of
   *  the live iframe so React state changes and HMR updates can't race. */
  isGenerating?:    boolean;
  /** API key for direct auto-fix calls from the failed overlay. */
  apiKey?:          string;
  /**
   * Preview lifecycle stage from useStudio. Richer than PreviewController's
   * 5-status model — distinguishes 'degraded' from 'failed' and carries
   * 'blocked' / 'committing' / 'materializing' stages.
   *
   * SandpackView uses this to show differentiated overlays:
   *   - 'degraded': last working version still visible (softer messaging)
   *   - 'blocked':  quality check prevented preview (show blockedReason)
   */
  previewLifecycle?:      string;
  /** Human-readable reason when previewLifecycle === 'blocked'. */
  previewBlockedReason?:  string | null;
  /**
   * Called when the user selects an element in visual-edit mode.
   * Receives the selected element descriptor — host can open an edit prompt.
   */
  onVisualElementSelected?: (element: SelectedElement) => void;
  /** Whether visual-edit element picker is active (controlled from outside). */
  visualEditActive?: boolean;
}

/* ── Main export ─────────────────────────────────────────────────────────────── */

export const SandpackView: React.FC<SandpackViewProps> = ({
  files,
  activeFile,
  setActiveFile,
  theme           = 'dark',
  studioTheme,
  device          = 'desktop',
  projectId,
  onError,
  onPreviewReady,
  onFixWithAI,
  onRollback,
  isAutoFixing    = false,
  isGenerating    = false,
  apiKey,
  previewLifecycle,
  previewBlockedReason,
  onVisualElementSelected,
  visualEditActive = false,
}) => {
  const [runtimeError,      setRuntimeError]      = useState<string | null>(null);
  const [isFixing,          setIsFixing]           = useState(false);
  const [fixFailed,         setFixFailed]          = useState(false);
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  const [iframeLoaded,      setIframeLoaded]       = useState(false);
  const [previewServerDown, setPreviewServerDown]  = useState(false);
  const [previewState,      setPreviewState]       = useState<PreviewState>(previewController.getState());
  const onPreviewReadyRef   = useRef(onPreviewReady);
  onPreviewReadyRef.current = onPreviewReady;

  const viteIframeRef   = useRef<HTMLIFrameElement>(null);
  const srcdocIframeRef = useRef<HTMLIFrameElement>(null);
  const whiteScreenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── VisualEditBridge: attach/detach and sync active state ─────────────────
  useEffect(() => {
    if (!viteIframeRef.current) return;
    visualEditBridge.attach(viteIframeRef.current);
    return () => visualEditBridge.detach();
  }, []); // attach once on mount

  useEffect(() => {
    if (!onVisualElementSelected) return;
    return visualEditBridge.subscribe((state: VisualEditState) => {
      if (state.mode === 'selected' && state.selected) {
        onVisualElementSelected(state.selected);
      }
    });
  }, [onVisualElementSelected]);

  // Sync external visualEditActive prop → bridge
  useEffect(() => {
    if (visualEditActive) {
      visualEditBridge.enableSelection();
    } else {
      visualEditBridge.disableSelection();
    }
  }, [visualEditActive]);

  // Probe whether the preview-workspace dev server is reachable
  useEffect(() => {
    let cancelled = false;
    fetch(PREVIEW_URL, { mode: 'no-cors' })
      .then(() => { if (!cancelled) setPreviewServerDown(false); })
      .catch(() => { if (!cancelled) setPreviewServerDown(true); });
    return () => { cancelled = true; };
  }, []);

  const { captureFromViteIframe } = useProjectScreenshot();

  // Auto-capture screenshot 2 s after the preview becomes stable
  // Also saves a per-revision thumbnail using the active revision ID from PreviewController.
  const scheduleScreenshotRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureScreenshot = useCallback(() => {
    if (!projectId) return;
    if (scheduleScreenshotRef.current) clearTimeout(scheduleScreenshotRef.current);
    scheduleScreenshotRef.current = setTimeout(() => {
      const revId = previewState.activeRevisionId ?? null;
      captureFromViteIframe(viteIframeRef.current, projectId, revId);
    }, 2_000);
  }, [projectId, captureFromViteIframe, previewState.activeRevisionId]);
  useEffect(() => () => {
    if (scheduleScreenshotRef.current) clearTimeout(scheduleScreenshotRef.current);
    if (whiteScreenTimerRef.current) clearTimeout(whiteScreenTimerRef.current);
  }, []);

  // ── PreviewController subscription ──────────────────────────────
  useEffect(() => {
    return previewController.subscribe(setPreviewState);
  }, []);

  // React to PreviewController state transitions
  const prevStatusRef = useRef(previewState.status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = previewState.status;

    if (previewState.status === 'compiling') {
      setRuntimeError(null);
      setIframeLoaded(false);
    }

    // Reset auto-fix local state when leaving 'failed'
    if (prev === 'failed' && previewState.status !== 'failed') {
      setIsFixing(false);
      setFixFailed(false);
    }

    if (previewState.status === 'failed' && previewState.error) {
      setRuntimeError(previewState.error);
      onError?.('Preview: ' + previewState.error);
    }

    if (previewState.status === 'ready' && prev !== 'ready') {
      setRuntimeError(null);
      // HMR handles content update — no iframe force-reload needed
      onPreviewReadyRef.current?.();
      captureScreenshot();
    }
  }, [previewState, onError, captureScreenshot]); // eslint-disable-line react-hooks/exhaustive-deps

  const isEmpty = !files || Object.keys(files).length === 0;
  const isReact = !isHtmlProject(files) && !isEmpty;

  // srcdocHtml is memoised — changes only when files content changes
  const srcdocHtml = useMemo<string>(() => {
    if (!files || Object.keys(files).length === 0) return buildHtml(WELCOME_BUNDLE);
    if (isHtmlProject(files)) return buildAlpineHtml(files);
    return buildHtml(LOADING_BUNDLE);
  }, [files]);

  // Update srcdoc content via ref — NO key, NO remount
  useEffect(() => {
    if (srcdocIframeRef.current) {
      srcdocIframeRef.current.srcdoc = srcdocHtml;
    }
  }, [srcdocHtml]);

  // Loading overlay is driven by PreviewController state.
  // 'compiling' for >20 s without a 'ready' or 'failed' → show timeout overlay.
  useEffect(() => {
    if (!isReact) {
      setShowLoadingOverlay(false);
      return;
    }
    if (previewState.status !== 'compiling') {
      setShowLoadingOverlay(false);
      return;
    }
    const timer = window.setTimeout(() => setShowLoadingOverlay(true), 20_000);
    return () => window.clearTimeout(timer);
  }, [isReact, previewState.status]);

  // ── Canonical preview UI state ────────────────────────────────────
  // Collapses all contributing signals into one typed object.
  // Overlay rendering reads `ui.overlay` instead of scattered booleans.
  const ui = useMemo(() => resolvePreviewUI({
    controllerStatus: previewState.status,
    controllerError: previewState.error ?? null,
    controllerDiagnostics: previewState.diagnostics ?? null,
    activeRevisionId: previewState.activeRevisionId ?? null,
    lifecycleStage: previewLifecycle ?? 'idle',
    blockedReason: previewBlockedReason ?? null,
    isGenerating,
    iframeLoaded,
    loadingTimeout: showLoadingOverlay,
    serverDown: previewServerDown,
    isFixing,
    fixFailed,
  }), [
    previewState.status, previewState.error, previewState.diagnostics,
    previewState.activeRevisionId, previewLifecycle, previewBlockedReason,
    isGenerating, iframeLoaded, showLoadingOverlay, previewServerDown,
    isFixing, fixFailed,
  ]);

  // Preview reload is now driven by PreviewController subscription (above).
  // No force-preview-reload listener, no setTimeout.

  // Listen for preview-mounted / iframe-error / vite:error postMessages from the preview-workspace
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== PREVIEW_URL) return;

      if (e.data?.type === 'preview-error' && e.data?.reason === 'white_screen_after_ready') {
        previewController.notifyFailed('Preview is blank', e.data?.buildId);
        setRuntimeError('Preview is blank');
        onError?.('Preview is blank');
        window.dispatchEvent(new MessageEvent('message', {
          data: { type: 'iframe-error', message: 'Preview is blank' },
          origin: PREVIEW_URL,
        }));
        return;
      }

      // S1: scope iframe-originated events to our active preview iframe.
      if (e.source !== viteIframeRef.current?.contentWindow) return;
      // `preview-mounted` is the authoritative mount signal carrying buildId.
      // Legacy `iframe-ready` is logged-and-ignored (no buildId, not authoritative).
      if (e.data?.type === 'preview-mounted') {
        setRuntimeError(null);
        console.log('[SandpackPreview] preview-mounted received (buildId:', e.data.buildId, ') — delegating to RevisionManager');
        // Do NOT call onPreviewReady here — the single authority is
        // RevisionManager.waitForReady(buildId) → PreviewController.notifyReady
        if (whiteScreenTimerRef.current) clearTimeout(whiteScreenTimerRef.current);
        whiteScreenTimerRef.current = window.setTimeout(async () => {
          const blank = await WhiteScreenDetector.isBlank(viteIframeRef.current);
          if (blank) {
            window.dispatchEvent(new MessageEvent('message', {
              data: {
                type: 'preview-error',
                reason: 'white_screen_after_ready',
                buildId: e.data?.buildId,
              },
              origin: PREVIEW_URL,
            }));
          }
        }, 1000);
      }
      if (e.data?.type === 'iframe-error') {
        const msg = e.data.message ?? 'Unknown preview error';
        setRuntimeError(msg);
        onError?.('Preview: ' + msg);
      }
      // Vite compile errors (missing imports, TS errors) come as vite:error
      // Re-dispatch as iframe-error so the existing AutoFix handler in useStudio picks it up
      if (e.data?.type === 'vite:error') {
        const err = e.data.err as { message?: string; plugin?: string; id?: string } | undefined;
        const msg = err?.message ?? String(e.data.err ?? 'Vite compile error');
        setRuntimeError(msg);
        // Forward to AutoFix handler (same origin so listener in useStudio accepts it)
        window.dispatchEvent(new MessageEvent('message', {
          data: { type: 'iframe-error', message: msg },
          origin: PREVIEW_URL,
        }));
      }
    };
    window.addEventListener('message', handler);
    return () => {
      if (whiteScreenTimerRef.current) clearTimeout(whiteScreenTimerRef.current);
      window.removeEventListener('message', handler);
    };
  }, [onError, captureScreenshot]);

  // Sync studio theme to preview-workspace via postMessage
  useEffect(() => {
    const iframe = viteIframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({ type: 'studio-theme', theme: studioTheme ?? theme }, '*');
  }, [studioTheme, theme]);

  // S1: Sync device mode to preview-workspace → html[data-device].
  // Future: preview-workspace can expose a useDeviceMode() hook reading this attribute.
  useEffect(() => {
    const iframe = viteIframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({ type: 'preview-device', device }, '*');
  }, [device]);

  // ARCHITECTURE: Both iframes are ALWAYS in the DOM — only display toggles.
  // This prevents React from ever calling removeChild on an iframe whose
  // contentDocument has been mutated by Vite HMR, which caused DOM-fiber
  // mismatch crashes. Switching files: {} → {App.tsx} no longer unmounts anything.
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: 'white', overflow: 'hidden' }}>
      {/* Vite/React preview — ALWAYS mounted */}
      <iframe
        ref={viteIframeRef}
        data-testid="preview-iframe"
        data-build-id={previewState.expectingBuildId ?? previewState.activeRevisionId ?? ''}
        src={PREVIEW_URL}
        style={{
          width: '100%', height: '100%', border: 'none',
          display: isReact ? 'block' : 'none',
          background: 'white',
        }}
        sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts allow-downloads"
        allow="camera; microphone; geolocation; accelerometer; gyroscope; magnetometer; payment; usb; bluetooth; display-capture; midi; clipboard-read; clipboard-write"
        title="AIC-RG Preview"
        onLoad={() => setIframeLoaded(true)}
      />

      {/* Compiling spinner — overlay on top of iframe.
           iframe stays display:block so MountReporter fires inside it.
           Overlay hides automatically when ready.
           Driven by ui.overlay — only shown when exactly 'compiling'. */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 10,
        background: 'rgba(255,255,255,0.97)',
        pointerEvents: (isReact && ui.overlay === 'compiling') ? 'auto' : 'none',
        opacity: (isReact && ui.overlay === 'compiling') ? 1 : 0,
        transition: 'opacity 0.15s ease',
        flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 12,
        display: 'flex',
      }}>
        <div style={{
          width: 32, height: 32,
          border: '3px solid rgba(99,102,241,0.2)',
          borderTopColor: '#6366f1',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <span style={{
          fontSize: 13, color: 'rgba(0,0,0,0.4)',
          fontFamily: 'system-ui',
        }}>
          Compiling…
        </span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>

      {/* srcdoc preview (welcome / loading / HTML) — ALWAYS mounted, content via ref */}
      <iframe
        ref={srcdocIframeRef}
        style={{
          width: '100%', height: '100%', border: 'none',
          display: isReact ? 'none' : 'block',
          background: '#fff',
        }}
        sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts allow-downloads"
        allow="camera; microphone; geolocation; accelerometer; gyroscope; magnetometer; payment; usb; bluetooth; display-capture; midi; clipboard-read; clipboard-write"
        title="AIC-RG Preview Static"
      />

      {/* Level 3: Loading timeout overlay — shown after 20 s with no iframe-ready.
           Driven by ui.overlay === 'loading-timeout'. */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 49,
        backgroundColor: 'rgba(5,5,8,0.92)',
        display: ui.overlay === 'loading-timeout' ? 'flex' : 'none',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>
          <div style={{ maxWidth: 360, textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <p style={{
              color: 'rgba(255,255,255,0.85)', fontSize: 15,
              fontWeight: 600, margin: '0 0 8px',
            }}>
              Preview is taking longer than expected
            </p>
            <p style={{
              color: 'rgba(255,255,255,0.45)', fontSize: 12,
              lineHeight: 1.6, margin: '0 0 20px',
            }}>
              This usually means the preview server isn&apos;t running,
              or the project files weren&apos;t written correctly.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button
                onClick={() => {
                  setShowLoadingOverlay(false);
                  if (viteIframeRef.current) {
                    viteIframeRef.current.src = PREVIEW_URL + '?r=' + Date.now();
                  }
                }}
                style={{
                  padding: '9px 20px', borderRadius: 8, cursor: 'pointer',
                  backgroundColor: '#6366f1', border: 'none',
                  color: '#fff', fontSize: 13, fontWeight: 600,
                }}
              >
                Retry
              </button>
              <button
                onClick={() => setShowLoadingOverlay(false)}
                style={{
                  padding: '9px 20px', borderRadius: 8, cursor: 'pointer',
                  backgroundColor: 'transparent',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'rgba(255,255,255,0.5)', fontSize: 13,
                }}
              >
                Dismiss
              </button>
            </div>
            <p style={{
              marginTop: 16, fontSize: 11,
              color: 'rgba(255,255,255,0.25)',
            }}>
              Make sure npm run dev:all is running in terminal
            </p>
          </div>
      </div>

      {/* Preview failed / degraded overlay — driven by ui.overlay.
           'degraded' uses softer opacity; 'failed' uses full backdrop. */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 51,
        backgroundColor: ui.overlay === 'degraded' ? 'rgba(5,5,8,0.75)' : 'rgba(5,5,8,0.94)',
        display: (ui.overlay === 'failed' || ui.overlay === 'degraded') ? 'flex' : 'none',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        <div style={{ maxWidth: 400, width: '90%', textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>
            {ui.overlay === 'degraded' ? '⚠️' : '🔴'}
          </div>
          <p style={{
            color: 'rgba(255,255,255,0.9)', fontSize: 15,
            fontWeight: 700, margin: '0 0 8px',
          }}>
            {ui.error?.fixFailed
              ? 'Auto-fix failed'
              : ui.overlay === 'degraded'
                ? 'Update failed — showing last working version'
                : 'Preview failed'}
          </p>
          <p style={{
            color: 'rgba(255,255,255,0.4)', fontSize: 11,
            lineHeight: 1.55, margin: '0 0 24px',
            fontFamily: 'monospace',
            background: 'rgba(255,0,0,0.06)',
            border: '1px solid rgba(255,0,0,0.12)',
            borderRadius: 6,
            padding: '8px 12px',
            textAlign: 'left',
            wordBreak: 'break-all',
          }}>
            {ui.error?.displayMessage ?? ''}
          </p>
          {/* Materialize diagnostic — shows last-reached stage for debugging */}
          {ui.diagnostics && (
            <p style={{
              color: 'rgba(255,255,255,0.3)', fontSize: 10,
              fontFamily: 'monospace', margin: '0 0 16px',
            }}>
              Last stage: {ui.diagnostics.lastStage}
              {ui.diagnostics.failedAtStage
                ? ` · failed at: ${ui.diagnostics.failedAtStage}`
                : ''}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {apiKey && !ui.error?.fixFailed && (
              <button
                onClick={async () => {
                  if (isFixing) return;
                  setIsFixing(true);
                  setFixFailed(false);
                  try {
                    const ok = await SimpleGeneration.autoFix({
                      errorMsg: ui.error?.message ?? '',
                      apiKey: apiKey,
                    });
                    if (!ok) setFixFailed(true);
                  } catch {
                    setFixFailed(true);
                  } finally {
                    setIsFixing(false);
                  }
                }}
                disabled={isFixing}
                style={{
                  padding: '9px 20px', borderRadius: 8,
                  cursor: isFixing ? 'default' : 'pointer',
                  backgroundColor: isFixing ? 'rgba(99,102,241,0.3)' : '#6366f1',
                  border: 'none', color: '#fff', fontSize: 13, fontWeight: 600,
                  opacity: isFixing ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {isFixing && (
                  <span style={{
                    display: 'inline-block', width: 14, height: 14,
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                )}
                {isFixing ? 'Fixing…' : '🔧 Auto-fix'}
              </button>
            )}
            <button
              onClick={() => { revisionManager.rollback(); }}
              style={{
                padding: '9px 20px', borderRadius: 8, cursor: 'pointer',
                backgroundColor: 'transparent',
                border: '1px solid rgba(255,255,255,0.2)',
                color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: 500,
              }}
            >
              ↩ Rollback
            </button>
            <button
              onClick={() => { previewController.reset(); setRuntimeError(null); }}
              style={{
                padding: '9px 16px', borderRadius: 8, cursor: 'pointer',
                backgroundColor: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.3)', fontSize: 12,
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>

      {/* Preview blocked overlay — quality check prevented preview.
           Driven by ui.overlay === 'blocked'. */}
      {ui.overlay === 'blocked' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50,
          backgroundColor: 'rgba(5,5,8,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Inter', system-ui, sans-serif",
        }}>
          <div style={{ maxWidth: 400, width: '90%', textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>⛔</div>
            <p style={{
              color: 'rgba(255,255,255,0.9)', fontSize: 15,
              fontWeight: 700, margin: '0 0 8px',
            }}>
              Preview blocked
            </p>
            {ui.blocked?.reason && (
              <p style={{
                color: 'rgba(255,255,255,0.45)', fontSize: 12,
                lineHeight: 1.6, margin: '0 0 16px',
                background: 'rgba(251,191,36,0.08)',
                border: '1px solid rgba(251,191,36,0.15)',
                borderRadius: 6, padding: '8px 12px', textAlign: 'left',
              }}>
                {ui.blocked.reason}
              </p>
            )}
            <p style={{
              color: 'rgba(255,255,255,0.3)', fontSize: 11,
              margin: 0,
            }}>
              Check the chat for details. Try describing your intent differently.
            </p>
          </div>
        </div>
      )}

      {/* Generation overlay — shown while AI is writing code, hides iframe so HMR
          changes can't cause insertBefore crashes during React reconciliation.
          When file progress is available, shows per-file streaming status. */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 52,
        background: 'var(--background, #050508)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 0,
        opacity: isGenerating ? 1 : 0,
        pointerEvents: isGenerating ? 'auto' : 'none',
        transition: 'opacity 0.2s ease',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        {(() => {
          const fp = previewState.fileProgress;
          const completed = fp?.completedFiles ?? [];
          const current   = fp?.currentFile ?? '';
          const total     = fp?.totalExpected ?? 0;
          const doneCount = completed.length;
          const hasProgress = previewState.status === 'generating' && (current || doneCount > 0);
          const pct = total > 0
            ? Math.round((doneCount / total) * 100)
            : 0;

          if (!hasProgress) {
            // Fallback: generic spinner (no FILE markers detected yet)
            return (
              <>
                <div style={{
                  width: 32, height: 32,
                  border: '3px solid rgba(99,102,241,0.2)',
                  borderTopColor: '#6366f1',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <span style={{
                  fontSize: 13, color: 'rgba(255,255,255,0.45)',
                  marginTop: 12,
                }}>
                  Building your app…
                </span>
              </>
            );
          }

          return (
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 16,
              padding: '0 32px', maxWidth: 380, width: '100%',
            }}>
              {/* Header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{
                  width: 20, height: 20,
                  border: '2.5px solid rgba(99,102,241,0.25)',
                  borderTopColor: '#6366f1',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  flexShrink: 0,
                }} />
                <span style={{
                  fontSize: 13, fontWeight: 600,
                  color: 'rgba(255,255,255,0.8)',
                  letterSpacing: '-0.01em',
                }}>
                  {current
                    ? `Generating ${current.replace(/^\//, '')}…`
                    : 'Finishing generation…'}
                </span>
              </div>

              {/* Progress bar */}
              <div style={{ width: '100%' }}>
                <div style={{
                  width: '100%', height: 4, borderRadius: 2,
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    backgroundColor: '#6366f1',
                    transition: 'width 0.4s ease',
                    width: total > 0 ? `${pct}%` : `${Math.min(95, doneCount * 25)}%`,
                  }} />
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  marginTop: 6,
                }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                    {total > 0
                      ? `${doneCount}/${total} files`
                      : `${doneCount} file${doneCount !== 1 ? 's' : ''} generated`}
                  </span>
                  {total > 0 && (
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                      {pct}%
                    </span>
                  )}
                </div>
              </div>

              {/* Generated files list */}
              {(completed.length > 0 || current) && (
                <div style={{
                  width: '100%',
                  maxHeight: 180, overflowY: 'auto',
                  display: 'flex', flexDirection: 'column', gap: 3,
                  padding: '8px 0',
                }}>
                  {completed.map((f) => (
                    <div key={f} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      fontSize: 11, fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                      color: 'rgba(52,211,153,0.7)',
                      padding: '2px 0',
                    }}>
                      <span style={{ flexShrink: 0, fontSize: 10 }}>✓</span>
                      <span>{f.replace(/^\//, '')}</span>
                    </div>
                  ))}
                  {current && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      fontSize: 11, fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                      color: 'rgba(129,140,248,0.8)',
                      padding: '2px 0',
                    }}>
                      <span style={{
                        flexShrink: 0, fontSize: 8,
                        animation: 'pulse-dot 1.2s ease-in-out infinite',
                      }}>●</span>
                      <span>{current.replace(/^\//, '')}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse-dot {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 1; }
          }
        `}</style>
      </div>

      {/* AutoFix overlay — above error overlay, shown while AI repairs code */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 53,
        backgroundColor: 'rgba(5,5,8,0.88)',
        display: isAutoFixing ? 'flex' : 'none',
        flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        <div style={{
          width: 36, height: 36, marginBottom: 16,
          border: '3px solid rgba(52,211,153,0.3)',
          borderTopColor: '#34d399',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ color: '#34d399', fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>
          Auto-fixing error…
        </p>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: 0 }}>
          AI is repairing the generated code
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>

      {/* Preview server not running overlay */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 54,
        background: 'var(--background, #050508)',
        display: (previewServerDown && isReact && !isGenerating && !runtimeError) ? 'flex' : 'none',
        flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 12,
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        <div style={{ fontSize: 36, opacity: 0.5 }}>🔌</div>
        <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: 600, margin: 0 }}>
          Preview server is not running
        </p>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: 0, maxWidth: 320, textAlign: 'center', lineHeight: 1.5 }}>
          Run: <code style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>npm run dev:all</code>
        </p>
        <button
          onClick={() => {
            setPreviewServerDown(false);
            fetch(PREVIEW_URL, { mode: 'no-cors' })
              .then(() => setPreviewServerDown(false))
              .catch(() => setPreviewServerDown(true));
          }}
          style={{
            marginTop: 8, padding: '8px 20px', borderRadius: 8, cursor: 'pointer',
            backgroundColor: '#6366f1', border: 'none',
            color: '#fff', fontSize: 13, fontWeight: 600,
          }}
        >
          Retry
        </button>
      </div>

      {/* Error overlay — above both iframes */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 50,
        backgroundColor: '#0d0010',
        display: runtimeError ? 'flex' : 'none',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Inter', system-ui, sans-serif", padding: 32,
      }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔴</div>
          <h3 style={{ color: '#ff6b9d', margin: '0 0 12px', fontSize: 18, fontWeight: 700 }}>
            Runtime Error
          </h3>
          <p style={{
            color: 'rgba(255,255,255,0.55)', fontSize: 13, lineHeight: 1.6,
            margin: '0 0 24px', fontFamily: 'monospace', wordBreak: 'break-word',
          }}>
            {runtimeError}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              onClick={() => setRuntimeError(null)}
              style={{
                padding: '10px 22px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)',
                cursor: 'pointer', backgroundColor: 'transparent', color: 'rgba(255,255,255,0.5)',
                fontSize: 14, fontFamily: "'Inter', system-ui, sans-serif",
              }}
            >
              Dismiss
            </button>
            {onFixWithAI && (
              <button
                onClick={() => { setRuntimeError(null); onFixWithAI(); }}
                style={{
                  padding: '10px 22px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  backgroundColor: '#6366f1', color: '#fff', fontSize: 14, fontWeight: 600,
                  fontFamily: "'Inter', system-ui, sans-serif",
                }}
              >
                ✨ Fix with AI
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
