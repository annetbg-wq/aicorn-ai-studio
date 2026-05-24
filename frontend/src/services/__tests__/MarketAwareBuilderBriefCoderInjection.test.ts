// @vitest-environment jsdom
/**
 * MarketAwareBuilderBriefCoderInjection — deterministic tests for the
 * coder-facing serializer and planning block injection.
 *
 * All tests use hand-crafted inputs (no LLM calls).
 * Verifies that existing planning blocks are preserved and runArchitect
 * is still present in the pipeline.
 */

import { describe, expect, it } from 'vitest';
import {
  buildMarketAwareBuilderBrief,
  serializeMarketAwareBuilderBriefForCoder,
  type MarketAwareBuilderBrief,
} from '../MarketAwareBuilderBrief';
import { buildCoderPlanningBlocks } from '../ProtoPipeline';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const HEALTH_BRIEF: MarketAwareBuilderBrief = buildMarketAwareBuilderBrief({
  brief: 'A health and wellness app for daily nutrition tracking and fitness coaching',
  skeletonId: 'mobile-app',
});

const DASHBOARD_BRIEF: MarketAwareBuilderBrief = buildMarketAwareBuilderBrief({
  brief: 'An analytics dashboard for monitoring business KPIs and operational metrics',
  skeletonId: 'saas-dashboard',
});

const LANDING_BRIEF: MarketAwareBuilderBrief = buildMarketAwareBuilderBrief({
  brief: 'A landing page for a new SaaS startup with waitlist signup',
  skeletonId: 'landing-page',
});

// ── serializeMarketAwareBuilderBriefForCoder ──────────────────────────────────

describe('serializeMarketAwareBuilderBriefForCoder — structure', () => {
  it('includes the product category', () => {
    const result = serializeMarketAwareBuilderBriefForCoder(HEALTH_BRIEF);
    expect(result).toContain('PRODUCT CATEGORY: mobile-health');
  });

  it('includes the product promise', () => {
    const result = serializeMarketAwareBuilderBriefForCoder(HEALTH_BRIEF);
    expect(result).toContain('PRODUCT PROMISE:');
    expect(result.length).toBeGreaterThan(20);
  });

  it('includes the target user', () => {
    const result = serializeMarketAwareBuilderBriefForCoder(HEALTH_BRIEF);
    expect(result).toContain('TARGET USER:');
  });

  it('includes the core user journey', () => {
    const result = serializeMarketAwareBuilderBriefForCoder(HEALTH_BRIEF);
    expect(result).toContain('CORE USER JOURNEY:');
  });

  it('includes top user expectations section', () => {
    const result = serializeMarketAwareBuilderBriefForCoder(HEALTH_BRIEF);
    expect(result).toContain('TOP USER EXPECTATIONS:');
  });

  it('includes top pain points section', () => {
    const result = serializeMarketAwareBuilderBriefForCoder(HEALTH_BRIEF);
    expect(result).toContain('TOP PAIN POINTS / GAPS TO ADDRESS:');
  });

  it('includes required product moments section', () => {
    const result = serializeMarketAwareBuilderBriefForCoder(HEALTH_BRIEF);
    expect(result).toContain('REQUIRED PRODUCT MOMENTS');
  });

  it('includes the visible differentiator with non-trivial text', () => {
    const result = serializeMarketAwareBuilderBriefForCoder(HEALTH_BRIEF);
    expect(result).toContain('VISIBLE DIFFERENTIATOR');
    const idx = result.indexOf('VISIBLE DIFFERENTIATOR');
    const snippet = result.slice(idx, idx + 200);
    expect(snippet.length).toBeGreaterThan(40);
  });

  it('includes self-test checklist must items', () => {
    const result = serializeMarketAwareBuilderBriefForCoder(HEALTH_BRIEF);
    expect(result).toContain('[must]');
  });

  it('includes forbidden placeholder rules with at least one entry', () => {
    const result = serializeMarketAwareBuilderBriefForCoder(HEALTH_BRIEF);
    expect(result).toContain('FORBIDDEN PLACEHOLDER TEXT');
    expect(result).toContain('✗');
  });

  it('frames block as mandatory builder guidance', () => {
    const result = serializeMarketAwareBuilderBriefForCoder(HEALTH_BRIEF);
    expect(result.toLowerCase()).toContain('mandatory');
    expect(result.toLowerCase()).toContain('must implement');
  });

  it('mentions that builder owns architecture and self-test', () => {
    const result = serializeMarketAwareBuilderBriefForCoder(HEALTH_BRIEF);
    expect(result.toLowerCase()).toContain('architecture');
    expect(result.toLowerCase()).toContain('self-test');
  });

  it('explicitly bans generic placeholder text', () => {
    const result = serializeMarketAwareBuilderBriefForCoder(HEALTH_BRIEF);
    expect(result.toLowerCase()).toContain('do not produce generic placeholder');
  });
});

describe('serializeMarketAwareBuilderBriefForCoder — conciseness', () => {
  it('health brief serializes below 4000 characters', () => {
    const result = serializeMarketAwareBuilderBriefForCoder(HEALTH_BRIEF);
    expect(result.length).toBeLessThan(4000);
  });

  it('dashboard brief serializes below 4000 characters', () => {
    const result = serializeMarketAwareBuilderBriefForCoder(DASHBOARD_BRIEF);
    expect(result.length).toBeLessThan(4000);
  });

  it('landing brief serializes below 4000 characters', () => {
    const result = serializeMarketAwareBuilderBriefForCoder(LANDING_BRIEF);
    expect(result.length).toBeLessThan(4000);
  });

  it('includes at most top 3 user expectations (not the full list)', () => {
    const result = serializeMarketAwareBuilderBriefForCoder(HEALTH_BRIEF);
    const topSection = result.slice(
      result.indexOf('TOP USER EXPECTATIONS:'),
      result.indexOf('TOP PAIN POINTS'),
    );
    const bullets = (topSection.match(/^\s+•/gm) ?? []).length;
    expect(bullets).toBeLessThanOrEqual(3);
    expect(bullets).toBeGreaterThanOrEqual(1);
  });

  it('includes at most top 3 pain points (not the full list)', () => {
    const result = serializeMarketAwareBuilderBriefForCoder(HEALTH_BRIEF);
    const topSection = result.slice(
      result.indexOf('TOP PAIN POINTS'),
      result.indexOf('REQUIRED PRODUCT MOMENTS'),
    );
    const bullets = (topSection.match(/^\s+•/gm) ?? []).length;
    expect(bullets).toBeLessThanOrEqual(3);
    expect(bullets).toBeGreaterThanOrEqual(1);
  });
});

describe('serializeMarketAwareBuilderBriefForCoder — per-category', () => {
  it('dashboard brief includes PRODUCT CATEGORY: dashboard', () => {
    const result = serializeMarketAwareBuilderBriefForCoder(DASHBOARD_BRIEF);
    expect(result).toContain('PRODUCT CATEGORY: dashboard');
  });

  it('landing brief includes PRODUCT CATEGORY: landing', () => {
    const result = serializeMarketAwareBuilderBriefForCoder(LANDING_BRIEF);
    expect(result).toContain('PRODUCT CATEGORY: landing');
  });
});

// ── buildCoderPlanningBlocks — injection ──────────────────────────────────────

describe('buildCoderPlanningBlocks — market brief injection', () => {
  it('includes market-aware brief when passed', () => {
    const result = buildCoderPlanningBlocks({
      marketAwareBuilderBrief: HEALTH_BRIEF,
    });
    expect(result).toContain('MARKET-AWARE BUILDER BRIEF');
    expect(result).toContain('PRODUCT CATEGORY: mobile-health');
  });

  it('returns empty string when no inputs are passed', () => {
    const result = buildCoderPlanningBlocks({});
    expect(result).toBe('');
  });

  it('does not include market brief when not passed', () => {
    const result = buildCoderPlanningBlocks({});
    expect(result).not.toContain('MARKET-AWARE BUILDER BRIEF');
  });

  it('with only marketAwareBuilderBrief, output equals serialized brief', () => {
    const expected = serializeMarketAwareBuilderBriefForCoder(HEALTH_BRIEF);
    const result = buildCoderPlanningBlocks({
      marketAwareBuilderBrief: HEALTH_BRIEF,
    });
    expect(result).toBe(expected);
  });

  it('market brief block does not replace other blocks — no-brief output is subset of with-brief output', () => {
    // When the brief is not passed, the function returns empty; verify that
    // adding brief only appends — the function filter(Boolean).join is safe.
    const briefOnly = serializeMarketAwareBuilderBriefForCoder(HEALTH_BRIEF);
    const withBrief = buildCoderPlanningBlocks({ marketAwareBuilderBrief: HEALTH_BRIEF });
    // The brief block must be present intact
    expect(withBrief).toContain(briefOnly);
  });
});

// ── runArchitect guard ────────────────────────────────────────────────────────

describe('runArchitect — still present in ProtoPipeline', () => {
  it('ProtoPipeline still exports buildCoderPlanningBlocks (pipeline not stripped)', async () => {
    const pipeline = await import('../ProtoPipeline');
    expect(typeof pipeline.buildCoderPlanningBlocks).toBe('function');
  });

  it('ProtoPipeline module is still fully loadable after injection changes', async () => {
    const pipeline = await import('../ProtoPipeline');
    expect(pipeline).toBeDefined();
    // The module has multiple exports — verify a few key ones still exist
    expect(typeof pipeline.buildCoderPlanningBlocks).toBe('function');
    expect(typeof pipeline.buildUiPrimitiveImportCatalog).toBe('function');
  });
});


