/**
 * SkeletonContractForCoder.ts
 *
 * Builds a compact skeleton contract block injected into the coder system prompt.
 * The contract describes what the installed skeleton provides (navigation config,
 * component import paths, import rules) WITHOUT including raw skeleton source code.
 *
 * Purpose:
 * - Skeleton is already installed in preview-workspace/src/ before the coder runs.
 * - Coder must treat the skeleton as an existing foundation, not regenerate it.
 * - Coder must generate only app-specific delta files on top of the skeleton.
 * - Coder must import skeleton components from the exact listed paths.
 * - Coder must self-implement any component NOT listed in the contract.
 *
 * Part of: p2/coder-skeleton-context-contract
 */

import { type SkeletonId, SKELETON_REGISTRY } from './SkeletonRegistry';
import { compileSkeletonContract } from './SkeletonContractCompiler';

// ── Navigation export descriptor ─────────────────────────────────────────────

export interface SkeletonNavExport {
  /** Export name, e.g. SIDEBAR_NAV or BOTTOM_TABS */
  name: string;
  /** TypeScript type, e.g. readonly NavGroup[] */
  type: string;
  /** Brief description for the coder */
  description: string;
}

// ── Per-skeleton navigation contract ─────────────────────────────────────────

export interface SkeletonNavContract {
  /** Navigation rendering mode */
  navMode: 'sidebar' | 'bottom-tabs' | 'anchor-scroll' | 'top-nav';
  /** Config import path, e.g. @/config/navigation */
  configPath: string;
  /** Named exports from the config file the coder may read */
  exports: SkeletonNavExport[];
  /** Primary nav component import path, if present */
  primaryNavComponentPath?: string;
  /** Primary nav component export name */
  primaryNavComponentExport?: string;
  /** Skeleton-specific navigation rules */
  rules: string[];
}

// ── Navigation contracts per skeleton ────────────────────────────────────────
//
// Covers all registered SkeletonId values.
// Sidebar skeletons: saas-dashboard, b2b-operations-workspace, creator-editor-workspace, productivity-tool
// Bottom-tabs skeletons: mobile-app, ecommerce, marketplace-platform, social-community,
//                         dating-matching-app, gaming-casino-app, game-interactive-app,
//                         booking-service-app, content-learning-app
// Anchor-scroll: landing-page

const NAV_CONTRACTS: Record<SkeletonId, SkeletonNavContract> = {
  'saas-dashboard': {
    navMode: 'sidebar',
    configPath: '@/config/navigation',
    exports: [
      {
        name: 'SIDEBAR_NAV',
        type: 'readonly NavGroup[]',
        description: 'sidebar navigation groups (Workspace/Account sections with NavItem entries)',
      },
      {
        name: 'BOTTOM_TABS',
        type: 'readonly NavItem[]',
        description: 'compact mobile-fallback bottom tab items',
      },
    ],
    primaryNavComponentPath: '@/components/Sidebar',
    primaryNavComponentExport: 'Sidebar',
    rules: [
      'Import Sidebar from @/components/Sidebar for the primary layout navigation.',
      'SIDEBAR_NAV and BOTTOM_TABS are read-only; do NOT re-declare, re-export, or re-define them.',
      'Modify src/config/navigation.ts to replace placeholder nav items with product-specific ones.',
      'ROUTES in config/routes.ts has keys: dashboard, data, settings (add product-specific route keys).',
    ],
  },

  'mobile-app': {
    navMode: 'bottom-tabs',
    configPath: '@/config/navigation',
    exports: [
      {
        name: 'BOTTOM_TABS',
        type: 'readonly NavItem[]',
        description: 'bottom tab navigation items (home, create, detail, progress, profile)',
      },
    ],
    primaryNavComponentPath: '@/components/BottomTabs',
    primaryNavComponentExport: 'BottomTabs',
    rules: [
      'Import BottomTabs from @/components/BottomTabs (NOT from @/components/ui).',
      'BOTTOM_TABS is read-only; do NOT re-import or re-export.',
      'config/routes.ts MUST export ROUTES with keys: home, create, detail, progress, profile.',
    ],
  },

  'ecommerce': {
    navMode: 'bottom-tabs',
    configPath: '@/config/navigation',
    exports: [
      {
        name: 'BOTTOM_TABS',
        type: 'readonly NavItem[]',
        description: 'bottom tab navigation items',
      },
    ],
    primaryNavComponentPath: '@/components/BottomTabs',
    primaryNavComponentExport: 'BottomTabs',
    rules: [
      'Import BottomTabs from @/components/BottomTabs (NOT from @/components/ui).',
      'BOTTOM_TABS is read-only; do NOT re-import or re-export.',
      'config/routes.ts MUST export ROUTES with keys matching the bottom tab destinations.',
    ],
  },

  'marketplace-platform': {
    navMode: 'bottom-tabs',
    configPath: '@/config/navigation',
    exports: [
      {
        name: 'BOTTOM_TABS',
        type: 'readonly NavItem[]',
        description: 'bottom tab navigation items',
      },
    ],
    primaryNavComponentPath: '@/components/BottomTabs',
    primaryNavComponentExport: 'BottomTabs',
    rules: [
      'Import BottomTabs from @/components/BottomTabs (NOT from @/components/ui).',
      'BOTTOM_TABS is read-only; do NOT re-import or re-export.',
    ],
  },

  'b2b-operations-workspace': {
    navMode: 'sidebar',
    configPath: '@/config/navigation',
    exports: [
      {
        name: 'SIDEBAR_NAV',
        type: 'readonly NavGroup[]',
        description: 'sidebar navigation groups',
      },
    ],
    primaryNavComponentPath: '@/components/Sidebar',
    primaryNavComponentExport: 'Sidebar',
    rules: [
      'Import Sidebar from @/components/Sidebar for the primary layout navigation.',
      'SIDEBAR_NAV is read-only; do NOT re-declare or re-export.',
      'Modify src/config/navigation.ts to replace placeholder nav items with product-specific ones.',
    ],
  },

  'creator-editor-workspace': {
    navMode: 'sidebar',
    configPath: '@/config/navigation',
    exports: [
      {
        name: 'SIDEBAR_NAV',
        type: 'readonly NavGroup[]',
        description: 'sidebar navigation groups',
      },
    ],
    primaryNavComponentPath: '@/components/Sidebar',
    primaryNavComponentExport: 'Sidebar',
    rules: [
      'Import Sidebar from @/components/Sidebar for the primary layout navigation.',
      'SIDEBAR_NAV is read-only; do NOT re-declare or re-export.',
    ],
  },

  'productivity-tool': {
    navMode: 'sidebar',
    configPath: '@/config/navigation',
    exports: [
      {
        name: 'SIDEBAR_NAV',
        type: 'readonly NavGroup[]',
        description: 'sidebar navigation groups',
      },
    ],
    primaryNavComponentPath: '@/components/Sidebar',
    primaryNavComponentExport: 'Sidebar',
    rules: [
      'Import Sidebar from @/components/Sidebar for the primary layout navigation.',
      'SIDEBAR_NAV is read-only; do NOT re-declare or re-export.',
    ],
  },

  'landing-page': {
    navMode: 'anchor-scroll',
    configPath: '@/config/navigation',
    exports: [],
    rules: [
      'Navigation is anchor-scroll: use section IDs and anchor links.',
      'No BottomTabs or Sidebar component in landing-page skeleton.',
    ],
  },

  'social-community': {
    navMode: 'bottom-tabs',
    configPath: '@/config/navigation',
    exports: [
      {
        name: 'BOTTOM_TABS',
        type: 'readonly NavItem[]',
        description: 'bottom tab navigation items',
      },
    ],
    primaryNavComponentPath: '@/components/BottomTabs',
    primaryNavComponentExport: 'BottomTabs',
    rules: [
      'Import BottomTabs from @/components/BottomTabs (NOT from @/components/ui).',
      'BOTTOM_TABS is read-only; do NOT re-import or re-export.',
    ],
  },

  'dating-matching-app': {
    navMode: 'bottom-tabs',
    configPath: '@/config/navigation',
    exports: [
      {
        name: 'BOTTOM_TABS',
        type: 'readonly NavItem[]',
        description: 'bottom tab navigation items',
      },
    ],
    primaryNavComponentPath: '@/components/BottomTabs',
    primaryNavComponentExport: 'BottomTabs',
    rules: [
      'Import BottomTabs from @/components/BottomTabs (NOT from @/components/ui).',
      'BOTTOM_TABS is read-only; do NOT re-import or re-export.',
    ],
  },

  'gaming-casino-app': {
    navMode: 'bottom-tabs',
    configPath: '@/config/navigation',
    exports: [
      {
        name: 'BOTTOM_TABS',
        type: 'readonly NavItem[]',
        description: 'bottom tab navigation items',
      },
    ],
    primaryNavComponentPath: '@/components/BottomTabs',
    primaryNavComponentExport: 'BottomTabs',
    rules: [
      'Import BottomTabs from @/components/BottomTabs (NOT from @/components/ui).',
      'BOTTOM_TABS is read-only; do NOT re-import or re-export.',
    ],
  },

  'game-interactive-app': {
    navMode: 'bottom-tabs',
    configPath: '@/config/navigation',
    exports: [
      {
        name: 'BOTTOM_TABS',
        type: 'readonly NavItem[]',
        description: 'bottom tab navigation items',
      },
    ],
    primaryNavComponentPath: '@/components/BottomTabs',
    primaryNavComponentExport: 'BottomTabs',
    rules: [
      'Import BottomTabs from @/components/BottomTabs (NOT from @/components/ui).',
      'BOTTOM_TABS is read-only; do NOT re-import or re-export.',
    ],
  },

  'booking-service-app': {
    navMode: 'bottom-tabs',
    configPath: '@/config/navigation',
    exports: [
      {
        name: 'BOTTOM_TABS',
        type: 'readonly NavItem[]',
        description: 'bottom tab navigation items',
      },
    ],
    primaryNavComponentPath: '@/components/BottomTabs',
    primaryNavComponentExport: 'BottomTabs',
    rules: [
      'Import BottomTabs from @/components/BottomTabs (NOT from @/components/ui).',
      'BOTTOM_TABS is read-only; do NOT re-import or re-export.',
    ],
  },

  'content-learning-app': {
    navMode: 'bottom-tabs',
    configPath: '@/config/navigation',
    exports: [
      {
        name: 'BOTTOM_TABS',
        type: 'readonly NavItem[]',
        description: 'bottom tab navigation items',
      },
    ],
    primaryNavComponentPath: '@/components/BottomTabs',
    primaryNavComponentExport: 'BottomTabs',
    rules: [
      'Import BottomTabs from @/components/BottomTabs (NOT from @/components/ui).',
      'BOTTOM_TABS is read-only; do NOT re-import or re-export.',
    ],
  },
};

// ── Contract builder ──────────────────────────────────────────────────────────

/**
 * Returns the navigation contract for a skeleton, or null if not defined.
 * Exported for tests.
 */
export function getSkeletonNavContract(skeletonId: SkeletonId): SkeletonNavContract | null {
  return NAV_CONTRACTS[skeletonId] ?? null;
}

/**
 * Builds a compact skeleton contract block for inclusion in the coder system prompt.
 *
 * Does NOT include raw skeleton source code — only structural contracts:
 *   - Installed foundation statement (skeleton already on disk)
 *   - Navigation contract (config path, named exports, nav component import)
 *   - Import rules (import-from-listed-path, self-implement-if-absent)
 *
 * ~400–600 chars — designed to replace the hardcoded per-skeleton navigation
 * import rules in the coder system prompt.
 */
export function buildSkeletonContractForCoder(skeletonId: SkeletonId): string {
  const skeleton = SKELETON_REGISTRY[skeletonId];
  if (!skeleton || !skeleton.available) return '';

  const compiled = compileSkeletonContract(skeletonId);
  const requiredProductSlots = compiled.requiredSlots;
  const optionalProductSlots = compiled.optionalSlots;
  const nav = NAV_CONTRACTS[skeletonId];
  const productSlotPaths = new Set([...requiredProductSlots, ...optionalProductSlots]);
  const navConfigProductSlotPath = `${nav.configPath.replace(/^@\//, 'src/')}.ts`;
  const navConfigIsProductSlot = productSlotPaths.has(navConfigProductSlotPath);
  const lines: string[] = [];

  lines.push('SKELETON FOUNDATION CONTRACT');
  lines.push(`Skeleton: ${skeleton.label} (${skeleton.id})`);
  lines.push('Status: ALREADY INSTALLED in preview-workspace/src/ before this prompt.');
  lines.push('Task: fill ONLY the concrete product slots below. Do NOT recreate or extend the skeleton foundation with new source modules.');
  lines.push('');
  lines.push('REQUIRED PRODUCT SLOTS — MUST BE EMITTED:');
  lines.push(...requiredProductSlots.map(path => `  - ${path}`));
  lines.push('OPTIONAL PRODUCT SLOTS — MAY BE EMITTED ONLY WHEN THE PRODUCT NEEDS THEM:');
  lines.push(...(optionalProductSlots.length > 0 ? optionalProductSlots.map(path => `  - ${path}`) : ['  - none']));
  lines.push('HARD WRITE RULE: every FILE block must target one of the product slots above. No other source path is writable.');
  lines.push('');

  // Navigation contract block
  lines.push(`NAVIGATION CONTRACT (${nav.navMode}):`);
  lines.push(`  Config path: ${nav.configPath}`);

  if (nav.exports.length > 0) {
    lines.push(
      navConfigIsProductSlot
        ? `  Product-slot exports — define these in ${navConfigProductSlotPath}:`
        : '  Exports (read-only):',
    );
    for (const exp of nav.exports) {
      lines.push(`    - ${exp.name}: ${exp.type} — ${exp.description}`);
    }
  } else {
    lines.push('  Exports: (none — anchor-scroll navigation uses no tab/sidebar config)');
  }

  if (nav.primaryNavComponentPath && nav.primaryNavComponentExport) {
    lines.push(
      `  Primary nav component: import ${nav.primaryNavComponentExport} from '${nav.primaryNavComponentPath}'`,
    );
  }

  const effectiveNavRules = navConfigIsProductSlot
    ? nav.rules.filter(rule => !/read-only|do NOT re-(?:declare|export|import)/i.test(rule))
    : nav.rules;
  if (navConfigIsProductSlot) {
    lines.push(
      `  Product-slot rule: ${navConfigProductSlotPath} is writable product configuration; ` +
        'emit the listed exports there. The navigation rendering component itself remains skeleton-owned.',
    );
  }
  if (effectiveNavRules.length > 0) {
    lines.push('  Rules:');
    for (const rule of effectiveNavRules) {
      lines.push(`    • ${rule}`);
    }
  }

  lines.push('');

  // Universal import rules
  lines.push('SKELETON IMPORT RULES:');
  lines.push(
    '  1. Import skeleton components ONLY from the exact paths listed in this contract or',
  );
  lines.push('     the PROVIDED COMPONENTS / PROVIDED HOOKS list above.');
  lines.push(
    '  2. If a component/helper is NOT listed, implement it inside the current product-slot file.',
  );
  lines.push('     Never create an extra source module outside the declared product slots.');
  lines.push('  3. Do NOT recreate any component from the PROVIDED COMPONENTS list.');
  lines.push(
    '  4. Do NOT recreate the app shell, router, providers, or skeleton foundation files.',
  );

  return lines.join('\n');
}
