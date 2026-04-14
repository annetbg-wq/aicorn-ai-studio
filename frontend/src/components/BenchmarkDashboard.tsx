/**
 * BenchmarkDashboard — Quality dashboard for golden suite testing
 * and model comparison.
 *
 * Step 11.1: Run golden suite, display results table + summary.
 * Step 11.3: Compare two models side-by-side on the same prompt.
 */

import React, { useState, useRef, useCallback } from 'react';
import { Play, Download, BarChart2, GitCompare, X } from 'lucide-react';
import { BenchmarkService } from '../services/benchmark/BenchmarkService';
import type { GoldenSuiteResult, GoldenTestDetail } from '../services/benchmark/BenchmarkService';
import { goldenTests } from '../services/benchmark/goldenTests';
import { fetchModels, type Model } from '../services/ModelRegistry';

// ── Types ──────────────────────────────────────────────────────────────────

interface Props {
  apiKey: string;
  selectedModel?: string;
}

type Tab = 'suite' | 'compare';

interface ComparisonResult {
  modelA: string;
  modelB: string;
  resultA: GoldenTestDetail;
  resultB: GoldenTestDetail;
}

// ── Styles ─────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
  padding: 20,
};

const badge = (variant: 'pass' | 'fail' | 'warn' | 'neutral'): React.CSSProperties => {
  const colors = {
    pass:    { bg: 'rgba(74,222,128,0.12)',  color: '#4ade80', border: 'rgba(74,222,128,0.25)' },
    fail:    { bg: 'rgba(248,113,113,0.12)', color: '#f87171', border: 'rgba(248,113,113,0.25)' },
    warn:    { bg: 'rgba(251,191,36,0.12)',  color: '#fbbf24', border: 'rgba(251,191,36,0.25)' },
    neutral: { bg: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: 'rgba(255,255,255,0.1)' },
  };
  const c = colors[variant];
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    background: c.bg,
    color: c.color,
    border: `1px solid ${c.border}`,
  };
};

const thStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  fontSize: 10,
  fontWeight: 700,
  color: 'rgba(255,255,255,0.35)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 12,
  color: 'rgba(255,255,255,0.7)',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
};

// ── Component ──────────────────────────────────────────────────────────────

export const BenchmarkDashboard: React.FC<Props> = React.memo(({ apiKey, selectedModel = '' }) => {
  const [tab, setTab] = useState<Tab>('suite');

  // ── Golden Suite state ─────────────────────────────────────
  const [result,    setResult]    = useState<GoldenSuiteResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress,  setProgress]  = useState({ done: 0, total: 0 });
  const abortRef = useRef<AbortController | null>(null);

  // ── Model Comparison state ─────────────────────────────────
  const [models,       setModels]       = useState<Model[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelA,       setModelA]       = useState('');
  const [modelB,       setModelB]       = useState('');
  const [compareTest,  setCompareTest]  = useState(goldenTests[0]?.id ?? '');
  const [comparison,   setComparison]   = useState<ComparisonResult | null>(null);
  const [isComparing,  setIsComparing]  = useState(false);
  const [compareProg,  setCompareProg]  = useState({ step: '', pct: 0 });
  const compareAbortRef = useRef<AbortController | null>(null);

  // ── Fetch models once when Compare tab opens ───────────────
  const loadModels = useCallback(async () => {
    if (models.length > 0 || modelsLoading || !apiKey) return;
    setModelsLoading(true);
    try {
      const list = await fetchModels('openrouter', apiKey);
      setModels(list);
      if (list.length >= 2) {
        setModelA(selectedModel || list[0].id);
        setModelB(list[1].id);
      }
    } finally {
      setModelsLoading(false);
    }
  }, [apiKey, models.length, modelsLoading, selectedModel]);

  // ── Run golden suite ───────────────────────────────────────
  const runSuite = async () => {
    if (!apiKey || isRunning) return;
    setIsRunning(true);
    setResult(null);
    setProgress({ done: 0, total: goldenTests.length });

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await BenchmarkService.runGoldenSuite(apiKey, selectedModel || 'openai/gpt-4o', {
        signal: ctrl.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setResult(res);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error('[BenchmarkDashboard]', e);
      }
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const stopSuite = () => {
    abortRef.current?.abort();
  };

  // ── Export JSON ────────────────────────────────────────────
  const exportReport = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `golden-suite-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Run comparison ─────────────────────────────────────────
  const runComparison = async () => {
    if (!apiKey || !modelA || !modelB || isComparing) return;
    setIsComparing(true);
    setComparison(null);
    const ctrl = new AbortController();
    compareAbortRef.current = ctrl;

    try {
      setCompareProg({ step: `Running on ${modelA}...`, pct: 25 });
      const resA = await BenchmarkService.runGoldenSuite(apiKey, modelA, {
        testIds: [compareTest],
        signal: ctrl.signal,
      });

      setCompareProg({ step: `Running on ${modelB}...`, pct: 65 });
      const resB = await BenchmarkService.runGoldenSuite(apiKey, modelB, {
        testIds: [compareTest],
        signal: ctrl.signal,
      });

      if (resA.details[0] && resB.details[0]) {
        setComparison({
          modelA, modelB,
          resultA: resA.details[0],
          resultB: resB.details[0],
        });
      }
      setCompareProg({ step: 'Done', pct: 100 });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error('[BenchmarkDashboard] compare', e);
      }
    } finally {
      setIsComparing(false);
      compareAbortRef.current = null;
    }
  };

  const stopCompare = () => {
    compareAbortRef.current?.abort();
  };

  // ── Derived values ─────────────────────────────────────────
  const fallbackCount = result ? result.details.filter(d => !d.parsedOk || d.missingFiles.length > 0).length : 0;
  const fallbackRate  = result ? Math.round((fallbackCount / result.total) * 100) : 0;

  // ── Tab bar ────────────────────────────────────────────────
  const renderTabs = () => (
    <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
      {([
        { key: 'suite'   as Tab, label: 'Golden Suite',    icon: <BarChart2 size={13} /> },
        { key: 'compare' as Tab, label: 'Compare Models',  icon: <GitCompare size={13} /> },
      ]).map(t => (
        <button
          key={t.key}
          onClick={() => {
            setTab(t.key);
            if (t.key === 'compare') loadModels();
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.18s',
            background: tab === t.key ? 'rgba(96,165,250,0.12)' : 'transparent',
            border: `1px solid ${tab === t.key ? 'rgba(96,165,250,0.3)' : 'rgba(255,255,255,0.06)'}`,
            color: tab === t.key ? '#60a5fa' : 'rgba(255,255,255,0.4)',
          }}
        >
          {t.icon} {t.label}
        </button>
      ))}
    </div>
  );

  // ── Golden Suite panel ─────────────────────────────────────
  const renderSuite = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={isRunning ? stopSuite : runSuite}
          disabled={!apiKey}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            cursor: apiKey ? 'pointer' : 'not-allowed',
            background: isRunning ? 'rgba(248,113,113,0.15)' : 'rgba(74,222,128,0.12)',
            border: `1px solid ${isRunning ? 'rgba(248,113,113,0.3)' : 'rgba(74,222,128,0.3)'}`,
            color: isRunning ? '#f87171' : '#4ade80',
            opacity: apiKey ? 1 : 0.4,
            transition: 'all 0.18s',
          }}
        >
          {isRunning ? <><X size={13} /> Stop</> : <><Play size={13} /> Run Golden Suite</>}
        </button>

        {result && (
          <button
            onClick={exportReport}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.6)',
              transition: 'all 0.18s',
            }}
          >
            <Download size={13} /> Export Report
          </button>
        )}

        {!apiKey && (
          <span style={{ fontSize: 11, color: 'rgba(248,113,113,0.7)' }}>
            API key required
          </span>
        )}
      </div>

      {/* Progress bar */}
      {isRunning && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
              Running test {progress.done}/{progress.total}...
            </span>
            <span style={{ fontSize: 11, color: '#60a5fa', fontFamily: 'monospace' }}>
              {progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%
            </span>
          </div>
          <div style={{
            height: 4, borderRadius: 4,
            background: 'rgba(255,255,255,0.06)',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 4,
              width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
              background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      )}

      {/* Summary */}
      {result && (
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ ...card, flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: result.passed === result.total ? '#4ade80' : '#fbbf24' }}>
              {result.passed}/{result.total}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginTop: 4 }}>
              Pass Rate
            </div>
          </div>
          <div style={{ ...card, flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#60a5fa' }}>
              {(result.avgTimeMs / 1000).toFixed(1)}s
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginTop: 4 }}>
              Avg Time
            </div>
          </div>
          <div style={{ ...card, flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: fallbackRate > 30 ? '#f87171' : '#fbbf24' }}>
              {fallbackRate}%
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginTop: 4 }}>
              Fallback Rate
            </div>
          </div>
        </div>
      )}

      {/* Results table */}
      {result && (
        <div style={{ ...card, padding: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Test</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Parse</th>
                <th style={thStyle}>App.tsx</th>
                <th style={thStyle}>Time</th>
                <th style={thStyle}>Details</th>
              </tr>
            </thead>
            <tbody>
              {result.details.map(d => (
                <tr key={d.testId}>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
                    {d.testId}
                  </td>
                  <td style={tdStyle}>
                    <span style={badge(d.passed ? 'pass' : 'fail')}>
                      {d.passed ? 'PASS' : 'FAIL'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={badge(d.parsedOk ? 'pass' : 'fail')}>
                      {d.parsedOk ? 'OK' : 'FAIL'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={badge(d.appTsxValid ? 'pass' : 'fail')}>
                      {d.appTsxValid ? 'OK' : 'FAIL'}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                    {(d.durationMs / 1000).toFixed(1)}s
                  </td>
                  <td style={{ ...tdStyle, fontSize: 11 }}>
                    {d.missingFiles.length > 0 && (
                      <span style={{ color: '#f87171' }}>
                        Missing: {d.missingFiles.join(', ')}
                      </span>
                    )}
                    {d.truncatedFiles.length > 0 && (
                      <span style={{ color: '#fbbf24', marginLeft: d.missingFiles.length > 0 ? 8 : 0 }}>
                        Truncated: {d.truncatedFiles.join(', ')}
                      </span>
                    )}
                    {d.error && (
                      <span style={{ color: '#f87171' }}>{d.error}</span>
                    )}
                    {d.passed && d.missingFiles.length === 0 && d.truncatedFiles.length === 0 && !d.error && (
                      <span style={{ color: 'rgba(255,255,255,0.25)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ── Compare Models panel ───────────────────────────────────
  const renderCompare = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Model selectors */}
      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Setup
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {/* Model A */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
              Model A
            </label>
            <select
              value={modelA}
              onChange={e => setModelA(e.target.value)}
              disabled={modelsLoading}
              style={{
                width: '100%', padding: '7px 10px', borderRadius: 8, fontSize: 12,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.8)', outline: 'none',
              }}
            >
              {modelsLoading && <option>Loading models...</option>}
              {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          {/* Model B */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
              Model B
            </label>
            <select
              value={modelB}
              onChange={e => setModelB(e.target.value)}
              disabled={modelsLoading}
              style={{
                width: '100%', padding: '7px 10px', borderRadius: 8, fontSize: 12,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.8)', outline: 'none',
              }}
            >
              {modelsLoading && <option>Loading models...</option>}
              {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          {/* Test prompt */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
              Test Prompt
            </label>
            <select
              value={compareTest}
              onChange={e => setCompareTest(e.target.value)}
              style={{
                width: '100%', padding: '7px 10px', borderRadius: 8, fontSize: 12,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.8)', outline: 'none',
              }}
            >
              {goldenTests.map(t => (
                <option key={t.id} value={t.id}>{t.id} — {t.prompt}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Run button */}
        <button
          onClick={isComparing ? stopCompare : runComparison}
          disabled={!apiKey || !modelA || !modelB || modelA === modelB}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
            padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            cursor: (apiKey && modelA && modelB && modelA !== modelB) ? 'pointer' : 'not-allowed',
            background: isComparing ? 'rgba(248,113,113,0.15)' : 'rgba(168,85,247,0.12)',
            border: `1px solid ${isComparing ? 'rgba(248,113,113,0.3)' : 'rgba(168,85,247,0.3)'}`,
            color: isComparing ? '#f87171' : '#a855f7',
            opacity: (apiKey && modelA && modelB && modelA !== modelB) ? 1 : 0.4,
            transition: 'all 0.18s',
          }}
        >
          {isComparing ? <><X size={13} /> Stop</> : <><GitCompare size={13} /> Run Comparison</>}
        </button>

        {modelA === modelB && modelA !== '' && (
          <span style={{ fontSize: 11, color: 'rgba(251,191,36,0.7)' }}>Select two different models</span>
        )}
      </div>

      {/* Comparison progress */}
      {isComparing && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
              {compareProg.step}
            </span>
            <span style={{ fontSize: 11, color: '#a855f7', fontFamily: 'monospace' }}>
              {compareProg.pct}%
            </span>
          </div>
          <div style={{
            height: 4, borderRadius: 4,
            background: 'rgba(255,255,255,0.06)',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 4,
              width: `${compareProg.pct}%`,
              background: 'linear-gradient(90deg, #7c3aed, #a855f7)',
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      )}

      {/* Side-by-side results */}
      {comparison && (
        <div style={{ display: 'flex', gap: 12 }}>
          {([
            { label: 'Model A', model: comparison.modelA, r: comparison.resultA },
            { label: 'Model B', model: comparison.modelB, r: comparison.resultB },
          ]).map(({ label, model, r }) => (
            <div key={label} style={{ ...card, flex: 1 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                {label}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: 12, wordBreak: 'break-all' }}>
                {model}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Row label="Status" value={<span style={badge(r.passed ? 'pass' : 'fail')}>{r.passed ? 'PASS' : 'FAIL'}</span>} />
                <Row label="Time" value={`${(r.durationMs / 1000).toFixed(1)}s`} />
                <Row label="Parse OK" value={<span style={badge(r.parsedOk ? 'pass' : 'fail')}>{r.parsedOk ? 'Yes' : 'No'}</span>} />
                <Row label="App.tsx Valid" value={<span style={badge(r.appTsxValid ? 'pass' : 'fail')}>{r.appTsxValid ? 'Yes' : 'No'}</span>} />
                <Row label="Missing Files" value={r.missingFiles.length === 0 ? '0' : r.missingFiles.join(', ')} />
                <Row label="Truncated" value={r.truncatedFiles.length === 0 ? '0' : r.truncatedFiles.join(', ')} />
                {r.error && <Row label="Error" value={<span style={{ color: '#f87171' }}>{r.error}</span>} />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{
      flex: 1, height: '100%', overflow: 'auto',
      padding: '28px 32px',
      background: '#050505',
      color: 'rgba(255,255,255,0.8)',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.9)', margin: 0 }}>
          Quality Dashboard
        </h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: '4px 0 0' }}>
          Run golden tests and compare models
        </p>
      </div>

      {renderTabs()}
      {tab === 'suite' && renderSuite()}
      {tab === 'compare' && renderCompare()}
    </div>
  );
});

// ── Tiny helper ──────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{label}</span>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontFamily: typeof value === 'string' ? 'monospace' : undefined }}>
        {value}
      </span>
    </div>
  );
}

export default BenchmarkDashboard;
