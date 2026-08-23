import { ConfigService } from './ConfigService';
import { GeminiService } from './GeminiService';
import { Orchestrator } from './Orchestrator';
import { supabase } from '../lib/supabase';
import {
  getLocalDevAgentProvider,
  isLocalDevAgentEnabled,
  syncLocalDevAgentMode,
} from './devAgentMode';
import type { ProjectPlan } from './types/ProjectPlan';

export interface ProductIdea {
  id: string;
  title: string;
  pitch: string;
  marketGap: string;
  visualTag: string;
  unfairAdvantage?: string;
  buyerReason?: string;
  generatedAt?: string;
}

export interface ProductBlueprint extends ProjectPlan {
  id: string;
  sourceIdea: ProductIdea;
  visualTag: string;
  packageSummary: string;
  authFlow: {
    type: string;
    provider?: string;
    onboardingSteps: Array<{
      id: string;
      title: string;
      goal: string;
      ahaMoment?: string;
    }>;
  };
  monetization: {
    model: string;
    paywall: {
      trigger: string;
      limits: string[];
      upgradeMessage: string;
    };
  };
  databaseSchema: {
    sql: string;
    tables: Array<{
      name: string;
      purpose: string;
    }>;
  };
  aiLogic: {
    features: Array<{
      name: string;
      purpose: string;
      model: string;
      trigger: string;
      systemPrompt: string;
      outputContract: string;
    }>;
  };
  fileArchitecture: Array<{
    path: string;
    role: string;
    purpose: string;
  }>;
  premiumUiDirectives: string[];
}

export interface IdeaPlan extends ProjectPlan {
  id: string;
  marketContext: string;
  targetAudience: string;
  painPoint: string;
  competitorGap: string;
  generatedAt: string;
}

export const IDEA_FEED_STORAGE_KEYS = {
  hotIdeas: 'aic_ideas_hot',
  niches: 'aic_ideas_niches',
  bank: 'aic_ideas_bank',
  trendNiches: 'aic_trend_niches',
  trendBank: 'aic_trend_niches_bank',
  trendInterests: 'aic_trend_niches_interests',
  trendRefreshCounter: 'aic_trend_niches_refresh_counter',
} as const;

const IDEA_FEED_EVENT = 'aic:idea-feed-updated';

function emitIdeaFeedUpdate(key: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(IDEA_FEED_EVENT, { detail: { key } }));
}

export function getIdeaFeedEventName(): string {
  return IDEA_FEED_EVENT;
}

export function needsHotRefresh(date: string): boolean {
  return new Date(date).toDateString() !== new Date().toDateString();
}

export function getWeekNumber(): number {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
}

export function needsNicheRefresh(week: string): boolean {
  return parseInt(week, 10) !== getWeekNumber();
}

export function hasIdeaGenerationAccess(googleAccessToken?: string | null): boolean {
  return isLocalDevAgentEnabled() || Boolean(
    googleAccessToken || ConfigService.getKeyForAgent('primary') || ConfigService.getApiKey(),
  );
}

export const PLAN_SCHEMA = `{
  "appName": "Human readable product name — specific, not generic",
  "description": "One sentence: the core value proposition",
  "theme": "dark-slate|trust|warm|neon|bloom",
  "targetUser": "Specific person: role, context, pain point",
  "productStrategy": {
    "coreAction": "The ONE thing this app does better than anything else",
    "retentionLoop": "What brings the user back daily/weekly",
    "businessModel": "free|freemium|subscription|one-time",
    "paywall": {
      "needed": false,
      "trigger": "After 5 saved items / After 7-day trial / After 3 exports",
      "lockedFeature": "What feature is behind the paywall",
      "upgradeMessage": "Specific, benefit-focused upgrade prompt"
    }
  },
  "userJourney": {
    "onboarding": {
      "needed": false,
      "reason": "Why this app needs onboarding — what user data is required",
      "steps": [
        {
          "question": "What is your main goal?",
          "type": "single-choice|multi-choice|text-input|date-picker",
          "options": ["Option A", "Option B", "Option C"],
          "storesIn": "userProfile.goal"
        }
      ],
      "completionAction": "After onboarding → navigate to /home with personalized content"
    },
    "firstSession": "What the user sees and does in their first 5 minutes",
    "returningSession": "What the user sees when they come back tomorrow"
  },
  "layout": {
    "type": "single|tabs|sidebar|dashboard|wizard",
    "navigation": "none|top-nav|bottom-tabs|sidebar|stepper",
    "primaryColor": "The emotional color for this product"
  },
  "uxPatterns": {
    "emptyStates": true,
    "loadingSkeletons": false,
    "searchAndFilter": false,
    "animations": "subtle"
  },
  "responsiveness": {
    "primaryDevice": "mobile|tablet|desktop",
    "mobileFirst": true,
    "maxWidth": "max-w-md for mobile apps, max-w-6xl for desktop tools"
  },
  "pages": [
    {
      "path": "/onboarding",
      "name": "Onboarding",
      "file": "pages/Onboarding.tsx",
      "purpose": "Collect minimum user data to personalize the experience",
      "isMainScreen": false,
      "showInNav": false,
      "guard": "show only if !localStorage.getItem('onboarding_complete')",
      "uiSpec": "Multi-step wizard. Step indicator. Large tappable answer buttons. 100+ words describing every element."
    },
    {
      "path": "/",
      "name": "Home",
      "file": "pages/Home.tsx",
      "purpose": "Main workspace",
      "isMainScreen": true,
      "showInNav": true,
      "guard": "redirect to /onboarding if !onboarding_complete",
      "uiSpec": "DETAILED description 100+ words — every section top to bottom, every interactive element, empty state, mobile layout"
    },
    {
      "path": "/settings",
      "name": "Settings",
      "file": "pages/Settings.tsx",
      "purpose": "User preferences, account, subscription status",
      "isMainScreen": false,
      "showInNav": true,
      "uiSpec": "Profile section, Preferences, Subscription (if paid), Data export/clear, App info."
    }
  ],
  "authFlow": {
    "type": "none|local-only|supabase",
    "localFirst": true,
    "reason": "Why this app does or doesn't need authentication"
  },
  "dataModel": {
    "entities": [
      {
        "name": "EntityName",
        "fields": "id: string, field: type",
        "storage": "localStorage key: 'key_name'"
      }
    ],
    "seedData": {
      "needed": true,
      "reason": "App must not feel empty on first launch",
      "examples": [
        "3 realistic domain-specific sample items"
      ]
    },
    "sharedState": "What context/state lives in App.tsx"
  },
  "criticalUiRules": ["Specific rule 1", "Specific rule 2"],
  "shadcnComponents": ["Button", "Card", "Input"],
  "icons": ["Home", "Settings", "Plus"]
}`;

const DISCOVERY_IDEA_SCHEMA = `{
  "id": "kebab-case-unique-id",
  "title": "Specific product concept name",
  "pitch": "2-3 sentences: what it is, why it feels fresh, and why a buyer would choose it",
  "marketGap": "What incumbents or substitutes miss",
  "visualTag": "Premium UI Kit style such as Modern SaaS, Glassmorphism, Minimal Editorial, Neon Control Room",
  "unfairAdvantage": "What makes this concept hard to copy or unusually attractive",
  "buyerReason": "Why a customer would pay, switch, or adopt now",
  "generatedAt": "${new Date().toISOString()}"
}`;

function buildHotIdeasPrompt(): string {
  return `You are a product strategist with real-time internet access and deep knowledge of emerging markets.
Today is ${new Date().toDateString()}.

Generate 3 unique discovery concepts based on current trends, recent news, and emerging user needs.

This is the DISCOVERY FEED stage.
Do NOT design code, folders, pages, SQL, or technical architecture yet.
Focus on:
- Unfair Advantage
- why a buyer would adopt or pay
- what gap the market is leaving open
- which Premium UI Kit style best fits the concept

RULES:
- Be specific: not "AI productivity app" but "margin recovery cockpit for Shopify brands hit by return fraud"
- Keep each concept inspiring, commercial, and easy to scan
- visualTag must reference a Premium UI Kit direction such as "Modern SaaS" or "Glassmorphism"
- Do not output technical implementation, page maps, auth plans, or code structure
- NEVER use words: landing page, SaaS, MVP, webapp

For each idea use this EXACT schema:

${DISCOVERY_IDEA_SCHEMA}

Output: JSON array of 3 discovery idea objects. No markdown. No explanation.`;
}

function buildNichesPrompt(): string {
  return `You are a market analyst tracking emerging opportunities in digital products.
Week ${getWeekNumber()} of ${new Date().getFullYear()}.

Analyze 3 trending niches RIGHT NOW — specifically what is growing THIS week based on:
- Recent regulatory changes
- New technology releases
- Seasonal patterns
- Emerging consumer behaviors
- Underserved demographics

For each niche, generate a discovery concept for the best product opportunity inside it.

This is NOT the architecture stage.
Do NOT design pages, code, SQL, folders, onboarding flows, or technical implementation.
Focus on:
- the niche's unfair advantage right now
- why a buyer would choose it over substitutes
- the missing market wedge
- which Premium UI Kit style best matches the concept

RULES:
- Be specific: not "AI tools" but "AI tools for independent insurance adjusters"
- marketGap must describe a real weakness, not just "better UX"
- No generic niches like "health", "finance", "productivity"
- visualTag must reference a Premium UI Kit direction such as "Modern SaaS" or "Glassmorphism"
- Do not output technical implementation, page maps, auth plans, or code structure
- NEVER use words: landing page, SaaS, MVP

Use this EXACT schema:

${DISCOVERY_IDEA_SCHEMA}

Output: JSON array of 3 discovery idea objects. No markdown. No explanation.`;
}

function isTrendNicheInterest(value: unknown): value is TrendNicheInterest {
  return typeof value === 'string' && VALID_TREND_INTERESTS.has(value as TrendNicheInterest);
}

function getLanguageName(language?: string): string {
  const lang = normalizeLanguage(language);
  return {
    en: 'English',
    ru: 'Russian',
    es: 'Spanish',
    de: 'German',
    fr: 'French',
    zh: 'Simplified Chinese',
  }[lang] ?? 'English';
}

function getTrendRefreshSeed(force = false): number {
  try {
    const current = Number.parseInt(localStorage.getItem(IDEA_FEED_STORAGE_KEYS.trendRefreshCounter) ?? '0', 10);
    const safeCurrent = Number.isFinite(current) ? current : 0;
    if (!force) return safeCurrent;
    const next = safeCurrent + 1;
    localStorage.setItem(IDEA_FEED_STORAGE_KEYS.trendRefreshCounter, String(next));
    return next;
  } catch {
    return force ? Date.now() : 0;
  }
}

function buildTrendCadencePrompt(
  cadence: TrendNicheCadence,
  language = 'en',
  selectedInterest?: TrendNicheInterest | null,
  refreshSeed = 0,
  excludeTopics: string[] = [],
): string {
  const lang = normalizeLanguage(language);
  const directRule = selectedInterest ? TREND_INTEREST_DIRECT_PRODUCT_RULES[selectedInterest] : null;
  const interestMeta = selectedInterest
    ? TREND_NICHE_INTERESTS.find(item => item.id === selectedInterest)
    : null;
  const interestLabel = interestMeta?.labels[lang] ?? interestMeta?.labels.en ?? selectedInterest ?? '';

  // Rotate the seed-window so LLM anchors on different sub-topics each refresh
  const focusWindow = directRule?.focuses.length
    ? (() => {
        const total = directRule.focuses.length;
        const offset = refreshSeed % Math.max(1, total - 2);
        return directRule.focuses.slice(offset, offset + 3).map(f => f.subjectEn);
      })()
    : [];

  // ── Per-cadence depth profile ──────────────────────────────────────────────
  // Each cadence has a distinct time horizon, signal type AND analytical depth.
  // daily  = surface signal → quick-win product, 1–2 fields of analysis
  // weekly = validated trend → business model sketched, retention loop named
  // monthly = structural shift → full competitive landscape, monetisation path
  const cadenceCopy = {
    daily: {
      horizon: 'the next 24–72 hours',
      trendSignal: 'surfacing RIGHT NOW on Google Trends, X/Twitter, TikTok, Reddit, or Product Hunt in the US or EU',
      rule: 'Bias toward fast, recurring daily problems — something a user encounters every day and would fix immediately.',
      depth: `DEPTH — DAILY SIGNAL (shallow sweep):
- Identify the raw viral/search spike (1 sentence)
- Name the daily recurring pain it exposes
- Describe the product in 1–2 sentences: what it does the moment you open it
- competitorGap: what the top app in this space currently fails to do TODAY
Do NOT write a business model, retention analysis, or financial projection.`,
    },
    weekly: {
      horizon: 'the next 1–3 weeks',
      trendSignal: 'gaining traction THIS WEEK in US/EU markets — App Store charts, VC deal flow, or sustained search growth over 7 days',
      rule: 'Pick signals with clear weekly growth momentum. The product builds a habit or recurring weekly workflow.',
      depth: `DEPTH — WEEKLY TREND (medium analysis):
- State the trend signal and its 7-day growth trajectory
- Define the target user persona (role, context, frustration level)
- Describe the core weekly habit the product enables
- Name the retention loop: what brings the user back every 7 days
- competitorGap: where existing weekly tools (Notion, Todoist, Calendly, etc.) leave users stranded
Do NOT write a full financial model or multi-year roadmap.`,
    },
    monthly: {
      horizon: 'the next 1–3 months',
      trendSignal: 'emerging as a durable market shift THIS MONTH — regulatory changes, macroeconomic shifts, new platform APIs, or a measurable consumer behavior change in the US or EU',
      rule: 'Pick signals with compounding growth over months. The product captures a structural shift, not a fad.',
      depth: `DEPTH — MONTHLY SHIFT (deep structural analysis):
- Describe the macro signal: regulation, platform API, demographic shift, or economic pressure
- Estimate the addressable segment in the US or EU (qualitative: niche / mid-market / mass)
- Map the competitive landscape: who dominates now, who is most vulnerable, and why
- Outline the business model: how does the product monetise in months 3–12
- Explain the compounding advantage: why this product gets harder to copy over time
- competitorGap: what structural weakness in incumbents or substitutes this product exploits`,
    },
  }[cadence];

  const categoryList = TREND_NICHE_INTERESTS.map(item => `"${item.id}"`).join(', ');

  const excludeBlock = excludeTopics.length > 0
    ? `TOPIC EXCLUSION — the following sub-topics have already been covered in longer-horizon ideas for this session. Do NOT generate ideas on these subjects (even from a different angle):\n${excludeTopics.map(t => `- ${t}`).join('\n')}\nChoose completely different problem spaces.`
    : '';

  const trendInstructions = selectedInterest
    ? `Focus ONLY on the "${interestLabel}" (${selectedInterest}) market in the US and EU.
Each idea must be grounded in a real, specific trend signal ${cadenceCopy.trendSignal} within "${interestLabel}".
The product must BE the consumer/user-facing solution in this space — not tooling, admin, or back-office for that market.
${directRule ? `\nCRITICAL: ${directRule.promptDirective}` : ''}
${focusWindow.length > 0 ? `\nFor inspiration on which sub-niches to explore (do NOT copy literally — use as a direction and add fresh market angles): ${focusWindow.map(s => `"${s}"`).join(', ')}.` : ''}`
    : `Scan the US and EU startup landscape. Each idea must be anchored in a DIFFERENT real market trend signal ${cadenceCopy.trendSignal}.
Cover 3 different verticals or user problems. Avoid repeating the same domain.`;

  return `You are a startup trend analyst and product strategist with deep knowledge of the US and EU markets.
Today is ${new Date().toDateString()}. Week ${getWeekNumber()} of ${new Date().getFullYear()}.

Your task: identify 3 high-signal startup product opportunities ${cadenceCopy.horizon}.
${cadenceCopy.rule}

${cadenceCopy.depth}

MARKET SCOPE: United States and European Union primarily. Focus on:
- Google Trends breakout queries (US/EU)
- App Store / Play Store rising charts
- Reddit, TikTok, X viral pain points
- VC funding signals and accelerator Demo Days
- New platform APIs, regulatory changes, or behavior shifts

${trendInstructions}

${excludeBlock}

${refreshSeed > 0
  ? `VARIATION REQUIRED (seed=${refreshSeed}): These ideas must be COMPLETELY DIFFERENT from any previously generated set. Do not repeat app names, problem framings, or subject areas from previous generations.`
  : ''}

For each idea, the "marketContext" MUST cite a concrete, real trend signal — a named behavior shift, search trend, platform change, or market event happening RIGHT NOW. Not generic statements like "the market is growing".

Write EVERY human-readable field in ${getLanguageName(lang)}. This includes appName, description, targetUser, marketContext, targetAudience, painPoint, competitorGap.
Do not switch back to English unless a proper noun requires it.

Use this EXACT JSON schema for each idea:
{
  "id": "kebab-case-unique-id",
  "appName": "Human readable product name — specific, not generic",
  "description": "One sentence: the core value proposition",
  "theme": "dark-slate|trust|warm|neon|bloom",
  "targetUser": "Specific person: role, context, pain point",
  "categories": [${selectedInterest ? `"${selectedInterest}"` : categoryList}],
  "marketContext": "Specific real trend signal (search spike, viral moment, platform change, regulatory shift) happening NOW in US or EU that makes this the right time to build",
  "targetAudience": "Specific end user — role, context, and current frustration",
  "painPoint": "The exact recurring problem the trend is exposing",
  "competitorGap": "What existing apps, content, or substitutes fail to do that this product would solve",
  "generatedAt": "${new Date().toISOString()}"
}

RULES:
- categories must contain 1-3 items chosen only from: [${categoryList}]
- ${selectedInterest ? `categories must include "${selectedInterest}" on every idea` : 'categories must match the actual domain of the idea'}
- Each idea must have a DIFFERENT and SPECIFIC trend signal in marketContext (no generic "growing market" statements)
- The product is the end-user-facing solution, not internal tooling or dashboards
- NEVER use the words: landing page, SaaS, MVP
- Do NOT generate generic ideas like "AI assistant for everyone"
- Primary target: US and EU users

Output: JSON array of 3 plan objects. No markdown. No explanation.`;
}

export function safeParseJSONArray(raw: string): Record<string, unknown>[] {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    const parsed: unknown = JSON.parse(cleaned);
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [parsed as Record<string, unknown>];
  } catch {
    // partial recovery below
  }

  const objects: Record<string, unknown>[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try { objects.push(JSON.parse(cleaned.slice(start, i + 1)) as Record<string, unknown>); } catch { /* ignore */ }
        start = -1;
      }
    }
  }

  return objects;
}

export async function runIdeaModelPrompt(
  prompt: string,
  googleAccessToken?: string | null,
): Promise<string> {
  let devAgentProvider = getLocalDevAgentProvider();
  try {
    const modeResp = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000'}/dev-agent-mode`);
    if (modeResp.ok) {
      devAgentProvider = syncLocalDevAgentMode(await modeResp.json());
    }
  } catch {
    // bridge unreachable: keep local mode as fallback
  }
  const devAgentActive = devAgentProvider !== 'off';

  let text = '';
  let bridgeFailureReason: string | null = null;

  if (devAgentActive) {
    const bridgeCtrl = new AbortController();
    const bridgeTimeoutMs = 180_000;
    const bridgeTimer = window.setTimeout(() => bridgeCtrl.abort(), bridgeTimeoutMs);
    try {
      const bridgeResp = await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000'}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: bridgeCtrl.signal,
        body: JSON.stringify({
          message: prompt,
          model: devAgentProvider === 'codex' ? 'gpt-5.1-codex' : 'claude-sonnet-4-6',
        }),
      });

      if (!bridgeResp.ok) {
        const err = await bridgeResp.text().catch(() => '');
        bridgeFailureReason = `HTTP ${bridgeResp.status}${err ? `: ${err.slice(0, 200)}` : ''}`;
      } else {
        const bridgeData = await bridgeResp.json() as { content?: Array<{ text?: string }> };
        text = bridgeData.content?.[0]?.text ?? '';
        if (!text.trim()) {
          bridgeFailureReason = 'empty response';
        }
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') {
        bridgeFailureReason = `timed out after ${Math.round(bridgeTimeoutMs / 1000)}s`;
      } else {
        bridgeFailureReason = (err as Error)?.message ?? String(err);
      }
    } finally {
      window.clearTimeout(bridgeTimer);
    }
    if (bridgeFailureReason) {
      console.warn(
        `[IdeaModel] Local ${devAgentProvider} bridge unavailable (${bridgeFailureReason}). Falling back to standard model flow.`,
      );
    }
  }

  const IDEA_PACKAGING_TIMEOUT_MS = 60_000;

  if (!text.trim()) {
    // Try Gemini first (if Google token available), then fall back to the
    // configured standard LLM provider (DeepSeek, OpenRouter, etc.)
    try {
      text = await Promise.race([
        (async () => {
          // 1. Gemini path (requires Google token)
          if (googleAccessToken) {
            const geminiText = await GeminiService.generate({
              prompt,
              googleAccessToken,
              maxTokens: 6000,
              onLog: (msg) => console.log(msg),
            }).catch(() => '');
            if (geminiText.trim()) return geminiText;
          }

          // 2. Standard provider path (DeepSeek / OpenRouter / OpenAI / etc.)
          const agentCfg = ConfigService.getAgentConfig('agent_primary');
          const provider = agentCfg.provider || 'openrouter';
          const apiKey = ConfigService.getKeyForAgent('primary') || ConfigService.getApiKey();
          if (!apiKey) throw new Error(`No API key configured. Set your ${provider} key in Settings.`);

          const endpoint = Orchestrator.getEndpoint(provider);
          const rawModelId = agentCfg.modelId || ConfigService.resolveModel('primary');
          const modelId = Orchestrator.normalizeModelId(rawModelId, endpoint);

          const resp = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: modelId,
              messages: [{ role: 'user', content: prompt }],
              max_tokens: 6000,
              temperature: 0.7,
            }),
          });
          if (!resp.ok) {
            const err = await resp.text().catch(() => '');
            throw new Error(`${provider} API error ${resp.status}: ${err.slice(0, 200)}`);
          }
          const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
          return data.choices?.[0]?.message?.content ?? '';
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Idea packaging timed out after 60s. Check your API key in Settings.')),
            IDEA_PACKAGING_TIMEOUT_MS,
          ),
        ),
      ]);
    } catch (fallbackErr) {
      const fallbackMessage = (fallbackErr as Error)?.message ?? String(fallbackErr);
      if (bridgeFailureReason) {
        throw new Error(
          `Dev-agent bridge unavailable (${bridgeFailureReason}). Standard idea-model fallback failed: ${fallbackMessage}`,
        );
      }
      throw fallbackErr;
    }
  }

  if (!text.trim()) {
    if (bridgeFailureReason) {
      throw new Error(
        `Dev-agent bridge unavailable (${bridgeFailureReason}) and standard idea-model fallback returned empty output.`,
      );
    }
    throw new Error('Idea model returned an empty response.');
  }

  return text.trim();
}

export function normalizeProductIdea(raw: Record<string, unknown>): ProductIdea {
  return {
    id: String(raw.id ?? crypto.randomUUID()),
    title: String(raw.title ?? raw.appName ?? 'Untitled concept'),
    pitch: String(raw.pitch ?? raw.description ?? ''),
    marketGap: String(raw.marketGap ?? raw.competitorGap ?? raw.painPoint ?? ''),
    visualTag: String(raw.visualTag ?? raw.theme ?? 'Modern SaaS'),
    unfairAdvantage: String(raw.unfairAdvantage ?? '').trim() || undefined,
    buyerReason: String(raw.buyerReason ?? raw.marketContext ?? '').trim() || undefined,
    generatedAt: String(raw.generatedAt ?? new Date().toISOString()),
  };
}

export async function generateDiscoveryIdeas(
  prompt: string,
  count: number,
  googleAccessToken?: string | null,
): Promise<ProductIdea[]> {
  const text = await runIdeaModelPrompt(prompt, googleAccessToken);
  const raw = safeParseJSONArray(text);
  if (raw.length === 0) {
    throw new Error('Model returned an invalid ideas payload');
  }

  return raw.slice(0, count).map(normalizeProductIdea);
}

async function generateIdeas(
  prompt: string,
  count: number,
  googleAccessToken?: string | null,
): Promise<IdeaPlan[]> {
  const text = await runIdeaModelPrompt(prompt, googleAccessToken);

  const raw = safeParseJSONArray(text);
  if (raw.length === 0) {
    throw new Error('Model returned an invalid ideas payload');
  }

  return raw.slice(0, count).map((r) => ({
    ...r,
    appName: String(r.appName ?? 'Untitled'),
    description: String(r.description ?? ''),
    theme: String(r.theme ?? 'dark-slate'),
    targetUser: String(r.targetUser ?? ''),
    layout: (r.layout as ProjectPlan['layout']) ?? { type: 'single', navigation: 'none' },
    uxPatterns: (r.uxPatterns as ProjectPlan['uxPatterns']) ?? { emptyStates: true },
    responsiveness: (r.responsiveness as ProjectPlan['responsiveness']) ?? { primaryDevice: 'mobile', mobileFirst: true },
    pages: (r.pages as ProjectPlan['pages']) ?? [],
    dataModel: (r.dataModel as ProjectPlan['dataModel']),
    criticalUiRules: Array.isArray(r.criticalUiRules) ? (r.criticalUiRules as string[]) : [],
    shadcnComponents: Array.isArray(r.shadcnComponents) ? (r.shadcnComponents as string[]) : [],
    icons: Array.isArray(r.icons) ? (r.icons as string[]) : [],
    id: String(r.id ?? crypto.randomUUID()),
    marketContext: String(r.marketContext ?? ''),
    targetAudience: String(r.targetAudience ?? ''),
    painPoint: String(r.painPoint ?? ''),
    competitorGap: String(r.competitorGap ?? ''),
    generatedAt: String(r.generatedAt ?? new Date().toISOString()),
  } as IdeaPlan));
}

export function loadCachedHotIdeas(): ProductIdea[] {
  try {
    const raw = localStorage.getItem(IDEA_FEED_STORAGE_KEYS.hotIdeas);
    if (!raw) return [];
    const cached = JSON.parse(raw) as { ideas?: Record<string, unknown>[]; date?: string };
    return needsHotRefresh(cached.date ?? '')
      ? []
      : (cached.ideas ?? []).map((idea) => normalizeProductIdea(idea));
  } catch {
    return [];
  }
}

export function loadCachedNiches(): ProductIdea[] {
  try {
    const raw = localStorage.getItem(IDEA_FEED_STORAGE_KEYS.niches);
    if (!raw) return [];
    const cached = JSON.parse(raw) as { ideas?: Record<string, unknown>[]; week?: string };
    return needsNicheRefresh(cached.week ?? '')
      ? []
      : (cached.ideas ?? []).map((idea) => normalizeProductIdea(idea));
  } catch {
    return [];
  }
}

// ── Supabase idea_feed_cache helpers ────────────────────────────────────────

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getISOWeekKey(): string {
  const d = new Date();
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

async function fetchRemoteHotIdeas(): Promise<ProductIdea[] | null> {
  try {
    const { data, error } = await supabase
      .from('idea_feed_cache')
      .select('ideas')
      .eq('feed_type', 'hot')
      .eq('date_key', getTodayKey())
      .maybeSingle();
    if (error || !data) return null;
    const ideas = data.ideas as unknown[];
    if (!Array.isArray(ideas) || ideas.length === 0) return null;
    return ideas.map((idea) => normalizeProductIdea(idea as Record<string, unknown>));
  } catch {
    return null;
  }
}

async function fetchRemoteNicheIdeas(): Promise<ProductIdea[] | null> {
  try {
    const { data, error } = await supabase
      .from('idea_feed_cache')
      .select('ideas')
      .eq('feed_type', 'niches')
      .eq('week_key', getISOWeekKey())
      .maybeSingle();
    if (error || !data) return null;
    const ideas = data.ideas as unknown[];
    if (!Array.isArray(ideas) || ideas.length === 0) return null;
    return ideas.map((idea) => normalizeProductIdea(idea as Record<string, unknown>));
  } catch {
    return null;
  }
}

export async function ensureHotIdeas(
  googleAccessToken?: string | null,
  force = false,
): Promise<ProductIdea[]> {
  if (!force) {
    // 1. localStorage cache (fastest)
    const cached = loadCachedHotIdeas();
    if (cached.length > 0) return cached;

    // 2. Supabase remote cache (pre-generated by idea-cron)
    const remote = await fetchRemoteHotIdeas();
    if (remote && remote.length > 0) {
      localStorage.setItem(IDEA_FEED_STORAGE_KEYS.hotIdeas, JSON.stringify({
        ideas: remote,
        date: new Date().toISOString(),
      }));
      emitIdeaFeedUpdate(IDEA_FEED_STORAGE_KEYS.hotIdeas);
      console.log('[IdeaFeed] Loaded hot ideas from Supabase cache');
      return remote;
    }
  }

  // 3. Generate locally via LLM
  const ideas = await generateDiscoveryIdeas(buildHotIdeasPrompt(), 3, googleAccessToken);
  localStorage.setItem(IDEA_FEED_STORAGE_KEYS.hotIdeas, JSON.stringify({
    ideas,
    date: new Date().toISOString(),
  }));
  emitIdeaFeedUpdate(IDEA_FEED_STORAGE_KEYS.hotIdeas);
  return ideas;
}

export async function ensureNicheIdeas(
  googleAccessToken?: string | null,
  force = false,
): Promise<ProductIdea[]> {
  if (!force) {
    // 1. localStorage cache
    const cached = loadCachedNiches();
    if (cached.length > 0) return cached;

    // 2. Supabase remote cache
    const remote = await fetchRemoteNicheIdeas();
    if (remote && remote.length > 0) {
      localStorage.setItem(IDEA_FEED_STORAGE_KEYS.niches, JSON.stringify({
        ideas: remote,
        week: String(getWeekNumber()),
      }));
      emitIdeaFeedUpdate(IDEA_FEED_STORAGE_KEYS.niches);
      console.log('[IdeaFeed] Loaded niche ideas from Supabase cache');
      return remote;
    }
  }

  // 3. Generate locally
  const ideas = await generateDiscoveryIdeas(buildNichesPrompt(), 3, googleAccessToken);
  localStorage.setItem(IDEA_FEED_STORAGE_KEYS.niches, JSON.stringify({
    ideas,
    week: String(getWeekNumber()),
  }));
  emitIdeaFeedUpdate(IDEA_FEED_STORAGE_KEYS.niches);
  return ideas;
}

// ── Trend Niches first-class dashboard model ────────────────────────────────

export type TrendNicheCadence = 'daily' | 'weekly' | 'monthly';

export type TrendNicheInterest =
  | 'games'
  | 'medicine'
  | 'fintech'
  | 'wellness'
  | 'social'
  | 'productivity'
  | 'education'
  | 'commerce'
  | 'ai'
  | 'developer-tools';

export interface TrendNicheLocalizedCopy {
  title: string;
  description: string;
  audience: string;
  marketAngle: string;
  whyInteresting: string;
}

export interface TrendNicheIdea extends IdeaPlan {
  cadence: TrendNicheCadence;
  categories: TrendNicheInterest[];
  localized: Record<string, TrendNicheLocalizedCopy>;
}

export interface TrendIdeaBankItem {
  idea: TrendNicheIdea;
  savedAt: string;
  sentToChatCount: number;
  lastSentAt?: string;
}

export interface TrendNichesModel {
  daily: TrendNicheIdea[];
  weekly: TrendNicheIdea[];
  monthly: TrendNicheIdea[];
  generatedAt: string;
  dateKey: string;
  weekKey: string;
  monthKey: string;
  taskInterest?: TrendNicheInterest | null;
  languageKey?: string;
}

export const TREND_NICHE_INTERESTS: Array<{
  id: TrendNicheInterest;
  labels: Record<string, string>;
}> = [
  { id: 'games', labels: { en: 'Games', ru: 'Игры', es: 'Juegos', de: 'Games', fr: 'Jeux', zh: '游戏' } },
  { id: 'medicine', labels: { en: 'Medicine', ru: 'Медицина', es: 'Medicina', de: 'Medizin', fr: 'Médecine', zh: '医疗' } },
  { id: 'fintech', labels: { en: 'Fintech', ru: 'Финтех', es: 'Fintech', de: 'Fintech', fr: 'Fintech', zh: '金融科技' } },
  { id: 'wellness', labels: { en: 'Wellness', ru: 'Здоровье', es: 'Bienestar', de: 'Wellness', fr: 'Bien-être', zh: '健康' } },
  { id: 'social', labels: { en: 'Social', ru: 'Соцсервисы', es: 'Social', de: 'Social', fr: 'Social', zh: '社交' } },
  { id: 'productivity', labels: { en: 'Productivity', ru: 'Продуктивность', es: 'Productividad', de: 'Produktivität', fr: 'Productivité', zh: '效率' } },
  { id: 'education', labels: { en: 'Education', ru: 'Обучение', es: 'Educación', de: 'Bildung', fr: 'Éducation', zh: '教育' } },
  { id: 'commerce', labels: { en: 'Commerce', ru: 'Коммерция', es: 'Comercio', de: 'Commerce', fr: 'Commerce', zh: '电商' } },
  { id: 'ai', labels: { en: 'AI', ru: 'ИИ', es: 'IA', de: 'KI', fr: 'IA', zh: 'AI' } },
  { id: 'developer-tools', labels: { en: 'Developer Tools', ru: 'Инструменты разработки', es: 'Dev tools', de: 'Dev tools', fr: 'Dev tools', zh: '开发工具' } },
];

const VALID_TREND_INTERESTS = new Set<TrendNicheInterest>(TREND_NICHE_INTERESTS.map(item => item.id));

interface TrendInterestProfileCopy {
  forAudience: string;
  audience: string;
  signalSource: string;
  trigger: string;
  wedge: string;
}

interface TrendInterestProfile {
  theme: string;
  related: TrendNicheInterest[];
  primaryDevice: 'mobile' | 'desktop';
  en: TrendInterestProfileCopy;
  ru: TrendInterestProfileCopy;
}

interface TrendInterestFocus {
  subjectEn: string;
  subjectRu: string;
  audienceEn: string;
  audienceRu: string;
  dailyActionEn: string;
  dailyActionRu: string;
  outcomeEn: string;
  outcomeRu: string;
}

interface TrendInterestDirectProductRule {
  promptDirective: string;
  bannedPattern: RegExp;
  focuses: TrendInterestFocus[];
}

const TREND_INTEREST_PROFILES: Record<TrendNicheInterest, TrendInterestProfile> = {
  games: {
    theme: 'neon',
    related: ['social', 'ai'],
    primaryDevice: 'mobile',
    en: {
      forAudience: 'players',
      audience: 'Players looking for strong game feel, clear progression, and replayable sessions on mobile or desktop.',
      signalSource: 'emerging player tastes, co-op habits, short-session retention patterns, and social challenge formats',
      trigger: 'Players want game loops that feel immediately expressive, social, and replayable without heavy setup',
      wedge: 'It turns current player behavior into an actual playable game concept instead of a support tool around games',
    },
    ru: {
      forAudience: 'игроков',
      audience: 'Игроки, которым нужны игры с сильным game feel, понятной прогрессией и сессиями, в которые хочется возвращаться.',
      signalSource: 'новые вкусы игроков, кооперативные привычки, короткие retention-сессии и социальные форматы челленджей',
      trigger: 'Игрокам нужны игровые петли, которые сразу ощущаются живыми, социальными и переигрываемыми без долгого входа',
      wedge: 'Идея превращает актуальное поведение игроков в реальную игровую концепцию, а не в сервис вокруг игровой индустрии',
    },
  },
  medicine: {
    theme: 'trust',
    related: ['ai', 'productivity'],
    primaryDevice: 'desktop',
    en: {
      forAudience: 'small clinics',
      audience: 'Clinic managers, care coordinators, and nurses balancing high message volume with limited staff.',
      signalSource: 'patient requests, appointment changes, intake notes, and care follow-ups',
      trigger: 'Clinics are under pressure to coordinate more care digitally without adding administrative headcount',
      wedge: 'The product sits on a painful workflow and can prove value through time saved and fewer dropped requests',
    },
    ru: {
      forAudience: 'небольших клиник',
      audience: 'Администраторы клиник, care-координаторы и медсестры, которые разбирают большой поток запросов без роста штата.',
      signalSource: 'запросы пациентов, переносы визитов, intake-заметки и задачи на follow-up',
      trigger: 'Клиники вынуждены координировать все больше процессов в цифре, не наращивая административную команду',
      wedge: 'Продукт садится на острую операционную боль и может быстро показать ценность через экономию времени и меньше пропущенных запросов',
    },
  },
  fintech: {
    theme: 'trust',
    related: ['ai', 'productivity'],
    primaryDevice: 'mobile',
    en: {
      forAudience: 'fintech teams',
      audience: 'Small finance teams, freelancers, and operators managing money flow, compliance, and cash confidence.',
      signalSource: 'invoice events, payment delays, balance shifts, and customer exceptions',
      trigger: 'More independent workers and small teams want real-time finance guidance without enterprise finance tooling',
      wedge: 'The app can monetize a narrow but urgent pain around cash visibility, action prompts, and exportable records',
    },
    ru: {
      forAudience: 'финтех-команд',
      audience: 'Небольшие финкоманды, фрилансеры и операционные сотрудники, которым нужна уверенность в движении денег и статусе платежей.',
      signalSource: 'события по инвойсам, задержки оплат, сдвиги баланса и клиентские исключения',
      trigger: 'Соло-специалистам и малым командам нужны подсказки по деньгам в реальном времени без тяжелого финансового ПО',
      wedge: 'Приложение попадает в узкую, но срочную боль вокруг cash visibility, действий по оплатам и экспортируемых отчетов',
    },
  },
  wellness: {
    theme: 'bloom',
    related: ['medicine', 'ai'],
    primaryDevice: 'mobile',
    en: {
      forAudience: 'wellness programs',
      audience: 'Busy adults and wellness operators trying to turn advice into repeatable habits that actually stick.',
      signalSource: 'daily check-ins, fatigue patterns, calendar context, and habit signals',
      trigger: 'Wellness spend is shifting from passive content toward measurable routines and accountability loops',
      wedge: 'It gives buyers a repeatable behavior loop instead of another content library or generic tracker',
    },
    ru: {
      forAudience: 'wellness-программ',
      audience: 'Занятые специалисты и wellness-операторы, которым нужен не контент, а повторяемые привычки с измеримым результатом.',
      signalSource: 'ежедневные check-in, паттерны усталости, календарный контекст и сигналы привычек',
      trigger: 'Расходы на wellness смещаются от пассивного контента к измеримым рутинам и петлям ответственности',
      wedge: 'Продукт дает покупателю повторяемый поведенческий цикл вместо еще одной библиотеки контента или общего трекера',
    },
  },
  social: {
    theme: 'warm',
    related: ['commerce', 'ai'],
    primaryDevice: 'mobile',
    en: {
      forAudience: 'social products',
      audience: 'Creators, local brands, and community managers who need repeatable engagement without agency support.',
      signalSource: 'comments, post performance, community trends, and audience reactions',
      trigger: 'Social distribution keeps fragmenting, so teams need tools that turn proof and conversation into repeatable output',
      wedge: 'It bridges content creation and operational follow-through, not just vanity metrics',
    },
    ru: {
      forAudience: 'социальных продуктов',
      audience: 'Креаторы, локальные бренды и community-менеджеры, которым нужен устойчивый engagement без агентских процессов.',
      signalSource: 'комментарии, динамика постов, тренды комьюнити и реакции аудитории',
      trigger: 'Социальная дистрибуция дробится по каналам, поэтому командам нужны инструменты, которые превращают общение и proof в повторяемый контент',
      wedge: 'Продукт соединяет создание контента и операционное исполнение, а не ограничивается vanity-метриками',
    },
  },
  productivity: {
    theme: 'dark-slate',
    related: ['ai', 'developer-tools'],
    primaryDevice: 'desktop',
    en: {
      forAudience: 'productivity teams',
      audience: 'Operators, chiefs of staff, and knowledge workers coordinating recurring work across messy systems.',
      signalSource: 'tasks, handoffs, exceptions, deadlines, and workflow bottlenecks',
      trigger: 'Teams want execution systems that cut through tool sprawl instead of adding another passive dashboard',
      wedge: 'It can become a daily operating surface with clear ROI through fewer misses and faster handoffs',
    },
    ru: {
      forAudience: 'команд продуктивности',
      audience: 'Операционные менеджеры, chiefs of staff и knowledge workers, которые координируют повторяющуюся работу между разрозненными системами.',
      signalSource: 'задачи, передачи между ролями, исключения, дедлайны и bottleneck в процессах',
      trigger: 'Командам нужны системы исполнения, которые уменьшают зоопарк инструментов, а не добавляют еще один пассивный дашборд',
      wedge: 'Продукт может стать ежедневной операционной поверхностью с явным ROI через меньше промахов и более быстрые handoff',
    },
  },
  education: {
    theme: 'dark-slate',
    related: ['ai', 'productivity'],
    primaryDevice: 'mobile',
    en: {
      forAudience: 'education programs',
      audience: 'Students, instructors, and cohort operators trying to turn study plans into consistent progress.',
      signalSource: 'assignment status, weak topics, cohort patterns, and study behavior',
      trigger: 'Learners increasingly want AI that structures execution and revision, not just one-off answers',
      wedge: 'The retention loop is strong because plans, practice, and review compound over time',
    },
    ru: {
      forAudience: 'образовательных программ',
      audience: 'Студенты, преподаватели и операторы программ, которым нужен не совет, а устойчивый цикл планирования и повторения.',
      signalSource: 'статусы заданий, слабые темы, паттерны когорты и учебное поведение',
      trigger: 'Пользователям все чаще нужен ИИ, который управляет выполнением и повторением, а не просто разово отвечает на вопросы',
      wedge: 'Retention здесь сильный: план, практика и обзор результатов накапливают ценность неделя за неделей',
    },
  },
  commerce: {
    theme: 'warm',
    related: ['ai', 'social'],
    primaryDevice: 'mobile',
    en: {
      forAudience: 'commerce teams',
      audience: 'Small merchants and marketplace sellers protecting margins while keeping customer trust high.',
      signalSource: 'orders, return risks, fulfillment issues, and customer intent',
      trigger: 'Micro-commerce operators need practical tools that help them protect margin without rebuilding the store stack',
      wedge: 'The product can show measurable saved revenue and sit on top of existing channels',
    },
    ru: {
      forAudience: 'команд коммерции',
      audience: 'Небольшие продавцы и marketplace-операторы, которым нужно сохранять маржу и не терять доверие покупателей.',
      signalSource: 'заказы, риски возвратов, проблемы фулфилмента и сигналы намерения покупателя',
      trigger: 'Micro-commerce командам нужны практичные инструменты, которые защищают маржу без полной замены существующего магазина',
      wedge: 'Продукт может явно показывать сохраненную выручку и работать поверх уже существующих каналов продаж',
    },
  },
  ai: {
    theme: 'dark-slate',
    related: ['productivity', 'developer-tools'],
    primaryDevice: 'desktop',
    en: {
      forAudience: 'AI teams',
      audience: 'Founders and product teams shipping AI features that need guardrails, quality loops, and operational clarity.',
      signalSource: 'model runs, prompt failures, user feedback, and workflow exceptions',
      trigger: 'As more teams ship AI features, the bottleneck shifts from generation itself to reliability, control, and review',
      wedge: 'It wins by giving a concrete operating layer around AI output instead of another general-purpose chat box',
    },
    ru: {
      forAudience: 'ИИ-команд',
      audience: 'Фаундеры и продуктовые команды, которые запускают AI-функции и нуждаются в guardrail, quality loops и операционной прозрачности.',
      signalSource: 'запуски моделей, сбои промптов, user feedback и исключения в workflow',
      trigger: 'Чем больше команд запускают AI-функции, тем важнее становятся надежность, контроль и разбор качества, а не только сама генерация',
      wedge: 'Продукт выигрывает как конкретный операционный слой вокруг AI-результата, а не еще один общий чат-интерфейс',
    },
  },
  'developer-tools': {
    theme: 'dark-slate',
    related: ['ai', 'productivity'],
    primaryDevice: 'desktop',
    en: {
      forAudience: 'developer teams',
      audience: 'Engineering teams shipping quickly without enough release, QA, or workflow support.',
      signalSource: 'commits, pull requests, test results, incidents, and release notes',
      trigger: 'Faster code generation means more output to review, test, and release with confidence',
      wedge: 'The product slots into existing engineering rituals and proves value through fewer regressions and clearer release judgment',
    },
    ru: {
      forAudience: 'команд разработки',
      audience: 'Инженерные команды, которые выпускают быстрее, чем успевают усиливать release, QA и рабочие процессы.',
      signalSource: 'коммиты, pull request, результаты тестов, инциденты и release notes',
      trigger: 'Ускорение code generation увеличивает объем изменений, которые нужно проверять, тестировать и выпускать уверенно',
      wedge: 'Продукт встраивается в привычные инженерные ритуалы и быстро доказывает ценность через меньше регрессий и более понятный release judgment',
    },
  },
};

const TREND_INTEREST_DIRECT_PRODUCT_RULES: Record<TrendNicheInterest, TrendInterestDirectProductRule> = {
  games: {
    promptDirective: 'For "games", every idea must be the game itself: a playable game for players, with a core loop, progression, and player fantasy. Do NOT generate analytics tools, studio dashboards, creator utilities, live-ops consoles, or services that help teams build, market, or operate games.',
    bannedPattern: /(studio|studios|creator|creators|live-ops|dashboard|analytics|operator console|community manager|game team|developer tool|tooling layer|студи|создател|дашборд|аналит|операцион|комьюнити-менедж|для команд|инструмент для команды)/i,
    focuses: [],
  },
  medicine: {
    promptDirective: 'For "medicine", the product itself must help a person manage a real health outcome such as treatment adherence, symptom patterns, recovery, or family care. Do NOT generate clinic admin, EHR, intake, billing, scheduling, or staff workflow tools.',
    bannedPattern: /(clinic managers?|small clinics?|ehr|intake|front desk|patient inbox|care coordinators?|staff workflow|billing|scheduling|операцион|клиник|регистратур|админ|биллинг|расписан|dashboar|дашборд)/i,
    focuses: [
      {
        subjectEn: 'migraine recovery',
        subjectRu: 'контроль мигрени',
        audienceEn: 'people managing recurring migraines',
        audienceRu: 'люди с повторяющимися приступами мигрени',
        dailyActionEn: 'log triggers, follow recovery steps, and spot what helps',
        dailyActionRu: 'отмечают триггеры, проходят шаги восстановления и видят, что реально помогает',
        outcomeEn: 'reduce bad days and feel more in control',
        outcomeRu: 'реже выпадать из жизни и лучше контролировать состояние',
      },
      {
        subjectEn: 'medication adherence',
        subjectRu: 'соблюдение терапии',
        audienceEn: 'adults on long-term treatment plans',
        audienceRu: 'взрослые на длительном лечении',
        dailyActionEn: 'follow dose plans, reminders, and simple progress check-ins',
        dailyActionRu: 'следуют плану приема, reminders и коротким check-in по прогрессу',
        outcomeEn: 'stay consistent with treatment without constant outside supervision',
        outcomeRu: 'не срываться с терапии без постоянного внешнего контроля',
      },
      {
        subjectEn: 'joint rehab',
        subjectRu: 'реабилитация суставов',
        audienceEn: 'people recovering after knee or shoulder injuries',
        audienceRu: 'люди после травм колена или плеча',
        dailyActionEn: 'complete guided exercises, pain check-ins, and mobility goals',
        dailyActionRu: 'выполняют guided-упражнения, pain check-in и цели по подвижности',
        outcomeEn: 'return to movement with confidence',
        outcomeRu: 'уверенно возвращаться к движению',
      },
    ],
  },
  fintech: {
    promptDirective: 'For "fintech", the product itself must directly help the user move, save, budget, borrow, invest, or understand money. Do NOT generate fintech infrastructure, compliance ops, reconciliation, treasury consoles, or back-office tools for finance teams.',
    bannedPattern: /(fintech teams?|compliance ops|reconciliation|treasury|back office|risk desk|finance team|merchant ops|операцион|финтех-команд|комплаенс|сверк|казнач|бэк-офис|дашборд)/i,
    focuses: [
      {
        subjectEn: 'freelancer cashflow',
        subjectRu: 'кэшфлоу фрилансера',
        audienceEn: 'independent freelancers with uneven income',
        audienceRu: 'фрилансеры с неровным доходом',
        dailyActionEn: 'track invoices, tax reserves, and next money actions',
        dailyActionRu: 'ведут инвойсы, налоговый резерв и следующие денежные действия',
        outcomeEn: 'feel cash confidence week to week',
        outcomeRu: 'чувствовать контроль над деньгами из недели в неделю',
      },
      {
        subjectEn: 'family budgeting',
        subjectRu: 'семейный бюджет',
        audienceEn: 'couples and families sharing everyday spending',
        audienceRu: 'пары и семьи с общими повседневными расходами',
        dailyActionEn: 'plan spending, negotiate trade-offs, and stay inside shared limits',
        dailyActionRu: 'планируют траты, договариваются о компромиссах и держатся в общих лимитах',
        outcomeEn: 'argue less about money and save more intentionally',
        outcomeRu: 'меньше спорить о деньгах и осознаннее откладывать',
      },
      {
        subjectEn: 'saving for a first home',
        subjectRu: 'накопление на первое жилье',
        audienceEn: 'people preparing for their first apartment or house deposit',
        audienceRu: 'люди, которые копят на первый взнос за жилье',
        dailyActionEn: 'follow savings milestones, automate habits, and see progress clearly',
        dailyActionRu: 'идут по вехам накопления, автоматизируют привычки и ясно видят прогресс',
        outcomeEn: 'reach the deposit faster without losing motivation',
        outcomeRu: 'дойти до первого взноса быстрее и не потерять мотивацию',
      },
    ],
  },
  wellness: {
    promptDirective: 'For "wellness", the product itself must guide a person through daily habits and behavior change around sleep, stress, fitness, or nutrition. Do NOT generate studio admin, coach dashboards, or program management software.',
    bannedPattern: /(wellness operators?|program managers?|coach dashboard|studio owners?|admin tool|оператор|операцион|студи|dashboard|дашборд|менеджер программы)/i,
    focuses: [
      {
        subjectEn: 'sleep reset',
        subjectRu: 'восстановление сна',
        audienceEn: 'adults whose sleep schedule keeps drifting',
        audienceRu: 'взрослые, у которых постоянно сбивается режим сна',
        dailyActionEn: 'follow evening cues, morning check-ins, and recovery rituals',
        dailyActionRu: 'следуют вечерним подсказкам, morning check-in и ритуалам восстановления',
        outcomeEn: 'wake up with more stability and energy',
        outcomeRu: 'просыпаться стабильнее и с большим запасом энергии',
      },
      {
        subjectEn: 'stress recovery',
        subjectRu: 'восстановление после стресса',
        audienceEn: 'busy professionals carrying constant nervous tension',
        audienceRu: 'занятые специалисты с постоянным нервным напряжением',
        dailyActionEn: 'complete short breathwork, body resets, and mood reflection loops',
        dailyActionRu: 'проходят короткие breathwork-сессии, телесные reset-практики и рефлексию по состоянию',
        outcomeEn: 'recover faster instead of staying in background burnout',
        outcomeRu: 'быстрее восстанавливаться, а не жить в фоновом выгорании',
      },
      {
        subjectEn: 'nutrition consistency',
        subjectRu: 'стабильное питание',
        audienceEn: 'people trying to eat better without rigid dieting',
        audienceRu: 'люди, которые хотят питаться лучше без жестких диет',
        dailyActionEn: 'plan simple meals, log friction, and keep a realistic rhythm',
        dailyActionRu: 'планируют простые приемы пищи, фиксируют трение и держат реалистичный ритм',
        outcomeEn: 'feel steady progress without constant relapse guilt',
        outcomeRu: 'видеть устойчивый прогресс без постоянного чувства срыва',
      },
    ],
  },
  social: {
    promptDirective: 'For "social", the product itself must be the place where users meet, talk, share, or organize social interaction. Do NOT generate creator tools, social media analytics, scheduling software, agency workflows, or brand dashboards.',
    bannedPattern: /(creator tools?|brand managers?|community managers?|agency|social distribution|post performance|scheduler|analytics|операцион|креатор|бренд|комьюнити-менедж|агентств|аналит|постинг|дашборд)/i,
    focuses: [
      {
        subjectEn: 'local dinner circles',
        subjectRu: 'локальные ужин-круги',
        audienceEn: 'adults who want real recurring offline connection',
        audienceRu: 'взрослые, которым нужны реальные регулярные офлайн-встречи',
        dailyActionEn: 'discover nearby groups, confirm attendance, and build trust with small rituals',
        dailyActionRu: 'находят nearby-группы, подтверждают участие и выстраивают доверие через маленькие ритуалы',
        outcomeEn: 'build a living social routine instead of endless passive scrolling',
        outcomeRu: 'получить живой социальный ритм вместо бесконечного пассивного скролла',
      },
      {
        subjectEn: 'voice-first hobby clubs',
        subjectRu: 'голосовые клубы по хобби',
        audienceEn: 'people who bond faster through voice than text',
        audienceRu: 'люди, которым проще сближаться через голос, а не через текст',
        dailyActionEn: 'join lightweight voice rooms, react in real time, and return to familiar micro-communities',
        dailyActionRu: 'заходят в легкие голосовые комнаты, реагируют в реальном времени и возвращаются в знакомые микро-сообщества',
        outcomeEn: 'feel stronger belonging and easier participation',
        outcomeRu: 'быстрее чувствовать принадлежность и легче включаться в общение',
      },
      {
        subjectEn: 'pickup sports matching',
        subjectRu: 'поиск игр в любительский спорт',
        audienceEn: 'people trying to find casual matches without long group chats',
        audienceRu: 'люди, которые хотят быстро находить любительские матчи без длинных чатов',
        dailyActionEn: 'see live availability, lock a spot, and keep a repeatable play rhythm',
        dailyActionRu: 'видят живую доступность, занимают слот и держат повторяемый ритм игр',
        outcomeEn: 'play more often with less coordination fatigue',
        outcomeRu: 'играть чаще и меньше уставать от координации',
      },
    ],
  },
  productivity: {
    promptDirective: 'For "productivity", the product itself must be the app where the user plans, focuses, executes, and closes work. Do NOT generate PMO reporting, stakeholder alignment software, executive review dashboards, or portfolio oversight tools.',
    bannedPattern: /(operator console|executive review|pmo|portfolio monitor|stakeholders?|planning room|operating review|revenue guard|coordination hub|операцион|портфел|стейкхолдер|планировочн|обзор для руководства|дашборд)/i,
    focuses: [
      {
        subjectEn: 'deep work sprints',
        subjectRu: 'спринты глубокой работы',
        audienceEn: 'knowledge workers who keep losing focus to fragmented tasks',
        audienceRu: 'knowledge workers, которые постоянно теряют фокус из-за раздробленных задач',
        dailyActionEn: 'set one decisive work block, protect attention, and finish meaningful output',
        dailyActionRu: 'ставят один решающий work-block, защищают внимание и доводят до результата значимую работу',
        outcomeEn: 'ship more real work with less cognitive residue',
        outcomeRu: 'делать больше настоящей работы с меньшим когнитивным шумом',
      },
      {
        subjectEn: 'meeting follow-through',
        subjectRu: 'доведение задач после встреч',
        audienceEn: 'individual contributors buried under meeting decisions',
        audienceRu: 'индивидуальные специалисты, которых заваливают решения после встреч',
        dailyActionEn: 'turn notes into next actions, deadlines, and visible follow-through',
        dailyActionRu: 'превращают заметки в следующие действия, сроки и видимое доведение до результата',
        outcomeEn: 'stop losing commitments the day after the meeting',
        outcomeRu: 'перестать терять договоренности уже на следующий день после встречи',
      },
      {
        subjectEn: 'freelancer handoff planning',
        subjectRu: 'планирование handoff для фрилансеров',
        audienceEn: 'freelancers juggling multiple clients and small deliverables',
        audienceRu: 'фрилансеры, которые ведут несколько клиентов и много мелких deliverable',
        dailyActionEn: 'sequence handoffs, spot blockers, and keep clients updated without chaos',
        dailyActionRu: 'выстраивают handoff, заранее видят блокеры и держат клиентов в курсе без хаоса',
        outcomeEn: 'stay reliable without building a heavy project management stack',
        outcomeRu: 'оставаться надежными без тяжелого project management-стека',
      },
    ],
  },
  education: {
    promptDirective: 'For "education", the product itself must teach or train a concrete skill or body of knowledge. The product must directly deliver the learning experience to the end user. Do NOT generate LMS, school admin, curriculum analytics, cohort operations, teacher dashboards, or tools for educational programs.',
    bannedPattern: /(lms|school admin|cohort|teacher dashboard|curriculum|educational programs?|program operators?|course ops|операцион|образовательных программ|админ|когорт|куратор|дашборд|curriculum|lms)/i,
    focuses: [
      {
        subjectEn: 'spoken English',
        subjectRu: 'разговорный английский',
        audienceEn: 'learners who want real conversation confidence',
        audienceRu: 'ученики, которым нужна уверенность в живом разговоре',
        dailyActionEn: 'practice short speaking drills, hear corrections, and repeat useful phrases',
        dailyActionRu: 'тренируют короткие speaking-drill, слышат corrections и повторяют полезные фразы',
        outcomeEn: 'speak more naturally in real situations',
        outcomeRu: 'говорить увереннее в реальных ситуациях',
      },
      {
        subjectEn: 'street dance',
        subjectRu: 'уличные танцы',
        audienceEn: 'beginners trying to train rhythm and movement at home',
        audienceRu: 'новички, которые хотят тренировать ритм и движение дома',
        dailyActionEn: 'follow mirrored drills, record progress, and unlock routine pieces',
        dailyActionRu: 'проходят mirrored-drill, записывают прогресс и открывают части связок',
        outcomeEn: 'actually perform routines instead of endlessly watching tutorials',
        outcomeRu: 'реально собирать связки, а не бесконечно смотреть tutorial',
      },
      {
        subjectEn: 'drawing fundamentals',
        subjectRu: 'основы рисования',
        audienceEn: 'people learning to sketch and see form correctly',
        audienceRu: 'люди, которые учатся скетчингу и правильному чувству формы',
        dailyActionEn: 'do timed exercises, compare strokes, and build visible skill memory',
        dailyActionRu: 'делают timed-упражнения, сравнивают штрих и нарабатывают видимую мышечную память',
        outcomeEn: 'see measurable improvement in visual skill',
        outcomeRu: 'видеть измеримый рост навыка рисования',
      },
      {
        subjectEn: 'guitar for beginners',
        subjectRu: 'гитара для начинающих',
        audienceEn: 'adults picking up guitar with no prior music background',
        audienceRu: 'взрослые, которые берут гитару без музыкального опыта',
        dailyActionEn: 'follow chord progressions, track finger placement, and complete daily song pieces',
        dailyActionRu: 'разучивают аккорды, отслеживают постановку пальцев и собирают фрагменты песен',
        outcomeEn: 'play a full song within 30 days',
        outcomeRu: 'сыграть полную песню за 30 дней',
      },
      {
        subjectEn: 'math for exam prep',
        subjectRu: 'математика для подготовки к экзаменам',
        audienceEn: 'high-school students preparing for standardized tests',
        audienceRu: 'школьники, которые готовятся к ЕГЭ или олимпиадам',
        dailyActionEn: 'solve adaptive problem sets, identify weak areas, and track score trends',
        dailyActionRu: 'решают адаптивные задачи, выявляют слабые места и отслеживают динамику баллов',
        outcomeEn: 'close knowledge gaps and raise exam score',
        outcomeRu: 'закрыть пробелы и поднять балл на экзамене',
      },
      {
        subjectEn: 'coding for kids',
        subjectRu: 'программирование для детей',
        audienceEn: 'children aged 8-13 learning logic and coding through play',
        audienceRu: 'дети 8-13 лет, которые учат логику и код через игру',
        dailyActionEn: 'complete visual puzzles and mini-projects that build real logic skills',
        dailyActionRu: 'проходят визуальные головоломки и мини-проекты, которые нарабатывают реальные навыки',
        outcomeEn: 'build a simple app or game independently',
        outcomeRu: 'самостоятельно собрать простое приложение или игру',
      },
      {
        subjectEn: 'digital photography',
        subjectRu: 'цифровая фотография',
        audienceEn: 'smartphone photographers wanting to shoot intentionally',
        audienceRu: 'фотографы-любители, которые хотят снимать осмысленно',
        dailyActionEn: 'complete daily composition challenges and get feedback on light and framing',
        dailyActionRu: 'выполняют daily-задания по композиции и получают обратную связь по свету и кадру',
        outcomeEn: 'build a portfolio of intentional shots',
        outcomeRu: 'собрать портфолио из осмысленных снимков',
      },
      {
        subjectEn: 'public speaking',
        subjectRu: 'публичные выступления',
        audienceEn: 'professionals who freeze up before presentations',
        audienceRu: 'специалисты, которые теряются перед выступлением',
        dailyActionEn: 'record short practice speeches, get AI feedback on pace and clarity',
        dailyActionRu: 'записывают короткие речи и получают AI-фидбек по темпу и ясности',
        outcomeEn: 'deliver confident presentations without over-preparing',
        outcomeRu: 'уверенно выступать без избыточной подготовки',
      },
      {
        subjectEn: 'chess tactics',
        subjectRu: 'шахматные тактики',
        audienceEn: 'casual chess players who want to stop losing to simple tactics',
        audienceRu: 'любители шахмат, которые хотят перестать проигрывать на простых тактиках',
        dailyActionEn: 'solve daily puzzles, replay blunders, and track pattern recognition',
        dailyActionRu: 'решают daily-задачи, разбирают зевки и отслеживают узнавание паттернов',
        outcomeEn: 'increase rating by 200 points in two months',
        outcomeRu: 'поднять рейтинг на 200 пунктов за два месяца',
      },
    ],
  },
  commerce: {
    promptDirective: 'For "commerce", the product itself must live inside the buying or selling experience for the end user. Good angles: shopper clubs, specialty marketplaces, repeat purchase loops, resale experiences. Do NOT generate seller dashboards, margin analytics, fulfillment consoles, or merchant back-office software.',
    bannedPattern: /(merchant ops|seller dashboard|returns? analytics|margin guard|back office|fulfillment console|marketplace operators?|операцион|продавц|марж|фулфилмент|бэк-офис|дашборд)/i,
    focuses: [
      {
        subjectEn: 'collectible drop shopping',
        subjectRu: 'покупка коллекционных дропов',
        audienceEn: 'collectors chasing limited releases without chaos',
        audienceRu: 'коллекционеры, которые охотятся за ограниченными дропами без хаоса',
        dailyActionEn: 'track drops, lock intent early, and compete fairly for scarce items',
        dailyActionRu: 'отслеживают дропы, рано фиксируют интерес и честно соревнуются за дефицитные вещи',
        outcomeEn: 'buy rare items with less noise and more trust',
        outcomeRu: 'покупать редкие вещи с меньшим шумом и большим доверием',
      },
      {
        subjectEn: 'pantry replenishment',
        subjectRu: 'повторные покупки для дома',
        audienceEn: 'families who keep reordering the same essentials',
        audienceRu: 'семьи, которые постоянно докупают одни и те же базовые товары',
        dailyActionEn: 'see what is running low, reorder in one loop, and avoid waste',
        dailyActionRu: 'видят, что заканчивается, заказывают в одном цикле и избегают лишних трат',
        outcomeEn: 'spend less effort on routine shopping',
        outcomeRu: 'тратить меньше усилий на рутинные покупки',
      },
      {
        subjectEn: 'live resale shopping',
        subjectRu: 'live-покупки на resale-рынке',
        audienceEn: 'buyers who want trusted second-hand fashion and gear',
        audienceRu: 'покупатели, которым нужен надежный second-hand в одежде и технике',
        dailyActionEn: 'join live drops, verify condition quickly, and buy with social proof',
        dailyActionRu: 'подключаются к live-дропам, быстро проверяют состояние и покупают с social proof',
        outcomeEn: 'shop resale with more confidence and excitement',
        outcomeRu: 'покупать на resale-рынке увереннее и с большим интересом',
      },
    ],
  },
  ai: {
    promptDirective: 'For "ai", the product itself must be an AI-native end-user app that delivers a concrete result for the user. Good angles: rehearsal, transformation, summarization, generation, or decision support inside a specific job-to-be-done. Do NOT generate prompt ops, eval dashboards, model observability, agent orchestration, or internal AI operations tooling.',
    bannedPattern: /(prompt ops|evals?|observability|model monitoring|ai teams?|guardrails?|workflow exceptions|model runs|agent ops|операцион|модел|обсервабилити|guardrail|дашборд|оркестрац)/i,
    focuses: [
      {
        subjectEn: 'AI interview rehearsal',
        subjectRu: 'AI-репетиция интервью',
        audienceEn: 'job seekers preparing for high-stakes interviews',
        audienceRu: 'кандидаты, которые готовятся к важным интервью',
        dailyActionEn: 'answer realistic prompts, get feedback, and rehearse stronger responses',
        dailyActionRu: 'отвечают на реалистичные вопросы, получают feedback и репетируют более сильные ответы',
        outcomeEn: 'sound sharper and calmer in real interviews',
        outcomeRu: 'звучать увереннее и сильнее на реальном интервью',
      },
      {
        subjectEn: 'AI research briefing',
        subjectRu: 'AI-сборка research-brief',
        audienceEn: 'operators and founders who need clear decisions from messy input',
        audienceRu: 'операторы и фаундеры, которым нужны ясные решения из хаотичного входящего',
        dailyActionEn: 'drop in sources, compare angles, and get a structured decision brief',
        dailyActionRu: 'загружают источники, сравнивают углы и получают структурированный decision brief',
        outcomeEn: 'move from information overload to action faster',
        outcomeRu: 'быстрее переходить от информационного шума к действию',
      },
      {
        subjectEn: 'AI voice dubbing',
        subjectRu: 'AI-дубляж голоса',
        audienceEn: 'creators localizing short videos and lessons',
        audienceRu: 'креаторы, которые локализуют короткие видео и уроки',
        dailyActionEn: 'adapt scripts, match tone, and generate polished multilingual voice tracks',
        dailyActionRu: 'адаптируют скрипт, подгоняют тон и получают аккуратные многоязычные voice-track',
        outcomeEn: 'publish localized content much faster',
        outcomeRu: 'намного быстрее выпускать локализованный контент',
      },
    ],
  },
  'developer-tools': {
    promptDirective: 'For "developer-tools", the product itself must be a tool developers directly use while coding, testing, reviewing, debugging, or releasing software. Do NOT generate engineering management dashboards, headcount planning tools, or portfolio reporting.',
    bannedPattern: /(engineering managers?|velocity dashboard|headcount|portfolio reporting|planning room|stakeholders?|операцион|скорость команды|хедкаунт|портфел|дашборд менеджера)/i,
    focuses: [
      {
        subjectEn: 'test failure triage',
        subjectRu: 'разбор падений тестов',
        audienceEn: 'developers fixing broken CI runs',
        audienceRu: 'разработчики, которые чинят упавший CI',
        dailyActionEn: 'group noisy failures, spot the root cause, and jump into the right file fast',
        dailyActionRu: 'группируют шумные падения, видят корень проблемы и быстро прыгают в нужный файл',
        outcomeEn: 'recover build health with less wasted debugging time',
        outcomeRu: 'быстрее возвращать сборку в рабочее состояние и меньше тратить время на дебаг',
      },
      {
        subjectEn: 'schema migration rehearsal',
        subjectRu: 'репетиция миграций схемы',
        audienceEn: 'backend developers shipping risky database changes',
        audienceRu: 'backend-разработчики, которые выкатывают рискованные изменения базы',
        dailyActionEn: 'simulate migrations, preview breakage, and choose safer rollout steps',
        dailyActionRu: 'симулируют миграции, заранее видят поломки и выбирают более безопасный rollout',
        outcomeEn: 'ship database changes with fewer production surprises',
        outcomeRu: 'катить изменения в базу с меньшим числом прод-неожиданностей',
      },
      {
        subjectEn: 'pull request explanation',
        subjectRu: 'объяснение pull request',
        audienceEn: 'reviewers trying to understand large code changes quickly',
        audienceRu: 'ревьюеры, которым нужно быстро понять большие изменения в коде',
        dailyActionEn: 'scan diffs, summarize intent, and expose hidden review risk',
        dailyActionRu: 'сканируют diff, получают summary намерения и видят скрытый риск ревью',
        outcomeEn: 'review faster without missing important issues',
        outcomeRu: 'ревьюить быстрее и не пропускать важные проблемы',
      },
    ],
  },
};

function getMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeLanguage(language?: string): string {
  return (language || 'en').toLowerCase().split('-')[0] || 'en';
}

function getLocalizedRecord(
  en: TrendNicheLocalizedCopy,
  ru: TrendNicheLocalizedCopy,
  extra: Partial<Record<string, TrendNicheLocalizedCopy>> = {},
): Record<string, TrendNicheLocalizedCopy> {
  return {
    en,
    ru,
    es: extra.es ?? en,
    de: extra.de ?? en,
    fr: extra.fr ?? en,
    zh: extra.zh ?? en,
  };
}

function makeTrendIdea(input: {
  id: string;
  cadence: TrendNicheCadence;
  categories: TrendNicheInterest[];
  theme: string;
  localized: Record<string, TrendNicheLocalizedCopy>;
  layoutType?: string;
  navigation?: string;
  primaryDevice?: string;
}): TrendNicheIdea {
  const en = input.localized.en ?? Object.values(input.localized)[0];
  return {
    id: input.id,
    cadence: input.cadence,
    categories: input.categories,
    localized: input.localized,
    appName: en.title,
    description: en.description,
    theme: input.theme,
    targetUser: en.audience,
    targetAudience: en.audience,
    marketContext: en.marketAngle,
    painPoint: en.description,
    competitorGap: en.whyInteresting,
    generatedAt: new Date().toISOString(),
    layout: {
      type: input.layoutType ?? 'dashboard',
      navigation: input.navigation ?? 'sidebar',
    },
    uxPatterns: {
      emptyStates: true,
      loadingSkeletons: true,
      searchAndFilter: true,
    },
    responsiveness: {
      primaryDevice: input.primaryDevice ?? 'desktop',
      mobileFirst: false,
    },
    pages: [
      {
        path: '/',
        name: 'Home',
        file: 'pages/Home.tsx',
        purpose: en.description,
        isMainScreen: true,
        showInNav: true,
        uiSpec: [
          en.title,
          en.description,
          'Show a focused first-run workspace, realistic seeded examples, clear primary action, filters, empty states, and settings.',
          'The UI should feel production-ready with dense but readable information architecture.',
        ].join(' '),
      },
      {
        path: '/settings',
        name: 'Settings',
        file: 'pages/Settings.tsx',
        purpose: 'Preferences and account controls',
        isMainScreen: false,
        showInNav: true,
        uiSpec: 'Account, preferences, notifications, privacy controls, data export, and subscription status.',
      },
    ],
    dataModel: {
      entities: [
        { name: 'UserProfile', fields: 'id: string, preferences: string[], createdAt: string' },
        { name: 'WorkspaceItem', fields: 'id: string, title: string, status: string, metadata: object' },
      ],
      sharedState: 'App-level workspace state with local-first persistence.',
    },
    criticalUiRules: [
      'Keep the primary workflow visible above the fold.',
      'Use realistic seed data and never show an empty generic dashboard.',
      'Make save/export/notification states explicit.',
    ],
    shadcnComponents: ['Button', 'Card', 'Input', 'Tabs', 'Dialog'],
    icons: ['Search', 'Settings', 'Plus', 'CheckCircle'],
  };
}

const DEFAULT_TREND_NICHES: Record<TrendNicheCadence, TrendNicheIdea[]> = {
  daily: [
    makeTrendIdea({
      id: 'daily-ai-care-triage',
      cadence: 'daily',
      categories: ['medicine', 'ai', 'productivity'],
      theme: 'trust',
      localized: getLocalizedRecord(
        {
          title: 'Clinic Inbox Triage Copilot',
          description: 'AI workspace that turns patient messages into prioritized tasks for small clinics.',
          audience: 'Clinic managers and nurses handling overloaded patient inboxes.',
          marketAngle: 'Primary care teams are under pressure to answer messages faster without adding staff.',
          whyInteresting: 'It creates immediate operational ROI and can start as a lightweight local-first workflow.',
        },
        {
          title: 'AI-триаж входящих для клиник',
          description: 'AI-рабочее пространство, которое превращает сообщения пациентов в приоритетные задачи для небольших клиник.',
          audience: 'Администраторы клиник и медсестры, которые разбирают перегруженные входящие от пациентов.',
          marketAngle: 'Клиники вынуждены отвечать пациентам быстрее без роста штата.',
          whyInteresting: 'Идея быстро показывает операционный ROI и может стартовать как легкий local-first workflow.',
        },
      ),
    }),
    makeTrendIdea({
      id: 'daily-fintech-cashflow-guard',
      cadence: 'daily',
      categories: ['fintech', 'productivity', 'ai'],
      theme: 'trust',
      localized: getLocalizedRecord(
        {
          title: 'Freelancer Cashflow Guard',
          description: 'Mobile-first finance assistant that predicts cash gaps and suggests invoice actions.',
          audience: 'Independent freelancers juggling invoices, tax reserves, and uneven payments.',
          marketAngle: 'More solo operators want practical cashflow guidance without enterprise accounting software.',
          whyInteresting: 'The wedge is narrow, emotional, and monetizable through reminders, forecasts, and paid exports.',
        },
        {
          title: 'Cashflow Guard для фрилансеров',
          description: 'Mobile-first финансовый помощник, который прогнозирует кассовые разрывы и подсказывает действия по инвойсам.',
          audience: 'Фрилансеры, которые ведут инвойсы, налоговый резерв и нерегулярные платежи.',
          marketAngle: 'Соло-специалистам нужны практичные cashflow-подсказки без тяжелого бухгалтерского ПО.',
          whyInteresting: 'Узкая и эмоциональная боль хорошо монетизируется через напоминания, прогнозы и платные экспорты.',
        },
      ),
      primaryDevice: 'mobile',
      navigation: 'bottom-tabs',
    }),
    makeTrendIdea({
      id: 'daily-game-creator-loop-lab',
      cadence: 'daily',
      categories: ['games', 'social', 'ai'],
      theme: 'neon',
      localized: getLocalizedRecord(
        {
          title: 'Creator Loop Lab for Indie Games',
          description: 'Tool that converts playtest clips and player comments into retention experiments.',
          audience: 'Small indie studios and solo game creators preparing demos or early access builds.',
          marketAngle: 'Indie teams need faster feedback loops as short-form video shapes discovery.',
          whyInteresting: 'It bridges community signals and product iteration, not just analytics dashboards.',
        },
        {
          title: 'Creator Loop Lab для indie games',
          description: 'Инструмент, который превращает playtest-клипы и комментарии игроков в эксперименты на удержание.',
          audience: 'Небольшие indie-студии и solo game creators перед демо или early access.',
          marketAngle: 'Командам игр нужны быстрые feedback loops, потому что discovery все сильнее зависит от short-form видео.',
          whyInteresting: 'Идея соединяет community signals и продуктовую итерацию, а не просто показывает аналитику.',
        },
      ),
    }),
  ],
  weekly: [
    makeTrendIdea({
      id: 'weekly-wellness-recovery-coach',
      cadence: 'weekly',
      categories: ['wellness', 'medicine', 'ai'],
      theme: 'bloom',
      localized: getLocalizedRecord(
        {
          title: 'Recovery Coach for Desk Workers',
          description: 'Personal wellness planner that detects burnout patterns and schedules micro-recovery.',
          audience: 'Remote knowledge workers with recurring fatigue, neck pain, and fragmented focus.',
          marketAngle: 'Workplace wellness budgets are moving from content libraries toward measurable behavior loops.',
          whyInteresting: 'It can combine daily check-ins, calendar context, and small interventions that users actually follow.',
        },
        {
          title: 'Recovery Coach для офисных специалистов',
          description: 'Персональный wellness-планировщик, который замечает паттерны выгорания и ставит micro-recovery.',
          audience: 'Remote knowledge workers с усталостью, болью в шее и разорванным фокусом.',
          marketAngle: 'Wellness-бюджеты уходят от библиотек контента к измеримым behavioral loops.',
          whyInteresting: 'Можно соединить ежедневные check-ins, контекст календаря и маленькие интервенции, которые реально выполняют.',
        },
      ),
    }),
    makeTrendIdea({
      id: 'weekly-social-proof-studio',
      cadence: 'weekly',
      categories: ['social', 'commerce', 'ai'],
      theme: 'warm',
      localized: getLocalizedRecord(
        {
          title: 'Social Proof Studio for Local Shops',
          description: 'App that turns reviews, photos, and receipts into compliant social posts and offers.',
          audience: 'Local shop owners without a marketing team.',
          marketAngle: 'Small merchants need steady content but cannot afford agency workflows.',
          whyInteresting: 'The product has a clear habit loop: capture proof, generate assets, publish, learn.',
        },
        {
          title: 'Social Proof Studio для локального бизнеса',
          description: 'Приложение, которое превращает отзывы, фото и чеки в аккуратные social posts и офферы.',
          audience: 'Владельцы локальных магазинов без маркетинговой команды.',
          marketAngle: 'Малому бизнесу нужен постоянный контент, но agency workflow слишком дорогой.',
          whyInteresting: 'У продукта понятная петля: собрать proof, сгенерировать assets, опубликовать, обучиться на результате.',
        },
      ),
    }),
    makeTrendIdea({
      id: 'weekly-study-sprint-os',
      cadence: 'weekly',
      categories: ['education', 'productivity', 'ai'],
      theme: 'dark-slate',
      localized: getLocalizedRecord(
        {
          title: 'Study Sprint OS',
          description: 'Adaptive study planner that turns exams, notes, and weak topics into weekly sprint boards.',
          audience: 'University students and professional certification learners.',
          marketAngle: 'Learners want AI that plans execution, not just answers questions.',
          whyInteresting: 'It is sticky because the plan updates every week and compounds into exam readiness.',
        },
        {
          title: 'Study Sprint OS',
          description: 'Адаптивный учебный планировщик, который превращает экзамены, конспекты и слабые темы в недельные sprint boards.',
          audience: 'Студенты и люди, готовящиеся к профессиональным сертификациям.',
          marketAngle: 'Пользователям нужен AI, который планирует выполнение, а не только отвечает на вопросы.',
          whyInteresting: 'Retention сильный: план обновляется каждую неделю и накапливает готовность к экзамену.',
        },
      ),
    }),
  ],
  monthly: [
    makeTrendIdea({
      id: 'monthly-dev-tool-release-risk-map',
      cadence: 'monthly',
      categories: ['developer-tools', 'ai', 'productivity'],
      theme: 'dark-slate',
      localized: getLocalizedRecord(
        {
          title: 'Release Risk Map for Small Teams',
          description: 'Developer tool that scans commits, tests, and user reports into a release confidence map.',
          audience: 'Small product teams shipping without dedicated QA or release managers.',
          marketAngle: 'AI code generation increases output, so teams need lightweight release judgment.',
          whyInteresting: 'It attaches to an existing pain point and can become part of every release ritual.',
        },
        {
          title: 'Release Risk Map для малых команд',
          description: 'Dev tool, который собирает commits, tests и user reports в карту уверенности релиза.',
          audience: 'Небольшие продуктовые команды без отдельного QA или release manager.',
          marketAngle: 'AI code generation ускоряет output, значит командам нужен легкий release judgment.',
          whyInteresting: 'Идея встраивается в существующую боль и может стать частью каждого release ritual.',
        },
      ),
    }),
    makeTrendIdea({
      id: 'monthly-commerce-return-saver',
      cadence: 'monthly',
      categories: ['commerce', 'fintech', 'ai'],
      theme: 'trust',
      localized: getLocalizedRecord(
        {
          title: 'Return Saver for Micro-Commerce',
          description: 'Operations app that predicts risky orders and guides return-prevention messages.',
          audience: 'Micro-commerce sellers on marketplaces and social storefronts.',
          marketAngle: 'Returns and chargebacks are painful for small sellers with thin margins.',
          whyInteresting: 'The product can show clear saved revenue and does not require replacing the shop stack.',
        },
        {
          title: 'Return Saver для micro-commerce',
          description: 'Операционное приложение, которое прогнозирует рискованные заказы и подсказывает сообщения для предотвращения возвратов.',
          audience: 'Micro-commerce продавцы на маркетплейсах и social storefronts.',
          marketAngle: 'Возвраты и chargebacks особенно болезненны для малых продавцов с тонкой маржой.',
          whyInteresting: 'Можно явно показывать saved revenue и не заменять существующий shop stack.',
        },
      ),
    }),
    makeTrendIdea({
      id: 'monthly-medical-family-care-vault',
      cadence: 'monthly',
      categories: ['medicine', 'wellness', 'productivity'],
      theme: 'trust',
      localized: getLocalizedRecord(
        {
          title: 'Family Care Vault',
          description: 'Shared health admin hub for medications, appointments, care notes, and document handoff.',
          audience: 'Adults coordinating care for children, parents, or relatives across households.',
          marketAngle: 'Families increasingly coordinate care remotely and need trustworthy shared admin tools.',
          whyInteresting: 'It is not another symptom tracker; it owns the coordination layer around real care.',
        },
        {
          title: 'Family Care Vault',
          description: 'Общий health admin hub для лекарств, визитов, care notes и передачи документов.',
          audience: 'Взрослые, которые координируют заботу о детях, родителях или родственниках между домами.',
          marketAngle: 'Семьи все чаще координируют care удаленно и нуждаются в надежном shared admin tool.',
          whyInteresting: 'Это не еще один symptom tracker, а слой координации вокруг реальной заботы.',
        },
      ),
      primaryDevice: 'mobile',
      navigation: 'bottom-tabs',
    }),
  ],
};

function cloneTrendIdea(idea: TrendNicheIdea): TrendNicheIdea {
  return JSON.parse(JSON.stringify(idea)) as TrendNicheIdea;
}

function buildTrendFallbackTemplateCopy(
  interest: TrendNicheInterest,
  cadence: TrendNicheCadence,
  index: number,
  variantSeed = 0,
): Record<'en' | 'ru', TrendNicheLocalizedCopy> {
  const profile = TREND_INTEREST_PROFILES[interest];
  if (interest === 'games') {
    const gameAudience = {
      en: 'Players who want a strong core loop, fast mastery, and reasons to come back for one more run.',
      ru: 'Игроки, которым нужны сильная core loop, быстрое чувство мастерства и понятный повод вернуться еще на одну сессию.',
    };

    if (cadence === 'daily') {
      const variants = [
        {
          en: {
            title: 'Combo Tower Rush',
            description: 'An arcade climbing game where players chain jumps, wall-bounces, and enemy knockbacks to keep a combo tower alive for five-minute runs.',
            marketAngle: 'Short-session arcade games are winning because players want immediate mastery and shareable score runs on mobile.',
            whyInteresting: 'The game has a crisp loop, visible mastery, and clean replayability without needing a big content footprint.',
          },
          ru: {
            title: 'Башня Комбо',
            description: 'Аркадная игра про подъем по башне, где игроки собирают цепочки прыжков, отскоков от стен и нокдаунов врагов, чтобы держать комбо в живых в коротких забегах на 5 минут.',
            marketAngle: 'Короткие аркадные сессии снова сильны, потому что игрокам нужен мгновенный skill loop и результаты, которыми хочется делиться.',
            whyInteresting: 'У игры очень четкая петля, быстрое чувство мастерства и высокая переигрываемость без тяжелого контентного производства.',
          },
        },
        {
          en: {
            title: 'Duel Signal',
            description: 'A reaction duel game where two players read shifting battlefield cues and counter each other in tense thirty-second rounds.',
            marketAngle: 'Competitive micro-session games are growing because they fit into breaks and produce instant social rematches.',
            whyInteresting: 'It is easy to understand, hard to master, and naturally social from the first session.',
          },
          ru: {
            title: 'Сигнал Дуэли',
            description: 'Игра на реакцию, где два игрока читают меняющиеся сигналы арены и переигрывают друг друга в напряженных раундах по 30 секунд.',
            marketAngle: 'Соревновательные micro-session игры растут, потому что легко встраиваются в короткие перерывы и сразу провоцируют реванш.',
            whyInteresting: 'Правила считываются мгновенно, глубина появляется быстро, а социальный крючок работает уже с первой сессии.',
          },
        },
        {
          en: {
            title: 'Puzzle Chase',
            description: 'A chase puzzle game where players rotate city blocks on the fly to open routes, trap rivals, and escape with the objective.',
            marketAngle: 'Hybrid puzzle-action games stand out because players want brainy mechanics without losing tempo or spectacle.',
            whyInteresting: 'The mechanic is visually legible, stream-friendly, and creates many tiny mastery moments per match.',
          },
          ru: {
            title: 'Погоня Головоломок',
            description: 'Игра-погоня, где игроки на лету вращают блоки города, открывают маршруты, ловят соперников в ловушки и уносят цель.',
            marketAngle: 'Гибриды головоломки и экшена выделяются, потому что игрокам хочется умной механики без потери темпа и зрелищности.',
            whyInteresting: 'Механика читается с экрана сразу, хорошо смотрится в стримах и дает много маленьких моментов мастерства в каждом матче.',
          },
        },
        {
          en: {
            title: 'Five-Minute Raid',
            description: 'A compact co-op raid game where three players execute roles, dodge boss patterns, and extract loot before the timer collapses.',
            marketAngle: 'Players want co-op intensity without forty-minute commitments, especially on mobile and cross-session play.',
            whyInteresting: 'It delivers raid energy in a bounded session format, which is rare and highly replayable.',
          },
          ru: {
            title: 'Рейд на Пять Минут',
            description: 'Компактная кооперативная игра, где трое игроков распределяют роли, читают паттерны босса и выносят лут до истечения таймера.',
            marketAngle: 'Игрокам нужен кооперативный драйв без обязательства на 40 минут, особенно в mobile и коротких cross-session сценариях.',
            whyInteresting: 'Игра дает ощущение рейда в жестко ограниченной сессии, а это редкая и очень переигрываемая форма.',
          },
        },
        {
          en: {
            title: 'Hidden Saboteur',
            description: 'A social stealth game where one player sabotages a shared machine while the rest race to read clues and keep the system alive.',
            marketAngle: 'Fast social deception games keep winning because they generate stories instantly and need little onboarding.',
            whyInteresting: 'The loop is expressive, spectator-friendly, and full of repeatable social tension.',
          },
          ru: {
            title: 'Скрытый Саботажник',
            description: 'Социальная stealth-игра, где один игрок тайно ломает общий механизм, а остальные пытаются читать улики и удержать систему в рабочем состоянии.',
            marketAngle: 'Быстрые социальные игры на обман продолжают расти, потому что мгновенно создают истории и почти не требуют обучения.',
            whyInteresting: 'Петля выразительная, хорошо работает для зрителей и каждый раз заново создает социальное напряжение.',
          },
        },
        {
          en: {
            title: 'Word Arena',
            description: 'A competitive word-battle game where players cast attacks by building unstable word chains under real-time pressure.',
            marketAngle: 'Players respond well to mechanics that mix familiarity with speed, especially when they create strong asynchronous bragging rights.',
            whyInteresting: 'It combines language mastery, time pressure, and PvP tension in a format with easy retention hooks.',
          },
          ru: {
            title: 'Арена Слов',
            description: 'Соревновательная игра, где игроки атакуют соперника, собирая нестабильные цепочки слов под давлением таймера.',
            marketAngle: 'Игроки хорошо реагируют на механики, которые соединяют знакомое действие со скоростью и дают повод для асинхронного соперничества.',
            whyInteresting: 'Игра объединяет языковое мастерство, давление времени и PvP-напряжение в формате с понятными retention-крючками.',
          },
        },
      ][(variantSeed + index) % 6];

      return {
        en: { title: variants.en.title, description: variants.en.description, audience: gameAudience.en, marketAngle: variants.en.marketAngle, whyInteresting: variants.en.whyInteresting },
        ru: { title: variants.ru.title, description: variants.ru.description, audience: gameAudience.ru, marketAngle: variants.ru.marketAngle, whyInteresting: variants.ru.whyInteresting },
      };
    }

    if (cadence === 'weekly') {
      const variants = [
        {
          en: {
            title: 'Neighborhood Monster League',
            description: 'A weekly creature battler where players scout, train, and evolve neighborhood monsters before asynchronous league fights.',
            marketAngle: 'Players want progression games that give them a reason to return each week without requiring full daily grind.',
            whyInteresting: 'Weekly league cadence creates strong anticipation, collection goals, and social comparison.',
          },
          ru: {
            title: 'Лига Районных Монстров',
            description: 'Недельный creature battler, где игроки ищут, тренируют и эволюционируют районных монстров перед асинхронными матчами лиги.',
            marketAngle: 'Игрокам нужны progression-игры, которые дают весомую цель на неделю без обязательного ежедневного гринда.',
            whyInteresting: 'Недельный ритм лиги создает ожидание, коллекционные цели и сильное социальное сравнение.',
          },
        },
        {
          en: {
            title: 'Co-op Salvage Run',
            description: 'A co-op extraction roguelite where squads enter a collapsing zone, improvise builds from scrap, and bring home one surviving artifact per run.',
            marketAngle: 'Co-op runs with shared risk keep growing because they create stories and streamer-friendly teamwork moments.',
            whyInteresting: 'It turns every run into a memorable team story while still keeping the build space compact.',
          },
          ru: {
            title: 'Совместная Вылазка за Трофеями',
            description: 'Кооперативный extraction-roguelite, где команда входит в рушащуюся зону, собирает билд из мусора на ходу и пытается вынести хотя бы один живой артефакт.',
            marketAngle: 'Кооперативные забеги с общим риском растут, потому что создают истории и моменты командной синергии, которыми хочется делиться.',
            whyInteresting: 'Каждый ран превращается в запоминающуюся историю команды, при этом пространство билдов остается компактным и управляемым.',
          },
        },
        {
          en: {
            title: 'Deck Heist',
            description: 'A PvE deckbuilder about planning one perfect theft per week, where players gather intel, draft tools, and execute a single high-stakes infiltration.',
            marketAngle: 'Tactical deck systems remain sticky when they create memorable, authored runs instead of endless generic repetition.',
            whyInteresting: 'One major attempt per week gives the deck game drama, rhythm, and a clear reason to come back.',
          },
          ru: {
            title: 'Ограбление Колодой',
            description: 'PvE deckbuilder про одно идеальное ограбление в неделю, где игроки собирают разведданные, драфтят инструменты и проводят одну ставку с высоким риском.',
            marketAngle: 'Тактические колодные системы остаются липкими, когда дают запоминающиеся авторские забеги вместо бесконечного однообразия.',
            whyInteresting: 'Одна большая попытка в неделю добавляет колодной игре драму, ритм и явную причину вернуться.',
          },
        },
        {
          en: {
            title: 'Guild Signal War',
            description: 'An asynchronous guild strategy game where players interpret world events, commit squads, and reshape the map together over a seven-day cycle.',
            marketAngle: 'Players enjoy group strategy when it respects real life and lets them contribute meaningfully without strict raid scheduling.',
            whyInteresting: 'The weekly world-state reset creates momentum, collaboration, and live social stakes.',
          },
          ru: {
            title: 'Война Сигналов Гильдий',
            description: 'Асинхронная стратегическая игра для гильдий, где игроки читают мировые события, отправляют отряды и вместе меняют карту в течение семидневного цикла.',
            marketAngle: 'Игрокам нравится групповая стратегия, когда она уважает реальную жизнь и позволяет приносить вклад без жесткого рейд-расписания.',
            whyInteresting: 'Недельный сброс состояния мира создает движение, кооперацию и живые социальные ставки.',
          },
        },
        {
          en: {
            title: 'Dream Park Builder',
            description: 'A cozy weekly builder where players design surreal attractions, tune visitor flow, and unlock story fragments as their park mood evolves.',
            marketAngle: 'Cozy construction games are expanding because players want expressive authorship with low punishment and visible progress.',
            whyInteresting: 'It mixes gentle creativity with clear systems, making it broad, streamable, and retention-friendly.',
          },
          ru: {
            title: 'Строитель Парка Снов',
            description: 'Уютная недельная builder-игра, где игроки проектируют сюрреалистичные аттракционы, настраивают поток посетителей и открывают кусочки истории по мере изменения атмосферы парка.',
            marketAngle: 'Cozy-construction игры расширяются, потому что игрокам нужна выразительная авторская свобода без жесткого наказания и с видимым прогрессом.',
            whyInteresting: 'Игра соединяет мягкое творчество с понятными системами, поэтому хорошо подходит широкой аудитории, стримам и удержанию.',
          },
        },
        {
          en: {
            title: 'Tactics Courier',
            description: 'A turn-based tactics game where players escort volatile cargo through changing districts, upgrading a squad between dangerous weekly contracts.',
            marketAngle: 'Tactics games keep interest when the mission stakes are clear and progression respects medium-length sessions.',
            whyInteresting: 'It provides strong decision density, squad attachment, and a weekly contract rhythm that structures progression.',
          },
          ru: {
            title: 'Тактический Курьер',
            description: 'Пошаговая тактическая игра, где игроки сопровождают нестабильный груз через меняющиеся районы и улучшают отряд между опасными недельными контрактами.',
            marketAngle: 'Тактические игры удерживают интерес, когда ставки миссии понятны, а прогресс хорошо ложится в средние по длине сессии.',
            whyInteresting: 'Игра дает высокую плотность решений, привязанность к отряду и недельный ритм контрактов, который хорошо структурирует прогрессию.',
          },
        },
      ][(variantSeed + index) % 6];

      return {
        en: { title: variants.en.title, description: variants.en.description, audience: gameAudience.en, marketAngle: variants.en.marketAngle, whyInteresting: variants.en.whyInteresting },
        ru: { title: variants.ru.title, description: variants.ru.description, audience: gameAudience.ru, marketAngle: variants.ru.marketAngle, whyInteresting: variants.ru.whyInteresting },
      };
    }

    const variants = [
      {
        en: {
          title: 'Ashfall Frontier',
          description: 'A progression-heavy survival action game where players reclaim a burning frontier, build moving bases, and unlock new traversal powers over long arcs.',
          marketAngle: 'Players still commit to long-form games when the fantasy, world progression, and ownership loop feel strong and legible.',
          whyInteresting: 'It offers a large aspirational fantasy with many architecture surfaces for systems, progression, and exploration.',
        },
        ru: {
          title: 'Пепельная Граница',
          description: 'Игра на выживание с сильной прогрессией, где игроки возвращают себе горящий фронтир, строят мобильные базы и открывают новые способы перемещения на длинной дистанции.',
          marketAngle: 'Игроки готовы входить в долгие игровые циклы, когда fantasy, world progression и чувство владения миром ощущаются сильно и понятно.',
          whyInteresting: 'Идея дает большую aspirational fantasy и много архитектурных поверхностей для систем, прогрессии и исследования.',
        },
      },
      {
        en: {
          title: 'Skyline Syndicate',
          description: 'A long-cycle tactics RPG where players grow a rebel crew, capture districts, and decide which alliances reshape the floating city each month.',
          marketAngle: 'Strategic RPGs stay compelling when they connect squad identity, world stakes, and persistent territorial change.',
          whyInteresting: 'The game promises deep retention through crew attachment, map control, and branching campaign decisions.',
        },
        ru: {
          title: 'Синдикат Небесной Линии',
          description: 'Долгосрочная тактическая RPG, где игроки выращивают команду повстанцев, захватывают районы и решают, какие союзы меняют парящий город каждый месяц.',
          marketAngle: 'Стратегические RPG остаются сильными, когда связывают identity отряда, ставки мира и постоянные территориальные изменения.',
          whyInteresting: 'Игра обещает глубокое удержание через привязанность к команде, контроль карты и ветвящиеся решения кампании.',
        },
      },
      {
        en: {
          title: 'Moon Colony Tycoon',
          description: 'A simulation game where players build a moon colony economy, negotiate competing factions, and keep morale, power, and logistics in balance.',
          marketAngle: 'Management players want rich systems again, but with cleaner readability and stronger thematic payoff than spreadsheet clones.',
          whyInteresting: 'It can support a deep monthly progression loop while still surfacing a vivid player fantasy.',
        },
        ru: {
          title: 'Тайкун Лунной Колонии',
          description: 'Симулятор, где игроки строят экономику лунной колонии, договариваются с конкурирующими фракциями и удерживают баланс морали, энергии и логистики.',
          marketAngle: 'Любители менеджмента снова хотят богатые системы, но с более чистой читаемостью и более сильной тематической отдачей, чем у spreadsheet-клонов.',
          whyInteresting: 'Игра поддерживает глубокую месячную прогрессию и при этом держит яркую fantasy игрока.',
        },
      },
      {
        en: {
          title: 'Myth Runner',
          description: 'An action-adventure game where players switch between mythic animal forms to cross biomes, solve traversal puzzles, and defeat seasonal bosses.',
          marketAngle: 'Adventure players respond strongly to traversal-driven identity and worlds that reward curiosity over raw grind.',
          whyInteresting: 'The form-switching mechanic creates a clear fantasy, strong visual identity, and many layered progression paths.',
        },
        ru: {
          title: 'Бегущий по Мифам',
          description: 'Экшен-приключение, где игроки переключаются между мифическими звериными формами, проходят биомы, решают навигационные головоломки и побеждают сезонных боссов.',
          marketAngle: 'Любители приключений сильно реагируют на traversal-driven identity и миры, которые вознаграждают любопытство, а не только гринд.',
          whyInteresting: 'Механика смены форм дает яркую fantasy, сильную визуальную идентичность и много слоев прогрессии.',
        },
      },
      {
        en: {
          title: 'Neon Drift League',
          description: 'A long-term arcade-racing game where players tune hover machines, master route tech, and compete in rotating league circuits.',
          marketAngle: 'Skill racers work when movement tech is expressive and league structure gives the player a medium-term reason to improve.',
          whyInteresting: 'It blends mastery, competition, and vehicle authorship into a clean long-term retention loop.',
        },
        ru: {
          title: 'Лига Неонового Дрифта',
          description: 'Долгосрочная аркадная гонка, где игроки настраивают hover-машины, осваивают технику трасс и соревнуются в меняющихся лигах.',
          marketAngle: 'Скилловые гонки работают особенно хорошо, когда movement tech выразителен, а структура лиг дает среднесрочную цель для роста.',
          whyInteresting: 'Игра соединяет мастерство, соревнование и авторство техники в чистую долгую retention-петлю.',
        },
      },
      {
        en: {
          title: 'Archive of Echoes',
          description: 'A narrative mystery game where players explore layered memories, reconstruct timelines, and unlock new branches by comparing conflicting versions of events.',
          marketAngle: 'Story-first players engage deeply when the investigation mechanic itself feels like play rather than passive reading.',
          whyInteresting: 'It offers a strong differentiator: the mystery loop is interactive, replayable, and structurally rich.',
        },
        ru: {
          title: 'Архив Эха',
          description: 'Нарративная mystery-игра, где игроки исследуют слоистые воспоминания, восстанавливают таймлайны и открывают новые ветки, сравнивая конфликтующие версии событий.',
          marketAngle: 'Игроки, любящие истории, сильно вовлекаются, когда сама механика расследования ощущается как игра, а не как пассивное чтение.',
          whyInteresting: 'Здесь есть сильный дифференциатор: петля расследования интерактивна, переигрываема и структурно богата.',
        },
      },
    ][(variantSeed + index) % 6];

    return {
      en: { title: variants.en.title, description: variants.en.description, audience: gameAudience.en, marketAngle: variants.en.marketAngle, whyInteresting: variants.en.whyInteresting },
      ru: { title: variants.ru.title, description: variants.ru.description, audience: gameAudience.ru, marketAngle: variants.ru.marketAngle, whyInteresting: variants.ru.whyInteresting },
    };
  }

  const directRule = TREND_INTEREST_DIRECT_PRODUCT_RULES[interest];
  const focus = directRule.focuses[(variantSeed + index) % directRule.focuses.length];
  const titleVariant = Math.floor((variantSeed + index) / Math.max(1, directRule.focuses.length));

  const dailyTitles = [
    { en: `${focus.subjectEn} Daily Coach`, ru: `Коуч по ${focus.subjectRu}` },
    { en: `${focus.subjectEn} Practice Loop`, ru: `Практика: ${focus.subjectRu}` },
    { en: `${focus.subjectEn} Pocket Trainer`, ru: `Тренажер по ${focus.subjectRu}` },
  ];
  const weeklyTitles = [
    { en: `${focus.subjectEn} Weekly Challenge`, ru: `Челлендж по ${focus.subjectRu}` },
    { en: `${focus.subjectEn} Skill Club`, ru: `Клуб: ${focus.subjectRu}` },
    { en: `${focus.subjectEn} Progress Sprint`, ru: `Спринт прогресса: ${focus.subjectRu}` },
  ];
  const monthlyTitles = [
    { en: `${focus.subjectEn} Growth Path`, ru: `Путь роста: ${focus.subjectRu}` },
    { en: `${focus.subjectEn} in 30 Days`, ru: `${focus.subjectRu} за 30 дней` },
    { en: `${focus.subjectEn} Mastery Studio`, ru: `Студия мастерства: ${focus.subjectRu}` },
  ];

  const marketAngle = {
    en: {
      daily: `People are looking for products that help them make visible daily progress in ${focus.subjectEn} instead of relying on passive content or scattered routines.`,
      weekly: `A weekly loop around ${focus.subjectEn} creates a clear reason to come back, measure progress, and try a different business angle in the same subdomain.`,
      monthly: `A 30-day transformation story around ${focus.subjectEn} gives the buyer a concrete before/after result and stronger willingness to pay.`,
    },
    ru: {
      daily: `Пользователям нужны продукты, которые дают видимый ежедневный прогресс в теме "${focus.subjectRu}", а не еще один пассивный контентный каталог или разрозненные рутины.`,
      weekly: `Недельный цикл вокруг темы "${focus.subjectRu}" дает понятную причину возвращаться, измерять прогресс и даже тестировать разные бизнес-углы в одном и том же поднаправлении.`,
      monthly: `30-дневная трансформация вокруг темы "${focus.subjectRu}" дает покупателю очень понятный результат до/после и сильнее обосновывает плату.`,
    },
  };
  const whyInteresting = {
    en: {
      daily: `It sells a direct user outcome in ${focus.subjectEn}, not software for companies serving that market.`,
      weekly: `The same subdomain can support multiple business ideas through a different target user, monetization model, or retention loop.`,
      monthly: `A direct product in ${focus.subjectEn} can monetize through visible transformation, progression, and premium guidance rather than back-office automation.`,
    },
    ru: {
      daily: `Такой продукт продает прямой пользовательский результат в теме "${focus.subjectRu}", а не софт для компаний вокруг этой ниши.`,
      weekly: `Даже одно и то же поднаправление здесь может дать несколько бизнес-идей за счет другой аудитории, монетизации или retention-loop.`,
      monthly: `Прямой продукт в теме "${focus.subjectRu}" монетизируется через видимую трансформацию, прогрессию и premium-guidance, а не через back-office автоматизацию.`,
    },
  };

  if (cadence === 'daily') {
    const title = dailyTitles[titleVariant % dailyTitles.length];
    return {
      en: {
        title: title.en,
        description: `A ${profile.primaryDevice === 'mobile' ? 'mobile-first ' : ''}app where ${focus.audienceEn} ${focus.dailyActionEn} in short daily sessions so they can ${focus.outcomeEn}.`,
        audience: focus.audienceEn,
        marketAngle: marketAngle.en.daily,
        whyInteresting: whyInteresting.en.daily,
      },
      ru: {
        title: title.ru,
        description: `${profile.primaryDevice === 'mobile' ? 'Mobile-first ' : ''}приложение, где ${focus.audienceRu} ${focus.dailyActionRu} в коротких ежедневных сессиях, чтобы ${focus.outcomeRu}.`,
        audience: focus.audienceRu,
        marketAngle: marketAngle.ru.daily,
        whyInteresting: whyInteresting.ru.daily,
      },
    };
  }

  if (cadence === 'weekly') {
    const title = weeklyTitles[titleVariant % weeklyTitles.length];
    return {
      en: {
        title: title.en,
        description: `An app that packages ${focus.subjectEn} into a seven-day loop with goals, review moments, and a weekly reason to return and improve.`,
        audience: focus.audienceEn,
        marketAngle: marketAngle.en.weekly,
        whyInteresting: whyInteresting.en.weekly,
      },
      ru: {
        title: title.ru,
        description: `Приложение, которое упаковывает "${focus.subjectRu}" в семидневный цикл с целями, обзором прогресса и понятной недельной причиной вернуться и улучшиться.`,
        audience: focus.audienceRu,
        marketAngle: marketAngle.ru.weekly,
        whyInteresting: whyInteresting.ru.weekly,
      },
    };
  }

  const title = monthlyTitles[titleVariant % monthlyTitles.length];
  return {
    en: {
      title: title.en,
      description: `A progression product with 30-day milestones, deeper personalization, and visible before/after progress around ${focus.subjectEn}.`,
      audience: focus.audienceEn,
      marketAngle: marketAngle.en.monthly,
      whyInteresting: whyInteresting.en.monthly,
    },
    ru: {
      title: title.ru,
      description: `Продукт с 30-дневными вехами, более глубокой персонализацией и видимым прогрессом до/после вокруг темы "${focus.subjectRu}".`,
      audience: focus.audienceRu,
      marketAngle: marketAngle.ru.monthly,
      whyInteresting: whyInteresting.ru.monthly,
    },
  };
}

function buildTrendFallbackTemplateIdea(
  interest: TrendNicheInterest,
  cadence: TrendNicheCadence,
  index: number,
  variantSeed = 0,
): TrendNicheIdea {
  const profile = TREND_INTEREST_PROFILES[interest];
  const localized = buildTrendFallbackTemplateCopy(interest, cadence, index, variantSeed);
  const cadenceCategories: Record<TrendNicheCadence, TrendNicheInterest[]> = {
    daily: ['ai', 'productivity'],
    weekly: ['productivity', 'social'],
    monthly: ['productivity', 'ai'],
  };
  const categories = Array.from(new Set<TrendNicheInterest>([
    interest,
    ...profile.related,
    ...cadenceCategories[cadence],
  ])).slice(0, 3);

  return makeTrendIdea({
    id: `${cadence}-${interest}-task-${variantSeed}-${index + 1}`,
    cadence,
    categories,
    theme: profile.theme,
    localized: getLocalizedRecord(localized.en, localized.ru),
    primaryDevice: profile.primaryDevice,
    navigation: profile.primaryDevice === 'mobile' ? 'bottom-tabs' : 'sidebar',
  });
}

function isDirectInterestProductIdea(
  interest: TrendNicheInterest,
  idea: TrendNicheIdea,
): boolean {
  const rule = TREND_INTEREST_DIRECT_PRODUCT_RULES[interest];
  const en = getTrendIdeaText(idea, 'en');
  const ru = getTrendIdeaText(idea, 'ru');
  const text = [
    en.title,
    en.description,
    en.audience,
    en.marketAngle,
    en.whyInteresting,
    ru.title,
    ru.description,
    ru.audience,
    ru.marketAngle,
    ru.whyInteresting,
  ].join(' ').toLowerCase();

  return !rule.bannedPattern.test(text);
}

function finalizeTrendIdeasForInterest(
  ideas: TrendNicheIdea[],
  cadence: TrendNicheCadence,
  selectedInterest?: TrendNicheInterest | null,
  variantSeed = 0,
): TrendNicheIdea[] {
  if (!selectedInterest) {
    return dedupeTrendIdeas(ideas).slice(0, 3);
  }

  const relevant = ideas.filter(idea =>
    idea.categories.includes(selectedInterest)
    && isDirectInterestProductIdea(selectedInterest, idea),
  );
  const templates = [0, 1, 2].map(index => buildTrendFallbackTemplateIdea(selectedInterest, cadence, index, variantSeed));
  return dedupeTrendIdeas([...relevant, ...templates]).slice(0, 3);
}

/** Extract topic keywords from a set of ideas to use as exclusion hints for shallower cadences */
function extractTopicHints(ideas: TrendNicheIdea[]): string[] {
  return ideas.flatMap(idea => {
    const tokens: string[] = [];
    // Extract the most specific topic identifiers: appName words + painPoint first clause
    const name = (idea.appName ?? '').toLowerCase();
    const pain = (idea.painPoint ?? '').toLowerCase().split(/[.,;]/)[0];
    const ctx = (idea.marketContext ?? '').toLowerCase().split(/[.,;]/)[0];
    if (name) tokens.push(name);
    if (pain && pain.length > 10) tokens.push(pain.slice(0, 80));
    if (ctx && ctx.length > 10) tokens.push(ctx.slice(0, 80));
    return tokens;
  });
}

async function generateTrendIdeasForCadence(
  cadence: TrendNicheCadence,
  language = 'en',
  googleAccessToken?: string | null,
  selectedInterest?: TrendNicheInterest | null,
  refreshSeed = 0,
  excludeTopics: string[] = [],
): Promise<TrendNicheIdea[]> {
  const ideas = await generateIdeas(
    buildTrendCadencePrompt(cadence, language, selectedInterest, refreshSeed, excludeTopics),
    3,
    googleAccessToken,
  );

  return ideas.slice(0, 3).map((idea, index) => {
    const parsedCategories = Array.isArray((idea as { categories?: unknown[] }).categories)
      ? (idea as { categories?: unknown[] }).categories?.filter(isTrendNicheInterest) ?? []
      : [];
    const categories = Array.from(new Set<TrendNicheInterest>([
      ...(selectedInterest ? [selectedInterest] : []),
      ...parsedCategories,
    ]));

    return normalizeTrendIdea(
      {
        ...idea,
        id: String((idea as { id?: unknown }).id ?? `${cadence}-${selectedInterest ?? 'trend'}-${index + 1}`),
        categories,
      } as Record<string, unknown>,
      cadence,
      language,
    );
  });
}

function inferTrendCategories(idea: Record<string, unknown>): TrendNicheInterest[] {
  const text = [
    idea.appName,
    idea.description,
    idea.targetUser,
    idea.targetAudience,
    idea.marketContext,
    idea.painPoint,
  ].filter(Boolean).join(' ').toLowerCase();
  const categories = new Set<TrendNicheInterest>();
  if (/game|gaming|player|игр|игрок/.test(text)) categories.add('games');
  if (/health|clinic|patient|medical|doctor|wellness|мед|клиник|пациент|здоров/.test(text)) categories.add('medicine');
  if (/finance|tax|cash|invoice|bank|fintech|налог|финанс|инвойс/.test(text)) categories.add('fintech');
  if (/wellness|fitness|recovery|burnout|sleep|выгоран|сон|восстанов/.test(text)) categories.add('wellness');
  if (/social|community|creator|content|review|социал|контент|комьюнити/.test(text)) categories.add('social');
  if (/task|workflow|productivity|automation|calendar|задач|автомат|календар/.test(text)) categories.add('productivity');
  if (/learn|study|student|education|exam|обуч|экзамен|студент/.test(text)) categories.add('education');
  if (/commerce|shop|store|seller|ecommerce|marketplace|магазин|продав/.test(text)) categories.add('commerce');
  if (/ai|agent|copilot|llm|gpt|ии|нейро/.test(text)) categories.add('ai');
  if (/developer|code|release|test|devtool|commit|разработ|код|релиз/.test(text)) categories.add('developer-tools');
  return categories.size > 0 ? Array.from(categories) : ['productivity', 'ai'];
}

function buildFallbackLocalizedCopy(
  idea: Record<string, unknown>,
  language: string,
): TrendNicheLocalizedCopy {
  const title = String(idea.appName ?? idea.title ?? idea.targetAudience ?? 'Trend niche').trim();
  const description = String(idea.description ?? idea.pitch ?? idea.painPoint ?? idea.marketContext ?? '').trim();
  const audience = String(idea.targetAudience ?? idea.targetUser ?? '').trim();
  const marketAngle = String(idea.marketContext ?? idea.buyerReason ?? '').trim();
  const whyInteresting = String(idea.competitorGap ?? idea.marketGap ?? idea.unfairAdvantage ?? idea.painPoint ?? '').trim();
  if (normalizeLanguage(language) === 'ru') {
    return {
      title,
      description: description || 'Идея для быстрого founder-ready прототипа.',
      audience: audience || 'Пользователи с выраженной операционной болью.',
      marketAngle: marketAngle || 'Ниша показывает спрос и понятный рыночный вход.',
      whyInteresting: whyInteresting || 'Интересна узким wedge, быстрым прототипом и понятной монетизацией.',
    };
  }
  return {
    title,
    description: description || 'Idea for a fast founder-ready prototype.',
    audience: audience || 'Users with a clear operational pain.',
    marketAngle: marketAngle || 'The niche has visible demand and a clear market entry.',
    whyInteresting: whyInteresting || 'Interesting because it has a narrow wedge, fast prototype path, and clear monetization.',
  };
}

function normalizeTrendIdea(
  raw: Record<string, unknown>,
  cadence: TrendNicheCadence,
  language = 'en',
): TrendNicheIdea {
  const lang = normalizeLanguage(language);
  const baseCopy = buildFallbackLocalizedCopy(raw, lang);
  const enCopy = lang === 'en' ? baseCopy : buildFallbackLocalizedCopy(raw, 'en');
  const ruCopy = lang === 'ru' ? baseCopy : buildFallbackLocalizedCopy(raw, 'ru');
  const seededLocalized = getLocalizedRecord(
    enCopy,
    ruCopy,
    lang !== 'en' && lang !== 'ru' ? { [lang]: baseCopy } : {},
  );
  const localized = (raw.localized && typeof raw.localized === 'object')
    ? {
      ...seededLocalized,
      ...(raw.localized as Record<string, TrendNicheLocalizedCopy>),
      [lang]: (raw.localized as Record<string, TrendNicheLocalizedCopy>)[lang] ?? baseCopy,
    }
    : seededLocalized;
  const id = String(raw.id ?? `${cadence}-${String(raw.appName ?? raw.title ?? baseCopy.title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
  return {
    ...raw,
    appName: String(raw.appName ?? raw.title ?? enCopy.title),
    description: String(raw.description ?? raw.pitch ?? enCopy.description),
    theme: String(raw.theme ?? 'dark-slate'),
    targetUser: String(raw.targetUser ?? enCopy.audience),
    layout: (raw.layout as ProjectPlan['layout']) ?? { type: 'dashboard', navigation: 'sidebar' },
    uxPatterns: (raw.uxPatterns as ProjectPlan['uxPatterns']) ?? { emptyStates: true, searchAndFilter: true },
    responsiveness: (raw.responsiveness as ProjectPlan['responsiveness']) ?? { primaryDevice: 'desktop', mobileFirst: false },
    pages: (raw.pages as ProjectPlan['pages']) ?? [],
    dataModel: raw.dataModel as ProjectPlan['dataModel'],
    criticalUiRules: Array.isArray(raw.criticalUiRules) ? raw.criticalUiRules as string[] : [],
    shadcnComponents: Array.isArray(raw.shadcnComponents) ? raw.shadcnComponents as string[] : [],
    icons: Array.isArray(raw.icons) ? raw.icons as string[] : [],
    id,
    cadence,
    categories: Array.isArray(raw.categories)
      ? (raw.categories as TrendNicheInterest[]).filter(Boolean)
      : inferTrendCategories(raw),
    localized,
    marketContext: String(raw.marketContext ?? raw.buyerReason ?? baseCopy.marketAngle),
    targetAudience: String(raw.targetAudience ?? raw.targetUser ?? baseCopy.audience),
    painPoint: String(raw.painPoint ?? raw.pitch ?? baseCopy.description),
    competitorGap: String(raw.competitorGap ?? raw.marketGap ?? raw.unfairAdvantage ?? baseCopy.whyInteresting),
    generatedAt: String(raw.generatedAt ?? new Date().toISOString()),
  } as TrendNicheIdea;
}

function dedupeTrendIdeas(
  ideas: TrendNicheIdea[],
  seen = new Set<string>(),
): TrendNicheIdea[] {
  const result: TrendNicheIdea[] = [];
  for (const idea of ideas) {
    const text = getTrendIdeaText(idea, 'en');
    const key = `${idea.id || ''}:${text.title.toLowerCase()}:${text.description.toLowerCase().slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(idea);
  }
  return result;
}

export function makeDefaultTrendModel(): TrendNichesModel {
  const seen = new Set<string>();
  return {
    daily: dedupeTrendIdeas(DEFAULT_TREND_NICHES.daily.map(cloneTrendIdea), seen),
    weekly: dedupeTrendIdeas(DEFAULT_TREND_NICHES.weekly.map(cloneTrendIdea), seen),
    monthly: dedupeTrendIdeas(DEFAULT_TREND_NICHES.monthly.map(cloneTrendIdea), seen),
    generatedAt: new Date().toISOString(),
    dateKey: getTodayKey(),
    weekKey: getISOWeekKey(),
    monthKey: getMonthKey(),
    taskInterest: null,
    languageKey: 'en',
  };
}

function isTrendModelFresh(
  model: Partial<TrendNichesModel>,
  language = 'en',
  selectedInterest?: TrendNicheInterest | null,
): boolean {
  const modelLanguage = typeof model.languageKey === 'string' && model.languageKey.trim()
    ? normalizeLanguage(model.languageKey)
    : null;
  const modelInterest = isTrendNicheInterest(model.taskInterest) ? model.taskInterest : null;
  return model.dateKey === getTodayKey()
    && model.weekKey === getISOWeekKey()
    && model.monthKey === getMonthKey()
    && modelLanguage === normalizeLanguage(language)
    && modelInterest === (selectedInterest ?? null);
}

export function getTrendIdeaText(idea: TrendNicheIdea, language = 'en'): TrendNicheLocalizedCopy {
  const lang = normalizeLanguage(language);
  return idea.localized?.[lang]
    ?? idea.localized?.en
    ?? buildFallbackLocalizedCopy(idea, lang);
}

export function filterTrendNicheIdeas(
  ideas: TrendNicheIdea[],
  interests: TrendNicheInterest[],
): TrendNicheIdea[] {
  if (interests.length === 0) return dedupeTrendIdeas(ideas);
  const selected = new Set(interests);
  return dedupeTrendIdeas(ideas.filter(idea =>
    idea.categories.some(category => selected.has(category)),
  ));
}

export function loadTrendNicheInterests(): TrendNicheInterest[] {
  try {
    const raw = localStorage.getItem(IDEA_FEED_STORAGE_KEYS.trendInterests);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is TrendNicheInterest => isTrendNicheInterest(item));
  } catch {
    return [];
  }
}

export function saveTrendNicheInterests(interests: TrendNicheInterest[]): void {
  try {
    localStorage.setItem(IDEA_FEED_STORAGE_KEYS.trendInterests, JSON.stringify(Array.from(new Set(interests))));
    emitIdeaFeedUpdate(IDEA_FEED_STORAGE_KEYS.trendInterests);
  } catch {
    // localStorage may be unavailable or full
  }
}

export function loadCachedTrendNiches(): TrendNichesModel | null {
  try {
    const raw = localStorage.getItem(IDEA_FEED_STORAGE_KEYS.trendNiches);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TrendNichesModel>;
    if (!Array.isArray(parsed.daily) || !Array.isArray(parsed.weekly) || !Array.isArray(parsed.monthly)) return null;
    return {
      daily: parsed.daily.map(idea => normalizeTrendIdea(idea as Record<string, unknown>, 'daily')),
      weekly: parsed.weekly.map(idea => normalizeTrendIdea(idea as Record<string, unknown>, 'weekly')),
      monthly: parsed.monthly.map(idea => normalizeTrendIdea(idea as Record<string, unknown>, 'monthly')),
      generatedAt: parsed.generatedAt ?? new Date().toISOString(),
      dateKey: parsed.dateKey ?? '',
      weekKey: parsed.weekKey ?? '',
      monthKey: parsed.monthKey ?? '',
      taskInterest: isTrendNicheInterest(parsed.taskInterest) ? parsed.taskInterest : null,
      languageKey: typeof parsed.languageKey === 'string' && parsed.languageKey.trim()
        ? normalizeLanguage(parsed.languageKey)
        : '',
    };
  } catch {
    return null;
  }
}

export async function ensureTrendNichesModel(
  language = 'en',
  googleAccessToken?: string | null,
  force = false,
  selectedInterest?: TrendNicheInterest | null,
): Promise<TrendNichesModel> {
  const cached = loadCachedTrendNiches();
  if (!force && cached && isTrendModelFresh(cached, language, selectedInterest)) return cached;
  const refreshSeed = getTrendRefreshSeed(force);

  const fallback = makeDefaultTrendModel();
  let daily = fallback.daily;
  let weekly = fallback.weekly;
  let monthly = fallback.monthly;

  if (selectedInterest && hasIdeaGenerationAccess(googleAccessToken)) {
    // Sequential: monthly → weekly → daily so each shallower cadence excludes
    // topics already covered at deeper cadences (no "English learning" in all three).
    const monthlyResult = await generateTrendIdeasForCadence(
      'monthly', language, googleAccessToken, selectedInterest, refreshSeed,
    ).catch(() => [] as TrendNicheIdea[]);
    if (monthlyResult.length > 0) monthly = monthlyResult;

    const weeklyExclude = extractTopicHints(monthly);
    const weeklyResult = await generateTrendIdeasForCadence(
      'weekly', language, googleAccessToken, selectedInterest, refreshSeed, weeklyExclude,
    ).catch(() => [] as TrendNicheIdea[]);
    if (weeklyResult.length > 0) weekly = weeklyResult;

    const dailyExclude = [...weeklyExclude, ...extractTopicHints(weekly)];
    const dailyResult = await generateTrendIdeasForCadence(
      'daily', language, googleAccessToken, selectedInterest, refreshSeed, dailyExclude,
    ).catch(() => [] as TrendNicheIdea[]);
    if (dailyResult.length > 0) daily = dailyResult;

  } else if (hasIdeaGenerationAccess(googleAccessToken)) {
    // No interest selected: run hot/niche concurrently for speed, then monthly
    // (monthly references its own topics only — different vertical, so parallel is fine)
    const [hotResult, nicheResult, monthlyResult] = await Promise.allSettled([
      ensureHotIdeas(googleAccessToken, force),
      ensureNicheIdeas(googleAccessToken, force),
      generateTrendIdeasForCadence('monthly', language, googleAccessToken, null, refreshSeed),
    ]);

    let anyLlmSuccess = false;

    if (hotResult.status === 'fulfilled' && hotResult.value.length > 0) {
      daily = hotResult.value
        .slice(0, 3)
        .map(idea => normalizeTrendIdea(idea as unknown as Record<string, unknown>, 'daily', language));
      anyLlmSuccess = true;
    } else {
      daily = fallback.daily;
    }

    if (nicheResult.status === 'fulfilled' && nicheResult.value.length > 0) {
      weekly = nicheResult.value
        .slice(0, 3)
        .map(idea => normalizeTrendIdea(idea as unknown as Record<string, unknown>, 'weekly', language));
      anyLlmSuccess = true;
    } else {
      weekly = fallback.weekly;
    }

    if (monthlyResult.status === 'fulfilled' && monthlyResult.value.length > 0) {
      monthly = monthlyResult.value;
      anyLlmSuccess = true;
    } else {
      monthly = fallback.monthly;
    }

    // If ALL cadences fell back to defaults, signal error — cache will NOT be written below
    if (!anyLlmSuccess) {
      emitIdeaFeedUpdate('aic:idea-feed-error');
    }
  }

  // Track whether LLM actually produced content (needed to decide whether to cache)
  const llmProducedContent =
    daily !== fallback.daily || weekly !== fallback.weekly || monthly !== fallback.monthly;

  const seen = new Set<string>();
  const model: TrendNichesModel = {
    daily: dedupeTrendIdeas(finalizeTrendIdeasForInterest(daily, 'daily', selectedInterest, refreshSeed), seen).slice(0, 3),
    weekly: dedupeTrendIdeas(finalizeTrendIdeasForInterest(weekly, 'weekly', selectedInterest, refreshSeed), seen).slice(0, 3),
    monthly: dedupeTrendIdeas(finalizeTrendIdeasForInterest(monthly, 'monthly', selectedInterest, refreshSeed), seen).slice(0, 3),
    generatedAt: new Date().toISOString(),
    dateKey: getTodayKey(),
    weekKey: getISOWeekKey(),
    monthKey: getMonthKey(),
    taskInterest: selectedInterest ?? null,
    languageKey: normalizeLanguage(language),
  };

  try {
    // Only persist to cache if LLM actually produced content.
    // If all cadences fell back to DEFAULT_TREND_NICHES, skip caching so the
    // next app startup will retry LLM instead of serving stale hardcoded defaults.
    if (llmProducedContent) {
      localStorage.setItem(IDEA_FEED_STORAGE_KEYS.trendNiches, JSON.stringify(model));
      emitIdeaFeedUpdate(IDEA_FEED_STORAGE_KEYS.trendNiches);
      void saveTrendTopicsToArchive(model);
    }
  } catch {
    // localStorage may be unavailable or full
  }

  return model;
}

// ── Trend Topic Archive ────────────────────────────────────────────────────────
// After each successful LLM generation we POST the topic names (appName) to the
// backend so they accumulate in trend-archive.json. These are the themes that
// have been *surfaced* but not necessarily launched yet.
async function saveTrendTopicsToArchive(model: TrendNichesModel): Promise<void> {
  const toLine = (ideas: TrendNicheIdea[]) =>
    ideas.map(i => i.appName).filter(Boolean).join(', ');

  const body = {
    interest: model.taskInterest ?? undefined,
    daily:    toLine(model.daily),
    weekly:   toLine(model.weekly),
    monthly:  toLine(model.monthly),
  };

  // Skip if nothing to save
  if (!body.daily && !body.weekly && !body.monthly) return;

  try {
    const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://127.0.0.1:3000';
    await fetch(`${apiUrl}/trend-archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // Backend may be offline — silently ignore
  }
}

export async function fetchTrendArchive(): Promise<TrendArchiveEntry[]> {
  try {
    const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://127.0.0.1:3000';
    const res = await fetch(`${apiUrl}/trend-archive`);
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as TrendArchiveEntry[]) : [];
  } catch {
    return [];
  }
}

export interface TrendArchiveEntry {
  id: string;
  date: string;
  interest: string | null;
  daily: string;
  weekly: string;
  monthly: string;
  createdAt: string;
}

export function loadTrendIdeaBank(): TrendIdeaBankItem[] {
  try {
    const raw = localStorage.getItem(IDEA_FEED_STORAGE_KEYS.trendBank);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return dedupeTrendIdeas(parsed.map((item) => normalizeTrendIdea(
      (item.idea ?? item) as Record<string, unknown>,
      ((item.idea?.cadence ?? item.cadence ?? 'daily') as TrendNicheCadence),
    ))).map((idea, index) => {
      const source = parsed[index] as Partial<TrendIdeaBankItem>;
      return {
        idea,
        savedAt: source.savedAt ?? new Date().toISOString(),
        sentToChatCount: Number(source.sentToChatCount ?? 0),
        lastSentAt: source.lastSentAt,
      };
    });
  } catch {
    return [];
  }
}

function saveTrendIdeaBank(items: TrendIdeaBankItem[]): void {
  const seen = new Set<string>();
  const deduped: TrendIdeaBankItem[] = [];
  for (const item of items) {
    const key = item.idea.id;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  localStorage.setItem(IDEA_FEED_STORAGE_KEYS.trendBank, JSON.stringify(deduped.slice(0, 60)));
  emitIdeaFeedUpdate(IDEA_FEED_STORAGE_KEYS.trendBank);
}

export function saveTrendIdeaToBank(idea: TrendNicheIdea): TrendIdeaBankItem[] {
  const bank = loadTrendIdeaBank();
  const normalizedIdea = normalizeTrendIdea(idea as unknown as Record<string, unknown>, idea.cadence);
  const existing = bank.find(item => item.idea.id === normalizedIdea.id);
  const next = existing
    ? bank
    : [{ idea: normalizedIdea, savedAt: new Date().toISOString(), sentToChatCount: 0 }, ...bank];
  saveTrendIdeaBank(next);
  return next;
}

export function removeTrendIdeaFromBank(ideaId: string): TrendIdeaBankItem[] {
  const next = loadTrendIdeaBank().filter(item => item.idea.id !== ideaId);
  saveTrendIdeaBank(next);
  return next;
}

export function markTrendIdeaSentToChat(ideaId: string): TrendIdeaBankItem[] {
  const now = new Date().toISOString();
  const next = loadTrendIdeaBank().map(item =>
    item.idea.id === ideaId
      ? { ...item, sentToChatCount: item.sentToChatCount + 1, lastSentAt: now }
      : item,
  );
  saveTrendIdeaBank(next);
  return next;
}
