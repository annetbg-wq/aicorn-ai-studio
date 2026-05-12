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
  Clock, BarChart2, ChevronDown, ChevronRight, Download, GitCompare, FileText,
} from 'lucide-react';
import { BenchmarkDashboard } from '../../components/BenchmarkDashboard';
import { ConfigService } from '../../services/ConfigService';
import { Orchestrator } from '../../services/Orchestrator';
import { fetchModelsWithCache, type Model } from '../../services/ModelRegistry';
import { ProtoPipeline } from '../../services/ProtoPipeline';
import { getDevAgentCliStatus } from '../code-studio-internal/ClaudeDevBridge';
import {
  analyzeArchitectPlanTruth,
  type OutputTruthResult,
  type OutputStructureContractSummary,
  type OutputSkeletonDeltaSummary,
} from '../../shared/outputTruth';

// ── Step definitions ───────────────────────────────────────────────────────────

const STEP_DEFS = [
  { id: 'canary',            label: 'Canary',            desc: 'Backend доступен (GET /api/health → 200)' },
  { id: 'idea-validate',     label: 'Idea Validate',     desc: 'Промпт не пустой, длина > 10 символов' },
  { id: 'architecture',      label: 'Architecture',      desc: 'Fixture-backed diagnostic only — не доказывает real architect truth' },
  { id: 'code-delta',        label: 'Code Delta',        desc: 'Реальная delta поверх skeleton компилируется и проходит proof contract' },
  { id: 'compile',           label: 'Compile',           desc: 'В builds/ есть папка с .js assets' },
  { id: 'preview-http',      label: 'Preview HTTP',      desc: 'GET /preview/{buildId} → 200 и HTML' },
  { id: 'preview-mounted',   label: 'Preview Mounted',   desc: 'main.tsx содержит postMessage({type: preview-mounted})' },
  { id: 'save-ready',        label: 'Save Ready',        desc: 'Save-ready только для real preview с proof-validated output' },
  { id: 'no-premature-save', label: 'No Premature Save', desc: 'Проект не создан до явного save' },
  { id: 'architect-real',    label: 'Architect Real',    desc: 'Реальный LLM вызов — fileTree ≥5 файлов, реальные токены' },
] as const;

type StepId = typeof STEP_DEFS[number]['id'];
type TabId  = 'flow-chain' | 'benchmark';
type QualityTruthKind = 'fixture-backed' | 'real-runtime' | 'real-llm';

// ── Per-test detail types ──────────────────────────────────────────────────────

interface CanaryDetails       { httpStatus: number; response: { status: string; provider: string } }
interface IdeaDetails         { prompt: string; length: number; valid: boolean }
interface ArchDetails         { appName: string; skeleton: string; skeletonFiles?: Record<string, string>; fileTree: Record<string, string>; contextContract?: string; dataModel?: string }
interface CodeDeltaFile       { path: string; size: number; content: string }
interface CodeDeltaDetails    { buildId: string; files: CodeDeltaFile[]; structure?: OutputStructureContractSummary; skeletonDelta?: OutputSkeletonDeltaSummary }
interface CompileAsset        { name: string; size: number }
interface CompileDetails      { buildId: string; assets: CompileAsset[] }
interface PreviewHttpDetails  { httpStatus: number; contentLength: number; contentLengthStr: string; hasRootDiv: boolean; buildId: string; htmlExcerpt?: string }
interface PreviewMtdDetails   { lineNumber: number; line: string }
interface SaveReadyDetails    { compileSuccess: boolean; buildId: string; assetsCount: number; structure?: OutputStructureContractSummary; skeletonDelta?: OutputSkeletonDeltaSummary }
interface NoPremSaveDetails   { projectsBeforeSave: number; totalSessions: number; correct: boolean }
interface ArchRealDetails    { appName: string; skeleton: string; fileTree: Record<string, string>; contextContract?: string; dataModel?: string; model: string; fileCount: number; prompt?: string; rawResponse?: string; finishReason?: string | null; routeLabel?: string; repairAttempted?: boolean }
interface TestLlmMetrics      { model: string; prompt_tokens: number; completion_tokens: number; total_tokens: number; cost_usd?: number }
interface TestOutputMetrics   { file_count?: number; total_bytes?: number; asset_count?: number; build_size_kb?: number; preview_url?: string; files?: string[] }
interface QualityWorkspaceSnapshot {
  skeletonId: string | null;
  routeCount: number;
  workspaceFiles: Record<string, string>;
  deltaFiles: Record<string, string>;
  outputTruth: OutputTruthResult;
}
interface QualityCompareSourceFile {
  path: string;
  size: number;
  content: string;
  origin: 'skeleton' | 'delta';
}
interface QualityCompareRunMetrics {
  generation_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd?: number;
  costEstimated?: boolean;
}
interface QualityCompareSuiteData {
  buildId: string;
  previewUrl?: string;
  prompt: string;
  skeletonId: string | null;
  workspace?: QualityWorkspaceSnapshot;
  sourceFiles: QualityCompareSourceFile[];
  codeSections: QualityRealTextSection[];
  metrics: QualityCompareRunMetrics;
  tests: Record<StepId, TestApiResult>;
}

// ── General types ──────────────────────────────────────────────────────────────

interface TestState {
  status: 'idle' | 'running' | 'pass' | 'fail';
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
  status: 'pass' | 'fail';
  duration_ms: number;
  error?: string;
}

interface TestApiResult {
  status: 'pass' | 'fail';
  duration_ms: number;
  summary?: string;
  llm?: TestLlmMetrics;
  output?: TestOutputMetrics;
  warnings?: string[];
  error?: string;
  details?: Record<string, unknown>;
}

export type QualityCompareRoute = 'standard-api' | 'openrouter' | 'claude-cli' | 'codex-cli';

export interface QualityRealTextSection {
  id: string;
  label: string;
  content: string;
}

export interface QualityCompareProfile {
  route: QualityCompareRoute;
  model: string;
}

interface QualityCompareProfileStatus {
  ready: boolean;
  label: string;
  reason?: string;
}

export interface QualityCompareRunSide {
  profile: QualityCompareProfile;
  status: QualityCompareProfileStatus;
  result?: TestApiResult;
  realText: QualityRealTextSection[];
  /** Per-token pricing looked up from the OpenRouter catalog at run time */
  pricing?: { promptPerToken: number; completionPerToken: number };
  suite?: QualityCompareSuiteData;
}

interface QualityCompareRunRecord {
  state: 'idle' | 'running' | 'done';
  supported: boolean;
  reason?: string;
  left?: QualityCompareRunSide;
  right?: QualityCompareRunSide;
}

type DevAgentCliStatus = Awaited<ReturnType<typeof getDevAgentCliStatus>>;

// ── localStorage helpers ───────────────────────────────────────────────────────

const LS_TEST_KEY     = (id: string) => `quality.test.${id}`;
const LS_LAST_RUN_KEY = 'quality.lastRunAll';
const MAX_HIST        = 5;
const FIXTURE_BACKED_TESTS = new Set<StepId>(['idea-validate', 'architecture']);
const REAL_RUNTIME_TESTS = new Set<StepId>([
  'canary',
  'code-delta',
  'compile',
  'preview-http',
  'preview-mounted',
  'save-ready',
  'no-premature-save',
]);
const REAL_LLM_TESTS = new Set<StepId>([
  'architect-real',
]);
const BLOCKING_REAL_TESTS = new Set<StepId>([
  'canary',
  'architect-real',
  'code-delta',
  'compile',
  'preview-http',
  'preview-mounted',
  'save-ready',
]);
const FIXTURE_NOTE_TEXT = '⚠️ Fixture данные — не реальный LLM output';

function getTruthKind(id: StepId): QualityTruthKind {
  if (FIXTURE_BACKED_TESTS.has(id)) return 'fixture-backed';
  if (REAL_LLM_TESTS.has(id)) return 'real-llm';
  return 'real-runtime';
}

const QUALITY_COMPARE_ROUTE_LABELS: Record<QualityCompareRoute, string> = {
  'standard-api': 'Standard API',
  openrouter: 'OpenRouter',
  'claude-cli': 'Claude CLI',
  'codex-cli': 'Codex CLI',
};

function getPrimaryProviderForQuality(): string {
  return ConfigService.getAgentConfig('agent_primary').provider || 'openrouter';
}

function describeQualityCompareProfile(profile: QualityCompareProfile, primaryProvider = getPrimaryProviderForQuality()): string {
  if (profile.route === 'standard-api') {
    return `${QUALITY_COMPARE_ROUTE_LABELS[profile.route]} · ${primaryProvider}`;
  }
  return QUALITY_COMPARE_ROUTE_LABELS[profile.route];
}

function getQualityCompareProfileStatus(
  profile: QualityCompareProfile,
  cliStatus: DevAgentCliStatus | null,
  primaryProvider = getPrimaryProviderForQuality(),
): QualityCompareProfileStatus {
  const model = profile.model.trim();
  const label = describeQualityCompareProfile(profile, primaryProvider);

  if (!model) {
    return { ready: false, label, reason: 'Select or enter a model first.' };
  }

  if (profile.route === 'standard-api') {
    const key = ConfigService.getKeyForAgent('primary');
    return key
      ? { ready: true, label }
      : { ready: false, label, reason: `Add a ${primaryProvider} key in Settings → Providers.` };
  }

  if (profile.route === 'openrouter') {
    const key = ConfigService.getProviderKey('openrouter') || ConfigService.getApiKey();
    return key
      ? { ready: true, label }
      : { ready: false, label, reason: 'Add an OpenRouter key in Settings → Providers.' };
  }

  const cliKey = profile.route === 'codex-cli' ? 'codex' : 'claude';
  const cli = cliStatus?.[cliKey];
  return cli?.available
    ? { ready: true, label }
    : { ready: false, label, reason: cli?.reason || `${label} is not available on this machine.` };
}

function buildQualityCompareRouteOverrides(
  profile: QualityCompareProfile,
  primaryProvider = getPrimaryProviderForQuality(),
): Partial<Record<'spec' | 'primary' | 'build' | 'fix' | 'qa', {
  modelId: string;
  apiKey: string;
  endpoint: string;
  provider: string;
}>> {
  const modelId = profile.model.trim();
  if (!modelId) {
    throw new Error('Compare profile model is required.');
  }

  if (profile.route === 'standard-api') {
    const apiKey = ConfigService.getKeyForAgent('primary');
    if (!apiKey) throw new Error(`API key missing for ${primaryProvider}.`);
    const endpoint = Orchestrator.getEndpoint(primaryProvider);
    const route = { modelId, apiKey, endpoint, provider: primaryProvider };
    return { spec: route, primary: route, build: route, fix: route, qa: route };
  }

  if (profile.route === 'openrouter') {
    const apiKey = ConfigService.getProviderKey('openrouter') || ConfigService.getApiKey();
    if (!apiKey) throw new Error('OpenRouter key missing.');
    const route = {
      modelId,
      apiKey,
      endpoint: Orchestrator.getEndpoint('openrouter'),
      provider: 'openrouter',
    };
    return { spec: route, primary: route, build: route, fix: route, qa: route };
  }

  const route = {
    modelId,
    apiKey: '',
    endpoint: '/api/quality/llm-run',
    provider: profile.route,
  };
  return { spec: route, primary: route, build: route, fix: route, qa: route };
}

function areQualityCompareProfilesEqual(left: QualityCompareProfile, right: QualityCompareProfile): boolean {
  return left.route === right.route && left.model.trim() === right.model.trim();
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
    STEP_DEFS.forEach(def => localStorage.removeItem(LS_TEST_KEY(def.id)));
    localStorage.removeItem(LS_LAST_RUN_KEY);
  } catch { /* ignore */ }
}

// ── API helper ─────────────────────────────────────────────────────────────────

async function callTestApi(testId: string, buildId?: string): Promise<TestApiResult> {
  const url = buildId
    ? `/api/quality/test/${testId}?buildId=${encodeURIComponent(buildId)}`
    : `/api/quality/test/${testId}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    return { status: 'fail', duration_ms: 0, error: `HTTP ${resp.status}: ${text}` };
  }
  return (await resp.json()) as TestApiResult;
}

// ── Architect Real — direct LLM call (standard/openrouter) + local CLI proxy ───

const QUALITY_ARCHITECT_SYSTEM_PROMPT = `You are an app architect. Return a JSON object — no markdown fences, no extra text.
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

const QUALITY_ARCHITECT_USER_PROMPT = 'Трекер привычек: ежедневные отметки, стрик, статистика';

interface ArchitectCompletionMeta {
  content: string;
  usageRaw?: Record<string, unknown>;
  llmModel: string;
  finishReason: string | null;
}

export interface ArchitectRunnerProfile {
  route: QualityCompareRoute;
  model?: string;
}

interface ArchitectExecutionConfig {
  provider: string;
  apiKey: string;
  endpoint: string;
  model: string;
  routeLabel: string;
}

function stripJsonMarkdownFences(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

function tryParseJsonObject(raw: string): Record<string, unknown> | null {
  const parseCandidate = (candidate: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      const repairedWhitespaceEscapes = candidate.replace(/\\(?=[ \t])/g, '');
      if (repairedWhitespaceEscapes === candidate) return null;
      try {
        const parsed = JSON.parse(repairedWhitespaceEscapes) as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? parsed as Record<string, unknown>
          : null;
      } catch {
        return null;
      }
    }
  };

  const trimmed = stripJsonMarkdownFences(raw);
  const direct = parseCandidate(trimmed);
  if (direct) return direct;

  const start = trimmed.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return parseCandidate(trimmed.slice(start, i + 1));
      }
    }
  }

  return null;
}

export function extractArchitectCompletionMeta(raw: unknown, fallbackModel: string): ArchitectCompletionMeta {
  const data = raw as Record<string, unknown> | null | undefined;
  const choices = Array.isArray(data?.choices) ? data.choices as Array<Record<string, unknown>> : [];
  const firstChoice = choices[0] ?? null;

  if (firstChoice) {
    const message = (firstChoice.message ?? null) as Record<string, unknown> | null;
    const messageContent = message?.content;
    const content = typeof messageContent === 'string'
      ? messageContent
      : Array.isArray(messageContent)
        ? messageContent
            .map(part => {
              if (typeof part === 'string') return part;
              const block = part as Record<string, unknown>;
              return typeof block.text === 'string' ? block.text : '';
            })
            .join('\n')
        : '';
    return {
      content,
      usageRaw: typeof data?.usage === 'object' && data?.usage !== null ? data.usage as Record<string, unknown> : undefined,
      llmModel: typeof data?.model === 'string' ? data.model : fallbackModel,
      finishReason: typeof firstChoice.finish_reason === 'string' ? firstChoice.finish_reason : null,
    };
  }

  const contentBlocks = Array.isArray(data?.content) ? data.content as Array<Record<string, unknown>> : [];
  if (contentBlocks.length > 0) {
    return {
      content: contentBlocks
        .map(block => typeof block.text === 'string' ? block.text : '')
        .filter(Boolean)
        .join('\n'),
      usageRaw: typeof data?.usage === 'object' && data?.usage !== null ? data.usage as Record<string, unknown> : undefined,
      llmModel: typeof data?.model === 'string' ? data.model : fallbackModel,
      finishReason: typeof data?.stop_reason === 'string' ? data.stop_reason : null,
    };
  }

  return {
    content: typeof data?.output_text === 'string' ? data.output_text : '',
    usageRaw: typeof data?.usage === 'object' && data?.usage !== null ? data.usage as Record<string, unknown> : undefined,
    llmModel: typeof data?.model === 'string' ? data.model : fallbackModel,
    finishReason: typeof data?.finish_reason === 'string' ? data.finish_reason : null,
  };
}

function buildArchitectRepairPrompt(input: {
  originalPrompt: string;
  brokenContent: string;
  blockers?: string[];
}): string {
  return [
    `Original brief: ${input.originalPrompt}`,
    'Your previous architect output was invalid, incomplete, or truncated.',
    'Return one complete valid JSON object only. No markdown fences. No commentary.',
    'If needed, restart from scratch, but obey the exact schema and minimum 5 delta files rule.',
    input.blockers && input.blockers.length > 0
      ? `Previous blockers: ${input.blockers.join(' | ')}`
      : null,
    'Previous malformed output:',
    input.brokenContent.slice(0, 4000),
  ].filter(Boolean).join('\n\n');
}

function shouldRetryArchitectAttempt(input: {
  plan: Record<string, unknown> | null;
  finishReason: string | null;
  blockers: string[];
}): boolean {
  if (!input.plan) return true;
  if (input.finishReason === 'length' || input.finishReason === 'max_tokens') return true;
  return input.blockers.some(blocker =>
    /too small|missing|too shallow|need multiple real screens|skeleton-aware enough/i.test(blocker),
  );
}

function resolveArchitectExecutionConfig(profile?: ArchitectRunnerProfile): ArchitectExecutionConfig {
  const route = profile?.route ?? 'standard-api';
  const requestedModel = profile?.model?.trim() || ConfigService.resolveModel('primary');

  if (!requestedModel) {
    throw new Error('Model not configured for quality compare. Open Settings → Agents or enter a model in Compare.');
  }

  if (route === 'standard-api') {
    const apiKey = ConfigService.getKeyForAgent('primary');
    if (!apiKey) throw new Error('API key missing for primary slot. Open Settings → Providers.');
    const provider = getPrimaryProviderForQuality();
    const endpoint = Orchestrator.getEndpoint(provider);
    return {
      provider,
      apiKey,
      endpoint,
      model: Orchestrator.normalizeModelId(requestedModel, endpoint),
      routeLabel: describeQualityCompareProfile({ route, model: requestedModel }, provider),
    };
  }

  if (route === 'openrouter') {
    const apiKey = ConfigService.getProviderKey('openrouter') || ConfigService.getApiKey();
    if (!apiKey) throw new Error('OpenRouter API key missing. Open Settings → Providers.');
    const endpoint = Orchestrator.getEndpoint('openrouter');
    return {
      provider: 'openrouter',
      apiKey,
      endpoint,
      model: Orchestrator.normalizeModelId(requestedModel, endpoint),
      routeLabel: QUALITY_COMPARE_ROUTE_LABELS.openrouter,
    };
  }

  return {
    provider: route,
    apiKey: '',
    endpoint: '/api/quality/llm-run',
    model: requestedModel,
    routeLabel: QUALITY_COMPARE_ROUTE_LABELS[route],
  };
}

async function requestArchitectCompletion(input: {
  provider: string;
  apiKey: string;
  endpoint: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
}): Promise<ArchitectCompletionMeta> {
  let resp: Response;

  if (input.provider === 'anthropic' || input.endpoint.includes('api.anthropic.com')) {
    resp = await fetch(input.endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': input.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.model,
        system: input.systemPrompt,
        messages: [{ role: 'user', content: input.userPrompt }],
        temperature: 0.2,
        max_tokens: input.maxTokens,
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } else if (input.provider === 'claude-cli' || input.provider === 'codex-cli') {
    resp = await fetch(input.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: input.provider === 'codex-cli' ? 'codex' : 'claude',
        model: input.model,
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } else if (input.provider === 'claude-bridge' || /\/chat$/i.test(input.endpoint)) {
    resp = await fetch(input.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `[System]\n${input.systemPrompt}\n\n[User]\n${input.userPrompt}`,
        model: input.model || 'claude-sonnet-4-6',
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } else {
    resp = await fetch(input.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'AIC-RG Studio',
      },
      body: JSON.stringify({
        model: input.model,
        messages: [
          { role: 'system', content: input.systemPrompt },
          { role: 'user', content: input.userPrompt },
        ],
        stream: false,
        temperature: 0.2,
        max_tokens: input.maxTokens,
      }),
      signal: AbortSignal.timeout(60_000),
    });
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`LLM ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const raw = await resp.json() as unknown;
  return extractArchitectCompletionMeta(raw, input.model);
}

export async function runArchitectRealTest(profile?: ArchitectRunnerProfile): Promise<TestApiResult> {
  const t0 = Date.now();
  const ms = () => Date.now() - t0;

  let config: ArchitectExecutionConfig;
  try {
    config = resolveArchitectExecutionConfig(profile);
  } catch (err: unknown) {
    return { status: 'fail', duration_ms: ms(), error: err instanceof Error ? err.message : String(err) };
  }

  let completion: ArchitectCompletionMeta;
  try {
    completion = await requestArchitectCompletion({
      provider: config.provider,
      apiKey: config.apiKey,
      endpoint: config.endpoint,
      model: config.model,
      systemPrompt: QUALITY_ARCHITECT_SYSTEM_PROMPT,
      userPrompt: QUALITY_ARCHITECT_USER_PROMPT,
      maxTokens: 1800,
    });
  } catch (err: unknown) {
    return { status: 'fail', duration_ms: ms(), error: err instanceof Error ? err.message : String(err) };
  }

  let repairAttempted = false;

  const validatePlan = (plan: Record<string, unknown>) => {
    const fileTree = (plan.fileTree ?? {}) as Record<string, string>;
    const planTruth = analyzeArchitectPlanTruth({
      appName: String(plan.appName ?? ''),
      skeleton: String(plan.skeleton ?? ''),
      summary: typeof plan.summary === 'string' ? plan.summary : '',
      fileTree,
      contextContract: typeof plan.contextContract === 'string' ? plan.contextContract : undefined,
      dataModel: typeof plan.dataModel === 'string' ? plan.dataModel : undefined,
      pages: Array.isArray(plan.pages) ? plan.pages as Array<{ path?: string; name?: string; file?: string; purpose?: string }> : undefined,
      minDeltaFiles: 5,
      forbiddenPaths: [
        'src/App.tsx',
        'src/main.tsx',
        'src/context/AppContext.tsx',
        'src/hooks/useLocalStorage.ts',
        'src/hooks/useTheme.ts',
        'src/config/theme.ts',
        'src/config/routes.ts',
        'src/components/BottomTabs.tsx',
        'src/components/ErrorBoundary.tsx',
        'src/components/LoadingScreen.tsx',
        'src/components/EmptyState.tsx',
        'src/components/PaywallSheet.tsx',
        'src/lib/cn.ts',
      ],
    });
    return { fileTree, planTruth };
  };

  let plan = tryParseJsonObject(completion.content);
  let validation = plan ? validatePlan(plan) : null;

  if (shouldRetryArchitectAttempt({
    plan,
    finishReason: completion.finishReason,
    blockers: validation?.planTruth.blockers ?? [],
  })) {
    repairAttempted = true;
    try {
      const repaired = await requestArchitectCompletion({
        provider: config.provider,
        apiKey: config.apiKey,
        endpoint: config.endpoint,
        model: config.model,
        systemPrompt: QUALITY_ARCHITECT_SYSTEM_PROMPT,
        userPrompt: buildArchitectRepairPrompt({
          originalPrompt: QUALITY_ARCHITECT_USER_PROMPT,
          brokenContent: completion.content,
          blockers: validation?.planTruth.blockers ?? [],
        }),
        maxTokens: 2600,
      });
      const repairedPlan = tryParseJsonObject(repaired.content);
      const repairedValidation = repairedPlan ? validatePlan(repairedPlan) : null;
      if (repairedPlan && repairedValidation?.planTruth.passed) {
        completion = repaired;
        plan = repairedPlan;
        validation = repairedValidation;
      } else if (!plan || !validation?.planTruth.passed) {
        completion = repaired;
        plan = repairedPlan;
        validation = repairedValidation;
      }
    } catch {
      // Keep the first attempt diagnostics if retry also fails at the transport layer.
    }
  }

  if (!plan) {
    const truncatedHint = completion.finishReason === 'length' || completion.finishReason === 'max_tokens'
      ? 'Response was truncated before the JSON object completed.'
      : 'The model did not return a valid JSON object.';
    return {
      status: 'fail',
      duration_ms: ms(),
      error: `${truncatedHint} Raw excerpt: ${completion.content.slice(0, 200)}`,
      details: {
        prompt: QUALITY_ARCHITECT_USER_PROMPT,
        rawResponse: completion.content,
        finishReason: completion.finishReason,
        routeLabel: config.routeLabel,
        repairAttempted,
      },
    };
  }

  if (!validation?.planTruth.passed) {
    return {
      status: 'fail',
      duration_ms: ms(),
      error: validation?.planTruth.blockers.join(' ') || 'Architect plan failed validation.',
      details: {
        prompt: QUALITY_ARCHITECT_USER_PROMPT,
        rawResponse: completion.content,
        finishReason: completion.finishReason,
        routeLabel: config.routeLabel,
        repairAttempted,
      },
    };
  }
  const fileCount = Object.keys(validation.fileTree).length;
  const usageRaw = completion.usageRaw;
  const llmModel = completion.llmModel;

  const promptTokens: number = typeof usageRaw?.prompt_tokens === 'number'
    ? usageRaw.prompt_tokens as number
    : typeof usageRaw?.input_tokens === 'number'
      ? usageRaw.input_tokens as number
      : 0;
  const completionTokens: number = typeof usageRaw?.completion_tokens === 'number'
    ? usageRaw.completion_tokens as number
    : typeof usageRaw?.output_tokens === 'number'
      ? usageRaw.output_tokens as number
      : 0;
  const totalTokens: number = typeof usageRaw?.total_tokens === 'number'
    ? usageRaw.total_tokens as number
    : promptTokens + completionTokens;
  const costUsd: number | undefined =
    typeof usageRaw?.cost_usd === 'number' ? usageRaw.cost_usd as number :
    typeof usageRaw?.total_cost === 'number' ? usageRaw.total_cost as number :
    typeof usageRaw?.cost === 'number' ? usageRaw.cost as number :
    undefined;

  return {
    status: 'pass',
    duration_ms: ms(),
    summary: `${fileCount} файлов · реальный LLM output`,
    llm: { model: llmModel, prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens, cost_usd: costUsd },
    output: { file_count: fileCount, files: Object.keys(validation.fileTree) },
    details: {
      appName:         String(plan.appName ?? ''),
      skeleton:        String(plan.skeleton ?? ''),
      fileTree:        validation.fileTree,
      contextContract: typeof plan.contextContract === 'string' ? plan.contextContract : undefined,
      dataModel:       typeof plan.dataModel === 'string' ? plan.dataModel : undefined,
      model:           llmModel,
      fileCount,
      prompt:          QUALITY_ARCHITECT_USER_PROMPT,
      rawResponse:     completion.content,
      finishReason:    completion.finishReason,
      routeLabel:      config.routeLabel,
      repairAttempted,
    } as unknown as Record<string, unknown>,
  };
}

// ── ZIP download helper ────────────────────────────────────────────────────────

export async function downloadSourceZip(
  files: Array<{ path: string; content: string }>,
  filename: string,
): Promise<void> {
  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.path, f.content);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function downloadFixtureZip(files: CodeDeltaFile[]): Promise<void> {
  await downloadSourceZip(files, 'real-delta-code.zip');
}

export async function downloadQualityCompareSourceZip(
  files: Array<{ path: string; content: string }>,
  filename: string,
): Promise<void> {
  await downloadSourceZip(files, filename);
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
  if (cost === 0) return '$0.000000';
  if (cost < 0.001) return `~$${cost.toFixed(6)}`;
  if (cost < 0.01)  return `~$${cost.toFixed(4)}`;
  if (cost < 1)     return `~$${cost.toFixed(2)}`;
  return `~$${cost.toFixed(1)}`;
}

const QUALITY_COMPARE_FALLBACK_PRICING_PER_MILLION: Record<string, { input: number; output: number }> = {
  'anthropic/claude-3.5-sonnet':         { input: 3.00, output: 15.00 },
  'anthropic/claude-sonnet-4-5':         { input: 3.00, output: 15.00 },
  'anthropic/claude-sonnet-4-6':         { input: 3.00, output: 15.00 },
  'anthropic/claude-3-opus':             { input: 15.00, output: 75.00 },
  'anthropic/claude-opus-4-6':           { input: 15.00, output: 75.00 },
  'anthropic/claude-3.5-haiku':          { input: 0.80, output: 4.00 },
  'anthropic/claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'openai/gpt-4o':                       { input: 2.50, output: 10.00 },
  'openai/gpt-4o-mini':                  { input: 0.15, output: 0.60 },
  'openai/o1-preview':                   { input: 15.00, output: 60.00 },
  'openai/o1-mini':                      { input: 3.00, output: 12.00 },
  'openai/o3-mini':                      { input: 1.10, output: 4.40 },
  'google/gemini-2.0-pro-exp-02-05:free':{ input: 0.00, output: 0.00 },
  'google/gemini-2.0-flash-001':         { input: 0.10, output: 0.40 },
  'deepseek/deepseek-r1':                { input: 0.55, output: 2.19 },
  'deepseek/deepseek-chat':              { input: 0.14, output: 0.28 },
  'deepseek/deepseek-v3':                { input: 0.14, output: 0.28 },
  'meta-llama/llama-3.3-70b-instruct':   { input: 0.59, output: 0.79 },
  'meta-llama/llama-3.1-8b-instruct:free': { input: 0.00, output: 0.00 },
  'mistralai/mistral-large':             { input: 2.00, output: 6.00 },
  'qwen/qwen-2.5-coder-32b-instruct':    { input: 0.07, output: 0.16 },
  'claude-sonnet-4-6':                   { input: 3.00, output: 15.00 },
  'gpt-5.1-codex':                       { input: 1.50, output: 6.00 },
};

function normalizePricingLookupKey(modelId: string): string {
  return modelId.trim().toLowerCase();
}

function resolveComparePricing(
  modelId: string,
  openRouterModels: Model[],
): { promptPerToken: number; completionPerToken: number } | undefined {
  const normalized = normalizePricingLookupKey(modelId);
  const fromCatalog = openRouterModels.find(model => {
    const id = normalizePricingLookupKey(model.id);
    if (id === normalized) return true;
    if (id.endsWith(`/${normalized}`)) return true;
    if (normalized.endsWith(`/${id}`)) return true;
    return false;
  });
  if (fromCatalog?.pricing) {
    return {
      promptPerToken: parseFloat(fromCatalog.pricing.prompt) || 0,
      completionPerToken: parseFloat(fromCatalog.pricing.completion) || 0,
    };
  }
  const fallback = QUALITY_COMPARE_FALLBACK_PRICING_PER_MILLION[normalized];
  if (!fallback) return undefined;
  return {
    promptPerToken: fallback.input / 1_000_000,
    completionPerToken: fallback.output / 1_000_000,
  };
}

async function fetchQualityWorkspaceSnapshot(): Promise<QualityWorkspaceSnapshot> {
  const resp = await fetch('/api/quality/workspace-snapshot');
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(`workspace snapshot ${resp.status}: ${text}`);
  }
  return await resp.json() as QualityWorkspaceSnapshot;
}

function buildCompareSourceFiles(snapshot: QualityWorkspaceSnapshot): QualityCompareSourceFile[] {
  const deltaPathSet = new Set(Object.keys(snapshot.deltaFiles));
  return Object.entries(snapshot.workspaceFiles)
    .map(([path, content]) => ({
      path,
      content,
      size: new Blob([content]).size,
      origin: deltaPathSet.has(path) ? 'delta' as const : 'skeleton' as const,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function buildCompareCodeSections(snapshot: QualityWorkspaceSnapshot): QualityRealTextSection[] {
  return buildCompareSourceFiles(snapshot)
    .filter(file => file.origin === 'delta')
    .slice(0, 3)
    .map(file => ({
      id: `code:${file.path}`,
      label: file.path,
      content: file.content.slice(0, 1800),
    }));
}

function sumCompareSuiteMetrics(
  steps: Array<{ llm?: TestLlmMetrics }>,
  pricing: { promptPerToken: number; completionPerToken: number } | undefined,
  generationMs: number,
): QualityCompareRunMetrics {
  const total = steps.reduce((acc, step) => {
    if (!step.llm) return acc;
    acc.prompt_tokens += step.llm.prompt_tokens;
    acc.completion_tokens += step.llm.completion_tokens;
    acc.total_tokens += step.llm.total_tokens;
    if (typeof step.llm.cost_usd === 'number') {
      acc.cost_usd = (acc.cost_usd ?? 0) + step.llm.cost_usd;
    }
    return acc;
  }, {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    cost_usd: undefined as number | undefined,
  });
  const estimatedCost = total.cost_usd === undefined && pricing
    ? (total.prompt_tokens * pricing.promptPerToken) + (total.completion_tokens * pricing.completionPerToken)
    : undefined;
  return {
    generation_ms: generationMs,
    prompt_tokens: total.prompt_tokens,
    completion_tokens: total.completion_tokens,
    total_tokens: total.total_tokens,
    cost_usd: total.cost_usd ?? estimatedCost,
    costEstimated: total.cost_usd === undefined && estimatedCost !== undefined,
  };
}

export async function runQualityCompareSuite(input: {
  profile: QualityCompareProfile;
  cliStatus: DevAgentCliStatus | null;
  primaryProvider?: string;
  openRouterModels?: Model[];
  comparePrompt?: string;
  pipelineRun?: typeof ProtoPipeline.run;
  fetchWorkspaceSnapshot?: () => Promise<QualityWorkspaceSnapshot>;
  testApiRunner?: (testId: StepId, buildId?: string) => Promise<TestApiResult>;
}): Promise<QualityCompareRunSide> {
  const {
    profile,
    cliStatus,
    primaryProvider = getPrimaryProviderForQuality(),
    openRouterModels = [],
    comparePrompt = QUALITY_ARCHITECT_USER_PROMPT,
    pipelineRun = ProtoPipeline.run,
    fetchWorkspaceSnapshot = fetchQualityWorkspaceSnapshot,
    testApiRunner = callTestApi,
  } = input;

  const status = getQualityCompareProfileStatus(profile, cliStatus, primaryProvider);
  const pricing = resolveComparePricing(profile.model.trim(), openRouterModels);

  const makeCompareFailureResult = (error: string, duration_ms = 0): TestApiResult => ({
    status: 'fail',
    duration_ms,
    error,
  });

  const buildFailureMap = (error: string, duration_ms = 0): Record<StepId, TestApiResult> =>
    Object.fromEntries(
      STEP_DEFS.map(def => [def.id as StepId, makeCompareFailureResult(error, duration_ms)]),
    ) as Record<StepId, TestApiResult>;

  if (!status.ready) {
    const result = makeCompareFailureResult(status.reason || 'Compare profile is not ready.');
    return {
      profile,
      status,
      result,
      realText: [],
      pricing,
      suite: {
        buildId: 'compare-not-ready',
        prompt: comparePrompt,
        skeletonId: null,
        sourceFiles: [],
        codeSections: [],
        metrics: {
          generation_ms: 0,
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
        tests: buildFailureMap(result.error || 'Compare profile is not ready.'),
      },
    };
  }

  const buildId = `qcmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const startedAt = Date.now();

  const pipelineResult = await pipelineRun({
    prompt: comparePrompt,
    skeletonId: 'mobile-app',
    buildId,
    routeOverrides: buildQualityCompareRouteOverrides(profile, primaryProvider),
    onStep: () => {},
    onLog: () => {},
    onCoderStream: () => {},
  });

  const llmSteps = Object.values(pipelineResult.stepResults ?? {})
    .filter((step): step is NonNullable<typeof step> => Boolean(step))
    .filter(step => Boolean(step.llm))
    .map(step => ({ llm: step.llm as TestLlmMetrics }));
  const generationMs = Date.now() - startedAt;
  const metrics = sumCompareSuiteMetrics(llmSteps, pricing, generationMs);

  if (!pipelineResult.success) {
    const error = pipelineResult.error ?? 'Compare generation failed.';
    return {
      profile,
      status,
      result: makeCompareFailureResult(error, generationMs),
      realText: [],
      pricing,
      suite: {
        buildId,
        prompt: comparePrompt,
        skeletonId: 'mobile-app',
        sourceFiles: [],
        codeSections: [],
        metrics,
        tests: buildFailureMap(error, generationMs),
      },
    };
  }

  const runTestSafe = async (testId: StepId, buildIdParam?: string): Promise<TestApiResult> => {
    try {
      return await testApiRunner(testId, buildIdParam);
    } catch (err: unknown) {
      return makeCompareFailureResult(err instanceof Error ? err.message : String(err));
    }
  };

  const workspace = await fetchWorkspaceSnapshot();
  const sourceFiles = buildCompareSourceFiles(workspace);
  const codeSections = buildCompareCodeSections(workspace);
  const totalDeltaBytes = Object.values(workspace.deltaFiles).reduce((sum, content) => sum + new Blob([content]).size, 0);
  const blockersText = workspace.outputTruth.blockers.map(blocker => blocker.message).join(' | ');
  const architectStepDuration = pipelineResult.runTelemetry?.steps.find(step => step.id === 'architect')?.durationMs ?? 0;
  const buildStepDuration = pipelineResult.runTelemetry?.steps.find(step => step.id === 'build')?.durationMs ?? generationMs;
  const skeletonFiles = Object.fromEntries(
    (pipelineResult.runTelemetry?.skeletonFiles ?? [])
      .map(filePath => [filePath, 'Provided by selected skeleton base.'] as const),
  );

  const ideaValidateResult: TestApiResult = {
    status: 'pass',
    duration_ms: 0,
    summary: `${comparePrompt.trim().length} chars OK`,
    details: {
      prompt: comparePrompt,
      length: comparePrompt.trim().length,
      valid: true,
    },
  };

  const architectureResult: TestApiResult = {
    status: 'pass',
    duration_ms: architectStepDuration,
    summary: `skeleton: ${pipelineResult.plan?.skeleton ?? workspace.skeletonId ?? 'mobile-app'}, ${Object.keys(skeletonFiles).length} provided + ${Object.keys(pipelineResult.plan?.fileTree ?? {}).length} delta`,
    llm: pipelineResult.stepResults?.architect?.llm,
    output: {
      file_count: Object.keys(skeletonFiles).length + Object.keys(pipelineResult.plan?.fileTree ?? {}).length,
      files: [
        ...Object.keys(skeletonFiles),
        ...Object.keys(pipelineResult.plan?.fileTree ?? {}),
      ],
    },
    details: {
      appName: pipelineResult.plan?.appName ?? 'App',
      skeleton: pipelineResult.plan?.skeleton ?? workspace.skeletonId ?? 'mobile-app',
      skeletonFiles,
      fileTree: pipelineResult.plan?.fileTree ?? {},
      contextContract: pipelineResult.plan?.contextContract,
      dataModel: pipelineResult.plan?.dataModel,
    },
  };

  const architectRealResult: TestApiResult = {
    status: 'pass',
    duration_ms: architectStepDuration,
    summary: `${Object.keys(pipelineResult.plan?.fileTree ?? {}).length} файлов · полный dual-run`,
    llm: pipelineResult.stepResults?.architect?.llm,
    output: {
      file_count: Object.keys(pipelineResult.plan?.fileTree ?? {}).length,
      files: Object.keys(pipelineResult.plan?.fileTree ?? {}),
    },
    details: {
      appName: pipelineResult.plan?.appName ?? 'App',
      skeleton: pipelineResult.plan?.skeleton ?? workspace.skeletonId ?? 'mobile-app',
      fileTree: pipelineResult.plan?.fileTree ?? {},
      contextContract: pipelineResult.plan?.contextContract,
      dataModel: pipelineResult.plan?.dataModel,
      model: pipelineResult.stepResults?.architect?.llm?.model ?? profile.model,
      fileCount: Object.keys(pipelineResult.plan?.fileTree ?? {}).length,
      prompt: comparePrompt,
      rawResponse: pipelineResult.plan?.rawResponse,
      routeLabel: status.label,
    },
  };

  const codeDeltaFiles = Object.entries(workspace.deltaFiles).map(([filePath, content]) => ({
    path: filePath,
    size: new Blob([content]).size,
    content,
  }));
  const codeDeltaResult: TestApiResult = workspace.outputTruth.passed
    ? {
        status: 'pass',
        duration_ms: buildStepDuration,
        summary: `${codeDeltaFiles.length} delta files · ${sourceFiles.length} total with skeleton`,
        output: {
          file_count: codeDeltaFiles.length,
          total_bytes: totalDeltaBytes,
          files: codeDeltaFiles.map(file => file.path),
        },
        details: {
          buildId: pipelineResult.buildId,
          files: codeDeltaFiles,
          structure: workspace.outputTruth.structure,
          skeletonDelta: workspace.outputTruth.skeletonDelta,
        },
      }
    : {
        status: 'fail',
        duration_ms: generationMs,
        error: blockersText || 'Output truth contract failed.',
        details: {
          buildId: pipelineResult.buildId,
          files: codeDeltaFiles,
          structure: workspace.outputTruth.structure,
          skeletonDelta: workspace.outputTruth.skeletonDelta,
        },
      };

  const tests: Record<StepId, TestApiResult> = {
    canary: await runTestSafe('canary'),
    'idea-validate': ideaValidateResult,
    architecture: architectureResult,
    'code-delta': codeDeltaResult,
    compile: await runTestSafe('compile', pipelineResult.buildId),
    'preview-http': await runTestSafe('preview-http', pipelineResult.buildId),
    'preview-mounted': await runTestSafe('preview-mounted'),
    'save-ready': await runTestSafe('save-ready', pipelineResult.buildId),
    'no-premature-save': await runTestSafe('no-premature-save'),
    'architect-real': architectRealResult,
  };

  return {
    profile,
    status,
    result: tests['architect-real'],
    realText: buildQualityRealTextSections('architect-real', architectRealResult.details ?? {}),
    pricing,
    suite: {
      buildId: pipelineResult.buildId,
      previewUrl: pipelineResult.url,
      prompt: comparePrompt,
      skeletonId: workspace.skeletonId,
      workspace,
      sourceFiles,
      codeSections,
      metrics,
      tests,
    },
  };
}

function buildTestMetaLines(state: TestState): Array<{ key: string; text: string; color?: string }> {
  const lines: Array<{ key: string; text: string; color?: string }> = [];
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

// ── Initial state factories ────────────────────────────────────────────────────

function makeInitStates(): Record<StepId, TestState> {
  return Object.fromEntries(
    STEP_DEFS.map(d => [d.id, { status: 'idle', duration_ms: 0 }])
  ) as Record<StepId, TestState>;
}

function makeInitExpanded(): Record<StepId, boolean> {
  return Object.fromEntries(STEP_DEFS.map(d => [d.id, false])) as Record<StepId, boolean>;
}

type Verdict = 'PASS' | 'PARTIAL' | 'FAIL' | null;

interface QualityBucketSummary {
  total: number;
  passCount: number;
  failCount: number;
  idleCount: number;
  verdict: Verdict;
  failedIds: StepId[];
}

function summarizeQualityBucket(
  states: Record<StepId, TestState>,
  ids: StepId[],
): QualityBucketSummary {
  const bucketStates = ids.map(id => ({ id, state: states[id] }));
  const passCount = bucketStates.filter(entry => entry.state.status === 'pass').length;
  const failCount = bucketStates.filter(entry => entry.state.status === 'fail').length;
  const idleCount = bucketStates.filter(entry => entry.state.status === 'idle').length;
  const verdict: Verdict =
    failCount === 0 && passCount === ids.length ? 'PASS' :
    failCount > 0 && passCount > 0 ? 'PARTIAL' :
    failCount > 0 ? 'FAIL' :
    null;
  return {
    total: ids.length,
    passCount,
    failCount,
    idleCount,
    verdict,
    failedIds: bucketStates
      .filter(entry => entry.state.status === 'fail')
      .map(entry => entry.id),
  };
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

function StructureProof({
  structure,
  skeletonDelta,
}: {
  structure?: OutputStructureContractSummary;
  skeletonDelta?: OutputSkeletonDeltaSummary;
}) {
  if (!structure && !skeletonDelta) return null;

  const tone = structure?.richness === 'rich' ? '#4ade80' : structure?.richness === 'adequate' ? '#fbbf24' : '#f87171';
  const buckets = (structure?.buckets ?? [])
    .filter(bucket => bucket.totalCount > 0 || bucket.deltaCount > 0)
    .slice(0, 6);

  return (
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      {structure && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: tone, textTransform: 'uppercase' }}>
              {structure.richness}
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.62)' }}>{structure.summary}</span>
          </div>
          {(structure.missingOutputClasses.length > 0 || structure.missingDeltaClasses.length > 0) && (
            <div style={{ fontSize: 10, color: '#fbbf24', marginBottom: 6 }}>
              {[
                structure.missingOutputClasses.length > 0 ? `missing output: ${structure.missingOutputClasses.join(', ')}` : null,
                structure.missingDeltaClasses.length > 0 ? `missing delta: ${structure.missingDeltaClasses.join(', ')}` : null,
              ].filter(Boolean).join(' · ')}
            </div>
          )}
        </>
      )}

      {skeletonDelta && (
        <div style={{ marginBottom: 8, fontSize: 10, color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace' }}>
          skeleton {skeletonDelta.skeletonFileCount} · delta {skeletonDelta.deltaFileCount} · modified base {skeletonDelta.modifiedExistingCount} · new {skeletonDelta.newFileCount}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {buckets.map(bucket => (
          <div key={bucket.id} style={{ paddingLeft: 12 }}>
            <div style={{ fontSize: 11, color: '#60a5fa', fontFamily: 'monospace' }}>
              {bucket.label} — total {bucket.totalCount} · delta {bucket.deltaCount}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', marginTop: 2 }}>
              {bucket.meaning}
            </div>
            {bucket.keyPaths.length > 0 && (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.48)', fontFamily: 'monospace', marginTop: 2 }}>
                {bucket.keyPaths.join(' · ')}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function buildStructureProofText(
  structure?: OutputStructureContractSummary,
  skeletonDelta?: OutputSkeletonDeltaSummary,
): string {
  const lines: string[] = [];
  if (structure) {
    lines.push(`richness: ${structure.richness}`);
    lines.push(structure.summary);
    if (structure.missingOutputClasses.length > 0) {
      lines.push(`missing output classes: ${structure.missingOutputClasses.join(', ')}`);
    }
    if (structure.missingDeltaClasses.length > 0) {
      lines.push(`missing delta classes: ${structure.missingDeltaClasses.join(', ')}`);
    }
    for (const bucket of structure.buckets.filter(bucket => bucket.totalCount > 0 || bucket.deltaCount > 0).slice(0, 8)) {
      lines.push(`${bucket.label}: total ${bucket.totalCount}, delta ${bucket.deltaCount}`);
      if (bucket.keyPaths.length > 0) {
        lines.push(`  ${bucket.keyPaths.join(' | ')}`);
      }
    }
  }
  if (skeletonDelta) {
    lines.push(
      `skeleton ${skeletonDelta.skeletonFileCount} · delta ${skeletonDelta.deltaFileCount} · modified ${skeletonDelta.modifiedExistingCount} · new ${skeletonDelta.newFileCount}`,
    );
    if (skeletonDelta.keyModifiedPaths.length > 0) {
      lines.push(`modified existing: ${skeletonDelta.keyModifiedPaths.join(' | ')}`);
    }
    if (skeletonDelta.keyNewPaths.length > 0) {
      lines.push(`new files: ${skeletonDelta.keyNewPaths.join(' | ')}`);
    }
  }
  return lines.join('\n').trim();
}

export function buildQualityRealTextSections(
  testId: StepId,
  details: Record<string, unknown>,
): QualityRealTextSection[] {
  if (testId === 'canary') {
    const d = details as unknown as CanaryDetails;
    return [
      {
        id: 'response',
        label: 'Health response',
        content: JSON.stringify(d.response ?? {}, null, 2),
      },
      {
        id: 'observed',
        label: 'Observed text',
        content: `HTTP ${d.httpStatus}\nstatus=${d.response?.status ?? '—'}\nprovider=${d.response?.provider ?? '—'}`,
      },
    ];
  }

  if (testId === 'idea-validate') {
    const d = details as unknown as IdeaDetails;
    return [
      {
        id: 'prompt',
        label: 'Validated prompt',
        content: String(d.prompt ?? ''),
      },
    ];
  }

  if (testId === 'architecture') {
    const d = details as unknown as ArchDetails;
    return [
      {
        id: 'skeleton',
        label: 'Skeleton manifest',
        content: Object.entries(d.skeletonFiles ?? {})
          .map(([path, desc]) => `${path}\n  ${desc}`)
          .join('\n\n'),
      },
      {
        id: 'delta',
        label: 'Delta manifest',
        content: Object.entries(d.fileTree ?? {})
          .map(([path, desc]) => `${path}\n  ${desc}`)
          .join('\n\n'),
      },
      {
        id: 'contracts',
        label: 'Contracts',
        content: [
          d.contextContract ? `contextContract:\n${d.contextContract}` : null,
          d.dataModel ? `dataModel:\n${d.dataModel}` : null,
        ].filter(Boolean).join('\n\n'),
      },
    ].filter(section => section.content.trim().length > 0);
  }

  if (testId === 'code-delta') {
    const d = details as unknown as CodeDeltaDetails;
    return [
      ...((d.files ?? []).slice(0, 4).map(file => ({
        id: `file:${file.path}`,
        label: file.path,
        content: file.content.slice(0, 1800),
      }))),
      {
        id: 'structure',
        label: 'Structure proof',
        content: buildStructureProofText(d.structure, d.skeletonDelta),
      },
    ].filter(section => section.content.trim().length > 0);
  }

  if (testId === 'compile') {
    const d = details as unknown as CompileDetails;
    return [
      {
        id: 'assets',
        label: 'Compiled assets',
        content: (d.assets ?? []).map(asset => `${asset.name} (${fmtSize(asset.size)})`).join('\n'),
      },
    ].filter(section => section.content.trim().length > 0);
  }

  if (testId === 'preview-http') {
    const d = details as unknown as PreviewHttpDetails;
    return [
      {
        id: 'html',
        label: 'Preview HTML excerpt',
        content: d.htmlExcerpt ?? `HTTP ${d.httpStatus}\nbytes=${d.contentLength}\nhasRootDiv=${String(d.hasRootDiv)}`,
      },
    ];
  }

  if (testId === 'preview-mounted') {
    const d = details as unknown as PreviewMtdDetails;
    return [{ id: 'mounted', label: 'Matched line', content: d.line }];
  }

  if (testId === 'save-ready') {
    const d = details as unknown as SaveReadyDetails;
    return [
      {
        id: 'save-ready',
        label: 'Save-ready proof',
        content: [
          `buildId=${d.buildId}`,
          `assetsCount=${d.assetsCount}`,
          buildStructureProofText(d.structure, d.skeletonDelta),
        ].filter(Boolean).join('\n\n'),
      },
    ];
  }

  if (testId === 'no-premature-save') {
    const d = details as unknown as NoPremSaveDetails;
    return [
      {
        id: 'sessions',
        label: 'Session audit',
        content: JSON.stringify({
          projectsBeforeSave: d.projectsBeforeSave,
          totalSessions: d.totalSessions,
          correct: d.correct,
        }, null, 2),
      },
    ];
  }

  if (testId === 'architect-real') {
    const d = details as unknown as ArchRealDetails;
    return [
      d.prompt ? { id: 'prompt', label: 'Prompt', content: d.prompt } : null,
      d.rawResponse ? { id: 'raw-response', label: 'Raw model response', content: d.rawResponse } : null,
      {
        id: 'validated-plan',
        label: 'Validated plan',
        content: Object.entries(d.fileTree ?? {})
          .map(([path, desc]) => `${path}\n  ${desc}`)
          .join('\n\n'),
      },
      {
        id: 'contracts',
        label: 'Contracts',
        content: [
          d.routeLabel ? `route: ${d.routeLabel}` : null,
          d.contextContract ? `contextContract:\n${d.contextContract}` : null,
          d.dataModel ? `dataModel:\n${d.dataModel}` : null,
          typeof d.finishReason === 'string' ? `finishReason: ${d.finishReason}` : null,
          d.repairAttempted ? 'repairAttempted: true' : null,
        ].filter(Boolean).join('\n\n'),
      },
    ].filter((section): section is QualityRealTextSection => Boolean(section && section.content.trim().length > 0));
  }

  return [
    {
      id: 'json',
      label: 'Raw details',
      content: JSON.stringify(details, null, 2),
    },
  ];
}

// ── Detail panel ───────────────────────────────────────────────────────────────

function DetailPanel({ testId, details }: { testId: StepId; details: Record<string, unknown> }) {
  const [downloading, setDownloading] = useState(false);
  const [showRealText, setShowRealText] = useState(false);
  const realTextSections = buildQualityRealTextSections(testId, details);

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
      {realTextSections.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button
            onClick={() => setShowRealText(prev => !prev)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid rgba(96,165,250,0.24)',
              background: showRealText ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.03)',
              color: showRealText ? '#93c5fd' : 'rgba(255,255,255,0.65)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <FileText size={11} />
            {showRealText ? 'Hide real text' : 'Show real text'}
          </button>
          {showRealText && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
              {realTextSections.map(section => (
                <div key={section.id} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ padding: '6px 10px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', background: 'rgba(255,255,255,0.03)' }}>
                    {section.label}
                  </div>
                  <pre style={{ margin: 0, padding: '10px 12px', fontSize: 10, lineHeight: 1.5, color: 'rgba(255,255,255,0.78)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace' }}>
                    {section.content}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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
        <StructureProof structure={d.structure} skeletonDelta={d.skeletonDelta} />
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
        <StructureProof structure={d.structure} skeletonDelta={d.skeletonDelta} />
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
  compareEnabled = false, onCompare, compareDisabledReason, compareRunning = false, hasCompareResult = false, comparePanel = null,
}: {
  def: typeof STEP_DEFS[number];
  state: TestState;
  onRun: () => void;
  anyRunning: boolean;
  expanded: boolean;
  onToggle: () => void;
  compareEnabled?: boolean;
  onCompare?: () => void;
  compareDisabledReason?: string | null;
  compareRunning?: boolean;
  hasCompareResult?: boolean;
  comparePanel?: React.ReactNode;
}) {
  const canExpand = state.status === 'pass' && !!state.details;

  const icon =
    state.status === 'pass'    ? <CheckCircle2 size={14} color="#4ade80" /> :
    state.status === 'fail'    ? <XCircle size={14} color="#f87171" /> :
    state.status === 'running' ? <Loader2 size={14} color="#60a5fa" style={{ animation: 'spin 1s linear infinite' }} /> :
    <Circle size={14} color="rgba(255,255,255,0.18)" />;

  const labelColor =
    state.status === 'pass'    ? '#4ade80' :
    state.status === 'fail'    ? '#f87171' :
    state.status === 'running' ? '#60a5fa' :
    'rgba(255,255,255,0.6)';

  const rowBg =
    state.status === 'pass'    ? 'rgba(74,222,128,0.03)'  :
    state.status === 'fail'    ? 'rgba(248,113,113,0.03)' :
    state.status === 'running' ? 'rgba(59,130,246,0.04)'  :
    'transparent';

  const leftBorder =
    state.status === 'pass'    ? '2px solid rgba(74,222,128,0.2)'  :
    state.status === 'fail'    ? '2px solid rgba(248,113,113,0.2)' :
    state.status === 'running' ? '2px solid rgba(96,165,250,0.25)' :
    '2px solid transparent';

  const durText =
    state.status === 'idle'    ? '' :
    state.status === 'running' ? '…' :
    fmtDuration(state.duration_ms);
  const metaLines = state.status === 'running' ? [] : buildTestMetaLines(state);

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
          flex: 1, fontSize: 12, fontWeight: 600, fontFamily: 'monospace',
          color: labelColor, minWidth: 0, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {def.label}
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
        {compareEnabled && (
          <button
            onClick={(e) => { e.stopPropagation(); onCompare?.(); }}
            disabled={anyRunning || compareRunning || Boolean(compareDisabledReason)}
            title={compareDisabledReason ?? (hasCompareResult ? 'Run compare again' : 'Compare this test')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 10px',
              borderRadius: 5,
              flexShrink: 0,
              border: '1px solid rgba(168,85,247,0.2)',
              background: compareRunning
                ? 'rgba(168,85,247,0.12)'
                : hasCompareResult
                  ? 'rgba(168,85,247,0.1)'
                  : 'rgba(255,255,255,0.03)',
              color: anyRunning || compareDisabledReason
                ? 'rgba(255,255,255,0.24)'
                : '#c084fc',
              fontSize: 11,
              fontWeight: 600,
              cursor: anyRunning || compareRunning || compareDisabledReason ? 'not-allowed' : 'pointer',
            }}
          >
            {compareRunning ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <GitCompare size={11} />}
            Compare
          </button>
        )}
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

      {/* Detail panel — expanded on pass */}
      {expanded && canExpand && (
        <DetailPanel testId={def.id as StepId} details={state.details!} />
      )}
      {comparePanel}
    </div>
  );
}

function CompareResultPanel({
  record,
  testId,
}: {
  record: QualityCompareRunRecord;
  testId: StepId;
}) {
  if (record.state === 'idle') return null;

  const panelStyle: React.CSSProperties = {
    padding: '6px 16px 12px 40px',
    background: 'rgba(124,58,237,0.05)',
    borderLeft: '2px solid rgba(168,85,247,0.18)',
  };

  if (!record.supported) {
    return (
      <div style={panelStyle}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#c084fc', marginBottom: 4 }}>
          Compare unavailable for this item
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
          {record.reason}
        </div>
      </div>
    );
  }

  if (record.state === 'running') {
    return (
      <div style={panelStyle}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#c084fc' }}>
          <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
          Comparing {testId} across runner profiles…
        </div>
      </div>
    );
  }

  const sides = [record.left, record.right].filter(Boolean) as QualityCompareRunSide[];
  const [leftSide, rightSide] = sides;
  const leftMetrics = leftSide?.suite?.metrics;
  const rightMetrics = rightSide?.suite?.metrics;
  const leftCost = leftMetrics?.cost_usd;
  const rightCost = rightMetrics?.cost_usd;
  const hasAnyLlm = sides.some(side => (side.suite?.metrics.total_tokens ?? 0) > 0 || !!side.result?.llm);

  /** Returns percentage difference (B vs A). Negative means B is smaller. */
  const pctDiff = (a: number | undefined, b: number | undefined): number | undefined => {
    if (a === undefined || b === undefined || a === 0) return undefined;
    return ((b - a) / a) * 100;
  };

  /** Returns per-side diff badge. lower = better (for latency, tokens, cost). */
  const diffBadge = (pct: number | undefined, label: string): { a: string | null; b: string | null } => {
    if (pct === undefined || Math.abs(pct) < 3) return { a: null, b: null };
    const bBetter = pct < 0;
    const tag = `← ${Math.abs(pct).toFixed(0)}% ${label}`;
    return bBetter ? { a: null, b: tag } : { a: tag, b: null };
  };

  const speedBadge = diffBadge(pctDiff(leftMetrics?.generation_ms, rightMetrics?.generation_ms), 'faster');
  const tokenBadge = diffBadge(pctDiff(leftMetrics?.total_tokens, rightMetrics?.total_tokens), 'fewer tkns');
  const costBadge  = diffBadge(pctDiff(leftCost, rightCost), 'cheaper');

  const CmpRow = ({ label, aVal, aB, bVal, bB }: { label: string; aVal: string; aB: string | null; bVal: string; bB: string | null }) => (
    <div style={{ display: 'flex', gap: 8, fontSize: 11, marginBottom: 4, alignItems: 'baseline' }}>
      <span style={{ color: 'rgba(255,255,255,0.32)', width: 92, flexShrink: 0, fontFamily: 'monospace' }}>{label}</span>
      <span style={{ flex: 1, fontFamily: 'monospace', color: 'rgba(255,255,255,0.8)' }}>
        {aVal}{aB && <span style={{ marginLeft: 5, fontSize: 10, color: '#4ade80' }}>{aB}</span>}
      </span>
      <span style={{ flex: 1, fontFamily: 'monospace', color: 'rgba(255,255,255,0.8)' }}>
        {bVal}{bB && <span style={{ marginLeft: 5, fontSize: 10, color: '#4ade80' }}>{bB}</span>}
      </span>
    </div>
  );

  return (
    <div style={panelStyle}>
      {/* ── Metrics comparison table ─────────────────────────────── */}
      <div style={{ marginBottom: 10, padding: '8px 10px', background: 'rgba(0,0,0,0.18)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
        {/* Header */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 92, flexShrink: 0 }} />
          {sides.map((side, idx) => (
            <div key={idx} style={{ flex: 1, fontSize: 10, color: '#c084fc', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {idx === 0 ? 'A' : 'B'} · {side.status.label}
            </div>
          ))}
        </div>
        {/* Latency row — always shown */}
        <CmpRow
          label="run total"
          aVal={leftMetrics?.generation_ms !== undefined ? fmtDuration(leftMetrics.generation_ms) : '—'}
          aB={speedBadge.a}
          bVal={rightMetrics?.generation_ms !== undefined ? fmtDuration(rightMetrics.generation_ms) : '—'}
          bB={speedBadge.b}
        />
        <CmpRow
          label="step"
          aVal={leftSide?.result?.duration_ms !== undefined ? fmtDuration(leftSide.result.duration_ms) : '—'}
          aB={null}
          bVal={rightSide?.result?.duration_ms !== undefined ? fmtDuration(rightSide.result.duration_ms) : '—'}
          bB={null}
        />
        {/* Token + cost rows — only when at least one side has LLM data */}
        {hasAnyLlm && (
          <>
            <CmpRow
              label="prompt tkns"
              aVal={leftMetrics ? String(leftMetrics.prompt_tokens) : '—'}
              aB={null}
              bVal={rightMetrics ? String(rightMetrics.prompt_tokens) : '—'}
              bB={null}
            />
            <CmpRow
              label="output tkns"
              aVal={leftMetrics ? String(leftMetrics.completion_tokens) : '—'}
              aB={null}
              bVal={rightMetrics ? String(rightMetrics.completion_tokens) : '—'}
              bB={null}
            />
            <CmpRow
              label="total tkns"
              aVal={leftMetrics ? String(leftMetrics.total_tokens) : '—'}
              aB={tokenBadge.a}
              bVal={rightMetrics ? String(rightMetrics.total_tokens) : '—'}
              bB={tokenBadge.b}
            />
            <CmpRow
              label="budget"
              aVal={fmtCost(leftCost) ?? '—'}
              aB={costBadge.a ?? (leftMetrics?.costEstimated ? 'estimated' : null)}
              bVal={fmtCost(rightCost) ?? '—'}
              bB={costBadge.b ?? (rightMetrics?.costEstimated ? 'estimated' : null)}
            />
          </>
        )}
        {!hasAnyLlm && (
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic', marginTop: 2 }}>
            N/A — no token usage for runtime checks
          </div>
        )}
      </div>

      {/* ── Side cards ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {sides.map((side, idx) => {
          const result = side.result;
          const pass = result?.status === 'pass';
          const sourceFiles = side.suite?.sourceFiles ?? [];
          const skeletonDelta = side.suite?.workspace?.outputTruth.skeletonDelta;
          const sourceFilename = `quality-compare-${idx === 0 ? 'A' : 'B'}-${side.profile.model.replace(/[^\w.-]+/g, '-') || 'model'}.zip`;
          return (
            <div key={`${side.status.label}-${idx}`} style={{
              flex: '1 1 280px',
              minWidth: 0,
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 10,
              background: 'rgba(0,0,0,0.16)',
              overflow: 'hidden',
            }}>
              <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {idx === 0 ? 'Profile A' : 'Profile B'}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#c084fc', marginTop: 2 }}>
                  {side.status.label}
                </div>
              </div>
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}>
                  <span style={{ color: 'rgba(255,255,255,0.45)' }}>status</span>
                  <span style={{ color: pass ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                    {result?.status?.toUpperCase() ?? 'FAIL'}
                  </span>
                </div>
                {result?.summary && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)' }}>{result.summary}</div>
                )}
                {result?.error && (
                  <div style={{ fontSize: 11, color: '#f87171' }}>{result.error}</div>
                )}
                {side.suite && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.62)' }}>
                      {sourceFiles.length} source files
                      {skeletonDelta ? ` · skeleton ${skeletonDelta.skeletonFileCount} · delta ${skeletonDelta.deltaFileCount}` : ''}
                    </div>
                    {skeletonDelta && (
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.42)', lineHeight: 1.5 }}>
                        {skeletonDelta.keyModifiedPaths.length > 0 && (
                          <div>modified: {skeletonDelta.keyModifiedPaths.join(', ')}</div>
                        )}
                        {skeletonDelta.keyNewPaths.length > 0 && (
                          <div>new: {skeletonDelta.keyNewPaths.join(', ')}</div>
                        )}
                      </div>
                    )}
                    <button
                      onClick={() => void downloadSourceZip(sourceFiles, sourceFilename)}
                      disabled={sourceFiles.length === 0}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        width: 'fit-content',
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: '1px solid rgba(96,165,250,0.22)',
                        background: sourceFiles.length === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(96,165,250,0.08)',
                        color: sourceFiles.length === 0 ? 'rgba(255,255,255,0.24)' : '#93c5fd',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: sourceFiles.length === 0 ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <Download size={11} />
                      Download full source
                    </button>
                  </div>
                )}
                {side.realText.length > 0 && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {side.realText.slice(0, 2).map(section => (
                      <div key={section.id}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', marginBottom: 4 }}>
                          {section.label}
                        </div>
                        <pre style={{ margin: 0, maxHeight: 140, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 10, lineHeight: 1.45, color: 'rgba(255,255,255,0.76)', fontFamily: 'monospace' }}>
                          {section.content}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
                {side.suite && side.suite.codeSections.length > 0 && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {side.suite.codeSections.slice(0, 2).map(section => (
                      <div key={section.id}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', marginBottom: 4 }}>
                          Code · {section.label}
                        </div>
                        <pre style={{ margin: 0, maxHeight: 180, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 10, lineHeight: 1.45, color: 'rgba(255,255,255,0.76)', fontFamily: 'monospace' }}>
                          {section.content}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── FlowChainTab ───────────────────────────────────────────────────────────────

function FlowChainTab({ selectedModel = '' }: { selectedModel?: string }) {
  const [testStates,   setTestStates]   = useState<Record<StepId, TestState>>(makeInitStates);
  const [expanded,     setExpanded]     = useState<Record<StepId, boolean>>(makeInitExpanded);
  const [runAllActive, setRunAllActive] = useState(false);
  const [lastRunAt,    setLastRunAt]    = useState<string | null>(() => {
    try { return localStorage.getItem(LS_LAST_RUN_KEY); } catch { return null; }
  });
  const [brokenAt, setBrokenAt] = useState<string | null>(null);
  const primaryProvider = getPrimaryProviderForQuality();
  const baseModel = selectedModel || ConfigService.resolveModel('primary') || '';
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareProfiles, setCompareProfiles] = useState<{ left: QualityCompareProfile; right: QualityCompareProfile }>({
    left: { route: 'standard-api', model: baseModel },
    right: { route: 'openrouter', model: baseModel },
  });
  const [compareRecords, setCompareRecords] = useState<Record<StepId, QualityCompareRunRecord>>({} as Record<StepId, QualityCompareRunRecord>);
  const [activeCompareStepId, setActiveCompareStepId] = useState<StepId | null>(null);
  const [cliStatus, setCliStatus] = useState<DevAgentCliStatus | null>(null);
  const [openRouterModels, setOpenRouterModels] = useState<Model[]>([]);
  const [openRouterModelsLoading, setOpenRouterModelsLoading] = useState(false);
  // Shared buildId for Code Delta → Compile → Preview HTTP → Save Ready chain
  const qualityBuildIdRef = React.useRef<string | null>(null);

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

  useEffect(() => {
    if (!compareEnabled || cliStatus) return;
    void getDevAgentCliStatus()
      .then(setCliStatus)
      .catch(() => {
        setCliStatus({
          claude: { available: false, version: null, reason: 'bridge_unreachable' },
          codex: { available: false, version: null, reason: 'bridge_unreachable' },
        });
      });
  }, [compareEnabled, cliStatus]);

  useEffect(() => {
    if (!compareEnabled) return;
    if (openRouterModels.length > 0 || openRouterModelsLoading) return;
    const openRouterKey = ConfigService.getProviderKey('openrouter') || ConfigService.getApiKey();
    if (!openRouterKey) return;
    setOpenRouterModelsLoading(true);
    void fetchModelsWithCache('openrouter', openRouterKey)
      .then(setOpenRouterModels)
      .finally(() => setOpenRouterModelsLoading(false));
  }, [compareEnabled, openRouterModels.length, openRouterModelsLoading]);

  const anyRunning = runAllActive || Object.values(testStates).some(s => s.status === 'running');
  const hasReportData = Object.values(testStates).some(s => s.status !== 'idle');

  const setOneState = useCallback((id: StepId, patch: Partial<TestState>) => {
    setTestStates(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const setCompareProfile = useCallback((side: 'left' | 'right', patch: Partial<QualityCompareProfile>) => {
    setCompareProfiles(prev => ({
      ...prev,
      [side]: { ...prev[side], ...patch },
    }));
  }, []);

  const handleToggle = useCallback((id: StepId) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const leftCompareStatus = getQualityCompareProfileStatus(compareProfiles.left, cliStatus, primaryProvider);
  const rightCompareStatus = getQualityCompareProfileStatus(compareProfiles.right, cliStatus, primaryProvider);
  const compareBlockedReason =
    !leftCompareStatus.ready ? `Profile A: ${leftCompareStatus.reason}` :
    !rightCompareStatus.ready ? `Profile B: ${rightCompareStatus.reason}` :
    areQualityCompareProfilesEqual(compareProfiles.left, compareProfiles.right) ? 'Choose two different compare profiles.' :
    null;

  const runSingleTest = useCallback(async (id: StepId): Promise<TestApiResult> => {
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
        result = await runArchitectRealTest();
      } else {
        // For chain tests, pass the shared buildId from Code Delta
        const chainBuildId = (id === 'compile' || id === 'preview-http' || id === 'save-ready')
          ? (qualityBuildIdRef.current ?? undefined)
          : undefined;
        result = await callTestApi(id, chainBuildId);
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
      const error = err instanceof Error ? err.message : String(err);
      setOneState(id, { status: 'fail', duration_ms: 0, error, summary: undefined, llm: undefined, output: undefined, warnings: undefined });
      persistTestRun(id, { timestamp: new Date().toISOString(), status: 'fail', duration_ms: 0, error });
      return { status: 'fail', duration_ms: 0, error };
    }
  }, [setOneState]);

  const handleRunOne = useCallback((id: StepId) => { void runSingleTest(id); }, [runSingleTest]);

  const makeCompareFailureResult = useCallback((error: string, duration_ms = 0): TestApiResult => ({
    status: 'fail',
    duration_ms,
    error,
  }), []);

  const runCompareSuite = useCallback(async (profile: QualityCompareProfile): Promise<QualityCompareRunSide> => (
    runQualityCompareSuite({
      profile,
      cliStatus,
      primaryProvider,
      openRouterModels,
    })
  ), [cliStatus, openRouterModels, primaryProvider]);

  const handleRunCompare = useCallback(async (id: StepId) => {
    if (compareBlockedReason) return;
    setActiveCompareStepId(id);

    const runningRecords = Object.fromEntries(
      STEP_DEFS.map(def => [def.id as StepId, { state: 'running', supported: true }]),
    ) as Record<StepId, QualityCompareRunRecord>;
    setCompareRecords(runningRecords);

    try {
      const left = await runCompareSuite(compareProfiles.left);
      const right = await runCompareSuite(compareProfiles.right);

      const nextRecords = Object.fromEntries(
        STEP_DEFS.map(def => {
          const stepId = def.id as StepId;
          const leftResult = left.suite?.tests[stepId] ?? makeCompareFailureResult('Missing compare result.');
          const rightResult = right.suite?.tests[stepId] ?? makeCompareFailureResult('Missing compare result.');
          return [stepId, {
            state: 'done',
            supported: true,
            left: {
              ...left,
              result: leftResult,
              realText: leftResult.details ? buildQualityRealTextSections(stepId, leftResult.details) : [],
            },
            right: {
              ...right,
              result: rightResult,
              realText: rightResult.details ? buildQualityRealTextSections(stepId, rightResult.details) : [],
            },
          } satisfies QualityCompareRunRecord];
        }),
      ) as Record<StepId, QualityCompareRunRecord>;

      setCompareRecords(nextRecords);
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      const failedRecords = Object.fromEntries(
        STEP_DEFS.map(def => [def.id as StepId, {
          state: 'done',
          supported: true,
          left: {
            profile: compareProfiles.left,
            status: leftCompareStatus,
            result: makeCompareFailureResult(error),
            realText: [],
          },
          right: {
            profile: compareProfiles.right,
            status: rightCompareStatus,
            result: makeCompareFailureResult(error),
            realText: [],
          },
        } satisfies QualityCompareRunRecord]),
      ) as unknown as Record<StepId, QualityCompareRunRecord>;
      setCompareRecords(failedRecords);
    }
  }, [compareBlockedReason, compareProfiles.left, compareProfiles.right, leftCompareStatus, makeCompareFailureResult, rightCompareStatus, runCompareSuite]);

  const handleRunAll = useCallback(async () => {
    setRunAllActive(true);
    setBrokenAt(null);
    setExpanded(makeInitExpanded());
    setCompareRecords({} as Record<StepId, QualityCompareRunRecord>);
    setActiveCompareStepId(null);
    qualityBuildIdRef.current = null;
    const now = new Date().toISOString();
    setLastRunAt(now);
    try { localStorage.setItem(LS_LAST_RUN_KEY, now); } catch { /* quota */ }
    setTestStates(makeInitStates());

    for (const def of STEP_DEFS) {
      const result = await runSingleTest(def.id as StepId);
      if (result.status === 'fail') { setBrokenAt(def.id); break; }
    }
    setRunAllActive(false);
  }, [runSingleTest]);

  const handleClear = useCallback(() => {
    clearQualityPanelHistory();
    setTestStates(makeInitStates());
    setExpanded(makeInitExpanded());
    setCompareRecords({} as Record<StepId, QualityCompareRunRecord>);
    setActiveCompareStepId(null);
    setRunAllActive(false);
    setLastRunAt(null);
    setBrokenAt(null);
  }, []);

  // Footer verdict
  const passCount = Object.values(testStates).filter(s => s.status === 'pass').length;
  const failCount = Object.values(testStates).filter(s => s.status === 'fail').length;
  const fixtureTestIds = STEP_DEFS
    .map(def => def.id as StepId)
    .filter(id => FIXTURE_BACKED_TESTS.has(id));
  const realRuntimeTestIds = STEP_DEFS
    .map(def => def.id as StepId)
    .filter(id => REAL_RUNTIME_TESTS.has(id));
  const realLlmTestIds = STEP_DEFS
    .map(def => def.id as StepId)
    .filter(id => REAL_LLM_TESTS.has(id));
  const blockingRealGateIds = STEP_DEFS
    .map(def => def.id as StepId)
    .filter(id => BLOCKING_REAL_TESTS.has(id));
  const fixtureSummary = summarizeQualityBucket(testStates, fixtureTestIds);
  const realRuntimeSummary = summarizeQualityBucket(testStates, realRuntimeTestIds);
  const realLlmSummary = summarizeQualityBucket(testStates, realLlmTestIds);
  const blockingRealGateSummary = summarizeQualityBucket(testStates, blockingRealGateIds);
  const architectureTruth = summarizeQualityBucket(testStates, ['architect-real' as StepId]);
  const codeDeltaTruth = summarizeQualityBucket(testStates, ['code-delta' as StepId]);
  const verdict: Verdict =
    blockingRealGateSummary.failCount > 0
      ? (blockingRealGateSummary.passCount > 0 || fixtureSummary.passCount > 0 ? 'PARTIAL' : 'FAIL')
      : blockingRealGateSummary.passCount === blockingRealGateIds.length && blockingRealGateIds.length > 0
        ? 'PASS'
        : blockingRealGateSummary.passCount > 0 || fixtureSummary.passCount > 0 || failCount > 0
          ? 'PARTIAL'
          : null;

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
      verdictBreakdown: {
        overall: verdict,
        fixtureBacked: fixtureSummary,
        realRuntime: realRuntimeSummary,
        realLlm: realLlmSummary,
        blockingRealGates: blockingRealGateSummary,
        architectureTruth,
        codeDeltaTruth,
      },
      passCount,
      failCount,
      brokenAt,
      tests: STEP_DEFS.map(def => ({
        id: def.id,
        label: def.label,
        description: def.desc,
        truthClass: getTruthKind(def.id as StepId),
        fixtureBacked: FIXTURE_BACKED_TESTS.has(def.id as StepId),
        current: testStates[def.id as StepId],
        history: loadTestHistory(def.id),
      })),
    };
    downloadQualityReport(report);
  }, [architectureTruth, blockingRealGateSummary, brokenAt, codeDeltaTruth, failCount, fixtureSummary, lastRunAt, passCount, realLlmSummary, realRuntimeSummary, testStates, verdict]);

  const renderCompareProfileEditor = (
    side: 'left' | 'right',
    title: string,
    profile: QualityCompareProfile,
    status: QualityCompareProfileStatus,
  ) => (
    <div style={{
      flex: '1 1 280px',
      minWidth: 0,
      borderRadius: 10,
      border: '1px solid rgba(168,85,247,0.18)',
      background: 'rgba(124,58,237,0.06)',
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {title}
      </div>
      <select
        value={profile.route}
        onChange={e => setCompareProfile(side, { route: e.target.value as QualityCompareRoute })}
        style={{
          width: '100%',
          padding: '8px 10px',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.82)',
          fontSize: 12,
          outline: 'none',
        }}
      >
        <option value="standard-api">{`Standard API (${primaryProvider})`}</option>
        <option value="openrouter">OpenRouter</option>
        <option value="claude-cli">Claude CLI</option>
        <option value="codex-cli">Codex CLI</option>
      </select>
      <input
        list={profile.route === 'openrouter' ? 'quality-openrouter-models' : undefined}
        value={profile.model}
        onChange={e => setCompareProfile(side, { model: e.target.value })}
        placeholder={
          profile.route === 'claude-cli' ? 'claude-sonnet-4-6' :
          profile.route === 'codex-cli' ? 'gpt-5.1-codex' :
          profile.route === 'openrouter' ? 'openrouter model id…' :
          `${primaryProvider} model id…`
        }
        style={{
          width: '100%',
          padding: '8px 10px',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.82)',
          fontSize: 12,
          outline: 'none',
        }}
      />
      <div style={{ fontSize: 11, color: status.ready ? '#86efac' : '#fbbf24' }}>
        {status.ready ? status.label : `${status.label} · ${status.reason}`}
      </div>
      {profile.route === 'openrouter' && (
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)' }}>
          {openRouterModelsLoading
            ? 'Loading OpenRouter catalog…'
            : openRouterModels.length > 0
              ? `${openRouterModels.length} OpenRouter models available as suggestions.`
              : 'OpenRouter suggestions appear when an OpenRouter key is configured.'}
        </div>
      )}
    </div>
  );

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
            onClick={() => setCompareEnabled(prev => !prev)}
            disabled={anyRunning}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 7,
              border: '1px solid rgba(168,85,247,0.28)',
              background: compareEnabled ? 'rgba(168,85,247,0.14)' : 'rgba(255,255,255,0.04)',
              color: compareEnabled ? '#c084fc' : 'rgba(255,255,255,0.62)',
              fontSize: 12, fontWeight: 600,
              cursor: anyRunning ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <GitCompare size={12} />
            Compare models
          </button>
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
          <button
            onClick={handleClear}
            disabled={anyRunning}
            style={{
              padding: '5px 12px', borderRadius: 7,
              border: '1px solid rgba(255,255,255,0.12)',
              background: anyRunning ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
              color: anyRunning ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.65)',
              fontSize: 12, fontWeight: 600,
              cursor: anyRunning ? 'not-allowed' : 'pointer',
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

      {compareEnabled && (
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(124,58,237,0.04)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                LLM compare
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
                Hidden by default. Enable it only when you want per-item runner comparisons without cluttering the main quality list.
              </div>
            </div>
            {compareBlockedReason && (
              <div style={{ fontSize: 11, color: '#fbbf24' }}>{compareBlockedReason}</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {renderCompareProfileEditor('left', 'Profile A', compareProfiles.left, leftCompareStatus)}
            {renderCompareProfileEditor('right', 'Profile B', compareProfiles.right, rightCompareStatus)}
          </div>
          {openRouterModels.length > 0 && (
            <datalist id="quality-openrouter-models">
              {openRouterModels.slice(0, 250).map(model => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </datalist>
          )}
        </div>
      )}

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
              compareEnabled={compareEnabled}
              onCompare={() => void handleRunCompare(def.id as StepId)}
              compareDisabledReason={compareBlockedReason}
              compareRunning={compareRecords[def.id as StepId]?.state === 'running'}
              hasCompareResult={Boolean(compareRecords[def.id as StepId] && compareRecords[def.id as StepId].state === 'done')}
              comparePanel={compareEnabled && activeCompareStepId === def.id && compareRecords[def.id as StepId] ? (
                <CompareResultPanel
                  testId={def.id as StepId}
                  record={compareRecords[def.id as StepId]}
                />
              ) : null}
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
            <span>real-runtime {realRuntimeSummary.passCount}/{realRuntimeSummary.total}{realRuntimeSummary.verdict ? ` ${realRuntimeSummary.verdict}` : ''}</span>
            <span>real-llm {realLlmSummary.passCount}/{realLlmSummary.total}{realLlmSummary.verdict ? ` ${realLlmSummary.verdict}` : ''}</span>
            <span>fixture {fixtureSummary.passCount}/{fixtureSummary.total}{fixtureSummary.verdict ? ` ${fixtureSummary.verdict}` : ''}</span>
            <span>arch truth {architectureTruth.verdict ?? 'PENDING'}</span>
            <span>delta truth {codeDeltaTruth.verdict ?? 'PENDING'}</span>
            {blockingRealGateSummary.failCount > 0 && (
              <span style={{ color: '#f87171' }}>
                real gates failed: {blockingRealGateSummary.failedIds.join(', ')}
              </span>
            )}
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
        {tab === 'flow-chain' && <FlowChainTab selectedModel={selectedModel} />}
        {tab === 'benchmark'  && <BenchmarkDashboard apiKey={apiKey} selectedModel={selectedModel} />}
      </div>
    </div>
  );
}

export default QualityPanel;
