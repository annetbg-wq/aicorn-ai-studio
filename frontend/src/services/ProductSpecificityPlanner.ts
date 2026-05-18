import type { MediaHint } from './DesignContract';
import type { FunctionalDataEntity, FunctionalFlowPlan } from './FunctionalFlowPlanner';
import type { ScreenCompositionEntry, ScreenCompositionPlan } from './ScreenCompositionPlanner';
import type { SkeletonIntegrationPlan } from './SkeletonIntegrationPlanner';

type KnownSkeletonId =
  | 'mobile-app'
  | 'saas-dashboard'
  | 'landing-page'
  | 'social-community'
  | 'ecommerce'
  | 'productivity-tool'
  | 'b2b-operations-workspace'
  | 'marketplace-platform'
  | 'creator-editor-workspace'
  | 'dating-matching-app'
  | 'gaming-casino-app'
  | 'game-interactive-app'
  | 'booking-service-app'
  | 'content-learning-app';

type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'array';

type ScreenRef = Pick<ScreenCompositionEntry, 'id' | 'title' | 'routeHint' | 'role'>;

type DomainEntitySeed = {
  id: string;
  label: string;
  description: string;
  fields?: DomainEntityPlan['fields'];
  sampleNames: string[];
};

type ScreenRule = {
  matchTerms: string[];
  concreteTitleSuggestions: string[];
  requiredEntities: string[];
  requiredMetrics: string[];
  requiredActions: string[];
  copyHints: string[];
  avoidOnThisScreen: string[];
};

type DomainProfile = {
  inferredDomain: string;
  targetUserRole: string;
  primaryJobToBeDone: string;
  preferredTerms: string[];
  toneNotes: string[];
  notes: string[];
};

type SkeletonSpecificityTemplate = {
  domainEntities: DomainEntitySeed[];
  productMetrics: ProductMetricPlan[];
  productStatuses: ProductStatusPlan[];
  productActions: ProductActionPlan[];
  vocabulary: ProductVocabularyPlan;
  sampleDataRules: string[];
  copywritingRules: string[];
  forbiddenGenericPatterns: string[];
  specificityNotes: string[];
  screenRules: ScreenRule[];
};

export type ProductSpecificityPlan = {
  productType?: string;
  skeletonId: string;

  inferredDomain: string;
  targetUserRole: string;
  primaryJobToBeDone: string;

  domainEntities: DomainEntityPlan[];
  productMetrics: ProductMetricPlan[];
  productStatuses: ProductStatusPlan[];
  productActions: ProductActionPlan[];

  vocabulary: ProductVocabularyPlan;
  screenSpecificContent: ScreenSpecificContentPlan[];

  sampleDataRules: string[];
  copywritingRules: string[];
  forbiddenGenericPatterns: string[];
  specificityNotes: string[];
};

export type DomainEntityPlan = {
  id: string;
  label: string;
  description: string;
  fields: Array<{
    name: string;
    type: FieldType;
    example: string;
  }>;
  sampleNames: string[];
};

export type ProductMetricPlan = {
  id: string;
  label: string;
  meaning: string;
  exampleValue: string;
  shouldAppearOnScreens: string[];
};

export type ProductStatusPlan = {
  id: string;
  label: string;
  meaning: string;
  exampleUsage: string;
};

export type ProductActionPlan = {
  id: string;
  label: string;
  userIntent: string;
  expectedVisibleResult: string;
  shouldAppearOnScreens: string[];
};

export type ProductVocabularyPlan = {
  preferredTerms: string[];
  avoidTerms: string[];
  toneNotes: string[];
};

export type ScreenSpecificContentPlan = {
  screenId: string;
  concreteTitleSuggestions: string[];
  requiredEntities: string[];
  requiredMetrics: string[];
  requiredActions: string[];
  copyHints: string[];
  avoidOnThisScreen: string[];
};

export interface ProductSpecificityPlanTelemetry {
  product_type?: string;
  skeleton_id: string;
  inferred_domain: string;
  target_user_role: string;
  primary_job_to_be_done: string;
  domain_entities: Array<{
    id: string;
    label: string;
    description: string;
    fields: Array<{
      name: string;
      type: FieldType;
      example: string;
    }>;
    sample_names: string[];
  }>;
  product_metrics: Array<{
    id: string;
    label: string;
    meaning: string;
    example_value: string;
    should_appear_on_screens: string[];
  }>;
  product_statuses: Array<{
    id: string;
    label: string;
    meaning: string;
    example_usage: string;
  }>;
  product_actions: Array<{
    id: string;
    label: string;
    user_intent: string;
    expected_visible_result: string;
    should_appear_on_screens: string[];
  }>;
  vocabulary: {
    preferred_terms: string[];
    avoid_terms: string[];
    tone_notes: string[];
  };
  screen_specific_content: Array<{
    screen_id: string;
    concrete_title_suggestions: string[];
    required_entities: string[];
    required_metrics: string[];
    required_actions: string[];
    copy_hints: string[];
    avoid_on_this_screen: string[];
  }>;
  sample_data_rules: string[];
  copywriting_rules: string[];
  forbidden_generic_patterns: string[];
  specificity_notes: string[];
}

export type ProductSpecificityDiagnostics = {
  specificityDiagnosticsChecked: boolean;

  genericPlaceholderFindings: string[];
  vagueCopyFindings: string[];
  emptyMetricFindings: string[];
  domainEntitySignals: string[];
  productActionSignals: string[];
  productMetricSignals: string[];
  screenSpecificityWarnings: string[];

  domainEntitySignalCount: number;
  productActionSignalCount: number;
  productMetricSignalCount: number;

  specificityScore: number;
  suggestedNextAction: 'none' | 'improve_prompt' | 'improve_specificity_plan' | 'add_repair_later';
};

export interface ProductSpecificityDiagnosticsTelemetry {
  specificity_diagnostics_checked: boolean;
  generic_placeholder_findings: string[];
  vague_copy_findings: string[];
  empty_metric_findings: string[];
  domain_entity_signals: string[];
  product_action_signals: string[];
  product_metric_signals: string[];
  screen_specificity_warnings: string[];
  domain_entity_signal_count: number;
  product_action_signal_count: number;
  product_metric_signal_count: number;
  specificity_score: number;
  suggested_next_action: 'none' | 'improve_prompt' | 'improve_specificity_plan' | 'add_repair_later';
}

const GLOBAL_FORBIDDEN_GENERIC_PATTERNS = [
  'Feature 1',
  'Feature 2',
  'Feature 3',
  'Lorem',
  'Lorem ipsum',
  'AppName',
  'PRODUCT',
  'Untitled',
  'Coming soon',
  'Generic dashboard',
  'Generic app',
  'Analytics',
  'Insights',
  'Overview',
  'Users',
  'Revenue',
  'Growth',
  'Tasks',
  'Projects',
  'Reports',
  'Activity',
  'Dashboard',
  'Welcome back',
  'Track everything',
  'All-in-one',
  'Boost productivity',
  'Powerful platform',
  'Seamless experience',
  'Manage everything',
  'Smart insights',
] as const;

const PLACEHOLDER_PATTERNS: Array<{ label: string; rx: RegExp }> = [
  { label: 'Lorem', rx: /\blorem\b/i },
  { label: 'Lorem ipsum', rx: /\blorem ipsum\b/i },
  { label: 'Feature 1', rx: /\bFeature 1\b/i },
  { label: 'Feature 2', rx: /\bFeature 2\b/i },
  { label: 'Feature 3', rx: /\bFeature 3\b/i },
  { label: 'AppName', rx: /\bAppName\b/i },
  { label: 'PRODUCT', rx: /\bPRODUCT\b/i },
  { label: 'Untitled', rx: /\bUntitled\b/i },
  { label: 'Coming soon', rx: /\bComing soon\b/i },
  { label: 'Generic dashboard', rx: /\bgeneric dashboard\b/i },
  { label: 'Generic app', rx: /\bgeneric app\b/i },
] as const;

const VAGUE_COPY_PATTERNS: Array<{ label: string; rx: RegExp }> = [
  { label: 'Analytics', rx: /(?:title|label|heading|children)\s*[:=]\s*["'`]\s*Analytics\s*["'`]|>\s*Analytics\s*<|\bAnalytics\b/gi },
  { label: 'Insights', rx: /(?:title|label|heading|children)\s*[:=]\s*["'`]\s*Insights\s*["'`]|>\s*Insights\s*<|\bInsights\b/gi },
  { label: 'Overview', rx: /(?:title|label|heading|children)\s*[:=]\s*["'`]\s*Overview\s*["'`]|>\s*Overview\s*<|\bOverview\b/gi },
  { label: 'Dashboard', rx: /(?:title|label|heading|children)\s*[:=]\s*["'`]\s*Dashboard\s*["'`]|>\s*Dashboard\s*<|\bDashboard\b/gi },
  { label: 'Tasks', rx: /(?:title|label|heading|children)\s*[:=]\s*["'`]\s*Tasks\s*["'`]|>\s*Tasks\s*<|\bTasks\b/gi },
  { label: 'Projects', rx: /(?:title|label|heading|children)\s*[:=]\s*["'`]\s*Projects\s*["'`]|>\s*Projects\s*<|\bProjects\b/gi },
  { label: 'Reports', rx: /(?:title|label|heading|children)\s*[:=]\s*["'`]\s*Reports\s*["'`]|>\s*Reports\s*<|\bReports\b/gi },
  { label: 'Activity', rx: /(?:title|label|heading|children)\s*[:=]\s*["'`]\s*Activity\s*["'`]|>\s*Activity\s*<|\bActivity\b/gi },
  { label: 'Users', rx: /(?:title|label)\s*[:=]\s*["'`]\s*Users\s*["'`]/gi },
  { label: 'Revenue', rx: /(?:title|label)\s*[:=]\s*["'`]\s*Revenue\s*["'`]/gi },
  { label: 'Growth', rx: /(?:title|label)\s*[:=]\s*["'`]\s*Growth\s*["'`]/gi },
] as const;

const KPI_GENERIC_TERMS = ['Analytics', 'Insights', 'Overview', 'Users', 'Revenue', 'Growth', 'Tasks', 'Projects', 'Reports', 'Activity', 'Dashboard'] as const;

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'app', 'application', 'build', 'dashboard', 'for', 'from', 'in', 'of',
  'page', 'product', 'screen', 'service', 'system', 'the', 'to', 'tool', 'with', 'workspace',
]);

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))));
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeOutputPath(path: string): string {
  return path.replace(/^src[\\/]/, '').replace(/\\/g, '/');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function functionalEntityMap(plan?: FunctionalFlowPlan): Map<string, FunctionalDataEntity> {
  return new Map((plan?.entities ?? []).map(entity => [entity.id, entity]));
}

function makeEntity(
  id: string,
  label: string,
  description: string,
  sampleNames: string[],
  fields: DomainEntityPlan['fields'] = [],
): DomainEntitySeed {
  return { id, label, description, sampleNames, fields };
}

function makeMetric(
  id: string,
  label: string,
  meaning: string,
  exampleValue: string,
  shouldAppearOnScreens: string[],
): ProductMetricPlan {
  return { id, label, meaning, exampleValue, shouldAppearOnScreens };
}

function makeStatus(
  id: string,
  label: string,
  meaning: string,
  exampleUsage: string,
): ProductStatusPlan {
  return { id, label, meaning, exampleUsage };
}

function makeAction(
  id: string,
  label: string,
  userIntent: string,
  expectedVisibleResult: string,
  shouldAppearOnScreens: string[],
): ProductActionPlan {
  return { id, label, userIntent, expectedVisibleResult, shouldAppearOnScreens };
}

function makeScreenRule(
  matchTerms: string[],
  concreteTitleSuggestions: string[],
  requiredEntities: string[],
  requiredMetrics: string[],
  requiredActions: string[],
  copyHints: string[],
  avoidOnThisScreen: string[],
): ScreenRule {
  return {
    matchTerms,
    concreteTitleSuggestions,
    requiredEntities,
    requiredMetrics,
    requiredActions,
    copyHints,
    avoidOnThisScreen,
  };
}

function getProductType(input: {
  skeletonId: string;
  screenCompositionPlan?: ScreenCompositionPlan;
  functionalFlowPlan?: FunctionalFlowPlan;
  skeletonIntegrationPlan?: SkeletonIntegrationPlan;
}): string | undefined {
  return input.skeletonIntegrationPlan?.productType
    ?? input.screenCompositionPlan?.productType
    ?? input.functionalFlowPlan?.productType
    ?? undefined;
}

function fallbackScreensForSkeleton(skeletonId: string): ScreenRef[] {
  switch (skeletonId) {
    case 'mobile-app':
      return [
        { id: 'home-today', title: 'Home / Today', routeHint: '/', role: 'home' },
        { id: 'scan-create', title: 'Scan / Create', routeHint: '/create', role: 'form' },
        { id: 'progress', title: 'Progress', routeHint: '/progress', role: 'progress' },
        { id: 'profile-coach', title: 'Profile / Coach', routeHint: '/profile', role: 'profile' },
      ];
    case 'saas-dashboard':
      return [
        { id: 'dashboard', title: 'Dashboard', routeHint: '/', role: 'dashboard' },
        { id: 'projects', title: 'Projects', routeHint: '/projects', role: 'other' },
        { id: 'quality-feedback', title: 'Quality Feedback', routeHint: '/quality', role: 'other' },
      ];
    case 'b2b-operations-workspace':
      return [
        { id: 'dashboard', title: 'Dashboard', routeHint: '/', role: 'dashboard' },
        { id: 'records', title: 'Records', routeHint: '/records', role: 'other' },
        { id: 'workflow', title: 'Workflow', routeHint: '/workflow', role: 'other' },
      ];
    case 'marketplace-platform':
      return [
        { id: 'home', title: 'Home', routeHint: '/', role: 'home' },
        { id: 'listing', title: 'Listing Detail', routeHint: '/listing/:id', role: 'detail' },
        { id: 'seller-dashboard', title: 'Seller Dashboard', routeHint: '/seller', role: 'dashboard' },
      ];
    case 'creator-editor-workspace':
      return [
        { id: 'home', title: 'Projects', routeHint: '/', role: 'home' },
        { id: 'editor', title: 'Editor', routeHint: '/editor/:projectId', role: 'other' },
      ];
    case 'dating-matching-app':
      return [
        { id: 'discover', title: 'Discover', routeHint: '/discover', role: 'home' },
        { id: 'matches', title: 'Matches', routeHint: '/matches', role: 'feed' },
        { id: 'conversation', title: 'Conversation', routeHint: '/conversation/:matchId', role: 'other' },
      ];
    case 'gaming-casino-app':
      return [
        { id: 'lobby', title: 'Lobby', routeHint: '/', role: 'home' },
        { id: 'games', title: 'Games', routeHint: '/games', role: 'feed' },
        { id: 'promotions', title: 'Promotions', routeHint: '/promotions', role: 'other' },
      ];
    case 'game-interactive-app':
      return [
        { id: 'home', title: 'Game Home', routeHint: '/', role: 'home' },
        { id: 'level-select', title: 'Level Select', routeHint: '/levels', role: 'other' },
        { id: 'play', title: 'Play', routeHint: '/play/:id', role: 'detail' },
      ];
    case 'booking-service-app':
      return [
        { id: 'home', title: 'Services', routeHint: '/', role: 'home' },
        { id: 'booking-flow', title: 'Booking Flow', routeHint: '/book', role: 'form' },
        { id: 'bookings', title: 'Bookings', routeHint: '/bookings', role: 'other' },
      ];
    case 'content-learning-app':
      return [
        { id: 'catalog', title: 'Catalog', routeHint: '/', role: 'home' },
        { id: 'lesson-player', title: 'Lesson Player', routeHint: '/lesson/:id', role: 'detail' },
        { id: 'progress', title: 'Progress', routeHint: '/progress', role: 'progress' },
      ];
    case 'ecommerce':
      return [
        { id: 'storefront', title: 'Storefront', routeHint: '/', role: 'commerce' },
        { id: 'product-detail', title: 'Product Detail', routeHint: '/product/:id', role: 'detail' },
        { id: 'cart', title: 'Cart', routeHint: '/cart', role: 'other' },
      ];
    case 'productivity-tool':
      return [
        { id: 'workspace', title: 'Workspace', routeHint: '/', role: 'dashboard' },
        { id: 'projects', title: 'Projects', routeHint: '/projects', role: 'other' },
        { id: 'tasks', title: 'Tasks', routeHint: '/tasks', role: 'other' },
      ];
    case 'social-community':
      return [
        { id: 'feed-home', title: 'Feed / Home', routeHint: '/', role: 'feed' },
        { id: 'discover', title: 'Discover', routeHint: '/discover', role: 'other' },
        { id: 'messages', title: 'Messages', routeHint: '/messages', role: 'other' },
      ];
    case 'landing-page':
    default:
      return [
        { id: 'hero', title: 'Hero', routeHint: '/', role: 'home' },
        { id: 'product-preview', title: 'Product Preview', routeHint: '#product', role: 'other' },
        { id: 'social-proof-cta', title: 'Social Proof & CTA', routeHint: '#cta', role: 'other' },
      ];
  }
}

function getScreens(input: {
  skeletonId: string;
  screenCompositionPlan?: ScreenCompositionPlan;
}): ScreenRef[] {
  if (input.screenCompositionPlan?.screens.length) {
    return input.screenCompositionPlan.screens.map(screen => ({
      id: screen.id,
      title: screen.title,
      routeHint: screen.routeHint,
      role: screen.role,
    }));
  }
  return fallbackScreensForSkeleton(input.skeletonId);
}

function pickDomainProfile(skeletonId: KnownSkeletonId, brief: string): DomainProfile {
  const normalized = normalizeText(brief);
  const has = (pattern: RegExp) => pattern.test(normalized);

  switch (skeletonId) {
    case 'mobile-app':
      if (has(/\b(habit|routine|streak|check-?in|wellness|health|fitness|hydration|sleep|mood)\b/)) {
        return {
          inferredDomain: 'habit and wellness tracking',
          targetUserRole: 'an individual user managing daily routines',
          primaryJobToBeDone: 'complete today\'s check-ins, keep a streak alive, and see daily progress in context',
          preferredTerms: ['habit', 'check-in', 'streak', 'routine', 'today'],
          toneNotes: ['sound like a daily product, not a generic mobile shell', 'keep copy encouraging but concrete'],
          notes: ['brief matched habit/wellness signals'],
        };
      }
      if (has(/\b(budget|expense|saving|spend|finance)\b/)) {
        return {
          inferredDomain: 'personal budget tracking',
          targetUserRole: 'an individual user watching daily spending',
          primaryJobToBeDone: 'log spending decisions, spot overspend risk, and stay on budget this week',
          preferredTerms: ['budget', 'spend', 'category', 'limit', 'today'],
          toneNotes: ['use practical money language', 'avoid generic coaching slogans'],
          notes: ['brief matched budget signals'],
        };
      }
      return {
        inferredDomain: 'daily progress tracking',
        targetUserRole: 'an individual user returning to the app each day',
        primaryJobToBeDone: 'finish the main daily action and see progress update immediately',
        preferredTerms: ['today', 'progress', 'check-in', 'streak', 'reminder'],
        toneNotes: ['optimize for repeat daily use', 'avoid generic feature lists'],
        notes: ['used mobile-app daily-use default'],
      };
    case 'saas-dashboard':
      if (has(/\b(quality|review|approval|launch|readiness|qa|ops)\b/)) {
        return {
          inferredDomain: 'review and readiness operations',
          targetUserRole: 'an operations lead managing a review queue',
          primaryJobToBeDone: 'triage records, assign owners, and push blocked work toward readiness',
          preferredTerms: ['queue', 'owner', 'review', 'blocked', 'SLA'],
          toneNotes: ['sound like an operating surface', 'replace abstract metrics with review language'],
          notes: ['brief matched quality/review signals'],
        };
      }
      return {
        inferredDomain: 'workspace operations management',
        targetUserRole: 'a team lead monitoring active work',
        primaryJobToBeDone: 'review the live queue, move records forward, and keep operators aligned',
        preferredTerms: ['workspace', 'queue', 'record', 'owner', 'status'],
        toneNotes: ['avoid generic admin-dashboard phrasing', 'use explicit workflow language'],
        notes: ['used saas-dashboard operating-surface default'],
      };
    case 'b2b-operations-workspace':
      if (has(/\b(sales|deal|account|pipeline)\b/)) {
        return {
          inferredDomain: 'account and deal operations',
          targetUserRole: 'an operations manager shepherding accounts through workflow stages',
          primaryJobToBeDone: 'keep accounts moving, surface SLA risk, and clear blocked approvals',
          preferredTerms: ['account', 'deal', 'stage', 'owner', 'approval'],
          toneNotes: ['prioritize enterprise workflow language', 'prefer queue and stage wording'],
          notes: ['brief matched account/deal signals'],
        };
      }
      return {
        inferredDomain: 'B2B workflow operations',
        targetUserRole: 'an operations manager responsible for records, approvals, and team throughput',
        primaryJobToBeDone: 'work the queue, resolve blockers, and monitor SLA risk across records',
        preferredTerms: ['record', 'approval', 'stage', 'owner', 'SLA'],
        toneNotes: ['sound operational and accountable', 'avoid generic business-dashboard copy'],
        notes: ['used b2b-operations-workspace default'],
      };
    case 'marketplace-platform':
      return {
        inferredDomain: 'two-sided listing marketplace',
        targetUserRole: 'a buyer or seller coordinating listings, offers, and orders',
        primaryJobToBeDone: 'browse or publish listings, respond to offers, and keep transactions moving',
        preferredTerms: ['listing', 'seller', 'buyer', 'offer', 'availability'],
        toneNotes: ['use two-sided marketplace language', 'avoid plain storefront wording'],
        notes: ['used marketplace-platform default'],
      };
    case 'creator-editor-workspace':
      if (has(/\b(video|shorts|social|thumbnail|render)\b/)) {
        return {
          inferredDomain: 'video and content production',
          targetUserRole: 'a creator managing drafts, assets, and render jobs',
          primaryJobToBeDone: 'move content from draft to render-ready to publish-ready without losing version context',
          preferredTerms: ['project', 'asset', 'draft', 'render', 'publish'],
          toneNotes: ['sound like a studio workspace', 'avoid generic productivity phrasing'],
          notes: ['brief matched video/render signals'],
        };
      }
      return {
        inferredDomain: 'creative project editing',
        targetUserRole: 'a creator building and publishing media projects',
        primaryJobToBeDone: 'organize assets, edit drafts, and prepare work for publishing',
        preferredTerms: ['project', 'asset', 'version', 'media library', 'publish'],
        toneNotes: ['keep copy studio-specific', 'avoid generic dashboard language'],
        notes: ['used creator-editor-workspace default'],
      };
    case 'dating-matching-app':
      return {
        inferredDomain: 'profile-based dating and matching',
        targetUserRole: 'a member discovering matches and keeping conversations active',
        primaryJobToBeDone: 'review profiles, express interest, and keep promising matches moving into conversation',
        preferredTerms: ['profile', 'match', 'like', 'conversation', 'compatibility'],
        toneNotes: ['use dating-product vocabulary', 'avoid generic social feed terms'],
        notes: ['used dating-matching-app default'],
      };
    case 'gaming-casino-app':
      return {
        inferredDomain: 'demo-only casino and rewards lobby',
        targetUserRole: 'a player browsing demo games and promotional rewards',
        primaryJobToBeDone: 'pick a game from the lobby, use demo chips locally, and track rewards or limits',
        preferredTerms: ['lobby', 'demo play', 'chips', 'rewards', 'responsible gaming'],
        toneNotes: ['keep all states clearly local and prototype-only', 'avoid any real-money or payment language'],
        notes: ['used gaming-casino-app prototype-safe default'],
      };
    case 'game-interactive-app':
      return {
        inferredDomain: 'interactive level-based game',
        targetUserRole: 'a player progressing through levels and session goals',
        primaryJobToBeDone: 'start a run, manage score or energy, and unlock the next level locally',
        preferredTerms: ['level', 'score', 'quest', 'inventory', 'achievement'],
        toneNotes: ['sound like an active game, not a static app shell', 'favor gameplay verbs'],
        notes: ['used game-interactive-app default'],
      };
    case 'booking-service-app':
      return {
        inferredDomain: 'service booking and availability management',
        targetUserRole: 'a customer choosing a provider and confirming a time slot',
        primaryJobToBeDone: 'compare providers, claim an available slot, and manage upcoming bookings',
        preferredTerms: ['provider', 'availability', 'time slot', 'booking', 'confirmation'],
        toneNotes: ['sound appointment-specific', 'avoid ecommerce cart terminology'],
        notes: ['used booking-service-app default'],
      };
    case 'content-learning-app':
      return {
        inferredDomain: 'course-based learning progress',
        targetUserRole: 'a learner moving through lessons, quizzes, and streak goals',
        primaryJobToBeDone: 'continue the next lesson, complete quizzes, and see clear progress toward completion',
        preferredTerms: ['course', 'lesson', 'module', 'quiz', 'streak'],
        toneNotes: ['sound instructional and motivating', 'avoid generic content-feed language'],
        notes: ['used content-learning-app default'],
      };
    case 'ecommerce':
      return {
        inferredDomain: 'specialty ecommerce storefront',
        targetUserRole: 'a shopper comparing products, variants, and delivery status',
        primaryJobToBeDone: 'find the right variant, update the cart, and feel confident about stock and delivery',
        preferredTerms: ['product', 'variant', 'cart', 'stock', 'delivery'],
        toneNotes: ['use commerce language, not marketplace language', 'keep CTAs purchase-specific'],
        notes: ['used ecommerce default'],
      };
    case 'productivity-tool':
      return {
        inferredDomain: 'project and task coordination',
        targetUserRole: 'a teammate managing tasks, milestones, and blockers',
        primaryJobToBeDone: 'prioritize work, update ownership, and move milestones forward without losing blockers',
        preferredTerms: ['task', 'project', 'milestone', 'priority', 'blocker'],
        toneNotes: ['sound operational, not abstract', 'avoid generic dashboard copy'],
        notes: ['used productivity-tool default'],
      };
    case 'social-community':
      return {
        inferredDomain: 'member community and creator engagement',
        targetUserRole: 'a member following creators, reacting to posts, and joining conversations',
        primaryJobToBeDone: 'find relevant posts, react or comment, and keep up with creators or groups',
        preferredTerms: ['post', 'creator', 'member', 'reaction', 'group'],
        toneNotes: ['use community language', 'avoid static-content wording'],
        notes: ['used social-community default'],
      };
    case 'landing-page':
    default:
      return {
        inferredDomain: 'product marketing and conversion',
        targetUserRole: 'a visitor deciding whether this product solves a specific problem',
        primaryJobToBeDone: 'understand the product, see believable proof, and take the next CTA',
        preferredTerms: ['problem', 'workflow', 'proof', 'demo', 'CTA'],
        toneNotes: ['make concrete claims', 'avoid empty all-in-one marketing language'],
        notes: ['used landing-page default'],
      };
  }
}

function mergeEntityFields(
  seed: DomainEntitySeed,
  functionalEntity?: FunctionalDataEntity,
): DomainEntityPlan {
  return {
    id: seed.id,
    label: seed.label,
    description: seed.description,
    fields: functionalEntity?.fields?.length
      ? functionalEntity.fields.map(field => ({
          name: field.name,
          type: field.type,
          example: field.example,
        }))
      : [...(seed.fields ?? [])],
    sampleNames: [...seed.sampleNames],
  };
}

function findFunctionalEntity(
  entityMap: Map<string, FunctionalDataEntity>,
  seed: DomainEntitySeed,
): FunctionalDataEntity | undefined {
  return entityMap.get(seed.id)
    ?? Array.from(entityMap.values()).find(entity =>
      normalizeText(entity.label) === normalizeText(seed.label)
      || normalizeText(entity.id) === normalizeText(seed.id),
    );
}

function keywordScore(screen: ScreenRef, rule: ScreenRule): number {
  const haystack = normalizeText(`${screen.id} ${screen.title} ${screen.routeHint ?? ''} ${screen.role}`);
  return rule.matchTerms.reduce((score, term) => score + (haystack.includes(normalizeText(term)) ? 1 : 0), 0);
}

function buildScreenSpecificContent(
  screens: ScreenRef[],
  rules: ScreenRule[],
  entities: DomainEntityPlan[],
  metrics: ProductMetricPlan[],
  actions: ProductActionPlan[],
): ScreenSpecificContentPlan[] {
  const entityIds = new Set(entities.map(entity => entity.id));
  const metricIds = new Set(metrics.map(metric => metric.id));
  const actionIds = new Set(actions.map(action => action.id));

  return screens.map((screen, index) => {
    const matchedRule = rules
      .map(rule => ({ rule, score: keywordScore(screen, rule) }))
      .sort((a, b) => b.score - a.score)[0]?.rule;
    const rule = matchedRule && keywordScore(screen, matchedRule) > 0
      ? matchedRule
      : rules[Math.min(index, Math.max(0, rules.length - 1))];

    return {
      screenId: screen.id,
      concreteTitleSuggestions: [...rule.concreteTitleSuggestions],
      requiredEntities: rule.requiredEntities.filter(id => entityIds.has(id)),
      requiredMetrics: rule.requiredMetrics.filter(id => metricIds.has(id)),
      requiredActions: rule.requiredActions.filter(id => actionIds.has(id)),
      copyHints: [...rule.copyHints],
      avoidOnThisScreen: [...rule.avoidOnThisScreen],
    };
  });
}

function buildTemplate(
  skeletonId: KnownSkeletonId,
  profile: DomainProfile,
): SkeletonSpecificityTemplate {
  switch (skeletonId) {
    case 'mobile-app':
      return {
        domainEntities: [
          makeEntity('habit', 'Habit', 'A repeatable daily behavior the user checks off or reviews.', ['Morning walk', 'Hydration check', 'Sleep wind-down']),
          makeEntity('checkIn', 'Check-in', 'A daily completion or self-report entry tied to today\'s routine.', ['Evening reflection', 'Lunch scan', 'Mood check']),
          makeEntity('reminder', 'Reminder', 'A timed prompt that nudges the user to act today.', ['8:00 AM stretch reminder', '9:30 PM sleep cue']),
        ],
        productMetrics: [
          makeMetric('current-streak', 'Current streak', 'Consecutive days the user stayed on plan.', '12 days', ['home-today', 'progress']),
          makeMetric('today-completion', 'Today\'s check-ins completed', 'How many planned actions are done today.', '4 of 5', ['home-today', 'progress']),
          makeMetric('weekly-consistency', 'Weekly consistency', 'Completion quality across the last seven days.', '86%', ['progress']),
        ],
        productStatuses: [
          makeStatus('due-today', 'Due today', 'Needs attention before the day ends.', 'Reminder badge: Due today'),
          makeStatus('completed', 'Completed', 'The user finished the check-in or habit today.', 'Habit row: Completed'),
          makeStatus('missed', 'Missed', 'The user skipped the planned action for the period.', 'History item: Missed yesterday'),
          makeStatus('snoozed', 'Snoozed', 'The reminder was deferred locally.', 'Reminder chip: Snoozed 30m'),
        ],
        productActions: [
          makeAction('complete-check-in', 'Complete check-in', 'Mark today\'s action as done.', 'The card state updates and streak metrics refresh.', ['home-today', 'detail']),
          makeAction('log-progress', 'Log progress', 'Capture how today went in concrete terms.', 'A new check-in appears in history and progress changes.', ['scan-create', 'progress']),
          makeAction('snooze-reminder', 'Snooze reminder', 'Delay the reminder without dismissing the task.', 'Reminder status changes to a local snoozed state.', ['profile-coach', 'home-today']),
        ],
        vocabulary: {
          preferredTerms: uniqueStrings([...profile.preferredTerms, 'habit', 'check-in', 'streak', 'reminder', 'progress']),
          avoidTerms: ['feature', 'analytics', 'dashboard', 'overview', 'all-in-one'],
          toneNotes: [...profile.toneNotes],
        },
        sampleDataRules: [
          'Use real daily routine names instead of generic features.',
          'Show check-in timestamps, streak values, and reminder times that feel lived-in.',
          'Empty states should mention the next habit, reminder, or missed streak opportunity.',
        ],
        copywritingRules: [
          'Name screens and buttons around today\'s routine, not around abstract app structure.',
          'Prefer concrete daily actions like "Log water" or "Complete walk" over generic "Track progress".',
          'If you mention insights, qualify them with a real routine outcome.',
        ],
        forbiddenGenericPatterns: [
          ...GLOBAL_FORBIDDEN_GENERIC_PATTERNS,
          'generic mobile app',
          'generic progress dashboard',
        ],
        specificityNotes: [
          'Home should feel like a daily cockpit with check-ins, streaks, and reminders.',
          'Avoid generic tasks language unless the product really is a task tool.',
          ...profile.notes,
        ],
        screenRules: [
          makeScreenRule(
            ['home', 'today', '/'],
            ['Today\'s habits', 'Check-ins due today', 'Your streak snapshot'],
            ['habit', 'checkIn', 'reminder'],
            ['current-streak', 'today-completion'],
            ['complete-check-in', 'snooze-reminder'],
            ['Show a concrete list of habits or check-ins due today.', 'The hero metric should be streak or completion, not abstract analytics.'],
            ['Generic welcome copy', 'Empty KPI cards', 'Feature list tiles'],
          ),
          makeScreenRule(
            ['create', 'scan', 'form'],
            ['Log today\'s check-in', 'Add a new habit', 'Capture today\'s routine'],
            ['checkIn', 'habit'],
            ['today-completion'],
            ['log-progress', 'complete-check-in'],
            ['Use real habit names in form presets.', 'Button labels should describe the action being logged.'],
            ['Untitled form sections', 'Generic submit button text'],
          ),
          makeScreenRule(
            ['detail', 'progress'],
            ['Habit streak detail', 'Consistency over time', 'This week\'s completion pattern'],
            ['habit', 'checkIn'],
            ['current-streak', 'weekly-consistency'],
            ['complete-check-in', 'log-progress'],
            ['Tie charts or cards to one habit or one date range.', 'Use statuses like Completed, Missed, Due today.'],
            ['Overview', 'Insights'],
          ),
          makeScreenRule(
            ['profile', 'coach', 'settings'],
            ['Reminder settings', 'Daily routine preferences', 'Coach tone and goals'],
            ['reminder', 'habit'],
            ['today-completion'],
            ['snooze-reminder'],
            ['Show reminder times, coaching preferences, or habit goals.', 'Empty states should reference reminders or routines.'],
            ['Generic settings copy', 'Welcome back'],
          ),
        ],
      };
    case 'saas-dashboard':
      return {
        domainEntities: [
          makeEntity('workspaceRecord', 'Workspace record', 'A queue item the team reviews, updates, or resolves.', ['Launch brief #204', 'Readiness review #118', 'Escalation ticket #42']),
          makeEntity('reviewQueue', 'Review queue', 'The ordered set of records awaiting action or decision.', ['Needs review', 'Blocked by owner', 'At-risk this hour']),
          makeEntity('owner', 'Owner', 'The person accountable for moving a record.', ['Ava Chen', 'Leo Park', 'Marta Ruiz']),
        ],
        productMetrics: [
          makeMetric('queue-at-risk', 'Queue at SLA risk', 'Items likely to miss target handling time.', '7 items', ['dashboard', 'quality-feedback']),
          makeMetric('median-resolution-time', 'Median resolution time', 'How long the team takes to clear work.', '3h 18m', ['dashboard']),
          makeMetric('records-cleared-today', 'Records cleared today', 'Throughput completed during the current day.', '42', ['dashboard', 'projects']),
        ],
        productStatuses: [
          makeStatus('needs-review', 'Needs review', 'The record is waiting for human triage.', 'Queue chip: Needs review'),
          makeStatus('in-review', 'In review', 'Someone is actively assessing the record.', 'Row status: In review'),
          makeStatus('blocked', 'Blocked', 'The record cannot move until a dependency is cleared.', 'Queue badge: Blocked'),
          makeStatus('approved', 'Approved', 'The record is cleared to move forward.', 'Decision cell: Approved'),
        ],
        productActions: [
          makeAction('assign-owner', 'Assign owner', 'Give clear accountability for the next step.', 'The row owner changes and the queue updates.', ['dashboard', 'projects']),
          makeAction('move-to-review', 'Move to review', 'Advance a record into an active review state.', 'Status changes and the review queue count refreshes.', ['dashboard', 'quality-feedback']),
          makeAction('resolve-record', 'Resolve record', 'Close or clear an item after review.', 'Resolved items disappear from the active queue and metrics update.', ['projects', 'quality-feedback']),
        ],
        vocabulary: {
          preferredTerms: uniqueStrings([...profile.preferredTerms, 'queue', 'record', 'owner', 'review state', 'decision']),
          avoidTerms: ['dashboard', 'analytics', 'insights', 'users', 'growth'],
          toneNotes: [...profile.toneNotes],
        },
        sampleDataRules: [
          'Rows must look like real records with IDs, owners, timestamps, and decision states.',
          'Metrics should be derived from queue pressure, review speed, or blocked work.',
          'Empty states should explain why the queue is clear or what is waiting next.',
        ],
        copywritingRules: [
          'Name metrics by operational meaning, not generic business KPI words.',
          'Always include at least one work queue or decision table, not only KPI cards.',
          'Buttons should describe the workflow move: assign, review, resolve, escalate.',
        ],
        forbiddenGenericPatterns: [
          ...GLOBAL_FORBIDDEN_GENERIC_PATTERNS,
          'business dashboard',
          'admin panel metrics only',
        ],
        specificityNotes: [
          'This skeleton should feel like an operating surface for real queue work.',
          'If a chart exists, it should support a queue decision instead of standing alone.',
          ...profile.notes,
        ],
        screenRules: [
          makeScreenRule(
            ['dashboard', '/'],
            ['Review queue and SLA watch', 'Owner workload and blocked records', 'What needs action now'],
            ['workspaceRecord', 'reviewQueue', 'owner'],
            ['queue-at-risk', 'median-resolution-time', 'records-cleared-today'],
            ['assign-owner', 'move-to-review'],
            ['Show a queue, table, or decisions list in the primary area.', 'Tie KPI labels directly to queue movement or review pressure.'],
            ['Generic dashboard', 'Revenue / Users / Growth cards'],
          ),
          makeScreenRule(
            ['project', 'queue', 'record'],
            ['Open records by owner', 'Records waiting for decision', 'Review queue detail'],
            ['workspaceRecord', 'owner'],
            ['records-cleared-today'],
            ['assign-owner', 'resolve-record'],
            ['Rows need concrete IDs, owners, and statuses.', 'Filters should reference real review states.'],
            ['Projects', 'Activity'],
          ),
          makeScreenRule(
            ['quality', 'feedback', 'readiness'],
            ['Open approvals by SLA risk', 'Review decisions that still need action', 'Blocked items by review state'],
            ['workspaceRecord', 'reviewQueue'],
            ['queue-at-risk', 'median-resolution-time'],
            ['move-to-review', 'resolve-record'],
            ['Use specific review labels, not generic feedback buckets.', 'Warnings should mention owner or blocker context.'],
            ['Analytics', 'Insights', 'Overview'],
          ),
        ],
      };
    case 'b2b-operations-workspace':
      return {
        domainEntities: [
          makeEntity('record', 'Record', 'An account, deal, approval, or operational item that moves through stages.', ['Acct-4021', 'Deal-118', 'Approval-77']),
          makeEntity('account', 'Account', 'The customer or business entity attached to the work item.', ['Northwind Health', 'Atlas Freight', 'FieldOps Retail']),
          makeEntity('workflowStage', 'Workflow stage', 'A named operational stage with ownership and SLA expectations.', ['Intake', 'Compliance review', 'Ready to close']),
        ],
        productMetrics: [
          makeMetric('blocked-items', 'Blocked items', 'How many records are stuck right now.', '9', ['dashboard', 'workflow']),
          makeMetric('sla-risk', 'Open approvals by SLA risk', 'Approvals likely to breach target handling time.', '5 approvals', ['dashboard', 'records']),
          makeMetric('stage-movement', 'Stage movement this week', 'How many records advanced through the workflow.', '27 moved', ['dashboard', 'workflow']),
          makeMetric('resolution-time', 'Median resolution time', 'Typical time from intake to resolved.', '2d 4h', ['records']),
        ],
        productStatuses: [
          makeStatus('awaiting-approval', 'Awaiting approval', 'Needs reviewer sign-off before it can advance.', 'Record status: Awaiting approval'),
          makeStatus('owner-assigned', 'Owner assigned', 'A team owner is accountable for the next step.', 'Row badge: Owner assigned'),
          makeStatus('sla-risk', 'SLA risk', 'The item is close to missing its deadline.', 'Flag: SLA risk'),
          makeStatus('resolved', 'Resolved', 'Operational work is complete for now.', 'Record state: Resolved'),
        ],
        productActions: [
          makeAction('assign-team-owner', 'Assign team owner', 'Put a named operator on the record.', 'Owner column updates immediately.', ['dashboard', 'records']),
          makeAction('advance-stage', 'Advance stage', 'Move the record to the next workflow stage.', 'Stage badge changes and stage movement metrics refresh.', ['workflow', 'record-detail']),
          makeAction('approve-record', 'Approve record', 'Clear the record to continue.', 'Approval state changes and review counts drop.', ['records', 'record-detail']),
        ],
        vocabulary: {
          preferredTerms: uniqueStrings([...profile.preferredTerms, 'record', 'account', 'deal', 'owner', 'SLA']),
          avoidTerms: ['business dashboard', 'analytics', 'overview', 'manage everything'],
          toneNotes: [...profile.toneNotes],
        },
        sampleDataRules: [
          'Records should look like operational work, with IDs, account names, owners, and stages.',
          'Metrics should reflect throughput, blockers, review queue, resolution time, or stage movement.',
          'Empty states should mention workflow health or the next approval to land.',
        ],
        copywritingRules: [
          'Use records, approvals, accounts, deals, owners, and SLA language throughout.',
          'Do not call the main screen a generic business dashboard.',
          'Status chips should read like real workflow states, not decorative tags.',
        ],
        forbiddenGenericPatterns: [
          ...GLOBAL_FORBIDDEN_GENERIC_PATTERNS,
          'business dashboard',
          'generic operations view',
        ],
        specificityNotes: [
          'Primary surfaces should show records, owners, and workflow stages.',
          'At least one screen should feel like a real review queue or approval table.',
          ...profile.notes,
        ],
        screenRules: [
          makeScreenRule(
            ['dashboard', '/'],
            ['Open approvals by SLA risk', 'Blocked records and owner load', 'Workflow movement this week'],
            ['record', 'account', 'workflowStage'],
            ['blocked-items', 'sla-risk', 'stage-movement'],
            ['assign-team-owner', 'approve-record'],
            ['Keep a table or queue in the main surface.', 'Use stage, owner, and account context in labels.'],
            ['Business dashboard', 'Revenue / Growth cards'],
          ),
          makeScreenRule(
            ['record', 'records', 'detail'],
            ['Records needing approval', 'Account review queue', 'Record detail and next action'],
            ['record', 'account'],
            ['sla-risk', 'resolution-time'],
            ['assign-team-owner', 'approve-record'],
            ['Columns should mention account, owner, stage, and deadline.', 'Detail pages should include next-stage action copy.'],
            ['Projects', 'Tasks'],
          ),
          makeScreenRule(
            ['workflow', 'stage'],
            ['Stage movement and queue health', 'Workflow bottlenecks by owner', 'Approvals waiting by stage'],
            ['record', 'workflowStage'],
            ['blocked-items', 'stage-movement'],
            ['advance-stage'],
            ['Board columns should be real workflow stages.', 'Cards should mention account or record IDs.'],
            ['Overview', 'Activity'],
          ),
        ],
      };
    case 'marketplace-platform':
      return {
        domainEntities: [
          makeEntity('listing', 'Listing', 'A live or draft offer posted into the marketplace.', ['Downtown photo studio rental', 'Vintage road bike', 'Freelance motion package']),
          makeEntity('seller', 'Seller', 'The marketplace participant offering the listing.', ['Rosa Studio', 'North Loop Bikes', 'FrameCraft Labs']),
          makeEntity('buyerRequest', 'Buyer request', 'A request, inquiry, or offer from the demand side.', ['Need Saturday rental', 'Offer 420 credits', 'Can deliver by Friday?']),
          makeEntity('offer', 'Offer', 'A pending buyer or seller commercial response.', ['Offer #912', 'Counter-offer #148']),
        ],
        productMetrics: [
          makeMetric('active-listings', 'Active listings', 'Supply currently available for discovery.', '128', ['home', 'seller-dashboard']),
          makeMetric('offers-awaiting-reply', 'Offers awaiting reply', 'Buyer or seller negotiations that need a response.', '14', ['seller-dashboard', 'messages']),
          makeMetric('fill-rate', 'Listings filled this week', 'How many listings converted into orders or bookings.', '23 filled', ['seller-dashboard']),
        ],
        productStatuses: [
          makeStatus('available', 'Available', 'The listing can accept demand right now.', 'Listing badge: Available'),
          makeStatus('awaiting-offer', 'Awaiting offer', 'The listing is live but no offer is pending yet.', 'Seller view: Awaiting offer'),
          makeStatus('offer-pending', 'Offer pending', 'A buyer request or counter-offer is active.', 'Thread state: Offer pending'),
          makeStatus('sold-or-booked', 'Sold / booked', 'The listing is no longer available.', 'Listing row: Sold / booked'),
        ],
        productActions: [
          makeAction('publish-listing', 'Publish listing', 'Make a draft visible to buyers.', 'The listing moves from draft into the active marketplace.', ['seller-dashboard']),
          makeAction('make-offer', 'Make offer', 'Send a concrete offer or request.', 'A new offer thread appears with local state and status.', ['listing', 'messages']),
          makeAction('accept-offer', 'Accept offer', 'Confirm the buyer or seller decision.', 'The listing status updates and pending counts change.', ['messages', 'seller-dashboard']),
        ],
        vocabulary: {
          preferredTerms: uniqueStrings([...profile.preferredTerms, 'listing', 'seller', 'buyer', 'offer', 'availability']),
          avoidTerms: ['store', 'catalog only', 'product dashboard', 'revenue'],
          toneNotes: [...profile.toneNotes],
        },
        sampleDataRules: [
          'Listings need seller names, availability details, and realistic offer messages.',
          'Use two-sided sample data: buyer requests, seller responses, and offer states.',
          'Empty states should mention listings, requests, or offers that have not arrived yet.',
        ],
        copywritingRules: [
          'Use two-sided marketplace language on all major screens.',
          'Do not reduce the product to a generic storefront with products and carts.',
          'Buttons should say Publish listing, Make offer, Accept offer, or Message seller.',
        ],
        forbiddenGenericPatterns: [
          ...GLOBAL_FORBIDDEN_GENERIC_PATTERNS,
          'simple product store',
          'generic storefront',
        ],
        specificityNotes: [
          'This should feel like a marketplace with supply and demand, not a single-vendor shop.',
          'Listings should show availability, ratings, or response context.',
          ...profile.notes,
        ],
        screenRules: [
          makeScreenRule(
            ['home', 'discover', '/'],
            ['Listings available now', 'Requests matching your search', 'Featured supply by category'],
            ['listing', 'seller'],
            ['active-listings'],
            ['make-offer'],
            ['Show listings with seller context and availability.', 'Discovery modules should feel two-sided, not just merchandised.'],
            ['Storefront', 'Products'],
          ),
          makeScreenRule(
            ['listing', 'detail'],
            ['Listing detail and seller terms', 'Availability and offer options', 'What this seller is offering'],
            ['listing', 'seller', 'offer'],
            ['offers-awaiting-reply'],
            ['make-offer'],
            ['The main CTA should be offer or message oriented.', 'Copy should include availability, seller reputation, or order terms.'],
            ['Add to cart', 'Checkout'],
          ),
          makeScreenRule(
            ['seller', 'dashboard'],
            ['Seller listings and pending offers', 'Supply health and response queue', 'Drafts waiting to go live'],
            ['listing', 'seller', 'offer'],
            ['active-listings', 'offers-awaiting-reply', 'fill-rate'],
            ['publish-listing', 'accept-offer'],
            ['Include a list of live and draft listings, not just KPIs.', 'Metrics should help the seller act on listings or offers.'],
            ['Revenue', 'Users'],
          ),
          makeScreenRule(
            ['message', 'conversation'],
            ['Offers waiting for reply', 'Buyer and seller threads', 'Negotiation inbox'],
            ['buyerRequest', 'offer'],
            ['offers-awaiting-reply'],
            ['make-offer', 'accept-offer'],
            ['Threads should mention listing names and offer values.', 'Use message states tied to offers or availability.'],
            ['Generic chat feed', 'Activity'],
          ),
        ],
      };
    case 'creator-editor-workspace':
      return {
        domainEntities: [
          makeEntity('project', 'Project', 'A creator workspace item with scope, assets, and versions.', ['Spring launch reel', 'Tutorial thumbnail set', 'Podcast cover refresh']),
          makeEntity('asset', 'Asset', 'A media input or reusable design element.', ['Intro clip.mp4', 'Brand overlay pack', 'Caption style preset']),
          makeEntity('renderJob', 'Render job', 'A local publish or export job with queue state.', ['Render queue #17', 'Draft export #08']),
          makeEntity('publishState', 'Publish state', 'A readiness checkpoint for pushing content live.', ['Needs captions', 'Ready to publish']),
        ],
        productMetrics: [
          makeMetric('queued-renders', 'Queued renders', 'Jobs waiting to export or finish.', '3 jobs', ['home', 'editor']),
          makeMetric('asset-count', 'Assets in project', 'How much media is attached to the active project.', '24 assets', ['home', 'editor']),
          makeMetric('publish-readiness', 'Publish readiness', 'How close the project is to a publishable state.', '82%', ['editor']),
        ],
        productStatuses: [
          makeStatus('draft', 'Draft', 'Still being edited and not ready to publish.', 'Project card: Draft'),
          makeStatus('rendering', 'Rendering', 'A local render or export job is running.', 'Render row: Rendering'),
          makeStatus('needs-review', 'Needs review', 'The project needs one more pass before publish.', 'Checklist item: Needs review'),
          makeStatus('ready-to-publish', 'Ready to publish', 'The project has the required pieces to go live.', 'Project badge: Ready to publish'),
        ],
        productActions: [
          makeAction('open-project', 'Open project', 'Move from the library into the active editing surface.', 'The selected project loads into the editor view.', ['home']),
          makeAction('queue-render', 'Queue render', 'Send the current draft to the render queue.', 'A new render job appears with local status.', ['editor']),
          makeAction('mark-publish-ready', 'Mark publish ready', 'Advance the project into publishable state.', 'Publish readiness metrics and badges update.', ['editor']),
        ],
        vocabulary: {
          preferredTerms: uniqueStrings([...profile.preferredTerms, 'project', 'asset', 'draft', 'render', 'publish']),
          avoidTerms: ['productivity dashboard', 'tasks', 'overview', 'activity'],
          toneNotes: [...profile.toneNotes],
        },
        sampleDataRules: [
          'Projects should have believable creator names, asset counts, and version cues.',
          'Render jobs need status, queue order, and file intent.',
          'Empty states should reference drafts, assets, or render queue context.',
        ],
        copywritingRules: [
          'Use studio and editing language across screens.',
          'Treat render status, publish readiness, and asset library as first-class content.',
          'Avoid generic project management wording unless tied to media work.',
        ],
        forbiddenGenericPatterns: [
          ...GLOBAL_FORBIDDEN_GENERIC_PATTERNS,
          'generic productivity dashboard',
        ],
        specificityNotes: [
          'The editor should feel like a media workspace, not a general admin app.',
          'Project lists should show draft state, asset volume, or publish readiness.',
          ...profile.notes,
        ],
        screenRules: [
          makeScreenRule(
            ['home', 'project', '/'],
            ['Recent drafts and publish-ready projects', 'Projects waiting on assets', 'What is in the studio queue'],
            ['project', 'asset', 'renderJob'],
            ['queued-renders', 'asset-count'],
            ['open-project'],
            ['Cards should mention draft names, asset counts, or thumbnail intent.', 'Use quick actions like Continue draft or Open project.'],
            ['Projects', 'Dashboard'],
          ),
          makeScreenRule(
            ['editor', 'canvas'],
            ['Editor canvas and render queue', 'Current draft and publish checklist', 'Asset library for this project'],
            ['project', 'asset', 'renderJob', 'publishState'],
            ['queued-renders', 'publish-readiness'],
            ['queue-render', 'mark-publish-ready'],
            ['The editor header should name the active project.', 'Side panels should reference assets, versions, or publish blockers.'],
            ['Tasks', 'Reports'],
          ),
        ],
      };
    case 'dating-matching-app':
      return {
        domainEntities: [
          makeEntity('profile', 'Profile', 'A member card with compatibility and preference signals.', ['Nina, 29 • ceramicist', 'Omar, 31 • trail runner', 'Maya, 27 • product designer']),
          makeEntity('match', 'Match', 'A confirmed mutual interest thread.', ['Nina matched 2h ago', 'Omar replied yesterday']),
          makeEntity('conversation', 'Conversation', 'A message thread tied to a match.', ['Coffee plans', 'Weekend market chat']),
          makeEntity('preference', 'Preference', 'Safety and compatibility settings for discovery.', ['Distance within 10 km', 'Non-smoker preference']),
        ],
        productMetrics: [
          makeMetric('new-matches', 'New matches this week', 'Recent successful connections.', '8', ['discover', 'matches']),
          makeMetric('reply-waiting', 'Matches waiting for reply', 'Conversations where a response is overdue.', '3', ['matches', 'conversation']),
          makeMetric('profile-completion', 'Profile completion', 'How complete the member profile is for matching.', '92%', ['onboarding', 'discover']),
        ],
        productStatuses: [
          makeStatus('liked', 'Liked', 'Interest was expressed but not yet mutual.', 'Profile badge: Liked'),
          makeStatus('matched', 'Matched', 'Both people expressed interest.', 'Thread label: Matched'),
          makeStatus('reply-needed', 'Reply needed', 'The conversation is waiting on the user.', 'Conversation chip: Reply needed'),
          makeStatus('passed', 'Passed', 'The profile was dismissed locally.', 'History row: Passed'),
        ],
        productActions: [
          makeAction('swipe-like', 'Swipe like', 'Show interest in a profile.', 'The card leaves the deck and a like or match state appears.', ['discover']),
          makeAction('pass-profile', 'Pass profile', 'Skip a profile without matching.', 'The deck advances and the passed profile disappears.', ['discover']),
          makeAction('send-message', 'Send message', 'Start or continue a conversation with a match.', 'The conversation thread updates immediately.', ['matches', 'conversation']),
          makeAction('edit-profile', 'Edit profile', 'Improve profile details or preferences.', 'Profile completion and preference state update locally.', ['onboarding']),
        ],
        vocabulary: {
          preferredTerms: uniqueStrings([...profile.preferredTerms, 'profile', 'match', 'conversation', 'compatibility', 'preference']),
          avoidTerms: ['feed', 'content', 'creator', 'dashboard'],
          toneNotes: [...profile.toneNotes],
        },
        sampleDataRules: [
          'Profile cards need names, ages, interests, and compatibility signals that feel human.',
          'Conversation previews should sound like real match openers, not generic social messages.',
          'Empty states should mention new matches or prompt a profile improvement, not generic activity.',
        ],
        copywritingRules: [
          'Use swipe, like, pass, match, and message language.',
          'Avoid generic social feed headings and buttons.',
          'Safety, preferences, and compatibility should feel native to the product.',
        ],
        forbiddenGenericPatterns: [
          ...GLOBAL_FORBIDDEN_GENERIC_PATTERNS,
          'generic social feed',
        ],
        specificityNotes: [
          'Discover should be built around profile cards, not around a generic content feed.',
          'Matches and conversations should feel connected to compatibility and reply timing.',
          ...profile.notes,
        ],
        screenRules: [
          makeScreenRule(
            ['onboarding', 'profile'],
            ['Build a profile that gets better matches', 'Preferences and safety settings', 'Finish profile setup'],
            ['profile', 'preference'],
            ['profile-completion'],
            ['edit-profile'],
            ['Use form copy tied to profile quality and compatibility.', 'Show preference examples, not generic settings rows.'],
            ['Settings', 'Dashboard'],
          ),
          makeScreenRule(
            ['discover', 'swipe'],
            ['Profiles you may click with', 'People matching your preferences', 'Today\'s best profile signals'],
            ['profile'],
            ['new-matches', 'profile-completion'],
            ['swipe-like', 'pass-profile'],
            ['Cards should mention personality, interests, or compatibility clues.', 'CTAs should be Like, Pass, or Message — never generic.'],
            ['Feed', 'Overview'],
          ),
          makeScreenRule(
            ['match', 'matches', 'conversation', 'message'],
            ['Matches waiting for reply', 'Conversations worth continuing', 'People who matched your vibe'],
            ['match', 'conversation'],
            ['new-matches', 'reply-waiting'],
            ['send-message'],
            ['Use conversation previews tied to real profile names.', 'Show reply timing or match freshness.'],
            ['Activity', 'Users'],
          ),
        ],
      };
    case 'gaming-casino-app':
      return {
        domainEntities: [
          makeEntity('game', 'Game', 'A demo-only game entry in the lobby or catalog.', ['Aurora Slots', 'Neon Roulette', 'Lucky Orbit']),
          makeEntity('reward', 'Reward', 'A local reward or promotion the player can claim.', ['Daily spin chest', 'Weekend leaderboard bonus']),
          makeEntity('tournament', 'Tournament', 'A local competitive event with rankings.', ['Friday night sprint', 'Beginner slots ladder']),
          makeEntity('responsibleLimit', 'Responsible gaming limit', 'A clearly mock local reminder or limit state.', ['30 min session reminder', 'Demo chip cooldown']),
        ],
        productMetrics: [
          makeMetric('demo-chips', 'Demo chips balance', 'Local mock balance for demo play only.', '24,500', ['lobby', 'games']),
          makeMetric('reward-progress', 'Rewards claimed this week', 'Local count of claimed rewards.', '4', ['lobby', 'promotions']),
          makeMetric('active-tournaments', 'Active tournaments', 'How many local tournament cards are available.', '2', ['lobby']),
        ],
        productStatuses: [
          makeStatus('demo-only', 'Demo only', 'The game uses local prototype state and no money flows.', 'Game card badge: Demo only'),
          makeStatus('claimable', 'Claimable', 'A reward can be collected locally.', 'Reward card: Claimable'),
          makeStatus('joined', 'Joined', 'The player is in the local tournament state.', 'Tournament row: Joined'),
          makeStatus('limit-set', 'Limit set', 'A responsible-gaming reminder or limit is configured.', 'Profile chip: Limit set'),
        ],
        productActions: [
          makeAction('launch-demo-play', 'Launch demo play', 'Start a local mock game session.', 'The selected game moves into demo play state.', ['lobby', 'games']),
          makeAction('claim-reward', 'Claim reward', 'Collect a local promotion or reward.', 'The reward changes state and progress updates.', ['promotions', 'lobby']),
          makeAction('join-tournament', 'Join tournament', 'Enter a local tournament state.', 'The leaderboard and joined status update locally.', ['lobby']),
          makeAction('set-session-limit', 'Set session limit', 'Configure a local responsible-gaming reminder.', 'The reminder or limit state updates locally.', ['profile']),
        ],
        vocabulary: {
          preferredTerms: uniqueStrings([...profile.preferredTerms, 'lobby', 'demo play', 'chips', 'reward', 'tournament']),
          avoidTerms: ['payment', 'real money', 'checkout', 'cart', 'store'],
          toneNotes: [...profile.toneNotes],
        },
        sampleDataRules: [
          'All balances, rewards, and tournament states must read as local mock prototype data.',
          'Use game titles, leaderboards, and reward names that fit a casino lobby.',
          'Responsible-gaming copy should be visible where relevant.',
        ],
        copywritingRules: [
          'Always imply demo play or local mock state, never real wagering.',
          'Avoid ecommerce or payment language entirely.',
          'Lobby modules should talk about games, rewards, tournaments, or limits.',
        ],
        forbiddenGenericPatterns: [
          ...GLOBAL_FORBIDDEN_GENERIC_PATTERNS,
          'store',
          'checkout',
          'real payment',
        ],
        specificityNotes: [
          'This layer is prototype-safe: no real money, no backend, no external APIs.',
          'Use lobby, games, demo chips, rewards, leaderboard, and responsible-gaming language.',
          ...profile.notes,
        ],
        screenRules: [
          makeScreenRule(
            ['lobby', '/'],
            ['Demo lobby and featured games', 'Rewards you can claim now', 'Tournament cards and chip balance'],
            ['game', 'reward', 'tournament'],
            ['demo-chips', 'reward-progress', 'active-tournaments'],
            ['launch-demo-play', 'claim-reward', 'join-tournament'],
            ['Game cards need demo-only messaging and meaningful titles.', 'Hero banners should reference rewards, tournaments, or featured games.'],
            ['Storefront', 'Products', 'Checkout'],
          ),
          makeScreenRule(
            ['games', 'detail'],
            ['Game catalog and demo play entry', 'Games by category', 'Favorites and quick launch'],
            ['game'],
            ['demo-chips'],
            ['launch-demo-play'],
            ['Use category labels like slots, table games, or crash games.', 'CTAs should mention demo play.'],
            ['Buy now', 'Add to cart'],
          ),
          makeScreenRule(
            ['promotion', 'reward', 'profile'],
            ['Rewards and local limits', 'Claimable promos and reminders', 'Responsible-gaming settings'],
            ['reward', 'responsibleLimit'],
            ['reward-progress'],
            ['claim-reward', 'set-session-limit'],
            ['Mention local reminder states and reward eligibility.', 'Keep copy clearly prototype-only where needed.'],
            ['Payments', 'Revenue'],
          ),
        ],
      };
    case 'game-interactive-app':
      return {
        domainEntities: [
          makeEntity('level', 'Level', 'A playable stage with unlock conditions and objectives.', ['Crystal Cavern', 'Signal Ridge', 'Boss Arena']),
          makeEntity('gameSession', 'Game session', 'The current local run with score, lives, or timer.', ['Run #118', 'Practice session']),
          makeEntity('inventoryItem', 'Inventory item', 'A collected or equipped gameplay item.', ['Shield charge', 'Key shard', 'Energy orb']),
          makeEntity('achievement', 'Achievement', 'A milestone the player unlocks.', ['No-hit clear', 'Combo master']),
        ],
        productMetrics: [
          makeMetric('current-score', 'Current score', 'The active score for the session.', '18,420', ['play']),
          makeMetric('lives-left', 'Lives / energy left', 'Remaining attempts or energy in the current run.', '3', ['play']),
          makeMetric('levels-unlocked', 'Levels unlocked', 'How much content is available.', '12 of 20', ['home', 'level-select']),
        ],
        productStatuses: [
          makeStatus('locked', 'Locked', 'The level is not playable yet.', 'Level card: Locked'),
          makeStatus('ready', 'Ready', 'The level or session can begin.', 'Level button: Ready'),
          makeStatus('in-run', 'In run', 'The player is actively playing.', 'HUD state: In run'),
          makeStatus('cleared', 'Cleared', 'The level is completed.', 'Level badge: Cleared'),
        ],
        productActions: [
          makeAction('select-level', 'Select level', 'Choose which stage to play next.', 'The active level card becomes selected or opens.', ['level-select', 'home']),
          makeAction('start-run', 'Start run', 'Begin gameplay locally.', 'HUD values initialize and the game state enters play mode.', ['play']),
          makeAction('use-item', 'Use item', 'Spend an inventory item during the run.', 'Inventory counts and HUD state update.', ['play']),
          makeAction('claim-achievement', 'View achievement', 'Open a newly unlocked achievement.', 'The achievement list or toast state updates.', ['home', 'play']),
        ],
        vocabulary: {
          preferredTerms: uniqueStrings([...profile.preferredTerms, 'level', 'score', 'quest', 'inventory', 'achievement']),
          avoidTerms: ['dashboard', 'analytics', 'marketing section', 'overview'],
          toneNotes: [...profile.toneNotes],
        },
        sampleDataRules: [
          'Use level names, scores, item names, and achievements that sound like gameplay.',
          'HUD values should look active and local, not like generic KPI cards.',
          'Empty states should reference locked levels or no recent achievements.',
        ],
        copywritingRules: [
          'Favor active gameplay verbs like Start run, Use item, Retry level, or Claim reward.',
          'Avoid static marketing sections or generic app copy.',
          'Progress screens should still feel game-specific with levels and achievements.',
        ],
        forbiddenGenericPatterns: [
          ...GLOBAL_FORBIDDEN_GENERIC_PATTERNS,
          'static hero',
          'generic dashboard',
        ],
        specificityNotes: [
          'The product should feel playable and stateful, not like a renamed template.',
          'Game state, HUD values, and level status should be visible on major screens.',
          ...profile.notes,
        ],
        screenRules: [
          makeScreenRule(
            ['home', 'level', 'select'],
            ['Next levels to clear', 'Unlocked stages and achievements', 'Choose your next run'],
            ['level', 'achievement'],
            ['levels-unlocked'],
            ['select-level', 'claim-achievement'],
            ['Cards should look like levels, quests, or achievements.', 'Use lock or clear states explicitly.'],
            ['Features', 'Overview'],
          ),
          makeScreenRule(
            ['play', 'game', 'detail'],
            ['Current run HUD', 'Score, energy, and active objectives', 'Inventory and session state'],
            ['gameSession', 'inventoryItem', 'achievement'],
            ['current-score', 'lives-left'],
            ['start-run', 'use-item'],
            ['The main surface should show score, lives, or active objectives.', 'Buttons should describe gameplay actions.'],
            ['Dashboard', 'Analytics'],
          ),
        ],
      };
    case 'booking-service-app':
      return {
        domainEntities: [
          makeEntity('service', 'Service', 'A bookable service with duration, price, and type.', ['Sports massage', 'Home cleaning deep reset', 'Virtual nutrition consult']),
          makeEntity('provider', 'Provider', 'The person or team delivering the service.', ['Jade Miller, LMT', 'ClearHome Team A', 'Dr. Lena Shah']),
          makeEntity('timeSlot', 'Time slot', 'A concrete available appointment window.', ['Tue 10:30 AM', 'Thu 7:00 PM']),
          makeEntity('booking', 'Booking', 'A scheduled appointment with confirmation state.', ['Booking #1042', 'Follow-up consult on Fri 3:00 PM']),
        ],
        productMetrics: [
          makeMetric('open-slots', 'Open slots this week', 'Availability that can still be booked.', '18 slots', ['home', 'booking-flow']),
          makeMetric('upcoming-bookings', 'Upcoming bookings', 'Confirmed appointments on the calendar.', '4 upcoming', ['bookings']),
          makeMetric('confirmation-needed', 'Bookings needing confirmation', 'Appointments still waiting on a final acknowledgement.', '2', ['bookings', 'booking-flow']),
        ],
        productStatuses: [
          makeStatus('available', 'Available', 'The slot is open for booking.', 'Slot badge: Available'),
          makeStatus('pending-confirmation', 'Pending confirmation', 'The booking exists but still needs confirmation.', 'Booking row: Pending confirmation'),
          makeStatus('confirmed', 'Confirmed', 'The appointment is ready.', 'Booking chip: Confirmed'),
          makeStatus('cancelled', 'Cancelled', 'The appointment was cancelled locally.', 'Booking row: Cancelled'),
        ],
        productActions: [
          makeAction('choose-slot', 'Choose time slot', 'Pick a bookable time that fits the schedule.', 'The selected slot state updates immediately.', ['home', 'booking-flow']),
          makeAction('confirm-booking', 'Confirm booking', 'Lock in the appointment locally.', 'The booking list updates with a confirmed state.', ['booking-flow', 'bookings']),
          makeAction('cancel-booking', 'Cancel booking', 'Remove or cancel the upcoming appointment.', 'The booking status becomes cancelled and metrics update.', ['bookings']),
        ],
        vocabulary: {
          preferredTerms: uniqueStrings([...profile.preferredTerms, 'service', 'provider', 'slot', 'booking', 'confirmation']),
          avoidTerms: ['cart', 'checkout', 'product', 'store'],
          toneNotes: [...profile.toneNotes],
        },
        sampleDataRules: [
          'Services need provider names, durations, and bookable slot times.',
          'Bookings should show confirmation state, reminder timing, and service context.',
          'Empty states should mention upcoming appointments or no slots left.',
        ],
        copywritingRules: [
          'Use provider, availability, slot, booking, reminder, and confirmation language.',
          'Do not use ecommerce-only cart or checkout terminology.',
          'Buttons should talk about booking outcomes, not generic submissions.',
        ],
        forbiddenGenericPatterns: [
          ...GLOBAL_FORBIDDEN_GENERIC_PATTERNS,
          'cart',
          'checkout',
        ],
        specificityNotes: [
          'Major screens should show services, providers, slots, or bookings.',
          'Availability and booking state should be visible in metrics and empty states.',
          ...profile.notes,
        ],
        screenRules: [
          makeScreenRule(
            ['home', 'service', '/'],
            ['Services with open slots', 'Providers available this week', 'Book by time and provider'],
            ['service', 'provider', 'timeSlot'],
            ['open-slots'],
            ['choose-slot'],
            ['Show provider names and availability alongside services.', 'Cards should reference slot times or durations.'],
            ['Storefront', 'Products'],
          ),
          makeScreenRule(
            ['book', 'slot', 'flow', 'form'],
            ['Choose your time slot', 'Confirm the appointment details', 'Booking step and reminder setup'],
            ['service', 'provider', 'timeSlot', 'booking'],
            ['open-slots', 'confirmation-needed'],
            ['choose-slot', 'confirm-booking'],
            ['Use concrete appointment copy with times and provider names.', 'Primary buttons should mention booking or confirmation.'],
            ['Checkout', 'Submit form'],
          ),
          makeScreenRule(
            ['booking', 'bookings', 'confirm'],
            ['Upcoming bookings and confirmations', 'Appointments needing a response', 'Booking history by provider'],
            ['booking', 'provider'],
            ['upcoming-bookings', 'confirmation-needed'],
            ['confirm-booking', 'cancel-booking'],
            ['Rows should mention service type, provider, and appointment time.', 'Empty states should mention no upcoming bookings yet.'],
            ['Activity', 'Reports'],
          ),
        ],
      };
    case 'content-learning-app':
      return {
        domainEntities: [
          makeEntity('course', 'Course', 'A structured learning path with lessons and progress.', ['Product analytics fundamentals', 'Spanish for travel', 'React state management']),
          makeEntity('lesson', 'Lesson', 'A concrete learning unit that can be continued or completed.', ['Lesson 3: Funnel breakdown', 'Practice set: travel phrases']),
          makeEntity('quiz', 'Quiz', 'A knowledge check tied to a lesson or module.', ['Checkpoint quiz #2', 'Module review quiz']),
          makeEntity('learningProgress', 'Learning progress', 'The learner\'s completion, streak, and next-step state.', ['Week streak: 5', 'Module progress: 3/6']),
        ],
        productMetrics: [
          makeMetric('lesson-completion', 'Today\'s lesson completion', 'How much learning was completed today.', '2 lessons', ['catalog', 'progress']),
          makeMetric('quiz-accuracy', 'Quiz accuracy', 'The learner\'s current answer accuracy.', '88%', ['lesson-player', 'progress']),
          makeMetric('study-streak', 'Study streak', 'Consecutive days with learning activity.', '9 days', ['catalog', 'progress']),
        ],
        productStatuses: [
          makeStatus('not-started', 'Not started', 'The lesson or module has not been opened yet.', 'Lesson row: Not started'),
          makeStatus('in-progress', 'In progress', 'The learner has started but not completed it.', 'Lesson badge: In progress'),
          makeStatus('completed', 'Completed', 'The learner finished the lesson or quiz.', 'Module chip: Completed'),
          makeStatus('needs-review', 'Needs review', 'The learner should revisit this content.', 'Quiz state: Needs review'),
        ],
        productActions: [
          makeAction('continue-lesson', 'Continue lesson', 'Resume the next relevant lesson.', 'The lesson player state changes to the selected lesson.', ['catalog', 'lesson-player']),
          makeAction('start-quiz', 'Start quiz', 'Open a lesson or module knowledge check.', 'Quiz state and lesson context update locally.', ['lesson-player']),
          makeAction('mark-complete', 'Mark complete', 'Finish the lesson or module.', 'Progress and streak metrics refresh.', ['lesson-player', 'progress']),
        ],
        vocabulary: {
          preferredTerms: uniqueStrings([...profile.preferredTerms, 'course', 'lesson', 'module', 'quiz', 'streak']),
          avoidTerms: ['article feed', 'content dashboard', 'overview', 'activity'],
          toneNotes: [...profile.toneNotes],
        },
        sampleDataRules: [
          'Courses and lessons should have believable titles and learning progression.',
          'Quiz entries should mention accuracy, retries, or module checkpoints.',
          'Empty states should mention the next lesson, streak, or incomplete module.',
        ],
        copywritingRules: [
          'Use continue lesson, start quiz, mark complete, and streak language.',
          'Avoid treating the app like a static content feed.',
          'Metrics should refer to lesson completion, quiz accuracy, or streaks.',
        ],
        forbiddenGenericPatterns: [
          ...GLOBAL_FORBIDDEN_GENERIC_PATTERNS,
          'article feed',
          'content dashboard',
        ],
        specificityNotes: [
          'The product should clearly feel like a learner journey with progress, not a content repository.',
          'Major screens should show courses, lessons, modules, quizzes, or streak states.',
          ...profile.notes,
        ],
        screenRules: [
          makeScreenRule(
            ['catalog', 'home', 'course', '/'],
            ['Continue your next lesson', 'Courses to keep your streak alive', 'Modules that need attention'],
            ['course', 'lesson', 'learningProgress'],
            ['lesson-completion', 'study-streak'],
            ['continue-lesson'],
            ['Cards should show progress and next lesson context.', 'Use streak or completion signals in the hero area.'],
            ['Feed', 'Overview'],
          ),
          makeScreenRule(
            ['lesson', 'player', 'detail'],
            ['Current lesson and quiz checkpoint', 'Lesson player and notes', 'Next step after this module'],
            ['lesson', 'quiz', 'learningProgress'],
            ['quiz-accuracy'],
            ['continue-lesson', 'start-quiz', 'mark-complete'],
            ['Primary CTA should be Continue lesson, Start quiz, or Mark complete.', 'Show progress within the lesson, not generic stats cards.'],
            ['Analytics', 'Reports'],
          ),
          makeScreenRule(
            ['progress'],
            ['Study streak and module completion', 'Quiz accuracy over recent lessons', 'What still needs review'],
            ['course', 'learningProgress'],
            ['lesson-completion', 'quiz-accuracy', 'study-streak'],
            ['mark-complete'],
            ['Progress modules should mention courses or modules by name.', 'Empty states should talk about no lessons completed yet, not no activity.'],
            ['Activity', 'Dashboard'],
          ),
        ],
      };
    case 'ecommerce':
      return {
        domainEntities: [
          makeEntity('product', 'Product', 'A catalog item with variants and stock.', ['Carbon trail shoe', 'Stoneware serving set', 'Compact espresso grinder']),
          makeEntity('variant', 'Variant', 'A purchasable option such as size or color.', ['Size 42 / Moss', 'Matte black / 64mm burr']),
          makeEntity('cartLine', 'Cart line', 'A selected product variant in the cart.', ['2x Size 42 / Moss']),
          makeEntity('order', 'Order', 'A recent or in-progress checkout result.', ['Order #40218', 'Express order #40192']),
        ],
        productMetrics: [
          makeMetric('cart-total', 'Cart total', 'Current subtotal or total for the cart.', '$186', ['cart', 'checkout-favorites']),
          makeMetric('low-stock', 'Low-stock variants', 'Variants that are nearly unavailable.', '6 variants', ['storefront', 'product-detail']),
          makeMetric('delivery-status', 'Orders out for delivery', 'Recent orders currently moving.', '3 orders', ['profile-orders']),
        ],
        productStatuses: [
          makeStatus('in-stock', 'In stock', 'The variant is available for purchase.', 'Variant label: In stock'),
          makeStatus('low-stock', 'Low stock', 'The variant is almost sold out.', 'PDP badge: Low stock'),
          makeStatus('processing', 'Processing', 'The order is being prepared.', 'Order row: Processing'),
          makeStatus('out-for-delivery', 'Out for delivery', 'The order is on the way.', 'Order state: Out for delivery'),
        ],
        productActions: [
          makeAction('choose-variant', 'Choose variant', 'Select the product option before adding to cart.', 'The active variant and pricing state update.', ['product-detail']),
          makeAction('add-to-cart', 'Add to cart', 'Put the selected variant into the cart.', 'Cart lines and totals update locally.', ['storefront', 'product-detail']),
          makeAction('checkout-order', 'Continue to checkout', 'Advance toward a local checkout confirmation.', 'Checkout state opens and order summary updates.', ['cart', 'checkout-favorites']),
        ],
        vocabulary: {
          preferredTerms: uniqueStrings([...profile.preferredTerms, 'product', 'variant', 'cart', 'stock', 'order']),
          avoidTerms: ['marketplace', 'seller', 'offer', 'dashboard'],
          toneNotes: [...profile.toneNotes],
        },
        sampleDataRules: [
          'Products should have believable names, prices, variants, and stock cues.',
          'Cart lines and orders should reflect real variant and delivery states.',
          'Empty states should mention cart, wishlist, or order history in commerce terms.',
        ],
        copywritingRules: [
          'Use product, variant, cart, order, stock, and delivery language.',
          'Do not use marketplace vocabulary unless the marketplace skeleton is selected.',
          'Metrics should reflect stock, delivery, or cart value, not generic users or growth.',
        ],
        forbiddenGenericPatterns: [
          ...GLOBAL_FORBIDDEN_GENERIC_PATTERNS,
          'marketplace',
          'seller dashboard',
        ],
        specificityNotes: [
          'Storefront screens should feel like commerce, with products and variants, not a generic template.',
          'PDP, cart, and orders must use real stock and delivery states.',
          ...profile.notes,
        ],
        screenRules: [
          makeScreenRule(
            ['storefront', '/'],
            ['Products in stock now', 'Editor picks with live stock', 'Categories worth browsing today'],
            ['product', 'variant'],
            ['low-stock'],
            ['add-to-cart'],
            ['Cards should show price, variant cue, or stock status.', 'Hero copy should still talk about products, not platform benefits.'],
            ['Marketplace', 'Dashboard'],
          ),
          makeScreenRule(
            ['product', 'detail'],
            ['Choose the right variant', 'Product detail and stock state', 'Delivery and review cues'],
            ['product', 'variant'],
            ['low-stock'],
            ['choose-variant', 'add-to-cart'],
            ['Primary CTA should name Add to cart or a variant-selection outcome.', 'Stock and delivery status should be visible.'],
            ['Offer', 'Message seller'],
          ),
          makeScreenRule(
            ['cart', 'checkout', 'order', 'profile'],
            ['Cart lines and delivery summary', 'Continue to checkout', 'Recent orders and shipping state'],
            ['cartLine', 'order'],
            ['cart-total', 'delivery-status'],
            ['checkout-order'],
            ['Rows should mention variant names and order status.', 'Empty states should reference an empty cart or no recent orders.'],
            ['Analytics', 'Overview'],
          ),
        ],
      };
    case 'productivity-tool':
      return {
        domainEntities: [
          makeEntity('task', 'Task', 'A unit of work with owner, due date, and blocker state.', ['Ship onboarding checklist', 'Review launch copy', 'Fix billing edge case']),
          makeEntity('project', 'Project', 'A grouped initiative with milestones and work status.', ['Q3 launch sprint', 'Customer migration plan', 'Ops cleanup week']),
          makeEntity('milestone', 'Milestone', 'A time-bound target inside a project.', ['Beta launch', 'Migration complete']),
          makeEntity('blocker', 'Blocker', 'Something preventing a task or milestone from moving.', ['Waiting on design sign-off', 'Vendor spec missing']),
        ],
        productMetrics: [
          makeMetric('tasks-due-soon', 'Tasks due soon', 'Work about to require attention.', '11', ['workspace', 'tasks']),
          makeMetric('blocked-work', 'Blocked work', 'Tasks or projects with blockers.', '4 blockers', ['workspace', 'projects']),
          makeMetric('milestones-this-week', 'Milestones due this week', 'Upcoming milestone commitments.', '3', ['projects']),
        ],
        productStatuses: [
          makeStatus('not-started', 'Not started', 'Work has not begun yet.', 'Task badge: Not started'),
          makeStatus('in-progress', 'In progress', 'Work is actively being done.', 'Task row: In progress'),
          makeStatus('blocked', 'Blocked', 'The task cannot move without help.', 'Task chip: Blocked'),
          makeStatus('complete', 'Complete', 'The task or milestone is done.', 'Milestone state: Complete'),
        ],
        productActions: [
          makeAction('create-task', 'Create task', 'Add new work locally.', 'A new task appears in the current view.', ['workspace', 'tasks']),
          makeAction('complete-task', 'Mark complete', 'Finish a task or milestone.', 'Status changes and progress counts update.', ['tasks', 'projects']),
          makeAction('reassign-owner', 'Reassign owner', 'Change who owns the work.', 'Owner field updates and filters reflect the change.', ['workspace', 'projects']),
          makeAction('filter-blocked', 'Filter blocked work', 'Focus on blocked tasks or milestones.', 'Visible rows narrow to blocked work.', ['workspace']),
        ],
        vocabulary: {
          preferredTerms: uniqueStrings([...profile.preferredTerms, 'task', 'project', 'milestone', 'owner', 'blocker']),
          avoidTerms: ['dashboard', 'analytics', 'manage everything', 'overview'],
          toneNotes: [...profile.toneNotes],
        },
        sampleDataRules: [
          'Tasks should have owners, due dates, and blocker notes.',
          'Projects should include milestones and progress states that feel real.',
          'Empty states should mention no blocked work, no due tasks, or no milestone risk.',
        ],
        copywritingRules: [
          'Use create, update, complete, reassign, and filter vocabulary.',
          'Avoid generic dashboard labels detached from work.',
          'Major screens should reference tasks, projects, milestones, priorities, or blockers.',
        ],
        forbiddenGenericPatterns: [
          ...GLOBAL_FORBIDDEN_GENERIC_PATTERNS,
          'generic dashboard',
        ],
        specificityNotes: [
          'The workspace must feel like a task and project tool, not a generic admin shell.',
          'At least one primary view should show blockers, due dates, or milestones.',
          ...profile.notes,
        ],
        screenRules: [
          makeScreenRule(
            ['workspace', '/'],
            ['Tasks due soon and blocked work', 'What the team needs to unblock today', 'Owner workload and milestone risk'],
            ['task', 'project', 'blocker'],
            ['tasks-due-soon', 'blocked-work'],
            ['create-task', 'filter-blocked'],
            ['Show a queue or board, not only cards.', 'Use blocker and due-date language in filters.'],
            ['Dashboard', 'Analytics'],
          ),
          makeScreenRule(
            ['project', 'task'],
            ['Projects and milestone commitments', 'Tasks by owner and priority', 'Blocked work by project'],
            ['task', 'project', 'milestone'],
            ['blocked-work', 'milestones-this-week'],
            ['complete-task', 'reassign-owner'],
            ['Rows or cards should include owner, due date, and status.', 'Use task or milestone action labels.'],
            ['Overview', 'Activity'],
          ),
        ],
      };
    case 'social-community':
      return {
        domainEntities: [
          makeEntity('post', 'Post', 'A member or creator update with reactions and comments.', ['Trail recap with photos', 'Studio desk setup tip', 'Weekly challenge invite']),
          makeEntity('creator', 'Creator', 'A person producing posts or leading a group.', ['Mina Moves', 'CafeSketch Club', 'Noah Trails']),
          makeEntity('group', 'Group', 'A themed member space inside the community.', ['Morning runners', 'Tiny studio creators']),
          makeEntity('messageThread', 'Message thread', 'A direct message or group message conversation.', ['Mina collaboration chat', 'Weekend meetup thread']),
        ],
        productMetrics: [
          makeMetric('new-posts', 'New posts in your groups', 'Fresh activity where the member follows content.', '16 posts', ['feed-home', 'discover']),
          makeMetric('creator-replies', 'Replies from followed creators', 'Response signals that matter to the member.', '5 replies', ['feed-home', 'messages']),
          makeMetric('saved-posts', 'Saved posts', 'Content the member kept for later.', '12 saved', ['profile']),
        ],
        productStatuses: [
          makeStatus('live', 'Live', 'The post or thread is active and current.', 'Post badge: Live'),
          makeStatus('saved', 'Saved', 'The member bookmarked the post.', 'Post action: Saved'),
          makeStatus('following', 'Following', 'The member follows the creator or group.', 'Creator state: Following'),
          makeStatus('unread', 'Unread', 'There are unseen messages or updates.', 'Thread badge: Unread'),
        ],
        productActions: [
          makeAction('create-post', 'Create post', 'Publish a new update into the community.', 'The post appears in the feed locally.', ['create-post', 'feed-home']),
          makeAction('like-post', 'Like post', 'React to a post.', 'Reaction counts and button state update.', ['feed-home', 'discover']),
          makeAction('follow-creator', 'Follow creator', 'Follow a creator or group.', 'Follow state updates locally and affects discovery.', ['discover', 'profile']),
          makeAction('message-member', 'Message member', 'Open or continue a message thread.', 'A thread opens and message preview updates.', ['messages']),
        ],
        vocabulary: {
          preferredTerms: uniqueStrings([...profile.preferredTerms, 'post', 'creator', 'group', 'reaction', 'message']),
          avoidTerms: ['dashboard', 'reports', 'analytics', 'all-in-one'],
          toneNotes: [...profile.toneNotes],
        },
        sampleDataRules: [
          'Posts should include creator names, reaction counts, and believable post content.',
          'Groups and messages should reference community themes or member relationships.',
          'Empty states should mention no saved posts, no new group posts, or no unread threads.',
        ],
        copywritingRules: [
          'Use create post, like, save, follow, comment, and message language.',
          'Avoid treating the product as a static content feed.',
          'Discovery should still mention creators, groups, or members directly.',
        ],
        forbiddenGenericPatterns: [
          ...GLOBAL_FORBIDDEN_GENERIC_PATTERNS,
          'generic content feed',
        ],
        specificityNotes: [
          'Major surfaces should feel like member activity, not generic content walls.',
          'Posts, creators, groups, and messages should all have local stateful meaning.',
          ...profile.notes,
        ],
        screenRules: [
          makeScreenRule(
            ['feed', 'home', '/'],
            ['New posts from groups you follow', 'Creator updates worth reacting to', 'Saved and trending posts in your circles'],
            ['post', 'creator', 'group'],
            ['new-posts', 'creator-replies'],
            ['create-post', 'like-post'],
            ['Feed cards should mention creator or group names.', 'Use reaction and comment copy, not generic activity summaries.'],
            ['Dashboard', 'Overview'],
          ),
          makeScreenRule(
            ['discover', 'profile'],
            ['Creators and groups to follow', 'Community profile and saved posts', 'People and spaces matching your interests'],
            ['creator', 'group', 'post'],
            ['saved-posts'],
            ['follow-creator'],
            ['Discovery should show real creators or groups, not empty tiles.', 'Profile should surface saved posts or followed spaces.'],
            ['Users', 'Reports'],
          ),
          makeScreenRule(
            ['message', 'messages'],
            ['Unread member threads', 'Messages from creators and groups', 'Conversation list by community context'],
            ['messageThread', 'creator'],
            ['creator-replies'],
            ['message-member'],
            ['Threads should look tied to community relationships.', 'Empty states should mention no unread messages yet.'],
            ['Analytics', 'Activity'],
          ),
        ],
      };
    case 'landing-page':
      return {
        domainEntities: [
          makeEntity('productClaim', 'Product claim', 'A concrete outcome or promise the page makes.', ['Reduce review backlog by noon', 'Ship campaign drafts without render chaos']),
          makeEntity('proofPoint', 'Proof point', 'A believable customer or workflow proof item.', ['QA team cut blocked approvals by 34%', 'Creator ships three edits before lunch']),
          makeEntity('ctaPath', 'CTA path', 'A next-step offer the visitor can take.', ['See a live queue walkthrough', 'Start with the render checklist']),
        ],
        productMetrics: [
          makeMetric('time-saved', 'Time saved in the workflow', 'A concrete product outcome framed as proof.', '3 hours back each week', ['hero', 'product-preview']),
          makeMetric('proof-count', 'Teams already using this workflow', 'Visible proof that the category is real.', '42 teams', ['social-proof-cta']),
        ],
        productStatuses: [
          makeStatus('problem-now', 'Problem now', 'The current pain state for the visitor.', 'Hero callout: Reviews pile up every morning'),
          makeStatus('workflow-ready', 'Workflow ready', 'The product can solve the shown use case.', 'Preview badge: Workflow ready'),
          makeStatus('cta-open', 'CTA open', 'The visitor can take the next concrete step.', 'CTA state: Book a walkthrough'),
        ],
        productActions: [
          makeAction('see-product-preview', 'See product preview', 'Inspect the core workflow or UI proof.', 'The visitor moves into a concrete product section.', ['hero', 'product-preview']),
          makeAction('start-demo', 'Start demo', 'Take the main conversion action.', 'CTA section becomes the clear next step.', ['hero', 'social-proof-cta']),
          makeAction('compare-proof', 'Compare proof', 'Review examples, outcomes, or testimonials.', 'Proof content toggles or expands locally.', ['social-proof-cta']),
        ],
        vocabulary: {
          preferredTerms: uniqueStrings([...profile.preferredTerms, 'problem', 'workflow', 'proof', 'preview', 'CTA']),
          avoidTerms: ['all-in-one', 'boost productivity', 'powerful platform', 'seamless experience'],
          toneNotes: [...profile.toneNotes],
        },
        sampleDataRules: [
          'Use concrete workflow claims and proof statements instead of generic marketing filler.',
          'Product preview text should name the specific screen, queue, render, lesson, listing, or booking being shown.',
          'CTA copy should describe a specific next step, not a generic sign-up promise.',
        ],
        copywritingRules: [
          'Hero, value prop, proof, and CTA copy must all stay tied to one real product category.',
          'Avoid generic all-in-one and productivity slogans unless they are grounded in a concrete workflow.',
          'Use product previews, proof, and CTA labels that match the inferred domain.',
        ],
        forbiddenGenericPatterns: [
          ...GLOBAL_FORBIDDEN_GENERIC_PATTERNS,
          'All-in-one platform',
          'Boost productivity',
          'Powerful analytics',
        ],
        specificityNotes: [
          'This page should sell one real workflow, not a universal platform.',
          'Hero claims, product preview, proof, and CTA must all reinforce the same category.',
          ...profile.notes,
        ],
        screenRules: [
          makeScreenRule(
            ['hero', '/'],
            ['The workflow problem this product fixes', 'Why this category-specific tool exists', 'A concrete hero tied to one product niche'],
            ['productClaim', 'ctaPath'],
            ['time-saved'],
            ['see-product-preview', 'start-demo'],
            ['Use one clear pain statement and one concrete CTA.', 'Hero subcopy should mention the actual workflow, not abstract productivity.'],
            ['All-in-one platform', 'Boost productivity', 'Powerful platform'],
          ),
          makeScreenRule(
            ['preview', 'product', 'feature', 'value'],
            ['How the workflow looks in practice', 'A product preview tied to the core job', 'Screens that prove the niche'],
            ['productClaim', 'proofPoint'],
            ['time-saved'],
            ['see-product-preview'],
            ['Preview sections should mention specific screens, actions, or outcomes.', 'If showing metrics, tie them directly to the workflow.'],
            ['Features', 'Analytics', 'Overview'],
          ),
          makeScreenRule(
            ['cta', 'proof', 'social'],
            ['Proof from teams using this workflow', 'Examples that make the CTA believable', 'The next concrete step to try this product'],
            ['proofPoint', 'ctaPath'],
            ['proof-count'],
            ['start-demo', 'compare-proof'],
            ['Proof should reference realistic customer or workflow outcomes.', 'CTA buttons should describe the real next step.'],
            ['Welcome back', 'Manage everything'],
          ),
        ],
      };
  }
}

function knownSkeletonId(skeletonId: string): KnownSkeletonId {
  const known: KnownSkeletonId[] = [
    'mobile-app',
    'saas-dashboard',
    'landing-page',
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
  ];
  return known.includes(skeletonId as KnownSkeletonId) ? skeletonId as KnownSkeletonId : 'landing-page';
}

function collectArchitectDataModel(architectPlan?: unknown): string | null {
  if (!architectPlan || typeof architectPlan !== 'object') return null;
  const dataModel = (architectPlan as { dataModel?: unknown }).dataModel;
  return typeof dataModel === 'string' && dataModel.trim().length > 0 ? dataModel.trim() : null;
}

export function buildProductSpecificityPlan(input: {
  brief: string;
  skeletonId: string;
  screenCompositionPlan?: ScreenCompositionPlan;
  functionalFlowPlan?: FunctionalFlowPlan;
  skeletonIntegrationPlan?: SkeletonIntegrationPlan;
  premiumComponentIds?: string[];
  mediaHints?: MediaHint[];
  architectPlan?: unknown;
}): ProductSpecificityPlan {
  const skeletonId = knownSkeletonId(input.skeletonId);
  const screens = getScreens({
    skeletonId,
    screenCompositionPlan: input.screenCompositionPlan,
  });
  const productType = getProductType(input);
  const profile = pickDomainProfile(skeletonId, input.brief);
  const template = buildTemplate(skeletonId, profile);
  const entityMap = functionalEntityMap(input.functionalFlowPlan);
  const domainEntities = template.domainEntities.map(seed =>
    mergeEntityFields(seed, findFunctionalEntity(entityMap, seed)),
  );
  const screenSpecificContent = buildScreenSpecificContent(
    screens,
    template.screenRules,
    domainEntities,
    template.productMetrics,
    template.productActions,
  );
  const architectDataModel = collectArchitectDataModel(input.architectPlan);
  const premiumCount = input.premiumComponentIds?.length ?? 0;
  const mediaCount = input.mediaHints?.length ?? 0;

  return {
    productType,
    skeletonId,
    inferredDomain: profile.inferredDomain,
    targetUserRole: profile.targetUserRole,
    primaryJobToBeDone: profile.primaryJobToBeDone,
    domainEntities,
    productMetrics: template.productMetrics,
    productStatuses: template.productStatuses,
    productActions: template.productActions,
    vocabulary: template.vocabulary,
    screenSpecificContent,
    sampleDataRules: uniqueStrings([
      ...template.sampleDataRules,
      premiumCount > 0 ? 'Premium surfaces still need domain-specific data, labels, and actions.' : null,
      mediaCount > 0 ? 'Generated media should support the product category, not act as generic decoration.' : null,
    ]),
    copywritingRules: uniqueStrings([
      ...template.copywritingRules,
      'Discourage standalone labels like "Analytics", "Insights", "Overview", or "Dashboard" unless they are qualified by the product domain.',
      'Empty states must mention the product entity or next action that belongs on that screen.',
    ]),
    forbiddenGenericPatterns: [...template.forbiddenGenericPatterns],
    specificityNotes: uniqueStrings([
      ...template.specificityNotes,
      architectDataModel ? `Architect data model hint: ${architectDataModel}` : null,
      input.skeletonIntegrationPlan ? `Skeleton fit: ${input.skeletonIntegrationPlan.skeletonFit}` : null,
      premiumCount > 0 ? `Premium components selected: ${premiumCount}` : null,
      mediaCount > 0 ? `Generated media hints selected: ${mediaCount}` : null,
    ]),
  };
}

export function buildProductSpecificityPromptBlock(plan: ProductSpecificityPlan): string {
  const lines: string[] = [];

  lines.push('PRODUCT_SPECIFICITY_PLAN:');
  if (plan.productType) lines.push(`productType: ${plan.productType}`);
  lines.push(`skeletonId: ${plan.skeletonId}`);
  lines.push(`inferredDomain: ${plan.inferredDomain}`);
  lines.push(`targetUserRole: ${plan.targetUserRole}`);
  lines.push(`primaryJobToBeDone: ${plan.primaryJobToBeDone}`);
  lines.push('');

  lines.push('DOMAIN_ENTITIES:');
  for (const entity of plan.domainEntities) {
    lines.push(`  - id: ${entity.id}`);
    lines.push(`    label: ${entity.label}`);
    lines.push(`    description: ${entity.description}`);
    lines.push(`    sampleNames: ${entity.sampleNames.join(', ') || '(none)'}`);
    lines.push('    fields:');
    for (const field of entity.fields) {
      lines.push(`      - ${field.name} (${field.type}) example=${field.example}`);
    }
  }
  lines.push('');

  lines.push('PRODUCT_METRICS:');
  for (const metric of plan.productMetrics) {
    lines.push(`  - id: ${metric.id}`);
    lines.push(`    label: ${metric.label}`);
    lines.push(`    meaning: ${metric.meaning}`);
    lines.push(`    exampleValue: ${metric.exampleValue}`);
    lines.push(`    shouldAppearOnScreens: ${metric.shouldAppearOnScreens.join(', ')}`);
  }
  lines.push('');

  lines.push('PRODUCT_STATUSES:');
  for (const status of plan.productStatuses) {
    lines.push(`  - id: ${status.id}`);
    lines.push(`    label: ${status.label}`);
    lines.push(`    meaning: ${status.meaning}`);
    lines.push(`    exampleUsage: ${status.exampleUsage}`);
  }
  lines.push('');

  lines.push('PRODUCT_ACTIONS:');
  for (const action of plan.productActions) {
    lines.push(`  - id: ${action.id}`);
    lines.push(`    label: ${action.label}`);
    lines.push(`    userIntent: ${action.userIntent}`);
    lines.push(`    expectedVisibleResult: ${action.expectedVisibleResult}`);
    lines.push(`    shouldAppearOnScreens: ${action.shouldAppearOnScreens.join(', ')}`);
  }
  lines.push('');

  lines.push('VOCABULARY:');
  lines.push(`  preferredTerms: ${plan.vocabulary.preferredTerms.join(', ')}`);
  lines.push(`  avoidTerms: ${plan.vocabulary.avoidTerms.join(', ')}`);
  lines.push(`  toneNotes: ${plan.vocabulary.toneNotes.join(' | ')}`);
  lines.push('');

  lines.push('SCREEN_SPECIFIC_CONTENT:');
  for (const screen of plan.screenSpecificContent) {
    lines.push(`  - screenId: ${screen.screenId}`);
    lines.push(`    concreteTitleSuggestions: ${screen.concreteTitleSuggestions.join(' | ')}`);
    lines.push(`    requiredEntities: ${screen.requiredEntities.join(', ') || '(none)'}`);
    lines.push(`    requiredMetrics: ${screen.requiredMetrics.join(', ') || '(none)'}`);
    lines.push(`    requiredActions: ${screen.requiredActions.join(', ') || '(none)'}`);
    lines.push(`    copyHints: ${screen.copyHints.join(' | ') || '(none)'}`);
    lines.push(`    avoidOnThisScreen: ${screen.avoidOnThisScreen.join(' | ') || '(none)'}`);
  }
  lines.push('');

  lines.push('SAMPLE_DATA_RULES:');
  for (const rule of plan.sampleDataRules) {
    lines.push(`  - ${rule}`);
  }
  lines.push('');

  lines.push('COPYWRITING_RULES:');
  for (const rule of plan.copywritingRules) {
    lines.push(`  - ${rule}`);
  }
  lines.push('');

  lines.push('FORBIDDEN_GENERIC_PATTERNS:');
  for (const pattern of plan.forbiddenGenericPatterns) {
    lines.push(`  - ${pattern}`);
  }
  lines.push('');

  if (plan.specificityNotes.length > 0) {
    lines.push('SPECIFICITY_NOTES:');
    for (const note of plan.specificityNotes) {
      lines.push(`  - ${note}`);
    }
    lines.push('');
  }

  lines.push('CODER_INSTRUCTIONS:');
  lines.push('- Use the product specificity plan before writing screen copy and sample data.');
  lines.push('- Every major screen must include product-specific entities, actions, statuses, or metrics.');
  lines.push('- Do not use generic placeholders such as Feature 1, AppName, Product, Lorem, or Coming soon.');
  lines.push('- Do not create empty KPI cards with generic labels.');
  lines.push('- Do not use generic analytics, insights, or dashboard copy unless it is qualified by the product domain.');
  lines.push('- Sample data must look like it belongs to this product category.');
  lines.push('- Button labels must describe real product actions.');
  lines.push('- Empty states must be product-specific.');
  lines.push('- Screen titles must be specific to the product, not generic template labels.');
  lines.push('- Preserve skeleton structure and follow SCREEN_COMPOSITION_PLAN, FUNCTIONAL_FLOW_PLAN, and SKELETON_INTEGRATION_PLAN.');

  return lines.join('\n');
}

export function serializeProductSpecificityPlan(
  plan: ProductSpecificityPlan,
): ProductSpecificityPlanTelemetry {
  return {
    product_type: plan.productType,
    skeleton_id: plan.skeletonId,
    inferred_domain: plan.inferredDomain,
    target_user_role: plan.targetUserRole,
    primary_job_to_be_done: plan.primaryJobToBeDone,
    domain_entities: plan.domainEntities.map(entity => ({
      id: entity.id,
      label: entity.label,
      description: entity.description,
      fields: entity.fields.map(field => ({
        name: field.name,
        type: field.type,
        example: field.example,
      })),
      sample_names: entity.sampleNames,
    })),
    product_metrics: plan.productMetrics.map(metric => ({
      id: metric.id,
      label: metric.label,
      meaning: metric.meaning,
      example_value: metric.exampleValue,
      should_appear_on_screens: metric.shouldAppearOnScreens,
    })),
    product_statuses: plan.productStatuses.map(status => ({
      id: status.id,
      label: status.label,
      meaning: status.meaning,
      example_usage: status.exampleUsage,
    })),
    product_actions: plan.productActions.map(action => ({
      id: action.id,
      label: action.label,
      user_intent: action.userIntent,
      expected_visible_result: action.expectedVisibleResult,
      should_appear_on_screens: action.shouldAppearOnScreens,
    })),
    vocabulary: {
      preferred_terms: plan.vocabulary.preferredTerms,
      avoid_terms: plan.vocabulary.avoidTerms,
      tone_notes: plan.vocabulary.toneNotes,
    },
    screen_specific_content: plan.screenSpecificContent.map(screen => ({
      screen_id: screen.screenId,
      concrete_title_suggestions: screen.concreteTitleSuggestions,
      required_entities: screen.requiredEntities,
      required_metrics: screen.requiredMetrics,
      required_actions: screen.requiredActions,
      copy_hints: screen.copyHints,
      avoid_on_this_screen: screen.avoidOnThisScreen,
    })),
    sample_data_rules: plan.sampleDataRules,
    copywriting_rules: plan.copywritingRules,
    forbidden_generic_patterns: plan.forbiddenGenericPatterns,
    specificity_notes: plan.specificityNotes,
  };
}

function normalizeSignalTerm(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_:/()[\],.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function toSearchTerms(values: string[]): string[] {
  return uniqueStrings(
    values.flatMap((value) => {
      const normalized = normalizeSignalTerm(value);
      const identifiers = value.match(/[A-Za-z][A-Za-z0-9]+/g) ?? [];
      return [
        normalized,
        ...normalized.split(/\s+/),
        ...identifiers.map(identifier => identifier.toLowerCase()),
      ];
    }).filter(term => term.length >= 3 && !STOP_WORDS.has(term)),
  );
}

function isSpecificityScanFile(path: string): boolean {
  const normalized = normalizeOutputPath(path);
  if (!/\.(?:ts|tsx)$/.test(normalized)) return false;
  if (normalized.startsWith('design-pack/')) return false;
  if (normalized.startsWith('assets/generated/')) return false;
  if (normalized.includes('__tests__/')) return false;
  if (/\.(?:test|spec)\.tsx?$/.test(normalized)) return false;
  return true;
}

function collectPatternFindings(
  files: Array<[string, string]>,
  patterns: ReadonlyArray<{ label: string; rx: RegExp }>,
): string[] {
  return uniqueStrings(
    files.flatMap(([path, content]) =>
      patterns.flatMap(pattern => {
        const matches = Array.from(content.matchAll(new RegExp(pattern.rx.source, pattern.rx.flags.includes('g') ? pattern.rx.flags : `${pattern.rx.flags}g`)));
        return matches.map(() => `${normalizeOutputPath(path)}: ${pattern.label}`);
      }),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function collectPlanSignals(
  files: Array<[string, string]>,
  descriptors: Array<{ label: string; terms: string[] }>,
): string[] {
  const entries = files.map(([path, content]) => [normalizeOutputPath(path), content.toLowerCase()] as const);
  return uniqueStrings(
    descriptors.flatMap(descriptor => {
      const terms = toSearchTerms(descriptor.terms);
      return entries
        .filter(([, content]) => terms.some(term => content.includes(term)))
        .map(([path]) => `${path}: ${descriptor.label}`);
    }),
  ).sort((a, b) => a.localeCompare(b));
}

function collectGenericKpiFindings(files: Array<[string, string]>): string[] {
  return uniqueStrings(
    files.flatMap(([path, content]) => {
      const labels = KPI_GENERIC_TERMS.filter(label => {
        const rx = new RegExp(`(?:label|title|heading)\\s*[:=]\\s*["'\`]\\s*${label}\\s*["'\`]`, 'i');
        return rx.test(content);
      });
      if (labels.length >= 2) {
        return [`${normalizeOutputPath(path)}: generic KPI labels ${labels.join(', ')}`];
      }
      const emptyArraySignals = /\b(?:const|let|var)\s+\w+\s*=\s*\[\s*\]/.test(content) || /\buseState\s*\(\s*\[\s*\]\s*\)/.test(content);
      return emptyArraySignals ? [`${normalizeOutputPath(path)}: empty local arrays without realistic sample data`] : [];
    }),
  ).sort((a, b) => a.localeCompare(b));
}

function collectScreenWarnings(plan: ProductSpecificityPlan, aggregateSource: string): string[] {
  return uniqueStrings(
    plan.screenSpecificContent.map(screen => {
      const requiredTerms = toSearchTerms([
        ...screen.requiredEntities,
        ...screen.requiredMetrics,
        ...screen.requiredActions,
      ]);
      if (requiredTerms.length === 0) return null;
      const hitCount = requiredTerms.filter(term => aggregateSource.includes(term)).length;
      if (hitCount > 0) return null;
      return `${screen.screenId}: missing required product-specific signals (${screen.requiredEntities.join(', ') || 'no entities'} / ${screen.requiredMetrics.join(', ') || 'no metrics'} / ${screen.requiredActions.join(', ') || 'no actions'})`;
    }),
  ).sort((a, b) => a.localeCompare(b));
}

export function buildProductSpecificityDiagnostics(input: {
  files: Record<string, string>;
  plan: ProductSpecificityPlan;
}): ProductSpecificityDiagnostics {
  const fileEntries = Object.entries(input.files).filter(([path]) => isSpecificityScanFile(path));
  const aggregateSource = fileEntries.map(([, content]) => content.toLowerCase()).join('\n');

  const genericPlaceholderFindings = collectPatternFindings(fileEntries, PLACEHOLDER_PATTERNS);
  const vagueCopyFindings = collectPatternFindings(fileEntries, VAGUE_COPY_PATTERNS);
  const emptyMetricFindings = collectGenericKpiFindings(fileEntries);

  const domainEntitySignals = collectPlanSignals(
    fileEntries,
    input.plan.domainEntities.map(entity => ({
      label: entity.label,
      terms: [entity.id, entity.label, ...entity.sampleNames],
    })),
  );
  const productActionSignals = collectPlanSignals(
    fileEntries,
    input.plan.productActions.map(action => ({
      label: action.label,
      terms: [action.id, action.label, action.userIntent],
    })),
  );
  const productMetricSignals = collectPlanSignals(
    fileEntries,
    input.plan.productMetrics.map(metric => ({
      label: metric.label,
      terms: [metric.id, metric.label, metric.exampleValue],
    })),
  );
  const screenSpecificityWarnings = collectScreenWarnings(input.plan, aggregateSource);

  const domainEntitySignalCount = domainEntitySignals.length;
  const productActionSignalCount = productActionSignals.length;
  const productMetricSignalCount = productMetricSignals.length;
  const signalBonus = Math.min(24, domainEntitySignalCount * 3 + productActionSignalCount * 2 + productMetricSignalCount * 2);
  const penalty = (
    genericPlaceholderFindings.length * 12
    + vagueCopyFindings.length * 7
    + emptyMetricFindings.length * 9
    + screenSpecificityWarnings.length * 6
  );
  const specificityScore = clamp(100 - penalty + signalBonus, 0, 100);

  const suggestedNextAction: ProductSpecificityDiagnostics['suggestedNextAction'] =
    genericPlaceholderFindings.length >= 3 || specificityScore < 30
      ? 'add_repair_later'
      : (domainEntitySignalCount + productActionSignalCount + productMetricSignalCount) === 0
        ? 'improve_specificity_plan'
        : genericPlaceholderFindings.length > 0 || vagueCopyFindings.length > 1 || emptyMetricFindings.length > 0 || specificityScore < 65
          ? 'improve_prompt'
          : screenSpecificityWarnings.length > 1
            ? 'improve_specificity_plan'
            : 'none';

  return {
    specificityDiagnosticsChecked: true,
    genericPlaceholderFindings,
    vagueCopyFindings,
    emptyMetricFindings,
    domainEntitySignals,
    productActionSignals,
    productMetricSignals,
    screenSpecificityWarnings,
    domainEntitySignalCount,
    productActionSignalCount,
    productMetricSignalCount,
    specificityScore,
    suggestedNextAction,
  };
}

export function serializeProductSpecificityDiagnostics(
  diagnostics: ProductSpecificityDiagnostics,
): ProductSpecificityDiagnosticsTelemetry {
  return {
    specificity_diagnostics_checked: diagnostics.specificityDiagnosticsChecked,
    generic_placeholder_findings: diagnostics.genericPlaceholderFindings,
    vague_copy_findings: diagnostics.vagueCopyFindings,
    empty_metric_findings: diagnostics.emptyMetricFindings,
    domain_entity_signals: diagnostics.domainEntitySignals,
    product_action_signals: diagnostics.productActionSignals,
    product_metric_signals: diagnostics.productMetricSignals,
    screen_specificity_warnings: diagnostics.screenSpecificityWarnings,
    domain_entity_signal_count: diagnostics.domainEntitySignalCount,
    product_action_signal_count: diagnostics.productActionSignalCount,
    product_metric_signal_count: diagnostics.productMetricSignalCount,
    specificity_score: diagnostics.specificityScore,
    suggested_next_action: diagnostics.suggestedNextAction,
  };
}
