import type { ProjectPlan } from './SimpleGeneration';
import {
  PLAN_SCHEMA,
  runIdeaModelPrompt,
  safeParseJSONArray,
  type ProductBlueprint,
  type ProductIdea,
} from './ideaFeedService';

export const PACKAGING_PROGRESS_STEPS = [
  'Анализируем рыночный wedge...',
  'Проектируем путь к aha-moment...',
  'Проектируем базу данных...',
  'Настраиваем ИИ-пайплайны...',
  'Собираем файловую архитектуру...',
] as const;

const BLUEPRINT_SCHEMA = `{
  "id": "reuse source idea id",
  "appName": "Human readable product name",
  "description": "Short product summary for the coder",
  "theme": "dark-slate|trust|warm|neon|bloom",
  "targetUser": "Specific user and buyer",
  "layout": { "type": "single|tabs|sidebar|dashboard|wizard", "navigation": "none|top-nav|bottom-tabs|sidebar|stepper" },
  "uxPatterns": { "emptyStates": true, "loadingSkeletons": true, "searchAndFilter": false, "animations": "subtle" },
  "responsiveness": { "primaryDevice": "mobile|tablet|desktop", "mobileFirst": true, "maxWidth": "max-w-6xl" },
  "pages": [
    {
      "path": "/",
      "name": "Home",
      "file": "pages/Home.tsx",
      "purpose": "What this screen does",
      "isMainScreen": true,
      "showInNav": true,
      "uiSpec": "Detailed UI spec aligned to PREMIUM_DESIGN_SYSTEM.md and existing UI kit components"
    }
  ],
  "dataModel": {
    "entities": [{ "name": "profiles", "fields": "id uuid, full_name text, plan text" }],
    "sharedState": "What stays in App.tsx or project-level context"
  },
  "criticalUiRules": ["Rules the coder must respect"],
  "shadcnComponents": ["Button", "Card"],
  "icons": ["Sparkles", "Wallet"],
  "packageSummary": "Why this blueprint is commercially strong and what the coder must preserve",
  "visualTag": "Carry over the Premium UI Kit style recommendation",
  "authFlow": {
    "type": "supabase|local-only|none",
    "provider": "email+oauth",
    "onboardingSteps": [
      { "id": "signup", "title": "Step title", "goal": "User goal", "ahaMoment": "Optional aha payoff" }
    ]
  },
  "monetization": {
    "model": "free|freemium|subscription|usage-based",
    "paywall": {
      "trigger": "When to show upgrade",
      "limits": ["Limit 1", "Limit 2"],
      "upgradeMessage": "Benefit-led upgrade copy"
    }
  },
  "databaseSchema": {
    "sql": "Full SQL for Supabase tables, RLS notes if needed, and limits tracking",
    "tables": [
      { "name": "profiles", "purpose": "User profile and plan state" }
    ]
  },
  "aiLogic": {
    "features": [
      {
        "name": "Feature name",
        "purpose": "Why this AI feature exists",
        "model": "Suggested model family",
        "trigger": "What event invokes it",
        "systemPrompt": "Production-ready system prompt",
        "outputContract": "Expected structured output"
      }
    ]
  },
  "fileArchitecture": [
    { "path": "src/pages/Home.tsx", "role": "page", "purpose": "Main workflow screen" }
  ],
  "premiumUiDirectives": [
    "Use ONLY components from /src/components/ui and /blocks",
    "Follow PREMIUM_DESIGN_SYSTEM.md",
    "Do not invent raw div-heavy layouts when a kit component exists"
  ]
}`;

function resolveThemeFromVisualTag(visualTag: string): string {
  const tag = visualTag.toLowerCase();
  if (tag.includes('glass')) return 'trust';
  if (tag.includes('neon')) return 'neon';
  if (tag.includes('editorial')) return 'warm';
  if (tag.includes('well')) return 'bloom';
  return 'dark-slate';
}

function normalizeBlueprint(raw: Record<string, unknown>, idea: ProductIdea): ProductBlueprint {
  const fallbackTheme = resolveThemeFromVisualTag(String(raw.visualTag ?? idea.visualTag ?? ''));
  const fallbackPlan: ProjectPlan = {
    appName: String(raw.appName ?? idea.title),
    description: String(raw.description ?? idea.pitch),
    theme: String(raw.theme ?? fallbackTheme),
    targetUser: String(raw.targetUser ?? ''),
    layout: (raw.layout as ProjectPlan['layout']) ?? { type: 'dashboard', navigation: 'sidebar' },
    uxPatterns: (raw.uxPatterns as ProjectPlan['uxPatterns']) ?? { emptyStates: true, loadingSkeletons: true, searchAndFilter: true },
    responsiveness: (raw.responsiveness as ProjectPlan['responsiveness']) ?? { primaryDevice: 'desktop', mobileFirst: true },
    pages: (raw.pages as ProjectPlan['pages']) ?? [],
    dataModel: (raw.dataModel as ProjectPlan['dataModel']) ?? { entities: [], sharedState: '' },
    criticalUiRules: Array.isArray(raw.criticalUiRules) ? raw.criticalUiRules as string[] : [],
    shadcnComponents: Array.isArray(raw.shadcnComponents) ? raw.shadcnComponents as string[] : [],
    icons: Array.isArray(raw.icons) ? raw.icons as string[] : [],
  };

  return {
    ...fallbackPlan,
    ...raw,
    id: String(raw.id ?? idea.id),
    sourceIdea: idea,
    visualTag: String(raw.visualTag ?? idea.visualTag ?? 'Modern SaaS'),
    packageSummary: String(raw.packageSummary ?? `${idea.title}: ${idea.marketGap}`),
    authFlow: {
      type: String((raw.authFlow as { type?: string } | undefined)?.type ?? 'supabase'),
      provider: String((raw.authFlow as { provider?: string } | undefined)?.provider ?? 'email+oauth'),
      onboardingSteps: Array.isArray((raw.authFlow as { onboardingSteps?: unknown[] } | undefined)?.onboardingSteps)
        ? ((raw.authFlow as { onboardingSteps: ProductBlueprint['authFlow']['onboardingSteps'] }).onboardingSteps)
        : [],
    },
    monetization: {
      model: String((raw.monetization as { model?: string } | undefined)?.model ?? 'freemium'),
      paywall: {
        trigger: String((raw.monetization as { paywall?: { trigger?: string } } | undefined)?.paywall?.trigger ?? 'After core free usage is exhausted'),
        limits: Array.isArray((raw.monetization as { paywall?: { limits?: unknown[] } } | undefined)?.paywall?.limits)
          ? ((raw.monetization as { paywall: { limits: string[] } }).paywall.limits)
          : [],
        upgradeMessage: String((raw.monetization as { paywall?: { upgradeMessage?: string } } | undefined)?.paywall?.upgradeMessage ?? 'Upgrade to unlock the full workflow and higher limits.'),
      },
    },
    databaseSchema: {
      sql: String((raw.databaseSchema as { sql?: string } | undefined)?.sql ?? ''),
      tables: Array.isArray((raw.databaseSchema as { tables?: unknown[] } | undefined)?.tables)
        ? ((raw.databaseSchema as { tables: ProductBlueprint['databaseSchema']['tables'] }).tables)
        : [],
    },
    aiLogic: {
      features: Array.isArray((raw.aiLogic as { features?: unknown[] } | undefined)?.features)
        ? ((raw.aiLogic as { features: ProductBlueprint['aiLogic']['features'] }).features)
        : [],
    },
    fileArchitecture: Array.isArray(raw.fileArchitecture)
      ? raw.fileArchitecture as ProductBlueprint['fileArchitecture']
      : [],
    premiumUiDirectives: Array.isArray(raw.premiumUiDirectives)
      ? raw.premiumUiDirectives as string[]
      : [
          'Use ONLY components from /src/components/ui and /blocks.',
          'Follow PREMIUM_DESIGN_SYSTEM.md.',
          'Avoid arbitrary wrapper divs when a system component or block already exists.',
        ],
  };
}

export function buildPackageIdeaPrompt(idea: ProductIdea, language = 'ru'): string {
  return `You are Lead System Architect for AI Studio.

You are given a discovery concept and must turn it into an exhaustive technical blueprint that the coder can execute directly.

DISCOVERY IDEA:
${JSON.stringify(idea, null, 2)}

CRITICAL GOAL:
- Preserve the product wedge from the idea
- Turn it into a build-ready blueprint
- Reference the Premium UI Kit explicitly
- Use ONLY components from /src/components/ui and /blocks
- Follow PREMIUM_DESIGN_SYSTEM.md
- Do not leave folder structure or feature structure for the coder to invent

Output ONE JSON object that includes a ProjectPlan-compatible build plan plus the extra blueprint sections below.

Required depth:
1. Onboarding: define 3-4 concrete steps from signup to first aha-moment.
2. Features: describe AI features, their prompts, triggers, and output contracts.
3. Game Mechanics: include retention loops such as streaks, progress systems, rewards, or mastery where relevant. If the product is not a game, adapt this into habit loops and progression.
4. Dev Directives: specify exact fileArchitecture. The coder must use ONLY /src/components/ui and /blocks, following PREMIUM_DESIGN_SYSTEM.md. No random div-first layouts.
5. Database: output ready-to-run Supabase SQL for profiles, limits, billing flags, and domain data.
6. Monetization: include paywall logic, usage limits, and upgrade messaging.
7. Premium UI: map the visual direction to our Premium UI Kit and mention the chosen style in visualTag.

Write all human-readable copy in ${language === 'ru' ? 'Russian' : 'the user language'}.

Use this ProjectPlan reference for compatibility:
${PLAN_SCHEMA}

Use this exact blueprint schema shape:
${BLUEPRINT_SCHEMA}

Do not output markdown fences. Output only one JSON object.`;
}

export async function packageSelectedIdea(
  idea: ProductIdea,
  options?: {
    googleAccessToken?: string | null;
    language?: string;
  },
): Promise<ProductBlueprint> {
  const prompt = buildPackageIdeaPrompt(idea, options?.language ?? 'ru');
  const text = await runIdeaModelPrompt(prompt, options?.googleAccessToken);
  const parsed = safeParseJSONArray(text);
  if (parsed.length === 0) {
    throw new Error('Model returned an invalid blueprint payload');
  }

  return normalizeBlueprint(parsed[0], idea);
}
