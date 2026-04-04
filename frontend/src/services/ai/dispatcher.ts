/**
 * Dispatcher — Economic Intelligence Layer
 *
 * Routes self-correction tasks to the cheapest capable model.
 * Enforces attempt limits and budget guards before every API call.
 *
 * Priority order for each correction:
 *   1. Local regex (free, zero API cost)
 *   2. Lightweight model  (Gemini Flash — cheap)
 *   3. Main model         (escalation, max 2 API attempts total)
 */

import { ConfigService } from '../ConfigService';

// ── Task taxonomy ──────────────────────────────────────────────────────────────

export type TaskType =
  | 'syntax_fix'   // JSX close tags, className — local-fixable
  | 'ui_fix'       // Style/layout adjustments
  | 'debug'        // Runtime error diagnosis
  | 'format'       // Code formatting / indentation
  | 'architect'    // System design, multi-file structure
  | 'logic'        // Business logic, algorithms
  | 'feature'      // New feature implementation
  | 'blueprint';   // Full app blueprint generation

export interface DispatchDecision {
  model:     string;
  tier:      'lightweight' | 'main';
  maxTokens: number;
  reason:    string;
}

export interface BudgetStatus {
  allowed:  boolean;
  spent:    number;
  warning?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

// LIGHTWEIGHT_MODEL removed — resolved dynamically via ConfigService.resolveModel('fix')

/** Max API correction attempts per user request (local fix is free, not counted) */
export const MAX_ATTEMPTS = 2;

/** Warn user when this fraction of $1 budget is spent */
const BUDGET_WARN  = 0.70;

/** Block auto-fix API calls above this fraction */
const BUDGET_BLOCK = 0.90;

/** Budget cap in USD (matches App.tsx apiWalletPct denominator = $1) */
const BUDGET_LIMIT = 1.00;

// ── Attempt tracking (module-level, keyed by sessionId) ───────────────────────

const _attempts: Record<string, number> = {};

// ── Local fixers (pure regex, zero API cost) ──────────────────────────────────

const LOCAL_FIXERS: Array<{ test: RegExp; fix: (c: string) => string }> = [
  {
    // HTML class= → JSX className=
    test: /(\s)class=(["'])/,
    fix:  (c) => c.replace(/(\s)class=(["'])/g, '$1className=$2'),
  },
  {
    // Self-close void elements missing trailing slash
    test: /<(input|img|br|hr|meta|link)\b([^>]*[^/])>/,
    fix:  (c) => c.replace(/<(input|img|br|hr|meta|link)\b([^>]*[^/])>/g, '<$1$2 />'),
  },
];

// ── Dispatcher ────────────────────────────────────────────────────────────────

export const Dispatcher = {

  // ── Task classification ──────────────────────────────────────────────────

  /**
   * Classify a user message or internal context into a TaskType.
   * Used to decide which model tier handles the request.
   */
  classifyTask(message: string, opts: { isAutoCorrect?: boolean } = {}): TaskType {
    if (opts.isAutoCorrect) return 'syntax_fix';
    const m = message.toLowerCase();
    if (/\[technical\s*&?\s*market/i.test(message))            return 'blueprint';
    if (/architect|entire\s+app|full\s+system|from\s+scratch/i.test(m)) return 'architect';
    if (/new\s+(feature|component|page|module)/i.test(m))      return 'feature';
    if (/\b(logic|algorithm|calculation|formula|scoring)/i.test(m)) return 'logic';
    if (/\b(debug|error|crash|broken|white.*screen)/i.test(m)) return 'debug';
    if (/\b(style|layout|color|padding|margin|font|align)/i.test(m)) return 'ui_fix';
    if (/\b(format|indent|spacing|lint|prettier)/i.test(m))    return 'format';
    return 'debug';
  },

  // ── Model selection ──────────────────────────────────────────────────────

  /**
   * Select the model for a given task type.
   * Auxiliary tasks (debug/fix/format/ui) → lightweight.
   * Architecture/logic/feature/blueprint → main model.
   */
  selectModel(taskType: TaskType, mainModel: string): DispatchDecision {
    const isLight = ['syntax_fix', 'ui_fix', 'debug', 'format'].includes(taskType);
    if (isLight) {
      const lightModel = ConfigService.resolveModel('fix');
      return {
        model:     lightModel,
        tier:      'lightweight',
        maxTokens: 8000,
        reason:    `${taskType} → lightweight (${lightModel})`,
      };
    }
    return {
      model:     mainModel,
      tier:      'main',
      maxTokens: 12000,
      reason:    `${taskType} → main model (${mainModel})`,
    };
  },

  // ── Budget guard ─────────────────────────────────────────────────────────

  /**
   * Read api_spent from STUDIO_MANIFEST in localStorage.
   * Returns whether another API correction call is affordable.
   */
  checkBudget(): BudgetStatus {
    try {
      const raw      = localStorage.getItem('STUDIO_MANIFEST');
      const manifest = raw ? JSON.parse(raw) : null;
      const spent    = (manifest?.api_spent ?? 0) as number;
      const ratio    = spent / BUDGET_LIMIT;

      if (ratio >= BUDGET_BLOCK) {
        return {
          allowed: false,
          spent,
          warning: `Budget guard: $${spent.toFixed(4)} spent (${Math.round(ratio * 100)}% of $${BUDGET_LIMIT}). Auto-fix blocked to protect balance.`,
        };
      }
      if (ratio >= BUDGET_WARN) {
        return {
          allowed: true,
          spent,
          warning: `Budget low: $${spent.toFixed(4)} (${Math.round(ratio * 100)}%). Lightweight model only.`,
        };
      }
      return { allowed: true, spent };
    } catch {
      return { allowed: true, spent: 0 }; // fail-open: don't block on parse error
    }
  },

  // ── Attempt tracking ─────────────────────────────────────────────────────

  /** Returns true if another API attempt is allowed for this session. */
  canAttempt(sessionId: string): boolean {
    return (_attempts[sessionId] ?? 0) < MAX_ATTEMPTS;
  },

  /** Record one API attempt consumed for this session. */
  recordAttempt(sessionId: string): void {
    _attempts[sessionId] = (_attempts[sessionId] ?? 0) + 1;
  },

  /** How many API attempts have been used for this session. */
  attemptsUsed(sessionId: string): number {
    return _attempts[sessionId] ?? 0;
  },

  /** Reset attempt counter — call at the start of each new user request. */
  resetAttempts(sessionId: string): void {
    delete _attempts[sessionId];
  },

  // ── Local fixer ──────────────────────────────────────────────────────────

  /**
   * Attempt to fix common JSX issues with pure regex — zero API cost.
   * Returns the fixed code string, or null if nothing was applicable.
   */
  localFix(code: string): string | null {
    let result = code;
    let didFix = false;
    for (const { test, fix } of LOCAL_FIXERS) {
      if (test.test(result)) {
        result = fix(result);
        didFix = true;
      }
    }
    return didFix ? result : null;
  },

  maxAttempts: MAX_ATTEMPTS,
};
