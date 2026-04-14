import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { BUILD_ID as INITIAL_BUILD_ID } from './__build_id'

interface ViteHot {
  accept(dep: string, cb: (mod: unknown) => void): void;
}

declare global {
  interface ImportMeta {
    glob: (pattern: string, options?: { eager?: boolean }) => Record<string, unknown>;
    hot?: ViteHot;
  }
}

// ── Build handshake ──────────────────────────────────────
// The parent frame writes preview-workspace/src/__build_id.ts LAST on every build.
// Vite HMR replaces that module → the `Root` component below updates its
// buildId state → `MountReporter` re-runs its effect → postMessage is sent
// from inside a committed React effect (which fires reliably even when the
// iframe is display:none, unlike requestAnimationFrame).
//
// The parent's RevisionManager.waitForReady accepts only messages whose
// buildId matches the current compile cycle.

// Legacy compat: synchronous iframe-ready signal for any old listener.
const notifyReady = () => {
  try {
    window.parent.postMessage({ type: 'iframe-ready' }, '*');
  } catch {}
};

// Catch runtime errors and notify parent
window.addEventListener('error', (e) => {
  try {
    window.parent.postMessage({
      type: 'vite:error',
      err: { message: e.message, stack: e.error?.stack },
    }, '*');
    console.error('[preview] runtime error sent to parent:', e.message);
  } catch {}
});

// Catch unhandled promise rejections
window.addEventListener('unhandledrejection', (e) => {
  try {
    const reason = e.reason as { message?: string } | undefined;
    window.parent.postMessage({
      type: 'vite:error',
      err: { message: reason?.message || String(e.reason) },
    }, '*');
  } catch {}
});

// ── White-screen check responder ───────────────────────
// Parent sends { type: 'white-screen-check', buildId } to request a DOM
// health snapshot. We inspect #root and body, then reply with metrics.
// This is read-only introspection — no side effects on the preview.
const LOADING_INDICATOR_SELECTORS = [
  '[data-loading]',
  '.loading',
  '.spinner',
  '[class*="skeleton"]',
  '[class*="Skeleton"]',
];

window.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || typeof d !== 'object' || d.type !== 'white-screen-check') return;

  const root = document.getElementById('root');
  const body = document.body;

  const rootText = root?.innerText ?? '';
  const hasLoadingIndicator =
    !!root?.querySelector(LOADING_INDICATOR_SELECTORS.join(',')) ||
    /^(loading|waiting|please wait|initializing)/i.test(rootText.trim());

  const metrics = {
    rootChildCount: root?.children.length ?? 0,
    rootInnerTextLength: rootText.length,
    rootOffsetHeight: root?.offsetHeight ?? 0,
    bodyChildCount: body?.children.length ?? 0,
    bodyInnerTextLength: (body?.innerText ?? '').length,
    hasLoadingIndicator,
    rootTextHead: rootText.slice(0, 200),
  };

  try {
    window.parent.postMessage(
      { type: 'white-screen-result', buildId: d.buildId, metrics },
      '*',
    );
  } catch {}
});

// ── MountReporter ────────────────────────────────────────
// A zero-render component that posts `preview-mounted` as a
// commit-time side effect. useEffect runs after React has flushed the
// DOM, guaranteeing the new tree is actually mounted before the parent
// is told so. useEffect is NOT tied to the rendering pipeline, so it
// fires normally in display:none iframes (where requestAnimationFrame
// is throttled).
function MountReporter({ buildId }: { buildId: string }) {
  useEffect(() => {
    try {
      window.parent.postMessage({ type: 'preview-mounted', buildId }, '*');
      console.log('[preview] preview-mounted sent for', buildId);
    } catch {}
  }, [buildId]);
  return null;
}

// ── Root ─────────────────────────────────────────────────
// Holds buildId in state and wires the Vite HMR hook for `./__build_id`
// so that when the parent rewrites __build_id.ts at the end of a build
// cycle, the state flips, MountReporter's effect re-runs, and the parent
// receives a fresh `preview-mounted` message with the matching buildId.
function Root() {
  const [buildId, setBuildId] = useState<string>(INITIAL_BUILD_ID);

  useEffect(() => {
    if (!import.meta.hot) return;
    import.meta.hot.accept('./__build_id', (mod: unknown) => {
      const id = (mod as { BUILD_ID?: string } | undefined)?.BUILD_ID;
      if (typeof id === 'string' && id) setBuildId(id);
    });
  }, []);

  return (
    <React.StrictMode>
      <MountReporter buildId={buildId} />
      <ResolvedApp />
    </React.StrictMode>
  );
}

const appModules = import.meta.glob('./App.{tsx,jsx,ts,js}', { eager: true });
const appModule = Object.values(appModules)[0] as { default?: React.ComponentType } | undefined;
const ResolvedApp = appModule?.default ?? (() => (
  <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#050508', color: 'rgba(255,255,255,0.55)', fontFamily: 'system-ui, sans-serif' }}>
    Waiting for generation...
  </div>
));

// ── Visual element selection (VisualEditBridge MVP) ──────────────────────────
// Activated by { type: 'visual-select-start' } from the parent studio.
// On element click, posts { type: 'visual-element-selected', payload: {...} }.
// Deactivated by { type: 'visual-select-stop' }.
(function setupVisualSelector() {
  let active = false;
  let highlightEl: HTMLElement | null = null;

  function inferSelector(el: Element): string {
    if (el.id) return `#${el.id}`;
    const tag = el.tagName.toLowerCase();
    const classes = Array.from(el.classList).filter(c => !/^(hover:|focus:|active:)/.test(c));
    if (classes.length > 0) return `${tag}.${classes.slice(0, 2).join('.')}`;
    const parent = el.parentElement;
    if (parent) {
      const idx = Array.from(parent.children).indexOf(el);
      return `${inferSelector(parent)} > ${tag}:nth-child(${idx + 1})`;
    }
    return tag;
  }

  function getRect(el: Element) {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  }

  function highlight(el: HTMLElement | null) {
    if (highlightEl) {
      highlightEl.style.outline = '';
      highlightEl.style.outlineOffset = '';
    }
    highlightEl = el;
    if (el) {
      el.style.outline = '2px solid #22c55e';
      el.style.outlineOffset = '1px';
    }
  }

  function onMouseOver(e: MouseEvent) {
    if (!active) return;
    const el = e.target as HTMLElement;
    highlight(el);
  }

  function onClick(e: MouseEvent) {
    if (!active) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.target as HTMLElement;
    highlight(null);
    const payload = {
      selector:    inferSelector(el),
      tag:         el.tagName.toLowerCase(),
      text:        (el.innerText ?? '').slice(0, 120).trim(),
      classList:   Array.from(el.classList),
      inlineStyle: el.getAttribute('style') ?? '',
      rect:        getRect(el),
    };
    try {
      window.parent.postMessage({ type: 'visual-element-selected', payload }, '*');
    } catch {}
    stop();
  }

  function start() {
    active = true;
    document.body.style.cursor = 'crosshair';
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('click', onClick, true);
  }

  function stop() {
    active = false;
    document.body.style.cursor = '';
    highlight(null);
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('click', onClick, true);
  }

  window.addEventListener('message', (e) => {
    if (e.data?.type === 'visual-select-start') start();
    if (e.data?.type === 'visual-select-stop')  stop();
  });
})();

ReactDOM.createRoot(document.getElementById('root')!).render(<Root />);

// Legacy `iframe-ready` — posted once the window has fully loaded, so old
// listeners that key off of it still work. Not authoritative for readiness.
if (document.readyState === 'complete') {
  notifyReady();
} else {
  window.addEventListener('load', notifyReady, { once: true });
}
