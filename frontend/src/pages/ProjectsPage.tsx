/**
 * ProjectsPage — full-page project browser with three tabs:
 *   Overview  — project cards grid with theme accent + mini-preview
 *   History   — chronological generation log with file diffs
 *   Revisions — revision list with Restore / Fork / Bookmark actions
 *
 * Data: ProjectRepository (async, Supabase-first).
 * UI:   shadcn Tabs, Card, Badge + Tailwind mobile-first grid.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FolderOpen, Clock, GitBranch, Search, Trash2, Plus,
  Star, StarOff, RotateCcw, GitFork, Bookmark, BookmarkCheck,
  FileCode2, ChevronDown, ChevronRight, Eye, RefreshCw,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  ProjectRepository,
  getCanonicalProjectName,
  type ProjectRecord,
  type ProjectMetaSummary,
} from '../services/ProjectRepository';
import { ProjectStorage, type ProjectRevision } from '../services/ProjectStorage';
import { getScreenshot } from '../lib/screenshotCache';

// ── Constants ─────────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en', { day: 'numeric', month: 'short' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fileCount(files: Record<string, string>): number {
  return Object.keys(files).filter(p => /\.(tsx?|jsx?|css|html)$/.test(p)).length;
}

function asFileMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

function diffSummary(
  oldFiles: Record<string, string>,
  newFiles: Record<string, string>,
): { added: string[]; removed: string[]; changed: string[] } {
  const oldKeys = new Set(Object.keys(oldFiles));
  const newKeys = new Set(Object.keys(newFiles));
  const added:   string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const k of newKeys) {
    if (!oldKeys.has(k)) added.push(k);
    else if (oldFiles[k] !== newFiles[k]) changed.push(k);
  }
  for (const k of oldKeys) {
    if (!newKeys.has(k)) removed.push(k);
  }
  return { added, removed, changed };
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ProjectsPageProps {
  theme:            'dark' | 'medium' | 'light';
  currentProjectId?: string | null;
  onLoadProject?:   (project: ProjectRecord) => void;
  onNewProject?:    () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const ProjectsPage: React.FC<ProjectsPageProps> = React.memo(({
  theme, currentProjectId, onLoadProject, onNewProject,
}) => {
  const isDark = theme !== 'light';

  // ── State ───────────────────────────────────────────────────────────────────
  const [projects, setProjects] = useState<ProjectMetaSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fullProject, setFullProject] = useState<ProjectRecord | null>(null);
  const [revisions, setRevisions] = useState<ProjectRevision[]>([]);
  const [expandedDiff, setExpandedDiff] = useState<string | null>(null);
  // Map of projectId → cached screenshot data-URL
  const [screenshots, setScreenshots] = useState<Record<string, string>>({});

  const normalizedRevisions = useMemo(() => {
    return revisions.map((rev, idx) => ({
      ...rev,
      id: rev?.id || `legacy-rev-${idx}`,
      prompt: rev?.prompt || 'Untitled revision',
      files: asFileMap((rev as any)?.files),
      createdAt: rev?.createdAt || new Date().toISOString(),
    }));
  }, [revisions]);

  // ── Load projects ───────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await ProjectRepository.listProjects();
      setProjects(list.map(p => ({ ...p, name: getCanonicalProjectName(p) })));
      // Load cached screenshots from localStorage
      const shots: Record<string, string> = {};
      for (const p of list) {
        const shot = getScreenshot(p.id);
        if (shot) shots[p.id] = shot;
      }
      setScreenshots(shots);
    } catch (e) {
      console.error('[ProjectsPage] Failed to load projects:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-read screenshots from localStorage when page becomes visible (user may have captured one)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setScreenshots(prev => {
          const updated = { ...prev };
          let changed = false;
          for (const p of projects) {
            const shot = getScreenshot(p.id);
            if (shot && shot !== prev[p.id]) { updated[p.id] = shot; changed = true; }
          }
          return changed ? updated : prev;
        });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [projects]);

  // Pick up screenshots saved to localStorage by the studio (same-tab custom event)
  useEffect(() => {
    const onSaved = (e: Event) => {
      const { projectId, dataUrl } = (e as CustomEvent<{ projectId: string; dataUrl: string }>).detail;
      setScreenshots(prev => ({ ...prev, [projectId]: dataUrl }));
    };
    window.addEventListener('screenshot-saved', onSaved);
    // Also listen to cross-tab storage events
    const onStorage = (e: StorageEvent) => {
      if (!e.key?.startsWith('screenshot_') || !e.newValue) return;
      const projectId = e.key.slice('screenshot_'.length);
      setScreenshots(prev => ({ ...prev, [projectId]: e.newValue! }));
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('screenshot-saved', onSaved);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Load full project on selection ──────────────────────────────────────────
  useEffect(() => {
    if (!selectedId) { setFullProject(null); setRevisions([]); return; }
    let cancelled = false;
    ProjectRepository.getProject(selectedId).then(p => {
      if (cancelled) return;
      if (!p) {
        ProjectRepository.removeLocalProjectMeta(selectedId);
        setProjects(prev => prev.filter(project => project.id !== selectedId));
        setFullProject(null);
        setRevisions([]);
        return;
      }
      setFullProject(p);
      setRevisions((p as any)?.revisions ?? []);
    });
    return () => { cancelled = true; };
  }, [selectedId]);

  // ── Filtered list ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!query.trim()) return projects;
    const q = query.toLowerCase();
    return projects.filter(p => p.name.toLowerCase().includes(q));
  }, [projects, query]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id: string) => {
    await ProjectRepository.deleteProject(id);
    setProjects(prev => prev.filter(p => p.id !== id));
    if (selectedId === id) { setSelectedId(null); setFullProject(null); }
  }, [selectedId]);

  const handleRestore = useCallback((rev: ProjectRevision) => {
    if (!fullProject || !onLoadProject) return;
    onLoadProject({ ...fullProject, files: rev.files, updatedAt: new Date().toISOString() });
  }, [fullProject, onLoadProject]);

  const handleFork = useCallback(async (rev: ProjectRevision) => {
    if (!fullProject) return;
    const forked: ProjectRecord = {
      ...fullProject,
      id: crypto.randomUUID(),
      name: `${fullProject.name} (fork)`,
      files: rev.files,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };
    await ProjectRepository.saveProject(forked);
    await refresh();
    setSelectedId(forked.id);
    onLoadProject?.(forked);
  }, [fullProject, onLoadProject, refresh]);

  const handleBookmark = useCallback((revId: string) => {
    if (!fullProject) return;
    setRevisions(prev =>
      prev.map(r => r.id === revId ? { ...r, isBookmarked: !r.isBookmarked } : r),
    );
  }, [fullProject]);

  // ── Styles ──────────────────────────────────────────────────────────────────
  const containerCls = isDark
    ? 'bg-[#07070b] text-white/85'
    : 'bg-gray-50 text-gray-900';

  const cardCls = isDark
    ? 'bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.05]'
    : 'bg-white border-gray-200 hover:bg-gray-50';

  const inputCls = isDark
    ? 'bg-white/[0.04] border-white/[0.08] text-white/80 placeholder:text-white/25'
    : 'bg-white border-gray-200 text-gray-800 placeholder:text-gray-400';

  const subText = isDark ? 'text-white/35' : 'text-gray-500';

  // ══════════════════════════════════════════════════════════════════════════════
  // ── OVERVIEW TAB ──────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════

  const OverviewTab = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* New project card */}
      <Card
        className={`${cardCls} cursor-pointer transition-colors border-dashed flex flex-col items-center justify-center min-h-[180px]`}
        onClick={onNewProject}
      >
        <Plus size={28} className={isDark ? 'text-white/20' : 'text-gray-300'} />
        <span className={`mt-2 text-sm font-medium ${subText}`}>New Project</span>
      </Card>

      {filtered.map(p => {
        const accent = THEME_COLORS[p.theme] ?? '#6366f1';
        const gradient = THEME_GRADIENTS[p.theme] ?? THEME_GRADIENTS['dark-slate'];
        const isActive = p.id === currentProjectId;
        const screenshot = screenshots[p.id] ?? null;

        return (
          <Card
            key={p.id}
            className={`${cardCls} cursor-pointer transition-all group relative overflow-hidden ${
              isActive ? 'ring-2 ring-blue-500/50' : ''
            }`}
            onClick={() => setSelectedId(p.id)}
          >
            {/* Preview thumbnail — screenshot if cached, else gradient placeholder */}
            <div className="relative h-[112px] overflow-hidden rounded-t-lg">
              {screenshot ? (
                <img
                  src={screenshot}
                  alt={`${p.name} preview`}
                  className="w-full h-full object-cover object-top transition-opacity group-hover:opacity-90"
                  draggable={false}
                />
              ) : (
                <div
                  className="w-full h-full opacity-70 group-hover:opacity-90 transition-opacity"
                  style={{ background: gradient }}
                />
              )}
              {/* Refresh screenshot button — only shown when screenshot exists */}
              {screenshot && (
                <button
                  title="Refresh screenshot"
                  className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 hover:bg-black/70 rounded-md p-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    setScreenshots(prev => {
                      const next = { ...prev };
                      delete next[p.id];
                      return next;
                    });
                  }}
                >
                  <RefreshCw size={11} className="text-white/70" />
                </button>
              )}
            </div>

            <CardHeader className="pb-2 pt-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-sm font-semibold truncate">
                  {p.name}
                </CardTitle>
                <Badge
                  variant="outline"
                  className="shrink-0 text-[10px]"
                  style={{ borderColor: accent, color: accent }}
                >
                  v{p.version}
                </Badge>
              </div>
              <CardDescription className="text-xs mt-1">
                {timeAgo(p.updatedAt)}
              </CardDescription>
            </CardHeader>

            <CardFooter className="pt-0 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: accent }}
                />
                <span className={`text-[10px] ${subText}`}>{p.theme}</span>
              </div>

              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost" size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    ProjectRepository.getProject(p.id).then(full => {
                      if (full) {
                        onLoadProject?.(full);
                        return;
                      }
                      ProjectRepository.removeLocalProjectMeta(p.id);
                      setProjects(prev => prev.filter(project => project.id !== p.id));
                    });
                  }}
                >
                  <Eye size={13} />
                </Button>
                <Button
                  variant="ghost" size="icon"
                  className="h-7 w-7 text-red-400 hover:text-red-300"
                  onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            </CardFooter>
          </Card>
        );
      })}

      {filtered.length === 0 && !loading && (
        <div className={`col-span-full text-center py-16 ${subText}`}>
          <FolderOpen size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No projects found</p>
        </div>
      )}
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // ── HISTORY TAB ───────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════

  const HistoryTab = () => {
    if (!fullProject) {
      return (
        <div className={`text-center py-16 ${subText}`}>
          <Clock size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Select a project to view history</p>
        </div>
      );
    }

    if (normalizedRevisions.length === 0) {
      return (
        <div className={`text-center py-16 ${subText}`}>
          <Clock size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No generation history yet</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Clock size={14} />
          {fullProject.name} — Generation History
        </h3>

        {normalizedRevisions.map((rev, i) => {
          const prevFiles = i < normalizedRevisions.length - 1 ? normalizedRevisions[i + 1].files : {};
          const diff = diffSummary(prevFiles, rev.files);
          const isExpanded = expandedDiff === rev.id;

          return (
            <Card key={rev.id} className={cardCls}>
              <CardHeader className="pb-2 pt-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{rev.prompt}</p>
                    <p className={`text-xs mt-0.5 ${subText}`}>
                      {formatDate(rev.createdAt)}
                      {rev.modelId && <span className="ml-2 opacity-60">{rev.modelId}</span>}
                      {rev.durationMs && <span className="ml-2 opacity-60">{(rev.durationMs / 1000).toFixed(1)}s</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="outline" className="text-[10px]">
                      {rev.source}
                    </Badge>
                    {rev.isBookmarked && (
                      <Star size={12} className="text-amber-400 fill-amber-400" />
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pb-3">
                {/* Diff summary badges */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {diff.added.length > 0 && (
                    <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-[10px]">
                      +{diff.added.length} added
                    </Badge>
                  )}
                  {diff.changed.length > 0 && (
                    <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/20 text-[10px]">
                      ~{diff.changed.length} changed
                    </Badge>
                  )}
                  {diff.removed.length > 0 && (
                    <Badge className="bg-red-500/15 text-red-400 border-red-500/20 text-[10px]">
                      -{diff.removed.length} removed
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    {fileCount(rev.files)} files
                  </Badge>
                </div>

                {/* Expandable file list */}
                <button
                  className={`flex items-center gap-1 text-xs ${subText} hover:opacity-80`}
                  onClick={() => setExpandedDiff(isExpanded ? null : rev.id)}
                >
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  Show files
                </button>

                {isExpanded && (
                  <div className={`mt-2 text-xs font-mono space-y-0.5 ${
                    isDark ? 'text-white/50' : 'text-gray-500'
                  }`}>
                    {diff.added.map(f => (
                      <div key={f} className="text-emerald-400">+ {f}</div>
                    ))}
                    {diff.changed.map(f => (
                      <div key={f} className="text-blue-400">~ {f}</div>
                    ))}
                    {diff.removed.map(f => (
                      <div key={f} className="text-red-400">- {f}</div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // ── REVISIONS TAB ─────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════

  const RevisionsTab = () => {
    if (!fullProject) {
      return (
        <div className={`text-center py-16 ${subText}`}>
          <GitBranch size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Select a project to manage revisions</p>
        </div>
      );
    }

    if (normalizedRevisions.length === 0) {
      return (
        <div className={`text-center py-16 ${subText}`}>
          <GitBranch size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No revisions available</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <GitBranch size={14} />
          {fullProject.name} — {normalizedRevisions.length} Revision{normalizedRevisions.length !== 1 ? 's' : ''}
        </h3>

        {normalizedRevisions.map((rev, i) => {
          const isLatest = i === 0;

          return (
            <Card key={rev.id} className={`${cardCls} ${isLatest ? 'ring-1 ring-blue-500/30' : ''}`}>
              <CardHeader className="pb-2 pt-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{rev.prompt}</p>
                      {isLatest && (
                        <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/20 text-[10px] shrink-0">
                          latest
                        </Badge>
                      )}
                    </div>
                    <p className={`text-xs mt-0.5 ${subText}`}>
                      {formatDate(rev.createdAt)}
                      <span className="mx-1.5">·</span>
                      {fileCount(rev.files)} files
                      {rev.pagesCount != null && (
                        <><span className="mx-1.5">·</span>{rev.pagesCount} pages</>
                      )}
                    </p>
                  </div>
                </div>
              </CardHeader>

              <CardFooter className="pt-0 pb-3 flex flex-wrap gap-2">
                <Button
                  variant="outline" size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => handleRestore(rev)}
                >
                  <RotateCcw size={12} /> Restore
                </Button>
                <Button
                  variant="outline" size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => handleFork(rev)}
                >
                  <GitFork size={12} /> Fork
                </Button>
                <Button
                  variant="ghost" size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => handleBookmark(rev.id)}
                >
                  {rev.isBookmarked
                    ? <><BookmarkCheck size={12} className="text-amber-400" /> Bookmarked</>
                    : <><Bookmark size={12} /> Bookmark</>
                  }
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // ── LAYOUT ────────────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════

  return (
    <div className={`min-h-screen p-4 md:p-6 ${containerCls}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <FolderOpen size={20} />
          Projects
        </h1>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${subText}`} />
          <input
            type="text"
            placeholder="Search projects..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className={`w-full pl-9 pr-3 py-2 rounded-lg border text-sm outline-none transition-colors ${inputCls}`}
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className={isDark
          ? 'bg-white/[0.04] border border-white/[0.06]'
          : 'bg-gray-100 border border-gray-200'
        }>
          <TabsTrigger value="overview" className="gap-1.5 text-xs">
            <FolderOpen size={13} /> Overview
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 text-xs">
            <Clock size={13} /> History
          </TabsTrigger>
          <TabsTrigger value="revisions" className="gap-1.5 text-xs">
            <GitBranch size={13} /> Revisions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          {loading ? (
            <div className={`text-center py-16 ${subText}`}>
              <div className="animate-spin w-6 h-6 border-2 border-current border-t-transparent rounded-full mx-auto mb-2" />
              <p className="text-sm">Loading projects...</p>
            </div>
          ) : (
            <OverviewTab />
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryTab />
        </TabsContent>

        <TabsContent value="revisions" className="mt-4">
          <RevisionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
});

export default ProjectsPage;
