import React, { useState } from 'react';
import type { ProjectMeta } from '../services/ProjectManager';

interface ProjectsListProps {
  projects:         ProjectMeta[];
  currentProjectId: string | null;
  onSwitch:         (id: string) => void;
  onDelete:         (id: string) => void;
  onNew:            () => void;
  isGenerating:     boolean;
  isDark:           boolean;
}

// Theme indicator colours — one dot per CSS theme name.
const THEME_COLORS: Record<string, string> = {
  'dark-slate': '#475569',
  'trust':      '#3b82f6',
  'warm':       '#f59e0b',
  'neon':       '#22d3ee',
  'bloom':      '#ec4899',
};

const formatDate = (iso: string): string => {
  const d      = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH   = Math.floor(diffMin / 60);
  const diffD   = Math.floor(diffH / 24);
  if (diffMin < 1)  return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffH   < 24) return `${diffH}h ago`;
  if (diffD   < 7)  return `${diffD}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const ProjectsList: React.FC<ProjectsListProps> = ({
  projects,
  currentProjectId,
  onSwitch,
  onDelete,
  onNew,
  isGenerating,
  isDark,
}) => {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Derived colours — same palette as LeftPanel
  const borderColor  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const subText      = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.3)';
  const textColor    = isDark ? 'rgba(255,255,255,0.85)' : '#111';
  const hoverBg      = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
  const activeBg     = isDark ? 'rgba(59,130,246,0.12)'  : 'rgba(59,130,246,0.08)';
  const activeText   = isDark ? '#93c5fd'                : '#1d4ed8';

  // Sort: current project first, then by updatedAt descending
  const sorted = [...projects].sort((a, b) => {
    if (a.id === currentProjectId) return -1;
    if (b.id === currentProjectId) return 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>

      {/* Section header + New button */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '6px 4px 4px',
      }}>
        <span style={{
          fontSize:      11,
          fontWeight:    500,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color:         subText,
        }}>
          Projects{projects.length > 0 ? ` (${projects.length})` : ''}
        </span>

        <button
          onClick={onNew}
          disabled={isGenerating}
          style={{
            display:    'flex',
            alignItems: 'center',
            gap:        4,
            padding:    '3px 8px',
            fontSize:   11,
            fontWeight: 500,
            borderRadius: 5,
            border:     `1px solid ${borderColor}`,
            background: 'transparent',
            color:      subText,
            cursor:     isGenerating ? 'not-allowed' : 'pointer',
            opacity:    isGenerating ? 0.4 : 1,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            if (!isGenerating) {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.background = hoverBg;
              el.style.color      = textColor;
              el.style.borderColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
            }
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.background  = 'transparent';
            el.style.color       = subText;
            el.style.borderColor = borderColor;
          }}
        >
          <span style={{ fontSize: 13, lineHeight: 1, marginTop: -1 }}>+</span>
          New
        </button>
      </div>

      {/* Empty state */}
      {projects.length === 0 && (
        <div style={{
          padding:    '10px 4px',
          fontSize:   11,
          color:      subText,
          textAlign:  'center',
          fontStyle:  'italic',
          lineHeight: 1.5,
        }}>
          No projects yet.
          <br />
          Describe an app to get started.
        </div>
      )}

      {/* Project rows */}
      {sorted.map(project => {
        const isCurrent    = project.id === currentProjectId;
        const isConfirming = confirmDeleteId === project.id;

        return (
          <div
            key={project.id}
            style={{
              display:    'flex',
              alignItems: 'center',
              gap:        7,
              padding:    '6px 8px',
              borderRadius: 6,
              cursor:     isCurrent || isGenerating ? 'default' : 'pointer',
              background: isCurrent ? activeBg : 'transparent',
              transition: 'background 0.12s',
              position:   'relative',
            }}
            onMouseEnter={e => {
              if (!isCurrent) (e.currentTarget as HTMLElement).style.background = hoverBg;
              const btn = (e.currentTarget as HTMLElement).querySelector('.proj-del-btn') as HTMLElement | null;
              if (btn) btn.style.opacity = '1';
            }}
            onMouseLeave={e => {
              if (!isCurrent) (e.currentTarget as HTMLElement).style.background = 'transparent';
              if (!isConfirming) {
                const btn = (e.currentTarget as HTMLElement).querySelector('.proj-del-btn') as HTMLElement | null;
                if (btn) btn.style.opacity = '0';
              }
            }}
            onClick={() => {
              if (!isCurrent && !isGenerating) onSwitch(project.id);
            }}
          >
            {/* Theme colour dot */}
            <div style={{
              width:       7,
              height:      7,
              borderRadius: '50%',
              flexShrink:  0,
              background:  THEME_COLORS[project.theme] ?? subText,
              opacity:     isCurrent ? 1 : 0.65,
            }} />

            {/* Name + timestamp */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize:     12,
                fontWeight:   isCurrent ? 600 : 400,
                color:        isCurrent ? activeText : textColor,
                whiteSpace:   'nowrap',
                overflow:     'hidden',
                textOverflow: 'ellipsis',
              }}>
                {project.name || 'Untitled'}
              </div>
              <div style={{ fontSize: 10, color: subText, marginTop: 1 }}>
                {formatDate(project.updatedAt)}
              </div>
            </div>

            {/* Delete control */}
            {isConfirming ? (
              <div
                style={{ display: 'flex', gap: 4 }}
                onClick={e => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    onDelete(project.id);
                    setConfirmDeleteId(null);
                  }}
                  style={{
                    padding:    '2px 7px',
                    fontSize:   10,
                    fontWeight: 500,
                    borderRadius: 4,
                    border:     '1px solid rgba(239,68,68,0.45)',
                    background: 'rgba(239,68,68,0.1)',
                    color:      '#ef4444',
                    cursor:     'pointer',
                  }}
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  style={{
                    padding:    '2px 7px',
                    fontSize:   10,
                    borderRadius: 4,
                    border:     `1px solid ${borderColor}`,
                    background: 'transparent',
                    color:      subText,
                    cursor:     'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="proj-del-btn"
                onClick={e => {
                  e.stopPropagation();
                  setConfirmDeleteId(project.id);
                }}
                style={{
                  opacity:    0,
                  padding:    '1px 5px',
                  fontSize:   14,
                  lineHeight: 1,
                  borderRadius: 4,
                  border:     'none',
                  background: 'transparent',
                  color:      subText,
                  cursor:     'pointer',
                  transition: 'opacity 0.15s',
                  flexShrink: 0,
                }}
                title="Delete project"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};
