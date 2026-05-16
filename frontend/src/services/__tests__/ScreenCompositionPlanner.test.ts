// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { resolveDesignContext } from '../DesignContract';
import {
  buildScreenCompositionPlan,
  buildCompositionPlanPromptBlock,
  serializeScreenCompositionPlan,
} from '../ScreenCompositionPlanner';
import { materializeMediaAssets } from '../ProtoPipeline';

describe('ScreenCompositionPlanner — mobile-app', () => {
  it('includes Home/Today, Progress, and Profile or Coach screens', async () => {
    const ctx = await resolveDesignContext('wellness mobile app with habit routine tracking', 'mobile-app');
    const plan = buildScreenCompositionPlan({
      brief: 'wellness mobile app with habit routine tracking',
      skeletonId: 'mobile-app',
      designCtx: ctx,
      premiumComponentIds: ctx.premiumComponentSelection.selectedComponents.map(c => c.id),
      mediaHints: [],
    });

    const ids = plan.screens.map(s => s.id);
    // Must include home/today
    expect(ids.some(id => id.includes('home') || id.includes('today'))).toBe(true);
    // Must include progress
    expect(ids.some(id => id.includes('progress'))).toBe(true);
    // Must include profile or coach
    expect(ids.some(id => id.includes('profile') || id.includes('coach'))).toBe(true);
  });

  it('first screen has 4–7 meaningful zones', async () => {
    const ctx = await resolveDesignContext('wellness mobile app with habit routine tracking', 'mobile-app');
    const plan = buildScreenCompositionPlan({
      brief: 'wellness mobile app',
      skeletonId: 'mobile-app',
      designCtx: ctx,
      premiumComponentIds: [],
      mediaHints: [],
    });

    const firstScreen = plan.screens.find(s => s.id === plan.firstScreenId)!;
    expect(firstScreen).toBeDefined();
    expect(firstScreen.zones.length).toBeGreaterThanOrEqual(4);
    expect(firstScreen.zones.length).toBeLessThanOrEqual(7);
  });

  it('first screen includes primary_action, status/hero, progress/insight, navigation zones', async () => {
    const ctx = await resolveDesignContext('fitness tracker app', 'mobile-app');
    const plan = buildScreenCompositionPlan({
      brief: 'fitness tracker app',
      skeletonId: 'mobile-app',
      designCtx: ctx,
      premiumComponentIds: [],
      mediaHints: [],
    });

    const firstScreen = plan.screens.find(s => s.id === plan.firstScreenId)!;
    const zoneRoles = firstScreen.zones.map(z => z.role);
    expect(zoneRoles).toContain('primary_action');
    expect(zoneRoles.some(r => r === 'status' || r === 'hero')).toBe(true);
    expect(zoneRoles.some(r => r === 'progress' || r === 'insight')).toBe(true);
    expect(zoneRoles).toContain('navigation');
  });

  it('first screen has premium and media targets when available', async () => {
    const ctx = await resolveDesignContext('wellness mobile app', 'mobile-app');
    const media = await materializeMediaAssets(ctx, 'wellness mobile app', 'mobile-app');
    const plan = buildScreenCompositionPlan({
      brief: 'wellness mobile app',
      skeletonId: 'mobile-app',
      designCtx: ctx,
      premiumComponentIds: ctx.premiumComponentSelection.selectedComponents.map(c => c.id),
      mediaHints: media.mediaHints,
    });

    const firstScreen = plan.screens.find(s => s.id === plan.firstScreenId)!;
    // When premium components are selected, first screen should have targets
    if (ctx.premiumComponentSelection.selectedComponents.length > 0) {
      expect(firstScreen.premiumComponentTargets.length).toBeGreaterThan(0);
    }
    // When media hints are available, first screen should have media targets
    if (media.mediaHints.length > 0) {
      expect(firstScreen.mediaTargets.length).toBeGreaterThan(0);
    }
  });
});

describe('ScreenCompositionPlanner — saas-dashboard', () => {
  it('includes Dashboard plus two meaningful workspace screens', async () => {
    const ctx = await resolveDesignContext('project tracker for teams', 'saas-dashboard');
    const plan = buildScreenCompositionPlan({
      brief: 'project tracker for teams',
      skeletonId: 'saas-dashboard',
      designCtx: ctx,
      premiumComponentIds: [],
      mediaHints: [],
    });

    expect(plan.screens.length).toBeGreaterThanOrEqual(3);
    const ids = plan.screens.map(s => s.id);
    expect(ids.some(id => id.includes('dashboard') || id.includes('overview'))).toBe(true);
    // Should have at least 2 non-settings screens beyond dashboard
    const nonSettingsWorkspaceScreens = plan.screens.filter(s =>
      s.priority !== 'supporting' && s.id !== plan.firstScreenId
    );
    expect(nonSettingsWorkspaceScreens.length).toBeGreaterThanOrEqual(2);
  });

  it('first screen includes KPI/status, workflow/list/table, insight, and navigation/shell zones', async () => {
    const ctx = await resolveDesignContext('SaaS analytics dashboard', 'saas-dashboard');
    const plan = buildScreenCompositionPlan({
      brief: 'SaaS analytics dashboard',
      skeletonId: 'saas-dashboard',
      designCtx: ctx,
      premiumComponentIds: [],
      mediaHints: [],
    });

    const firstScreen = plan.screens.find(s => s.id === plan.firstScreenId)!;
    const zoneRoles = firstScreen.zones.map(z => z.role);
    expect(zoneRoles.some(r => r === 'status' || r === 'insight')).toBe(true);
    expect(zoneRoles.some(r => r === 'list' || r === 'table' || r === 'feed')).toBe(true);
    expect(zoneRoles).toContain('navigation');
  });

  it('avoidPatterns include generic admin panel and card wall wording', async () => {
    const ctx = await resolveDesignContext('internal tools dashboard', 'saas-dashboard');
    const plan = buildScreenCompositionPlan({
      brief: 'internal tools dashboard',
      skeletonId: 'saas-dashboard',
      designCtx: ctx,
      premiumComponentIds: [],
      mediaHints: [],
    });

    const patternsText = plan.avoidPatterns.join(' ');
    expect(patternsText).toMatch(/admin/i);
    // Should also mention card wall or kpi-only or similar
    expect(patternsText).toMatch(/card|kpi|analytics/i);
  });
});

describe('ScreenCompositionPlanner — landing-page', () => {
  it('includes Hero, Product Preview, and CTA sections', async () => {
    const ctx = await resolveDesignContext('SaaS product landing page', 'landing-page');
    const plan = buildScreenCompositionPlan({
      brief: 'SaaS product landing page',
      skeletonId: 'landing-page',
      designCtx: ctx,
      premiumComponentIds: [],
      mediaHints: [],
    });

    const ids = plan.screens.map(s => s.id);
    expect(ids.some(id => id.includes('hero'))).toBe(true);
    expect(ids.some(id => id.includes('preview') || id.includes('product') || id.includes('features'))).toBe(true);
    expect(ids.some(id => id.includes('cta') || id.includes('social') || id.includes('proof'))).toBe(true);
  });
});

describe('ScreenCompositionPlanner — prompt block', () => {
  it('coder prompt contains SCREEN_COMPOSITION_PLAN', async () => {
    const ctx = await resolveDesignContext('fitness app', 'mobile-app');
    const plan = buildScreenCompositionPlan({
      brief: 'fitness app',
      skeletonId: 'mobile-app',
      designCtx: ctx,
      premiumComponentIds: [],
      mediaHints: [],
    });
    const block = buildCompositionPlanPromptBlock(plan);
    expect(block).toContain('SCREEN_COMPOSITION_PLAN');
  });

  it('coder prompt includes zones, not just screen names', async () => {
    const ctx = await resolveDesignContext('project management tool', 'saas-dashboard');
    const plan = buildScreenCompositionPlan({
      brief: 'project management tool',
      skeletonId: 'saas-dashboard',
      designCtx: ctx,
      premiumComponentIds: [],
      mediaHints: [],
    });
    const block = buildCompositionPlanPromptBlock(plan);
    expect(block).toMatch(/ZONES?:/i);
    expect(block).toMatch(/role:/i);
    expect(block).toMatch(/priority:/i);
  });

  it('prompt block includes avoid patterns', async () => {
    const ctx = await resolveDesignContext('ecommerce store', 'ecommerce');
    const plan = buildScreenCompositionPlan({
      brief: 'ecommerce store',
      skeletonId: 'ecommerce',
      designCtx: ctx,
      premiumComponentIds: [],
      mediaHints: [],
    });
    const block = buildCompositionPlanPromptBlock(plan);
    expect(block).toMatch(/AVOID_PATTERNS/i);
  });
});

describe('ScreenCompositionPlanner — telemetry', () => {
  it('serializes composition plan to telemetry format', async () => {
    const ctx = await resolveDesignContext('mobile wellness app', 'mobile-app');
    const plan = buildScreenCompositionPlan({
      brief: 'mobile wellness app',
      skeletonId: 'mobile-app',
      designCtx: ctx,
      premiumComponentIds: [],
      mediaHints: [],
    });
    const telemetry = serializeScreenCompositionPlan(plan);

    expect(telemetry).toHaveProperty('skeleton_id', 'mobile-app');
    expect(telemetry).toHaveProperty('first_screen_id');
    expect(telemetry).toHaveProperty('screen_count');
    expect(Array.isArray(telemetry.screens)).toBe(true);
    expect(Array.isArray(telemetry.global_layout_rules)).toBe(true);
    expect(Array.isArray(telemetry.avoid_patterns)).toBe(true);
    expect(Array.isArray(telemetry.composition_notes)).toBe(true);

    // Each screen should have zones in telemetry
    for (const screen of telemetry.screens) {
      expect(Array.isArray(screen.zones)).toBe(true);
    }
  });

  it('does not throw or fail with empty premium components or empty media hints', async () => {
    const ctx = await resolveDesignContext('generic app', 'mobile-app');
    expect(() => buildScreenCompositionPlan({
      brief: 'generic app',
      skeletonId: 'mobile-app',
      designCtx: ctx,
      premiumComponentIds: [],
      mediaHints: [],
    })).not.toThrow();
  });

  it('does not throw when architectPlan is provided', async () => {
    const ctx = await resolveDesignContext('todo list app', 'mobile-app');
    const architectPlan = {
      pages: [{ path: '/', name: 'Home', file: 'pages/Home.tsx', purpose: 'Main screen' }],
    };
    expect(() => buildScreenCompositionPlan({
      brief: 'todo list app',
      skeletonId: 'mobile-app',
      designCtx: ctx,
      premiumComponentIds: [],
      mediaHints: [],
      architectPlan,
    })).not.toThrow();
  });
});
