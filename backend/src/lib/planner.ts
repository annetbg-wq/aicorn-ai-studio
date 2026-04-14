/**
 * planner.ts — generates a step-by-step app plan in the user's language.
 *
 * Design decisions:
 * - No clarifying questions: plan is generated immediately.
 * - Language is auto-detected from the user's prompt.
 * - In E2E / Playwright runs (PLAYWRIGHT_TEST=1) language is pinned to 'ru'
 *   so snapshot assertions stay deterministic.
 * - Result is always dispatched as:
 *     { type: 'APPEND', payload: { type: 'generation-plan', data: plan } }
 */

import { detectLang, callLLM, buildPlannerSystemPrompt, LLMConfig } from './llm-service';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlanStep {
  id:     string;
  label:  string;
  status: 'pending' | 'active' | 'done';
}

export interface GenerationPlan {
  appName:     string;
  summary:     string;
  pages:       string[];
  steps:       PlanStep[];
  assumptions: string[];
}

export interface DispatchAction {
  type:    'APPEND';
  payload: {
    type: 'generation-plan';
    data: GenerationPlan;
  };
}

export type DispatchFn = (action: DispatchAction) => void;

export interface PlannerConfig {
  userPrompt: string;
  apiKey:     string;
  modelId?:   string;
  dispatch:   DispatchFn;
  signal?:    AbortSignal;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parsePlan(raw: string): GenerationPlan {
  const cleaned = raw.trim().replace(/^```json?\s*\n?/, '').replace(/\n?```\s*$/, '');
  const parsed  = JSON.parse(cleaned) as Partial<GenerationPlan>;

  const steps: PlanStep[] = (parsed.steps ?? []).map((s, i) => ({
    id:     (s as any).id     ?? `step_${i}`,
    label:  (s as any).label  ?? '',
    status: i === 0 ? 'active' : 'pending',
  }));

  return {
    appName:     parsed.appName     ?? 'App',
    summary:     parsed.summary     ?? '',
    pages:       Array.isArray(parsed.pages) ? parsed.pages : [],
    steps,
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
  };
}

function fallbackPlan(userPrompt: string): GenerationPlan {
  return {
    appName: 'App',
    summary: userPrompt.slice(0, 120),
    pages:   ['Home'],
    steps: [
      { id: 'think',     label: 'Analyzing your idea',    status: 'active'  },
      { id: 'architect', label: 'Designing architecture', status: 'pending' },
      { id: 'code',      label: 'Writing code',           status: 'pending' },
      { id: 'theme',     label: 'Applying theme',         status: 'pending' },
      { id: 'save',      label: 'Saving project',         status: 'pending' },
    ],
    assumptions: ['Could not generate a detailed plan; proceeding with defaults.'],
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generate an app plan for `userPrompt` and call `dispatch` with the result.
 * Never throws (errors produce a fallback plan so generation can continue).
 */
export async function generatePlan(config: PlannerConfig): Promise<void> {
  const { userPrompt, apiKey, dispatch, signal } = config;

  // Determine language — pin to 'ru' in E2E test runs for determinism.
  let userLang = detectLang(userPrompt);
  if (process.env['PLAYWRIGHT_TEST'] === '1') userLang = 'ru';

  const systemPrompt = buildPlannerSystemPrompt(userLang);

  const llmConfig: LLMConfig = {
    systemPrompt,
    userPrompt,
    apiKey,
    modelId:   config.modelId,
    maxTokens: 1024,
    signal,
  };

  let plan: GenerationPlan;
  try {
    const { content } = await callLLM(llmConfig);
    plan = parsePlan(content);
  } catch (err) {
    // Re-throw AbortError so callers can handle cancellation properly.
    if (err instanceof Error && err.name === 'AbortError') throw err;
    console.error('[planner] LLM call failed, using fallback plan:', err);
    plan = fallbackPlan(userPrompt);
  }

  dispatch({
    type: 'APPEND',
    payload: {
      type: 'generation-plan',
      data: plan,
    },
  });
}
