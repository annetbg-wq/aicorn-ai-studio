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

import { filterAdvertisedUiPrimitiveNames } from './LiveGenerationUiPrimitives';
import {
  getSkeletonCarcassFile,
  getSkeletonCarcassMap,
  hasCarcassContent,
} from './SkeletonCarcassContent';
import { evaluateSkeletonIntentCompatibility } from './SkeletonSelectionCompatibility';
import { compileSkeletonContract, type SkeletonManifestGroup } from './SkeletonContractCompiler';

export type SkeletonId =
  | 'mobile-app'
  | 'super-app'
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


export interface ExportContractEntry {
  name: string;
  type?: string;
}

export interface ExportIntegrityViolation {
  file: string;
  name: string;
  type?: string;
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

  'super-app': {
    id: 'super-app',
    label: 'Super App',
    description:
      'Multi-domain consumer app with one shared identity and bottom navigation across distinct product domains such as money, wellness, learning, services, or lifestyle.',
    tags: [
      'super app', 'superapp', 'multi domain', 'multi-domain', 'all in one', 'all-in-one',
      'life os', 'life hub', 'everything app', 'multi service', 'multi-service',
      'finance health learning', 'money wellness learning', 'ecosystem app',
    ],
    navigation: 'bottom-tabs',
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
      allowedSurfaces: ['mobile', 'bottom-tabs', 'domain-hub', 'finance', 'wellness', 'learning', 'profile', 'onboarding'],
      allowedLayoutPatterns: ['bottom-tabs', 'domain-hub', 'multi-domain-home', 'card-feed', 'list-detail', 'onboarding-flow', 'profile-stack'],
      allowedDensityProfiles: ['compact', 'comfortable', 'spacious'],
      allowedMotionProfiles: ['gentle', 'expressive', 'reduced'],
      allowedComponentFamilies: ['mobile-nav', 'domain-card', 'feed-item', 'onboarding-step', 'profile-card', 'card', 'list-item'],
      forbiddenVisualPatterns: ['desktop-only sidebar shell', 'single giant marketing page', 'one-domain-only shell', 'tiny tap targets'],
    },
    available: true,
    contextContract: `
useApp() — imported from '@/context/AppContext' — returns the same shared application/profile contract used by app-first mobile products:
  isOnboarded: boolean
  profile: { id, name, goal, createdAt, onboardingComplete, plan, usageCount }
  isPremium: boolean
  loadingState: 'loading' | 'ready' | 'error'
  completeOnboarding({ name: string, goal: string })
  updateProfile(patch: Partial<UserProfile>)
  consumeAction(limit: number): boolean
  setPlan(plan)
  resetProfile()
  themeChoice, resolvedTheme, setTheme(choice)

SUPER-APP RULES:
- Treat each declared domain as a real product surface with its own reachable screen, product data, and at least one meaningful action.
- Keep one shared AppContext/profile and one navigation shell; do NOT build isolated mini-app roots.
- Do NOT collapse all domains into a static dashboard. The Home screen is a hub; domain screens must remain independently reachable.
- NEVER rewrite App.tsx, BottomTabs, AppContext, or shared skeleton infrastructure.
- Onboarding MUST finish through completeOnboarding({ name, goal }).
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
      // NOTE: input is normalized with hyphens→spaces before scoring, so
      // multi-word tags MUST use spaces ('saas landing', not 'saas-landing')
      // or they can never match.
      'landing', 'marketing', 'product', 'saas landing', 'waitlist',
      'launch', 'single page', 'promotional', 'website',
      // Landing-specific section vocabulary. Without these, genuine landing /
      // portfolio prompts scored <2 and fell through to mobile-app, or lost the
      // base scoring to saas-dashboard on incidental keywords ('saas', 'table').
      // These tokens appear in real landing/portfolio briefs but not in
      // dashboard/admin ones, so landing-page wins by strength of match.
      'portfolio', 'hero', 'pricing', 'testimonials', 'faq',
    ],
    navigation: 'anchor-scroll',
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

  // Rank textual relevance together with manifest-declared intent compatibility.
  const scores = buildSkeletonSelectionScores(input);
  const best = scores[0];

  // Only use non-mobile skeleton if it clearly wins (score >= 2)
  if (best && best[1] >= 2 && best[0] !== 'mobile-app') {
    return best[0];
  }

  return 'mobile-app'; // universal default
}

// ── Skeleton selection diagnostics ───────────────────────────────────────────

export interface SkeletonSelectionDiagnostics {
  selectedSkeletonId: SkeletonId;
  confidence: 'high' | 'medium' | 'low';
  bestScore: number;
  runnerUpSkeletonId: SkeletonId | null;
  runnerUpScore: number;
  fallbackReason?: string;
  mismatchWarnings: string[];
  intentSignals: string[];
  intentSignalMatches: Array<{ signal: string; matchedKeywords: string[] }>;
}

/** Intent keyword groups used purely for advisory signal detection. */
const INTENT_SIGNAL_GROUPS: ReadonlyArray<{ signal: string; keywords: string[]; specificity?: number }> = [
  {
    signal: 'landing-intent',
    keywords: ['landing', 'website', 'marketing', 'promotional', 'homepage', 'waitlist', 'saas landing', 'product page', 'launch page', 'portfolio'],
  },
  {
    signal: 'dashboard-intent',
    keywords: ['dashboard', 'analytics', 'admin', 'metrics', 'kpi', 'reports', 'charts', 'management', 'crm', 'b2b', 'enterprise'],
  },
  {
    signal: 'marketplace-intent',
    keywords: ['marketplace', 'ecommerce', 'shop', 'store', 'cart', 'checkout', 'vendor', 'listing', 'buy', 'sell', 'product catalog'],
  },
  {
    signal: 'social-intent',
    // Precise social-app signals only. Bare substrings ('social', 'feed',
    // 'follow', 'share', 'like', 'comment', 'network', 'club') fired on
    // incidental matches — "social links" in a landing footer, a dashboard's
    // "recent-activity feed", "feedback", "following up" — and then forced a
    // correct skeleton over to social-community. A real social product names
    // itself with these phrases; a footer link does not.
    keywords: [
      'social network', 'social media', 'social app', 'social platform',
      'community', 'forum', 'followers', 'posts', 'newsfeed', 'news feed',
      'social feed', 'instagram', 'twitter', 'upvote',
    ],
  },
  {
    signal: 'game-intent',
    // Explicit game vocabulary is a domain-defining signal, unlike generic
    // analytics/dashboard vocabulary that commonly appears inside games too.
    // Specificity affects only intent arbitration; skeleton fit still comes
    // exclusively from the manifest selectionContract.
    specificity: 2,
    keywords: ['game', 'rpg', 'progression', 'levels', 'leaderboard', 'score', 'puzzle', 'arcade', 'quest', 'player', 'achievements', 'gamification'],
  },
];

function getIntentSignalSpecificity(signal: string): number {
  return INTENT_SIGNAL_GROUPS.find(group => group.signal === signal)?.specificity ?? 0;
}

function detectIntentSignalMatches(input: string): Array<{ signal: string; matchedKeywords: string[] }> {
  return INTENT_SIGNAL_GROUPS
    .map(group => ({
      signal: group.signal,
      matchedKeywords: group.keywords.filter(keyword => input.includes(keyword)),
    }))
    .filter(group => group.matchedKeywords.length > 0);
}

function buildSkeletonSelectionScores(input: string): Array<[SkeletonId, number]> {
  const scores = (Object.values(SKELETON_REGISTRY) as SkeletonMeta[])
    .filter(skeleton => skeleton.available)
    .map(skeleton => {
      const tagScore = skeleton.tags.reduce(
        (acc, tag) => acc + (input.includes(tag) ? 1 : 0),
        0,
      );
      return [skeleton.id, tagScore] as [SkeletonId, number];
    });

  return scores.sort((a, b) => b[1] - a[1]);
}

/**
 * Advisory-only diagnostics for skeleton selection.
 *
 * Runs the same scoring algorithm as `selectSkeleton` and returns the
 * resulting skeleton alongside confidence, runner-up data, intent signals
 * detected from the input, and any obvious mismatch warnings.
 *
 * This function is PURELY diagnostic — it does not change generation
 * behaviour. The selected skeleton is identical to what `selectSkeleton`
 * would have returned.
 */
export function selectSkeletonWithDiagnostics(
  appType: string | undefined,
  tags: string[] = [],
): SkeletonSelectionDiagnostics {
  const input = [appType ?? '', ...tags]
    .join(' ')
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, ' ');

  const intentSignalMatches = detectIntentSignalMatches(input);
  const scores = buildSkeletonSelectionScores(input);

  const best = scores[0];
  const runnerUp = scores[1] ?? null;

  const bestScore = best?.[1] ?? 0;
  const runnerUpSkeletonId: SkeletonId | null = runnerUp?.[0] ?? null;
  const runnerUpScore = runnerUp?.[1] ?? 0;

  // Mirror selectSkeleton decision rule exactly — no behaviour change.
  const selectedSkeletonId: SkeletonId =
    best && best[1] >= 2 && best[0] !== 'mobile-app'
      ? best[0]
      : 'mobile-app';

  // Intent signals also contributed evidence to the manifest-aware ranking above.
  const intentSignals = intentSignalMatches.map(group => group.signal);

  // Compute confidence.
  let confidence: 'high' | 'medium' | 'low';
  let fallbackReason: string | undefined;

  if (selectedSkeletonId === 'mobile-app' && bestScore < 2) {
    confidence = 'low';
    fallbackReason = `No skeleton scored ≥2 — fell back to mobile-app (best score: ${bestScore})`;
  } else if (bestScore >= 3 && (bestScore - runnerUpScore) >= 2) {
    confidence = 'high';
  } else {
    confidence = 'medium';
  }

  // Evaluate intent fit from each skeleton's manifest selectionContract.
  const mismatchWarnings: string[] = [];
  const availableSkeletonIds = (Object.values(SKELETON_REGISTRY) as SkeletonMeta[])
    .filter(skeleton => skeleton.available)
    .map(skeleton => skeleton.id);
  const weakFallback = selectedSkeletonId === 'mobile-app' && bestScore < 2;

  for (const signal of intentSignals) {
    const evaluation = evaluateSkeletonIntentCompatibility({
      selectedSkeletonId,
      signal,
      weakFallback,
      candidateIds: availableSkeletonIds,
    });
    if (!evaluation?.mismatch) continue;
    const recommendation = evaluation.preferredSkeletonId
      ? `; consider ${evaluation.preferredSkeletonId}`
      : '';
    mismatchWarnings.push(
      `${evaluation.label} intent detected but '${selectedSkeletonId}' skeleton is not compatible by manifest${recommendation}`,
    );
  }

  return {
    selectedSkeletonId,
    confidence,
    bestScore,
    runnerUpSkeletonId,
    runnerUpScore,
    ...(fallbackReason !== undefined ? { fallbackReason } : {}),
    mismatchWarnings,
    intentSignals,
    intentSignalMatches,
  };
}

// ── Skeleton selection safe overrides ────────────────────────────────────────

export interface SkeletonSelectionOverrideResult {
  /** Skeleton chosen by the original selectSkeleton scoring algorithm. */
  originalSelectedSkeletonId: SkeletonId;
  /** Final skeleton after safe overrides are applied (may equal original). */
  finalSelectedSkeletonId: SkeletonId;
  overrideApplied: boolean;
  overrideReason?: string;
  confidence: 'high' | 'medium' | 'low';
  bestScore: number;
  runnerUpSkeletonId: SkeletonId | null;
  runnerUpScore: number;
  fallbackReason?: string;
  mismatchWarnings: string[];
  intentSignals: string[];
  intentSignalMatches: Array<{ signal: string; matchedKeywords: string[] }>;
}

/**
 * Deterministic skeleton selection with safe behavioral overrides.
 *
 * Calls `selectSkeletonWithDiagnostics` internally for base selection and
 * signal detection, then applies a narrow set of override rules for obvious
 * high-confidence mismatches.
 *
 * Override fires only when:
 *   - At least one intent signal is present (not an ambiguous prompt)
 *   - At least one mismatch warning is present (not an already-correct selection)
 *   - Manifest compatibility marks the original selection incompatible
 *   - A manifest-compatible preferred target is available in the registry
 *
 * Ambiguous prompts (no intent signals) always keep the original selection.
 * Already-correct selections (no mismatch warnings) are never overridden.
 */
export function selectSkeletonWithSafeOverrides(
  appType: string | undefined,
  tags: string[] = [],
): SkeletonSelectionOverrideResult {
  const diag = selectSkeletonWithDiagnostics(appType, tags);
  const {
    selectedSkeletonId: originalSelectedSkeletonId,
    intentSignals,
    intentSignalMatches,
    mismatchWarnings,
    confidence: diagConfidence,
    bestScore,
    runnerUpSkeletonId,
    runnerUpScore,
    fallbackReason,
  } = diag;

  const base = {
    bestScore,
    runnerUpSkeletonId,
    runnerUpScore,
    intentSignals,
    intentSignalMatches,
    mismatchWarnings,
    ...(fallbackReason !== undefined ? { fallbackReason } : {}),
  };

  // Guard: ambiguous input (no recognized intent signals) — never override.
  // Guard: no mismatch warnings — selection is already appropriate.
  if (intentSignals.length === 0 || mismatchWarnings.length === 0) {
    return {
      originalSelectedSkeletonId,
      finalSelectedSkeletonId: originalSelectedSkeletonId,
      overrideApplied: false,
      confidence: diagConfidence,
      ...base,
    };
  }

  // Resolve overrides from manifest compatibility in signal priority order.
  const availableSkeletonIds = (Object.values(SKELETON_REGISTRY) as SkeletonMeta[])
    .filter(skeleton => skeleton.available)
    .map(skeleton => skeleton.id);
  const weakFallback = originalSelectedSkeletonId === 'mobile-app' && bestScore < 2;

  // A confident tag-based selection must not be overturned by a weaker incidental
  // intent signal. Only the strongest detected signal tier may challenge it.
  // Ties stay eligible: e.g. a game brief can deliberately override a dashboard
  // when game and dashboard evidence are equally strong. Weak fallbacks remain
  // rescuable by any recognized manifest-backed intent.
  const arbitrationStrength = (match: { signal: string; matchedKeywords: string[] }) =>
    match.matchedKeywords.length + getIntentSignalSpecificity(match.signal);
  const strongestSignalEvidence = intentSignalMatches.reduce(
    (max, match) => Math.max(max, arbitrationStrength(match)),
    0,
  );
  const arbitrationSignals = weakFallback
    ? intentSignals
    : intentSignalMatches
        .filter(match => arbitrationStrength(match) === strongestSignalEvidence)
        .map(match => match.signal);

  for (const signal of arbitrationSignals) {
    const evaluation = evaluateSkeletonIntentCompatibility({
      selectedSkeletonId: originalSelectedSkeletonId,
      signal,
      weakFallback,
      candidateIds: availableSkeletonIds,
    });
    const preferred = evaluation?.preferredSkeletonId;
    if (evaluation?.mismatch && preferred && preferred !== originalSelectedSkeletonId && SKELETON_REGISTRY[preferred]?.available) {
      return {
        originalSelectedSkeletonId,
        finalSelectedSkeletonId: preferred,
        overrideApplied: true,
        overrideReason: `${signal} detected; manifest compatibility rejects '${originalSelectedSkeletonId}' — overriding to '${preferred}'`,
        confidence: 'medium',
        ...base,
      };
    }
  }

  // No override rule matched — keep original selection.
  return {
    originalSelectedSkeletonId,
    finalSelectedSkeletonId: originalSelectedSkeletonId,
    overrideApplied: false,
    confidence: diagConfidence,
    ...base,
  };
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
  return [...compileSkeletonContract(skeletonId).infrastructure.installed];
}

export function getEditableSkeletonFiles(skeletonId: SkeletonId): string[] {
  return [...compileSkeletonContract(skeletonId).editable];
}

export function getSkeletonProductSlotFiles(skeletonId: SkeletonId): string[] {
  const contract = compileSkeletonContract(skeletonId);
  return uniqueSorted([...contract.requiredSlots, ...contract.optionalSlots]);
}

export function getRequiredSkeletonDataFiles(skeletonId: SkeletonId): string[] {
  const contract = compileSkeletonContract(skeletonId);
  const candidates = [
    ...contract.infrastructure.installed,
    ...contract.requiredSlots,
    ...contract.optionalSlots,
    ...contract.editable,
  ];

  return uniqueSorted(candidates.filter(file => (
    file === 'src/data/seed.ts' || file === 'src/data/types.ts'
  )));
}

/**
 * Returns true if the source text contains a named export for `name`.
 * Covers:
 *   - `export const/function/type/interface/enum/class NAME`
 *   - `export { NAME }` / `export { NAME as ... }`
 */
function hasNamedExport(source: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declRe = new RegExp(
    `\\bexport\\s+(?:declare\\s+)?(?:const|function|type|interface|enum|class|abstract\\s+class)\\s+${escaped}\\b`,
  );
  if (declRe.test(source)) return true;
  const namedRe = new RegExp(`\\bexport\\s+(?:type\\s+)?\\{[^}]*\\b${escaped}\\b[^}]*\\}`);
  return namedRe.test(source);
}

/**
 * Checks that every file listed in the manifest's `requiredExports` block
 * actually exports the required symbols.  Returns one violation per missing
 * export.  Files not present in `files` are skipped (not-yet-generated guard).
 */
export function checkExportIntegrity(
  skeletonId: SkeletonId,
  files: Record<string, string>,
): ExportIntegrityViolation[] {
  const requiredExports = compileSkeletonContract(skeletonId).infrastructure.requiredExports;
  const violations: ExportIntegrityViolation[] = [];
  for (const [file, entries] of Object.entries(requiredExports)) {
    const content = files[file];
    if (content === undefined) continue; // file not in delta set — skip
    for (const entry of entries) {
      if (!hasNamedExport(content, entry.name)) {
        violations.push({ file, name: entry.name, type: entry.type });
      }
    }
  }
  return violations;
}

// ── Scaffold merge (механизм Б) ────────────────────────────────────────────────

/**
 * Extracts the full declaration block for a named export from TypeScript source.
 *
 * Handles:
 *   - Single-line: `export type X = string;`
 *   - Multi-line const: `export const X = { ... } as const;`
 *   - Multi-line const array: `export const X: T[] = [...] as const;`
 *   - Interface: `export interface X { ... }`
 *   - Enum: `export enum X { ... }`
 *
 * Returns undefined if the export is not found.
 * Intentionally simple (no full AST) — robust enough for the well-structured
 * skeleton carcass files (seed.ts, types.ts, config/app.ts, config/navigation.ts).
 */
export function extractExportDeclaration(source: string, name: string): string | undefined {
  const lines = source.split('\n');
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const namedExportRe = new RegExp(
    `^export\\s+(?:type\\s+)?\\{[^}]*\\b${escaped}\\b[^}]*\\}\\s*;?\\s*$`,
  );
  const startRe = new RegExp(
    `^export\\s+(?:declare\\s+)?(?:const|function|type|interface|enum|class|abstract\\s+class)\\s+${escaped}\\b`,
  );

  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (namedExportRe.test(lines[i])) {
      return lines[i];
    }
    if (startRe.test(lines[i])) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) return undefined;

  // Single-line export (no opening brace/bracket on this line, ends with ;)
  const startLine = lines[startIdx];
  if (startLine.trimEnd().endsWith(';') && !/[{[]/.test(startLine)) {
    return startLine;
  }

  // Multi-line: scan until depth returns to 0 after going positive
  let depth = 0;
  let endIdx = startIdx;

  for (let i = startIdx; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{' || ch === '[' || ch === '(') depth++;
      else if (ch === '}' || ch === ']' || ch === ')') depth--;
    }
    if (i > startIdx && depth <= 0) {
      endIdx = i;
      break;
    }
    if (i === lines.length - 1) endIdx = i;
  }

  return lines.slice(startIdx, endIdx + 1).join('\n');
}

/**
 * Collects all top-level named export identifiers from a TypeScript source string.
 * Returns an array of export names found in the source.
 */
function collectExportNames(source: string): string[] {
  const names: string[] = [];
  // Matches: export const/function/type/interface/enum/class NAME
  const declRe = /\bexport\s+(?:declare\s+)?(?:const|function|type|interface|enum|class|abstract\s+class)\s+(\w+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(source)) !== null) {
    names.push(m[1]);
  }
  // Matches: export { NAME, NAME as alias, ... }
  const namedRe = /\bexport\s+(?:type\s+)?\{([^}]+)\}/g;
  while ((m = namedRe.exec(source)) !== null) {
    for (const part of m[1].split(',')) {
      const trimmed = part.trim();
      // "NAME as alias" → take the alias (what is exported)
      const asMatch = /^(\w+)\s+as\s+(\w+)$/.exec(trimmed);
      names.push(asMatch ? asMatch[2] : trimmed.split(/\s+/)[0]);
    }
  }
  return names.filter(Boolean);
}

/**
 * Merge mechanism Б (фундамент): for each carcass file in `files`, restores any
 * skeleton export that the coder dropped.
 *
 *   - Reads skeleton carcass content from SkeletonCarcassContent store.
 *   - Collects all export names from the skeleton version.
 *   - For each name absent from the coder's version → extracts the declaration
 *     from the skeleton and appends it to the coder's file.
 *   - If the coder re-declared a symbol (name present) → leaves it untouched.
 *
 * Returns a new files map with any restored content.  Files not classified as
 * carcass files, or files absent from the input map, are passed through unchanged.
 *
 * This runs BEFORE checkExportIntegrity in the apply step so that merge closes the
 * "coder dropped carcass export" gap before the integrity check fires.
 */
export function mergeSkeletonExports(
  skeletonId: SkeletonId,
  files: Record<string, string>,
): Record<string, string> {
  const carcassMap = getSkeletonCarcassMap(skeletonId);
  if (!carcassMap) return files; // not a rich-skeleton — nothing to merge

  const result: Record<string, string> = { ...files };

  for (const [carcassPath, skeletonSource] of Object.entries(carcassMap)) {
    const coderContent = result[carcassPath];
    if (coderContent === undefined) continue; // coder didn't touch this file — skip

    const skeletonExports = collectExportNames(skeletonSource);
    const missingNames: string[] = [];

    for (const name of skeletonExports) {
      if (!hasNamedExport(coderContent, name)) {
        missingNames.push(name);
      }
    }

    if (missingNames.length === 0) continue; // nothing dropped — no change needed

    const restored: string[] = [];
    for (const name of missingNames) {
      const decl = extractExportDeclaration(skeletonSource, name);
      if (decl) restored.push(decl);
    }

    if (restored.length > 0) {
      result[carcassPath] =
        coderContent.trimEnd() +
        '\n\n// ── Restored scaffold exports (merge Б) ──\n' +
        restored.join('\n\n');
    }
  }

  return result;
}
function buildRequiredExportsPromptBlock(
  requiredExports: Record<string, ExportContractEntry[]> | undefined | null,
): string {
  if (!requiredExports || Object.keys(requiredExports).length === 0) return '';
  const lines: string[] = ['REQUIRED EXPORTS CONTRACT — DO NOT OMIT THESE:'];
  for (const [file, entries] of Object.entries(requiredExports)) {
    const nameList = entries
      .map(e => (e.type ? `${e.name} (${e.type})` : e.name))
      .join(', ');
    lines.push(`Your ${file} MUST export: ${nameList}.`);
  }
  lines.push(
    'These are imported by locked skeleton files; if any symbol is missing the build fails.',
  );
  return lines.join('\n');
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
  return compileSkeletonContract(skeletonId).infrastructure.protected
    .some(pattern => pathMatchesSkeletonPattern(path, pattern));
}

/**
 * Returns true if the given path falls under any of the skeleton's locked prefixes.
 */
function isLockedSkeletonPath(skeletonId: SkeletonId, path: string): boolean {
  return isProtectedSkeletonFile(skeletonId, path);
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

  const contract = compileSkeletonContract(skeletonId);
  const installedFiles = getSkeletonInstalledFiles(skeletonId);
  const blueprintFiles = collectBlueprintFiles(context);
  const productSlotFiles = uniqueSorted([...contract.requiredSlots, ...contract.optionalSlots]);
  const productSlotSet = new Set(productSlotFiles);
  const blueprintProductSlots = blueprintFiles.filter(path => productSlotSet.has(path));
  const manifestDeltaFiles = contract.requiredSlots;
  const manifestEditableFiles = productSlotFiles;
  const mustOutputFiles = uniqueSorted([
    ...manifestDeltaFiles,
    ...blueprintProductSlots,
  ]);

  // ── Inject (механизм A): for rich-skeletons show scaffold file contents ──────
  // Coder sees the exact scaffold source and fills in PRODUCT:/SEED: markers instead
  // of blindly replacing or omitting scaffold exports.
  const injectBlock = buildCarcassInjectBlock(skeletonId);

  return `
═══════════════════════════════════════════════════════
  SKELETON ALREADY INSTALLED: ${s.label} (${s.id})
═══════════════════════════════════════════════════════

SKELETON FILES ARE ALREADY INSTALLED IN THE FILESYSTEM.
The backend copied skeleton-${s.id}/src/* into preview-workspace/src/ BEFORE this prompt.
These files physically exist on disk and will be compiled as-is — DO NOT regenerate them.
Write ONLY the delta files listed under "Files you MUST create or modify" below.

File groups already on disk (source: skeleton.manifest.json + src/route-manifest.json):
${formatWorkingGroups(contract.infrastructure.workingGroups)}

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
${formatPathList(contract.infrastructure.protected)}

PRODUCT SLOTS — THE ONLY FILES GENERATION MAY MODIFY:
${formatPathList(manifestEditableFiles)}
${Object.keys(contract.infrastructure.requiredExports).length > 0 ? `\n${buildRequiredExportsPromptBlock(contract.infrastructure.requiredExports)}\n` : ''}${injectBlock ? `\n${injectBlock}\n` : ''}
YOUR TASK: Fill ONLY manifest-declared product slots. Reuse skeleton components/hooks; do not create
new source modules outside the product-slot list, even when a desired helper/component is not provided.

Files you MUST create or modify (required product slots plus in-scope planned optional slots):
${formatPathList(mustOutputFiles)}

KEY RULES:
- Replace "AppName" with the real product name everywhere
- Replace all /* PRODUCT: ... */ markers with product-specific content
- Replace all // SEED: ... markers with real domain data (5-10 items)
- Import from existing skeleton files. Do not duplicate their code.
- Never output a source file outside PRODUCT SLOTS; inline product-local helpers inside an allowed slot.
- Use design tokens: bg-background, bg-card, text-foreground, text-muted-foreground,
  border-border, text-primary, --pm-brand (never hardcode hex colors)
- Every list page uses <EmptyState> from @/components/EmptyState
- Every loading state uses <Skeleton> from @/components/ui/Skeleton
- Paywall trigger: call openPaywall() from useApp() after freeActionLimit actions
`.trim();
}

/**
 * Builds the "SKELETON FILES ALREADY ON DISK — EXTEND, DO NOT REPLACE" inject block
 * for rich-skeleton (old-5) project types.
 *
 * Shows the literal scaffold content of seed.ts and types.ts so the coder can see
 * what's already on disk, fill in PRODUCT:/SEED: markers with domain data, and add
 * new exports alongside the existing ones rather than replacing or dropping them.
 *
 * Returns an empty string for stub-skeletons (new-8) where no carcass content exists.
 */
function buildCarcassInjectBlock(skeletonId: SkeletonId): string {
  if (!hasCarcassContent(skeletonId)) return '';

  const seedContent = getSkeletonCarcassFile(skeletonId, 'data/seed.ts');
  const typesContent = getSkeletonCarcassFile(skeletonId, 'data/types.ts');

  if (!seedContent && !typesContent) return '';

  const parts: string[] = [
    '═══════════════════════════════════════════════════════',
    '  SCAFFOLD FILES ALREADY ON DISK — EXTEND, DO NOT REPLACE',
    '═══════════════════════════════════════════════════════',
    '',
    'The following files are already installed from the skeleton with scaffold exports',
    'and PRODUCT:/SEED: markers.  When you emit these files:',
    '  1. PRESERVE all existing exports (SEED_KPIS, SEED_ROWS, SEED_ACTIVITY,',
    '     SEED_SPARKLINE, DEFAULT_CHECKLIST, etc.) — do NOT drop them.',
    '  2. FILL IN the PRODUCT:/SEED: markers with product-specific domain data from the brief.',
    '  3. ADD new exports alongside the existing ones for additional domain entities.',
    '  4. Do NOT replace the entire file with only your new content.',
  ];

  if (seedContent) {
    parts.push('', '--- data/seed.ts (scaffold version on disk) ---', '```typescript', seedContent.trim(), '```');
  }
  if (typesContent) {
    parts.push('', '--- data/types.ts (scaffold version on disk) ---', '```typescript', typesContent.trim(), '```');
  }

  parts.push('', '═══════════════════════════════════════════════════════');

  return parts.join('\n');
}
