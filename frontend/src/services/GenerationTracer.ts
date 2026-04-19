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

import type {
  DesignRecipeTelemetry,
  FullDebugTrace,
  FullDebugTraceEvent,
  TraceDiffMetadata,
  TraceParserDecision,
  TracePromptRecord,
  TraceRouteRecord,
  TraceRunOutcome,
  TraceSafeModelLabel,
  TraceStepKind,
  TraceStepStatus,
  TraceReviewerDecision,
  VisibleReasoningTrace,
  VisibleReasoningStep,
} from '../shared/projectModel';

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
  /** Optional local-only design telemetry for recipe learning. */
  designTelemetry?: DesignRecipeTelemetry;
  /** Safe user-facing trace for normal product UX. */
  visibleReasoningTrace: VisibleReasoningTrace;
  /** Rich forensic trace for debugging and export. */
  fullDebugTrace: FullDebugTrace;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY  = 'STUDIO_GEN_TRACES';
const MAX_TRACES   = 50;
const MAX_SPAN_DATA = 2_000; // chars — prevent huge content blobs in storage
const MAX_VISIBLE_SUMMARY = 220;
const MAX_TEXT_EXCERPT = 1_200;
const REDACTED = '[redacted]';

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function redactSecrets(input: string): string {
  return input
    .replace(/(authorization\s*[:=]\s*)(bearer\s+)?[^\s,'"`]+/gi, `$1${REDACTED}`)
    .replace(/((?:api[_-]?key|token|secret|password|cookie|session)\s*[:=]\s*)(["'])?[^"',\s`]+(\2)?/gi, `$1${REDACTED}`)
    .replace(/(\b[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)\b\s*=\s*)([^\s]+)/g, `$1${REDACTED}`)
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, REDACTED);
}

function truncateString(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return value.slice(0, limit) + '…[truncated]';
}

function sanitizeText(value: string, limit = MAX_SPAN_DATA): string {
  return truncateString(redactSecrets(value).trim(), limit);
}

function sanitizeVisibleSummary(summary: string): string {
  return sanitizeText(
    summary
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
      .replace(/\s+/g, ' '),
    MAX_VISIBLE_SUMMARY,
  );
}

function sanitizeUnknown(value: unknown, limit = MAX_SPAN_DATA): unknown {
  if (typeof value === 'string') return sanitizeText(value, limit);
  if (Array.isArray(value)) return value.slice(0, 50).map(entry => sanitizeUnknown(entry, limit));
  if (!value || typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/^(authorization|cookie|set-cookie)$/i.test(key)) {
      out[key] = REDACTED;
      continue;
    }
    out[key] = sanitizeUnknown(entry, limit);
  }
  return out;
}

function sanitizeRecord(data: Record<string, unknown>, limit = MAX_SPAN_DATA): Record<string, unknown> {
  return sanitizeUnknown(data, limit) as Record<string, unknown>;
}

function sanitizeLabels(labels?: TraceSafeModelLabel): TraceSafeModelLabel | undefined {
  if (!labels) return undefined;
  return {
    provider: labels.provider ? sanitizeText(labels.provider, 80) : undefined,
    model: labels.model ? sanitizeText(labels.model, 120) : undefined,
    slot: labels.slot ? sanitizeText(labels.slot, 40) : undefined,
    route: labels.route ? sanitizeText(labels.route, 120) : undefined,
  };
}

function buildLegacyVisibleTrace(trace: Pick<GenerationTrace, 'id' | 'startedAt' | 'spans'>): VisibleReasoningTrace {
  const steps: VisibleReasoningStep[] = trace.spans.map((span, index) => ({
    id: `${trace.id}:legacy:${index}`,
    kind: 'reviewer_result',
    status: span.status === 'error' ? 'failed' : span.status === 'warn' ? 'warning' : span.status === 'skipped' ? 'skipped' : 'completed',
    summary: sanitizeVisibleSummary(span.name),
    isActive: false,
    timing: {
      startedAt: trace.startedAt,
      endedAt: trace.startedAt,
      durationMs: span.durationMs,
    },
  }));
  if (steps.length === 0) {
    steps.push({
      id: `${trace.id}:legacy:0`,
      kind: 'intent_understanding',
      status: 'completed',
      summary: 'Legacy trace imported from span history.',
      isActive: false,
      timing: { startedAt: trace.startedAt, endedAt: trace.startedAt, durationMs: 0 },
    });
  }
  return {
    runId: trace.id,
    startedAt: trace.startedAt,
    finishedAt: trace.startedAt,
    activeStepId: null,
    steps,
  };
}

function buildLegacyDebugTrace(trace: Pick<GenerationTrace, 'id' | 'startedAt' | 'intent' | 'spans'>): FullDebugTrace {
  const events: FullDebugTraceEvent[] = [];
  let order = 0;

  function visit(span: TraceSpan): void {
    events.push({
      id: `${trace.id}:legacy:${order + 1}`,
      order: ++order,
      type: 'log',
      kind: 'reviewer_result',
      status: span.status === 'error' ? 'failed' : span.status === 'warn' ? 'warning' : span.status === 'skipped' ? 'skipped' : 'completed',
      summary: sanitizeText(span.name, 200),
      timing: {
        startedAt: trace.startedAt,
        endedAt: trace.startedAt,
        durationMs: span.durationMs,
      },
      metadata: sanitizeRecord(span.data),
    });
    for (const child of span.children) visit(child);
  }

  for (const span of trace.spans) visit(span);

  return {
    runId: trace.id,
    startedAt: trace.startedAt,
    finishedAt: trace.startedAt,
    userPrompt: sanitizeText(trace.intent, MAX_TEXT_EXCERPT),
    routes: [],
    promptRecords: [],
    events,
  };
}

function normalizeStoredTrace(trace: GenerationTrace): GenerationTrace {
  if (trace.visibleReasoningTrace && trace.fullDebugTrace) {
    return {
      ...trace,
      visibleReasoningTrace: {
        ...trace.visibleReasoningTrace,
        activeStepId: trace.visibleReasoningTrace.activeStepId ?? null,
        steps: trace.visibleReasoningTrace.steps ?? [],
      },
      fullDebugTrace: {
        ...trace.fullDebugTrace,
        routes: trace.fullDebugTrace.routes ?? [],
        promptRecords: trace.fullDebugTrace.promptRecords ?? [],
        events: trace.fullDebugTrace.events ?? [],
      },
    };
  }

  return {
    ...trace,
    visibleReasoningTrace: buildLegacyVisibleTrace(trace),
    fullDebugTrace: buildLegacyDebugTrace(trace),
  };
}

function loadTraces(): GenerationTrace[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GenerationTrace[]).map(normalizeStoredTrace) : [];
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
  private _stepOrder = 0;
  private _activeSteps = new Map<string, {
    visibleIndex: number;
    debugIndex: number;
    startedAt: string;
    startedWall: number;
  }>();
  private _finished = false;

  constructor(trace: GenerationTrace) {
    this.id     = trace.id;
    this._trace = trace;
  }

  setMode(mode: 'new' | 'edit'): void {
    this._trace.mode = mode;
  }

  setRoutes(routes: TraceRouteRecord[]): void {
    this._trace.fullDebugTrace.routes = routes.map(route => ({
      role: sanitizeText(route.role, 80),
      keySource: route.keySource ? sanitizeText(route.keySource, 120) : undefined,
      fallbackReason: route.fallbackReason ? sanitizeText(route.fallbackReason, 200) : undefined,
      reason: route.reason ? sanitizeText(route.reason, 200) : undefined,
      ...sanitizeLabels(route),
    }));
  }

  setArchitectSummary(summary: string): void {
    this._trace.fullDebugTrace.architectSummary = sanitizeText(summary, MAX_TEXT_EXCERPT);
  }

  setDesignSummary(summary: string): void {
    this._trace.fullDebugTrace.designSummary = sanitizeText(summary, MAX_TEXT_EXCERPT);
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
      data:     sanitizeRecord(initialData),
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
        span.data = { ...span.data, ...sanitizeRecord(result.data) };
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

  beginStep(input: {
    kind: TraceStepKind;
    summary: string;
    labels?: TraceSafeModelLabel;
    attemptNumber?: number;
    metadata?: Record<string, unknown>;
  }): string {
    const id = uid();
    const startedAt = new Date().toISOString();
    const labels = sanitizeLabels(input.labels);

    for (const step of this._trace.visibleReasoningTrace.steps) {
      step.isActive = false;
    }

    const visibleStep: VisibleReasoningStep = {
      id,
      kind: input.kind,
      status: 'in_progress',
      summary: sanitizeVisibleSummary(input.summary),
      isActive: true,
      attemptNumber: input.attemptNumber,
      timing: { startedAt },
      labels,
    };
    const debugStep: FullDebugTraceEvent = {
      id,
      order: ++this._stepOrder,
      type: 'step',
      kind: input.kind,
      status: 'in_progress',
      summary: sanitizeText(input.summary, 240),
      attemptNumber: input.attemptNumber,
      timing: { startedAt },
      labels,
      metadata: input.metadata ? sanitizeRecord(input.metadata) : undefined,
    };

    this._trace.visibleReasoningTrace.steps.push(visibleStep);
    this._trace.visibleReasoningTrace.activeStepId = id;
    this._trace.fullDebugTrace.events.push(debugStep);
    this._activeSteps.set(id, {
      visibleIndex: this._trace.visibleReasoningTrace.steps.length - 1,
      debugIndex: this._trace.fullDebugTrace.events.length - 1,
      startedAt,
      startedWall: Date.now(),
    });

    return id;
  }

  finishStep(id: string, result: {
    status?: TraceStepStatus;
    summary?: string;
    labels?: TraceSafeModelLabel;
    attemptNumber?: number;
    errorSummary?: string;
    stopReason?: string;
    metadata?: Record<string, unknown>;
    parserDecision?: TraceParserDecision;
    reviewerDecision?: TraceReviewerDecision;
    compileRuntimeLogs?: string[];
    diffMetadata?: TraceDiffMetadata;
  } = {}): void {
    const active = this._activeSteps.get(id);
    if (!active) return;

    const endedAt = new Date().toISOString();
    const durationMs = Date.now() - active.startedWall;
    const nextStatus = result.status ?? 'completed';
    const labels = sanitizeLabels(result.labels);
    const errorSummary = result.errorSummary ? sanitizeText(result.errorSummary, 240) : undefined;
    const stopReason = result.stopReason ? sanitizeText(result.stopReason, 200) : undefined;

    const visibleStep = this._trace.visibleReasoningTrace.steps[active.visibleIndex];
    visibleStep.status = nextStatus;
    visibleStep.summary = sanitizeVisibleSummary(result.summary ?? visibleStep.summary);
    visibleStep.isActive = false;
    visibleStep.errorSummary = errorSummary;
    visibleStep.attemptNumber = result.attemptNumber ?? visibleStep.attemptNumber;
    visibleStep.labels = labels ?? visibleStep.labels;
    visibleStep.timing = {
      startedAt: active.startedAt,
      endedAt,
      durationMs,
    };

    const debugStep = this._trace.fullDebugTrace.events[active.debugIndex];
    debugStep.status = nextStatus;
    debugStep.summary = sanitizeText(result.summary ?? debugStep.summary, 240);
    debugStep.errorSummary = errorSummary;
    debugStep.attemptNumber = result.attemptNumber ?? debugStep.attemptNumber;
    debugStep.labels = labels ?? debugStep.labels;
    debugStep.stopReason = stopReason ?? debugStep.stopReason;
    debugStep.timing = {
      startedAt: active.startedAt,
      endedAt,
      durationMs,
    };
    if (result.metadata) {
      debugStep.metadata = {
        ...(debugStep.metadata ?? {}),
        ...sanitizeRecord(result.metadata),
      };
    }
    if (result.parserDecision) {
      debugStep.parserDecision = sanitizeUnknown(result.parserDecision) as TraceParserDecision;
    }
    if (result.reviewerDecision) {
      debugStep.reviewerDecision = sanitizeUnknown(result.reviewerDecision) as TraceReviewerDecision;
    }
    if (result.compileRuntimeLogs) {
      debugStep.compileRuntimeLogs = result.compileRuntimeLogs.map(log => sanitizeText(log, 300));
    }
    if (result.diffMetadata) {
      debugStep.diffMetadata = sanitizeUnknown(result.diffMetadata) as TraceDiffMetadata;
    }

    if (this._trace.visibleReasoningTrace.activeStepId === id) {
      this._trace.visibleReasoningTrace.activeStepId = null;
    }
    if (stopReason) {
      this._trace.fullDebugTrace.stopReason = stopReason;
    }
    this._activeSteps.delete(id);
  }

  appendStep(input: {
    kind: TraceStepKind;
    summary: string;
    status?: TraceStepStatus;
    labels?: TraceSafeModelLabel;
    attemptNumber?: number;
    errorSummary?: string;
    stopReason?: string;
    metadata?: Record<string, unknown>;
    parserDecision?: TraceParserDecision;
    reviewerDecision?: TraceReviewerDecision;
    compileRuntimeLogs?: string[];
    diffMetadata?: TraceDiffMetadata;
  }): string {
    const id = this.beginStep(input);
    this.finishStep(id, input);
    return id;
  }

  recordDebugEvent(input: {
    kind: TraceStepKind;
    type?: 'prompt' | 'output' | 'decision' | 'log';
    status?: TraceStepStatus;
    summary: string;
    labels?: TraceSafeModelLabel;
    attemptNumber?: number;
    errorSummary?: string;
    stopReason?: string;
    metadata?: Record<string, unknown>;
    prompt?: TracePromptRecord;
    outputExcerpt?: string;
    parserDecision?: TraceParserDecision;
    reviewerDecision?: TraceReviewerDecision;
    compileRuntimeLogs?: string[];
    diffMetadata?: TraceDiffMetadata;
  }): void {
    const event: FullDebugTraceEvent = {
      id: uid(),
      order: ++this._stepOrder,
      type: input.type ?? 'decision',
      kind: input.kind,
      status: input.status ?? 'completed',
      summary: sanitizeText(input.summary, 240),
      labels: sanitizeLabels(input.labels),
      attemptNumber: input.attemptNumber,
      errorSummary: input.errorSummary ? sanitizeText(input.errorSummary, 240) : undefined,
      stopReason: input.stopReason ? sanitizeText(input.stopReason, 200) : undefined,
      metadata: input.metadata ? sanitizeRecord(input.metadata) : undefined,
      prompt: input.prompt
        ? {
            label: sanitizeText(input.prompt.label, 80),
            summary: sanitizeText(input.prompt.summary, 200),
            excerpt: input.prompt.excerpt ? sanitizeText(input.prompt.excerpt, MAX_TEXT_EXCERPT) : undefined,
            promptChars: input.prompt.promptChars,
            responseChars: input.prompt.responseChars,
          }
        : undefined,
      outputExcerpt: input.outputExcerpt ? sanitizeText(input.outputExcerpt, MAX_TEXT_EXCERPT) : undefined,
      parserDecision: input.parserDecision ? sanitizeUnknown(input.parserDecision) as TraceParserDecision : undefined,
      reviewerDecision: input.reviewerDecision ? sanitizeUnknown(input.reviewerDecision) as TraceReviewerDecision : undefined,
      compileRuntimeLogs: input.compileRuntimeLogs?.map(log => sanitizeText(log, 300)),
      diffMetadata: input.diffMetadata ? sanitizeUnknown(input.diffMetadata) as TraceDiffMetadata : undefined,
    };
    this._trace.fullDebugTrace.events.push(event);
    if (event.prompt) {
      this._trace.fullDebugTrace.promptRecords.push(event.prompt);
    }
    if (event.stopReason) {
      this._trace.fullDebugTrace.stopReason = event.stopReason;
    }
  }

  recordPrompt(input: {
    kind: TraceStepKind;
    label: string;
    summary: string;
    excerpt: string;
    labels?: TraceSafeModelLabel;
    attemptNumber?: number;
    promptChars?: number;
    responseChars?: number;
  }): void {
    this.recordDebugEvent({
      kind: input.kind,
      type: 'prompt',
      summary: input.summary,
      labels: input.labels,
      attemptNumber: input.attemptNumber,
      prompt: {
        label: input.label,
        summary: input.summary,
        excerpt: input.excerpt,
        promptChars: input.promptChars,
        responseChars: input.responseChars,
      },
    });
  }

  recordOutput(input: {
    kind: TraceStepKind;
    summary: string;
    excerpt: string;
    labels?: TraceSafeModelLabel;
    attemptNumber?: number;
    metadata?: Record<string, unknown>;
  }): void {
    this.recordDebugEvent({
      kind: input.kind,
      type: 'output',
      summary: input.summary,
      outputExcerpt: input.excerpt,
      labels: input.labels,
      attemptNumber: input.attemptNumber,
      metadata: input.metadata,
    });
  }

  /** Finish the trace, persist it, dispatch event. */
  finish(
    outcome: SpanStatus,
    extra: {
      fileCount?: number;
      errorSummary?: string;
      designTelemetry?: DesignRecipeTelemetry;
      stopReason?: string;
      finalOutcome?: TraceRunOutcome;
    } = {},
  ): void {
    if (this._finished) return;
    this._finished = true;

    this._trace.outcome      = outcome;
    this._trace.e2eMs        = Date.now() - new Date(this._trace.startedAt).getTime();
    this._trace.fileCount    = extra.fileCount;
    this._trace.errorSummary = extra.errorSummary ? sanitizeText(extra.errorSummary, 240) : undefined;
    this._trace.designTelemetry = extra.designTelemetry;
    this._trace.visibleReasoningTrace.finishedAt = new Date().toISOString();
    this._trace.visibleReasoningTrace.activeStepId = null;
    this._trace.visibleReasoningTrace.finalOutcome = extra.finalOutcome;
    this._trace.fullDebugTrace.finishedAt = this._trace.visibleReasoningTrace.finishedAt;
    this._trace.fullDebugTrace.finalOutcome = extra.finalOutcome;
    if (extra.stopReason) {
      this._trace.fullDebugTrace.stopReason = sanitizeText(extra.stopReason, 200);
    }

    // Close any dangling spans
    for (const span of this._spanStack) {
      span.endMs      = this._trace.e2eMs;
      span.durationMs = span.endMs - (span.startMs ?? 0);
      span.status     = 'warn';
      span.data['_autoclose'] = true;
    }
    this._spanStack = [];
    for (const [stepId, active] of this._activeSteps.entries()) {
      const endedAt = this._trace.visibleReasoningTrace.finishedAt;
      const durationMs = Math.max(0, Date.now() - active.startedWall);
      const visibleStep = this._trace.visibleReasoningTrace.steps[active.visibleIndex];
      visibleStep.status = visibleStep.status === 'in_progress' ? 'warning' : visibleStep.status;
      visibleStep.isActive = false;
      visibleStep.timing = {
        startedAt: active.startedAt,
        endedAt,
        durationMs,
      };
      const debugStep = this._trace.fullDebugTrace.events[active.debugIndex];
      debugStep.status = debugStep.status === 'in_progress' ? 'warning' : debugStep.status;
      debugStep.timing = {
        startedAt: active.startedAt,
        endedAt,
        durationMs,
      };
      debugStep.metadata = {
        ...(debugStep.metadata ?? {}),
        _autoclose: true,
      };
      this._activeSteps.delete(stepId);
    }

    const all = loadTraces();
    all.push(normalizeStoredTrace(this._trace));
    saveTraces(all);
    generationTracer.clearActive(this.id);

    try {
      window.dispatchEvent(new CustomEvent('studio-trace', { detail: { ...this._trace } }));
    } catch { /* test environment */ }
  }

  /** Read the in-progress trace snapshot (for live UI). */
  snapshot(): GenerationTrace {
    return JSON.parse(JSON.stringify(this._trace)) as GenerationTrace;
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
      this._active.finish('warn', {
        errorSummary: 'Trace superseded by new generation',
        stopReason: 'trace_superseded',
        finalOutcome: 'superseded',
      });
    }

    const startedAt = new Date().toISOString();
    const id = uid();
    const trace: GenerationTrace = {
      id,
      projectId: params.projectId,
      intent:    sanitizeText(params.intent, MAX_TEXT_EXCERPT),
      model:     sanitizeText(params.model, 120),
      mode:      params.mode,
      startedAt,
      outcome:   'ok',
      spans:     [],
      visibleReasoningTrace: {
        runId: id,
        startedAt,
        activeStepId: null,
        steps: [],
      },
      fullDebugTrace: {
        runId: id,
        startedAt,
        userPrompt: sanitizeText(params.intent, MAX_TEXT_EXCERPT),
        routes: [],
        promptRecords: [],
        events: [],
      },
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
    if (trace.designTelemetry) {
      lines.push(
        `  Design:   ${trace.designTelemetry.recipe.category}/${trace.designTelemetry.recipe.style}`
        + ` → ${trace.designTelemetry.outcome.visualVerdict} (${trace.designTelemetry.outcome.visualScore})`,
      );
    }
    if (trace.visibleReasoningTrace.steps.length > 0) {
      lines.push('  Visible reasoning:');
      for (const step of trace.visibleReasoningTrace.steps) {
        const duration = step.timing?.durationMs !== undefined ? `${step.timing.durationMs}ms` : '?ms';
        const attempt = step.attemptNumber ? ` [attempt ${step.attemptNumber}]` : '';
        lines.push(`    [${step.status.toUpperCase()}] ${step.kind}${attempt} — ${step.summary} (${duration})`);
        if (step.errorSummary) {
          lines.push(`      error: ${step.errorSummary}`);
        }
      }
    }
    if (trace.fullDebugTrace.stopReason || trace.fullDebugTrace.finalOutcome) {
      lines.push(
        `  Debug:    outcome=${trace.fullDebugTrace.finalOutcome ?? '—'}`
        + ` stopReason=${trace.fullDebugTrace.stopReason ?? '—'}`
        + ` events=${trace.fullDebugTrace.events.length}`,
      );
    }
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
