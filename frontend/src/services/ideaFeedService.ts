import { ConfigService } from './ConfigService';
import { GeminiService } from './GeminiService';
import { supabase } from '../lib/supabase';
import {
  getLocalDevAgentProvider,
  isLocalDevAgentEnabled,
  syncLocalDevAgentMode,
} from './devAgentMode';
import type { ProjectPlan } from './SimpleGeneration';

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

const PLAN_SCHEMA = `{
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

function buildHotIdeasPrompt(): string {
  return `You are a product strategist with real-time internet access and deep knowledge of emerging markets.
Today is ${new Date().toDateString()}.

Generate 3 fresh product ideas based on current trends, recent news, and emerging user needs.

Each idea must be a COMPLETE product plan in the same JSON format as our Architect agent outputs — including:
- productStrategy (coreAction, retentionLoop, paywall if needed)
- userJourney (onboarding steps if needed with specific questions and options, firstSession description)
- ALL pages including Onboarding (if needed) and Settings
- dataModel with realistic seedData (3 domain-specific examples, never "Item 1" or "Sample Task")
- uxPatterns and responsiveness

This plan will be sent DIRECTLY to the code generator — skipping the Architect step.
So it must be as detailed as an Architect output.
Every page must have a full uiSpec (100+ words describing every section, element, empty state, mobile layout).
Onboarding must have specific questions with options (not placeholders).
Seed data must have 3 realistic domain-specific examples.

For each idea use this EXACT schema:

${PLAN_SCHEMA}

Also add these fields to each plan object:
{
  "id": "kebab-case-unique-id",
  "marketContext": "Why this is relevant RIGHT NOW — cite specific recent trend, news, or event",
  "targetAudience": "Specific person who needs this — precise, not generic",
  "painPoint": "The exact problem being solved",
  "competitorGap": "What existing solutions are missing",
  "generatedAt": "${new Date().toISOString()}"
}

RULES:
- onboarding.needed = true only if the app is meaningfully different based on user input
  (a tip calculator needs no onboarding; a fitness tracker does)
- pages[] must include Onboarding (if needed), all main screens, and Settings
- showInNav: false for Onboarding and any Paywall screens
- seedData.needed = true for ANY app with lists or content
- theme must match emotional tone: trust=health/finance, neon=gaming, warm=food/travel, bloom=wellness, dark-slate=tools
- primaryDevice: "mobile" for consumer apps, "desktop" for tools/dashboards
- Be specific: not "fitness tracker" but "recovery tracker for amateur marathon runners"
- NEVER use words: landing page, SaaS, MVP, webapp

Output: JSON array of 3 plan objects. No markdown. No explanation.`;
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

For each niche, generate a COMPLETE product architecture plan for the best product opportunity within it.

Each plan must be as detailed as a senior product architect's output — including:
- productStrategy (coreAction, retentionLoop, paywall if needed)
- userJourney (onboarding steps if needed with specific questions and options, firstSession description)
- ALL pages including Onboarding (if needed) and Settings
- dataModel with realistic seedData (3 domain-specific examples, never "Item 1")
- uxPatterns and responsiveness

This plan will be sent DIRECTLY to the code generator — skipping the Architect step.
Every page must have a full uiSpec (100+ words).
Onboarding must have specific questions with real options (not placeholders).
Seed data must have 3 realistic domain-specific examples.

Use this EXACT schema:

${PLAN_SCHEMA}

Also add these fields:
{
  "id": "kebab-case-unique-id",
  "marketContext": "Why this niche is hot RIGHT NOW — specific reason with a concrete trigger",
  "targetAudience": "Specific person in this niche",
  "painPoint": "The exact problem the product solves",
  "competitorGap": "What existing solutions in this niche are missing",
  "generatedAt": "${new Date().toISOString()}"
}

RULES:
- Be specific: not "AI tools" but "AI tools for independent insurance adjusters"
- marketContext must name a real recent trigger (regulation, tech release, seasonal event)
- competitorGap must be a real weakness, not just "better UX"
- No generic niches like "health", "finance", "productivity"
- onboarding.needed = true only if app is meaningfully different based on user input
- showInNav: false for Onboarding and Paywall screens
- seedData.needed = true for any app with lists or content
- NEVER use words: landing page, SaaS, MVP

Output: JSON array of 3 plan objects. No markdown. No explanation.`;
}

function safeParseJSONArray(raw: string): Record<string, unknown>[] {
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

async function generateIdeas(
  prompt: string,
  count: number,
  googleAccessToken?: string | null,
): Promise<IdeaPlan[]> {
  let devAgentProvider = getLocalDevAgentProvider();
  try {
    const modeResp = await fetch('http://localhost:3107/dev-agent-mode');
    if (modeResp.ok) {
      devAgentProvider = syncLocalDevAgentMode(await modeResp.json());
    }
  } catch {
    // bridge unreachable: keep local mode as fallback
  }
  const devAgentActive = devAgentProvider !== 'off';

  let text = '';

  if (devAgentActive) {
    const bridgeCtrl = new AbortController();
    const bridgeTimeoutMs = 180_000;
    const bridgeTimer = window.setTimeout(() => bridgeCtrl.abort(), bridgeTimeoutMs);
    let bridgeResp: Response;
    try {
      bridgeResp = await fetch('http://localhost:3107/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: bridgeCtrl.signal,
        body: JSON.stringify({
          message: prompt,
          model: devAgentProvider === 'codex' ? 'gpt-5.1-codex' : 'claude-sonnet-4-6',
        }),
      });
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') {
        throw new Error(`Local ${devAgentProvider} bridge timed out after ${Math.round(bridgeTimeoutMs / 1000)}s.`);
      }
      throw err;
    } finally {
      window.clearTimeout(bridgeTimer);
    }

    if (!bridgeResp.ok) {
      const err = await bridgeResp.text();
      throw new Error(`Dev agent bridge ${bridgeResp.status}: ${err.slice(0, 200)}`);
    }

    const bridgeData = await bridgeResp.json() as { content?: Array<{ text?: string }> };
    text = bridgeData.content?.[0]?.text ?? '';
    if (!text.trim()) {
      throw new Error('Dev agent bridge returned empty response');
    }
  }

  if (!text.trim()) {
    text = await GeminiService.generate({
      prompt,
      googleAccessToken,
      maxTokens: 6000,
      onLog: (msg) => console.log(msg),
    });
  }

  const raw = safeParseJSONArray(text.trim());
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

export function loadCachedHotIdeas(): IdeaPlan[] {
  try {
    const raw = localStorage.getItem(IDEA_FEED_STORAGE_KEYS.hotIdeas);
    if (!raw) return [];
    const cached = JSON.parse(raw) as { ideas?: IdeaPlan[]; date?: string };
    return needsHotRefresh(cached.date ?? '') ? [] : (cached.ideas ?? []);
  } catch {
    return [];
  }
}

export function loadCachedNiches(): IdeaPlan[] {
  try {
    const raw = localStorage.getItem(IDEA_FEED_STORAGE_KEYS.niches);
    if (!raw) return [];
    const cached = JSON.parse(raw) as { ideas?: IdeaPlan[]; week?: string };
    return needsNicheRefresh(cached.week ?? '') ? [] : (cached.ideas ?? []);
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

async function fetchRemoteHotIdeas(): Promise<IdeaPlan[] | null> {
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
    return ideas as IdeaPlan[];
  } catch {
    return null;
  }
}

async function fetchRemoteNicheIdeas(): Promise<IdeaPlan[] | null> {
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
    return ideas as IdeaPlan[];
  } catch {
    return null;
  }
}

export async function ensureHotIdeas(
  googleAccessToken?: string | null,
  force = false,
): Promise<IdeaPlan[]> {
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
  const ideas = await generateIdeas(buildHotIdeasPrompt(), 3, googleAccessToken);
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
): Promise<IdeaPlan[]> {
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
  const ideas = await generateIdeas(buildNichesPrompt(), 3, googleAccessToken);
  localStorage.setItem(IDEA_FEED_STORAGE_KEYS.niches, JSON.stringify({
    ideas,
    week: String(getWeekNumber()),
  }));
  emitIdeaFeedUpdate(IDEA_FEED_STORAGE_KEYS.niches);
  return ideas;
}
