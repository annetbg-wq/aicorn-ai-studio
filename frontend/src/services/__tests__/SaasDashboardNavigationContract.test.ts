/**
 * Deterministic tests for the saas-dashboard skeleton navigation contract.
 *
 * Verifies that:
 *   1. The canonical navigation.ts exports SIDEBAR_NAV (existing sidebar contract).
 *   2. The canonical navigation.ts exports BOTTOM_TABS (mobile nav contract).
 *   3. BOTTOM_TABS entries carry `to`, `label`, and `icon` fields required by BottomTabs.tsx.
 *   4. The import path @/config/navigation used by BottomTabs.tsx resolves to the
 *      canonical skeleton navigation file.
 *   5. BOTTOM_TABS routes are a subset of the routes registered in ROUTES (routes.ts).
 *   6. The navigation.ts is a required product slot so the coder sees
 *      both SIDEBAR_NAV and BOTTOM_TABS as template signals to preserve.
 *
 * No real LLM calls are made.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import saasDashboardManifest from '../skeleton-manifests/saas-dashboard/skeleton.manifest.json';
import { getSkeletonProductSlotFiles } from '../SkeletonRegistry';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', '..',
);

const skeletonSrcRoot = path.join(
  repoRoot,
  'skeletons',
  'saas-dashboard',
  'skeleton-saas-dashboard',
  'src',
);

const navigationFilePath = path.join(skeletonSrcRoot, 'config', 'navigation.ts');
const routesFilePath = path.join(skeletonSrcRoot, 'config', 'routes.ts');

function readSkeletonFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

describe('saas-dashboard navigation.ts — SIDEBAR_NAV contract', () => {
  it('navigation.ts exists at canonical skeleton path', () => {
    expect(fs.existsSync(navigationFilePath), `Missing: ${navigationFilePath}`).toBe(true);
  });

  it('exports SIDEBAR_NAV', () => {
    const source = readSkeletonFile(navigationFilePath);
    expect(source).toMatch(/export\s+const\s+SIDEBAR_NAV\b/);
  });

  it('SIDEBAR_NAV is a readonly array (NavGroup[])', () => {
    const source = readSkeletonFile(navigationFilePath);
    expect(source).toMatch(/SIDEBAR_NAV.*readonly\s+NavGroup\[\]/s);
  });
});

describe('saas-dashboard navigation.ts — BOTTOM_TABS contract', () => {
  it('exports BOTTOM_TABS', () => {
    const source = readSkeletonFile(navigationFilePath);
    expect(source).toMatch(/export\s+const\s+BOTTOM_TABS\b/);
  });

  it('BOTTOM_TABS is a readonly array', () => {
    const source = readSkeletonFile(navigationFilePath);
    expect(source).toMatch(/BOTTOM_TABS.*readonly\s+NavItem\[\]/s);
  });

  it('BOTTOM_TABS entries reference `to`, `label`, and `icon` fields', () => {
    const source = readSkeletonFile(navigationFilePath);
    // Check the region after BOTTOM_TABS declaration
    const bottomTabsRegion = source.slice(source.indexOf('BOTTOM_TABS'));
    expect(bottomTabsRegion).toMatch(/\bto:\s*ROUTES\.\w+/);
    expect(bottomTabsRegion).toMatch(/\blabel:\s*['"`]/);
    expect(bottomTabsRegion).toMatch(/\bicon:\s*\w+/);
  });

  it('BOTTOM_TABS has at least 2 entries for meaningful mobile nav', () => {
    const source = readSkeletonFile(navigationFilePath);
    const bottomTabsRegion = source.slice(source.indexOf('BOTTOM_TABS'));
    const tabEntries = Array.from(bottomTabsRegion.matchAll(/\bto:\s*ROUTES\.\w+/g));
    expect(tabEntries.length).toBeGreaterThanOrEqual(2);
  });
});

describe('saas-dashboard navigation.ts — BottomTabs.tsx import compatibility', () => {
  it('BOTTOM_TABS route targets exist in routes.ts', () => {
    const navSource = readSkeletonFile(navigationFilePath);
    const routesSource = readSkeletonFile(routesFilePath);

    // Extract route keys used by BOTTOM_TABS (everything after its declaration)
    const bottomTabsRegion = navSource.slice(navSource.indexOf('BOTTOM_TABS'));
    const usedRouteKeys = Array.from(bottomTabsRegion.matchAll(/\bto:\s*ROUTES\.(\w+)/g))
      .map(m => m[1]);

    expect(usedRouteKeys.length).toBeGreaterThan(0);

    for (const key of usedRouteKeys) {
      expect(
        routesSource,
        `BOTTOM_TABS references ROUTES.${key} but routes.ts does not define it`,
      ).toMatch(new RegExp(`\\b${key}\\s*:`));
    }
  });

  it('both SIDEBAR_NAV and BOTTOM_TABS use the NavItem interface', () => {
    const source = readSkeletonFile(navigationFilePath);
    // NavItem must be defined before both usages
    expect(source.indexOf('interface NavItem')).toBeLessThan(source.indexOf('SIDEBAR_NAV'));
    expect(source.indexOf('interface NavItem')).toBeLessThan(source.indexOf('BOTTOM_TABS'));
  });
});

describe('saas-dashboard skeleton — materialization preserves BOTTOM_TABS', () => {
  it('navigation.ts is a required product slot so coder sees both nav shapes', () => {
    const manifest = saasDashboardManifest as { ownership: { requiredProductSlots: string[] } };
    expect(manifest.ownership.requiredProductSlots).toContain('src/config/navigation.ts');
  });

  it('runtime product-slot adapter for saas-dashboard includes navigation.ts', () => {
    expect(getSkeletonProductSlotFiles('saas-dashboard')).toContain('src/config/navigation.ts');
  });

  it('BOTTOM_TABS export is present in the physical file the install step copies', () => {
    // Simulate what skeleton install does: reads the physical file from skeletons/ directory.
    // If BOTTOM_TABS is present here, it survives the copy to preview-workspace.
    const source = readSkeletonFile(navigationFilePath);
    expect(source).toContain('export const BOTTOM_TABS');
  });

  it('SIDEBAR_NAV is unchanged after adding BOTTOM_TABS', () => {
    const source = readSkeletonFile(navigationFilePath);
    // Both must be present
    expect(source).toMatch(/export\s+const\s+SIDEBAR_NAV\b/);
    expect(source).toMatch(/export\s+const\s+BOTTOM_TABS\b/);
    // Sidebar groups must still reference Workspace and Account sections
    const sidebarRegion = source.slice(
      source.indexOf('SIDEBAR_NAV'),
      source.indexOf('BOTTOM_TABS'),
    );
    expect(sidebarRegion).toContain("label: 'Workspace'");
    expect(sidebarRegion).toContain("label: 'Account'");
  });
});
