/**
 * AI Posture Coach — Studio Preview App
 *
 * Compatible with AIC-RG SandpackPreview (Babel standalone iframe).
 * Rules followed:
 *   - NO import / export statements
 *   - NO TypeScript annotations
 *   - NO export default  (Studio mounts via ReactDOM.createRoot automatically)
 *   - Hooks used via destructured globals (useState, useEffect, etc.)
 *   - React / ReactDOM available as UMD globals
 */

// ─── CONFIG ────────────────────────────────────────────────────────────────

const SNAPSHOT_INTERVAL_MS  = 8_000;   // 8-second intervals in demo (60s in prod)
const ALERT_SCORE_THRESHOLD = 60;
const SUPABASE_URL          = '';      // set to enable real cloud sync
const SUPABASE_ANON_KEY     = '';

// ─── MOCK DATA POOL ────────────────────────────────────────────────────────

const MOCK_POOL = [
  { score: 82, issues: ['Chin slightly forward'],                            tips: ['Tuck chin gently — imagine a string pulling the crown of your head up'], confidence: 'medium' },
  { score: 65, issues: ['Neck tilted forward ~15°', 'Left shoulder raised'], tips: ['Raise monitor 5 cm', 'Drop shoulders on exhale'],                        confidence: 'low'    },
  { score: 91, issues: [],                                                   tips: ['Great posture — keep it up!'],                                             confidence: 'high'   },
  { score: 48, issues: ['Severe forward head', 'Rounded upper back'],        tips: ['Raise monitor to eye level', 'Sit back in chair', 'Add lumbar support'],  confidence: 'medium' },
  { score: 74, issues: ['Slight shoulder asymmetry'],                        tips: ['Check chair height — feet should rest flat on the floor'],                 confidence: 'medium' },
  { score: 57, issues: ['Head forward', 'Screen too close'],                 tips: ['Move screen 50–70 cm away', 'Adjust font size instead of leaning in'],    confidence: 'low'    },
  { score: 88, issues: ['Minor chin drop'],                                  tips: ['Keep ears directly over shoulders'],                                        confidence: 'high'   },
];

function mockResult() {
  return { ...MOCK_POOL[Math.floor(Math.random() * MOCK_POOL.length)], isMock: true };
}

// ─── CLASSIFY ──────────────────────────────────────────────────────────────

function classify(score) {
  if (score >= 90) return { label: 'Excellent', color: '#4ade80', shouldAlert: false };
  if (score >= 70) return { label: 'Good',      color: '#a3e635', shouldAlert: false };
  if (score >= ALERT_SCORE_THRESHOLD)
                   return { label: 'Fair',       color: '#fbbf24', shouldAlert: false };
  if (score >= 40) return { label: 'Poor',       color: '#f97316', shouldAlert: true  };
  return           { label: 'Critical',          color: '#ef4444', shouldAlert: true  };
}

// ─── SUPABASE SYNC ─────────────────────────────────────────────────────────

async function syncToSupabase(payload) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { ok: false };
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/posture_sessions', {
      method: 'POST',
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

// ─── SCORE RING ────────────────────────────────────────────────────────────

function ScoreRing({ score, color }) {
  const r    = 52;
  const circ = 2 * Math.PI * r;
  const pct  = Math.max(0, Math.min(100, score < 0 ? 0 : score)) / 100;
  const dash = circ * pct;

  return (
    <svg width={136} height={136} viewBox="0 0 136 136">
      {/* Track */}
      <circle cx={68} cy={68} r={r} fill="none" stroke="#1e293b" strokeWidth={12} />
      {/* Progress */}
      <circle
        cx={68} cy={68} r={r}
        fill="none"
        stroke={color}
        strokeWidth={12}
        strokeLinecap="round"
        strokeDasharray={dash + ' ' + (circ - dash)}
        strokeDashoffset={circ * 0.25}
        style={{ transition: 'stroke-dasharray 0.7s ease, stroke 0.4s ease' }}
      />
      {/* Score */}
      <text
        x={68} y={63}
        textAnchor="middle"
        fill={color}
        fontSize={28}
        fontWeight={700}
        fontFamily="monospace"
        style={{ transition: 'fill 0.4s ease' }}
      >
        {score < 0 ? '—' : score}
      </text>
      {/* Label */}
      <text x={68} y={82} textAnchor="middle" fill="#64748b" fontSize={11} fontFamily="sans-serif">
        {score < 0 ? 'detecting…' : classify(score).label}
      </text>
    </svg>
  );
}

// ─── MINI CHART ────────────────────────────────────────────────────────────

function MiniChart({ snapshots }) {
  const last = snapshots.slice(-8);
  if (last.length === 0) {
    return (
      <div style={{ color: '#475569', fontSize: 11, textAlign: 'center', padding: '8px 0' }}>
        Waiting for first check…
      </div>
    );
  }

  const BAR_W = 20, GAP = 4, H = 48;
  const totalW = last.length * (BAR_W + GAP) - GAP;

  return (
    <svg width={totalW} height={H + 18} style={{ overflow: 'visible' }}>
      {last.map((s, i) => {
        const safe = s.score < 0 ? 0 : s.score;
        const cl   = classify(safe);
        const barH = Math.max(3, Math.round((safe / 100) * H));
        const x    = i * (BAR_W + GAP);
        const y    = H - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={BAR_W} height={barH} rx={3} fill={cl.color}
              style={{ transition: 'height 0.5s ease, y 0.5s ease' }} />
            <text x={x + BAR_W / 2} y={H + 13} textAnchor="middle" fill="#64748b" fontSize={9}>
              {s.score < 0 ? '?' : s.score}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── SCAN LINE ─────────────────────────────────────────────────────────────

function ScanLine({ active }) {
  const [pos, setPos] = useState(0);

  useEffect(() => {
    if (!active) return;
    let frame;
    let t0 = null;
    const dur = 2400;
    const tick = (ts) => {
      if (!t0) t0 = ts;
      setPos(Math.round((((ts - t0) % dur) / dur) * 100));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  if (!active) return null;
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0,
      top: pos + '%',
      height: 2,
      background: 'linear-gradient(90deg, transparent 0%, #22d3ee 40%, #22d3ee 60%, transparent 100%)',
      boxShadow: '0 0 10px #22d3ee88',
      pointerEvents: 'none',
    }} />
  );
}

// ─── MAIN APP ──────────────────────────────────────────────────────────────

function App() {
  const [isRunning,  setIsRunning]  = useState(false);
  const [current,    setCurrent]    = useState(null);
  const [snapshots,  setSnapshots]  = useState([]);
  const [elapsed,    setElapsed]    = useState(0);
  const [goodSec,    setGoodSec]    = useState(0);
  const [badSec,     setBadSec]     = useState(0);
  const [syncStatus, setSyncStatus] = useState(null); // null | 'syncing' | 'ok' | 'fail'
  const [scanning,   setScanning]   = useState(false);

  const intervalRef = useRef(null);
  const timerRef    = useRef(null);
  const sessionRef  = useRef(null);
  const goodRef     = useRef(0);
  const badRef      = useRef(0);

  // Keep refs in sync for use inside closures
  useEffect(() => { goodRef.current = goodSec; }, [goodSec]);
  useEffect(() => { badRef.current  = badSec;  }, [badSec]);

  // ── Snapshot ────────────────────────────────────────────────────────────

  const snapRef = useRef(null);
  snapRef.current = () => {
    const result = mockResult();
    const entry  = { ...result, capturedAt: Date.now() };
    setCurrent(entry);

    const sec = SNAPSHOT_INTERVAL_MS / 1000;
    setSnapshots(prev => [...prev, entry]);

    if (result.score >= ALERT_SCORE_THRESHOLD) {
      setGoodSec(g => g + sec);
    } else {
      setBadSec(b => b + sec);
    }

    // Brief scan flash
    setScanning(true);
    setTimeout(() => setScanning(false), 1400);
  };

  // ── Start ───────────────────────────────────────────────────────────────

  const handleStart = useCallback(() => {
    sessionRef.current = {
      id:        'session_' + Date.now(),
      startedAt: new Date().toISOString(),
    };

    setIsRunning(true);
    setCurrent(null);
    setSnapshots([]);
    setElapsed(0);
    setGoodSec(0);
    setBadSec(0);
    setSyncStatus(null);
    goodRef.current = 0;
    badRef.current  = 0;

    // Immediate check, then periodic
    snapRef.current();
    intervalRef.current = setInterval(() => snapRef.current(), SNAPSHOT_INTERVAL_MS);
    timerRef.current    = setInterval(() => setElapsed(e => e + 1), 1000);
  }, []);

  // ── Stop ────────────────────────────────────────────────────────────────

  const handleStop = useCallback(() => {
    setIsRunning(false);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (timerRef.current)    { clearInterval(timerRef.current);    timerRef.current    = null; }

    setSyncStatus('syncing');

    // Snapshot state may lag; read latest from ref values captured at stop time
    setSnapshots(prev => {
      const avgScore = prev.length
        ? Math.round(prev.reduce((s, x) => s + Math.max(0, x.score), 0) / prev.length)
        : 0;

      const payload = {
        id:           sessionRef.current?.id ?? ('s_' + Date.now()),
        started_at:   sessionRef.current?.startedAt ?? new Date().toISOString(),
        good_seconds: goodRef.current,
        bad_seconds:  badRef.current,
        snap_count:   prev.length,
        avg_score:    avgScore,
      };

      syncToSupabase(payload).then(r => setSyncStatus(r.ok ? 'ok' : 'fail'));
      return prev;
    });
  }, []);

  // ── Cleanup on unmount ──────────────────────────────────────────────────

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timerRef.current)    clearInterval(timerRef.current);
  }, []);

  // ── Derived values ──────────────────────────────────────────────────────

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  const cl = current
    ? classify(current.score < 0 ? 0 : current.score)
    : { color: '#334155', shouldAlert: false, label: '—' };

  const total    = goodSec + badSec;
  const goodPct  = total > 0 ? Math.round((goodSec / total) * 100) : 0;
  const avgScore = snapshots.length
    ? Math.round(snapshots.reduce((s, x) => s + Math.max(0, x.score), 0) / snapshots.length)
    : null;
  const alertCount = snapshots.filter(s => s.score >= 0 && s.score < ALERT_SCORE_THRESHOLD).length;

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: '100vh',
      background: '#020817',
      color: '#e2e8f0',
      fontFamily: "'Inter','Segoe UI',sans-serif",
      padding: '18px 14px 24px',
      boxSizing: 'border-box',
    }}>

      {/* ── Keyframes injection ── */}
      <style>{`
        @keyframes blink-dot {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.2; }
        }
        @keyframes slide-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <h1 style={{
          margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: '-0.5px',
          background: 'linear-gradient(135deg,#38bdf8,#818cf8)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          🧘 AI Posture Coach
        </h1>
        <p style={{ margin: '4px 0 0', color: '#475569', fontSize: 11 }}>
          Real-time posture analysis · OpenAI Vision API
        </p>
      </div>

      {/* ── Mock Mode Banner ── */}
      <div style={{
        background: '#1c0d00', border: '1px solid #92400e', borderRadius: 8,
        padding: '7px 12px', display: 'flex', alignItems: 'flex-start', gap: 8,
        marginBottom: 14, fontSize: 12, color: '#fcd34d',
        animation: 'slide-in 0.3s ease',
      }}>
        <span style={{ fontSize: 14, flexShrink: 0 }}>🎭</span>
        <span>
          <strong>Demo Mode — </strong>
          Camera inactive, using simulated posture data.
          Add your OpenAI key to enable real vision analysis.
        </span>
      </div>

      {/* ── Alert Banner ── */}
      {current && cl.shouldAlert && isRunning && (
        <div style={{
          background: '#1c0505', border: '1px solid #991b1b', borderRadius: 8,
          padding: '7px 12px', display: 'flex', alignItems: 'flex-start', gap: 8,
          marginBottom: 14, fontSize: 12, color: '#fca5a5',
          animation: 'slide-in 0.25s ease',
        }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
          <span>
            <strong>Poor posture detected — </strong>
            {(current.issues || []).slice(0, 2).join(' · ')}
          </span>
        </div>
      )}

      {/* ── Camera + Score ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>

        {/* Camera frame */}
        <div style={{
          flex: '1 1 180px', minHeight: 150,
          background: '#060f1f',
          borderRadius: 12,
          border: '1px solid ' + (isRunning ? cl.color + '55' : '#1e293b'),
          position: 'relative', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'border-color 0.5s ease',
        }}>
          {/* Skeleton body */}
          <div style={{ textAlign: 'center', opacity: isRunning ? 0.4 : 0.15, userSelect: 'none' }}>
            <div style={{ fontSize: 60, lineHeight: 1 }}>🧍</div>
            <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>
              {isRunning ? 'Monitoring posture…' : 'Press Start to begin'}
            </div>
          </div>

          {/* Scan line */}
          <ScanLine active={scanning} />

          {/* Corner brackets */}
          {[
            { top: 8,    left:  8,    borderTop:    '2px solid', borderLeft:   '2px solid' },
            { top: 8,    right: 8,    borderTop:    '2px solid', borderRight:  '2px solid' },
            { bottom: 8, left:  8,    borderBottom: '2px solid', borderLeft:   '2px solid' },
            { bottom: 8, right: 8,    borderBottom: '2px solid', borderRight:  '2px solid' },
          ].map((s, i) => (
            <div key={i} style={{
              position: 'absolute', width: 14, height: 14,
              borderColor: isRunning ? cl.color : '#1e293b',
              opacity: 0.8,
              transition: 'border-color 0.5s ease',
              ...s,
            }} />
          ))}

          {/* LIVE indicator */}
          {isRunning && (
            <div style={{
              position: 'absolute', top: 9, right: 9,
              display: 'flex', alignItems: 'center', gap: 5,
              background: '#00000099', borderRadius: 20, padding: '3px 8px',
            }}>
              <div style={{
                width: 7, height: 7, borderRadius: '50%',
                background: '#4ade80', boxShadow: '0 0 6px #4ade80',
                animation: 'blink-dot 1.6s ease infinite',
              }} />
              <span style={{ fontSize: 9, color: '#4ade80', fontWeight: 700, letterSpacing: 1 }}>LIVE</span>
            </div>
          )}
        </div>

        {/* Score ring */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 6,
          flex: '0 0 auto',
          background: '#060f1f',
          borderRadius: 12,
          border: '1px solid #1e293b',
          padding: '14px 18px',
        }}>
          <ScoreRing
            score={current ? current.score : (isRunning ? -1 : 0)}
            color={current ? cl.color : '#334155'}
          />
          <div style={{ fontSize: 10, color: '#475569', textAlign: 'center' }}>
            {current
              ? 'Confidence: ' + current.confidence
              : isRunning ? 'Analyzing…' : 'No active session'}
          </div>
        </div>
      </div>

      {/* ── Issues & Tips ── */}
      {current && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          {current.issues && current.issues.length > 0 && (
            <div style={{
              flex: '1 1 130px', background: '#060f1f',
              border: '1px solid ' + (cl.shouldAlert ? '#7f1d1d' : '#1e293b'),
              borderRadius: 10, padding: '10px 12px',
              animation: 'slide-in 0.3s ease',
            }}>
              <div style={{ fontSize: 9, color: '#64748b', marginBottom: 7, textTransform: 'uppercase', letterSpacing: 1 }}>
                Issues found
              </div>
              {current.issues.map((iss, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'flex-start' }}>
                  <span style={{ color: '#f97316', flexShrink: 0, marginTop: 1 }}>▸</span>
                  <span style={{ fontSize: 11, color: '#fcd34d', lineHeight: 1.4 }}>{iss}</span>
                </div>
              ))}
            </div>
          )}

          {current.tips && current.tips.length > 0 && (
            <div style={{
              flex: '1 1 130px', background: '#060f1f',
              border: '1px solid #1e293b',
              borderRadius: 10, padding: '10px 12px',
              animation: 'slide-in 0.3s ease',
            }}>
              <div style={{ fontSize: 9, color: '#64748b', marginBottom: 7, textTransform: 'uppercase', letterSpacing: 1 }}>
                Corrections
              </div>
              {current.tips.map((tip, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'flex-start' }}>
                  <span style={{ color: '#4ade80', flexShrink: 0, marginTop: 1 }}>✓</span>
                  <span style={{ fontSize: 11, color: '#86efac', lineHeight: 1.4 }}>{tip}</span>
                </div>
              ))}
            </div>
          )}

          {current.issues && current.issues.length === 0 && (
            <div style={{
              flex: '1 1 100%', background: '#02160a',
              border: '1px solid #166534', borderRadius: 10,
              padding: '10px 14px', fontSize: 12, color: '#4ade80',
              display: 'flex', alignItems: 'center', gap: 8,
              animation: 'slide-in 0.3s ease',
            }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <span><strong>Excellent posture!</strong> No issues detected — keep it up.</span>
            </div>
          )}
        </div>
      )}

      {/* ── Session Stats ── */}
      <div style={{
        background: '#060f1f', border: '1px solid #1e293b',
        borderRadius: 10, padding: '12px 13px', marginBottom: 14,
      }}>
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>
            Session Stats
          </span>
          <span style={{ fontSize: 16, color: '#38bdf8', fontFamily: 'monospace', fontWeight: 700 }}>
            {mm}:{ss}
          </span>
        </div>

        {/* Stat pills */}
        <div style={{ display: 'flex', gap: 7, marginBottom: 12, flexWrap: 'wrap' }}>
          {[
            { label: 'Checks',    value: snapshots.length,                              color: '#818cf8' },
            { label: 'Avg Score', value: avgScore !== null ? avgScore : '—',             color: avgScore !== null ? classify(avgScore).color : '#475569' },
            { label: 'Good %',    value: total > 0 ? goodPct + '%' : '—',               color: '#4ade80' },
            { label: 'Alerts',    value: alertCount,                                     color: alertCount > 0 ? '#f97316' : '#475569' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: '#0f1e30', borderRadius: 8, padding: '6px 12px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 56,
            }}>
              <span style={{ fontSize: 17, fontWeight: 700, color, fontFamily: 'monospace' }}>{value}</span>
              <span style={{ fontSize: 9, color: '#475569', marginTop: 2 }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Mini chart */}
        <div style={{ overflowX: 'auto' }}>
          <MiniChart snapshots={snapshots} />
        </div>
      </div>

      {/* ── Good/Bad progress bar ── */}
      {total > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#475569', marginBottom: 4 }}>
            <span>✅ Good: {Math.round(goodSec / 60)}m</span>
            <span>⚠️ Needs work: {Math.round(badSec / 60)}m</span>
          </div>
          <div style={{ height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              width: goodPct + '%',
              background: 'linear-gradient(90deg,#4ade80,#a3e635)',
              transition: 'width 0.6s ease',
            }} />
          </div>
        </div>
      )}

      {/* ── Controls ── */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        {!isRunning ? (
          <button onClick={handleStart} style={{
            background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
            color: '#fff', border: 'none', borderRadius: 10,
            padding: '11px 30px', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', letterSpacing: 0.4,
            boxShadow: '0 4px 18px #3b82f666',
          }}>
            ▶ Start Session
          </button>
        ) : (
          <button onClick={handleStop} style={{
            background: 'linear-gradient(135deg,#ef4444,#b91c1c)',
            color: '#fff', border: 'none', borderRadius: 10,
            padding: '11px 30px', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', letterSpacing: 0.4,
            boxShadow: '0 4px 18px #ef444466',
          }}>
            ⏹ Stop & Save
          </button>
        )}
      </div>

      {/* ── Supabase sync badge ── */}
      {syncStatus && (
        <div style={{
          marginTop: 12, textAlign: 'center',
          padding: '8px 16px', borderRadius: 8,
          fontSize: 12,
          background:
            syncStatus === 'ok'      ? '#02160a' :
            syncStatus === 'fail'    ? '#1c0505' : '#020c1a',
          color:
            syncStatus === 'ok'      ? '#4ade80' :
            syncStatus === 'fail'    ? '#f87171' : '#60a5fa',
          border: '1px solid ' + (
            syncStatus === 'ok'      ? '#166534' :
            syncStatus === 'fail'    ? '#7f1d1d' : '#1e3a5f'),
          animation: 'slide-in 0.3s ease',
        }}>
          {syncStatus === 'syncing' && '⏳ Syncing session to Supabase…'}
          {syncStatus === 'ok'      && '✅ Session saved to Supabase successfully'}
          {syncStatus === 'fail'    && '❌ Sync skipped — add Supabase credentials to enable cloud save'}
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ marginTop: 20, textAlign: 'center', color: '#1e293b', fontSize: 10 }}>
        AI Posture Coach · Phase 2 · AIC-RG Studio Demo
      </div>
    </div>
  );
}
