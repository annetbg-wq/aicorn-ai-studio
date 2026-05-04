import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  getDevAgentCliStatus,
  getDevAgentMode,
  setDevAgentMode,
  type DevAgentProvider,
  type ModeStatus,
} from './ClaudeDevBridge';
import {
  getLocalDevAgentProvider,
  setLocalDevAgentProvider,
  syncLocalDevAgentMode,
} from '../../services/devAgentMode';
import { ConfigService } from '../../services/ConfigService';

const BRIDGE_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000';
const POLL_INTERVAL = 4000;   // bridge health poll, ms
const LOG_LIMIT     = 200;    // max log lines kept

// ── Palette ───────────────────────────────────────────────────────────────────

const C = {
  bg:      '#0d0d1a',
  panel:   '#13131f',
  border:  '#1e1e30',
  row:     '#161625',
  text:    '#d4d4d4',
  dim:     '#5a5a7a',
  ok:      '#30d158',
  warn:    '#f59e0b',
  err:     '#ff453a',
  purple:  '#a78bfa',
  blue:    '#60a5fa',
  green:   '#34d399',
};

// ── Types ─────────────────────────────────────────────────────────────────────

type LogLevel = 'info' | 'ok' | 'warn' | 'error';

interface LogEntry {
  id:      string;
  ts:      number;
  level:   LogLevel;
  source:  string;   // 'bridge' | 'poll' | 'connector' | 'engine'
  message: string;
  detail?: string;   // full error text or response snippet
}

interface ConnectorStatus {
  id:        'claude' | 'codex';
  label:     string;
  available: boolean | null;
  version:   string | null;
  reason?:   string;
}

interface SessionSnap {
  sessionId:     string;
  requests:      number;
  lastModel:     string;
  lastRequestAt: string;
  sizeKb:        number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function fmtTs(ts: number): string {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8);
}

function fmtRelTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000)  return `${Math.round(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
    return `${Math.round(diff / 3_600_000)}h ago`;
  } catch { return iso; }
}

function levelColor(l: LogLevel): string {
  return l === 'error' ? C.err : l === 'warn' ? C.warn : l === 'ok' ? C.ok : C.dim;
}

function levelTag(l: LogLevel): string {
  return l === 'error' ? 'ERR' : l === 'warn' ? 'WRN' : l === 'ok' ? ' OK' : 'INF';
}

// ── StabilityBar ──────────────────────────────────────────────────────────────

const StabilityBar: React.FC<{ logs: LogEntry[] }> = ({ logs }) => {
  const requests = logs.filter(l => l.source === 'bridge' || l.source === 'poll');
  const last20   = requests.slice(-20);
  const okCount  = last20.filter(l => l.level === 'ok').length;
  const pct      = last20.length > 0 ? Math.round((okCount / last20.length) * 100) : 100;
  const color    = pct >= 90 ? C.ok : pct >= 70 ? C.warn : C.err;

  return (
    <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Stability
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>
          {pct}%
        </span>
        <span style={{ fontSize: 10, color: C.dim }}>
          last {last20.length} requests
        </span>
      </div>

      {/* Dot row */}
      <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        {last20.length === 0 ? (
          <span style={{ fontSize: 10, color: C.dim }}>No requests yet</span>
        ) : (
          last20.map((l, i) => (
            <div
              key={i}
              title={`${fmtTs(l.ts)} — ${l.message}`}
              style={{
                width: 10, height: 10, borderRadius: 2, flexShrink: 0,
                background: l.level === 'error' ? C.err : l.level === 'warn' ? C.warn : C.ok,
                opacity: 0.5 + (i / last20.length) * 0.5,
              }}
            />
          ))
        )}
        {last20.length < 20 && Array.from({ length: 20 - last20.length }).map((_, i) => (
          <div key={`empty-${i}`} style={{ width: 10, height: 10, borderRadius: 2, background: C.border }} />
        ))}
      </div>
    </div>
  );
};

// ── ConnectorRow ──────────────────────────────────────────────────────────────

const ConnectorRow: React.FC<{
  conn:    ConnectorStatus;
  active:  boolean;
  onClick: () => void;
}> = ({ conn, active, onClick }) => {
  const dot = conn.available === null ? C.dim : conn.available ? C.ok : C.err;
  const bg  = active ? 'rgba(124,58,237,0.18)' : 'rgba(255,255,255,0.02)';
  const bdr = active ? 'rgba(124,58,237,0.5)' : C.border;

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px', borderRadius: 7, cursor: 'pointer',
        background: bg, border: `1px solid ${bdr}`,
        transition: 'background 0.15s',
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{conn.label}</div>
        <div style={{ fontSize: 10, color: C.dim, marginTop: 1 }}>
          {conn.available === null
            ? 'Checking…'
            : conn.available
              ? conn.version ?? 'connected'
              : conn.reason ?? 'unavailable'}
        </div>
      </div>
      {active && (
        <span style={{ fontSize: 9, fontWeight: 700, color: C.purple, letterSpacing: '0.06em' }}>
          ACTIVE
        </span>
      )}
    </div>
  );
};

// ── LastErrorCard ─────────────────────────────────────────────────────────────

const LastErrorCard: React.FC<{ entry: LogEntry | null }> = ({ entry }) => {
  const [copied, setCopied] = useState(false);

  if (!entry) return null;

  const full = [
    `[${fmtTs(entry.ts)}] ${entry.source.toUpperCase()} — ${entry.message}`,
    entry.detail ? entry.detail : '',
  ].filter(Boolean).join('\n');

  const handleCopy = () => {
    navigator.clipboard.writeText(full).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{
      margin: '0 16px 12px',
      borderRadius: 8,
      border: `1px solid rgba(255,69,58,0.35)`,
      background: 'rgba(255,69,58,0.06)',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 12px',
        background: 'rgba(255,69,58,0.1)',
        borderBottom: '1px solid rgba(255,69,58,0.2)',
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.err, letterSpacing: '0.07em' }}>
          LAST ERROR · {fmtTs(entry.ts)}
        </span>
        <button
          onClick={handleCopy}
          style={{
            padding: '3px 10px', borderRadius: 4, fontSize: 10,
            background: copied ? 'rgba(48,209,88,0.2)' : 'rgba(255,69,58,0.15)',
            border: `1px solid ${copied ? 'rgba(48,209,88,0.4)' : 'rgba(255,69,58,0.3)'}`,
            color: copied ? C.ok : C.err, cursor: 'pointer', fontWeight: 600,
          }}
        >
          {copied ? '✓ Copied' : '⎘ Copy'}
        </button>
      </div>
      <pre style={{
        margin: 0, padding: '8px 12px',
        fontSize: 11, fontFamily: 'monospace', lineHeight: 1.5,
        color: '#ffb3ae', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        maxHeight: 100, overflowY: 'auto',
      }}>
        {entry.message}
        {entry.detail ? `\n${entry.detail}` : ''}
      </pre>
    </div>
  );
};

// ── LogFeed ───────────────────────────────────────────────────────────────────

const LogFeed: React.FC<{
  logs:        LogEntry[];
  onClear:     () => void;
  onCopyReport?: () => void;
  reportCopied?: boolean;
}> = ({ logs, onClear, onCopyReport, reportCopied }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);

  useEffect(() => {
    if (follow) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [logs, follow]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', borderBottom: `1px solid ${C.border}` }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 16px', borderBottom: `1px solid ${C.border}`,
        background: C.panel, flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1 }}>
          Process Log
        </span>
        <span style={{ fontSize: 10, color: C.dim }}>{logs.length} lines</span>
        <button
          onClick={() => setFollow(f => !f)}
          style={{
            padding: '3px 8px', borderRadius: 4, fontSize: 10,
            background: follow ? 'rgba(96,165,250,0.15)' : 'transparent',
            border: `1px solid ${follow ? 'rgba(96,165,250,0.4)' : C.border}`,
            color: follow ? C.blue : C.dim, cursor: 'pointer',
          }}
        >
          {follow ? '↓ Follow' : '⏸ Paused'}
        </button>
        {onCopyReport && (
          <button
            onClick={onCopyReport}
            style={{
              padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700,
              background: reportCopied ? 'rgba(48,209,88,0.18)' : 'rgba(167,139,250,0.15)',
              border: `1px solid ${reportCopied ? 'rgba(48,209,88,0.5)' : 'rgba(167,139,250,0.45)'}`,
              color: reportCopied ? C.ok : C.purple, cursor: 'pointer',
            }}
          >
            {reportCopied ? '✓ Report Copied' : '⎘ Copy Report'}
          </button>
        )}
        <button
          onClick={onClear}
          style={{
            padding: '3px 8px', borderRadius: 4, fontSize: 10,
            background: 'transparent', border: `1px solid ${C.border}`,
            color: C.dim, cursor: 'pointer',
          }}
        >
          Clear
        </button>
      </div>

      {/* Lines */}
      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11 }}
      >
        {logs.length === 0 ? (
          <div style={{ color: C.dim, padding: '20px 16px', textAlign: 'center', fontSize: 12 }}>
            Waiting for activity…
          </div>
        ) : (
          logs.map(l => (
            <div
              key={l.id}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '2px 16px',
                borderLeft: l.level === 'error' ? `2px solid ${C.err}` : 'none',
                background: l.level === 'error' ? 'rgba(255,69,58,0.04)' : 'transparent',
              }}
            >
              <span style={{ color: C.dim, flexShrink: 0, width: 58 }}>{fmtTs(l.ts)}</span>
              <span style={{
                color: levelColor(l.level), flexShrink: 0, width: 28,
                fontWeight: 700, fontSize: 10,
              }}>
                {levelTag(l.level)}
              </span>
              <span style={{ color: C.purple, flexShrink: 0, width: 62, fontSize: 10 }}>[{l.source}]</span>
              <span style={{ color: l.level === 'error' ? '#ffb3ae' : C.text, flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.5 }}>
                {l.message}
                {l.detail && (
                  <span style={{ color: C.dim, display: 'block', marginTop: 1, fontSize: 10 }}>
                    {l.detail.slice(0, 300)}
                  </span>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ── SessionPanel ──────────────────────────────────────────────────────────────

const SessionPanel: React.FC<{ onLog: (e: Omit<LogEntry, 'id' | 'ts'>) => void }> = ({ onLog }) => {
  const [sessions, setSessions]   = useState<SessionSnap[]>([]);
  const [expanded, setExpanded]   = useState(false);
  const prevSnaps                 = useRef<Map<string, number>>(new Map());

  const fetchSessions = useCallback(async () => {
    try {
      const r = await fetch(`${BRIDGE_BASE}/sessions`);
      if (!r.ok) return;
      const data: SessionSnap[] = await r.json();
      if (!Array.isArray(data)) return;
      setSessions(data);

      // Detect new requests in existing sessions
      for (const s of data) {
        const prev = prevSnaps.current.get(s.sessionId);
        if (prev !== undefined && s.requests > prev) {
          onLog({
            level: 'ok', source: 'poll',
            message: `session ${s.sessionId.slice(-6)} → ${s.requests} req · ${s.lastModel}`,
          });
        }
        prevSnaps.current.set(s.sessionId, s.requests);
      }
    } catch { /* bridge unreachable */ }
  }, [onLog]);

  useEffect(() => {
    fetchSessions();
    const t = setInterval(fetchSessions, POLL_INTERVAL);
    return () => clearInterval(t);
  }, [fetchSessions]);

  if (!expanded) {
    return (
      <div
        onClick={() => setExpanded(true)}
        style={{
          padding: '8px 16px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Sessions
        </span>
        <span style={{ fontSize: 10, color: C.purple }}>{sessions.length}</span>
        <span style={{ fontSize: 10, color: C.dim, marginLeft: 'auto' }}>▸ expand</span>
      </div>
    );
  }

  return (
    <div style={{ flexShrink: 0, maxHeight: 160, overflow: 'hidden', display: 'flex', flexDirection: 'column', borderBottom: `1px solid ${C.border}` }}>
      <div
        onClick={() => setExpanded(false)}
        style={{
          padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8,
          cursor: 'pointer', borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Sessions
        </span>
        <span style={{ fontSize: 10, color: C.purple }}>{sessions.length}</span>
        <span style={{ fontSize: 10, color: C.dim, marginLeft: 'auto' }}>▾ collapse</span>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {sessions.length === 0 ? (
          <div style={{ color: C.dim, fontSize: 11, padding: '10px 16px' }}>No sessions</div>
        ) : (
          sessions.map(s => (
            <div key={s.sessionId} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '5px 16px', borderBottom: `1px solid ${C.border}`,
              fontSize: 11, fontFamily: 'monospace',
            }}>
              <span style={{ color: C.purple, flexShrink: 0 }}>{s.sessionId.slice(-8)}</span>
              <span style={{ color: C.text }}>{s.requests}req</span>
              <span style={{ color: C.dim }}>{s.lastModel.replace('claude-', '').replace('-4-6', '')}</span>
              <span style={{ color: C.dim, marginLeft: 'auto' }}>{fmtRelTime(s.lastRequestAt)}</span>
              <span style={{ color: C.dim }}>{s.sizeKb}KB</span>
              <a
                href={`${BRIDGE_BASE}/sessions/${s.sessionId}/download`}
                download
                onClick={e => e.stopPropagation()}
                style={{ color: C.blue, textDecoration: 'none', fontSize: 10 }}
                title="Download"
              >
                ↓
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────

const DevModePanel: React.FC = () => {
  const [logs, setLogs]         = useState<LogEntry[]>([]);
  const [connectors, setConnectors] = useState<ConnectorStatus[]>([
    { id: 'claude', label: 'Claude CLI',  available: null, version: null },
    { id: 'codex',  label: 'Codex (GPT)', available: null, version: null },
  ]);
  const [modeStatus, setModeStatus] = useState<ModeStatus | null>(null);
  const [modeLoading, setModeLoading] = useState(false);
  const [bridgeOk, setBridgeOk]   = useState<boolean | null>(null);
  const prevSessionReqs           = useRef<Map<string, number>>(new Map());

  const pushLog = useCallback((entry: Omit<LogEntry, 'id' | 'ts'>) => {
    setLogs(prev => {
      const next = [...prev, { ...entry, id: makeId(), ts: Date.now() }];
      return next.length > LOG_LIMIT ? next.slice(-LOG_LIMIT) : next;
    });
  }, []);

  // ── Global channel: window.__stabilityLog ─────────────────────────────────
  // Any module in the app can call window.__stabilityLog({ level, source, message, detail })
  // useStudio.addLog is already wired to call this.
  useEffect(() => {
    (window as any).__stabilityLog = pushLog;
    return () => { delete (window as any).__stabilityLog; };
  }, [pushLog]);


  // ── Bridge health + CLI status ─────────────────────────────────────────────
  const pollBridge = useCallback(async () => {
    try {
      const r = await fetch(`${BRIDGE_BASE}/token`);
      const ok = r.ok;
      setBridgeOk(ok);

      if (ok) {
        const d = await r.json();
        setConnectors([
          {
            id: 'claude', label: 'Claude CLI',
            available: !!d?.claude?.available,
            version: d?.claude?.version ?? null,
            reason: d?.claude?.reason ?? '',
          },
          {
            id: 'codex', label: 'Codex (GPT)',
            available: !!d?.codex?.available,
            version: d?.codex?.version ?? null,
            reason: d?.codex?.reason ?? '',
          },
        ]);
      } else {
        setBridgeOk(false);
        pushLog({ level: 'error', source: 'connector', message: `bridge HTTP ${r.status}` });
      }
    } catch (e) {
      setBridgeOk(false);
      setConnectors(prev => prev.map(c => ({ ...c, available: false, reason: 'bridge unreachable' })));
    }
  }, [pushLog]);

  // ── Mode status ────────────────────────────────────────────────────────────
  const pollMode = useCallback(async () => {
    try {
      const mode = await getDevAgentMode();
      setModeStatus(mode);
    } catch { /* ignore */ }
  }, []);

  // ── Initial + interval ────────────────────────────────────────────────────
  useEffect(() => {
    pushLog({ level: 'info', source: 'connector', message: 'Stability Terminal started' });
    pollBridge();
    pollMode();
    const t1 = setInterval(pollBridge, POLL_INTERVAL);
    const t2 = setInterval(pollMode,   POLL_INTERVAL * 2);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [pollBridge, pollMode, pushLog]);

  // Log when bridge status changes
  const prevBridgeOk = useRef<boolean | null>(null);
  useEffect(() => {
    if (bridgeOk === null) return;
    if (prevBridgeOk.current !== null && prevBridgeOk.current !== bridgeOk) {
      pushLog({
        level: bridgeOk ? 'ok' : 'error',
        source: 'connector',
        message: bridgeOk ? 'Bridge reconnected ✓' : 'Bridge disconnected',
      });
    }
    prevBridgeOk.current = bridgeOk;
  }, [bridgeOk, pushLog]);

  // Log connector availability changes
  const prevConn = useRef<string>('');
  useEffect(() => {
    const sig = connectors.map(c => `${c.id}:${c.available}`).join(',');
    if (prevConn.current && prevConn.current !== sig) {
      for (const c of connectors) {
        if (c.available !== null) {
          pushLog({
            level: c.available ? 'ok' : 'warn',
            source: 'connector',
            message: `${c.label}: ${c.available ? 'available' + (c.version ? ` (${c.version})` : '') : (c.reason ?? 'unavailable')}`,
          });
        }
      }
    }
    prevConn.current = sig;
  }, [connectors, pushLog]);

  // ── Provider switch ────────────────────────────────────────────────────────
  const activeProvider: DevAgentProvider =
    modeStatus?.provider === 'codex' ? 'codex'
    : modeStatus?.provider === 'claude' ? 'claude'
    : 'off';

  // Resolve the actual configured Standard provider label dynamically
  const standardProviderLabel = useMemo(() => {
    try {
      const cfg = ConfigService.getAgentConfig('agent_primary');
      const p = cfg?.provider;
      if (!p || p === 'openrouter') return 'Standard (OpenRouter)';
      return `Standard (${p.charAt(0).toUpperCase() + p.slice(1)})`;
    } catch {
      return 'Standard (OpenRouter)';
    }
  }, [activeProvider]);

  const CLAUDE_BRIDGE_CFG = JSON.stringify({
    provider: 'claude-bridge',
    modelId: 'claude-sonnet-4-6',
    fallback1Provider: 'openrouter',
  });

  const handleSetProvider = useCallback(async (next: DevAgentProvider) => {
    setModeLoading(true);
    // Sync AGENT_CONFIG
    if (next === 'claude') {
      const cur = localStorage.getItem('AGENT_CONFIG_agent_primary');
      if (cur) localStorage.setItem('CLAUDE_MAX_PREV_CONFIG', cur);
      localStorage.setItem('AGENT_CONFIG_agent_primary', CLAUDE_BRIDGE_CFG);
      localStorage.setItem('AGENT_CONFIG_agent_build',   CLAUDE_BRIDGE_CFG);
    } else {
      const prev = localStorage.getItem('CLAUDE_MAX_PREV_CONFIG');
      if (prev) {
        localStorage.setItem('AGENT_CONFIG_agent_primary', prev);
        localStorage.setItem('AGENT_CONFIG_agent_build',   prev);
      } else {
        localStorage.removeItem('AGENT_CONFIG_agent_primary');
        localStorage.removeItem('AGENT_CONFIG_agent_build');
      }
    }
    try {
      const mode = await setDevAgentMode(next);
      setModeStatus(mode);
      syncLocalDevAgentMode(mode);
      pushLog({ level: 'ok', source: 'connector', message: `Provider → ${next === 'off' ? standardProviderLabel : next === 'claude' ? 'Claude CLI bridge' : 'Codex bridge'}` });
    } catch (e) {
      setLocalDevAgentProvider(next);
      pushLog({ level: 'warn', source: 'connector', message: `Provider set locally (bridge unreachable): ${next}` });
    } finally {
      setModeLoading(false);
    }
  }, [pushLog, CLAUDE_BRIDGE_CFG]);

  const lastError = [...logs].reverse().find(l => l.level === 'error') ?? null;
  const [reportCopied, setReportCopied] = useState(false);

  const copyReport = useCallback(() => {
    const now = new Date().toISOString();
    const sep = '─'.repeat(60);

    // 1. System snapshot
    const systemLines = [
      `AIC-RG Studio — Bug Report`,
      `Generated: ${now}`,
      sep,
      `Bridge: ${bridgeOk === null ? 'unknown' : bridgeOk ? 'online (:3000)' : 'OFFLINE'}`,
      `Provider: ${modeStatus?.activeProvider ?? activeProvider}`,
      ...connectors.map(c =>
        `  ${c.label}: ${c.available === null ? 'checking' : c.available ? `OK (${c.version ?? '?'})` : `FAIL — ${c.reason ?? 'unreachable'}`}`
      ),
    ];

    // 2. Errors first (most useful for diagnosis)
    const errorLines = logs
      .filter(l => l.level === 'error')
      .map(l => `[${fmtTs(l.ts)}] [ERR] [${l.source}] ${l.message}${l.detail ? '\n    ' + l.detail : ''}`);

    // 3. Full log (last 100 lines)
    const allLines = logs.slice(-100)
      .map(l => `[${fmtTs(l.ts)}] [${levelTag(l.level)}] [${l.source.padEnd(9)}] ${l.message}${l.detail ? '\n    ' + l.detail : ''}`);

    const report = [
      systemLines.join('\n'),
      sep,
      `ERRORS (${errorLines.length}):`,
      errorLines.length > 0 ? errorLines.join('\n') : '  none',
      sep,
      `FULL LOG (last ${allLines.length} lines):`,
      allLines.join('\n'),
    ].join('\n');

    navigator.clipboard.writeText(report).then(() => {
      setReportCopied(true);
      setTimeout(() => setReportCopied(false), 3000);
    });
  }, [logs, bridgeOk, modeStatus, activeProvider, connectors]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: C.bg, color: C.text, fontFamily: 'monospace',
      fontSize: 12,
    }}>

      {/* ── Header ── */}
      <div style={{
        padding: '10px 16px', borderBottom: `1px solid ${C.border}`,
        background: C.panel, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
          Stability Terminal
        </span>
        {/* Bridge health dot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: bridgeOk === null ? C.dim : bridgeOk ? C.ok : C.err,
          }} />
          <span style={{ fontSize: 10, color: C.dim }}>
            {bridgeOk === null ? 'connecting…' : bridgeOk ? 'bridge:3000' : 'bridge offline'}
          </span>
        </div>
        {/* Mode badge */}
        {modeStatus && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
            background: activeProvider === 'claude' ? 'rgba(167,139,250,0.15)'
              : activeProvider === 'codex' ? 'rgba(52,211,153,0.15)'
              : 'rgba(255,255,255,0.05)',
            border: `1px solid ${activeProvider === 'claude' ? 'rgba(167,139,250,0.4)'
              : activeProvider === 'codex' ? 'rgba(52,211,153,0.4)'
              : C.border}`,
            color: activeProvider === 'claude' ? C.purple
              : activeProvider === 'codex' ? C.green : C.dim,
          }}>
            {activeProvider === 'off' ? 'Standard' : activeProvider === 'claude' ? 'Claude Max' : 'Codex'}
          </span>
        )}
        {/* Copy Report — primary action */}
        <button
          onClick={copyReport}
          style={{
            marginLeft: 'auto',
            padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700,
            background: reportCopied ? 'rgba(48,209,88,0.18)' : 'rgba(167,139,250,0.18)',
            border: `1px solid ${reportCopied ? 'rgba(48,209,88,0.5)' : 'rgba(167,139,250,0.5)'}`,
            color: reportCopied ? C.ok : C.purple, cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {reportCopied ? '✓ Copied!' : '⎘ Copy Report'}
        </button>
      </div>

      {/* ── Connectors ── */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          Connectors
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {/* Standard/Off option */}
          <ConnectorRow
            conn={{ id: 'claude', label: standardProviderLabel, available: true, version: 'agents mode' }}
            active={activeProvider === 'off'}
            onClick={() => !modeLoading && handleSetProvider('off')}
          />
          {connectors.map(c => (
            <ConnectorRow
              key={c.id}
              conn={c}
              active={c.id === 'claude' ? activeProvider === 'claude' : activeProvider === 'codex'}
              onClick={() => !modeLoading && handleSetProvider(c.id === 'claude' ? 'claude' : 'codex')}
            />
          ))}
        </div>
      </div>

      {/* ── Stability bar ── */}
      <StabilityBar logs={logs} />

      {/* ── Last error ── */}
      {lastError && (
        <div style={{ padding: '10px 16px 0', flexShrink: 0 }}>
          <LastErrorCard entry={lastError} />
        </div>
      )}

      {/* ── Log feed ── */}
      <LogFeed
        logs={logs}
        onClear={() => setLogs([])}
        onCopyReport={copyReport}
        reportCopied={reportCopied}
      />

      {/* ── Sessions ── */}
      <SessionPanel onLog={pushLog} />

      <style>{`
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
      `}</style>
    </div>
  );
};

export default DevModePanel;
