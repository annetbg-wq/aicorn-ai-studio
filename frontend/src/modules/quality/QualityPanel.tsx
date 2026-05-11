/**
 * QualityPanel — Unified quality hub.
 *
 * Tab "Flow Chain" — 9 individual runnable step tests.
 *   Each row: [Run] button, status icon, duration, click-to-expand detail panel.
 *   [Run All] → sequential, stops on first fail, auto-expands passing tests.
 *   Per-test history (last 5 runs) persisted in localStorage.
 *
 * Tab "Benchmark" — BenchmarkDashboard (Golden Suite + Compare Models).
 */

import React, { useState, useCallback, useEffect } from 'react';
import JSZip from 'jszip';
import {
  FlaskConical, Play, Loader2, CheckCircle2, XCircle, Circle,
  Clock, BarChart2, ChevronDown, ChevronRight, Download,
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

// ── Per-test detail types ──────────────────────────────────────────────────────

interface CanaryDetails       { httpStatus: number; response: { status: string; provider: string } }
interface IdeaDetails         { prompt: string; length: number; valid: boolean }
interface ArchDetails         { appName: string; skeleton: string; deltaFiles: string[]; pages: string[] }
interface CodeDeltaFile       { path: string; size: number; content: string }
interface CodeDeltaDetails    { buildId: string; files: CodeDeltaFile[] }
interface CompileAsset        { name: string; size: number }
interface CompileDetails      { buildId: string; assets: CompileAsset[] }
interface PreviewHttpDetails  { httpStatus: number; contentLength: number; contentLengthStr: string; hasRootDiv: boolean; buildId: string }
interface PreviewMtdDetails   { lineNumber: number; line: string }
interface SaveReadyDetails    { compileSuccess: boolean; buildId: string; assetsCount: number }
interface NoPremSaveDetails   { projectsBeforeSave: number; totalSessions: number; correct: boolean }

// ── General types ──────────────────────────────────────────────────────────────

interface TestState {
  status: 'idle' | 'running' | 'pass' | 'fail';
  duration_ms: number;
  error?: string;
  output?: string;
  details?: Record<string, unknown>;
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
  details?: Record<string, unknown>;
}

// ── localStorage helpers ───────────────────────────────────────────────────────

const LS_TEST_KEY     = (id: string) => `quality.test.${id}`;
const LS_LAST_RUN_KEY = 'quality.lastRunAll';
const MAX_HIST        = 5;
const FIXTURE_BACKED_TESTS = new Set<StepId>(['idea-validate', 'architecture', 'code-delta']);
const FIXTURE_NOTE_TEXT = '⚠️ Fixture данные — не реальный LLM output';

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

function clearQualityPanelHistory(): void {
  try {
    STEP_DEFS.forEach(def => localStorage.removeItem(LS_TEST_KEY(def.id)));
    localStorage.removeItem(LS_LAST_RUN_KEY);
  } catch { /* ignore */ }
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

// ── ZIP download helper ────────────────────────────────────────────────────────

async function downloadFixtureZip(files: CodeDeltaFile[]): Promise<void> {
  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.path, f.content);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'fixture-code.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

function fmtSize(bytes: number): string {
  if (bytes < 1024)          return `${bytes}B`;
  if (bytes < 1024 * 1024)   return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ── Initial state factories ────────────────────────────────────────────────────

function makeInitStates(): Record<StepId, TestState> {
  return Object.fromEntries(
    STEP_DEFS.map(d => [d.id, { status: 'idle', duration_ms: 0 }])
  ) as Record<StepId, TestState>;
}

function makeInitExpanded(): Record<StepId, boolean> {
  return Object.fromEntries(STEP_DEFS.map(d => [d.id, false])) as Record<StepId, boolean>;
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

// ── KV row ─────────────────────────────────────────────────────────────────────

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 3, fontSize: 11, fontFamily: 'monospace' }}>
      <span style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0, minWidth: 120 }}>{label}:</span>
      <span style={{ color: 'rgba(255,255,255,0.75)', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

// ── Detail panel ───────────────────────────────────────────────────────────────

function DetailPanel({ testId, details }: { testId: StepId; details: Record<string, unknown> }) {
  const [downloading, setDownloading] = useState(false);

  const panelStyle: React.CSSProperties = {
    padding: '6px 16px 10px 40px',
    background: 'rgba(0,0,0,0.18)',
    borderLeft: '2px solid rgba(74,222,128,0.12)',
    maxHeight: 300,
    overflowY: 'auto',
  };
  const isFixtureBacked = FIXTURE_BACKED_TESTS.has(testId);

  const sep = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      marginBottom: 8, paddingBottom: 6,
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <ChevronDown size={10} color="rgba(255,255,255,0.18)" />
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
    </div>
  );

  const renderPanel = (content: React.ReactNode) => (
    <div style={panelStyle}>
      {sep}
      {content}
      {isFixtureBacked && (
        <div style={{
          marginTop: 10,
          paddingTop: 8,
          borderTop: '1px solid rgba(255,255,255,0.05)',
          fontSize: 11,
          color: 'rgba(255,255,255,0.4)',
        }}>
          {FIXTURE_NOTE_TEXT}
        </div>
      )}
    </div>
  );

  if (testId === 'canary') {
    const d = details as unknown as CanaryDetails;
    return renderPanel(
      <>
        <KV label="httpStatus"       value={<span style={{ color: '#4ade80' }}>{d.httpStatus}</span>} />
        <KV label="response.status"  value={d.response?.status ?? '—'} />
        <KV label="response.provider" value={d.response?.provider ?? '—'} />
      </>
    );
  }

  if (testId === 'idea-validate') {
    const d = details as unknown as IdeaDetails;
    const prompt = String(d.prompt ?? '');
    const truncated = prompt.length > 64 ? `${prompt.slice(0, 64)}…` : prompt;
    return renderPanel(
      <>
        <KV label="prompt" value={<span style={{ color: '#e2c08d' }}>{`"${truncated}"`}</span>} />
        <KV label="length" value={String(d.length)} />
        <KV label="valid"  value={<span style={{ color: '#4ade80' }}>true</span>} />
      </>
    );
  }

  if (testId === 'architecture') {
    const d = details as unknown as ArchDetails;
    return renderPanel(
      <>
        <KV label="appName"    value={<span style={{ color: '#e2c08d' }}>{`"${d.appName}"`}</span>} />
        <KV label="skeleton"   value={<span style={{ color: '#e2c08d' }}>{`"${d.skeleton}"`}</span>} />
        <KV label="deltaFiles" value={
          <span style={{ color: 'rgba(255,255,255,0.65)' }}>
            {`[${(d.deltaFiles ?? []).map(f => `"${f}"`).join(', ')}]`}
          </span>
        } />
        <KV label="pages" value={
          <span style={{ color: 'rgba(255,255,255,0.65)' }}>
            {`[${(d.pages ?? []).map(p => `"${p}"`).join(', ')}]`}
          </span>
        } />
      </>
    );
  }

  if (testId === 'code-delta') {
    const d = details as unknown as CodeDeltaDetails;
    const handleDownload = async () => {
      setDownloading(true);
      try { await downloadFixtureZip(d.files); }
      finally { setDownloading(false); }
    };
    return renderPanel(
      <>
        <KV label="buildId" value={<span style={{ color: '#a78bfa' }}>{d.buildId}</span>} />
        <div style={{ marginTop: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)' }}>files:</span>
        </div>
        {(d.files ?? []).map(f => (
          <div key={f.path} style={{ display: 'flex', gap: 10, paddingLeft: 12, marginBottom: 2, fontSize: 11, fontFamily: 'monospace' }}>
            <span style={{ color: '#60a5fa', flex: 1 }}>{f.path}</span>
            <span style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}>{fmtSize(f.size)}</span>
          </div>
        ))}
        <button
          onClick={() => void handleDownload()}
          disabled={downloading}
          style={{
            marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 12px', borderRadius: 5,
            border: '1px solid rgba(96,165,250,0.3)',
            background: downloading ? 'rgba(96,165,250,0.04)' : 'rgba(96,165,250,0.08)',
            color: downloading ? 'rgba(96,165,250,0.4)' : '#60a5fa',
            fontSize: 11, fontWeight: 600,
            cursor: downloading ? 'not-allowed' : 'pointer',
          }}
        >
          <Download size={11} />
          {downloading ? 'Скачивание…' : 'Скачать архив'}
        </button>
      </>
    );
  }

  if (testId === 'compile') {
    const d = details as unknown as CompileDetails;
    return renderPanel(
      <>
        <KV label="buildId" value={<span style={{ color: '#a78bfa' }}>{d.buildId}</span>} />
        <div style={{ marginTop: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)' }}>assets:</span>
        </div>
        {(d.assets ?? []).map(f => (
          <div key={f.name} style={{ display: 'flex', gap: 10, paddingLeft: 12, marginBottom: 2, fontSize: 11, fontFamily: 'monospace' }}>
            <span style={{ color: 'rgba(255,255,255,0.6)', flex: 1 }}>{f.name}</span>
            <span style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}>{fmtSize(f.size)}</span>
          </div>
        ))}
      </>
    );
  }

  if (testId === 'preview-http') {
    const d = details as unknown as PreviewHttpDetails;
    return renderPanel(
      <>
        <KV label="httpStatus"    value={<span style={{ color: '#4ade80' }}>{d.httpStatus}</span>} />
        <KV label="contentLength" value={`${d.contentLengthStr} (${d.contentLength} bytes)`} />
        <KV label="hasRootDiv"    value={<span style={{ color: d.hasRootDiv ? '#4ade80' : '#f87171' }}>{String(d.hasRootDiv)}</span>} />
        <KV label="buildId"       value={<span style={{ color: '#a78bfa' }}>{d.buildId}</span>} />
      </>
    );
  }

  if (testId === 'preview-mounted') {
    const d = details as unknown as PreviewMtdDetails;
    return renderPanel(
      <>
        <KV label="lineNumber" value={String(d.lineNumber)} />
        <KV label="line" value={
          <code style={{
            color: '#a78bfa', background: 'rgba(167,139,250,0.08)',
            padding: '1px 5px', borderRadius: 3,
            fontSize: 10, wordBreak: 'break-all',
          }}>
            {d.line}
          </code>
        } />
      </>
    );
  }

  if (testId === 'save-ready') {
    const d = details as unknown as SaveReadyDetails;
    return renderPanel(
      <>
        <KV label="compileSuccess" value={<span style={{ color: '#4ade80' }}>true</span>} />
        <KV label="buildId"        value={<span style={{ color: '#a78bfa' }}>{d.buildId}</span>} />
        <KV label="assetsCount"    value={String(d.assetsCount)} />
      </>
    );
  }

  if (testId === 'no-premature-save') {
    const d = details as unknown as NoPremSaveDetails;
    return renderPanel(
      <>
        <KV label="projectsBeforeSave" value={<span style={{ color: '#4ade80' }}>0</span>} />
        <KV label="totalSessions"      value={String(d.totalSessions)} />
        <KV label="correct"            value={<span style={{ color: '#4ade80' }}>true</span>} />
      </>
    );
  }

  // fallback
  return renderPanel(
    <>
      <pre style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, margin: 0, whiteSpace: 'pre-wrap' }}>
        {JSON.stringify(details, null, 2)}
      </pre>
    </>
  );
}

// ── TestRow ────────────────────────────────────────────────────────────────────

function TestRow({
  def, state, onRun, anyRunning, expanded, onToggle,
}: {
  def: typeof STEP_DEFS[number];
  state: TestState;
  onRun: () => void;
  anyRunning: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const canExpand = state.status === 'pass' && !!state.details;

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
    state.status === 'pass'    ? 'rgba(74,222,128,0.03)'  :
    state.status === 'fail'    ? 'rgba(248,113,113,0.03)' :
    state.status === 'running' ? 'rgba(59,130,246,0.04)'  :
    'transparent';

  const leftBorder =
    state.status === 'pass'    ? '2px solid rgba(74,222,128,0.2)'  :
    state.status === 'fail'    ? '2px solid rgba(248,113,113,0.2)' :
    state.status === 'running' ? '2px solid rgba(96,165,250,0.25)' :
    '2px solid transparent';

  const durText =
    state.status === 'idle'    ? '' :
    state.status === 'running' ? '…' :
    state.duration_ms > 0      ? `${state.duration_ms}ms` :
    '';

  return (
    <div>
      {/* Row header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 16px',
          background: rowBg, borderLeft: leftBorder,
          transition: 'all 0.18s',
          cursor: canExpand ? 'pointer' : 'default',
          userSelect: 'none',
        }}
        onClick={canExpand ? onToggle : undefined}
        role={canExpand ? 'button' : undefined}
        tabIndex={canExpand ? 0 : undefined}
        onKeyDown={canExpand ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } } : undefined}
      >
        <div style={{ flexShrink: 0 }}>{icon}</div>

        {/* Expand chevron — only shown when expandable */}
        {canExpand ? (
          <div style={{ flexShrink: 0, opacity: 0.3, marginLeft: -4 }}>
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </div>
        ) : (
          <div style={{ width: 11, flexShrink: 0 }} />
        )}

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
          onClick={(e) => { e.stopPropagation(); onRun(); }}
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

      {/* Error — always visible on fail */}
      {state.status === 'fail' && state.error && (
        <div style={{
          padding: '4px 16px 6px 40px',
          fontSize: 11, color: '#f87171',
          background: 'rgba(248,113,113,0.03)',
          borderLeft: '2px solid rgba(248,113,113,0.15)',
          wordBreak: 'break-all',
        }}>
          {state.error}
        </div>
      )}

      {/* Detail panel — expanded on pass */}
      {expanded && canExpand && (
        <DetailPanel testId={def.id as StepId} details={state.details!} />
      )}
    </div>
  );
}

// ── FlowChainTab ───────────────────────────────────────────────────────────────

function FlowChainTab() {
  const [testStates,   setTestStates]   = useState<Record<StepId, TestState>>(makeInitStates);
  const [expanded,     setExpanded]     = useState<Record<StepId, boolean>>(makeInitExpanded);
  const [runAllActive, setRunAllActive] = useState(false);
  const [lastRunAt,    setLastRunAt]    = useState<string | null>(() => {
    try { return localStorage.getItem(LS_LAST_RUN_KEY); } catch { return null; }
  });
  const [brokenAt, setBrokenAt] = useState<string | null>(null);

  // Restore last run status from localStorage (no details — run again to see them)
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
          // details intentionally not persisted
        };
      }
    });
    setTestStates(restored);
  }, []);

  const anyRunning = runAllActive || Object.values(testStates).some(s => s.status === 'running');

  const setOneState = useCallback((id: StepId, patch: Partial<TestState>) => {
    setTestStates(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const handleToggle = useCallback((id: StepId) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const runSingleTest = useCallback(async (id: StepId): Promise<TestApiResult> => {
    setOneState(id, { status: 'running', duration_ms: 0, error: undefined, output: undefined, details: undefined });
    setExpanded(prev => ({ ...prev, [id]: false }));
    try {
      const result = await callTestApi(id);
      setOneState(id, {
        status:     result.status,
        duration_ms: result.duration_ms,
        error:       result.error,
        output:      result.output,
        details:     result.details,
      });
      // Auto-expand on pass with details
      if (result.status === 'pass' && result.details) {
        setExpanded(prev => ({ ...prev, [id]: true }));
      }
      persistTestRun(id, {
        timestamp:   new Date().toISOString(),
        status:      result.status,
        duration_ms: result.duration_ms,
        error:       result.error,
      });
      return result;
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      setOneState(id, { status: 'fail', duration_ms: 0, error });
      persistTestRun(id, { timestamp: new Date().toISOString(), status: 'fail', duration_ms: 0, error });
      return { status: 'fail', duration_ms: 0, error };
    }
  }, [setOneState]);

  const handleRunOne = useCallback((id: StepId) => { void runSingleTest(id); }, [runSingleTest]);

  const handleRunAll = useCallback(async () => {
    setRunAllActive(true);
    setBrokenAt(null);
    setExpanded(makeInitExpanded());
    const now = new Date().toISOString();
    setLastRunAt(now);
    try { localStorage.setItem(LS_LAST_RUN_KEY, now); } catch { /* quota */ }
    setTestStates(makeInitStates());

    for (const def of STEP_DEFS) {
      const result = await runSingleTest(def.id as StepId);
      if (result.status === 'fail') { setBrokenAt(def.id); break; }
    }
    setRunAllActive(false);
  }, [runSingleTest]);

  const handleClear = useCallback(() => {
    clearQualityPanelHistory();
    setTestStates(makeInitStates());
    setExpanded(makeInitExpanded());
    setRunAllActive(false);
    setLastRunAt(null);
    setBrokenAt(null);
  }, []);

  // Footer verdict
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
      {/* Panel header */}
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
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
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
          <button
            onClick={handleClear}
            disabled={anyRunning}
            style={{
              padding: '5px 12px', borderRadius: 7,
              border: '1px solid rgba(255,255,255,0.12)',
              background: anyRunning ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
              color: anyRunning ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.65)',
              fontSize: 12, fontWeight: 600,
              cursor: anyRunning ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Test rows */}
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
              expanded={expanded[def.id as StepId]}
              onToggle={() => handleToggle(def.id as StepId)}
            />
          </div>
        ))}
      </div>

      {/* Footer */}
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
      <div style={HEADER_S}>
        <FlaskConical size={16} color="#60a5fa" strokeWidth={1.75} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.02em' }}>
          Quality
        </span>
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

      <div style={BODY_S}>
        {tab === 'flow-chain' && <FlowChainTab />}
        {tab === 'benchmark'  && <BenchmarkDashboard apiKey={apiKey} selectedModel={selectedModel} />}
      </div>
    </div>
  );
}

export default QualityPanel;
