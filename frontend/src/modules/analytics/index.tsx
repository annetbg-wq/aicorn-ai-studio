import React, { useState, useEffect, useCallback } from 'react';
import { metricsService, AgentMetrics, MetricsSummary } from '../../services/MetricsService';
import { BarChart2, Activity, Shield, Clock, AlertTriangle, Trash2, RefreshCw } from 'lucide-react';

// ── Section tabs ──────────────────────────────────────────────────────────────

type Section = 'costs' | 'performance' | 'health' | 'sessions' | 'errors';

const SECTIONS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: 'costs',       label: 'Costs',       icon: BarChart2     },
  { id: 'performance', label: 'Performance', icon: Activity      },
  { id: 'health',      label: 'Health',      icon: Shield        },
  { id: 'sessions',    label: 'Sessions',    icon: Clock         },
  { id: 'errors',      label: 'Errors',      icon: AlertTriangle },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return `$${(usd * 1000).toFixed(3)}m`;
  return `$${usd.toFixed(4)}`;
}

function phaseColor(phase: string): string {
  const map: Record<string, string> = {
    orchestrator: '#60a5fa',
    selfcorrect:  '#f59e0b',
    scanner:      '#34d399',
    bundler:      '#a78bfa',
    specagent:    '#f472b6',
    buildagent:   '#fb923c',
    qaagent:      '#38bdf8',
    clarify:      '#e879f9',
    agentloop:    '#facc15',
  };
  return map[phase] ?? '#9ca3af';
}

// ── Cost Section ──────────────────────────────────────────────────────────────

const CostSection: React.FC<{ summary: MetricsSummary }> = ({ summary }) => {
  const phases = Object.entries(summary.byPhase).sort((a, b) => b[1].cost - a[1].cost);
  const maxCost = Math.max(...phases.map(([, v]) => v.cost), 0.000001);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: 'Total cost',   value: fmtCost(summary.totalCost),        color: '#f59e0b' },
          { label: 'Total calls',  value: String(summary.totalCalls),         color: '#60a5fa' },
          { label: 'Input tokens', value: summary.totalInputTokens.toLocaleString(), color: '#34d399' },
        ].map(card => (
          <div key={card.label} style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 10, padding: '14px 16px',
          }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>{card.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: card.color, fontFamily: 'monospace' }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Cost by phase bar chart */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
          Cost by Phase
        </div>
        {phases.length === 0 ? (
          <div style={{ color: '#444', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>No data yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {phases.map(([phase, data]) => (
              <div key={phase} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ minWidth: 100, fontSize: 11, color: phaseColor(phase), fontWeight: 600 }}>{phase}</div>
                <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    width: `${(data.cost / maxCost) * 100}%`,
                    background: phaseColor(phase),
                    transition: 'width 0.4s ease',
                  }} />
                </div>
                <div style={{ minWidth: 70, fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', textAlign: 'right' }}>
                  {fmtCost(data.cost)}
                </div>
                <div style={{ minWidth: 50, fontSize: 10, color: '#444', textAlign: 'right' }}>{data.calls} calls</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Performance Section ───────────────────────────────────────────────────────

const PerformanceSection: React.FC<{ entries: AgentMetrics[] }> = ({ entries }) => {
  const withDuration = entries.filter(e => e.durationMs && !e.error);

  // avg duration per phase
  const byPhase: Record<string, { total: number; count: number }> = {};
  for (const e of withDuration) {
    if (!byPhase[e.phase]) byPhase[e.phase] = { total: 0, count: 0 };
    byPhase[e.phase].total += e.durationMs!;
    byPhase[e.phase].count++;
  }
  const phases = Object.entries(byPhase)
    .map(([phase, { total, count }]) => ({ phase, avg: total / count, count }))
    .sort((a, b) => b.avg - a.avg);

  // Top 5 slowest calls
  const slowest = [...withDuration].sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0)).slice(0, 5);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Avg duration by phase */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
          Average Duration by Phase
        </div>
        {phases.length === 0 ? (
          <div style={{ color: '#444', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>No data yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {phases.map(p => {
              const maxMs = phases[0].avg;
              return (
                <div key={p.phase} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ minWidth: 100, fontSize: 11, color: phaseColor(p.phase), fontWeight: 600 }}>{p.phase}</div>
                  <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      width: `${(p.avg / maxMs) * 100}%`,
                      background: phaseColor(p.phase),
                    }} />
                  </div>
                  <div style={{ minWidth: 60, fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', textAlign: 'right' }}>
                    {fmt(Math.round(p.avg))}
                  </div>
                  <div style={{ minWidth: 50, fontSize: 10, color: '#444', textAlign: 'right' }}>{p.count}×</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Slowest calls */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
          Top 5 Slowest Calls
        </div>
        {slowest.length === 0 ? (
          <div style={{ color: '#444', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>No data yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {slowest.map(e => (
              <div key={e.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.02)', borderRadius: 7, padding: '7px 10px',
              }}>
                <span style={{ fontSize: 11, color: phaseColor(e.phase), minWidth: 100, fontWeight: 600 }}>{e.phase}</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', minWidth: 60 }}>{fmt(e.durationMs!)}</span>
                {e.model && <span style={{ fontSize: 10, color: '#555' }}>{e.model}</span>}
                <span style={{ fontSize: 10, color: '#444', marginLeft: 'auto' }}>{new Date(e.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── System Health Section ─────────────────────────────────────────────────────

const HealthSection: React.FC<{ summary: MetricsSummary; entries: AgentMetrics[] }> = ({ summary, entries }) => {
  const errorRate = summary.totalCalls > 0 ? (summary.errors / summary.totalCalls) * 100 : 0;
  const lastError = [...entries].reverse().find(e => e.error);
  const recentEntries = entries.slice(-20);
  const recentErrors = recentEntries.filter(e => e.error).length;

  const modules = [
    { name: 'Orchestrator', phase: 'orchestrator', ok: !summary.byPhase['orchestrator']?.errors },
    { name: 'SelfCorrect',  phase: 'selfcorrect',  ok: !summary.byPhase['selfcorrect']?.errors  },
    { name: 'Scanner',      phase: 'scanner',      ok: !summary.byPhase['scanner']?.errors      },
    { name: 'Bundler',      phase: 'bundler',       ok: !summary.byPhase['bundler']?.errors       },
    { name: 'SpecAgent',    phase: 'specagent',    ok: !summary.byPhase['specagent']?.errors     },
    { name: 'BuildAgent',   phase: 'buildagent',   ok: !summary.byPhase['buildagent']?.errors    },
    { name: 'QAAgent',      phase: 'qaagent',      ok: !summary.byPhase['qaagent']?.errors       },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Health metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: 'Error rate',      value: `${errorRate.toFixed(1)}%`, color: errorRate > 10 ? '#ef4444' : '#34d399' },
          { label: 'Total errors',    value: String(summary.errors),     color: summary.errors > 0 ? '#f59e0b' : '#34d399' },
          { label: 'Recent errors',   value: String(recentErrors),       color: recentErrors > 0  ? '#ef4444' : '#34d399' },
        ].map(card => (
          <div key={card.label} style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 10, padding: '14px 16px',
          }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>{card.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: card.color, fontFamily: 'monospace' }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Module status */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
          Module Status
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {modules.map(m => {
            const calls = summary.byPhase[m.phase]?.calls ?? 0;
            return (
              <div key={m.name} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.02)', borderRadius: 7, padding: '8px 10px',
              }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: calls === 0 ? '#374151' : m.ok ? '#34d399' : '#ef4444',
                  boxShadow: calls > 0 ? `0 0 5px ${m.ok ? '#34d39966' : '#ef444466'}` : 'none',
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', flex: 1 }}>{m.name}</span>
                <span style={{ fontSize: 10, color: '#444', fontFamily: 'monospace' }}>{calls} calls</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Last error */}
      {lastError && (
        <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>Last Error</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
            [{new Date(lastError.timestamp).toLocaleString()}] <span style={{ color: phaseColor(lastError.phase) }}>{lastError.phase}</span>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {lastError.error}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Session History Section ────────────────────────────────────────────────────

const SessionsSection: React.FC<{ entries: AgentMetrics[] }> = ({ entries }) => {
  // Group by sessionId
  const bySession: Record<string, AgentMetrics[]> = {};
  for (const e of entries) {
    const key = e.sessionId ?? 'no-session';
    if (!bySession[key]) bySession[key] = [];
    bySession[key].push(e);
  }

  const sessions = Object.entries(bySession)
    .filter(([key]) => key !== 'no-session')
    .map(([sessionId, items]) => ({
      sessionId,
      blockName: items.find(i => i.blockName)?.blockName ?? '—',
      calls:     items.length,
      totalMs:   items.reduce((s, i) => s + (i.durationMs ?? 0), 0),
      totalCost: items.reduce((s, i) => s + (i.cost ?? 0), 0),
      errors:    items.filter(i => i.error).length,
      from:      Math.min(...items.map(i => i.timestamp)),
      to:        Math.max(...items.map(i => i.timestamp)),
    }))
    .sort((a, b) => b.from - a.from)
    .slice(0, 20);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sessions.length === 0 ? (
        <div style={{ color: '#444', fontSize: 12, textAlign: 'center', padding: '40px 0' }}>No agent sessions yet</div>
      ) : sessions.map(s => (
        <div key={s.sessionId} style={{
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10, padding: '12px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginBottom: 2 }}>{s.blockName}</div>
              <div style={{ fontSize: 10, color: '#555', fontFamily: 'monospace' }}>{s.sessionId.slice(0, 8)}</div>
            </div>
            {s.errors > 0 && (
              <div style={{ fontSize: 11, color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '2px 8px', borderRadius: 5 }}>
                {s.errors} error{s.errors > 1 ? 's' : ''}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            {[
              { label: 'Calls',    value: String(s.calls)         },
              { label: 'Duration', value: fmt(s.totalMs)          },
              { label: 'Cost',     value: fmtCost(s.totalCost)    },
              { label: 'Started',  value: new Date(s.from).toLocaleTimeString() },
            ].map(stat => (
              <div key={stat.label}>
                <div style={{ fontSize: 9, color: '#444', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stat.label}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Error Log Section ─────────────────────────────────────────────────────────

const ErrorsSection: React.FC<{
  entries:        AgentMetrics[];
  onSendToAgent?: (task: string) => void;
}> = ({ entries, onSendToAgent }) => {
  const errors = [...entries].filter(e => e.error).reverse().slice(0, 50);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const buildAgentTask = (e: AgentMetrics): string => {
    const stack = (e.extra?.stack as string | undefined) ?? '';
    return [
      `🚨 Ошибка в модуле: ${e.phase}`,
      `Сообщение: ${e.error}`,
      `Время: ${new Date(e.timestamp).toLocaleString()}`,
      e.blockName ? `Блок: ${e.blockName}` : '',
      stack ? `\nStack trace:\n${stack.slice(0, 800)}` : '',
      `\nURL: ${window.location.href}`,
      '\nПроанализируй ошибку, найди причину и предложи исправление.',
    ].filter(Boolean).join('\n');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {errors.length === 0 ? (
        <div style={{ color: '#444', fontSize: 12, textAlign: 'center', padding: '40px 0' }}>No errors recorded</div>
      ) : errors.map(e => {
        const stack = (e.extra?.stack as string | undefined) ?? '';
        const expanded = expandedId === e.id;
        return (
          <div key={e.id} style={{
            background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)',
            borderRadius: 8, padding: '10px 12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: phaseColor(e.phase) }}>{e.phase}</span>
              {e.blockName && <span style={{ fontSize: 10, color: '#666' }}>{e.blockName}</span>}
              <span style={{ fontSize: 10, color: '#444', marginLeft: 'auto', fontFamily: 'monospace' }}>
                {new Date(e.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', wordBreak: 'break-all', whiteSpace: 'pre-wrap', marginBottom: stack ? 6 : 0 }}>
              {e.error}
            </div>

            {/* Stack trace (collapsible) */}
            {stack && (
              <div>
                <button
                  onClick={() => setExpandedId(expanded ? null : e.id)}
                  style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', fontSize: 10, padding: '2px 0', marginBottom: expanded ? 4 : 0 }}
                >
                  {expanded ? '▲ hide stack' : '▼ stack trace'}
                </button>
                {expanded && (
                  <div style={{ fontSize: 10, color: '#555', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'rgba(0,0,0,0.3)', borderRadius: 5, padding: '6px 8px', maxHeight: 160, overflowY: 'auto' }}>
                    {stack}
                  </div>
                )}
              </div>
            )}

            {/* Send to Agent */}
            {onSendToAgent && (
              <button
                onClick={() => onSendToAgent(buildAgentTask(e))}
                style={{
                  marginTop: 8, padding: '4px 10px', borderRadius: 6,
                  background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)',
                  color: '#60a5fa', cursor: 'pointer', fontSize: 10, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                🤖 Отправить агентам
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ── Main Analytics Dashboard ──────────────────────────────────────────────────

export const AnalyticsDashboard: React.FC<{
  onSendToAgent?: (task: string) => void;
}> = ({ onSendToAgent }) => {
  const [section, setSection]   = useState<Section>('costs');
  const [entries, setEntries]   = useState<AgentMetrics[]>(() => metricsService.getAll());
  const [summary, setSummary]   = useState<MetricsSummary>(() => metricsService.getSummary());

  const refresh = useCallback(() => {
    setEntries(metricsService.getAll());
    setSummary(metricsService.getSummary());
  }, []);

  useEffect(() => {
    window.addEventListener('studio-metrics', refresh);
    return () => window.removeEventListener('studio-metrics', refresh);
  }, [refresh]);

  const handleClear = () => {
    metricsService.clear();
    refresh();
  };

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', height: '100%',
      background: '#050505', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: '#080810', flexShrink: 0,
      }}>
        <BarChart2 size={18} style={{ color: '#60a5fa' }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>Analytics & Observability</span>
        <span style={{ fontSize: 11, color: '#555', marginLeft: 4 }}>{entries.length} events</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            onClick={refresh}
            title="Refresh"
            style={{
              padding: '5px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)', color: '#666', cursor: 'pointer',
              fontSize: 11, display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <RefreshCw size={11} /> Refresh
          </button>
          <button
            onClick={handleClear}
            title="Clear all metrics"
            style={{
              padding: '5px 10px', borderRadius: 7, background: 'rgba(239,68,68,0.06)',
              border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', cursor: 'pointer',
              fontSize: 11, display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <Trash2 size={11} /> Clear
          </button>
        </div>
      </div>

      {/* Section tabs */}
      <div style={{
        display: 'flex', gap: 2, padding: '10px 24px 0',
        borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0,
        background: '#080810',
      }}>
        {SECTIONS.map(s => {
          const Icon = s.icon;
          const active = section === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              style={{
                padding: '7px 14px', borderRadius: '8px 8px 0 0',
                background: active ? 'rgba(96,165,250,0.1)' : 'transparent',
                border: active ? '1px solid rgba(96,165,250,0.2)' : '1px solid transparent',
                borderBottom: active ? '1px solid #080810' : '1px solid transparent',
                color: active ? '#60a5fa' : 'rgba(255,255,255,0.4)',
                cursor: 'pointer', fontSize: 12, fontWeight: active ? 600 : 400,
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s',
                marginBottom: -1,
              }}
            >
              <Icon size={12} />
              {s.label}
              {s.id === 'errors' && summary.errors > 0 && (
                <span style={{
                  background: 'rgba(239,68,68,0.2)', color: '#ef4444',
                  fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                }}>
                  {summary.errors}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {section === 'costs'       && <CostSection       summary={summary}                  />}
        {section === 'performance' && <PerformanceSection entries={entries}                  />}
        {section === 'health'      && <HealthSection      summary={summary} entries={entries} />}
        {section === 'sessions'    && <SessionsSection    entries={entries}                  />}
        {section === 'errors'      && <ErrorsSection      entries={entries} onSendToAgent={onSendToAgent} />}
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
