import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Monitor, Smartphone, Tablet,
  Eye, Code2, Palette, BarChart2, Shield,
  Share2, Copy, Check, GitBranch, GitCommit, CheckCircle,
  FilePlus, Trash2, ZoomIn, ZoomOut, Maximize2, Download,
  MousePointer2, Save, X,
} from 'lucide-react';
import { visualEditBridge, type VisualEditMode, type SelectedElement } from '../services/VisualEditBridge';
import type { FileMap } from '../hooks/useStudio';
import type { TraceRunSummary, VisibleReasoningTrace, VisibleReasoningStep } from '../shared/projectModel';
import { generationTracer } from '../services/GenerationTracer';
import type { GenerationTrace, TraceSpan } from '../services/GenerationTracer';

import { CloudPanel }   from './CloudPanel';

const LANG_COLOR: Record<string, string> = {
  html:'#e34c26',css:'#264de4',ts:'#3178c6',tsx:'#3178c6',
  js:'#f7df1e',jsx:'#61dafb',json:'#cbcb41',md:'#083fa1',
};
const extOf   = (n: string) => n.split('.').pop() ?? '';
const colorOf = (n: string) => LANG_COLOR[extOf(n)] ?? '#888';

/* ---- ZoomableCanvas ----
   Proper zoom architecture:
   - Outer div: overflow:hidden, position:relative — viewport
   - Flex container centres children without position:absolute
   - Inner div: transform for drag (tx,ty) + scale(zoom) only
   - Drag on canvas background only (not on iframe)
*/

interface ZoomableCanvasProps {
  children: React.ReactNode;
  initZoom?: number;
  draggable?: boolean;
  bgStyle?: React.CSSProperties;
  /** When provided, automatically fits content dimensions to viewport on mount and device change */
  autoFit?: { w: number; h: number };
}

const ZoomableCanvas: React.FC<ZoomableCanvasProps> = ({
  children, initZoom = 1, draggable = false, bgStyle = {}, autoFit,
}) => {
  const [zoom, setZoom] = useState(initZoom);
  const [tx,   setTx]   = useState(0);
  const [ty,   setTy]   = useState(0);
  const vpEl     = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const last     = useRef({ x: 0, y: 0 });
  const fitRef   = useRef(initZoom);

  const clamp = (z: number) => Math.min(3, Math.max(0.1, z));

  // Auto-fit: compute zoom so content fits the viewport with 5% margin.
  // Retry via rAF / setTimeout if flex layout hasn't settled yet.
  useEffect(() => {
    if (!autoFit || !vpEl.current) return;

    function apply(): boolean {
      const el = vpEl.current;
      if (!el) return false;
      const vpW = el.clientWidth;
      const vpH = el.clientHeight;
      if (vpW < 10 || vpH < 10) return false;
      const fz = clamp(Math.min((vpW / autoFit!.w) * 0.95, (vpH / autoFit!.h) * 0.95));
      fitRef.current = fz;
      setZoom(fz);
      setTx(0);
      setTy(0);
      return true;
    }

    if (!apply()) {
      const rafId = requestAnimationFrame(() => {
        if (!apply()) { timerId = window.setTimeout(apply, 100); }
      });
      let timerId: number | undefined;
      return () => { cancelAnimationFrame(rafId); if (timerId) clearTimeout(timerId); };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFit?.w, autoFit?.h]);

  useEffect(() => {
    const el = vpEl.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setZoom(z => clamp(z - e.deltaY * 0.003));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    if (!draggable) return;
    const t = e.target as HTMLElement;
    if (t.closest('iframe') || t.closest('[data-zoom-controls]')) return;
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setTx(v => v + e.clientX - last.current.x);
      setTy(v => v + e.clientY - last.current.y);
      last.current = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const reset = () => { setZoom(fitRef.current); setTx(0); setTy(0); };

  return (
    <div
      ref={vpEl}
      onMouseDown={onMouseDown}
      style={{
        width: '100%', height: '100%',
        minHeight: 200,
        position: 'relative',
        overflow: 'visible',
        cursor: draggable ? 'grab' : 'default',
        userSelect: 'none',
        ...bgStyle,
      }}
    >
      {/* Zoom controls */}
      <div
        data-zoom-controls
        style={{
          position: 'absolute', bottom: 16, right: 16, zIndex: 100,
          display: 'flex', alignItems: 'center', gap: 2,
          background: 'rgba(10,10,15,0.85)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
          padding: '4px 6px',
        }}
      >
        <button onClick={() => setZoom(z => clamp(z - 0.1))}
          style={{ width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.55)', borderRadius:7 }}>
          <ZoomOut size={13}/>
        </button>
        <span onClick={reset}
          style={{ minWidth:40, textAlign:'center', fontSize:11, color:'rgba(255,255,255,0.5)', cursor:'pointer', userSelect:'none' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={() => setZoom(z => clamp(z + 0.1))}
          style={{ width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.55)', borderRadius:7 }}>
          <ZoomIn size={13}/>
        </button>
        <div style={{ width:1, height:14, background:'rgba(255,255,255,0.1)', margin:'0 2px' }}/>
        <button onClick={reset}
          style={{ width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.55)', borderRadius:7 }}>
          <Maximize2 size={13}/>
        </button>
      </div>

      {/* Flex container centres content; transform handles drag + zoom only */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        overflow: 'visible',
      }}>
        <div style={{
          transform: `translate(${tx}px, ${ty}px) scale(${zoom})`,
          transformOrigin: 'center center',
          flexShrink: 0,
        }}>
          {children}
        </div>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────────
 * DeviceFrame — unified wrapper for all device previews.
 *
 * WHY: the old approach (getFrame returning ChromeFrame | IPhoneFrame | ...)
 * caused React to UNMOUNT SandpackView every time `device` changed, because
 * different component TYPES were returned. During unmount, removeChild() on
 * the preview iframe failed (DOM/fiber mismatch from iframe lifecycle disruption).
 *
 * FIX: a single DeviceFrame component where {children} is always at fiber
 * position [1]. Style props update when device changes — no unmount occurs.
 * ──────────────────────────────────────────────────────────────────────────── */

type DevKey = 'desktop' | 'iphone' | 'pixel' | 'ipad';

const DEVICE_SPECS: Record<DevKey, {
  outerW: number; outerH: number; outerR: number;
  outerBg: string; outerShadow: string; outerOverflow: 'hidden' | 'visible';
  cl: number; ct: number; cw: number; ch: number; cr: number | string;
}> = {
  // viewport 1440×900 — thin ring makes the frame visible on dark canvas
  desktop: {
    outerW: 1440, outerH: 900, outerR: 12,
    outerBg: '#0d0d14',
    outerShadow: '0 32px 100px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.12)',
    outerOverflow: 'hidden',
    cl: 0, ct: 0, cw: 1440, ch: 900, cr: 12,
  },
  // viewport 390×844 (iPhone 14/15 logical resolution)
  // outer adds 2px side bezel + 54px status bar + 36px home indicator
  iphone: {
    outerW: 394, outerH: 934, outerR: 54,
    outerBg: 'linear-gradient(160deg,#8a8a8e 0%,#58585a 50%,#3a3a3c 100%)',
    outerShadow: '0 0 0 1px rgba(255,255,255,0.18), 0 50px 140px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.15)',
    outerOverflow: 'visible',
    cl: 2, ct: 54, cw: 390, ch: 844, cr: 50,
  },
  // viewport 412×915 (Pixel 9 Pro logical resolution)
  // outer adds 2px side bezel + 62px top chrome + 32px chin
  pixel: {
    outerW: 416, outerH: 1009, outerR: 48,
    outerBg: 'linear-gradient(145deg,#4a4a4e 0%,#2a2a2c 100%)',
    outerShadow: '0 0 0 1px rgba(255,255,255,0.18), 0 50px 140px rgba(0,0,0,0.9)',
    outerOverflow: 'visible',
    cl: 2, ct: 62, cw: 412, ch: 915, cr: '40px 40px 0 0',
  },
  // viewport 810×1080 (iPad Pro 11" / iPad Air landscape-ish)
  // outer adds 4px side bezel + 28px status bar + 26px home bar
  ipad: {
    outerW: 818, outerH: 1134, outerR: 20,
    outerBg: 'linear-gradient(160deg,#6c6c70 0%,#4a4a4c 60%,#3a3a3c 100%)',
    outerShadow: '0 0 0 1px rgba(255,255,255,0.14), 0 40px 120px rgba(0,0,0,0.8)',
    outerOverflow: 'visible',
    cl: 4, ct: 28, cw: 810, ch: 1080, cr: 16,
  },
};

/** Background decoration — rendered BEHIND content (z-index 0). */
const FrameBg: React.FC<{ device: string }> = ({ device }) => {
  // Desktop: no chrome decoration — iframe fills the full frame
  if (device === 'desktop') return null;
  if (device === 'iphone') return (
    <div style={{ position:'absolute', top:2, left:2, right:2, bottom:2, borderRadius:52, background:'#1c1c1e' }}/>
  );
  if (device === 'pixel') return (
    <div style={{ position:'absolute', top:2, left:2, right:2, bottom:2, borderRadius:46, background:'#1a1a1a', overflow:'hidden', display:'flex', flexDirection:'column' }}>
      <div style={{ height:60, flexShrink:0, position:'relative' }}/>
    </div>
  );
  if (device === 'ipad') return (
    <>
      <div style={{ position:'absolute', top:2, left:2, right:2, bottom:2, borderRadius:18, background:'#1c1c1e' }}/>
      <div style={{ position:'absolute', top:4, left:4, right:4, bottom:4, borderRadius:16, background:'#f2f2f7' }}/>
    </>
  );
  return null;
};

/** Foreground decoration — rendered OVER content (z-index 2, pointer-events none). */
const FrameFg: React.FC<{ device: string }> = ({ device }) => {
  if (device === 'iphone') return (
    <div style={{ position:'absolute', inset:0, pointerEvents:'none' }}>
      {[{t:112,h:32},{t:162,h:58},{t:228,h:58}].map((b,i) =>
        <div key={i} style={{ position:'absolute', left:-4, top:b.t, width:4, height:b.h, background:'linear-gradient(90deg,#2e2e30,#58585a)', borderRadius:'3px 0 0 3px' }}/>
      )}
      <div style={{ position:'absolute', right:-4, top:176, width:4, height:80, background:'linear-gradient(270deg,#2e2e30,#58585a)', borderRadius:'0 3px 3px 0' }}/>
      <div style={{ position:'absolute', top:14, left:'50%', transform:'translateX(-50%)', width:118, height:34, background:'#000', borderRadius:20, zIndex:20, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 14px' }}>
        <div style={{ width:11, height:11, borderRadius:'50%', background:'#0d0d14', border:'2px solid #1a1a22' }}/>
        <div style={{ width:8, height:8, borderRadius:'50%', background:'#081208' }}/>
      </div>
      <div style={{ position:'absolute', top:2, left:2, right:2, height:52, display:'flex', alignItems:'flex-end', justifyContent:'space-between', padding:'0 28px 6px', zIndex:15 }}>
        <span style={{ fontSize:15, fontWeight:700, color:'rgba(255,255,255,0.92)', fontFamily:'-apple-system,sans-serif', letterSpacing:-0.5 }}>9:41</span>
        <svg width="28" height="13" viewBox="0 0 28 13" fill="none">
          <rect x=".5" y=".5" width="22" height="12" rx="3.5" stroke="rgba(255,255,255,0.35)"/>
          <rect x="2" y="2" width="17" height="9" rx="2" fill="rgba(255,255,255,0.9)"/>
          <path d="M24.5 4.5v4a2.2 2.2 0 0 0 0-4z" fill="rgba(255,255,255,0.4)"/>
        </svg>
      </div>
      <div style={{ position:'absolute', bottom:10, left:'50%', transform:'translateX(-50%)', width:134, height:5, background:'rgba(255,255,255,0.3)', borderRadius:3, zIndex:15 }}/>
    </div>
  );
  if (device === 'pixel') return (
    <div style={{ position:'absolute', inset:0, pointerEvents:'none' }}>
      <div style={{ position:'absolute', right:-4, top:150, width:4, height:80, background:'linear-gradient(270deg,#2e2e30,#58585a)', borderRadius:'0 3px 3px 0' }}/>
      <div style={{ position:'absolute', top:22, left:'50%', transform:'translateX(-50%)', width:24, height:24, borderRadius:'50%', background:'#0a0a0a', border:'2px solid #333', zIndex:20 }}/>
    </div>
  );
  if (device === 'ipad') return (
    <div style={{ position:'absolute', inset:0, pointerEvents:'none' }}>
      {[{r:80,w:50},{r:142,w:32},{r:186,w:32}].map((b,i) =>
        <div key={i} style={{ position:'absolute', top:-3, right:b.r, width:b.w, height:3, background:'linear-gradient(180deg,#4a4a4c,#666)', borderRadius:'2px 2px 0 0' }}/>
      )}
      <div style={{ position:'absolute', right:-3, top:'40%', width:3, height:60, background:'linear-gradient(270deg,#3a3a3c,#5a5a5c)', borderRadius:'0 2px 2px 0' }}/>
      <div style={{ position:'absolute', top:4, left:4, right:4, height:24, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 20px', zIndex:15, background:'#f2f2f7', borderRadius:'16px 16px 0 0' }}>
        <span style={{ fontSize:13, fontWeight:600, fontFamily:'-apple-system,sans-serif', color:'#111', letterSpacing:-0.3 }}>9:41</span>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <svg width="16" height="10" viewBox="0 0 16 10" fill="none"><rect x=".5" y=".5" width="13" height="9" rx="2.5" stroke="rgba(0,0,0,0.35)"/><rect x="1.5" y="1.5" width="10" height="7" rx="1.5" fill="rgba(0,0,0,0.8)"/><path d="M14.5 3.8v3.4a1.8 1.8 0 0 0 0-3.4z" fill="rgba(0,0,0,0.25)"/></svg>
        </div>
      </div>
      <div style={{ position:'absolute', bottom:4, left:'50%', transform:'translateX(-50%)', width:110, height:18, display:'flex', alignItems:'center', justifyContent:'center', background:'#f2f2f7', borderRadius:'0 0 16px 16px', zIndex:15 }}>
        <div style={{ width:110, height:4, background:'rgba(0,0,0,0.18)', borderRadius:3 }}/>
      </div>
    </div>
  );
  return null;
};

/**
 * DeviceFrame — single component, stable fiber identity.
 * {children} is ALWAYS at position [1] regardless of which device is selected.
 * Switching device only updates style props → no unmount of SandpackView.
 */
const DeviceFrame: React.FC<{ device: string; children: React.ReactNode }> = ({ device, children }) => {
  const spec = DEVICE_SPECS[device as DevKey] ?? DEVICE_SPECS.desktop;
  return (
    <div style={{
      position: 'relative',
      width: spec.outerW, height: spec.outerH,
      borderRadius: spec.outerR,
      background: spec.outerBg,
      boxShadow: spec.outerShadow,
      overflow: spec.outerOverflow,
      flexShrink: 0,
    }}>
      {/* [0] Background decoration — behind content */}
      <FrameBg device={device} />
      {/* [1] Content — ALWAYS at this fiber position; style props update only */}
      <div style={{
        position: 'absolute',
        left: spec.cl, top: spec.ct,
        width: spec.cw, height: spec.ch,
        overflow: 'hidden',
        borderRadius: spec.cr as number,
        zIndex: 1,
      }}>
        {children}
      </div>
      {/* [2] Foreground decoration — over content, pointer-events none */}
      <FrameFg device={device} />
    </div>
  );
};

/* ---- Chrome browser frame (kept for reference, no longer used) ---- */

const ChromeFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    width: 1280, height: 800,
    display: 'flex', flexDirection: 'column',
    borderRadius: 12, overflow: 'hidden',
    boxShadow: '0 32px 100px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.07)',
  }}>
    {/* Traffic lights */}
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'11px 14px', background:'#2a2a2a', flexShrink:0 }}>
      {['#ff5f57','#febc2e','#28c840'].map(c => (
        <div key={c} style={{ width:12, height:12, borderRadius:'50%', background:c, flexShrink:0 }}/>
      ))}
    </div>
    {/* Tab strip */}
    <div style={{ display:'flex', alignItems:'flex-end', padding:'0 8px', background:'#1e1e1e', flexShrink:0 }}>
      <div style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 14px', borderRadius:'8px 8px 0 0', background:'#2a2a2a', border:'1px solid rgba(255,255,255,0.07)', borderBottom:'none', fontSize:11, color:'rgba(255,255,255,0.55)', minWidth:160 }}>
        <div style={{ width:14, height:14, borderRadius:3, background:'#4f46e5', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <svg width="8" height="8" viewBox="0 0 8 8" fill="white"><path d="M4 0L7.5 7.5H.5z"/></svg>
        </div>
        <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>AI Studio Preview</span>
      </div>
    </div>
    {/* Address bar */}
    <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 10px', background:'#262626', borderBottom:'1px solid rgba(0,0,0,0.35)', flexShrink:0 }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
      <div style={{ flex:1, display:'flex', alignItems:'center', gap:7, background:'#1a1a1a', borderRadius:7, padding:'5px 11px', border:'1px solid rgba(255,255,255,0.05)' }}>
        <svg width="10" height="11" viewBox="0 0 10 11" fill="none" stroke="#30d158" strokeWidth="1.5"><rect x=".7" y="4.5" width="8.6" height="6" rx="1.5"/><path d="M2 4.5V3a3 3 0 0 1 6 0v1.5" strokeLinecap="round"/></svg>
        <span style={{ fontSize:11, color:'rgba(255,255,255,0.28)', fontFamily:'monospace' }}>localhost:5173</span>
      </div>
    </div>
    {/* Content */}
    <div style={{ flex:1, minHeight:0, overflow:'hidden', background:'#fff' }}>
      {children}
    </div>
  </div>
);

/* ---- iPhone 16 Pro frame ---- */

const IPhoneFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    width: 393, height: 852,
    borderRadius: 54,
    background: 'linear-gradient(160deg,#8a8a8e 0%,#58585a 50%,#3a3a3c 100%)',
    padding: 2,
    boxShadow: '0 0 0 1px rgba(255,255,255,0.18), 0 50px 140px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.15)',
    position: 'relative',
    flexShrink: 0,
  }}>
    {/* Side buttons L */}
    {[{t:112,h:32},{t:162,h:58},{t:228,h:58}].map((b,i) =>
      <div key={i} style={{ position:'absolute', left:-4, top:b.t, width:4, height:b.h, background:'linear-gradient(90deg,#2e2e30,#58585a)', borderRadius:'3px 0 0 3px' }}/>
    )}
    {/* Power button R */}
    <div style={{ position:'absolute', right:-4, top:176, width:4, height:80, background:'linear-gradient(270deg,#2e2e30,#58585a)', borderRadius:'0 3px 3px 0' }}/>

    {/* Inner shell */}
    <div style={{ width:'100%', height:'100%', borderRadius:52, background:'#1c1c1e', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'inset 0 0 0 1px rgba(0,0,0,0.7)' }}>
      {/* Screen */}
      <div style={{ flex:1, background:'#000', display:'flex', flexDirection:'column', overflow:'hidden', position:'relative', borderRadius:50 }}>
        {/* Dynamic Island */}
        <div style={{ position:'absolute', top:12, left:'50%', transform:'translateX(-50%)', width:118, height:34, background:'#000', borderRadius:20, border:'1.5px solid #1c1c1e', zIndex:20, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 14px' }}>
          <div style={{ width:11, height:11, borderRadius:'50%', background:'#0d0d14', border:'2px solid #1a1a22' }}/>
          <div style={{ width:8, height:8, borderRadius:'50%', background:'#081208' }}/>
        </div>
        {/* Status bar */}
        <div style={{ height:52, display:'flex', alignItems:'flex-end', justifyContent:'space-between', padding:'0 28px 6px', flexShrink:0, zIndex:15, position:'relative' }}>
          <span style={{ fontSize:15, fontWeight:700, color:'rgba(255,255,255,0.92)', fontFamily:'-apple-system,sans-serif', letterSpacing:-0.5 }}>9:41</span>
          <svg width="28" height="13" viewBox="0 0 28 13" fill="none">
            <rect x=".5" y=".5" width="22" height="12" rx="3.5" stroke="rgba(255,255,255,0.35)"/>
            <rect x="2" y="2" width="17" height="9" rx="2" fill="rgba(255,255,255,0.9)"/>
            <path d="M24.5 4.5v4a2.2 2.2 0 0 0 0-4z" fill="rgba(255,255,255,0.4)"/>
          </svg>
        </div>
        {/* App content */}
        <div style={{ flex:1, overflow:'hidden', minHeight:0 }}>
          {children}
        </div>
        {/* Home indicator */}
        <div style={{ height:34, background:'#000', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <div style={{ width:130, height:5, background:'rgba(255,255,255,0.2)', borderRadius:3 }}/>
        </div>
      </div>
    </div>
  </div>
);

/* ---- iPad Pro 11" frame ---- */

const IPadFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    width: 834, height: 1194,
    borderRadius: 20,
    background: 'linear-gradient(160deg,#6c6c70 0%,#4a4a4c 60%,#3a3a3c 100%)',
    padding: 2,
    boxShadow: '0 0 0 1px rgba(255,255,255,0.14), 0 40px 120px rgba(0,0,0,0.8)',
    position: 'relative',
    flexShrink: 0,
  }}>
    {/* Top buttons */}
    {[{r:80,w:50},{r:142,w:32},{r:186,w:32}].map((b,i) =>
      <div key={i} style={{ position:'absolute', top:-3, right:b.r, width:b.w, height:3, background:'linear-gradient(180deg,#4a4a4c,#666)', borderRadius:'2px 2px 0 0' }}/>
    )}
    {/* Right power/pencil */}
    <div style={{ position:'absolute', right:-3, top:'40%', width:3, height:60, background:'linear-gradient(270deg,#3a3a3c,#5a5a5c)', borderRadius:'0 2px 2px 0' }}/>

    <div style={{ width:'100%', height:'100%', borderRadius:18, background:'#1c1c1e', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'inset 0 0 0 1px rgba(0,0,0,0.6)' }}>
      <div style={{ flex:1, background:'#f2f2f7', display:'flex', flexDirection:'column', overflow:'hidden', margin:2, borderRadius:16 }}>
        {/* iPadOS status bar */}
        <div style={{ height:24, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 20px', flexShrink:0 }}>
          <span style={{ fontSize:13, fontWeight:600, fontFamily:'-apple-system,sans-serif', color:'#111', letterSpacing:-0.3 }}>9:41</span>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <svg width="16" height="10" viewBox="0 0 16 10" fill="none"><rect x=".5" y=".5" width="13" height="9" rx="2.5" stroke="rgba(0,0,0,0.35)"/><rect x="1.5" y="1.5" width="10" height="7" rx="1.5" fill="rgba(0,0,0,0.8)"/><path d="M14.5 3.8v3.4a1.8 1.8 0 0 0 0-3.4z" fill="rgba(0,0,0,0.25)"/></svg>
          </div>
        </div>
        {/* Content */}
        <div style={{ flex:1, overflow:'hidden', minHeight:0 }}>
          {children}
        </div>
        {/* Home bar */}
        <div style={{ height:18, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <div style={{ width:110, height:4, background:'rgba(0,0,0,0.18)', borderRadius:3 }}/>
        </div>
      </div>
    </div>
  </div>
);

/* ---- Pixel frame ---- */

const PixelFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    width: 393, height: 852,
    borderRadius: 48,
    background: 'linear-gradient(145deg,#4a4a4e 0%,#2a2a2c 100%)',
    padding: 2,
    boxShadow: '0 0 0 1px rgba(255,255,255,0.18), 0 50px 140px rgba(0,0,0,0.9)',
    position: 'relative',
    flexShrink: 0,
  }}>
    {/* Side button */}
    <div style={{ position:'absolute', right:-4, top:150, width:4, height:80, background:'linear-gradient(270deg,#2e2e30,#58585a)', borderRadius:'0 3px 3px 0' }}/>
    <div style={{ width:'100%', height:'100%', borderRadius:46, background:'#1a1a1a', overflow:'hidden', display:'flex', flexDirection:'column' }}>
      {/* Camera punch */}
      <div style={{ position:'absolute', top:20, left:'50%', transform:'translateX(-50%)', width:24, height:24, borderRadius:'50%', background:'#0a0a0a', border:'2px solid #333', zIndex:20 }}/>
      <div style={{ flex:1, marginTop:60, background:'#fff', overflow:'hidden', borderRadius:'40px 40px 0 0' }}>
        {children}
      </div>
    </div>
  </div>
);

/* ---- Workspace binding contract ---- */

export type WorkspaceProjectStateKind =
  | 'none'
  | 'persisted'
  | 'stale_missing'
  | 'preload_failed'
  | 'live_run';

export interface WorkspaceProjectState {
  kind: WorkspaceProjectStateKind;
  projectId: string | null;
  branchId: string;
  message?: string;
}

export type WorkspaceDiagnosticCode =
  | 'artifact_ingress_failed'
  | 'candidate_compile_failed'
  | 'final_check_failed'
  | 'watchdog_revoke'
  | 'repository_preload_failed'
  | 'project_not_found';

export interface WorkspaceRunDiagnostic {
  code: WorkspaceDiagnosticCode;
  title: string;
  detail: string;
  runId?: string | null;
}

export type WorkspaceTraceScope =
  | 'current-run'
  | 'recent-project-branch'
  | 'historical-archive'
  | 'empty';

export interface WorkspaceBinding {
  projectId: string;
  branchId: string;
  runId: string | null;
  scope: WorkspaceTraceScope;
  trace: GenerationTrace | null;
  projectState: WorkspaceProjectState;
  diagnostic: WorkspaceRunDiagnostic | null;
}

export interface AnalyticsTraceRow {
  key: string;
  scope: Exclude<WorkspaceTraceScope, 'empty'>;
  scopeLabel: string;
  trace: GenerationTrace;
}

const DEFAULT_BRANCH_ID = 'main';

function normalizeBranchId(branchId: string | null | undefined): string {
  return branchId?.trim() || DEFAULT_BRANCH_ID;
}

function traceMatchesWorkspace(trace: GenerationTrace, projectId: string, branchId: string): boolean {
  if (!projectId || trace.projectId !== projectId) return false;
  return !trace.branchId || trace.branchId === branchId;
}

function isLiveRunLifecycle(lifecycle?: string): boolean {
  return (
    lifecycle === 'generating' ||
    lifecycle === 'validating' ||
    lifecycle === 'committing' ||
    lifecycle === 'materializing'
  );
}

function isTerminalCurrentRunLifecycle(lifecycle?: string): boolean {
  return (
    lifecycle === 'preview-ready' ||
    lifecycle === 'degraded' ||
    lifecycle === 'failed' ||
    lifecycle === 'blocked'
  );
}

function latestFirst(traces: GenerationTrace[]): GenerationTrace[] {
  return traces.slice().sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

function getTraceStopReason(trace: GenerationTrace): string {
  const debug = trace.fullDebugTrace;
  const eventReason = debug?.events?.slice().reverse().find(event => event.stopReason)?.stopReason;
  return String(debug?.stopReason ?? eventReason ?? '').toLowerCase();
}

function getTraceErrorText(trace: GenerationTrace): string {
  const eventErrors = trace.fullDebugTrace?.events
    ?.flatMap(event => [event.errorSummary, ...(event.compileRuntimeLogs ?? [])])
    .filter(Boolean)
    .join('\n') ?? '';
  return [
    trace.errorSummary,
    trace.fullDebugTrace?.stopReason,
    eventErrors,
  ].filter(Boolean).join('\n');
}

export function classifyWorkspaceFailureFromTrace(trace: GenerationTrace): WorkspaceRunDiagnostic | null {
  if (trace.outcome === 'ok' && trace.visibleReasoningTrace?.finalOutcome !== 'ship_fail') {
    return null;
  }

  const stopReason = getTraceStopReason(trace);
  const errorText = getTraceErrorText(trace);
  const search = `${stopReason}\n${errorText}`.toLowerCase();
  const runId = trace.visibleReasoningTrace?.runId ?? trace.id;

  if (search.includes('artifact_ingress_failed') || search.includes('artifact ingress failed')) {
    return {
      code: 'artifact_ingress_failed',
      title: 'Current run stopped at artifact ingress',
      detail: errorText || 'The model response could not be accepted as usable project files.',
      runId,
    };
  }

  if (search.includes('final_check_failed') || search.includes('final check failed') || search.includes('live-preview check')) {
    return {
      code: 'final_check_failed',
      title: 'Current run failed the final check',
      detail: errorText || 'The candidate compiled, but the final live-preview check blocked promotion.',
      runId,
    };
  }

  if (search.includes('promotion_revoked') || search.includes('watchdog') || search.includes('revoked')) {
    return {
      code: 'watchdog_revoke',
      title: 'Current run was revoked by the preview watchdog',
      detail: errorText || 'The promoted preview became unhealthy and was revoked.',
      runId,
    };
  }

  if (
    search.includes('fast_gate_failed') ||
    search.includes('candidate_not_viable') ||
    search.includes('compile failed') ||
    search.includes('candidate_materialization_failed') ||
    search.includes('repair_budget')
  ) {
    return {
      code: 'candidate_compile_failed',
      title: 'Current run failed candidate compile',
      detail: errorText || 'The generated candidate did not become a viable compiled revision.',
      runId,
    };
  }

  if (trace.outcome === 'error' || trace.visibleReasoningTrace?.finalOutcome === 'ship_fail') {
    return {
      code: 'candidate_compile_failed',
      title: 'Current run failed before usable output',
      detail: errorText || 'The run ended before a usable candidate could be promoted.',
      runId,
    };
  }

  return null;
}

function classifyWorkspaceProjectFailure(
  projectState: WorkspaceProjectState,
  previewBlockedReason?: string | null,
): WorkspaceRunDiagnostic | null {
  const reason = previewBlockedReason ?? projectState.message ?? '';
  const lower = reason.toLowerCase();

  if (projectState.kind === 'preload_failed' || lower.includes('repository preload failed') || lower.includes('preview load failed')) {
    return {
      code: 'repository_preload_failed',
      title: 'Persisted project preload failed',
      detail: reason || 'The saved project could not be materialized into the preview workspace.',
      runId: null,
    };
  }

  if (projectState.kind === 'stale_missing' || lower.includes('not found')) {
    return {
      code: 'project_not_found',
      title: 'Persisted project state is missing',
      detail: reason || 'The saved project row was not found. Live run state, if present, remains authoritative.',
      runId: null,
    };
  }

  return null;
}

export function resolveWorkspaceBinding(input: {
  projectId?: string | null;
  branchId?: string | null;
  isGenerating?: boolean;
  activeTrace?: GenerationTrace | null;
  recentTraces?: GenerationTrace[];
  persistedProjectExists?: boolean;
  previewLifecycle?: string;
  previewBlockedReason?: string | null;
}): WorkspaceBinding {
  const projectId = input.projectId ?? '';
  const branchId = normalizeBranchId(input.branchId);
  const recentTraces = latestFirst(input.recentTraces ?? []);
  const activeTrace = input.activeTrace && traceMatchesWorkspace(input.activeTrace, projectId, branchId)
    ? input.activeTrace
    : null;
  const scopedRecent = recentTraces.find(trace => traceMatchesWorkspace(trace, projectId, branchId)) ?? null;
  const liveRunInProgress = !!input.isGenerating || isLiveRunLifecycle(input.previewLifecycle);
  const terminalCurrentRun = isTerminalCurrentRunLifecycle(input.previewLifecycle);
  const trace = activeTrace ?? (liveRunInProgress ? null : scopedRecent);
  const scope: WorkspaceTraceScope =
    activeTrace || liveRunInProgress || (terminalCurrentRun && trace)
      ? 'current-run'
      : trace
        ? 'recent-project-branch'
        : 'empty';

  const projectState: WorkspaceProjectState =
    input.isGenerating
      ? { kind: 'live_run', projectId: projectId || null, branchId, message: 'Current generation run owns this workspace.' }
      : !projectId
        ? { kind: 'none', projectId: null, branchId, message: 'No project is currently selected.' }
        : input.persistedProjectExists === false
          ? { kind: 'stale_missing', projectId, branchId, message: 'Persisted project row is missing or stale.' }
          : { kind: 'persisted', projectId, branchId };

  const diagnostic =
    (trace ? classifyWorkspaceFailureFromTrace(trace) : null)
    ?? classifyWorkspaceProjectFailure(projectState, input.previewBlockedReason);

  return {
    projectId,
    branchId,
    runId: trace?.visibleReasoningTrace?.runId ?? trace?.id ?? null,
    scope,
    trace,
    projectState,
    diagnostic,
  };
}

export function buildScopedTraceRows(input: {
  binding: WorkspaceBinding;
  recentTraces: GenerationTrace[];
}): AnalyticsTraceRow[] {
  const rows: AnalyticsTraceRow[] = [];
  const seen = new Set<string>();
  const add = (trace: GenerationTrace, scope: AnalyticsTraceRow['scope']) => {
    const identity = `${trace.id}:${trace.startedAt}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    rows.push({
      key: `${scope}:${trace.projectId ?? 'no-project'}:${trace.branchId ?? DEFAULT_BRANCH_ID}:${identity}`,
      scope,
      scopeLabel:
        scope === 'current-run'
          ? 'Current run'
          : scope === 'recent-project-branch'
            ? 'Recent runs for current project / branch'
            : 'Historical archive',
      trace,
    });
  };

  if (input.binding.trace) {
    add(
      input.binding.trace,
      input.binding.scope === 'recent-project-branch' ? 'recent-project-branch' : 'current-run',
    );
  }

  for (const trace of latestFirst(input.recentTraces)) {
    if (traceMatchesWorkspace(trace, input.binding.projectId, input.binding.branchId)) {
      add(trace, 'recent-project-branch');
    } else if (!input.binding.projectId) {
      add(trace, 'historical-archive');
    }
  }

  return rows;
}

const WorkspaceDiagnosticPanel: React.FC<{
  diagnostic: WorkspaceRunDiagnostic;
  testId: string;
  compact?: boolean;
}> = ({ diagnostic, testId, compact = false }) => (
  <div
    data-testid={testId}
    data-diagnostic-code={diagnostic.code}
    style={{
      margin: compact ? 0 : '80px auto 0',
      maxWidth: 560,
      borderRadius: 12,
      border: '1px solid rgba(255,69,58,0.28)',
      background: 'rgba(255,69,58,0.07)',
      padding: compact ? '9px 12px' : '16px 18px',
      color: 'rgba(255,255,255,0.78)',
      fontSize: compact ? 11 : 13,
      lineHeight: 1.55,
    }}
  >
    <div style={{ fontWeight: 700, color: '#ff9f0a', marginBottom: 4 }}>
      {diagnostic.title}
    </div>
    <div style={{ color: 'rgba(255,255,255,0.55)', whiteSpace: 'pre-wrap' }}>
      {diagnostic.detail}
    </div>
    {diagnostic.runId && (
      <div style={{ marginTop: 8, fontSize: 10, color: 'rgba(255,255,255,0.34)', fontFamily: 'monospace' }}>
        run {diagnostic.runId}
      </div>
    )}
  </div>
);

/* ---- Code Panel ---- */

const CodePanel: React.FC<{
  files: FileMap; setFiles: (f:FileMap)=>void;
  activeFile: string; setActiveFile: (n:string)=>void;
  binding: WorkspaceBinding;
}> = ({ files, setFiles, activeFile, setActiveFile, binding }) => {
  const [copied, setCopied] = useState(false);
  const names = Object.keys(files);
  const displayFile = files[activeFile] !== undefined ? activeFile : (names[0] ?? activeFile);
  const code  = files[displayFile] ?? '';
  const runSummary = binding.trace?.runSummary ?? null;

  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(()=>setCopied(false),2000); };
  const add  = () => { const n=prompt('File name'); if(n?.trim()){setFiles({...files,[n.trim()]:''});setActiveFile(n.trim());} };
  const del  = (n:string) => { if(names.length<=1)return; const u={...files}; delete u[n]; setFiles(u); if(activeFile===n)setActiveFile(Object.keys(u)[0]); };

  if (names.length === 0) {
    return (
      <div style={{ width:'100%', height:'100%', background:'#0a0a0a', overflow:'auto', padding:20, boxSizing:'border-box' }}>
        {binding.diagnostic ? (
          <WorkspaceDiagnosticPanel diagnostic={binding.diagnostic} testId="code-diagnostic" />
        ) : (
          <div
            data-testid="code-empty"
            style={{ textAlign:'center', marginTop:80, color:'rgba(255,255,255,0.32)', fontSize:13 }}
          >
            No code files are available for the current workspace scope.
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ width:'100%', height:'100%', display:'flex', background:'#0a0a0a' }}>
      {/* Sidebar */}
      <div style={{ width:156, borderRight:'1px solid rgba(255,255,255,0.06)', background:'#060606', display:'flex', flexDirection:'column', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', borderBottom:'1px solid rgba(255,255,255,0.06)', flexShrink:0 }}>
          <span style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(255,255,255,0.2)' }}>Files</span>
          <button onClick={add} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.3)', padding:2, display:'flex' }}><FilePlus size={12}/></button>
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          {names.map(n=>(
            <div key={n} onClick={()=>setActiveFile(n)}
              data-testid="code-file-item"
              data-path={n}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 12px', cursor:'pointer', background:n===activeFile?'rgba(79,70,229,0.1)':'transparent', borderLeft:`2px solid ${n===activeFile?'#6366f1':'transparent'}` }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:colorOf(n), flexShrink:0 }}/>
              <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:11, color:n===activeFile?'#e0e7ff':'rgba(255,255,255,0.38)' }}>{n}</span>
              {names.length>1 && <button onClick={e=>{e.stopPropagation();del(n);}} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,80,80,0.6)', padding:0, display:'flex' }}><Trash2 size={10}/></button>}
            </div>
          ))}
        </div>
      </div>
      {/* Editor */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
        {binding.diagnostic && (
          <WorkspaceDiagnosticPanel diagnostic={binding.diagnostic} testId="code-diagnostic-banner" compact />
        )}
        {runSummary?.output && (
          <div
            data-testid="code-structure-summary"
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            <OutputStructureSummary output={runSummary.output} compact testId="code-structure-summary-body" />
          </div>
        )}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 16px', borderBottom:'1px solid rgba(255,255,255,0.06)', flexShrink:0 }}>
          <span style={{ fontSize:11, color:'rgba(255,255,255,0.28)', fontFamily:'monospace' }}>{displayFile}</span>
          <button onClick={copy} style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 12px', borderRadius:7, background:'none', border:'none', cursor:'pointer', fontSize:11, color:copied?'#30d158':'rgba(255,255,255,0.3)' }}>
            {copied?<Check size={12}/>:<Copy size={12}/>} {copied?'Copied':'Copy'}
          </button>
        </div>
        <textarea
          data-testid="code-editor-textarea"
          style={{ flex:1, background:'transparent', border:'none', outline:'none', resize:'none', padding:'16px 20px', fontSize:12, lineHeight:1.7, fontFamily:'monospace', color:'rgba(255,255,255,0.72)', whiteSpace:'pre', overflowWrap:'normal' }}
          value={code} onChange={e=>setFiles({...files,[displayFile]:e.target.value})} spellCheck={false}
        />
      </div>
    </div>
  );
};

/* ---- Mini panels ---- */

// ── ObservabilityPanel — real generation traces ─────────────────────────────

const SpanRow: React.FC<{ span: TraceSpan; depth: number }> = ({ span, depth }) => {
  const [open, setOpen] = useState(false);
  const hasChildren = span.children.length > 0;
  const c = span.status === 'ok' ? '#30d158' : span.status === 'warn' ? '#ffd60a' : span.status === 'error' ? '#ff453a' : '#888';
  const indent = depth * 12;
  return (
    <>
      <div
        onClick={() => hasChildren && setOpen(o => !o)}
        style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 12px', paddingLeft: 12 + indent, cursor: hasChildren ? 'pointer' : 'default',
                 borderBottom:'1px solid rgba(255,255,255,0.03)', background: depth === 0 ? 'rgba(255,255,255,0.015)' : 'transparent' }}
      >
        <div style={{ width:6, height:6, borderRadius:'50%', background:c, flexShrink:0 }}/>
        <span style={{ flex:1, fontSize:11, color:'rgba(255,255,255,0.7)', fontFamily:'monospace' }}>{span.name}</span>
        {span.durationMs !== undefined && (
          <span style={{ fontSize:10, color:'rgba(255,255,255,0.25)', fontFamily:'monospace' }}>{span.durationMs}ms</span>
        )}
        {hasChildren && (
          <span style={{ fontSize:9, color:'rgba(255,255,255,0.3)' }}>{open ? '▾' : '▸'}</span>
        )}
      </div>
      {open && span.children.map((ch, i) => (
        <SpanRow key={`${ch.name}:${ch.startMs}:${i}`} span={ch} depth={depth + 1} />
      ))}
    </>
  );
};

function formatMetricMs(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
}

function formatMetricBytes(value?: number): string {
  if (value === undefined || value <= 0) return '—';
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function sourceLabel(source: NonNullable<NonNullable<TraceRunSummary['quality']>['gates']>[number]['source']): string {
  if (source === 'real-llm') return 'real-llm';
  if (source === 'fixture-backed') return 'fixture';
  return 'real-runtime';
}

const MetricCard: React.FC<{ label: string; value: string | number; accent?: string; isDark?: boolean }> = ({ label, value, accent, isDark = true }) => (
  <div style={{ borderRadius: 12, padding: '10px 12px', background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.04)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.08)'}` }}>
    <div style={{ fontSize: 9, color: isDark ? 'rgba(255,255,255,0.32)' : 'rgba(15,23,42,0.42)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
    <div style={{ fontSize: 15, fontWeight: 700, color: accent ?? (isDark ? 'rgba(255,255,255,0.88)' : '#0f172a') }}>{value}</div>
  </div>
);

const SummaryCard: React.FC<{
  title: string;
  isDark?: boolean;
  children: React.ReactNode;
}> = ({ title, isDark = true, children }) => (
  <div style={{ borderRadius: 14, padding: '12px 14px', background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.75)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.08)'}` }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: isDark ? 'rgba(255,255,255,0.34)' : 'rgba(15,23,42,0.46)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
      {title}
    </div>
    {children}
  </div>
);

const PathPills: React.FC<{ items: string[]; tone?: 'neutral' | 'warn'; isDark?: boolean }> = ({ items, tone = 'neutral', isDark = true }) => {
  if (items.length === 0) return <div style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.32)' : 'rgba(15,23,42,0.42)' }}>—</div>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map(item => (
        <span
          key={item}
          style={{
            fontSize: 10,
            fontFamily: 'monospace',
            padding: '4px 8px',
            borderRadius: 999,
            background: tone === 'warn' ? 'rgba(245,158,11,0.12)' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)'),
            color: tone === 'warn' ? '#fbbf24' : (isDark ? 'rgba(255,255,255,0.74)' : '#334155'),
            border: `1px solid ${tone === 'warn' ? 'rgba(245,158,11,0.2)' : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)')}`,
          }}
        >
          {item}
        </span>
      ))}
    </div>
  );
};

const OUTPUT_RICHNESS_ACCENT: Record<'rich' | 'adequate' | 'weak', { bg: string; border: string; color: string }> = {
  rich: { bg: 'rgba(34,197,94,0.14)', border: 'rgba(34,197,94,0.24)', color: '#86efac' },
  adequate: { bg: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.24)', color: '#fbbf24' },
  weak: { bg: 'rgba(239,68,68,0.14)', border: 'rgba(239,68,68,0.24)', color: '#fca5a5' },
};

const OutputStructureSummary: React.FC<{
  output?: NonNullable<TraceRunSummary['output']>;
  isDark?: boolean;
  compact?: boolean;
  testId?: string;
}> = ({ output, isDark = true, compact = false, testId }) => {
  if (!output?.structure && !output?.skeletonDelta) {
    return <div style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.32)' : '#64748b' }}>No structural summary captured.</div>;
  }

  const structure = output?.structure;
  const skeletonDelta = output?.skeletonDelta;
  const richness = structure?.richness ?? 'weak';
  const accent = OUTPUT_RICHNESS_ACCENT[richness];
  const visibleBuckets = (structure?.buckets ?? [])
    .filter(bucket => bucket.totalCount > 0 || bucket.deltaCount > 0)
    .slice(0, compact ? 4 : 6);

  return (
    <div data-testid={testId}>
      {structure && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              padding: '4px 8px',
              borderRadius: 999,
              background: accent.bg,
              border: `1px solid ${accent.border}`,
              color: accent.color,
            }}>
              {richness}
            </span>
            <span style={{ fontSize: compact ? 11 : 12, color: isDark ? 'rgba(255,255,255,0.74)' : '#334155' }}>
              {structure.summary}
            </span>
          </div>

          {(structure.missingOutputClasses.length > 0 || structure.missingDeltaClasses.length > 0) && (
            <div style={{ marginBottom: 8, fontSize: 11, color: '#fbbf24' }}>
              {[
                structure.missingOutputClasses.length > 0 ? `missing output: ${structure.missingOutputClasses.join(', ')}` : null,
                structure.missingDeltaClasses.length > 0 ? `missing delta: ${structure.missingDeltaClasses.join(', ')}` : null,
              ].filter(Boolean).join(' · ')}
            </div>
          )}
        </>
      )}

      {skeletonDelta && (
        <div style={{ display: 'grid', gridTemplateColumns: compact ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: 8, marginBottom: 10 }}>
          <MetricCard label="Skeleton used" value={skeletonDelta.skeletonFileCount} isDark={isDark} />
          <MetricCard label="Delta files" value={skeletonDelta.deltaFileCount} isDark={isDark} />
          <MetricCard label="Modified base" value={skeletonDelta.modifiedExistingCount} isDark={isDark} />
          <MetricCard label="New files" value={skeletonDelta.newFileCount} isDark={isDark} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visibleBuckets.map(bucket => (
          <div
            key={bucket.id}
            style={{
              borderRadius: 12,
              padding: compact ? '8px 10px' : '10px 12px',
              background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.03)',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.08)'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: isDark ? 'rgba(255,255,255,0.84)' : '#0f172a' }}>{bucket.label}</span>
              <span style={{ fontSize: 10, color: isDark ? 'rgba(255,255,255,0.4)' : '#64748b' }}>
                total {bucket.totalCount} · delta {bucket.deltaCount} · new {bucket.newCount} · modified {bucket.modifiedCount}
              </span>
            </div>
            <div style={{ fontSize: 10, color: isDark ? 'rgba(255,255,255,0.5)' : '#475569', marginBottom: 6 }}>
              {bucket.meaning}
            </div>
            <PathPills items={bucket.keyPaths} isDark={isDark} />
          </div>
        ))}
      </div>

      {skeletonDelta && (
        <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: isDark ? 'rgba(255,255,255,0.34)' : '#64748b', marginBottom: 6 }}>New paths</div>
            <PathPills items={skeletonDelta.keyNewPaths} isDark={isDark} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: isDark ? 'rgba(255,255,255,0.34)' : '#64748b', marginBottom: 6 }}>Modified existing paths</div>
            <PathPills items={skeletonDelta.keyModifiedPaths} isDark={isDark} />
          </div>
        </div>
      )}
    </div>
  );
};

const TraceCard: React.FC<{ row: AnalyticsTraceRow }> = ({ row }) => {
  const { trace } = row;
  const [open, setOpen] = useState(false);
  const outcome = trace.outcome;
  const oc = outcome === 'ok' ? '#30d158' : outcome === 'warn' ? '#ffd60a' : '#ff453a';
  const date = new Date(trace.startedAt).toLocaleTimeString();

  return (
    <div style={{ borderRadius:14, border:'1px solid rgba(255,255,255,0.07)', marginBottom:8, overflow:'hidden' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', cursor:'pointer', background:'rgba(255,255,255,0.02)' }}
      >
        <div style={{ width:8, height:8, borderRadius:'50%', background:oc, flexShrink:0 }}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.8)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {trace.intent.slice(0, 60)}
          </div>
          <div style={{ fontSize:9, color:'rgba(255,255,255,0.25)', marginTop:2 }}>
            {row.scopeLabel} · {date} · {trace.mode.toUpperCase()} · {trace.model.split('/').pop()?.slice(0, 20)}
          </div>
        </div>
        <div style={{ display:'flex', gap:10, fontSize:10, color:'rgba(255,255,255,0.35)', flexShrink:0 }}>
          {trace.e2eMs !== undefined && <span>{(trace.e2eMs / 1000).toFixed(1)}s</span>}
          {trace.fileCount !== undefined && <span>{trace.fileCount}f</span>}
          {trace.ttftMs !== undefined && <span>ttft:{trace.ttftMs}ms</span>}
        </div>
        <span style={{ fontSize:9, color:'rgba(255,255,255,0.3)', marginLeft:4 }}>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div style={{ background:'rgba(0,0,0,0.2)' }}>
          {trace.errorSummary && (
            <div style={{ padding:'8px 14px', fontSize:10, color:'#ff453a', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
              ✗ {trace.errorSummary}
            </div>
          )}
          {trace.spans.map((span, i) => (
            <SpanRow key={`${trace.id}:${span.name}:${span.startMs}:${i}`} span={span} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
};

const AnalyticsPanel: React.FC<{ binding: WorkspaceBinding }> = ({ binding }) => {
  const [traces, setTraces] = useState<GenerationTrace[]>(() =>
    generationTracer.getRecent(20).reverse(),
  );

  useEffect(() => {
    const handler = () => setTraces(generationTracer.getRecent(20).reverse());
    window.addEventListener('studio-trace', handler);
    return () => window.removeEventListener('studio-trace', handler);
  }, []);

  const rows = buildScopedTraceRows({ binding, recentTraces: traces });
  const rowTraces = rows.map(row => row.trace);
  const ok      = rowTraces.filter(t => t.outcome === 'ok').length;
  const errored = rowTraces.filter(t => t.outcome === 'error').length;
  const avgE2e  = rowTraces.filter(t => t.e2eMs !== undefined).reduce((a, t) => a + (t.e2eMs ?? 0), 0) / (rowTraces.length || 1);
  const avgTtft = rowTraces.filter(t => t.ttftMs !== undefined).reduce((a, t) => a + (t.ttftMs ?? 0), 0) / (rowTraces.filter(t => t.ttftMs !== undefined).length || 1);
  const currentTrace = binding.trace ?? rows[0]?.trace ?? null;
  const currentSummary = currentTrace?.runSummary;
  const scopeLabel =
    binding.scope === 'current-run'
      ? 'Current run'
      : binding.scope === 'recent-project-branch'
        ? 'Recent runs for current project / branch'
        : binding.projectId
          ? 'No current run for this project / branch'
          : 'Historical archive';

  return (
    <div style={{ width:'100%', height:'100%', overflowY:'auto', padding:20, background:'#060606', boxSizing:'border-box' }}>
      <h2 style={{ fontSize:13, fontWeight:600, marginBottom:6, color:'rgba(255,255,255,0.7)' }}>Workspace Analytics</h2>
      <div
        data-testid="analytics-scope-label"
        style={{ fontSize:10, color:'rgba(255,255,255,0.36)', marginBottom:14, fontFamily:'monospace' }}
      >
        {scopeLabel} · project {binding.projectId || 'none'} · branch {binding.branchId} · run {binding.runId ?? 'none'}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:16 }}>
        {[
          { l:'Scoped', v: rows.length },
          { l:'Success', v: ok, clr:'#30d158' },
          { l:'Failed', v: errored, clr: errored > 0 ? '#ff453a' : undefined },
          { l:'Avg E2E', v: rows.length ? `${(avgE2e/1000).toFixed(1)}s` : '—' },
        ].map(s => (
          <div key={s.l} style={{ borderRadius:12, padding:'10px 12px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.25)', marginBottom:4 }}>{s.l}</div>
            <div style={{ fontSize:16, fontWeight:700, color: s.clr ?? 'rgba(255,255,255,0.85)' }}>{s.v}</div>
          </div>
        ))}
      </div>

      {rows.length > 0 && avgTtft > 0 && (
        <div style={{ marginBottom:12, padding:'8px 12px', borderRadius:10, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)', fontSize:10, color:'rgba(255,255,255,0.4)' }}>
          Avg time-to-first-token: <strong style={{ color:'rgba(255,255,255,0.7)' }}>{Math.round(avgTtft)}ms</strong>
        </div>
      )}

      {currentTrace && !currentSummary && (
        <div
          data-testid="analytics-no-telemetry"
          style={{ marginBottom: 14, padding: '11px 13px', borderRadius: 12, border: '1px solid rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.08)', color: 'rgba(255,255,255,0.74)', fontSize: 12 }}
        >
          no telemetry for this run
        </div>
      )}

      {currentSummary && (
        <>
          {currentSummary.noTelemetryReason && (
            <div
              data-testid="analytics-no-telemetry"
              style={{ marginBottom: 14, padding: '11px 13px', borderRadius: 12, border: '1px solid rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.08)', color: 'rgba(255,255,255,0.74)', fontSize: 12 }}
            >
              {currentSummary.noTelemetryReason}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 14 }}>
            <MetricCard label="Time to preview" value={formatMetricMs(currentSummary.output?.totalTimeToPreviewMs ?? currentTrace?.e2eMs)} />
            <MetricCard label="Changed files" value={currentSummary.output?.changedFileCount ?? 0} />
            <MetricCard label="Created files" value={currentSummary.output?.createdFileCount ?? 0} />
            <MetricCard label="Delta size" value={formatMetricBytes(currentSummary.output?.deltaSizeBytes)} />
            <MetricCard label="Compile count" value={currentSummary.output?.compileCount ?? 0} />
            <MetricCard label="Preview / save" value={`${currentSummary.output?.previewMountStatus ?? 'missing'} / ${currentSummary.output?.saveReady ? 'ready' : 'locked'}`} accent={currentSummary.output?.saveReady ? '#22c55e' : '#f59e0b'} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
            <SummaryCard title="Selected base">
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.86)', fontWeight: 600 }}>
                {currentSummary.skeleton?.label ?? 'Unknown skeleton'}
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.48)' }}>
                {[
                  currentSummary.skeleton?.id,
                  currentSummary.skeleton?.archetypeName ?? currentSummary.skeleton?.archetypeId,
                  currentSummary.design?.themeName,
                ].filter(Boolean).join(' · ')}
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.36)', marginBottom: 6 }}>Skeleton files</div>
                <PathPills items={(currentSummary.output?.skeletonFiles ?? []).slice(0, 8)} />
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.36)', marginBottom: 6 }}>Delta files</div>
                <PathPills items={(currentSummary.output?.deltaFiles ?? []).slice(0, 8)} />
              </div>
            </SummaryCard>

            <SummaryCard title="Run truth">
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>{currentSummary.path.summary}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <span style={{ fontSize: 10, padding: '4px 8px', borderRadius: 999, background: 'rgba(59,130,246,0.14)', color: '#93c5fd' }}>{currentSummary.path.kind}</span>
                <span style={{ fontSize: 10, padding: '4px 8px', borderRadius: 999, background: currentSummary.path.usesRealLlm ? 'rgba(34,197,94,0.14)' : 'rgba(255,255,255,0.08)', color: currentSummary.path.usesRealLlm ? '#86efac' : 'rgba(255,255,255,0.54)' }}>real-llm {currentSummary.path.usesRealLlm ? 'yes' : 'no'}</span>
                <span style={{ fontSize: 10, padding: '4px 8px', borderRadius: 999, background: currentSummary.path.usesRealRuntime ? 'rgba(34,197,94,0.14)' : 'rgba(255,255,255,0.08)', color: currentSummary.path.usesRealRuntime ? '#86efac' : 'rgba(255,255,255,0.54)' }}>real-runtime {currentSummary.path.usesRealRuntime ? 'yes' : 'no'}</span>
                <span style={{ fontSize: 10, padding: '4px 8px', borderRadius: 999, background: currentSummary.path.fixtureBacked ? 'rgba(245,158,11,0.14)' : 'rgba(255,255,255,0.08)', color: currentSummary.path.fixtureBacked ? '#fbbf24' : 'rgba(255,255,255,0.54)' }}>fixture {currentSummary.path.fixtureBacked ? 'yes' : 'no'}</span>
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.36)', marginBottom: 6 }}>Markers</div>
                <PathPills items={currentSummary.path.markers} tone={currentSummary.path.testEnvironment ? 'warn' : 'neutral'} />
              </div>
            </SummaryCard>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
            <SummaryCard title="Key paths">
              <PathPills items={currentSummary.output?.keyPaths ?? []} />
            </SummaryCard>

            <SummaryCard title="Output structure">
              <OutputStructureSummary output={currentSummary.output} testId="analytics-structure-summary" />
            </SummaryCard>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
            <SummaryCard title="Quality breakdown">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: currentSummary.quality?.verdict === 'pass' ? '#22c55e' : currentSummary.quality?.verdict === 'partial' ? '#f59e0b' : '#ef4444' }}>
                  {(currentSummary.quality?.verdict ?? 'partial').toUpperCase()}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.56)' }}>{currentSummary.quality?.summary ?? 'No quality summary captured.'}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(currentSummary.quality?.gates ?? []).slice(0, 8).map(gate => (
                  <div key={gate.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                    <span style={{ color: gate.passed ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{gate.passed ? 'PASS' : 'FAIL'}</span>
                    <span style={{ color: 'rgba(255,255,255,0.82)' }}>{gate.label}</span>
                    <span style={{ color: 'rgba(255,255,255,0.34)', marginLeft: 'auto' }}>{sourceLabel(gate.source)}</span>
                  </div>
                ))}
              </div>
            </SummaryCard>
          </div>

          <SummaryCard title="Step timings">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(currentSummary.steps ?? []).map(step => (
                <div key={step.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 10, fontSize: 11, alignItems: 'center' }}>
                  <div style={{ color: 'rgba(255,255,255,0.82)' }}>
                    {step.label}
                    {step.detail ? <span style={{ color: 'rgba(255,255,255,0.4)' }}> · {step.detail}</span> : null}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.5)' }}>{formatMetricMs(step.durationMs)}</div>
                  <div style={{ color: step.status === 'done' ? '#22c55e' : step.status === 'error' ? '#ef4444' : '#f59e0b', fontWeight: 600 }}>{step.status}</div>
                </div>
              ))}
            </div>
          </SummaryCard>
        </>
      )}

      {rows.length === 0 ? (
        <div style={{ textAlign:'center', padding:40, color:'rgba(255,255,255,0.2)', fontSize:12 }}>
          No traces for the current project / branch scope.
        </div>
      ) : (
        <>
          <div style={{ margin: '14px 0 8px', fontSize: 10, color: 'rgba(255,255,255,0.32)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Trace archive
          </div>
          {rows.map(row => <TraceCard key={row.key} row={row} />)}
        </>
      )}

      {rows.length > 0 && (
        <button
          onClick={() => { generationTracer.clear(); setTraces([]); }}
          style={{ marginTop:8, width:'100%', padding:'8px 0', borderRadius:10, border:'1px solid rgba(255,69,58,0.3)', background:'rgba(255,69,58,0.06)', color:'rgba(255,69,58,0.7)', fontSize:11, cursor:'pointer' }}
        >
          Clear traces
        </button>
      )}
    </div>
  );
};

const THEME_PALETTE: Record<string, { name: string; accent: string; bg: string; desc: string }> = {
  'dark-slate': { name: 'Dark Slate',  accent: '#64748b', bg: '#0f172a', desc: 'SaaS · tools · dashboards' },
  'trust':      { name: 'Trust',       accent: '#3b82f6', bg: '#eff6ff', desc: 'Medical · finance · education' },
  'warm':       { name: 'Warm',        accent: '#f59e0b', bg: '#fffbeb', desc: 'Food · travel · lifestyle' },
  'neon':       { name: 'Neon',        accent: '#22d3ee', bg: '#0c0a1e', desc: 'Gaming · music · creative' },
  'bloom':      { name: 'Bloom',       accent: '#ec4899', bg: '#fdf2f8', desc: 'Wellness · beauty · kids' },
};

const DesignPanel: React.FC<{ currentTheme: 'dark'|'medium'|'light' }> = ({ currentTheme }) => {
  const isDk = currentTheme !== 'light';
  const bg   = isDk ? '#060606' : '#f8f8f8';
  const txt  = isDk ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)';
  const sub  = isDk ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.35)';
  const card = isDk ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
  const bdr  = isDk ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';

  return (
    <div style={{ width:'100%', height:'100%', overflowY:'auto', padding:24, background:bg, boxSizing:'border-box' }}>
      <h2 style={{ fontSize:14, fontWeight:600, marginBottom:6, color:txt }}>App Themes</h2>
      <p style={{ fontSize:11, color:sub, marginBottom:20 }}>Select a theme when describing your app — the Architect will pick the best fit.</p>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {Object.entries(THEME_PALETTE).map(([key, t]) => (
          <div key={key} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 14px', borderRadius:14, background:card, border:`1px solid ${bdr}` }}>
            <div style={{ width:36, height:36, borderRadius:10, background:t.bg, border:`2px solid ${t.accent}`, flexShrink:0 }}>
              <div style={{ width:'100%', height:'100%', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <div style={{ width:14, height:14, borderRadius:'50%', background:t.accent }} />
              </div>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:600, color:txt }}>{t.name}</div>
              <div style={{ fontSize:10, color:sub, marginTop:2 }}>{t.desc}</div>
            </div>
            <span style={{ fontFamily:'monospace', fontSize:10, color:t.accent, background:`${t.accent}18`, padding:'2px 8px', borderRadius:999 }}>{key}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

import { runSecurityAudit } from '../services/SecurityAuditService';
import type { AuditFinding, DependencyRisk } from '../services/SecurityAuditService';

const SEV_CLR: Record<string, string> = {
  critical: '#ff453a', high: '#ff9f0a', medium: '#ffd60a', info: '#0a84ff',
};
const SEV_BG: Record<string, string> = {
  critical: 'rgba(255,69,58,0.12)', high: 'rgba(255,159,10,0.12)',
  medium: 'rgba(255,214,10,0.12)', info: 'rgba(10,132,255,0.12)',
};

const SecurityPanel: React.FC<{ files: FileMap }> = ({ files }) => {
  const [report, setReport] = useState(() =>
    runSecurityAudit(files as Record<string, string>, '_preview'),
  );

  useEffect(() => {
    setReport(runSecurityAudit(files as Record<string, string>, '_preview'));
  }, [files]);

  const { summary, findings, depRisks, passed } = report;
  const score = passed
    ? summary.medium === 0 ? 100 : Math.max(60, 100 - summary.medium * 5)
    : Math.max(10, 40 - summary.critical * 10 - summary.high * 5);
  const clr = score >= 80 ? '#30d158' : score >= 60 ? '#ffd60a' : '#ff453a';

  return (
    <div style={{ width:'100%', height:'100%', overflowY:'auto', padding:24, background:'#060606', boxSizing:'border-box' }}>
      <h2 style={{ fontSize:14, fontWeight:600, marginBottom:16, color:'rgba(255,255,255,0.7)' }}>Security Audit</h2>

      {/* Score ring */}
      <div style={{ display:'flex', alignItems:'center', gap:20, marginBottom:20, borderRadius:16, padding:16, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)' }}>
        <svg width={72} height={72} viewBox="0 0 80 80">
          <circle cx={40} cy={40} r={32} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8}/>
          <circle cx={40} cy={40} r={32} fill="none" stroke={clr} strokeWidth={8} strokeDasharray={`${2*Math.PI*32*score/100} ${2*Math.PI*32}`} strokeLinecap="round" transform="rotate(-90 40 40)"/>
          <text x={40} y={40} textAnchor="middle" dominantBaseline="middle" style={{ fontSize:18, fontWeight:800, fill:clr }}>{score}</text>
        </svg>
        <div>
          <div style={{ fontSize:17, fontWeight:700, color:clr }}>{passed ? (score === 100 ? 'Clean' : 'Good') : 'Issues Found'}</div>
          <div style={{ display:'flex', gap:8, marginTop:6, flexWrap:'wrap' }}>
            {summary.critical > 0 && <span style={{ fontSize:10, fontWeight:700, color:SEV_CLR.critical }}>{summary.critical} critical</span>}
            {summary.high > 0 && <span style={{ fontSize:10, fontWeight:700, color:SEV_CLR.high }}>{summary.high} high</span>}
            {summary.medium > 0 && <span style={{ fontSize:10, color:SEV_CLR.medium }}>{summary.medium} medium</span>}
            {summary.info > 0 && <span style={{ fontSize:10, color:'rgba(255,255,255,0.3)' }}>{summary.info} info</span>}
            {Object.values(summary).every(v => v === 0) && <span style={{ fontSize:10, color:'#30d158' }}>No issues</span>}
          </div>
        </div>
      </div>

      {/* Findings */}
      {findings.length > 0 && (
        <>
          <div style={{ fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.35)', marginBottom:8, textTransform:'uppercase', letterSpacing:1 }}>
            Code Findings ({findings.length})
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:16 }}>
            {findings.slice(0, 15).map((f: AuditFinding, i: number) => (
              <div key={i} style={{ padding:'10px 14px', borderRadius:12, background:'rgba(255,255,255,0.02)', border:`1px solid ${SEV_CLR[f.severity]}30` }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <span style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', padding:'2px 7px', borderRadius:999, background:SEV_BG[f.severity], color:SEV_CLR[f.severity] }}>{f.severity}</span>
                  <span style={{ fontSize:10, fontWeight:500, color:'rgba(255,255,255,0.6)' }}>{f.category}</span>
                  <span style={{ fontSize:10, color:'rgba(255,255,255,0.2)', marginLeft:'auto', fontFamily:'monospace' }}>{f.file.split('/').pop()}:{f.line}</span>
                </div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.75)' }}>{f.description}</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', marginTop:3 }}>Fix: {f.fix.slice(0, 80)}</div>
              </div>
            ))}
            {findings.length > 15 && (
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.25)', textAlign:'center', padding:8 }}>
                +{findings.length - 15} more findings
              </div>
            )}
          </div>
        </>
      )}

      {/* Dep risks */}
      {depRisks.length > 0 && (
        <>
          <div style={{ fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.35)', marginBottom:8, textTransform:'uppercase', letterSpacing:1 }}>
            Dependency Risks ({depRisks.length})
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {depRisks.map((r: DependencyRisk, i: number) => (
              <div key={i} style={{ padding:'10px 14px', borderRadius:12, background:'rgba(255,255,255,0.02)', border:`1px solid ${SEV_CLR[r.severity]}30` }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <span style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', padding:'2px 7px', borderRadius:999, background:SEV_BG[r.severity], color:SEV_CLR[r.severity] }}>{r.severity}</span>
                  <span style={{ fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.7)', fontFamily:'monospace' }}>{r.package}</span>
                  {r.cve && <span style={{ fontSize:9, color:'rgba(255,255,255,0.25)' }}>{r.cve}</span>}
                </div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.5)' }}>{r.description.slice(0, 80)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {findings.length === 0 && depRisks.length === 0 && (
        <div style={{ textAlign:'center', padding:32, color:'rgba(255,255,255,0.2)', fontSize:12 }}>
          {Object.keys(files).length === 0
            ? 'No files to audit — generate a project first'
            : '✓ No security issues detected'}
        </div>
      )}
    </div>
  );
};


/* ---- Types ---- */

type TabId = 'preview'|'reasoning'|'code'|'design'|'analytics'|'security'|'cloud';

const REASONING_STEP_LABEL: Record<string, string> = {
  intent_understanding: 'Understand the request',
  architect_plan: 'Plan the solution',
  design_direction: 'Set design direction',
  coder_generation: 'Generate code',
  artifact_retry: 'Retry artifact parsing',
  candidate_materialize: 'Materialize candidate',
  fast_gate: 'Run quick checks',
  repair_attempt: 'Repair attempt',
  reviewer_result: 'Review result',
  ship_decision: 'Finalize outcome',
};

const REASONING_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Done',
  warning: 'Warning',
  failed: 'Failed',
  skipped: 'Skipped',
};

const REASONING_STATUS_COLOR: Record<string, string> = {
  pending: '#6b7280',
  in_progress: '#f97316',
  completed: '#22c55e',
  warning: '#f59e0b',
  failed: '#ef4444',
  skipped: '#94a3b8',
};

const REASONING_OUTCOME_LABEL: Record<string, string> = {
  ship_ok: 'Completed successfully',
  ship_partial: 'Completed with partial quality',
  ship_fail: 'Run failed before promotion',
  cancelled: 'Run cancelled',
  superseded: 'Run replaced by a newer one',
};

function getReasoningStepLabel(step: VisibleReasoningStep): string {
  return REASONING_STEP_LABEL[step.kind] ?? step.kind;
}

function getReasoningStatus(step: VisibleReasoningStep): { label: string; color: string } {
  return {
    label: REASONING_STATUS_LABEL[step.status] ?? step.status,
    color: REASONING_STATUS_COLOR[step.status] ?? '#94a3b8',
  };
}

function getReasoningOutcomeSummary(trace: VisibleReasoningTrace): string | null {
  if (!trace.finalOutcome) return null;
  return REASONING_OUTCOME_LABEL[trace.finalOutcome] ?? trace.finalOutcome;
}

function getWorkspaceScopeLabel(binding: WorkspaceBinding): string {
  if (binding.scope === 'current-run') return 'Current run';
  if (binding.scope === 'recent-project-branch') return 'Recent run for this project / branch';
  if (binding.scope === 'historical-archive') return 'Historical archive';
  return binding.projectState.kind === 'live_run' ? 'Current run' : 'No run selected';
}

function isRunDiagnostic(diagnostic: WorkspaceRunDiagnostic | null): diagnostic is WorkspaceRunDiagnostic {
  if (!diagnostic) return false;
  return (
    diagnostic.runId !== null && diagnostic.runId !== undefined
  ) || (
    diagnostic.code === 'artifact_ingress_failed' ||
    diagnostic.code === 'candidate_compile_failed' ||
    diagnostic.code === 'final_check_failed' ||
    diagnostic.code === 'watchdog_revoke'
  );
}

function buildDiagnosticVisibleReasoningTrace(binding: WorkspaceBinding): VisibleReasoningTrace | null {
  if (!isRunDiagnostic(binding.diagnostic)) return null;

  const startedAt = binding.trace?.visibleReasoningTrace?.startedAt
    ?? binding.trace?.startedAt
    ?? new Date().toISOString();
  const finishedAt = binding.trace?.visibleReasoningTrace?.finishedAt
    ?? binding.trace?.fullDebugTrace?.finishedAt
    ?? startedAt;
  const runId = binding.diagnostic.runId
    ?? binding.runId
    ?? binding.trace?.visibleReasoningTrace?.runId
    ?? binding.trace?.id
    ?? 'current-run';

  return {
    runId,
    startedAt,
    finishedAt,
    activeStepId: null,
    finalOutcome: binding.trace?.visibleReasoningTrace?.finalOutcome ?? 'ship_fail',
    steps: [{
      id: `${runId}:failure-explanation`,
      kind: 'reviewer_result',
      status: 'failed',
      summary: binding.diagnostic.title,
      isActive: false,
      errorSummary: binding.diagnostic.detail,
      timing: { startedAt, endedAt: finishedAt },
    }],
  };
}

function buildPendingCurrentRunTrace(binding: WorkspaceBinding): VisibleReasoningTrace | null {
  if (binding.projectState.kind !== 'live_run' && binding.scope !== 'current-run') return null;
  const startedAt = binding.trace?.visibleReasoningTrace?.startedAt
    ?? binding.trace?.startedAt
    ?? new Date().toISOString();
  const runId = binding.runId
    ?? binding.trace?.visibleReasoningTrace?.runId
    ?? binding.trace?.id
    ?? 'current-run';
  return {
    runId,
    startedAt,
    activeStepId: `${runId}:starting`,
    steps: [{
      id: `${runId}:starting`,
      kind: 'intent_understanding',
      status: 'in_progress',
      summary: 'Current generation is starting. Structured reasoning steps will appear here as soon as the run reports them.',
      isActive: true,
      timing: { startedAt },
    }],
  };
}

function formatVisibleReasoningForCopy(trace: VisibleReasoningTrace): string {
  const lines: string[] = [
    'Visible reasoning trace',
    `Run: ${trace.runId}`,
    `Started: ${trace.startedAt}`,
  ];
  const outcome = getReasoningOutcomeSummary(trace);
  if (outcome) lines.push(`Outcome: ${outcome}`);
  lines.push('');
  trace.steps.forEach((step, index) => {
    const status = REASONING_STATUS_LABEL[step.status] ?? step.status;
    const attempt = step.attemptNumber ? ` (attempt ${step.attemptNumber})` : '';
    lines.push(`${index + 1}. ${getReasoningStepLabel(step)} — ${status}${attempt}`);
    lines.push(`   ${step.summary}`);
    if (step.errorSummary) {
      lines.push(`   Error: ${step.errorSummary}`);
    }
  });
  return lines.join('\n').trim();
}

interface PreviewCanvasProps {
  device: string;
  setDevice: (d:string)=>void;
  files: FileMap;
  setFiles: (f:FileMap)=>void;
  activeFile: string;
  setActiveFile: (n:string)=>void;
  currentTheme: 'dark'|'medium'|'light';
  onShare?: ()=>void;
  onDownloadProject?: () => void;
  onExportReactNative?: () => void;
  rnExporting?: boolean;
  rnExportChars?: number;
  /** @deprecated Snapshot counter — not used in PreviewCanvas render. See useStudio glossary. */
  currentVersion: number;
  /** @deprecated Snapshot count — not used in PreviewCanvas render. See useStudio glossary. */
  totalVersions: number;
  addLog?:        (msg: string) => void;
  // Architectural context (passed from EngineWorkspace)
  projectName?:   string;
  activeBranch?:  string;
  persistedProjectExists?: boolean;
  pendingProjectSave?: { projectTitle: string; previewReady: boolean } | null;
  onSavePendingProject?: () => void;
  onRejectPendingProjectSave?: () => void;
  // Stable-revision tracking
  currentSnapshotId?:   string | null;
  markSnapshotStable?:  (snapshotId: string) => void;
  currentProjectId?:    string | null;
  isAutoFixing?:        boolean;
  isGenerating?:        boolean;
  onRollback?:          () => void;
  apiKey?:              string;
  // Preview lifecycle (from useStudio via EngineWorkspace)
  previewLifecycle?:      string;
  previewBlockedReason?:  string | null;
  projectId:              string;
  previewUrl?:            string;
  appLanguage?:           string;
  /**
   * Called when the user clicks an element in visual-edit selection mode.
   * Receives the selected element descriptor — host fills chat input with edit prompt.
   */
  onVisualElementSelected?: (element: SelectedElement) => void;
}

/* ---- Main component ---- */

export const PreviewCanvas: React.FC<PreviewCanvasProps> = ({
  device, setDevice, files, setFiles, activeFile, setActiveFile,
  currentTheme, onShare, onDownloadProject, onExportReactNative, rnExporting = false, rnExportChars = 0,
  currentVersion, totalVersions,
  addLog, projectName, activeBranch = 'main',
  persistedProjectExists,
  pendingProjectSave = null,
  onSavePendingProject,
  onRejectPendingProjectSave,
  currentSnapshotId, markSnapshotStable, currentProjectId,
  isAutoFixing = false,
  isGenerating = false,
  onRollback,
  apiKey,
  previewLifecycle,
  previewBlockedReason,
  projectId,
  previewUrl,
  appLanguage = 'en',
  onVisualElementSelected,
}) => {
  const iframeUrl = previewUrl || (projectId ? `/preview/${projectId}` : '');
  const [tab, setTab] = useState<TabId>('preview');
  const resolveBinding = useCallback(() => resolveWorkspaceBinding({
    projectId,
    branchId: activeBranch,
    isGenerating,
    activeTrace: generationTracer.current()?.snapshot() ?? null,
    recentTraces: generationTracer.getRecent(20),
    persistedProjectExists,
    previewLifecycle,
    previewBlockedReason,
  }), [projectId, activeBranch, isGenerating, persistedProjectExists, previewLifecycle, previewBlockedReason]);
  const [workspaceBinding, setWorkspaceBinding] = useState<WorkspaceBinding>(() => resolveBinding());
  const [reasoningCopied, setReasoningCopied] = useState(false);
  const [debugTraceCopied, setDebugTraceCopied] = useState(false);

  // ── Visual-edit bridge — local state ─────────────────────────────────────
  const [visualEditMode,     setVisualEditModeState] = useState<VisualEditMode>('off');
  const [visualEditSelected, setVisualEditSelectedState] = useState<SelectedElement | null>(null);

  useEffect(() => {
    setWorkspaceBinding(resolveBinding());
  }, [resolveBinding]);

  useEffect(() => {
    const refresh = () => setWorkspaceBinding(resolveBinding());
    refresh();
    window.addEventListener('studio-trace', refresh);
    const timer = window.setInterval(() => {
      if (isGenerating || generationTracer.current()) refresh();
    }, 350);
    return () => {
      window.removeEventListener('studio-trace', refresh);
      window.clearInterval(timer);
    };
  }, [resolveBinding, isGenerating]);

  const currentTraceVisibleReasoning = workspaceBinding.trace?.visibleReasoningTrace ?? null;
  const hasCurrentTraceSteps = (currentTraceVisibleReasoning?.steps?.length ?? 0) > 0;
  const diagnosticReasoningTrace = hasCurrentTraceSteps
    ? null
    : buildDiagnosticVisibleReasoningTrace(workspaceBinding);
  const pendingCurrentRunTrace = hasCurrentTraceSteps || diagnosticReasoningTrace
    ? null
    : buildPendingCurrentRunTrace(workspaceBinding);
  const visibleReasoningTrace =
    hasCurrentTraceSteps
      ? currentTraceVisibleReasoning
      : diagnosticReasoningTrace ?? pendingCurrentRunTrace;
  const runSummary = workspaceBinding.trace?.runSummary ?? null;
  const reasoningScopeLabel = getWorkspaceScopeLabel(workspaceBinding);
  const hasFullDebugTrace = !!(
    workspaceBinding.runId
    && generationTracer.getFullDebugTrace({
      runId: workspaceBinding.runId,
      projectId: workspaceBinding.projectId,
      branchId: workspaceBinding.branchId,
    })
  );

  const copyVisibleReasoningTrace = useCallback(async () => {
    if (!visibleReasoningTrace) return;
    const text = formatVisibleReasoningForCopy(visibleReasoningTrace);
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const el = document.createElement('textarea');
        el.value = text;
        el.setAttribute('readonly', '');
        el.style.position = 'absolute';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setReasoningCopied(true);
      window.setTimeout(() => setReasoningCopied(false), 1500);
    } catch {
      setReasoningCopied(false);
    }
  }, [visibleReasoningTrace]);

  const copyFullDebugTrace = useCallback(async () => {
    if (!workspaceBinding.runId) return;
    const text = generationTracer.formatFullDebugTraceExport({
      runId: workspaceBinding.runId,
      projectId: workspaceBinding.projectId,
      branchId: workspaceBinding.branchId,
    });
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const el = document.createElement('textarea');
        el.value = text;
        el.setAttribute('readonly', '');
        el.style.position = 'absolute';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setDebugTraceCopied(true);
      window.setTimeout(() => setDebugTraceCopied(false), 1500);
    } catch {
      setDebugTraceCopied(false);
    }
  }, [workspaceBinding.branchId, workspaceBinding.projectId, workspaceBinding.runId]);

  // Subscribe to bridge state — fires selection callback when element is picked
  useEffect(() => {
    return visualEditBridge.subscribe((state) => {
      setVisualEditModeState(state.mode);
      setVisualEditSelectedState(state.selected);
      if (state.mode === 'selected' && state.selected) {
        onVisualElementSelected?.(state.selected);
      }
    });
  }, [onVisualElementSelected]);

  // Callback ref: attach bridge when the preview iframe mounts, detach on unmount.
  // Using useCallback (stable deps = []) so React never tears down the ref binding.
  const iframeElRef = useRef<HTMLIFrameElement | null>(null);
  const previewIframeRef = useCallback((el: HTMLIFrameElement | null) => {
    iframeElRef.current = el;
    if (el) visualEditBridge.attach(el);
    else     visualEditBridge.detach();
  }, []);

  const TH = {
    dark:   { topBg:'#0a0a0a',   border:'rgba(255,255,255,0.07)', tabDim:'rgba(255,255,255,0.32)', tabOn:'#fff',  canvasBg:'#050507',  dotClr:'rgba(255,255,255,0.05)' },
    medium: { topBg:'#141420',   border:'rgba(255,255,255,0.08)', tabDim:'rgba(255,255,255,0.45)', tabOn:'#fff',  canvasBg:'#1c1c2e',  dotClr:'rgba(255,255,255,0.08)' },
    light:  { topBg:'#ffffff',   border:'rgba(0,0,0,0.07)',       tabDim:'rgba(0,0,0,0.38)',       tabOn:'#111', canvasBg:'#e8e8ec',  dotClr:'rgba(0,0,0,0.1)' },
  };
  const th = TH[currentTheme] ?? TH.dark;

  const bgStyle: React.CSSProperties = {
    backgroundColor: th.canvasBg,
    backgroundImage: `radial-gradient(${th.dotClr} 1px, transparent 1px)`,
    backgroundSize: '22px 22px',
  };

  const TABS: {id:TabId;label:string}[] = [
    {id:'preview',label:'Preview'},{id:'reasoning',label:'Reasoning'},{id:'code',label:'Code'},{id:'design',label:'Design'},
    {id:'analytics',label:'Analytics'},{id:'security',label:'Security'},{id:'cloud',label:'Cloud'},
  ];

  const DEVICES = [
    {id:'desktop', icon:<Monitor size={14}/>,   label:'Desktop Chrome'},
    {id:'iphone',  icon:<Smartphone size={14}/>, label:'iPhone 16 Pro Max'},
    {id:'pixel',   icon:<Smartphone size={14}/>, label:'Pixel 9 Pro'},
    {id:'ipad',    icon:<Tablet size={14}/>,     label:'iPad Pro 13'},
  ];

  // getFrame removed — DeviceFrame used directly in render (stable fiber position)

  const isDraggable = false; // desktop uses 1:1 scroll, mobile uses ZoomableCanvas (drag disabled)

  const isDark = currentTheme !== 'light';
  const isPrototypingPhase =
    previewLifecycle === 'generating' ||
    previewLifecycle === 'validating' ||
    previewLifecycle === 'committing' ||
    previewLifecycle === 'materializing' ||
    previewLifecycle === 'skeleton-ready';
  const isPreviewReady = previewLifecycle === 'preview-ready';
  const previewSaveLabels = (appLanguage || 'en').toLowerCase().startsWith('ru')
    ? { ready: 'Превью готово', save: 'Сохранить проект', reject: 'Отклонить', draft: 'Draft не попал в Projects' }
    : { ready: 'Preview ready', save: 'Save project', reject: 'Reject', draft: 'Draft is not in Projects' };
  const pendingProjectDecisionReady =
    !!pendingProjectSave
    && pendingProjectSave.previewReady
    && previewLifecycle === 'preview-ready';
  const showSaveProjectCta =
    pendingProjectDecisionReady &&
    (!!onSavePendingProject || !!onRejectPendingProjectSave);
  const [hasPreviewReady, setHasPreviewReady] = useState(false);
  useEffect(() => {
    setHasPreviewReady(false);
  }, [projectId]);
  useEffect(() => {
    if (isPreviewReady) setHasPreviewReady(true);
  }, [isPreviewReady]);
  const canShowIframe = isPreviewReady || hasPreviewReady;
  const shouldRenderIframe = canShowIframe || !!previewUrl;
  const showEmptySplash =
    !shouldRenderIframe &&
    (
      !projectId ||
      (!isGenerating && currentVersion === 0 && Object.keys(files).length === 0)
    );
  const showBlockedSplash =
    !!projectId &&
    !isGenerating &&
    (previewLifecycle === 'blocked' || previewLifecycle === 'failed');
  const showPrototypingSplash =
    !!projectId &&
    !showEmptySplash &&
    !showBlockedSplash &&
    (!canShowIframe || isGenerating || isPrototypingPhase);
  const [countdownSec, setCountdownSec] = useState(0);
  const [protoProgress, setProtoProgress] = useState(0);
  const splashWasVisibleRef = useRef(false);
  const countdownStartRef = useRef(18);

  const phaseLabel =
    previewLifecycle === 'generating' ? 'Кодируем интерфейс' :
    previewLifecycle === 'validating' ? 'Проверяем связность проекта' :
    previewLifecycle === 'committing' ? 'Сохраняем ревизию прототипа' :
    previewLifecycle === 'skeleton-ready' ? 'Показываем технический skeleton preview' :
    previewLifecycle === 'materializing' ? 'Запускаем живое превью' :
    'Подготавливаем окружение превью';

  useEffect(() => {
    if (showPrototypingSplash && !splashWasVisibleRef.current) {
      const start =
        previewLifecycle === 'materializing' ? 8 :
        previewLifecycle === 'committing' ? 11 :
        previewLifecycle === 'validating' ? 14 : 18;
      countdownStartRef.current = start;
      setCountdownSec(start);
      setProtoProgress(0);
    }

    if (!showPrototypingSplash && splashWasVisibleRef.current) {
      setCountdownSec(0);
      setProtoProgress(100);
    }

    splashWasVisibleRef.current = showPrototypingSplash;
  }, [showPrototypingSplash, previewLifecycle]);

  useEffect(() => {
    if (!showPrototypingSplash) return;

    const timer = window.setInterval(() => {
      setCountdownSec((prev) => {
        const phase = previewLifecycle ?? (isGenerating ? 'generating' : 'idle');
        const step =
          phase === 'generating' ? 0.14 :
          phase === 'validating' ? 0.28 :
          phase === 'committing' ? 0.45 :
          phase === 'materializing' ? 0.9 : 0.2;

        const nextRaw = Math.max(0, Number((prev - step).toFixed(2)));
        const next = isPreviewReady ? nextRaw : Math.max(1, nextRaw);
        const start = Math.max(1, countdownStartRef.current);
        const pct = Math.min(99, Math.max(0, ((start - next) / start) * 100));
        setProtoProgress(isPreviewReady && next <= 0 ? 100 : pct);
        return next;
      });
    }, 300);

    return () => window.clearInterval(timer);
  }, [showPrototypingSplash, previewLifecycle, isGenerating, isPreviewReady]);

  const countdownText = String(isPreviewReady ? 0 : Math.max(1, Math.ceil(countdownSec))).padStart(2, '0');
  const ctxText  = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)';
  const ctxStrong = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)';
  const reasoningSteps = visibleReasoningTrace?.steps ?? [];
  const hasReasoningTrace = reasoningSteps.length > 0;
  const activeReasoningStep =
    (visibleReasoningTrace?.activeStepId
      ? reasoningSteps.find(step => step.id === visibleReasoningTrace.activeStepId)
      : undefined)
    ?? reasoningSteps.find(step => step.isActive)
    ?? (reasoningSteps.length > 0 ? reasoningSteps[reasoningSteps.length - 1] : null);
  const reasoningOutcomeSummary = visibleReasoningTrace ? getReasoningOutcomeSummary(visibleReasoningTrace) : null;
  const previewFrame = shouldRenderIframe ? (
    <ZoomableCanvas
      draggable={true}
      initZoom={0.55}
      autoFit={{
        w: (DEVICE_SPECS[device as DevKey] ?? DEVICE_SPECS.desktop).outerW,
        h: (DEVICE_SPECS[device as DevKey] ?? DEVICE_SPECS.desktop).outerH,
      }}
      bgStyle={bgStyle}
    >
      <DeviceFrame device={device}>
        {/*
          Runtime preview iframe — same-origin compiled preview (/preview/:buildId).
          Sandbox isolates user-generated code while preserving:
            • preview-mounted postMessage handshake (allow-same-origin)
            • React runtime + dynamic imports (allow-scripts)
            • form / modal / popup / download APIs used by generated apps
          allow-same-origin is intentional: the compiled bundle must be able
          to make fetch() calls back to the same Vite/Express origin.
          NOTE: if this iframe becomes cross-origin in the future, remove
          allow-same-origin and tighten the policy accordingly.
        */}
        <iframe
          ref={previewIframeRef}
          src={iframeUrl}
          data-testid="preview-iframe"
          title="preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads"
          style={{ display: 'block', width: '100%', height: '100%', border: 'none' }}
        />
      </DeviceFrame>
    </ZoomableCanvas>
  ) : null;

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, height:'100%', overflow:'hidden' }}>

      {/* Tab bar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 16px', height:44, background:th.topBg, borderBottom:`1px solid ${th.border}`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:1 }}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              data-testid={`preview-tab-${t.id}`}
              style={{ padding:'6px 14px', border:'none', cursor:'pointer', background:'none', fontSize:12, fontWeight:500,
                color: tab===t.id ? th.tabOn : th.tabDim,
                borderBottom: tab===t.id ? `2px solid ${th.tabOn}` : '2px solid transparent',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Right: device selector + share */}
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          {tab === 'preview' && (
            <button
              data-testid="visual-select-btn"
              onClick={() => visualEditBridge.toggle()}
              title={visualEditMode !== 'off' ? 'Stop element selection' : 'Select an element to edit it via chat'}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', borderRadius: 8,
                border: `1px solid ${visualEditMode !== 'off' ? 'rgba(34,197,94,0.35)' : th.border}`,
                background: visualEditMode !== 'off' ? 'rgba(34,197,94,0.1)' : 'none',
                cursor: 'pointer', fontSize: 11,
                color: visualEditMode !== 'off' ? '#22c55e' : th.tabDim,
                transition: 'all 0.15s',
              }}
            >
              <MousePointer2 size={12} />
              {visualEditMode === 'selecting' ? 'Selecting…' : visualEditMode === 'selected' ? 'Selected' : 'Select'}
            </button>
          )}
          {tab === 'preview' && (
            <div style={{ display:'flex', alignItems:'center', gap:2, background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'3px 4px', border:`1px solid ${th.border}` }}>
              {DEVICES.map(d=>(
                <button key={d.id} onClick={()=>setDevice(d.id)} title={d.label}
                  style={{ display:'flex', alignItems:'center', justifyContent:'center', width:26, height:26, borderRadius:6, border:'none', cursor:'pointer',
                    background: device===d.id ? 'rgba(255,255,255,0.1)' : 'none',
                    color: device===d.id ? th.tabOn : th.tabDim,
                  }}>
                  {d.icon}
                </button>
              ))}
            </div>
          )}
          {tab === 'preview' && (
            <div data-zoom-controls style={{
              display: 'flex', alignItems: 'center', gap: 2,
              background: 'rgba(255,255,255,0.04)', borderRadius: 8,
              padding: '3px 4px', border: `1px solid ${th.border}`,
            }}>
              {[
                { title: 'Scroll to top',    icon: '↑', action: () => { try { iframeElRef.current?.contentWindow?.scrollTo({ top: 0, behavior: 'smooth' }); } catch {} } },
                { title: 'Scroll to bottom', icon: '↓', action: () => { try { const cw = iframeElRef.current?.contentWindow; if (cw) cw.scrollTo({ top: (cw.document?.body?.scrollHeight ?? 9999), behavior: 'smooth' }); } catch {} } },
                { title: 'Scroll to left',   icon: '←', action: () => { try { iframeElRef.current?.contentWindow?.scrollTo({ left: 0, behavior: 'smooth' }); } catch {} } },
                { title: 'Copy source HTML', icon: '⎘', action: () => { try { const html = iframeElRef.current?.contentDocument?.documentElement?.outerHTML ?? ''; if (html) navigator.clipboard.writeText(html).catch(() => {}); } catch {} } },
              ].map(btn => (
                <button key={btn.title} onClick={btn.action} title={btn.title}
                  style={{
                    width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 6, border: 'none', background: 'none',
                    color: th.tabDim, cursor: 'pointer', fontSize: 14, lineHeight: 1,
                  }}>
                  {btn.icon}
                </button>
              ))}
            </div>
          )}
          {tab === 'reasoning' && (
            <>
              <button
                data-testid="copy-visible-reasoning-btn"
                onClick={copyVisibleReasoningTrace}
                title="Copy visible reasoning"
                disabled={!hasReasoningTrace}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:8, border:`1px solid ${th.border}`, background:'none', cursor: hasReasoningTrace ? 'pointer' : 'not-allowed', fontSize:11, color: reasoningCopied ? '#22c55e' : th.tabDim, opacity: hasReasoningTrace ? 1 : 0.5 }}
              >
                <Copy size={12}/> {reasoningCopied ? 'Copied' : 'Copy visible reasoning'}
              </button>
              <button
                data-testid="copy-full-debug-trace-btn"
                onClick={copyFullDebugTrace}
                title="Copy full debug trace JSON"
                disabled={!hasFullDebugTrace}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:8, border:'1px solid rgba(245,158,11,0.28)', background:'rgba(245,158,11,0.06)', cursor: hasFullDebugTrace ? 'pointer' : 'not-allowed', fontSize:11, color: debugTraceCopied ? '#22c55e' : (isDark ? 'rgba(251,191,36,0.82)' : '#b45309'), opacity: hasFullDebugTrace ? 1 : 0.48 }}
              >
                <Shield size={12}/> {debugTraceCopied ? 'Copied debug JSON' : 'Copy debug trace JSON'}
              </button>
            </>
          )}
          {onDownloadProject && (
            <button onClick={onDownloadProject} title="Export project as ZIP (npm install && npm run dev)"
              style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:8, border:`1px solid ${th.border}`, background:'none', cursor:'pointer', fontSize:11, color:th.tabDim }}>
              <Download size={12}/> Export
            </button>
          )}
          {onExportReactNative && (
            <button onClick={onExportReactNative} disabled={rnExporting}
              title="Convert to React Native (Expo) and download ZIP"
              style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:8,
                border:`1px solid ${th.border}`, background:'none', cursor: rnExporting ? 'wait' : 'pointer',
                fontSize:11, color: rnExporting ? 'rgba(168,85,247,0.5)' : '#a855f7', opacity: rnExporting ? 0.6 : 1 }}>
              <Smartphone size={12}/> {rnExporting ? `Converting...${rnExportChars > 0 ? ` (${rnExportChars} chars)` : ''}` : 'Expo'}
            </button>
          )}
          {onShare && (
            <button onClick={onShare}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:8, border:`1px solid ${th.border}`, background:'none', cursor:'pointer', fontSize:11, color:th.tabDim }}>
              <Share2 size={12}/> Share
            </button>
          )}
        </div>
      </div>

      {/* Visual-edit selected-element info bar — shown when element is selected */}
      {tab === 'preview' && visualEditSelected && (
        <div
          data-testid="visual-edit-infobar"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 16px', flexShrink: 0,
            borderBottom: `1px solid rgba(34,197,94,0.2)`,
            background: 'rgba(34,197,94,0.07)',
            fontSize: 11,
          }}>
          <MousePointer2 size={11} style={{ color: '#22c55e', flexShrink: 0 }} />
          <span style={{ flex: 1, color: '#22c55e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <b>&lt;{visualEditSelected.tag}&gt;</b>
            {visualEditSelected.selector ? ` ${visualEditSelected.selector.slice(0, 50)}` : ''}
            {visualEditSelected.text ? ` — "${visualEditSelected.text.slice(0, 50)}"` : ''}
            {' — describe your edit in chat'}
          </span>
          <button
            onClick={() => visualEditBridge.disableSelection()}
            title="Clear selection"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(34,197,94,0.6)', fontSize: 15, lineHeight: 1,
              padding: '0 2px', flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      )}

      {showSaveProjectCta && (
        <div
          data-testid="save-project-cta"
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px 18px',
            borderBottom: `1px solid ${isDark ? 'rgba(34,197,94,0.3)' : 'rgba(22,163,74,0.3)'}`,
            background: isDark
              ? 'linear-gradient(90deg, rgba(22,163,74,0.2), rgba(34,197,94,0.12))'
              : 'linear-gradient(90deg, rgba(22,163,74,0.16), rgba(34,197,94,0.11))',
            color: isDark ? 'rgba(220,252,231,0.98)' : '#14532d',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            <CheckCircle size={18} style={{ color: '#16a34a', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 0.1 }}>
                {previewSaveLabels.ready}
              </div>
              <div style={{ fontSize: 11, opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {pendingProjectSave?.projectTitle || projectName || previewSaveLabels.draft}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {onRejectPendingProjectSave && (
              <button
                data-testid="reject-project-cta"
                onClick={onRejectPendingProjectSave}
                style={{
                  height: 48,
                  minWidth: 160,
                  borderRadius: 10,
                  border: `1px solid ${isDark ? 'rgba(248,250,252,0.18)' : 'rgba(15,23,42,0.18)'}`,
                  background: isDark ? 'rgba(15,23,42,0.28)' : 'rgba(255,255,255,0.72)',
                  color: isDark ? 'rgba(226,232,240,0.96)' : '#0f172a',
                  fontSize: 14,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  justifyContent: 'center',
                  padding: '0 18px',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <X size={16} />
                {previewSaveLabels.reject}
              </button>
            )}
            {onSavePendingProject && (
              <button
                onClick={onSavePendingProject}
                style={{
                  height: 48,
                  minWidth: 220,
                  borderRadius: 10,
                  border: '1px solid rgba(22,163,74,0.45)',
                  background: '#16a34a',
                  color: '#ffffff',
                  fontSize: 15,
                  fontWeight: 900,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  justifyContent: 'center',
                  padding: '0 18px',
                  cursor: 'pointer',
                  boxShadow: '0 10px 24px rgba(22,163,74,0.28)',
                  flexShrink: 0,
                }}
              >
                <Save size={16} />
                {previewSaveLabels.save}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{ flex:1, overflow:'hidden', position:'relative' }}>

        {/* Preview — ONE stable SandpackView instance, never unmounted.
            S1: All devices share the same ZoomableCanvas → DeviceFrame → SandpackView
            fiber path. Device switch changes only props (autoFit, device) — React
            never unmounts SandpackView regardless of desktop↔mobile transitions. */}
        <div style={{ position:'absolute', inset:0, display: tab === 'preview' ? 'flex' : 'none', flexDirection:'column' }}>
          {showPrototypingSplash ? (
            <div style={{
              flex: 1,
              position: 'relative',
              background: th.canvasBg,
            }}>
              {previewFrame && (
                <div style={{ position:'absolute', inset:0 }}>
                  {previewFrame}
                </div>
              )}
              <div style={{
                position: 'relative',
                zIndex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                textAlign: 'center',
                userSelect: 'none',
              }}>
              <style>{`
                @keyframes _pc_pulse {
                  0%,100% { opacity: 1; transform: scale(1); }
                  50%      { opacity: 0.62; transform: scale(0.94); }
                }
                @keyframes _pc_float {
                  0%,100% { transform: translateY(0px); opacity: 0.8; }
                  50%      { transform: translateY(-4px); opacity: 1; }
                }
                @keyframes _pc_sheen {
                  0%   { transform: translateX(-120%); }
                  100% { transform: translateX(220%); }
                }
              `}</style>
              <div style={{ animation: '_pc_pulse 2.4s ease-in-out infinite', marginBottom: 14 }}>
                <svg width="52" height="52" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="1" width="5.5" height="5.5" rx="1.5" fill="#f97316" opacity="0.95"/>
                  <rect x="9.5" y="1" width="5.5" height="5.5" rx="1.5" fill="#f97316" opacity="0.45"/>
                  <rect x="1" y="9.5" width="5.5" height="5.5" rx="1.5" fill="#f97316" opacity="0.45"/>
                  <rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1.5" fill="#f97316" opacity="0.95"/>
                </svg>
              </div>
              <div style={{
                fontSize: 15, fontWeight: 600,
                color: isDark ? 'rgba(255,255,255,0.76)' : '#1D1D1F',
                marginBottom: 7,
              }}>
                AIC-RG Studio
              </div>
              <div style={{
                fontSize: 13,
                color: isDark ? 'rgba(251,146,60,0.9)' : '#ea580c',
                animation: '_pc_float 1.8s ease-in-out infinite',
                letterSpacing: '0.02em',
                marginBottom: 14,
              }}>
                {phaseLabel}
              </div>

                {/* Progress card — bottom-left corner */}
                <div style={{
                  position: 'absolute', bottom: 16, left: 16,
                  width: 280,
                  borderRadius: 12,
                  border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                  background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.65)',
                  backdropFilter: 'blur(6px)',
                  padding: '12px 12px 10px',
                }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 8,
                }}>
                  <span style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)' }}>
                    До появления preview
                  </span>
                  <span style={{
                    fontSize: 14,
                    fontVariantNumeric: 'tabular-nums',
                    color: isDark ? '#fed7aa' : '#9a3412',
                    fontWeight: 700,
                  }}>
                    {countdownText}с
                  </span>
                </div>

                <div style={{
                  position: 'relative',
                  height: 8,
                  borderRadius: 999,
                  overflow: 'hidden',
                  background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
                }}>
                  <div style={{
                    width: `${protoProgress}%`,
                    height: '100%',
                    borderRadius: 999,
                    transition: 'width 260ms linear',
                    background: 'linear-gradient(90deg,#fb923c 0%,#f97316 55%,#ea580c 100%)',
                  }} />
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)',
                    animation: '_pc_sheen 1.6s linear infinite',
                    pointerEvents: 'none',
                  }} />
                  </div>
                </div>
                {/* Live reasoning — bottom-right corner */}
                {hasReasoningTrace && activeReasoningStep && (
                  <div
                    data-testid="preview-reasoning-summary"
                    style={{
                      position: 'absolute', bottom: 16, right: 16,
                      width: 320,
                      borderRadius: 12,
                      border: isDark ? '1px solid rgba(251,146,60,0.35)' : '1px solid rgba(234,88,12,0.28)',
                      background: isDark ? 'rgba(17,24,39,0.55)' : 'rgba(255,255,255,0.82)',
                      backdropFilter: 'blur(6px)',
                      padding: '10px 12px',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: isDark ? 'rgba(255,255,255,0.8)' : '#1f2937' }}>
                        Live reasoning
                      </span>
                      <button
                        onClick={() => setTab('reasoning')}
                        style={{ border:'none', background:'none', cursor:'pointer', padding:0, fontSize:11, color:'#f97316' }}
                      >
                        Open
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.66)' : '#334155', marginBottom: 4 }}>
                      {getReasoningStepLabel(activeReasoningStep)} · {getReasoningStatus(activeReasoningStep).label}
                    </div>
                    <div style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.58)' : '#475569', lineHeight: 1.45 }}>
                      {activeReasoningStep.summary}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : showBlockedSplash ? (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: th.canvasBg,
              textAlign: 'center',
              padding: '0 20px',
            }}>
              <div style={{
                width: 16, height: 16, borderRadius: '50%',
                background: '#f97316', opacity: 0.9, marginBottom: 12,
              }} />
              <div style={{
                fontSize: 15,
                fontWeight: 600,
                color: isDark ? 'rgba(255,255,255,0.78)' : '#1D1D1F',
                marginBottom: 6,
              }}>
                Превью временно недоступно
              </div>
              <div style={{
                fontSize: 12,
                color: isDark ? 'rgba(255,255,255,0.36)' : '#86868B',
                lineHeight: 1.6,
                maxWidth: 420,
              }}>
                {previewBlockedReason || 'Собираем стабильную ревизию. Экран появится автоматически после восстановления.'}
              </div>
            </div>
          ) : showEmptySplash ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              background: th.canvasBg, textAlign: 'center',
              userSelect: 'none',
            }}>
              <style>{`
                @keyframes _pc_pulse {
                  0%,100% { opacity: 1; transform: scale(1); }
                  50%      { opacity: 0.6; transform: scale(0.92); }
                }
                @keyframes _pc_fade_in {
                  from { opacity: 0; transform: translateY(8px); }
                  to   { opacity: 1; transform: translateY(0); }
                }
              `}</style>
              <div style={{ animation: '_pc_pulse 2.4s ease-in-out infinite', marginBottom: 20 }}>
                <svg width="52" height="52" viewBox="0 0 16 16" fill="none">
                  <rect x="1"   y="1"   width="5.5" height="5.5" rx="1.5" fill="#f97316" opacity="0.95"/>
                  <rect x="9.5" y="1"   width="5.5" height="5.5" rx="1.5" fill="#f97316" opacity="0.45"/>
                  <rect x="1"   y="9.5" width="5.5" height="5.5" rx="1.5" fill="#f97316" opacity="0.45"/>
                  <rect x="9.5" y="9.5" width="5.5" height="5.5" rx="1.5" fill="#f97316" opacity="0.95"/>
                </svg>
              </div>
              <div style={{
                animation: '_pc_fade_in 0.6s ease both',
                fontSize: 16, fontWeight: 600,
                color: isDark ? 'rgba(255,255,255,0.75)' : '#1D1D1F',
                marginBottom: 8, letterSpacing: '0.01em',
              }}>
                AIC-RG Studio
              </div>
              <div style={{
                animation: '_pc_fade_in 0.6s 0.1s ease both',
                fontSize: 13,
                color: isDark ? 'rgba(255,255,255,0.28)' : '#86868B',
                lineHeight: 1.6,
              }}>
                Опишите идею ниже или выберите<br/>в сайдбаре
              </div>
            </div>
          ) : shouldRenderIframe ? (
            previewFrame
          ) : (
            <div style={{ flex: 1, background: th.canvasBg }} />
          )}
        </div>

        <div style={{ position:'absolute', inset:0, display: tab === 'reasoning' ? 'flex' : 'none', flexDirection:'column' }}>
          <div
            data-testid="reasoning-panel"
            style={{ width:'100%', height:'100%', overflowY:'auto', padding:20, background: isDark ? '#060606' : '#f8fafc', boxSizing:'border-box' }}
          >
            {!hasReasoningTrace ? (
              workspaceBinding.diagnostic ? (
                <WorkspaceDiagnosticPanel diagnostic={workspaceBinding.diagnostic} testId="reasoning-diagnostic" />
              ) : (
                <div
                  data-testid="reasoning-empty"
                  style={{ textAlign:'center', marginTop:80, color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(15,23,42,0.5)', fontSize:13 }}
                >
                  Run a generation to see structured reasoning steps.
                </div>
              )
            ) : (
              <>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, gap:12, flexWrap:'wrap' }}>
                  <div>
                    <div style={{ fontSize:15, fontWeight:600, color: isDark ? 'rgba(255,255,255,0.86)' : '#0f172a' }}>
                      Reasoning timeline
                    </div>
                    <div
                      data-testid="reasoning-scope-label"
                      style={{ fontSize:11, color: isDark ? 'rgba(255,255,255,0.38)' : 'rgba(15,23,42,0.5)', marginTop:4 }}
                    >
                      {reasoningScopeLabel} · project {workspaceBinding.projectId || 'none'} · branch {workspaceBinding.branchId} · run {visibleReasoningTrace!.runId}
                    </div>
                    <div style={{ fontSize:11, color: isDark ? 'rgba(255,255,255,0.34)' : 'rgba(15,23,42,0.44)', marginTop:3 }}>
                      {reasoningSteps.length} steps · started {new Date(visibleReasoningTrace!.startedAt).toLocaleTimeString()}
                    </div>
                  </div>
                  {reasoningOutcomeSummary && (
                    <div
                      data-testid="reasoning-final-outcome"
                      style={{ fontSize:11, color:'#22c55e', padding:'6px 10px', borderRadius:999, border:'1px solid rgba(34,197,94,0.35)', background:'rgba(34,197,94,0.1)' }}
                    >
                      {reasoningOutcomeSummary}
                    </div>
                  )}
                </div>

                {workspaceBinding.diagnostic && (
                  <div style={{ marginBottom: 12 }}>
                    <WorkspaceDiagnosticPanel
                      diagnostic={workspaceBinding.diagnostic}
                      testId={hasCurrentTraceSteps ? 'reasoning-diagnostic-banner' : 'reasoning-diagnostic'}
                      compact
                    />
                  </div>
                )}

                {runSummary && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
                    <SummaryCard title="Brief" isDark={isDark}>
                      <div style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.84)' : '#0f172a', lineHeight: 1.5 }}>
                        {runSummary.brief}
                      </div>
                    </SummaryCard>

                    <SummaryCard title="Skeleton / archetype" isDark={isDark}>
                      <div style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.84)' : '#0f172a', fontWeight: 600 }}>
                        {runSummary.skeleton?.label ?? 'No skeleton recorded'}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 11, color: isDark ? 'rgba(255,255,255,0.42)' : '#64748b' }}>
                        {[
                          runSummary.skeleton?.id,
                          runSummary.skeleton?.archetypeName ?? runSummary.skeleton?.archetypeId,
                          runSummary.skeleton?.domainName ?? runSummary.skeleton?.domainId,
                        ].filter(Boolean).join(' · ')}
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 10, color: isDark ? 'rgba(255,255,255,0.34)' : '#64748b', marginBottom: 6 }}>Skeleton files</div>
                        <PathPills items={(runSummary.output?.skeletonFiles ?? []).slice(0, 6)} isDark={isDark} />
                      </div>
                    </SummaryCard>

                    <SummaryCard title="Design intent / packs" isDark={isDark}>
                      <div style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.74)' : '#334155', marginBottom: 8 }}>
                        {runSummary.design?.designSummary ?? 'No design pack telemetry recorded.'}
                      </div>
                      <PathPills items={runSummary.design?.intent ?? []} isDark={isDark} />
                    </SummaryCard>

                    <SummaryCard title="Output truth" isDark={isDark}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginBottom: 8 }}>
                        <MetricCard label="Changed" value={runSummary.output?.changedFileCount ?? 0} isDark={isDark} />
                        <MetricCard label="Created" value={runSummary.output?.createdFileCount ?? 0} isDark={isDark} />
                        <MetricCard label="Delta size" value={formatMetricBytes(runSummary.output?.deltaSizeBytes)} isDark={isDark} />
                        <MetricCard label="Compile count" value={runSummary.output?.compileCount ?? 0} isDark={isDark} />
                      </div>
                      <div style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.42)' : '#64748b', marginBottom: 6 }}>
                        Preview {runSummary.output?.previewMountStatus ?? 'missing'} · save {runSummary.output?.saveReady ? 'ready' : 'locked'}
                      </div>
                      <OutputStructureSummary output={runSummary.output} isDark={isDark} compact testId="reasoning-structure-summary" />
                    </SummaryCard>

                    <SummaryCard title="Quality / verdict" isDark={isDark}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: runSummary.quality?.verdict === 'pass' ? '#22c55e' : runSummary.quality?.verdict === 'partial' ? '#f59e0b' : '#ef4444' }}>
                          {(runSummary.quality?.verdict ?? 'partial').toUpperCase()}
                        </span>
                        <span style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.56)' : '#475569' }}>
                          {runSummary.quality?.summary ?? 'No quality summary captured.'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(runSummary.quality?.gates ?? []).slice(0, 6).map(gate => (
                          <div key={gate.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                            <span style={{ color: gate.passed ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{gate.passed ? 'PASS' : 'FAIL'}</span>
                            <span style={{ color: isDark ? 'rgba(255,255,255,0.82)' : '#0f172a' }}>{gate.label}</span>
                            <span style={{ marginLeft: 'auto', color: isDark ? 'rgba(255,255,255,0.34)' : '#64748b' }}>{sourceLabel(gate.source)}</span>
                          </div>
                        ))}
                      </div>
                    </SummaryCard>

                    <SummaryCard title="Run path" isDark={isDark}>
                      <div style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.78)' : '#334155', marginBottom: 8 }}>
                        {runSummary.path.summary}
                      </div>
                      <PathPills items={[runSummary.path.kind, ...runSummary.path.markers]} tone={runSummary.path.testEnvironment ? 'warn' : 'neutral'} isDark={isDark} />
                    </SummaryCard>
                  </div>
                )}

                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {reasoningSteps.map((step, index) => {
                    const status = getReasoningStatus(step);
                    const isStepActive = step.id === visibleReasoningTrace!.activeStepId || step.isActive;
                    return (
                      <div
                        key={step.id}
                        data-testid="reasoning-step-item"
                        style={{
                          borderRadius: 12,
                          border: isStepActive ? '1px solid rgba(249,115,22,0.5)' : (isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(15,23,42,0.12)'),
                          background: isStepActive ? (isDark ? 'rgba(249,115,22,0.08)' : 'rgba(249,115,22,0.08)') : (isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.75)'),
                          padding: '10px 12px',
                        }}
                      >
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                          <span style={{ minWidth:22, height:22, borderRadius:999, display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, color: isDark ? '#f8fafc' : '#0f172a', background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.1)' }}>
                            {index + 1}
                          </span>
                          <span style={{ fontSize:12, fontWeight:600, color: isDark ? 'rgba(255,255,255,0.84)' : '#0f172a', flex:1 }}>
                            {getReasoningStepLabel(step)}
                          </span>
                          <span style={{ fontSize:10, color:status.color, fontWeight:600 }}>
                            {status.label}
                          </span>
                          {isStepActive && (
                            <span
                              data-testid="reasoning-active-step"
                              style={{ fontSize:10, color:'#f97316', fontWeight:700 }}
                            >
                              Current
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize:12, color: isDark ? 'rgba(255,255,255,0.62)' : '#334155', lineHeight:1.45 }}>
                          {step.summary}
                        </div>
                        {step.attemptNumber ? (
                          <div style={{ marginTop:6, fontSize:11, color: isDark ? 'rgba(251,146,60,0.86)' : '#c2410c' }}>
                            Attempt {step.attemptNumber}
                          </div>
                        ) : null}
                        {step.errorSummary ? (
                          <div style={{ marginTop:6, fontSize:11, color:'#ef4444' }}>
                            {step.errorSummary}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Code — ALWAYS mounted to preserve editor state across tab switches */}
        <div style={{ position:'absolute', inset:0, display: tab === 'code' ? 'block' : 'none' }}>
          <CodePanel
            files={files}
            setFiles={setFiles}
            activeFile={activeFile}
            setActiveFile={setActiveFile}
            binding={workspaceBinding}
          />
        </div>

        {/* Other tabs — conditional (no iframes, cheap to remount) */}
        {tab === 'design'   && <DesignPanel currentTheme={currentTheme} />}
        {tab === 'analytics' && <AnalyticsPanel binding={workspaceBinding} />}
        {tab === 'security' && <SecurityPanel files={files} />}
        {tab === 'cloud' && (
          <CloudPanel
            files={files}
            projectName={projectName ?? 'my-app'}
            addLog={addLog ?? (() => {})}
            currentTheme={currentTheme}
          />
        )}
      </div>
    </div>
  );
};
