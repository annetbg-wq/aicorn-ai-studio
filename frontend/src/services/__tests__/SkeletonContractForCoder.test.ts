// @vitest-environment jsdom
/**
 * SkeletonContractForCoder — deterministic tests for the compact skeleton
 * contract builder used in the coder system prompt.
 *
 * What this test suite verifies:
 *   - buildSkeletonContractForCoder produces a compact contract (no raw source).
 *   - Contract states skeleton is ALREADY INSTALLED (foundation statement).
 *   - Contract includes per-skeleton navigation exports (not hardcoded mobile-only).
 *   - saas-dashboard contract includes SIDEBAR_NAV and BOTTOM_TABS.
 *   - mobile-app contract includes BOTTOM_TABS and BottomTabs component.
 *   - Import rules: import-only-from-listed, self-implement-if-absent.
 *   - Contract does NOT include raw file source code.
 *   - CODER_MAX_TOKENS is unchanged (35 000) — fix targets input, not output.
 *   - No real LLM calls in any test.
 *
 * Part of: p2/coder-skeleton-context-contract
 */

import { describe, expect, it } from 'vitest';
import {
  buildSkeletonContractForCoder,
  getSkeletonNavContract,
} from '../SkeletonContractForCoder';
import { CODER_MAX_TOKENS, buildCoderPlanningBlocks } from '../ProtoPipeline';
import { buildMarketAwareBuilderBrief } from '../MarketAwareBuilderBrief';
import { measureCoderPromptBlockSizes } from '../CoderPromptBlockSizeDiagnostics';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ALL_SKELETONS = [
  'saas-dashboard',
  'mobile-app',
  'ecommerce',
  'marketplace-platform',
  'b2b-operations-workspace',
  'creator-editor-workspace',
  'productivity-tool',
  'landing-page',
  'social-community',
  'dating-matching-app',
  'gaming-casino-app',
  'game-interactive-app',
  'booking-service-app',
  'content-learning-app',
] as const;

// ── Foundation statement ──────────────────────────────────────────────────────

describe('buildSkeletonContractForCoder — foundation statement', () => {
  it('saas-dashboard contract says skeleton is ALREADY INSTALLED', () => {
    const contract = buildSkeletonContractForCoder('saas-dashboard');
    expect(contract).toContain('ALREADY INSTALLED');
  });

  it('mobile-app contract says skeleton is ALREADY INSTALLED', () => {
    const contract = buildSkeletonContractForCoder('mobile-app');
    expect(contract).toContain('ALREADY INSTALLED');
  });

  it('contract says generate ONLY app-specific delta files', () => {
    const contract = buildSkeletonContractForCoder('saas-dashboard');
    expect(contract.toLowerCase()).toContain('delta');
  });

  it('contract says do NOT recreate skeleton foundation', () => {
    const contract = buildSkeletonContractForCoder('saas-dashboard');
    expect(contract).toContain('SKELETON FOUNDATION CONTRACT');
  });
});

// ── saas-dashboard minimum contract ──────────────────────────────────────────

describe('buildSkeletonContractForCoder — saas-dashboard nav contract', () => {
  it('includes SIDEBAR_NAV export', () => {
    const contract = buildSkeletonContractForCoder('saas-dashboard');
    expect(contract).toContain('SIDEBAR_NAV');
  });

  it('includes BOTTOM_TABS export', () => {
    const contract = buildSkeletonContractForCoder('saas-dashboard');
    expect(contract).toContain('BOTTOM_TABS');
  });

  it('config path is @/config/navigation', () => {
    const contract = buildSkeletonContractForCoder('saas-dashboard');
    expect(contract).toContain('@/config/navigation');
  });

  it('primary nav component is Sidebar (not BottomTabs)', () => {
    const contract = buildSkeletonContractForCoder('saas-dashboard');
    expect(contract).toContain('Sidebar');
    expect(contract).not.toContain("import BottomTabs from '@/components/BottomTabs'");
  });

  it('navMode is sidebar', () => {
    const nav = getSkeletonNavContract('saas-dashboard');
    expect(nav).not.toBeNull();
    expect(nav!.navMode).toBe('sidebar');
  });

  it('ROUTES keys include dashboard, data, settings (not mobile routes)', () => {
    const contract = buildSkeletonContractForCoder('saas-dashboard');
    expect(contract).toContain('dashboard');
    expect(contract).toContain('settings');
    // Must NOT prescribe mobile home/create/detail/progress/profile keys for saas-dashboard
    expect(contract).not.toContain('home/create/detail/progress/profile');
  });

  it('contract does NOT include raw navigation.ts source', () => {
    const contract = buildSkeletonContractForCoder('saas-dashboard');
    // Raw TS source would contain 'export const' declarations inside file contents
    // The contract should NOT embed full file text; it's structural only.
    // We check it doesn't have multiline TypeScript interface/const blocks.
    expect(contract).not.toMatch(/^export\s+interface\s+NavItem/m);
    expect(contract).not.toMatch(/^export\s+interface\s+NavGroup/m);
    expect(contract).not.toMatch(/^const\s+SIDEBAR_NAV\s*=/m);
  });
});

// ── saas-dashboard getSkeletonNavContract ────────────────────────────────────

describe('getSkeletonNavContract — saas-dashboard', () => {
  it('exports contain SIDEBAR_NAV entry', () => {
    const nav = getSkeletonNavContract('saas-dashboard');
    expect(nav).not.toBeNull();
    const exportNames = nav!.exports.map(e => e.name);
    expect(exportNames).toContain('SIDEBAR_NAV');
  });

  it('exports contain BOTTOM_TABS entry', () => {
    const nav = getSkeletonNavContract('saas-dashboard');
    expect(nav).not.toBeNull();
    const exportNames = nav!.exports.map(e => e.name);
    expect(exportNames).toContain('BOTTOM_TABS');
  });

  it('SIDEBAR_NAV has type readonly NavGroup[]', () => {
    const nav = getSkeletonNavContract('saas-dashboard');
    const sidebarExport = nav!.exports.find(e => e.name === 'SIDEBAR_NAV');
    expect(sidebarExport).toBeDefined();
    expect(sidebarExport!.type).toContain('NavGroup[]');
  });

  it('primaryNavComponentPath is @/components/Sidebar', () => {
    const nav = getSkeletonNavContract('saas-dashboard');
    expect(nav!.primaryNavComponentPath).toBe('@/components/Sidebar');
    expect(nav!.primaryNavComponentExport).toBe('Sidebar');
  });
});

// ── mobile-app contract ───────────────────────────────────────────────────────

describe('buildSkeletonContractForCoder — mobile-app nav contract', () => {
  it('includes BOTTOM_TABS export', () => {
    const contract = buildSkeletonContractForCoder('mobile-app');
    expect(contract).toContain('BOTTOM_TABS');
  });

  it('includes BottomTabs component import', () => {
    const contract = buildSkeletonContractForCoder('mobile-app');
    expect(contract).toContain('BottomTabs');
    expect(contract).toContain('@/components/BottomTabs');
  });

  it('navMode is bottom-tabs', () => {
    const nav = getSkeletonNavContract('mobile-app');
    expect(nav!.navMode).toBe('bottom-tabs');
  });

  it('rules specify home/create/detail/progress/profile ROUTES keys', () => {
    const contract = buildSkeletonContractForCoder('mobile-app');
    expect(contract).toContain('home');
    expect(contract).toContain('create');
    expect(contract).toContain('profile');
  });
});

// ── landing-page contract ─────────────────────────────────────────────────────

describe('buildSkeletonContractForCoder — landing-page', () => {
  it('navMode is anchor-scroll', () => {
    const nav = getSkeletonNavContract('landing-page');
    expect(nav!.navMode).toBe('anchor-scroll');
  });

  it('contract does not claim BottomTabs or Sidebar for landing-page', () => {
    const contract = buildSkeletonContractForCoder('landing-page');
    // landing-page uses anchor scroll; no nav component
    expect(contract).not.toContain('@/components/BottomTabs');
    expect(contract).not.toContain('@/components/Sidebar');
  });
});

// ── Import rules presence ─────────────────────────────────────────────────────

describe('buildSkeletonContractForCoder — import rules', () => {
  it('includes rule: import skeleton components only from listed paths', () => {
    const contract = buildSkeletonContractForCoder('saas-dashboard');
    expect(contract).toContain('SKELETON IMPORT RULES');
    expect(contract.toLowerCase()).toContain('listed');
  });

  it('includes rule: self-implement if component is not listed', () => {
    const contract = buildSkeletonContractForCoder('saas-dashboard');
    expect(contract.toLowerCase()).toContain('self-implement');
  });

  it('includes rule: do NOT recreate PROVIDED COMPONENTS', () => {
    const contract = buildSkeletonContractForCoder('saas-dashboard');
    expect(contract).toContain('Do NOT recreate');
  });

  it('includes rule: do NOT recreate app shell or router', () => {
    const contract = buildSkeletonContractForCoder('saas-dashboard');
    expect(contract).toContain('app shell');
  });
});

// ── Contract size (compact — no raw source) ───────────────────────────────────

describe('buildSkeletonContractForCoder — compact size contract', () => {
  it('saas-dashboard contract is under 2000 chars (structural only)', () => {
    const contract = buildSkeletonContractForCoder('saas-dashboard');
    expect(contract.length).toBeLessThan(2000);
  });

  it('mobile-app contract is under 2000 chars', () => {
    const contract = buildSkeletonContractForCoder('mobile-app');
    expect(contract.length).toBeLessThan(2000);
  });

  it('all skeleton contracts are under 2000 chars', () => {
    for (const id of ALL_SKELETONS) {
      const contract = buildSkeletonContractForCoder(id);
      // Skip unavailable skeletons (empty string returned)
      if (contract.length === 0) continue;
      expect(contract.length, `${id} contract too large`).toBeLessThan(2000);
    }
  });
});

// ── CODER_MAX_TOKENS unchanged ────────────────────────────────────────────────

describe('CODER_MAX_TOKENS — output budget unchanged', () => {
  it('CODER_MAX_TOKENS is 35000', () => {
    expect(CODER_MAX_TOKENS).toBe(35_000);
  });

  it('CODER_MAX_TOKENS was not lowered as part of coder-skeleton-context-contract fix', () => {
    // The fix reduces INPUT payload (skeleton contract instead of hardcoded mobile rules)
    // not the OUTPUT budget. 35 000 is the established coder output budget.
    expect(CODER_MAX_TOKENS).toBeGreaterThanOrEqual(35_000);
  });
});

// ── Product Assembly Plan still in planning blocks ────────────────────────────

describe('buildCoderPlanningBlocks — Product Assembly Plan preserved', () => {
  it('planning blocks include PRODUCT ASSEMBLY PLAN', () => {
    const brief = buildMarketAwareBuilderBrief({
      brief: 'Cashflow Guard for Shopify — revenue vs expenses analytics dashboard',
      skeletonId: 'saas-dashboard',
    });
    const blocks = buildCoderPlanningBlocks({ marketAwareBuilderBrief: brief });
    expect(blocks).toContain('PRODUCT ASSEMBLY PLAN');
  });

  it('planning blocks include architecture ownership instruction', () => {
    const brief = buildMarketAwareBuilderBrief({
      brief: 'WorkWell - Mental Health Assistant for Remote Workers',
      skeletonId: 'mobile-app',
    });
    const blocks = buildCoderPlanningBlocks({ marketAwareBuilderBrief: brief });
    // Coder must own architecture — not prescribe a fixed component list
    expect(blocks.toLowerCase()).toMatch(/architect|own|self-plan/);
  });

  it('planning blocks include no-reference-absent-components rule', () => {
    const brief = buildMarketAwareBuilderBrief({
      brief: 'TrendPulse — market trend discovery tool',
      skeletonId: 'saas-dashboard',
    });
    const blocks = buildCoderPlanningBlocks({ marketAwareBuilderBrief: brief });
    // The no-missing-imports or absent-component rule must be present
    expect(blocks.toLowerCase()).toMatch(/absent|not.*listed|self.implement|not.*available/);
  });
});

// ── measureCoderPromptBlockSizes sanity ───────────────────────────────────────

describe('measureCoderPromptBlockSizes — diagnostic function', () => {
  it('returns correct char counts', () => {
    const sizes = measureCoderPromptBlockSizes({
      skeletonHeader:   'AAA',
      contractBlock:    'BB',
      planningBlocks:   'CCCC',
      skeletonFoundation: 'D',
      skeletonContract: 'EEEEE',
      filePlan:         'FF',
      outputFormat:     'GGG',
      importRules:      'HHHH',
      rules:            'IIIII',
      userMessage:      'JJ',
    });
    expect(sizes.skeleton_header_chars).toBe(3);
    expect(sizes.context_contract_chars).toBe(2);
    expect(sizes.planning_blocks_chars).toBe(4);
    expect(sizes.skeleton_foundation_chars).toBe(1);
    expect(sizes.skeleton_contract_chars).toBe(5);
    expect(sizes.file_plan_chars).toBe(2);
    expect(sizes.output_format_chars).toBe(3);
    expect(sizes.import_rules_chars).toBe(4);
    expect(sizes.rules_block_chars).toBe(5);
    expect(sizes.user_message_chars).toBe(2);
    // total_system_chars excludes user message
    expect(sizes.total_system_chars).toBe(3 + 2 + 4 + 1 + 5 + 2 + 3 + 4 + 5);
  });

  it('estimated_total_tokens is ceil of total+user / 4', () => {
    const sizes = measureCoderPromptBlockSizes({
      skeletonHeader:   'A'.repeat(100),
      contractBlock:    '',
      planningBlocks:   '',
      skeletonFoundation: '',
      skeletonContract: '',
      filePlan:         '',
      outputFormat:     '',
      importRules:      '',
      rules:            '',
      userMessage:      'B'.repeat(100),
    });
    expect(sizes.total_system_chars).toBe(100);
    expect(sizes.user_message_chars).toBe(100);
    expect(sizes.estimated_total_tokens).toBe(50);
  });
});

// ── All 14 skeletons covered ──────────────────────────────────────────────────

describe('SkeletonContractForCoder — all 14 skeleton IDs covered', () => {
  it('every registered skeleton has a non-empty nav contract', () => {
    for (const id of ALL_SKELETONS) {
      const nav = getSkeletonNavContract(id);
      expect(nav, `No nav contract for skeleton: ${id}`).not.toBeNull();
    }
  });

  it('every sidebar skeleton has SIDEBAR_NAV in contract text', () => {
    const sidebarSkeletons = [
      'saas-dashboard',
      'b2b-operations-workspace',
      'creator-editor-workspace',
      'productivity-tool',
    ] as const;
    for (const id of sidebarSkeletons) {
      const contract = buildSkeletonContractForCoder(id);
      expect(contract, `${id} missing SIDEBAR_NAV`).toContain('SIDEBAR_NAV');
    }
  });

  it('every bottom-tabs skeleton has BOTTOM_TABS in contract text', () => {
    const tabSkeletons = [
      'mobile-app',
      'ecommerce',
      'marketplace-platform',
      'social-community',
      'dating-matching-app',
      'gaming-casino-app',
      'game-interactive-app',
      'booking-service-app',
      'content-learning-app',
    ] as const;
    for (const id of tabSkeletons) {
      const contract = buildSkeletonContractForCoder(id);
      expect(contract, `${id} missing BOTTOM_TABS`).toContain('BOTTOM_TABS');
    }
  });
});
