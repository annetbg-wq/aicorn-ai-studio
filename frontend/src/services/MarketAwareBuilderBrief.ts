/**
 * MarketAwareBuilderBrief
 *
 * Deterministic helpers that produce a compact market-aware product brief for the
 * builder/coder agent.  No LLM calls.  All outputs are structured and testable.
 *
 * Three public helpers:
 *   buildMarketAwareBuilderBrief(input)        → full brief with 4 sections
 *   buildBuilderSelfTestChecklist(input)       → structured checklist items
 *   evaluateMarketAwareBuilderBriefDiagnostics → advisory diagnostics (never blocks)
 *
 * Advisory telemetry keys emitted by ProtoPipeline when wired:
 *   market_brief_ok, product_category, market_insight_count,
 *   required_screen_count, self_test_item_count, differentiator_present,
 *   suspiciously_generic, tries_to_own_technical_architecture,
 *   coder_prompt_contains_market_brief
 */

// ── Lightweight re-exports for callers that only need the input types ─────────
export type { MediaHint } from './DesignContract';

// ── Product category ──────────────────────────────────────────────────────────

export type ProductCategory =
  | 'mobile-health'
  | 'dashboard'
  | 'landing'
  | 'marketplace'
  | 'social'
  | 'game-rpg'
  | 'generic';

// ── Section A: Market-aware product insight ───────────────────────────────────

export type MarketAwareProductInsight = {
  productCategory: ProductCategory;
  successfulPatterns: string[];
  popularFeatures: string[];
  userPainPoints: string[];
  trends: string[];
  competitorGaps: string[];
  differentiatorOpportunity: string;
};

// ── Section B: Product vision ─────────────────────────────────────────────────

export type ProductVision = {
  productPromise: string;
  targetUser: string;
  coreUserJourney: string;
  emotionalHook: string;
  primaryUserOutcome: string;
};

// ── Section C: Builder implementation brief ───────────────────────────────────

export type BuilderImplementationBrief = {
  requiredScreens: string[];
  requiredInteractions: string[];
  selectedSkeleton: string;
  designConstraints: string[];
  qualityConstraints: string[];
  productSpecificWorkflow: string;
  forbiddenGenericPlaceholders: string[];
  marketAwareDifferentiator: string;
};

// ── Section D: Self-test checklist ────────────────────────────────────────────

export type SelfTestChecklistItem = {
  id: string;
  label: string;
  severity: 'must' | 'should';
  rationale: string;
  detectionHint: string;
};

// ── Full brief ────────────────────────────────────────────────────────────────

export type MarketAwareBuilderBrief = {
  marketInsight: MarketAwareProductInsight;
  productVision: ProductVision;
  builderBrief: BuilderImplementationBrief;
  selfTestChecklist: SelfTestChecklistItem[];
};

// ── Diagnostics ───────────────────────────────────────────────────────────────

export type MarketAwareBriefDiagnosticsIssue = {
  code: string;
  message: string;
  severity: 'error' | 'warn';
};

export type MarketAwareBriefDiagnostics = {
  ok: boolean;
  issues: MarketAwareBriefDiagnosticsIssue[];
  suspiciouslyGeneric: boolean;
  triesToOwnTechnicalArchitecture: boolean;
};

export type MarketAwareBriefDiagnosticsTelemetry = {
  market_brief_ok: boolean;
  product_category: string;
  market_insight_count: number;
  required_screen_count: number;
  self_test_item_count: number;
  differentiator_present: boolean;
  suspiciously_generic: boolean;
  tries_to_own_technical_architecture: boolean;
  coder_prompt_contains_market_brief: boolean;
};

// ── Input shapes ──────────────────────────────────────────────────────────────

export type BuildMarketAwareBuilderBriefInput = {
  brief: string;
  skeletonId: string;
  premiumComponentIds?: string[];
  mediaHints?: Array<{ id: string; kind?: string }>;
};

export type BuildBuilderSelfTestChecklistInput = {
  brief: string;
  skeletonId: string;
  productCategory: ProductCategory;
  premiumComponentIds?: string[];
  mediaHints?: Array<{ id: string; kind?: string }>;
};

// ── Product category detection ────────────────────────────────────────────────

const HEALTH_TERMS = [
  'health', 'wellness', 'fitness', 'nutrition', 'diet', 'calorie', 'workout',
  'exercise', 'sleep', 'meditation', 'mindfulness', 'yoga', 'weight', 'macro',
  'step', 'heart rate', 'hydration', 'vitamin', 'supplement', 'recovery',
  'mental health', 'therapy', 'mood', 'habit tracker',
];

const DASHBOARD_TERMS = [
  'dashboard', 'analytics', 'admin', 'ops', 'operations', 'monitoring',
  'metrics', 'kpi', 'report', 'business intelligence', 'bi tool', 'data viz',
  'crm', 'erp', 'internal tool', 'management console', 'control panel',
];

const LANDING_TERMS = [
  'landing page', 'marketing page', 'startup page', 'product page', 'saas landing',
  'waitlist', 'launch page', 'homepage', 'promo page',
];

const MARKETPLACE_TERMS = [
  'marketplace', 'ecommerce', 'e-commerce', 'shop', 'store', 'buy', 'sell',
  'product listing', 'catalog', 'cart', 'checkout', 'commerce', 'listing',
  'vendor', 'auction', 'resell', 'handmade',
];

const SOCIAL_TERMS = [
  'social', 'community', 'feed', 'post', 'share', 'follow', 'follower',
  'profile', 'comment', 'reaction', 'like', 'story', 'chat', 'messaging',
  'forum', 'network', 'connection', 'creator', 'content creator',
];

const GAME_TERMS = [
  'game', 'rpg', 'gaming', 'quest', 'level', 'xp', 'experience point',
  'progression', 'leaderboard', 'achievement', 'badge', 'reward', 'streak',
  'challenge', 'adventure', 'dungeon', 'character', 'guild', 'clan',
  'loot', 'daily login', 'casino',
];

const SKELETON_CATEGORY_MAP: Record<string, ProductCategory> = {
  'mobile-app': 'mobile-health',
  'saas-dashboard': 'dashboard',
  'b2b-operations-workspace': 'dashboard',
  'landing-page': 'landing',
  'marketplace-platform': 'marketplace',
  'ecommerce': 'marketplace',
  'social-community': 'social',
  'game-interactive-app': 'game-rpg',
  'gaming-casino-app': 'game-rpg',
};

function scoreTerms(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return terms.filter(t => lower.includes(t)).length;
}

export function detectProductCategory(brief: string, skeletonId: string): ProductCategory {
  const skeletonDefault = SKELETON_CATEGORY_MAP[skeletonId];

  const scores: Record<ProductCategory, number> = {
    'mobile-health': scoreTerms(brief, HEALTH_TERMS),
    'dashboard': scoreTerms(brief, DASHBOARD_TERMS),
    'landing': scoreTerms(brief, LANDING_TERMS),
    'marketplace': scoreTerms(brief, MARKETPLACE_TERMS),
    'social': scoreTerms(brief, SOCIAL_TERMS),
    'game-rpg': scoreTerms(brief, GAME_TERMS),
    'generic': 0,
  };

  const topScore = Math.max(...Object.values(scores));

  if (topScore === 0) {
    return skeletonDefault ?? 'generic';
  }

  const topCategory = (Object.entries(scores) as [ProductCategory, number][])
    .filter(([, s]) => s === topScore)
    .map(([c]) => c)[0];

  if (topCategory === 'generic') return skeletonDefault ?? 'generic';

  // If no strong brief signal, prefer skeleton hint
  if (topScore === 1 && skeletonDefault) return skeletonDefault;

  return topCategory;
}

// ── Per-category profiles ─────────────────────────────────────────────────────

type CategoryProfile = {
  insight: Omit<MarketAwareProductInsight, 'productCategory'>;
  requiredMoments: string[];
  productSpecificWorkflow: string;
  differentiator: string;
};

const CATEGORY_PROFILES: Record<ProductCategory, CategoryProfile> = {
  'mobile-health': {
    insight: {
      successfulPatterns: [
        'MyFitnessPal (calorie + macro tracking with community)',
        'Noom (psychology-based habit change)',
        'Headspace / Calm (guided sessions + streaks)',
        'Oura Ring app (passive insight + daily readiness score)',
        'Zero (fasting tracker with simple scan-to-start UX)',
      ],
      popularFeatures: [
        'Quick scan or one-tap daily action',
        'Immediate result or verdict after action',
        'Daily streak + progress visualization',
        'Coach tip or explanation screen',
        'Personalized insight based on recent patterns',
        'Minimal-friction logging',
      ],
      userPainPoints: [
        'Boring calorie-log style interfaces feel like homework',
        'Static reports with no clear next action',
        'Generic advice not tied to user data',
        'Overwhelming dashboards with too many numbers',
        'No emotional feedback — apps feel robotic',
        'Poor onboarding, users don\'t understand the value fast enough',
      ],
      trends: [
        'AI-powered coaching and personalized nudges',
        'Wearable + sensor integration for passive tracking',
        'Habit streaks and daily check-ins for retention',
        'Micro-actions: one thing to do today, not a full plan',
        'Visual health story: progress shown as a journey, not a log',
      ],
      competitorGaps: [
        'Most apps show data but not insight — users don\'t know what to do',
        'Coaching is generic, not tied to the user\'s actual patterns',
        'Progress screens are line charts, not motivating milestones',
        'Missing emotional resonance — apps don\'t celebrate wins',
      ],
      differentiatorOpportunity:
        'Show the scan → verdict → one next action → history/pattern insight → coach loop clearly in the prototype. Every action should have immediate, personalized feedback.',
    },
    requiredMoments: [
      'home/today screen (status, today\'s goal, streak)',
      'primary action or scan (one-tap or camera scan)',
      'result/verdict screen (immediate feedback after action)',
      'progress/history/pattern screen (visual trends over time)',
      'coach/detail/explanation screen (why + what to do next)',
    ],
    productSpecificWorkflow:
      'scan/log → instant verdict → contextual next action → weekly pattern insight → coach explanation',
    differentiator:
      'Immediate verdict + one personalized next action after every user input',
  },

  'dashboard': {
    insight: {
      successfulPatterns: [
        'Datadog (real-time operational metrics + alerts)',
        'Linear (project status with priority + drill-down)',
        'Notion (flexible workspace with status views)',
        'Retool (internal tool builder with data tables)',
        'Airtable (grid + board + gallery views on same data)',
      ],
      popularFeatures: [
        'KPI cards with trend indicators (up/down/neutral)',
        'Alert/status area with priority ordering',
        'Data table with sort, filter, bulk actions',
        'Primary action button tied to the most urgent item',
        'AI summary or recommendation area',
        'Drill-down from summary to detail',
      ],
      userPainPoints: [
        'Random card grids that show numbers without context',
        'No clear priority — everything looks equally important',
        'Charts without actionability — no call-to-action',
        'Too many tabs and navigation options causing analysis paralysis',
        'Slow load times making dashboards feel stale',
        'No personalization — same view for every role',
      ],
      trends: [
        'AI-generated summaries of what changed and why',
        'Smart alerts that only fire when action is actually needed',
        'Personalized dashboard views per user role',
        'Embedded actions: approve/reject/escalate directly in the dashboard',
        'Predictive insights alongside historical metrics',
      ],
      competitorGaps: [
        'Showing data without insight — users must interpret everything manually',
        'No visible priority actions — users don\'t know what to do first',
        'Drill-downs lose context — breadcrumb navigation missing',
        'Status areas are hidden in secondary tabs instead of visible prominently',
      ],
      differentiatorOpportunity:
        'Show metrics with context (trend + benchmark) + priority actions + drill-down in one view. The dashboard should tell the user what happened, why it matters, and what to do.',
    },
    requiredMoments: [
      'metrics overview (key KPIs with trend indicators)',
      'status/alerts (priority-ordered alerts or status items)',
      'table/list/detail area (filterable data with drill-down)',
      'primary action (most urgent action visible without scrolling)',
      'insight or recommendation area (AI summary or best-next-action)',
    ],
    productSpecificWorkflow:
      'metrics overview → status alert → drill-down to detail → primary action → insight confirmation',
    differentiator:
      'Metrics + context + priority action in a single glance — no need to hunt for what to do next',
  },

  'landing': {
    insight: {
      successfulPatterns: [
        'Stripe (problem-first → outcome → proof → pricing → CTA)',
        'Linear (pain-aware hero → workflow demo → trust → conversion)',
        'Vercel (speed of benefit visible above fold → one CTA)',
        'Framer (visual product demo as the hero → social proof → pricing)',
        'Superhuman (waitlist-driven scarcity + outcome-focused copy)',
      ],
      popularFeatures: [
        'Outcome-first hero headline (what the user gets, not what the product does)',
        'Product screenshot or interactive demo above the fold',
        'Concise value proposition (3 benefits max)',
        'Social proof (logos, testimonials, numbers)',
        'Clear single CTA (try free, join waitlist, start now)',
        'FAQ section addressing objections',
        'Pricing section with clear tier comparison',
      ],
      userPainPoints: [
        'Generic hero text ("The platform for modern teams") says nothing',
        'Feature lists instead of outcome statements',
        'No trust signals above the fold',
        'Multiple competing CTAs confuse visitors',
        'No problem statement — visitors don\'t know if this is for them',
        'Slow page load kills conversions before the user reads anything',
      ],
      trends: [
        'Animated hero sections with product in motion',
        'Video demos embedded near the hero',
        'Dark-mode-first premium aesthetic',
        'Waitlist momentum indicators ("X people joined today")',
        'Micro-interactions on scroll reveal',
        'Social proof as a live ticker or real-time counter',
      ],
      competitorGaps: [
        'Most landing pages feature-list instead of explaining the pain → outcome path',
        'Trust signals are at the bottom — visitors leave before seeing them',
        'No product workflow explanation — users can\'t visualize using the product',
        'Pricing hidden behind a click instead of visible on scroll',
      ],
      differentiatorOpportunity:
        'Make the pain → outcome → proof → conversion path visible above the fold. Show a real product moment (screenshot or demo) before the user scrolls.',
    },
    requiredMoments: [
      'hero (outcome-first headline + product screenshot or demo)',
      'value proposition (3 core benefits, outcome-focused)',
      'problem/solution (pain acknowledgment → product response)',
      'trust/proof (logos, testimonials, or a key metric)',
      'primary CTA (single, clear, above the fold and repeated)',
      'product preview or workflow explanation (how it works visually)',
    ],
    productSpecificWorkflow:
      'hero → value proposition → pain/solution → trust proof → workflow preview → CTA',
    differentiator:
      'Outcome-first copy + product moment visible before scrolling + single conversion path',
  },

  'marketplace': {
    insight: {
      successfulPatterns: [
        'Airbnb (catalog → trust-rich detail → booking → review loop)',
        'Etsy (discovery → personal story → trust signals → checkout)',
        'Depop (social + commerce: feed + shop on same screen)',
        'Farfetch (editorial curation + luxury trust signals)',
        'Amazon (search → filter → detail → social proof → instant buy)',
      ],
      popularFeatures: [
        'Search with autocomplete and smart filters',
        'Catalog view with image-first cards and trust badges',
        'Item detail with multiple images, reviews, and seller info',
        'One-tap save/wishlist',
        'Streamlined checkout (minimal steps, saved payment)',
        'Social proof on item cards (ratings, purchase count)',
      ],
      userPainPoints: [
        'Choice paralysis from poor filtering and overwhelming catalogs',
        'Unclear trust signals — users don\'t know if sellers are reliable',
        'Long checkout flows cause abandonment — checkout friction kills conversions',
        'Poor mobile photo quality for items',
        'Misleading descriptions leading to returns and distrust',
        'No clear delivery expectations during browsing',
      ],
      trends: [
        'AI-powered product discovery and recommendation',
        'Social proof displayed prominently on item cards (not just detail page)',
        'Instant checkout with saved preferences',
        'Video demos of products on listing pages',
        'Sustainability/authenticity badges as trust signals',
        'Social commerce: buying from creators\' pages directly',
      ],
      competitorGaps: [
        'Generic item cards with no personality or trust context',
        'Trust signals buried in item detail, not visible in catalog',
        'Checkout requires too many steps and confirmation screens',
        'Filters don\'t remember preferences between sessions',
        'No visual difference between trusted and new/unknown sellers',
      ],
      differentiatorOpportunity:
        'Reduce trust friction at every step: trust signals visible in catalog, streamlined checkout, and clear seller credibility on item detail. Show what makes this marketplace feel safer and faster to buy from.',
    },
    requiredMoments: [
      'catalog/discovery (image-first grid with trust badges)',
      'filters/search (relevant facets + search autocomplete)',
      'item detail (multiple images, reviews, seller info, delivery)',
      'trust/proof or reviews (ratings, testimonials, purchase count)',
      'cart/checkout/action (streamlined, minimal-step flow)',
    ],
    productSpecificWorkflow:
      'discover → filter/search → item detail → trust check → cart → streamlined checkout',
    differentiator:
      'Trust signals visible at every step, not just on item detail — catalog cards show credibility immediately',
  },

  'social': {
    insight: {
      successfulPatterns: [
        'Instagram (identity + visual feed + discovery + creation)',
        'TikTok (algorithm-driven discovery + creation as first-class)',
        'Discord (community spaces + real-time interaction)',
        'Reddit (topic communities + voting + nested discussion)',
        'BeReal (authenticity-first + time-constrained creation)',
      ],
      popularFeatures: [
        'Personalized feed with algorithm-driven ordering',
        'One-tap creation or posting',
        'Reactions and threaded comments',
        'Profile with identity signals (bio, highlights, followers)',
        'Discovery / explore / trending area',
        'Notifications for social interactions',
      ],
      userPainPoints: [
        'Static feeds with no reason to return tomorrow — no fresh content hook',
        'Unclear identity — users don\'t know what to share or who sees it',
        'High creation friction discourages first posts',
        'No community context — feels like shouting into the void',
        'Notification fatigue from irrelevant activity',
        'Hard to find or build a specific community',
      ],
      trends: [
        'Creator-first features: monetization, analytics, exclusive content',
        'Async social: async video messages, audio rooms',
        'Niche communities over general social networks',
        'Short-video as default content format',
        'Social commerce integration',
        'AI-assisted content creation (caption, edit, suggest)',
      ],
      competitorGaps: [
        'Generic feeds with no personality or community identity',
        'Profile pages that don\'t communicate the user\'s identity clearly',
        'Creation flow buried in navigation instead of one-tap prominent',
        'Community spaces without clear purpose or rules',
        'Missing the "why would I come back tomorrow" hook',
      ],
      differentiatorOpportunity:
        'Show identity + engagement loop + creation friction reduction in the prototype. Make the first action (create a post, join a community) feel inviting, not intimidating.',
    },
    requiredMoments: [
      'feed (personalized, algorithm-ordered, image/video-first)',
      'profile/identity (user identity, highlights, activity)',
      'create/action (one-tap post, story, or reaction creation)',
      'community/discovery (explore, trending, topics, or channels)',
      'reactions/activity (notifications, interaction summary)',
    ],
    productSpecificWorkflow:
      'feed → discover community → view profile → create/react → notification/activity',
    differentiator:
      'Clear identity + friction-free creation + community context visible in the feed',
  },

  'game-rpg': {
    insight: {
      successfulPatterns: [
        'Duolingo (streak + XP + levels + social + daily mission)',
        'Habitica (habit tracker as RPG: quest + reward + guild)',
        'Clash of Clans (base building + daily resource + attack loop)',
        'Final Fantasy (story + progression + reward + party)',
        'Supercell games (daily action + season pass + social)',
      ],
      popularFeatures: [
        'Progression map or XP bar visible at all times',
        'Daily quest or challenge that resets',
        'Reward screen with currency, badge, or unlock',
        'Character or avatar with status/level',
        'Leaderboard or guild/social layer',
        'Feedback state (win/loss/level-up animation)',
      ],
      userPainPoints: [
        'Unclear progression — users don\'t know if they\'re advancing',
        'No daily reason to return — no fresh challenge or reward',
        'Reward feels meaningless if not tied to visible progress',
        'Complex onboarding before any fun is reached',
        'Social layer hidden or hard to find',
        'No emotional feedback for actions — silent and robotic',
      ],
      trends: [
        'Season passes and time-limited events for retention',
        'Social challenges between friends',
        'Micro-rewards for every meaningful action (not just level-up)',
        'AI-generated quests or adaptive difficulty',
        'Idle/passive mechanics alongside active gameplay',
        'Cross-platform progress persistence',
      ],
      competitorGaps: [
        'Reward loop is unclear — users don\'t know when the next reward comes',
        'Progress map is hidden instead of being the main screen',
        'Daily action is buried — users forget to return',
        'No status/identity: users can\'t show off their achievements',
        'Win/loss states are weak — no celebration or recovery path',
      ],
      differentiatorOpportunity:
        'Show the action → reward → progress → next challenge loop clearly in the prototype. Make every tap feel like it matters with immediate feedback and visible progress.',
    },
    requiredMoments: [
      'progression map/status (level, XP, map, or progress bar)',
      'daily action (quest, challenge, or daily login reward)',
      'reward/currency (coins, gems, XP, or unlock screen)',
      'challenge/quest (active challenge with clear objective and timer/count)',
      'feedback/result state (win/loss/level-up screen with animation context)',
    ],
    productSpecificWorkflow:
      'daily login → progression status check → daily challenge → action → reward → progress update → next challenge',
    differentiator:
      'Visible action → reward → progress → next challenge loop — every tap has immediate, joyful feedback',
  },

  'generic': {
    insight: {
      successfulPatterns: [
        'Clear product identity visible on the first screen',
        'Primary action reachable in one tap from home',
        'Consistent design language throughout',
      ],
      popularFeatures: [
        'Intuitive navigation',
        'Clear primary CTA on every key screen',
        'Meaningful content instead of placeholder text',
      ],
      userPainPoints: [
        'Unclear what the product does on first load',
        'Generic placeholder text breaks trust instantly',
        'No clear primary action or conversion path',
      ],
      trends: [
        'Strong visual identity from the first screen',
        'Micro-interactions that signal responsiveness',
        'Clear empty states that guide the user',
      ],
      competitorGaps: [
        'Most prototypes use generic names and placeholder text',
        'No product-specific workflow visible in the prototype',
      ],
      differentiatorOpportunity:
        'Make the product\'s purpose unmistakably clear from the first screen. Eliminate all placeholder text and show a real user journey.',
    },
    requiredMoments: [
      'home/main screen (clear product identity and primary action)',
      'primary feature or workflow screen',
      'result or detail screen',
    ],
    productSpecificWorkflow:
      'home → primary feature → result/detail → next action',
    differentiator:
      'Unmistakably clear product identity with no placeholder text anywhere',
  },
};

// ── Generic vision builder (product-type aware) ───────────────────────────────

function buildProductVision(
  brief: string,
  category: ProductCategory,
): ProductVision {
  const lower = brief.toLowerCase();
  const profile = CATEGORY_PROFILES[category];

  // Extract app name hint from brief (first capitalized word sequence)
  const appNameMatch = brief.match(/^["']?([A-Z][A-Za-z0-9 ]{1,30})/);
  const appNameHint = appNameMatch ? appNameMatch[1].trim() : 'this product';

  const visionByCategory: Record<ProductCategory, ProductVision> = {
    'mobile-health': {
      productPromise: `${appNameHint} helps users take one clear health action every day and see their progress build over time.`,
      targetUser: 'Health-conscious individuals who want simple daily guidance without complex tracking',
      coreUserJourney: 'Open app → scan or log → receive instant verdict + next action → view weekly pattern → read coach explanation',
      emotionalHook: 'Users feel understood and guided, not judged or overwhelmed',
      primaryUserOutcome: 'Daily healthy habit that sticks, supported by data and coaching',
    },
    'dashboard': {
      productPromise: `${appNameHint} gives operators immediate clarity on what matters and what to do next, without hunting through charts.`,
      targetUser: 'Operations, analytics, or management teams who need real-time situational awareness',
      coreUserJourney: 'Open dashboard → see top KPIs + alerts → drill into issue → take primary action → confirm resolution',
      emotionalHook: 'Users feel in control and confident, not overwhelmed by data they can\'t act on',
      primaryUserOutcome: 'Faster issue detection and resolution with less cognitive load',
    },
    'landing': {
      productPromise: `${appNameHint} converts visitors into users by making the pain, outcome, and next step clear in seconds.`,
      targetUser: 'Potential customers who are evaluating whether this product solves their problem',
      coreUserJourney: 'Land on page → grasp the outcome in 3 seconds → see proof → click single CTA',
      emotionalHook: 'Visitors feel like this product was made exactly for their problem',
      primaryUserOutcome: 'High conversion rate from visitor to signup or trial',
    },
    'marketplace': {
      productPromise: `${appNameHint} makes discovery and purchase feel safe, fast, and enjoyable — no friction, no doubt.`,
      targetUser: 'Buyers looking for specific products or services with confidence and ease',
      coreUserJourney: 'Discover → filter to relevant items → review detail + trust signals → add to cart → streamlined checkout',
      emotionalHook: 'Users feel confident in their purchase decision, not anxious about trust or complexity',
      primaryUserOutcome: 'Completed purchase with high satisfaction and intent to return',
    },
    'social': {
      productPromise: `${appNameHint} helps users express their identity, find their community, and engage in ways that feel genuinely rewarding.`,
      targetUser: 'Creators and community members who want meaningful connection around shared interests',
      coreUserJourney: 'Browse feed → discover content → engage or create → build identity → grow community',
      emotionalHook: 'Users feel seen, connected, and motivated to contribute — not just consume',
      primaryUserOutcome: 'Daily active engagement driven by genuine community value, not compulsion',
    },
    'game-rpg': {
      productPromise: `${appNameHint} creates a clear progression loop where every daily action feels rewarding and the next challenge is always visible.`,
      targetUser: 'Players who enjoy progression, rewards, and daily challenges with a clear sense of advancement',
      coreUserJourney: 'Open app → see daily challenge → complete action → receive reward → view updated progress → see next challenge',
      emotionalHook: 'Players feel the thrill of progress and anticipation of the next reward — they always have a reason to return',
      primaryUserOutcome: 'Daily retention through a clear and satisfying reward loop',
    },
    'generic': {
      productPromise: `${appNameHint} delivers clear value to users through an intuitive and purposeful experience.`,
      targetUser: 'Users who need a solution to the problem this product addresses',
      coreUserJourney: 'Open app → understand product purpose → complete primary action → see result',
      emotionalHook: 'Users feel the product was designed for them, not for a generic audience',
      primaryUserOutcome: 'Completed primary user goal with no confusion or friction',
    },
  };

  // Suppress unused variable warning
  void lower;
  void profile;

  return visionByCategory[category];
}

// ── Builder implementation brief builder ──────────────────────────────────────

function buildBuilderBrief(
  skeletonId: string,
  category: ProductCategory,
  premiumComponentIds: string[],
  mediaHints: Array<{ id: string; kind?: string }>,
): BuilderImplementationBrief {
  const profile = CATEGORY_PROFILES[category];

  const designConstraints: string[] = [
    'Use premium components when provided — they establish the visual identity',
    'Use media assets when provided — reference them by exact generated path',
    'Follow the selected skeleton\'s component import paths exactly',
    'No generic Tailwind-only components when premium alternatives are available',
  ];

  if (premiumComponentIds.length > 0) {
    designConstraints.push(
      `Premium components selected: ${premiumComponentIds.join(', ')} — must appear on at least one screen`,
    );
  }

  if (mediaHints.length > 0) {
    designConstraints.push(
      `Media assets available: ${mediaHints.map(h => h.id).join(', ')} — must be imported and used`,
    );
  }

  const qualityConstraints = [
    'No Feature 1, AppName, Item 1, Lorem ipsum, Untitled, or KPI 1 placeholder text anywhere',
    'All imports must resolve — use exact paths from the skeleton registry',
    'Every screen must have product-specific content, not generic filler',
    'Primary CTA must exist and be product-specific',
    'Product-specific workflow must be visible and functional in the prototype',
    'Self-test checklist items marked "must" must all pass',
  ];

  const forbiddenGenericPlaceholders = [
    'Feature 1 / Feature 2 / Feature 3',
    'AppName / Your App / App Name',
    'Item 1 / Item 2 / Item 3',
    'Lorem ipsum / Lorem ipsum dolor',
    'Untitled / Unnamed / Sample',
    'KPI 1 / KPI 2 / Metric 1',
    'User Name / Username / John Doe (as static placeholder)',
    'Description here / Enter description / Placeholder text',
    'Coming soon (without product-specific context)',
  ];

  return {
    requiredScreens: profile.requiredMoments,
    requiredInteractions: getRequiredInteractions(category),
    selectedSkeleton: skeletonId,
    designConstraints,
    qualityConstraints,
    productSpecificWorkflow: profile.productSpecificWorkflow,
    forbiddenGenericPlaceholders,
    marketAwareDifferentiator: profile.differentiator,
  };
}

function getRequiredInteractions(category: ProductCategory): string[] {
  const interactions: Record<ProductCategory, string[]> = {
    'mobile-health': [
      'Primary action button (scan, log, or start)',
      'Result/verdict display after action',
      'Progress chart or streak visualization',
      'Coach tip expansion or detail drill-down',
      'Navigation between today/history/profile',
    ],
    'dashboard': [
      'KPI card click → drill-down to detail',
      'Alert/status item → primary action',
      'Table row click → detail panel or page',
      'Filter and sort on data table',
      'Insight card with recommendation action',
    ],
    'landing': [
      'Primary CTA button (above fold + repeated)',
      'Scroll-triggered section reveal',
      'Social proof expansion or testimonial carousel',
      'FAQ accordion or expand/collapse',
      'Product preview or demo interaction',
    ],
    'marketplace': [
      'Search with autocomplete',
      'Filter panel open/close + apply',
      'Item card click → detail view',
      'Add to cart / save to wishlist',
      'Checkout flow (at least 2 steps visible)',
    ],
    'social': [
      'Feed scroll with content preview',
      'Reaction or like on a post',
      'Create/post button (prominent, one-tap)',
      'Profile click → identity view',
      'Notification tap → context',
    ],
    'game-rpg': [
      'Daily action button (start quest, collect reward)',
      'Progression map tap → challenge detail',
      'Reward collect animation or feedback',
      'Character/status screen view',
      'Challenge complete → result state',
    ],
    'generic': [
      'Primary action button on home screen',
      'Navigation between key screens',
      'Detail view for primary content',
    ],
  };
  return interactions[category];
}

// ── Self-test checklist builder ───────────────────────────────────────────────

export function buildBuilderSelfTestChecklist(
  input: BuildBuilderSelfTestChecklistInput,
): SelfTestChecklistItem[] {
  const { productCategory, premiumComponentIds = [], mediaHints = [] } = input;

  const items: SelfTestChecklistItem[] = [
    {
      id: 'file-coverage',
      label: 'Generated files match expected files from the architect plan',
      severity: 'must',
      rationale: 'Missing files cause compilation errors and incomplete prototypes',
      detectionHint: 'Compare generated file paths against plan.deltaFiles — every path must have a generated file',
    },
    {
      id: 'import-validity',
      label: 'All imports in generated files resolve to valid paths',
      severity: 'must',
      rationale: 'Broken imports prevent the app from compiling and running',
      detectionHint: 'Run import validation on all generated .tsx/.ts files — no unresolved @/ or relative imports',
    },
    {
      id: 'no-generic-placeholders',
      label: 'No generic placeholder text (Feature 1, AppName, Item 1, Lorem ipsum, Untitled, KPI 1)',
      severity: 'must',
      rationale: 'Generic placeholders signal an incomplete prototype and break user trust immediately',
      detectionHint: 'Search all generated files for: Feature 1, Feature 2, AppName, Item 1, Item 2, Lorem ipsum, Untitled, KPI 1, Metric 1, Username, John Doe (as static text)',
    },
    {
      id: 'meaningful-screens',
      label: 'App has meaningful product-specific screens and sections',
      severity: 'must',
      rationale: 'Screens with only layout and no real content are not prototype-quality',
      detectionHint: 'Each screen file must contain product-specific labels, entity names, or workflow content',
    },
    {
      id: 'primary-cta-exists',
      label: 'Primary CTA exists on the home or first screen and is product-specific',
      severity: 'must',
      rationale: 'Every prototype must have a clear call-to-action that matches the product purpose',
      detectionHint: 'First screen file must contain a button or link with product-specific text (not "Click here", "Submit", or "Button")',
    },
    {
      id: 'product-specific-workflow',
      label: 'Product-specific workflow is visible and navigable in the app',
      severity: 'must',
      rationale: 'A generic workflow does not demonstrate what makes this product valuable',
      detectionHint: `Verify that the ${CATEGORY_PROFILES[productCategory].productSpecificWorkflow} flow is implemented across the generated screens`,
    },
    {
      id: 'premium-assets-used',
      label: premiumComponentIds.length > 0
        ? `Premium components (${premiumComponentIds.join(', ')}) are used in at least one screen`
        : 'Premium components are used when provided',
      severity: 'should',
      rationale: 'Premium components establish visual identity and elevate the quality of the prototype',
      detectionHint: premiumComponentIds.length > 0
        ? `Search generated screen files for import of: ${premiumComponentIds.join(', ')}`
        : 'If premium components were selected, at least one must be imported in a screen file',
    },
    {
      id: 'media-assets-used',
      label: mediaHints.length > 0
        ? `Media assets (${mediaHints.map(h => h.id).join(', ')}) are referenced in screen files`
        : 'Media assets are referenced when provided',
      severity: 'should',
      rationale: 'Media assets make the prototype feel real and visually complete',
      detectionHint: mediaHints.length > 0
        ? `Search generated files for references to: ${mediaHints.map(h => h.id).join(', ')}`
        : 'If media assets were materialized, they must be imported or referenced in at least one screen',
    },
    {
      id: 'composition-expectations-met',
      label: 'Screen composition expectations for this product type are met',
      severity: 'should',
      rationale: 'Each product type has expected screens and zones — missing them produces a generic prototype',
      detectionHint: `Required screens for ${productCategory}: ${CATEGORY_PROFILES[productCategory].requiredMoments.map(m => m.split(' (')[0]).join(', ')}`,
    },
    {
      id: 'market-differentiator-visible',
      label: 'Prototype reflects at least one market-aware differentiator',
      severity: 'must',
      rationale: 'A prototype that looks like any competitor prototype is not a strong product demonstration',
      detectionHint: `The differentiator for ${productCategory}: "${CATEGORY_PROFILES[productCategory].differentiator}" — verify it is visibly implemented`,
    },
  ];

  return items;
}

// ── Main brief builder ────────────────────────────────────────────────────────

export function buildMarketAwareBuilderBrief(
  input: BuildMarketAwareBuilderBriefInput,
): MarketAwareBuilderBrief {
  const { brief, skeletonId, premiumComponentIds = [], mediaHints = [] } = input;

  const productCategory = detectProductCategory(brief, skeletonId);
  const profile = CATEGORY_PROFILES[productCategory];

  const marketInsight: MarketAwareProductInsight = {
    productCategory,
    ...profile.insight,
  };

  const productVision = buildProductVision(brief, productCategory);

  const builderBrief = buildBuilderBrief(
    skeletonId,
    productCategory,
    premiumComponentIds,
    mediaHints,
  );

  const selfTestChecklist = buildBuilderSelfTestChecklist({
    brief,
    skeletonId,
    productCategory,
    premiumComponentIds,
    mediaHints,
  });

  return {
    marketInsight,
    productVision,
    builderBrief,
    selfTestChecklist,
  };
}

// ── Diagnostics ───────────────────────────────────────────────────────────────

const TECH_ARCH_SIGNALS = [
  'file tree',
  'file structure',
  'folder structure',
  'directory structure',
  'src/',
  'pages/',
  'components/',
  '.tsx',
  '.ts',
  'import {',
  'export default',
  'const router',
  'react-router',
  'vite.config',
  'tailwind.config',
  'package.json',
  'node_modules',
];

const GENERIC_SIGNALS = [
  'feature 1',
  'feature 2',
  'feature 3',
  'kpi 1',
  'kpi 2',
  'item 1',
  'item 2',
  'appname',
  'lorem ipsum',
  'untitled',
  'coming soon',
  'placeholder',
  'your app',
  'sample data',
];

export function evaluateMarketAwareBuilderBriefDiagnostics(
  brief: MarketAwareBuilderBrief,
): MarketAwareBriefDiagnostics {
  const issues: MarketAwareBriefDiagnosticsIssue[] = [];

  // Serialize only the content-bearing parts of the brief for detection.
  // Deliberately exclude builderBrief.forbiddenGenericPlaceholders and
  // selfTestChecklist.detectionHint — those fields intentionally contain
  // placeholder string names as documentation.
  const contentForGenericScan = [
    ...brief.marketInsight.successfulPatterns,
    ...brief.marketInsight.popularFeatures,
    ...brief.marketInsight.userPainPoints,
    ...brief.marketInsight.trends,
    ...brief.marketInsight.competitorGaps,
    brief.marketInsight.differentiatorOpportunity,
    brief.productVision.productPromise,
    brief.productVision.targetUser,
    brief.productVision.coreUserJourney,
    brief.productVision.emotionalHook,
    brief.productVision.primaryUserOutcome,
    brief.builderBrief.productSpecificWorkflow,
    brief.builderBrief.marketAwareDifferentiator,
    // Note: selfTestChecklist labels intentionally mention placeholder strings
    // (they describe what to check FOR), so they are excluded from generic scanning.
  ].join(' ').toLowerCase();

  // Full JSON for tech-arch detection (file tree signals are only meaningful in content)
  const briefText = JSON.stringify(brief).toLowerCase();

  // A. Missing market insight section
  const insightFields = [
    brief.marketInsight.successfulPatterns,
    brief.marketInsight.popularFeatures,
    brief.marketInsight.userPainPoints,
    brief.marketInsight.trends,
    brief.marketInsight.competitorGaps,
  ];
  const hasMarketInsight = insightFields.every(arr => arr.length > 0)
    && !!brief.marketInsight.differentiatorOpportunity;

  if (!hasMarketInsight) {
    issues.push({
      code: 'MISSING_MARKET_INSIGHT',
      message: 'Market insight section is incomplete — missing one or more of: successfulPatterns, popularFeatures, userPainPoints, trends, competitorGaps, differentiatorOpportunity',
      severity: 'warn',
    });
  }

  // B. Missing user pain points
  if (brief.marketInsight.userPainPoints.length === 0) {
    issues.push({
      code: 'MISSING_USER_PAIN_POINTS',
      message: 'Market insight is missing user pain points — the brief cannot guide the builder to address real problems',
      severity: 'warn',
    });
  }

  // C. Missing competitor gap / differentiator idea
  const hasDifferentiator =
    !!brief.marketInsight.differentiatorOpportunity?.trim() ||
    brief.marketInsight.competitorGaps.length > 0;

  if (!hasDifferentiator) {
    issues.push({
      code: 'MISSING_DIFFERENTIATOR',
      message: 'Brief is missing a competitor gap or differentiator idea — the prototype will not stand out from generic examples',
      severity: 'warn',
    });
  }

  // D. Missing required screens
  if (brief.builderBrief.requiredScreens.length === 0) {
    issues.push({
      code: 'MISSING_REQUIRED_SCREENS',
      message: 'Builder brief has no required screens — the coder has no product-specific screen targets',
      severity: 'warn',
    });
  }

  // E. Missing self-test checklist
  if (brief.selfTestChecklist.length === 0) {
    issues.push({
      code: 'MISSING_SELF_TEST_CHECKLIST',
      message: 'Self-test checklist is empty — the builder has no quality verification guidance',
      severity: 'warn',
    });
  }

  // F. Missing forbidden generic placeholder rules
  if (brief.builderBrief.forbiddenGenericPlaceholders.length === 0) {
    issues.push({
      code: 'MISSING_FORBIDDEN_PLACEHOLDER_RULES',
      message: 'Builder brief has no forbidden generic placeholder rules — generic text may appear in the prototype',
      severity: 'warn',
    });
  }

  // G. Suspiciously generic brief detection
  const genericSignalCount = GENERIC_SIGNALS.filter(s => contentForGenericScan.includes(s)).length;
  const suspiciouslyGeneric =
    genericSignalCount > 3 ||
    (brief.builderBrief.requiredScreens.length <= 1 && brief.marketInsight.userPainPoints.length <= 1);

  if (suspiciouslyGeneric) {
    issues.push({
      code: 'SUSPICIOUSLY_GENERIC',
      message: `Brief appears to be suspiciously generic (${genericSignalCount} generic signal(s) detected, minimal screen/pain-point coverage)`,
      severity: 'warn',
    });
  }

  // H. Brief tries to own technical architecture / file tree
  const techArchSignalCount = TECH_ARCH_SIGNALS.filter(s => briefText.includes(s)).length;
  const triesToOwnTechnicalArchitecture = techArchSignalCount >= 4;

  if (triesToOwnTechnicalArchitecture) {
    issues.push({
      code: 'TRIES_TO_OWN_TECHNICAL_ARCHITECTURE',
      message: `Brief contains technical architecture signals (${techArchSignalCount} signal(s)) — the market strategist brief should NOT include file trees or full technical architecture. Leave that to the builder.`,
      severity: 'warn',
    });
  }

  return {
    ok: issues.filter(i => i.severity === 'error').length === 0,
    issues,
    suspiciouslyGeneric,
    triesToOwnTechnicalArchitecture,
  };
}

// ── Telemetry serializer ──────────────────────────────────────────────────────

export function serializeMarketAwareBriefDiagnosticsTelemetry(
  brief: MarketAwareBuilderBrief,
  diagnostics: MarketAwareBriefDiagnostics,
  coderPromptContainsMarketBrief: boolean,
): MarketAwareBriefDiagnosticsTelemetry {
  return {
    market_brief_ok: diagnostics.ok,
    product_category: brief.marketInsight.productCategory,
    market_insight_count:
      brief.marketInsight.userPainPoints.length +
      brief.marketInsight.competitorGaps.length +
      brief.marketInsight.trends.length,
    required_screen_count: brief.builderBrief.requiredScreens.length,
    self_test_item_count: brief.selfTestChecklist.length,
    differentiator_present: !!brief.marketInsight.differentiatorOpportunity?.trim(),
    suspiciously_generic: diagnostics.suspiciouslyGeneric,
    tries_to_own_technical_architecture: diagnostics.triesToOwnTechnicalArchitecture,
    coder_prompt_contains_market_brief: coderPromptContainsMarketBrief,
  };
}
