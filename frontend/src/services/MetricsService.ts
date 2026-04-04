// MetricsService — Singleton platform-wide metrics collector
// Persists to localStorage, dispatches 'studio-metrics' CustomEvent on each record

const STORAGE_KEY = 'STUDIO_METRICS';
const MAX_ENTRIES = 500;

export type MetricsPhase =
  | 'orchestrator'
  | 'selfcorrect'
  | 'scanner'
  | 'bundler'
  | 'specagent'
  | 'buildagent'
  | 'qaagent'
  | 'clarify'
  | 'agentloop'
  | 'network_recovery';

export interface AgentMetrics {
  id:           string;
  timestamp:    number;
  phase:        MetricsPhase;
  model?:       string;
  durationMs?:  number;
  inputTokens?: number;
  outputTokens?:number;
  cost?:        number;   // estimated USD
  error?:       string;
  sessionId?:   string;   // agent_sessions.id
  blockName?:   string;
  extra?:       Record<string, unknown>;
}

export interface MetricsSummary {
  totalCalls:        number;
  totalDurationMs:   number;
  totalCost:         number;
  totalInputTokens:  number;
  totalOutputTokens: number;
  errors:            number;
  byPhase: Record<string, {
    calls:      number;
    durationMs: number;
    cost:       number;
    errors:     number;
  }>;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

class MetricsServiceClass {
  private entries: AgentMetrics[] = [];

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.entries = JSON.parse(raw) as AgentMetrics[];
    } catch {
      this.entries = [];
    }
  }

  private persist(): void {
    try {
      const toSave = this.entries.slice(-MAX_ENTRIES);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // quota exceeded — drop oldest half
      this.entries = this.entries.slice(-Math.floor(MAX_ENTRIES / 2));
    }
  }

  record(entry: Omit<AgentMetrics, 'id' | 'timestamp'>): AgentMetrics {
    const full: AgentMetrics = { id: uid(), timestamp: Date.now(), ...entry };
    this.entries.push(full);
    if (this.entries.length > MAX_ENTRIES) this.entries.shift();
    this.persist();
    try {
      window.dispatchEvent(new CustomEvent('studio-metrics', { detail: full }));
    } catch { /* SSR / test environment */ }
    return full;
  }

  recordError(phase: MetricsPhase, error: string, extra?: Record<string, unknown>): AgentMetrics {
    return this.record({ phase, error, extra });
  }

  getAll(): AgentMetrics[] {
    return [...this.entries];
  }

  getSession(sessionId: string): AgentMetrics[] {
    return this.entries.filter(e => e.sessionId === sessionId);
  }

  getRecent(n: number): AgentMetrics[] {
    return this.entries.slice(-n);
  }

  getSummary(): MetricsSummary {
    const summary: MetricsSummary = {
      totalCalls: 0, totalDurationMs: 0, totalCost: 0,
      totalInputTokens: 0, totalOutputTokens: 0, errors: 0,
      byPhase: {},
    };

    for (const e of this.entries) {
      summary.totalCalls++;
      summary.totalDurationMs   += e.durationMs    ?? 0;
      summary.totalCost         += e.cost          ?? 0;
      summary.totalInputTokens  += e.inputTokens   ?? 0;
      summary.totalOutputTokens += e.outputTokens  ?? 0;
      if (e.error) summary.errors++;

      if (!summary.byPhase[e.phase]) {
        summary.byPhase[e.phase] = { calls: 0, durationMs: 0, cost: 0, errors: 0 };
      }
      summary.byPhase[e.phase].calls++;
      summary.byPhase[e.phase].durationMs += e.durationMs ?? 0;
      summary.byPhase[e.phase].cost       += e.cost       ?? 0;
      if (e.error) summary.byPhase[e.phase].errors++;
    }

    return summary;
  }

  clear(): void {
    this.entries = [];
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('studio-metrics', { detail: null }));
  }
}

export const metricsService = new MetricsServiceClass();

// ── ErrorEnricher ─────────────────────────────────────────────────────────────

export interface EnrichedError {
  raw:           string;
  file:          string;
  line:          number;
  category:      'bundler' | 'runtime' | 'network' | 'agent' | 'supabase' | 'typescript';
  rootCause:     string;
  suggestedFix:  string;
  affectedFiles: string[];
  agentPrompt:   string;
}

const ERROR_PATTERNS: {
  pattern:       RegExp;
  category:      EnrichedError['category'];
  rootCause:     string;
  suggestedFix:  string;
  affectedFiles: string[];
}[] = [
  {
    pattern:      /Expected.*but found.*\.(sql|md|json)/,
    category:     'bundler',
    rootCause:    'Non-JS file passed to esbuild bundler',
    suggestedFix: 'Remove .sql/.md/.json from result_files in BuildAgent',
    affectedFiles: ['src/lib/bundler.ts', 'src/services/AgentLoopService.ts'],
  },
  {
    pattern:      /is not defined/,
    category:     'runtime',
    rootCause:    'Missing import or deleted component still referenced',
    suggestedFix: 'Find and fix broken import in the file',
    affectedFiles: [],
  },
  {
    pattern:      /WebAssembly.*Import.*go/,
    category:     'bundler',
    rootCause:    'esbuild-wasm not initialized before use',
    suggestedFix: 'Call initBundler() in main.tsx before app render',
    affectedFiles: ['src/lib/bundler.ts', 'src/main.tsx'],
  },
  {
    pattern:      /401/,
    category:     'network',
    rootCause:    'API key missing or invalid',
    suggestedFix: 'Check API key in Settings → Engine',
    affectedFiles: ['src/services/AgentLoopService.ts'],
  },
  {
    pattern:      /невалидный JSON|Failed to parse/,
    category:     'agent',
    rootCause:    'LLM returned malformed JSON response',
    suggestedFix: 'Add stricter JSON instruction to agent prompt',
    affectedFiles: ['src/services/AgentLoopService.ts'],
  },
];

export const enrichError = (error: string, context?: string): EnrichedError => {
  const match = ERROR_PATTERNS.find(p => p.pattern.test(error));

  const fileMatch = error.match(/([a-zA-Z0-9_\-\/]+\.(tsx?|jsx?|sql|css))/);
  const lineMatch = error.match(/:(\d+):\d+/);

  const enriched: EnrichedError = {
    raw:           error,
    file:          fileMatch?.[1] || 'unknown',
    line:          lineMatch ? parseInt(lineMatch[1]) : 0,
    category:      match?.category    || 'runtime',
    rootCause:     match?.rootCause   || 'Unknown error',
    suggestedFix:  match?.suggestedFix || 'Investigate manually',
    affectedFiles: match?.affectedFiles || [],
    agentPrompt:   '',
  };

  enriched.agentPrompt = `
ОШИБКА В СИСТЕМЕ — ТРЕБУЕТСЯ ИСПРАВЛЕНИЕ

Категория: ${enriched.category}
Файл: ${enriched.file}${enriched.line ? `:${enriched.line}` : ''}
Оригинальная ошибка: ${enriched.raw}
Причина: ${enriched.rootCause}
Решение: ${enriched.suggestedFix}
Затронутые файлы: ${enriched.affectedFiles.join(', ')}
Контекст: ${context || 'нет'}

Исправь эту ошибку следуя указанному решению.
Изменяй только затронутые файлы.
  `.trim();

  return enriched;
};
