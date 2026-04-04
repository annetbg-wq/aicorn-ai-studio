import React, { useState, useEffect } from 'react';
import { ChevronUp, Trash2, Copy, Download, BarChart2 } from 'lucide-react';
import { metricsService, MetricsSummary } from '../services/MetricsService';

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  time: string;
}

interface ModuleStatus {
  name: string;
  status: 'ok' | 'error' | 'idle';
}

interface StudioTerminalProps {
  logs: LogEntry[];
  modules: ModuleStatus[];
  supabaseUrl?: string;
  supabaseOk?: boolean;
  onClear?: () => void;
}

export const StudioTerminal: React.FC<StudioTerminalProps> = ({
  logs,
  modules,
  supabaseUrl,
  supabaseOk,
  onClear,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'logs' | 'metrics'>('logs');
  const [metricsSummary, setMetricsSummary] = useState<MetricsSummary>(() => metricsService.getSummary());

  useEffect(() => {
    const refresh = () => setMetricsSummary(metricsService.getSummary());
    window.addEventListener('studio-metrics', refresh);
    return () => window.removeEventListener('studio-metrics', refresh);
  }, []);

  const statusColor = {
    ok: '#34d399',
    error: '#ef4444',
    idle: '#6b7280',
  };

  const levelColor = {
    info: '#60a5fa',
    warn: '#fbbf24',
    error: '#ef4444',
  };

  const copyLogs = () => {
    const text = logs.map(l => `[${l.time}] ${l.level.toUpperCase()}: ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportLogs = () => {
    const text = logs.map(l => `[${l.time}] ${l.level.toUpperCase()}: ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `studio-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: isMinimized ? 40 : 220,
        background: '#050505',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
        transition: 'height 0.2s ease',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderBottom: isMinimized ? 'none' : '1px solid rgba(255,255,255,0.05)',
          background: '#0a0a0c',
          cursor: 'pointer',
        }}
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          <ChevronUp
            size={14}
            style={{
              color: '#666',
              transform: isMinimized ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s',
            }}
          />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase' }}>
            Studio Terminal
          </span>

          {/* Tab switcher */}
          {!isMinimized && (
            <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
              {(['logs', 'metrics'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: '2px 9px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                    background: tab === t ? 'rgba(96,165,250,0.12)' : 'transparent',
                    border: `1px solid ${tab === t ? 'rgba(96,165,250,0.25)' : 'transparent'}`,
                    color: tab === t ? '#60a5fa' : '#555', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  {t === 'metrics' && <BarChart2 size={9} />}
                  {t === 'logs' ? 'Logs' : 'Метрики'}
                </button>
              ))}
            </div>
          )}

          {/* Module status indicators */}
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            {modules.map(m => (
              <div
                key={m.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 10,
                  color: '#555',
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: statusColor[m.status],
                    boxShadow: `0 0 4px ${statusColor[m.status]}`,
                  }}
                />
                {m.name}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={(e) => { e.stopPropagation(); exportLogs(); }}
            title="Export logs as .txt"
            style={{
              padding: '4px 8px',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.02)',
              border: 'none',
              color: '#555',
              cursor: 'pointer',
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: '0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
              (e.currentTarget as HTMLElement).style.color = '#888';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
              (e.currentTarget as HTMLElement).style.color = '#555';
            }}
          >
            <Download size={12} />
            Export
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              copyLogs();
            }}
            title="Copy logs"
            style={{
              padding: '4px 8px',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.02)',
              border: 'none',
              color: '#555',
              cursor: 'pointer',
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: '0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
              (e.currentTarget as HTMLElement).style.color = '#888';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
              (e.currentTarget as HTMLElement).style.color = '#555';
            }}
          >
            <Copy size={12} />
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClear?.();
            }}
            title="Clear logs"
            style={{
              padding: '4px 8px',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.02)',
              border: 'none',
              color: '#555',
              cursor: 'pointer',
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: '0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
              (e.currentTarget as HTMLElement).style.color = '#ef4444';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
              (e.currentTarget as HTMLElement).style.color = '#555';
            }}
          >
            <Trash2 size={12} />
            Clear
          </button>
        </div>
      </div>

      {/* Panel content */}
      {!isMinimized && tab === 'logs' && (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 12px',
            fontFamily: 'monospace',
            fontSize: 11,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {logs.length === 0 ? (
            <div style={{ color: '#444', textAlign: 'center', marginTop: 'auto', marginBottom: 'auto' }}>
              No logs yet
            </div>
          ) : (
            logs.map((log, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  gap: 8,
                  color: levelColor[log.level],
                }}
              >
                <span style={{ color: '#666', minWidth: 70 }}>[{log.time}]</span>
                <span style={{ color: '#888', minWidth: 50 }}>{log.level.toUpperCase()}</span>
                <span>{log.message}</span>
              </div>
            ))
          )}
        </div>
      )}

      {!isMinimized && tab === 'metrics' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px', display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {[
            { label: 'Total calls',  value: String(metricsSummary.totalCalls),                        color: '#60a5fa' },
            { label: 'Total cost',   value: metricsSummary.totalCost < 0.0001 ? '$0' : `$${metricsSummary.totalCost.toFixed(4)}`, color: '#f59e0b' },
            { label: 'Errors',       value: String(metricsSummary.errors),                            color: metricsSummary.errors > 0 ? '#ef4444' : '#34d399' },
            { label: 'In tokens',    value: metricsSummary.totalInputTokens.toLocaleString(),         color: '#34d399' },
            { label: 'Out tokens',   value: metricsSummary.totalOutputTokens.toLocaleString(),        color: '#a78bfa' },
          ].map(stat => (
            <div key={stat.label} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 90 }}>
              <span style={{ fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stat.label}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: stat.color, fontFamily: 'monospace' }}>{stat.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const LOGS_STORAGE_KEY = 'STUDIO_TERMINAL_LOGS';
const MAX_PERSISTED_LOGS = 200;

// Hook untuk managing terminal logs
export function useStudioLogs() {
  const [logs, setLogs] = React.useState<LogEntry[]>(() => {
    try {
      const stored = localStorage.getItem(LOGS_STORAGE_KEY);
      return stored ? (JSON.parse(stored) as LogEntry[]) : [];
    } catch {
      return [];
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(logs.slice(-MAX_PERSISTED_LOGS)));
    } catch {
      // localStorage quota exceeded — skip silently
    }
  }, [logs]);

  const addLog = (level: 'info' | 'warn' | 'error', message: string) => {
    setLogs(prev => [...prev, { level, message, time: new Date().toLocaleTimeString() }]);
  };

  const clearLogs = () => {
    setLogs([]);
    localStorage.removeItem(LOGS_STORAGE_KEY);
  };

  return { logs, addLog, clearLogs };
}
