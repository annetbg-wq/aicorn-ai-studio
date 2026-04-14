/**
 * RevisionTimeline — vertical timeline showing project revision history.
 *
 * Each node: timestamp, file count, status badge (active/candidate/failed).
 * Actions: Restore (rollback), Fork (new project), Bookmark (toggle).
 * Active revision is visually highlighted.
 * Expandable unified diff between consecutive revisions.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  RotateCcw, GitFork, Bookmark, BookmarkCheck,
  ChevronDown, ChevronRight, FileCode2, Check, Circle,
  XCircle, Loader2, Image,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ProjectRevision } from '../services/ProjectStorage';
import { getRevisionThumbnail } from '../lib/screenshotCache';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Revision display status for the timeline UI.
 *
 * Mapping to canonical RevisionManager / Snapshot semantics:
 *   'active'    → The revision currently shown in the preview
 *                 (= RevisionManager.activeRevisionId = Snapshot with status 'stable').
 *   'candidate' → A revision being compiled / not yet confirmed
 *                 (= RevisionManager.candidateRevisionId = Snapshot with status 'candidate').
 *   'failed'    → Compilation or iframe mount failed for this revision.
 */
export type RevisionStatus = 'active' | 'candidate' | 'failed';

export interface RevisionEntry extends ProjectRevision {
  status: RevisionStatus;
}

export interface RevisionTimelineProps {
  revisions:        RevisionEntry[];
  activeRevisionId?: string | null;
  theme:            'dark' | 'medium' | 'light';
  onRestore?:       (rev: RevisionEntry) => void;
  onFork?:          (rev: RevisionEntry) => void;
  onBookmark?:      (revId: string) => void;
}

// ── Unified diff ──────────────────────────────────────────────────────────────

interface DiffLine {
  type: 'add' | 'remove' | 'context';
  text: string;
  lineOld?: number;
  lineNew?: number;
}

interface FileDiff {
  path:    string;
  kind:    'added' | 'removed' | 'changed';
  lines:   DiffLine[];
  stats:   { added: number; removed: number };
}

function computeUnifiedDiff(
  oldFiles: Record<string, string>,
  newFiles: Record<string, string>,
): FileDiff[] {
  const allPaths = new Set([...Object.keys(oldFiles), ...Object.keys(newFiles)]);
  const diffs: FileDiff[] = [];

  for (const path of allPaths) {
    const oldContent = oldFiles[path];
    const newContent = newFiles[path];

    if (!oldContent && newContent) {
      const newLines = newContent.split('\n');
      diffs.push({
        path,
        kind: 'added',
        lines: newLines.map((t, i) => ({ type: 'add', text: t, lineNew: i + 1 })),
        stats: { added: newLines.length, removed: 0 },
      });
    } else if (oldContent && !newContent) {
      const oldLines = oldContent.split('\n');
      diffs.push({
        path,
        kind: 'removed',
        lines: oldLines.map((t, i) => ({ type: 'remove', text: t, lineOld: i + 1 })),
        stats: { added: 0, removed: oldLines.length },
      });
    } else if (oldContent && newContent && oldContent !== newContent) {
      const oldLines = oldContent.split('\n');
      const newLines = newContent.split('\n');
      const lines = buildContextDiff(oldLines, newLines);
      diffs.push({
        path,
        kind: 'changed',
        lines,
        stats: {
          added:   lines.filter(l => l.type === 'add').length,
          removed: lines.filter(l => l.type === 'remove').length,
        },
      });
    }
  }

  return diffs.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Simple LCS-based diff with 3-line context windows.
 * Produces output similar to `diff -u` but without full LCS for performance.
 */
function buildContextDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const CONTEXT = 3;
  const result: DiffLine[] = [];

  // Build a map of old-line → positions for quick lookup
  const oldMap = new Map<string, number[]>();
  oldLines.forEach((l, i) => {
    const arr = oldMap.get(l) ?? [];
    arr.push(i);
    oldMap.set(l, arr);
  });

  // Simple Myers-like approach: walk both arrays, emit add/remove/context
  let oi = 0;
  let ni = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      result.push({ type: 'context', text: oldLines[oi], lineOld: oi + 1, lineNew: ni + 1 });
      oi++;
      ni++;
    } else {
      // Find next sync point
      let syncOi = -1;
      let syncNi = -1;
      let bestDist = Infinity;

      // Look ahead in both arrays (bounded search)
      const maxLook = Math.min(40, Math.max(oldLines.length - oi, newLines.length - ni));
      for (let look = 1; look < maxLook; look++) {
        if (oi + look < oldLines.length && ni < newLines.length) {
          for (let j = ni; j < Math.min(ni + maxLook, newLines.length); j++) {
            if (oldLines[oi + look] === newLines[j] && look + (j - ni) < bestDist) {
              bestDist = look + (j - ni);
              syncOi = oi + look;
              syncNi = j;
            }
          }
        }
      }

      if (syncOi === -1) {
        // No sync — dump remaining
        while (oi < oldLines.length) {
          result.push({ type: 'remove', text: oldLines[oi], lineOld: oi + 1 });
          oi++;
        }
        while (ni < newLines.length) {
          result.push({ type: 'add', text: newLines[ni], lineNew: ni + 1 });
          ni++;
        }
      } else {
        while (oi < syncOi) {
          result.push({ type: 'remove', text: oldLines[oi], lineOld: oi + 1 });
          oi++;
        }
        while (ni < syncNi) {
          result.push({ type: 'add', text: newLines[ni], lineNew: ni + 1 });
          ni++;
        }
      }
    }
  }

  // Collapse long context runs: keep only CONTEXT lines around changes
  if (result.length === 0) return result;

  const changeIndices = new Set<number>();
  result.forEach((l, i) => {
    if (l.type !== 'context') {
      for (let c = Math.max(0, i - CONTEXT); c <= Math.min(result.length - 1, i + CONTEXT); c++) {
        changeIndices.add(c);
      }
    }
  });

  // If all lines are context (identical content shouldn't happen, but guard)
  if (changeIndices.size === 0) return [];

  const collapsed: DiffLine[] = [];
  let skipped = false;
  for (let i = 0; i < result.length; i++) {
    if (changeIndices.has(i)) {
      if (skipped) {
        collapsed.push({ type: 'context', text: '···' });
        skipped = false;
      }
      collapsed.push(result[i]);
    } else {
      skipped = true;
    }
  }

  return collapsed;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString('en', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function countFiles(files: Record<string, string>): number {
  return Object.keys(files).filter(p => /\.(tsx?|jsx?|css|html|json)$/.test(p)).length;
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<RevisionStatus, {
  label: string;
  dotCls: string;
  badgeCls: string;
  icon: React.ReactNode;
}> = {
  active: {
    label: 'Active',
    dotCls: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]',
    badgeCls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    icon: <Check size={10} />,
  },
  candidate: {
    label: 'Candidate',
    dotCls: 'bg-blue-400 animate-pulse',
    badgeCls: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
    icon: <Loader2 size={10} className="animate-spin" />,
  },
  failed: {
    label: 'Failed',
    dotCls: 'bg-red-400',
    badgeCls: 'bg-red-500/15 text-red-400 border-red-500/25',
    icon: <XCircle size={10} />,
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

export const RevisionTimeline: React.FC<RevisionTimelineProps> = React.memo(({
  revisions, activeRevisionId, theme, onRestore, onFork, onBookmark,
}) => {
  const isDark = theme !== 'light';
  const [expandedId,   setExpandedId]   = useState<string | null>(null);
  const [expandedThumb, setExpandedThumb] = useState<string | null>(null);

  // Load revision thumbnails from localStorage cache
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  useEffect(() => {
    const loaded: Record<string, string> = {};
    for (const rev of revisions) {
      const thumb = getRevisionThumbnail(rev.id);
      if (thumb) loaded[rev.id] = thumb;
    }
    setThumbnails(loaded);
  }, [revisions]);

  // Re-load when a new screenshot is saved (same tab)
  useEffect(() => {
    const handler = () => {
      const loaded: Record<string, string> = {};
      for (const rev of revisions) {
        const thumb = getRevisionThumbnail(rev.id);
        if (thumb) loaded[rev.id] = thumb;
      }
      setThumbnails(loaded);
    };
    window.addEventListener('screenshot-saved', handler);
    return () => window.removeEventListener('screenshot-saved', handler);
  }, [revisions]);

  const cardCls = isDark
    ? 'bg-white/[0.03] border-white/[0.07]'
    : 'bg-white border-gray-200';
  const subText = isDark ? 'text-white/35' : 'text-gray-400';
  const lineCls = isDark ? 'bg-white/[0.08]' : 'bg-gray-200';
  const codeBg  = isDark ? 'bg-white/[0.03]' : 'bg-gray-50';

  // Pre-compute diffs between consecutive revisions
  const diffs = useMemo(() => {
    const map = new Map<string, FileDiff[]>();
    for (let i = 0; i < revisions.length; i++) {
      const prev = i < revisions.length - 1 ? revisions[i + 1].files : {};
      map.set(revisions[i].id, computeUnifiedDiff(prev, revisions[i].files));
    }
    return map;
  }, [revisions]);

  const toggleDiff = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  if (revisions.length === 0) {
    return (
      <div className={`text-center py-12 ${subText}`}>
        <Circle size={28} className="mx-auto mb-2 opacity-20" />
        <p className="text-sm">No revisions yet</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {revisions.map((rev, i) => {
        const isActive = rev.id === activeRevisionId || rev.status === 'active';
        const isLast = i === revisions.length - 1;
        const cfg = STATUS_CONFIG[rev.status];
        const fileDiffs = diffs.get(rev.id) ?? [];
        const isExpanded = expandedId === rev.id;
        const totalAdded   = fileDiffs.reduce((s, d) => s + d.stats.added, 0);
        const totalRemoved = fileDiffs.reduce((s, d) => s + d.stats.removed, 0);

        return (
          <div key={rev.id} className="relative flex gap-4">
            {/* ── Timeline spine ──────────────────────────────────── */}
            <div className="flex flex-col items-center w-5 shrink-0">
              {/* Dot */}
              <div className={`w-3 h-3 rounded-full mt-4 z-10 ${cfg.dotCls} ${
                isActive ? 'ring-2 ring-offset-1 ring-emerald-400/40 ring-offset-transparent' : ''
              }`} />
              {/* Line */}
              {!isLast && (
                <div className={`w-px flex-1 ${lineCls}`} />
              )}
            </div>

            {/* ── Card ────────────────────────────────────────────── */}
            <div className="flex-1 pb-4 min-w-0">
              <Card className={`${cardCls} transition-colors ${
                isActive ? (isDark ? 'ring-1 ring-emerald-500/30' : 'ring-1 ring-emerald-400/40') : ''
              }`}>
                <CardContent className="p-4">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    {/* Thumbnail — shown if available */}
                    {thumbnails[rev.id] ? (
                      <button
                        onClick={() => setExpandedThumb(expandedThumb === rev.id ? null : rev.id)}
                        title="Toggle preview"
                        className="shrink-0 rounded overflow-hidden border opacity-80 hover:opacity-100 transition-opacity"
                        style={{ width: 56, height: 40, background: isDark ? '#111' : '#f3f4f6', borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb' }}
                      >
                        <img
                          src={thumbnails[rev.id]}
                          alt="Preview"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </button>
                    ) : (
                      <div
                        className="shrink-0 rounded flex items-center justify-center"
                        style={{ width: 56, height: 40, background: isDark ? 'rgba(255,255,255,0.04)' : '#f9fafb', border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : '#e5e7eb'}` }}
                      >
                        <Image size={14} className={isDark ? 'text-white/20' : 'text-gray-300'} />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate leading-snug">
                        {rev.prompt}
                      </p>
                      <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs ${subText}`}>
                        <span>{formatTs(rev.createdAt)}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <FileCode2 size={11} /> {countFiles(rev.files)}
                        </span>
                        {rev.modelId && (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-[120px]">{rev.modelId}</span>
                          </>
                        )}
                        {rev.durationMs != null && (
                          <>
                            <span>·</span>
                            <span>{(rev.durationMs / 1000).toFixed(1)}s</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Status badge */}
                    <Badge className={`${cfg.badgeCls} shrink-0 text-[10px] gap-1`}>
                      {cfg.icon} {cfg.label}
                    </Badge>
                  </div>

                  {/* Expanded thumbnail preview */}
                  {expandedThumb === rev.id && thumbnails[rev.id] && (
                    <div className="mb-3 rounded-lg overflow-hidden border" style={{ borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb' }}>
                      <img
                        src={thumbnails[rev.id]}
                        alt="Revision preview"
                        style={{ width: '100%', maxHeight: 200, objectFit: 'cover', display: 'block' }}
                      />
                    </div>
                  )}

                  {/* Diff stats row */}
                  {fileDiffs.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
                        +{totalAdded}
                      </Badge>
                      <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px]">
                        -{totalRemoved}
                      </Badge>
                      <span className={`text-[10px] ${subText}`}>
                        {fileDiffs.length} file{fileDiffs.length !== 1 ? 's' : ''} changed
                      </span>

                      <button
                        onClick={() => toggleDiff(rev.id)}
                        className={`ml-auto flex items-center gap-1 text-[11px] font-medium ${
                          isDark ? 'text-white/50 hover:text-white/70' : 'text-gray-500 hover:text-gray-700'
                        } transition-colors`}
                      >
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        {isExpanded ? 'Hide diff' : 'Show diff'}
                      </button>
                    </div>
                  )}

                  {/* Expanded diff */}
                  {isExpanded && fileDiffs.length > 0 && (
                    <div className={`rounded-lg overflow-hidden border mb-3 ${
                      isDark ? 'border-white/[0.06]' : 'border-gray-200'
                    }`}>
                      {fileDiffs.map(fd => (
                        <div key={fd.path}>
                          {/* File header */}
                          <div className={`px-3 py-1.5 text-[11px] font-mono font-semibold flex items-center gap-2 ${
                            isDark ? 'bg-white/[0.05] text-white/60' : 'bg-gray-100 text-gray-600'
                          }`}>
                            <FileCode2 size={11} />
                            {fd.path}
                            <Badge className={`ml-auto text-[9px] ${
                              fd.kind === 'added'   ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' :
                              fd.kind === 'removed' ? 'bg-red-500/15 text-red-400 border-red-500/20' :
                                                      'bg-blue-500/15 text-blue-400 border-blue-500/20'
                            }`}>
                              {fd.kind}
                            </Badge>
                          </div>

                          {/* Diff lines */}
                          <div className={`${codeBg} overflow-x-auto max-h-[300px] overflow-y-auto`}>
                            <table className="w-full text-[11px] font-mono leading-[18px]">
                              <tbody>
                                {fd.lines.map((line, li) => {
                                  const bgLine =
                                    line.type === 'add'    ? (isDark ? 'bg-emerald-500/[0.08]' : 'bg-emerald-50') :
                                    line.type === 'remove' ? (isDark ? 'bg-red-500/[0.08]' : 'bg-red-50') : '';
                                  const textLine =
                                    line.type === 'add'    ? (isDark ? 'text-emerald-300' : 'text-emerald-700') :
                                    line.type === 'remove' ? (isDark ? 'text-red-300' : 'text-red-700') :
                                                             (isDark ? 'text-white/40' : 'text-gray-400');
                                  const gutterText = isDark ? 'text-white/15' : 'text-gray-300';
                                  const prefix =
                                    line.type === 'add' ? '+' :
                                    line.type === 'remove' ? '-' : ' ';

                                  return (
                                    <tr key={li} className={bgLine}>
                                      <td className={`w-8 text-right pr-1 select-none ${gutterText}`}>
                                        {line.lineOld ?? ''}
                                      </td>
                                      <td className={`w-8 text-right pr-2 select-none ${gutterText}`}>
                                        {line.lineNew ?? ''}
                                      </td>
                                      <td className={`w-4 text-center select-none ${textLine}`}>
                                        {prefix}
                                      </td>
                                      <td className={`pr-3 whitespace-pre ${textLine}`}>
                                        {line.text}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2">
                    {rev.status !== 'active' && onRestore && (
                      <Button
                        variant="outline" size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => onRestore(rev)}
                      >
                        <RotateCcw size={12} /> Restore
                      </Button>
                    )}
                    {onFork && (
                      <Button
                        variant="outline" size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => onFork(rev)}
                      >
                        <GitFork size={12} /> Fork
                      </Button>
                    )}
                    {onBookmark && (
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => onBookmark(rev.id)}
                      >
                        {rev.isBookmarked
                          ? <><BookmarkCheck size={12} className="text-amber-400" /> Bookmarked</>
                          : <><Bookmark size={12} /> Bookmark</>
                        }
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        );
      })}
    </div>
  );
});

export default RevisionTimeline;
