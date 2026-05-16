/**
 * AgentLoopService — autonomous multi-agent Build/QA loop.
 *
 * Flow:
 *   startSession()  → SpecAgent → Supabase (status: spec_review)
 *   confirmAndBuild() → BuildAgent + QAAgent loop → Supabase (status: ready)
 *   applySession()  → returns result_files to main project
 *   rejectSession() → marks rejected
 */

import { supabase } from '../lib/supabase';
import { ApiProvider } from './ConfigService';
import { ScannerService } from './ScannerService';
import { metricsService, enrichError } from './MetricsService';
import { promptRegistry } from './PromptRegistry';
import { llmFetchStream } from './LLMProxy';
import { selectSkeleton, buildSkeletonPromptBlock } from './SkeletonRegistry';

// ── Prompt Cache ───────────────────────────────────────────────────────────────

const promptCache = new Map<string, {
  result: string;
  timestamp: number;
  tokens: number;
}>();

const projectDnaCache = new Map<string, {
  context: string;
  timestamp: number;
}>();

const CACHE_TTL = 5 * 60 * 1000; // 5 минут

const getCacheKey = (model: string, prompt: string) =>
  `${model}:${prompt.slice(0, 100)}:${prompt.length}`;

const getProjectDna = async (files: Record<string, string>): Promise<string> => {
  const filesHash = Object.keys(files).sort().join(',');
  const cached = projectDnaCache.get(filesHash);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[ProjectDNA] Cache hit');
    return cached.context;
  }

  ScannerService.scan(files);
  const context = ScannerService.buildPromptContext();
  projectDnaCache.set(filesHash, { context, timestamp: Date.now() });
  return context;
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type AgentSessionStatus =
  | 'pending'
  | 'spec_review'
  | 'needs_clarification'
  | 'building'
  | 'qa_review'
  | 'ready'
  | 'applied'
  | 'rejected'
  | 'paused'
  | 'merged'
  | 'partial_success';

export interface AgentSpec {
  blockName:        string;
  goal:             string;
  leaders:          string[];
  mustHaveFeatures: string[];
  risks:            string[];
  protectedFiles:   string[];
  touchedFiles:     string[];
  criteria:         string[];
  technicalDesign?: {
    stateManagement: string;
    dataFlow:        string;
    keyComponents:   string[];
    styling:         string;
    animations:      string;
    errorHandling:   string;
  };
  dataSchema?: {
    tables: Array<{
      name:      string;
      fields:    Array<{ name: string; type: string }>;
      relations: string[];
    }>;
    supabaseQueries: string[];
  };
  componentMap?: {
    reuse:  string[];
    create: string[];
    modify: string[];
  };
  /** Skeleton selection hints */
  appType?: string;
  tags?:    string[];
}

export interface QAReport {
  passed:   boolean;
  issues:   string[];
  warnings: string[];
  summary:  string;
  fixStrategy?: {
    priority:          'high' | 'medium' | 'low';
    specificFixes:     Array<{ file: string; problem: string; solution: string }>;
    architecturalNotes: string;
  };
}

export interface ClarifyQuestion {
  text:    string;
  options: string[];
}

export interface AgentSession {
  id:                string;
  block_name:        string;
  status:            AgentSessionStatus;
  spec:              AgentSpec | null;
  iterations:        number;
  max_iterations:    number;
  isolated_files:    Record<string, string> | null;
  result_files:      Record<string, string> | null;
  qa_report:         QAReport | null;
  review_report:     string | null;
  spec_result:       AgentSpec | null;       // persisted SpecAgent output (phase cache)
  clarify_questions: ClarifyQuestion[] | null; // ClarifyAgent questions (with options)
  clarify_answers:   string[] | null;          // user answers (selected option texts)
  created_at:        string;
  updated_at:        string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface LLMResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** true если стрим оборвался — результат частичный */
  partial?: boolean;
  /** количество успешно закрытых FILE-блоков при partial */
  recoveredFilesCount?: number;
}

const ENDPOINTS: Record<string, string> = {
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  google:     'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  anthropic:  'https://api.anthropic.com/v1/messages',
  openai:     'https://api.openai.com/v1/chat/completions',
  deepseek:   'https://api.deepseek.com/chat/completions',
};

// ── Network Resilience ────────────────────────────────────────────────────────

/** Задержки между повторными попытками: 3 ретрая = 4 попытки итого */
const RETRY_DELAYS = [1000, 2000, 4000] as const;

/** Модуль-уровневый трекер активного AbortController.
 *  При каждом новом запросе предыдущий контроллер прерывается,
 *  чтобы исключить "зависание" буферов в памяти. */
let _activeAbortController: AbortController | null = null;

function createAbortController(): AbortController {
  if (_activeAbortController) {
    _activeAbortController.abort();
    console.log('[AbortController] Предыдущий запрос прерван (abort) перед новым');
  }
  const ctrl = new AbortController();
  _activeAbortController = ctrl;
  return ctrl;
}

/**
 * Fetch с паттерном Exponential Backoff.
 * Применяется ТОЛЬКО к вызову fetch() — логика reader.read() не оборачивается.
 * Триггеры повтора: сетевые ошибки (TypeError), статусы 429 и 5xx.
 * AbortError от собственного контроллера НЕ повторяется.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  sessionId?: string,
): Promise<Response> {
  const maxAttempts = RETRY_DELAYS.length + 1; // 4 попытки

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt - 1];
      console.log(`[fetchWithRetry] Попытка ${attempt + 1}/${maxAttempts} через ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      // Route through Supabase Edge Function proxy (CSP bypass)
      const hdrs: Record<string, string> = {};
      if (options.headers) {
        const h = options.headers as Record<string, string>;
        for (const k of Object.keys(h)) hdrs[k] = h[k];
      }
      const resp = await llmFetchStream(
        url,
        hdrs,
        typeof options.body === 'string' ? options.body : JSON.stringify(options.body),
        options.signal as AbortSignal | undefined,
      );

      // Retry на 429 (Rate Limit) и 5xx (серверные ошибки)
      if ((resp.status === 429 || resp.status >= 500) && attempt < maxAttempts - 1) {
        console.warn(`[fetchWithRetry] Статус ${resp.status} на попытке ${attempt + 1} — повтор`);
        continue;
      }

      // Успешное восстановление после ретрая — логируем в MetricsService
      if (attempt > 0 && resp.ok) {
        metricsService.record({
          phase:     'network_recovery',
          sessionId,
          extra:     { recoveredOnAttempt: attempt + 1, totalAttempts: maxAttempts, status: resp.status },
        });
        console.log(`[fetchWithRetry] ✅ Восстановлено после ${attempt} повтора(ов) — событие network_recovery`);
      }

      return resp;
    } catch (err) {
      const isAbortError = err instanceof Error && err.name === 'AbortError';
      // AbortError от нашего собственного контроллера — не повторяем
      if (isAbortError) throw err;

      if (attempt < maxAttempts - 1) {
        console.warn(`[fetchWithRetry] Сетевая ошибка на попытке ${attempt + 1} — повтор:`, err);
        continue;
      }
      // Исчерпаны все попытки
      throw err;
    }
  }

  throw new Error('[fetchWithRetry] Исчерпаны все попытки подключения');
}

function getHeaders(provider: string, apiKey: string): Record<string, string> {
  if (provider === 'anthropic') {
    return {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    };
  }
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = typeof window !== 'undefined' ? window.location.origin : '';
  }
  return headers;
}

// ── Self-Healing ──────────────────────────────────────────────────────────────

async function handleSystemError(
  error: Error,
  context: string,
  sessionId?: string,
): Promise<void> {
  const enriched = enrichError(error.message, context);

  metricsService.recordError('agentloop', error.message, { enriched, sessionId });

  if (enriched.suggestedFix !== 'Investigate manually') {
    console.log('[Self-Healing] Attempting auto-fix...');
    window.dispatchEvent(new CustomEvent('auto-fix-triggered', {
      detail: {
        prompt:        enriched.agentPrompt,
        affectedFiles: enriched.affectedFiles,
        priority:      'high',
      },
    }));
  }
}

async function callLLM(
  apiKey: string,
  modelId: string,
  prompt: string,
  maxTokens = 2000,
  provider: ApiProvider = 'openrouter',
  onLog?: (msg: string) => void,
): Promise<LLMResult> {
  // ── Cache check ─────────────────────────────────────────────────────────────
  const cacheKey = getCacheKey(modelId, prompt);
  const cached = promptCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    const saved = cached.tokens;
    const savedUsd = (saved * 0.000003).toFixed(4);
    const msg = `[CACHE] Сэкономлено ~${saved} токенов ($${savedUsd})`;
    console.log('[callLLM] Cache hit —', msg);
    onLog?.(msg);
    return { text: cached.result, inputTokens: 0, outputTokens: 0 };
  }

  // Прерываем предыдущий запрос и регистрируем новый контроллер
  const controller = createAbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 180_000); // 3 min timeout

  try {
    const endpoint = ENDPOINTS[provider];
    if (!endpoint) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    console.log('[callLLM] model:', modelId, 'key length:', apiKey?.length, 'key start:', apiKey?.slice(0, 8));

    // ── fetchWithRetry вместо bare fetch() ──────────────────────────────────
    const resp = await fetchWithRetry(
      endpoint,
      {
        method:  'POST',
        headers: getHeaders(provider, apiKey),
        body:    JSON.stringify({
          model:       modelId,
          messages:    [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens:  maxTokens,
          stream:      true,
        }),
        signal:  controller.signal,
      },
    );

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`API Error ${resp.status}: ${errText}`);
    }

    const reader = resp.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let resultText = '';
    let buffer = '';

    // ── Streaming loop: reader.read() НЕ оборачивается в retry.
    //    При ошибке чтения — стрим считается завершённым,
    //    сохраняются все успешно закрытые FILE-блоки → partial_success.
    while (true) {
      let done: boolean;
      let value: Uint8Array | undefined;

      try {
        ({ done, value } = await reader.read());
      } catch (streamErr) {
        const errMsg = streamErr instanceof Error ? streamErr.message : String(streamErr);
        console.warn('[callLLM] Ошибка чтения стрима — частичное восстановление:', errMsg);

        // Извлекаем все успешно закрытые FILE-блоки из накопленного текста
        const partialFiles        = extractFiles(resultText);
        const recoveredFilesCount = Object.keys(partialFiles).length;

        console.log(`[callLLM] Частичное восстановление: ${recoveredFilesCount} закрытых FILE-блоков`);

        const text = resultText.replace(/```json\n?|```/g, '').trim();
        return {
          text,
          inputTokens:  0,
          outputTokens: Math.round(text.length / 4),
          partial:      true,
          recoveredFilesCount,
        };
      }

      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const clean = line.replace(/^data: /, '').trim();
        if (!clean || clean === '[DONE]') continue;
        try {
          const parsed = JSON.parse(clean);
          const content = parsed.choices?.[0]?.delta?.content || '';
          if (content) {
            resultText += content;
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('agent-live-stream', { detail: content }));
            }
          }
        } catch {
          buffer = line + '\n' + buffer;
        }
      }
    }

    const text = resultText.replace(/```json\n?|```/g, '').trim();
    const inputTokens  = 0;
    const outputTokens = Math.round(text.length / 4);

    // ── Cache the result ────────────────────────────────────────────────────
    promptCache.set(cacheKey, {
      result:    text,
      timestamp: Date.now(),
      tokens:    outputTokens,
    });

    return { text, inputTokens, outputTokens };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callLLMWithRetry(
  apiKey: string,
  modelId: string,
  prompt: string,
  maxTokens: number,
  provider: ApiProvider = 'openrouter',
  retries = 2,
  onLog?: (msg: string) => void,
): Promise<LLMResult> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await callLLM(apiKey, modelId, prompt, maxTokens, provider, onLog);
    } catch (err) {
      const isAbort = err instanceof Error &&
        (err.name === 'AbortError' || err.message.includes('aborted'));

      if (isAbort && attempt < retries) {
        console.log(`[callLLM] Timeout attempt ${attempt}, retrying in 5s...`);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}

function parseJSON<T>(raw: string): T | null {
  try {
    // Remove markdown code blocks (```json ... ```)
    let clean = raw
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim();

    // If Gemini added text before JSON, find the first { or [
    const jsonStart = clean.search(/[\[{]/);
    if (jsonStart > 0) {
      console.log(`[parseJSON] Found JSON start at position ${jsonStart}, skipping ${jsonStart} chars of preamble`);
      clean = clean.slice(jsonStart);
    }

    // Find the last } or ] to handle trailing text
    const lastBrace = clean.lastIndexOf('}');
    const lastBracket = clean.lastIndexOf(']');
    const jsonEnd = Math.max(lastBrace, lastBracket);

    if (jsonEnd > 0 && jsonEnd < clean.length - 1) {
      console.log(`[parseJSON] Found JSON end at position ${jsonEnd}, removing ${clean.length - jsonEnd - 1} chars of trailing text`);
      clean = clean.slice(0, jsonEnd + 1);
    }

    const parsed = JSON.parse(clean) as T;
    console.log(`[parseJSON] ✅ Successfully parsed JSON`);
    return parsed;
  } catch (err) {
    console.error(`[parseJSON] ❌ Failed to parse:`, err);
    return null;
  }
}

function extractFiles(text: string): Record<string, string> {
  const files: Record<string, string> = {};
  const re = /<!--FILE:([^>]+)-->([\s\S]*?)<!--\/FILE-->/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const rawName = m[1].trim();
    const rawBody = m[2].trim();
    if (!rawName || !rawBody) continue;

    // Normalize path: strip any leading frontend/src/ prefix
    const name = rawName.replace(/^.*?frontend\/src\//, '');

    // Strip markdown code fences (```lang ... ```)
    const body = rawBody
      .replace(/^```[\w]*\n?/gm, '')
      .replace(/```$/gm, '')
      .trim();

    files[name] = body;
  }
  return files;
}

// ── Token Budget & Cost Tracking ──────────────────────────────────────────────

export interface TokenBudget {
  plannedInputTokens: number;
  plannedOutputTokens: number;
  plannedCostUsd: number;
  actualInputTokens: number;
  actualOutputTokens: number;
  actualCostUsd: number;
  limitUsd: number;
  paused: boolean;
  pausedAtIteration: number;
}

const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'anthropic/claude-sonnet-4-5':      { input: 3.00,  output: 15.00 },
  'google/gemini-2.5-pro-preview':    { input: 1.25,  output: 10.00 },
  'google/gemini-2.0-flash-001':      { input: 0.10,  output: 0.40  },
};

function calcCost(modelId: string, inputTok: number, outputTok: number): number {
  const price = MODEL_PRICES[modelId] ?? { input: 1, output: 5 };
  return (inputTok / 1_000_000) * price.input + (outputTok / 1_000_000) * price.output;
}

export function estimateBudget(
  files: Record<string, string>,
  specModelId: string,
  buildModelId: string,
  qaModelId: string,
  maxIterations = 2,
  limitUsd = 1.0,
): TokenBudget {
  const fileTokens = Math.round(Object.values(files).join('').length / 4);
  const specIn  = fileTokens + 400;  const specOut  = 3000;
  const buildIn = 3300;              const buildOut = 3000;
  const qaIn    = 1500;              const qaOut    = 300;
  const totalIn  = specIn + (buildIn + qaIn) * maxIterations;
  const totalOut = specOut + (buildOut + qaOut) * maxIterations;
  const cost = calcCost(specModelId, specIn, specOut)
    + calcCost(buildModelId, buildIn * maxIterations, buildOut * maxIterations)
    + calcCost(qaModelId, qaIn * maxIterations, qaOut * maxIterations);
  return {
    plannedInputTokens: totalIn, plannedOutputTokens: totalOut,
    plannedCostUsd: cost, actualInputTokens: 0, actualOutputTokens: 0,
    actualCostUsd: 0, limitUsd, paused: false, pausedAtIteration: 0,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export class AgentLoopService {

  private static async getCurrentSupabaseUserId(): Promise<string | null> {
    try {
      const getUser = supabase.auth?.getUser;
      if (typeof getUser !== 'function') return null;
      const { data, error } = await getUser();
      if (error) return null;
      return data.user?.id ?? null;
    } catch {
      return null;
    }
  }

  private static isMissingAgentSessionsUserIdError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;

    const maybeError = error as {
      code?: unknown;
      message?: unknown;
      details?: unknown;
      hint?: unknown;
    };

    const code = String(maybeError.code ?? '').toLowerCase();
    const message = [
      String(maybeError.message ?? ''),
      String(maybeError.details ?? ''),
      String(maybeError.hint ?? ''),
    ].join(' ').toLowerCase();

    if (!message.includes('user_id')) return false;

    return code === '42703'
      || code === 'pgrst204'
      || message.includes("could not find the 'user_id' column")
      || message.includes('column agent_sessions.user_id does not exist')
      || message.includes('agent_sessions.user_id');
  }

  private static isRlsPolicyViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;

    const maybeError = error as {
      code?: unknown;
      message?: unknown;
    };

    const code = String(maybeError.code ?? '');
    const message = String(maybeError.message ?? '').toLowerCase();

    return code === '42501'
      || message.includes('row-level security policy')
      || message.includes('insufficient_privilege');
  }

  private static getAgentSessionsErrorMessage(error: unknown): string {
    if (!error || typeof error !== 'object' || !('message' in error)) return 'unknown';
    return typeof error.message === 'string' ? error.message : 'unknown';
  }

  private static async runAgentSessionsQuery<T extends {
    error?: unknown;
    data?: unknown;
    count?: number | null;
  }>(
    runQuery: (userId: string | null) => PromiseLike<T>,
  ): Promise<T> {
    const userId = await AgentLoopService.getCurrentSupabaseUserId();
    const result = await runQuery(userId);

    if (userId && AgentLoopService.isMissingAgentSessionsUserIdError(result.error)) {
      return await runQuery(null);
    }

    return result;
  }

  private static scopeAgentSessionsQuery<T extends { eq: (column: string, value: unknown) => T }>(
    query: T,
    userId: string | null,
  ): T {
    if (!userId) return query;
    return query.eq('user_id', userId);
  }

  private static withAgentSessionOwner<T extends Record<string, unknown>>(
    payload: T,
    userId: string | null,
  ): T | (T & { user_id: string }) {
    if (!userId) return payload;
    return { ...payload, user_id: userId };
  }

  private static async getAgentSessionById<T>(
    sessionId: string,
    columns = '*',
  ): Promise<T | null> {
    const { data } = await AgentLoopService.runAgentSessionsQuery((userId) => {
      if (!userId) {
        // TODO(P1.4B): keep legacy unscoped session lookups in local/dev until the user_id migration lands.
      }

      let query = supabase
        .from('agent_sessions')
        .select(columns)
        .eq('id', sessionId);

      query = AgentLoopService.scopeAgentSessionsQuery(query, userId);
      return query.single();
    });

    return (data as T | null) ?? null;
  }

  private static async updateAgentSessionById(
    sessionId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await AgentLoopService.runAgentSessionsQuery((userId) => {
      let query = supabase
        .from('agent_sessions')
        .update(payload)
        .eq('id', sessionId);

      query = AgentLoopService.scopeAgentSessionsQuery(query, userId);
      return query;
    });
  }

  // ── Start new session (SpecAgent phase) ──────────────────────────────────

  static async startSession(
    blockName:    string,
    currentFiles: Record<string, string>,
    apiKey:       string,
    specModelId:  string,
    onStatus:     (status: string, detail: string) => void,
    moduleContext?: string,
    specProvider: ApiProvider = 'openrouter',
    onLog?: (msg: string) => void,
  ): Promise<string> {
    onStatus('pending', `Запускаю исследование блока: ${blockName}`);

    // ── Phase cache: reuse existing session waiting for clarification ────────
    const { data: cached } = await AgentLoopService.runAgentSessionsQuery((userId) => {
      if (!userId) {
        // TODO(P1.4B): keep legacy unscoped phase-cache reads in local/dev until the user_id migration lands.
      }

      let query = supabase
        .from('agent_sessions')
        .select('*')
        .eq('block_name', blockName)
        .eq('status', 'needs_clarification');

      query = AgentLoopService.scopeAgentSessionsQuery(query, userId);
      return query
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
    });

    if (cached?.spec_result) {
      onStatus('spec_review', 'Загружаю готовый спек из кэша — пропускаем SpecAgent...');
      return cached.id as string;
    }

    const { data: session, error } = await AgentLoopService.runAgentSessionsQuery((userId) => (
      supabase
        .from('agent_sessions')
        .insert(AgentLoopService.withAgentSessionOwner({
          block_name:     blockName,
          status:         'pending',
          isolated_files: currentFiles,
        }, userId))
        .select()
        .single()
    ));

    if (error || !session) {
      if (AgentLoopService.isRlsPolicyViolation(error)) {
        throw new Error('Agent Lab requires authentication. Please sign in with Google to create agent sessions.');
      }
      throw new Error('Не удалось создать сессию: ' + AgentLoopService.getAgentSessionsErrorMessage(error));
    }

    const spec = await AgentLoopService.runSpecAgent(
      blockName, currentFiles, apiKey, specModelId, onStatus, moduleContext, specProvider, onLog,
    );

    // ── Persist spec immediately so it survives restarts ────────────────────
    await AgentLoopService.updateAgentSessionById(session.id, { spec_result: spec });

    // ── ClarifyAgent ──────────────────────────────────────────────────────
    onStatus('clarifying', 'Анализирую задачу...');

    const clarifyPrompt = promptRegistry.getPrompt('clarify')
      .replace('{{BLOCK_NAME}}', blockName)
      .replace('{{MODULE_CONTEXT_LINE}}', moduleContext ? `Контекст: ${moduleContext}\n` : '')
      .replace('{{SPEC_JSON}}', JSON.stringify(spec, null, 2));

    const _t0Clarify = Date.now();
    const clarifyRaw = await callLLMWithRetry(apiKey, specModelId, clarifyPrompt, 500, specProvider, 2, onLog);
    const PRICE_PER_1M_INPUT = 3.0, PRICE_PER_1M_OUTPUT = 15.0;
    const inputCost = (clarifyRaw.inputTokens / 1_000_000) * PRICE_PER_1M_INPUT;
    const outputCost = (clarifyRaw.outputTokens / 1_000_000) * PRICE_PER_1M_OUTPUT;
    const totalCost = inputCost + outputCost;
    console.log(`[COST:Clarify] in:${clarifyRaw.inputTokens} out:${clarifyRaw.outputTokens} = $${totalCost.toFixed(4)}`);
    metricsService.record({ phase: 'clarify', model: specModelId, durationMs: Date.now() - _t0Clarify, inputTokens: clarifyRaw.inputTokens, outputTokens: clarifyRaw.outputTokens, cost: totalCost, blockName });
    const clarify = parseJSON<{ questions: (ClarifyQuestion | string)[] }>(clarifyRaw.text);
    const rawQuestions = clarify?.questions ?? [];

    // Normalize: convert plain strings (legacy/fallback) to ClarifyQuestion format
    const questions: ClarifyQuestion[] = rawQuestions.map(q =>
      typeof q === 'string'
        ? { text: q, options: [] }
        : q,
    );

    if (questions.length > 0) {
      onStatus('needs_clarification', JSON.stringify(questions));
      await AgentLoopService.updateAgentSessionById(session.id, {
        spec,
        spec_result:       spec,
        clarify_questions: questions,
        status:            'needs_clarification',
        review_report:     JSON.stringify({ clarification_questions: questions }),
        updated_at:        new Date().toISOString(),
      });
      return session.id as string;
    }

    // ── Нет вопросов — идём дальше ───────────────────────────────────────
    await AgentLoopService.updateAgentSessionById(session.id, {
      spec,
      status:     'spec_review',
      updated_at: new Date().toISOString(),
    });

    onStatus('spec_review', 'Спецификация готова — ожидает подтверждения');
    return session.id as string;
  }

  // ── SpecAgent ─────────────────────────────────────────────────────────────

  static async runSpecAgent(
    blockName:    string,
    files:        Record<string, string>,
    apiKey:       string,
    modelId:      string,
    onStatus:     (status: string, detail: string) => void,
    moduleContext?: string,
    provider: ApiProvider = 'openrouter',
    onLog?: (msg: string) => void,
  ): Promise<AgentSpec> {
    onStatus('pending', 'SpecAgent: анализирую задачу...');

    const manifest = await fetch('/PROJECT_MANIFEST.json')
      .then(r => r.json()).catch(() => null);
    const manifestContext = manifest ? `PROJECT MANIFEST:
Stack: ${JSON.stringify(manifest.project_identity?.stack)}
Files: ${manifest.file_system_map?.slice(0, 50).join(', ')}
Rules: ${manifest.rules_of_engagement?.join(', ')}
` : '';
    const projectDna = await getProjectDna(files);
    const packageJson       = files['package.json'] ?? '';
    const tailwindConfig    = files['tailwind.config.ts'] ?? files['tailwind.config.js'] ?? '';
    const exampleComponents = Object.entries(files)
      .filter(([k]) => k.includes('components/') && k.endsWith('.tsx'))
      .slice(0, 3)
      .map(([k, v]) => `// ${k}\n${v.slice(0, 500)}`)
      .join('\n\n');

    const prompt = promptRegistry.getPrompt('spec')
      .replace('{{MANIFEST_CONTEXT}}', manifestContext)
      .replace('{{PACKAGE_JSON_PREVIEW}}', packageJson.slice(0, 300))
      .replace('{{PROJECT_DNA_PREVIEW}}', projectDna.slice(0, 1000))
      .replace('{{EXAMPLE_COMPONENTS}}', exampleComponents)
      .replace('{{TAILWIND_CONFIG_PREVIEW}}', tailwindConfig.slice(0, 200))
      .replace('{{MODULE_CONTEXT_BLOCK}}', moduleContext ? `МОДУЛЬНЫЙ КОНТЕКСТ:\n${moduleContext}\n` : '')
      .replaceAll('{{BLOCK_NAME}}', blockName);

    const _t0Spec = Date.now();
    const specResult = await callLLMWithRetry(apiKey, modelId, prompt, 3000, provider, 2, onLog);
    const PRICE_PER_1M_INPUT = 3.0, PRICE_PER_1M_OUTPUT = 15.0;
    const inputCost = (specResult.inputTokens / 1_000_000) * PRICE_PER_1M_INPUT;
    const outputCost = (specResult.outputTokens / 1_000_000) * PRICE_PER_1M_OUTPUT;
    const totalCost = inputCost + outputCost;
    console.log(`[COST:Spec] in:${specResult.inputTokens} out:${specResult.outputTokens} = $${totalCost.toFixed(4)}`);
    metricsService.record({ phase: 'specagent', model: modelId, durationMs: Date.now() - _t0Spec, inputTokens: specResult.inputTokens, outputTokens: specResult.outputTokens, cost: totalCost, blockName });
    console.log('[SpecAgent] Response length:', specResult.text?.length);
    console.log('[SpecAgent] First 200 chars:', specResult.text?.slice(0, 200));
    console.log('[SpecAgent] Last 50 chars:', specResult.text?.slice(-50));
    console.log('[SpecAgent RAW]:', specResult);
    console.log(`[SpecAgent] Raw response (first 500 chars):`, specResult.text.slice(0, 500));
    const spec = parseJSON<AgentSpec>(specResult.text);
    if (!spec) throw new Error('SpecAgent вернул невалидный JSON');
    console.log(`[SpecAgent] ✅ Successfully parsed spec:`, { blockName: spec.blockName, featuresCount: spec.mustHaveFeatures?.length ?? 0, risksCount: spec.risks?.length ?? 0 });
    return spec;
  }

  // ── Confirm spec → Build + QA loop ───────────────────────────────────────

  static async confirmAndBuild(
    sessionId:      string,
    buildApiKey:    string,
    buildModelId:   string,
    qaApiKey:       string,
    qaModelId:      string,
    onStatus:       (status: string, detail: string) => void,
    onProgress:     (pct: number) => void,
    budget?:        TokenBudget,
    onBudgetUpdate?: (b: TokenBudget) => void,
    limitUsd = 1.0,
    startFromIteration = 1,
    buildProvider: ApiProvider = 'openrouter',
    qaProvider: ApiProvider = 'openrouter',
  ): Promise<void> {
    const session = await AgentLoopService.getAgentSessionById<AgentSession>(sessionId);

    if (!session) throw new Error('Сессия не найдена');

    if (!session.spec) throw new Error('Спецификация сессии не найдена');
    const spec: AgentSpec = session.spec;
    let files: Record<string, string> = session.isolated_files ?? {};

    // Build clarification context — prefer dedicated column, fallback to review_report
    let clarificationContext = '';
    const answers = session.clarify_answers as string[] | null;
    if (answers?.length) {
      clarificationContext = `\nУточнения от пользователя:\n${answers.map((a, i) => `${i + 1}. ${a}`).join('\n')}`;
    }
    if (session.review_report) {
      try {
        const report = JSON.parse(session.review_report);
        // Fallback for sessions created before phase-cache columns existed
        if (!answers?.length && report.clarification_answers?.length) {
          clarificationContext = `\nУточнения от пользователя:\n${(report.clarification_answers as string[]).map((a, i) => `${i + 1}. ${a}`).join('\n')}`;
        }
        if (report.user_refinement) {
          clarificationContext += `\n\nПРАВКА ОТ ПОЛЬЗОВАТЕЛЯ (обязательно учесть):\n${report.user_refinement}`;
        }
      } catch {
        // Ignore JSON parse errors
      }
    }

    await AgentLoopService.updateAgentSessionById(sessionId, {
      status:     'building',
      updated_at: new Date().toISOString(),
    });

    onStatus('building', 'BuildAgent: начинаю реализацию...');
    onProgress(10);

    const maxIter = session.max_iterations ?? 2;
    let fixContext = '';

    // Fetch protected files once before the build loop
    let protectedFiles: string[] = [];
    try {
      const mf = await fetch('/PROJECT_MANIFEST.json').then(r => r.json()) as { protected_files?: string[] };
      protectedFiles = mf.protected_files ?? [];
    } catch { /* manifest unavailable — skip protection */ }

    for (let iter = startFromIteration; iter <= maxIter; iter++) {
      onStatus('building', `BuildAgent: итерация ${iter}/${maxIter}`);
      onProgress(10 + iter * 14);

      // ── BuildAgent ───────────────────────────────────────────────────────
      // ── Install skeleton before first BuildAgent iteration ─────────────
      if (iter === startFromIteration) {
        const skId = selectSkeleton(spec.appType, spec.tags ?? []);
        try {
          await fetch('http://127.0.0.1:3000/api/skeleton/install', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skeletonId: skId }),
          });
          console.log('[BuildAgent] Skeleton installed:', skId);
        } catch (e) {
          console.warn('[BuildAgent] Skeleton install failed (non-fatal):', e);
        }
      }

      const buildPrompt = promptRegistry.getPrompt('build')
        .replace('{{SKELETON_BLOCK}}', (() => {
          const skId = selectSkeleton(spec.appType, spec.tags ?? []);
          return buildSkeletonPromptBlock(skId);
        })())
        .replace('{{PROTECTED_FILES_BLOCK}}', protectedFiles.length > 0
          ? `\nЗАЩИЩЁННЫЕ ФАЙЛЫ — ЗАПРЕЩЕНО ИЗМЕНЯТЬ:\n${protectedFiles.map(f => `- ${f}`).join('\n')}\n`
          : '')
        .replace('{{SPEC_JSON}}', JSON.stringify(spec, null, 2))
        .replace('{{CLARIFICATION_CONTEXT}}', clarificationContext)
        .replace('{{REUSE_COMPONENTS}}', spec.componentMap?.reuse?.join(', ') || 'см. spec')
        .replace('{{STYLING}}', spec.technicalDesign?.styling || 'Tailwind, dark theme')
        .replace('{{ANIMATIONS}}', spec.technicalDesign?.animations || 'Framer Motion или CSS transitions')
        .replace('{{STATE_MGMT}}', spec.technicalDesign?.stateManagement || 'React hooks')
        .replace('{{PROJECT_FILES}}', Object.entries(files)
          .filter(([n]) => !n.startsWith('_'))
          .map(([n, c]) => `### ${n}\n${c.slice(0, 1000)}`)
          .join('\n\n'))
        .replace('{{PROTECTED_FILES_NAMES}}', spec.protectedFiles.join(', '))
        .replace('{{FIX_CONTEXT}}', fixContext);

      console.log('[BuildAgent] Prompt size:', buildPrompt.length, 'chars');
      console.log('[BuildAgent] Files in context:', Object.keys(files).length);

      let buildResult: LLMResult;
      const _t0Build = Date.now();
      try {
        buildResult = await callLLMWithRetry(buildApiKey, buildModelId, buildPrompt, 4000, buildProvider);
        const PRICE_PER_1M_INPUT = 3.0, PRICE_PER_1M_OUTPUT = 15.0;
        const inputCost = (buildResult.inputTokens / 1_000_000) * PRICE_PER_1M_INPUT;
        const outputCost = (buildResult.outputTokens / 1_000_000) * PRICE_PER_1M_OUTPUT;
        const totalCost = inputCost + outputCost;
        console.log(`[COST:Build] in:${buildResult.inputTokens} out:${buildResult.outputTokens} = $${totalCost.toFixed(4)}`);
        metricsService.record({ phase: 'buildagent', model: buildModelId, durationMs: Date.now() - _t0Build, inputTokens: buildResult.inputTokens, outputTokens: buildResult.outputTokens, cost: totalCost, sessionId, extra: { iter } });
      } catch (err) {
        // Save session state on timeout/error before throwing
        const errorMsg = err instanceof Error ? err.message : String(err);
        const isTimeout = errorMsg.includes('AbortError') || errorMsg.includes('timeout');

        await AgentLoopService.updateAgentSessionById(sessionId, {
          status:         'paused',
          iterations:     iter - 1,
          isolated_files: files,
          updated_at:     new Date().toISOString(),
        });

        onStatus('paused', `Сессия приостановлена на итерации ${iter}. ${isTimeout ? 'Timeout (30s)' : errorMsg}. Нажми Resume чтобы продолжить.`);
        if (err instanceof Error) await handleSystemError(err, `BuildAgent iter ${iter}`, sessionId);
        throw err;
      }

      // ── Partial Recovery: стрим оборвался — сохраняем закрытые FILE-блоки ─
      if (buildResult.partial) {
        const recoveredFiles  = extractFiles(buildResult.text);
        const receivedCount   = Object.keys(recoveredFiles).length;
        const totalExpected   = spec.touchedFiles.length;

        metricsService.record({
          phase:     'network_recovery',
          sessionId,
          extra:     { type: 'stream_partial', receivedCount, totalExpected, iter },
        });

        if (receivedCount > 0) {
          files = { ...files, ...recoveredFiles };
          await AgentLoopService.updateAgentSessionById(sessionId, {
            status:        'partial_success',
            result_files:  files,
            iterations:    iter,
            review_report: `Частичное восстановление: получено ${receivedCount} файлов из ${totalExpected}`,
            updated_at:    new Date().toISOString(),
          });
          onStatus('partial_success', `Частичное восстановление: получено ${receivedCount} файлов из ${totalExpected}`);
        } else {
          await AgentLoopService.updateAgentSessionById(sessionId, {
            status:         'paused',
            isolated_files: files,
            iterations:     iter - 1,
            updated_at:     new Date().toISOString(),
          });
          onStatus('paused', 'Стрим прерван, файлов не восстановлено. Нажми Resume чтобы продолжить.');
        }
        return;
      }

      const buildRaw = buildResult.text;
      const newFiles = extractFiles(buildRaw);

      // ── Protected files guard ─────────────────────────────────────────────
      if (protectedFiles.length > 0 && Object.keys(newFiles).length > 0) {
        const violations = Object.keys(newFiles).filter(f =>
          protectedFiles.some(p => f.includes(p))
        );
        if (violations.length > 0) {
          await AgentLoopService.updateAgentSessionById(sessionId, {
            status:        'rejected',
            review_report: `Security Violation: attempt to modify protected files: ${violations.join(', ')}`,
            updated_at:    new Date().toISOString(),
          });
          onStatus('rejected', `Заблокировано: попытка изменить защищённые файлы: ${violations.join(', ')}`);
          return;
        }
      }

      if (Object.keys(newFiles).length > 0) files = { ...files, ...newFiles };
      if (budget && onBudgetUpdate) {
        budget.actualInputTokens  += buildResult.inputTokens;
        budget.actualOutputTokens += buildResult.outputTokens;
        budget.actualCostUsd      += calcCost(buildModelId, buildResult.inputTokens, buildResult.outputTokens);
        onBudgetUpdate({ ...budget });
        if (budget.actualCostUsd >= limitUsd) {
          budget.paused = true;
          budget.pausedAtIteration = iter;
          await AgentLoopService.updateAgentSessionById(sessionId, {
            status:      'building',
            qa_report:   { passed: false, issues: ['BUDGET_EXCEEDED'], warnings: [], summary: `Бюджет $${limitUsd} исчерпан на итерации ${iter}` },
            result_files: files,
            updated_at:  new Date().toISOString(),
          });
          onStatus('warn', `⏸ Бюджет $${limitUsd} исчерпан. Пополни баланс и нажми Resume.`);
          onBudgetUpdate({ ...budget });
          return;
        }
      }

      // ── QAAgent ──────────────────────────────────────────────────────────

      onStatus('qa_review', `QAAgent: проверяю итерацию ${iter}...`);
      onProgress(10 + iter * 14 + 7);

      const resultFiles = Object.entries(files)
        .filter(([n]) => spec.touchedFiles.some(tf => n.includes(tf.replace(/\//g, ''))))
        .map(([n, c]) => `### ${n}\n${c.slice(0, 2000)}`)
        .join('\n\n');

      const qaPrompt = promptRegistry.getPrompt('qa')
        .replace('{{CRITERIA_LIST}}', spec.criteria.join('\n'))
        .replace('{{MUST_HAVE_LIST}}', spec.mustHaveFeatures.join('\n'))
        .replace('{{RESULT_FILES}}', resultFiles);

      let qaResult: LLMResult;
      const _t0QA = Date.now();
      try {
        qaResult = await callLLMWithRetry(qaApiKey, qaModelId, qaPrompt, 1000, qaProvider);
        const PRICE_PER_1M_INPUT = 3.0, PRICE_PER_1M_OUTPUT = 15.0;
        const inputCost = (qaResult.inputTokens / 1_000_000) * PRICE_PER_1M_INPUT;
        const outputCost = (qaResult.outputTokens / 1_000_000) * PRICE_PER_1M_OUTPUT;
        const totalCost = inputCost + outputCost;
        console.log(`[COST:QA] in:${qaResult.inputTokens} out:${qaResult.outputTokens} = $${totalCost.toFixed(4)}`);
        metricsService.record({ phase: 'qaagent', model: qaModelId, durationMs: Date.now() - _t0QA, inputTokens: qaResult.inputTokens, outputTokens: qaResult.outputTokens, cost: totalCost, sessionId, extra: { iter } });
      } catch (err) {
        // Save session state on timeout/error before throwing
        const errorMsg = err instanceof Error ? err.message : String(err);
        const isTimeout = errorMsg.includes('AbortError') || errorMsg.includes('timeout');

        await AgentLoopService.updateAgentSessionById(sessionId, {
          status:         'paused',
          iterations:     iter,
          isolated_files: files,
          updated_at:     new Date().toISOString(),
        });

        onStatus('paused', `Сессия приостановлена на QA итерации ${iter}. ${isTimeout ? 'Timeout (30s)' : errorMsg}. Нажми Resume чтобы продолжить.`);
        if (err instanceof Error) await handleSystemError(err, `QAAgent iter ${iter}`, sessionId);
        throw err;
      }

      const qaRaw = qaResult.text;
      if (budget && onBudgetUpdate) {
        budget.actualInputTokens  += qaResult.inputTokens;
        budget.actualOutputTokens += qaResult.outputTokens;
        budget.actualCostUsd      += calcCost(qaModelId, qaResult.inputTokens, qaResult.outputTokens);
        onBudgetUpdate({ ...budget });
      }
      const qaReport = parseJSON<QAReport>(qaRaw);

      const report: QAReport = qaReport ?? {
        passed:   false,
        issues:   ['QAAgent вернул невалидный JSON'],
        warnings: [],
        summary:  qaRaw.slice(0, 200),
      };

      await AgentLoopService.updateAgentSessionById(sessionId, {
        iterations:   iter,
        result_files: files,
        qa_report:    report,
        updated_at:   new Date().toISOString(),
      });

      // ── Early stopping: если QA чист — прерываем цикл ─────────────────
      if (report.issues.length === 0 && report.warnings.length === 0) {
        onStatus('building', `✅ QA прошёл чисто на итерации ${iter} — останавливаем досрочно`);
        // Mark as passed and update to ready
        const cleanReport: QAReport = { passed: true, issues: [], warnings: [], summary: 'Пройден чистым кодом' };
        await AgentLoopService.updateAgentSessionById(sessionId, { qa_report: cleanReport });
        report.passed = true; // Trigger the ready flow below
      }

      if (report.passed) {
        // ── Guard: BuildAgent должен был создать файлы ────────────────────
        if (!newFiles || Object.keys(newFiles).length === 0) {
          onStatus('rejected', 'BuildAgent не создал файлы — сессия отклонена');
          await AgentLoopService.updateAgentSessionById(sessionId, {
            status:        'rejected',
            review_report: 'Error: result_files empty',
            updated_at:    new Date().toISOString(),
          });
          return;
        }

        onProgress(100);

        const reviewReport = [
          `## Отчёт: ${spec.blockName}`,
          '',
          `**Цель:** ${spec.goal}`,
          '',
          '**Реализовано:**',
          ...spec.mustHaveFeatures.map(f => `✅ ${f}`),
          '',
          '**Файлы:**',
          ...Object.keys(files).filter(n =>
            spec.touchedFiles.some(tf => n.includes(tf.replace(/\//g, '')))
          ),
          '',
          `**QA:** ${report.summary}`,
          `**Предупреждения:** ${report.warnings.join(', ') || 'нет'}`,
          '',
          '**Готово к подключению:** ДА',
        ].join('\n');

        await AgentLoopService.updateAgentSessionById(sessionId, {
          status:        'ready',
          review_report: reviewReport,
          updated_at:    new Date().toISOString(),
        });

        onStatus('ready', `✅ QA пройден на итерации ${iter}`);
        return;
      }

      // ── Build fixContext for next iteration ───────────────────────────
      if (report.fixStrategy) {
        const { priority, specificFixes, architecturalNotes } = report.fixStrategy;
        fixContext = `
ОТЧЁТ QA — ИСПРАВЬ ЭТО (итерация ${iter}):
Приоритет: ${priority}
${specificFixes.map(f => `Файл: ${f.file}\nПроблема: ${f.problem}\nРешение: ${f.solution}`).join('\n')}
Архитектурные замечания: ${architecturalNotes}
`;
      } else {
        fixContext = report.issues.length
          ? `\nОТЧЁТ QA (итерация ${iter}):\n${report.issues.join('\n')}\n`
          : '';
      }

      onStatus('building',
        `QA нашёл проблемы: ${report.issues.slice(0, 2).join(', ')}. Итерация ${iter + 1}...`
      );
    }

    // Max iterations reached
    await AgentLoopService.updateAgentSessionById(sessionId, {
      status:     'qa_review',
      updated_at: new Date().toISOString(),
    });

    onStatus('qa_review', '⚠️ Максимум итераций — требуется ручная проверка');
  }

  // ── Apply result to main project ─────────────────────────────────────────

  static async applySession(sessionId: string): Promise<Record<string, string>> {
    const session = await AgentLoopService.getAgentSessionById<{ result_files: Record<string, string> | null }>(
      sessionId,
      'result_files',
    );

    if (!session?.result_files) throw new Error('Нет результата для применения');

    await AgentLoopService.updateAgentSessionById(sessionId, {
      status:     'applied',
      updated_at: new Date().toISOString(),
    });

    return session.result_files as Record<string, string>;
  }

  // ── Reject session ────────────────────────────────────────────────────────

  static async rejectSession(sessionId: string): Promise<void> {
    await AgentLoopService.updateAgentSessionById(sessionId, {
      status:     'rejected',
      updated_at: new Date().toISOString(),
    });
  }

  // ── Resume session after pause/timeout ──────────────────────────────────

  static async resumeSession(
    sessionId: string,
    buildApiKey: string,
    buildModelId: string,
    qaApiKey: string,
    qaModelId: string,
    onStatus: (s: string, d: string) => void,
    onProgress: (p: number) => void,
    budget: TokenBudget,
    onBudgetUpdate: (b: TokenBudget) => void,
    limitUsd = 1.0,
    buildProvider: ApiProvider = 'openrouter',
    qaProvider: ApiProvider = 'openrouter',
  ): Promise<void> {
    // Load fresh session to get current iterations count
    const session = await AgentLoopService.getAgentSessionById<AgentSession>(sessionId);

    if (!session) throw new Error('Сессия не найдена для возобновления');

    // Resume from saved iteration count
    const startFromIteration = (session.iterations ?? 0) + 1;
    budget.paused = false;
    onStatus('building', `▶ Возобновляю с итерации ${startFromIteration}...`);

    await AgentLoopService.confirmAndBuild(
      sessionId, buildApiKey, buildModelId, qaApiKey, qaModelId,
      onStatus, onProgress, budget, onBudgetUpdate, limitUsd, startFromIteration, buildProvider, qaProvider,
    );
  }

  // ── Restart rejected session reusing cached spec (skip SpecAgent+Clarify) ──

  static async restartWithSpec(
    rejectedSessionId: string,
    onStatus: (status: string, detail: string) => void,
  ): Promise<string> {
    const source = await AgentLoopService.getAgentSessionById<AgentSession>(rejectedSessionId);

    if (!source?.spec_result) throw new Error('Нет сохранённого спека для перезапуска');

    const { data: newSession, error } = await AgentLoopService.runAgentSessionsQuery((userId) => (
      supabase
        .from('agent_sessions')
        .insert(AgentLoopService.withAgentSessionOwner({
          block_name:        source.block_name,
          status:            'spec_review',
          spec:              source.spec_result,
          spec_result:       source.spec_result,
          clarify_questions: source.clarify_questions ?? null,
          clarify_answers:   source.clarify_answers   ?? null,
          isolated_files:    source.isolated_files    ?? null,
          max_iterations:    source.max_iterations    ?? 2,
          // Re-inject clarify answers into review_report for confirmAndBuild
          review_report:     source.clarify_answers?.length
            ? JSON.stringify({ clarification_answers: source.clarify_answers })
            : null,
        }, userId))
        .select()
        .single()
    ));

    if (error || !newSession) {
      if (AgentLoopService.isRlsPolicyViolation(error)) {
        throw new Error('Agent Lab requires authentication. Please sign in with Google to create agent sessions.');
      }
      throw new Error('Не удалось создать сессию: ' + AgentLoopService.getAgentSessionsErrorMessage(error));
    }

    onStatus('spec_review', `Спек загружен из кэша — SpecAgent и ClarifyAgent пропущены`);
    return newSession.id as string;
  }

  // ── Answer clarification questions ────────────────────────────────────

  static async answerClarifications(
    sessionId: string,
    answers: string[],
  ): Promise<void> {
    const session = await AgentLoopService.getAgentSessionById<AgentSession>(sessionId);

    if (!session) throw new Error('Сессия не найдена');

    await AgentLoopService.updateAgentSessionById(sessionId, {
      status:          'spec_review',
      clarify_answers: answers,    // dedicated phase-cache column
      review_report:   JSON.stringify({ clarification_answers: answers }),
      updated_at:      new Date().toISOString(),
    });
  }

  // ── Refine session: one extra Build iteration with user feedback ──────────────

  static async refineSession(
    sessionId:    string,
    userFeedback: string,
    buildApiKey:  string,
    buildModelId: string,
    qaApiKey:     string,
    qaModelId:    string,
    onStatus:     (status: string, detail: string) => void,
    onProgress:   (pct: number) => void,
    budget?:      TokenBudget,
    onBudgetUpdate?: (b: TokenBudget) => void,
    limitUsd = 1.0,
    buildProvider: ApiProvider = 'openrouter',
    qaProvider:    ApiProvider = 'openrouter',
  ): Promise<void> {
    const session = await AgentLoopService.getAgentSessionById<AgentSession>(sessionId);

    if (!session) throw new Error('Сессия не найдена');

    const newMax   = (session.max_iterations ?? 2) + 1;
    const nextIter = (session.iterations ?? 0) + 1;

    let existingReport: Record<string, unknown> = {};
    if (session.review_report) {
      try { existingReport = JSON.parse(session.review_report); } catch { /* ignore */ }
    }

    await AgentLoopService.updateAgentSessionById(sessionId, {
      status:         'building',
      max_iterations: newMax,
      review_report:  JSON.stringify({ ...existingReport, user_refinement: userFeedback }),
      updated_at:     new Date().toISOString(),
    });

    onStatus('building', `Доработка: итерация ${nextIter}...`);

    await AgentLoopService.confirmAndBuild(
      sessionId, buildApiKey, buildModelId, qaApiKey, qaModelId,
      onStatus, onProgress, budget, onBudgetUpdate, limitUsd,
      nextIter, buildProvider, qaProvider,
    );
  }

  // ── Load all sessions ─────────────────────────────────────────────────────

  static async getSessions(): Promise<AgentSession[]> {
    const { data } = await AgentLoopService.runAgentSessionsQuery((userId) => {
      if (!userId) {
        // TODO(P1.4B): keep legacy unscoped getSessions() reads in local/dev until the user_id migration lands.
      }

      let query = supabase
        .from('agent_sessions')
        .select('*');

      query = AgentLoopService.scopeAgentSessionsQuery(query, userId);
      return query.order('created_at', { ascending: false });
    });

    return (data ?? []) as AgentSession[];
  }

  // ── Delete single session ──────────────────────────────────────────────────

  static async deleteSession(sessionId: string): Promise<void> {
    await AgentLoopService.runAgentSessionsQuery((userId) => {
      let query = supabase
        .from('agent_sessions')
        .delete()
        .eq('id', sessionId);

      query = AgentLoopService.scopeAgentSessionsQuery(query, userId);
      return query;
    });
  }

  // ── Delete old pending sessions (>1 hour) ──────────────────────────────────

  static async deleteOldPendingSessions(): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { error, count } = await AgentLoopService.runAgentSessionsQuery((userId) => {
      let query = supabase
        .from('agent_sessions')
        .delete()
        .lt('created_at', oneHourAgo)
        .eq('status', 'pending');

      query = AgentLoopService.scopeAgentSessionsQuery(query, userId);
      return query;
    });

    if (error) {
      console.error('[AgentLoopService] Failed to delete old sessions:', error);
      return 0;
    }
    return count ?? 0;
  }

  // ── Cleanup stalled building sessions ────────────────────────────────────
  //
  // Sessions stuck in 'building' with updated_at older than STALL_MINUTES
  // are considered stalled (process died / tab closed mid-build).
  // Moves them to 'failed' with a stalled_timeout reason.

  static readonly STALL_MINUTES = 30;

  static async cleanupStalledSessions(): Promise<number> {
    const stallCutoff = new Date(
      Date.now() - AgentLoopService.STALL_MINUTES * 60 * 1000,
    ).toISOString();

    // Find stalled sessions
    const { data: stalled, error: fetchErr } = await AgentLoopService.runAgentSessionsQuery((userId) => {
      if (!userId) {
        // TODO(P1.4B): keep legacy unscoped stalled-session reads in local/dev until the user_id migration lands.
      }

      let query = supabase
        .from('agent_sessions')
        .select('id')
        .eq('status', 'building')
        .lt('updated_at', stallCutoff);

      query = AgentLoopService.scopeAgentSessionsQuery(query, userId);
      return query;
    });

    if (fetchErr || !stalled?.length) return 0;

    const ids = stalled.map((s: { id: string }) => s.id);

    const { error: updateErr } = await AgentLoopService.runAgentSessionsQuery((userId) => {
      let query = supabase
        .from('agent_sessions')
        .update({
          status:        'failed',
          review_report: JSON.stringify({ reason: 'stalled_timeout', stall_minutes: AgentLoopService.STALL_MINUTES }),
          updated_at:    new Date().toISOString(),
        });

      query = AgentLoopService.scopeAgentSessionsQuery(query, userId);
      return query.in('id', ids);
    });

    if (updateErr) {
      console.error('[AgentLoopService] cleanupStalledSessions failed:', updateErr);
      return 0;
    }

    console.info(`[AgentLoopService] Archived ${ids.length} stalled building session(s)`);
    return ids.length;
  }
}



