/**
 * planner.ts — generates a step-by-step app plan in the user's language.
 *
 * Design decisions:
 * - No clarifying questions: plan is generated immediately.
 * - Language is passed by the caller (detected from the user's prompt).
 * - In E2E / Playwright runs (PLAYWRIGHT_TEST=1) caller pins language to 'ru'.
 * - Returns GenerationPlan; caller is responsible for dispatching.
 */

import { callLLM, buildPlannerSystemPrompt } from './llm-service';

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
    id:   string;
    type: 'generation-plan';
    data: GenerationPlan;
  };
}

export type DispatchFn = (action: DispatchAction) => void;

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
 * Generate a structured app plan. Returns GenerationPlan; never throws
 * (falls back to a minimal plan on error so the caller can always continue).
 * Caller is responsible for dispatching the result and for logging.
 *
 * @param userPrompt - Raw text from the user.
 * @param userLang   - BCP-47 tag, e.g. 'ru' | 'en'. Caller detects/pins this.
 * @param options    - Optional apiKey, modelId, AbortSignal.
 */
export async function generatePlan(
  userPrompt: string,
  userLang:   string,
  options: {
    apiKey?:  string;
    modelId?: string;
    signal?:  AbortSignal;
  } = {},
): Promise<GenerationPlan> {
  const systemPrompt = buildPlannerSystemPrompt(userLang);

  let plan: GenerationPlan;
  try {
    const { content } = await callLLM({
      systemPrompt,
      userPrompt,
      apiKey:    options.apiKey  ?? '',
      modelId:   options.modelId,
      maxTokens: 1024,
      signal:    options.signal,
    });
    plan = parsePlan(content);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    console.error('[planner] LLM call failed, using fallback plan:', err);
    plan = fallbackPlan(userPrompt);
  }

  return plan;
}

/**
 * Convenience wrapper: generate plan and immediately dispatch it.
 * Logs '[planner] plan generated, dispatching' before calling dispatch.
 */
export async function generateAndDispatch(
  userPrompt: string,
  userLang:   string,
  dispatch:   DispatchFn,
  options: {
    apiKey?:  string;
    modelId?: string;
    signal?:  AbortSignal;
  } = {},
): Promise<GenerationPlan> {
  const plan = await generatePlan(userPrompt, userLang, options);
  console.log('[planner] plan generated, dispatching', plan);
  dispatch({
    type: 'APPEND',
    payload: {
      id:   crypto.randomUUID(),
      type: 'generation-plan',
      data: plan,
    },
  });
  return plan;
}
