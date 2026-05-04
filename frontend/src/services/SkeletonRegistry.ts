/**
 * SkeletonRegistry — maps project type to pre-built skeleton.
 *
 * Skeletons live at:  skeletons/<id>/skeleton-<id>/src/
 *
 * The BUILD agent receives ONLY:
 *   1. route-manifest.json (compact, ~2KB)
 *   2. A list of "delta files" it must write
 *   3. A list of "locked files" it must NOT rewrite
 *
 * Actual skeleton files are copied by the backend BEFORE the BUILD prompt
 * is sent — zero skeleton tokens hit the LLM context.
 */

export type SkeletonId =
  | 'mobile-app'
  | 'saas-dashboard'
  | 'landing-page'
  | 'social-community'   // pending: skeleton not yet uploaded
  | 'productivity-tool'  // pending
  | 'ecommerce';          // pending

export interface SkeletonMeta {
  id: SkeletonId;
  label: string;
  description: string;
  /** App type tags used by architect to select skeleton */
  tags: string[];
  navigation: 'bottom-tabs' | 'sidebar' | 'anchor-scroll' | 'top-nav';
  /** Relative paths (from skeleton src/) of files the BUILD agent MUST write */
  deltaFiles: string[];
  /** Glob prefixes the BUILD agent must NOT touch */
  lockedPrefixes: string[];
  /** Components already provided — agent should import, not recreate */
  providedComponents: string[];
  providedHooks: string[];
  uiPrimitives: string[];
  /** true = skeleton files are on disk and ready to copy */
  available: boolean;
}

export const SKELETON_REGISTRY: Record<SkeletonId, SkeletonMeta> = {
  'mobile-app': {
    id: 'mobile-app',
    label: 'Mobile App',
    description:
      'Consumer B2C app with bottom-tabs, onboarding wizard, home feed, ' +
      'detail screen, progress stats, profile, and paywall sheet.',
    tags: [
      'mobile', 'app', 'consumer', 'b2c', 'tracker', 'health', 'wellness',
      'lifestyle', 'habit', 'journal', 'feed', 'onboarding', 'learning',
    ],
    navigation: 'bottom-tabs',
    deltaFiles: [
      'src/config/app.ts',
      'src/config/navigation.ts',
      'src/data/types.ts',
      'src/data/seed.ts',
      'src/pages/Onboarding.tsx',
      'src/pages/Home.tsx',
      'src/pages/Detail.tsx',
      'src/pages/Create.tsx',
      'src/pages/Progress.tsx',
      'src/pages/Profile.tsx',
    ],
    lockedPrefixes: [
      'src/main.tsx',
      'src/index.css',
      'src/lib/',
      'src/hooks/',
      'src/context/',
      'src/components/',
      'src/config/routes.ts',
      'src/config/theme.ts',
    ],
    providedComponents: [
      'ErrorBoundary', 'LoadingScreen', 'EmptyState',
      'BottomTabs', 'PaywallSheet',
    ],
    providedHooks: ['useApp', 'useLocalStorage', 'useTheme'],
    uiPrimitives: [
      'Avatar', 'Badge', 'Button', 'Card', 'Dialog',
      'Input', 'Progress', 'Select', 'Sheet', 'Skeleton', 'Tabs',
    ],
    available: true,
  },

  'saas-dashboard': {
    id: 'saas-dashboard',
    label: 'SaaS Dashboard',
    description:
      'Desktop-first SaaS app with collapsible sidebar, KPI dashboard, ' +
      'sortable data table, settings tabs, and onboarding checklist.',
    tags: [
      'saas', 'dashboard', 'b2b', 'admin', 'analytics', 'data', 'table',
      'sidebar', 'enterprise', 'tool', 'crm', 'cms', 'metrics',
    ],
    navigation: 'sidebar',
    deltaFiles: [
      'src/config/app.ts',
      'src/config/navigation.ts',
      'src/data/types.ts',
      'src/data/seed.ts',
      'src/pages/Dashboard.tsx',
      'src/pages/DataView.tsx',
      'src/pages/Settings.tsx',
    ],
    lockedPrefixes: [
      'src/main.tsx',
      'src/index.css',
      'src/lib/',
      'src/hooks/',
      'src/context/',
      'src/components/',
      'src/config/routes.ts',
      'src/config/theme.ts',
    ],
    providedComponents: [
      'ErrorBoundary', 'LoadingScreen', 'EmptyState',
      'Sidebar', 'TopBar', 'KPICard', 'Sparkline',
      'DataTable', 'OnboardingChecklist',
    ],
    providedHooks: ['useApp', 'useLocalStorage', 'useTheme', 'useTable'],
    uiPrimitives: [
      'Avatar', 'Badge', 'Button', 'Card', 'Dialog',
      'Input', 'Progress', 'Select', 'Sheet', 'Skeleton', 'Tabs',
    ],
    available: true,
  },

  'landing-page': {
    id: 'landing-page',
    label: 'Landing Page',
    description:
      'Marketing single-page site: sticky nav, hero, social proof, ' +
      'features bento, how-it-works, pricing toggle, FAQ, footer.',
    tags: [
      'landing', 'marketing', 'product', 'saas-landing', 'waitlist',
      'launch', 'single-page', 'promotional', 'website',
    ],
    navigation: 'anchor-scroll',
    deltaFiles: [
      'src/config/app.ts',
      'src/data/content.ts',
      'src/App.tsx',
    ],
    lockedPrefixes: [
      'src/main.tsx',
      'src/index.css',
      'src/lib/',
      'src/components/',
    ],
    providedComponents: [
      'ErrorBoundary', 'Nav',
      'sections/Hero', 'sections/SocialProof', 'sections/Features',
      'sections/HowItWorks', 'sections/Pricing', 'sections/FAQ',
      'sections/FinalCTA', 'sections/Footer',
    ],
    providedHooks: [],
    uiPrimitives: [
      'Avatar', 'Badge', 'Button', 'Card', 'Dialog',
      'Input', 'Progress', 'Select', 'Sheet', 'Skeleton', 'Tabs',
    ],
    available: true,
  },

  'social-community': {
    id: 'social-community',
    label: 'Social / Community App',
    description:
      'Bottom-tab social app: Feed (PostCard + like/comment), Explore (search + trending), ' +
      'Create post flow, Notifications list, user Profile.',
    tags: [
      'social', 'community', 'feed', 'posts', 'follow', 'notifications',
      'user-generated', 'instagram', 'twitter', 'forum', 'club',
    ],
    navigation: 'bottom-tabs',
    deltaFiles: [
      'src/config/app.ts',
      'src/config/navigation.ts',
      'src/data/types.ts',
      'src/data/seed.ts',
      'src/pages/Feed.tsx',
      'src/pages/Explore.tsx',
      'src/pages/Create.tsx',
      'src/pages/PostDetail.tsx',
      'src/pages/Notifications.tsx',
      'src/pages/Profile.tsx',
    ],
    lockedPrefixes: [
      'src/main.tsx',
      'src/index.css',
      'src/lib/',
      'src/hooks/',
      'src/context/',
      'src/components/',
      'src/config/routes.ts',
      'src/config/theme.ts',
    ],
    providedComponents: [
      'ErrorBoundary', 'LoadingScreen', 'EmptyState',
      'BottomTabs', 'PostCard', 'CommentItem', 'NotificationItem', 'UserAvatar',
    ],
    providedHooks: ['useApp', 'useFeed', 'useLocalStorage', 'useTheme'],
    uiPrimitives: [
      'Avatar', 'Badge', 'Button', 'Card', 'Dialog',
      'Input', 'Progress', 'Select', 'Sheet', 'Skeleton', 'Tabs',
    ],
    available: true,
  },

  'productivity-tool': {
    id: 'productivity-tool',
    label: 'Productivity Tool',
    description:
      'Desktop-first sidebar app: Kanban + List dual view, ItemDetailSheet, ' +
      'CommandPalette (⌘K), keyboard shortcuts.',
    tags: [
      'productivity', 'kanban', 'task', 'notes', 'tool', 'workspace', 'todos',
      'project-management', 'trello', 'notion', 'linear', 'jira',
    ],
    navigation: 'sidebar',
    deltaFiles: [
      'src/config/app.ts',
      'src/config/navigation.ts',
      'src/data/types.ts',
      'src/data/seed.ts',
      'src/pages/Workspace.tsx',
    ],
    lockedPrefixes: [
      'src/main.tsx',
      'src/index.css',
      'src/lib/',
      'src/hooks/',
      'src/context/',
      'src/components/',
      'src/config/routes.ts',
      'src/config/theme.ts',
    ],
    providedComponents: [
      'ErrorBoundary', 'LoadingScreen', 'EmptyState',
      'Sidebar', 'TopBar', 'KanbanBoard', 'ListView',
      'ItemCard', 'ItemDetailSheet', 'CommandPalette',
    ],
    providedHooks: [
      'useApp', 'useCommandPalette', 'useKeyboard',
      'useLocalStorage', 'useTheme',
    ],
    uiPrimitives: [
      'Avatar', 'Badge', 'Button', 'Card', 'Dialog',
      'Input', 'Progress', 'Select', 'Sheet', 'Skeleton', 'Tabs',
    ],
    available: true,
  },

  'ecommerce': {
    id: 'ecommerce',
    label: 'E-Commerce / Marketplace',
    description:
      'Bottom-tab shop: product catalog + search, ProductDetail (image gallery, variants), ' +
      'Cart (quantity stepper, free-shipping progress), 3-step Checkout, Wishlist, Account.',
    tags: [
      'ecommerce', 'shop', 'store', 'marketplace', 'cart', 'checkout', 'product',
      'catalog', 'shopify', 'amazon', 'retail', 'buy', 'sell',
    ],
    navigation: 'bottom-tabs',
    deltaFiles: [
      'src/config/app.ts',
      'src/config/navigation.ts',
      'src/data/types.ts',
      'src/data/seed.ts',
      'src/pages/Home.tsx',
      'src/pages/Search.tsx',
      'src/pages/ProductDetail.tsx',
      'src/pages/Cart.tsx',
      'src/pages/Checkout.tsx',
      'src/pages/Wishlist.tsx',
      'src/pages/Account.tsx',
    ],
    lockedPrefixes: [
      'src/main.tsx',
      'src/index.css',
      'src/lib/',
      'src/hooks/',
      'src/context/',
      'src/components/',
      'src/config/routes.ts',
      'src/config/theme.ts',
    ],
    providedComponents: [
      'ErrorBoundary', 'LoadingScreen', 'EmptyState',
      'BottomTabs', 'ProductCard', 'ProductImage', 'ImageGallery',
      'RatingStars', 'ReviewItem', 'FiltersSidebar',
    ],
    providedHooks: [
      'useCart', 'useWishlist', 'useLocalStorage', 'useTheme',
    ],
    uiPrimitives: [
      'Avatar', 'Badge', 'Button', 'Card', 'Dialog',
      'Input', 'Progress', 'Select', 'Sheet', 'Skeleton', 'Tabs',
    ],
    available: true,
  },
};

/**
 * Select the best skeleton for a project based on tags from ProductPlan.
 * Falls back to 'mobile-app' (the universal B2C default).
 */
export function selectSkeleton(
  appType: string | undefined,
  tags: string[] = [],
): SkeletonId {
  const input = [appType ?? '', ...tags]
    .join(' ')
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, ' ');

  // Check each skeleton's tag score
  const scores: [SkeletonId, number][] = (
    Object.values(SKELETON_REGISTRY) as SkeletonMeta[]
  )
    .filter(s => s.available)
    .map(s => {
      const score = s.tags.reduce(
        (acc, tag) => acc + (input.includes(tag) ? 1 : 0),
        0,
      );
      return [s.id, score] as [SkeletonId, number];
    });

  scores.sort((a, b) => b[1] - a[1]);
  const best = scores[0];

  // Only use non-mobile skeleton if it clearly wins (score >= 2)
  if (best && best[1] >= 2 && best[0] !== 'mobile-app') {
    return best[0];
  }

  return 'mobile-app'; // universal default
}

/**
 * Build the compact skeleton context block injected into the BUILD prompt.
 * ~600 tokens total — no skeleton source code included.
 */
export function buildSkeletonPromptBlock(skeletonId: SkeletonId): string {
  const s = SKELETON_REGISTRY[skeletonId];
  if (!s || !s.available) return '';

  return `
═══════════════════════════════════════════════════════
  SKELETON INSTALLED: ${s.label} (${s.id})
═══════════════════════════════════════════════════════

The project skeleton is already installed in the workspace.
Navigation pattern: ${s.navigation}

PROVIDED — DO NOT RECREATE (already compiled and working):
Components: ${s.providedComponents.join(', ')}
Hooks: ${s.providedHooks.length ? s.providedHooks.join(', ') : 'none'}
UI primitives: ${s.uiPrimitives.join(', ')}
Import path: @/components/..., @/hooks/..., @/lib/cn

LOCKED FILES — DO NOT OUTPUT THESE FILES:
${s.lockedPrefixes.map(p => `  • ${p}`).join('\n')}

YOUR JOB — WRITE ONLY THESE ${s.deltaFiles.length} FILES:
${s.deltaFiles.map(f => `  • ${f}`).join('\n')}

KEY RULES:
• Replace "AppName" with the real product name everywhere
• Replace all /* PRODUCT: ... */ markers with product-specific content
• Replace all // SEED: ... markers with real domain data (5-10 items)
• Import from existing skeleton files — do not duplicate their code
• Use design tokens: bg-background, bg-card, text-foreground, text-muted-foreground,
  border-border, text-primary, --pm-brand (never hardcode hex colors)
• Every list page uses <EmptyState> from @/components/EmptyState
• Every loading state uses <Skeleton> from @/components/ui/Skeleton
• Paywall trigger: call openPaywall() from useApp() after freeActionLimit actions
`.trim();
}
