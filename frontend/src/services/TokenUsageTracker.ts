/**
 * TokenUsageTracker
 *
 * Persists per-model token usage statistics to localStorage so users can
 * compare how many tokens different LLM models consume on coding tasks.
 *
 * Storage key: TOKEN_USAGE_STATS
 * Shape: Record<modelId, ModelStats>
 */

const STORAGE_KEY = 'TOKEN_USAGE_STATS';

export interface ModelStats {
  modelId:         string;
  /** Total completion tokens generated across all calls */
  totalTokens:     number;
  /** Number of individual LLM calls recorded */
  callCount:       number;
  /** Number of calls that hit the token limit (finish_reason=length) */
  overflowCount:   number;
  /** Per-stage breakdown: stage → total tokens */
  byStage:         Record<string, number>;
  /** Per-stage call count */
  byStageCount:    Record<string, number>;
  /** Timestamp of last recorded call (ms since epoch) */
  lastSeen:        number;
}

export interface RecordOptions {
  modelId:          string;
  stage:            string;
  completionTokens: number;
  softLimit?:       number;
  overflowed?:      boolean;
}

function load(): Record<string, ModelStats> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, ModelStats>;
  } catch { /* ignore */ }
  return {};
}

function save(data: Record<string, ModelStats>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* storage full — silently skip */ }
}

export const TokenUsageTracker = {
  record(opts: RecordOptions): void {
    const { modelId, stage, completionTokens, overflowed = false } = opts;
    if (!modelId || completionTokens <= 0) return;

    const data = load();
    const existing = data[modelId] ?? {
      modelId,
      totalTokens:   0,
      callCount:     0,
      overflowCount: 0,
      byStage:       {},
      byStageCount:  {},
      lastSeen:      0,
    };

    existing.totalTokens   += completionTokens;
    existing.callCount     += 1;
    if (overflowed) existing.overflowCount += 1;
    existing.byStage[stage]      = (existing.byStage[stage]      ?? 0) + completionTokens;
    existing.byStageCount[stage] = (existing.byStageCount[stage] ?? 0) + 1;
    existing.lastSeen = Date.now();

    data[modelId] = existing;
    save(data);

    // Broadcast so any open UI panel can refresh
    window.dispatchEvent(new CustomEvent('token-usage-updated', { detail: { modelId } }));
  },

  getAll(): ModelStats[] {
    const data = load();
    return Object.values(data).sort((a, b) => b.lastSeen - a.lastSeen);
  },

  getByModel(modelId: string): ModelStats | null {
    return load()[modelId] ?? null;
  },

  /** Average tokens per call for a model (all stages combined) */
  avgTokensPerCall(modelId: string): number {
    const s = load()[modelId];
    if (!s || s.callCount === 0) return 0;
    return Math.round(s.totalTokens / s.callCount);
  },

  /** Average tokens per call for a specific stage */
  avgTokensPerStage(modelId: string, stage: string): number {
    const s = load()[modelId];
    if (!s) return 0;
    const total = s.byStage[stage] ?? 0;
    const count = s.byStageCount[stage] ?? 0;
    if (count === 0) return 0;
    return Math.round(total / count);
  },

  clearAll(): void {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('token-usage-updated', { detail: { modelId: null } }));
  },
};
