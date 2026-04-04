/**
 * ModuleReadiness — Project Structure Analyzer
 *
 * Reads live project files from /__read_all_preview bridge and
 * produces a real analysis of the generated project structure.
 */

import React from 'react';

type ReadinessLevel = 'active' | 'partial' | 'planned' | 'missing';

interface CheckEntry {
  label: string;
  status: ReadinessLevel;
  detail: string;
}

const DOT: Record<ReadinessLevel, string> = {
  active:  '#4ade80',
  partial: '#fbbf24',
  planned: '#4b4b5c',
  missing: '#ef4444',
};

const BADGE_LABEL: Record<ReadinessLevel, string> = {
  active:  'Active',
  partial: 'Partial',
  planned: 'Planned',
  missing: 'Missing',
};

const BADGE_CLR: Record<ReadinessLevel, string> = {
  active:  '#4ade80',
  partial: '#fbbf24',
  planned: '#6b6b7a',
  missing: '#ef4444',
};

const SHADCN_LIST = [
  'Button','Card','Input','Badge','Dialog','Select',
  'Progress','Tabs','Sheet','Switch','Textarea','Label',
  'Separator','Skeleton','Toast','Table','DropdownMenu',
];

function extractRoutes(code: string): Array<{ path: string; element: string }> {
  const re = /<Route\s+[^>]*path=["']([^"']+)["'][^>]*element=\{<(\w+)/g;
  const routes: Array<{ path: string; element: string }> = [];
  let m;
  while ((m = re.exec(code)) !== null) {
    routes.push({ path: m[1], element: m[2] });
  }
  return routes;
}

interface ModuleReadinessProps {
  theme: 'dark' | 'medium' | 'light';
  projectFiles: Record<string, string>;
  loadingFiles: boolean;
}

export const ModuleReadiness: React.FC<ModuleReadinessProps> = ({ theme, projectFiles, loadingFiles }) => {
  const isDark   = theme !== 'light';
  const bg       = isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.03)';
  const border   = isDark ? 'rgba(255,255,255,0.07)'  : 'rgba(0,0,0,0.08)';
  const hdr      = isDark ? '#6b6b7a'                 : '#9ca3af';
  const txt      = isDark ? '#d1d1d9'                 : '#374151';
  const sub      = isDark ? '#5a5a6a'                 : '#9ca3af';
  const tblBorder= isDark ? 'rgba(255,255,255,0.05)'  : 'rgba(0,0,0,0.06)';

  // ── Loading state ────────────────────────────────────────────────────────────
  if (loadingFiles) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: sub, fontSize: 13 }}>
        Loading project…
      </div>
    );
  }

  const totalFiles = Object.keys(projectFiles).length;

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (totalFiles === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: sub, fontSize: 13 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
        <div style={{ fontWeight: 500, marginBottom: 6, color: txt }}>No project yet</div>
        <div style={{ fontSize: 12 }}>Generate an app in System Engine to see its architecture here</div>
      </div>
    );
  }

  // ── Analysis ─────────────────────────────────────────────────────────────────
  const fileList   = Object.keys(projectFiles);
  const pages      = fileList.filter(f => f.startsWith('pages/')).length;
  const components = fileList.filter(f => f.startsWith('components/')).length;
  const contexts   = fileList.filter(f => f.startsWith('contexts/')).length;
  const hooks      = fileList.filter(f => f.startsWith('hooks/')).length;
  const allCode    = Object.values(projectFiles).join('\n');

  const shadcnUsed = SHADCN_LIST.filter(c =>
    allCode.includes(`from '@/components/ui/${c.toLowerCase()}'`) ||
    allCode.includes(`<${c}`)
  );

  const checks: CheckEntry[] = [
    {
      label:  'Pages',
      status: pages > 0 ? 'active' : 'missing',
      detail: pages > 0 ? `${pages} page${pages > 1 ? 's' : ''}` : 'No pages found',
    },
    {
      label:  'Components',
      status: components > 0 ? 'active' : 'planned',
      detail: components > 0 ? `${components} components` : 'No custom components',
    },
    {
      label:  'State management',
      status: contexts > 0 ? 'active' : hooks > 0 ? 'partial' : 'planned',
      detail: contexts > 0 ? `${contexts} contexts` : hooks > 0 ? `${hooks} hooks` : 'App.tsx state only',
    },
    {
      label:  'Routing',
      status: allCode.includes('react-router-dom') ? 'active' : 'planned',
      detail: allCode.includes('react-router-dom') ? 'react-router-dom' : 'Single page',
    },
    {
      label:  'shadcn/ui',
      status: shadcnUsed.length > 0 ? 'active' : 'planned',
      detail: shadcnUsed.length > 0 ? `${shadcnUsed.length} components` : 'Not used',
    },
    {
      label:  'TypeScript types',
      status: allCode.includes('interface ') || allCode.includes('type ') ? 'active' : 'partial',
      detail: allCode.includes('interface ') ? 'Interfaces defined' : 'Minimal typing',
    },
  ];

  const appCode = projectFiles['App.tsx'] ?? '';
  const routes  = extractRoutes(appCode);

  return (
    <div style={{ borderRadius: 14, border: `1px solid ${border}`, background: bg, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        padding: '11px 15px 9px',
        borderBottom: `1px solid ${border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: hdr, textTransform: 'uppercase', letterSpacing: '0.11em' }}>
          Project Analysis
        </span>
        <span style={{ fontSize: 10, color: sub }}>{totalFiles} files</span>
      </div>

      {/* Checks */}
      <div style={{ padding: '6px 0' }}>
        {checks.map(m => (
          <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 15px' }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: DOT[m.status], flexShrink: 0,
              boxShadow: m.status === 'active' ? `0 0 5px ${DOT[m.status]}55` : 'none',
            }} />
            <span style={{ fontSize: 12, color: txt, flex: 1, fontWeight: 500 }}>{m.label}</span>
            <span style={{ fontSize: 10, color: sub, marginRight: 4 }}>{m.detail}</span>
            <span style={{
              fontSize: 9, fontWeight: 800, color: BADGE_CLR[m.status],
              background: `${DOT[m.status]}18`, border: `1px solid ${DOT[m.status]}33`,
              padding: '2px 7px', borderRadius: 20, textTransform: 'uppercase',
              letterSpacing: '0.06em', flexShrink: 0,
            }}>
              {BADGE_LABEL[m.status]}
            </span>
          </div>
        ))}
      </div>

      {/* Routes table */}
      {routes.length > 0 && (
        <>
          <div style={{ height: 1, background: border }} />
          <div style={{ padding: '9px 15px 5px' }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: hdr, textTransform: 'uppercase', letterSpacing: '0.11em' }}>
              Routes ({routes.length})
            </span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '3px 15px', color: sub, fontWeight: 600, fontSize: 10, borderBottom: `1px solid ${tblBorder}` }}>Path</th>
                <th style={{ textAlign: 'left', padding: '3px 15px', color: sub, fontWeight: 600, fontSize: 10, borderBottom: `1px solid ${tblBorder}` }}>Component</th>
              </tr>
            </thead>
            <tbody>
              {routes.map(r => (
                <tr key={r.path} style={{ borderBottom: `1px solid ${tblBorder}` }}>
                  <td style={{ padding: '5px 15px', fontFamily: 'monospace', color: txt, fontSize: 11 }}>{r.path}</td>
                  <td style={{ padding: '5px 15px', color: sub, fontSize: 11 }}>{r.element}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ height: 8 }} />
        </>
      )}
    </div>
  );
};
