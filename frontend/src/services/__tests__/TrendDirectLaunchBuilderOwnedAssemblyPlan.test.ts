// @vitest-environment jsdom
/**
 * TrendDirectLaunchBuilderOwnedAssemblyPlan — deterministic tests for the
 * strengthened builder-owned Product Assembly Plan in the trend direct-launch path.
 *
 * Root cause addressed (from trending-niche-quality-snapshot.md):
 *   Run 2 reached the coder and generated domain-specific naming but referenced
 *   a missing component (KPICard) not present in the UI primitive catalog.
 *   The prior "synthesize internally" instruction did not require an explicit
 *   written plan, so assembly choices were not constrained to available primitives.
 *
 * What this test suite verifies:
 *   - Trend direct-launch coder prompt includes builder-owned Product Assembly Plan.
 *   - Product Assembly Plan asks coder to choose screen/section roles itself.
 *   - Product Assembly Plan maps the market-aware brief to UI.
 *   - Product Assembly Plan does not prescribe a fixed external component list.
 *   - Coder owns architecture, screen composition, component choices, implementation.
 *   - runArchitect is still present and downscoped (not bypassed, not removed).
 *   - No real LLM calls in any test.
 */

import { describe, expect, it } from 'vitest';
import {
  buildMarketAwareBuilderBrief,
  buildBuilderOwnedSelfPlanInstructions,
  SELF_PLAN_SELF_TEST_ITEMS,
  type MarketAwareBuilderBrief,
} from '../MarketAwareBuilderBrief';
import { buildCoderPlanningBlocks, buildArchitectProductStrategistRole } from '../ProtoPipeline';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DASHBOARD_BRIEF: MarketAwareBuilderBrief = buildMarketAwareBuilderBrief({
  brief: 'Margin Recovery Cockpit for Shopify Brands — analytics dashboard for tracking return rates, KPIs, and lost margin',
  skeletonId: 'saas-dashboard',
});

const HEALTH_BRIEF: MarketAwareBuilderBrief = buildMarketAwareBuilderBrief({
  brief: 'WorkWell - Mental Health Assistant for Remote Workers — consumer health wellness app',
  skeletonId: 'mobile-app',
});

// ── Product Assembly Plan — required section header ───────────────────────────

describe('buildBuilderOwnedSelfPlanInstructions — Product Assembly Plan header', () => {
  it('includes PRODUCT ASSEMBLY PLAN heading', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    expect(result).toContain('PRODUCT ASSEMBLY PLAN');
  });

  it('frames the plan as mandatory, not optional', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    expect(result.toLowerCase()).toContain('mandatory');
  });

  it('requires writing the plan BEFORE writing code', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    // Plan must come before code — both marker words must be present in order
    const planIdx = result.indexOf('PRODUCT ASSEMBLY PLAN');
    const codeIdx = result.indexOf('BEFORE WRITING ANY CODE');
    expect(planIdx).toBeGreaterThanOrEqual(0);
    expect(codeIdx).toBeGreaterThanOrEqual(0);
  });
});

// ── Product Assembly Plan — required planning steps ───────────────────────────

describe('buildBuilderOwnedSelfPlanInstructions — Product Assembly Plan steps', () => {
  it('asks coder to state the product promise in one sentence', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    expect(result.toLowerCase()).toContain('product promise');
  });

  it('asks coder to state the primary user action', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    expect(result.toLowerCase()).toContain('primary user action');
  });

  it('asks coder to state the first screen role', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    expect(result.toLowerCase()).toContain('first screen role');
  });

  it('asks coder to define 3–6 screen/section roles itself — not prescribed externally', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    expect(result).toContain('screen/section roles');
    // Must state that roles are coder's own choice, not prescribed from outside
    expect(result.toLowerCase()).toContain('not prescribed');
  });

  it('maps product promise to screens — asks for product-specific purpose per screen', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    expect(result.toLowerCase()).toContain('product-specific purpose');
  });

  it('requires mapping market brief to UI — ties screen purpose to the market brief', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    expect(result.toLowerCase()).toContain('market brief');
  });

  it('requires first viewport clarity check before coding', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    expect(result.toLowerCase()).toContain('first viewport');
  });

  it('asks coder to name UI block/component role per screen', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    expect(result.toLowerCase()).toContain('ui block/component role');
  });

  it('includes visible differentiator from the brief', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    expect(result.toLowerCase()).toContain('differentiator');
  });
});

// ── Product Assembly Plan — component/material inventory rules ────────────────

describe('buildBuilderOwnedSelfPlanInstructions — component inventory rules', () => {
  it('directs coder to use skeleton primitive catalog when available', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    // Should say to choose from available catalog
    expect(result.toLowerCase()).toContain('ui primitive');
    expect(result.toLowerCase()).toContain('choose');
  });

  it('allows coder to define own block roles when no inventory exists', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    // Fallback: if no inventory, coder defines and implements locally
    expect(result.toLowerCase()).toContain('define');
    expect(result.toLowerCase()).toContain('implement');
  });

  it('prohibits referencing absent components (root cause of run-2 failure)', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    // Must say never to reference a component absent from catalog and not self-implemented
    expect(result.toLowerCase()).toContain('never reference');
  });

  it('does NOT list a fixed external component set by name in the self-plan block', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    // The self-plan block must not hardcode product-type-specific component names
    // like "KPICard", "SidebarNav", "DataTable" etc.
    expect(result).not.toContain('KPICard');
    expect(result).not.toContain('SidebarNav');
    expect(result).not.toContain('DataTable');
    expect(result).not.toContain('BottomSheet');
  });
});

// ── Architecture ownership — coder owns, architect provides strategy only ──────

describe('buildBuilderOwnedSelfPlanInstructions — architecture ownership', () => {
  it('states that runArchitect provides product strategy and pipeline scaffolding only', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    expect(result.toLowerCase()).toContain('product strategy');
    expect(result.toLowerCase()).toContain('pipeline scaffolding');
  });

  it('states that coder owns final app architecture', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    expect(result).toContain('YOU own');
  });

  it('states that coder owns screen composition', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    expect(result.toLowerCase()).toContain('screen composition');
  });

  it('states that coder owns component choices', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    expect(result.toLowerCase()).toContain('component choices');
  });

  it('states that coder owns implementation', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    expect(result.toLowerCase()).toContain('implementation');
  });

  it('tells coder not to wait for architect to define component hierarchy', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    expect(result.toLowerCase()).toContain('do not wait for architect');
  });

  it('frames deltaFiles as a scaffold, not final authority', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    expect(result.toLowerCase()).toContain('scaffold');
  });
});

// ── Self-test checklist — still present and tied to plan ─────────────────────

describe('buildBuilderOwnedSelfPlanInstructions — self-test checklist', () => {
  it('self-test verifies Product Assembly Plan was written and implemented', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    expect(result).toContain('Product Assembly Plan was written');
  });

  it('self-test verifies imports resolve (prevent run-2 failure mode)', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    expect(result.toLowerCase()).toContain('imports');
    expect(result.toLowerCase()).toContain('resolve');
  });

  it(`self-test has exactly ${SELF_PLAN_SELF_TEST_ITEMS} checkpoints (constant unchanged)`, () => {
    const result = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    const checkpoints = (result.match(/✓/g) ?? []).length;
    expect(checkpoints).toBe(SELF_PLAN_SELF_TEST_ITEMS);
  });

  it('self-test checklist length matches SELF_PLAN_SELF_TEST_ITEMS constant', () => {
    const result = buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF);
    const checkpoints = (result.match(/✓/g) ?? []).length;
    expect(checkpoints).toBe(SELF_PLAN_SELF_TEST_ITEMS);
  });
});

// ── Trend direct-launch: coder prompt composition ─────────────────────────────

describe('buildCoderPlanningBlocks — trend direct-launch includes Product Assembly Plan', () => {
  it('includes Product Assembly Plan when market-aware brief is passed', () => {
    const result = buildCoderPlanningBlocks({
      marketAwareBuilderBrief: DASHBOARD_BRIEF,
    });
    expect(result).toContain('PRODUCT ASSEMBLY PLAN');
  });

  it('prompt requires coder to choose its own screen/section roles', () => {
    const result = buildCoderPlanningBlocks({
      marketAwareBuilderBrief: DASHBOARD_BRIEF,
    });
    expect(result).toContain('screen/section roles');
    expect(result.toLowerCase()).toContain('not prescribed');
  });

  it('prompt maps market-aware brief context to UI via screen purpose', () => {
    const result = buildCoderPlanningBlocks({
      marketAwareBuilderBrief: DASHBOARD_BRIEF,
    });
    // Market brief is injected AND plan requires tying screen purpose to it
    expect(result).toContain('MARKET-AWARE BUILDER BRIEF');
    expect(result.toLowerCase()).toContain('product-specific purpose');
    expect(result.toLowerCase()).toContain('market brief');
  });

  it('prompt does not prescribe a fixed external component list', () => {
    const result = buildCoderPlanningBlocks({
      marketAwareBuilderBrief: DASHBOARD_BRIEF,
    });
    // No product-type-specific component names hardcoded in planning blocks
    expect(result).not.toContain('KPICard');
    expect(result).not.toContain('MetricTile');
    expect(result).not.toContain('SidebarNav');
  });

  it('prompt states coder owns architecture and implementation', () => {
    const result = buildCoderPlanningBlocks({
      marketAwareBuilderBrief: DASHBOARD_BRIEF,
    });
    expect(result).toContain('YOU own');
    expect(result.toLowerCase()).toContain('implementation');
  });

  it('includes the full self-plan instructions block verbatim', () => {
    const selfPlanBlock = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    const result = buildCoderPlanningBlocks({
      marketAwareBuilderBrief: DASHBOARD_BRIEF,
    });
    expect(result).toContain(selfPlanBlock);
  });

  it('health app brief also receives Product Assembly Plan block', () => {
    const result = buildCoderPlanningBlocks({
      marketAwareBuilderBrief: HEALTH_BRIEF,
    });
    expect(result).toContain('PRODUCT ASSEMBLY PLAN');
    expect(result).toContain('YOU own');
  });
});

// ── runArchitect — still present and downscoped ───────────────────────────────

describe('runArchitect — still present and downscoped (not bypassed)', () => {
  it('buildArchitectProductStrategistRole is still exported (runArchitect not removed)', () => {
    expect(typeof buildArchitectProductStrategistRole).toBe('function');
  });

  it('architect role still declares it is NOT the final technical architect', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('not the final technical architect');
  });

  it('architect role still instructs builder/coder owns architecture', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('builder/coder owns architecture');
  });

  it('architect role is consistent with coder self-plan ownership claim', () => {
    const role = buildArchitectProductStrategistRole();
    const selfPlan = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    // Both must agree: architect does not override builder-owned responsibility
    expect(role.toLowerCase()).toContain('builder-owned self-plan');
    expect(selfPlan).toContain('ARCHITECTURE OWNERSHIP');
  });

  it('ProtoPipeline module is still loadable and exports buildCoderPlanningBlocks', async () => {
    const pipeline = await import('../ProtoPipeline');
    expect(typeof pipeline.buildCoderPlanningBlocks).toBe('function');
    expect(typeof pipeline.buildArchitectProductStrategistRole).toBe('function');
  });
});

// ── Determinism — outputs are stable for testing ─────────────────────────────

describe('buildBuilderOwnedSelfPlanInstructions — determinism', () => {
  it('returns identical string on repeated calls (no randomness)', () => {
    const a = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    const b = buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF);
    expect(a).toBe(b);
  });

  it('is non-empty for dashboard brief', () => {
    expect(buildBuilderOwnedSelfPlanInstructions(DASHBOARD_BRIEF).length).toBeGreaterThan(200);
  });

  it('is non-empty for health brief', () => {
    expect(buildBuilderOwnedSelfPlanInstructions(HEALTH_BRIEF).length).toBeGreaterThan(200);
  });
});
