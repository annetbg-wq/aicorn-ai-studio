import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { BUILD_ID as INITIAL_BUILD_ID } from './__build_id';

interface ViteHot {
  accept(dep: string, cb: (mod: unknown) => void): void;
}

declare global {
  interface ImportMeta {
    glob: (pattern: string, options?: { eager?: boolean }) => Record<string, unknown>;
    hot?: ViteHot;
  }
}

// ── Legacy compat: non-authoritative iframe-ready signal ─────────────────────
const notifyReady = () => {
  try {
    window.parent.postMessage({ type: 'iframe-ready' }, '*');
  } catch {}
};

window.addEventListener('error', (e) => {
  try {
    window.parent.postMessage({
      type: 'vite:error',
      err: { message: e.message, stack: e.error?.stack },
    }, '*');
    console.error('[preview] runtime error sent to parent:', e.message);
  } catch {}
});

window.addEventListener('unhandledrejection', (e) => {
  try {
    const reason = e.reason as { message?: string } | undefined;
    window.parent.postMessage({
      type: 'vite:error',
      err: { message: reason?.message || String(e.reason) },
    }, '*');
  } catch {}
});

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

function MountReporter({ buildId }: { buildId: string }) {
  useEffect(() => {
    try {
      window.parent.postMessage({ type: 'preview-mounted', buildId }, '*');
      console.log('[preview] preview-mounted sent for', buildId);
    } catch {}
  }, [buildId]);
  return null;
}

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

// ── Visual element selection (VisualEditBridge) ──────────────────────────────
// Activated by { type: 'visual-select-start' } from the parent studio.
// On element click, posts { type: 'visual-element-selected', payload: {...} }.
// Deactivated by { type: 'visual-select-stop' }.
//
// Stability contract for selector inference (most → least stable):
//   1. data-testid
//   2. data-studio-hash
//   3. data-figma-id
//   4. #id
//   5. tag.stable-classes
//   6. parent > tag:nth-child(n)
(function setupVisualSelector() {
  let active = false;
  let highlightEl: HTMLElement | null = null;
  let savedOutline = '';
  let savedOutlineOffset = '';

  function buildBoundedPath(el: Element, depth = 3): string {
    const segments: string[] = [];
    let node: Element | null = el;
    let d = 0;
    while (node && d <= depth) {
      const tag = node.tagName.toLowerCase();
      if (tag === 'body' || tag === 'html') break;
      segments.unshift(tag);
      node = node.parentElement;
      d++;
    }
    return segments.join(' > ');
  }

  function getSiblingInfo(el: Element): { siblingIndex: number; siblingCount: number } {
    const parent = el.parentElement;
    if (!parent) return { siblingIndex: 0, siblingCount: 1 };
    const sameTag = Array.from(parent.children).filter(c => c.tagName === el.tagName);
    const idx = sameTag.indexOf(el);
    return { siblingIndex: Math.max(0, idx), siblingCount: sameTag.length };
  }

  function inferSelector(el: Element): string {
    const testId = el.getAttribute('data-testid');
    if (testId) return `[data-testid="${testId}"]`;
    const studioHash = el.getAttribute('data-studio-hash');
    if (studioHash) return `[data-studio-hash="${studioHash}"]`;
    const figmaId = el.getAttribute('data-figma-id');
    if (figmaId) return `[data-figma-id="${figmaId}"]`;

    if (el.id) return `#${el.id}`;

    const tag = el.tagName.toLowerCase();
    const stableClasses = Array.from(el.classList).filter(
      c => !/^(hover:|focus:|active:|group-hover:|peer-|aria-|focus-within:|focus-visible:|disabled:|checked:|placeholder:|dark:|lg:|md:|sm:|xl:)/.test(c),
    );
    if (stableClasses.length > 0) return `${tag}.${stableClasses.slice(0, 2).join('.')}`;

    const parent = el.parentElement;
    if (parent) {
      const idx = Array.from(parent.children).indexOf(el);
      return `${inferSelector(parent)} > ${tag}:nth-child(${idx + 1})`;
    }
    return tag;
  }

  function extractDataAttributes(el: Element): Record<string, string> {
    const result: Record<string, string> = {};
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('data-')) {
        result[attr.name] = attr.value;
      }
    }
    return result;
  }

  function findComponentPath(el: Element): string | undefined {
    let node: Element | null = el;
    while (node) {
      const comp = node.getAttribute('data-component');
      if (comp) return comp;
      node = node.parentElement;
    }
    return undefined;
  }

  function getRect(el: Element) {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  }

  function highlight(el: HTMLElement | null) {
    if (highlightEl) {
      highlightEl.style.outline = savedOutline;
      highlightEl.style.outlineOffset = savedOutlineOffset;
    }
    highlightEl = el;
    if (el) {
      savedOutline = el.style.outline;
      savedOutlineOffset = el.style.outlineOffset;
      el.style.outline = '2px solid #22c55e';
      el.style.outlineOffset = '1px';
    } else {
      savedOutline = '';
      savedOutlineOffset = '';
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
    const { siblingIndex, siblingCount } = getSiblingInfo(el);
    const payload = {
      selector: inferSelector(el),
      tag: el.tagName.toLowerCase(),
      text: (el.innerText ?? '').slice(0, 120).trim(),
      classList: Array.from(el.classList),
      inlineStyle: el.getAttribute('style') ?? '',
      rect: getRect(el),
      dataAttributes: extractDataAttributes(el),
      componentPath: findComponentPath(el),
      siblingIndex,
      siblingCount,
      boundedPath: buildBoundedPath(el, 3),
    };
    try {
      window.parent.postMessage({ type: 'visual-element-selected', payload }, '*');
    } catch {}
    stop();
  }

  function start() {
    if (active) return;
    active = true;
    document.body.style.cursor = 'crosshair';
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('click', onClick, true);
    // Signal to the parent studio that selection mode is now active in the
    // iframe — the host awaits this before dispatching the test click so
    // there is no race between the 'visual-select-start' delivery and the
    // click event arriving before the capture handler is registered.
    try {
      window.parent.postMessage({ type: 'visual-select-ready' }, '*');
    } catch {}
  }

  function stop() {
    if (!active && !highlightEl) return;
    active = false;
    document.body.style.cursor = '';
    highlight(null);
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('click', onClick, true);
  }

  window.addEventListener('message', (e) => {
    if (e.data?.type === 'visual-select-start') start();
    if (e.data?.type === 'visual-select-stop') stop();
  });
})();

ReactDOM.createRoot(document.getElementById('root')!).render(<Root />);

if (document.readyState === 'complete') {
  notifyReady();
} else {
  window.addEventListener('load', notifyReady, { once: true });
}
