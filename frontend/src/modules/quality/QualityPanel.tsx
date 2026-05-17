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
const MAX_HIST        = 5;
const FIXTURE_BACKED_TESTS = new Set<StepId>(['idea-validate', 'architecture', 'code-delta']);
const FIXTURE_NOTE_TEXT = 'Not real LLM output';
const CANCELLED_BY_USER = 'Cancelled by user';
const QUALITY_STORAGE_PREFIXES = [
  'quality.test.',
  'quality.lastRun',
  'quality.real-suite.',
  'quality.compare.',
  'quality.benchmark.',
] as const;

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
- Each fileTree value: exactly one sentence describing purpose + data used`;

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

  let plan: Record<string, unknown>;
  try {
    // Strip markdown fences if present
    const stripped = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    plan = JSON.parse(stripped) as Record<string, unknown>;
  } catch {
    return { status: 'fail', duration_ms: ms(), error: `LLM returned non-JSON: ${content.slice(0, 200)}` };
  }

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

function buildTestMetaLines(id: StepId, state: TestState): Array<{ key: string; text: string; color?: string }> {
  const lines: Array<{ key: string; text: string; color?: string }> = [];
  const evidence = getStepEvidence(id);
  if (evidence.fixtureBacked) {
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
    const skeletonEntries = Object.entries(d.skeletonFiles ?? {});
    const deltaEntries    = Object.entries(d.fileTree ?? {});
    const fileRow = (path: string, purpose: string, color: string) => (
      <div key={path} style={{ display: 'flex', flexDirection: 'column', paddingLeft: 12, marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontFamily: 'monospace', color }}>{path}</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', paddingLeft: 4 }}>{purpose}</span>
      </div>
    );
    return renderPanel(
      <>
        <KV label="appName"  value={<span style={{ color: '#e2c08d' }}>{`"${d.appName}"`}</span>} />
        <KV label="skeleton" value={<span style={{ color: '#e2c08d' }}>{`"${d.skeleton}"`}</span>} />
        {d.dataModel && (
          <KV label="dataModel" value={
            <code style={{ color: '#a78bfa', fontSize: 10, background: 'rgba(167,139,250,0.08)', padding: '1px 5px', borderRadius: 3 }}>
              {d.dataModel}
            </code>
          } />
        )}
        {d.contextContract && (
          <KV label="contextContract" value={
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>{d.contextContract}</span>
          } />
        )}

        {skeletonEntries.length > 0 && (
          <>
            <div style={{ marginTop: 10, marginBottom: 4, padding: '2px 6px', background: 'rgba(255,255,255,0.04)', borderRadius: 3 }}>
              <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)' }}>
                🔒 skeleton provided ({skeletonEntries.length} files) — import freely, do NOT overwrite
              </span>
            </div>
            {skeletonEntries.map(([p, desc]) => fileRow(p, desc, 'rgba(255,255,255,0.3)'))}
          </>
        )}

        <div style={{ marginTop: 10, marginBottom: 4, padding: '2px 6px', background: 'rgba(96,165,250,0.06)', borderRadius: 3 }}>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(96,165,250,0.7)' }}>
            ✏️ delta files ({deltaEntries.length}) — architect defines, coder writes
          </span>
        </div>
        {deltaEntries.map(([p, desc]) => fileRow(p, desc, '#60a5fa'))}
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

  if (testId === 'architect-real') {
    const d = details as unknown as ArchRealDetails;
    const deltaEntries = Object.entries(d.fileTree ?? {});
    const fileRow = (p: string, purpose: string) => (
      <div key={p} style={{ display: 'flex', flexDirection: 'column', paddingLeft: 12, marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#60a5fa' }}>{p}</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', paddingLeft: 4 }}>{purpose}</span>
      </div>
    );
    return renderPanel(
      <>
        <KV label="appName"  value={<span style={{ color: '#e2c08d' }}>{`"${d.appName}"`}</span>} />
        <KV label="skeleton" value={<span style={{ color: '#e2c08d' }}>{`"${d.skeleton}"`}</span>} />
        <KV label="model"    value={<span style={{ color: '#a78bfa' }}>{d.model}</span>} />
        {d.dataModel && (
          <KV label="dataModel" value={
            <code style={{ color: '#a78bfa', fontSize: 10, background: 'rgba(167,139,250,0.08)', padding: '1px 5px', borderRadius: 3 }}>
              {d.dataModel}
            </code>
          } />
        )}
        {d.contextContract && (
          <KV label="contextContract" value={
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>{d.contextContract}</span>
          } />
        )}
        <div style={{ marginTop: 10, marginBottom: 4, padding: '2px 6px', background: 'rgba(96,165,250,0.06)', borderRadius: 3 }}>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(96,165,250,0.7)' }}>
            ✏️ delta files ({deltaEntries.length}) — реальный LLM output
          </span>
        </div>
        {deltaEntries.map(([p, desc]) => fileRow(p, desc))}
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
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
        }}>
          <span style={{
            fontSize: 12, fontWeight: 600, fontFamily: 'monospace',
            color: labelColor, minWidth: 0, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {def.label}
          </span>
          <span style={evidenceBadgeStyle(evidence.kind)} title={evidence.note}>
            {evidence.label}
          </span>
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

      {metaLines.length > 0 && (
        <div style={{
          padding: '0 16px 8px 40px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          background: rowBg,
          borderLeft: leftBorder,
        }}>
          {metaLines.map(line => (
            <div
              key={line.key}
              style={{
                fontSize: 11,
                fontFamily: 'monospace',
                color: line.color ?? 'rgba(255,255,255,0.45)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
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
          padding: '4px 16px 6px 40px',
          fontSize: 11, color: '#f87171',
          background: 'rgba(248,113,113,0.03)',
          borderLeft: '2px solid rgba(248,113,113,0.15)',
          wordBreak: 'break-all',
        }}>
          {state.error}
        </div>
      )}

      {state.status === 'cancelled' && (state.error || state.summary) && (
        <div style={{
          padding: '4px 16px 6px 40px',
          fontSize: 11, color: '#fbbf24',
          background: 'rgba(251,191,36,0.04)',
          borderLeft: '2px solid rgba(251,191,36,0.18)',
          wordBreak: 'break-all',
        }}>
          {state.error ?? state.summary}
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
  // Shared buildId for Code Delta → Compile → Preview HTTP → Save Ready chain
  const qualityBuildIdRef = React.useRef<string | null>(null);
  const activeRunRef = React.useRef<ActiveRun | null>(null);
  const runTokenRef = React.useRef(0);
  const runningStepRef = React.useRef<StepId | null>(null);

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

  useEffect(() => () => {
    activeRunRef.current?.controller.abort();
    activeRunRef.current = null;
  }, []);

  const anyRunning = runAllActive || Object.values(testStates).some(s => s.status === 'running');
  const hasReportData = Object.values(testStates).some(s => s.status !== 'idle');

  const setOneState = useCallback((id: StepId, patch: Partial<TestState>) => {
    setTestStates(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const handleToggle = useCallback((id: StepId) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
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
        // Frontend-only LLM call — no backend proxy
        result = await runArchitectRealTest(run.controller.signal);
      } else {
        // For chain tests, pass the shared buildId from Code Delta
        const chainBuildId = (id === 'compile' || id === 'preview-http' || id === 'save-ready')
          ? (qualityBuildIdRef.current ?? undefined)
          : undefined;
        result = await callTestApi(id, chainBuildId, run.controller.signal);
      }

      if (!isRunCurrent(run) || result.status === 'cancelled') {
        return { ...CANCELLED_TEST_RESULT, duration_ms: result.duration_ms };
      }

      // After Code Delta succeeds, capture its buildId for downstream chain tests
      if (id === 'code-delta' && result.status === 'pass') {
        const bid = (result.details as Record<string, unknown> | undefined)?.buildId;
        if (typeof bid === 'string') {
          qualityBuildIdRef.current = bid;
        }
      }

      setOneState(id, {
        status:     result.status,
        duration_ms: result.duration_ms,
        error:       result.error,
        summary:     result.summary,
        llm:         result.llm,
        output:      result.output,
        warnings:    result.warnings,
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
      if (isAbortError(err) || !isRunCurrent(run)) {
        return { ...CANCELLED_TEST_RESULT };
      }
      const error = err instanceof Error ? err.message : String(err);
      setOneState(id, { status: 'fail', duration_ms: 0, error, summary: undefined, llm: undefined, output: undefined, warnings: undefined });
      persistTestRun(id, { timestamp: new Date().toISOString(), status: 'fail', duration_ms: 0, error });
      return { status: 'fail', duration_ms: 0, error };
    } finally {
      if (runningStepRef.current === id) runningStepRef.current = null;
    }
  }, [isRunCurrent, setOneState]);

  const handleRunOne = useCallback((id: StepId) => {
    if (activeRunRef.current) return;
    const run = beginRun('single');
    void runSingleTest(id, run).finally(() => {
      if (finishRun(run)) setRunAllActive(false);
    });
  }, [beginRun, finishRun, runSingleTest]);

  const handleRunAll = useCallback(async () => {
    if (activeRunRef.current) return;
    const run = beginRun('all');
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
        if (result.status === 'fail') { setBrokenAt(def.id); break; }
      }
    } finally {
      if (finishRun(run)) setRunAllActive(false);
    }
  }, [beginRun, finishRun, isRunCurrent, runSingleTest]);

  const handleClear = useCallback(() => {
    stopActiveRun(false);
    runTokenRef.current += 1;
    qualityBuildIdRef.current = null;
    clearQualityPanelHistory();
    setTestStates(makeInitStates());
    setExpanded(makeInitExpanded());
    setRunAllActive(false);
    setLastRunAt(null);
    setBrokenAt(null);
  }, [stopActiveRun]);

  const handleStop = useCallback(() => {
    stopActiveRun(true);
  }, [stopActiveRun]);

  // Footer verdict
  const passCount = Object.values(testStates).filter(s => s.status === 'pass').length;
  const failCount = Object.values(testStates).filter(s => s.status === 'fail').length;
  const fixturePassCount = STEP_DEFS.filter(def =>
    getStepEvidence(def.id as StepId).fixtureBacked && testStates[def.id as StepId].status === 'pass'
  ).length;
  const realRuntimePassCount = STEP_DEFS.filter(def =>
    getStepEvidence(def.id as StepId).realRuntime && testStates[def.id as StepId].status === 'pass'
  ).length;
  const realLlmPassCount = STEP_DEFS.filter(def =>
    getStepEvidence(def.id as StepId).realLlm && testStates[def.id as StepId].status === 'pass'
  ).length;
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

  const handleDownloadReport = useCallback(() => {
    const report = {
      generatedAt: new Date().toISOString(),
      lastRunAt,
      verdict,
      passCount,
      failCount,
      fixturePassCount,
      realRuntimePassCount,
      realLlmPassCount,
      brokenAt,
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
    downloadQualityReport(report);
  }, [brokenAt, failCount, fixturePassCount, lastRunAt, passCount, realLlmPassCount, realRuntimePassCount, testStates, verdict]);

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      flex: 1, minHeight: 0,
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
          {anyRunning && (
            <button
              onClick={handleStop}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 7,
                border: '1px solid rgba(251,191,36,0.35)',
                background: 'rgba(251,191,36,0.10)',
                color: '#fbbf24',
                fontSize: 12, fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <X size={12} />
              Stop
            </button>
          )}
          <button
            onClick={handleClear}
            style={{
              padding: '5px 12px', borderRadius: 7,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.65)',
              fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            Clear
          </button>
          <button
            onClick={handleDownloadReport}
            disabled={anyRunning || !hasReportData}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 7,
              border: '1px solid rgba(96,165,250,0.24)',
              background: anyRunning || !hasReportData ? 'rgba(255,255,255,0.03)' : 'rgba(96,165,250,0.08)',
              color: anyRunning || !hasReportData ? 'rgba(255,255,255,0.2)' : '#93c5fd',
              fontSize: 12, fontWeight: 600,
              cursor: anyRunning || !hasReportData ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <Download size={12} />
            Report
          </button>
        </div>
      </div>

      {/* Test rows */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto' }}>
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
            <span>Fixture PASS: {fixturePassCount}</span>
            <span>Real runtime PASS: {realRuntimePassCount}</span>
            <span>Real LLM PASS: {realLlmPassCount}</span>
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
