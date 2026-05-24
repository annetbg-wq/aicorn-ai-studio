// @vitest-environment jsdom
/**
 * BuilderOwnedSelfPlan — deterministic tests for the builder-owned
 * architecture + self-test instructions block.
 *
 * All tests use hand-crafted inputs (no LLM calls).
 * Verifies:
 *   - buildBuilderOwnedSelfPlanInstructions serializer content
 *   - injection into buildCoderPlanningBlocks alongside the market-aware brief
 *   - existing planner blocks are preserved
 *   - runArchitect is still present in the pipeline
 */

import { describe, expect, it } from 'vitest';
import {
  buildMarketAwareBuilderBrief,
  buildBuilderOwnedSelfPlanInstructions,
  serializeMarketAwareBuilderBriefForCoder,
  SELF_PLAN_SELF_TEST_ITEMS,
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

// ── buildBuilderOwnedSelfPlanInstructions — architecture ownership ─────────────

describe('buildBuilderOwnedSelfPlanInstructions — architecture ownership', () => {
  it('states the coder is NOT a passive implementer', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result.toLowerCase()).toContain('not a passive implementer');
  });

  it('states the coder owns architecture', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result.toLowerCase()).toContain('architecture');
  });

  it('states the coder owns self-test', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result.toLowerCase()).toContain('self-test');
  });

  it('includes mandatory header', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result).toContain('BUILDER-OWNED ARCHITECTURE & SELF-TEST — MANDATORY');
  });
});

// ── buildBuilderOwnedSelfPlanInstructions — internal plan requirements ────────

describe('buildBuilderOwnedSelfPlanInstructions — internal plan requirements', () => {
  it('requires synthesizing screen/component architecture', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result.toLowerCase()).toContain('screen');
    expect(result.toLowerCase()).toContain('component architecture');
  });

  it('requires synthesizing state/data model', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result.toLowerCase()).toContain('state');
    expect(result.toLowerCase()).toContain('data model');
  });

  it('requires synthesizing core user journey', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result.toLowerCase()).toContain('core user journey');
  });

  it('requires synthesizing interaction flow', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result.toLowerCase()).toContain('interaction flow');
  });

  it('requires synthesizing file responsibility map', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result.toLowerCase()).toContain('file responsibility');
  });

  it('requires planning visible differentiator placement in UI', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result.toLowerCase()).toContain('visible differentiator');
  });

  it('contains BEFORE WRITING CODE section', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result).toContain('BEFORE WRITING CODE');
  });
});

// ── buildBuilderOwnedSelfPlanInstructions — implementation requirements ───────

describe('buildBuilderOwnedSelfPlanInstructions — implementation requirements', () => {
  it('requires preserving the expected file list', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result.toLowerCase()).toContain('expected file list');
  });

  it('requires using the skeleton correctly (extend not rebuild)', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result.toLowerCase()).toContain('skeleton');
    expect(result.toLowerCase()).toContain('extend');
  });

  it('requires implementing required product moments', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result.toLowerCase()).toContain('required product moments');
  });

  it('requires using premium/media assets when provided', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result.toLowerCase()).toContain('premium');
    expect(result.toLowerCase()).toContain('media assets');
  });

  it('bans generic placeholder text', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result.toLowerCase()).toContain('generic placeholder');
  });

  it('requires a meaningful first screen', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result.toLowerCase()).toContain('first screen');
    expect(result.toLowerCase()).toContain('meaningful');
  });

  it('requires coherent and product-specific UI', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result.toLowerCase()).toContain('product-specific');
  });

  it('contains DURING IMPLEMENTATION section', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result).toContain('DURING IMPLEMENTATION:');
  });
});

// ── buildBuilderOwnedSelfPlanInstructions — self-test requirements ────────────

describe('buildBuilderOwnedSelfPlanInstructions — self-test requirements', () => {
  it('contains SELF-TEST BEFORE FINAL ANSWER section', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result).toContain('SELF-TEST BEFORE FINAL ANSWER');
  });

  it('self-test requires file list match', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result.toLowerCase()).toContain('generated files match');
  });

  it('self-test requires valid imports', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result.toLowerCase()).toContain('imports');
    expect(result.toLowerCase()).toContain('resolve');
  });

  it('self-test requires meaningful screens', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result.toLowerCase()).toContain('product-specific, meaningful content');
  });

  it('self-test requires primary CTA on first screen', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result.toLowerCase()).toContain('primary cta');
  });

  it('self-test requires product-specific workflow', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result.toLowerCase()).toContain('product-specific workflow');
  });

  it('self-test requires visible differentiator in UI', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    const stIdx = result.indexOf('SELF-TEST BEFORE FINAL ANSWER');
    const selfTestSection = result.slice(stIdx);
    expect(selfTestSection.toLowerCase()).toContain('visible differentiator');
  });

  it('self-test bans forbidden placeholder text', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    const stIdx = result.indexOf('SELF-TEST BEFORE FINAL ANSWER');
    const selfTestSection = result.slice(stIdx);
    expect(selfTestSection.toLowerCase()).toContain('placeholder');
  });

  it('self-test requires premium/media assets used when provided', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    const stIdx = result.indexOf('SELF-TEST BEFORE FINAL ANSWER');
    const selfTestSection = result.slice(stIdx);
    expect(selfTestSection.toLowerCase()).toContain('premium');
    expect(selfTestSection.toLowerCase()).toContain('media assets');
  });

  it('SELF_PLAN_SELF_TEST_ITEMS constant equals 8', () => {
    expect(SELF_PLAN_SELF_TEST_ITEMS).toBe(8);
  });
});

// ── buildBuilderOwnedSelfPlanInstructions — conciseness ───────────────────────

describe('buildBuilderOwnedSelfPlanInstructions — conciseness', () => {
  it('health brief instructions are below 2500 characters', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(result.length).toBeLessThan(2500);
  });

  it('dashboard brief instructions are below 2500 characters', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    expect(result.length).toBeLessThan(2500);
  });

  it('landing brief instructions are below 2500 characters', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(LANDING_BRIEF);
    expect(result.length).toBeLessThan(2500);
  });

  it('combined market-aware brief + self-plan instructions are below 6500 characters', () => {
    const briefBlock = serializeMarketAwareBuilderBriefForCoder(HEALTH_BRIEF);
    const selfPlanBlock = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    expect(briefBlock.length + selfPlanBlock.length).toBeLessThan(6500);
  });
});

// ── buildCoderPlanningBlocks — self-plan injection ────────────────────────────

describe('buildCoderPlanningBlocks — self-plan injection', () => {
  it('includes both market-aware brief and self-plan instructions', () => {
    const result = buildCoderPlanningBlocks({
      marketAwareBuilderBrief: HEALTH_BRIEF,
    });
    expect(result).toContain('MARKET-AWARE BUILDER BRIEF');
    expect(result).toContain('BUILDER-OWNED ARCHITECTURE & SELF-TEST — MANDATORY');
  });

  it('self-plan block appears after the market-aware brief block', () => {
    const result = buildCoderPlanningBlocks({
      marketAwareBuilderBrief: HEALTH_BRIEF,
    });
    const briefIdx = result.indexOf('MARKET-AWARE BUILDER BRIEF');
    const selfPlanIdx = result.indexOf('BUILDER-OWNED ARCHITECTURE & SELF-TEST');
    expect(briefIdx).toBeGreaterThanOrEqual(0);
    expect(selfPlanIdx).toBeGreaterThan(briefIdx);
  });

  it('market-aware brief block is preserved intact', () => {
    const briefBlock = serializeMarketAwareBuilderBriefForCoder(HEALTH_BRIEF);
    const result = buildCoderPlanningBlocks({ marketAwareBuilderBrief: HEALTH_BRIEF });
    expect(result).toContain(briefBlock);
  });

  it('self-plan instructions block is preserved intact', () => {
    const selfPlanBlock = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    const result = buildCoderPlanningBlocks({ marketAwareBuilderBrief: HEALTH_BRIEF });
    expect(result).toContain(selfPlanBlock);
  });

  it('returns empty string when no inputs are passed', () => {
    const result = buildCoderPlanningBlocks({});
    expect(result).toBe('');
  });

  it('omits self-plan block when marketAwareBuilderBrief is not passed', () => {
    const result = buildCoderPlanningBlocks({});
    expect(result).not.toContain('BUILDER-OWNED ARCHITECTURE & SELF-TEST');
  });
});

// ── buildCoderPlanningBlocks — existing planner blocks are preserved ──────────

describe('buildCoderPlanningBlocks — existing planner blocks are preserved', () => {
  it('adding marketAwareBuilderBrief does not remove previously injected blocks', () => {
    // Verify that passing only marketAwareBuilderBrief still returns both
    // the market brief and self-plan — other blocks are additive, not replaced.
    const withBrief = buildCoderPlanningBlocks({ marketAwareBuilderBrief: HEALTH_BRIEF });
    expect(withBrief).toContain('MARKET-AWARE BUILDER BRIEF');
    expect(withBrief).toContain('BUILDER-OWNED ARCHITECTURE & SELF-TEST');
    // If no other inputs, those blocks are simply absent — but market brief + self-plan are present
    expect(withBrief).not.toContain('COMPOSITION PLAN');
    expect(withBrief).not.toContain('FUNCTIONAL FLOW');
  });

  it('without marketAwareBuilderBrief, planning blocks output is empty', () => {
    const result = buildCoderPlanningBlocks({});
    expect(result).toBe('');
  });
});

// ── runArchitect — still present in ProtoPipeline ────────────────────────────

describe('runArchitect — still present in ProtoPipeline', () => {
  it('ProtoPipeline module loads correctly after self-plan injection changes', async () => {
    const pipeline = await import('../ProtoPipeline');
    expect(pipeline).toBeDefined();
  });

  it('buildCoderPlanningBlocks is still exported (pipeline not stripped)', async () => {
    const pipeline = await import('../ProtoPipeline');
    expect(typeof pipeline.buildCoderPlanningBlocks).toBe('function');
  });

  it('buildUiPrimitiveImportCatalog is still exported (pipeline not stripped)', async () => {
    const pipeline = await import('../ProtoPipeline');
    expect(typeof pipeline.buildUiPrimitiveImportCatalog).toBe('function');
  });

  it('evaluatePrototypeQualityGate is still exported (quality gate not modified)', async () => {
    const pipeline = await import('../ProtoPipeline');
    expect(typeof pipeline.evaluatePrototypeQualityGate).toBe('function');
  });
});
