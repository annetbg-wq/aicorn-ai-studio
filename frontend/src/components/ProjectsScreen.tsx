/**
 * ProjectsScreen — two-column project browser with detail tabs.
 * Left: scrollable project list (30%).  Right: detail view with Overview/Prompt/Logs/Code tabs (70%).
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Plus, Trash2, Search, FolderOpen, Copy, Check, FileCode2 } from 'lucide-react';
import { ProjectStorage } from '../services/ProjectStorage';
import type { StoredProject, ProjectRevision } from '../services/ProjectStorage';

// ── Helpers ────────────────────────────────────────────────────────────────

const THEME_COLORS: Record<string, string> = {
  'dark-slate': '#0ea5e9',
  'trust':      '#2563eb',
  'warm':       '#f97316',
  'neon':       '#22c55e',
  'bloom':      '#f43f5e',
};

const THEME_GRADIENTS: Record<string, string> = {
  'dark-slate': 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0ea5e9 100%)',
  'trust':      'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 50%, #93c5fd 100%)',
  'warm':       'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fbbf24 100%)',
  'neon':       'linear-gradient(135deg, #10b981 0%, #22c55e 50%, #4ade80 100%)',
  'bloom':      'linear-gradient(135deg, #f43f5e 0%, #fb7185 50%, #fda4af 100%)',
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1)  return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `${diffH}h ago`;
  return d.toLocaleDateString('en', { day: 'numeric', month: 'short' });
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('en', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

// ── Copy button helper ─────────────────────────────────────────────────────

const CopyBtn: React.FC<{ text: string; isDark: boolean }> = ({ text, isDark }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
      background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
      border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
      color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
      cursor: 'pointer',
    }}>
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
};

// ── Badge helper ───────────────────────────────────────────────────────────

const Badge: React.FC<{ label: string; color?: string; isDark: boolean }> = ({ label, color, isDark }) => (
  <span style={{
    display: 'inline-block',
    padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600,
    background: color ? `${color}22` : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
    color: color ?? (isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)'),
    border: `1px solid ${color ? `${color}33` : 'transparent'}`,
  }}>
    {label}
  </span>
);

// ── Props ──────────────────────────────────────────────────────────────────

interface ProjectsScreenProps {
  projects:          any[];
  currentProjectId:  string | null;
  onLoadProject:     (p: any) => void;
  onDeleteProject:   (id: string) => void;
  onNewProject:      () => void;
  onRefreshProjects?: () => void;
  theme:             'dark' | 'medium' | 'light';
}

// ── Component ──────────────────────────────────────────────────────────────

export const ProjectsScreen: React.FC<ProjectsScreenProps> = ({
  projects, currentProjectId, onLoadProject, onDeleteProject, onNewProject, onRefreshProjects, theme,
}) => {
  const isDark = theme !== 'light';
  const bg     = isDark ? '#07070b' : '#f5f5f5';
  const panelBg = isDark ? 'rgba(255,255,255,0.02)' : '#ffffff';
  const bdr    = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';
  const txt    = isDark ? 'rgba(255,255,255,0.85)' : '#111';
  const sub    = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)';

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(() => currentProjectId ?? null);
  const [selectedProject, setSelectedProject] = useState<StoredProject | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'prompt' | 'history' | 'logs' | 'code'>('overview');
  const [openFile, setOpenFile] = useState<string | null>(null);

  // Load full project when selection changes
  useEffect(() => {
    if (!selectedId) { setSelectedProject(null); return; }
    const full = ProjectStorage.getProject(selectedId);
    setSelectedProject(full ?? null);
    setOpenFile(null);
    setDetailTab('overview');
  }, [selectedId]);

  const filtered = useMemo(() => {
    if (!query.trim()) return projects;
    const q = query.toLowerCase();
    return projects.filter((p: any) =>
      (p.name ?? '').toLowerCase().includes(q) ||
      (p.description ?? '').toLowerCase().includes(q),
    );
  }, [projects, query]);

  // Sync selectedId when currentProjectId changes externally
  useEffect(() => {
    if (currentProjectId && !selectedId) setSelectedId(currentProjectId);
  }, [currentProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = useCallback((id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    onDeleteProject(id);
    if (selectedId === id) {
      setSelectedId(null);
      setSelectedProject(null);
    }
  }, [selectedId, onDeleteProject]);

  // ── Tab button helper ──────────────────────────────────────────────────────

  const TabBtn: React.FC<{ id: typeof detailTab; label: string }> = ({ id, label }) => (
    <button
      onClick={() => setDetailTab(id)}
      style={{
        padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
        border: 'none', cursor: 'pointer',
        background: detailTab === id
          ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)')
          : 'transparent',
        color: detailTab === id ? (txt as string) : (sub as string),
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ flex: 1, height: '100%', background: bg, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '28px 32px 0', borderBottom: `1px solid ${bdr}`, paddingBottom: 20,
        gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: txt, margin: 0 }}>Projects</h1>
          <p style={{ fontSize: 12, color: sub, marginTop: 4 }}>
            {projects.length} project{projects.length !== 1 ? 's' : ''} · stored locally
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
            border: `1px solid ${bdr}`, borderRadius: 10, padding: '7px 12px',
          }}>
            <Search size={13} color={sub as string} />
            <input
              value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search projects…"
              style={{
                background: 'none', border: 'none', outline: 'none',
                color: txt as string, fontSize: 12, width: 160,
              }}
            />
          </div>
          <button onClick={onNewProject} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 10,
            background: '#3b82f6', color: '#fff',
            border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            boxShadow: '0 4px 16px rgba(59,130,246,0.3)',
          }}>
            <Plus size={14} /> New Project
          </button>
        </div>
      </div>

      {/* Two-column body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT: project list (30%) ────────────────────────────────────── */}
        <div style={{
          width: '30%', minWidth: 240, maxWidth: 360,
          borderRight: `1px solid ${bdr}`,
          overflowY: 'auto', padding: '12px 8px',
        }}>
          {filtered.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: 200, gap: 12,
            }}>
              <FolderOpen size={36} color={sub as string} strokeWidth={1.2} />
              <p style={{ fontSize: 12, color: sub as string, textAlign: 'center' }}>
                {query ? 'No projects match' : 'No projects yet'}
              </p>
            </div>
          ) : (
            filtered.map((p: any) => (
              <div
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                style={{
                  padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                  background: selectedId === p.id
                    ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)')
                    : 'transparent',
                  borderLeft: selectedId === p.id
                    ? '3px solid #6366f1' : '3px solid transparent',
                  transition: 'all 0.15s',
                  marginBottom: 2,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: THEME_COLORS[p.theme] ?? '#6366f1',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 500, color: txt as string,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {p.name || 'Untitled'}
                    </div>
                    <div style={{
                      fontSize: 11, color: sub as string,
                      display: 'flex', gap: 6, marginTop: 2,
                    }}>
                      <span>{formatTime(p.updatedAt)}</span>
                      {p.generationMode && (
                        <span style={{ opacity: 0.6 }}>{p.generationMode}</span>
                      )}
                      {p.source && p.source !== 'chat' && (
                        <span style={{ color: '#6366f1', fontSize: 10 }}>
                          {p.source === 'weekly-feed' ? '\u26A1 idea' : '\uD83D\uDCC8 niche'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── RIGHT: detail view (70%) ───────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
          {!selectedProject ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '100%', gap: 12,
            }}>
              <FolderOpen size={48} color={sub as string} strokeWidth={1} />
              <p style={{ fontSize: 13, color: sub as string }}>Select a project to view details</p>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
                <TabBtn id="overview" label="Overview" />
                <TabBtn id="prompt"  label="Prompt" />
                <TabBtn id="history" label="History" />
                <TabBtn id="logs"    label="Logs" />
                <TabBtn id="code"    label="Code" />
              </div>

              {/* ── Overview tab ──────────────────────────────────────────── */}
              {detailTab === 'overview' && (
                <div>
                  {/* Preview — live iframe for active project, gradient for others */}
                  {selectedProject.id === currentProjectId ? (
                    <div style={{
                      width: '100%', height: 180, borderRadius: 14, overflow: 'hidden',
                      position: 'relative', marginBottom: 20,
                      background: isDark ? '#111' : '#f0f0f0',
                    }}>
                      <iframe
                        src="http://localhost:3100"
                        style={{
                          width: 960, height: 720, border: 'none',
                          transform: 'scale(0.208)', transformOrigin: '0 0',
                          pointerEvents: 'none',
                        }}
                        title="preview"
                      />
                      <div style={{
                        position: 'absolute', inset: 0, cursor: 'pointer',
                      }} onClick={() => onLoadProject(selectedProject)} />
                    </div>
                  ) : (
                    <div style={{
                      width: '100%', height: 180, borderRadius: 14, overflow: 'hidden',
                      background: THEME_GRADIENTS[selectedProject.theme] ?? THEME_GRADIENTS['dark-slate'],
                      position: 'relative', marginBottom: 20,
                    }}>
                      <div style={{ position: 'absolute', top: 16, left: 20, right: 20, height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.2)' }} />
                      <div style={{ position: 'absolute', top: 36, left: 20, width: '55%', height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.15)' }} />
                      <div style={{ position: 'absolute', top: 52, left: 20, width: '35%', height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.1)' }} />
                      <div style={{ position: 'absolute', bottom: 16, left: 20, right: 20, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.15)' }} />
                      <div style={{
                        position: 'absolute', bottom: 8, left: 12, right: 12,
                        fontSize: 11, fontWeight: 500,
                        color: 'rgba(255,255,255,0.9)',
                        textShadow: '0 1px 3px rgba(0,0,0,0.4)',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {selectedProject.name}
                      </div>
                    </div>
                  )}

                  {/* Title + dates */}
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: txt, margin: '0 0 4px' }}>
                    {selectedProject.name || 'Untitled'}
                  </h2>
                  {selectedProject.description && (
                    <p style={{ fontSize: 12, color: sub, marginBottom: 12 }}>
                      {selectedProject.description}
                    </p>
                  )}
                  <div style={{ fontSize: 11, color: sub, marginBottom: 16, display: 'flex', gap: 16 }}>
                    <span>Created: {formatDate(selectedProject.createdAt)}</span>
                    <span>Updated: {formatDate(selectedProject.updatedAt)}</span>
                  </div>

                  {/* Badges */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
                    <Badge label={selectedProject.theme} color={THEME_COLORS[selectedProject.theme]} isDark={isDark} />
                    {selectedProject.generationMode && (
                      <Badge label={selectedProject.generationMode} color="#8b5cf6" isDark={isDark} />
                    )}
                    {selectedProject.source && selectedProject.source !== 'chat' && (
                      <Badge
                        label={selectedProject.source === 'weekly-feed' ? '\u26A1 idea' : '\uD83D\uDCC8 niche'}
                        color="#6366f1" isDark={isDark}
                      />
                    )}
                  </div>

                  {/* Stats grid */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                    gap: 10, marginBottom: 24,
                  }}>
                    {[
                      { label: 'Pages',     value: selectedProject.pagesCount ?? '\u2014' },
                      { label: 'Model',     value: selectedProject.modelId?.split('/').pop() ?? '\u2014' },
                      { label: 'Duration',  value: selectedProject.durationMs ? `${Math.round(selectedProject.durationMs / 1000)}s` : '\u2014' },
                      { label: 'Tokens',    value: selectedProject.billingTokens ?? '\u2014' },
                      { label: 'Cost',      value: selectedProject.billingCost ? `$${selectedProject.billingCost.toFixed(4)}` : '\u2014' },
                    ].map(s => (
                      <div key={s.label} style={{
                        padding: '10px 14px', borderRadius: 10,
                        background: panelBg,
                        border: `1px solid ${bdr}`,
                      }}>
                        <div style={{ fontSize: 10, color: sub, marginBottom: 4 }}>{s.label}</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: txt }}>{s.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => onLoadProject(selectedProject)} style={{
                      padding: '8px 20px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                      background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer',
                    }}>
                      Open in Studio
                    </button>
                    <button onClick={() => handleDelete(selectedProject.id, selectedProject.name)} style={{
                      padding: '8px 16px', borderRadius: 10, fontSize: 12, fontWeight: 500,
                      background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                      color: '#f87171', border: `1px solid ${bdr}`, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </div>
              )}

              {/* ── Prompt tab ────────────────────────────────────────────── */}
              {detailTab === 'prompt' && (
                <div>
                  {/* Source idea */}
                  {selectedProject.source && selectedProject.source !== 'chat' && (
                    <div style={{ marginBottom: 20 }}>
                      <h3 style={{ fontSize: 13, fontWeight: 600, color: txt, marginBottom: 8 }}>
                        Source: {selectedProject.source === 'weekly-feed' ? 'Weekly Feed Idea' : 'Market Niche'}
                      </h3>
                      <p style={{ fontSize: 12, color: sub, lineHeight: 1.6 }}>
                        {selectedProject.intent?.slice(0, 300) ?? 'No intent recorded'}
                      </p>
                    </div>
                  )}

                  {/* Full intent */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <h3 style={{ fontSize: 13, fontWeight: 600, color: txt, margin: 0 }}>Full Intent</h3>
                      {selectedProject.intent && <CopyBtn text={selectedProject.intent} isDark={isDark} />}
                    </div>
                    <pre style={{
                      fontSize: 12, lineHeight: 1.6,
                      color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)',
                      background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                      border: `1px solid ${bdr}`, borderRadius: 10,
                      padding: 16, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      maxHeight: 300, overflowY: 'auto',
                    }}>
                      {selectedProject.intent || 'No intent recorded for this project.'}
                    </pre>
                  </div>

                  {/* Architect plan */}
                  {selectedProject.plan && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <h3 style={{ fontSize: 13, fontWeight: 600, color: txt, margin: 0 }}>Architect Plan</h3>
                        <CopyBtn text={JSON.stringify(selectedProject.plan, null, 2)} isDark={isDark} />
                      </div>
                      <pre style={{
                        fontSize: 11, lineHeight: 1.5,
                        color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
                        background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                        border: `1px solid ${bdr}`, borderRadius: 10,
                        padding: 16, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        maxHeight: 400, overflowY: 'auto',
                      }}>
                        {JSON.stringify(selectedProject.plan, null, 2).slice(0, 3000)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* ── History tab ────────────────────────────────────────────── */}
              {detailTab === 'history' && (() => {
                const revisions: ProjectRevision[] = selectedProject.revisions ?? [];
                return (
                  <div>
                    {revisions.length === 0 ? (
                      <div style={{
                        padding: '32px 16px', textAlign: 'center',
                        color: sub as string, fontSize: 13,
                      }}>
                        <div style={{ fontSize: 32, marginBottom: 12 }}>🕐</div>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>No versions yet</div>
                        <div style={{ fontSize: 12 }}>
                          Versions are saved automatically after each generation or edit.
                          Max 5 versions per project.
                        </div>
                      </div>
                    ) : (
                      <>
                        {revisions.length >= 5 && (
                          <div style={{
                            padding: '8px 12px', marginBottom: 12,
                            background: 'rgba(239,68,68,0.08)',
                            border: '1px solid rgba(239,68,68,0.2)',
                            borderRadius: 8, fontSize: 12, color: txt as string,
                          }}>
                            {'\u26A0\uFE0F'} Version limit reached (5/5). Delete old versions to save new ones.
                          </div>
                        )}

                        {revisions.map((rev, idx) => (
                          <div key={rev.id} style={{
                            padding: '12px 14px', marginBottom: 8,
                            background: panelBg, border: `1px solid ${bdr}`, borderRadius: 10,
                            borderLeft: rev.isBookmarked ? '3px solid #6366f1' : '3px solid transparent',
                          }}>
                            <div style={{
                              display: 'flex', alignItems: 'flex-start',
                              justifyContent: 'space-between', gap: 8,
                            }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                {/* Version label + prompt */}
                                <div style={{
                                  fontSize: 12, fontWeight: 500, color: txt as string,
                                  display: 'flex', alignItems: 'center', gap: 6,
                                }}>
                                  <span style={{
                                    fontSize: 10, padding: '1px 6px', borderRadius: 10,
                                    background: idx === 0 ? 'rgba(99,102,241,0.15)' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
                                    color: idx === 0 ? '#6366f1' : (sub as string),
                                    flexShrink: 0,
                                  }}>
                                    {idx === 0 ? 'latest' : `v${revisions.length - idx}`}
                                  </span>
                                  <span style={{
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }}>
                                    {rev.prompt.slice(0, 60)}{rev.prompt.length > 60 ? '\u2026' : ''}
                                  </span>
                                </div>

                                {/* Meta row */}
                                <div style={{
                                  fontSize: 11, color: sub as string,
                                  marginTop: 4, display: 'flex', gap: 8,
                                }}>
                                  <span>{new Date(rev.createdAt).toLocaleDateString('en', {
                                    month: 'short', day: 'numeric',
                                    hour: '2-digit', minute: '2-digit',
                                  })}</span>
                                  {rev.durationMs != null && <span>{Math.round(rev.durationMs / 1000)}s</span>}
                                  {(rev.pagesCount ?? 0) > 0 && <span>{rev.pagesCount} pages</span>}
                                  {rev.source !== 'chat' && (
                                    <span style={{ color: '#6366f1' }}>
                                      {rev.source === 'weekly-feed' ? '\u26A1 idea' : '\uD83D\uDCC8 niche'}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Action buttons */}
                              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                {/* Bookmark */}
                                <button
                                  onClick={() => {
                                    const updated: StoredProject = {
                                      ...selectedProject!,
                                      revisions: revisions.map(r =>
                                        r.id === rev.id ? { ...r, isBookmarked: !r.isBookmarked } : r
                                      ),
                                    };
                                    ProjectStorage.saveProject(updated);
                                    setSelectedProject(updated);
                                  }}
                                  title={rev.isBookmarked ? 'Remove bookmark' : 'Bookmark this version'}
                                  style={{
                                    padding: '4px 6px', borderRadius: 6,
                                    border: `1px solid ${bdr}`,
                                    background: rev.isBookmarked ? 'rgba(99,102,241,0.1)' : 'transparent',
                                    color: rev.isBookmarked ? '#6366f1' : (sub as string),
                                    cursor: 'pointer', fontSize: 12,
                                  }}
                                >
                                  🔖
                                </button>

                                {/* Restore */}
                                <button
                                  onClick={() => {
                                    if (!window.confirm(
                                      `Restore to version: "${rev.prompt.slice(0, 50)}"?\n\nCurrent files will be replaced.`
                                    )) return;
                                    const updated: StoredProject = {
                                      ...selectedProject!,
                                      files: rev.files,
                                      updatedAt: new Date().toISOString(),
                                    };
                                    ProjectStorage.saveProject(updated);
                                    ProjectStorage.loadToPreview(updated).catch(() => {});
                                    onLoadProject({ id: updated.id });
                                    setSelectedProject(updated);
                                  }}
                                  title="Restore this version"
                                  style={{
                                    padding: '4px 8px', borderRadius: 6,
                                    border: `1px solid ${bdr}`, background: 'transparent',
                                    color: sub as string, cursor: 'pointer', fontSize: 11,
                                  }}
                                >
                                  {'\u21A9'} Restore
                                </button>

                                {/* Fork */}
                                <button
                                  onClick={() => {
                                    const forkName = window.prompt(
                                      'New project name:',
                                      `${selectedProject!.name} (fork)`,
                                    );
                                    if (!forkName) return;
                                    const forked: StoredProject = {
                                      id:          crypto.randomUUID(),
                                      name:        forkName,
                                      description: `Forked from ${selectedProject!.name} \u2014 ${rev.prompt.slice(0, 80)}`,
                                      theme:       selectedProject!.theme,
                                      createdAt:   new Date().toISOString(),
                                      updatedAt:   new Date().toISOString(),
                                      files:       rev.files,
                                      chatHistory: [],
                                      revisions:   [{
                                        ...rev,
                                        id:        crypto.randomUUID(),
                                        prompt:    `Forked from ${selectedProject!.name}: ${rev.prompt}`,
                                        createdAt: new Date().toISOString(),
                                      }],
                                    };
                                    const ok = ProjectStorage.saveProject(forked);
                                    if (!ok) { alert('Storage full \u2014 cannot create fork.'); return; }
                                    alert(`\u2705 "${forkName}" created!\n\nFind it in your projects list.`);
                                    onRefreshProjects?.();
                                  }}
                                  title="Fork this version as a new project"
                                  style={{
                                    padding: '4px 8px', borderRadius: 6,
                                    border: `1px solid ${bdr}`, background: 'transparent',
                                    color: sub as string, cursor: 'pointer', fontSize: 11,
                                  }}
                                >
                                  {'\u2442'} Fork
                                </button>

                                {/* Delete revision */}
                                <button
                                  onClick={() => {
                                    if (!window.confirm('Delete this version? This cannot be undone.')) return;
                                    const updated: StoredProject = {
                                      ...selectedProject!,
                                      revisions: revisions.filter(r => r.id !== rev.id),
                                    };
                                    ProjectStorage.saveProject(updated);
                                    setSelectedProject(updated);
                                  }}
                                  title="Delete this version"
                                  style={{
                                    padding: '4px 6px', borderRadius: 6,
                                    border: `1px solid ${bdr}`, background: 'transparent',
                                    color: sub as string, cursor: 'pointer', fontSize: 12,
                                  }}
                                >
                                  {'\u00D7'}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                );
              })()}

              {/* ── Logs tab ──────────────────────────────────────────────── */}
              {detailTab === 'logs' && (
                <div>
                  {/* Generation logs */}
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <h3 style={{ fontSize: 13, fontWeight: 600, color: txt, margin: 0 }}>Generation Logs</h3>
                      {selectedProject.logs && selectedProject.logs.length > 0 && (
                        <CopyBtn text={selectedProject.logs.join('\n')} isDark={isDark} />
                      )}
                    </div>
                    {!selectedProject.logs || selectedProject.logs.length === 0 ? (
                      <p style={{ fontSize: 12, color: sub, fontStyle: 'italic' }}>
                        Logs not available for projects created before this update
                      </p>
                    ) : (
                      <pre style={{
                        fontSize: 11, lineHeight: 1.6, fontFamily: 'monospace',
                        color: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)',
                        background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                        border: `1px solid ${bdr}`, borderRadius: 10,
                        padding: 16, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        maxHeight: 500, overflowY: 'auto',
                      }}>
                        {selectedProject.logs.join('\n')}
                      </pre>
                    )}
                  </div>

                  {/* Errors */}
                  {selectedProject.errors && selectedProject.errors.length > 0 && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <h3 style={{ fontSize: 13, fontWeight: 600, color: '#f87171', margin: 0 }}>
                          \u26A0 Errors ({selectedProject.errors.length})
                        </h3>
                        <CopyBtn text={selectedProject.errors.join('\n')} isDark={isDark} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {selectedProject.errors.map((err, i) => (
                          <div key={i} style={{
                            padding: '8px 12px', borderRadius: 8,
                            background: isDark ? 'rgba(248,113,113,0.06)' : 'rgba(248,113,113,0.06)',
                            borderLeft: '3px solid #f87171',
                            fontSize: 11, fontFamily: 'monospace',
                            color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)',
                            wordBreak: 'break-word',
                          }}>
                            {err}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Code tab ──────────────────────────────────────────────── */}
              {detailTab === 'code' && (
                <div>
                  {(() => {
                    const fileEntries = Object.entries(selectedProject.files ?? {});
                    const totalLines = fileEntries.reduce((sum, [, c]) => sum + c.split('\n').length, 0);
                    return (
                      <>
                        <div style={{
                          fontSize: 12, color: sub, marginBottom: 12,
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          <FileCode2 size={13} />
                          {fileEntries.length} file{fileEntries.length !== 1 ? 's' : ''} · {totalLines.toLocaleString()} lines
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {fileEntries.map(([path, content]) => (
                            <div key={path}>
                              <div
                                onClick={() => setOpenFile(openFile === path ? null : path)}
                                style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                                  background: openFile === path
                                    ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)')
                                    : 'transparent',
                                  transition: 'background 0.12s',
                                }}
                              >
                                <span style={{ fontSize: 12, color: txt, fontFamily: 'monospace' }}>
                                  {path}
                                </span>
                                <span style={{ fontSize: 10, color: sub }}>
                                  {content.split('\n').length}L
                                </span>
                              </div>

                              {openFile === path && (
                                <div style={{ padding: '0 8px 8px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                                    <CopyBtn text={content} isDark={isDark} />
                                  </div>
                                  <pre style={{
                                    fontSize: 11, lineHeight: 1.5, fontFamily: 'monospace',
                                    color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)',
                                    background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                                    border: `1px solid ${bdr}`, borderRadius: 10,
                                    padding: 14, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                    maxHeight: 500, overflowY: 'auto',
                                  }}>
                                    {content}
                                  </pre>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
