import type { MediaHint } from './DesignContract';
import type { FunctionalFlowPlan } from './FunctionalFlowPlanner';
import type { ScreenCompositionPlan } from './ScreenCompositionPlanner';
type KnownSkeletonId =
  | 'mobile-app'
  | 'saas-dashboard'
  | 'landing-page'
  | 'social-community'
  | 'ecommerce'
  | 'productivity-tool';

type ArchitectInsights = {
  screenFiles: string[];
  componentFiles: string[];
  hookFiles: string[];
  dataFiles: string[];
  filePaths: string[];
};

type ModuleDefinition = {
  id: string;
  purpose: string;
  candidatePaths: string[];
  moduleType: CustomModulePlan['moduleType'];
  shouldImportFromSkeleton: boolean;
  shouldUsePremiumComponents: boolean;
  shouldUseMediaAssets: boolean;
  dependencies: string[];
  include?: boolean;
};

type SkeletonScoreRule = {
  pattern: RegExp;
  weight: number;
};

export type SkeletonIntegrationPlan = {
  skeletonId: string;
  productType?: string;
  skeletonFit: 'strong' | 'partial' | 'weak';
  skeletonFitReason: string;
  skeletonBypassAllowed: boolean;
  skeletonBypassRule: string;
  reuseStrategy: SkeletonReuseStrategy[];
  extensionStrategy: SkeletonExtensionStrategy[];
  customModules: CustomModulePlan[];
  fileOwnershipRules: FileOwnershipRule[];
  codeQualityRules: string[];
  forbiddenPatterns: string[];
  integrationNotes: string[];
};

export type SkeletonReuseStrategy = {
  area: string;
  reuseMode: 'use_as_is' | 'adapt_copy' | 'extend_with_props' | 'wrap_with_product_content';
  reason: string;
};

export type SkeletonExtensionStrategy = {
  area: string;
  extensionMode: 'add_screen' | 'add_component' | 'add_hook' | 'add_data_model' | 'add_interaction_state' | 'add_route';
  targetFiles: string[];
  reason: string;
};

export type CustomModulePlan = {
  id: string;
  purpose: string;
  recommendedPath: string;
  moduleType: 'screen' | 'component' | 'hook' | 'data' | 'utility' | 'context' | 'style';
  shouldImportFromSkeleton: boolean;
  shouldUsePremiumComponents: boolean;
  shouldUseMediaAssets: boolean;
  dependencies: string[];
};

export type FileOwnershipRule = {
  filePattern: string;
  responsibility: string;
  avoid: string[];
};

export interface SkeletonIntegrationPlanTelemetry {
  skeleton_id: string;
  product_type?: string;
  skeleton_fit: 'strong' | 'partial' | 'weak';
  skeleton_fit_reason: string;
  skeleton_bypass_allowed: boolean;
  skeleton_bypass_rule: string;
  reuse_strategy: Array<{
    area: string;
    reuse_mode: SkeletonReuseStrategy['reuseMode'];
    reason: string;
  }>;
  extension_strategy: Array<{
    area: string;
    extension_mode: SkeletonExtensionStrategy['extensionMode'];
    target_files: string[];
    reason: string;
  }>;
  custom_modules: Array<{
    id: string;
    purpose: string;
    recommended_path: string;
    module_type: CustomModulePlan['moduleType'];
    should_import_from_skeleton: boolean;
    should_use_premium_components: boolean;
    should_use_media_assets: boolean;
    dependencies: string[];
  }>;
  file_ownership_rules: Array<{
    file_pattern: string;
    responsibility: string;
    avoid: string[];
  }>;
  code_quality_rules: string[];
  forbidden_patterns: string[];
  integration_notes: string[];
}

export type ArchitectureImplementationDiagnostics = {
  architectureDiagnosticsChecked: boolean;
  appFileLineCount?: number;
  largestGeneratedFile?: string;
  largestGeneratedFileLineCount?: number;
  generatedScreenFileCount: number;
  generatedComponentFileCount: number;
  generatedHookFileCount: number;
  generatedDataFileCount: number;
  giantFileWarnings: string[];
  missingModuleBoundaryWarnings: string[];
  skeletonMisuseWarnings: string[];
  skeletonBypassWarnings: string[];
  dirtyCodeWarnings: string[];
  architectureHealthScore: number;
  suggestedNextAction: 'none' | 'improve_prompt' | 'split_modules_later' | 'add_repair_later' | 'consider_new_skeleton_later';
};

export interface ArchitectureImplementationDiagnosticsTelemetry {
  architecture_diagnostics_checked: boolean;
  app_file_line_count?: number;
  largest_generated_file?: string;
  largest_generated_file_line_count?: number;
  generated_screen_file_count: number;
  generated_component_file_count: number;
  generated_hook_file_count: number;
  generated_data_file_count: number;
  giant_file_warnings: string[];
  missing_module_boundary_warnings: string[];
  skeleton_misuse_warnings: string[];
  skeleton_bypass_warnings: string[];
  dirty_code_warnings: string[];
  architecture_health_score: number;
  suggested_next_action: 'none' | 'improve_prompt' | 'split_modules_later' | 'add_repair_later' | 'consider_new_skeleton_later';
}

const APP_SKELETON_IDS: KnownSkeletonId[] = [
  'mobile-app',
  'saas-dashboard',
  'social-community',
  'ecommerce',
  'productivity-tool',
];

const KNOWN_SKELETON_IDS: KnownSkeletonId[] = [
  ...APP_SKELETON_IDS,
  'landing-page',
];

const SKELETON_BYPASS_RULE =
  'For app prototypes, the selected skeleton must remain the application foundation. Custom code may extend it but must not bypass or replace it. Bypass is allowed only for landing-page.';

const GLOBAL_CODE_QUALITY_RULES = [
  'Do not put the whole app into one huge App.tsx.',
  'App.tsx should orchestrate layout/routing, not contain every screen and all data.',
  'Put screen-level UI into pages/* or screens/*.',
  'Put reusable UI modules into components/*.',
  'Put local mock data into data/*.',
  'Put stateful reusable behavior into hooks/*.',
  'Keep generated components focused and named by product purpose.',
  'Avoid duplicated mock data across files.',
  'Avoid duplicated navigation state.',
  'Avoid inline arrays with large datasets inside render bodies.',
  'Avoid empty handlers and decorative primary actions.',
  'Prefer small local helpers over large unreadable functions.',
  'Do not mutate premium component source files unless absolutely necessary.',
  'Prefer wrapping premium components with product-specific props/content.',
  'Do not overwrite skeleton primitives or registry files.',
  'Do not create new design systems when visual pack/premium components already exist.',
  'Do not bypass skeleton routing/navigation conventions for app prototypes.',
  'Do not replace the skeleton shell for app prototypes.',
  'Do not create a parallel architecture outside the selected skeleton.',
] as const;

const GLOBAL_FORBIDDEN_PATTERNS = [
  'one massive App.tsx',
  'all screens in one file',
  'repeated hardcoded card sections',
  'generic Feature 1 / Feature 2 modules',
  'local state duplicated per screen when shared state is needed',
  'unused generated premium/media files',
  'placeholder-only components',
  'fake buttons without state change',
  'random CSS outside visual/theme system',
  'editing design-pack registry files',
  'copying premium component code inline instead of importing it',
  'bypassing the selected skeleton for app prototypes',
  'replacing skeleton app shell/navigation/routing in app prototypes',
  'creating a parallel standalone app architecture',
  'using skeleton only as a dependency source while ignoring its structure',
  'custom App.tsx that bypasses selected skeleton conventions',
] as const;

const SCORE_RULES: Record<KnownSkeletonId, SkeletonScoreRule[]> = {
  'mobile-app': [
    { pattern: /\bmobile\b/i, weight: 5 },
    { pattern: /\bhabit|routine|streak\b/i, weight: 4 },
    { pattern: /\bhealth|wellness|fitness|coach\b/i, weight: 3 },
    { pattern: /\bscan|daily|check-in|tracker\b/i, weight: 2 },
  ],
  'saas-dashboard': [
    { pattern: /\bsaas\b/i, weight: 5 },
    { pattern: /\bdashboard|analytics|kpi|admin\b/i, weight: 4 },
    { pattern: /\bworkspace|operations|quality|experiment|queue\b/i, weight: 3 },
    { pattern: /\bteam|pipeline|feedback|review\b/i, weight: 2 },
  ],
  'landing-page': [
    { pattern: /\blanding\b/i, weight: 6 },
    { pattern: /\bhero|pricing|faq|cta\b/i, weight: 4 },
    { pattern: /\blaunch|marketing|website|waitlist\b/i, weight: 3 },
    { pattern: /\bproduct preview|social proof\b/i, weight: 2 },
  ],
  'social-community': [
    { pattern: /\bsocial|community\b/i, weight: 5 },
    { pattern: /\bcreator|feed|post|follow\b/i, weight: 4 },
    { pattern: /\bmessage|messages|chat|profile\b/i, weight: 3 },
    { pattern: /\bcomment|discover|save\b/i, weight: 2 },
  ],
  ecommerce: [
    { pattern: /\becommerce\b/i, weight: 6 },
    { pattern: /\bstore|shop|storefront|catalog\b/i, weight: 4 },
    { pattern: /\bcart|checkout|product|order\b/i, weight: 4 },
    { pattern: /\bmerchant|retail|favorites\b/i, weight: 2 },
  ],
  'productivity-tool': [
    { pattern: /\bproductivity\b/i, weight: 5 },
    { pattern: /\btask|tasks|todo|work item\b/i, weight: 4 },
    { pattern: /\bproject|projects|kanban|focus\b/i, weight: 4 },
    { pattern: /\bworkspace|planner|schedule|backlog\b/i, weight: 2 },
  ],
};

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)));
}

function normalizePath(path: string): string {
  return path.trim().replace(/^src[\\/]/, '').replace(/\\/g, '/');
}

function lineCount(source: string): number {
  return source === '' ? 0 : source.split(/\r?\n/).length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function extractArchitectInsights(architectPlan?: unknown): ArchitectInsights {
  if (!architectPlan || typeof architectPlan !== 'object') {
    return { screenFiles: [], componentFiles: [], hookFiles: [], dataFiles: [], filePaths: [] };
  }

  const plan = architectPlan as {
    fileTree?: unknown;
    pages?: unknown;
  };

  const fileTreePaths =
    plan.fileTree && typeof plan.fileTree === 'object' && !Array.isArray(plan.fileTree)
      ? Object.keys(plan.fileTree as Record<string, unknown>).map(normalizePath)
      : [];
  const pageFiles =
    Array.isArray(plan.pages)
      ? plan.pages
          .map(page => {
            if (!page || typeof page !== 'object') return null;
            const file = (page as { file?: unknown }).file;
            return typeof file === 'string' ? normalizePath(file) : null;
          })
          .filter((path): path is string => Boolean(path))
      : [];

  const allPaths = uniqueStrings([...fileTreePaths, ...pageFiles]).sort((a, b) => a.localeCompare(b));
  return {
    filePaths: allPaths,
    screenFiles: allPaths.filter(path => /^(pages|screens)\//.test(path)),
    componentFiles: allPaths.filter(path => /^components\//.test(path)),
    hookFiles: allPaths.filter(path => /^hooks\//.test(path)),
    dataFiles: allPaths.filter(path => /^data\//.test(path)),
  };
}

function inferExpectedSkeletonId(input: {
  brief: string;
  screenCompositionPlan?: ScreenCompositionPlan;
  functionalFlowPlan?: FunctionalFlowPlan;
  skeletonId: string;
}): KnownSkeletonId {
  const brief = input.brief;
  const scores = new Map<KnownSkeletonId, number>(KNOWN_SKELETON_IDS.map(id => [id, 0]));

  for (const skeletonId of KNOWN_SKELETON_IDS) {
    const current = scores.get(skeletonId) ?? 0;
    scores.set(
      skeletonId,
      current + SCORE_RULES[skeletonId].reduce((total, rule) => total + (rule.pattern.test(brief) ? rule.weight : 0), 0),
    );
  }

  const routeHints = (input.screenCompositionPlan?.screens ?? [])
    .map(screen => screen.routeHint ?? '')
    .join(' ')
    .toLowerCase();
  const roles = (input.screenCompositionPlan?.screens ?? []).map(screen => screen.role);
  const flowIds = (input.functionalFlowPlan?.flows ?? []).map(flow => flow.id).join(' ').toLowerCase();

  if (roles.includes('feed') || /\blike-save-follow|create-post\b/.test(flowIds)) {
    scores.set('social-community', (scores.get('social-community') ?? 0) + 5);
  }
  if (roles.includes('commerce') || /\badd-to-cart|checkout|product-detail\b/.test(flowIds)) {
    scores.set('ecommerce', (scores.get('ecommerce') ?? 0) + 5);
  }
  if (roles.includes('dashboard') || /\bderived-kpi|detail-panel|search-and-filter\b/.test(flowIds)) {
    scores.set('saas-dashboard', (scores.get('saas-dashboard') ?? 0) + 4);
  }
  if (/\btask|project|workspace\b/.test(flowIds)) {
    scores.set('productivity-tool', (scores.get('productivity-tool') ?? 0) + 4);
  }
  if (routeHints.includes('#') || /\bhero-cta-scroll|pricing-toggle|faq-accordion\b/.test(flowIds)) {
    scores.set('landing-page', (scores.get('landing-page') ?? 0) + 5);
  }
  if (roles.includes('progress') || /\bcomplete-habit|progress-derived-summary|bottom-nav-switch\b/.test(flowIds)) {
    scores.set('mobile-app', (scores.get('mobile-app') ?? 0) + 4);
  }

  const ranked = Array.from(scores.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });

  return ranked[0]?.[1] && ranked[0][1] > 0
    ? ranked[0][0]
    : (KNOWN_SKELETON_IDS.includes(input.skeletonId as KnownSkeletonId)
      ? input.skeletonId as KnownSkeletonId
      : 'landing-page');
}

function inferProductType(input: {
  brief: string;
  screenCompositionPlan?: ScreenCompositionPlan;
  functionalFlowPlan?: FunctionalFlowPlan;
  expectedSkeletonId: KnownSkeletonId;
}): string | undefined {
  const normalized = normalizeText(input.brief);
  if (/\bhabit|routine|streak\b/.test(normalized)) return 'habit-tracking';
  if (/\bhealth|wellness|fitness\b/.test(normalized)) return 'health-wellness';
  if (/\bsaas|dashboard|workspace\b/.test(normalized)) return 'workspace-operations';
  if (/\bcreator|community|social\b/.test(normalized)) return 'creator-community';
  if (/\bstore|shop|ecommerce|catalog\b/.test(normalized)) return 'commerce';
  if (/\btask|project|planner|productivity\b/.test(normalized)) return 'productivity';
  if (/\blanding|marketing|launch|website\b/.test(normalized)) return 'marketing';
  return input.screenCompositionPlan?.productType ?? input.functionalFlowPlan?.productType ?? input.expectedSkeletonId;
}

function usesAiSignals(brief: string, plan?: FunctionalFlowPlan): boolean {
  return /\b(ai|assistant|coach|recommendation|llm|gpt)\b/i.test(brief)
    || (plan?.flows ?? []).some(flow => /\bcoach|assistant|recommend/i.test(`${flow.id} ${flow.title}`));
}

function usesScanSignals(brief: string, plan?: FunctionalFlowPlan): boolean {
  return /\bscan|camera|barcode\b/i.test(brief)
    || (plan?.flows ?? []).some(flow => /\bscan\b/i.test(`${flow.id} ${flow.title}`));
}

function choosePreferredPath(candidates: string[], architectPaths: string[]): string {
  const normalizedArchitectSet = new Set(architectPaths.map(normalizePath));
  return candidates.find(candidate => normalizedArchitectSet.has(normalizePath(candidate))) ?? candidates[0];
}

function defaultScreenTargets(skeletonId: KnownSkeletonId, architect: ArchitectInsights): string[] {
  if (architect.screenFiles.length > 0) return architect.screenFiles;

  switch (skeletonId) {
    case 'mobile-app':
      return ['pages/Home.tsx', 'pages/Create.tsx', 'pages/Detail.tsx', 'pages/Progress.tsx', 'pages/Profile.tsx'];
    case 'saas-dashboard':
      return ['pages/Dashboard.tsx', 'pages/Projects.tsx', 'pages/QualityFeedback.tsx', 'pages/Settings.tsx'];
    case 'landing-page':
      return [
        'components/sections/HeroSection.tsx',
        'components/sections/ProductPreviewSection.tsx',
        'components/sections/FeaturesSection.tsx',
        'components/sections/CtaSection.tsx',
      ];
    case 'social-community':
      return ['pages/Home.tsx', 'pages/Discover.tsx', 'pages/Profile.tsx', 'pages/Messages.tsx', 'pages/CreatePost.tsx'];
    case 'ecommerce':
      return ['pages/Storefront.tsx', 'pages/ProductDetail.tsx', 'pages/Cart.tsx', 'pages/Checkout.tsx', 'pages/Profile.tsx'];
    case 'productivity-tool':
      return ['pages/Workspace.tsx', 'pages/Projects.tsx', 'pages/Tasks.tsx', 'pages/Settings.tsx'];
  }
}

function inferDataModule(brief: string, skeletonId: KnownSkeletonId): { hookName: string; dataFile: string } {
  const normalized = normalizeText(brief);
  if (skeletonId === 'mobile-app' && /\bhabit|routine|streak\b/.test(normalized)) {
    return { hookName: 'useHabitState', dataFile: 'data/habits.ts' };
  }
  if (skeletonId === 'social-community') {
    return { hookName: 'useCommunityState', dataFile: 'data/posts.ts' };
  }
  if (skeletonId === 'ecommerce') {
    return { hookName: 'useCartState', dataFile: 'data/products.ts' };
  }
  if (skeletonId === 'productivity-tool') {
    return { hookName: 'useWorkspaceState', dataFile: 'data/tasks.ts' };
  }
  return { hookName: 'useWorkspaceState', dataFile: 'data/workspaceData.ts' };
}

function buildCustomModules(input: {
  brief: string;
  skeletonId: KnownSkeletonId;
  premiumComponentIds: string[];
  mediaHints: MediaHint[];
  architect: ArchitectInsights;
  functionalFlowPlan?: FunctionalFlowPlan;
}): CustomModulePlan[] {
  const hasPremium = input.premiumComponentIds.length > 0;
  const hasMedia = input.mediaHints.length > 0;
  const hasAi = usesAiSignals(input.brief, input.functionalFlowPlan);
  const hasScan = usesScanSignals(input.brief, input.functionalFlowPlan);
  const domainModule = inferDataModule(input.brief, input.skeletonId);
  const definitions: ModuleDefinition[] = [];

  switch (input.skeletonId) {
    case 'mobile-app':
      definitions.push(
        {
          id: 'today-summary',
          purpose: 'Reusable today summary module for the Home/Today cockpit.',
          candidatePaths: ['components/TodaySummary.tsx'],
          moduleType: 'component',
          shouldImportFromSkeleton: true,
          shouldUsePremiumComponents: hasPremium,
          shouldUseMediaAssets: hasMedia,
          dependencies: [domainModule.dataFile, `hooks/${domainModule.hookName}.ts`],
        },
        {
          id: 'progress-snapshot',
          purpose: 'Compact progress snapshot module for the product-specific progress zone.',
          candidatePaths: ['components/ProgressSnapshot.tsx'],
          moduleType: 'component',
          shouldImportFromSkeleton: true,
          shouldUsePremiumComponents: hasPremium,
          shouldUseMediaAssets: false,
          dependencies: [domainModule.dataFile, `hooks/${domainModule.hookName}.ts`],
        },
        {
          id: 'coach-teaser',
          purpose: 'Small recommendation or coach teaser module that wraps the selected skeleton surface.',
          candidatePaths: ['components/CoachTeaser.tsx'],
          moduleType: 'component',
          shouldImportFromSkeleton: true,
          shouldUsePremiumComponents: hasPremium,
          shouldUseMediaAssets: false,
          dependencies: [`hooks/${domainModule.hookName}.ts`],
          include: hasAi,
        },
        {
          id: 'scan-result-card',
          purpose: 'Scan result card for product-specific create or check flows.',
          candidatePaths: ['components/ScanResultCard.tsx'],
          moduleType: 'component',
          shouldImportFromSkeleton: true,
          shouldUsePremiumComponents: false,
          shouldUseMediaAssets: false,
          dependencies: [`hooks/${domainModule.hookName}.ts`],
          include: hasScan,
        },
        {
          id: normalizeText(domainModule.hookName).replace(/\s+/g, '-'),
          purpose: 'Shared mobile state hook for habits, checks, progress, and profile-level derived state.',
          candidatePaths: [`hooks/${domainModule.hookName}.ts`],
          moduleType: 'hook',
          shouldImportFromSkeleton: true,
          shouldUsePremiumComponents: false,
          shouldUseMediaAssets: false,
          dependencies: [domainModule.dataFile],
        },
        {
          id: domainModule.dataFile.replace(/^data\//, '').replace(/\.(ts|tsx)$/, ''),
          purpose: 'Local mock data and product entities used across the mobile flow.',
          candidatePaths: [domainModule.dataFile],
          moduleType: 'data',
          shouldImportFromSkeleton: false,
          shouldUsePremiumComponents: false,
          shouldUseMediaAssets: false,
          dependencies: [],
        },
      );
      break;
    case 'saas-dashboard':
      definitions.push(
        {
          id: 'kpi-strip',
          purpose: 'Dense KPI strip for the dashboard overview without turning the product into a generic admin panel.',
          candidatePaths: ['components/KpiStrip.tsx'],
          moduleType: 'component',
          shouldImportFromSkeleton: true,
          shouldUsePremiumComponents: hasPremium,
          shouldUseMediaAssets: false,
          dependencies: ['hooks/useWorkspaceState.ts', 'data/workspaceData.ts'],
        },
        {
          id: 'work-queue-table',
          purpose: 'Workspace table or queue module for search, filter, and product-specific list actions.',
          candidatePaths: ['components/WorkQueueTable.tsx'],
          moduleType: 'component',
          shouldImportFromSkeleton: true,
          shouldUsePremiumComponents: false,
          shouldUseMediaAssets: false,
          dependencies: ['hooks/useWorkspaceState.ts', 'data/workspaceData.ts'],
        },
        {
          id: 'detail-panel',
          purpose: 'Detail panel for the currently selected work item or quality signal.',
          candidatePaths: ['components/DetailPanel.tsx'],
          moduleType: 'component',
          shouldImportFromSkeleton: true,
          shouldUsePremiumComponents: false,
          shouldUseMediaAssets: false,
          dependencies: ['hooks/useWorkspaceState.ts'],
        },
        {
          id: 'feedback-stream',
          purpose: 'Compact feedback stream or activity rail aligned to the dashboard workflow.',
          candidatePaths: ['components/FeedbackStream.tsx'],
          moduleType: 'component',
          shouldImportFromSkeleton: true,
          shouldUsePremiumComponents: false,
          shouldUseMediaAssets: false,
          dependencies: ['hooks/useWorkspaceState.ts', 'data/workspaceData.ts'],
        },
        {
          id: 'workspace-state',
          purpose: 'Workspace-level state hook that owns filters, selected item state, and derived KPI values.',
          candidatePaths: ['hooks/useWorkspaceState.ts'],
          moduleType: 'hook',
          shouldImportFromSkeleton: true,
          shouldUsePremiumComponents: false,
          shouldUseMediaAssets: false,
          dependencies: ['data/workspaceData.ts'],
        },
        {
          id: 'workspace-data',
          purpose: 'Local mock dataset for the dashboard list, details, and derived metrics.',
          candidatePaths: ['data/workspaceData.ts'],
          moduleType: 'data',
          shouldImportFromSkeleton: false,
          shouldUsePremiumComponents: false,
          shouldUseMediaAssets: false,
          dependencies: [],
        },
      );
      break;
    case 'landing-page':
      definitions.push(
        {
          id: 'hero-section',
          purpose: 'Hero section with brief-specific value proposition and CTA content.',
          candidatePaths: ['components/sections/HeroSection.tsx'],
          moduleType: 'component',
          shouldImportFromSkeleton: false,
          shouldUsePremiumComponents: hasPremium,
          shouldUseMediaAssets: hasMedia,
          dependencies: [],
        },
        {
          id: 'product-preview-section',
          purpose: 'Product preview section for product-specific tabs or visual proof.',
          candidatePaths: ['components/sections/ProductPreviewSection.tsx'],
          moduleType: 'component',
          shouldImportFromSkeleton: false,
          shouldUsePremiumComponents: hasPremium,
          shouldUseMediaAssets: hasMedia,
          dependencies: [],
        },
        {
          id: 'features-section',
          purpose: 'Feature explanation section that maps to the brief instead of generic marketing copy.',
          candidatePaths: ['components/sections/FeaturesSection.tsx'],
          moduleType: 'component',
          shouldImportFromSkeleton: false,
          shouldUsePremiumComponents: false,
          shouldUseMediaAssets: false,
          dependencies: [],
        },
        {
          id: 'faq-section',
          purpose: 'FAQ or social proof section with local interactive state if the brief needs it.',
          candidatePaths: ['components/sections/FaqSection.tsx'],
          moduleType: 'component',
          shouldImportFromSkeleton: false,
          shouldUsePremiumComponents: false,
          shouldUseMediaAssets: false,
          dependencies: [],
        },
      );
      break;
    case 'social-community':
      definitions.push(
        {
          id: 'post-feed',
          purpose: 'Reusable feed module that renders posts from data/* instead of inlining repeated cards.',
          candidatePaths: ['components/PostFeed.tsx'],
          moduleType: 'component',
          shouldImportFromSkeleton: true,
          shouldUsePremiumComponents: hasPremium,
          shouldUseMediaAssets: hasMedia,
          dependencies: ['data/posts.ts', 'hooks/useCommunityState.ts'],
        },
        {
          id: 'feed-composer',
          purpose: 'Create-post composer module with working local state and feedback.',
          candidatePaths: ['components/FeedComposer.tsx'],
          moduleType: 'component',
          shouldImportFromSkeleton: true,
          shouldUsePremiumComponents: false,
          shouldUseMediaAssets: hasMedia,
          dependencies: ['hooks/useCommunityState.ts'],
        },
        {
          id: 'message-list',
          purpose: 'Message or conversation list module for community interactions.',
          candidatePaths: ['components/MessageList.tsx'],
          moduleType: 'component',
          shouldImportFromSkeleton: true,
          shouldUsePremiumComponents: false,
          shouldUseMediaAssets: false,
          dependencies: ['data/posts.ts', 'hooks/useCommunityState.ts'],
        },
        {
          id: 'community-state',
          purpose: 'Shared like/save/follow/message state for multiple community screens.',
          candidatePaths: ['hooks/useCommunityState.ts'],
          moduleType: 'hook',
          shouldImportFromSkeleton: true,
          shouldUsePremiumComponents: false,
          shouldUseMediaAssets: false,
          dependencies: ['data/posts.ts'],
        },
        {
          id: 'posts-data',
          purpose: 'Local mock users, posts, and conversation data.',
          candidatePaths: ['data/posts.ts'],
          moduleType: 'data',
          shouldImportFromSkeleton: false,
          shouldUsePremiumComponents: false,
          shouldUseMediaAssets: false,
          dependencies: [],
        },
      );
      break;
    case 'ecommerce':
      definitions.push(
        {
          id: 'product-grid',
          purpose: 'Reusable product list module that maps product data into storefront cards.',
          candidatePaths: ['components/ProductGrid.tsx'],
          moduleType: 'component',
          shouldImportFromSkeleton: true,
          shouldUsePremiumComponents: hasPremium,
          shouldUseMediaAssets: hasMedia,
          dependencies: ['data/products.ts', 'hooks/useCartState.ts'],
        },
        {
          id: 'product-detail-panel',
          purpose: 'Product detail module with purchase-focused content and clean prop boundaries.',
          candidatePaths: ['components/ProductDetailPanel.tsx'],
          moduleType: 'component',
          shouldImportFromSkeleton: true,
          shouldUsePremiumComponents: hasPremium,
          shouldUseMediaAssets: hasMedia,
          dependencies: ['data/products.ts', 'hooks/useCartState.ts'],
        },
        {
          id: 'cart-summary',
          purpose: 'Cart totals and checkout summary module driven by local cart state.',
          candidatePaths: ['components/CartSummary.tsx'],
          moduleType: 'component',
          shouldImportFromSkeleton: true,
          shouldUsePremiumComponents: false,
          shouldUseMediaAssets: false,
          dependencies: ['hooks/useCartState.ts'],
        },
        {
          id: 'cart-state',
          purpose: 'Local cart hook for quantity updates, totals, and checkout-ready interactions.',
          candidatePaths: ['hooks/useCartState.ts'],
          moduleType: 'hook',
          shouldImportFromSkeleton: true,
          shouldUsePremiumComponents: false,
          shouldUseMediaAssets: false,
          dependencies: ['data/products.ts'],
        },
        {
          id: 'products-data',
          purpose: 'Product catalog and cart seed data stored under data/*.',
          candidatePaths: ['data/products.ts'],
          moduleType: 'data',
          shouldImportFromSkeleton: false,
          shouldUsePremiumComponents: false,
          shouldUseMediaAssets: false,
          dependencies: [],
        },
      );
      break;
    case 'productivity-tool':
      definitions.push(
        {
          id: 'workspace-overview',
          purpose: 'Overview strip or board summary that keeps the workspace dense but readable.',
          candidatePaths: ['components/WorkspaceOverview.tsx'],
          moduleType: 'component',
          shouldImportFromSkeleton: true,
          shouldUsePremiumComponents: hasPremium,
          shouldUseMediaAssets: false,
          dependencies: ['hooks/useWorkspaceState.ts', 'data/tasks.ts'],
        },
        {
          id: 'task-board',
          purpose: 'Task or project board module for status changes and filtered views.',
          candidatePaths: ['components/TaskBoard.tsx'],
          moduleType: 'component',
          shouldImportFromSkeleton: true,
          shouldUsePremiumComponents: false,
          shouldUseMediaAssets: false,
          dependencies: ['hooks/useWorkspaceState.ts', 'data/tasks.ts'],
        },
        {
          id: 'project-panel',
          purpose: 'Project detail or side panel module for the selected workspace item.',
          candidatePaths: ['components/ProjectPanel.tsx'],
          moduleType: 'component',
          shouldImportFromSkeleton: true,
          shouldUsePremiumComponents: false,
          shouldUseMediaAssets: false,
          dependencies: ['hooks/useWorkspaceState.ts'],
        },
        {
          id: 'workspace-state',
          purpose: 'Shared workspace hook for filters, create/update actions, and derived counts.',
          candidatePaths: ['hooks/useWorkspaceState.ts'],
          moduleType: 'hook',
          shouldImportFromSkeleton: true,
          shouldUsePremiumComponents: false,
          shouldUseMediaAssets: false,
          dependencies: ['data/tasks.ts'],
        },
        {
          id: 'tasks-data',
          purpose: 'Tasks, projects, and workspace mock data kept outside render bodies.',
          candidatePaths: ['data/tasks.ts'],
          moduleType: 'data',
          shouldImportFromSkeleton: false,
          shouldUsePremiumComponents: false,
          shouldUseMediaAssets: false,
          dependencies: [],
        },
      );
      break;
  }

  return definitions
    .filter(definition => definition.include !== false)
    .map(definition => ({
      id: definition.id,
      purpose: definition.purpose,
      recommendedPath: choosePreferredPath(definition.candidatePaths, input.architect.filePaths),
      moduleType: definition.moduleType,
      shouldImportFromSkeleton: definition.shouldImportFromSkeleton,
      shouldUsePremiumComponents: definition.shouldUsePremiumComponents,
      shouldUseMediaAssets: definition.shouldUseMediaAssets,
      dependencies: [...definition.dependencies].sort((a, b) => a.localeCompare(b)),
    }));
}

function buildReuseStrategy(input: {
  skeletonId: KnownSkeletonId;
  hasPremium: boolean;
  hasMedia: boolean;
}): SkeletonReuseStrategy[] {
  const shared = input.hasPremium
    ? [{
        area: 'premium component surfaces',
        reuseMode: 'extend_with_props' as const,
        reason: 'Import premium components and adapt them through product-specific props, copy, and composition.',
      }]
    : [];

  switch (input.skeletonId) {
    case 'mobile-app':
      return [
        {
          area: 'mobile navigation shell',
          reuseMode: 'use_as_is',
          reason: 'Use the skeleton navigation shell and mobile surface conventions as the foundation.',
        },
        {
          area: 'Home / Today cockpit layout',
          reuseMode: 'wrap_with_product_content',
          reason: 'Keep Home/Today as a multi-zone cockpit while replacing generic content with product-specific modules.',
        },
        {
          area: 'detail and progress routes',
          reuseMode: 'adapt_copy',
          reason: 'Preserve the route structure and adapt the content, local state, and copy to the brief.',
        },
        ...shared,
      ];
    case 'saas-dashboard':
      return [
        {
          area: 'dashboard shell/sidebar/topbar',
          reuseMode: 'use_as_is',
          reason: 'Use dashboard shell, sidebar, and topbar conventions instead of building a new workspace frame.',
        },
        {
          area: 'overview density pattern',
          reuseMode: 'wrap_with_product_content',
          reason: 'Keep the dashboard overview dense and structured while swapping in brief-specific KPIs and queues.',
        },
        {
          area: 'workspace screens',
          reuseMode: 'adapt_copy',
          reason: 'Adapt dashboard pages to the product domain without replacing the skeleton navigation model.',
        },
        ...shared,
      ];
    case 'landing-page':
      return [
        {
          area: 'top-level landing composition',
          reuseMode: 'adapt_copy',
          reason: 'Keep the foundation lightweight and section-based, then adapt it with brief-specific sections.',
        },
        {
          area: 'hero and CTA skeleton surfaces',
          reuseMode: 'wrap_with_product_content',
          reason: 'Reuse hero/CTA structure but fill it with product-specific content, proof, and working local interactions.',
        },
        ...(input.hasMedia ? [{
          area: 'media-backed sections',
          reuseMode: 'extend_with_props' as const,
          reason: 'Use the selected generated media assets inside section components instead of decorative placeholders.',
        }] : []),
        ...shared,
      ];
    case 'social-community':
      return [
        {
          area: 'community navigation shell',
          reuseMode: 'use_as_is',
          reason: 'Keep feed/profile/message navigation conventions from the selected skeleton.',
        },
        {
          area: 'feed and profile surfaces',
          reuseMode: 'wrap_with_product_content',
          reason: 'Reuse feed/profile patterns while moving domain-specific content into clean modules and data files.',
        },
        ...shared,
      ];
    case 'ecommerce':
      return [
        {
          area: 'storefront shell and navigation',
          reuseMode: 'use_as_is',
          reason: 'Preserve storefront and cart/navigation structure as the application foundation.',
        },
        {
          area: 'product list and detail surfaces',
          reuseMode: 'wrap_with_product_content',
          reason: 'Keep skeleton commerce flow but swap in product-specific data, cards, and purchasing modules.',
        },
        ...shared,
      ];
    case 'productivity-tool':
      return [
        {
          area: 'workspace shell',
          reuseMode: 'use_as_is',
          reason: 'Use the selected workspace shell and productivity navigation as the base architecture.',
        },
        {
          area: 'task and project surfaces',
          reuseMode: 'wrap_with_product_content',
          reason: 'Adapt task/project views with product-specific modules instead of collapsing workspace logic into one component.',
        },
        ...shared,
      ];
  }
}

function buildFileOwnershipRules(skeletonId: KnownSkeletonId): FileOwnershipRule[] {
  const baseRules: FileOwnershipRule[] = [
    {
      filePattern: 'App.tsx',
      responsibility: 'Top-level orchestration, layout composition, and routing handoff only.',
      avoid: ['screen markup for the whole product', 'large inline datasets', 'duplicated screen state'],
    },
    {
      filePattern: '{pages,screens}/*.tsx',
      responsibility: 'Own screen-level composition, product copy, and screen-local interaction wiring.',
      avoid: ['shared mock data definitions', 'global navigation state duplication', 'premium component source copies'],
    },
    {
      filePattern: 'components/*.tsx',
      responsibility: 'Reusable product UI modules shared by multiple screens.',
      avoid: ['route ownership', 'large page-level data arrays', 'full-app orchestration'],
    },
    {
      filePattern: 'hooks/*.ts',
      responsibility: 'Shared reusable state, derived selectors, and interaction helpers.',
      avoid: ['JSX markup', 'unrelated mock data payloads'],
    },
    {
      filePattern: 'data/*.{ts,tsx}',
      responsibility: 'Local mock entities, seed records, and pure data helpers.',
      avoid: ['JSX rendering', 'duplicating the same dataset across page files'],
    },
  ];

  if (skeletonId === 'landing-page') {
    return [
      ...baseRules,
      {
        filePattern: 'components/sections/*.tsx',
        responsibility: 'Own hero, preview, feature, CTA, FAQ, and proof sections as modular landing blocks.',
        avoid: ['app-shell navigation logic', 'generic placeholder marketing copy'],
      },
    ];
  }

  return [
    ...baseRules,
    {
      filePattern: 'config/routes.ts',
      responsibility: 'Own route definitions that stay aligned with the selected skeleton navigation conventions.',
      avoid: ['screen implementation details', 'standalone routing systems'],
    },
    {
      filePattern: 'config/navigation.ts',
      responsibility: 'Own skeleton-aligned navigation config and route metadata only.',
      avoid: ['duplicated page state', 'parallel navigation models'],
    },
  ];
}

function buildExtensionStrategy(input: {
  skeletonId: KnownSkeletonId;
  screenTargets: string[];
  customModules: CustomModulePlan[];
}): SkeletonExtensionStrategy[] {
  const componentTargets = input.customModules
    .filter(module => module.moduleType === 'component')
    .map(module => module.recommendedPath);
  const hookTargets = input.customModules
    .filter(module => module.moduleType === 'hook' || module.moduleType === 'context')
    .map(module => module.recommendedPath);
  const dataTargets = input.customModules
    .filter(module => module.moduleType === 'data')
    .map(module => module.recommendedPath);

  const strategies: SkeletonExtensionStrategy[] = [];
  if (input.skeletonId === 'landing-page') {
    strategies.push({
      area: 'landing sections',
      extensionMode: 'add_component',
      targetFiles: input.screenTargets,
      reason: 'Build landing composition from modular sections instead of one monolithic page.',
    });
  } else {
    strategies.push({
      area: 'product screens',
      extensionMode: 'add_screen',
      targetFiles: input.screenTargets,
      reason: 'Own screen-level UI in pages/* or screens/* while preserving the selected skeleton foundation.',
    });
    strategies.push({
      area: 'skeleton route wiring',
      extensionMode: 'add_route',
      targetFiles: ['config/routes.ts', 'config/navigation.ts'],
      reason: 'Keep routing and navigation aligned to skeleton conventions instead of adding a parallel app shell.',
    });
  }
  if (componentTargets.length > 0) {
    strategies.push({
      area: input.skeletonId === 'saas-dashboard' ? 'dashboard workflow modules' : 'product UI modules',
      extensionMode: 'add_component',
      targetFiles: componentTargets,
      reason: 'Add clean reusable modules for product-specific surfaces that the base skeleton does not fully cover.',
    });
  }
  if (hookTargets.length > 0) {
    strategies.push({
      area: 'shared interaction state',
      extensionMode: 'add_hook',
      targetFiles: hookTargets,
      reason: 'Move shared reusable behavior into hooks instead of duplicating state per screen.',
    });
    strategies.push({
      area: 'interactive state ownership',
      extensionMode: 'add_interaction_state',
      targetFiles: hookTargets,
      reason: 'Keep filters, progress, cart, or social state in one reusable owner module.',
    });
  }
  if (dataTargets.length > 0) {
    strategies.push({
      area: 'local mock data model',
      extensionMode: 'add_data_model',
      targetFiles: dataTargets,
      reason: 'Store product entities and seed records under data/* instead of inline render arrays.',
    });
  }

  return strategies;
}

function determineSkeletonFit(input: {
  selectedSkeletonId: KnownSkeletonId;
  expectedSkeletonId: KnownSkeletonId;
  customModuleCount: number;
  screenCompositionPlan?: ScreenCompositionPlan;
  functionalFlowPlan?: FunctionalFlowPlan;
}): Pick<SkeletonIntegrationPlan, 'skeletonFit' | 'skeletonFitReason'> {
  const screenCount = input.screenCompositionPlan?.screens.length ?? 0;
  const flowCount = input.functionalFlowPlan?.flows.length ?? 0;
  const selected = input.selectedSkeletonId;
  const expected = input.expectedSkeletonId;

  if (selected !== expected) {
    return {
      skeletonFit: 'weak',
      skeletonFitReason: selected === 'landing-page'
        ? `Brief signals are closer to ${expected}, so keep the landing implementation modular and section-based.`
        : `Brief signals are closer to ${expected}, but ${selected} must still remain the application foundation and be extended cleanly.`,
    };
  }

  if (input.customModuleCount <= 6 && screenCount >= 3 && flowCount >= 3) {
    return {
      skeletonFit: 'strong',
      skeletonFitReason: `Brief intent, screen composition, and functional flow all align with the selected ${selected} foundation.`,
    };
  }

  return {
    skeletonFit: 'partial',
    skeletonFitReason: `The selected ${selected} skeleton is the right base, but the product needs clean extension modules instead of literal template reuse.`,
  };
}

function buildIntegrationNotes(input: {
  skeletonId: KnownSkeletonId;
  skeletonFit: SkeletonIntegrationPlan['skeletonFit'];
  expectedSkeletonId: KnownSkeletonId;
  premiumComponentIds: string[];
  mediaHints: MediaHint[];
  architect: ArchitectInsights;
}): string[] {
  const notes = uniqueStrings([
    input.skeletonId === 'landing-page'
      ? 'Landing-page may compose more freely, but sections should still remain modular and named by product purpose.'
      : 'For app prototypes, preserve the selected skeleton shell/navigation as the foundation and extend it through clean modules only.',
    input.skeletonFit === 'weak' && input.skeletonId !== 'landing-page'
      ? `Record weak fit as a warning only; extend the closest skeleton cleanly now and consider ${input.expectedSkeletonId === input.skeletonId ? 'a new skeleton type later if the category repeats.' : `${input.expectedSkeletonId} as a closer base or a future new skeleton if this category repeats.`}`
      : null,
    input.premiumComponentIds.length > 0
      ? `Premium component hints are available (${input.premiumComponentIds.length}); import and wrap them instead of copying their source inline.`
      : null,
    input.mediaHints.length > 0
      ? `Generated media hints are available (${input.mediaHints.map(hint => hint.kind).join(', ')}); place them in assigned product modules instead of decorative placeholders.`
      : null,
    input.architect.filePaths.length > 0
      ? `Architect already suggested delta files: ${input.architect.filePaths.slice(0, 6).join(', ')}${input.architect.filePaths.length > 6 ? ', ...' : ''}`
      : null,
  ]);

  return notes;
}

export function buildSkeletonIntegrationPlan(input: {
  brief: string;
  skeletonId: string;
  screenCompositionPlan?: ScreenCompositionPlan;
  functionalFlowPlan?: FunctionalFlowPlan;
  premiumComponentIds: string[];
  mediaHints: MediaHint[];
  architectPlan?: unknown;
}): SkeletonIntegrationPlan {
  const selectedSkeletonId = KNOWN_SKELETON_IDS.includes(input.skeletonId as KnownSkeletonId)
    ? input.skeletonId as KnownSkeletonId
    : 'landing-page';
  const architect = extractArchitectInsights(input.architectPlan);
  const expectedSkeletonId = inferExpectedSkeletonId({
    brief: input.brief,
    screenCompositionPlan: input.screenCompositionPlan,
    functionalFlowPlan: input.functionalFlowPlan,
    skeletonId: selectedSkeletonId,
  });
  const productType = inferProductType({
    brief: input.brief,
    screenCompositionPlan: input.screenCompositionPlan,
    functionalFlowPlan: input.functionalFlowPlan,
    expectedSkeletonId,
  });
  const customModules = buildCustomModules({
    brief: input.brief,
    skeletonId: selectedSkeletonId,
    premiumComponentIds: input.premiumComponentIds,
    mediaHints: input.mediaHints,
    architect,
    functionalFlowPlan: input.functionalFlowPlan,
  });
  const screenTargets = defaultScreenTargets(selectedSkeletonId, architect);
  const { skeletonFit, skeletonFitReason } = determineSkeletonFit({
    selectedSkeletonId,
    expectedSkeletonId,
    customModuleCount: customModules.length,
    screenCompositionPlan: input.screenCompositionPlan,
    functionalFlowPlan: input.functionalFlowPlan,
  });

  return {
    skeletonId: selectedSkeletonId,
    productType,
    skeletonFit,
    skeletonFitReason,
    skeletonBypassAllowed: selectedSkeletonId === 'landing-page',
    skeletonBypassRule: SKELETON_BYPASS_RULE,
    reuseStrategy: buildReuseStrategy({
      skeletonId: selectedSkeletonId,
      hasPremium: input.premiumComponentIds.length > 0,
      hasMedia: input.mediaHints.length > 0,
    }),
    extensionStrategy: buildExtensionStrategy({
      skeletonId: selectedSkeletonId,
      screenTargets,
      customModules,
    }),
    customModules,
    fileOwnershipRules: buildFileOwnershipRules(selectedSkeletonId),
    codeQualityRules: [...GLOBAL_CODE_QUALITY_RULES],
    forbiddenPatterns: [...GLOBAL_FORBIDDEN_PATTERNS],
    integrationNotes: buildIntegrationNotes({
      skeletonId: selectedSkeletonId,
      skeletonFit,
      expectedSkeletonId,
      premiumComponentIds: input.premiumComponentIds,
      mediaHints: input.mediaHints,
      architect,
    }),
  };
}

export function buildSkeletonIntegrationPromptBlock(plan: SkeletonIntegrationPlan): string {
  const lines: string[] = [];

  lines.push('SKELETON_INTEGRATION_PLAN:');
  lines.push(`skeletonId: ${plan.skeletonId}`);
  if (plan.productType) lines.push(`productType: ${plan.productType}`);
  lines.push(`skeletonFit: ${plan.skeletonFit}`);
  lines.push(`skeletonFitReason: ${plan.skeletonFitReason}`);
  lines.push(`skeletonBypassAllowed: ${String(plan.skeletonBypassAllowed)}`);
  lines.push(`skeletonBypassRule: ${plan.skeletonBypassRule}`);
  lines.push('');

  lines.push('REUSE_STRATEGY:');
  for (const strategy of plan.reuseStrategy) {
    lines.push(`  - area: ${strategy.area}`);
    lines.push(`    reuseMode: ${strategy.reuseMode}`);
    lines.push(`    reason: ${strategy.reason}`);
  }
  lines.push('');

  lines.push('EXTENSION_STRATEGY:');
  for (const strategy of plan.extensionStrategy) {
    lines.push(`  - area: ${strategy.area}`);
    lines.push(`    extensionMode: ${strategy.extensionMode}`);
    lines.push(`    targetFiles: ${strategy.targetFiles.join(', ')}`);
    lines.push(`    reason: ${strategy.reason}`);
  }
  lines.push('');

  lines.push('CUSTOM_MODULES:');
  for (const module of plan.customModules) {
    lines.push(`  - id: ${module.id}`);
    lines.push(`    moduleType: ${module.moduleType}`);
    lines.push(`    recommendedPath: ${module.recommendedPath}`);
    lines.push(`    purpose: ${module.purpose}`);
    lines.push(`    shouldImportFromSkeleton: ${String(module.shouldImportFromSkeleton)}`);
    lines.push(`    shouldUsePremiumComponents: ${String(module.shouldUsePremiumComponents)}`);
    lines.push(`    shouldUseMediaAssets: ${String(module.shouldUseMediaAssets)}`);
    lines.push(`    dependencies: ${module.dependencies.join(', ') || '(none)'}`);
  }
  lines.push('');

  lines.push('FILE_OWNERSHIP_RULES:');
  for (const rule of plan.fileOwnershipRules) {
    lines.push(`  - filePattern: ${rule.filePattern}`);
    lines.push(`    responsibility: ${rule.responsibility}`);
    lines.push(`    avoid: ${rule.avoid.join(', ')}`);
  }
  lines.push('');

  lines.push('CODE_QUALITY_RULES:');
  for (const rule of plan.codeQualityRules) {
    lines.push(`  - ${rule}`);
  }
  lines.push('');

  lines.push('FORBIDDEN_PATTERNS:');
  for (const pattern of plan.forbiddenPatterns) {
    lines.push(`  - ${pattern}`);
  }
  lines.push('');

  if (plan.integrationNotes.length > 0) {
    lines.push('INTEGRATION_NOTES:');
    for (const note of plan.integrationNotes) {
      lines.push(`  - ${note}`);
    }
    lines.push('');
  }

  lines.push('CODER_INSTRUCTIONS:');
  lines.push('- Follow the skeleton integration plan before writing code.');
  lines.push('- For app prototypes, preserve the selected skeleton as the application foundation.');
  lines.push('- Do not bypass the selected skeleton unless skeletonId is landing-page.');
  lines.push('- Reuse skeleton conventions where they fit.');
  lines.push('- Extend skeleton through clean modules.');
  lines.push('- Create custom files only for missing product-specific behavior.');
  lines.push('- Keep App.tsx small and orchestration-focused.');
  lines.push('- Do not inline the whole product into one component.');
  lines.push('- Do not mutate generated premium/design-pack files.');
  lines.push('- Do not copy premium component code inline; import and wrap it.');
  lines.push('- Keep the code export-ready and buildable.');
  lines.push('- If the skeleton does not fully cover the product need, extend it cleanly instead of replacing it.');

  return lines.join('\n');
}

export function buildArchitectureQualityRulesBlock(): string {
  return [
    'ARCHITECTURE_QUALITY_RULES:',
    '- Choose the skeleton as a foundation, not a rigid template.',
    '- For app prototypes, the selected skeleton is mandatory and must not be bypassed.',
    '- Only landing-page may use freer section composition.',
    '- Plan where the skeleton is reused, where it is adapted, and where it is extended.',
    '- Custom modules must extend the selected skeleton, not replace it.',
    '- Avoid one-file apps.',
    '- Separate screens, components, hooks, data, and utilities.',
    '- Prefer clean module boundaries over inline code.',
    '- Use skeleton conventions unless the product need requires a clean extension module.',
    '- Do not create generic screens; every screen/module should map to the product brief.',
    '- Do not build a parallel app architecture outside the skeleton.',
  ].join('\n');
}

export function serializeSkeletonIntegrationPlan(plan: SkeletonIntegrationPlan): SkeletonIntegrationPlanTelemetry {
  return {
    skeleton_id: plan.skeletonId,
    product_type: plan.productType,
    skeleton_fit: plan.skeletonFit,
    skeleton_fit_reason: plan.skeletonFitReason,
    skeleton_bypass_allowed: plan.skeletonBypassAllowed,
    skeleton_bypass_rule: plan.skeletonBypassRule,
    reuse_strategy: plan.reuseStrategy.map(strategy => ({
      area: strategy.area,
      reuse_mode: strategy.reuseMode,
      reason: strategy.reason,
    })),
    extension_strategy: plan.extensionStrategy.map(strategy => ({
      area: strategy.area,
      extension_mode: strategy.extensionMode,
      target_files: strategy.targetFiles,
      reason: strategy.reason,
    })),
    custom_modules: plan.customModules.map(module => ({
      id: module.id,
      purpose: module.purpose,
      recommended_path: module.recommendedPath,
      module_type: module.moduleType,
      should_import_from_skeleton: module.shouldImportFromSkeleton,
      should_use_premium_components: module.shouldUsePremiumComponents,
      should_use_media_assets: module.shouldUseMediaAssets,
      dependencies: module.dependencies,
    })),
    file_ownership_rules: plan.fileOwnershipRules.map(rule => ({
      file_pattern: rule.filePattern,
      responsibility: rule.responsibility,
      avoid: rule.avoid,
    })),
    code_quality_rules: [...plan.codeQualityRules],
    forbidden_patterns: [...plan.forbiddenPatterns],
    integration_notes: [...plan.integrationNotes],
  };
}

function isArchitectureScanFile(path: string): boolean {
  const normalized = normalizePath(path);
  if (!/\.(?:ts|tsx|css)$/.test(normalized)) return false;
  if (normalized.startsWith('design-pack/')) return false;
  if (normalized.startsWith('assets/generated/')) return false;
  if (normalized.includes('__tests__/')) return false;
  if (/\.(?:test|spec)\.(?:ts|tsx)$/.test(normalized)) return false;
  return true;
}

function isScreenFile(path: string): boolean {
  const normalized = normalizePath(path);
  return normalized === 'App.tsx' || /^(pages|screens)\/[^/]+\.tsx$/.test(normalized) || /^components\/screens\/[^/]+\.tsx$/.test(normalized);
}

function countGeneratedFiles(files: Record<string, string>, pattern: RegExp): number {
  return Object.keys(files)
    .map(normalizePath)
    .filter(path => pattern.test(path))
    .length;
}

function collectWarnings(matches: Array<string | null | undefined>): string[] {
  return uniqueStrings(matches).sort((a, b) => a.localeCompare(b));
}

export function buildArchitectureImplementationDiagnostics(input: {
  files: Record<string, string>;
  skeletonId: string;
  screenCompositionPlan?: ScreenCompositionPlan;
  functionalFlowPlan?: FunctionalFlowPlan;
  skeletonIntegrationPlan?: SkeletonIntegrationPlan;
}): ArchitectureImplementationDiagnostics {
  const relevantFiles = Object.entries(input.files)
    .filter(([path]) => isArchitectureScanFile(path))
    .map(([path, content]) => [normalizePath(path), content] as const);
  const appFile = relevantFiles.find(([path]) => path === 'App.tsx');
  const fileLineCounts = relevantFiles
    .map(([path, content]) => ({ path, lines: lineCount(content), content }))
    .sort((a, b) => {
      if (b.lines !== a.lines) return b.lines - a.lines;
      return a.path.localeCompare(b.path);
    });
  const largestFile = fileLineCounts[0];
  const generatedScreenFileCount = relevantFiles.filter(([path]) => isScreenFile(path)).length;
  const generatedComponentFileCount = countGeneratedFiles(input.files, /^components\/(?!screens\/)[^/]+\.tsx$/);
  const generatedHookFileCount = countGeneratedFiles(input.files, /^hooks\/[^/]+\.(ts|tsx)$/);
  const generatedDataFileCount = countGeneratedFiles(input.files, /^data\/[^/]+\.(ts|tsx)$/);
  const appFileLineCount = appFile ? lineCount(appFile[1]) : undefined;
  const aggregateSource = relevantFiles.map(([, content]) => content).join('\n');

  const giantFileWarnings = collectWarnings([
    appFileLineCount && appFileLineCount >= 220
      ? `App.tsx is ${appFileLineCount} lines; keep App.tsx orchestration-focused and move screen logic into pages or components.`
      : null,
    largestFile && largestFile.lines >= 260
      ? `${largestFile.path} is ${largestFile.lines} lines; split large product surfaces into smaller modules.`
      : null,
  ]);

  const expectedScreenCount = input.screenCompositionPlan?.screens.length ?? 0;
  const expectsSharedState = (input.functionalFlowPlan?.globalStateRequirements.length ?? 0) >= 3
    || (input.functionalFlowPlan?.flows.length ?? 0) >= 5;
  const missingModuleBoundaryWarnings = collectWarnings([
    expectedScreenCount >= 3 && generatedScreenFileCount < 2
      ? `Multiple screens were planned (${expectedScreenCount}), but generated pages/screens files are missing.`
      : null,
    expectsSharedState && generatedHookFileCount === 0
      ? 'Shared interaction state is expected, but no generated hooks/* file was found.'
      : null,
    (input.functionalFlowPlan?.entities.length ?? 0) > 0 && generatedDataFileCount === 0
      ? 'Functional plan expects product entities, but no generated data/* file was found.'
      : null,
  ]);

  const customCssFiles = relevantFiles
    .map(([path]) => path)
    .filter(path => /\.css$/.test(path))
    .filter(path => !['styles/generated-theme.css', 'styles/visual-pack.css'].includes(path));
  const skeletonMisuseWarnings = collectWarnings([
    Object.keys(input.files).some(path => normalizePath(path).startsWith('design-pack/premium-components/_registry/'))
      ? 'Generated output attempts to edit design-pack registry files; keep registry files untouched.'
      : null,
    relevantFiles.some(([path, content]) => path !== 'design-pack/premium-components/_registry/premiumComponentPrimitives.tsx' && /\bPremiumPresetRenderer\b/.test(content))
      ? 'Premium component source looks copied inline instead of imported.'
      : null,
    customCssFiles.length > 0
      ? `Random CSS file(s) were generated outside the visual/theme system: ${customCssFiles.join(', ')}`
      : null,
  ]);

  const appSkeleton = input.skeletonId !== 'landing-page';
  const appSource = appFile?.[1] ?? '';
  const inlineScreenSignals = [
    ...Array.from(appSource.matchAll(/function\s+[A-Z][A-Za-z0-9]+(?:Screen|Page)\s*\(/g)),
    ...Array.from(appSource.matchAll(/const\s+[A-Z][A-Za-z0-9]+(?:Screen|Page)\s*=\s*\(/g)),
  ].length;
  const skeletonBypassWarnings = collectWarnings([
    appSkeleton && expectedScreenCount >= 3 && generatedScreenFileCount === 0
      ? 'Pages/screens expected by the selected app skeleton are missing from the generated output.'
      : null,
    appSkeleton && appFileLineCount !== undefined && appFileLineCount >= 160 && generatedScreenFileCount <= 1
      ? 'Custom App.tsx appears to replace screen ownership instead of composing the selected skeleton foundation.'
      : null,
    appSkeleton && /\b(BrowserRouter|Routes|Route)\b/.test(appSource)
      ? 'App.tsx appears to replace skeleton routing/navigation instead of extending it.'
      : null,
    appSkeleton && /\bactiveScreen|activeView|setActiveScreen|setActiveView\b/.test(appSource) && generatedScreenFileCount <= 1
      ? 'Generated source suggests a parallel custom navigation architecture outside the selected skeleton.'
      : null,
    appSkeleton && inlineScreenSignals >= 2
      ? 'App.tsx contains multiple inline screen implementations, which suggests skeleton bypass.'
      : null,
  ]);

  const cardCount = (aggregateSource.match(/<(?:Card|article|section)\b/g) ?? []).length;
  const dirtyCodeWarnings = collectWarnings([
    /\bFeature 1|Feature 2|Feature 3\b/i.test(aggregateSource)
      ? 'Generic Feature 1 / Feature 2 placeholders remain in generated source.'
      : null,
    /\bComing soon|Not implemented|TODO\b/i.test(aggregateSource)
      ? 'Placeholder-only components or unfinished copy remain in generated source.'
      : null,
    /onClick\s*=\s*\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/.test(aggregateSource)
      ? 'Fake buttons without state change were detected.'
      : null,
    /\balert\s*\(/.test(aggregateSource)
      ? 'Primary interactions still rely on alert() instead of local state changes.'
      : null,
    cardCount >= 8 && generatedComponentFileCount === 0
      ? 'Repeated hardcoded card sections appear without reusable component extraction.'
      : null,
    (aggregateSource.match(/\bactiveScreen|activeView|selectedTab|activeTab\b/g) ?? []).length >= 5 && generatedHookFileCount === 0
      ? 'Multiple navigation or tab state signals appear without a shared state owner.'
      : null,
  ]);

  const bonus = [
    generatedScreenFileCount >= 2 ? 8 : 0,
    generatedComponentFileCount >= 2 ? 8 : 0,
    generatedHookFileCount >= 1 ? 7 : 0,
    generatedDataFileCount >= 1 ? 7 : 0,
    appFileLineCount !== undefined && appFileLineCount <= 120 ? 5 : 0,
  ].reduce((sum, value) => sum + value, 0);
  const penalty = (
    giantFileWarnings.length * 12
    + missingModuleBoundaryWarnings.length * 12
    + skeletonMisuseWarnings.length * 14
    + skeletonBypassWarnings.length * 18
    + dirtyCodeWarnings.length * 10
  );
  const architectureHealthScore = clamp(70 + bonus - penalty, 0, 100);

  const suggestedNextAction: ArchitectureImplementationDiagnostics['suggestedNextAction'] =
    input.skeletonIntegrationPlan?.skeletonFit === 'weak' && appSkeleton
      ? 'consider_new_skeleton_later'
      : skeletonBypassWarnings.length > 0 || giantFileWarnings.length > 1
        ? 'split_modules_later'
        : architectureHealthScore < 40
          ? 'add_repair_later'
          : (missingModuleBoundaryWarnings.length > 0 || dirtyCodeWarnings.length > 0 || skeletonMisuseWarnings.length > 0)
            ? 'improve_prompt'
            : 'none';

  return {
    architectureDiagnosticsChecked: true,
    appFileLineCount,
    largestGeneratedFile: largestFile?.path,
    largestGeneratedFileLineCount: largestFile?.lines,
    generatedScreenFileCount,
    generatedComponentFileCount,
    generatedHookFileCount,
    generatedDataFileCount,
    giantFileWarnings,
    missingModuleBoundaryWarnings,
    skeletonMisuseWarnings,
    skeletonBypassWarnings,
    dirtyCodeWarnings,
    architectureHealthScore,
    suggestedNextAction,
  };
}

export function serializeArchitectureImplementationDiagnostics(
  diagnostics: ArchitectureImplementationDiagnostics,
): ArchitectureImplementationDiagnosticsTelemetry {
  return {
    architecture_diagnostics_checked: diagnostics.architectureDiagnosticsChecked,
    app_file_line_count: diagnostics.appFileLineCount,
    largest_generated_file: diagnostics.largestGeneratedFile,
    largest_generated_file_line_count: diagnostics.largestGeneratedFileLineCount,
    generated_screen_file_count: diagnostics.generatedScreenFileCount,
    generated_component_file_count: diagnostics.generatedComponentFileCount,
    generated_hook_file_count: diagnostics.generatedHookFileCount,
    generated_data_file_count: diagnostics.generatedDataFileCount,
    giant_file_warnings: diagnostics.giantFileWarnings,
    missing_module_boundary_warnings: diagnostics.missingModuleBoundaryWarnings,
    skeleton_misuse_warnings: diagnostics.skeletonMisuseWarnings,
    skeleton_bypass_warnings: diagnostics.skeletonBypassWarnings,
    dirty_code_warnings: diagnostics.dirtyCodeWarnings,
    architecture_health_score: diagnostics.architectureHealthScore,
    suggested_next_action: diagnostics.suggestedNextAction,
  };
}
