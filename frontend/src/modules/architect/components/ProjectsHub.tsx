/**
 * ProjectsHub — Projects Hub for Architect Module
 *
 * Project card actions:
 *   PRIMARY (always visible):
 *     Open       → load + navigate to engine        [working]
 *     Continue   → same as Open (alias)             [working]
 *
 *   CONTEXT MENU (⋯ dropdown):
 *     Rename     → inline edit title                [working]
 *     Duplicate  → clone project                   [working]
 *     Archive    → status toggle                   [partial — no archive view]
 *     Export     → download project JSON           [partial — basic JSON dump]
 *     Delete     → remove from store               [working]
 *
 *   ICON TRAY (bottom of card):
 *     🕐 History    — open revision history        [planned]
 *     ✓ Last Good   — restore last good snapshot   [planned]
 *     🌿 Branches   — show project branches        [planned]
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  FolderOpen, Play, MoreHorizontal, Pencil, Copy, Archive,
  Trash2, Download, Plus, Search,
} from 'lucide-react';
import { ProjectExportService }  from '../../../services/ProjectExportService';

// ── Project shape (matches useStudio projects) ────────────────────────────────
export interface StudioProject {
  id: string;
  title: string;
  name?: string;   // alias for title in some contexts
  description?: string;
  status?: 'active' | 'archived';
  createdAt?: string | number;
  updatedAt?: string | number;
  files?: Record<string, string>;
}

interface ProjectsHubProps {
  theme: 'dark' | 'medium' | 'light';
  projects: StudioProject[];
  currentProjectId: string | null;
  onLoadProject: (project: StudioProject) => void;
  onNavigateEngine: () => void;
  projectFiles?: Record<string, string>;
  onViewDetails?: (project: StudioProject) => void;
}

const SHADCN_ITEMS = [
  'Button','Card','Input','Badge','Dialog','Select',
  'Progress','Tabs','Sheet','Switch','Textarea','Label',
  'Separator','Skeleton','Toast','Table','DropdownMenu',
];

interface ActiveStats {
  totalFiles: number;
  totalLines: number;
  pages: number;
  components: number;
  contexts: number;
  hooks: number;
  shadcnUsed: string[];
}

// ── Theme tokens ──────────────────────────────────────────────────────────────
function useTheme(theme: 'dark' | 'medium' | 'light') {
  const isDark = theme !== 'light';
  return {
    bg:       isDark ? '#07070b'                    : '#f9fafb',
    panel:    isDark ? 'rgba(255,255,255,0.025)'    : '#ffffff',
    border:   isDark ? 'rgba(255,255,255,0.07)'     : 'rgba(0,0,0,0.08)',
    borderMd: isDark ? 'rgba(255,255,255,0.12)'     : 'rgba(0,0,0,0.12)',
    txt:      isDark ? '#e5e5ea'                    : '#111827',
    sub:      isDark ? '#6b6b7a'                    : '#6b7280',
    dim:      isDark ? '#3a3a4a'                    : '#d1d5db',
    input:    isDark ? '#111116'                    : '#f3f4f6',
    card:     isDark ? 'rgba(255,255,255,0.03)'     : '#ffffff',
    cardHov:  isDark ? 'rgba(255,255,255,0.06)'     : '#f3f4f6',
    accent:   isDark ? '#a78bfa'                    : '#7c3aed',
    accentBg: isDark ? 'rgba(167,139,250,0.12)'     : 'rgba(124,58,237,0.08)',
    accentBr: isDark ? 'rgba(167,139,250,0.28)'     : 'rgba(124,58,237,0.25)',
    green:    isDark ? '#4ade80'                    : '#16a34a',
    greenBg:  isDark ? 'rgba(74,222,128,0.10)'      : 'rgba(22,163,74,0.08)',
    amber:    isDark ? '#fbbf24'                    : '#d97706',
    amberBg:  isDark ? 'rgba(251,191,36,0.10)'      : 'rgba(217,119,6,0.08)',
    red:      isDark ? '#ef4444'                    : '#dc2626',
    redBg:    isDark ? 'rgba(239,68,68,0.08)'       : 'rgba(220,38,38,0.06)',
    menu:     isDark ? '#1a1a24'                    : '#ffffff',
    menuSh:   isDark ? '0 8px 24px rgba(0,0,0,0.5)': '0 8px 24px rgba(0,0,0,0.15)',
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(ts: string | number | undefined): string {
  if (!ts) return '—';
  const d = new Date(typeof ts === 'number' ? ts : ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fileCount(p: StudioProject): number {
  return Object.keys(p.files ?? {}).length;
}

// ── Planned badge ─────────────────────────────────────────────────────────────
const PlannedBadge: React.FC<{ label?: string; level?: 'planned' | 'partial' }> = ({
  label = 'planned', level = 'planned',
}) => {
  const clr = level === 'partial' ? '#fbbf24' : '#4b4b5c';
  const bg  = level === 'partial' ? 'rgba(251,191,36,0.12)' : 'rgba(75,75,92,0.18)';
  const bdr = level === 'partial' ? 'rgba(251,191,36,0.25)' : 'rgba(75,75,92,0.30)';
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, color: clr,
      background: bg, border: `1px solid ${bdr}`,
      padding: '1px 5px', borderRadius: 12,
      textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>
      {label}
    </span>
  );
};

// ── Context menu ──────────────────────────────────────────────────────────────
interface ContextMenuProps {
  c: ReturnType<typeof useTheme>;
  onRename: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onExport: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  c, onRename, onDuplicate, onArchive, onExport, onDelete, onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const Item: React.FC<{
    icon: React.ReactNode;
    label: string;
    badge?: React.ReactNode;
    danger?: boolean;
    onClick: () => void;
  }> = ({ icon, label, badge, danger, onClick }) => (
    <button
      onClick={() => { onClick(); onClose(); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', padding: '8px 13px', border: 'none', background: 'transparent',
        color: danger ? c.red : c.txt, fontSize: 12, fontWeight: 500,
        cursor: 'pointer', textAlign: 'left', transition: '0.12s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = danger ? c.redBg : c.cardHov)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      {badge}
    </button>
  );

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 32, right: 0, zIndex: 100,
      background: c.menu, border: `1px solid ${c.border}`,
      borderRadius: 12, boxShadow: c.menuSh,
      minWidth: 185, overflow: 'hidden',
      padding: '4px 0',
    }}>
      <Item icon={<Pencil size={13} />}  label="Rename"    onClick={onRename} />
      <Item icon={<Copy size={13} />}    label="Duplicate"  onClick={onDuplicate} />
      <div style={{ height: 1, background: c.border, margin: '3px 0' }} />
      <Item
        icon={<Archive size={13} />}
        label="Archive"
        badge={<PlannedBadge level="partial" label="partial" />}
        onClick={onArchive}
      />
      <Item
        icon={<Download size={13} />}
        label="Export ZIP"
        onClick={onExport}
      />
      <div style={{ height: 1, background: c.border, margin: '3px 0' }} />
      <Item icon={<Trash2 size={13} />}  label="Delete"    danger onClick={onDelete} />
    </div>
  );
};

// ── Project card ──────────────────────────────────────────────────────────────
interface ProjectCardProps {
  project: StudioProject;
  isActive: boolean;
  theme: 'dark' | 'medium' | 'light';
  c: ReturnType<typeof useTheme>;
  onOpen: () => void;
  onViewDetails?: () => void;
  onRename: (id: string, newTitle: string) => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onExport: (id: string) => void;
  onDelete: (id: string) => void;
  activeStats?: ActiveStats;
}

const ProjectCard: React.FC<ProjectCardProps> = ({
  project, isActive, c, onOpen, onViewDetails,
  onRename, onDuplicate, onArchive, onExport, onDelete, activeStats,
}) => {
  const [menuOpen,   setMenuOpen]   = useState(false);
  const [renaming,   setRenaming]   = useState(false);
  const [renameVal,  setRenameVal]  = useState(project.title || (project as any).name || '');
  const [hovered,    setHovered]    = useState(false);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (renaming) renameRef.current?.select(); }, [renaming]);

  const commitRename = () => {
    const v = renameVal.trim();
    if (v && v !== (project.title || (project as any).name)) onRename(project.id, v);
    setRenaming(false);
  };

  const isArchived = project.status === 'archived';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        borderRadius: 14,
        border: `1px solid ${isActive ? c.accentBr : hovered ? c.borderMd : c.border}`,
        background: isActive ? c.accentBg : hovered ? c.cardHov : c.card,
        padding: '14px 15px 12px',
        transition: 'all 0.16s',
        opacity: isArchived ? 0.55 : 1,
      }}
    >
      {/* ── Title row ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <FolderOpen size={14} color={isActive ? c.accent : c.sub} style={{ marginTop: 2, flexShrink: 0 }} />

        {renaming ? (
          <input
            ref={renameRef}
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false); }}
            onBlur={commitRename}
            style={{
              flex: 1, background: c.input, border: `1px solid ${c.accentBr}`,
              borderRadius: 7, padding: '3px 8px', fontSize: 13, fontWeight: 600,
              color: c.txt, outline: 'none',
            }}
          />
        ) : (
          <span style={{
            flex: 1, fontSize: 13, fontWeight: 700, color: isActive ? c.accent : c.txt,
            lineHeight: 1.3, wordBreak: 'break-word',
          }}>
            {project.title || (project as any).name || 'Untitled'}
          </span>
        )}

        {/* ⋯ menu button */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
            style={{
              padding: '3px 5px', borderRadius: 7, border: 'none',
              background: menuOpen ? c.dim : 'transparent',
              color: c.sub, cursor: 'pointer', display: 'flex', alignItems: 'center',
              opacity: hovered || menuOpen ? 1 : 0, transition: '0.12s',
            }}
          >
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <ContextMenu
              c={c}
              onRename={() => setRenaming(true)}
              onDuplicate={() => onDuplicate(project.id)}
              onArchive={() => onArchive(project.id)}
              onExport={() => onExport(project.id)}
              onDelete={() => onDelete(project.id)}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </div>

      {/* ── Meta ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingLeft: 22 }}>
        <span style={{ fontSize: 10, color: c.sub }}>
          {fileCount(project)} {fileCount(project) === 1 ? 'file' : 'files'}
        </span>
        {project.updatedAt && (
          <>
            <span style={{ fontSize: 10, color: c.dim }}>·</span>
            <span style={{ fontSize: 10, color: c.sub }}>{fmtDate(project.updatedAt)}</span>
          </>
        )}
        {isArchived && (
          <PlannedBadge label="archived" level="partial" />
        )}
        {isActive && (
          <span style={{
            fontSize: 9, fontWeight: 800, color: c.accent,
            background: c.accentBg, border: `1px solid ${c.accentBr}`,
            padding: '1px 6px', borderRadius: 12, textTransform: 'uppercase',
          }}>
            Active
          </span>
        )}
      </div>

      {/* ── Primary action buttons ── */}
      <div style={{ display: 'flex', gap: 6, paddingLeft: 22, marginBottom: 10 }}>
        <button
          onClick={() => onViewDetails ? onViewDetails() : onOpen()}
          style={{
            flex: 1, padding: '7px 0', borderRadius: 9,
            border: `1px solid ${c.accentBr}`, background: c.accentBg,
            color: c.accent, fontSize: 11, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}
        >
          <Play size={11} fill={c.accent} stroke="none" /> Просмотр
        </button>
        <button
          onClick={onOpen}
          style={{
            flex: 1, padding: '7px 0', borderRadius: 9,
            border: `1px solid ${c.border}`, background: 'transparent',
            color: c.sub, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}
        >
          <FolderOpen size={11} /> В Студию
        </button>
      </div>

      {/* ── Enhanced stats (active project only) ── */}
      {isActive && activeStats && (
        <div style={{
          paddingLeft: 22, paddingTop: 10,
          borderTop: `1px solid ${c.border}`,
        }}>
          {/* Files + lines */}
          <div style={{ fontSize: 11, color: c.sub, marginBottom: 7 }}>
            <span style={{ color: c.txt, fontWeight: 600 }}>{activeStats.totalFiles}</span> files
            {' · '}
            <span style={{ color: c.txt, fontWeight: 600 }}>{activeStats.totalLines.toLocaleString()}</span> lines
          </div>

          {/* Grid: pages / components / contexts / hooks */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginBottom: 8 }}>
            {[
              { label: 'Pages',      val: activeStats.pages },
              { label: 'Components', val: activeStats.components },
              { label: 'Contexts',   val: activeStats.contexts },
              { label: 'Hooks',      val: activeStats.hooks },
            ].map(({ label, val }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                <span style={{ color: c.sub }}>{label}</span>
                <span style={{ color: val > 0 ? c.txt : c.dim, fontWeight: 600 }}>{val}</span>
              </div>
            ))}
          </div>

          {/* shadcn tags */}
          {activeStats.shadcnUsed.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {activeStats.shadcnUsed.map(name => (
                <span key={name} style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 8,
                  background: c.accentBg, border: `1px solid ${c.accentBr}`, color: c.accent,
                }}>
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Footer: Last updated ── */}
      <div style={{
        paddingLeft: 22, paddingTop: 6,
        borderTop: isActive && activeStats ? 'none' : `1px solid ${c.border}`,
      }}>
        <span style={{ fontSize: 10, color: c.dim }}>
          Last updated: {fmtDate(project.updatedAt) !== '—' ? fmtDate(project.updatedAt) : new Date().toLocaleDateString()}
        </span>
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
export const ProjectsHub: React.FC<ProjectsHubProps> = ({
  theme, projects, currentProjectId, onLoadProject, onNavigateEngine, projectFiles = {}, onViewDetails,
}) => {
  const c = useTheme(theme);

  // Compute real stats from bridge files (for the active project card)
  const activeStats: ActiveStats | undefined = React.useMemo(() => {
    const fileList = Object.keys(projectFiles);
    if (fileList.length === 0) return undefined;
    const allCode   = Object.values(projectFiles).join('\n');
    return {
      totalFiles: fileList.length,
      totalLines: Object.values(projectFiles).reduce((sum, code) => sum + code.split('\n').length, 0),
      pages:      fileList.filter(f => f.startsWith('pages/')).length,
      components: fileList.filter(f => f.startsWith('components/')).length,
      contexts:   fileList.filter(f => f.startsWith('contexts/')).length,
      hooks:      fileList.filter(f => f.startsWith('hooks/')).length,
      shadcnUsed: SHADCN_ITEMS.filter(c =>
        allCode.includes(`from '@/components/ui/${c.toLowerCase()}'`) ||
        allCode.includes(`<${c}`)
      ),
    };
  }, [projectFiles]);

  const [search,      setSearch]      = useState('');
  const [filterState, setFilterState] = useState<'all' | 'active' | 'archived'>('all');
  // Local copy for optimistic mutations (rename, archive, duplicate)
  const [localProjects, setLocalProjects] = useState<StudioProject[]>(projects);

  // Sync if parent changes (e.g. after external load)
  useEffect(() => { setLocalProjects(projects); }, [projects]);

  const handleOpen = (p: StudioProject) => {
    onLoadProject(p);
    onNavigateEngine();
  };

  const handleRename = (id: string, newTitle: string) => {
    setLocalProjects(prev => prev.map(p => p.id === id ? { ...p, title: newTitle } : p));
    // TODO: persist via studio.updateProject when available
  };

  const handleDuplicate = (id: string) => {
    const src = localProjects.find(p => p.id === id);
    if (!src) return;
    const clone: StudioProject = {
      ...src,
      id: `${id}_copy_${Date.now()}`,
      title: `${src.title} (copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'active',
    };
    setLocalProjects(prev => [clone, ...prev]);
    // TODO: persist via studio.addProject when available
  };

  const handleArchive = (id: string) => {
    setLocalProjects(prev =>
      prev.map(p => p.id === id
        ? { ...p, status: p.status === 'archived' ? 'active' : 'archived' }
        : p
      )
    );
    // TODO: persist via studio.updateProject — archive view not yet built [partial]
  };

  const handleExport = (id: string) => {
    const p = localProjects.find(x => x.id === id);
    if (!p) return;
    if (p.files && Object.keys(p.files).length > 0) {
      ProjectExportService.downloadProjectZip(p.files, {
        projectId:   p.id,
        projectName: p.title,
      });
    } else {
      // Fallback: export project metadata as JSON when no source files are loaded
      const json = JSON.stringify(p, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `project-${(p.title ?? '').replace(/\s+/g, '-').toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this project? This cannot be undone.')) return;
    setLocalProjects(prev => prev.filter(p => p.id !== id));
    // TODO: persist via studio.deleteProject when available
  };

  const filtered = localProjects.filter(p => {
    const matchSearch = (p.title || (p as any).name || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterState === 'all'
      ? true
      : filterState === 'active'
        ? p.status !== 'archived'
        : p.status === 'archived';
    return matchSearch && matchStatus;
  });

  const isDark = theme !== 'light';
  const hdr    = isDark ? '#5a5a6a'  : '#9ca3af';
  const filt   = isDark ? '#3a3a4a'  : '#e5e7eb';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%', overflow: 'hidden' }}>

      {/* ── Header bar ── */}
      <div style={{
        padding: '16px 20px 12px',
        borderBottom: `1px solid ${c.border}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: hdr, textTransform: 'uppercase', letterSpacing: '0.11em', flex: 1 }}>
          Projects Hub
        </span>
        <span style={{ fontSize: 11, color: c.sub }}>
          {localProjects.length} project{localProjects.length !== 1 ? 's' : ''}
        </span>
        <button
          title="New project (planned)"
          disabled
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '5px 10px', borderRadius: 8,
            border: `1px solid ${c.dim}44`, background: 'transparent',
            color: c.dim, fontSize: 11, fontWeight: 600, cursor: 'not-allowed',
          }}
        >
          <Plus size={12} /> New
        </button>
      </div>

      {/* ── Filter + search bar ── */}
      <div style={{ padding: '10px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', gap: 8 }}>
        {/* Search */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 7,
          background: c.input, border: `1px solid ${c.border}`,
          borderRadius: 9, padding: '6px 10px',
        }}>
          <Search size={12} color={c.sub} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search projects…"
            style={{
              flex: 1, background: 'transparent', border: 'none',
              color: c.txt, fontSize: 12, outline: 'none',
            }}
          />
        </div>

        {/* Filter pill */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'active', 'archived'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterState(f)}
              style={{
                padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                border: `1px solid ${filterState === f ? c.accentBr : c.border}`,
                background: filterState === f ? c.accentBg : 'transparent',
                color: filterState === f ? c.accent : c.sub, cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* ── Cards grid ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: c.sub }}>
            <FolderOpen size={32} color={c.dim} style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>No projects found</div>
            <div style={{ fontSize: 11 }}>
              {search ? 'Try a different search term.' : 'Start a new project from the Engine or Dashboard.'}
            </div>
          </div>
        ) : (
          filtered.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              isActive={p.id === currentProjectId}
              theme={theme}
              c={c}
              onOpen={() => handleOpen(p)}
              onViewDetails={onViewDetails ? () => onViewDetails(p) : undefined}
              onRename={handleRename}
              onDuplicate={handleDuplicate}
              onArchive={handleArchive}
              onExport={handleExport}
              onDelete={handleDelete}
              activeStats={p.id === currentProjectId ? activeStats : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
};
