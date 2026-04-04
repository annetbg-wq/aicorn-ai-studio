/**
 * EngineTopBar — thin header strip above the Engine workspace.
 * Shows: project name (left) · sync status + last-saved time (center) · Backup button (right).
 */

import React from 'react';
import { Upload, Loader2, CheckCircle2, WifiOff, GitBranch, GitCommit, CheckCircle } from 'lucide-react';

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'Never';
  const diff = Date.now() - new Date(isoString).getTime();
  const sec  = Math.floor(diff / 1_000);
  if (sec < 60)   return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60)   return `${min} min ago`;
  const h   = Math.floor(min / 60);
  if (h   < 24)   return `${h} h ago`;
  return new Date(isoString).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export interface DevIdentity {
  origin:           string;
  host:             string;
  port:             number;
  pid:              number;
  startedAt:        string;
  serverInstanceId: string;
}

interface EngineTopBarProps {
  projectName:       string;
  isSyncing:         boolean;
  lastSyncAt:        string | null;
  cloudAvailable:    boolean;
  isDark:            boolean;
  onBackup:          () => void;
  // Architectural context
  activeBranch?:     string;
  activeRevision?:   number;
  lastGoodRevision?: number;
  // Runtime dev-server identity
  devIdentity?:      DevIdentity | null;
}

export const EngineTopBar: React.FC<EngineTopBarProps> = ({
  projectName, isSyncing, lastSyncAt, cloudAvailable, isDark, onBackup,
  activeBranch = 'main', activeRevision, lastGoodRevision, devIdentity,
}) => {
  const bg       = isDark ? 'rgba(8,8,12,0.95)'          : 'rgba(250,250,252,0.95)';
  const border   = isDark ? 'rgba(255,255,255,0.05)'     : 'rgba(0,0,0,0.06)';
  const text     = isDark ? 'rgba(255,255,255,0.55)'     : 'rgba(0,0,0,0.45)';
  const textMain = isDark ? 'rgba(255,255,255,0.75)'     : 'rgba(0,0,0,0.7)';

  const [saved, setSaved] = React.useState(false);

  const handleBackup = async () => {
    onBackup();
    // Brief "Saved!" flash after 1.5 s (optimistic)
    setTimeout(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 1500);
  };

  return (
    <div style={{
      height: 38, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 14px',
      background: bg,
      borderBottom: `1px solid ${border}`,
    }}>
      {/* ── Left: project → branch → revision → last good ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, minWidth: 0, overflow: 'hidden' }}>
        {/* Cloud dot */}
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: cloudAvailable ? '#4ade80' : '#6b7280',
          boxShadow:  cloudAvailable ? '0 0 6px #4ade8066' : 'none',
          flexShrink: 0, marginRight: 8,
        }} />

        {/* Project */}
        <span style={{ fontSize: 12, fontWeight: 600, color: textMain, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>
          {projectName || 'New Project'}
        </span>

        {/* Branch */}
        <span style={{ fontSize: 11, color: text, margin: '0 5px' }}>/</span>
        <GitBranch size={10} color={text} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: text, marginLeft: 3, whiteSpace: 'nowrap' }}>
          {activeBranch}
        </span>

        {/* Revision */}
        {activeRevision !== undefined && (
          <>
            <span style={{ fontSize: 11, color: text, margin: '0 6px' }}>·</span>
            <GitCommit size={10} color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)'} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)', marginLeft: 3, whiteSpace: 'nowrap' }}>
              rev #{activeRevision}
            </span>
          </>
        )}

        {/* Last Good */}
        {lastGoodRevision !== undefined && lastGoodRevision > 0 && (
          <>
            <span style={{ fontSize: 11, color: text, margin: '0 6px' }}>·</span>
            <CheckCircle size={10} color="#4ade80" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: '#4ade80', marginLeft: 3, whiteSpace: 'nowrap' }}>
              #{lastGoodRevision}
            </span>
          </>
        )}

        {/* Dev identity badge */}
        {devIdentity && (
          <span
            title={`Origin: ${devIdentity.origin}  PID: ${devIdentity.pid}  Started: ${devIdentity.startedAt}  Instance: ${devIdentity.serverInstanceId}`}
            style={{
              marginLeft: 10, padding: '1px 6px', borderRadius: 4,
              fontSize: 10, fontFamily: 'monospace', whiteSpace: 'nowrap',
              color: isDark ? 'rgba(250,204,21,0.7)' : 'rgba(120,80,0,0.65)',
              background: isDark ? 'rgba(250,204,21,0.08)' : 'rgba(250,204,21,0.15)',
              border: `1px solid ${isDark ? 'rgba(250,204,21,0.18)' : 'rgba(250,204,21,0.4)'}`,
              cursor: 'default',
            }}
          >
            :{devIdentity.port} · pid {devIdentity.pid} · {devIdentity.startedAt.slice(11, 19)} · {devIdentity.serverInstanceId}
          </span>
        )}
      </div>

      {/* ── Center: sync status ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {!cloudAvailable ? (
          <><WifiOff size={10} color="#6b7280" /><span style={{ fontSize: 10, color: text }}>Local only</span></>
        ) : isSyncing ? (
          <><Loader2 size={10} color="#60a5fa" style={{ animation: 'spin 1s linear infinite' }} /><span style={{ fontSize: 10, color: '#60a5fa' }}>Syncing…</span></>
        ) : saved ? (
          <><CheckCircle2 size={10} color="#4ade80" /><span style={{ fontSize: 10, color: '#4ade80' }}>Saved!</span></>
        ) : (
          <span style={{ fontSize: 10, color: text }}>
            {lastSyncAt ? `Backed up ${formatRelativeTime(lastSyncAt)}` : 'Not backed up'}
          </span>
        )}
      </div>

      {/* ── Right: Backup to Cloud button ── */}
      <button
        onClick={handleBackup}
        disabled={isSyncing || !cloudAvailable}
        title={cloudAvailable ? 'Backup to Cloud' : 'Supabase unavailable'}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 7,
          fontSize: 11, fontWeight: 600,
          color:      cloudAvailable ? '#60a5fa' : text,
          background: cloudAvailable ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.04)',
          border:     `1px solid ${cloudAvailable ? 'rgba(59,130,246,0.25)' : border}`,
          cursor:     isSyncing || !cloudAvailable ? 'not-allowed' : 'pointer',
          opacity:    isSyncing || !cloudAvailable ? 0.6 : 1,
          transition: 'all 0.18s',
        }}
      >
        <Upload size={12} />
        Backup to Cloud
      </button>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
