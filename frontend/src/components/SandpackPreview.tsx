/**
 * SandpackPreview.tsx — Preview display layer.
 *
 * This component is a DISPLAY layer only.
 *
 * Architecture:
 *   - React/TSX projects → iframe pointing to localhost:3100 (preview-app Vite dev server)
 *   - HTML/Alpine projects → srcdoc iframe (no sandbox involved)
 *   - Empty state → welcome screen (srcdoc)
 *
 * Preview pipeline:
 *   SimpleGeneration writes to preview-app/src/ → Vite HMR on port 3100 → iframe
 *
 * No materialization, no revisions, no sandbox. One canonical path.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { FileMap } from '../hooks/useStudio';

/** Port where the preview-app Vite dev server runs. */
const PREVIEW_PORT = 3100;
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`;

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
  <script src="https://unpkg.com/react@18.2.0/umd/react.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js" crossorigin></script>
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
  /** Current device key (desktop | iphone | pixel | ipad). Forwarded to preview-app
   *  via postMessage so the app can set html[data-device]. */
  device?:          string;
  onError?:         (msg: string) => void;
  onPreviewReady?:  () => void;
  onFixWithAI?:     () => void;
  isAutoFixing?:    boolean;
}

/* ── Main export ─────────────────────────────────────────────────────────────── */

export const SandpackView: React.FC<SandpackViewProps> = ({
  files,
  activeFile,
  setActiveFile,
  theme           = 'dark',
  studioTheme,
  device          = 'desktop',
  onError,
  onPreviewReady,
  onFixWithAI,
  isAutoFixing    = false,
}) => {
  const [runtimeError,      setRuntimeError]      = useState<string | null>(null);
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  const [iframeLoaded,      setIframeLoaded]       = useState(false);
  const loadingTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPreviewReadyRef   = useRef(onPreviewReady);
  onPreviewReadyRef.current = onPreviewReady;

  const viteIframeRef   = useRef<HTMLIFrameElement>(null);
  const srcdocIframeRef = useRef<HTMLIFrameElement>(null);

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

  // Level 3: 15 s loading timeout — resets on every files change.
  // During streaming, files update every chunk → timer keeps resetting.
  // 15 s after the LAST file change with no iframe-ready → show overlay.
  useEffect(() => {
    if (!isReact) {
      setShowLoadingOverlay(false);
      if (loadingTimerRef.current) { clearTimeout(loadingTimerRef.current); loadingTimerRef.current = null; }
      return;
    }
    setShowLoadingOverlay(false);
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    loadingTimerRef.current = setTimeout(() => setShowLoadingOverlay(true), 20_000);
    return () => {
      if (loadingTimerRef.current) { clearTimeout(loadingTimerRef.current); loadingTimerRef.current = null; }
    };
  }, [files, isReact]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset iframeLoaded spinner whenever files change (new generation)
  useEffect(() => {
    if (isReact) setIframeLoaded(false);
  }, [files, isReact]);

  // Listen for force-preview-reload dispatched by SimpleGeneration after all files written
  useEffect(() => {
    const handler = () => {
      const iframe = viteIframeRef.current;
      if (iframe) {
        setIframeLoaded(false);
        const url = PREVIEW_URL;
        iframe.src = '';
        setTimeout(() => {
          if (viteIframeRef.current) {
            viteIframeRef.current.src = url + '?r=' + Date.now();
          }
        }, 100);
      }
      setShowLoadingOverlay(false);
      setRuntimeError(null);
      if (loadingTimerRef.current) { clearTimeout(loadingTimerRef.current); loadingTimerRef.current = null; }
      // Restart the 20 s timeout for the fresh load
      loadingTimerRef.current = setTimeout(() => setShowLoadingOverlay(true), 20_000);
    };
    window.addEventListener('force-preview-reload', handler);
    return () => window.removeEventListener('force-preview-reload', handler);
  }, []);

  // Listen for iframe-ready / iframe-error / vite:error postMessages from the preview-app
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== PREVIEW_URL) return;
      // S1: scope to our vite iframe — rejects messages from other localhost:3100
      // windows and from synthetic re-dispatched events (e.source is null there,
      // which is intentional: the vite:error re-dispatch targets useStudio only).
      if (e.source !== viteIframeRef.current?.contentWindow) return;
      if (e.data?.type === 'iframe-ready') {
        setRuntimeError(null);
        setShowLoadingOverlay(false);
        if (loadingTimerRef.current) { clearTimeout(loadingTimerRef.current); loadingTimerRef.current = null; }
        onPreviewReadyRef.current?.();
      }
      if (e.data?.type === 'iframe-error') {
        const msg = e.data.message ?? 'Unknown preview error';
        setRuntimeError(msg);
        setShowLoadingOverlay(false);
        if (loadingTimerRef.current) { clearTimeout(loadingTimerRef.current); loadingTimerRef.current = null; }
        onError?.('Preview: ' + msg);
      }
      // Vite compile errors (missing imports, TS errors) come as vite:error
      // Re-dispatch as iframe-error so the existing AutoFix handler in useStudio picks it up
      if (e.data?.type === 'vite:error') {
        const err = e.data.err as { message?: string; plugin?: string; id?: string } | undefined;
        const msg = err?.message ?? String(e.data.err ?? 'Vite compile error');
        setRuntimeError(msg);
        setShowLoadingOverlay(false);
        if (loadingTimerRef.current) { clearTimeout(loadingTimerRef.current); loadingTimerRef.current = null; }
        // Forward to AutoFix handler (same origin so listener in useStudio accepts it)
        window.dispatchEvent(new MessageEvent('message', {
          data: { type: 'iframe-error', message: msg },
          origin: PREVIEW_URL,
        }));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onError]);

  // Sync studio theme to preview-app via postMessage
  useEffect(() => {
    const iframe = viteIframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({ type: 'studio-theme', theme: studioTheme ?? theme }, '*');
  }, [studioTheme, theme]);

  // S1: Sync device mode to preview-app → html[data-device].
  // Future: preview-app can expose a useDeviceMode() hook reading this attribute.
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

      {/* Building spinner — shown while iframe loads, hidden once ready or on error */}
      {isReact && !iframeLoaded && !showLoadingOverlay && !runtimeError && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: 'white',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 12,
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
            Building preview…
          </span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

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

      {/* Level 3: Loading timeout overlay — shown after 8 s with no iframe-ready */}
      {showLoadingOverlay && !runtimeError && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 49,
          backgroundColor: 'rgba(5,5,8,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
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
      )}

      {/* AutoFix overlay — above error overlay, shown while AI repairs code */}
      {isAutoFixing && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 51,
          backgroundColor: 'rgba(5,5,8,0.88)',
          display: 'flex', flexDirection: 'column',
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
      )}

      {/* Error overlay — above both iframes */}
      {runtimeError && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50,
          backgroundColor: '#0d0010', display: 'flex',
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
      )}
    </div>
  );
};
