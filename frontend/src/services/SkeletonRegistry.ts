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

import ecommerceManifest from './skeleton-manifests/ecommerce/skeleton.manifest.json';
import landingPageManifest from './skeleton-manifests/landing-page/skeleton.manifest.json';
import mobileAppManifest from './skeleton-manifests/mobile-app/skeleton.manifest.json';
import productivityToolManifest from './skeleton-manifests/productivity-tool/skeleton.manifest.json';
import saasDashboardManifest from './skeleton-manifests/saas-dashboard/skeleton.manifest.json';
import socialCommunityManifest from './skeleton-manifests/social-community/skeleton.manifest.json';

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
  'mobile-app':        mobileAppManifest as SkeletonManifest,
  'saas-dashboard':    saasDashboardManifest as SkeletonManifest,
  'landing-page':      landingPageManifest as SkeletonManifest,
  'social-community':  socialCommunityManifest as SkeletonManifest,
  'productivity-tool': productivityToolManifest as SkeletonManifest,
  ecommerce:           ecommerceManifest as SkeletonManifest,
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

function pathMatchesPattern(path: string, pattern: string): boolean {
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
  return manifest.protectedFiles.some(pattern => pathMatchesPattern(path, pattern));
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

SKELETON ALREADY INSTALLED in the project. These file groups ALREADY EXIST and are WORKING
(source: skeleton.manifest.json + src/route-manifest.json):
${manifest ? formatWorkingGroups(manifest.workingGroups) : formatPathList(installedFiles)}

Navigation pattern: ${s.navigation}

DO NOT rewrite protected skeleton infrastructure files. They are production-quality and tested.

PROVIDED — IMPORT, DO NOT RECREATE:
Components: ${s.providedComponents.join(', ')}
Hooks: ${s.providedHooks.length ? s.providedHooks.join(', ') : 'none'}
UI primitives: ${s.uiPrimitives.join(', ')}
Import paths:
- UI primitives: import from '@/components/ui/'
- Layout: import from existing App.tsx, BottomTabs, Sidebar, TopBar where provided
- Hooks: useLocalStorage and useTheme already exist
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
