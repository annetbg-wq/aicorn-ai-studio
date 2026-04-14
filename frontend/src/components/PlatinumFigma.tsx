/**
 * PlatinumFigma — Platinum Mirror Engine
 *
 * Left panel (300px):
 *   ─ Your Projects  (project hub — list + new import + restore)
 *   ─ Current Project (URL connect + status)
 *   ─ Actions (Activate Digital Twin · Confirm & Send to Studio)
 *   ─ Cultural Audit (market / strictness)
 *   ─ Progress pills
 *   ─ Activity log
 *
 * Right panel (tabs):
 *   🪞 Mirror   — CSS absolute-positioned visual canvas from Figma geometry
 *   🎨 Tokens   — Design DNA (palette, fonts, CSS vars, Tailwind)
 *   ⬆ Export   — Studio → Figma spec + 🪄 Magic Sync (Code to Canvas)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, Figma, Link2, CheckCircle2, AlertCircle, Loader2,
  Palette, Copy, Check, Download, ExternalLink, Zap,
  Activity, Layers, Clock, SendHorizonal, Eye, Plus, Trash2, Bot, X, Sparkles, RefreshCw,
} from 'lucide-react';
import { AIEngineService }    from '../services/AIEngineService';
import { FigmaOAuthService }  from '../services/FigmaOAuthService';
import type { ComponentMapping, AnalyzeResult } from '../services/AIEngineService';
import { ScannerService } from '../services/ScannerService';
import type { ComponentRegistry } from '../services/ScannerService';
import type { FigmaAccount }  from '../services/IdentityService';
import type { AccessResult }  from '../services/FigmaClient';
import { FigmaService }       from '../services/FigmaService';
import type {
  ProjectTheme, SyncProgress, TargetMarket, AuditStrictness, FigmaVisualNode,
  ApplyBatchResult,
} from '../services/FigmaService';
import type { FigmaProject }  from '../services/ProjectStore';
import { ExportService }      from '../services/ExportService';
import type { ExportSpec }    from '../services/ExportService';
import { MCPBridgeService }   from '../services/MCPBridgeService';
import type { McpStatus, PushDiff } from '../services/MCPBridgeService';
import { ConfigService }      from '../services/ConfigService';
import { llmFetch }           from '../services/LLMProxy';
import {
  AUDIT_SYSTEM_PROMPT, buildAuditPrompt, parseAuditResponse,
} from '../services/DesignDiffService';
import type { DesignChange }  from '../services/DesignDiffService';

// ── Props ─────────────────────────────────────────────────────────────────────

interface PlatinumFigmaProps {
  onBack:                 () => void;
  theme:                  'dark' | 'medium' | 'light';
  figmaAccounts:          FigmaAccount[];
  figmaLink:              string;
  setFigmaLink:           (url: string) => void;
  figmaAccessResult:      AccessResult | null;
  validateFigmaLink:      (url: string) => Promise<void>;
  figmaValidating:        boolean;
  currentProjectTheme:    ProjectTheme | null;
  syncProgress:           SyncProgress;
  syncFigmaUrl:           string | undefined;
  startFigmaSync:         (url: string) => Promise<void>;
  files:                  Record<string, string>;
  addSystemMessage:       (content: string) => void;
  targetMarket:           TargetMarket;
  setTargetMarket:        (m: TargetMarket) => void;
  auditStrictness:        AuditStrictness;
  setAuditStrictness:     (s: AuditStrictness) => void;
  // AI Audit
  apiKey:                 string;
  selectedModel:          string;
  // Project Hub
  figmaProjects:          FigmaProject[];
  activeFigmaProjectId:   string | null;
  saveFigmaProject:       (name?: string) => string | null;
  loadFigmaProject:       (project: FigmaProject) => void;
  deleteFigmaProject:     (id: string) => void;
  markFigmaProjectSynced: (id: string) => void;
  clearFigmaSync:         () => void;
  // Fusion Protocol — Component Registry for mapping magic
  componentRegistry?:     ComponentRegistry | null;
  // Proxy Engine
  syncSource?:            'proxy' | 'direct' | null;
  refreshFigmaAccounts?:  () => void;
}

// ── Theme palette ─────────────────────────────────────────────────────────────

const THEME = {
  dark: {
    bg:        '#07070b',
    panel:     '#0d0d12',
    border:    'rgba(255,255,255,0.06)',
    borderMid: 'rgba(255,255,255,0.10)',
    txt:       '#e5e5ea',
    sub:       '#6b6b7a',
    dim:       '#3a3a48',
    input:     '#111116',
    card:      'rgba(255,255,255,0.03)',
    accent:    '#a78bfa',
    accentBg:  'rgba(167,139,250,0.14)',
    accentBdr: 'rgba(167,139,250,0.30)',
    green:     '#4ade80',
    greenBg:   'rgba(74,222,128,0.10)',
    greenBdr:  'rgba(74,222,128,0.25)',
    red:       '#ef4444',
    redBg:     'rgba(239,68,68,0.08)',
    amber:     '#fbbf24',
    amberBg:   'rgba(251,191,36,0.08)',
    code:      '#a78bfa',
    codeBg:    'rgba(167,139,250,0.06)',
    icon:      '#e5e5ea',
  },
  medium: {
    bg:        '#16162e',
    panel:     '#1f1f40',
    border:    'rgba(200,195,255,0.12)',
    borderMid: 'rgba(200,195,255,0.20)',
    txt:       '#eaeaf8',
    sub:       '#9494c0',
    dim:       '#484870',
    input:     '#28285a',
    card:      'rgba(255,255,255,0.05)',
    accent:    '#b8a4ff',
    accentBg:  'rgba(184,164,255,0.16)',
    accentBdr: 'rgba(184,164,255,0.35)',
    green:     '#4ade80',
    greenBg:   'rgba(74,222,128,0.10)',
    greenBdr:  'rgba(74,222,128,0.25)',
    red:       '#f87171',
    redBg:     'rgba(248,113,113,0.08)',
    amber:     '#fbbf24',
    amberBg:   'rgba(251,191,36,0.08)',
    code:      '#b8a4ff',
    codeBg:    'rgba(184,164,255,0.06)',
    icon:      '#eaeaf8',
  },
  light: {
    bg:        '#f0f0f5',
    panel:     '#ffffff',
    border:    'rgba(0,0,0,0.08)',
    borderMid: 'rgba(0,0,0,0.14)',
    txt:       '#111118',
    sub:       '#55556a',
    dim:       '#aaaabc',
    input:     '#f5f5fa',
    card:      'rgba(0,0,0,0.025)',
    accent:    '#6d4ed8',
    accentBg:  'rgba(109,78,216,0.10)',
    accentBdr: 'rgba(109,78,216,0.25)',
    green:     '#16a34a',
    greenBg:   'rgba(22,163,74,0.08)',
    greenBdr:  'rgba(22,163,74,0.25)',
    red:       '#dc2626',
    redBg:     'rgba(220,38,38,0.07)',
    amber:     '#b45309',
    amberBg:   'rgba(180,83,9,0.07)',
    code:      '#6d4ed8',
    codeBg:    'rgba(109,78,216,0.05)',
    icon:      '#111118',
  },
} as const;

type ThemePalette = typeof THEME[keyof typeof THEME];

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeSince(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function statusColor(status: FigmaProject['status'], c: ThemePalette) {
  if (status === 'synced')   return c.green;
  if (status === 'active')   return c.amber;
  return c.dim;
}

// ── Sub-components ────────────────────────────────────────────────────────────

const Avatar: React.FC<{ account: FigmaAccount; size?: number; accent: string; accentBg: string }> = ({ account, size = 36, accent, accentBg }) => {
  const src      = account.userInfo?.avatarUrl;
  const initials = (account.userInfo?.name ?? account.label ?? '?').slice(0, 2).toUpperCase();
  return src ? (
    <img src={src} alt={initials} width={size} height={size}
      style={{ width: size, height: size, borderRadius: size / 2.5, objectFit: 'cover' }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: size / 2.5, background: accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.37, fontWeight: 700, color: accent, flexShrink: 0 }}>
      {initials}
    </div>
  );
};

const CopyBtn: React.FC<{ text: string; c: ThemePalette; label?: string }> = ({ text, c, label = 'Copy' }) => {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1800); }}
      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, border: `1px solid ${c.border}`, background: c.card, color: ok ? c.green : c.sub, fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: '0.2s', whiteSpace: 'nowrap' }}
    >
      {ok ? <Check size={11} /> : <Copy size={11} />}
      {ok ? 'Copied!' : label}
    </button>
  );
};

const SLabel: React.FC<{ children: React.ReactNode; color: string }> = ({ children, color }) => (
  <div style={{ fontSize: 10, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>
    {children}
  </div>
);

// ── Project Hub section (left panel) ─────────────────────────────────────────

const ProjectHub: React.FC<{
  projects:            FigmaProject[];
  activeId:            string | null;
  c:                   ThemePalette;
  onLoad:              (p: FigmaProject) => void;
  onDelete:            (id: string) => void;
  onNew:               () => void;
}> = ({ projects, activeId, c, onLoad, onDelete, onNew }) => {
  const [open, setOpen] = useState(projects.length > 0);

  return (
    <div style={{ borderBottom: `1px solid ${c.border}` }}>
      {/* Header row */}
      <div style={{ padding: '10px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: open ? 6 : 10 }}>
        <button
          onClick={() => setOpen(p => !p)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: c.sub, fontSize: 10, fontWeight: 800, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.12em', padding: 0 }}
        >
          <Layers size={10} color={c.dim} />
          Your Projects{projects.length > 0 ? ` (${projects.length})` : ''}
          <span style={{ fontSize: 8, marginLeft: 2 }}>{open ? '▲' : '▼'}</span>
        </button>
        <button
          onClick={onNew}
          title="Start a new Figma import"
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 7, border: `1px solid ${c.border}`, background: 'transparent', color: c.sub, fontSize: 10, fontWeight: 700, cursor: 'pointer', transition: '0.15s' }}
        >
          <Plus size={10} /> New
        </button>
      </div>

      {open && (
        <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {projects.length === 0 ? (
            <div style={{ fontSize: 11, color: c.dim, textAlign: 'center', padding: '10px 0' }}>
              No saved projects yet
            </div>
          ) : (
            projects.slice(0, 8).map(proj => {
              const isActive = proj.id === activeId;
              return (
                <div
                  key={proj.id}
                  onClick={() => onLoad(proj)}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 10px', borderRadius: 10, background: isActive ? c.accentBg : c.card, border: `1px solid ${isActive ? c.accentBdr : c.border}`, cursor: 'pointer', transition: '0.15s' }}
                >
                  {/* Accent color swatch */}
                  {proj.accentColor ? (
                    <div style={{ width: 18, height: 18, borderRadius: 5, background: proj.accentColor, flexShrink: 0, border: `1.5px solid ${c.border}` }} />
                  ) : (
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor(proj.status, c), flexShrink: 0 }} />
                  )}
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: isActive ? c.accent : c.txt, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {proj.name}
                    </div>
                    <div style={{ fontSize: 10, color: c.dim, display: 'flex', gap: 6 }}>
                      <span>{proj.theme.colors.length} colors</span>
                      <span>·</span>
                      <span style={{ color: statusColor(proj.status, c) }}>{proj.status}</span>
                      <span>·</span>
                      <span>{timeSince(proj.updatedAt)}</span>
                    </div>
                  </div>
                  {/* Delete */}
                  <button
                    onClick={e => { e.stopPropagation(); onDelete(proj.id); }}
                    title="Remove project"
                    style={{ background: 'none', border: 'none', color: c.dim, cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', flexShrink: 0, borderRadius: 4, opacity: 0.7 }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

// ── Mirror Error Boundary ─────────────────────────────────────────────────────

interface MirrorBoundaryState { hasError: boolean; errorMsg: string; }

class MirrorErrorBoundary extends React.Component<
  { children: React.ReactNode; c: ThemePalette },
  MirrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; c: ThemePalette }) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }
  static getDerivedStateFromError(err: unknown): MirrorBoundaryState {
    const msg = err instanceof Error ? err.message : String(err);
    return { hasError: true, errorMsg: msg };
  }
  componentDidCatch(err: unknown, info: React.ErrorInfo) {
    console.error('[MirrorErrorBoundary] Render error:', err, info);
  }
  render() {
    if (this.state.hasError) {
      const c = this.props.c;
      return (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12,
          background: c.panel, color: c.dim, padding: 24, textAlign: 'center',
        }}>
          <span style={{ fontSize: 32 }}>⚠️</span>
          <p style={{ margin: 0, fontWeight: 600, color: c.txt }}>Ошибка отрисовки узла</p>
          <p style={{ margin: 0, fontSize: 12 }}>Пропускаю повреждённые элементы...</p>
          {this.state.errorMsg && (
            <code style={{
              fontSize: 11, background: c.input, padding: '4px 8px',
              borderRadius: 4, color: c.red, maxWidth: 400, wordBreak: 'break-all',
            }}>
              {this.state.errorMsg}
            </code>
          )}
          <button
            onClick={() => this.setState({ hasError: false, errorMsg: '' })}
            style={{
              marginTop: 8, padding: '6px 16px', borderRadius: 6,
              background: c.accentBg, border: `1px solid ${c.accentBdr}`,
              color: c.accent, cursor: 'pointer', fontSize: 12,
            }}
          >
            Попробовать снова
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Mirror View Canvas ────────────────────────────────────────────────────────

const MirrorCanvas: React.FC<{
  nodes:              FigmaVisualNode[];
  c:                  ThemePalette;
  themeName:          'dark' | 'medium' | 'light';
  /** IDs pruned by Pro-Audit — excluded from rendering */
  excludeIds?:        string[];
  /** Currently selected node ID (highlights with accent border) */
  highlightedId?:     string | null;
  /** Called when user clicks a node */
  onNodeClick?:       (node: FigmaVisualNode) => void;
  /** Smart Focus — use this frame's bounds as the viewport origin */
  focusFrameId?:      string | null;
  /** Component mappings from Pro-Audit — show 🧩 badge overlays */
  componentMappings?: ComponentMapping[];
}> = ({ nodes, c, themeName, excludeIds = [], highlightedId, onNodeClick, focusFrameId, componentMappings = [] }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasW, setCanvasW] = useState(800);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(([e]) => setCanvasW(e.contentRect.width - 40));
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  if (nodes.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '80px 24px', textAlign: 'center', flex: 1 }}>
        <div style={{ width: 80, height: 80, borderRadius: 24, background: c.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Eye size={36} color={c.accent} style={{ opacity: 0.5 }} />
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: c.txt }}>Mirror View — no data yet</p>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: c.sub, lineHeight: 1.6 }}>
            Connect a Figma file in the left panel<br />
            and click <strong style={{ color: c.accent }}>Activate Digital Twin</strong> to render a<br />
            visual preview of the layout here.
          </p>
        </div>
      </div>
    );
  }

  const excludeSet = new Set(excludeIds);

  // Render filter: exclude Pro-Audit pruned nodes + huge decorative VECTORs/ELLIPSEs
  const renderNodes = nodes.filter(n => {
    if (excludeSet.has(n.id)) return false;
    if ((n.type === 'VECTOR' || n.type === 'ELLIPSE') && (n.width > 2000 || n.height > 2000)) return false;
    return (
      n.fillColor    ||
      n.fillGradient ||
      n.strokeColor  ||
      n.imageUrl     ||   // IMAGE fill — render as <img>
      n.type === 'FRAME'   ||
      n.type === 'SECTION' ||
      (n.type === 'TEXT' && n.text)
    );
  });

  // Smart Focus: if focusFrameId provided, use that frame as viewport bounds
  const focusNode = focusFrameId ? nodes.find(n => n.id === focusFrameId) : null;
  const minX = focusNode ? focusNode.x : Math.min(...renderNodes.map(n => n.x));
  const minY = focusNode ? focusNode.y : Math.min(...renderNodes.map(n => n.y));
  const maxX = focusNode ? focusNode.x + focusNode.width  : Math.max(...renderNodes.map(n => n.x + n.width));
  const maxY = focusNode ? focusNode.y + focusNode.height : Math.max(...renderNodes.map(n => n.y + n.height));

  const srcW  = Math.max(maxX - minX, 1);
  const srcH  = Math.max(maxY - minY, 1);
  const scale = Math.min(canvasW / srcW, 1.5);
  const cvH   = Math.min(srcH * scale, 3000);
  const cvW   = srcW * scale;
  const isDark = themeName !== 'light';
  const prunedCount = excludeIds.length;

  // Build component mapping lookup for O(1) badge checks
  const mappingById = new Map<string, ComponentMapping>(
    componentMappings.map(m => [m.nodeId, m]),
  );
  const mappedCount = componentMappings.length;

  return (
    <div ref={containerRef} style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
      <div style={{ position: 'relative', width: cvW, height: cvH, margin: '0 auto', background: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.04)', borderRadius: 12, overflow: 'hidden', border: `1px solid ${c.border}`, boxShadow: isDark ? '0 0 60px rgba(0,0,0,0.6)' : '0 4px 30px rgba(0,0,0,0.12)' }}>
        {renderNodes.map(n => {
          const l       = (n.x - minX) * scale;
          const t       = (n.y - minY) * scale;
          const w       = Math.max(n.width  * scale, 1);
          const h       = Math.max(n.height * scale, 1);
          const isText  = n.type === 'TEXT';
          const isFrame = n.type === 'FRAME' || n.type === 'SECTION';
          const isHL    = n.id === highlightedId;
          const mapping = mappingById.get(n.id);
          const isMapped = !!mapping;

          const borderCss = isHL
            ? `2px solid ${c.accent}`
            : isMapped
              ? `1.5px dashed ${c.accent}aa`
              : n.strokeColor
                ? `${(n.strokeWidth ?? 1) * scale}px solid ${n.strokeColor}`
                : isFrame && !n.fillColor && !n.fillGradient
                  ? `1px solid ${c.borderMid}`
                  : 'none';

          return (
            <div
              key={n.id}
              title={
                mapping
                  ? `🧩 ${n.name} → <${mapping.componentName}${mapping.variant ? ` variant="${mapping.variant}"` : ''}> (${Math.round(mapping.confidence * 100)}%)`
                  : `${n.name} (${n.type}) — ${Math.round(n.width)}×${Math.round(n.height)}px`
              }
              onClick={e => { e.stopPropagation(); onNodeClick?.(n); }}
              style={{
                position:        'absolute',
                left:            l,
                top:             t,
                width:           w,
                height:          h,
                zIndex:          isHL ? 9999 : n.depth,
                background:      n.fillGradient ?? n.fillColor ?? 'transparent',
                opacity:         n.fillOpacity != null && !n.fillGradient
                  ? (n.opacity ?? 1) * n.fillOpacity
                  : (n.opacity ?? 1),
                borderRadius:    Math.max((n.cornerRadius || 0) * scale, 0),
                border:          borderCss,
                boxShadow:       isHL
                  ? `0 0 0 3px ${c.accent}44, ${n.shadowCss ?? ''}`
                  : isMapped
                    ? `0 0 0 2px ${c.accent}22`
                    : (n.shadowCss ?? undefined),
                filter:          n.blurPx ? `blur(${Math.round(n.blurPx * scale)}px)` : undefined,
                overflow:        'hidden',
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'center',
                boxSizing:       'border-box',
                cursor:          onNodeClick ? 'pointer' : 'default',
                transition:      'border 0.15s, box-shadow 0.15s',
              }}
            >
              {isText && n.text && w > 12 && h > 8 && (
                <span style={{
                  fontSize:     Math.max(6, Math.min((n.fontSize || 14) * scale, h * 0.85)),
                  fontFamily:   n.fontFamily ? `'${n.fontFamily}', sans-serif` : 'sans-serif',
                  fontWeight:   n.fontWeight || 400,
                  color:        isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.85)',
                  overflow:     'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace:   'nowrap',
                  maxWidth:     '100%',
                  padding:      '0 2px',
                  lineHeight:   1.2,
                }}>
                  {n.text}
                </span>
              )}
              {/* Image fill — rendered behind text and badge overlays */}
              {n.imageUrl && (
                <img
                  src={n.imageUrl}
                  alt={n.name}
                  style={{
                    position:      'absolute',
                    inset:         0,
                    width:         '100%',
                    height:        '100%',
                    objectFit:     'cover',
                    pointerEvents: 'none',
                    borderRadius:  Math.max((n.cornerRadius || 0) * scale, 0),
                  }}
                />
              )}
              {/* 🧩 component badge — top-left corner of mapped nodes */}
              {isMapped && w > 28 && h > 16 && (
                <div style={{
                  position:   'absolute',
                  top:        2,
                  left:       2,
                  padding:    '1px 4px',
                  borderRadius: 4,
                  background: c.accentBg,
                  border:     `1px solid ${c.accentBdr}`,
                  fontSize:   Math.max(8, Math.min(10, w * 0.08)),
                  fontWeight: 800,
                  color:      c.accent,
                  lineHeight: 1.3,
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                  backdropFilter: 'blur(4px)',
                  zIndex: 1,
                }}>
                  🧩 {mapping!.componentName}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: c.sub, display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span>{renderNodes.length} visible nodes</span>
        <span>·</span>
        <span>scale {Math.round(scale * 100)}%</span>
        <span>·</span>
        <span>{Math.round(srcW)}×{Math.round(srcH)} px</span>
        {focusNode && <><span>·</span><span style={{ color: c.accent }}>⊙ focused</span></>}
        {renderNodes.filter(n => n.imageUrl).length > 0 && (
          <><span>·</span><span style={{ color: c.green }}>🖼 {renderNodes.filter(n => n.imageUrl).length} images</span></>
        )}
        {mappedCount > 0 && <><span>·</span><span style={{ color: c.accent, fontWeight: 700 }}>🧩 {mappedCount} mapped</span></>}
        {prunedCount > 0 && <><span>·</span><span style={{ color: c.red }}>✕ {prunedCount} pruned</span></>}
      </div>
    </div>
  );
};

// ── Layers Panel ──────────────────────────────────────────────────────────────

const TYPE_ICON: Record<string, string> = {
  FRAME: '▣', SECTION: '▣', RECTANGLE: '▪', ELLIPSE: '●',
  TEXT: 'T', VECTOR: '✦', GROUP: '◫', INSTANCE: '◈', COMPONENT: '◆',
};

const LayersPanel: React.FC<{
  nodes:            FigmaVisualNode[];
  highlightedId:    string | null;
  excludeIds:       string[];
  onSelect:         (id: string) => void;
  c:                ThemePalette;
  /** Nodes that have been mapped to project components by Pro-Audit */
  mappedNodeIds?:   Set<string>;
  /** For tooltip: nodeId → componentName */
  mappingByNodeId?: Map<string, ComponentMapping>;
}> = ({ nodes, highlightedId, excludeIds, onSelect, c, mappedNodeIds, mappingByNodeId }) => {
  const [search, setSearch] = useState('');
  const excludeSet = new Set(excludeIds);

  const sorted = [...nodes]
    .sort((a, b) => a.depth !== b.depth ? a.depth - b.depth : a.y - b.y)
    .filter(n => !search || n.name.toLowerCase().includes(search.toLowerCase()));

  const mappedCount = mappedNodeIds?.size ?? 0;

  return (
    <div style={{ width: 220, flexShrink: 0, background: c.panel, borderRight: `1px solid ${c.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '8px 10px', borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: c.dim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Layers · {nodes.length}
          </div>
          {mappedCount > 0 && (
            <div style={{ fontSize: 9, fontWeight: 800, color: c.accent, background: c.accentBg, padding: '2px 6px', borderRadius: 10, border: `1px solid ${c.accentBdr}` }}>
              🧩 {mappedCount}
            </div>
          )}
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter…"
          style={{ width: '100%', padding: '4px 8px', borderRadius: 7, background: c.input, border: `1px solid ${c.border}`, color: c.txt, fontSize: 11, outline: 'none', boxSizing: 'border-box' }}
        />
      </div>
      {/* Layer rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sorted.map(n => {
          const excluded  = excludeSet.has(n.id);
          const isHL      = n.id === highlightedId;
          const isMapped  = mappedNodeIds?.has(n.id) ?? false;
          const mapping   = mappingByNodeId?.get(n.id);
          const indent    = Math.min(n.depth * 8, 48);
          const typeIcon  = TYPE_ICON[n.type] ?? '·';
          return (
            <div
              key={n.id}
              onClick={() => onSelect(n.id)}
              title={
                mapping
                  ? `${n.name} (${n.type}) → 🧩 <${mapping.componentName}${mapping.variant ? ` variant="${mapping.variant}"` : ''}> · confidence ${Math.round(mapping.confidence * 100)}%`
                  : `${n.name} (${n.type}) — ${Math.round(n.width)}×${Math.round(n.height)}px`
              }
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: `4px 8px 4px ${8 + indent}px`,
                background: isHL ? c.accentBg : isMapped ? `${c.accent}0d` : 'transparent',
                borderLeft: `2px solid ${isHL ? c.accent : isMapped ? `${c.accent}66` : 'transparent'}`,
                cursor: 'pointer',
                opacity: excluded ? 0.3 : 1,
                transition: 'background 0.1s',
              }}
            >
              <span style={{ fontSize: 9, color: isMapped ? c.accent : c.dim, fontFamily: 'monospace', minWidth: 12, flexShrink: 0 }}>
                {typeIcon}
              </span>
              <span style={{
                fontSize: 11, color: isHL ? c.accent : isMapped ? c.accent : c.txt,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                textDecoration: excluded ? 'line-through' : 'none',
                fontWeight: isMapped ? 700 : 400,
              }}>
                {n.name}
              </span>
              {/* Status badges — rightmost */}
              {isMapped && !excluded && (
                <span title={`→ <${mapping?.componentName}>`} style={{ fontSize: 10, flexShrink: 0 }}>🧩</span>
              )}
              {excluded && <span style={{ fontSize: 8, color: c.red, fontWeight: 800, flexShrink: 0 }}>✕</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Tokens tab ────────────────────────────────────────────────────────────────

const TokensPanel: React.FC<{
  theme:           ProjectTheme | null;
  c:               ThemePalette;
  themeName:       'dark' | 'medium' | 'light';
  targetMarket:    TargetMarket;
  auditStrictness: AuditStrictness;
  figmaName?:      string;
}> = ({ theme, c, themeName, targetMarket, auditStrictness, figmaName }) => {
  if (!theme) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: 20, background: c.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Palette size={34} color={c.accent} style={{ opacity: 0.6 }} />
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: c.txt }}>No design tokens yet</p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: c.sub, lineHeight: 1.5 }}>
            Connect a Figma file and click <strong style={{ color: c.accent }}>Activate Digital Twin</strong>
          </p>
        </div>
      </div>
    );
  }
  return (
    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: c.txt, letterSpacing: '-0.03em' }}>Design DNA</h2>
        {theme.isDeepScraped && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 20, background: c.amberBg, border: `1px solid ${c.amber}44`, fontSize: 11, fontWeight: 700, color: c.amber }}>⚡ deep scan</span>
        )}
        <span style={{ fontSize: 12, color: c.sub, marginLeft: 'auto' }}>
          {targetMarket} · {auditStrictness} · <strong style={{ color: c.txt }}>{figmaName ?? 'Figma'}</strong> · {timeSince(theme.syncedAt)}
        </span>
      </div>

      {theme.colors.length > 0 && (
        <section>
          <SLabel color={c.dim}>Color Palette · {theme.colors.length} styles</SLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {theme.colors.map(col => (
              <div key={col.styleId} title={`${col.name}\n${col.cssVar}\n${col.hex}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: col.hex, border: `1.5px solid ${c.border}`, boxShadow: themeName === 'dark' ? '0 4px 10px rgba(0,0,0,0.4)' : '0 2px 6px rgba(0,0,0,0.1)' }} />
                <span style={{ fontSize: 10, fontFamily: 'monospace', color: c.sub, textAlign: 'center', maxWidth: 54, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.hex}</span>
                <span style={{ fontSize: 9, color: c.dim, textAlign: 'center', maxWidth: 54, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.name.split('/').pop()}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {theme.textStyles.length > 0 && (
        <section>
          <SLabel color={c.dim}>Text Styles · {theme.textStyles.length} styles</SLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {theme.textStyles.map(t => (
              <div key={t.styleId} style={{ padding: '10px 14px', borderRadius: 12, background: c.card, border: `1px solid ${c.border}`, minWidth: 120 }}>
                <div style={{ fontSize: Math.min(t.fontSize, 22), fontWeight: t.fontWeight, fontFamily: `'${t.fontFamily}', sans-serif`, color: c.txt, lineHeight: 1.2, marginBottom: 4 }}>Aa</div>
                <div style={{ fontSize: 11, color: c.sub }}>{t.fontFamily}</div>
                <div style={{ fontSize: 10, color: c.dim }}>{t.fontSize}px · {t.fontWeight}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <SLabel color={c.dim}>CSS Variables</SLabel>
          <CopyBtn text={theme.cssVars} c={c} />
        </div>
        <pre className="allow-copy" style={{ margin: 0, padding: '14px 16px', borderRadius: 12, background: c.codeBg, border: `1px solid ${c.accentBdr}`, color: c.code, fontSize: 12, fontFamily: '"SF Mono","Fira Code",monospace', lineHeight: 1.65, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {theme.cssVars}
        </pre>
      </section>

      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <SLabel color={c.dim}>Tailwind Extend</SLabel>
          <CopyBtn text={theme.tailwindExtend} c={c} />
        </div>
        <pre className="allow-copy" style={{ margin: 0, padding: '14px 16px', borderRadius: 12, background: themeName === 'light' ? 'rgba(59,130,246,0.05)' : 'rgba(96,165,250,0.06)', border: `1px solid ${themeName === 'light' ? 'rgba(59,130,246,0.2)' : 'rgba(96,165,250,0.15)'}`, color: themeName === 'light' ? '#2563eb' : '#60a5fa', fontSize: 12, fontFamily: '"SF Mono","Fira Code",monospace', lineHeight: 1.65, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {theme.tailwindExtend}
        </pre>
      </section>
    </div>
  );
};

// ── Export + Magic Sync tab ───────────────────────────────────────────────────

const ExportPanel: React.FC<{
  files:    Record<string, string>;
  theme:    ProjectTheme | null;
  syncUrl?: string;
  c:        ThemePalette;
}> = ({ files, theme, syncUrl, c }) => {
  const [spec,        setSpec]        = useState<ExportSpec | null>(null);
  const [building,    setBuilding]    = useState(false);
  const [mcpStatus,   setMcpStatus]   = useState<McpStatus>('idle');
  const [manifest,    setManifest]    = useState<ReturnType<typeof MCPBridgeService.buildCanvasManifest> | null>(null);
  const [showMcp,     setShowMcp]     = useState(false);
  const [claudePrompt, setClaudePrompt] = useState('');
  // Push Delta mode
  const [pushDiff,    setPushDiff]    = useState<PushDiff | null>(null);
  const [showDiff,    setShowDiff]    = useState(false);
  const [hasPending,  setHasPending]  = useState(false);

  const hasFiles = Object.keys(files).length > 0;

  // Check for pending changes on mount and whenever files change
  useEffect(() => {
    setHasPending(MCPBridgeService.hasPendingChanges(files));
  }, [files]);

  const buildSpec = useCallback(() => {
    setBuilding(true);
    setTimeout(() => {
      setSpec(ExportService.buildFigmaSpec(files, theme));
      setBuilding(false);
    }, 400);
  }, [files, theme]);

  const handleMagicSync = useCallback(async () => {
    const m = MCPBridgeService.buildCanvasManifest(files, theme);
    setManifest(m);
    setClaudePrompt(MCPBridgeService.buildClaudePrompt(m));
    setShowMcp(true);
    setMcpStatus('checking');
    const available = await MCPBridgeService.pingDesktopServer();
    setMcpStatus(available ? 'available' : 'unavailable');
    // Mark push so delta resets
    MCPBridgeService.markPushed(files);
    setHasPending(false);
    setPushDiff(null);
    setShowDiff(false);
  }, [files, theme]);

  const handleShowDiff = useCallback(() => {
    const diff = MCPBridgeService.buildPushDiff(files);
    setPushDiff(diff);
    setShowDiff(true);
  }, [files]);

  return (
    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: c.txt, letterSpacing: '-0.03em' }}>Export to Figma</h2>

      <p style={{ margin: 0, fontSize: 13, color: c.sub, lineHeight: 1.6 }}>
        Two paths back to Figma: generate a <strong style={{ color: c.txt }}>reverse-sync spec</strong> (maps Studio colors → Figma tokens),
        or use <strong style={{ color: c.accent }}>🪄 Magic Sync</strong> to capture the live preview directly via Figma MCP.
      </p>

      {/* Action row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={buildSpec} disabled={!hasFiles || building}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 18px', borderRadius: 11, border: 'none', background: hasFiles ? c.accentBg : c.card, color: hasFiles ? c.accent : c.dim, fontWeight: 700, fontSize: 13, cursor: hasFiles ? 'pointer' : 'not-allowed', transition: '0.2s' }}>
          {building ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Building…</> : <><Zap size={14} /> Build Spec</>}
        </button>

        <button onClick={handleMagicSync} disabled={!hasFiles}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 18px', borderRadius: 11, border: `1px solid ${c.accentBdr}`, background: c.accentBg, color: c.accent, fontWeight: 700, fontSize: 13, cursor: hasFiles ? 'pointer' : 'not-allowed', opacity: hasFiles ? 1 : 0.5, transition: '0.2s' }}>
          🪄 Magic Sync (Code to Canvas)
        </button>

        {spec && (
          <button onClick={() => ExportService.downloadSpec(spec)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 18px', borderRadius: 11, border: `1px solid ${c.greenBdr}`, background: c.greenBg, color: c.green, fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: '0.2s' }}>
            <Download size={14} /> Download spec.json
          </button>
        )}
        {syncUrl && (
          <a href={syncUrl} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 18px', borderRadius: 11, border: `1px solid ${c.border}`, background: c.card, color: c.sub, fontWeight: 700, fontSize: 13, textDecoration: 'none', transition: '0.2s' }}>
            <ExternalLink size={14} /> Open Figma
          </a>
        )}
      </div>

      {/* ── Push Delta indicator ───────────────────────────────────────── */}
      {hasFiles && hasPending && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          borderRadius: 12, background: 'rgba(251,191,36,0.08)',
          border: '1px solid rgba(251,191,36,0.25)', fontSize: 12,
        }}>
          <span style={{ color: c.amber, fontWeight: 600 }}>
            ⚡ {MCPBridgeService.buildPushDiff(files).changedCount + MCPBridgeService.buildPushDiff(files).addedCount} file{(MCPBridgeService.buildPushDiff(files).changedCount + MCPBridgeService.buildPushDiff(files).addedCount) !== 1 ? 's' : ''} changed since last push
          </span>
          <button
            onClick={handleShowDiff}
            style={{
              padding: '3px 10px', borderRadius: 6, border: `1px solid ${c.amber}44`,
              background: c.amberBg, color: c.amber, cursor: 'pointer', fontSize: 11, fontWeight: 600,
            }}
          >
            Review diff →
          </button>
        </div>
      )}

      {/* ── Push Diff panel ───────────────────────────────────────────── */}
      {showDiff && pushDiff && (
        <div style={{
          padding: 16, borderRadius: 14, background: '#0d0d18',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: c.txt }}>
              Push Delta — {pushDiff.changedCount} modified · {pushDiff.addedCount} added · {pushDiff.unchangedCount} unchanged
            </span>
            <button onClick={() => setShowDiff(false)} style={{ background: 'none', border: 'none', color: c.sub, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ maxHeight: 260, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {pushDiff.deltas.map(d => (
              <div key={d.path} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                borderRadius: 8,
                background: d.status === 'modified' ? 'rgba(251,191,36,0.07)'
                  : d.status === 'added' ? 'rgba(62,207,142,0.07)'
                  : 'transparent',
                border: `1px solid ${
                  d.status === 'modified' ? 'rgba(251,191,36,0.15)'
                  : d.status === 'added' ? 'rgba(62,207,142,0.15)'
                  : 'rgba(255,255,255,0.04)'
                }`,
              }}>
                <span style={{
                  fontSize: 10, padding: '1px 5px', borderRadius: 4, fontWeight: 700,
                  background: d.status === 'modified' ? c.amberBg : d.status === 'added' ? c.greenBg : 'rgba(255,255,255,0.05)',
                  color: d.status === 'modified' ? c.amber : d.status === 'added' ? c.green : c.dim,
                }}>
                  {d.status === 'modified' ? 'M' : d.status === 'added' ? 'A' : '·'}
                </span>
                <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 11, color: d.status === 'unchanged' ? c.sub : c.txt }}>
                  {d.path}
                </span>
                <span style={{ fontSize: 10, color: c.sub }}>
                  {d.status !== 'unchanged' && d.oldSize > 0 && `${Math.round(d.oldSize / 1024 * 10) / 10}k → `}
                  {Math.round(d.newSize / 1024 * 10) / 10}k
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowDiff(false)}
              style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${c.border}`, background: c.card, color: c.sub, cursor: 'pointer', fontSize: 12 }}>
              Cancel
            </button>
            <button onClick={handleMagicSync}
              style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: c.accent, color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
              🪄 Confirm &amp; Push to Figma
            </button>
          </div>
        </div>
      )}

      {!hasFiles && (
        <div style={{ padding: '14px 16px', borderRadius: 12, background: c.amberBg, border: `1px solid ${c.amber}33`, fontSize: 12, color: c.amber }}>
          Generate code in the Engine first, then return here.
        </div>
      )}

      {/* ── Magic Sync panel ────────────────────────────────────────── */}
      {showMcp && manifest && (
        <div style={{ padding: '20px', borderRadius: 16, background: c.card, border: `1px solid ${c.accentBdr}`, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Header + status */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>🪄</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: c.txt }}>Magic Sync — Code to Canvas</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, background: mcpStatus === 'available' ? c.greenBg : mcpStatus === 'checking' ? c.amberBg : c.redBg, border: `1px solid ${mcpStatus === 'available' ? c.greenBdr : mcpStatus === 'checking' ? c.amber + '44' : c.red + '33'}` }}>
              {mcpStatus === 'checking' && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} color={c.amber} />}
              {mcpStatus !== 'checking' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: mcpStatus === 'available' ? c.green : c.red }} />}
              <span style={{ fontSize: 11, fontWeight: 700, color: mcpStatus === 'available' ? c.green : mcpStatus === 'checking' ? c.amber : c.red }}>
                {mcpStatus === 'checking'   ? 'Detecting MCP…'
                  : mcpStatus === 'available'  ? 'Figma MCP detected'
                  : 'MCP server not found'}
              </span>
            </div>
          </div>

          {/* How it works */}
          <div style={{ padding: '12px 14px', borderRadius: 12, background: mcpStatus === 'available' ? c.greenBg : c.amberBg, border: `1px solid ${mcpStatus === 'available' ? c.greenBdr : c.amber + '33'}`, fontSize: 12, color: mcpStatus === 'available' ? c.green : c.amber, lineHeight: 1.7 }}>
            {mcpStatus === 'available' ? (
              <>
                ✅ <strong>Figma MCP server is running</strong> at localhost:3845.
                Use the <strong>generate_figma_design</strong> tool in Claude Desktop:
                open the Studio preview in a browser tab, then paste the prompt below into Claude.
              </>
            ) : (
              <>
                ℹ️ <strong>generate_figma_design</strong> captures your LIVE running UI and converts it to
                editable Figma layers — but it requires the Figma Desktop app with Dev Mode → MCP enabled,
                plus Claude Desktop configured with the Figma MCP server.
                Browser apps cannot call MCP tools directly.
              </>
            )}
          </div>

          {/* Setup steps (when unavailable) */}
          {mcpStatus === 'unavailable' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: c.sub, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Setup Steps</div>
              {[
                '1. Open Figma Desktop → Dev Mode → enable MCP server in right sidebar',
                '2. In terminal: claude mcp add --transport http figma-desktop http://127.0.0.1:3845/mcp',
                '3. Open the Studio preview in a browser tab',
                '4. Paste the Claude prompt below into Claude Desktop / Claude Code',
              ].map((step, i) => (
                <div key={i} style={{ padding: '7px 12px', borderRadius: 9, background: c.card, border: `1px solid ${c.border}`, fontSize: 12, color: c.sub, lineHeight: 1.5 }}>{step}</div>
              ))}
            </div>
          )}

          {/* Claude prompt */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: c.sub, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Claude Prompt</div>
              <CopyBtn text={claudePrompt} c={c} label="Copy Prompt" />
            </div>
            <pre className="allow-copy" style={{ margin: 0, padding: '12px 14px', borderRadius: 12, background: c.codeBg, border: `1px solid ${c.accentBdr}`, color: c.code, fontSize: 11, fontFamily: '"SF Mono","Fira Code",monospace', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflowY: 'auto' }}>
              {claudePrompt}
            </pre>
          </div>

          {/* Manifest download (Figma Plugin fallback) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 12, background: c.card, border: `1px solid ${c.border}` }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: c.txt }}>Canvas Manifest</div>
              <div style={{ fontSize: 11, color: c.sub }}>{manifest.components.length} components · {manifest.colorTokens.length} tokens · for Figma Plugin</div>
            </div>
            <button onClick={() => MCPBridgeService.downloadManifest(manifest)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: `1px solid ${c.border}`, background: c.card, color: c.sub, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <Download size={12} /> Download
            </button>
          </div>
        </div>
      )}

      {/* ── Export Spec result ──────────────────────────────────────── */}
      {spec && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              ['Components', spec.components.length],
              ['Mapped', `${spec.colorMappings.length - spec.unmappedColors.length}/${spec.colorMappings.length}`],
              ['Fonts', spec.textMappings.length],
              ['Frames~', spec.estimatedFrames],
            ].map(([l, v]) => (
              <div key={String(l)} style={{ flex: 1, minWidth: 90, padding: '12px 14px', borderRadius: 12, background: c.accentBg, border: `1px solid ${c.accentBdr}`, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: c.accent }}>{v}</div>
                <div style={{ fontSize: 10, color: c.sub, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          {spec.components.length > 0 && (
            <section>
              <SLabel color={c.dim}>Components</SLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {spec.components.map(comp => (
                  <span key={comp.name} style={{ padding: '4px 10px', borderRadius: 8, background: c.accentBg, border: `1px solid ${c.accentBdr}`, color: c.accent, fontSize: 12, fontWeight: 600 }}>{comp.name}</span>
                ))}
              </div>
            </section>
          )}

          {spec.colorMappings.length > 0 && (
            <section>
              <SLabel color={c.dim}>Color Mappings</SLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {spec.colorMappings.slice(0, 10).map(m => (
                  <div key={m.hex} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 9, background: c.card, border: `1px solid ${c.border}` }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, background: m.hex, flexShrink: 0, border: `1px solid ${c.border}` }} />
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: c.txt, minWidth: 72 }}>{m.hex}</span>
                    {m.figmaVar ? (
                      <span style={{ fontSize: 11, color: c.green, fontFamily: 'monospace' }}>{m.figmaVar}</span>
                    ) : (
                      <span style={{ fontSize: 11, color: c.dim }}>— no Figma token</span>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: c.dim }}>×{m.usageCount}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {spec.unmappedColors.length > 0 && (
            <div style={{ padding: '12px 14px', borderRadius: 12, background: c.amberBg, border: `1px solid ${c.amber}33`, display: 'flex', gap: 10 }}>
              <Layers size={14} color={c.amber} style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 12, color: c.amber, lineHeight: 1.5 }}>
                <strong>{spec.unmappedColors.length} color{spec.unmappedColors.length !== 1 ? 's' : ''}</strong> in code have no matching Figma token. Sync the Figma file first for complete mapping.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── AI Audit tab ─────────────────────────────────────────────────────────────

type AuditState = 'idle' | 'auditing' | 'done' | 'error';

const AuditPanel: React.FC<{
  nodes:      FigmaVisualNode[];
  theme:      ProjectTheme | null;
  apiKey:     string;
  model:      string;
  fileKey:    string | undefined;
  token:      string | undefined;
  onRefresh:  () => Promise<void>;
  c:          ThemePalette;
}> = ({ nodes, theme, apiKey, model, fileKey, token, onRefresh, c }) => {
  const [state,    setState]    = useState<AuditState>('idle');
  const [changes,  setChanges]  = useState<DesignChange[]>([]);
  const [errMsg,   setErrMsg]   = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [batchMsg, setBatchMsg] = useState('');
  const [result,   setResult]   = useState<ApplyBatchResult | null>(null);

  const changeKey = (c: DesignChange) => `${c.nodeId}:${c.field}`;

  const runAudit = async () => {
    if (!nodes.length || !theme || !apiKey) return;
    setState('auditing');
    setChanges([]);
    setErrMsg('');
    setResult(null);
    try {
      const prompt = buildAuditPrompt(nodes, theme);
      const res = await llmFetch(
        'https://openrouter.ai/api/v1/chat/completions',
        { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        JSON.stringify({
          model:      model || ConfigService.resolveModel('build'),
          messages:   [
            { role: 'system', content: AUDIT_SYSTEM_PROMPT },
            { role: 'user',   content: prompt },
          ],
          max_tokens: 2000,
        }),
      );
      if (!res.ok) {
        const t = await res.text().catch(() => res.status.toString());
        throw new Error(`API ${res.status}: ${t.slice(0, 120)}`);
      }
      const data   = await res.json();
      const text   = data.choices?.[0]?.message?.content ?? '';
      const parsed = parseAuditResponse(text);
      setChanges(parsed);
      setSelected(new Set(parsed.map(changeKey)));
      setState('done');
    } catch (err: any) {
      setErrMsg(err.message);
      setState('error');
    }
  };

  const applySelected = async () => {
    if (!fileKey || !token) return;
    const toApply = changes.filter(ch => selected.has(changeKey(ch)));
    setApplying(true);
    setBatchMsg('');
    setResult(null);
    try {
      const r = await FigmaService.applyChanges(
        toApply,
        fileKey,
        token,
        (done, total, msg) => setBatchMsg(`[${done}/${total}] ${msg}`),
      );
      setResult(r);
      if (r.applied > 0) {
        setBatchMsg('Re-syncing Mirror View…');
        await onRefresh();
        setBatchMsg('Changes synced ✓');
      }
    } finally {
      setApplying(false);
    }
  };

  const downloadPluginSpec = () => {
    if (!result?.pluginSpec) return;
    const json = JSON.stringify(result.pluginSpec, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `plugin-patch-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  const noData = !nodes.length || !theme;
  const noKey  = !apiKey;
  const canApply = state === 'done' && selected.size > 0 && !!fileKey && !!token;

  return (
    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 22 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: c.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Bot size={20} color={c.accent} />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: c.txt, letterSpacing: '-0.03em' }}>AI Design Audit</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: c.sub }}>
            Finds spacing, font and color violations against your Design DNA
          </p>
        </div>
      </div>

      {/* Warnings */}
      {noData && (
        <div style={{ padding: '12px 14px', borderRadius: 12, background: c.amberBg, border: `1px solid ${c.amber}44`, fontSize: 12, color: c.amber }}>
          Activate Digital Twin first to load Figma geometry data.
        </div>
      )}
      {noKey && !noData && (
        <div style={{ padding: '12px 14px', borderRadius: 12, background: c.amberBg, border: `1px solid ${c.amber}44`, fontSize: 12, color: c.amber }}>
          Add your OpenRouter API key in Settings to enable AI Audit.
        </div>
      )}

      {/* Run button */}
      <button
        onClick={runAudit}
        disabled={noData || noKey || state === 'auditing'}
        style={{ padding: '14px 0', borderRadius: 12, border: 'none', background: (noData || noKey) ? c.card : c.accentBg, color: (noData || noKey) ? c.dim : c.accent, fontWeight: 800, fontSize: 14, cursor: (noData || noKey) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: state === 'auditing' ? 0.7 : 1, transition: 'all 0.2s' }}
      >
        {state === 'auditing'
          ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing {nodes.length} nodes…</>
          : <><Bot size={16} /> Run AI Audit</>}
      </button>

      {/* Error */}
      {state === 'error' && (
        <div style={{ padding: '12px 14px', borderRadius: 12, background: c.redBg, border: `1px solid ${c.red}33`, fontSize: 12, color: c.red }}>
          <strong>Audit failed:</strong> {errMsg}
        </div>
      )}

      {/* Results */}
      {state === 'done' && (
        <>
          {/* Summary row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SLabel color={c.dim}>
              {changes.length === 0
                ? 'No violations found — design is compliant ✓'
                : `${changes.length} issue${changes.length !== 1 ? 's' : ''} found`}
            </SLabel>
            {changes.length > 0 && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button onClick={() => setSelected(new Set(changes.map(changeKey)))}
                  style={{ fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 7, border: `1px solid ${c.border}`, background: 'transparent', color: c.sub, cursor: 'pointer' }}>
                  All
                </button>
                <button onClick={() => setSelected(new Set())}
                  style={{ fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 7, border: `1px solid ${c.border}`, background: 'transparent', color: c.sub, cursor: 'pointer' }}>
                  None
                </button>
              </div>
            )}
          </div>

          {/* Change list */}
          {changes.map(ch => {
            const key     = changeKey(ch);
            const checked = selected.has(key);
            const isColor = ch.changeType === 'color';
            const typeDot: Record<string, string> = {
              color: c.accent, typography: c.amber, layout: c.green, geometry: c.sub, effect: c.dim,
            };
            return (
              <div key={key}
                onClick={() => setSelected(prev => {
                  const next = new Set(prev);
                  next.has(key) ? next.delete(key) : next.add(key);
                  return next;
                })}
                style={{ display: 'flex', gap: 10, padding: '11px 13px', borderRadius: 12, background: checked ? c.accentBg : c.card, border: `1px solid ${checked ? c.accentBdr : c.border}`, cursor: 'pointer', alignItems: 'flex-start', transition: 'all 0.15s' }}>
                {/* Checkbox */}
                <div style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${checked ? c.accent : c.dim}`, background: checked ? c.accent : 'transparent', flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {checked && <Check size={10} color="#fff" strokeWidth={3} />}
                </div>
                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: c.txt, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{ch.nodeName}</span>
                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, background: c.card, border: `1px solid ${c.border}`, color: typeDot[ch.changeType] ?? c.sub, fontWeight: 700 }}>{ch.changeType}</span>
                    <span style={{ fontSize: 10, color: c.dim, fontFamily: 'monospace' }}>{ch.field}</span>
                  </div>
                  {/* From → To */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                    {isColor && typeof ch.from === 'string' && (
                      <div style={{ width: 14, height: 14, borderRadius: 4, background: ch.from, border: `1px solid ${c.border}`, flexShrink: 0 }} />
                    )}
                    <span style={{ fontSize: 11, color: c.sub, fontFamily: 'monospace' }}>{String(ch.from ?? '—')}</span>
                    <span style={{ fontSize: 11, color: c.dim }}>→</span>
                    {isColor && typeof ch.to === 'string' && (
                      <div style={{ width: 14, height: 14, borderRadius: 4, background: ch.to, border: `1px solid ${c.border}`, flexShrink: 0 }} />
                    )}
                    <span style={{ fontSize: 11, color: c.txt, fontFamily: 'monospace', fontWeight: 600 }}>{String(ch.to ?? '—')}</span>
                  </div>
                  {ch.rationale && (
                    <p style={{ margin: '4px 0 0', fontSize: 11, color: c.dim, lineHeight: 1.4 }}>{ch.rationale}</p>
                  )}
                </div>
              </div>
            );
          })}

          {/* Apply bar */}
          {changes.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {!fileKey && (
                <div style={{ fontSize: 12, color: c.amber, padding: '8px 12px', borderRadius: 10, background: c.amberBg }}>
                  Connect a Figma file with write access to push changes.
                </div>
              )}
              <button
                onClick={applySelected}
                disabled={!canApply || applying}
                style={{ padding: '12px 0', borderRadius: 12, border: 'none', background: canApply ? c.greenBg : c.card, color: canApply ? c.green : c.dim, fontWeight: 800, fontSize: 13, cursor: canApply ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: applying ? 0.7 : 1, transition: 'all 0.2s' }}>
                {applying
                  ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Applying…</>
                  : <><Zap size={14} /> Apply Selected ({selected.size})</>}
              </button>

              {/* Batch progress */}
              {batchMsg && (
                <p style={{ margin: 0, fontSize: 11, color: c.sub, fontFamily: 'monospace', lineHeight: 1.4 }}>{batchMsg}</p>
              )}

              {/* Apply result */}
              {result && (
                <div style={{ padding: '14px', borderRadius: 12, background: c.card, border: `1px solid ${c.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {result.applied > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: c.green, fontWeight: 700 }}>
                      <CheckCircle2 size={14} color={c.green} />
                      {result.applied} variable update{result.applied !== 1 ? 's' : ''} pushed to Figma
                    </div>
                  )}
                  {result.skipped > 0 && (
                    <div style={{ fontSize: 12, color: c.amber }}>
                      {result.skipped} skipped — no matching Figma Variable found
                    </div>
                  )}
                  {result.pluginSpec && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 12, color: c.sub }}>
                        {(result.pluginSpec as any).changes?.length ?? 0} change{(result.pluginSpec as any).changes?.length !== 1 ? 's' : ''} require Figma Plugin
                      </span>
                      <button onClick={downloadPluginSpec}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, border: `1px solid ${c.accentBdr}`, background: c.accentBg, color: c.accent, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        <Download size={11} /> plugin-patch.json
                      </button>
                    </div>
                  )}
                  {result.errors.length > 0 && (
                    <div style={{ fontSize: 11, color: c.red, fontFamily: 'monospace', lineHeight: 1.5 }}>
                      {result.errors.map((e, i) => <div key={i}>{e}</div>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

type RightTab = 'mirror' | 'tokens' | 'export' | 'audit';

export const PlatinumFigma: React.FC<PlatinumFigmaProps> = ({
  onBack, theme,
  figmaAccounts,
  figmaLink, setFigmaLink,
  figmaAccessResult, validateFigmaLink, figmaValidating,
  currentProjectTheme, syncProgress, syncFigmaUrl, startFigmaSync,
  files, addSystemMessage,
  targetMarket, setTargetMarket, auditStrictness, setAuditStrictness,
  apiKey, selectedModel,
  figmaProjects, activeFigmaProjectId,
  saveFigmaProject, loadFigmaProject, deleteFigmaProject,
  markFigmaProjectSynced, clearFigmaSync,
  componentRegistry,
  syncSource,
  refreshFigmaAccounts,
}) => {
  const c = THEME[theme];

  const [localUrl,        setLocalUrl]        = useState(figmaLink);
  const [isSyncing,       setIsSyncing]       = useState(false);
  const [activityLog,     setActivityLog]     = useState<Array<{ ts: number; msg: string; ok: boolean }>>([]);
  const [syncNotified,    setSyncNotified]    = useState(false);
  const [showActivity,    setShowActivity]    = useState(false);
  const [rightTab,        setRightTab]        = useState<RightTab>('mirror');

  // ── Pro-Audit state ───────────────────────────────────────────────────────
  const [highlightedNodeId,  setHighlightedNodeId]  = useState<string | null>(null);
  const [focusFrameId,       setFocusFrameId]       = useState<string | null>(null);
  const [proExcludeIds,      setProExcludeIds]      = useState<string[]>([]);
  const [proAnalyzing,       setProAnalyzing]       = useState(false);
  const [proSummary,         setProSummary]         = useState('');
  const [showLayers,         setShowLayers]         = useState(false);
  // Fusion Protocol — Component Mapping Magic
  const [componentMappings,  setComponentMappings]  = useState<ComponentMapping[]>([]);
  // Re-Sync: true while a user-initiated re-sync is in progress (distinct from initial sync)
  const [isReSyncing,        setIsReSyncing]        = useState(false);

  const prevStep = useRef('idle');

  useEffect(() => { setLocalUrl(figmaLink); }, [figmaLink]);

  // On sync complete: auto-save to Project Hub + switch to Mirror tab + run Pro-Audit
  useEffect(() => {
    const step = syncProgress.step;
    if (step === 'done' && prevStep.current !== 'done' && !syncNotified) {
      const name   = figmaAccessResult?.fileInfo?.name ?? 'Untitled';
      const colors = currentProjectTheme?.colors.length     ?? 0;
      const fonts  = currentProjectTheme?.textStyles.length ?? 0;
      const nodes  = currentProjectTheme?.visualNodes ?? [];
      // Auto-save to Project Hub
      saveFigmaProject(name);
      setActivityLog(p => [{
        ts:  Date.now(),
        msg: `"${name}" — ${colors} colors, ${fonts} styles, ${nodes.length} visual nodes`,
        ok:  true,
      }, ...p]);
      setSyncNotified(true);
      setRightTab('mirror');
      // Reset Pro-Audit state then run analysis (Performance Guard: only here & Optimize View)
      setProExcludeIds([]);
      setFocusFrameId(null);
      setHighlightedNodeId(null);
      setComponentMappings([]);
      if (nodes.length > 0) {
        setProAnalyzing(true);
        setProSummary('Pro-Audit: analyzing layout structure…');
        const regCtx = ScannerService.registry ? ScannerService.buildPromptContext() : undefined;
        AIEngineService.analyzeNodes(nodes, msg => setProSummary(msg), regCtx)
          .then((r: AnalyzeResult) => {
            setProExcludeIds(r.excludeIds);
            setFocusFrameId(r.mainFrameId);
            setComponentMappings(r.componentMappings);
            const mappedCount = r.componentMappings.length;
            const mappingNote = mappedCount > 0 ? ` 🧩 ${mappedCount} component${mappedCount !== 1 ? 's' : ''} mapped.` : '';
            const msg = `[Pro Engine] Cleanup complete. Removed ${r.excludeIds.length} nodes.${mappingNote}`;
            setProSummary(msg);
            console.log(msg);
          })
          .catch(err => setProSummary(`Pro-Audit: ${err.message}`))
          .finally(() => setProAnalyzing(false));
      }
    }
    if (step === 'error' && prevStep.current !== 'error') {
      setActivityLog(p => [{ ts: Date.now(), msg: syncProgress.message || 'Sync error', ok: false }, ...p]);
    }
    prevStep.current = step;
  }, [syncProgress.step]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (syncProgress.step === 'checking') setSyncNotified(false);
  }, [syncProgress.step]);

  const handleConnect = useCallback(async () => {
    if (!localUrl.trim()) return;
    setFigmaLink(localUrl.trim());
    await validateFigmaLink(localUrl.trim());
  }, [localUrl, setFigmaLink, validateFigmaLink]);

  const handleSync = useCallback(async () => {
    const url = localUrl.trim() || figmaLink;
    if (!url) return;
    setIsSyncing(true);
    try { await startFigmaSync(url); } finally { setIsSyncing(false); }
  }, [localUrl, figmaLink, startFigmaSync]);

  const handleNewImport = useCallback(() => {
    clearFigmaSync();
    setLocalUrl('');
    setSyncNotified(false);
    prevStep.current = 'idle';
    // Reset Pro-Audit + mapping state on new import
    setProExcludeIds([]);
    setFocusFrameId(null);
    setHighlightedNodeId(null);
    setProSummary('');
    setComponentMappings([]);
  }, [clearFigmaSync]);

  // Derived sync state — must be declared before any useCallback that references them
  // (const/let are NOT hoisted; placing them after a useCallback that uses them in its
  //  dependency array causes a ReferenceError / temporal dead zone crash)
  const isConnected = figmaAccessResult?.hasAccess ?? false;
  const syncBusy    = ['checking', 'scraping', 'deep-scraping', 'duplicating', 'injecting'].includes(syncProgress.step);
  const activeAcc   = figmaAccessResult?.account ?? figmaAccounts[0] ?? null;

  // ── Re-Sync From Source: fresh Figma fetch → Mirror + Pro-Audit ─────────
  const handleReSync = useCallback(async () => {
    if (syncBusy || isSyncing) return;
    // Reset all derived Mirror state so the done-effect re-fires cleanly
    setProExcludeIds([]);
    setFocusFrameId(null);
    setHighlightedNodeId(null);
    setComponentMappings([]);
    setProSummary('');
    setSyncNotified(false);
    setIsReSyncing(true);
    try {
      await handleSync();
    } finally {
      setIsReSyncing(false);
    }
  }, [syncBusy, isSyncing, handleSync]);

  // ── OAuth Connect ────────────────────────────────────────────────────────
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthError,   setOauthError]   = useState('');

  const handleOAuthConnect = useCallback(async () => {
    setOauthLoading(true);
    setOauthError('');
    try {
      const redirectUri = FigmaOAuthService.redirectUri();
      FigmaOAuthService.savePreOAuthView('figma');
      const authUrl = await FigmaOAuthService.startOAuth(redirectUri);
      if (!authUrl) {
        setOauthError('Proxy not configured — add a PAT in Settings instead.');
        return;
      }
      window.location.href = authUrl;
    } catch {
      setOauthError('OAuth failed — try again or add a PAT in Settings.');
    } finally {
      setOauthLoading(false);
    }
  }, []);

  // ── Pro-Audit: identify noise + main frame + component mappings ─────────
  // Performance Guard: only called on "Activate Digital Twin" or "Optimize View"
  const runProAudit = useCallback(async (nodes: FigmaVisualNode[]) => {
    if (!nodes.length || proAnalyzing) return;
    setProAnalyzing(true);
    setProSummary('Pro-Audit: analyzing layout structure…');
    try {
      // Pass registry context for Component Mapping Magic
      const regCtx = componentRegistry ? ScannerService.buildPromptContext() : undefined;
      const r: AnalyzeResult = await AIEngineService.analyzeNodes(nodes, msg => setProSummary(msg), regCtx);

      setProExcludeIds(r.excludeIds);
      setFocusFrameId(r.mainFrameId);
      setComponentMappings(r.componentMappings);

      const mappedCount = r.componentMappings.length;
      const mappingNote = mappedCount > 0
        ? ` 🧩 ${mappedCount} component${mappedCount !== 1 ? 's' : ''} mapped.`
        : '';
      const msg = `[Pro Engine] Cleanup complete. Removed ${r.excludeIds.length} nodes.${mappingNote}${r.summary ? ' ' + r.summary : ''}`;
      setProSummary(msg);
      console.log(msg, mappedCount > 0 ? r.componentMappings : '');
    } catch (err: any) {
      setProSummary(`Pro-Audit error: ${err.message}`);
    } finally {
      setProAnalyzing(false);
    }
  }, [proAnalyzing, componentRegistry]);

  // "Confirm & Send to Studio" — injects Digital Twin context + navigates
  const sendToStudio = useCallback(() => {
    const name   = figmaAccessResult?.fileInfo?.name ?? 'Untitled';
    const colors = currentProjectTheme?.colors.length     ?? 0;
    const fonts  = currentProjectTheme?.textStyles.length ?? 0;
    const src    = currentProjectTheme?.isDeepScraped ? ' (deep scan)' : '';
    addSystemMessage(
      `🪞 **Протокол "Digital Twin" активирован** — «${name}»\n\n` +
      `Импортировано: **${colors} цветов**, **${fonts} шрифтовых стилей**${src}. ` +
      `CSS-переменные подключены к контексту генерации.\n\n` +
      `**Моя первая и единственная задача** — воссоздать интерфейс из предоставленных ` +
      `Figma-данных (${colors} цветов, ${fonts} шрифтов) **БЕЗ изменений в стиле**. ` +
      `Используются оригинальные отступы, размеры и цвета. ` +
      `Цель — **100% визуальное сходство**. ` +
      `Интерактивность (логику кнопок) добавляю, визуал не трогаю. ` +
      `Жду инструкций пользователя для любых правок дизайна.`
    );
    if (activeFigmaProjectId) markFigmaProjectSynced(activeFigmaProjectId);
    onBack();
  }, [figmaAccessResult, currentProjectTheme, addSystemMessage, activeFigmaProjectId, markFigmaProjectSynced, onBack]);

  const STEPS = [
    { id: 'checking',      label: 'Check'   },
    { id: 'scraping',      label: 'Scrape'  },
    { id: 'deep-scraping', label: '⚡ Mirror' },
    { id: 'duplicating',   label: 'Clone'   },
    { id: 'injecting',     label: 'Inject'  },
    { id: 'done',          label: 'Done'    },
  ];
  const stepOrder = STEPS.map(s => s.id);
  const curIdx    = stepOrder.indexOf(syncProgress.step);

  const TAB_LABELS: Record<RightTab, string> = {
    mirror: '🪞 Mirror',
    tokens: '🎨 Tokens',
    export: '⬆ Export',
    audit:  '🤖 AI Audit',
  };

  /* ─────────────────────────────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100vh', background: c.bg, overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* ━━ TOP BAR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div style={{ height: 50, flexShrink: 0, background: c.panel, borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px' }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 9, border: `1px solid ${c.border}`, background: 'transparent', color: c.sub, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: '0.15s' }}>
          <ArrowLeft size={13} color={c.icon} /> Engine
        </button>
        <div style={{ width: 1, height: 18, background: c.border }} />
        <Figma size={15} color={c.accent} />
        <span style={{ fontSize: 14, fontWeight: 700, color: c.txt, letterSpacing: '-0.02em' }}>Figma Platinum</span>
        <span style={{ fontSize: 12, color: c.sub }}>— Mirror Engine</span>
        <div style={{ flex: 1 }} />
        {isConnected && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: c.greenBg, border: `1px solid ${c.greenBdr}` }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.green }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: c.green }}>{figmaAccessResult?.fileInfo?.name ?? 'Connected'}</span>
          </div>
        )}
        {currentProjectTheme && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: c.accentBg, border: `1px solid ${c.accentBdr}` }}>
            <Palette size={11} color={c.accent} />
            <span style={{ fontSize: 11, fontWeight: 700, color: c.accent }}>
              {currentProjectTheme.colors.length} tokens
              {(currentProjectTheme.visualNodes?.length ?? 0) > 0 && ` · ${currentProjectTheme.visualNodes!.length} nodes`}
            </span>
          </div>
        )}
      </div>

      {/* ━━ BODY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ══ LEFT PANEL ═══════════════════════════════════════════════════ */}
        <div style={{ width: 300, flexShrink: 0, background: c.panel, borderRight: `1px solid ${c.border}`, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

          {/* ── Your Projects ──────────────────────────────────────────── */}
          <ProjectHub
            projects={figmaProjects}
            activeId={activeFigmaProjectId}
            c={c}
            onLoad={loadFigmaProject}
            onDelete={deleteFigmaProject}
            onNew={handleNewImport}
          />

          {/* ── Current Project ────────────────────────────────────────── */}
          <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${c.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: c.dim, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Current Import</div>

            {activeAcc ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: c.card, border: `1px solid ${c.border}`, marginBottom: 10 }}>
                <Avatar account={activeAcc} size={34} accent={c.accent} accentBg={c.accentBg} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: c.txt, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {activeAcc.userInfo?.name ?? activeAcc.label ?? 'Unknown'}
                  </div>
                  <div style={{ fontSize: 11, color: c.sub, marginTop: 1 }}>
                    {activeAcc.type === 'pat' ? 'PAT' : 'OAuth'} · {activeAcc.userInfo?.email ?? 'Figma'}
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%', background: isConnected ? c.green : c.dim, flexShrink: 0 }} />
              </div>
            ) : (
              <div style={{ marginBottom: 10 }}>
                {/* Studio Proxy badge — public files work without login */}
                <div style={{ padding: '8px 12px', borderRadius: 10, background: c.greenBg, border: `1px solid ${c.greenBdr}`, fontSize: 11, color: c.green, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>⚡</span>
                  <span><strong>Studio Proxy aktiv</strong> — public files accessible without login</span>
                </div>
                {/* Connect with Figma OAuth button */}
                <button
                  onClick={handleOAuthConnect}
                  disabled={oauthLoading}
                  style={{ width: '100%', padding: '10px', borderRadius: 11, border: `1px solid ${c.accentBdr}`, background: c.accentBg, color: c.accent, fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: oauthLoading ? 'wait' : 'pointer', opacity: oauthLoading ? 0.7 : 1 }}
                >
                  <Figma size={13} />
                  {oauthLoading ? 'Redirecting…' : 'Connect with Figma'}
                </button>
                <p style={{ margin: '5px 0 0', fontSize: 10, color: c.dim, textAlign: 'center' }}>
                  For private files · one-click OAuth · no token copy-paste
                </p>
                {oauthError && (
                  <div style={{ marginTop: 6, fontSize: 11, color: c.red }}>{oauthError}</div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={localUrl}
                onChange={e => setLocalUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConnect()}
                placeholder="https://figma.com/file/…"
                style={{ flex: 1, minWidth: 0, padding: '8px 11px', borderRadius: 9, background: c.input, border: `1px solid ${c.border}`, color: c.txt, fontSize: 12, outline: 'none' }}
              />
              <button onClick={handleConnect} disabled={figmaValidating || !localUrl.trim()}
                style={{ padding: '8px 10px', borderRadius: 9, border: 'none', background: c.accentBg, color: c.accent, fontWeight: 700, fontSize: 12, cursor: localUrl.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 4, opacity: !localUrl.trim() ? 0.4 : 1, flexShrink: 0 }}>
                {figmaValidating ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Link2 size={13} />}
                {figmaValidating ? '' : 'Check'}
              </button>
            </div>

            {figmaAccessResult && (
              <div style={{ marginTop: 8 }}>
                {figmaAccessResult.hasAccess ? (
                  <div style={{ padding: '8px 11px', borderRadius: 9, background: c.greenBg, border: `1px solid ${c.greenBdr}`, display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                    <CheckCircle2 size={13} color={c.green} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 12, color: c.green, fontWeight: 700 }}>{figmaAccessResult.fileInfo?.name ?? 'Accessible'}</div>
                      {figmaAccessResult.usingProxy ? (
                        <div style={{ fontSize: 10, color: c.green, marginTop: 2 }}>⚡ via Studio Proxy</div>
                      ) : figmaAccessResult.account ? (
                        <div style={{ fontSize: 10, color: c.sub, marginTop: 2 }}>via {figmaAccessResult.account.userInfo?.name ?? figmaAccessResult.account.label}</div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '9px 11px', borderRadius: 9, background: c.redBg, border: `1px solid ${c.red}22`, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                      <AlertCircle size={13} color={c.red} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span style={{ fontSize: 11, color: c.red, lineHeight: 1.5 }}>{figmaAccessResult.error ?? 'No access'}</span>
                    </div>
                    {/* Quick-fix link for 403 / Community file errors */}
                    {figmaAccessResult.error?.includes('403') || figmaAccessResult.error?.includes('Duplicate') ? (
                      <a
                        href={localUrl || figmaLink || '#'}
                        target="_blank" rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: c.amber, textDecoration: 'none', paddingLeft: 20 }}
                      >
                        <ExternalLink size={10} /> Open file in Figma → duplicate to drafts → paste new URL
                      </a>
                    ) : figmaAccessResult.error?.includes('Connect with Figma') ? (
                      <button
                        onClick={handleOAuthConnect}
                        disabled={oauthLoading}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: c.accent, background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 20px' }}
                      >
                        <Figma size={10} /> Connect with Figma
                      </button>
                    ) : figmaAccessResult.error?.includes('Settings') ? (
                      <span style={{ fontSize: 10, color: c.amber, paddingLeft: 20 }}>
                        → Click "Connect with Figma" above or add a PAT in Settings
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            {currentProjectTheme && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: c.sub, flexWrap: 'wrap' }}>
                <Clock size={11} color={c.dim} />
                Synced {timeSince(currentProjectTheme.syncedAt)}
                {/* Proxy / Direct source badge */}
                {syncSource && (
                  <span style={{ padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: syncSource === 'proxy' ? c.greenBg : c.card, border: `1px solid ${syncSource === 'proxy' ? c.greenBdr : c.border}`, color: syncSource === 'proxy' ? c.green : c.dim }}>
                    {syncSource === 'proxy' ? '⚡ Proxy' : 'Direct'}
                  </span>
                )}
                {syncFigmaUrl && (
                  <a href={syncFigmaUrl} target="_blank" rel="noopener noreferrer"
                    style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3, color: c.accent, fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>
                    <ExternalLink size={10} /> Open
                  </a>
                )}
              </div>
            )}
          </div>

          {/* ── Actions ─────────────────────────────────────────────────── */}
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, borderBottom: `1px solid ${c.border}` }}>
            <button onClick={handleSync} disabled={syncBusy || isSyncing || !isConnected}
              style={{ width: '100%', padding: '12px', borderRadius: 11, border: `1px solid ${isConnected ? c.accentBdr : 'transparent'}`, background: isConnected ? c.accentBg : c.card, color: isConnected ? c.accent : c.dim, fontWeight: 700, fontSize: 13, cursor: isConnected ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: (syncBusy || isSyncing) ? 0.7 : 1, transition: 'all 0.2s' }}>
              {syncBusy || isSyncing
                ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Activating…</>
                : <><span style={{ fontSize: 15 }}>🪞</span> Activate Digital Twin</>}
            </button>
            <p style={{ margin: 0, fontSize: 10.5, color: c.sub, lineHeight: 1.55, textAlign: 'center' }}>
              Renders a visual clone in the Mirror tab · auto-saved to Projects
            </p>

            <button onClick={sendToStudio} disabled={!currentProjectTheme}
              style={{ width: '100%', padding: '12px', borderRadius: 11, border: 'none', background: currentProjectTheme ? c.greenBg : c.card, color: currentProjectTheme ? c.green : c.dim, fontWeight: 700, fontSize: 13, cursor: currentProjectTheme ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, transition: 'all 0.2s' }}>
              <SendHorizonal size={14} /> Confirm & Send to Studio
            </button>
            <p style={{ margin: 0, fontSize: 10, color: c.dim, lineHeight: 1.5, textAlign: 'center' }}>
              Visual match confirmed? Injects Design Token context + navigates to Engine.
            </p>
          </div>

          {/* ── Studio Context Bridge ───────────────────────────────────
               Shows how this Figma tool connects to the current studio
               project, branch, and revision lifecycle.
               Linked = wired. Partial = partial impl. Planned = not yet built.
          ─────────────────────────────────────────────────────────────── */}
          {(() => {
            const activeProj = figmaProjects.find(p => p.id === activeFigmaProjectId);
            const linkClr   = (l: 'linked'|'partial'|'planned') =>
              l === 'linked'  ? c.green  :
              l === 'partial' ? c.amber  : c.dim;
            const linkBg  = (l: 'linked'|'partial'|'planned') =>
              l === 'linked'  ? c.greenBg  :
              l === 'partial' ? c.amberBg  : 'rgba(75,75,92,0.12)';
            const linkBdr = (l: 'linked'|'partial'|'planned') =>
              l === 'linked'  ? c.greenBdr :
              l === 'partial' ? 'rgba(251,191,36,0.25)' : 'rgba(75,75,92,0.25)';
            const Badge = ({ level, label }: { level: 'linked'|'partial'|'planned'; label?: string }) => (
              <span style={{
                fontSize: 9, fontWeight: 800, color: linkClr(level),
                background: linkBg(level), border: `1px solid ${linkBdr(level)}`,
                padding: '1px 6px', borderRadius: 12,
                textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0,
              }}>
                {label ?? level}
              </span>
            );
            const Row = ({ label, value, level }: { label: string; value: string; level: 'linked'|'partial'|'planned' }) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', borderBottom: `1px solid ${c.border}` }}>
                <span style={{ fontSize: 10, color: c.dim, width: 72, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 11, color: c.txt, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
                <Badge level={level} />
              </div>
            );
            return (
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${c.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: c.dim, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>
                  Studio Context
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <Row
                    label="Project"
                    value={activeProj ? activeProj.name : 'None linked'}
                    level={activeProj ? 'linked' : 'partial'}
                  />
                  <Row
                    label="Branch"
                    value="main"
                    level="partial"
                  />
                  <Row
                    label="On Send"
                    value={currentProjectTheme ? 'Creates Revision draft' : 'No sync data'}
                    level="planned"
                  />
                  <Row
                    label="Revisions"
                    value="UI not yet built"
                    level="planned"
                  />
                </div>
                {!activeProj && (
                  <div style={{ marginTop: 8, fontSize: 10, color: c.dim, lineHeight: 1.5 }}>
                    Activate a Figma project above to link it to the Studio session.
                    Full branch + revision linking is <span style={{ color: c.amber }}>planned</span>.
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Cultural Audit ─────────────────────────────────────────── */}
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${c.border}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: c.dim, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Cultural Audit</div>
            <div>
              <div style={{ fontSize: 10, color: c.sub, marginBottom: 5, fontWeight: 600 }}>Target Market</div>
              <div style={{ display: 'flex', gap: 5 }}>
                {(['USA', 'EU', 'GLOBAL'] as TargetMarket[]).map(m => (
                  <button key={m} onClick={() => setTargetMarket(m)}
                    style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: `1px solid ${targetMarket === m ? c.accentBdr : c.border}`, background: targetMarket === m ? c.accentBg : 'transparent', color: targetMarket === m ? c.accent : c.sub, fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: '0.15s' }}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: c.sub, marginBottom: 5, fontWeight: 600 }}>Strictness</div>
              <div style={{ display: 'flex', gap: 5 }}>
                {(['loose', 'normal', 'strict'] as AuditStrictness[]).map(s => (
                  <button key={s} onClick={() => setAuditStrictness(s)}
                    style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: `1px solid ${auditStrictness === s ? c.accentBdr : c.border}`, background: auditStrictness === s ? c.accentBg : 'transparent', color: auditStrictness === s ? c.accent : c.sub, fontSize: 11, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize', transition: '0.15s' }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Progress ──────────────────────────────────────────────── */}
          {syncProgress.step !== 'idle' && (
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${c.border}` }}>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 8 }}>
                {STEPS.map(({ id, label }) => {
                  const i      = stepOrder.indexOf(id);
                  const done   = i < curIdx || syncProgress.step === 'done';
                  const active = id === syncProgress.step;
                  return (
                    <span key={id} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, fontWeight: 700, background: active ? c.accentBg : done ? c.greenBg : c.card, color: active ? c.accent : done ? c.green : c.dim, border: `1px solid ${active ? c.accentBdr : done ? c.greenBdr : 'transparent'}` }}>
                      {done && !active ? '✓ ' : ''}{label}
                    </span>
                  );
                })}
                {syncProgress.step === 'error' && (
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, fontWeight: 700, background: c.redBg, color: c.red, border: `1px solid ${c.red}33` }}>✕ Error</span>
                )}
              </div>
              <div style={{ height: 3, borderRadius: 3, background: c.card, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ height: '100%', borderRadius: 3, width: `${syncProgress.pct}%`, transition: 'width 0.4s ease', background: syncProgress.step === 'error' ? c.red : syncProgress.step === 'done' ? c.green : c.accent }} />
              </div>
              <p style={{ margin: 0, fontSize: 11, color: syncProgress.step === 'error' ? c.red : syncProgress.step === 'done' ? c.green : c.sub, lineHeight: 1.4 }}>
                {syncProgress.message}
              </p>
            </div>
          )}

          {/* ── Activity log ──────────────────────────────────────────── */}
          {activityLog.length > 0 && (
            <div style={{ padding: '0 16px 16px' }}>
              <button onClick={() => setShowActivity(p => !p)}
                style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: c.sub, fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                <Activity size={12} color={c.dim} />
                Activity ({activityLog.length})
                <span style={{ marginLeft: 2, fontSize: 10 }}>{showActivity ? '▲' : '▼'}</span>
              </button>
              {showActivity && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {activityLog.slice(0, 5).map((e, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '7px 10px', borderRadius: 9, background: c.card, border: `1px solid ${c.border}` }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: e.ok ? c.green : c.red, flexShrink: 0, marginTop: 4 }} />
                      <div>
                        <div style={{ fontSize: 11, color: c.txt }}>{e.msg}</div>
                        <div style={{ fontSize: 10, color: c.sub, marginTop: 1 }}>{timeSince(e.ts)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ══ RIGHT PANEL ══════════════════════════════════════════════════ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Tab bar */}
          <div style={{ height: 46, flexShrink: 0, background: c.panel, borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', gap: 4, padding: '0 16px' }}>
            {(Object.keys(TAB_LABELS) as RightTab[]).map(tab => (
              <button key={tab} onClick={() => setRightTab(tab)}
                style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: rightTab === tab ? c.accentBg : 'transparent', color: rightTab === tab ? c.accent : c.sub, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: '0.15s', borderBottom: rightTab === tab ? `2px solid ${c.accent}` : '2px solid transparent' }}>
                {TAB_LABELS[tab]}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            {/* Mirror-only controls: Layers + Optimize + Re-Sync */}
            {rightTab === 'mirror' && (
              <>
                {(currentProjectTheme?.visualNodes?.length ?? 0) > 0 && (
                  <>
                    <button
                      onClick={() => setShowLayers(p => !p)}
                      title="Toggle Layers Panel"
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, border: `1px solid ${showLayers ? c.accentBdr : c.border}`, background: showLayers ? c.accentBg : 'transparent', color: showLayers ? c.accent : c.sub, fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: '0.15s' }}>
                      <Layers size={12} /> Layers
                    </button>
                    <button
                      onClick={() => runProAudit(currentProjectTheme?.visualNodes ?? [])}
                      disabled={proAnalyzing}
                      title="Re-run Pro-Audit to clean noise and focus viewport"
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, border: `1px solid ${c.border}`, background: 'transparent', color: proAnalyzing ? c.dim : c.accent, fontSize: 11, fontWeight: 700, cursor: proAnalyzing ? 'not-allowed' : 'pointer', transition: '0.15s', opacity: proAnalyzing ? 0.6 : 1 }}>
                      {proAnalyzing
                        ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                        : <Sparkles size={12} />}
                      Optimize
                    </button>
                  </>
                )}
                {currentProjectTheme && isConnected && (
                  <button
                    onClick={handleReSync}
                    disabled={syncBusy || isSyncing}
                    title="Re-fetch fresh data from Figma source and re-render Mirror"
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, border: `1px solid ${(syncBusy || isSyncing) ? c.border : c.greenBdr}`, background: 'transparent', color: (syncBusy || isSyncing) ? c.dim : c.green, fontSize: 11, fontWeight: 700, cursor: (syncBusy || isSyncing) ? 'not-allowed' : 'pointer', transition: '0.15s', opacity: (syncBusy || isSyncing) ? 0.5 : 1 }}>
                    <RefreshCw size={12} style={(isReSyncing && (syncBusy || isSyncing)) ? { animation: 'spin 1s linear infinite' } : undefined} />
                    Re-Sync
                  </button>
                )}
              </>
            )}
          </div>

          {/* Re-Sync step indicator — shown while a re-sync is in progress */}
          {isReSyncing && (syncBusy || isSyncing) && (
            <div style={{ flexShrink: 0, padding: '6px 16px', background: c.accentBg, borderBottom: `1px solid ${c.accentBdr}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <RefreshCw size={12} color={c.accent} style={{ flexShrink: 0, animation: 'spin 1s linear infinite' }} />
              <span style={{ flex: 1, fontSize: 11, color: c.accent, fontWeight: 600 }}>
                {['checking', 'scraping'].includes(syncProgress.step)
                  ? 'Re-syncing with Figma source… Step 1/3 (fetching styles)'
                  : syncProgress.step === 'deep-scraping'
                  ? 'Re-syncing with Figma source… Step 2/3 (geometry scan)'
                  : 'Re-syncing with Figma source… Step 3/3 (injecting context)'}
              </span>
            </div>
          )}

          {/* Pro-Audit summary bar — shown on Mirror tab when proSummary is set */}
          {proSummary && rightTab === 'mirror' && (
            <div style={{ flexShrink: 0, padding: '6px 16px', background: c.amberBg, borderBottom: `1px solid ${c.amber}33`, display: 'flex', alignItems: 'center', gap: 8 }}>
              {proAnalyzing
                ? <Loader2 size={12} color={c.amber} style={{ flexShrink: 0, animation: 'spin 1s linear infinite' }} />
                : <Activity size={12} color={c.amber} style={{ flexShrink: 0 }} />}
              <span style={{ flex: 1, fontSize: 11, color: c.amber, lineHeight: 1.4 }}>{proSummary}</span>
              {!proAnalyzing && (
                <button onClick={() => setProSummary('')}
                  style={{ background: 'none', border: 'none', color: c.amber, cursor: 'pointer', display: 'flex', padding: 2, opacity: 0.7, flexShrink: 0 }}>
                  <X size={12} />
                </button>
              )}
            </div>
          )}

          {/* Tab content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {rightTab === 'mirror' && (
              <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {showLayers && (
                  <LayersPanel
                    nodes={currentProjectTheme?.visualNodes ?? []}
                    highlightedId={highlightedNodeId}
                    excludeIds={proExcludeIds}
                    onSelect={id => setHighlightedNodeId(prev => prev === id ? null : id)}
                    c={c}
                    mappedNodeIds={new Set(componentMappings.map(m => m.nodeId))}
                    mappingByNodeId={new Map(componentMappings.map(m => [m.nodeId, m]))}
                  />
                )}
                <MirrorErrorBoundary c={c}>
                  <MirrorCanvas
                    nodes={currentProjectTheme?.visualNodes ?? []}
                    c={c}
                    themeName={theme}
                    excludeIds={proExcludeIds}
                    highlightedId={highlightedNodeId}
                    onNodeClick={n => setHighlightedNodeId(prev => prev === n.id ? null : n.id)}
                    focusFrameId={focusFrameId}
                    componentMappings={componentMappings}
                  />
                </MirrorErrorBoundary>
              </div>
            )}
            {rightTab === 'tokens' && (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <TokensPanel theme={currentProjectTheme} c={c} themeName={theme} targetMarket={targetMarket} auditStrictness={auditStrictness} figmaName={figmaAccessResult?.fileInfo?.name} />
              </div>
            )}
            {rightTab === 'export' && (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <ExportPanel files={files} theme={currentProjectTheme} syncUrl={syncFigmaUrl} c={c} />
              </div>
            )}
            {rightTab === 'audit' && (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <AuditPanel
                  nodes={currentProjectTheme?.visualNodes ?? []}
                  theme={currentProjectTheme}
                  apiKey={apiKey}
                  model={selectedModel}
                  fileKey={figmaAccessResult?.fileInfo?.key ?? currentProjectTheme?.figmaFileKey}
                  token={figmaAccessResult?.account?.token}
                  onRefresh={handleSync}
                  c={c}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};
