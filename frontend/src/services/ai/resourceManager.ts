import { ConfigService } from '../ConfigService';

/**
 * resourceManager.ts — Autonomous AI Resource Manager v1
 *
 * Context-Aware Routing: classifies the current task by complexity and
 * selects the optimal model from a tiered pool. Called from useStudio
 * when autoRoute mode is enabled.
 *
 * Tier 1 — Lightweight: syntax fixes, style tweaks, JSON validation
 * Tier 2 — Professional: architecture, SQL schemas, business logic
 * Tier 3 — Expert: security audits, blueprints, critical algorithms
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type Tier = 1 | 2 | 3;

export interface ModelConfig {
  id:        string;    // OpenRouter model ID
  name:      string;    // Human-readable display name
  tier:      Tier;
  costPer1k: number;    // Approximate $ per 1k tokens (blended input+output)
  strengths: string[];  // Tags used for signal matching
  primary?:  boolean;   // Default pick for the tier
}

export interface RoutingDecision {
  model:    ModelConfig;
  tier:     Tier;
  taskType: string;   // Detected task category label
  reason:   string;   // Full log-ready explanation
}

// ── Model Pool ────────────────────────────────────────────────────────────────

export const MODEL_POOL: ModelConfig[] = [

  // ── TIER 1: Lightweight / Fast / Cheap ────────────────────────────────────
  {
    id:        'google/gemini-2.0-flash-001',
    name:      'Gemini 2.0 Flash',
    tier:      1,
    costPer1k: 0.00015,
    strengths: ['syntax', 'debug', 'style', 'fast', 'simple', 'json',
                'import', 'typo', 'color', 'rename', 'comment', 'white-screen', 'question', 'text'],
    primary:   true,
  },
  {
    id:        'openai/gpt-4o-mini',
    name:      'GPT-4o Mini',
    tier:      1,
    costPer1k: 0.00015,
    strengths: ['json', 'simple-logic', 'ui-tweak'],
  },

  // ── TIER 2: Professional / Balanced ───────────────────────────────────────
  {
    id:        'google/gemini-2.5-pro-preview',
    name:      'Gemini 2.5 Pro',
    tier:      2,
    costPer1k: 0.00125,
    strengths: ['architecture', 'sql', 'business-logic', 'integration',
                'refactor', 'multi-file', 'state', 'new-feature', 'phase'],
    primary:   true,
  },
  {
    id:        'deepseek/deepseek-v3',
    name:      'DeepSeek V3',
    tier:      2,
    costPer1k: 0.00014,
    strengths: ['code', 'sql', 'algorithm', 'api-integration', 'backend'],
  },
  {
    id:        'openai/gpt-4o',
    name:      'GPT-4o',
    tier:      2,
    costPer1k: 0.005,
    strengths: ['architecture', 'multi-file', 'complex-logic', 'new-feature'],
  },

  // ── TIER 3: Expert / Critical ─────────────────────────────────────────────
  // T3 always resolves to the Build Agent model (Settings → Agents → Build).
  // Static entries below are fallbacks if Build Agent is not configured.
  {
    id:        'google/gemini-2.5-pro-preview',
    name:      'Gemini 2.5 Pro (Expert)',
    tier:      3,
    costPer1k: 0.00125,
    strengths: ['security', 'blueprint', 'full-app', 'critical',
                'reasoning', 'complex-algorithm', 'payment', 'full-product'],
    primary:   true,
  },
  {
    id:        'openai/o3-mini',
    name:      'OpenAI o3-mini',
    tier:      3,
    costPer1k: 0.0011,
    strengths: ['reasoning', 'algorithm', 'math', 'critical-logic', 'security'],
  },
];

// ── Task Classification Rules ─────────────────────────────────────────────────

interface TaskRule {
  pattern:  RegExp;
  taskType: string;
  tier:     Tier;
  signal:   string;
}

const TASK_RULES: TaskRule[] = [

  // ── TIER 1 — fast/cheap ───────────────────────────────────────────────────
  { pattern: /fix\s+(typo|indent|spacing|alignment)/i,              taskType: 'Style Fix',          tier: 1, signal: 'typo/indent fix' },
  { pattern: /change\s+(the\s+)?(color|font|size|padding|margin)/i, taskType: 'Style Tweak',        tier: 1, signal: 'style property change' },
  { pattern: /add\s+(a\s+)?(comment|tooltip|title|label)/i,        taskType: 'Comment / Label',    tier: 1, signal: 'adding comment/label' },
  { pattern: /\brename\s+/i,                                        taskType: 'Rename',             tier: 1, signal: 'rename symbol' },
  { pattern: /syntax\s+error|parse\s+error/i,                       taskType: 'Syntax Fix',         tier: 1, signal: 'syntax error debug' },
  { pattern: /white\s+screen|blank\s+screen/i,                      taskType: 'Debug (White Screen)',tier: 1, signal: 'white screen debug' },
  { pattern: /check\s+(the\s+)?import|fix\s+import/i,              taskType: 'Import Check',       tier: 1, signal: 'import check/fix' },
  { pattern: /json\s+(valid|parse|format|fix)/i,                    taskType: 'JSON Validation',    tier: 1, signal: 'JSON task' },
  { pattern: /^\s*(what|explain|why\s+is|how\s+does)/i,            taskType: 'Question',           tier: 1, signal: 'question only' },
  { pattern: /update\s+(the\s+)?text|change\s+(the\s+)?label/i,    taskType: 'Text Update',        tier: 1, signal: 'text/label change' },

  // ── TIER 2 — balanced ─────────────────────────────────────────────────────
  { pattern: /architect(ure)?/i,                                    taskType: 'Architecture',       tier: 2, signal: 'architecture design' },
  { pattern: /\bsql\b|schema|supabase|postgres/i,                   taskType: 'SQL / DB',           tier: 2, signal: 'SQL/DB work' },
  { pattern: /business\s+logic|calculat|formula|workflow/i,         taskType: 'Business Logic',     tier: 2, signal: 'business logic' },
  { pattern: /api\s+(layer|service|integrat|endpoint)/i,            taskType: 'API Integration',    tier: 2, signal: 'API integration layer' },
  { pattern: /\brefactor\b|\brestructure\b/i,                       taskType: 'Refactor',           tier: 2, signal: 'code refactoring' },
  { pattern: /multi[-\s]file|multiple\s+files/i,                    taskType: 'Multi-File Build',   tier: 2, signal: 'multi-file project' },
  { pattern: /state\s+management|context\s+api/i,                   taskType: 'State Architecture', tier: 2, signal: 'state management' },
  { pattern: /new\s+(feature|component|module|page|screen)/i,       taskType: 'New Feature',        tier: 2, signal: 'new feature' },
  { pattern: /realtime|websocket|subscription/i,                    taskType: 'Realtime',           tier: 2, signal: 'realtime integration' },
  { pattern: /phase\s*[123]/i,                                      taskType: 'Phase Build',        tier: 2, signal: 'phased build step' },
  { pattern: /dashboard|admin\s+panel|full\s+ui/i,                  taskType: 'Full UI Build',      tier: 2, signal: 'full UI/dashboard' },

  // ── TIER 3 — expert/reasoning ─────────────────────────────────────────────
  { pattern: /\[technical\s*&?\s*market\s+analysis\]/i,             taskType: 'Blueprint',          tier: 3, signal: 'Blueprint activation' },
  { pattern: /security\s+(audit|review|check|vulnerab)/i,           taskType: 'Security Audit',     tier: 3, signal: 'security audit' },
  { pattern: /payment.*logic|stripe.*webhook|billing\s+system/i,    taskType: 'Payment Logic',      tier: 3, signal: 'payment critical logic' },
  { pattern: /encrypt|cryptograph|oauth|jwt\s+secret/i,             taskType: 'Crypto / Auth',      tier: 3, signal: 'cryptography/auth' },
  { pattern: /entire\s+app|full\s+app|rebuild\s+from\s+scratch/i,   taskType: 'Full App Build',     tier: 3, signal: 'full app rebuild' },
  { pattern: /critical\s+(algorithm|logic|system)/i,                taskType: 'Critical Algorithm', tier: 3, signal: 'critical algorithm' },
  { pattern: /\bml\s+model\b|neural\s+network|train\s+ai/i,        taskType: 'ML / AI Logic',      tier: 3, signal: 'ML/AI integration' },
  { pattern: /production[\s-]ready|deploy\s+to|launch\s+ready/i,   taskType: 'Production Polish',  tier: 3, signal: 'production readiness' },
];

// ── ResourceManager ───────────────────────────────────────────────────────────

export const ResourceManager = {

  /**
   * Classify a user message + current project state to determine the optimal tier.
   */
  classifyTask(
    message: string,
    files:   Record<string, string>,
  ): { tier: Tier; taskType: string; signals: string[] } {
    const signals:     string[] = [];
    let detectedTier:  Tier     = 1;
    let detectedTask:  string   = 'Simple Edit';

    // Pattern scan — highest tier match wins
    for (const rule of TASK_RULES) {
      if (rule.pattern.test(message)) {
        signals.push(rule.signal);
        if (rule.tier > detectedTier) {
          detectedTier = rule.tier;
          detectedTask = rule.taskType;
        }
      }
    }

    const fileCount = Object.keys(files).length;
    const wordCount = message.trim().split(/\s+/).length;

    // Heuristic: long messages or many files → bump to T2 minimum
    if (detectedTier === 1 && (fileCount > 3 || wordCount > 80)) {
      detectedTier = 2;
      detectedTask = 'Complex Edit';
      signals.push(`heuristic: ${fileCount} files / ${wordCount} words → T2`);
    }

    // Heuristic: new project with non-trivial prompt → T2
    if (fileCount === 0 && wordCount > 40 && detectedTier < 2) {
      detectedTier = 2;
      detectedTask = 'New App';
      signals.push('heuristic: new project + long prompt → T2');
    }

    return { tier: detectedTier, taskType: detectedTask, signals };
  },

  /**
   * Select the best model for the current task.
   *
   * Routing by agent slot (Settings → Engine → Agents):
   *   T1 / T2 (light–balanced) → Primary Agent model
   *   T3       (expert)         → Build Agent model
   *
   * No model is hardcoded here — both slots resolve through ConfigService
   * (localStorage agent config → AGENT_DEFAULTS → neutral fallback).
   */
  selectModel(
    message: string,
    files:   Record<string, string>,
  ): RoutingDecision {
    const { tier, taskType, signals } = this.classifyTask(message, files);
    const signalList = signals.length > 0 ? signals.join(' · ') : 'default routing';

    if (tier === 3) {
      const modelId = ConfigService.resolveModel('build');
      const model: ModelConfig = {
        id: modelId, name: 'Build Agent', tier: 3, costPer1k: 0,
        strengths: ['security', 'blueprint', 'full-app', 'critical', 'reasoning'],
      };
      return { model, tier, taskType,
        reason: `[AUTO] Build Agent (T3) → ${modelId} for "${taskType}" — ${signalList}` };
    }

    const modelId = ConfigService.resolveModel('primary');
    const model: ModelConfig = {
      id: modelId, name: 'Primary Agent', tier, costPer1k: 0,
      strengths: ['syntax', 'style', 'architecture', 'multi-file', 'new-feature'],
    };
    return { model, tier, taskType,
      reason: `[AUTO] Primary Agent (T${tier}) → ${modelId} for "${taskType}" — ${signalList}` };
  },

  /** Utility: get primary model ID for a given tier. */
  getPrimaryForTier(tier: Tier): string {
    return tier === 3
      ? ConfigService.resolveModel('build')
      : ConfigService.resolveModel('primary');
  },

  /** Tier badge label for UI display. */
  tierLabel(tier: Tier): string {
    return tier === 1 ? 'T1 · Fast'
         : tier === 2 ? 'T2 · Pro'
         :              'T3 · Expert';
  },
};
