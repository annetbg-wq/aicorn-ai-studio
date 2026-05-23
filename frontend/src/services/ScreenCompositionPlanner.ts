/**
 * ScreenCompositionPlanner — Multi-Zone Screen Composition Planner for AIC-RG Studio.
 *
 * Deterministic (no LLM) planner that maps a brief + skeletonId + design context
 * to a structured multi-screen, multi-zone composition plan.
 *
 * The plan is injected into the coder system prompt via buildCompositionPlanPromptBlock()
 * and serialized to telemetry via serializeScreenCompositionPlan().
 */

import type { DesignContext, MediaHint } from './DesignContract';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ScreenZoneRole =
  | 'hero' | 'status' | 'primary_action' | 'shortcut' | 'insight'
  | 'progress' | 'feed' | 'list' | 'table' | 'form' | 'coach'
  | 'media' | 'navigation' | 'cta' | 'secondary_feature' | 'other';

export type ScreenRole =
  | 'home' | 'dashboard' | 'detail' | 'form' | 'progress' | 'profile'
  | 'coach' | 'settings' | 'feed' | 'commerce' | 'other';

export type ZonePriority = 'primary' | 'secondary' | 'tertiary';
export type ScreenPriority = 'primary' | 'secondary' | 'supporting';

export interface ScreenCompositionZone {
  id: string;
  role: ScreenZoneRole;
  priority: ZonePriority;
  intent: string;
  suggestedComponents: string[];
  suggestedMedia: string[];
  interactions: string[];
  contentRules: string[];
}

export interface ScreenCompositionEntry {
  id: string;
  title: string;
  routeHint?: string;
  role: ScreenRole;
  priority: ScreenPriority;
  layoutIntent: string;
  zones: ScreenCompositionZone[];
  premiumComponentTargets: string[];
  mediaTargets: string[];
  requiredInteractions: string[];
  stateRequirements: string[];
  contentRequirements: string[];
}

export interface ScreenCompositionPlan {
  productType?: string;
  skeletonId: string;
  selectedRecipeId?: string;
  firstScreenId: string;
  screens: ScreenCompositionEntry[];
  globalLayoutRules: string[];
  avoidPatterns: string[];
  compositionNotes: string[];
}

export interface ScreenCompositionPlanTelemetry {
  product_type?: string;
  skeleton_id: string;
  selected_recipe_id?: string;
  first_screen_id: string;
  screen_count: number;
  screens: Array<{
    id: string;
    title: string;
    route_hint?: string;
    role: ScreenRole;
    priority: ScreenPriority;
    layout_intent: string;
    zones: Array<{
      id: string;
      role: ScreenZoneRole;
      priority: ZonePriority;
      intent: string;
      suggested_components: string[];
      suggested_media: string[];
      interactions: string[];
      content_rules: string[];
    }>;
    premium_component_targets: string[];
    media_targets: string[];
    required_interactions: string[];
    state_requirements: string[];
    content_requirements: string[];
  }>;
  global_layout_rules: string[];
  avoid_patterns: string[];
  composition_notes: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeZone(
  id: string,
  role: ScreenZoneRole,
  priority: ZonePriority,
  intent: string,
  interactions: string[] = [],
  contentRules: string[] = [],
): ScreenCompositionZone {
  return { id, role, priority, intent, suggestedComponents: [], suggestedMedia: [], interactions, contentRules };
}

function makeScreen(
  id: string,
  title: string,
  role: ScreenRole,
  priority: ScreenPriority,
  layoutIntent: string,
  zones: ScreenCompositionZone[],
  routeHint?: string,
  requiredInteractions: string[] = [],
  stateRequirements: string[] = [],
  contentRequirements: string[] = [],
): ScreenCompositionEntry {
  return {
    id, title, routeHint, role, priority, layoutIntent, zones,
    premiumComponentTargets: [], mediaTargets: [],
    requiredInteractions, stateRequirements, contentRequirements,
  };
}

// ── Skeleton templates ────────────────────────────────────────────────────────

function buildMobileAppTemplate(brief: string): {
  screens: ScreenCompositionEntry[];
  firstScreenId: string;
  globalLayoutRules: string[];
  avoidPatterns: string[];
} {
  const hasAiKeywords = /\b(ai|coach|assistant|recommendation|gpt|llm)\b/i.test(brief);
  const hasMedia = true; // will be determined after assignment

  const alwaysZones: ScreenCompositionZone[] = [
    makeZone('header-status', 'status', 'primary',
      'Emotional greeting and current status indicator',
      ['view status', 'tap notification'],
      ['show user name, current streak or status']),
    makeZone('primary-action', 'primary_action', 'primary',
      'Main product action: the one thing the user came to do today',
      ['tap to trigger main action'],
      ['single prominent button, product-specific label']),
    makeZone('premium-feature-block', 'insight', 'primary',
      'Premium visual block: progress ring, streak card, or status visualization',
      ['view insight', 'interact with visual'],
      ['real product metric, not placeholder']),
    makeZone('quick-modules', 'shortcut', 'secondary',
      '2-4 compact functional shortcuts: recent items, quick stats, or fast actions',
      ['tap shortcut', 'navigate to section'],
      ['functional shortcuts, not decorative tiles']),
    makeZone('progress-snapshot', 'progress', 'secondary',
      'Compact progress or insight overview',
      ['view progress', 'tap for detail'],
      ['real progress data, meaningful context']),
    makeZone('bottom-nav', 'navigation', 'primary',
      'Bottom tab navigation bar',
      ['tap tab to navigate'],
      ['match skeleton BOTTOM_TABS config']),
  ];

  // Add media-zone placeholder (will be skipped if no media assigned; added always per spec)
  const mediaZone = makeZone('media-zone', 'media', 'secondary',
    'Ambient background or decorative media asset for emotional tone',
    [],
    ['use generated asset, not placeholder gray box']);

  // Add coach-teaser only if AI keywords
  const coachZone = makeZone('coach-teaser', 'coach', 'tertiary',
    'AI coach tip or daily recommendation card (if relevant to domain)',
    ['tap to expand coach tip'],
    ['product-specific recommendation, not generic advice']);

  // Build home zones: always 5 base, + media-zone, + coach if AI
  const homeZones: ScreenCompositionZone[] = [
    alwaysZones[0], // header-status
    alwaysZones[1], // primary-action
    alwaysZones[2], // premium-feature-block
    mediaZone,
    alwaysZones[3], // quick-modules
    alwaysZones[4], // progress-snapshot
  ];
  if (hasAiKeywords) homeZones.push(coachZone);
  homeZones.push(alwaysZones[5]); // bottom-nav always last

  const homeScreen = makeScreen(
    'home-today', 'Home / Today', 'home', 'primary',
    `Rich daily cockpit with ${homeZones.length} meaningful zones — greeting, primary action, premium insight block, shortcuts, progress snapshot, and navigation.`,
    homeZones,
    '/',
    ['tap primary action', 'view progress', 'tap shortcuts'],
    ["today's data", 'progress state', 'user profile'],
    ['personalized greeting', 'real product actions', 'progress data'],
  );

  const scanCreateScreen = makeScreen(
    'scan-create', 'Scan / Create', 'other', 'secondary',
    'Create or scan flow for adding new items or entries.',
    [
      makeZone('action-header', 'status', 'primary', 'Screen title and action context', ['view header'], ['clear screen title']),
      makeZone('create-form', 'form', 'primary', 'Primary creation or scan form', ['fill form', 'submit'], ['real form fields, not placeholders']),
      makeZone('action-shortcuts', 'shortcut', 'secondary', 'Quick creation shortcuts or templates', ['tap shortcut'], ['product-specific templates']),
    ],
    '/create',
  );

  const detailScreen = makeScreen(
    'detail', 'Detail', 'detail', 'secondary',
    'Detail view for a selected item.',
    [
      makeZone('detail-header', 'hero', 'primary', 'Detail item header and key info', ['view header'], ['product-specific item detail']),
      makeZone('detail-content', 'secondary_feature', 'primary', 'Full item content and attributes', ['scroll', 'expand'], ['real content, no placeholders']),
      makeZone('action-buttons', 'primary_action', 'primary', 'Primary action buttons for this item', ['tap action'], ['product-specific actions']),
      makeZone('progress-tracker', 'progress', 'secondary', 'Item-level progress or status tracker', ['view progress'], ['contextual progress indicator']),
    ],
    '/detail/:id',
  );

  const progressScreen = makeScreen(
    'progress', 'Progress', 'progress', 'secondary',
    'Full progress and stats overview screen.',
    [
      makeZone('progress-hero', 'hero', 'primary', 'Progress hero: main metric or streak', ['view metric'], ['primary progress metric']),
      makeZone('stats-grid', 'insight', 'primary', 'Grid of key stats and metrics', ['view stats'], ['real metrics, not placeholder numbers']),
      makeZone('milestone-feed', 'feed', 'secondary', 'Milestone and achievement feed', ['scroll', 'tap milestone'], ['real achievements']),
      makeZone('insight-panel', 'insight', 'secondary', 'AI or analytics insight panel', ['view insight'], ['product-specific insights']),
    ],
    '/progress',
  );

  const profileCoachScreen = makeScreen(
    'profile-coach', 'Profile / Coach', 'profile', 'supporting',
    'User profile, settings, and AI coach integration.',
    [
      makeZone('profile-header', 'status', 'primary', 'User identity and profile header', ['view profile', 'edit'], ['real user info']),
      makeZone('stats-overview', 'insight', 'primary', 'Personal stats overview', ['view stats'], ['real personal metrics']),
      makeZone('settings-rows', 'secondary_feature', 'secondary', 'Settings and preferences rows', ['tap setting', 'toggle'], ['product-specific settings']),
      makeZone('coach-module', 'coach', 'secondary', 'AI coach module or personalization section', ['interact with coach'], ['coach content if domain supports']),
    ],
    '/profile',
  );

  return {
    screens: [homeScreen, scanCreateScreen, detailScreen, progressScreen, profileCoachScreen],
    firstScreenId: 'home-today',
    globalLayoutRules: [
      'Use vertical rhythm with clear zone grouping on the Home/Today screen.',
      'Home/Today is a product cockpit, not a simple landing page — include meaningful context and actions.',
      'Use bottom tab navigation for primary screen switching.',
      'Prefer compact functional modules over large empty sections.',
      'Use generated media for ambient backgrounds, not as decorative-only images.',
    ],
    avoidPatterns: [
      'generic-hero-plus-card-list: do not make Home a generic hero with a flat card list',
      'one-feature-per-page: do not split every feature into a separate page',
      'empty-card-walls: do not produce a wall of cards with no hierarchy',
      'decorative-only-actions: do not leave primary action buttons non-functional',
      'lorem-ipsum-placeholders: do not use lorem ipsum or generic placeholder content',
    ],
  };
}

function buildSaasDashboardTemplate(): {
  screens: ScreenCompositionEntry[];
  firstScreenId: string;
  globalLayoutRules: string[];
  avoidPatterns: string[];
} {
  const dashboardScreen = makeScreen(
    'dashboard', 'Dashboard', 'dashboard', 'primary',
    'Dense operating surface: sidebar shell, KPI strip, work queue, insight panel, workflow area, activity stream, and media backdrop.',
    [
      makeZone('workspace-shell', 'navigation', 'primary',
        'Sidebar or top nav: workspace context, user identity, main nav links',
        ['navigate sections', 'view workspace context'],
        ['product-specific nav items, not generic menu']),
      makeZone('kpi-strip', 'status', 'primary',
        'Dense KPI/metric strip: key numbers at a glance',
        ['view metrics', 'click metric for detail'],
        ['real product metrics, not placeholder numbers']),
      makeZone('work-queue', 'list', 'primary',
        'Primary work queue or project list: the main content the user acts on',
        ['click item', 'create new', 'filter', 'sort'],
        ['real items, not empty state']),
      makeZone('insight-panel', 'insight', 'secondary',
        'AI or analytics recommendation panel: what needs attention',
        ['view recommendation', 'act on insight'],
        ['product-specific insight, not generic tip']),
      makeZone('workflow-area', 'table', 'secondary',
        'Table, list, or Kanban-style workflow area',
        ['interact with workflow', 'update status'],
        ['functional workflow area']),
      makeZone('activity-stream', 'feed', 'tertiary',
        'Recent activity, comments, or quality feedback stream',
        ['scroll feed', 'react to item'],
        ['real activity entries']),
      makeZone('media-backdrop', 'media', 'tertiary',
        'Subtle visual/media backdrop, dashboard preview, or decorative data wave',
        [],
        ['subtle, not dominant; use generated asset']),
    ],
    '/',
    ['create item', 'filter queue', 'view insight'],
    ['workspace data', 'user identity', 'active projects'],
    ['real workspace content', 'actionable queue', 'key metrics'],
  );

  const projectsScreen = makeScreen(
    'projects', 'Projects', 'other', 'secondary',
    'Project listing and management view.',
    [
      makeZone('project-list', 'list', 'primary', 'Full project list with status', ['click project', 'filter'], ['real project items']),
      makeZone('create-project', 'primary_action', 'primary', 'Create new project action', ['tap create'], ['product-specific create flow']),
      makeZone('project-filters', 'shortcut', 'secondary', 'Project filter and sort controls', ['apply filter'], ['meaningful filter options']),
      makeZone('project-status', 'insight', 'secondary', 'Project status summary', ['view status'], ['real status breakdown']),
    ],
    '/projects',
  );

  const qualityFeedbackScreen = makeScreen(
    'quality-feedback', 'Quality Feedback', 'other', 'secondary',
    'Quality gate and feedback review screen.',
    [
      makeZone('readiness-score', 'insight', 'primary', 'Readiness or quality score panel', ['view score'], ['real quality metric']),
      makeZone('feedback-list', 'list', 'primary', 'Feedback item list', ['review feedback', 'act on item'], ['real feedback entries']),
      makeZone('action-items', 'primary_action', 'primary', 'Required action items from feedback', ['complete action'], ['actionable items']),
      makeZone('quality-chart', 'insight', 'secondary', 'Quality trend chart', ['view trend'], ['real trend data']),
    ],
    '/quality',
  );

  const settingsScreen = makeScreen(
    'settings', 'Settings', 'settings', 'supporting',
    'Workspace and user settings.',
    [
      makeZone('settings-nav', 'navigation', 'primary', 'Settings section navigation', ['navigate settings'], ['clear settings sections']),
      makeZone('settings-form', 'form', 'primary', 'Settings form and controls', ['update setting', 'save'], ['product-specific settings']),
    ],
    '/settings',
  );

  return {
    screens: [dashboardScreen, projectsScreen, qualityFeedbackScreen, settingsScreen],
    firstScreenId: 'dashboard',
    globalLayoutRules: [
      'Use sidebar or top navigation as the persistent workspace shell.',
      'Dashboard is a dense operating surface, not an empty stats page.',
      'At least one area must feel like a workflow: a queue, list, table, or Kanban board.',
      'Use premium dashboard components for KPI blocks and data visualization.',
      'Use media as a subtle backdrop, atmosphere element, or visual divider — not as hero imagery.',
    ],
    avoidPatterns: [
      'generic-admin-dashboard: do not produce a generic admin dashboard with only KPI cards',
      'kpi-only-layout: at least one zone must be a workflow or queue, not just metrics',
      'empty-card-walls: do not produce a card wall with no actionable hierarchy',
      'sidebar-on-mobile-nav: do not add sidebar to a bottom-tabs skeleton',
      'analytics-only: the dashboard must include actionable workflow areas, not just charts',
    ],
  };
}

function buildLandingPageTemplate(brief: string): {
  screens: ScreenCompositionEntry[];
  firstScreenId: string;
  globalLayoutRules: string[];
  avoidPatterns: string[];
} {
  const hasSocialProof = /\b(testimonial|review|trust|customer|social.?proof|case.?stud|logo)\b/i.test(brief);

  const heroZones: ScreenCompositionZone[] = [
    makeZone('headline-cta', 'hero', 'primary',
      'Strong product headline, subheadline, and primary CTA button',
      ['click CTA'],
      ['product-specific headline, real value proposition']),
    makeZone('hero-media', 'media', 'primary',
      'Generated product visual or hero background — must not be empty',
      [],
      ['use generated media asset, not placeholder']),
    makeZone('premium-hero-block', 'cta', 'primary',
      'Premium hero component or product mockup showcase block',
      ['interact with product preview'],
      ['real product showcase']),
  ];
  if (hasSocialProof) {
    heroZones.push(makeZone('social-proof-strip', 'secondary_feature', 'tertiary',
      'Social proof logos or testimonial strip',
      ['view social proof'],
      ['real-feeling trust signals']));
  }

  const heroScreen = makeScreen(
    'hero', 'Hero', 'home', 'primary',
    `Opening hero section with headline, media, and CTA${hasSocialProof ? ' plus social proof strip' : ''}.`,
    heroZones,
    '/',
    ['click CTA'],
    ['product info'],
    ['compelling headline', 'product-specific CTA text'],
  );

  const valuePropScreen = makeScreen(
    'value-prop', 'Value Proposition', 'other', 'secondary',
    'Problem statement and value cards section.',
    [
      makeZone('problem-statement', 'hero', 'primary', 'Clear problem/solution statement', ['read', 'scroll'], ['real product value proposition']),
      makeZone('value-cards', 'secondary_feature', 'primary', 'Benefit/value cards', ['view cards'], ['3-4 real product benefits']),
    ],
    '#value',
  );

  const productPreviewScreen = makeScreen(
    'product-preview', 'Product Preview', 'other', 'secondary',
    'Product screenshot and feature highlights section.',
    [
      makeZone('product-screenshot', 'media', 'primary', 'Product screenshot or demo visual', [], ['real product visual']),
      makeZone('feature-highlights', 'secondary_feature', 'primary', 'Key feature highlight list', ['read'], ['3-5 real product features']),
      makeZone('demo-cta', 'cta', 'secondary', 'Demo or trial CTA', ['click CTA'], ['product-specific CTA']),
    ],
    '#product',
  );

  const featuresScreen = makeScreen(
    'features', 'Features', 'other', 'secondary',
    'Full feature grid and details section.',
    [
      makeZone('feature-grid', 'secondary_feature', 'primary', 'Feature grid layout', ['view features'], ['real product features']),
      makeZone('feature-details', 'secondary_feature', 'secondary', 'Expanded feature details', ['read', 'interact'], ['substantive feature descriptions']),
    ],
    '#features',
  );

  const socialProofCtaScreen = makeScreen(
    'social-proof-cta', 'Social Proof & CTA', 'other', 'supporting',
    'Testimonials, final CTA, and footer.',
    [
      makeZone('testimonials', 'secondary_feature', 'primary', 'Customer testimonials or reviews', ['read testimonials'], ['real-feeling testimonials']),
      makeZone('final-cta', 'cta', 'primary', 'Final conversion CTA section', ['click CTA'], ['strong product-specific CTA']),
      makeZone('footer-nav', 'navigation', 'tertiary', 'Footer navigation and links', ['navigate'], ['standard footer links']),
    ],
    '#cta',
  );

  return {
    screens: [heroScreen, valuePropScreen, productPreviewScreen, featuresScreen, socialProofCtaScreen],
    firstScreenId: 'hero',
    globalLayoutRules: [
      'Hero section must have a product-specific headline, not a generic one.',
      'Generated media must be used in the hero section as a real visual element.',
      'Each section should have a clear visual hierarchy and purpose.',
      'Use premium hero/product components where available.',
    ],
    avoidPatterns: [
      'generic-hero: do not use a generic hero with no product identity',
      'hero-without-media: do not leave hero without a visual element',
      'feature-grid-only: do not make the page a flat list of features with no visual identity',
      'placeholder-cta: do not use generic CTA text like \'Get started\' with no product context',
    ],
  };
}

function buildSocialCommunityTemplate(): {
  screens: ScreenCompositionEntry[];
  firstScreenId: string;
  globalLayoutRules: string[];
  avoidPatterns: string[];
} {
  const feedHomeScreen = makeScreen(
    'feed-home', 'Feed / Home', 'feed', 'primary',
    'Living social feed with identity, content, community, create action, and navigation.',
    [
      makeZone('identity-header', 'status', 'primary',
        'User identity bar, notification badge, and community context',
        ['view notifications', 'tap profile'],
        ['real user identity, community context']),
      makeZone('content-feed', 'feed', 'primary',
        'Primary content feed: posts, stories, or updates',
        ['scroll', 'like', 'comment', 'share'],
        ['real post-like content, not empty list']),
      makeZone('community-module', 'secondary_feature', 'secondary',
        'People or community shortcut: who to follow, active members',
        ['follow user', 'view community'],
        ['real member-like content']),
      makeZone('create-action', 'primary_action', 'secondary',
        'Create/post floating action button or inline compose',
        ['tap to create post'],
        ['accessible from home screen']),
      makeZone('discovery-teaser', 'shortcut', 'tertiary',
        'Discovery or trending content teaser',
        ['tap to explore'],
        ['trending or relevant content teaser']),
      makeZone('bottom-nav', 'navigation', 'primary',
        'Bottom tab navigation',
        ['tap tab to navigate'],
        ['match skeleton BOTTOM_TABS config']),
    ],
    '/',
    ['scroll feed', 'create post', 'navigate tabs'],
    ['feed data', 'user identity', 'community context'],
    ['real post content', 'user identity', 'community members'],
  );

  const discoverScreen = makeScreen(
    'discover', 'Discover', 'other', 'secondary',
    'Discover and trending content screen.',
    [
      makeZone('discover-search', 'form', 'primary', 'Search bar and filters', ['search', 'filter'], ['functional search']),
      makeZone('trending-content', 'feed', 'primary', 'Trending content feed', ['scroll', 'tap'], ['real trending items']),
      makeZone('people-suggestions', 'secondary_feature', 'secondary', 'Suggested people to follow', ['follow', 'view profile'], ['real-feeling suggestions']),
    ],
    '/discover',
  );

  const profileScreen = makeScreen(
    'profile', 'Profile', 'profile', 'secondary',
    'User profile with posts grid, stats, and edit action.',
    [
      makeZone('profile-hero', 'hero', 'primary', 'Profile header with avatar and bio', ['view profile', 'edit'], ['real user info']),
      makeZone('posts-grid', 'feed', 'primary', 'User posts grid or feed', ['scroll', 'tap post'], ['real post items']),
      makeZone('stats-bar', 'insight', 'primary', 'Followers, following, posts stats', ['view stats'], ['real stats']),
      makeZone('edit-action', 'primary_action', 'secondary', 'Edit profile action', ['tap edit'], ['functional edit flow']),
    ],
    '/profile',
  );

  const messagesScreen = makeScreen(
    'messages', 'Messages', 'other', 'secondary',
    'Conversations and messaging screen.',
    [
      makeZone('conversations-list', 'list', 'primary', 'List of conversations', ['tap conversation', 'scroll'], ['real conversation items']),
      makeZone('compose-action', 'primary_action', 'primary', 'Compose new message action', ['tap compose'], ['functional compose']),
    ],
    '/messages',
  );

  const createPostScreen = makeScreen(
    'create-post', 'Create Post', 'form', 'supporting',
    'Create or compose a new post.',
    [
      makeZone('compose-form', 'form', 'primary', 'Post composition form', ['type text', 'add media'], ['functional text input']),
      makeZone('media-picker', 'primary_action', 'primary', 'Media picker for post', ['pick media'], ['functional media picker']),
      makeZone('post-settings', 'secondary_feature', 'secondary', 'Post visibility and settings', ['set visibility'], ['product-specific options']),
    ],
    '/create',
  );

  return {
    screens: [feedHomeScreen, discoverScreen, profileScreen, messagesScreen, createPostScreen],
    firstScreenId: 'feed-home',
    globalLayoutRules: [
      'Feed/Home must feel like a living social product, not a blank list.',
      'Use bottom tab navigation for primary screen transitions.',
      'Content feed must display real post-like content with interactions.',
      'Create action must be accessible from the home screen.',
    ],
    avoidPatterns: [
      'blank-feed: do not render an empty or placeholder-only content feed',
      'missing-create-action: do not make create/post action inaccessible from home',
      'no-social-context: do not produce a feed without identity or community context',
      'generic-list: do not reduce the feed to a generic scrollable list',
    ],
  };
}

function buildEcommerceTemplate(): {
  screens: ScreenCompositionEntry[];
  firstScreenId: string;
  globalLayoutRules: string[];
  avoidPatterns: string[];
} {
  const storefrontScreen = makeScreen(
    'storefront', 'Storefront', 'commerce', 'primary',
    'Editorial storefront with hero, category shortcuts, featured products, offer CTA, and navigation.',
    [
      makeZone('editorial-hero', 'hero', 'primary',
        'Editorial hero with product spotlight and media — must be visually distinctive',
        ['view hero', 'tap hero CTA'],
        ['product-specific editorial hero, not generic banner']),
      makeZone('category-shortcuts', 'shortcut', 'primary',
        'Category quick-access tiles: rapid product discovery',
        ['tap category'],
        ['real product categories']),
      makeZone('featured-products', 'list', 'primary',
        'Featured/trending product cards with images and prices',
        ['tap product', 'add to cart'],
        ['real product-like content with prices and images']),
      makeZone('offer-cta', 'cta', 'secondary',
        'Special offer banner or promotional CTA',
        ['tap offer'],
        ['product-specific offer, not generic text']),
      makeZone('bottom-nav', 'navigation', 'primary',
        'Bottom tab navigation',
        ['tap tab'],
        ['match skeleton BOTTOM_TABS config']),
    ],
    '/',
    ['browse products', 'tap product', 'add to cart'],
    ['product catalog', 'cart state', 'user identity'],
    ['real product-like items', 'prices', 'images'],
  );

  const productDetailScreen = makeScreen(
    'product-detail', 'Product Detail', 'detail', 'secondary',
    'Full product detail view.',
    [
      makeZone('product-hero', 'hero', 'primary', 'Product image and name hero', ['view image', 'zoom'], ['real product visual']),
      makeZone('product-info', 'secondary_feature', 'primary', 'Product info, description, price', ['read'], ['real product details and pricing']),
      makeZone('add-to-cart', 'primary_action', 'primary', 'Add to cart CTA', ['tap add to cart', 'select options'], ['functional add-to-cart']),
      makeZone('related-products', 'list', 'secondary', 'Related product recommendations', ['tap related'], ['real related items']),
    ],
    '/product/:id',
  );

  const cartScreen = makeScreen(
    'cart', 'Cart', 'other', 'secondary',
    'Shopping cart and order summary.',
    [
      makeZone('cart-items', 'list', 'primary', 'Cart item list with quantities', ['update quantity', 'remove item'], ['real cart items']),
      makeZone('order-summary', 'insight', 'primary', 'Order summary with totals', ['view total'], ['real price totals']),
      makeZone('checkout-cta', 'cta', 'primary', 'Proceed to checkout CTA', ['tap checkout'], ['functional checkout flow']),
    ],
    '/cart',
  );

  const checkoutFavoritesScreen = makeScreen(
    'checkout-favorites', 'Checkout / Favorites', 'form', 'secondary',
    'Checkout flow and favorites list.',
    [
      makeZone('form-steps', 'form', 'primary', 'Checkout form steps', ['fill form', 'proceed'], ['functional checkout form']),
      makeZone('payment-area', 'form', 'primary', 'Payment info area', ['enter payment'], ['secure payment form']),
      makeZone('favorites-list', 'list', 'secondary', 'Saved favorites list', ['view favorites', 'move to cart'], ['real favorites items']),
    ],
    '/checkout',
  );

  const profileOrdersScreen = makeScreen(
    'profile-orders', 'Profile / Orders', 'profile', 'supporting',
    'User profile and order history.',
    [
      makeZone('profile-header', 'status', 'primary', 'User profile header', ['view profile', 'edit'], ['real user info']),
      makeZone('order-history', 'list', 'primary', 'Past order list', ['view order', 'reorder'], ['real order-like history items']),
      makeZone('settings-access', 'secondary_feature', 'secondary', 'Settings and preferences access', ['tap setting'], ['product-specific settings']),
    ],
    '/profile',
  );

  return {
    screens: [storefrontScreen, productDetailScreen, cartScreen, checkoutFavoritesScreen, profileOrdersScreen],
    firstScreenId: 'storefront',
    globalLayoutRules: [
      'Storefront hero must use generated media or product imagery — not gray placeholders.',
      'Product cards must show real product-like content with prices and images.',
      'Add-to-cart and checkout flows must be functional and not decorative.',
      'Use premium commerce components where available.',
    ],
    avoidPatterns: [
      'placeholder-product-images: do not use gray boxes for product images',
      'non-functional-cart: do not make cart or checkout decorative',
      'flat-product-list: do not reduce storefront to a flat list with no editorial identity',
      'missing-pricing: product cards must show price-like content',
    ],
  };
}

function buildProductivityToolTemplate(): {
  screens: ScreenCompositionEntry[];
  firstScreenId: string;
  globalLayoutRules: string[];
  avoidPatterns: string[];
} {
  const base = buildSaasDashboardTemplate();
  // Replace screens with productivity-tool naming
  const workspaceScreen: ScreenCompositionEntry = {
    ...base.screens[0],
    id: 'workspace',
    title: 'Workspace',
    routeHint: '/',
  };
  const projectsScreen: ScreenCompositionEntry = { ...base.screens[1] };
  const tasksScreen: ScreenCompositionEntry = {
    ...base.screens[2],
    id: 'tasks',
    title: 'Tasks',
    routeHint: '/tasks',
  };
  const settingsScreen: ScreenCompositionEntry = { ...base.screens[3] };

  return {
    screens: [workspaceScreen, projectsScreen, tasksScreen, settingsScreen],
    firstScreenId: 'workspace',
    globalLayoutRules: base.globalLayoutRules,
    avoidPatterns: base.avoidPatterns,
  };
}

function buildB2bOperationsWorkspaceTemplate(): {
  screens: ScreenCompositionEntry[];
  firstScreenId: string;
  globalLayoutRules: string[];
  avoidPatterns: string[];
} {
  const dashboardScreen = makeScreen(
    'dashboard', 'Dashboard', 'dashboard', 'primary',
    'Operations overview: sidebar shell, KPI cards, workflow queue, and team activity.',
    [
      makeZone('sidebar-nav', 'navigation', 'primary',
        'Sidebar navigation with workspace sections and user identity',
        ['navigate sections'],
        ['product-specific nav labels']),
      makeZone('kpi-cards', 'insight', 'primary',
        'KPI card strip: key business metrics at a glance',
        ['view metric', 'click for detail'],
        ['real operations metrics']),
      makeZone('work-queue', 'table', 'primary',
        'Primary records/work queue table',
        ['click row', 'create record', 'filter'],
        ['real records, not placeholder rows']),
      makeZone('activity-feed', 'feed', 'secondary',
        'Team activity stream',
        ['scroll feed'],
        ['real activity entries']),
    ],
    '/',
    ['create record', 'filter queue', 'navigate sections'],
    ['workspace data', 'user identity'],
    ['real records', 'meaningful KPI values'],
  );

  const recordsScreen = makeScreen(
    'records', 'Records', 'other', 'secondary',
    'Full record table view with filters and detail access.',
    [
      makeZone('records-table', 'table', 'primary', 'Full sortable/filterable record table', ['click row', 'sort', 'filter'], ['real record data']),
      makeZone('record-actions', 'primary_action', 'primary', 'Bulk and per-row action bar', ['select', 'bulk action'], ['functional actions']),
      makeZone('records-filters', 'shortcut', 'secondary', 'Filter and search controls', ['apply filter'], ['meaningful filter options']),
    ],
    '/records',
  );

  const recordDetailScreen = makeScreen(
    'record-detail', 'Record Detail', 'detail', 'secondary',
    'Individual record detail view with edit actions.',
    [
      makeZone('record-header', 'hero', 'primary', 'Record header with key fields', ['view header'], ['real field values']),
      makeZone('record-fields', 'secondary_feature', 'primary', 'Full record field set', ['edit field', 'save'], ['real field content']),
      makeZone('record-actions', 'primary_action', 'primary', 'Record action buttons', ['tap action'], ['functional actions']),
      makeZone('record-activity', 'feed', 'secondary', 'Record-level activity log', ['view history'], ['real activity']),
    ],
    '/records/:id',
  );

  const workflowScreen = makeScreen(
    'workflow', 'Workflow', 'other', 'secondary',
    'Workflow and process management view.',
    [
      makeZone('workflow-board', 'table', 'primary', 'Kanban or workflow stage board', ['move item', 'view stage'], ['real workflow stages']),
      makeZone('workflow-actions', 'primary_action', 'secondary', 'Add/edit workflow steps', ['add step'], ['product-specific workflow']),
    ],
    '/workflow',
  );

  const settingsScreen = makeScreen(
    'settings', 'Settings', 'settings', 'supporting',
    'Workspace and team settings.',
    [
      makeZone('settings-nav', 'navigation', 'primary', 'Settings category navigation', ['navigate'], ['real settings categories']),
      makeZone('settings-form', 'form', 'primary', 'Settings form fields', ['update', 'save'], ['product-specific settings']),
    ],
    '/settings',
  );

  return {
    screens: [dashboardScreen, recordsScreen, recordDetailScreen, workflowScreen, settingsScreen],
    firstScreenId: 'dashboard',
    globalLayoutRules: [
      'Use sidebar navigation; do NOT use bottom-tabs.',
      'Dashboard KPI cards must show real operations metrics.',
      'Records table must be functional with sort and filter controls.',
      'Keep sidebar contextual — nav labels match the domain.',
    ],
    avoidPatterns: [
      'bottom-tabs-in-sidebar-app: do not use bottom-tabs for a sidebar B2B app',
      'placeholder-kpis: KPI cards must show real-looking values',
      'empty-record-table: record table must have meaningful columns and rows',
    ],
  };
}

function buildMarketplacePlatformTemplate(): {
  screens: ScreenCompositionEntry[];
  firstScreenId: string;
  globalLayoutRules: string[];
  avoidPatterns: string[];
} {
  const homeScreen = makeScreen(
    'home', 'Home', 'home', 'primary',
    'Marketplace home: featured listings, category shortcuts, and bottom tab navigation.',
    [
      makeZone('search-bar', 'status', 'primary',
        'Search bar and filter entry point',
        ['search listings', 'open filters'],
        ['prominent search, not decorative']),
      makeZone('category-shortcuts', 'shortcut', 'primary',
        'Category quick-access tiles',
        ['tap category'],
        ['real marketplace categories']),
      makeZone('featured-listings', 'list', 'primary',
        'Featured or trending listing cards',
        ['tap listing'],
        ['real listing-like content with images and prices']),
      makeZone('bottom-nav', 'navigation', 'primary',
        'Bottom tab navigation',
        ['tap tab'],
        ['match skeleton BOTTOM_TABS config']),
    ],
    '/',
    ['search', 'browse listings', 'tap listing'],
    ['listing catalog', 'user session'],
    ['real listing-like items', 'prices', 'images'],
  );

  const listingDetailScreen = makeScreen(
    'listing', 'Listing Detail', 'detail', 'secondary',
    'Full listing detail with seller info and contact.',
    [
      makeZone('listing-images', 'hero', 'primary', 'Listing image gallery', ['swipe images'], ['real listing images']),
      makeZone('listing-info', 'secondary_feature', 'primary', 'Listing details, description, price', ['read'], ['real listing content']),
      makeZone('seller-card', 'status', 'primary', 'Seller identity card with rating', ['view seller', 'contact'], ['real seller info']),
      makeZone('contact-cta', 'cta', 'primary', 'Contact seller or buy CTA', ['tap CTA'], ['functional action']),
    ],
    '/listing/:id',
  );

  const sellerDashboardScreen = makeScreen(
    'seller-dashboard', 'Seller Dashboard', 'dashboard', 'secondary',
    'Seller management: my listings, messages, and performance metrics.',
    [
      makeZone('seller-metrics', 'insight', 'primary', 'Seller KPIs: views, messages, sales', ['view metrics'], ['real seller metrics']),
      makeZone('my-listings', 'list', 'primary', 'My active and draft listings', ['edit listing', 'create new'], ['real listing items']),
      makeZone('seller-actions', 'primary_action', 'secondary', 'Create listing CTA and quick actions', ['create listing'], ['functional actions']),
    ],
    '/seller',
  );

  const messagesScreen = makeScreen(
    'messages', 'Messages', 'other', 'secondary',
    'Buyer-seller messaging threads.',
    [
      makeZone('thread-list', 'list', 'primary', 'Message thread list with previews', ['tap thread'], ['real conversation threads']),
      makeZone('thread-detail', 'feed', 'primary', 'Active message thread', ['send message', 'view history'], ['real message content']),
    ],
    '/messages',
  );

  return {
    screens: [homeScreen, listingDetailScreen, sellerDashboardScreen, messagesScreen],
    firstScreenId: 'home',
    globalLayoutRules: [
      'Use bottom-tabs for primary navigation.',
      'Home features editorial listing discovery, not just a flat list.',
      'Listing cards must show images and price-like content.',
      'Messaging must feel like a real chat thread, not a placeholder.',
    ],
    avoidPatterns: [
      'flat-listing-wall: home must not be a featureless list of listings',
      'no-seller-context: listing detail must show real seller info',
      'placeholder-messages: message threads must contain real-looking content',
    ],
  };
}

function buildCreatorEditorWorkspaceTemplate(): {
  screens: ScreenCompositionEntry[];
  firstScreenId: string;
  globalLayoutRules: string[];
  avoidPatterns: string[];
} {
  const homeScreen = makeScreen(
    'home', 'Projects', 'home', 'primary',
    'Project list with recent work and quick-start options.',
    [
      makeZone('sidebar-nav', 'navigation', 'primary',
        'Sidebar with workspace navigation',
        ['navigate sections'],
        ['product-specific nav items']),
      makeZone('recent-projects', 'list', 'primary',
        'Recent project card grid with thumbnails',
        ['open project', 'create new'],
        ['real project thumbnails and titles']),
      makeZone('quick-start', 'shortcut', 'primary',
        'Quick-start template shortcuts',
        ['pick template'],
        ['domain-specific templates']),
      makeZone('usage-stats', 'insight', 'secondary',
        'Usage or storage stats',
        ['view usage'],
        ['real-looking usage data']),
    ],
    '/',
    ['open project', 'create project'],
    ['project list', 'user identity'],
    ['real project-like content'],
  );

  const editorScreen = makeScreen(
    'editor', 'Editor', 'other', 'primary',
    'Canvas editor screen with tools, properties panel, and asset library.',
    [
      makeZone('toolbar', 'shortcut', 'primary',
        'Tool selection toolbar',
        ['select tool', 'undo', 'redo'],
        ['functional tool options']),
      makeZone('canvas-area', 'primary_action', 'primary',
        'Main editor canvas',
        ['draw', 'place element', 'interact'],
        ['functional editing surface']),
      makeZone('properties-panel', 'secondary_feature', 'primary',
        'Properties and style panel',
        ['adjust property', 'apply style'],
        ['real property controls']),
      makeZone('asset-library', 'list', 'secondary',
        'Asset and component library panel',
        ['drag asset', 'search assets'],
        ['domain-specific assets']),
    ],
    '/editor/:projectId',
    ['edit canvas', 'adjust properties', 'save work'],
    ['current project', 'asset library'],
    ['functional editor controls'],
  );

  return {
    screens: [homeScreen, editorScreen],
    firstScreenId: 'home',
    globalLayoutRules: [
      'Use sidebar navigation; do NOT use bottom-tabs.',
      'Editor screen must occupy full viewport with no bottom-tabs overlay.',
      'Canvas area is the central focus — tools and panels are adjacent.',
      'Project list uses card grid with real thumbnails.',
    ],
    avoidPatterns: [
      'bottom-tabs-in-sidebar-app: do not use bottom-tabs for a creator workspace',
      'placeholder-canvas: canvas must be a functional editor surface',
      'empty-asset-panel: asset library must contain domain-specific items',
    ],
  };
}

function buildDatingMatchingTemplate(): {
  screens: ScreenCompositionEntry[];
  firstScreenId: string;
  globalLayoutRules: string[];
  avoidPatterns: string[];
} {
  const onboardingScreen = makeScreen(
    'onboarding', 'Onboarding', 'form', 'supporting',
    'Profile setup and preference onboarding flow.',
    [
      makeZone('onboarding-progress', 'progress', 'primary', 'Onboarding step indicator', ['view steps'], ['clear step progress']),
      makeZone('onboarding-form', 'form', 'primary', 'Profile and preference form steps', ['fill fields', 'proceed'], ['real preference fields']),
      makeZone('onboarding-cta', 'cta', 'primary', 'Next/finish CTA', ['tap next'], ['clear progression action']),
    ],
    '/onboarding',
  );

  const discoverScreen = makeScreen(
    'discover', 'Discover', 'home', 'primary',
    'Swipe card deck for discovering matches.',
    [
      makeZone('swipe-deck', 'primary_action', 'primary',
        'Profile card swipe deck',
        ['swipe left', 'swipe right', 'super like'],
        ['real-looking profile cards with photos and bio']),
      makeZone('match-actions', 'shortcut', 'primary',
        'Like, dislike, and super-like action buttons',
        ['tap action'],
        ['functional swipe actions']),
      makeZone('bottom-nav', 'navigation', 'primary',
        'Bottom tab navigation',
        ['tap tab'],
        ['match skeleton BOTTOM_TABS config']),
    ],
    '/discover',
    ['swipe', 'view profile', 'like'],
    ['profile cards', 'match state'],
    ['real profile-like content with photos and bios'],
  );

  const matchesScreen = makeScreen(
    'matches', 'Matches', 'feed', 'secondary',
    'Matched profiles list and conversation starters.',
    [
      makeZone('new-matches', 'list', 'primary', 'New matches row with avatar circles', ['tap match'], ['real profile photos']),
      makeZone('message-threads', 'list', 'primary', 'Recent message thread list', ['tap thread'], ['real conversation previews']),
    ],
    '/matches',
  );

  const conversationScreen = makeScreen(
    'conversation', 'Conversation', 'other', 'secondary',
    'Full chat thread with a matched user.',
    [
      makeZone('chat-header', 'status', 'primary', 'Match profile header', ['view profile'], ['real match profile']),
      makeZone('message-feed', 'feed', 'primary', 'Message bubble feed', ['scroll'], ['real-looking messages']),
      makeZone('message-input', 'form', 'primary', 'Message compose input and send button', ['type message', 'send'], ['functional message input']),
    ],
    '/conversation/:matchId',
  );

  return {
    screens: [onboardingScreen, discoverScreen, matchesScreen, conversationScreen],
    firstScreenId: 'discover',
    globalLayoutRules: [
      'Use bottom-tabs for primary navigation.',
      'Discover screen centers on the swipe card deck — make it full-width and visually dominant.',
      'Profile cards must show photos and bios, not gray placeholders.',
      'Onboarding renders before the main shell and should not be part of bottom-tabs.',
    ],
    avoidPatterns: [
      'placeholder-profile-photos: profile cards must show real-looking photos',
      'non-functional-swipe: swipe actions must be interactive',
      'flat-matches-list: matches must show profile photos and message previews',
    ],
  };
}

function buildGamingCasinoTemplate(): {
  screens: ScreenCompositionEntry[];
  firstScreenId: string;
  globalLayoutRules: string[];
  avoidPatterns: string[];
} {
  const lobbyScreen = makeScreen(
    'lobby', 'Lobby', 'home', 'primary',
    'Game lobby: featured games, categories, and promo banners.',
    [
      makeZone('promo-banner', 'hero', 'primary',
        'Featured promotion or jackpot banner',
        ['view promo', 'tap CTA'],
        ['visually striking promo content']),
      makeZone('game-categories', 'shortcut', 'primary',
        'Game category quick-access tiles',
        ['tap category'],
        ['real game categories']),
      makeZone('featured-games', 'list', 'primary',
        'Featured game cards with thumbnails',
        ['tap game', 'scroll'],
        ['real game-like cards with thumbnails']),
      makeZone('bottom-nav', 'navigation', 'primary',
        'Bottom tab navigation',
        ['tap tab'],
        ['match skeleton BOTTOM_TABS config']),
    ],
    '/',
    ['browse games', 'tap game', 'tap promo'],
    ['game catalog', 'user balance', 'active promotions'],
    ['real game-like content', 'promo visuals'],
  );

  const gamesScreen = makeScreen(
    'games', 'Games', 'feed', 'secondary',
    'Full game browser with filters.',
    [
      makeZone('games-filter', 'shortcut', 'primary', 'Game filter and sort controls', ['filter by category', 'sort'], ['meaningful filter options']),
      makeZone('games-grid', 'list', 'primary', 'Full game card grid', ['tap game'], ['real game cards with thumbnails']),
    ],
    '/games',
  );

  const gameDetailScreen = makeScreen(
    'game-detail', 'Game Detail', 'detail', 'secondary',
    'Game info, rules, and play CTA.',
    [
      makeZone('game-hero', 'hero', 'primary', 'Game banner or thumbnail hero', ['view banner'], ['real game visual']),
      makeZone('game-info', 'secondary_feature', 'primary', 'Game info, rules, and stats', ['read'], ['real game details']),
      makeZone('play-cta', 'cta', 'primary', 'Play now CTA', ['tap play'], ['functional play button']),
    ],
    '/games/:id',
  );

  const promotionsScreen = makeScreen(
    'promotions', 'Promotions', 'other', 'secondary',
    'Active promotions and bonus offers.',
    [
      makeZone('promo-list', 'list', 'primary', 'Active promotion cards', ['tap promo', 'claim'], ['real promo content']),
      makeZone('promo-detail', 'secondary_feature', 'secondary', 'Promotion detail and terms', ['view terms'], ['real promo terms']),
    ],
    '/promotions',
  );

  const accountScreen = makeScreen(
    'account', 'Account', 'profile', 'supporting',
    'User account, balance, and settings.',
    [
      makeZone('account-header', 'status', 'primary', 'User balance and identity header', ['view balance'], ['real balance display']),
      makeZone('account-menu', 'secondary_feature', 'primary', 'Account menu: history, settings, support', ['tap menu item'], ['real account sections']),
    ],
    '/account',
  );

  return {
    screens: [lobbyScreen, gamesScreen, gameDetailScreen, promotionsScreen, accountScreen],
    firstScreenId: 'lobby',
    globalLayoutRules: [
      'Use bottom-tabs for primary navigation.',
      'Lobby must be visually rich with promo banners and game thumbnails.',
      'Game cards must show real-looking game thumbnails and titles.',
      'Balance must be visible in the Account screen header.',
    ],
    avoidPatterns: [
      'placeholder-game-cards: game cards must show real thumbnails',
      'empty-promos: promo section must contain real-looking offer content',
      'no-balance-display: user balance must be visible in Account',
    ],
  };
}

function buildGameInteractiveTemplate(): {
  screens: ScreenCompositionEntry[];
  firstScreenId: string;
  globalLayoutRules: string[];
  avoidPatterns: string[];
} {
  const homeScreen = makeScreen(
    'home', 'Home', 'home', 'primary',
    'Game home: continue, level select, leaderboard teaser.',
    [
      makeZone('game-hero', 'hero', 'primary',
        'Game logo/hero visual',
        ['view hero'],
        ['visually engaging game branding']),
      makeZone('play-cta', 'primary_action', 'primary',
        'Play / Continue game CTA',
        ['tap play', 'tap continue'],
        ['functional primary game action']),
      makeZone('level-teaser', 'status', 'primary',
        'Current level and progress teaser',
        ['view progress'],
        ['real level progress']),
      makeZone('leaderboard-teaser', 'insight', 'secondary',
        'Leaderboard top entries teaser',
        ['view leaderboard'],
        ['real score entries']),
      makeZone('bottom-nav', 'navigation', 'primary',
        'Bottom tab navigation',
        ['tap tab'],
        ['match skeleton BOTTOM_TABS config']),
    ],
    '/',
    ['play game', 'view levels', 'view leaderboard'],
    ['game progress', 'level state'],
    ['real game progress data'],
  );

  const levelSelectScreen = makeScreen(
    'level-select', 'Level Select', 'other', 'secondary',
    'Level map or grid showing unlocked and locked levels.',
    [
      makeZone('level-grid', 'list', 'primary', 'Level card grid with lock/unlock states', ['tap level', 'view stars'], ['real level data with star ratings']),
      makeZone('level-progress', 'progress', 'secondary', 'Overall completion progress', ['view progress'], ['real completion percentage']),
    ],
    '/levels',
  );

  const gameScreen = makeScreen(
    'game', 'Game', 'other', 'primary',
    'Full-screen game canvas — no bottom-tabs overlay.',
    [
      makeZone('game-canvas', 'primary_action', 'primary',
        'Full-screen game canvas',
        ['interact with game', 'play'],
        ['functional game mechanics']),
      makeZone('game-hud', 'status', 'primary',
        'HUD: score, lives, timer',
        ['view score'],
        ['real game state values']),
    ],
    '/game/:levelId',
  );

  const leaderboardScreen = makeScreen(
    'leaderboard', 'Leaderboard', 'other', 'secondary',
    'Global and friends leaderboard.',
    [
      makeZone('top-scores', 'list', 'primary', 'Top score rows with rank and player names', ['scroll'], ['real score-like entries']),
      makeZone('player-rank', 'insight', 'secondary', 'Current player rank highlight', ['view rank'], ['player\'s real rank']),
    ],
    '/leaderboard',
  );

  return {
    screens: [homeScreen, levelSelectScreen, gameScreen, leaderboardScreen],
    firstScreenId: 'home',
    globalLayoutRules: [
      'Use bottom-tabs for primary navigation (Home, Levels, Leaderboard).',
      'Game screen is full-screen; bottom-tabs must not overlay the game canvas.',
      'Level grid must show lock/unlock states clearly.',
      'HUD values must be real-looking, not zeros.',
    ],
    avoidPatterns: [
      'bottom-tabs-over-game-canvas: game screen must be full-screen with no bottom-tabs',
      'empty-level-grid: all levels must show meaningful state',
      'placeholder-leaderboard: leaderboard must contain real-looking score entries',
    ],
  };
}

function buildBookingServiceTemplate(): {
  screens: ScreenCompositionEntry[];
  firstScreenId: string;
  globalLayoutRules: string[];
  avoidPatterns: string[];
} {
  const homeScreen = makeScreen(
    'home', 'Home', 'home', 'primary',
    'Service discovery: featured services, categories, and search.',
    [
      makeZone('search-bar', 'status', 'primary',
        'Service search and location bar',
        ['search services'],
        ['prominent search input']),
      makeZone('service-categories', 'shortcut', 'primary',
        'Service category quick-access tiles',
        ['tap category'],
        ['real service categories']),
      makeZone('featured-services', 'list', 'primary',
        'Featured service provider cards',
        ['tap service', 'scroll'],
        ['real service providers with ratings and prices']),
      makeZone('bottom-nav', 'navigation', 'primary',
        'Bottom tab navigation',
        ['tap tab'],
        ['match skeleton BOTTOM_TABS config']),
    ],
    '/',
    ['search services', 'browse categories', 'tap service'],
    ['service catalog', 'user location', 'user session'],
    ['real service-like providers with ratings'],
  );

  const serviceDetailScreen = makeScreen(
    'service-detail', 'Service Detail', 'detail', 'secondary',
    'Service provider detail with availability and booking CTA.',
    [
      makeZone('provider-hero', 'hero', 'primary', 'Service provider profile and photos', ['view photos'], ['real provider images']),
      makeZone('service-info', 'secondary_feature', 'primary', 'Service description, price, rating', ['read'], ['real service details']),
      makeZone('availability-slot', 'shortcut', 'primary', 'Available time slot picker', ['select slot'], ['real-looking availability slots']),
      makeZone('book-cta', 'cta', 'primary', 'Book now CTA', ['tap book'], ['functional booking action']),
    ],
    '/service/:id',
  );

  const bookingFlowScreen = makeScreen(
    'booking-flow', 'Booking', 'form', 'secondary',
    'Step-by-step booking wizard: date, time, details, confirm.',
    [
      makeZone('booking-steps', 'progress', 'primary', 'Booking step indicator', ['view steps'], ['clear step progression']),
      makeZone('booking-form', 'form', 'primary', 'Booking form: date, time, notes', ['fill fields', 'proceed'], ['real booking fields']),
      makeZone('booking-summary', 'insight', 'primary', 'Booking summary and price', ['view summary'], ['real booking summary']),
      makeZone('confirm-cta', 'cta', 'primary', 'Confirm booking CTA', ['tap confirm'], ['functional confirm action']),
    ],
    '/book/:serviceId',
  );

  const myBookingsScreen = makeScreen(
    'my-bookings', 'My Bookings', 'other', 'secondary',
    'User\'s booking history and upcoming appointments.',
    [
      makeZone('upcoming-bookings', 'list', 'primary', 'Upcoming booking cards', ['tap booking', 'cancel'], ['real upcoming bookings']),
      makeZone('past-bookings', 'list', 'secondary', 'Past bookings and review prompts', ['view past', 'leave review'], ['real past bookings']),
    ],
    '/my-bookings',
  );

  return {
    screens: [homeScreen, serviceDetailScreen, bookingFlowScreen, myBookingsScreen],
    firstScreenId: 'home',
    globalLayoutRules: [
      'Use bottom-tabs for primary navigation.',
      'Service cards must show provider photos, ratings, and price-range.',
      'Booking flow is a multi-step wizard — show clear step progress.',
      'My Bookings must show real-looking upcoming appointments.',
    ],
    avoidPatterns: [
      'placeholder-provider-photos: service cards must show real-looking provider photos',
      'non-wizard-booking: booking flow must use multi-step wizard structure',
      'empty-my-bookings: booking history must contain real-looking items',
    ],
  };
}

function buildContentLearningTemplate(): {
  screens: ScreenCompositionEntry[];
  firstScreenId: string;
  globalLayoutRules: string[];
  avoidPatterns: string[];
} {
  const homeScreen = makeScreen(
    'home', 'Home', 'home', 'primary',
    'Learning home: continue learning, featured courses, and progress summary.',
    [
      makeZone('continue-learning', 'progress', 'primary',
        'Continue learning card with progress bar',
        ['tap continue', 'view progress'],
        ['real course in progress']),
      makeZone('featured-courses', 'list', 'primary',
        'Featured course cards',
        ['tap course'],
        ['real course titles and thumbnails']),
      makeZone('learning-stats', 'insight', 'secondary',
        'Learning streak and stats',
        ['view stats'],
        ['real-looking streak and completion data']),
      makeZone('bottom-nav', 'navigation', 'primary',
        'Bottom tab navigation',
        ['tap tab'],
        ['match skeleton BOTTOM_TABS config']),
    ],
    '/',
    ['continue course', 'browse courses', 'view progress'],
    ['enrolled courses', 'learning progress', 'user identity'],
    ['real course-like content with thumbnails and titles'],
  );

  const courseCatalogScreen = makeScreen(
    'course-catalog', 'Catalog', 'feed', 'secondary',
    'Full course catalog with category filters and search.',
    [
      makeZone('catalog-search', 'status', 'primary', 'Course search input', ['search courses'], ['real search']),
      makeZone('category-filters', 'shortcut', 'primary', 'Category filter chips', ['tap category'], ['real course categories']),
      makeZone('course-grid', 'list', 'primary', 'Course card grid', ['tap course', 'scroll'], ['real course cards with thumbnails and ratings']),
    ],
    '/catalog',
  );

  const courseDetailScreen = makeScreen(
    'course-detail', 'Course Detail', 'detail', 'secondary',
    'Course overview, curriculum, and enroll/continue CTA.',
    [
      makeZone('course-hero', 'hero', 'primary', 'Course banner image and title', ['view banner'], ['real course visual']),
      makeZone('course-info', 'secondary_feature', 'primary', 'Course description, rating, instructor', ['read'], ['real course details']),
      makeZone('curriculum-list', 'list', 'primary', 'Lesson list with duration and completion state', ['tap lesson'], ['real lesson titles and durations']),
      makeZone('enroll-cta', 'cta', 'primary', 'Enroll / Continue CTA', ['tap enroll or continue'], ['functional course action']),
    ],
    '/course/:id',
  );

  const lessonPlayerScreen = makeScreen(
    'lesson-player', 'Lesson', 'other', 'primary',
    'Full-screen lesson video/content player.',
    [
      makeZone('video-player', 'media', 'primary',
        'Lesson video or content player',
        ['play', 'pause', 'seek'],
        ['functional media player with real-looking content']),
      makeZone('lesson-notes', 'secondary_feature', 'secondary',
        'Lesson notes and transcript',
        ['view notes', 'scroll'],
        ['real lesson notes']),
      makeZone('lesson-nav', 'shortcut', 'secondary',
        'Next/previous lesson navigation',
        ['tap next', 'tap previous'],
        ['functional navigation between lessons']),
    ],
    '/lesson/:id',
  );

  return {
    screens: [homeScreen, courseCatalogScreen, courseDetailScreen, lessonPlayerScreen],
    firstScreenId: 'home',
    globalLayoutRules: [
      'Use bottom-tabs for primary navigation.',
      'Home must prominently show continue-learning progress.',
      'Course cards must include thumbnails, titles, and ratings.',
      'Lesson player should be full-screen without bottom-tabs overlay.',
    ],
    avoidPatterns: [
      'placeholder-course-thumbnails: course cards must show real-looking thumbnails',
      'empty-curriculum: course detail must list real lesson titles',
      'non-functional-player: lesson player must be a real media player',
    ],
  };
}

function buildFallbackTemplate(): {
  screens: ScreenCompositionEntry[];
  firstScreenId: string;
  globalLayoutRules: string[];
  avoidPatterns: string[];
} {
  return {
    screens: [
      makeScreen('main', 'Main', 'home', 'primary', 'Primary app screen.',
        [
          makeZone('main-content', 'primary_action', 'primary', 'Primary content area', ['interact'], ['real content']),
          makeZone('navigation', 'navigation', 'primary', 'Navigation', ['navigate'], ['clear navigation']),
        ],
        '/'),
      makeScreen('secondary', 'Secondary', 'other', 'secondary', 'Secondary screen.',
        [
          makeZone('content', 'secondary_feature', 'primary', 'Secondary content', ['view', 'interact'], ['relevant content']),
        ],
        '/secondary'),
    ],
    firstScreenId: 'main',
    globalLayoutRules: [
      'Ensure clear visual hierarchy on each screen.',
      'Use consistent navigation patterns throughout.',
    ],
    avoidPatterns: [
      'empty-screens: do not produce screens with no meaningful content',
      'lorem-ipsum-placeholders: do not use lorem ipsum or generic placeholder content',
    ],
  };
}

// ── Premium component assignment ──────────────────────────────────────────────

function assignPremiumComponents(
  screens: ScreenCompositionEntry[],
  firstScreenId: string,
  premiumComponentIds: string[],
): void {
  if (premiumComponentIds.length === 0) return;

  const firstScreen = screens.find(s => s.id === firstScreenId) ?? screens[0];
  if (!firstScreen) return;

  for (const premiumId of premiumComponentIds) {
    const idLower = premiumId.toLowerCase();

    let targetScreen: ScreenCompositionEntry = firstScreen;
    let targetZone: ScreenCompositionZone | undefined;

    if (/hero|banner|header|cover|splash/.test(idLower)) {
      // Assign to hero/status zone on first screen
      targetZone = firstScreen.zones.find(z => z.role === 'hero' || z.role === 'status');
    } else if (/progress|ring|chart|streak/.test(idLower)) {
      // Assign to progress/insight zone on first screen
      targetZone = firstScreen.zones.find(z => z.role === 'progress' || z.role === 'insight');
    } else if (/coach|ai|recommend/.test(idLower)) {
      // Assign to coach zone on first/appropriate screen
      targetZone = firstScreen.zones.find(z => z.role === 'coach');
      if (!targetZone) {
        // Try finding coach zone on any screen
        for (const screen of screens) {
          const coachZone = screen.zones.find(z => z.role === 'coach');
          if (coachZone) {
            targetScreen = screen;
            targetZone = coachZone;
            break;
          }
        }
      }
    } else if (/kpi|metric|stat|insight/.test(idLower)) {
      // Assign to kpi/insight zone
      targetZone = firstScreen.zones.find(z => z.role === 'insight' || z.role === 'status');
    } else if (/table|list|queue/.test(idLower)) {
      // Assign to table/list zone
      targetZone = firstScreen.zones.find(z => z.role === 'table' || z.role === 'list');
      if (!targetZone) {
        for (const screen of screens) {
          const found = screen.zones.find(z => z.role === 'table' || z.role === 'list');
          if (found) { targetScreen = screen; targetZone = found; break; }
        }
      }
    }

    // Fallback: first non-navigation zone on first screen
    if (!targetZone) {
      targetZone = firstScreen.zones.find(z => z.role !== 'navigation');
      targetScreen = firstScreen;
    }

    if (targetZone && !targetZone.suggestedComponents.includes(premiumId)) {
      targetZone.suggestedComponents.push(premiumId);
    }
    if (!targetScreen.premiumComponentTargets.includes(premiumId)) {
      targetScreen.premiumComponentTargets.push(premiumId);
    }
  }
}

// ── Media hint assignment ─────────────────────────────────────────────────────

function assignMediaHints(
  screens: ScreenCompositionEntry[],
  firstScreenId: string,
  mediaHints: MediaHint[],
): void {
  if (mediaHints.length === 0) return;

  const firstScreen = screens.find(s => s.id === firstScreenId) ?? screens[0];
  if (!firstScreen) return;

  for (const hint of mediaHints) {
    const kindLower = hint.kind.toLowerCase();
    const mediaTarget = hint.importPath ?? hint.id;

    let targetScreen: ScreenCompositionEntry = firstScreen;
    let targetZone: ScreenCompositionZone | undefined;

    if (/hero|splash|cover/.test(kindLower)) {
      targetZone = firstScreen.zones.find(z => z.role === 'hero' || z.role === 'media');
    } else if (/background|backdrop|ambient/.test(kindLower)) {
      targetZone = firstScreen.zones.find(z => z.role === 'media');
    } else if (/illustration|calm/.test(kindLower)) {
      // Coach or secondary zones — prefer first screen
      targetZone = firstScreen.zones.find(z => z.role === 'coach' || z.role === 'secondary_feature' || z.role === 'media');
    } else if (/data|wave|visualization|chart/.test(kindLower)) {
      // Insight/progress zones — prefer first screen
      targetZone = firstScreen.zones.find(z => z.role === 'insight' || z.role === 'progress');
    }

    // Fallback: media zone on first screen
    if (!targetZone) {
      targetZone = firstScreen.zones.find(z => z.role === 'media');
      if (!targetZone) {
        // Fallback to any zone on first screen
        targetZone = firstScreen.zones[0];
      }
      targetScreen = firstScreen;
    }

    if (targetZone && !targetZone.suggestedMedia.includes(mediaTarget)) {
      targetZone.suggestedMedia.push(mediaTarget);
    }
    if (!targetScreen.mediaTargets.includes(mediaTarget)) {
      targetScreen.mediaTargets.push(mediaTarget);
    }
  }
}

// ── Composition notes ─────────────────────────────────────────────────────────

function buildCompositionNotes(brief: string): string[] {
  const notes: string[] = [];
  const briefLower = brief.toLowerCase();

  if (/\b(ai|coach|assistant|recommendation|gpt|llm)\b/.test(briefLower)) {
    notes.push('AI/coach features should appear as a teaser on the home screen and a dedicated coach/assistant screen, not as a separate root page.');
  }

  if (/\b(analytics|report|chart|graph|metrics)\b/.test(briefLower)) {
    notes.push('Analytics are secondary — show summary widgets on the main dashboard and move detailed reports to a dedicated screen.');
  }

  if (/\b(onboarding|first.?time|setup)\b/.test(briefLower)) {
    notes.push('Onboarding flow should be a separate path that resolves back to the main screen, not replace the primary UI.');
  }

  const wordCount = brief.split(/\s+/).filter(w => w.length > 3).length;
  if (wordCount > 30) {
    notes.push('Complex feature set detected — keep quick-access actions and summaries on the home surface; move deep workflows to detail screens.');
  }

  return notes;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function buildScreenCompositionPlan(input: {
  brief: string;
  skeletonId: string;
  designCtx: DesignContext;
  premiumComponentIds: string[];
  mediaHints: MediaHint[];
  architectPlan?: unknown;
}): ScreenCompositionPlan {
  const { brief, skeletonId, designCtx, premiumComponentIds, mediaHints } = input;

  // Build skeleton template
  let template: {
    screens: ScreenCompositionEntry[];
    firstScreenId: string;
    globalLayoutRules: string[];
    avoidPatterns: string[];
  };

  switch (skeletonId) {
    case 'mobile-app':
      template = buildMobileAppTemplate(brief);
      break;
    case 'saas-dashboard':
      template = buildSaasDashboardTemplate();
      break;
    case 'landing-page':
      template = buildLandingPageTemplate(brief);
      break;
    case 'social-community':
      template = buildSocialCommunityTemplate();
      break;
    case 'ecommerce':
      template = buildEcommerceTemplate();
      break;
    case 'productivity-tool':
      template = buildProductivityToolTemplate();
      break;
    case 'b2b-operations-workspace':
      template = buildB2bOperationsWorkspaceTemplate();
      break;
    case 'marketplace-platform':
      template = buildMarketplacePlatformTemplate();
      break;
    case 'creator-editor-workspace':
      template = buildCreatorEditorWorkspaceTemplate();
      break;
    case 'dating-matching-app':
      template = buildDatingMatchingTemplate();
      break;
    case 'gaming-casino-app':
      template = buildGamingCasinoTemplate();
      break;
    case 'game-interactive-app':
      template = buildGameInteractiveTemplate();
      break;
    case 'booking-service-app':
      template = buildBookingServiceTemplate();
      break;
    case 'content-learning-app':
      template = buildContentLearningTemplate();
      break;
    default:
      template = buildFallbackTemplate();
  }

  const { screens, firstScreenId, globalLayoutRules, avoidPatterns } = template;

  // Assign premium components
  assignPremiumComponents(screens, firstScreenId, premiumComponentIds);

  // Assign media hints
  assignMediaHints(screens, firstScreenId, mediaHints);

  // Build composition notes
  const compositionNotes = buildCompositionNotes(brief);

  // Derive metadata
  const selectedRecipeId =
    designCtx.premiumComponentSelection.selectedRecipeId ?? undefined;
  const productType =
    designCtx.visualSelection.signals?.productDomain ?? skeletonId;

  return {
    productType,
    skeletonId,
    selectedRecipeId,
    firstScreenId,
    screens,
    globalLayoutRules,
    avoidPatterns,
    compositionNotes,
  };
}

// ── Prompt block builder ──────────────────────────────────────────────────────

export function buildCompositionPlanPromptBlock(plan: ScreenCompositionPlan): string {
  const lines: string[] = [];

  lines.push('SCREEN_COMPOSITION_PLAN:');
  lines.push(`firstScreenId: ${plan.firstScreenId}`);
  if (plan.productType) lines.push(`productType: ${plan.productType}`);
  lines.push(`skeletonId: ${plan.skeletonId}`);
  if (plan.selectedRecipeId) lines.push(`selectedRecipeId: ${plan.selectedRecipeId}`);
  lines.push('');

  lines.push('SCREENS:');
  for (const screen of plan.screens) {
    lines.push(`  - id: ${screen.id}`);
    lines.push(`    title: ${screen.title}`);
    if (screen.routeHint) lines.push(`    route: ${screen.routeHint}`);
    lines.push(`    role: ${screen.role}`);
    lines.push(`    priority: ${screen.priority}`);
    lines.push(`    layoutIntent: ${screen.layoutIntent}`);
    if (screen.premiumComponentTargets.length > 0) {
      lines.push(`    premiumComponentTargets: ${screen.premiumComponentTargets.join(', ')}`);
    }
    if (screen.mediaTargets.length > 0) {
      lines.push(`    mediaTargets: ${screen.mediaTargets.join(', ')}`);
    }
    if (screen.requiredInteractions.length > 0) {
      lines.push(`    requiredInteractions: ${screen.requiredInteractions.join(', ')}`);
    }
    if (screen.stateRequirements.length > 0) {
      lines.push(`    stateRequirements: ${screen.stateRequirements.join(', ')}`);
    }
    if (screen.contentRequirements.length > 0) {
      lines.push(`    contentRequirements: ${screen.contentRequirements.join(', ')}`);
    }
    lines.push('    ZONES:');
    for (const zone of screen.zones) {
      lines.push(`      - id: ${zone.id}  role: ${zone.role}  priority: ${zone.priority}`);
      lines.push(`        intent: ${zone.intent}`);
      if (zone.suggestedComponents.length > 0) {
        lines.push(`        suggestedComponents: ${zone.suggestedComponents.join(', ')}`);
      } else {
        lines.push('        suggestedComponents: (none)');
      }
      if (zone.suggestedMedia.length > 0) {
        lines.push(`        suggestedMedia: ${zone.suggestedMedia.join(', ')}`);
      }
      if (zone.interactions.length > 0) {
        lines.push(`        interactions: ${zone.interactions.join(', ')}`);
      }
      if (zone.contentRules.length > 0) {
        lines.push(`        contentRules: ${zone.contentRules.join(', ')}`);
      }
    }
    lines.push('');
  }

  lines.push('GLOBAL_LAYOUT_RULES:');
  for (const rule of plan.globalLayoutRules) {
    lines.push(`  - ${rule}`);
  }
  lines.push('');

  lines.push('AVOID_PATTERNS:');
  for (const pattern of plan.avoidPatterns) {
    lines.push(`  - ${pattern}`);
  }
  lines.push('');

  if (plan.compositionNotes.length > 0) {
    lines.push('COMPOSITION_NOTES:');
    for (const note of plan.compositionNotes) {
      lines.push(`  - ${note}`);
    }
    lines.push('');
  }

  const firstScreen = plan.screens.find(s => s.id === plan.firstScreenId);
  const firstScreenZoneCount = firstScreen?.zones.length ?? 0;
  lines.push('CODER_INSTRUCTIONS:');
  lines.push('- Follow this composition plan before inventing generic layouts.');
  lines.push(`- Treat the first screen (${plan.firstScreenId}) as a multi-zone product cockpit with ${firstScreenZoneCount} meaningful zones.`);
  lines.push('- Use premium components where the plan assigns them (premiumComponentTargets per screen, suggestedComponents per zone).');
  lines.push('- Use generated media assets where the plan assigns them (mediaTargets per screen, suggestedMedia per zone).');
  lines.push('- Build screens as product flows, not static mockups.');
  lines.push('- Do not split every small feature into a separate page.');
  lines.push('- Do not collapse a complex product surface into a single generic card list.');
  lines.push('- Do not leave primary actions decorative only.');
  lines.push('- Do not produce a generic admin dashboard or generic mobile card wall.');

  return lines.join('\n');
}

// ── Screen composition diagnostics (advisory-only) ────────────────────────────

/** Returned by evaluateScreenCompositionDiagnostics. Advisory — never blocks generation. */
export interface ScreenCompositionDiagnosticsResult {
  ok: boolean;
  compositionScore: number;
  warnings: string[];
  missingRoles: string[];
  detectedRoles: string[];
  suggestedImprovements: string[];
  telemetry: {
    skeleton_id: string;
    screen_count: number;
    detected_roles: string[];
    missing_roles: string[];
    warnings: string[];
    suggested_improvements: string[];
    composition_score: number;
    ok: boolean;
  };
}

const APP_LIKE_SKELETONS = new Set<string>([
  'mobile-app',
  'saas-dashboard',
  'social-community',
  'ecommerce',
  'productivity-tool',
  'b2b-operations-workspace',
  'marketplace-platform',
  'creator-editor-workspace',
  'dating-matching-app',
  'gaming-casino-app',
  'game-interactive-app',
  'booking-service-app',
  'content-learning-app',
]);

/**
 * Advisory-only screen composition diagnostics.
 *
 * Detects clear composition weaknesses (sparse layout, missing CTA, missing
 * product-specific content roles, dashboard without metrics, etc.) and returns
 * a structured result for logging and telemetry.
 *
 * Does NOT block generation, does NOT trigger runQualityRepair, does NOT alter
 * quality gate behavior.
 */
export function evaluateScreenCompositionDiagnostics(
  plan: ScreenCompositionPlan,
): ScreenCompositionDiagnosticsResult {
  const { skeletonId, screens } = plan;
  const warnings: string[] = [];
  const missingRoles: string[] = [];
  const suggestedImprovements: string[] = [];
  let compositionScore = 100;

  const allZoneRoles = screens.flatMap(s => s.zones.map(z => z.role));
  const allScreenRoles = screens.map(s => s.role);
  const allScreenIds = screens.map(s => s.id);
  const detectedRoles: string[] = [...new Set([...allZoneRoles, ...allScreenRoles])];

  const isAppLike = APP_LIKE_SKELETONS.has(skeletonId);
  const isMobile = skeletonId === 'mobile-app';
  const isDashboard = skeletonId === 'saas-dashboard' || skeletonId === 'b2b-operations-workspace';
  const isSocial = skeletonId === 'social-community';
  const isLanding = skeletonId === 'landing-page';

  // 1. Sparse composition — fewer than 3 screens for app-like products
  if (isAppLike && screens.length < 3) {
    warnings.push(
      `Sparse composition: only ${screens.length} screen(s) for skeleton "${skeletonId}"; expected ≥ 3 meaningful screens.`,
    );
    missingRoles.push('sufficient-screens');
    suggestedImprovements.push(
      'Add at least 3 screens covering entry, core workflow, and detail/progress views.',
    );
    compositionScore -= 20;
  }

  // 2. Missing primary hero/entry section
  const hasEntryScreen = isLanding
    ? allScreenIds.some(id => id.includes('hero'))
    : allScreenRoles.some(r => r === 'home' || r === 'dashboard') ||
      allScreenIds.some(id =>
        id.includes('home') ||
        id.includes('dashboard') ||
        id.includes('discover') ||
        id.includes('lobby'),
      );
  if (!hasEntryScreen) {
    warnings.push(`Missing primary entry/hero screen for skeleton "${skeletonId}".`);
    missingRoles.push('hero-entry-screen');
    suggestedImprovements.push(
      'Add a primary entry screen (home, dashboard, or hero section) as the product entry point.',
    );
    compositionScore -= 15;
  }

  // 3. Missing primary action/CTA
  const hasCta = allZoneRoles.some(r => r === 'primary_action' || r === 'cta');
  if (!hasCta) {
    warnings.push('Missing primary_action or cta zone across all screens.');
    missingRoles.push('primary-action-cta');
    suggestedImprovements.push('Add a primary_action or cta zone on the main entry screen.');
    compositionScore -= 15;
  }

  // 4. Missing product-specific content role
  const CONTENT_ROLES: ScreenZoneRole[] = [
    'feed', 'list', 'table', 'form', 'progress', 'insight', 'media',
  ];
  const hasContentRole = allZoneRoles.some(r => CONTENT_ROLES.includes(r));
  if (!hasContentRole && screens.length > 0) {
    warnings.push(
      'Missing product-specific content role (feed, list, table, form, progress, insight, media, or commerce) across all zones.',
    );
    missingRoles.push('product-specific-content');
    suggestedImprovements.push(
      'Include at least one specific content zone (feed, list, progress, table, etc.) instead of only generic zones.',
    );
    compositionScore -= 10;
  }

  // 5. Too many generic zones (> 50% 'other' or 'secondary_feature')
  const totalZones = allZoneRoles.length;
  if (totalZones > 0) {
    const genericCount = allZoneRoles.filter(r => r === 'other' || r === 'secondary_feature').length;
    if (genericCount / totalZones > 0.5) {
      warnings.push(
        `Generic zone overload: ${genericCount}/${totalZones} zones (${Math.round((genericCount / totalZones) * 100)}%) are 'other' or 'secondary_feature'.`,
      );
      missingRoles.push('specific-zone-roles');
      suggestedImprovements.push(
        "Replace generic zones with product-specific roles: feed, list, progress, insight, or cta.",
      );
      compositionScore -= 10;
    }
  }

  // 6. Dashboard without metrics/status/action sections
  if (isDashboard) {
    const firstScreen = screens.find(s => s.id === plan.firstScreenId) ?? screens[0];
    const firstZoneRoles = firstScreen?.zones.map(z => z.role) ?? [];
    if (!firstZoneRoles.some(r => r === 'status' || r === 'insight')) {
      warnings.push(`Dashboard skeleton "${skeletonId}" first screen is missing metrics/status zones.`);
      missingRoles.push('dashboard-metrics-status');
      suggestedImprovements.push(
        'Add status or insight zones to the dashboard entry screen for key metrics display.',
      );
      compositionScore -= 15;
    }
    if (
      !firstZoneRoles.some(r => r === 'primary_action' || r === 'cta' || r === 'list' || r === 'table')
    ) {
      warnings.push(`Dashboard skeleton "${skeletonId}" first screen is missing action/list/table zones.`);
      missingRoles.push('dashboard-action-list');
      suggestedImprovements.push(
        'Add primary_action, list, or table zones to the dashboard entry screen for workflow access.',
      );
      compositionScore -= 10;
    }
  }

  // 7. Mobile app without home/progress/action/detail-like screen roles
  if (isMobile) {
    const hasHome =
      allScreenRoles.some(r => r === 'home') ||
      allScreenIds.some(id => id.includes('home') || id.includes('today'));
    if (!hasHome) {
      warnings.push('Mobile app is missing a home/today entry screen.');
      missingRoles.push('mobile-home-screen');
      suggestedImprovements.push(
        'Add a home/today screen as the primary entry point for the mobile app.',
      );
      compositionScore -= 15;
    }
    const hasProgressOrInsight =
      allScreenRoles.some(r => r === 'progress') ||
      allScreenIds.some(id => id.includes('progress')) ||
      allZoneRoles.some(r => r === 'progress' || r === 'insight');
    if (!hasProgressOrInsight) {
      warnings.push('Mobile app is missing progress or insight screen/zone.');
      missingRoles.push('mobile-progress-insight');
      suggestedImprovements.push(
        'Add a progress screen or progress/insight zone to track user state.',
      );
      compositionScore -= 10;
    }
    const hasDetail =
      allScreenRoles.some(r => r === 'detail') ||
      allScreenIds.some(id => id.includes('detail'));
    if (!hasDetail) {
      warnings.push('Mobile app is missing a detail screen for item inspection.');
      missingRoles.push('mobile-detail-screen');
      suggestedImprovements.push(
        'Add a detail screen for viewing individual items in depth.',
      );
      compositionScore -= 10;
    }
    const hasActionZone = allZoneRoles.some(r => r === 'primary_action');
    if (!hasActionZone) {
      warnings.push('Mobile app is missing a primary_action zone on any screen.');
      missingRoles.push('mobile-primary-action-zone');
      suggestedImprovements.push(
        'Add a primary_action zone on the home screen for the main user action.',
      );
      compositionScore -= 10;
    }
  }

  // 8. Social/feed app without feed/profile/community-like roles
  if (isSocial) {
    const hasFeed =
      allZoneRoles.some(r => r === 'feed') ||
      allScreenIds.some(id => id.includes('feed'));
    if (!hasFeed) {
      warnings.push('Social/community app is missing a feed zone or feed screen.');
      missingRoles.push('social-feed');
      suggestedImprovements.push(
        'Add a feed zone or feed screen as the core content surface.',
      );
      compositionScore -= 15;
    }
    const hasProfile =
      allScreenRoles.some(r => r === 'profile') ||
      allScreenIds.some(id => id.includes('profile'));
    if (!hasProfile) {
      warnings.push('Social/community app is missing a profile screen.');
      missingRoles.push('social-profile');
      suggestedImprovements.push(
        'Add a profile screen for user identity and social presence.',
      );
      compositionScore -= 10;
    }
    const hasCommunityOrDiscover = allScreenIds.some(id =>
      id.includes('community') ||
      id.includes('groups') ||
      id.includes('explore') ||
      id.includes('discover'),
    );
    if (!hasCommunityOrDiscover) {
      warnings.push('Social/community app is missing community/explore/discover screens.');
      missingRoles.push('social-community-discovery');
      suggestedImprovements.push(
        'Add a community, explore, or discover screen for social content discovery.',
      );
      compositionScore -= 10;
    }
  }

  compositionScore = Math.max(0, Math.min(100, compositionScore));
  const ok = warnings.length === 0;

  return {
    ok,
    compositionScore,
    warnings,
    missingRoles,
    detectedRoles,
    suggestedImprovements,
    telemetry: {
      skeleton_id: skeletonId,
      screen_count: screens.length,
      detected_roles: detectedRoles,
      missing_roles: missingRoles,
      warnings,
      suggested_improvements: suggestedImprovements,
      composition_score: compositionScore,
      ok,
    },
  };
}

// ── Telemetry serializer ──────────────────────────────────────────────────────

export function serializeScreenCompositionPlan(plan: ScreenCompositionPlan): ScreenCompositionPlanTelemetry {
  return {
    product_type: plan.productType,
    skeleton_id: plan.skeletonId,
    selected_recipe_id: plan.selectedRecipeId,
    first_screen_id: plan.firstScreenId,
    screen_count: plan.screens.length,
    screens: plan.screens.map(screen => ({
      id: screen.id,
      title: screen.title,
      route_hint: screen.routeHint,
      role: screen.role,
      priority: screen.priority,
      layout_intent: screen.layoutIntent,
      zones: screen.zones.map(z => ({
        id: z.id,
        role: z.role,
        priority: z.priority,
        intent: z.intent,
        suggested_components: z.suggestedComponents,
        suggested_media: z.suggestedMedia,
        interactions: z.interactions,
        content_rules: z.contentRules,
      })),
      premium_component_targets: screen.premiumComponentTargets,
      media_targets: screen.mediaTargets,
      required_interactions: screen.requiredInteractions,
      state_requirements: screen.stateRequirements,
      content_requirements: screen.contentRequirements,
    })),
    global_layout_rules: plan.globalLayoutRules,
    avoid_patterns: plan.avoidPatterns,
    composition_notes: plan.compositionNotes,
  };
}
