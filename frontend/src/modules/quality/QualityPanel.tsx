/**
 * QualityPanel — Run and inspect flow-chain fixture tests.
 *
 * Three zones:
 *   Top    — trigger button, status indicator, elapsed time
 *   Middle — step-by-step timeline of the latest run
 *   Bottom — history of the last 5 runs (from localStorage)
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  FlaskConical,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  SkipForward,
  ChevronDown,
  ChevronUp,
  Clock,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface StepResult {
  step: string;
  status: 'pass' | 'fail' | 'skip';
  duration_ms: number;
  input?: unknown;
  output?: unknown;
  error?: string;
}

interface FlowChainReport {
  verdict: 'PASS' | 'PARTIAL' | 'FAIL';
  buildId?: string;
  timestamp?: string;
  steps: StepResult[];
  timings: { total_ms: number; per_step: Record<string, number> };
  handoff_errors: string[];
  broken_at: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LS_KEY   = 'quality.reports';
const MAX_HIST = 5;

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    width: '100%',
    background: '#06060a',
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'inherit',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
    background: '#080810',
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: '0.02em',
  },
  body: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 20,
  },
  card: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 12,
    padding: '16px 20px',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    color: 'rgba(255,255,255,0.3)',
    marginBottom: 12,
  },
  runBtn: (running: boolean) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '9px 18px',
    borderRadius: 8,
    border: 'none',
    background: running
      ? 'rgba(59,130,246,0.12)'
      : 'rgba(59,130,246,0.85)',
    color: running ? 'rgba(96,165,250,0.7)' : '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: running ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s',
  }),
  verdictBadge: (v: 'PASS' | 'PARTIAL' | 'FAIL') => {
    const map = {
      PASS:    { bg: 'rgba(74,222,128,0.12)',  color: '#4ade80', border: 'rgba(74,222,128,0.3)'  },
      PARTIAL: { bg: 'rgba(251,191,36,0.12)',  color: '#fbbf24', border: 'rgba(251,191,36,0.3)'  },
      FAIL:    { bg: 'rgba(248,113,113,0.12)', color: '#f87171', border: 'rgba(248,113,113,0.3)' },
    }[v];
    return {
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: 6,
      fontSize: 12,
      fontWeight: 700,
      background: map.bg,
      color: map.color,
      border: `1px solid ${map.border}`,
    };
  },
  stepRow: (status: StepResult['status']) => ({
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '8px 0',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    color: status === 'fail' ? '#f87171'
         : status === 'skip' ? 'rgba(255,255,255,0.3)'
         : 'rgba(255,255,255,0.75)',
  }),
  stepName: {
    fontSize: 12,
    fontWeight: 600,
    width: 140,
    flexShrink: 0,
  },
  stepDur: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    width: 60,
    flexShrink: 0,
    textAlign: 'right' as const,
  },
  stepDesc: {
    fontSize: 12,
    flex: 1,
    wordBreak: 'break-word' as const,
    opacity: 0.85,
  },
  histItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 8,
    cursor: 'pointer',
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.05)',
    marginBottom: 6,
  },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StepIcon({ status }: { status: StepResult['status'] }) {
  if (status === 'pass') return <CheckCircle2 size={14} color="#4ade80" style={{ flexShrink: 0, marginTop: 1 }} />;
  if (status === 'fail') return <XCircle     size={14} color="#f87171" style={{ flexShrink: 0, marginTop: 1 }} />;
  return                        <SkipForward size={14} color="#6b7280" style={{ flexShrink: 0, marginTop: 1 }} />;
}

function stepDescription(step: StepResult): string {
  if (step.error) return step.error;
  if (typeof step.output === 'string') return step.output;
  if (step.output !== undefined && step.output !== null) return JSON.stringify(step.output);
  return '—';
}

function StepTimeline({ steps }: { steps: StepResult[] }) {
  return (
    <div>
      {steps.map((step) => (
        <div key={step.step} style={s.stepRow(step.status)}>
          <StepIcon status={step.status} />
          <span style={s.stepName}>{step.step}</span>
          <span style={s.stepDur}>
            {step.duration_ms > 0 ? `${step.duration_ms}ms` : ''}
          </span>
          <span style={{ ...s.stepDesc, color: 'inherit' }}>
            → {stepDescription(step)}
          </span>
        </div>
      ))}
    </div>
  );
}

function VerdictSummary({ report }: { report: FlowChainReport }) {
  const ms   = report.timings?.total_ms ?? 0;
  const secs = (ms / 1000).toFixed(1);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
      <span style={s.verdictBadge(report.verdict)}>
        {report.verdict === 'PASS' ? '✅' : report.verdict === 'PARTIAL' ? '⚠️' : '❌'}&nbsp;{report.verdict}
      </span>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
        Всего: {secs}s
      </span>
      {report.broken_at && (
        <span style={{ fontSize: 12, color: '#f87171' }}>
          Сломано на: {report.broken_at}
        </span>
      )}
    </div>
  );
}

function HistoryEntry({ report, index }: { report: FlowChainReport; index: number }) {
  const [open, setOpen] = useState(false);
  const ts  = report.timestamp ? new Date(report.timestamp).toLocaleString() : `Run #${index + 1}`;
  const ms  = report.timings?.total_ms ?? 0;

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={s.histItem}
        onClick={() => setOpen(o => !o)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setOpen(o => !o)}
      >
        <span style={s.verdictBadge(report.verdict)}>
          {report.verdict}
        </span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', flex: 1 }}>{ts}</span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
          {(ms / 1000).toFixed(1)}s
        </span>
        {open
          ? <ChevronUp   size={13} color="#555" />
          : <ChevronDown size={13} color="#555" />
        }
      </div>
      {open && (
        <div style={{
          background: 'rgba(255,255,255,0.015)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: '0 0 8px 8px',
          padding: '8px 12px',
          marginTop: -2,
        }}>
          <StepTimeline steps={report.steps} />
          {report.handoff_errors.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#f87171' }}>
              {report.handoff_errors.map((e, i) => (
                <div key={i}>⚠ {e}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function QualityPanel() {
  const [runStatus,  setRunStatus]  = useState<'idle' | 'running' | 'done'>('idle');
  const [currentRep, setCurrentRep] = useState<FlowChainReport | null>(null);
  const [history,    setHistory]    = useState<FlowChainReport[]>([]);
  const [elapsedMs,  setElapsedMs]  = useState(0);
  const [runError,   setRunError]   = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setHistory(JSON.parse(raw) as FlowChainReport[]);
    } catch { /* ignore */ }
  }, []);

  const saveToHistory = useCallback((report: FlowChainReport) => {
    setHistory(prev => {
      const next = [report, ...prev].slice(0, MAX_HIST);
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }, []);

  const handleRun = useCallback(async () => {
    setRunStatus('running');
    setCurrentRep(null);
    setRunError(null);
    setElapsedMs(0);

    const t0 = Date.now();
    const timer = setInterval(() => setElapsedMs(Date.now() - t0), 500);

    try {
      const resp = await fetch('/api/quality/flow-chain');
      clearInterval(timer);
      setElapsedMs(Date.now() - t0);

      if (!resp.ok) {
        const errText = await resp.text().catch(() => resp.statusText);
        throw new Error(`HTTP ${resp.status}: ${errText}`);
      }

      const report = (await resp.json()) as FlowChainReport;
      report.timestamp = report.timestamp ?? new Date().toISOString();
      setCurrentRep(report);
      saveToHistory(report);
      setRunStatus('done');
    } catch (err: unknown) {
      clearInterval(timer);
      setRunError(err instanceof Error ? err.message : String(err));
      setRunStatus('idle');
    }
  }, [saveToHistory]);

  const elapsedStr = elapsedMs > 0 ? `${(elapsedMs / 1000).toFixed(0)}s` : '';

  return (
    <div style={s.root}>
      {/* ── Header ── */}
      <div style={s.header}>
        <FlaskConical size={16} color="#60a5fa" strokeWidth={1.75} />
        <span style={s.headerTitle}>Quality — Flow Chain Test</span>
      </div>

      <div style={s.body}>

        {/* ── Top zone: trigger ── */}
        <div style={s.card}>
          <div style={s.sectionLabel}>Запуск теста</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <button
              style={s.runBtn(runStatus === 'running')}
              onClick={handleRun}
              disabled={runStatus === 'running'}
            >
              {runStatus === 'running'
                ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                : <Play size={14} />
              }
              {runStatus === 'running' ? 'Выполняется…' : 'Запустить Flow Chain Test'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
              <Clock size={12} />
              <span>
                {runStatus === 'idle' && !currentRep && 'Готов'}
                {runStatus === 'running'              && `Выполняется… ${elapsedStr}`}
                {runStatus === 'done' && currentRep   && `Завершён за ${(currentRep.timings.total_ms / 1000).toFixed(1)}s`}
              </span>
            </div>
          </div>

          {runError && (
            <div style={{
              marginTop: 12,
              padding: '8px 12px',
              borderRadius: 8,
              background: 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.2)',
              fontSize: 12,
              color: '#f87171',
            }}>
              {runError}
            </div>
          )}
        </div>

        {/* ── Middle zone: step timeline ── */}
        {currentRep && (
          <div style={s.card}>
            <div style={s.sectionLabel}>Результаты прогона</div>
            <StepTimeline steps={currentRep.steps} />
            <VerdictSummary report={currentRep} />
            {currentRep.handoff_errors.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 11, color: '#f87171' }}>
                {currentRep.handoff_errors.map((e, i) => (
                  <div key={i}>⚠ {e}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Bottom zone: history ── */}
        {history.length > 0 && (
          <div style={s.card}>
            <div style={s.sectionLabel}>История прогонов (последние {MAX_HIST})</div>
            {history.map((rep, i) => (
              <HistoryEntry key={rep.timestamp ?? i} report={rep} index={i} />
            ))}
          </div>
        )}

        {history.length === 0 && !currentRep && (
          <div style={{
            textAlign: 'center',
            color: 'rgba(255,255,255,0.2)',
            fontSize: 12,
            padding: '40px 0',
          }}>
            Нет истории прогонов. Запустите тест, чтобы начать.
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default QualityPanel;
