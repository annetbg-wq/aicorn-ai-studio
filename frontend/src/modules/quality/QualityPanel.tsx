/**
 * QualityPanel — Unified quality hub.
 *
 * Tab "Flow Chain" — 9 individual runnable step tests (including Canary).
 *   Each test has its own [Run] button → GET /api/quality/test/:testName
 *   [Run All] → runs all sequentially, stops on first fail.
 *   Per-test history (last 5 runs) persisted in localStorage.
 *
 * Tab "Benchmark" — embeds BenchmarkDashboard (Golden Suite + Compare Models).
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  FlaskConical,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Circle,
  Clock,
  BarChart2,
} from 'lucide-react';
import { BenchmarkDashboard } from '../../components/BenchmarkDashboard';

// ── Step definitions ───────────────────────────────────────────────────────────

const STEP_DEFS = [
  { id: 'canary',            label: 'Canary',            desc: 'Backend доступен (GET /api/health → 200)' },
  { id: 'idea-validate',     label: 'Idea Validate',     desc: 'Промпт не пустой, длина > 10 символов' },
  { id: 'architecture',      label: 'Architecture',      desc: 'Fixture plan содержит skeleton, deltaFiles, pages' },
  { id: 'code-delta',        label: 'Code Delta',        desc: 'POST /api/preview/{id}/compile → success: true' },
  { id: 'compile',           label: 'Compile',           desc: 'В builds/ есть папка с .js assets' },
  { id: 'preview-http',      label: 'Preview HTTP',      desc: 'GET /preview/{buildId} → 200 и HTML' },
  { id: 'preview-mounted',   label: 'Preview Mounted',   desc: 'main.tsx содержит postMessage({type: preview-mounted})' },
  { id: 'save-ready',        label: 'Save Ready',        desc: 'Compile вернул success: true (save-ready state)' },
  { id: 'no-premature-save', label: 'No Premature Save', desc: 'Проект не создан до явного save' },
] as const;

type StepId = typeof STEP_DEFS[number]['id'];
type TabId  = 'flow-chain' | 'benchmark';

// ── Types ──────────────────────────────────────────────────────────────────────

interface TestState {
  status: 'idle' | 'running' | 'pass' | 'fail';
  duration_ms: number;
  error?: string;
  output?: string;
}

interface TestHistoryRun {
  timestamp: string;
  status: 'pass' | 'fail';
  duration_ms: number;
  error?: string;
}

interface TestApiResult {
  status: 'pass' | 'fail';
  duration_ms: number;
  output?: string;
  error?: string;
}

// ── localStorage helpers ───────────────────────────────────────────────────────

const LS_TEST_KEY     = (id: string) => `quality.test.${id}`;
const LS_LAST_RUN_KEY = 'quality.lastRunAll';
const MAX_HIST        = 5;

function loadTestHistory(id: string): TestHistoryRun[] {
  try {
    const raw = localStorage.getItem(LS_TEST_KEY(id));
    return raw ? (JSON.parse(raw) as TestHistoryRun[]) : [];
  } catch { return []; }
}

function persistTestRun(id: string, run: TestHistoryRun): void {
  try {
    const hist = loadTestHistory(id);
    const next = [run, ...hist].slice(0, MAX_HIST);
    localStorage.setItem(LS_TEST_KEY(id), JSON.stringify(next));
  } catch { /* quota */ }
}

// ── API helper ─────────────────────────────────────────────────────────────────

async function callTestApi(testId: string): Promise<TestApiResult> {
  const resp = await fetch(`/api/quality/test/${testId}`);
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    return { status: 'fail', duration_ms: 0, error: `HTTP ${resp.status}: ${text}` };
  }
  return (await resp.json()) as TestApiResult;
}

// ── Initial state factory ──────────────────────────────────────────────────────

function makeInitStates(): Record<StepId, TestState> {
  return Object.fromEntries(
    STEP_DEFS.map(d => [d.id, { status: 'idle', duration_ms: 0 }])
  ) as Record<StepId, TestState>;
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const ROOT_S: React.CSSProperties = {
  display: 'flex', flexDirection: 'column',
  height: '100%', width: '100%',
  background: '#06060a', color: 'rgba(255,255,255,0.85)',
  fontFamily: 'inherit', overflow: 'hidden',
};

const HEADER_S: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '14px 20px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  flexShrink: 0, background: '#080810',
};

const BODY_S: React.CSSProperties = {
  flex: 1, overflowY: 'auto',
  padding: '16px 20px',
  display: 'flex', flexDirection: 'column', gap: 16,
};

// ── Verdict badge ──────────────────────────────────────────────────────────────

function verdictBadgeStyle(v: 'PASS' | 'PARTIAL' | 'FAIL'): React.CSSProperties {
  const map = {
    PASS:    { bg: 'rgba(74,222,128,0.12)',  color: '#4ade80', border: 'rgba(74,222,128,0.3)'  },
    PARTIAL: { bg: 'rgba(251,191,36,0.12)',  color: '#fbbf24', border: 'rgba(251,191,36,0.3)'  },
    FAIL:    { bg: 'rgba(248,113,113,0.12)', color: '#f87171', border: 'rgba(248,113,113,0.3)' },
  }[v];
  return {
    display: 'inline-block', padding: '2px 8px',
    borderRadius: 5, fontSize: 11, fontWeight: 700,
    background: map.bg, color: map.color,
    border: `1px solid ${map.border}`,
  };
}

// ── TestRow component — one test with its own [Run] button ─────────────────────

function TestRow({
  def, state, onRun, anyRunning,
}: {
  def: typeof STEP_DEFS[number];
  state: TestState;
  onRun: () => void;
  anyRunning: boolean;
}) {
  const icon =
    state.status === 'pass'    ? <CheckCircle2 size={14} color="#4ade80" /> :
    state.status === 'fail'    ? <XCircle size={14} color="#f87171" /> :
    state.status === 'running' ? <Loader2 size={14} color="#60a5fa" style={{ animation: 'spin 1s linear infinite' }} /> :
    <Circle size={14} color="rgba(255,255,255,0.18)" />;

  const labelColor =
    state.status === 'pass'    ? '#4ade80' :
    state.status === 'fail'    ? '#f87171' :
    state.status === 'running' ? '#60a5fa' :
    'rgba(255,255,255,0.6)';

  const rowBg =
    state.status === 'pass'    ? 'rgba(74,222,128,0.04)' :
    state.status === 'fail'    ? 'rgba(248,113,113,0.04)' :
    state.status === 'running' ? 'rgba(59,130,246,0.05)'  :
    'transparent';

  const leftBorder =
    state.status === 'pass'    ? '2px solid rgba(74,222,128,0.25)'  :
    state.status === 'fail'    ? '2px solid rgba(248,113,113,0.25)' :
    state.status === 'running' ? '2px solid rgba(96,165,250,0.3)'   :
    '2px solid transparent';

  const durText =
    state.status === 'running' ? '…'                      :
    state.duration_ms > 0      ? `${state.duration_ms}ms` :
    '—';

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 16px',
        background: rowBg, borderLeft: leftBorder,
        transition: 'all 0.18s',
      }}>
        <div style={{ flexShrink: 0 }}>{icon}</div>
        <div style={{
          flex: 1, fontSize: 12, fontWeight: 600, fontFamily: 'monospace',
          color: labelColor, minWidth: 0, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {def.label}
        </div>
        <div style={{
          width: 52, fontSize: 11, fontFamily: 'monospace',
          color: 'rgba(255,255,255,0.3)', textAlign: 'right', flexShrink: 0,
        }}>
          {durText}
        </div>
        <button
          onClick={onRun}
          disabled={anyRunning}
          style={{
            padding: '3px 10px', borderRadius: 5, flexShrink: 0,
            border: '1px solid rgba(255,255,255,0.1)',
            background: anyRunning ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)',
            color: anyRunning ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.65)',
            fontSize: 11, fontWeight: 600,
            cursor: anyRunning ? 'not-allowed' : 'pointer',
          }}
        >
          Run
        </button>
      </div>
      {state.status === 'fail' && state.error && (
        <div style={{
          padding: '4px 16px 6px 40px',
          fontSize: 11, color: '#f87171',
          background: 'rgba(248,113,113,0.03)',
          borderLeft: '2px solid rgba(248,113,113,0.2)',
          wordBreak: 'break-all',
        }}>
          {state.error}
        </div>
      )}
    </div>
  );
}

// ── FlowChainTab ───────────────────────────────────────────────────────────────

function FlowChainTab() {
  const [testStates, setTestStates] = useState<Record<StepId, TestState>>(makeInitStates);
  const [runAllActive, setRunAllActive] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(() => {
    try { return localStorage.getItem(LS_LAST_RUN_KEY); } catch { return null; }
  });
  const [brokenAt, setBrokenAt] = useState<string | null>(null);

  // Restore last run result from localStorage on mount
  useEffect(() => {
    const restored = makeInitStates();
    STEP_DEFS.forEach(def => {
      const hist = loadTestHistory(def.id);
      if (hist.length > 0) {
        const last = hist[0];
        restored[def.id as StepId] = {
          status: last.status,
          duration_ms: last.duration_ms,
          error: last.error,
        };
      }
    });
    setTestStates(restored);
  }, []);

  const anyRunning =
    runAllActive || Object.values(testStates).some(s => s.status === 'running');

  const setOneState = useCallback((id: StepId, patch: Partial<TestState>) => {
    setTestStates(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const runSingleTest = useCallback(async (id: StepId): Promise<TestApiResult> => {
    setOneState(id, { status: 'running', duration_ms: 0, error: undefined, output: undefined });
    try {
      const result = await callTestApi(id);
      setOneState(id, {
        status: result.status,
        duration_ms: result.duration_ms,
        error: result.error,
        output: result.output,
      });
      persistTestRun(id, {
        timestamp: new Date().toISOString(),
        status: result.status,
        duration_ms: result.duration_ms,
        error: result.error,
      });
      return result;
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      setOneState(id, { status: 'fail', duration_ms: 0, error });
      persistTestRun(id, { timestamp: new Date().toISOString(), status: 'fail', duration_ms: 0, error });
      return { status: 'fail', duration_ms: 0, error };
    }
  }, [setOneState]);

  const handleRunOne = useCallback((id: StepId) => {
    void runSingleTest(id);
  }, [runSingleTest]);

  const handleRunAll = useCallback(async () => {
    setRunAllActive(true);
    setBrokenAt(null);
    const now = new Date().toISOString();
    setLastRunAt(now);
    try { localStorage.setItem(LS_LAST_RUN_KEY, now); } catch { /* quota */ }
    setTestStates(makeInitStates());

    for (const def of STEP_DEFS) {
      const result = await runSingleTest(def.id as StepId);
      if (result.status === 'fail') {
        setBrokenAt(def.id);
        break;
      }
    }
    setRunAllActive(false);
  }, [runSingleTest]);

  // Compute footer verdict from current states
  const passCount = Object.values(testStates).filter(s => s.status === 'pass').length;
  const failCount = Object.values(testStates).filter(s => s.status === 'fail').length;
  const verdict: 'PASS' | 'PARTIAL' | 'FAIL' | null =
    failCount === 0 && passCount === STEP_DEFS.length ? 'PASS'    :
    failCount > 0  && passCount > 0                   ? 'PARTIAL' :
    failCount > 0  && passCount === 0                 ? 'FAIL'    :
    null;

  const lastRunStr = lastRunAt
    ? new Date(lastRunAt).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ── Panel header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '11px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)',
        }}>
          Quality Tests
        </span>
        <button
          onClick={() => void handleRunAll()}
          disabled={anyRunning}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 14px', borderRadius: 7, border: 'none',
            background: anyRunning ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.85)',
            color: anyRunning ? 'rgba(96,165,250,0.5)' : '#fff',
            fontSize: 12, fontWeight: 600,
            cursor: anyRunning ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {anyRunning
            ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Running…</>
            : <><Play size={12} /> Run All</>
          }
        </button>
      </div>

      {/* ── Test rows ── */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {STEP_DEFS.map((def, idx) => (
          <div
            key={def.id}
            style={{ borderBottom: idx < STEP_DEFS.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
          >
            <TestRow
              def={def}
              state={testStates[def.id as StepId]}
              onRun={() => handleRunOne(def.id as StepId)}
              anyRunning={anyRunning}
            />
          </div>
        ))}
      </div>

      {/* ── Footer ── */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '9px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
        fontSize: 11, color: 'rgba(255,255,255,0.3)',
        flexWrap: 'wrap',
      }}>
        <Clock size={11} />
        {lastRunStr ? (
          <>
            <span>Last run: {lastRunStr}</span>
            {verdict && <span style={verdictBadgeStyle(verdict)}>{verdict}</span>}
            <span>{passCount}/{STEP_DEFS.length}</span>
            {brokenAt && <span style={{ color: '#f87171' }}>stopped at {brokenAt}</span>}
          </>
        ) : (
          <span>Нет прогонов. Нажмите Run или Run All.</span>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export interface QualityPanelProps {
  apiKey?: string;
  selectedModel?: string;
}

export function QualityPanel({ apiKey = '', selectedModel = '' }: QualityPanelProps) {
  const [tab, setTab] = useState<TabId>('flow-chain');

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'flow-chain', label: 'Flow Chain', icon: <FlaskConical size={13} /> },
    { id: 'benchmark',  label: 'Benchmark',  icon: <BarChart2 size={13} /> },
  ];

  return (
    <div style={ROOT_S}>
      {/* Header */}
      <div style={HEADER_S}>
        <FlaskConical size={16} color="#60a5fa" strokeWidth={1.75} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.02em' }}>
          Quality
        </span>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 16 }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.18s',
                background: tab === t.id ? 'rgba(96,165,250,0.12)' : 'transparent',
                border: `1px solid ${tab === t.id ? 'rgba(96,165,250,0.3)' : 'rgba(255,255,255,0.06)'}`,
                color: tab === t.id ? '#60a5fa' : 'rgba(255,255,255,0.4)',
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={BODY_S}>
        {tab === 'flow-chain' && <FlowChainTab />}
        {tab === 'benchmark'  && (
          <BenchmarkDashboard apiKey={apiKey} selectedModel={selectedModel} />
        )}
      </div>
    </div>
  );
}

export default QualityPanel;
