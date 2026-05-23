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
  Clock, BarChart2, ChevronDown, ChevronRight, Download, X,
} from 'lucide-react';
import { BenchmarkDashboard } from '../../components/BenchmarkDashboard';
import { ConfigService } from '../../services/ConfigService';
import { Orchestrator } from '../../services/Orchestrator';
import { generationTracer } from '../../services/GenerationTracer';
import {
  extractJsonObjectFromModelText,
  validateArchitectJsonShape,
} from '../../services/architectJson';
import {
  runLiveReadinessPreflight,
  type LiveReadinessPreflightCheck,
  type LiveReadinessPreflightResult,
} from './LiveReadinessPreflight';

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
  { id: 'architect-real',    label: 'Architect Real',    desc: 'Реальный LLM вызов — fileTree ≥5 файлов, реальные токены' },
] as const;

type StepId = typeof STEP_DEFS[number]['id'];
type TabId  = 'flow-chain' | 'benchmark';
type TestStatus = 'idle' | 'running' | 'pass' | 'fail' | 'cancelled';
type CompletedTestStatus = 'pass' | 'fail';
type EvidenceKind = 'fixture' | 'real-runtime' | 'real-llm';
type AggregateStatus = 'idle' | 'pass' | 'warning' | 'fail';
type ReportVerdict = 'PASS' | 'WARNING' | 'FAIL';

// ── Per-test detail types ──────────────────────────────────────────────────────

interface CanaryDetails       { httpStatus: number; response: { status: string; provider: string } }
interface IdeaDetails         { prompt: string; length: number; valid: boolean }
interface ArchDetails         { appName: string; skeleton: string; skeletonFiles?: Record<string, string>; fileTree: Record<string, string>; contextContract?: string; dataModel?: string }
interface CodeDeltaFile       { path: string; size: number; content: string }
interface CodeDeltaDetails    { buildId: string; files: CodeDeltaFile[] }
interface CompileAsset        { name: string; size: number }
interface CompileDetails      { buildId: string; assets: CompileAsset[] }
interface PreviewHttpDetails  { httpStatus: number; contentLength: number; contentLengthStr: string; hasRootDiv: boolean; buildId: string }
interface PreviewMtdDetails   { lineNumber: number; line: string }
interface SaveReadyDetails    { compileSuccess: boolean; buildId: string; assetsCount: number }
interface NoPremSaveDetails   { projectsBeforeSave: number; totalSessions: number; correct: boolean }
interface ArchRealDetails    { appName: string; skeleton: string; fileTree: Record<string, string>; contextContract?: string; dataModel?: string; model: string; fileCount: number }
interface TestLlmMetrics      { model: string; prompt_tokens: number; completion_tokens: number; total_tokens: number; cost_usd?: number }
interface TestOutputMetrics   { file_count?: number; total_bytes?: number; asset_count?: number; build_size_kb?: number; preview_url?: string; files?: string[] }

// ── General types ──────────────────────────────────────────────────────────────

interface TestState {
  status: TestStatus;
  duration_ms: number;
  updatedAt?: string;
  error?: string;
  summary?: string;
  llm?: TestLlmMetrics;
  output?: TestOutputMetrics;
  warnings?: string[];
  details?: Record<string, unknown>;
}

interface TestHistoryRun {
  timestamp: string;
  status: CompletedTestStatus;
  duration_ms: number;
  error?: string;
}

interface TestApiResult {
  status: CompletedTestStatus | 'cancelled';
  duration_ms: number;
  summary?: string;
  llm?: TestLlmMetrics;
  output?: TestOutputMetrics;
  warnings?: string[];
  error?: string;
  details?: Record<string, unknown>;
}

// ── localStorage helpers ───────────────────────────────────────────────────────

const LS_TEST_KEY     = (id: string) => `quality.test.${id}`;
const LS_LAST_RUN_KEY = 'quality.lastRunAll';
const LS_PREFLIGHT_KEY = 'quality.preflight.last';
const MAX_HIST        = 5;
const FIXTURE_BACKED_TESTS = new Set<StepId>(['idea-validate', 'architecture', 'code-delta']);
const PREFLIGHT_CHECK_DEFS = [
  { id: 'ui-primitive-catalog', label: 'UI primitive catalog' },
  { id: 'import-export-contract', label: 'Import/export contract' },
  { id: 'shared-hook-contracts', label: 'Shared hook contracts' },
  { id: 'protected-shell-boundary', label: 'Protected shell boundary' },
  { id: 'candidate-graph-foundation', label: 'Candidate graph foundation' },
  { id: 'prompt-catalog-truthfulness', label: 'Prompt catalog truthfulness' },
  { id: 'premium-component-hints', label: 'Premium component hints' },
  { id: 'launch-flow-wiring', label: 'Launch flow wiring' },
  { id: 'quality-controls-contract', label: 'Quality controls contract' },
] as const;
const FIXTURE_NOTE_TEXT = 'Not real LLM output';
const CANCELLED_BY_USER = 'Cancelled by user';
const QUALITY_STORAGE_PREFIXES = [
  'quality.test.',
  'quality.preflight.',
  'quality.lastRun',
  'quality.real-suite.',
  'quality.compare.',
  'quality.benchmark.',
] as const;
const QUALITY_REPORT_CACHE_PREFIXES = [
  'quality.real-suite.',
  'quality.compare.',
  'quality.benchmark.',
] as const;

interface AggregateSummary {
  status: AggregateStatus;
  reason: string;
  blockingFailures: string[];
  warnings: string[];
}

interface ClearSummary {
  action: string;
  cleared: string[];
  preserved: string[];
}

interface StepEvidence {
  kind: EvidenceKind;
  label: string;
  note?: string;
  fixtureBacked: boolean;
  realRuntime: boolean;
  realLlm: boolean;
}

interface ActiveRun {
  token: number;
  controller: AbortController;
  cancelled: boolean;
  mode: 'single' | 'all';
}

const CANCELLED_TEST_RESULT: TestApiResult = {
  status: 'cancelled',
  duration_ms: 0,
  error: CANCELLED_BY_USER,
  summary: CANCELLED_BY_USER,
};

function getStepEvidence(id: StepId): StepEvidence {
  if (FIXTURE_BACKED_TESTS.has(id)) {
    return {
      kind: 'fixture',
      label: 'Baseline fixture',
      note: FIXTURE_NOTE_TEXT,
      fixtureBacked: true,
      realRuntime: false,
      realLlm: false,
    };
  }
  if (id === 'architect-real') {
    return {
      kind: 'real-llm',
      label: 'Real LLM',
      fixtureBacked: false,
      realRuntime: false,
      realLlm: true,
    };
  }
  return {
    kind: 'real-runtime',
    label: 'Real runtime',
    fixtureBacked: false,
    realRuntime: true,
    realLlm: false,
  };
}

function isQualityPanelStorageKey(key: string): boolean {
  return QUALITY_STORAGE_PREFIXES.some(prefix => key.startsWith(prefix));
}

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
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && isQualityPanelStorageKey(key)) keys.push(key);
    }
    keys.forEach(key => localStorage.removeItem(key));
  } catch { /* ignore */ }
}

function listQualityStorageKeys(): string[] {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && isQualityPanelStorageKey(key)) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}

function removeQualityKeys(predicate: (key: string) => boolean): number {
  const keys = listQualityStorageKeys().filter(predicate);
  keys.forEach(key => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  });
  return keys.length;
}

function loadPersistedPreflight(): LiveReadinessPreflightResult | null {
  try {
    const raw = localStorage.getItem(LS_PREFLIGHT_KEY);
    return raw ? (JSON.parse(raw) as LiveReadinessPreflightResult) : null;
  } catch {
    return null;
  }
}

function persistPreflight(result: LiveReadinessPreflightResult): void {
  try {
    localStorage.setItem(LS_PREFLIGHT_KEY, JSON.stringify(result));
  } catch {
    /* quota */
  }
}

function hasPersistedQualityPanelState(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && isQualityPanelStorageKey(key)) return true;
    }
  } catch { /* ignore */ }
  return false;
}

// ── API helper ─────────────────────────────────────────────────────────────────

function isAbortError(err: unknown): boolean {
  return typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError'
    || err instanceof Error && err.name === 'AbortError';
}

function createLinkedTimeoutSignal(timeoutMs: number, parentSignal?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeoutId = setTimeout(abort, timeoutMs);

  if (parentSignal?.aborted) {
    abort();
  } else {
    parentSignal?.addEventListener('abort', abort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener('abort', abort);
    },
  };
}

async function callTestApi(testId: string, buildId?: string, signal?: AbortSignal): Promise<TestApiResult> {
  const url = buildId
    ? `/api/quality/test/${testId}?buildId=${encodeURIComponent(buildId)}`
    : `/api/quality/test/${testId}`;
  const resp = await fetch(url, { signal });
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    return { status: 'fail', duration_ms: 0, error: `HTTP ${resp.status}: ${text}` };
  }
  return (await resp.json()) as TestApiResult;
}

// ── Architect Real — direct LLM call (frontend-only, no backend proxy) ─────────

async function runArchitectRealTest(signal?: AbortSignal): Promise<TestApiResult> {
  const t0 = Date.now();
  const ms = () => Date.now() - t0;

  if (signal?.aborted) return { ...CANCELLED_TEST_RESULT, duration_ms: ms() };

  let modelId: string;
  let apiKey: string;
  let endpoint: string;
  let normalizedModelId: string;

  try {
    modelId = ConfigService.resolveModel('primary');
    if (!modelId) throw new Error('Model not configured for primary slot. Open Settings → Agents.');
    apiKey = ConfigService.getKeyForAgent('primary');
    if (!apiKey) throw new Error('API key missing for primary slot. Open Settings → Providers.');
    const agentCfg = ConfigService.getAgentConfig('agent_primary');
    const provider = agentCfg.provider || 'openrouter';
    endpoint = Orchestrator.getEndpoint(provider);
    normalizedModelId = Orchestrator.normalizeModelId(modelId, endpoint);
  } catch (err: unknown) {
    return { status: 'fail', duration_ms: ms(), error: err instanceof Error ? err.message : String(err) };
  }

  const SYSTEM_PROMPT = `You are an app architect. Return a JSON object — no markdown fences, no extra text.
Schema:
{
  "appName": "<name derived from user prompt>",
  "skeleton": "mobile-app",
  "fileTree": {
    "src/path/file.tsx": "one sentence: what this file does and which data it uses"
  },
  "contextContract": "description of shared AppContext/state contract",
  "dataModel": "key types e.g. Habit: { id: string, name: string, ... }"
}
Rules:
- fileTree must contain ONLY delta files (files the coder will create from scratch)
- Do NOT include skeleton files already provided: src/App.tsx, src/main.tsx, src/context/AppContext.tsx, src/hooks/useLocalStorage.ts, src/components/ui/*, src/components/BottomTabs.tsx, src/lib/cn.ts
- Minimum 5 delta files required
- Each fileTree value: exactly one sentence describing purpose + data used

ARCHITECT_OUTPUT_CONTRACT:
Return exactly one valid JSON object.
Do not wrap it in markdown.
Do not use code fences.
Do not add commentary before or after JSON.
Do not include explanations outside JSON.
The JSON must match the required architect schema.`;

  const USER_PROMPT = 'Трекер привычек: ежедневные отметки, стрик, статистика';

  let resp: Response;
  const timeoutSignal = createLinkedTimeoutSignal(60_000, signal);
  try {
    resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
      },
      body: JSON.stringify({
        model: normalizedModelId,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: USER_PROMPT },
        ],
        stream: false,
        temperature: 0.3,
        max_tokens: 1200,
      }),
      signal: timeoutSignal.signal,
    });
  } catch (err: unknown) {
    if (isAbortError(err) && signal?.aborted) {
      return { ...CANCELLED_TEST_RESULT, duration_ms: ms() };
    }
    if (isAbortError(err)) {
      return { status: 'fail', duration_ms: ms(), error: 'LLM request timed out after 60s' };
    }
    return { status: 'fail', duration_ms: ms(), error: err instanceof Error ? err.message : String(err) };
  } finally {
    timeoutSignal.cleanup();
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    return { status: 'fail', duration_ms: ms(), error: `LLM ${resp.status}: ${errText.slice(0, 300)}` };
  }

  let raw: unknown;
  try {
    raw = await resp.json();
  } catch (err: unknown) {
    return { status: 'fail', duration_ms: ms(), error: `Failed to parse LLM HTTP response as JSON: ${err instanceof Error ? err.message : String(err)}` };
  }

  const content: string = (raw as any)?.choices?.[0]?.message?.content ?? '';
  const usageRaw = (raw as any)?.usage;
  const llmModel: string = typeof (raw as any)?.model === 'string' ? (raw as any).model : normalizedModelId;

  const extracted = extractJsonObjectFromModelText(content, {
    validate: value => validateArchitectJsonShape(value, { minFileEntries: 5 }),
  });
  if (!extracted.ok) {
    const reason = extracted.schemaError
      ? `Architect JSON parsed but schema validation failed: ${extracted.schemaError}`
      : `LLM returned non-JSON: ${extracted.error}`;
    return {
      status: 'fail',
      duration_ms: ms(),
      error: `${reason}. Raw snippet: ${extracted.rawSnippet}`,
    };
  }
  const plan = extracted.value as Record<string, unknown>;

  const fileTree = (plan.fileTree ?? {}) as Record<string, string>;
  const fileCount = Object.keys(fileTree).length;
  if (fileCount < 5) {
    return { status: 'fail', duration_ms: ms(), error: `fileTree too small: ${fileCount} files (need ≥5). Got: ${Object.keys(fileTree).join(', ')}` };
  }

  const promptTokens: number = typeof usageRaw?.prompt_tokens === 'number' ? usageRaw.prompt_tokens : 0;
  const completionTokens: number = typeof usageRaw?.completion_tokens === 'number' ? usageRaw.completion_tokens : 0;
  const totalTokens: number = typeof usageRaw?.total_tokens === 'number'
    ? usageRaw.total_tokens
    : promptTokens + completionTokens;
  const costUsd: number | undefined =
    typeof usageRaw?.cost_usd === 'number' ? usageRaw.cost_usd :
    typeof usageRaw?.total_cost === 'number' ? usageRaw.total_cost :
    typeof usageRaw?.cost === 'number' ? usageRaw.cost :
    undefined;

  return {
    status: 'pass',
    duration_ms: ms(),
    summary: `${fileCount} файлов · реальный LLM output`,
    llm: { model: llmModel, prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens, cost_usd: costUsd },
    output: { file_count: fileCount, files: Object.keys(fileTree) },
    details: {
      appName:         String(plan.appName ?? ''),
      skeleton:        String(plan.skeleton ?? ''),
      fileTree,
      contextContract: typeof plan.contextContract === 'string' ? plan.contextContract : undefined,
      dataModel:       typeof plan.dataModel === 'string' ? plan.dataModel : undefined,
      model:           llmModel,
      fileCount,
    } as unknown as Record<string, unknown>,
  };
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

function downloadQualityReport(payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `quality-report-${stamp}.json`;
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

function fmtDuration(ms: number): string {
  if (ms <= 0) return '';
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  return sec >= 10 ? `${sec.toFixed(0)}s` : `${sec.toFixed(1)}s`;
}

function pluralRu(count: number, [one, few, many]: [string, string, string]): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function fmtCost(cost?: number): string | null {
  if (typeof cost !== 'number' || !Number.isFinite(cost)) return null;
  if (cost < 0.01) return `~$${cost.toFixed(3)}`;
  if (cost < 1) return `~$${cost.toFixed(2)}`;
  return `~$${cost.toFixed(1)}`;
}

function fmtDateTime(value?: string | null): string {
  if (!value) return 'Not run yet';
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function statusLabel(status: AggregateStatus | TestStatus | LiveReadinessPreflightCheck['status']): string {
  return String(status).toUpperCase();
}

function statusBadgeStyle(status: AggregateStatus | 'running'): React.CSSProperties {
  const map = {
    pass: { bg: 'rgba(74,222,128,0.12)', color: '#4ade80', border: 'rgba(74,222,128,0.30)' },
    fail: { bg: 'rgba(248,113,113,0.12)', color: '#f87171', border: 'rgba(248,113,113,0.30)' },
    warning: { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: 'rgba(251,191,36,0.30)' },
    idle: { bg: 'rgba(148,163,184,0.10)', color: 'rgba(226,232,240,0.76)', border: 'rgba(148,163,184,0.28)' },
    running: { bg: 'rgba(96,165,250,0.12)', color: '#93c5fd', border: 'rgba(96,165,250,0.30)' },
  }[status];
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 999,
    border: `1px solid ${map.border}`,
    background: map.bg,
    color: map.color,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  };
}

function summarizePrimaryBlockers(diagnostics?: LiveReadinessPreflightCheck['diagnostics']): string[] {
  const ranked = new Map<string, number>();
  for (const diagnostic of diagnostics ?? []) {
    const label = diagnostic.import_path
      ?? diagnostic.file
      ?? diagnostic.actual
      ?? diagnostic.root_cause_type;
    if (!label) continue;
    ranked.set(label, (ranked.get(label) ?? 0) + 1);
  }
  return Array.from(ranked.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([label]) => label);
}

function buildStepDetailsPayload(def: typeof STEP_DEFS[number], state: TestState): string {
  return JSON.stringify({
    id: def.id,
    label: def.label,
    status: state.status,
    updatedAt: state.updatedAt,
    duration_ms: state.duration_ms,
    summary: state.summary,
    error: state.error,
    llm: state.llm,
    output: state.output,
    warnings: state.warnings,
    details: state.details,
  }, null, 2);
}

function mapTraceOutcomeToAggregate(outcome?: string | null): AggregateStatus {
  if (outcome === 'ship_ok') return 'pass';
  if (outcome === 'ship_partial') return 'warning';
  if (outcome === 'ship_fail') return 'fail';
  if (outcome === 'cancelled') return 'warning';
  return 'idle';
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function buildTestMetaLines(id: StepId, state: TestState): Array<{ key: string; text: string; color?: string }> {
  const lines: Array<{ key: string; text: string; color?: string }> = [];
  const evidence = getStepEvidence(id);
  if (state.summary) {
    lines.push({
      key: 'summary',
      text: state.summary,
      color: 'rgba(255,255,255,0.72)',
    });
  }
  if (evidence.fixtureBacked && state.status !== 'idle') {
    lines.push({
      key: 'fixture-note',
      text: evidence.note ?? FIXTURE_NOTE_TEXT,
      color: '#fbbf24',
    });
  }
  if (state.llm) {
    const cost = fmtCost(state.llm.cost_usd);
    lines.push({
      key: 'llm',
      text:
        `🤖 ${state.llm.model} · ${state.llm.prompt_tokens} prompt / ` +
        `${state.llm.completion_tokens} completion tokens` +
        (cost ? ` · ${cost}` : ''),
      color: '#c4b5fd',
    });
  }
  if (state.output) {
    const parts: string[] = [];
    if (typeof state.output.file_count === 'number' && typeof state.output.total_bytes === 'number') {
      parts.push(`📁 ${state.output.file_count} ${pluralRu(state.output.file_count, ['файл', 'файла', 'файлов'])}`);
      parts.push(`${fmtSize(state.output.total_bytes)} кода`);
    } else if (typeof state.output.asset_count === 'number') {
      parts.push(`📦 ${state.output.asset_count} assets`);
    }
    if (typeof state.output.build_size_kb === 'number') {
      parts.push(`bundle: ${state.output.build_size_kb.toFixed(1)}KB`);
    }
    if (state.output.preview_url && parts.length === 0) {
      parts.push(`🔗 ${state.output.preview_url}`);
    }
    if (parts.length > 0) {
      lines.push({
        key: 'output',
        text: parts.join(' · '),
        color: '#93c5fd',
      });
    }
  }
  if (state.warnings?.length) {
    lines.push({
      key: 'warnings',
      text: `⚠ ${state.warnings.join(' · ')}`,
      color: '#fbbf24',
    });
  }
  if (state.updatedAt) {
    lines.push({
      key: 'updated',
      text: `Updated: ${fmtDateTime(state.updatedAt)}`,
      color: 'rgba(255,255,255,0.4)',
    });
  }
  return lines;
}

function evidenceBadgeStyle(kind: EvidenceKind): React.CSSProperties {
  const map: Record<EvidenceKind, { bg: string; color: string; border: string }> = {
    fixture:      { bg: 'rgba(251,191,36,0.10)', color: '#fbbf24', border: 'rgba(251,191,36,0.35)' },
    'real-runtime': { bg: 'rgba(96,165,250,0.10)', color: '#93c5fd', border: 'rgba(96,165,250,0.32)' },
    'real-llm':   { bg: 'rgba(167,139,250,0.12)', color: '#c4b5fd', border: 'rgba(167,139,250,0.36)' },
  };
  const c = map[kind];
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 7px',
    borderRadius: 5,
    border: `1px solid ${c.border}`,
    background: c.bg,
    color: c.color,
    fontSize: 10,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  };
}

function preflightStatusStyle(status: 'pass' | 'fail' | 'warning'): React.CSSProperties {
  const map = {
    pass: { bg: 'rgba(74,222,128,0.12)', color: '#4ade80', border: 'rgba(74,222,128,0.30)' },
    fail: { bg: 'rgba(248,113,113,0.12)', color: '#f87171', border: 'rgba(248,113,113,0.30)' },
    warning: { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: 'rgba(251,191,36,0.30)' },
  }[status];
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    borderRadius: 999,
    border: `1px solid ${map.border}`,
    background: map.bg,
    color: map.color,
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  };
}

function preflightCheckAccent(status: 'pass' | 'fail' | 'warning' | 'idle' | 'running'): string {
  if (status === 'pass') return '#4ade80';
  if (status === 'warning') return '#fbbf24';
  if (status === 'running') return '#93c5fd';
  if (status === 'idle') return 'rgba(226,232,240,0.58)';
  return '#f87171';
}

function CopyButton({
  value,
  label = 'Copy',
  disabled = false,
  ariaLabel,
}: {
  value: string;
  label?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (disabled) return;
    await copyTextToClipboard(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }, [disabled, value]);

  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label}
      onClick={() => void handleCopy()}
      disabled={disabled}
      style={{
        padding: '5px 10px',
        borderRadius: 7,
        border: '1px solid rgba(255,255,255,0.12)',
        background: disabled ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)',
        color: disabled ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.82)',
        fontSize: 11,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

function SelectionBlock({
  title,
  value,
  copyLabel,
  maxHeight = 220,
}: {
  title: string;
  value: string;
  copyLabel: string;
  maxHeight?: number;
}) {
  return (
    <div
      style={{
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10,
        background: 'rgba(2,6,23,0.55)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '10px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.03)',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' }}>
          {title}
        </span>
        <CopyButton value={value} label={copyLabel} ariaLabel={`${copyLabel} ${title}`} />
      </div>
      <pre
        style={{
          margin: 0,
          padding: '12px',
          maxHeight,
          overflow: 'auto',
          fontSize: 12,
          lineHeight: 1.5,
          color: 'rgba(255,255,255,0.88)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          userSelect: 'text',
          fontFamily: 'Consolas, "SFMono-Regular", monospace',
        }}
      >
        {value}
      </pre>
    </div>
  );
}

function PreflightCheckCard({
  check,
  displayStatus,
  expanded,
  running,
  onToggle,
  onRun,
}: {
  check: LiveReadinessPreflightCheck;
  displayStatus: AggregateStatus | 'running';
  expanded: boolean;
  running: boolean;
  onToggle: () => void;
  onRun: () => void;
}) {
  const firstDiagnostic = check.diagnostics?.[0];
  const primaryBlockers = summarizePrimaryBlockers(check.diagnostics);
  const detailsPayload = JSON.stringify(check, null, 2);
  const diagnosticsPayload = JSON.stringify(check.diagnostics ?? [], null, 2);

  return (
    <div
      style={{
        border: `1px solid ${displayStatus === 'fail' ? 'rgba(248,113,113,0.18)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 16,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(15,23,42,0.65))',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: preflightCheckAccent(displayStatus), flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.94)' }}>{check.label}</span>
              <span style={statusBadgeStyle(displayStatus)}>{statusLabel(displayStatus)}</span>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.55 }}>{check.summary}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onRun}
              disabled={running}
              aria-label={`Run preflight check ${check.label}`}
              title="Run this check"
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid rgba(110,231,183,0.28)',
                background: running ? 'rgba(110,231,183,0.04)' : 'rgba(16,185,129,0.10)',
                color: running ? 'rgba(110,231,183,0.42)' : '#6ee7b7',
                fontSize: 12,
                fontWeight: 700,
                cursor: running ? 'not-allowed' : 'pointer',
              }}
            >
              {running ? 'Running…' : 'Run this check'}
            </button>
            <button
              type="button"
              onClick={onToggle}
              aria-label={expanded ? `Hide details for ${check.label}` : `Show details for ${check.label}`}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.82)',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {expanded ? 'Hide details' : 'Details'}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <KV label="root_cause_type" value={check.rootCauseType ?? '—'} />
          <KV label="file" value={firstDiagnostic?.file ?? '—'} />
          <KV label="import_path" value={firstDiagnostic?.import_path ?? '—'} />
          <KV label="updated" value={fmtDateTime(check.checkedAt)} />
          <KV label="duration" value={fmtDuration(check.durationMs ?? 0) || '0ms'} />
          <KV label="suggested_fix" value={check.suggestedFix ?? '—'} />
        </div>

        {primaryBlockers.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' }}>
              Primary blockers
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {primaryBlockers.map((item, index) => (
                <div key={item} style={{ fontSize: 12, color: 'rgba(255,255,255,0.82)' }}>
                  {index + 1}. {item}
                </div>
              ))}
            </div>
          </div>
        )}

        {expanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SelectionBlock title="Diagnostics" value={diagnosticsPayload} copyLabel="Copy diagnostics" maxHeight={220} />
            <SelectionBlock title="Full check result" value={detailsPayload} copyLabel="Copy full result" maxHeight={260} />
            {check.rootCauseType && (
              <SelectionBlock title="Root cause" value={check.rootCauseType} copyLabel="Copy root cause" maxHeight={100} />
            )}
            {check.suggestedFix && (
              <SelectionBlock title="Suggested fix" value={check.suggestedFix} copyLabel="Copy suggested fix" maxHeight={120} />
            )}
          </div>
        )}
      </div>
    </div>
  );
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
  fontFamily: 'inherit', overflow: 'hidden', minHeight: 0,
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
  minHeight: 0,
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

function DetailPanel({ def, state }: { def: typeof STEP_DEFS[number]; state: TestState }) {
  const [downloading, setDownloading] = useState(false);
  const rawPayload = buildStepDetailsPayload(def, state);
  const detailsPayload = JSON.stringify(state.details ?? {}, null, 2);
  const codeDeltaDetails = def.id === 'code-delta' ? state.details as CodeDeltaDetails | undefined : undefined;
  const hasDetails = Boolean(state.details && Object.keys(state.details).length > 0);

  const handleDownload = useCallback(async () => {
    if (!codeDeltaDetails?.files?.length) return;
    setDownloading(true);
    try {
      await downloadFixtureZip(codeDeltaDetails.files);
    } finally {
      setDownloading(false);
    }
  }, [codeDeltaDetails]);

  return (
    <div
      style={{
        margin: '0 14px 14px',
        padding: '14px',
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(2,6,23,0.72)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' }}>
            Detailed result
          </span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>
            Updated: {fmtDateTime(state.updatedAt)}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {codeDeltaDetails?.files?.length ? (
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={downloading}
              style={{
                padding: '5px 10px',
                borderRadius: 7,
                border: '1px solid rgba(96,165,250,0.28)',
                background: downloading ? 'rgba(96,165,250,0.04)' : 'rgba(96,165,250,0.08)',
                color: downloading ? 'rgba(96,165,250,0.42)' : '#93c5fd',
                fontSize: 11,
                fontWeight: 700,
                cursor: downloading ? 'not-allowed' : 'pointer',
              }}
            >
              {downloading ? 'Downloading…' : 'Download fixture zip'}
            </button>
          ) : null}
          <CopyButton value={rawPayload} label="Copy full result" ariaLabel={`Copy full result ${def.label}`} />
          {state.error ? <CopyButton value={state.error} label="Copy error" ariaLabel={`Copy error ${def.label}`} /> : null}
          {state.summary ? <CopyButton value={state.summary} label="Copy summary" ariaLabel={`Copy summary ${def.label}`} /> : null}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <KV label="status" value={state.status} />
        <KV label="duration" value={fmtDuration(state.duration_ms) || '0ms'} />
        <KV label="truth" value={getStepEvidence(def.id as StepId).label} />
        <KV label="summary" value={state.summary ?? '—'} />
        <KV label="error" value={state.error ?? '—'} />
        <KV label="warnings" value={state.warnings?.join(' · ') ?? '—'} />
      </div>

      {state.llm && (
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <KV label="model" value={state.llm.model} />
          <KV label="prompt_tokens" value={String(state.llm.prompt_tokens)} />
          <KV label="completion_tokens" value={String(state.llm.completion_tokens)} />
          <KV label="total_tokens" value={String(state.llm.total_tokens)} />
        </div>
      )}

      {hasDetails ? (
        <SelectionBlock title="Details" value={detailsPayload} copyLabel="Copy details" maxHeight={220} />
      ) : null}
      <SelectionBlock title="Full payload" value={rawPayload} copyLabel="Copy payload" maxHeight={260} />
      {FIXTURE_BACKED_TESTS.has(def.id as StepId) ? (
        <div style={{ fontSize: 11, color: '#fbbf24' }}>{FIXTURE_NOTE_TEXT}</div>
      ) : null}
    </div>
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
  const canExpand = state.status !== 'idle' && Boolean(
    state.details || state.error || state.summary || state.llm || state.output || state.warnings?.length
  );
  const evidence = getStepEvidence(def.id as StepId);

  const icon =
    state.status === 'pass'    ? <CheckCircle2 size={14} color="#4ade80" /> :
    state.status === 'fail'    ? <XCircle size={14} color="#f87171" /> :
    state.status === 'cancelled' ? <XCircle size={14} color="#fbbf24" /> :
    state.status === 'running' ? <Loader2 size={14} color="#60a5fa" style={{ animation: 'spin 1s linear infinite' }} /> :
    <Circle size={14} color="rgba(255,255,255,0.18)" />;

  const labelColor =
    state.status === 'pass'    ? '#4ade80' :
    state.status === 'fail'    ? '#f87171' :
    state.status === 'cancelled' ? '#fbbf24' :
    state.status === 'running' ? '#60a5fa' :
    'rgba(255,255,255,0.6)';

  const rowBg =
    state.status === 'pass'    ? 'rgba(74,222,128,0.03)'  :
    state.status === 'fail'    ? 'rgba(248,113,113,0.03)' :
    state.status === 'cancelled' ? 'rgba(251,191,36,0.04)' :
    state.status === 'running' ? 'rgba(59,130,246,0.04)'  :
    'transparent';

  const leftBorder =
    state.status === 'pass'    ? '2px solid rgba(74,222,128,0.2)'  :
    state.status === 'fail'    ? '2px solid rgba(248,113,113,0.2)' :
    state.status === 'cancelled' ? '2px solid rgba(251,191,36,0.22)' :
    state.status === 'running' ? '2px solid rgba(96,165,250,0.25)' :
    '2px solid transparent';

  const durText =
    state.status === 'idle'    ? '' :
    state.status === 'running' ? '…' :
    fmtDuration(state.duration_ms);
  const metaLines = state.status === 'running' ? [] : buildTestMetaLines(def.id as StepId, state);

  return (
    <div style={{ padding: '0 14px 14px' }}>
      <div
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '14px 16px',
          background: `linear-gradient(180deg, ${rowBg}, rgba(15,23,42,0.68))`,
          borderLeft: leftBorder,
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: canExpand && expanded ? '16px 16px 0 0' : 16,
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

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 13, fontWeight: 700, fontFamily: 'monospace',
              color: labelColor, minWidth: 0, overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {def.label}
            </span>
            <span style={evidenceBadgeStyle(evidence.kind)} title={evidence.note}>
              {evidence.label}
            </span>
            <span style={statusBadgeStyle(state.status === 'running' ? 'running' : state.status === 'pass' ? 'pass' : state.status === 'fail' ? 'fail' : state.status === 'cancelled' ? 'warning' : 'idle')}>
              {statusLabel(state.status === 'cancelled' ? 'warning' : state.status === 'running' ? 'running' : state.status === 'idle' ? 'idle' : state.status)}
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{durText || 'Not run'}</span>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{def.desc}</div>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRun(); }}
          disabled={anyRunning}
          aria-label={`Run ${def.label}`}
          style={{
            padding: '6px 12px', borderRadius: 8, flexShrink: 0,
            border: '1px solid rgba(255,255,255,0.1)',
            background: anyRunning ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)',
            color: anyRunning ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.65)',
            fontSize: 12, fontWeight: 700,
            cursor: anyRunning ? 'not-allowed' : 'pointer',
          }}
        >
          Run
        </button>
      </div>

      {metaLines.length > 0 && (
        <div style={{
          padding: '10px 16px 12px 42px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          background: rowBg,
          borderLeft: leftBorder,
          borderRight: '1px solid rgba(255,255,255,0.06)',
          borderLeftColor: leftBorder.replace('2px solid ', ''),
          borderBottom: expanded ? 'none' : '1px solid rgba(255,255,255,0.06)',
          borderBottomLeftRadius: expanded ? 0 : 16,
          borderBottomRightRadius: expanded ? 0 : 16,
        }}>
          {metaLines.map(line => (
            <div
              key={line.key}
              style={{
                fontSize: 11,
                fontFamily: 'monospace',
                color: line.color ?? 'rgba(255,255,255,0.45)',
                whiteSpace: 'normal',
                overflowWrap: 'anywhere',
              }}
              title={line.text}
            >
              {line.text}
            </div>
          ))}
        </div>
      )}

      {/* Error — always visible on fail */}
      {state.status === 'fail' && state.error && (
        <div style={{
          padding: '4px 16px 12px 42px',
          fontSize: 11, color: '#f87171',
          background: 'rgba(248,113,113,0.03)',
          borderLeft: '2px solid rgba(248,113,113,0.15)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          borderBottom: expanded ? 'none' : '1px solid rgba(255,255,255,0.06)',
          borderBottomLeftRadius: expanded ? 0 : 16,
          borderBottomRightRadius: expanded ? 0 : 16,
          wordBreak: 'break-all',
        }}>
          {state.error}
        </div>
      )}

      {state.status === 'cancelled' && (state.error || state.summary) && (
        <div style={{
          padding: '4px 16px 12px 42px',
          fontSize: 11, color: '#fbbf24',
          background: 'rgba(251,191,36,0.04)',
          borderLeft: '2px solid rgba(251,191,36,0.18)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          borderBottom: expanded ? 'none' : '1px solid rgba(255,255,255,0.06)',
          borderBottomLeftRadius: expanded ? 0 : 16,
          borderBottomRightRadius: expanded ? 0 : 16,
          wordBreak: 'break-all',
        }}>
          {state.error ?? state.summary}
        </div>
      )}

      {expanded && canExpand && (
        <DetailPanel def={def} state={state} />
      )}
    </div>
  );
}

// ── FlowChainTab ───────────────────────────────────────────────────────────────

function FlowChainTab() {
  const [testStates, setTestStates] = useState<Record<StepId, TestState>>(makeInitStates);
  const [expanded, setExpanded] = useState<Record<StepId, boolean>>(makeInitExpanded);
  const [runAllActive, setRunAllActive] = useState(false);
  const [preflight, setPreflight] = useState<LiveReadinessPreflightResult | null>(() => loadPersistedPreflight());
  const [preflightExpanded, setPreflightExpanded] = useState<Record<string, boolean>>({});
  const [preflightRunning, setPreflightRunning] = useState(false);
  const [preflightRunningCheckId, setPreflightRunningCheckId] = useState<string | null>(null);
  const [clearMenuOpen, setClearMenuOpen] = useState(false);
  const [clearSummary, setClearSummary] = useState<ClearSummary | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(() => {
    try { return localStorage.getItem(LS_LAST_RUN_KEY); } catch { return null; }
  });
  const [brokenAt, setBrokenAt] = useState<string | null>(null);
  const qualityBuildIdRef = React.useRef<string | null>(null);
  const activeRunRef = React.useRef<ActiveRun | null>(null);
  const runTokenRef = React.useRef(0);
  const preflightTokenRef = React.useRef(0);
  const runningStepRef = React.useRef<StepId | null>(null);

  useEffect(() => {
    const restored = makeInitStates();
    STEP_DEFS.forEach(def => {
      const hist = loadTestHistory(def.id);
      if (hist.length > 0) {
        const last = hist[0];
        restored[def.id as StepId] = {
          status: last.status,
          duration_ms: last.duration_ms,
          updatedAt: last.timestamp,
          error: last.error,
        };
      }
    });
    setTestStates(restored);
  }, []);

  useEffect(() => () => {
    activeRunRef.current?.controller.abort();
    activeRunRef.current = null;
    preflightTokenRef.current += 1;
  }, []);

  const qualityControls = {
    hasRunPreflightButton: true,
    isolatedFromRunAll: true,
    clearsPreflightState: true,
    reportIncludesPreflight: true,
  } as const;

  const setOneState = useCallback((id: StepId, patch: Partial<TestState>) => {
    setTestStates(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const handleToggle = useCallback((id: StepId) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const togglePreflightDetails = useCallback((id: string) => {
    setPreflightExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const isRunCurrent = useCallback((run: ActiveRun): boolean => (
    activeRunRef.current?.token === run.token
      && !run.cancelled
      && !run.controller.signal.aborted
  ), []);

  const beginRun = useCallback((mode: ActiveRun['mode']): ActiveRun => {
    activeRunRef.current?.controller.abort();
    const run: ActiveRun = {
      token: runTokenRef.current + 1,
      controller: new AbortController(),
      cancelled: false,
      mode,
    };
    runTokenRef.current = run.token;
    activeRunRef.current = run;
    return run;
  }, []);

  const finishRun = useCallback((run: ActiveRun): boolean => {
    if (activeRunRef.current?.token === run.token) {
      activeRunRef.current = null;
      runningStepRef.current = null;
      return true;
    }
    return false;
  }, []);

  const stopActiveRun = useCallback((markCurrentStep: boolean) => {
    const run = activeRunRef.current;
    if (!run) return;

    run.cancelled = true;
    run.controller.abort();
    activeRunRef.current = null;
    setRunAllActive(false);

    const currentStep = runningStepRef.current;
    runningStepRef.current = null;
    if (markCurrentStep && currentStep) {
      setOneState(currentStep, {
        status: 'cancelled',
        duration_ms: 0,
        updatedAt: new Date().toISOString(),
        error: CANCELLED_BY_USER,
        summary: CANCELLED_BY_USER,
        llm: undefined,
        output: undefined,
        warnings: undefined,
        details: undefined,
      });
      setExpanded(prev => ({ ...prev, [currentStep]: false }));
    }
  }, [setOneState]);

  const runSingleTest = useCallback(async (id: StepId, run: ActiveRun): Promise<TestApiResult> => {
    if (!isRunCurrent(run)) return { ...CANCELLED_TEST_RESULT };
    setClearSummary(null);
    runningStepRef.current = id;
    setOneState(id, {
      status: 'running',
      duration_ms: 0,
      error: undefined,
      summary: undefined,
      llm: undefined,
      output: undefined,
      warnings: undefined,
      details: undefined,
    });
    setExpanded(prev => ({ ...prev, [id]: false }));
    try {
      let result: TestApiResult;

      if (id === 'architect-real') {
        result = await runArchitectRealTest(run.controller.signal);
      } else {
        const chainBuildId = (id === 'compile' || id === 'preview-http' || id === 'save-ready')
          ? (qualityBuildIdRef.current ?? undefined)
          : undefined;
        result = await callTestApi(id, chainBuildId, run.controller.signal);
      }

      if (!isRunCurrent(run) || result.status === 'cancelled') {
        return { ...CANCELLED_TEST_RESULT, duration_ms: result.duration_ms };
      }

      if (id === 'code-delta' && result.status === 'pass') {
        const bid = (result.details as Record<string, unknown> | undefined)?.buildId;
        if (typeof bid === 'string') qualityBuildIdRef.current = bid;
      }

      const updatedAt = new Date().toISOString();
      setOneState(id, {
        status: result.status,
        duration_ms: result.duration_ms,
        updatedAt,
        error: result.error,
        summary: result.summary,
        llm: result.llm,
        output: result.output,
        warnings: result.warnings,
        details: result.details,
      });
      if ((result.status === 'pass' || result.status === 'fail') && (result.details || result.error || result.summary)) {
        setExpanded(prev => ({ ...prev, [id]: true }));
      }
      persistTestRun(id, {
        timestamp: updatedAt,
        status: result.status,
        duration_ms: result.duration_ms,
        error: result.error,
      });
      return result;
    } catch (err: unknown) {
      if (isAbortError(err) || !isRunCurrent(run)) {
        return { ...CANCELLED_TEST_RESULT };
      }
      const updatedAt = new Date().toISOString();
      const error = err instanceof Error ? err.message : String(err);
      setOneState(id, { status: 'fail', duration_ms: 0, updatedAt, error, summary: undefined, llm: undefined, output: undefined, warnings: undefined });
      persistTestRun(id, { timestamp: updatedAt, status: 'fail', duration_ms: 0, error });
      return { status: 'fail', duration_ms: 0, error };
    } finally {
      if (runningStepRef.current === id) runningStepRef.current = null;
    }
  }, [isRunCurrent, setOneState]);

  const handleRunOne = useCallback((id: StepId) => {
    if (activeRunRef.current || preflightRunning || preflightRunningCheckId) return;
    const run = beginRun('single');
    void runSingleTest(id, run).finally(() => {
      if (finishRun(run)) setRunAllActive(false);
    });
  }, [beginRun, finishRun, preflightRunning, preflightRunningCheckId, runSingleTest]);

  const handleRunAll = useCallback(async () => {
    if (activeRunRef.current || preflightRunning || preflightRunningCheckId) return;
    const run = beginRun('all');
    setClearSummary(null);
    setRunAllActive(true);
    setBrokenAt(null);
    setExpanded(makeInitExpanded());
    qualityBuildIdRef.current = null;
    const now = new Date().toISOString();
    setLastRunAt(now);
    try { localStorage.setItem(LS_LAST_RUN_KEY, now); } catch { /* quota */ }
    setTestStates(makeInitStates());

    try {
      for (const def of STEP_DEFS) {
        if (!isRunCurrent(run)) break;
        const result = await runSingleTest(def.id as StepId, run);
        if (!isRunCurrent(run) || result.status === 'cancelled') break;
        if (result.status === 'fail') {
          setBrokenAt(def.id);
          break;
        }
      }
    } finally {
      if (finishRun(run)) setRunAllActive(false);
    }
  }, [beginRun, finishRun, isRunCurrent, preflightRunning, preflightRunningCheckId, runSingleTest]);

  const mergePreflightCheck = useCallback((nextCheck: LiveReadinessPreflightCheck) => {
    setPreflight(prev => {
      const byId = new Map((prev?.checks ?? []).map(check => [check.id, check]));
      byId.set(nextCheck.id, nextCheck);
      const checks = PREFLIGHT_CHECK_DEFS
        .map(def => byId.get(def.id))
        .filter((check): check is LiveReadinessPreflightCheck => Boolean(check));
      const passCount = checks.filter(check => check.status === 'pass').length;
      const failCount = checks.filter(check => check.status === 'fail').length;
      const warningCount = checks.filter(check => check.status === 'warning').length;
      const nextResult: LiveReadinessPreflightResult = {
        status: failCount > 0 ? 'fail' : warningCount > 0 ? 'warning' : 'pass',
        checkedAt: nextCheck.checkedAt ?? new Date().toISOString(),
        passCount,
        failCount,
        warningCount,
        checks,
      };
      persistPreflight(nextResult);
      return nextResult;
    });
  }, []);

  const handleRunPreflight = useCallback(async () => {
    if (activeRunRef.current || preflightRunning || preflightRunningCheckId) return;
    const token = preflightTokenRef.current + 1;
    preflightTokenRef.current = token;
    setClearSummary(null);
    setPreflightRunning(true);
    try {
      const result = await runLiveReadinessPreflight({ qualityControls });
      if (preflightTokenRef.current !== token) return;
      setPreflight(result);
      persistPreflight(result);
    } finally {
      if (preflightTokenRef.current === token) setPreflightRunning(false);
    }
  }, [preflightRunning, preflightRunningCheckId]);

  const handleRunPreflightCheck = useCallback(async (id: string) => {
    if (activeRunRef.current || preflightRunning || preflightRunningCheckId) return;
    const token = preflightTokenRef.current + 1;
    preflightTokenRef.current = token;
    setClearSummary(null);
    setPreflightRunningCheckId(id);
    try {
      const result = await runLiveReadinessPreflight({ qualityControls, checkIds: [id] });
      if (preflightTokenRef.current !== token) return;
      if (result.checks[0]) mergePreflightCheck(result.checks[0]);
      setPreflightExpanded(prev => ({ ...prev, [id]: true }));
    } finally {
      if (preflightTokenRef.current === token) setPreflightRunningCheckId(null);
    }
  }, [mergePreflightCheck, preflightRunning, preflightRunningCheckId]);

  const applyClearSummary = useCallback((action: string, cleared: string[]) => {
    setClearSummary({
      action,
      cleared,
      preserved: ['auth/session/project/navigation keys'],
    });
  }, []);

  const clearFlowChainState = useCallback(() => {
    stopActiveRun(false);
    runTokenRef.current += 1;
    qualityBuildIdRef.current = null;
    const flowCount = removeQualityKeys(key => key.startsWith('quality.test.') || key === LS_LAST_RUN_KEY);
    setTestStates(makeInitStates());
    setExpanded(makeInitExpanded());
    setRunAllActive(false);
    setLastRunAt(null);
    setBrokenAt(null);
    setClearMenuOpen(false);
    applyClearSummary('Clear Flow Chain', [
      `Flow Chain history: ${flowCount} keys`,
      'Preflight result: preserved',
      'Report cache: preserved',
    ]);
  }, [applyClearSummary, stopActiveRun]);

  const clearPreflightState = useCallback(() => {
    preflightTokenRef.current += 1;
    const preflightCount = removeQualityKeys(key => key === LS_PREFLIGHT_KEY || key.startsWith('quality.preflight.'));
    setPreflight(null);
    setPreflightExpanded({});
    setPreflightRunning(false);
    setPreflightRunningCheckId(null);
    setClearMenuOpen(false);
    applyClearSummary('Clear Preflight', [
      'Flow Chain history: preserved',
      `Preflight result: ${preflightCount > 0 ? 'cleared' : 'already empty'}`,
      'Report cache: preserved',
    ]);
  }, [applyClearSummary]);

  const clearAllQualityState = useCallback(() => {
    stopActiveRun(false);
    runTokenRef.current += 1;
    preflightTokenRef.current += 1;
    qualityBuildIdRef.current = null;
    const flowCount = removeQualityKeys(key => key.startsWith('quality.test.') || key === LS_LAST_RUN_KEY);
    const preflightCount = removeQualityKeys(key => key === LS_PREFLIGHT_KEY || key.startsWith('quality.preflight.'));
    const reportCacheCount = removeQualityKeys(key => QUALITY_REPORT_CACHE_PREFIXES.some(prefix => key.startsWith(prefix)));
    setTestStates(makeInitStates());
    setExpanded(makeInitExpanded());
    setPreflight(null);
    setPreflightExpanded({});
    setPreflightRunning(false);
    setPreflightRunningCheckId(null);
    setRunAllActive(false);
    setLastRunAt(null);
    setBrokenAt(null);
    setClearMenuOpen(false);
    applyClearSummary('Clear All Quality State', [
      `Flow Chain history: ${flowCount} keys`,
      `Preflight result: ${preflightCount > 0 ? 'cleared' : 'already empty'}`,
      `Report cache: ${reportCacheCount > 0 ? 'cleared' : 'already empty'}`,
    ]);
  }, [applyClearSummary, stopActiveRun]);

  const handleStop = useCallback(() => {
    stopActiveRun(true);
  }, [stopActiveRun]);

  const architectState = testStates['architect-real'];
  const recentLiveTrace = generationTracer.getRecent(20)
    .slice()
    .reverse()
    .find(trace => trace.runSummary?.path.kind === 'real' || trace.runSummary?.path.testEnvironment === false) ?? null;
  const lastLiveStep = recentLiveTrace?.visibleReasoningTrace.steps
    .slice()
    .reverse()
    .find(step => step.status === 'failed' || step.status === 'warning')
    ?? recentLiveTrace?.visibleReasoningTrace.steps.at(-1);

  const passCount = Object.values(testStates).filter(state => state.status === 'pass').length;
  const failCount = Object.values(testStates).filter(state => state.status === 'fail').length;
  const completedCount = Object.values(testStates).filter(state => state.status !== 'idle').length;
  const fixturePassCount = STEP_DEFS.filter(def => getStepEvidence(def.id as StepId).fixtureBacked && testStates[def.id as StepId].status === 'pass').length;
  const realRuntimePassCount = STEP_DEFS.filter(def => getStepEvidence(def.id as StepId).realRuntime && testStates[def.id as StepId].status === 'pass').length;
  const realLlmPassCount = STEP_DEFS.filter(def => getStepEvidence(def.id as StepId).realLlm && testStates[def.id as StepId].status === 'pass').length;
  const anyRunning = runAllActive || preflightRunning || preflightRunningCheckId !== null || Object.values(testStates).some(state => state.status === 'running');

  const flowFailures = STEP_DEFS
    .filter(def => testStates[def.id as StepId].status === 'fail')
    .map(def => `${def.label}: ${testStates[def.id as StepId].error ?? testStates[def.id as StepId].summary ?? 'failed'}`);
  const flowWarnings = STEP_DEFS
    .filter(def => testStates[def.id as StepId].status === 'cancelled')
    .map(def => `${def.label}: ${testStates[def.id as StepId].error ?? CANCELLED_BY_USER}`);
  const flowChainSummary: AggregateSummary = flowFailures.length > 0
    ? {
        status: 'fail',
        reason: flowFailures[0],
        blockingFailures: flowFailures,
        warnings: flowWarnings,
      }
    : passCount === STEP_DEFS.length
      ? {
          status: 'pass',
          reason: 'All Flow Chain checks passed.',
          blockingFailures: [],
          warnings: flowWarnings,
        }
      : completedCount === 0
        ? {
            status: 'idle',
            reason: 'Run Flow Chain checks to validate fixture, runtime, and real LLM layers.',
            blockingFailures: [],
            warnings: [],
          }
        : {
            status: 'warning',
            reason: 'Flow Chain is only partially verified.',
            blockingFailures: [],
            warnings: [
              ...flowWarnings,
              `${passCount}/${STEP_DEFS.length} checks completed successfully.`,
            ],
          };

  const preflightChecksAvailable = preflight?.checks.length ?? 0;
  const preflightFailedChecks = (preflight?.checks ?? []).filter(check => check.status === 'fail');
  const preflightWarningChecks = (preflight?.checks ?? []).filter(check => check.status === 'warning');
  const preflightSummary: AggregateSummary = preflightFailedChecks.length > 0
    ? {
        status: 'fail',
        reason: 'Live Readiness Preflight failed. Live generation is likely to crash.',
        blockingFailures: preflightFailedChecks.map(check => `${check.label}: ${check.summary}`),
        warnings: preflightWarningChecks.map(check => `${check.label}: ${check.summary}`),
      }
    : !preflight || preflightChecksAvailable === 0
      ? {
          status: 'warning',
          reason: 'Live Readiness Preflight has not been run yet.',
          blockingFailures: [],
          warnings: ['Fast deterministic preflight is still missing.'],
        }
      : preflightWarningChecks.length > 0 || preflightChecksAvailable < PREFLIGHT_CHECK_DEFS.length
        ? {
            status: 'warning',
            reason: preflightChecksAvailable < PREFLIGHT_CHECK_DEFS.length
              ? 'Preflight coverage is partial. Some checks have not run yet.'
              : 'Live Readiness Preflight completed with warnings.',
            blockingFailures: [],
            warnings: [
              ...preflightWarningChecks.map(check => `${check.label}: ${check.summary}`),
              ...(preflightChecksAvailable < PREFLIGHT_CHECK_DEFS.length ? [`Only ${preflightChecksAvailable}/${PREFLIGHT_CHECK_DEFS.length} preflight checks have results.`] : []),
            ],
          }
        : {
            status: 'pass',
            reason: 'All Live Readiness Preflight checks passed.',
            blockingFailures: [],
            warnings: [],
          };

  const realLlmSummary: AggregateSummary = architectState.status === 'pass'
    ? {
        status: 'pass',
        reason: 'Architect Real passed with real LLM telemetry.',
        blockingFailures: [],
        warnings: [],
      }
    : architectState.status === 'fail'
      ? {
          status: 'fail',
          reason: architectState.error ?? 'Architect Real failed.',
          blockingFailures: [architectState.error ?? 'Architect Real failed.'],
          warnings: [],
        }
      : architectState.status === 'running'
        ? {
            status: 'warning',
            reason: 'Architect Real is running.',
            blockingFailures: [],
            warnings: [],
          }
        : {
            status: 'warning',
            reason: 'Architect Real has not been run yet.',
            blockingFailures: [],
            warnings: ['Real LLM path is still unverified.'],
          };

  const lastLiveSummary: AggregateSummary = recentLiveTrace
    ? {
        status: mapTraceOutcomeToAggregate(recentLiveTrace.visibleReasoningTrace.finalOutcome),
        reason: recentLiveTrace.errorSummary
          ?? lastLiveStep?.errorSummary
          ?? recentLiveTrace.runSummary?.quality?.summary
          ?? 'Last live generation result loaded.',
        blockingFailures: recentLiveTrace.runSummary?.quality?.blockers ?? [],
        warnings: recentLiveTrace.runSummary?.quality?.warnings ?? [],
      }
    : {
        status: 'idle',
        reason: 'No live generation result captured yet.',
        blockingFailures: [],
        warnings: [],
      };

  const overallStatus: AggregateSummary = (() => {
    if (preflightSummary.status === 'fail') {
      return {
        status: 'fail',
        reason: 'Live Readiness Preflight failed. Live generation is likely to crash.',
        blockingFailures: [...preflightSummary.blockingFailures, ...flowChainSummary.blockingFailures],
        warnings: [...preflightSummary.warnings, ...flowChainSummary.warnings],
      };
    }
    if (flowChainSummary.status === 'fail') {
      return {
        status: 'fail',
        reason: flowChainSummary.reason,
        blockingFailures: [...flowChainSummary.blockingFailures],
        warnings: [...preflightSummary.warnings],
      };
    }
    if (realLlmSummary.status === 'fail') {
      return {
        status: 'fail',
        reason: realLlmSummary.reason,
        blockingFailures: [...realLlmSummary.blockingFailures],
        warnings: [...preflightSummary.warnings],
      };
    }
    if (flowChainSummary.status === 'pass' && preflightSummary.status === 'pass' && realLlmSummary.status === 'pass') {
      if (lastLiveSummary.status === 'fail' || lastLiveSummary.status === 'warning') {
        return {
          status: 'warning',
          reason: 'Critical checks passed, but the latest live generation still shows warnings or failures.',
          blockingFailures: [],
          warnings: [...lastLiveSummary.blockingFailures, ...lastLiveSummary.warnings],
        };
      }
      return {
        status: 'pass',
        reason: 'Flow Chain, Live Readiness Preflight, and Architect Real all passed.',
        blockingFailures: [],
        warnings: [],
      };
    }

    const warnings = [
      ...flowChainSummary.warnings,
      ...preflightSummary.warnings,
      ...realLlmSummary.warnings,
      ...(lastLiveSummary.status === 'fail' || lastLiveSummary.status === 'warning'
        ? [...lastLiveSummary.blockingFailures, ...lastLiveSummary.warnings]
        : []),
    ];
    return {
      status: 'warning',
      reason: flowChainSummary.status === 'warning'
        ? flowChainSummary.reason
        : preflightSummary.status === 'warning'
          ? preflightSummary.reason
          : realLlmSummary.reason,
      blockingFailures: [],
      warnings,
    };
  })();

  const reportVerdict: ReportVerdict = overallStatus.status === 'fail' ? 'FAIL' : overallStatus.status === 'pass' ? 'PASS' : 'WARNING';
  const lastRunStr = lastRunAt ? fmtDateTime(lastRunAt) : null;
  const nextRecommendedAction = overallStatus.status === 'fail'
    ? preflightSummary.status === 'fail'
      ? 'Fix the failing Live Readiness Preflight checks and rerun the failing preflight items.'
      : flowChainSummary.status === 'fail'
        ? 'Rerun the failing Flow Chain step and inspect its detailed diagnostics.'
        : 'Fix the failing real LLM path before trusting live generation.'
    : overallStatus.status === 'warning'
      ? preflightSummary.status !== 'pass'
        ? 'Run or complete Live Readiness Preflight until it is fully green.'
        : realLlmSummary.status !== 'pass'
          ? 'Run Architect Real to verify the real LLM path.'
          : 'Review the latest live generation warning and rerun the affected slice.'
      : 'Run the flow-chain and live generation canaries as the final audit before commit.';

  const lastLivePayload = recentLiveTrace ? {
    status: lastLiveSummary.status,
    stage: lastLiveStep?.kind ?? 'unknown',
    root_cause_type: undefined,
    raw_error_excerpt: recentLiveTrace.errorSummary ?? lastLiveStep?.errorSummary ?? null,
    candidate_graph_summary: recentLiveTrace.runSummary?.output?.structure?.summary ?? null,
    suggested_fix: recentLiveTrace.runSummary?.quality?.blockers?.[0] ?? recentLiveTrace.runSummary?.quality?.warnings?.[0] ?? null,
    trace: recentLiveTrace,
  } : null;

  const reportPayload = {
    generatedAt: new Date().toISOString(),
    verdict: reportVerdict,
    overallStatus: overallStatus.status,
    flowChainStatus: flowChainSummary.status,
    preflightStatus: !preflight ? 'skipped' : preflightSummary.status,
    realLlmStatus: architectState.status === 'idle' ? 'skipped' : realLlmSummary.status,
    lastLiveStatus: lastLiveSummary.status === 'idle' ? 'skipped' : lastLiveSummary.status,
    reason: overallStatus.reason,
    blockingFailures: overallStatus.blockingFailures,
    warnings: overallStatus.warnings,
    nextRecommendedAction,
    lastRunAt,
    brokenAt,
    preflight,
    lastLiveResult: lastLivePayload ? {
      status: lastLivePayload.status,
      stage: lastLivePayload.stage,
      root_cause_type: lastLivePayload.root_cause_type,
      raw_error_excerpt: lastLivePayload.raw_error_excerpt,
      candidate_graph_summary: lastLivePayload.candidate_graph_summary,
      suggested_fix: lastLivePayload.suggested_fix,
    } : null,
    tests: STEP_DEFS.map(def => {
      const evidence = getStepEvidence(def.id as StepId);
      return {
        id: def.id,
        label: def.label,
        description: def.desc,
        truthLevel: evidence.kind,
        truthLabel: evidence.label,
        fixtureBacked: evidence.fixtureBacked,
        realRuntime: evidence.realRuntime,
        realLlm: evidence.realLlm,
        current: testStates[def.id as StepId],
        history: loadTestHistory(def.id),
      };
    }),
  };
  const reportJson = JSON.stringify(reportPayload, null, 2);
  const hasReportData = Object.values(testStates).some(state => state.status !== 'idle') || preflight !== null || lastLivePayload !== null;

  const handleDownloadReport = useCallback(() => {
    downloadQualityReport(reportPayload);
  }, [reportJson]);

  const handleCopyReport = useCallback(async () => {
    await copyTextToClipboard(reportJson);
  }, [reportJson]);

  const preflightCards = PREFLIGHT_CHECK_DEFS.map(def => {
    const found = preflight?.checks.find(check => check.id === def.id);
    return {
      check: found ?? {
        id: def.id,
        label: def.label,
        status: 'warning' as const,
        summary: 'Not run yet. Run this check to capture deterministic diagnostics.',
      },
      displayStatus: preflightRunningCheckId === def.id ? 'running' as const : found ? found.status : 'idle' as const,
    };
  });

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 18,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0,
    }}>
      <div style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '14px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'linear-gradient(180deg, rgba(8,10,16,0.98), rgba(8,10,16,0.92))',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.42)' }}>
            Quality diagnostics
          </span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.76)' }}>
            Flow Chain, Live Readiness Preflight, Architect Real, and the latest live result are shown as separate diagnostic layers.
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => void handleRunAll()}
            disabled={anyRunning}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 9, border: 'none',
              background: anyRunning ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.90)',
              color: anyRunning ? 'rgba(96,165,250,0.5)' : '#fff',
              fontSize: 12, fontWeight: 700,
              cursor: anyRunning ? 'not-allowed' : 'pointer',
            }}
          >
            <Play size={12} />
            Run All
          </button>
          <button
            type="button"
            onClick={() => void handleRunPreflight()}
            disabled={anyRunning}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 9,
              border: '1px solid rgba(110,231,183,0.28)',
              background: anyRunning ? 'rgba(16,185,129,0.04)' : 'rgba(16,185,129,0.10)',
              color: anyRunning ? 'rgba(110,231,183,0.38)' : '#6ee7b7',
              fontSize: 12, fontWeight: 700,
              cursor: anyRunning ? 'not-allowed' : 'pointer',
            }}
          >
            {preflightRunning ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <FlaskConical size={12} />}
            Run Preflight
          </button>
          {activeRunRef.current && (
            <button
              type="button"
              onClick={handleStop}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 9,
                border: '1px solid rgba(251,191,36,0.35)',
                background: 'rgba(251,191,36,0.10)',
                color: '#fbbf24',
                fontSize: 12, fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <X size={12} />
              Stop
            </button>
          )}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setClearMenuOpen(prev => !prev)}
              style={{
                padding: '7px 12px',
                borderRadius: 9,
                border: '1px solid rgba(248,113,113,0.35)',
                background: 'rgba(248,113,113,0.10)',
                color: 'rgba(254,226,226,0.95)',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
            {clearMenuOpen && (
              <div style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 8px)',
                minWidth: 240,
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.10)',
                background: 'rgba(8,10,16,0.98)',
                boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
                padding: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                zIndex: 5,
              }}>
                <button type="button" onClick={clearFlowChainState} style={{ padding: '9px 10px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.88)', textAlign: 'left', cursor: 'pointer' }}>Clear Flow Chain</button>
                <button type="button" onClick={clearPreflightState} style={{ padding: '9px 10px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.88)', textAlign: 'left', cursor: 'pointer' }}>Clear Preflight</button>
                <button type="button" onClick={clearAllQualityState} style={{ padding: '9px 10px', borderRadius: 8, border: 'none', background: 'rgba(248,113,113,0.10)', color: '#fecaca', textAlign: 'left', cursor: 'pointer' }}>Clear All Quality State</button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => void handleCopyReport()}
            disabled={!hasReportData || anyRunning}
            style={{
              padding: '7px 12px', borderRadius: 9,
              border: '1px solid rgba(255,255,255,0.14)',
              background: anyRunning || !hasReportData ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)',
              color: anyRunning || !hasReportData ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.82)',
              fontSize: 12, fontWeight: 700,
              cursor: anyRunning || !hasReportData ? 'not-allowed' : 'pointer',
            }}
          >
            Copy report JSON
          </button>
          <button
            type="button"
            onClick={handleDownloadReport}
            disabled={!hasReportData || anyRunning}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 12px', borderRadius: 9,
              border: '1px solid rgba(96,165,250,0.24)',
              background: anyRunning || !hasReportData ? 'rgba(255,255,255,0.03)' : 'rgba(96,165,250,0.08)',
              color: anyRunning || !hasReportData ? 'rgba(255,255,255,0.24)' : '#93c5fd',
              fontSize: 12, fontWeight: 700,
              cursor: anyRunning || !hasReportData ? 'not-allowed' : 'pointer',
            }}
          >
            <Download size={12} />
            Report
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {clearSummary && (
          <div style={{ border: '1px solid rgba(96,165,250,0.20)', borderRadius: 16, background: 'rgba(30,41,59,0.72)', padding: 16, display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.92)' }}>{clearSummary.action}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.82)', whiteSpace: 'pre-line' }}>
              Cleared:
              {'\n'}- {clearSummary.cleared.join('\n- ')}
              {'\n'}Preserved:
              {'\n'}- {clearSummary.preserved.join('\n- ')}
            </div>
          </div>
        )}

        <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, background: 'linear-gradient(180deg, rgba(14,165,233,0.10), rgba(15,23,42,0.72))', padding: 18, display: 'flex', flexDirection: 'column', gap: 14, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(191,219,254,0.82)' }}>Overall Quality Status</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.96)' }}>Overall: {statusLabel(overallStatus.status)}</span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', lineHeight: 1.5 }}>Reason: {overallStatus.reason}</span>
            </div>
            <span style={statusBadgeStyle(overallStatus.status)}>{statusLabel(overallStatus.status)}</span>
          </div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)' }}><KV label="Flow Chain" value={statusLabel(flowChainSummary.status)} /><div style={{ fontSize: 12, color: 'rgba(255,255,255,0.66)' }}>{flowChainSummary.reason}</div></div>
            <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)' }}><KV label="Live Readiness" value={statusLabel(preflightSummary.status)} /><div style={{ fontSize: 12, color: 'rgba(255,255,255,0.66)' }}>{preflightSummary.reason}</div></div>
            <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)' }}><KV label="Architect Real" value={statusLabel(realLlmSummary.status)} /><div style={{ fontSize: 12, color: 'rgba(255,255,255,0.66)' }}>{realLlmSummary.reason}</div></div>
            <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)' }}><KV label="Last live result" value={statusLabel(lastLiveSummary.status)} /><div style={{ fontSize: 12, color: 'rgba(255,255,255,0.66)' }}>{lastLiveSummary.reason}</div></div>
          </div>
          {overallStatus.blockingFailures.length > 0 && (
            <SelectionBlock title="Blocking failures" value={overallStatus.blockingFailures.join('\n')} copyLabel="Copy blockers" maxHeight={140} />
          )}
        </div>

        <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, background: 'rgba(15,23,42,0.72)', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0, flexShrink: 0 }}>
          <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.52)' }}>Flow Chain</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>Fixture, real runtime, and real LLM checks remain separate and explicit. Each step keeps its own status, duration, summary, rerun button, details, and copyable payload.</span>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'rgba(255,255,255,0.60)' }}>
              <span>{passCount}/{STEP_DEFS.length}</span>
              <span>Fixture PASS: {fixturePassCount}</span>
              <span>Real runtime PASS: {realRuntimePassCount}</span>
              <span>Real LLM PASS: {realLlmPassCount}</span>
              {brokenAt ? <span style={{ color: '#f87171' }}>stopped at {brokenAt}</span> : null}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minHeight: 0, paddingBottom: 2 }}>
            {STEP_DEFS.map(def => (
              <TestRow
                key={def.id}
                def={def}
                state={testStates[def.id as StepId]}
                onRun={() => handleRunOne(def.id as StepId)}
                anyRunning={anyRunning}
                expanded={expanded[def.id as StepId]}
                onToggle={() => handleToggle(def.id as StepId)}
              />
            ))}
          </div>
        </div>

        <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, background: 'linear-gradient(180deg, rgba(16,185,129,0.06), rgba(15,23,42,0.74))', padding: 16, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0, flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(110,231,183,0.82)' }}>Live Readiness Preflight</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', lineHeight: 1.55 }}>Fast deterministic preflight. No LLM. No Vite build. Checks contracts before live generation.</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.70)', lineHeight: 1.55 }}>Быстрая статическая проверка. Не вызывает LLM и не собирает preview. Проверяет контракты файлов, импортов, экспортов, skeleton-ов и prompt catalog.</span>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={statusBadgeStyle(preflightRunning ? 'running' : preflightSummary.status)}>{statusLabel(preflightRunning ? 'running' : preflightSummary.status)}</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)' }}>{preflight ? `${preflight.passCount} pass · ${preflight.failCount} fail · ${preflight.warningCount} warning` : 'No preflight result yet'}</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.50)' }}>{preflight ? fmtDateTime(preflight.checkedAt) : 'Not run yet'}</span>
            </div>
            {preflightSummary.status === 'fail' ? (
              <div style={{ border: '1px solid rgba(248,113,113,0.24)', borderRadius: 12, background: 'rgba(248,113,113,0.08)', color: '#fecaca', padding: '10px 12px', fontSize: 12 }}>Live generation is likely to crash until these contract failures are fixed.</div>
            ) : null}
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {preflightCards.map(({ check, displayStatus }) => (
              <PreflightCheckCard
                key={check.id}
                check={check}
                displayStatus={displayStatus}
                expanded={Boolean(preflightExpanded[check.id])}
                running={preflightRunningCheckId === check.id}
                onToggle={() => togglePreflightDetails(check.id)}
                onRun={() => void handleRunPreflightCheck(check.id)}
              />
            ))}
          </div>
        </div>

        <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, background: 'rgba(15,23,42,0.74)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(196,181,253,0.82)' }}>Real LLM / Architect Real</span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>Real model telemetry is shown separately so it does not disappear into the main diagnostic stream.</span>
            </div>
            <span style={statusBadgeStyle(architectState.status === 'pass' ? 'pass' : architectState.status === 'fail' ? 'fail' : architectState.status === 'running' ? 'running' : 'warning')}>
              {statusLabel(architectState.status === 'idle' ? 'warning' : architectState.status === 'cancelled' ? 'warning' : architectState.status)}
            </span>
          </div>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <KV label="model" value={architectState.llm?.model ?? 'Not run yet'} />
            <KV label="prompt tokens" value={architectState.llm ? String(architectState.llm.prompt_tokens) : '—'} />
            <KV label="completion tokens" value={architectState.llm ? String(architectState.llm.completion_tokens) : '—'} />
            <KV label="total tokens" value={architectState.llm ? String(architectState.llm.total_tokens) : '—'} />
            <KV label="file count" value={architectState.output?.file_count ? String(architectState.output.file_count) : '—'} />
            <KV label="status" value={architectState.status} />
          </div>
          <SelectionBlock title="Architect Real details" value={JSON.stringify(architectState.details ?? { summary: 'Architect Real has not been run yet.' }, null, 2)} copyLabel="Copy architect details" maxHeight={220} />
          <SelectionBlock title="Architect Real raw result" value={buildStepDetailsPayload(STEP_DEFS[STEP_DEFS.length - 1], architectState)} copyLabel="Copy raw result" maxHeight={220} />
        </div>

        <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, background: 'rgba(15,23,42,0.74)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.52)' }}>Last Live Generation Result</span>
          {lastLivePayload ? (
            <>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <KV label="status" value={lastLivePayload.status} />
                <KV label="stage" value={lastLivePayload.stage} />
                <KV label="root_cause_type" value={lastLivePayload.root_cause_type ?? '—'} />
                <KV label="candidate graph" value={lastLivePayload.candidate_graph_summary ?? '—'} />
                <KV label="suggested fix" value={lastLivePayload.suggested_fix ?? '—'} />
                <KV label="started" value={fmtDateTime(recentLiveTrace?.startedAt)} />
              </div>
              <SelectionBlock title="Raw error excerpt" value={lastLivePayload.raw_error_excerpt ?? 'No raw error excerpt captured.'} copyLabel="Copy raw error" maxHeight={160} />
              <SelectionBlock title="Live trace summary" value={JSON.stringify({ runSummary: recentLiveTrace?.runSummary, visibleReasoningTrace: recentLiveTrace?.visibleReasoningTrace }, null, 2)} copyLabel="Copy live trace" maxHeight={260} />
            </>
          ) : (
            <div style={{ border: '1px dashed rgba(255,255,255,0.16)', borderRadius: 12, padding: '14px 16px', fontSize: 13, color: 'rgba(255,255,255,0.66)' }}>
              No live generation result captured yet.
            </div>
          )}
        </div>
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 11, color: 'rgba(255,255,255,0.42)' }}>
        <Clock size={11} />
        <span>{lastRunStr ? `Last run: ${lastRunStr}` : 'No Flow Chain run yet.'}</span>
        <span style={verdictBadgeStyle(reportVerdict === 'WARNING' ? 'PARTIAL' : reportVerdict)}>{reportVerdict}</span>
        <span>{passCount}/{STEP_DEFS.length}</span>
        {brokenAt ? <span style={{ color: '#f87171' }}>stopped at {brokenAt}</span> : null}
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
              type="button"
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
