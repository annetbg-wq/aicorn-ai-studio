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

import b2bOperationsWorkspaceManifest from './skeleton-manifests/b2b-operations-workspace/skeleton.manifest.json';
import bookingServiceAppManifest from './skeleton-manifests/booking-service-app/skeleton.manifest.json';
import contentLearningAppManifest from './skeleton-manifests/content-learning-app/skeleton.manifest.json';
import creatorEditorWorkspaceManifest from './skeleton-manifests/creator-editor-workspace/skeleton.manifest.json';
import datingMatchingAppManifest from './skeleton-manifests/dating-matching-app/skeleton.manifest.json';
import ecommerceManifest from './skeleton-manifests/ecommerce/skeleton.manifest.json';
import gameInteractiveAppManifest from './skeleton-manifests/game-interactive-app/skeleton.manifest.json';
import gamingCasinoAppManifest from './skeleton-manifests/gaming-casino-app/skeleton.manifest.json';
import landingPageManifest from './skeleton-manifests/landing-page/skeleton.manifest.json';
import marketplacePlatformManifest from './skeleton-manifests/marketplace-platform/skeleton.manifest.json';
import mobileAppManifest from './skeleton-manifests/mobile-app/skeleton.manifest.json';
import productivityToolManifest from './skeleton-manifests/productivity-tool/skeleton.manifest.json';
import saasDashboardManifest from './skeleton-manifests/saas-dashboard/skeleton.manifest.json';
import socialCommunityManifest from './skeleton-manifests/social-community/skeleton.manifest.json';
import { filterAdvertisedUiPrimitiveNames } from './LiveGenerationUiPrimitives';

export type SkeletonId =
  | 'mobile-app'
  | 'saas-dashboard'
  | 'landing-page'
  | 'social-community'
  | 'productivity-tool'
  | 'ecommerce'
  | 'b2b-operations-workspace'
  | 'marketplace-platform'
  | 'creator-editor-workspace'
  | 'dating-matching-app'
  | 'gaming-casino-app'
  | 'game-interactive-app'
  | 'booking-service-app'
  | 'content-learning-app';

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
  /** Visual pack compatibility gate applied before domain/tone scoring. */
  visualCompatibility: SkeletonVisualCompatibilityContract;
  /** true = skeleton files are on disk and ready to copy */
  available: boolean;
  /**
   * Exact API contract of this skeleton's AppContext / useApp() hook.
   * Injected verbatim into the coder system prompt so the LLM knows what the
   * context provides and what it must NOT reinvent with raw localStorage calls.
   */
  contextContract?: string;
}

export interface SkeletonVisualCompatibilityContract {
  allowedSurfaces: string[];
  allowedLayoutPatterns: string[];
  allowedDensityProfiles: string[];
  allowedMotionProfiles: string[];
  allowedComponentFamilies: string[];
  forbiddenVisualPatterns: string[];
}

export interface SkeletonPromptContext {
  plan?: Record<string, unknown> | null;
  technicalBlueprint?: Record<string, unknown> | null;
}

interface SkeletonManifestGroup {
  label: string;
  paths: string[];
}

interface SkeletonManifest {
  id: SkeletonId;
  workingGroups: SkeletonManifestGroup[];
  protectedFiles: string[];
  editableFiles: string[];
  deltaFiles: string[];
}

const SKELETON_MANIFESTS: Record<SkeletonId, SkeletonManifest> = {
  'mobile-app':                mobileAppManifest as SkeletonManifest,
  'saas-dashboard':            saasDashboardManifest as SkeletonManifest,
  'landing-page':              landingPageManifest as SkeletonManifest,
  'social-community':          socialCommunityManifest as SkeletonManifest,
  'productivity-tool':         productivityToolManifest as SkeletonManifest,
  ecommerce:                   ecommerceManifest as SkeletonManifest,
  'b2b-operations-workspace':  b2bOperationsWorkspaceManifest as SkeletonManifest,
  'marketplace-platform':      marketplacePlatformManifest as SkeletonManifest,
  'creator-editor-workspace':  creatorEditorWorkspaceManifest as SkeletonManifest,
  'dating-matching-app':       datingMatchingAppManifest as SkeletonManifest,
  'gaming-casino-app':         gamingCasinoAppManifest as SkeletonManifest,
  'game-interactive-app':      gameInteractiveAppManifest as SkeletonManifest,
  'booking-service-app':       bookingServiceAppManifest as SkeletonManifest,
  'content-learning-app':      contentLearningAppManifest as SkeletonManifest,
};

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
    providedHooks: ['useLocalStorage', 'useTheme'],
    uiPrimitives: [
      'AlertDialog', 'Avatar', 'Badge', 'Button', 'Card', 'Dialog',
      'Input', 'Label', 'Progress', 'ScrollArea', 'Select', 'Sheet', 'Skeleton', 'Tabs',
    ],
    visualCompatibility: {
      allowedSurfaces: ['mobile', 'bottom-tabs', 'feed', 'detail', 'profile', 'onboarding', 'progress', 'create'],
      allowedLayoutPatterns: ['bottom-tabs', 'card-feed', 'list-detail', 'onboarding-flow', 'bottom-sheet', 'profile-stack'],
      allowedDensityProfiles: ['compact', 'comfortable', 'spacious'],
      allowedMotionProfiles: ['gentle', 'expressive', 'reduced'],
      allowedComponentFamilies: ['mobile-nav', 'feed-item', 'onboarding-step', 'profile-card', 'bottom-sheet', 'card', 'list-item'],
      forbiddenVisualPatterns: ['desktop-only sidebar shell', 'data-dense admin table', 'nested dashboard grid', 'tiny tap targets'],
    },
    available: true,
    contextContract: `
useApp() — imported from '@/context/AppContext' — returns:
  isOnboarded: boolean        — true when profile.onboardingComplete && profile.name.length > 0
  profile: { id, name, goal, createdAt, onboardingComplete, plan, usageCount }
  isPremium: boolean
  loadingState: 'loading' | 'ready' | 'error'
  completeOnboarding({ name: string, goal: string }) — call this to finish onboarding (sets onboardingComplete=true, persists to localStorage automatically)
  updateProfile(patch: Partial<UserProfile>)          — patch any profile field
  consumeAction(limit: number): boolean               — increment usage; returns false when over limit
  setPlan(plan: 'free' | 'pro' | 'team')
  resetProfile()
  themeChoice, resolvedTheme, setTheme(choice)

CRITICAL RULES:
- NEVER use useLocalStorage('onboarding', ...) — onboarding state lives inside AppContext at STORAGE_KEYS.profile
- To complete onboarding call completeOnboarding({ name, goal }) — do NOT write to localStorage directly
- The Onboarding screen MUST call completeOnboarding() on submit, not navigate away by setting local state
- Check isOnboarded (not any local flag) to decide whether to show the onboarding screen
`,
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
    providedHooks: ['useLocalStorage', 'useTheme', 'useTable'],
    uiPrimitives: [
      'Avatar', 'Badge', 'Button', 'Card', 'Dialog',
      'Input', 'Progress', 'ScrollArea', 'Select', 'Sheet', 'Skeleton', 'Tabs',
    ],
    visualCompatibility: {
      allowedSurfaces: ['dashboard', 'sidebar', 'metrics', 'data-table', 'settings', 'workspace'],
      allowedLayoutPatterns: ['sidebar-shell', 'kpi-grid', 'data-table', 'settings-tabs', 'operator-dashboard'],
      allowedDensityProfiles: ['compact', 'comfortable'],
      allowedMotionProfiles: ['reduced', 'gentle'],
      allowedComponentFamilies: ['sidebar-nav', 'dashboard-header', 'stat-card', 'metric-card', 'data-table', 'tabs'],
      forbiddenVisualPatterns: ['bottom-tab-only mobile shell', 'oversized consumer feed', 'full-bleed marketing hero', 'playful sticker ui'],
    },
    available: true,
    contextContract: `
useApp() — imported from '@/context/AppContext' — returns:
  profile: { name, email, role, avatarUrl, plan, ... }
  updateProfile(patch: Partial<UserProfile>)
  sidebarCollapsed: boolean
  setSidebarCollapsed(collapsed: boolean)
  checklist: readonly ChecklistTask[]   — onboarding checklist items
  toggleTask(id: string)               — mark a checklist item done
  dismissChecklist()                   — hide the checklist panel
  isChecklistDismissed: boolean
  loadingState: 'loading' | 'ready' | 'error'
  themeChoice, resolvedTheme, setTheme(choice)

CRITICAL RULES:
- NEVER manage sidebar collapsed state with local useState — use setSidebarCollapsed from useApp()
- NEVER manage checklist state locally — use toggleTask / dismissChecklist from useApp()
`,
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
      'Input', 'Progress', 'ScrollArea', 'Select', 'Sheet', 'Skeleton', 'Tabs',
    ],
    visualCompatibility: {
      allowedSurfaces: ['marketing', 'hero', 'pricing', 'faq', 'cta', 'top-nav', 'social-proof'],
      allowedLayoutPatterns: ['top-nav', 'hero-section', 'bento-grid', 'pricing-grid', 'faq-stack', 'landing-scroll'],
      allowedDensityProfiles: ['comfortable', 'spacious'],
      allowedMotionProfiles: ['gentle', 'expressive', 'reduced'],
      allowedComponentFamilies: ['nav', 'hero', 'bento', 'pricing-card', 'faq', 'cta'],
      forbiddenVisualPatterns: ['admin sidebar shell', 'data table first screen', 'bottom-tab app shell', 'nested app dashboard'],
    },
    available: true,
    contextContract: `
No AppContext / useApp() in this skeleton — it is a single-page static marketing site.
All app configuration comes from src/data/content.ts which you MUST write.
Do NOT import from '@/context/AppContext'.
`,
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
    providedHooks: ['useFeed', 'useLocalStorage', 'useTheme'],
    uiPrimitives: [
      'Avatar', 'Badge', 'Button', 'Card', 'Dialog',
      'Input', 'Progress', 'ScrollArea', 'Select', 'Sheet', 'Skeleton', 'Tabs',
    ],
    visualCompatibility: {
      allowedSurfaces: ['mobile', 'bottom-tabs', 'feed', 'explore', 'notifications', 'profile', 'post-detail'],
      allowedLayoutPatterns: ['bottom-tabs', 'social-feed', 'story-rail', 'profile-stack', 'comment-thread', 'composer-flow'],
      allowedDensityProfiles: ['compact', 'comfortable', 'spacious'],
      allowedMotionProfiles: ['gentle', 'expressive', 'reduced'],
      allowedComponentFamilies: ['mobile-nav', 'post-card', 'comment-item', 'notification-item', 'user-avatar', 'feed-card'],
      forbiddenVisualPatterns: ['desktop-only sidebar shell', 'data-dense admin table', 'checkout-first store shell'],
    },
    available: true,
    contextContract: `
useApp() — imported from '@/context/AppContext' — returns:
  currentUser: User              — the logged-in seed user (read-only; no real auth in prototype)
  follows: readonly string[]     — user ids that currentUser follows
  isFollowing(userId: string): boolean
  toggleFollow(userId: string)   — follow / unfollow; persists automatically
  unreadNotifications: number
  markNotificationsRead()
  loadingState: 'loading' | 'ready' | 'error'
  themeChoice, resolvedTheme, setTheme(choice)

CRITICAL RULES:
- NEVER create auth state with useState — currentUser is always pre-seeded via SEED_USERS
- NEVER use useLocalStorage for follow state — use toggleFollow() from useApp()
- currentUser is read-only; update it only via updateProfile if available
`,
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
      'useCommandPalette', 'useKeyboard',
      'useLocalStorage', 'useTheme',
    ],
    uiPrimitives: [
      'Avatar', 'Badge', 'Button', 'Card', 'Dialog',
      'Input', 'Progress', 'ScrollArea', 'Select', 'Sheet', 'Skeleton', 'Tabs',
    ],
    visualCompatibility: {
      allowedSurfaces: ['workspace', 'sidebar', 'kanban', 'list', 'detail-sheet', 'command-palette'],
      allowedLayoutPatterns: ['sidebar-workspace', 'kanban-board', 'list-detail', 'split-pane', 'command-palette', 'detail-sheet'],
      allowedDensityProfiles: ['compact', 'comfortable'],
      allowedMotionProfiles: ['reduced', 'gentle'],
      allowedComponentFamilies: ['sidebar-nav', 'top-bar', 'kanban-card', 'list-item', 'tabs', 'command-palette', 'sheet'],
      forbiddenVisualPatterns: ['bottom-tab-only mobile shell', 'marketing hero first screen', 'playful sticker ui'],
    },
    available: true,
    contextContract: `
useApp() — imported from '@/context/AppContext' — returns:
  workspaces: readonly Workspace[]
  tags: readonly Tag[]
  items: readonly Item[]
  activeWorkspaceId: string
  setActiveWorkspaceId(id: string)
  view: 'kanban' | 'list'
  setView(view: ViewMode)
  filters: Filters
  setFilters(patch: Partial<Filters>)
  openItemId: string | null
  openItem(id: string | null)         — open/close the ItemDetailSheet
  setItemStatus(id: string, status: ItemStatus)  — optimistic drag-to-column update
  sidebarCollapsed: boolean
  setSidebarCollapsed(collapsed: boolean)
  loadingState: 'loading' | 'ready' | 'error'
  themeChoice, resolvedTheme, setTheme(choice)

CRITICAL RULES:
- NEVER manage view mode (kanban/list), filters, or sidebar with local useState — use setView/setFilters/setSidebarCollapsed from useApp()
- NEVER manage openItemId locally — call openItem() from useApp()
`,
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
      'Input', 'Progress', 'ScrollArea', 'Select', 'Sheet', 'Skeleton', 'Tabs',
    ],
    visualCompatibility: {
      allowedSurfaces: ['storefront', 'product-grid', 'product-detail', 'cart', 'checkout', 'account', 'bottom-tabs'],
      allowedLayoutPatterns: ['product-grid', 'product-detail', 'checkout-flow', 'bottom-tabs', 'cart-stack', 'wishlist-list'],
      allowedDensityProfiles: ['compact', 'comfortable', 'spacious'],
      allowedMotionProfiles: ['gentle', 'expressive', 'reduced'],
      allowedComponentFamilies: ['product-card', 'product-image', 'image-gallery', 'rating-stars', 'review-item', 'filters', 'bottom-tabs'],
      forbiddenVisualPatterns: ['admin sidebar shell', 'data-dense admin table', 'social feed primary shell', 'clinical dashboard shell'],
    },
    available: true,
    contextContract: `
useApp() — imported from '@/context/AppContext' — returns:
  cart: {
    items: CartItem[]
    addItem(product: Product, qty?: number): void
    removeItem(id: string): void
    updateQty(id: string, qty: number): void
    clearCart(): void
    total: number
    itemCount: number
    freeShippingProgress: number   — 0–1 fraction toward free-shipping threshold
  }
  wishlist: {
    ids: readonly string[]
    toggle(productId: string): void
    has(productId: string): boolean
  }
  loadingState: 'loading' | 'ready' | 'error'
  themeChoice, resolvedTheme, setTheme(choice)

CRITICAL RULES:
- NEVER use useLocalStorage for cart or wishlist state — use cart.addItem() / wishlist.toggle() from useApp()
- NEVER create local cart arrays with useState — the cart is persisted automatically via AppContext
`,
  },

  'b2b-operations-workspace': {
    id: 'b2b-operations-workspace',
    label: 'B2B Operations Workspace',
    description: 'Sidebar-first B2B operations dashboard with record tables, KPI cards, workflow views, and team management.',
    tags: [
      'b2b', 'operations', 'workspace', 'dashboard', 'sidebar', 'records', 'workflow',
      'team', 'admin', 'business', 'enterprise', 'kpi', 'table', 'management',
    ],
    navigation: 'sidebar',
    deltaFiles: [
      'src/config/app.ts',
      'src/config/navigation.ts',
      'src/data/types.ts',
      'src/data/seed.ts',
      'src/pages/Dashboard.tsx',
      'src/pages/RecordDetail.tsx',
      'src/pages/Records.tsx',
      'src/pages/Reports.tsx',
      'src/pages/Settings.tsx',
      'src/pages/Team.tsx',
      'src/pages/Workflow.tsx',
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
      'Sidebar', 'PageHeader', 'KPICard', 'RecordTable',
    ],
    providedHooks: ['useLocalStorage', 'useTheme'],
    uiPrimitives: [
      'Badge', 'Button', 'Card', 'Input', 'Progress', 'ScrollArea', 'Tabs',
    ],
    visualCompatibility: {
      allowedSurfaces: ['sidebar', 'dashboard', 'record-table', 'record-detail', 'workflow', 'team', 'settings'],
      allowedLayoutPatterns: ['sidebar-content', 'table-detail', 'kpi-grid', 'workflow-lane'],
      allowedDensityProfiles: ['compact', 'comfortable'],
      allowedMotionProfiles: ['gentle', 'reduced'],
      allowedComponentFamilies: ['kpi-card', 'record-table', 'sidebar', 'page-header'],
      forbiddenVisualPatterns: ['bottom-tabs primary nav', 'landing hero section', 'storefront product grid'],
    },
    available: true,
    contextContract: `
useApp() — imported from '@/context/AppContext' — returns:
  loadingState: 'loading' | 'ready' | 'error'
  themeChoice, resolvedTheme, setTheme(choice)

CRITICAL RULES:
- Use Sidebar component for navigation, NOT bottom-tabs
- Use RecordTable for tabular data, NOT custom table elements
`,
  },

  'marketplace-platform': {
    id: 'marketplace-platform',
    label: 'Marketplace Platform',
    description: 'Multi-sided marketplace with home feed, listings, seller dashboard, and messaging.',
    tags: [
      'marketplace', 'platform', 'listing', 'seller', 'buyer', 'shop', 'commerce',
      'multi-vendor', 'messages', 'storefront', 'ecommerce', 'peer-to-peer',
    ],
    navigation: 'bottom-tabs',
    deltaFiles: [
      'src/config/app.ts',
      'src/config/navigation.ts',
      'src/data/types.ts',
      'src/data/seed.ts',
      'src/pages/Browse.tsx',
      'src/pages/Home.tsx',
      'src/pages/Listing.tsx',
      'src/pages/Messages.tsx',
      'src/pages/Profile.tsx',
      'src/pages/SellerDashboard.tsx',
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
      'ErrorBoundary', 'LoadingScreen', 'EmptyState', 'BottomTabs',
    ],
    providedHooks: ['useLocalStorage', 'useTheme'],
    uiPrimitives: [
      'Badge', 'Button', 'Card', 'Input', 'Progress', 'ScrollArea', 'Tabs',
    ],
    visualCompatibility: {
      allowedSurfaces: ['home-feed', 'listing-detail', 'seller-dashboard', 'messages', 'bottom-tabs'],
      allowedLayoutPatterns: ['bottom-tabs', 'card-feed', 'detail-view', 'dashboard-grid'],
      allowedDensityProfiles: ['compact', 'comfortable', 'spacious'],
      allowedMotionProfiles: ['gentle', 'expressive', 'reduced'],
      allowedComponentFamilies: ['listing-card', 'bottom-tabs', 'message-thread'],
      forbiddenVisualPatterns: ['admin sidebar shell', 'data-dense admin table', 'clinical dashboard shell'],
    },
    available: true,
    contextContract: `
useApp() — imported from '@/context/AppContext' — returns:
  loadingState: 'loading' | 'ready' | 'error'
  themeChoice, resolvedTheme, setTheme(choice)

CRITICAL RULES:
- Use BottomTabs for primary navigation
`,
  },

  'creator-editor-workspace': {
    id: 'creator-editor-workspace',
    label: 'Creator / Editor Workspace',
    description: 'Sidebar-based creative tool workspace with a canvas editor, asset management, and project list.',
    tags: [
      'creator', 'editor', 'workspace', 'canvas', 'design', 'tool', 'creative',
      'sidebar', 'assets', 'project', 'content-creation', 'studio',
    ],
    navigation: 'sidebar',
    deltaFiles: [
      'src/config/app.ts',
      'src/config/navigation.ts',
      'src/data/types.ts',
      'src/data/seed.ts',
      'src/pages/Analytics.tsx',
      'src/pages/Editor.tsx',
      'src/pages/Home.tsx',
      'src/pages/Media.tsx',
      'src/pages/Publications.tsx',
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
      'ErrorBoundary', 'LoadingScreen', 'EmptyState', 'Sidebar',
    ],
    providedHooks: ['useLocalStorage', 'useTheme'],
    uiPrimitives: [
      'Badge', 'Button', 'Card', 'Input', 'Progress', 'ScrollArea', 'Tabs',
    ],
    visualCompatibility: {
      allowedSurfaces: ['sidebar', 'editor-canvas', 'home-project-list', 'asset-panel'],
      allowedLayoutPatterns: ['sidebar-editor', 'canvas-panel', 'project-grid'],
      allowedDensityProfiles: ['compact', 'comfortable'],
      allowedMotionProfiles: ['gentle', 'reduced'],
      allowedComponentFamilies: ['sidebar', 'canvas', 'project-card'],
      forbiddenVisualPatterns: ['bottom-tabs primary nav', 'landing hero section', 'storefront product grid'],
    },
    available: true,
    contextContract: `
useApp() — imported from '@/context/AppContext' — returns:
  loadingState: 'loading' | 'ready' | 'error'
  themeChoice, resolvedTheme, setTheme(choice)

CRITICAL RULES:
- Use Sidebar for navigation, NOT bottom-tabs
`,
  },

  'dating-matching-app': {
    id: 'dating-matching-app',
    label: 'Dating & Matching App',
    description: 'Mobile-first dating app with swipe discovery, matches list, messaging, and onboarding.',
    tags: [
      'dating', 'matching', 'swipe', 'discover', 'matches', 'chat', 'profile',
      'mobile', 'social', 'romance', 'connect', 'conversation', 'onboarding',
    ],
    navigation: 'bottom-tabs',
    deltaFiles: [
      'src/config/app.ts',
      'src/config/navigation.ts',
      'src/data/types.ts',
      'src/data/seed.ts',
      'src/pages/Conversation.tsx',
      'src/pages/Discover.tsx',
      'src/pages/Matches.tsx',
      'src/pages/Onboarding.tsx',
      'src/pages/Profile.tsx',
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
      'ErrorBoundary', 'LoadingScreen', 'EmptyState', 'BottomTabs',
    ],
    providedHooks: ['useLocalStorage', 'useTheme'],
    uiPrimitives: [
      'Badge', 'Button', 'Card', 'Input', 'Progress', 'ScrollArea', 'Tabs',
    ],
    visualCompatibility: {
      allowedSurfaces: ['discover-deck', 'match-list', 'conversation', 'profile', 'onboarding', 'bottom-tabs'],
      allowedLayoutPatterns: ['bottom-tabs', 'swipe-deck', 'match-grid', 'chat-thread'],
      allowedDensityProfiles: ['comfortable', 'spacious'],
      allowedMotionProfiles: ['gentle', 'expressive'],
      allowedComponentFamilies: ['profile-card', 'bottom-tabs', 'chat-bubble'],
      forbiddenVisualPatterns: ['sidebar shell', 'landing hero', 'admin table'],
    },
    available: true,
    contextContract: `
useApp() — imported from '@/context/AppContext' — returns:
  loadingState: 'loading' | 'ready' | 'error'
  themeChoice, resolvedTheme, setTheme(choice)

CRITICAL RULES:
- Use BottomTabs for primary navigation
- Onboarding renders before the main tab shell
`,
  },

  'gaming-casino-app': {
    id: 'gaming-casino-app',
    label: 'Gaming / Casino App',
    description: 'Mobile gaming/casino app with lobby, game browser, promotions, and account management.',
    tags: [
      'gaming', 'casino', 'game', 'lobby', 'games', 'promotions', 'account',
      'mobile', 'play', 'betting', 'slots', 'entertainment', 'rewards',
    ],
    navigation: 'bottom-tabs',
    deltaFiles: [
      'src/config/app.ts',
      'src/config/navigation.ts',
      'src/data/types.ts',
      'src/data/seed.ts',
      'src/pages/Account.tsx',
      'src/pages/GameDetail.tsx',
      'src/pages/Lobby.tsx',
      'src/pages/Games.tsx',
      'src/pages/Leaderboard.tsx',
      'src/pages/Promotions.tsx',
      'src/pages/ResponsibleGaming.tsx',
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
      'ErrorBoundary', 'LoadingScreen', 'EmptyState', 'BottomTabs',
    ],
    providedHooks: ['useLocalStorage', 'useTheme'],
    uiPrimitives: [
      'Badge', 'Button', 'Card', 'Input', 'Progress', 'ScrollArea', 'Tabs',
    ],
    visualCompatibility: {
      allowedSurfaces: ['lobby', 'game-grid', 'game-detail', 'promotions', 'account', 'bottom-tabs'],
      allowedLayoutPatterns: ['bottom-tabs', 'card-grid', 'game-detail', 'promotion-banner'],
      allowedDensityProfiles: ['compact', 'comfortable'],
      allowedMotionProfiles: ['expressive', 'gentle'],
      allowedComponentFamilies: ['game-card', 'bottom-tabs', 'promo-banner', 'progress-bar'],
      forbiddenVisualPatterns: ['sidebar shell', 'landing hero', 'social-feed primary shell'],
    },
    available: true,
    contextContract: `
useApp() — imported from '@/context/AppContext' — returns:
  loadingState: 'loading' | 'ready' | 'error'
  themeChoice, resolvedTheme, setTheme(choice)

CRITICAL RULES:
- Use BottomTabs for primary navigation
`,
  },

  'game-interactive-app': {
    id: 'game-interactive-app',
    label: 'Interactive Game App',
    description: 'Mobile interactive game with a home screen, level select, game canvas, and leaderboard.',
    tags: [
      'game', 'interactive', 'levels', 'play', 'leaderboard', 'score', 'puzzle',
      'mobile', 'casual', 'arcade', 'canvas', 'level-select', 'gamification',
    ],
    navigation: 'bottom-tabs',
    deltaFiles: [
      'src/config/app.ts',
      'src/config/navigation.ts',
      'src/data/types.ts',
      'src/data/seed.ts',
      'src/pages/Achievements.tsx',
      'src/pages/GameScreen.tsx',
      'src/pages/Home.tsx',
      'src/pages/Leaderboard.tsx',
      'src/pages/LevelSelect.tsx',
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
      'ErrorBoundary', 'LoadingScreen', 'EmptyState', 'BottomTabs',
    ],
    providedHooks: ['useLocalStorage', 'useTheme'],
    uiPrimitives: [
      'Badge', 'Button', 'Card', 'Input', 'Progress', 'ScrollArea', 'Tabs',
    ],
    visualCompatibility: {
      allowedSurfaces: ['home', 'level-select', 'game-screen', 'leaderboard', 'bottom-tabs'],
      allowedLayoutPatterns: ['bottom-tabs', 'level-grid', 'game-canvas', 'score-list'],
      allowedDensityProfiles: ['compact', 'comfortable'],
      allowedMotionProfiles: ['expressive', 'gentle'],
      allowedComponentFamilies: ['level-card', 'game-canvas', 'leaderboard-row', 'bottom-tabs'],
      forbiddenVisualPatterns: ['sidebar shell', 'landing hero', 'ecommerce product grid'],
    },
    available: true,
    contextContract: `
useApp() — imported from '@/context/AppContext' — returns:
  loadingState: 'loading' | 'ready' | 'error'
  themeChoice, resolvedTheme, setTheme(choice)

CRITICAL RULES:
- Use BottomTabs for primary navigation
- GameScreen is a full-canvas route with no BottomTabs overlay
`,
  },

  'booking-service-app': {
    id: 'booking-service-app',
    label: 'Booking & Service App',
    description: 'Mobile service-booking app with home, service detail, booking flow, and my-bookings.',
    tags: [
      'booking', 'service', 'appointment', 'reservation', 'schedule', 'calendar',
      'mobile', 'provider', 'availability', 'confirm', 'my-bookings', 'flow',
    ],
    navigation: 'bottom-tabs',
    deltaFiles: [
      'src/config/app.ts',
      'src/config/navigation.ts',
      'src/data/types.ts',
      'src/data/seed.ts',
      'src/pages/BookingFlow.tsx',
      'src/pages/Home.tsx',
      'src/pages/MyBookings.tsx',
      'src/pages/Profile.tsx',
      'src/pages/Search.tsx',
      'src/pages/ServiceDetail.tsx',
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
      'ErrorBoundary', 'LoadingScreen', 'EmptyState', 'BottomTabs',
    ],
    providedHooks: ['useLocalStorage', 'useTheme'],
    uiPrimitives: [
      'Badge', 'Button', 'Card', 'Input', 'Progress', 'ScrollArea', 'Tabs',
    ],
    visualCompatibility: {
      allowedSurfaces: ['home', 'service-detail', 'booking-flow', 'my-bookings', 'bottom-tabs'],
      allowedLayoutPatterns: ['bottom-tabs', 'card-list', 'detail-view', 'wizard-flow'],
      allowedDensityProfiles: ['comfortable', 'spacious'],
      allowedMotionProfiles: ['gentle', 'reduced'],
      allowedComponentFamilies: ['service-card', 'booking-flow', 'calendar-picker', 'bottom-tabs'],
      forbiddenVisualPatterns: ['sidebar shell', 'landing hero', 'admin table'],
    },
    available: true,
    contextContract: `
useApp() — imported from '@/context/AppContext' — returns:
  loadingState: 'loading' | 'ready' | 'error'
  themeChoice, resolvedTheme, setTheme(choice)

CRITICAL RULES:
- Use BottomTabs for primary navigation
- BookingFlow is a multi-step wizard
`,
  },

  'content-learning-app': {
    id: 'content-learning-app',
    label: 'Content / Learning App',
    description: 'Mobile learning app with course catalog, course detail, lesson player, and home feed.',
    tags: [
      'learning', 'education', 'course', 'lesson', 'video', 'content', 'lms',
      'mobile', 'catalog', 'player', 'progress', 'quiz', 'study', 'e-learning',
    ],
    navigation: 'bottom-tabs',
    deltaFiles: [
      'src/config/app.ts',
      'src/config/navigation.ts',
      'src/data/types.ts',
      'src/data/seed.ts',
      'src/pages/CourseCatalog.tsx',
      'src/pages/CourseDetail.tsx',
      'src/pages/Home.tsx',
      'src/pages/LessonPlayer.tsx',
      'src/pages/Profile.tsx',
      'src/pages/Progress.tsx',
      'src/pages/Quiz.tsx',
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
      'ErrorBoundary', 'LoadingScreen', 'EmptyState', 'BottomTabs',
    ],
    providedHooks: ['useLocalStorage', 'useTheme'],
    uiPrimitives: [
      'Badge', 'Button', 'Card', 'Input', 'Progress', 'ScrollArea', 'Tabs',
    ],
    visualCompatibility: {
      allowedSurfaces: ['home-feed', 'course-catalog', 'course-detail', 'lesson-player', 'bottom-tabs'],
      allowedLayoutPatterns: ['bottom-tabs', 'card-feed', 'course-grid', 'video-player'],
      allowedDensityProfiles: ['comfortable', 'spacious'],
      allowedMotionProfiles: ['gentle', 'reduced'],
      allowedComponentFamilies: ['course-card', 'lesson-row', 'video-player', 'progress-bar', 'bottom-tabs'],
      forbiddenVisualPatterns: ['sidebar shell', 'landing hero', 'ecommerce checkout'],
    },
    available: true,
    contextContract: `
useApp() — imported from '@/context/AppContext' — returns:
  loadingState: 'loading' | 'ready' | 'error'
  themeChoice, resolvedTheme, setTheme(choice)

CRITICAL RULES:
- Use BottomTabs for primary navigation
- LessonPlayer is a full-screen route
`,
  },
};

export function getSkeletonVisualCompatibility(
  skeletonId: SkeletonId,
): SkeletonVisualCompatibilityContract {
  return SKELETON_REGISTRY[skeletonId].visualCompatibility;
}

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

function normalizeSkeletonPath(path: string): string {
  let p = String(path || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!p) return '';
  if (!p.startsWith('src/')) p = `src/${p}`;
  return p.replace(/\/+/g, '/');
}

function uniqueSorted(paths: string[]): string[] {
  return [...new Set(paths.map(normalizeSkeletonPath).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function collectStringPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/\.(tsx?|jsx?|json|css)$/.test(trimmed)) return null;
  return normalizeSkeletonPath(trimmed);
}

function collectBlueprintFilesFromObject(value: unknown, out: Set<string>): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) collectBlueprintFilesFromObject(item, out);
    return;
  }

  const obj = value as Record<string, unknown>;
  for (const key of ['path', 'file', 'entry', 'component', 'page']) {
    const path = collectStringPath(obj[key]);
    if (path) out.add(path);
  }
  for (const nested of Object.values(obj)) {
    if (nested && typeof nested === 'object') collectBlueprintFilesFromObject(nested, out);
  }
}

function collectBlueprintFiles(context?: SkeletonPromptContext): string[] {
  const out = new Set<string>();
  collectBlueprintFilesFromObject(context?.plan, out);
  collectBlueprintFilesFromObject(context?.technicalBlueprint, out);
  return uniqueSorted([...out]);
}

export function getSkeletonInstalledFiles(skeletonId: SkeletonId): string[] {
  const manifest = SKELETON_MANIFESTS[skeletonId];
  if (!manifest) return [];
  return uniqueSorted(manifest.workingGroups.flatMap(group => group.paths));
}

export function getEditableSkeletonFiles(skeletonId: SkeletonId): string[] {
  const manifest = SKELETON_MANIFESTS[skeletonId];
  if (!manifest) return [];
  return uniqueSorted(manifest.editableFiles);
}

function globPatternToRegExp(pattern: string): RegExp {
  const normalized = normalizeSkeletonPath(pattern);
  let source = '';
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    if (ch === '*') {
      if (normalized[i + 1] === '*') {
        source += '.*';
        i += 1;
      } else {
        source += '[^/]*';
      }
    } else {
      source += ch.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`, 'i');
}

export function pathMatchesSkeletonPattern(path: string, pattern: string): boolean {
  const normalizedPath = normalizeSkeletonPath(path);
  const normalizedPattern = normalizeSkeletonPath(pattern);
  if (!normalizedPath || !normalizedPattern) return false;
  if (!normalizedPattern.includes('*')) {
    return normalizedPath.toLowerCase() === normalizedPattern.toLowerCase();
  }
  return globPatternToRegExp(normalizedPattern).test(normalizedPath);
}

export function isProtectedSkeletonFile(skeletonId: SkeletonId, path: string): boolean {
  const manifest = SKELETON_MANIFESTS[skeletonId];
  if (!manifest) return false;
  return manifest.protectedFiles.some(pattern => pathMatchesSkeletonPattern(path, pattern));
}

/**
 * Returns true if the given path falls under any of the skeleton's locked prefixes.
 */
function isLockedSkeletonPath(skeletonId: SkeletonId, path: string): boolean {
  const meta = SKELETON_REGISTRY[skeletonId];
  if (!meta) return false;
  const normalized = normalizeSkeletonPath(path);
  return meta.lockedPrefixes.some(prefix => {
    const normalizedPrefix = normalizeSkeletonPath(prefix);
    return (
      normalized.toLowerCase() === normalizedPrefix.toLowerCase() ||
      normalized.toLowerCase().startsWith(normalizedPrefix.toLowerCase().replace(/\/?$/, '/'))
    );
  });
}

/**
 * Strip locked/provided skeleton entries from a product plan so the coder
 * receives a shorter, delta-focused prompt.
 *
 * Removes from plan.pages, plan.fileArchitecture, and plan.architecture.domainComponents
 * any items whose paths/names are already covered by the installed skeleton.
 * All other plan fields are preserved.
 */
export function stripLockedPlanEntries(
  plan: Record<string, unknown>,
  skeletonId: SkeletonId,
): Record<string, unknown> {
  const meta = SKELETON_REGISTRY[skeletonId];
  if (!meta) return plan;

  const result: Record<string, unknown> = { ...plan };

  if (Array.isArray(result.pages)) {
    result.pages = (result.pages as Array<Record<string, unknown>>).filter(page => {
      const rawFile = typeof page.file === 'string' ? page.file : '';
      return !rawFile || !isLockedSkeletonPath(skeletonId, rawFile);
    });
  }

  if (Array.isArray(result.fileArchitecture)) {
    result.fileArchitecture = (result.fileArchitecture as Array<Record<string, unknown>>).filter(entry => {
      const rawPath = typeof entry.path === 'string' ? entry.path : '';
      return !rawPath || !isLockedSkeletonPath(skeletonId, rawPath);
    });
  }

  if (result.architecture && typeof result.architecture === 'object') {
    const arch = { ...(result.architecture as Record<string, unknown>) };
    if (Array.isArray(arch.domainComponents)) {
      arch.domainComponents = (arch.domainComponents as Array<Record<string, unknown>>).filter(comp => {
        const name = typeof comp.name === 'string' ? comp.name : '';
        return !meta.providedComponents.includes(name);
      });
    }
    result.architecture = arch;
  }

  return result;
}

function formatPathList(paths: string[], empty = '  - none'): string {
  return paths.length ? paths.map(path => `  - ${path}`).join('\n') : empty;
}

function formatWorkingGroups(groups: SkeletonManifestGroup[]): string {
  return groups
    .map(group => `- ${group.label}: ${group.paths.join(', ')}`)
    .join('\n');
}

/**
 * Build the compact skeleton context block injected into the BUILD prompt.
 * ~600 tokens total — no skeleton source code included.
 */
export function buildSkeletonPromptBlock(
  skeletonId: SkeletonId,
  context?: SkeletonPromptContext,
): string {
  const s = SKELETON_REGISTRY[skeletonId];
  if (!s || !s.available) return '';

  const manifest = SKELETON_MANIFESTS[skeletonId];
  const installedFiles = getSkeletonInstalledFiles(skeletonId);
  const blueprintFiles = collectBlueprintFiles(context);
  const blueprintDeltaFiles = blueprintFiles.filter(path => !installedFiles.includes(path));
  const editableSkeletonFiles = uniqueSorted(
    blueprintFiles.filter(path =>
      installedFiles.includes(path) && !isProtectedSkeletonFile(skeletonId, path),
    ),
  );
  const manifestDeltaFiles = manifest?.deltaFiles ?? s.deltaFiles;
  const manifestEditableFiles = manifest?.editableFiles ?? s.deltaFiles;
  const mustOutputFiles = uniqueSorted([
    ...manifestDeltaFiles,
    ...editableSkeletonFiles,
    ...blueprintDeltaFiles,
  ]);

  return `
═══════════════════════════════════════════════════════
  SKELETON ALREADY INSTALLED: ${s.label} (${s.id})
═══════════════════════════════════════════════════════

SKELETON FILES ARE ALREADY INSTALLED IN THE FILESYSTEM.
The backend copied skeleton-${s.id}/src/* into preview-workspace/src/ BEFORE this prompt.
These files physically exist on disk and will be compiled as-is — DO NOT regenerate them.
Write ONLY the delta files listed under "Files you MUST create or modify" below.

File groups already on disk (source: skeleton.manifest.json + src/route-manifest.json):
${manifest ? formatWorkingGroups(manifest.workingGroups) : formatPathList(installedFiles)}

Navigation pattern: ${s.navigation}

DO NOT rewrite protected skeleton infrastructure files. They are production-quality and tested.

PROVIDED — IMPORT, DO NOT RECREATE:
Components: ${s.providedComponents.join(', ')}
Hooks: ${s.providedHooks.length ? s.providedHooks.join(', ') : 'none'}
UI primitives: ${filterAdvertisedUiPrimitiveNames(s.uiPrimitives).join(', ') || 'none'}
Import paths:
- UI primitives: use the exact paths from the coder UI primitive import catalog; do not guess shadcn paths.
- Layout: import from existing App.tsx, BottomTabs, Sidebar, TopBar where provided
- Hooks: useLocalStorage and useTheme already exist; import them as named exports, e.g. import { useLocalStorage } from '@/hooks/useLocalStorage'
- Config: app.ts, routes.ts, navigation.ts already exist. MODIFY them when needed; do not create duplicates.

PROTECTED FILES — DO NOT OUTPUT THESE FILES:
${formatPathList(manifest?.protectedFiles ?? installedFiles.filter(path => isProtectedSkeletonFile(skeletonId, path)))}

EDITABLE SKELETON FILES — MODIFY IN PLACE WHEN NEEDED:
${formatPathList(manifestEditableFiles)}

YOUR TASK: Write ONLY the delta files. New pages, new components, new hooks, and
product-specific config/data changes that the skeleton does not provide.

Files you MUST create or modify (delta only; blueprint files after excluding protected skeleton files):
${formatPathList(mustOutputFiles)}

KEY RULES:
- Replace "AppName" with the real product name everywhere
- Replace all /* PRODUCT: ... */ markers with product-specific content
- Replace all // SEED: ... markers with real domain data (5-10 items)
- Import from existing skeleton files. Do not duplicate their code.
- Use design tokens: bg-background, bg-card, text-foreground, text-muted-foreground,
  border-border, text-primary, --pm-brand (never hardcode hex colors)
- Every list page uses <EmptyState> from @/components/EmptyState
- Every loading state uses <Skeleton> from @/components/ui/Skeleton
- Paywall trigger: call openPaywall() from useApp() after freeActionLimit actions
`.trim();
}
