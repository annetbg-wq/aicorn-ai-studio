/**
 * DiffPreview — side-by-side diff overlay for edit review.
 *
 * Shows changed files before promote: left = current (active revision),
 * right = proposed (candidate). Added lines green, removed lines red.
 *
 * Per-file actions:
 *   - Each file header has an Apply / Reject toggle
 *   - Global "Apply selected" applies only checked files
 *   - Global "Apply all" / "Reject all" as fallback
 *
 * onApply(selectedPaths) — array of file paths the user accepted.
 * onReject()             — user dismissed the whole diff.
 */

import React, { useMemo, useState } from 'react';
import { Check, X, ChevronDown, ChevronRight, CheckSquare, Square } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

export interface FileDiff {
  path:      string;
  oldLines:  string[];
  newLines:  string[];
  hunks:     DiffHunk[];
  /** Total number of changed lines (added + removed). */
  changedCount: number;
}

interface DiffHunk {
  oldStart: number;
  newStart: number;
  lines:    DiffLine[];
}

interface DiffLine {
  type:    'same' | 'add' | 'remove';
  content: string;
  oldNum?: number;
  newNum?: number;
}

interface DiffPreviewProps {
  diffs:    FileDiff[];
  theme:    'dark' | 'medium' | 'light';
  /** Called with the set of accepted file paths (may be a subset). */
  onApply:  (selectedPaths: string[]) => void;
  onReject: () => void;
}

// ── Simple line-by-line diff (no external library) ─────────────────────────

/**
 * Compute a line-by-line diff between two string arrays using a simple
 * LCS (Longest Common Subsequence) approach.
 */
function computeLineDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const m = oldLines.length;
  const n = newLines.length;

  // For very large files, cap LCS matrix to avoid OOM — fall back to full replace
  if (m * n > 500_000) {
    return [
      ...oldLines.map((l, i) => ({ type: 'remove' as const, content: l, oldNum: i + 1 })),
      ...newLines.map((l, i) => ({ type: 'add' as const, content: l, newNum: i + 1 })),
    ];
  }

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to produce diff
  const result: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: 'same', content: oldLines[i - 1], oldNum: i, newNum: j });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'add', content: newLines[j - 1], newNum: j });
      j--;
    } else {
      result.push({ type: 'remove', content: oldLines[i - 1], oldNum: i });
      i--;
    }
  }

  return result.reverse();
}

/** Group diff lines into contextual hunks with 3 lines of surrounding context. */
function buildHunks(diffLines: DiffLine[]): DiffHunk[] {
  const CONTEXT = 3;
  const changedIndices: number[] = [];
  for (let i = 0; i < diffLines.length; i++) {
    if (diffLines[i].type !== 'same') changedIndices.push(i);
  }
  if (changedIndices.length === 0) return [];

  const hunks: DiffHunk[] = [];
  let start = Math.max(0, changedIndices[0] - CONTEXT);
  let end   = Math.min(diffLines.length - 1, changedIndices[0] + CONTEXT);

  for (let k = 1; k < changedIndices.length; k++) {
    const cStart = Math.max(0, changedIndices[k] - CONTEXT);
    const cEnd   = Math.min(diffLines.length - 1, changedIndices[k] + CONTEXT);
    if (cStart <= end + 1) {
      // Merge with current range
      end = cEnd;
    } else {
      // Emit current hunk
      const lines = diffLines.slice(start, end + 1);
      hunks.push({
        oldStart: lines.find(l => l.oldNum)?.oldNum ?? 1,
        newStart: lines.find(l => l.newNum)?.newNum ?? 1,
        lines,
      });
      start = cStart;
      end = cEnd;
    }
  }
  // Last hunk
  const lines = diffLines.slice(start, end + 1);
  hunks.push({
    oldStart: lines.find(l => l.oldNum)?.oldNum ?? 1,
    newStart: lines.find(l => l.newNum)?.newNum ?? 1,
    lines,
  });

  return hunks;
}

/** Build FileDiff from old/new content strings. */
export function buildFileDiff(path: string, oldContent: string, newContent: string): FileDiff {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const diffLines = computeLineDiff(oldLines, newLines);
  const changedCount = diffLines.filter(l => l.type !== 'same').length;
  const hunks = buildHunks(diffLines);
  return { path, oldLines, newLines, hunks, changedCount };
}

// ── Component ──────────────────────────────────────────────────────────────

const LINE_COLORS = {
  dark:   { add: 'rgba(34,197,94,0.15)',  remove: 'rgba(239,68,68,0.15)',  same: 'transparent' },
  medium: { add: 'rgba(34,197,94,0.12)',  remove: 'rgba(239,68,68,0.12)',  same: 'transparent' },
  light:  { add: 'rgba(34,197,94,0.18)',  remove: 'rgba(239,68,68,0.18)',  same: 'transparent' },
};

const FileSection: React.FC<{
  diff:       FileDiff;
  theme:      'dark' | 'medium' | 'light';
  selected:   boolean;
  onToggle:   () => void;
}> = ({ diff, theme, selected, onToggle }) => {
  const [expanded, setExpanded] = useState(true);
  const isDark = theme !== 'light';
  const colors = LINE_COLORS[theme];
  const textColor    = isDark ? '#e5e7eb' : '#1f2937';
  const dimColor     = isDark ? '#6b7280' : '#9ca3af';
  const borderColor  = isDark ? (selected ? '#374151' : '#1f2937') : (selected ? '#d1d5db' : '#e5e7eb');
  const headerBg     = isDark
    ? (selected ? '#1f2937' : '#111827')
    : (selected ? '#f3f4f6' : '#f9fafb');

  return (
    <div style={{
      marginBottom: 12,
      border: `1px solid ${borderColor}`,
      borderRadius: 8,
      overflow: 'hidden',
      opacity: selected ? 1 : 0.45,
      transition: 'opacity 0.15s, border-color 0.15s',
    }}>
      {/* File header — click path to expand, toggle checkbox to include/exclude */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px',
        background: headerBg,
      }}>
        {/* Include/exclude toggle */}
        <button
          data-testid="diff-file-toggle"
          data-path={diff.path}
          onClick={onToggle}
          title={selected ? 'Exclude this file' : 'Include this file'}
          style={{
            display: 'flex', alignItems: 'center',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: selected ? '#22c55e' : dimColor, padding: 0, flexShrink: 0,
          }}
        >
          {selected ? <CheckSquare size={15} /> : <Square size={15} />}
        </button>

        {/* Expand/collapse + file path */}
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, flex: 1,
            border: 'none', cursor: 'pointer', background: 'transparent',
            color: textColor, fontSize: 13, fontFamily: 'monospace', textAlign: 'left',
          }}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span style={{ fontWeight: 600 }}>{diff.path}</span>
          <span style={{ color: dimColor, marginLeft: 'auto', fontSize: 12, flexShrink: 0 }}>
            {diff.changedCount} line{diff.changedCount !== 1 ? 's' : ''}
          </span>
        </button>
      </div>

      {expanded && (
        <div style={{ overflowX: 'auto' }}>
          {diff.hunks.map((hunk, hi) => (
            <div key={hi}>
              {hi > 0 && (
                <div style={{ padding: '2px 12px', color: dimColor, fontSize: 11, background: isDark ? '#111827' : '#f9fafb' }}>
                  ...
                </div>
              )}
              {hunk.lines.map((line, li) => (
                <div
                  key={`${hi}-${li}`}
                  style={{
                    display: 'flex',
                    background: colors[line.type],
                    fontFamily: 'monospace',
                    fontSize: 12,
                    lineHeight: '20px',
                    whiteSpace: 'pre',
                  }}
                >
                  {/* Line numbers */}
                  <span style={{
                    width: 44, minWidth: 44, textAlign: 'right', paddingRight: 8,
                    color: dimColor, userSelect: 'none', fontSize: 11,
                  }}>
                    {line.oldNum ?? ''}
                  </span>
                  <span style={{
                    width: 44, minWidth: 44, textAlign: 'right', paddingRight: 8,
                    color: dimColor, userSelect: 'none', fontSize: 11,
                  }}>
                    {line.newNum ?? ''}
                  </span>

                  {/* Marker */}
                  <span style={{
                    width: 16, minWidth: 16, textAlign: 'center',
                    color: line.type === 'add' ? '#22c55e' : line.type === 'remove' ? '#ef4444' : dimColor,
                    fontWeight: 600, userSelect: 'none',
                  }}>
                    {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                  </span>

                  {/* Content */}
                  <span style={{ color: textColor, paddingRight: 12 }}>
                    {line.content}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const DiffPreview: React.FC<DiffPreviewProps> = ({ diffs, theme, onApply, onReject }) => {
  const isDark = theme !== 'light';
  const bg       = isDark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.92)';
  const panelBg  = isDark ? '#0f1117' : '#ffffff';
  const textColor = isDark ? '#e5e7eb' : '#1f2937';
  const dimColor  = isDark ? '#9ca3af' : '#6b7280';
  const borderColor = isDark ? '#374151' : '#e5e7eb';

  // Track which files the user wants to include
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(
    () => new Set(diffs.map(d => d.path)),
  );

  const totalChanges = useMemo(() => diffs.reduce((s, d) => s + d.changedCount, 0), [diffs]);
  const selectedCount = selectedPaths.size;
  const allSelected   = selectedCount === diffs.length;
  const noneSelected  = selectedCount === 0;

  const toggleFile = (path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAll  = () => setSelectedPaths(new Set(diffs.map(d => d.path)));
  const selectNone = () => setSelectedPaths(new Set());

  const handleApplySelected = () => {
    if (selectedCount > 0) onApply([...selectedPaths]);
  };

  const handleApplyAll = () => {
    onApply(diffs.map(d => d.path));
  };

  return (
    <div
      data-testid="diff-review-panel"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      <div style={{
        width: '90vw', maxWidth: 960, maxHeight: '88vh',
        background: panelBg, borderRadius: 12,
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: `1px solid ${borderColor}`,
          gap: 12, flexWrap: 'wrap',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: textColor }}>
              Review Changes
            </h2>
            <span style={{ fontSize: 12, color: dimColor }}>
              {diffs.length} file{diffs.length !== 1 ? 's' : ''} · {totalChanges} line{totalChanges !== 1 ? 's' : ''} · {selectedCount} selected
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {/* Select all / none shortcuts */}
            <button
              onClick={allSelected ? selectNone : selectAll}
              style={{
                padding: '5px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                border: `1px solid ${borderColor}`, background: 'transparent', color: dimColor,
              }}
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>

            {/* Reject all */}
            <button
              data-testid="diff-reject-btn"
              onClick={onReject}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '7px 14px', borderRadius: 8, border: `1px solid ${borderColor}`,
                background: 'transparent', color: '#ef4444', cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
              }}
            >
              <X size={13} /> Reject all
            </button>

            {/* Apply selected (disabled when nothing selected) */}
            <button
              data-testid="diff-apply-btn"
              onClick={handleApplySelected}
              disabled={noneSelected}
              title={noneSelected ? 'Select at least one file' : `Apply ${selectedCount} file${selectedCount !== 1 ? 's' : ''}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '7px 14px', borderRadius: 8, border: 'none',
                background: noneSelected ? (isDark ? '#374151' : '#d1d5db') : '#22c55e',
                color: noneSelected ? dimColor : '#fff',
                cursor: noneSelected ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600,
                transition: 'background 0.15s',
              }}
            >
              <Check size={13} />
              {allSelected ? 'Apply all' : `Apply ${selectedCount}`}
            </button>
          </div>
        </div>

        {/* Diff body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
          {diffs.map(d => (
            <FileSection
              key={d.path}
              diff={d}
              theme={theme}
              selected={selectedPaths.has(d.path)}
              onToggle={() => toggleFile(d.path)}
            />
          ))}
        </div>

        {/* Footer hint */}
        {!allSelected && selectedCount > 0 && (
          <div style={{
            padding: '8px 20px', borderTop: `1px solid ${borderColor}`,
            fontSize: 12, color: dimColor, textAlign: 'right',
          }}>
            {diffs.length - selectedCount} file{diffs.length - selectedCount !== 1 ? 's' : ''} will keep their current content
          </div>
        )}
      </div>
    </div>
  );
};
