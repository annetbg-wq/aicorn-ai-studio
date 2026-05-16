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
