import React, { useState, useRef, useEffect } from 'react';
import {
  Monitor, Smartphone, Tablet,
  Eye, Code2, Palette, BarChart2, Shield,
  Share2, Copy, Check, GitBranch, GitCommit, CheckCircle,
  FilePlus, Trash2, ZoomIn, ZoomOut, Maximize2, Download,
} from 'lucide-react';
import type { FileMap } from '../hooks/useStudio';

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
 * the Vite preview iframe failed (DOM/fiber mismatch from Vite HMR).
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

/* ---- Code Panel ---- */

const CodePanel: React.FC<{
  files: FileMap; setFiles: (f:FileMap)=>void;
  activeFile: string; setActiveFile: (n:string)=>void;
}> = ({ files, setFiles, activeFile, setActiveFile }) => {
  const [copied, setCopied] = useState(false);
  const names = Object.keys(files);
  const code  = files[activeFile] ?? '';

  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(()=>setCopied(false),2000); };
  const add  = () => { const n=prompt('File name'); if(n?.trim()){setFiles({...files,[n.trim()]:''});setActiveFile(n.trim());} };
  const del  = (n:string) => { if(names.length<=1)return; const u={...files}; delete u[n]; setFiles(u); if(activeFile===n)setActiveFile(Object.keys(u)[0]); };

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
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 16px', borderBottom:'1px solid rgba(255,255,255,0.06)', flexShrink:0 }}>
          <span style={{ fontSize:11, color:'rgba(255,255,255,0.28)', fontFamily:'monospace' }}>{activeFile}</span>
          <button onClick={copy} style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 12px', borderRadius:7, background:'none', border:'none', cursor:'pointer', fontSize:11, color:copied?'#30d158':'rgba(255,255,255,0.3)' }}>
            {copied?<Check size={12}/>:<Copy size={12}/>} {copied?'Copied':'Copy'}
          </button>
        </div>
        <textarea
          style={{ flex:1, background:'transparent', border:'none', outline:'none', resize:'none', padding:'16px 20px', fontSize:12, lineHeight:1.7, fontFamily:'monospace', color:'rgba(255,255,255,0.72)', whiteSpace:'pre', overflowWrap:'normal' }}
          value={code} onChange={e=>setFiles({...files,[activeFile]:e.target.value})} spellCheck={false}
        />
      </div>
    </div>
  );
};

/* ---- Mini panels ---- */

// ── ObservabilityPanel — real generation traces ─────────────────────────────

import { generationTracer } from '../services/GenerationTracer';
import type { GenerationTrace, TraceSpan } from '../services/GenerationTracer';

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
      {open && span.children.map((ch, i) => <SpanRow key={i} span={ch} depth={depth + 1} />)}
    </>
  );
};

const TraceCard: React.FC<{ trace: GenerationTrace }> = ({ trace }) => {
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
            {date} · {trace.mode.toUpperCase()} · {trace.model.split('/').pop()?.slice(0, 20)}
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
          {trace.spans.map((span, i) => <SpanRow key={i} span={span} depth={0} />)}
        </div>
      )}
    </div>
  );
};

const AnalyticsPanel = () => {
  const [traces, setTraces] = useState<GenerationTrace[]>(() =>
    generationTracer.getRecent(20).reverse(),
  );

  useEffect(() => {
    const handler = () => setTraces(generationTracer.getRecent(20).reverse());
    window.addEventListener('studio-trace', handler);
    return () => window.removeEventListener('studio-trace', handler);
  }, []);

  const ok      = traces.filter(t => t.outcome === 'ok').length;
  const errored = traces.filter(t => t.outcome === 'error').length;
  const avgE2e  = traces.filter(t => t.e2eMs !== undefined).reduce((a, t) => a + (t.e2eMs ?? 0), 0) / (traces.length || 1);
  const avgTtft = traces.filter(t => t.ttftMs !== undefined).reduce((a, t) => a + (t.ttftMs ?? 0), 0) / (traces.filter(t => t.ttftMs !== undefined).length || 1);

  return (
    <div style={{ width:'100%', height:'100%', overflowY:'auto', padding:20, background:'#060606', boxSizing:'border-box' }}>
      <h2 style={{ fontSize:13, fontWeight:600, marginBottom:16, color:'rgba(255,255,255,0.7)' }}>Generation Traces</h2>

      {/* Summary stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:16 }}>
        {[
          { l:'Total', v: traces.length },
          { l:'Success', v: ok, clr:'#30d158' },
          { l:'Failed', v: errored, clr: errored > 0 ? '#ff453a' : undefined },
          { l:'Avg E2E', v: traces.length ? `${(avgE2e/1000).toFixed(1)}s` : '—' },
        ].map(s => (
          <div key={s.l} style={{ borderRadius:12, padding:'10px 12px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.25)', marginBottom:4 }}>{s.l}</div>
            <div style={{ fontSize:16, fontWeight:700, color: s.clr ?? 'rgba(255,255,255,0.85)' }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* TTFT */}
      {traces.length > 0 && avgTtft > 0 && (
        <div style={{ marginBottom:12, padding:'8px 12px', borderRadius:10, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)', fontSize:10, color:'rgba(255,255,255,0.4)' }}>
          Avg time-to-first-token: <strong style={{ color:'rgba(255,255,255,0.7)' }}>{Math.round(avgTtft)}ms</strong>
        </div>
      )}

      {/* Trace list */}
      {traces.length === 0 ? (
        <div style={{ textAlign:'center', padding:40, color:'rgba(255,255,255,0.2)', fontSize:12 }}>
          No traces yet — run a generation to see the pipeline breakdown
        </div>
      ) : (
        traces.map(t => <TraceCard key={t.id} trace={t} />)
      )}

      {traces.length > 0 && (
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

type TabId = 'preview'|'code'|'design'|'analytics'|'security'|'cloud';

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
}

/* ---- Main component ---- */

export const PreviewCanvas: React.FC<PreviewCanvasProps> = ({
  device, setDevice, files, setFiles, activeFile, setActiveFile,
  currentTheme, onShare, onDownloadProject, onExportReactNative, rnExporting = false, rnExportChars = 0,
  currentVersion, totalVersions,
  addLog, projectName, activeBranch = 'main',
  currentSnapshotId, markSnapshotStable, currentProjectId,
  isAutoFixing = false,
  isGenerating = false,
  onRollback,
  apiKey,
  previewLifecycle,
  previewBlockedReason,
  projectId,
}) => {
  const iframeUrl = projectId ? `/preview/${projectId}` : '';
  const [tab, setTab] = useState<TabId>('preview');

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
    {id:'preview',label:'Preview'},{id:'code',label:'Code'},{id:'design',label:'Design'},
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
    previewLifecycle === 'materializing';
  const isPreviewReady =
    previewLifecycle === 'preview-ready' ||
    previewLifecycle === 'degraded';
  const [hasPreviewReady, setHasPreviewReady] = useState(false);
  useEffect(() => {
    setHasPreviewReady(false);
  }, [projectId]);
  useEffect(() => {
    if (isPreviewReady) setHasPreviewReady(true);
  }, [isPreviewReady]);
  const canShowIframe = isPreviewReady || hasPreviewReady;
  const showEmptySplash =
    !projectId ||
    (!isGenerating && currentVersion === 0 && Object.keys(files).length === 0);
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

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, height:'100%', overflow:'hidden' }}>

      {/* Tab bar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 16px', height:44, background:th.topBg, borderBottom:`1px solid ${th.border}`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:1 }}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
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

      {/* Content */}
      <div style={{ flex:1, overflow:'hidden', position:'relative' }}>

        {/* Preview — ONE stable SandpackView instance, never unmounted.
            S1: All devices share the same ZoomableCanvas → DeviceFrame → SandpackView
            fiber path. Device switch changes only props (autoFit, device) — React
            never unmounts SandpackView regardless of desktop↔mobile transitions. */}
        <div style={{ position:'absolute', inset:0, display: tab === 'preview' ? 'flex' : 'none', flexDirection:'column' }}>
          {showPrototypingSplash ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              background: th.canvasBg, textAlign: 'center',
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

              <div style={{
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
          ) : canShowIframe ? (
            <ZoomableCanvas
              draggable={false}
              initZoom={0.55}
              autoFit={{
                w: (DEVICE_SPECS[device as DevKey] ?? DEVICE_SPECS.desktop).outerW,
                h: (DEVICE_SPECS[device as DevKey] ?? DEVICE_SPECS.desktop).outerH,
              }}
              bgStyle={bgStyle}
            >
              <DeviceFrame device={device}>
                <iframe
                  src={iframeUrl}
                  title="preview"
                  style={{ display: 'block', width: '100%', height: '100%', border: 'none' }}
                />
              </DeviceFrame>
            </ZoomableCanvas>
          ) : (
            <div style={{ flex: 1, background: th.canvasBg }} />
          )}
        </div>

        {/* Code — ALWAYS mounted to preserve editor state across tab switches */}
        <div style={{ position:'absolute', inset:0, display: tab === 'code' ? 'block' : 'none' }}>
          <CodePanel files={files} setFiles={setFiles} activeFile={activeFile} setActiveFile={setActiveFile} />
        </div>

        {/* Other tabs — conditional (no iframes, cheap to remount) */}
        {tab === 'design'   && <DesignPanel currentTheme={currentTheme} />}
        {tab === 'analytics' && <AnalyticsPanel />}
        {tab === 'security' && <SecurityPanel files={files} />}
        {tab === 'cloud' && (
          <CloudPanel
            files={files}
            projectName={projectName ?? 'my-app'}
            addLog={addLog ?? (() => {})}
          />
        )}
      </div>
    </div>
  );
};
