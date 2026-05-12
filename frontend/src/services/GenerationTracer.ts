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
  GenerationRunStepTelemetry,
  DesignRecipeTelemetry,
  FullDebugTrace,
  FullDebugTraceEvent,
  TraceDiffMetadata,
  TraceParserDecision,
  TracePromptRecord,
  TraceRouteRecord,
  TraceRunSummary,
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
  branchId?:   string;
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
  /** Structured run truth consumed by Reasoning / Analytics UI. */
  runSummary?: TraceRunSummary;
  /** Safe user-facing trace for normal product UX. */
  visibleReasoningTrace: VisibleReasoningTrace;
  /** Rich forensic trace for debugging and export. */
  fullDebugTrace: FullDebugTrace;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY  = 'STUDIO_GEN_TRACES';
const DEBUG_STORAGE_KEY = 'STUDIO_FULL_DEBUG_TRACES';
const FIRST_LLM_STEP_LAST_KEY = 'ai_studio:first_llm_step:last';
const FIRST_LLM_STEP_HISTORY_KEY = 'ai_studio:first_llm_step:history';
const MAX_TRACES   = 50;
const MAX_FIRST_LLM_STEP_RECORDS = 20;
const MAX_SPAN_DATA = 2_000; // chars — prevent huge content blobs in storage
const MAX_VISIBLE_SUMMARY = 220;
const MAX_TEXT_EXCERPT = 1_200;
const REDACTED = '[redacted]';

export type FirstLLMStepParseStatus =
  | 'raw_received'
  | 'parsed_ok'
  | 'parsed_failed'
  | 'request_failed';

export interface FirstLLMStepDebugRecord {
  schema: 'aic-first-llm-step-v1';
  id: string;
  timestamp: string;
  stepIdentity: 'SimpleGeneration.generatePlan';
  projectId?: string;
  intentText: string;
  route?: {
    slot?: string;
    provider?: string;
    modelId?: string;
    endpoint?: string;
    keySource?: string;
    fallbackReason?: string;
    reason?: string;
  };
  request: {
    systemPrompt: string;
    userPayload: string;
    stream: boolean;
    temperature: number;
    maxTokens: number;
  };
  statusHistory: FirstLLMStepParseStatus[];
  parseStatus: FirstLLMStepParseStatus;
  rawCompletionText?: string;
  parsedJsonObject?: unknown;
  parseErrorMessage?: string;
  requestErrorMessage?: string;
}

interface StoredFullDebugTraceEnvelope {
  runId: string;
  traceId: string;
  projectId?: string;
  branchId?: string;
  startedAt: string;
  finishedAt?: string;
  trace: FullDebugTrace;
}

interface FullDebugTraceLookup {
  runId?: string | null;
  projectId?: string | null;
  branchId?: string | null;
}

interface FullDebugTraceExportPayload {
  schema: 'aic-rg-full-debug-trace-v1';
  exportedAt: string;
  traceId: string;
  runId: string;
  projectId?: string;
  branchId?: string;
  mode?: GenerationTrace['mode'];
  model?: string;
  outcome?: SpanStatus;
  errorSummary?: string;
  safety: {
    redaction: 'secrets-sensitive-headers-hidden-chain-of-thought';
    rawHiddenChainOfThought: 'excluded';
  };
  fullDebugTrace: FullDebugTrace;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function redactSecrets(input: string): string {
  return input
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, REDACTED)
    .replace(/<chain[_-]?of[_-]?thought>[\s\S]*?<\/chain[_-]?of[_-]?thought>/gi, REDACTED)
    .replace(/^.*(?:raw\s+hidden\s+chain[-\s]?of[-\s]?thought|hidden\s+chain[-\s]?of[-\s]?thought|hidden\s+reasoning|chain[-\s]?of[-\s]?thought).*$/gim, REDACTED)
    .replace(/(authorization\s*[:=]\s*)(bearer\s+)?[^\s,'"`]+/gi, `$1${REDACTED}`)
    .replace(/((?:api[_-]?key|token|secret|password|cookie|session)\s*[:=]\s*)(["'])?[^"',\s`]+(\2)?/gi, `$1${REDACTED}`)
    .replace(/(\b[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)\b\s*=\s*)([^\s]+)/g, `$1${REDACTED}`)
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, REDACTED);
}

function isSensitiveKey(key: string): boolean {
  return /^(authorization|cookie|set-cookie)$/i.test(key)
    || /(?:api[_-]?key|token|secret|password|cookie|authorization|session|private[_-]?key|headers|env)/i.test(key);
}

function isHiddenReasoningKey(key: string): boolean {
  return /(?:chain[_-]?of[_-]?thought|hidden[_-]?(?:cot|reasoning|thought)|raw[_-]?(?:cot|thought|reasoning)|thinking|thoughts?)/i.test(key);
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
    if (isSensitiveKey(key) || isHiddenReasoningKey(key)) {
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

function sanitizePromptRecord(record: TracePromptRecord): TracePromptRecord {
  return {
    label: sanitizeText(record.label, 80),
    summary: sanitizeText(record.summary, 200),
    excerpt: record.excerpt ? sanitizeText(record.excerpt, MAX_TEXT_EXCERPT) : undefined,
    promptChars: record.promptChars,
    responseChars: record.responseChars,
  };
}

function sanitizeFullDebugTrace(trace: FullDebugTrace): FullDebugTrace {
  return {
    runId: sanitizeText(trace.runId, 120),
    startedAt: sanitizeText(trace.startedAt, 80),
    finishedAt: trace.finishedAt ? sanitizeText(trace.finishedAt, 80) : undefined,
    userPrompt: sanitizeText(trace.userPrompt, MAX_TEXT_EXCERPT),
    finalOutcome: trace.finalOutcome,
    stopReason: trace.stopReason ? sanitizeText(trace.stopReason, 200) : undefined,
    routes: (trace.routes ?? []).map(route => ({
      role: sanitizeText(route.role, 80),
      keySource: route.keySource ? sanitizeText(route.keySource, 120) : undefined,
      fallbackReason: route.fallbackReason ? sanitizeText(route.fallbackReason, 200) : undefined,
      reason: route.reason ? sanitizeText(route.reason, 200) : undefined,
      ...sanitizeLabels(route),
    })),
    architectSummary: trace.architectSummary ? sanitizeText(trace.architectSummary, MAX_TEXT_EXCERPT) : undefined,
    designSummary: trace.designSummary ? sanitizeText(trace.designSummary, MAX_TEXT_EXCERPT) : undefined,
    promptRecords: (trace.promptRecords ?? []).map(sanitizePromptRecord),
    events: (trace.events ?? []).map(event => ({
      id: sanitizeText(event.id, 120),
      order: event.order,
      type: event.type,
      kind: event.kind,
      status: event.status,
      summary: sanitizeText(event.summary, 240),
      errorSummary: event.errorSummary ? sanitizeText(event.errorSummary, 240) : undefined,
      attemptNumber: event.attemptNumber,
      timing: event.timing ? sanitizeUnknown(event.timing, 200) as typeof event.timing : undefined,
      labels: sanitizeLabels(event.labels),
      prompt: event.prompt ? sanitizePromptRecord(event.prompt) : undefined,
      outputExcerpt: event.outputExcerpt ? sanitizeText(event.outputExcerpt, MAX_TEXT_EXCERPT) : undefined,
      parserDecision: event.parserDecision ? sanitizeUnknown(event.parserDecision) as TraceParserDecision : undefined,
      reviewerDecision: event.reviewerDecision ? sanitizeUnknown(event.reviewerDecision) as TraceReviewerDecision : undefined,
      compileRuntimeLogs: event.compileRuntimeLogs?.map(log => sanitizeText(log, 300)),
      diffMetadata: event.diffMetadata ? sanitizeUnknown(event.diffMetadata) as TraceDiffMetadata : undefined,
      stopReason: event.stopReason ? sanitizeText(event.stopReason, 200) : undefined,
      metadata: event.metadata ? sanitizeRecord(event.metadata) : undefined,
    })),
  };
}

function traceMatchesLookup(trace: Pick<GenerationTrace, 'id' | 'projectId' | 'branchId' | 'fullDebugTrace'>, lookup: FullDebugTraceLookup): boolean {
  if (lookup.runId && trace.id !== lookup.runId && trace.fullDebugTrace?.runId !== lookup.runId) return false;
  if (lookup.projectId && trace.projectId !== lookup.projectId) return false;
  if (lookup.branchId && trace.branchId && trace.branchId !== lookup.branchId) return false;
  return true;
}

function envelopeMatchesLookup(envelope: StoredFullDebugTraceEnvelope, lookup: FullDebugTraceLookup): boolean {
  if (lookup.runId && envelope.runId !== lookup.runId && envelope.traceId !== lookup.runId) return false;
  if (lookup.projectId && envelope.projectId !== lookup.projectId) return false;
  if (lookup.branchId && envelope.branchId && envelope.branchId !== lookup.branchId) return false;
  return true;
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

function sanitizeRunStepTelemetry(step: GenerationRunStepTelemetry): GenerationRunStepTelemetry {
  return {
    id: step.id,
    label: sanitizeText(step.label, 120),
    status: step.status,
    detail: step.detail ? sanitizeText(step.detail, 200) : undefined,
    durationMs: step.durationMs,
    llm: step.llm
      ? {
          model: sanitizeText(step.llm.model, 120),
          prompt_tokens: step.llm.prompt_tokens,
          completion_tokens: step.llm.completion_tokens,
          total_tokens: step.llm.total_tokens,
          cost_usd: step.llm.cost_usd,
        }
      : undefined,
    output: step.output
      ? {
          file_count: step.output.file_count,
          total_bytes: step.output.total_bytes,
          asset_count: step.output.asset_count,
          build_size_kb: step.output.build_size_kb,
          preview_url: step.output.preview_url ? sanitizeText(step.output.preview_url, 200) : undefined,
          files: step.output.files?.slice(0, 100).map(file => sanitizeText(file, 200)),
        }
      : undefined,
    warnings: step.warnings?.slice(0, 20).map(warning => sanitizeText(warning, 200)),
  };
}

function sanitizeRunSummary(summary?: TraceRunSummary): TraceRunSummary | undefined {
  if (!summary) return undefined;
  return {
    brief: sanitizeText(summary.brief, 300),
    appName: summary.appName ? sanitizeText(summary.appName, 120) : undefined,
    skeleton: summary.skeleton
      ? {
          id: sanitizeText(summary.skeleton.id, 120),
          label: sanitizeText(summary.skeleton.label, 120),
          archetypeId: summary.skeleton.archetypeId ? sanitizeText(summary.skeleton.archetypeId, 120) : undefined,
          archetypeName: summary.skeleton.archetypeName ? sanitizeText(summary.skeleton.archetypeName, 120) : undefined,
          domainId: summary.skeleton.domainId ? sanitizeText(summary.skeleton.domainId, 120) : undefined,
          domainName: summary.skeleton.domainName ? sanitizeText(summary.skeleton.domainName, 120) : undefined,
        }
      : undefined,
    design: summary.design
      ? {
          themeName: summary.design.themeName ? sanitizeText(summary.design.themeName, 120) : undefined,
          intent: (summary.design.intent ?? []).slice(0, 20).map(item => sanitizeText(item, 160)),
          architectSummary: summary.design.architectSummary ? sanitizeText(summary.design.architectSummary, MAX_TEXT_EXCERPT) : undefined,
          designSummary: summary.design.designSummary ? sanitizeText(summary.design.designSummary, MAX_TEXT_EXCERPT) : undefined,
        }
      : undefined,
    output: summary.output
      ? {
          skeletonFiles: (summary.output.skeletonFiles ?? []).slice(0, 200).map(file => sanitizeText(file, 200)),
          deltaFiles: (summary.output.deltaFiles ?? []).slice(0, 200).map(file => sanitizeText(file, 200)),
          filesCreated: (summary.output.filesCreated ?? []).slice(0, 200).map(file => sanitizeText(file, 200)),
          filesUpdated: (summary.output.filesUpdated ?? []).slice(0, 200).map(file => sanitizeText(file, 200)),
          changedFileCount: summary.output.changedFileCount,
          createdFileCount: summary.output.createdFileCount,
          deltaSizeBytes: summary.output.deltaSizeBytes,
          keyPaths: (summary.output.keyPaths ?? []).slice(0, 40).map(file => sanitizeText(file, 200)),
          structure: summary.output.structure
            ? {
                richness: summary.output.structure.richness,
                summary: sanitizeText(summary.output.structure.summary, 200),
                routeExpectation: summary.output.structure.routeExpectation,
                requiredOutputClasses: (summary.output.structure.requiredOutputClasses ?? []).slice(0, 20).map(item => sanitizeText(item, 80)),
                requiredDeltaClasses: (summary.output.structure.requiredDeltaClasses ?? []).slice(0, 20).map(item => sanitizeText(item, 80)),
                missingOutputClasses: (summary.output.structure.missingOutputClasses ?? []).slice(0, 20).map(item => sanitizeText(item, 80)),
                missingDeltaClasses: (summary.output.structure.missingDeltaClasses ?? []).slice(0, 20).map(item => sanitizeText(item, 80)),
                buckets: (summary.output.structure.buckets ?? []).slice(0, 12).map(bucket => ({
                  id: sanitizeText(bucket.id, 80),
                  label: sanitizeText(bucket.label, 80),
                  meaning: sanitizeText(bucket.meaning, 160),
                  totalCount: bucket.totalCount,
                  deltaCount: bucket.deltaCount,
                  meaningfulDeltaCount: bucket.meaningfulDeltaCount,
                  skeletonCount: bucket.skeletonCount,
                  modifiedCount: bucket.modifiedCount,
                  newCount: bucket.newCount,
                  keyPaths: (bucket.keyPaths ?? []).slice(0, 8).map(file => sanitizeText(file, 200)),
                })),
              }
            : undefined,
          skeletonDelta: summary.output.skeletonDelta
            ? {
                skeletonFileCount: summary.output.skeletonDelta.skeletonFileCount,
                deltaFileCount: summary.output.skeletonDelta.deltaFileCount,
                meaningfulDeltaCount: summary.output.skeletonDelta.meaningfulDeltaCount,
                modifiedExistingCount: summary.output.skeletonDelta.modifiedExistingCount,
                newFileCount: summary.output.skeletonDelta.newFileCount,
                keySkeletonPaths: (summary.output.skeletonDelta.keySkeletonPaths ?? []).slice(0, 12).map(file => sanitizeText(file, 200)),
                keyDeltaPaths: (summary.output.skeletonDelta.keyDeltaPaths ?? []).slice(0, 12).map(file => sanitizeText(file, 200)),
                keyModifiedPaths: (summary.output.skeletonDelta.keyModifiedPaths ?? []).slice(0, 12).map(file => sanitizeText(file, 200)),
                keyNewPaths: (summary.output.skeletonDelta.keyNewPaths ?? []).slice(0, 12).map(file => sanitizeText(file, 200)),
              }
            : undefined,
          compileCount: summary.output.compileCount,
          previewMountStatus: summary.output.previewMountStatus,
          totalTimeToPreviewMs: summary.output.totalTimeToPreviewMs,
          saveReady: summary.output.saveReady,
        }
      : undefined,
    path: {
      kind: summary.path.kind,
      summary: sanitizeText(summary.path.summary, 240),
      usesRealLlm: summary.path.usesRealLlm,
      usesRealRuntime: summary.path.usesRealRuntime,
      fixtureBacked: summary.path.fixtureBacked,
      testEnvironment: summary.path.testEnvironment,
      markers: (summary.path.markers ?? []).slice(0, 20).map(item => sanitizeText(item, 120)),
    },
    quality: summary.quality
      ? {
          verdict: summary.quality.verdict,
          summary: sanitizeText(summary.quality.summary, 240),
          gates: (summary.quality.gates ?? []).slice(0, 40).map(gate => ({
            id: sanitizeText(gate.id, 80),
            label: sanitizeText(gate.label, 120),
            passed: gate.passed,
            source: gate.source,
            detail: gate.detail ? sanitizeText(gate.detail, 200) : undefined,
          })),
          blockers: (summary.quality.blockers ?? []).slice(0, 20).map(item => sanitizeText(item, 200)),
          warnings: (summary.quality.warnings ?? []).slice(0, 20).map(item => sanitizeText(item, 200)),
          visualVerdict: summary.quality.visualVerdict,
          visualBand: summary.quality.visualBand,
          visualReasons: summary.quality.visualReasons?.slice(0, 20).map(item => sanitizeText(item, 200)),
        }
      : undefined,
    steps: (summary.steps ?? []).slice(0, 20).map(sanitizeRunStepTelemetry),
    noTelemetryReason: summary.noTelemetryReason ? sanitizeText(summary.noTelemetryReason, 200) : undefined,
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
      intent: sanitizeText(trace.intent, MAX_TEXT_EXCERPT),
      model: sanitizeText(trace.model, 120),
      errorSummary: trace.errorSummary ? sanitizeText(trace.errorSummary, 240) : undefined,
      spans: (trace.spans ?? []).map(span => sanitizeUnknown(span) as TraceSpan),
      runSummary: sanitizeRunSummary(trace.runSummary),
      visibleReasoningTrace: {
        ...trace.visibleReasoningTrace,
        runId: sanitizeText(trace.visibleReasoningTrace.runId, 120),
        activeStepId: trace.visibleReasoningTrace.activeStepId ?? null,
        steps: (trace.visibleReasoningTrace.steps ?? []).map(step => ({
          ...step,
          id: sanitizeText(step.id, 120),
          summary: sanitizeVisibleSummary(step.summary),
          errorSummary: step.errorSummary ? sanitizeText(step.errorSummary, 240) : undefined,
          labels: sanitizeLabels(step.labels),
        })),
      },
      fullDebugTrace: sanitizeFullDebugTrace(trace.fullDebugTrace),
    };
  }

  return {
    ...trace,
    intent: sanitizeText(trace.intent, MAX_TEXT_EXCERPT),
    model: sanitizeText(trace.model, 120),
    errorSummary: trace.errorSummary ? sanitizeText(trace.errorSummary, 240) : undefined,
    spans: (trace.spans ?? []).map(span => sanitizeUnknown(span) as TraceSpan),
    runSummary: sanitizeRunSummary(trace.runSummary),
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

function loadDebugTraceEnvelopes(): StoredFullDebugTraceEnvelope[] {
  try {
    const raw = localStorage.getItem(DEBUG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredFullDebugTraceEnvelope[];
    return parsed.map(envelope => ({
      ...envelope,
      runId: sanitizeText(envelope.runId, 120),
      traceId: sanitizeText(envelope.traceId, 120),
      projectId: envelope.projectId ? sanitizeText(envelope.projectId, 120) : undefined,
      branchId: envelope.branchId ? sanitizeText(envelope.branchId, 120) : undefined,
      startedAt: sanitizeText(envelope.startedAt, 80),
      finishedAt: envelope.finishedAt ? sanitizeText(envelope.finishedAt, 80) : undefined,
      trace: sanitizeFullDebugTrace(envelope.trace),
    }));
  } catch {
    return [];
  }
}

function saveDebugTraceEnvelopes(envelopes: StoredFullDebugTraceEnvelope[]): void {
  try {
    localStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(envelopes.slice(-MAX_TRACES)));
  } catch {
    const trimmed = envelopes.slice(-Math.floor(MAX_TRACES / 4));
    try { localStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(trimmed)); } catch { /* ignore */ }
  }
}

function loadFirstLLMStepHistory(): FirstLLMStepDebugRecord[] {
  try {
    const raw = localStorage.getItem(FIRST_LLM_STEP_HISTORY_KEY);
    return raw ? JSON.parse(raw) as FirstLLMStepDebugRecord[] : [];
  } catch {
    return [];
  }
}

function loadLastFirstLLMStepRecord(): FirstLLMStepDebugRecord | null {
  try {
    const raw = localStorage.getItem(FIRST_LLM_STEP_LAST_KEY);
    return raw ? JSON.parse(raw) as FirstLLMStepDebugRecord : null;
  } catch {
    return null;
  }
}

function saveFirstLLMStepRecord(record: FirstLLMStepDebugRecord): void {
  try {
    localStorage.setItem(FIRST_LLM_STEP_LAST_KEY, JSON.stringify(record));
  } catch { /* ignore quota */ }

  try {
    const history = loadFirstLLMStepHistory().filter(item => item.id !== record.id);
    history.push(record);
    localStorage.setItem(
      FIRST_LLM_STEP_HISTORY_KEY,
      JSON.stringify(history.slice(-MAX_FIRST_LLM_STEP_RECORDS)),
    );
  } catch { /* ignore quota */ }

  try {
    window.dispatchEvent(new CustomEvent('studio-first-llm-step', { detail: record }));
  } catch { /* test environment */ }
}

function toDebugTraceEnvelope(trace: GenerationTrace): StoredFullDebugTraceEnvelope {
  const debugTrace = sanitizeFullDebugTrace(trace.fullDebugTrace);
  return {
    runId: debugTrace.runId,
    traceId: trace.id,
    projectId: trace.projectId ? sanitizeText(trace.projectId, 120) : undefined,
    branchId: trace.branchId ? sanitizeText(trace.branchId, 120) : undefined,
    startedAt: sanitizeText(trace.startedAt, 80),
    finishedAt: debugTrace.finishedAt,
    trace: debugTrace,
  };
}

function persistDebugTrace(trace: GenerationTrace): void {
  const envelope = toDebugTraceEnvelope(trace);
  const existing = loadDebugTraceEnvelopes().filter(item => item.runId !== envelope.runId && item.traceId !== envelope.traceId);
  existing.push(envelope);
  saveDebugTraceEnvelopes(existing);
}

function latestStoredTrace(lookup: FullDebugTraceLookup): GenerationTrace | null {
  return loadTraces()
    .slice()
    .reverse()
    .find(trace => traceMatchesLookup(trace, lookup)) ?? null;
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

  setRunSummary(summary: TraceRunSummary): void {
    this._trace.runSummary = sanitizeRunSummary(summary);
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

    const finishedTrace = normalizeStoredTrace(this._trace);
    const all = loadTraces();
    all.push(finishedTrace);
    saveTraces(all);
    persistDebugTrace(finishedTrace);
    generationTracer.clearActive(this.id);

    try {
      window.dispatchEvent(new CustomEvent('studio-trace', { detail: { ...finishedTrace } }));
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
    branchId?:  string;
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
      branchId:  params.branchId,
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

  /** Retrieve a sanitized full debug trace for the active or recently persisted run. */
  getFullDebugTrace(lookup: FullDebugTraceLookup = {}): FullDebugTrace | null {
    const activeSnapshot = this._active?.snapshot();
    if (activeSnapshot && traceMatchesLookup(activeSnapshot, lookup)) {
      return sanitizeFullDebugTrace(activeSnapshot.fullDebugTrace);
    }

    const debugEnvelope = loadDebugTraceEnvelopes()
      .slice()
      .reverse()
      .find(envelope => envelopeMatchesLookup(envelope, lookup));
    if (debugEnvelope) {
      return sanitizeFullDebugTrace(debugEnvelope.trace);
    }

    const storedTrace = latestStoredTrace(lookup);
    return storedTrace ? sanitizeFullDebugTrace(storedTrace.fullDebugTrace) : null;
  }

  /** Persist the local-only first LLM step debug record exactly as captured. */
  recordFirstLLMStep(record: FirstLLMStepDebugRecord): void {
    saveFirstLLMStepRecord(record);
  }

  /** Load the last local-only first LLM step debug record. */
  getLastFirstLLMStep(): FirstLLMStepDebugRecord | null {
    return loadLastFirstLLMStepRecord();
  }

  /** Load recent local-only first LLM step debug records. */
  getFirstLLMStepHistory(n = MAX_FIRST_LLM_STEP_RECORDS): FirstLLMStepDebugRecord[] {
    return loadFirstLLMStepHistory().slice(-n);
  }

  /** Build a structured, sanitized JSON export payload for forensic investigation. */
  getFullDebugTraceExport(lookup: FullDebugTraceLookup = {}): FullDebugTraceExportPayload | null {
    const activeSnapshot = this._active?.snapshot();
    const trace = activeSnapshot && traceMatchesLookup(activeSnapshot, lookup)
      ? activeSnapshot
      : latestStoredTrace(lookup);
    const debugEnvelope = trace ? null : loadDebugTraceEnvelopes()
      .slice()
      .reverse()
      .find(envelope => envelopeMatchesLookup(envelope, lookup));
    const fullDebugTrace = trace
      ? sanitizeFullDebugTrace(trace.fullDebugTrace)
      : debugEnvelope
        ? sanitizeFullDebugTrace(debugEnvelope.trace)
        : null;

    if (!fullDebugTrace) return null;

    return {
      schema: 'aic-rg-full-debug-trace-v1',
      exportedAt: new Date().toISOString(),
      traceId: trace?.id ?? debugEnvelope?.traceId ?? fullDebugTrace.runId,
      runId: fullDebugTrace.runId,
      projectId: trace?.projectId ?? debugEnvelope?.projectId,
      branchId: trace?.branchId ?? debugEnvelope?.branchId,
      mode: trace?.mode,
      model: trace?.model ? sanitizeText(trace.model, 120) : undefined,
      outcome: trace?.outcome,
      errorSummary: trace?.errorSummary ? sanitizeText(trace.errorSummary, 240) : undefined,
      safety: {
        redaction: 'secrets-sensitive-headers-hidden-chain-of-thought',
        rawHiddenChainOfThought: 'excluded',
      },
      fullDebugTrace,
    };
  }

  /** Format the structured debug export as pretty JSON for copy/download affordances. */
  formatFullDebugTraceExport(lookup: FullDebugTraceLookup = {}): string | null {
    const payload = this.getFullDebugTraceExport(lookup);
    return payload ? JSON.stringify(payload, null, 2) : null;
  }

  /** Clear all stored traces. */
  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(DEBUG_STORAGE_KEY);
    localStorage.removeItem(FIRST_LLM_STEP_LAST_KEY);
    localStorage.removeItem(FIRST_LLM_STEP_HISTORY_KEY);
    this._active = null;
  }

  updateRunSummary(
    lookup: FullDebugTraceLookup,
    patch: {
      brief?: TraceRunSummary['brief'];
      appName?: TraceRunSummary['appName'];
      steps?: TraceRunSummary['steps'];
      noTelemetryReason?: TraceRunSummary['noTelemetryReason'];
      design?: Partial<NonNullable<TraceRunSummary['design']>>;
      output?: Partial<NonNullable<TraceRunSummary['output']>>;
      path?: Partial<TraceRunSummary['path']>;
      quality?: Partial<NonNullable<TraceRunSummary['quality']>>;
    },
  ): void {
    const mergeSummary = (base: TraceRunSummary | undefined, fallbackBrief: string): TraceRunSummary => {
      const mergedDesign = base?.design || patch.design
        ? {
            intent: patch.design?.intent ?? base?.design?.intent ?? [],
            ...(base?.design ?? {}),
            ...(patch.design ?? {}),
          }
        : undefined;
      const mergedOutput = base?.output || patch.output
        ? {
            skeletonFiles: [],
            deltaFiles: [],
            filesCreated: [],
            filesUpdated: [],
            changedFileCount: 0,
            createdFileCount: 0,
            deltaSizeBytes: 0,
            keyPaths: [],
            structure: undefined,
            skeletonDelta: undefined,
            compileCount: 0,
            previewMountStatus: 'pending' as const,
            saveReady: false,
            ...(base?.output ?? {}),
            ...(patch.output ?? {}),
          }
        : undefined;
      const mergedPathBase = {
        kind: 'real' as const,
        summary: 'Real generation trace recorded.',
        usesRealLlm: false,
        usesRealRuntime: false,
        fixtureBacked: false,
        testEnvironment: false,
        markers: [] as string[],
        ...(base?.path ?? {}),
        ...(patch.path ?? {}),
      };
      const mergedPath = {
        ...mergedPathBase,
        markers: patch.path?.markers ?? base?.path?.markers ?? [],
      };
      const mergedQuality = base?.quality || patch.quality
        ? (() => {
            const mergedQualityBase = {
              verdict: 'partial' as const,
              summary: '',
              gates: [],
              blockers: [],
              warnings: [],
              ...(base?.quality ?? {}),
              ...(patch.quality ?? {}),
            };
            return {
              ...mergedQualityBase,
              gates: patch.quality?.gates ?? base?.quality?.gates ?? [],
              blockers: patch.quality?.blockers ?? base?.quality?.blockers ?? [],
              warnings: patch.quality?.warnings ?? base?.quality?.warnings ?? [],
            };
          })()
        : undefined;
      return sanitizeRunSummary({
        brief: patch.brief ?? base?.brief ?? fallbackBrief,
        appName: patch.appName ?? base?.appName,
        skeleton: base?.skeleton,
        design: mergedDesign,
        output: mergedOutput,
        path: mergedPath,
        quality: mergedQuality,
        steps: patch.steps ?? base?.steps ?? [],
        noTelemetryReason: patch.noTelemetryReason ?? base?.noTelemetryReason,
      })!;
    };

    const activeSnapshot = this._active?.snapshot();
    if (activeSnapshot && traceMatchesLookup(activeSnapshot, lookup) && this._active) {
      this._active.setRunSummary(mergeSummary(activeSnapshot.runSummary, activeSnapshot.intent));
    }

    const traces = loadTraces();
    let changed = false;
    const nextTraces = traces.map(trace => {
      if (!traceMatchesLookup(trace, lookup)) return trace;
      changed = true;
      return {
        ...trace,
        runSummary: mergeSummary(trace.runSummary, trace.intent),
      };
    });
    if (!changed) return;
    saveTraces(nextTraces);
    try {
      window.dispatchEvent(new CustomEvent('studio-trace'));
    } catch { /* test environment */ }
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
    if (trace.runSummary) {
      lines.push(
        `  Run:      ${trace.runSummary.path.kind} | ${trace.runSummary.path.summary}`
        + (trace.runSummary.output ? ` | files=${trace.runSummary.output.changedFileCount}` : ''),
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
