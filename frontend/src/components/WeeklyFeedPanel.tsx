/**
 * WeeklyFeedPanel â€” slide-out panel anchored to the right of AppSidebar.
 *
 * 3 tabs:
 *  ðŸ”¥ Ð˜Ð´ÐµÐ¸ ÑÐµÐ³Ð¾Ð´Ð½Ñ  â€” 6 ideas generated daily, each is a full ProjectPlan
 *  ðŸ“ˆ ÐÐ¸ÑˆÐ¸ Ð½ÐµÐ´ÐµÐ»Ð¸   â€” 5 niches generated weekly, each is a full ProjectPlan
 *  ðŸ¦ Ð‘Ð°Ð½Ðº Ð¸Ð´ÐµÐ¹     â€” saved IdeaPlan items
 *
 * Generation via ConfigService.resolveModel('primary') + getKeyForAgent('primary').
 * If no key â†’ shows "ÐÐ°ÑÑ‚Ñ€Ð¾Ð¹Ñ‚Ðµ API ÐºÐ»ÑŽÑ‡ Ð² Settings".
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, Loader2, Bookmark, BookmarkCheck, Trash2, RefreshCw, Zap } from 'lucide-react';
import { ConfigService } from '../services/ConfigService';
import { GeminiService } from '../services/GeminiService';
import { getDevAgentChangeEventName, getLocalDevAgentProvider, syncLocalDevAgentMode, type DevAgentProvider } from '../services/devAgentMode';
import {
  ensureHotIdeas,
  ensureNicheIdeas,
  getIdeaFeedEventName,
  hasIdeaGenerationAccess,
  IDEA_FEED_STORAGE_KEYS,
  loadCachedHotIdeas,
  loadCachedNiches,
  type IdeaPlan as SharedIdeaPlan,
} from '../services/ideaFeedService';
import { useAuth } from '../contexts/AuthContext';
import type { ProjectPlan } from '../services/SimpleGeneration';

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type IdeaPlan = SharedIdeaPlan;

interface BankItem {
  ideaPlan: IdeaPlan;
  savedAt:  string;
  launched: number;
}

// â”€â”€ Storage keys â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const STORAGE_KEYS = {
  hotIdeas: IDEA_FEED_STORAGE_KEYS.hotIdeas,
  niches: IDEA_FEED_STORAGE_KEYS.niches,
  bank: IDEA_FEED_STORAGE_KEYS.bank,
} as const;

// â”€â”€ Refresh logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function needsHotRefresh(date: string): boolean {
  return new Date(date).toDateString() !== new Date().toDateString();
}

function getWeekNumber(): number {
  const d    = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
}

function needsNicheRefresh(week: string): boolean {
  return parseInt(week, 10) !== getWeekNumber();
}

// â”€â”€ Full Architect plan JSON schema (matches ARCHITECT_PROMPT output) â”€â”€â”€â”€â”€â”€â”€â”€

const PLAN_SCHEMA = `{
  "appName": "Human readable product name â€” specific, not generic",
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
      "reason": "Why this app needs onboarding â€” what user data is required",
      "steps": [
        {
          "question": "What is your main goal?",
          "type": "single-choice|multi-choice|text-input|date-picker",
          "options": ["Option A", "Option B", "Option C"],
          "storesIn": "userProfile.goal"
        }
      ],
      "completionAction": "After onboarding â†’ navigate to /home with personalized content"
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
      "uiSpec": "DETAILED description 100+ words â€” every section top to bottom, every interactive element, empty state, mobile layout"
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

// â”€â”€ Prompts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildHotIdeasPrompt(): string {
  return `You are a product strategist with real-time internet access and deep knowledge of emerging markets.
Today is ${new Date().toDateString()}.

Generate 3 fresh product ideas based on current trends, recent news, and emerging user needs.

Each idea must be a COMPLETE product plan in the same JSON format as our Architect agent outputs â€” including:
- productStrategy (coreAction, retentionLoop, paywall if needed)
- userJourney (onboarding steps if needed with specific questions and options, firstSession description)
- ALL pages including Onboarding (if needed) and Settings
- dataModel with realistic seedData (3 domain-specific examples, never "Item 1" or "Sample Task")
- uxPatterns and responsiveness

This plan will be sent DIRECTLY to the code generator â€” skipping the Architect step.
So it must be as detailed as an Architect output.
Every page must have a full uiSpec (100+ words describing every section, element, empty state, mobile layout).
Onboarding must have specific questions with options (not placeholders).
Seed data must have 3 realistic domain-specific examples.

For each idea use this EXACT schema:

${PLAN_SCHEMA}

Also add these fields to each plan object:
{
  "id": "kebab-case-unique-id",
  "marketContext": "Why this is relevant RIGHT NOW â€” cite specific recent trend, news, or event",
  "targetAudience": "Specific person who needs this â€” precise, not generic",
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

Analyze 3 trending niches RIGHT NOW â€” specifically what is growing THIS week based on:
- Recent regulatory changes
- New technology releases
- Seasonal patterns
- Emerging consumer behaviors
- Underserved demographics

For each niche, generate a COMPLETE product architecture plan for the best product opportunity within it.

Each plan must be as detailed as a senior product architect's output â€” including:
- productStrategy (coreAction, retentionLoop, paywall if needed)
- userJourney (onboarding steps if needed with specific questions and options, firstSession description)
- ALL pages including Onboarding (if needed) and Settings
- dataModel with realistic seedData (3 domain-specific examples, never "Item 1")
- uxPatterns and responsiveness

This plan will be sent DIRECTLY to the code generator â€” skipping the Architect step.
Every page must have a full uiSpec (100+ words).
Onboarding must have specific questions with real options (not placeholders).
Seed data must have 3 realistic domain-specific examples.

Use this EXACT schema:

${PLAN_SCHEMA}

Also add these fields:
{
  "id": "kebab-case-unique-id",
  "marketContext": "Why this niche is hot RIGHT NOW â€” specific reason with a concrete trigger",
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

// â”€â”€ Robust JSON parser (handles truncated LLM responses) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function safeParseJSONArray(raw: string): Record<string, unknown>[] {
  const cleaned = raw
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  try {
    const parsed: unknown = JSON.parse(cleaned);
    return Array.isArray(parsed)
      ? (parsed as Record<string, unknown>[])
      : [(parsed as Record<string, unknown>)];
  } catch { /* fall through to partial recovery */ }

  // Recover complete objects from a truncated array
  const objects: Record<string, unknown>[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped)     { escaped = false; continue; }
    if (ch === '\\') { escaped = true;  continue; }
    if (ch === '"')  { inString = !inString; continue; }
    if (inString)    { continue; }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try { objects.push(JSON.parse(cleaned.slice(start, i + 1)) as Record<string, unknown>); } catch { /* skip malformed */ }
        start = -1;
      }
    }
  }

  return objects;
}

// â”€â”€ API call (GeminiService with OAuth fallback) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function generateIdeas(
  prompt: string,
  count: number,
  googleAccessToken?: string | null,
): Promise<IdeaPlan[]> {
  const devAgentProvider = getLocalDevAgentProvider();
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
    console.log(`[WeeklyFeed] ${devAgentProvider} bridge used for idea generation`);
  }

  if (!text.trim()) {
    text = await GeminiService.generate({
      prompt,
      googleAccessToken,
      maxTokens: 6000,
      onLog: (msg: string) => console.log(msg),
    });
  }

  const raw = safeParseJSONArray(text.trim());
  if (raw.length === 0) {
    throw new Error('Model returned an invalid ideas payload');
  }

  // Validate and cap â€” spread all fields (including new productStrategy/userJourney/etc.)
  // then normalize the required ones so TypeScript is satisfied.
  return raw.slice(0, count).map(r => ({
    ...r,
    // Normalize required ProjectPlan fields
    appName:          String(r.appName ?? 'Untitled'),
    description:      String(r.description ?? ''),
    theme:            String(r.theme ?? 'dark-slate'),
    targetUser:       String(r.targetUser ?? ''),
    layout:           (r.layout as ProjectPlan['layout']) ?? { type: 'single', navigation: 'none' },
    uxPatterns:       (r.uxPatterns as ProjectPlan['uxPatterns']) ?? { emptyStates: true },
    responsiveness:   (r.responsiveness as ProjectPlan['responsiveness']) ?? { primaryDevice: 'mobile', mobileFirst: true },
    pages:            (r.pages as ProjectPlan['pages']) ?? [],
    dataModel:        (r.dataModel as ProjectPlan['dataModel']),
    criticalUiRules:  Array.isArray(r.criticalUiRules) ? (r.criticalUiRules as string[]) : [],
    shadcnComponents: Array.isArray(r.shadcnComponents) ? (r.shadcnComponents as string[]) : [],
    icons:            Array.isArray(r.icons) ? (r.icons as string[]) : [],
    // Normalize IdeaPlan extra fields
    id:             String(r.id ?? crypto.randomUUID()),
    marketContext:  String(r.marketContext ?? ''),
    targetAudience: String(r.targetAudience ?? ''),
    painPoint:      String(r.painPoint ?? ''),
    competitorGap:  String(r.competitorGap ?? ''),
    generatedAt:    String(r.generatedAt ?? new Date().toISOString()),
  } as IdeaPlan));
}

// â”€â”€ Bank helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function loadBank(): BankItem[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.bank) ?? '[]') as BankItem[]; }
  catch { return []; }
}

function saveBank(bank: BankItem[]): void {
  try { localStorage.setItem(STORAGE_KEYS.bank, JSON.stringify(bank)); } catch { /* quota */ }
}

// â”€â”€ Theme colors for idea cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const THEME_COLOR: Record<string, string> = {
  'dark-slate': '#60a5fa',
  trust:        '#34d399',
  warm:         '#fbbf24',
  neon:         '#a78bfa',
  bloom:        '#f472b6',
};

function themeColor(t: string): string {
  return THEME_COLOR[t] ?? '#60a5fa';
}

const CODE_STUDIO_INTENT_PREFIX = '__OPEN_CODE_STUDIO__';
const CODE_STUDIO_INPUT_KEY = 'AIC_CODE_STUDIO_INITIAL_INPUT';

// â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type Tab = 'hot' | 'niches' | 'bank';

interface WeeklyFeedPanelProps {
  onClose:          () => void;
  onStartBlueprint: (text: string) => void;
  onLaunchWithPlan?: (
    plan: IdeaPlan,
    intent: string,
    source?: 'chat' | 'weekly-feed' | 'niche' | 'weekly-feed-code-studio',
  ) => void;
  onOpenInCodeStudio?: (idea: {
    title: string;
    description: string;
  }) => void;
  onAddMessage?:    (msg: { role: 'assistant'; content: string }) => void;
  appLanguage?:     string;
}

export const WeeklyFeedPanel: React.FC<WeeklyFeedPanelProps> = ({
  onClose,
  onStartBlueprint,
  onLaunchWithPlan,
  onOpenInCodeStudio,
  onAddMessage,
  appLanguage = 'en',
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('hot');
  const { user, googleAccessToken } = useAuth();
  const [devAgentProvider, setDevAgentProvider] = useState<DevAgentProvider>(() => getLocalDevAgentProvider());

  useEffect(() => {
    let mounted = true;
    const changeEvent = getDevAgentChangeEventName();

    const syncFromLocalStorage = () => {
      setDevAgentProvider(getLocalDevAgentProvider());
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === 'admin_claude_max' || event.key === 'superadmin_dev_agent_provider') {
        syncFromLocalStorage();
      }
    };

    syncFromLocalStorage();
    window.addEventListener('storage', onStorage);
    window.addEventListener(changeEvent, syncFromLocalStorage as EventListener);

    fetch('http://localhost:3107/dev-agent-mode')
      .then(r => (r.ok ? r.json() : null))
      .then((data: { provider?: DevAgentProvider; claudeMode?: boolean } | null) => {
        if (!mounted || !data) return;
        setDevAgentProvider(syncLocalDevAgentMode(data));
      })
      .catch(() => {
        // backend bridge unavailable: keep local state only
      });

    return () => {
      mounted = false;
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(changeEvent, syncFromLocalStorage as EventListener);
    };
  }, []);

  // â”€â”€ Hot ideas (daily) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [hotIdeas,    setHotIdeas]    = useState<IdeaPlan[]>([]);
  const [hotLoading,  setHotLoading]  = useState(true);
  const [hotError,    setHotError]    = useState<string | null>(null);

  // â”€â”€ Niche ideas (weekly) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [niches,      setNiches]      = useState<IdeaPlan[]>([]);
  const [nicheLoading,setNicheLoading]= useState(true);
  const [nicheError,  setNicheError]  = useState<string | null>(null);

  // â”€â”€ Bank â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [bank,        setBank]        = useState<BankItem[]>(() => loadBank());

  // Free quota counter (refreshes on each render â€” cheap localStorage read)
  const freeRemaining = GeminiService.getRemainingFreeQuota();

  const hasKey = hasIdeaGenerationAccess(googleAccessToken);

  // â”€â”€ Generate hot ideas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const generateHot = useCallback(async (force = false) => {
    setHotLoading(true);
    setHotError(null);

    const cached = loadCachedHotIdeas();
    if (!force && cached.length > 0) {
      setHotIdeas(cached);
      setHotLoading(false);
      return;
    }

    if (!hasKey) {
      setHotError('no-key');
      setHotLoading(false);
      return;
    }

    try {
      const ideas = await ensureHotIdeas(googleAccessToken, force);
      setHotIdeas(ideas);
    } catch (e: any) {
      if (e?.message?.includes('No AI service available')) {
        setHotError('Sign in with Google for free ideas, or add an API key in Settings.');
      } else {
        setHotError(String(e));
      }
    } finally {
      setHotLoading(false);
    }
  }, [hasKey, googleAccessToken]);

  // â”€â”€ Generate niches â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const generateNiches = useCallback(async (force = false) => {
    setNicheLoading(true);
    setNicheError(null);

    const cached = loadCachedNiches();
    if (!force && cached.length > 0) {
      setNiches(cached);
      setNicheLoading(false);
      return;
    }

    if (!hasKey) {
      setNicheError('no-key');
      setNicheLoading(false);
      return;
    }

    try {
      const ideas = await ensureNicheIdeas(googleAccessToken, force);
      setNiches(ideas);
    } catch (e: any) {
      if (e?.message?.includes('No AI service available')) {
        setNicheError('Sign in with Google for free ideas, or add an API key in Settings.');
      } else {
        setNicheError(String(e));
      }
    } finally {
      setNicheLoading(false);
    }
  }, [hasKey, googleAccessToken]);

  useEffect(() => {
    generateHot();
    generateNiches();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const eventName = getIdeaFeedEventName();
    const syncIdeaFeed = ((event?: Event) => {
      const detail = (event as CustomEvent<{ key?: string }> | undefined)?.detail;
      if (!detail?.key || detail.key === STORAGE_KEYS.hotIdeas) {
        const ideas = loadCachedHotIdeas();
        if (ideas.length > 0) setHotIdeas(ideas);
      }
      if (!detail?.key || detail.key === STORAGE_KEYS.niches) {
        const ideas = loadCachedNiches();
        if (ideas.length > 0) setNiches(ideas);
      }
    }) as EventListener;

    window.addEventListener(eventName, syncIdeaFeed);
    return () => window.removeEventListener(eventName, syncIdeaFeed);
  }, []);

  // â”€â”€ Bank helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const isInBank = (id: string) => bank.some(b => b.ideaPlan.id === id);

  const toggleBank = (idea: IdeaPlan) => {
    const existing = loadBank();
    if (existing.find(b => b.ideaPlan.id === idea.id)) {
      const updated = existing.filter(b => b.ideaPlan.id !== idea.id);
      saveBank(updated);
      setBank(updated);
    } else {
      const updated: BankItem[] = [{ ideaPlan: idea, savedAt: new Date().toISOString(), launched: 0 }, ...existing];
      saveBank(updated);
      setBank(updated);
    }
  };

  const removeFromBank = (id: string) => {
    const updated = loadBank().filter(b => b.ideaPlan.id !== id);
    saveBank(updated);
    setBank(updated);
  };

  // â”€â”€ Add idea to chat context pack â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const launchIdea = (idea: IdeaPlan) => {
    const { marketContext, targetAudience, painPoint,
            competitorGap, generatedAt, ...plan } = idea;

    const intent = [
      plan.appName,
      plan.description,
      marketContext && `Market context: ${marketContext}`,
    ].filter(Boolean).join('. ');

    if (onLaunchWithPlan) {
      // Increment launched counter in bank if saved
      const existing = loadBank();
      const idx = existing.findIndex(b => b.ideaPlan.id === idea.id);
      if (idx !== -1) {
        existing[idx].launched += 1;
        saveBank(existing);
        setBank([...existing]);
      }

      // Post a context message into the chat composer flow
      const ps = (plan as IdeaPlan).productStrategy as { coreAction?: string; paywall?: { needed?: boolean; trigger?: string } } | undefined;
      const uj = (plan as IdeaPlan).userJourney as { onboarding?: { needed?: boolean; steps?: unknown[] } } | undefined;
      const lines = [
        `ðŸ§© Added to context pack: **${plan.appName}**`,
        ``,
        `**Strategy:** ${ps?.coreAction ?? plan.description}`,
        uj?.onboarding?.needed
          ? `**Onboarding:** ${uj.onboarding.steps?.length ?? 0} steps`
          : `**Onboarding:** Not needed`,
        ps?.paywall?.needed
          ? `**Paywall:** ${ps.paywall.trigger}`
          : `**Model:** Free`,
        ``,
        `Send from chat when ready. You can combine this with your own prompt, files, and screenshots.`,
      ];
      onAddMessage?.({ role: 'assistant', content: lines.join('\n') });

      onLaunchWithPlan(idea, intent, idea.competitorGap ? 'niche' : 'weekly-feed');
      onClose();
    } else {
      // Fallback: send blueprint as text
      onStartBlueprint(`${idea.appName}: ${idea.description}\n\n${marketContext}\n\nTargetAudience: ${targetAudience}\nPainPoint: ${painPoint}`);
      onClose();
    }
  };

  const toCodeStudioIdea = (idea: IdeaPlan): { title: string; description: string } => ({
    title: idea.appName,
    description: idea.description,
  });

  const openIdeaInCodeStudio = (idea: IdeaPlan) => {
    const payload = toCodeStudioIdea(idea);
    const prefill = `${payload.title}: ${payload.description}`;
    try { localStorage.setItem(CODE_STUDIO_INPUT_KEY, prefill); } catch { /* ignore quota */ }

    if (onOpenInCodeStudio) {
      onOpenInCodeStudio(payload);
      onClose();
      return;
    }

    // Fallback path when AppSidebar does not pass through onOpenInCodeStudio.
    if (onLaunchWithPlan) {
      onLaunchWithPlan(
        idea,
        `${CODE_STUDIO_INTENT_PREFIX}${prefill}`,
        'weekly-feed-code-studio',
      );
      onClose();
    }
  };

  // â”€â”€ UI helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const s = (light: string, dark: string) => dark; // always dark theme

  const tabStyle = (tab: Tab): React.CSSProperties => ({
    flex: 1,
    padding: '7px 4px',
    fontSize: 10,
    fontWeight: 700,
    cursor: 'pointer',
    border: 'none',
    borderRadius: 7,
    background: activeTab === tab ? 'rgba(255,255,255,0.1)' : 'transparent',
    color: activeTab === tab ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.32)',
    transition: 'all 0.15s',
  });

  // â”€â”€ Render card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const renderCard = (idea: IdeaPlan) => {
    const color = themeColor(idea.theme);
    const saved = isInBank(idea.id);
    return (
      <div
        key={idea.id}
        style={{
          borderRadius: 11, padding: '11px 12px', marginBottom: 8,
          background: 'rgba(255,255,255,0.022)',
          border: '1px solid rgba(255,255,255,0.055)',
          display: 'flex', flexDirection: 'column', gap: 7,
        }}
      >
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,0.88)', lineHeight: 1.3, marginBottom: 2 }}>
              {idea.appName}
            </div>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.42)', lineHeight: 1.45 }}>
              {idea.description}
            </div>
          </div>
          <button
            onClick={() => toggleBank(idea)}
            title={saved
              ? (appLanguage === 'ru' ? 'Убрать из банка' : 'Remove from bank')
              : (appLanguage === 'ru' ? 'Сохранить в банк' : 'Save to bank')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
              color: saved ? '#fbbf24' : 'rgba(255,255,255,0.25)', flexShrink: 0, lineHeight: 0,
              transition: 'color 0.15s',
            }}
          >
            {saved ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
          </button>
        </div>

        {/* Market context */}
        <div style={{
          fontSize: 10, lineHeight: 1.5, color: 'rgba(255,255,255,0.38)',
          borderLeft: `2px solid ${color}40`, paddingLeft: 7,
        }}>
          {idea.marketContext}
        </div>

        {/* Audience + pain */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.3)' }}>
            {idea.targetAudience}
          </span>
        </div>
        <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.28)', lineHeight: 1.4 }}>
          {idea.painPoint}
        </div>

        {/* Pages + product badges */}
        {idea.pages?.length > 0 && (
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.22)', display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
            <span>{idea.pages.length} screens · {idea.responsiveness?.primaryDevice ?? 'mobile'} · {idea.layout?.navigation ?? 'none'}</span>
            {(idea as IdeaPlan & { userJourney?: { onboarding?: { needed?: boolean } } }).userJourney?.onboarding?.needed && (
              <span style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', borderRadius: 4, padding: '1px 5px' }}>onboarding</span>
            )}
            {(idea as IdeaPlan & { productStrategy?: { paywall?: { needed?: boolean } } }).productStrategy?.paywall?.needed && (
              <span style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', borderRadius: 4, padding: '1px 5px' }}>paywall</span>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => launchIdea(idea)}
            style={{
              flex: 1, padding: '6px 0', borderRadius: 7,
              fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
              color: color,
              background: `${color}14`,
              border: `1px solid ${color}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              transition: 'background 0.15s',
            }}
          >
            <Zap size={10} />
            Add to Chat →
          </button>

          {(onOpenInCodeStudio || onLaunchWithPlan) && (
            <button
              onClick={() => openIdeaInCodeStudio(idea)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                padding: '6px 12px',
                borderRadius: 6,
                background: 'rgba(124,58,237,0.15)',
                border: '1px solid rgba(124,58,237,0.3)',
                color: '#a78bfa',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              title={appLanguage === 'ru' ? 'Открыть в Code Studio с Claude' : 'Open in Code Studio with Claude'}
            >
              Code Studio
            </button>
          )}
        </div>
      </div>
    );
  };

  // â”€â”€ Loading / error block â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const renderLoader = (label: string) => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'rgba(255,255,255,0.3)' }}>
      <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
      <span style={{ fontSize: 11 }}>{label}</span>
    </div>
  );

  const renderError = (err: string, onRetry: () => void) => {
    if (err === 'no-key') {
      return (
        <div style={{ padding: '20px 14px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
          {appLanguage === 'ru'
            ? <>Настройте API ключ в <b style={{ color: '#60a5fa' }}>Settings</b>, чтобы генерировать идеи.</>
            : <>Set API key in <b style={{ color: '#60a5fa' }}>Settings</b> to generate ideas.</>}
        </div>
      );
    }
    return (
      <div style={{ padding: '20px 14px', textAlign: 'center' }}>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginBottom: 10 }}>
          {appLanguage === 'ru' ? 'Ошибка генерации' : 'Generation error'}: {err.slice(0, 80)}
        </div>
        <button
          onClick={onRetry}
          style={{
            padding: '6px 16px', borderRadius: 8, fontSize: 11, fontWeight: 600,
            background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)',
            border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}
        >
          <RefreshCw size={11} /> {appLanguage === 'ru' ? 'Повторить' : 'Retry'}
        </button>
      </div>
    );
  };

  return (
    <>
      {/* Transparent backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />

      {/* Slide-out panel */}
      <div style={{
        position: 'fixed', left: 56, top: 0, height: '100vh', width: 312, zIndex: 200,
        background: '#09090f',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'panelSlide 0.2s ease',
        boxShadow: '6px 0 32px rgba(0,0,0,0.55)',
      }}>

        {/* â”€â”€ Header â”€â”€ */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 14px 10px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', marginBottom: 2 }}>
              {appLanguage === 'ru' ? 'Идеи' : 'Ideas'}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.88)' }}>
              Feed
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {user ? (
              <span style={{
                fontSize: 10,
                color: freeRemaining > 100
                  ? 'rgba(255,255,255,0.35)'
                  : freeRemaining > 0
                    ? '#f59e0b'
                    : '#ef4444',
                padding: '2px 6px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.06)',
              }}>
                {freeRemaining > 0
                  ? `\u26A1 ${freeRemaining} free left`
                  : '\u26A1 quota used \u2014 API key active'}
              </span>
            ) : (
              <span style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.3)',
                padding: '2px 6px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.06)',
              }}>
                Sign in for free quota
              </span>
            )}
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', padding: 6, borderRadius: 7, lineHeight: 0 }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* â”€â”€ Tabs â”€â”€ */}
        <div style={{ display: 'flex', gap: 4, padding: '8px 10px 6px', flexShrink: 0 }}>
          <button style={tabStyle('hot')} onClick={() => setActiveTab('hot')}>
            {appLanguage === 'ru' ? 'Идеи дня' : 'Today Ideas'}
          </button>
          <button style={tabStyle('niches')} onClick={() => setActiveTab('niches')}>
            {appLanguage === 'ru' ? 'Ниши недели' : 'Week Niches'}
          </button>
          <button style={tabStyle('bank')} onClick={() => setActiveTab('bank')}>
            {appLanguage === 'ru' ? `Банк (${bank.length})` : `Bank (${bank.length})`}
          </button>
        </div>

        {/* â”€â”€ Tab content â”€â”€ */}

        {activeTab === 'hot' && (
          <>
            {/* Refresh button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 12px 6px', flexShrink: 0 }}>
              <button
                onClick={() => generateHot(true)}
                disabled={hotLoading}
                style={{
                  background: 'none', border: 'none', cursor: hotLoading ? 'default' : 'pointer',
                  color: 'rgba(255,255,255,0.28)', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4,
                  padding: '2px 6px', borderRadius: 5,
                }}
              >
                <RefreshCw size={10} style={hotLoading ? { animation: 'spin 1s linear infinite' } : undefined} />
                {appLanguage === 'ru' ? 'Обновить' : 'Refresh'}
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 14px' }}>
              {hotLoading
                ? renderLoader(appLanguage === 'ru' ? 'Генерируем идеи на сегодня...' : 'Generating hot ideas...')
                : hotError
                  ? renderError(hotError, () => generateHot(true))
                  : hotIdeas.map(renderCard)
              }
            </div>
          </>
        )}

        {activeTab === 'niches' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 12px 6px', flexShrink: 0 }}>
              <button
                onClick={() => generateNiches(true)}
                disabled={nicheLoading}
                style={{
                  background: 'none', border: 'none', cursor: nicheLoading ? 'default' : 'pointer',
                  color: 'rgba(255,255,255,0.28)', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4,
                  padding: '2px 6px', borderRadius: 5,
                }}
              >
                <RefreshCw size={10} style={nicheLoading ? { animation: 'spin 1s linear infinite' } : undefined} />
                {appLanguage === 'ru' ? 'Обновить' : 'Refresh'}
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 14px' }}>
              {nicheLoading
                ? renderLoader(appLanguage === 'ru' ? 'Анализируем ниши недели...' : 'Analyzing weekly niches...')
                : nicheError
                  ? renderError(nicheError, () => generateNiches(true))
                  : niches.map(renderCard)
              }
            </div>
          </>
        )}

        {activeTab === 'bank' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px 14px' }}>
            {bank.length === 0 ? (
              <div style={{ padding: '40px 14px', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>ðŸ¦</div>
                {appLanguage === 'ru' ? 'Сохраните идеи из других вкладок' : 'Save ideas from other tabs'}
              </div>
            ) : (
              bank.map(item => {
                const idea = item.ideaPlan;
                const color = themeColor(idea.theme);
                return (
                  <div
                    key={idea.id}
                    style={{
                      borderRadius: 11, padding: '10px 12px', marginBottom: 8,
                      background: 'rgba(255,255,255,0.022)',
                      border: '1px solid rgba(255,255,255,0.055)',
                      display: 'flex', flexDirection: 'column', gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)', lineHeight: 1.3 }}>
                          {idea.appName}
                        </div>
                        <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                          {idea.description}
                        </div>
                      </div>
                      <button
                        onClick={() => removeFromBank(idea.id)}
                        title={appLanguage === 'ru' ? 'Удалить из банка' : 'Remove from bank'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: 'rgba(255,255,255,0.2)', lineHeight: 0 }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>
                      {appLanguage === 'ru'
                        ? `Сохранено ${new Date(item.savedAt).toLocaleDateString()}`
                        : `Saved ${new Date(item.savedAt).toLocaleDateString()}`}
                      {item.launched > 0 && (appLanguage === 'ru'
                        ? ` · Запущено ${item.launched} раз`
                        : ` · Launched ${item.launched}x`)}
                    </div>

                    <div style={{ display: 'flex', gap: 5 }}>
                      <button
                        onClick={() => launchIdea(idea)}
                        style={{
                          flex: 1, padding: '5px 0', borderRadius: 7,
                          fontSize: 10, fontWeight: 700, cursor: 'pointer',
                          color: color,
                          background: `${color}12`,
                          border: `1px solid ${color}28`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        }}
                      >
                        <Zap size={9} /> {appLanguage === 'ru' ? 'Добавить в чат →' : 'Add to Chat →'}
                      </button>

                      {(onOpenInCodeStudio || onLaunchWithPlan) && (
                        <button
                          onClick={() => openIdeaInCodeStudio(idea)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                            padding: '5px 10px',
                            borderRadius: 7,
                            background: 'rgba(124,58,237,0.15)',
                            border: '1px solid rgba(124,58,237,0.3)',
                            color: '#a78bfa',
                            fontSize: 10,
                            fontWeight: 600,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                          title={appLanguage === 'ru' ? 'Открыть в Code Studio с Claude' : 'Open in Code Studio with Claude'}
                        >
                          Code Studio
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes panelSlide {
          from { opacity: 0; transform: translateX(-12px); }
          to   { opacity: 1; transform: translateX(0);     }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
};


