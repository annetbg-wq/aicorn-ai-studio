/**
 * ArchitectDashboard — Product Architect module root
 *
 * Layout (3-column):
 *   LEFT  (flex:2) — ProjectsHub   (project cards + actions)
 *   RIGHT (flex:1) — RegistryStatusBlock (entity layer)
 *                  — ModuleReadiness     (implementation readiness)
 *
 * Props are passed from App.tsx; no mock data used.
 */

import React, { useState, useEffect } from 'react';
import { ProjectsHub, type StudioProject } from './components/ProjectsHub';
import { ModuleReadiness } from './components/ModuleReadiness';
import { Layers } from 'lucide-react';

interface ArchitectDashboardProps {
  theme:            'dark' | 'medium' | 'light';
  projects:         StudioProject[];
  currentProjectId: string | null;
  onLoadProject:    (p: StudioProject) => void;
  onNavigateEngine: () => void;
}

const ArchitectDashboard: React.FC<ArchitectDashboardProps> = ({
  theme,
  projects,
  currentProjectId,
  onLoadProject,
  onNavigateEngine,
}) => {
  const [projectFiles, setProjectFiles] = useState<Record<string, string>>({});
  const [loadingFiles, setLoadingFiles]  = useState(true);

  useEffect(() => {
    fetch('/__read_all_preview')
      .then(r => r.json())
      .then(data => {
        setProjectFiles(data.files ?? {});
        setLoadingFiles(false);
      })
      .catch(() => setLoadingFiles(false));
  }, []);

  const isDark  = theme !== 'light';
  const bg      = isDark ? '#07070b'                 : '#f5f5f5';
  const panel   = isDark ? '#0d0d12'                 : '#ffffff';
  const border  = isDark ? 'rgba(255,255,255,0.07)'  : 'rgba(0,0,0,0.08)';
  const txt     = isDark ? '#e5e5ea'                 : '#111827';
  const sub     = isDark ? '#6b6b7a'                 : '#6b7280';
  const hdr     = isDark ? '#5a5a6a'                 : '#9ca3af';
  const accent  = isDark ? '#a78bfa'                 : '#7c3aed';
  const accentBg= isDark ? 'rgba(167,139,250,0.10)'  : 'rgba(124,58,237,0.07)';
  const accentBr= isDark ? 'rgba(167,139,250,0.25)'  : 'rgba(124,58,237,0.22)';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      background: bg,
      overflow: 'hidden',
    }}>

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div style={{
        height: 48,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 24px',
        borderBottom: `1px solid ${border}`,
        background: panel,
        flexShrink: 0,
      }}>
        <Layers size={15} color={accent} />
        <span style={{ fontSize: 14, fontWeight: 700, color: txt, letterSpacing: '-0.02em' }}>
          Product Architect
        </span>
        <span style={{ fontSize: 11, color: sub }}>— Projects &amp; Architecture</span>
        <div style={{ flex: 1 }} />
        {/* Breadcrumb: current project */}
        {currentProjectId && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 12px', borderRadius: 20,
            background: accentBg, border: `1px solid ${accentBr}`,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: accent }}>
              {projects.find(p => p.id === currentProjectId)?.title ?? 'Active Project'}
            </span>
          </div>
        )}
      </div>

      {/* ── Body (3-column layout) ─────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ══ LEFT — Projects Hub ════════════════════════════════════════════ */}
        <div style={{
          flex: 2,
          borderRight: `1px solid ${border}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: isDark ? '#08080e' : '#f9fafb',
        }}>
          <ProjectsHub
            theme={theme}
            projects={projects}
            currentProjectId={currentProjectId}
            onLoadProject={onLoadProject}
            onNavigateEngine={onNavigateEngine}
            projectFiles={projectFiles}
          />
        </div>

        {/* ══ RIGHT — Status + Readiness ══════════════════════════════════== */}
        <div style={{
          flex: 1,
          minWidth: 280,
          maxWidth: 380,
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          overflowY: 'auto',
          padding: '20px 18px',
          background: panel,
        }}>


          {/* Section header: Readiness */}
          <div style={{
            fontSize: 10, fontWeight: 800, color: hdr,
            textTransform: 'uppercase', letterSpacing: '0.11em',
            marginBottom: 10,
          }}>
            Implementation Status
          </div>

          <ModuleReadiness theme={theme} projectFiles={projectFiles} loadingFiles={loadingFiles} />

          {/* Bottom note */}
          <div style={{ marginTop: 20, fontSize: 10, color: sub, lineHeight: 1.55, padding: '12px 14px', borderRadius: 10, background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: `1px solid ${border}` }}>
            <strong style={{ color: isDark ? '#6b6b7a' : '#9ca3af' }}>Architect v1</strong>
            {' '}— Projects Hub manages studio project entities.
            Registry Layer tracks branches and revisions.
            Design Sync connects to Figma Platinum (left sidebar tool).
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArchitectDashboard;
