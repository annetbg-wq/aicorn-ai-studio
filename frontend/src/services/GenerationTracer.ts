/**
 * GenerationTracer — structured span tracing for the full generation pipeline.
 *
 * Captures every stage from intent → plan → code → compile → preview → save,
 * with timing, token counts, and outcome at each step.
 *
 * Storage: circular buffer of last 50 traces in localStorage.
 * Each trace is a lightweight tree of named spans.
 *
 * Callers:
 *   SimpleGeneration — starts a trace, records spans at each pipeline stage
 *   RevisionManager  — calls tracer.span('compile', ...) / tracer.span('preview_mount', ...)
 *   compileGuard     — records compile attempts + fix outcomes
 *
 * Design goals:
 *   - Zero network calls — purely local, no Supabase dependency
 *   - Additive — existing code keeps working if tracer is not initialized
 *   - Inspectable in DevTools: window.__generationTracer for live access
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type SpanStatus = 'ok' | 'warn' | 'error' | 'skipped';

export interface TraceSpan {
  name:       string;
  startMs:    number;
  endMs?:     number;
  durationMs?: number;
  status:     SpanStatus;
  /** Arbitrary structured payload (file counts, token counts, error messages…) */
  data:       Record<string, unknown>;
  /** Child spans — for nested stages like compile attempt 1 / 2 / 3. */
  children:   TraceSpan[];
}

export interface GenerationTrace {
  /** Unique trace ID — correlates with MetricsService generation_id */
  id:         string;
  projectId?:  string;
  intent:      string;
  model:       string;
  mode:        'new' | 'edit';
  /** ISO timestamp of trace start */
  startedAt:   string;
  /** ms from trace start to first token */
  ttftMs?:     number;
  /** ms from trace start to preview ready */
  e2eMs?:      number;
  /** Final outcome */
  outcome:     SpanStatus;
  spans:       TraceSpan[];
  /** Aggregated token usage */
  tokens?: {
    prompt:     number;
    completion: number;
  };
  /** Files written in this generation */
  fileCount?:  number;
  /** Human-readable summary of what went wrong (if outcome !== 'ok') */
  errorSummary?: string;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY  = 'STUDIO_GEN_TRACES';
const MAX_TRACES   = 50;
const MAX_SPAN_DATA = 2_000; // chars — prevent huge content blobs in storage

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function truncateData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string' && v.length > MAX_SPAN_DATA) {
      out[k] = v.slice(0, MAX_SPAN_DATA) + '…[truncated]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

function loadTraces(): GenerationTrace[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GenerationTrace[]) : [];
  } catch {
    return [];
  }
}

function saveTraces(traces: GenerationTrace[]): void {
  try {
    const toSave = traces.slice(-MAX_TRACES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // quota — drop oldest quarter
    const trimmed = traces.slice(-Math.floor(MAX_TRACES / 4));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed)); } catch { /* ignore */ }
  }
}

// ─── Active Trace Handle ──────────────────────────────────────────────────────

/**
 * TraceHandle — returned by GenerationTracer.start().
 * Callers use this to open/close spans and finish the trace.
 */
export class TraceHandle {
  readonly id: string;
  private readonly _trace: GenerationTrace;
  private _spanStack: TraceSpan[] = [];

  constructor(trace: GenerationTrace) {
    this.id     = trace.id;
    this._trace = trace;
  }

  /**
   * Open a named span. Returns a closer function — call it when the stage ends.
   *
   *   const close = tracer.span('compile');
   *   // ... do work ...
   *   close({ files: 5 });
   */
  span(
    name: string,
    initialData: Record<string, unknown> = {},
  ): (result?: { status?: SpanStatus; data?: Record<string, unknown> }) => void {
    const span: TraceSpan = {
      name,
      startMs:  Date.now() - new Date(this._trace.startedAt).getTime(),
      status:   'ok',
      data:     truncateData(initialData),
      children: [],
    };

    // Nest under current top-of-stack, or at root
    const parent = this._spanStack[this._spanStack.length - 1];
    if (parent) {
      parent.children.push(span);
    } else {
      this._trace.spans.push(span);
    }
    this._spanStack.push(span);

    const startWall = Date.now();

    return (result = {}) => {
      span.endMs      = Date.now() - new Date(this._trace.startedAt).getTime();
      span.durationMs = Date.now() - startWall;
      span.status     = result.status ?? 'ok';
      if (result.data) {
        span.data = { ...span.data, ...truncateData(result.data) };
      }
      // Pop from stack (handle non-LIFO calls gracefully)
      const idx = this._spanStack.lastIndexOf(span);
      if (idx !== -1) this._spanStack.splice(idx, 1);
    };
  }

  /** Log a named event without a duration (point-in-time). */
  event(name: string, data: Record<string, unknown> = {}): void {
    const closer = this.span(name, data);
    closer({ status: 'ok' });
  }

  /** Record first-token time. Safe to call multiple times — only the first wins. */
  markFirstToken(): void {
    if (this._trace.ttftMs === undefined) {
      this._trace.ttftMs = Date.now() - new Date(this._trace.startedAt).getTime();
    }
  }

  /** Update token counts (additive). */
  addTokens(prompt: number, completion: number): void {
    if (!this._trace.tokens) this._trace.tokens = { prompt: 0, completion: 0 };
    this._trace.tokens.prompt     += prompt;
    this._trace.tokens.completion += completion;
  }

  /** Finish the trace, persist it, dispatch event. */
  finish(outcome: SpanStatus, extra: { fileCount?: number; errorSummary?: string } = {}): void {
    this._trace.outcome      = outcome;
    this._trace.e2eMs        = Date.now() - new Date(this._trace.startedAt).getTime();
    this._trace.fileCount    = extra.fileCount;
    this._trace.errorSummary = extra.errorSummary;

    // Close any dangling spans
    for (const span of this._spanStack) {
      span.endMs      = this._trace.e2eMs;
      span.durationMs = span.endMs - (span.startMs ?? 0);
      span.status     = 'warn';
      span.data['_autoclose'] = true;
    }
    this._spanStack = [];

    const all = loadTraces();
    all.push(this._trace);
    saveTraces(all);

    try {
      window.dispatchEvent(new CustomEvent('studio-trace', { detail: { ...this._trace } }));
    } catch { /* test environment */ }
  }

  /** Read the in-progress trace snapshot (for live UI). */
  snapshot(): GenerationTrace {
    return { ...this._trace };
  }
}

// ─── Tracer Singleton ─────────────────────────────────────────────────────────

class GenerationTracerClass {
  /** Currently active trace (only one can run at a time per tab). */
  private _active: TraceHandle | null = null;

  /**
   * Start a new generation trace.
   * If a previous trace is still open, it is force-finished as 'warn'.
   */
  start(params: {
    intent:    string;
    model:     string;
    mode:      'new' | 'edit';
    projectId?: string;
  }): TraceHandle {
    if (this._active) {
      // Previous trace wasn't finished — close it
      this._active.finish('warn', { errorSummary: 'Trace superseded by new generation' });
    }

    const trace: GenerationTrace = {
      id:        uid(),
      projectId: params.projectId,
      intent:    params.intent.slice(0, 200),
      model:     params.model,
      mode:      params.mode,
      startedAt: new Date().toISOString(),
      outcome:   'ok',
      spans:     [],
    };

    const handle = new TraceHandle(trace);
    this._active = handle;
    return handle;
  }

  /** Get the currently active trace handle (may be null). */
  current(): TraceHandle | null {
    return this._active;
  }

  /** Clear the active reference (called when finish() completes). */
  clearActive(id: string): void {
    if (this._active?.id === id) this._active = null;
  }

  /** Load all persisted traces (for ObservabilityPanel). */
  getAll(): GenerationTrace[] {
    return loadTraces();
  }

  /** Load the most recent N traces. */
  getRecent(n: number): GenerationTrace[] {
    return loadTraces().slice(-n);
  }

  /** Clear all stored traces. */
  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
    this._active = null;
  }

  /**
   * Format a trace as a human-readable string for display or export.
   */
  format(trace: GenerationTrace): string {
    const lines: string[] = [
      `Trace ${trace.id}  [${trace.mode.toUpperCase()}]  ${trace.outcome.toUpperCase()}`,
      `  Intent:   ${trace.intent}`,
      `  Model:    ${trace.model}`,
      `  Started:  ${trace.startedAt}`,
      `  TTFT:     ${trace.ttftMs ?? '—'}ms`,
      `  E2E:      ${trace.e2eMs ?? '—'}ms`,
      `  Files:    ${trace.fileCount ?? '—'}`,
      `  Tokens:   ${trace.tokens ? `${trace.tokens.prompt}p / ${trace.tokens.completion}c` : '—'}`,
    ];
    if (trace.errorSummary) lines.push(`  Error:    ${trace.errorSummary}`);
    lines.push('  Spans:');

    function formatSpan(span: TraceSpan, indent: string): void {
      const dur = span.durationMs ? `${span.durationMs}ms` : '?ms';
      lines.push(`${indent}  [${span.status.toUpperCase().padEnd(7)}] ${span.name}  (${dur})`);
      const keys = Object.keys(span.data);
      if (keys.length) {
        const preview = keys.map(k => `${k}=${JSON.stringify(span.data[k])}`).join(', ').slice(0, 120);
        lines.push(`${indent}    → ${preview}`);
      }
      for (const child of span.children) {
        formatSpan(child, indent + '  ');
      }
    }

    for (const span of trace.spans) {
      formatSpan(span, '');
    }

    return lines.join('\n');
  }
}

export const generationTracer = new GenerationTracerClass();

// Expose for DevTools debugging
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>)['__generationTracer'] = generationTracer;
}
