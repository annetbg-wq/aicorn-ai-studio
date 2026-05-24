// @vitest-environment jsdom
/**
 * MarketAwareBuilderBrief — deterministic helper tests.
 *
 * All tests use hand-crafted inputs (no LLM calls).
 * Diagnostics are advisory-only and must never block generation.
 */

import { describe, expect, it } from 'vitest';
import {
  buildMarketAwareBuilderBrief,
  buildBuilderSelfTestChecklist,
  evaluateMarketAwareBuilderBriefDiagnostics,
  detectProductCategory,
  type MarketAwareBuilderBrief,
  type ProductCategory,
} from '../MarketAwareBuilderBrief';

// ── Helpers ───────────────────────────────────────────────────────────────────

function briefFor(category: ProductCategory): MarketAwareBuilderBrief {
  const briefTextByCat: Record<ProductCategory, string> = {
    'mobile-health': 'A health and wellness app for daily nutrition tracking and fitness coaching',
    'dashboard': 'An analytics dashboard for monitoring business KPIs and operational metrics',
    'landing': 'A landing page for a new SaaS startup with waitlist signup',
    'marketplace': 'A marketplace for buying and selling handmade goods with reviews and checkout',
    'social': 'A social community app with feed, profiles, and community spaces',
    'game-rpg': 'An RPG game app with progression, daily quests, XP, and rewards',
    'generic': 'A productivity application for organizing tasks',
  };

  const skeletonByCat: Record<ProductCategory, string> = {
    'mobile-health': 'mobile-app',
    'dashboard': 'saas-dashboard',
    'landing': 'landing-page',
    'marketplace': 'marketplace-platform',
    'social': 'social-community',
    'game-rpg': 'game-interactive-app',
    'generic': 'productivity-tool',
  };

  return buildMarketAwareBuilderBrief({
    brief: briefTextByCat[category],
    skeletonId: skeletonByCat[category],
  });
}

// ── Category detection ────────────────────────────────────────────────────────

describe('detectProductCategory', () => {
  it('detects mobile-health from health/wellness terms', () => {
    expect(detectProductCategory('nutrition tracking and fitness coaching app', 'mobile-app')).toBe('mobile-health');
  });

  it('detects dashboard from analytics/metrics terms', () => {
    expect(detectProductCategory('business analytics dashboard with KPI monitoring', 'saas-dashboard')).toBe('dashboard');
  });

  it('detects landing from landing-page terms', () => {
    expect(detectProductCategory('startup landing page with waitlist', 'landing-page')).toBe('landing');
  });

  it('detects marketplace from commerce terms', () => {
    expect(detectProductCategory('marketplace for buying and selling handmade goods', 'marketplace-platform')).toBe('marketplace');
  });

  it('detects social from social/community terms', () => {
    expect(detectProductCategory('social community app with feed and profiles', 'social-community')).toBe('social');
  });

  it('detects game-rpg from game/progression terms', () => {
    expect(detectProductCategory('RPG game with progression and XP rewards', 'game-interactive-app')).toBe('game-rpg');
  });

  it('falls back to skeleton-mapped category when brief has no strong signals', () => {
    expect(detectProductCategory('an app', 'saas-dashboard')).toBe('dashboard');
  });

  it('returns generic when skeleton is unrecognized and brief has no signals', () => {
    expect(detectProductCategory('an app', 'unknown-skeleton')).toBe('generic');
  });
});

// ── Market-aware brief generation ─────────────────────────────────────────────

describe('buildMarketAwareBuilderBrief — health/mobile', () => {
  it('detects mobile-health category', () => {
    const b = briefFor('mobile-health');
    expect(b.marketInsight.productCategory).toBe('mobile-health');
  });

  it('includes scan/result/next-action/history/coach loop in required moments', () => {
    const b = briefFor('mobile-health');
    const screens = b.builderBrief.requiredScreens.join(' ').toLowerCase();
    expect(screens).toContain('scan');
    expect(screens).toContain('result');
    expect(screens).toContain('progress');
    expect(screens).toContain('coach');
  });

  it('includes product-specific workflow with scan→result→action→history→coach', () => {
    const b = briefFor('mobile-health');
    const workflow = b.builderBrief.productSpecificWorkflow.toLowerCase();
    expect(workflow).toContain('scan');
    expect(workflow).toContain('verdict');
    expect(workflow).toContain('action');
    expect(workflow).toContain('insight');
  });

  it('includes user pain points mentioning calorie log style and generic advice', () => {
    const b = briefFor('mobile-health');
    const painText = b.marketInsight.userPainPoints.join(' ').toLowerCase();
    expect(painText).toContain('calorie');
    expect(painText).toContain('generic');
  });

  it('has differentiator about scan→verdict→one next action loop', () => {
    const b = briefFor('mobile-health');
    expect(b.marketInsight.differentiatorOpportunity.toLowerCase()).toContain('scan');
    expect(b.marketInsight.differentiatorOpportunity.toLowerCase()).toContain('verdict');
    expect(b.marketInsight.differentiatorOpportunity.toLowerCase()).toContain('next action');
  });

  it('has 5 required screens', () => {
    const b = briefFor('mobile-health');
    expect(b.builderBrief.requiredScreens.length).toBe(5);
  });
});

describe('buildMarketAwareBuilderBrief — dashboard', () => {
  it('detects dashboard category', () => {
    const b = briefFor('dashboard');
    expect(b.marketInsight.productCategory).toBe('dashboard');
  });

  it('includes metrics/status/table/action/insight in required moments', () => {
    const b = briefFor('dashboard');
    const screens = b.builderBrief.requiredScreens.join(' ').toLowerCase();
    expect(screens).toContain('metric');
    expect(screens).toContain('status');
    expect(screens).toContain('table');
    expect(screens).toContain('action');
    expect(screens).toContain('insight');
  });

  it('includes pain points about random cards and unclear priority', () => {
    const b = briefFor('dashboard');
    const painText = b.marketInsight.userPainPoints.join(' ').toLowerCase();
    expect(painText).toContain('priority');
    expect(painText).toContain('card');
  });

  it('differentiator mentions metrics with context and priority actions', () => {
    const b = briefFor('dashboard');
    const diff = b.marketInsight.differentiatorOpportunity.toLowerCase();
    expect(diff).toContain('metric');
    expect(diff).toContain('priority');
  });

  it('has 5 required screens', () => {
    const b = briefFor('dashboard');
    expect(b.builderBrief.requiredScreens.length).toBe(5);
  });
});

describe('buildMarketAwareBuilderBrief — landing', () => {
  it('detects landing category', () => {
    const b = briefFor('landing');
    expect(b.marketInsight.productCategory).toBe('landing');
  });

  it('includes hero/value/trust/CTA/product preview in required moments', () => {
    const b = briefFor('landing');
    const screens = b.builderBrief.requiredScreens.join(' ').toLowerCase();
    expect(screens).toContain('hero');
    expect(screens).toContain('value');
    expect(screens).toContain('trust');
    expect(screens).toContain('cta');
    expect(screens).toContain('product preview');
  });

  it('includes pain points about generic hero text and no trust signals', () => {
    const b = briefFor('landing');
    const painText = b.marketInsight.userPainPoints.join(' ').toLowerCase();
    expect(painText).toContain('generic');
    expect(painText).toContain('trust');
  });

  it('differentiator mentions pain→outcome→proof→conversion', () => {
    const b = briefFor('landing');
    const diff = b.marketInsight.differentiatorOpportunity.toLowerCase();
    expect(diff).toContain('pain');
    expect(diff).toContain('outcome');
    expect(diff).toContain('proof');
    expect(diff).toContain('conversion');
  });

  it('has 6 required screens/sections', () => {
    const b = briefFor('landing');
    expect(b.builderBrief.requiredScreens.length).toBe(6);
  });
});

describe('buildMarketAwareBuilderBrief — social', () => {
  it('detects social category', () => {
    const b = briefFor('social');
    expect(b.marketInsight.productCategory).toBe('social');
  });

  it('includes feed/profile/community/create/activity in required moments', () => {
    const b = briefFor('social');
    const screens = b.builderBrief.requiredScreens.join(' ').toLowerCase();
    expect(screens).toContain('feed');
    expect(screens).toContain('profile');
    expect(screens).toContain('community');
    expect(screens).toContain('creat');
    expect(screens).toContain('reaction');
  });

  it('includes pain points about static feeds and no return hook', () => {
    const b = briefFor('social');
    const painText = b.marketInsight.userPainPoints.join(' ').toLowerCase();
    expect(painText).toContain('static');
    expect(painText).toContain('return');
  });

  it('differentiator mentions identity and engagement loop', () => {
    const b = briefFor('social');
    const diff = b.marketInsight.differentiatorOpportunity.toLowerCase();
    expect(diff).toContain('identity');
    expect(diff).toContain('loop');
  });

  it('has 5 required screens', () => {
    const b = briefFor('social');
    expect(b.builderBrief.requiredScreens.length).toBe(5);
  });
});

describe('buildMarketAwareBuilderBrief — marketplace', () => {
  it('detects marketplace category', () => {
    const b = briefFor('marketplace');
    expect(b.marketInsight.productCategory).toBe('marketplace');
  });

  it('includes catalog/search/detail/trust/checkout in required moments', () => {
    const b = briefFor('marketplace');
    const screens = b.builderBrief.requiredScreens.join(' ').toLowerCase();
    expect(screens).toContain('catalog');
    expect(screens).toContain('filter');
    expect(screens).toContain('detail');
    expect(screens).toContain('trust');
    expect(screens).toContain('checkout');
  });

  it('includes pain points about choice paralysis and trust signals', () => {
    const b = briefFor('marketplace');
    const painText = b.marketInsight.userPainPoints.join(' ').toLowerCase();
    expect(painText).toContain('trust');
    expect(painText).toContain('friction');
  });

  it('differentiator mentions trust friction at every step', () => {
    const b = briefFor('marketplace');
    const diff = b.marketInsight.differentiatorOpportunity.toLowerCase();
    expect(diff).toContain('trust');
  });

  it('has 5 required screens', () => {
    const b = briefFor('marketplace');
    expect(b.builderBrief.requiredScreens.length).toBe(5);
  });
});

describe('buildMarketAwareBuilderBrief — game/RPG', () => {
  it('detects game-rpg category', () => {
    const b = briefFor('game-rpg');
    expect(b.marketInsight.productCategory).toBe('game-rpg');
  });

  it('includes progression/reward/daily-action/challenge/status in required moments', () => {
    const b = briefFor('game-rpg');
    const screens = b.builderBrief.requiredScreens.join(' ').toLowerCase();
    expect(screens).toContain('progression');
    expect(screens).toContain('reward');
    expect(screens).toContain('daily');
    expect(screens).toContain('challenge');
    expect(screens).toContain('feedback');
  });

  it('includes pain points about unclear progression and no daily reason to return', () => {
    const b = briefFor('game-rpg');
    const painText = b.marketInsight.userPainPoints.join(' ').toLowerCase();
    expect(painText).toContain('progression');
    expect(painText).toContain('daily');
  });

  it('differentiator mentions action→reward→progress→next challenge loop', () => {
    const b = briefFor('game-rpg');
    const diff = b.marketInsight.differentiatorOpportunity.toLowerCase();
    expect(diff).toContain('action');
    expect(diff).toContain('reward');
    expect(diff).toContain('progress');
    expect(diff).toContain('challenge');
  });

  it('has 5 required screens', () => {
    const b = briefFor('game-rpg');
    expect(b.builderBrief.requiredScreens.length).toBe(5);
  });
});

// ── All briefs have complete required sections ─────────────────────────────────

describe('buildMarketAwareBuilderBrief — common requirements for all categories', () => {
  const categories: ProductCategory[] = [
    'mobile-health', 'dashboard', 'landing', 'marketplace', 'social', 'game-rpg',
  ];

  categories.forEach(category => {
    it(`${category}: has non-empty market insight`, () => {
      const b = briefFor(category);
      expect(b.marketInsight.successfulPatterns.length).toBeGreaterThan(0);
      expect(b.marketInsight.popularFeatures.length).toBeGreaterThan(0);
      expect(b.marketInsight.userPainPoints.length).toBeGreaterThan(0);
      expect(b.marketInsight.trends.length).toBeGreaterThan(0);
      expect(b.marketInsight.competitorGaps.length).toBeGreaterThan(0);
      expect(b.marketInsight.differentiatorOpportunity).toBeTruthy();
    });

    it(`${category}: has complete product vision`, () => {
      const b = briefFor(category);
      expect(b.productVision.productPromise).toBeTruthy();
      expect(b.productVision.targetUser).toBeTruthy();
      expect(b.productVision.coreUserJourney).toBeTruthy();
      expect(b.productVision.emotionalHook).toBeTruthy();
      expect(b.productVision.primaryUserOutcome).toBeTruthy();
    });

    it(`${category}: has non-empty builder brief`, () => {
      const b = briefFor(category);
      expect(b.builderBrief.requiredScreens.length).toBeGreaterThan(0);
      expect(b.builderBrief.requiredInteractions.length).toBeGreaterThan(0);
      expect(b.builderBrief.designConstraints.length).toBeGreaterThan(0);
      expect(b.builderBrief.qualityConstraints.length).toBeGreaterThan(0);
      expect(b.builderBrief.productSpecificWorkflow).toBeTruthy();
      expect(b.builderBrief.forbiddenGenericPlaceholders.length).toBeGreaterThan(0);
      expect(b.builderBrief.marketAwareDifferentiator).toBeTruthy();
    });

    it(`${category}: has non-empty self-test checklist`, () => {
      const b = briefFor(category);
      expect(b.selfTestChecklist.length).toBeGreaterThan(0);
    });
  });
});

// ── Self-test checklist ────────────────────────────────────────────────────────

describe('buildBuilderSelfTestChecklist', () => {
  function checklist(category: ProductCategory) {
    return buildBuilderSelfTestChecklist({
      brief: 'test brief',
      skeletonId: 'mobile-app',
      productCategory: category,
      premiumComponentIds: ['wellness-hero'],
      mediaHints: [{ id: 'health-hero', kind: 'illustration' }],
    });
  }

  it('includes file-coverage check', () => {
    const items = checklist('mobile-health');
    const item = items.find(i => i.id === 'file-coverage');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('must');
    expect(item!.detectionHint).toBeTruthy();
  });

  it('includes import-validity check', () => {
    const items = checklist('mobile-health');
    const item = items.find(i => i.id === 'import-validity');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('must');
  });

  it('includes no-generic-placeholders check', () => {
    const items = checklist('mobile-health');
    const item = items.find(i => i.id === 'no-generic-placeholders');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('must');
    expect(item!.label).toContain('Lorem ipsum');
  });

  it('includes primary-cta-exists check', () => {
    const items = checklist('mobile-health');
    const item = items.find(i => i.id === 'primary-cta-exists');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('must');
  });

  it('includes product-specific-workflow check', () => {
    const items = checklist('mobile-health');
    const item = items.find(i => i.id === 'product-specific-workflow');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('must');
    expect(item!.detectionHint.toLowerCase()).toContain('scan');
  });

  it('includes premium-assets-used check', () => {
    const items = checklist('mobile-health');
    const item = items.find(i => i.id === 'premium-assets-used');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('should');
    expect(item!.label).toContain('wellness-hero');
  });

  it('includes media-assets-used check', () => {
    const items = checklist('mobile-health');
    const item = items.find(i => i.id === 'media-assets-used');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('should');
    expect(item!.label).toContain('health-hero');
  });

  it('includes composition-expectations-met check', () => {
    const items = checklist('mobile-health');
    const item = items.find(i => i.id === 'composition-expectations-met');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('should');
    expect(item!.detectionHint.toLowerCase()).toContain('scan');
  });

  it('includes market-differentiator-visible check', () => {
    const items = checklist('mobile-health');
    const item = items.find(i => i.id === 'market-differentiator-visible');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('must');
  });

  it('every checklist item has all required fields', () => {
    const items = checklist('dashboard');
    for (const item of items) {
      expect(item.id).toBeTruthy();
      expect(item.label).toBeTruthy();
      expect(['must', 'should']).toContain(item.severity);
      expect(item.rationale).toBeTruthy();
      expect(item.detectionHint).toBeTruthy();
    }
  });

  it('has exactly 10 checklist items', () => {
    expect(checklist('mobile-health')).toHaveLength(10);
    expect(checklist('dashboard')).toHaveLength(10);
    expect(checklist('landing')).toHaveLength(10);
  });
});

// ── Diagnostics ────────────────────────────────────────────────────────────────

describe('evaluateMarketAwareBuilderBriefDiagnostics — full brief passes', () => {
  it('passes for a complete mobile-health brief', () => {
    const brief = briefFor('mobile-health');
    const diag = evaluateMarketAwareBuilderBriefDiagnostics(brief);
    expect(diag.ok).toBe(true);
    expect(diag.suspiciouslyGeneric).toBe(false);
    expect(diag.triesToOwnTechnicalArchitecture).toBe(false);
    expect(diag.issues.filter(i => i.code === 'MISSING_MARKET_INSIGHT')).toHaveLength(0);
    expect(diag.issues.filter(i => i.code === 'MISSING_USER_PAIN_POINTS')).toHaveLength(0);
    expect(diag.issues.filter(i => i.code === 'MISSING_DIFFERENTIATOR')).toHaveLength(0);
  });

  it('passes for all 6 product categories', () => {
    const cats: ProductCategory[] = ['mobile-health', 'dashboard', 'landing', 'marketplace', 'social', 'game-rpg'];
    for (const cat of cats) {
      const brief = briefFor(cat);
      const diag = evaluateMarketAwareBuilderBriefDiagnostics(brief);
      expect(diag.ok).toBe(true);
    }
  });
});

describe('evaluateMarketAwareBuilderBriefDiagnostics — detects issues', () => {
  it('detects missing market insight (empty successfulPatterns)', () => {
    const brief = briefFor('mobile-health');
    brief.marketInsight.successfulPatterns = [];
    const diag = evaluateMarketAwareBuilderBriefDiagnostics(brief);
    expect(diag.issues.some(i => i.code === 'MISSING_MARKET_INSIGHT')).toBe(true);
  });

  it('detects missing user pain points', () => {
    const brief = briefFor('mobile-health');
    brief.marketInsight.userPainPoints = [];
    const diag = evaluateMarketAwareBuilderBriefDiagnostics(brief);
    expect(diag.issues.some(i => i.code === 'MISSING_USER_PAIN_POINTS')).toBe(true);
    expect(diag.issues.some(i => i.code === 'MISSING_MARKET_INSIGHT')).toBe(true);
  });

  it('detects missing competitor gap / differentiator', () => {
    const brief = briefFor('mobile-health');
    brief.marketInsight.competitorGaps = [];
    brief.marketInsight.differentiatorOpportunity = '';
    const diag = evaluateMarketAwareBuilderBriefDiagnostics(brief);
    expect(diag.issues.some(i => i.code === 'MISSING_DIFFERENTIATOR')).toBe(true);
  });

  it('detects missing required screens', () => {
    const brief = briefFor('mobile-health');
    brief.builderBrief.requiredScreens = [];
    const diag = evaluateMarketAwareBuilderBriefDiagnostics(brief);
    expect(diag.issues.some(i => i.code === 'MISSING_REQUIRED_SCREENS')).toBe(true);
  });

  it('detects missing self-test checklist', () => {
    const brief = briefFor('mobile-health');
    brief.selfTestChecklist = [];
    const diag = evaluateMarketAwareBuilderBriefDiagnostics(brief);
    expect(diag.issues.some(i => i.code === 'MISSING_SELF_TEST_CHECKLIST')).toBe(true);
  });

  it('detects missing forbidden generic placeholder rules', () => {
    const brief = briefFor('mobile-health');
    brief.builderBrief.forbiddenGenericPlaceholders = [];
    const diag = evaluateMarketAwareBuilderBriefDiagnostics(brief);
    expect(diag.issues.some(i => i.code === 'MISSING_FORBIDDEN_PLACEHOLDER_RULES')).toBe(true);
  });

  it('detects a suspiciously generic brief', () => {
    const brief = briefFor('mobile-health');
    // Inject enough generic signals to trigger detection
    brief.marketInsight.userPainPoints = ['feature 1 is missing', 'item 1 is broken', 'kpi 1 is undefined', 'appname not set'];
    brief.marketInsight.competitorGaps = ['no feature 2 present'];
    const diag = evaluateMarketAwareBuilderBriefDiagnostics(brief);
    expect(diag.suspiciouslyGeneric).toBe(true);
    expect(diag.issues.some(i => i.code === 'SUSPICIOUSLY_GENERIC')).toBe(true);
  });

  it('detects brief trying to create a file tree / full technical architecture', () => {
    const brief = briefFor('mobile-health');
    // Inject tech arch signals
    brief.builderBrief.productSpecificWorkflow =
      'Create file structure with src/ pages/ components/ and .tsx files. Use import { } and export default. Configure vite.config and tailwind.config and package.json';
    const diag = evaluateMarketAwareBuilderBriefDiagnostics(brief);
    expect(diag.triesToOwnTechnicalArchitecture).toBe(true);
    expect(diag.issues.some(i => i.code === 'TRIES_TO_OWN_TECHNICAL_ARCHITECTURE')).toBe(true);
  });

  it('diagnostics are advisory-only — ok is true even with warnings', () => {
    const brief = briefFor('mobile-health');
    brief.marketInsight.successfulPatterns = [];
    const diag = evaluateMarketAwareBuilderBriefDiagnostics(brief);
    // Warnings do not set ok=false; only errors do
    expect(diag.ok).toBe(true);
    expect(diag.issues.every(i => i.severity === 'warn')).toBe(true);
  });

  it('does not produce errors — all diagnostics are severity=warn', () => {
    // Create a maximally broken brief
    const brief = briefFor('mobile-health');
    brief.marketInsight.successfulPatterns = [];
    brief.marketInsight.popularFeatures = [];
    brief.marketInsight.userPainPoints = [];
    brief.marketInsight.trends = [];
    brief.marketInsight.competitorGaps = [];
    brief.marketInsight.differentiatorOpportunity = '';
    brief.builderBrief.requiredScreens = [];
    brief.selfTestChecklist = [];
    brief.builderBrief.forbiddenGenericPlaceholders = [];

    const diag = evaluateMarketAwareBuilderBriefDiagnostics(brief);
    expect(diag.ok).toBe(true); // advisory-only — no errors
    expect(diag.issues.length).toBeGreaterThan(0);
    expect(diag.issues.every(i => i.severity === 'warn')).toBe(true);
  });
});

// ── No real LLM calls (sanity) ─────────────────────────────────────────────────

describe('MarketAwareBuilderBrief — no LLM calls', () => {
  it('buildMarketAwareBuilderBrief is synchronous and requires no LLM', () => {
    const result = buildMarketAwareBuilderBrief({
      brief: 'A health app',
      skeletonId: 'mobile-app',
    });
    // If this returns without async/await, no LLM call was made
    expect(result).toBeDefined();
    expect(result.marketInsight).toBeDefined();
    expect(result.productVision).toBeDefined();
    expect(result.builderBrief).toBeDefined();
    expect(result.selfTestChecklist).toBeDefined();
  });

  it('evaluateMarketAwareBuilderBriefDiagnostics is synchronous and requires no LLM', () => {
    const brief = briefFor('dashboard');
    const diag = evaluateMarketAwareBuilderBriefDiagnostics(brief);
    expect(diag).toBeDefined();
    expect(typeof diag.ok).toBe('boolean');
  });
});
