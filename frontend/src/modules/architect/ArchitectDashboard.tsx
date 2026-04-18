import React, { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { ProjectRepository, type ProjectRecord } from '../../services/ProjectRepository';
import { getArchitectCopy } from './architectureViewModel';
import { ProjectsHub, type StudioProject } from './components/ProjectsHub';
import { BranchArchitectureScreen } from './components/BranchArchitectureScreen';

interface ArchitectDashboardProps {
  theme: 'dark' | 'medium' | 'light';
  projects: StudioProject[];
  currentProjectId: string | null;
  onLoadProject: (p: StudioProject) => void;
  onNavigateEngine: () => void;
  appLanguage: string;
}

function useTheme(theme: 'dark' | 'medium' | 'light') {
  const isDark = theme !== 'light';
  return {
    isDark,
    bg: isDark ? '#07070b' : '#f5f5f5',
    panel: isDark ? '#0d0d12' : '#ffffff',
    panelAlt: isDark ? '#08080e' : '#f9fafb',
    border: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)',
    text: isDark ? '#e5e5ea' : '#111827',
    sub: isDark ? '#6b6b7a' : '#6b7280',
    accent: isDark ? '#a78bfa' : '#7c3aed',
    accentBg: isDark ? 'rgba(167,139,250,0.10)' : 'rgba(124,58,237,0.07)',
    accentBorder: isDark ? 'rgba(167,139,250,0.25)' : 'rgba(124,58,237,0.22)',
    danger: '#ef4444',
  };
}

function StatePanel({
  title,
  body,
  theme,
  tone = 'neutral',
}: {
  title: string;
  body: string;
  theme: ReturnType<typeof useTheme>;
  tone?: 'neutral' | 'error';
}) {
  const color = tone === 'error' ? theme.danger : theme.accent;
  return (
    <div
      style={{
        margin: 20,
        padding: 24,
        borderRadius: 16,
        border: `1px solid ${tone === 'error' ? `${color}33` : theme.border}`,
        background: tone === 'error' ? `${color}10` : theme.panel,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: theme.text }}>{title}</div>
      <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6, color: theme.sub }}>{body}</div>
    </div>
  );
}

const ArchitectDashboard: React.FC<ArchitectDashboardProps> = ({
  theme,
  projects,
  currentProjectId,
  onLoadProject,
  onNavigateEngine,
  appLanguage,
}) => {
  const colors = useTheme(theme);
  const copy = getArchitectCopy(appLanguage);
  const [activeProject, setActiveProject] = useState<ProjectRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!currentProjectId) {
      setActiveProject(null);
      setLoading(false);
      setError(null);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError(null);

    ProjectRepository.getProject(currentProjectId)
      .then(project => {
        if (cancelled) return;
        setActiveProject(project);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setActiveProject(null);
        setLoading(false);
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [currentProjectId]);

  const activeBranchName = activeProject?.branches?.[activeProject.activeBranchId ?? 'main']?.name
    ?? activeProject?.activeBranchId
    ?? null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: colors.bg,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: 48,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 24px',
          borderBottom: `1px solid ${colors.border}`,
          background: colors.panel,
          flexShrink: 0,
        }}
      >
        <Layers size={15} color={colors.accent} />
        <span style={{ fontSize: 14, fontWeight: 700, color: colors.text, letterSpacing: '-0.02em' }}>
          {copy.architectTitle}
        </span>
        <span style={{ fontSize: 11, color: colors.sub }}>— {copy.architectSubtitle}</span>
        <div style={{ flex: 1 }} />

        {activeProject ? (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px',
                borderRadius: 20,
                background: colors.accentBg,
                border: `1px solid ${colors.accentBorder}`,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors.accent }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: colors.accent }}>{activeProject.name}</span>
            </div>
            {activeBranchName ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 12px',
                  borderRadius: 20,
                  background: colors.panelAlt,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: colors.text }}>{activeBranchName}</span>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, background: colors.panelAlt, overflow: 'hidden' }}>
          {loading ? (
            <StatePanel title={copy.loading} body={copy.loadingBody} theme={colors} />
          ) : error ? (
            <StatePanel title={copy.loadErrorTitle} body={`${copy.loadErrorBody} ${error}`} theme={colors} tone="error" />
          ) : !activeProject ? (
            <StatePanel title={copy.noProjectTitle} body={copy.noProjectBody} theme={colors} />
          ) : (
            <BranchArchitectureScreen
              theme={theme}
              project={activeProject}
              appLanguage={appLanguage}
            />
          )}
        </div>

        <aside
          style={{
            width: 360,
            minWidth: 320,
            borderLeft: `1px solid ${colors.border}`,
            background: colors.panel,
            overflow: 'hidden',
          }}
        >
          <ProjectsHub
            theme={theme}
            projects={projects}
            currentProjectId={currentProjectId}
            onLoadProject={onLoadProject}
            onNavigateEngine={onNavigateEngine}
          />
        </aside>
      </div>
    </div>
  );
};

export default ArchitectDashboard;
