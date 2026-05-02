/**
 * ModelEfficiencyPanel
 *
 * Shows per-model token usage stats so users can compare which LLM model
 * is most efficient for coding tasks.
 * Listens to the 'token-usage-updated' window event for live refresh.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { TokenUsageTracker, type ModelStats } from '../services/TokenUsageTracker';

// ── Rough cost per 1M output tokens (USD) — edit to match your OpenRouter pricing ──
const COST_PER_1M: Record<string, number> = {
  'anthropic/claude-sonnet-4-6':        3.00,
  'anthropic/claude-3-5-sonnet':        3.00,
  'anthropic/claude-3-haiku':           0.25,
  'openai/gpt-4o':                      10.00,
  'openai/gpt-4o-mini':                 0.60,
  'google/gemini-2.0-flash':            0.40,
  'google/gemini-flash-1.5':            0.075,
  'deepseek/deepseek-chat':             0.28,
  'deepseek/deepseek-coder':            0.28,
  'xiaomi/mimo-v2-pro':                 0.50,
  'meta-llama/llama-3.1-70b-instruct':  0.88,
  'qwen/qwen-2.5-coder-32b-instruct':   0.20,
};

function estimateCost(tokens: number, modelId: string): string {
  const rate = COST_PER_1M[modelId] ?? COST_PER_1M[modelId.split(':')[0]] ?? 1.0;
  const usd = (tokens / 1_000_000) * rate;
  if (usd < 0.001) return '<$0.001';
  return `$${usd.toFixed(4)}`;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function shortModel(modelId: string): string {
  const parts = modelId.split('/');
  return parts[parts.length - 1] ?? modelId;
}

// ── Stage labels for display ───────────────────────────────────────────────
const STAGE_LABELS: Record<string, string> = {
  clarifier:          'Clarify',
  architect_landing:  'Arch Landing',
  architect_app:      'Arch App',
  architect_superapp: 'Arch Super',
  tech_lead:          'Tech Lead',
  coder_landing:      'Code Landing',
  coder_app:          'Code App',
  coder_superapp:     'Code Super',
  autofix:            'Autofix',
};

function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage;
}

// ── Bar component ──────────────────────────────────────────────────────────
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ background: '#1e1e2e', borderRadius: 3, height: 6, width: '100%' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .3s' }} />
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────
export const ModelEfficiencyPanel: React.FC = () => {
  const [stats, setStats] = useState<ModelStats[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setStats(TokenUsageTracker.getAll());
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener('token-usage-updated', handler);
    return () => window.removeEventListener('token-usage-updated', handler);
  }, [refresh]);

  if (stats.length === 0) {
    return (
      <div style={{ padding: '24px 16px', color: '#6b7280', fontSize: 13, textAlign: 'center' }}>
        No token usage data yet.<br />
        Run a generation to start collecting stats.
      </div>
    );
  }

  const maxTotal = Math.max(...stats.map(s => s.totalTokens), 1);
  const maxAvg   = Math.max(...stats.map(s => s.callCount > 0 ? Math.round(s.totalTokens / s.callCount) : 0), 1);

  return (
    <div style={{ padding: '8px 0' }}>
      {/* Header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 90px 90px 70px 70px 50px',
        gap: 8,
        padding: '4px 12px 8px',
        borderBottom: '1px solid #2a2a3a',
        color: '#6b7280',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        <span>Model</span>
        <span style={{ textAlign: 'right' }}>Total</span>
        <span style={{ textAlign: 'right' }}>Avg/call</span>
        <span style={{ textAlign: 'right' }}>Calls</span>
        <span style={{ textAlign: 'right' }}>Est. cost</span>
        <span style={{ textAlign: 'right' }}>Overflow</span>
      </div>

      {stats.map(s => {
        const avg     = s.callCount > 0 ? Math.round(s.totalTokens / s.callCount) : 0;
        const cost    = estimateCost(s.totalTokens, s.modelId);
        const overPct = s.callCount > 0 ? Math.round((s.overflowCount / s.callCount) * 100) : 0;
        const isOpen  = expanded === s.modelId;

        // Coding-specific stages for primary metric
        const codingStages = ['coder_landing', 'coder_app', 'coder_superapp'];
        const codingTokens = codingStages.reduce((acc, stage) => acc + (s.byStage[stage] ?? 0), 0);

        return (
          <div key={s.modelId} style={{ borderBottom: '1px solid #1e1e2e' }}>
            {/* Row */}
            <div
              onClick={() => setExpanded(isOpen ? null : s.modelId)}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 90px 90px 70px 70px 50px',
                gap: 8,
                padding: '10px 12px',
                cursor: 'pointer',
                background: isOpen ? '#16162a' : 'transparent',
                transition: 'background .15s',
              }}
            >
              {/* Model name */}
              <div>
                <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>
                  {shortModel(s.modelId)}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                  {s.modelId.split('/')[0]}
                </div>
                {codingTokens > 0 && (
                  <div style={{ marginTop: 4 }}>
                    <Bar value={codingTokens} max={maxTotal} color="#6366f1" />
                    <div style={{ fontSize: 10, color: '#818cf8', marginTop: 2 }}>
                      {formatNum(codingTokens)} coding tokens
                    </div>
                  </div>
                )}
              </div>

              {/* Total */}
              <div style={{ textAlign: 'right', fontSize: 13, color: '#e2e8f0' }}>
                {formatNum(s.totalTokens)}
                <div style={{ marginTop: 4 }}>
                  <Bar value={s.totalTokens} max={maxTotal} color="#22d3ee" />
                </div>
              </div>

              {/* Avg/call */}
              <div style={{ textAlign: 'right', fontSize: 13, color: '#e2e8f0' }}>
                {formatNum(avg)}
                <div style={{ marginTop: 4 }}>
                  <Bar value={avg} max={maxAvg} color="#a78bfa" />
                </div>
              </div>

              {/* Calls */}
              <div style={{ textAlign: 'right', fontSize: 13, color: '#94a3b8' }}>
                {s.callCount}
              </div>

              {/* Cost */}
              <div style={{ textAlign: 'right', fontSize: 13, color: '#34d399' }}>
                {cost}
              </div>

              {/* Overflow */}
              <div style={{
                textAlign: 'right',
                fontSize: 13,
                color: s.overflowCount > 0 ? '#f87171' : '#4b5563',
              }}>
                {s.overflowCount > 0 ? `${overPct}%` : '—'}
              </div>
            </div>

            {/* Expanded: per-stage breakdown */}
            {isOpen && (
              <div style={{ padding: '8px 12px 12px', background: '#0f0f1a' }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Per-stage breakdown
                </div>
                {Object.keys(s.byStage).length === 0 ? (
                  <div style={{ fontSize: 12, color: '#4b5563' }}>No stage data</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {Object.entries(s.byStage).map(([stage, tokens]) => {
                      const count = s.byStageCount[stage] ?? 1;
                      const stageAvg = Math.round(tokens / count);
                      const stageMax = Math.max(...Object.values(s.byStage));
                      return (
                        <div key={stage}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>{stageLabel(stage)}</span>
                            <span style={{ fontSize: 12, color: '#e2e8f0' }}>
                              {formatNum(tokens)} ({count}× avg {formatNum(stageAvg)})
                            </span>
                          </div>
                          <Bar value={tokens} max={stageMax} color="#6366f1" />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Overflow detail */}
                {s.overflowCount > 0 && (
                  <div style={{
                    marginTop: 10,
                    padding: '6px 8px',
                    background: '#2d1a1a',
                    borderRadius: 4,
                    fontSize: 12,
                    color: '#f87171',
                  }}>
                    ⚠ {s.overflowCount} of {s.callCount} calls hit token limit (finish_reason=length).
                    Consider increasing maxTokens for this model in Settings → Agent Config.
                  </div>
                )}

                {/* Clear button */}
                <button
                  onClick={e => {
                    e.stopPropagation();
                    const all = TokenUsageTracker.getAll().filter(x => x.modelId !== s.modelId);
                    // Rebuild storage without this model
                    try {
                      const raw: Record<string, ModelStats> = {};
                      all.forEach(m => { raw[m.modelId] = m; });
                      localStorage.setItem('TOKEN_USAGE_STATS', JSON.stringify(raw));
                      window.dispatchEvent(new CustomEvent('token-usage-updated', { detail: { modelId: s.modelId } }));
                    } catch { /* ignore */ }
                  }}
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: '#6b7280',
                    background: 'none',
                    border: '1px solid #2a2a3a',
                    borderRadius: 3,
                    padding: '2px 8px',
                    cursor: 'pointer',
                  }}
                >
                  Clear stats for this model
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Footer: clear all */}
      <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => { TokenUsageTracker.clearAll(); refresh(); }}
          style={{
            fontSize: 11,
            color: '#6b7280',
            background: 'none',
            border: '1px solid #2a2a3a',
            borderRadius: 3,
            padding: '3px 10px',
            cursor: 'pointer',
          }}
        >
          Clear all stats
        </button>
      </div>
    </div>
  );
};
