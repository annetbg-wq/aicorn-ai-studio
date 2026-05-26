// @vitest-environment jsdom
/**
 * CoderProductIdentitySubstitution — deterministic tests for the mandatory
 * Product Identity Substitution Contract in the coder prompt.
 *
 * Problem addressed (from cashflow-guard-after-skeleton-contract.md):
 *   SkeletonContractForCoder succeeded but generic B2B boilerplate remained in
 *   page titles, KPI labels, data model labels, and copy because the coder was
 *   not explicitly instructed to replace skeleton-default business language with
 *   product-specific equivalents.
 *
 * What this test suite verifies:
 *   - buildProductIdentitySubstitutionContract returns the contract text.
 *   - Contract states skeleton defaults are structural placeholders only.
 *   - Contract requires page titles / KPIs / copy from Product Assembly Plan.
 *   - Contract requires first viewport product identity clarity.
 *   - Contract forbids generic skeleton labels unless product-appropriate.
 *   - Contract requires a self-check before final output.
 *   - Contract is generic (not Cashflow Guard-only).
 *   - buildCoderPlanningBlocks includes the contract when brief is present.
 *   - buildCoderPlanningBlocks keeps Product Assembly Plan instructions.
 *   - buildCoderPlanningBlocks keeps skeleton contract instructions.
 *   - CODER_MAX_TOKENS is unchanged (35 000) — fix targets input, not output.
 *   - No real LLM calls in any test.
 *
 * Part of: p2/coder-product-identity-substitution
 */

import { describe, expect, it } from 'vitest';
import {
  buildProductIdentitySubstitutionContract,
  buildMarketAwareBuilderBrief,
  buildBuilderOwnedSelfPlanInstructions,
} from '../MarketAwareBuilderBrief';
import { buildCoderPlanningBlocks, CODER_MAX_TOKENS } from '../ProtoPipeline';

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Cashflow Guard used as an example domain — the contract must generalize.
const CASHFLOW_BRIEF = buildMarketAwareBuilderBrief({
  brief: 'Cashflow Guard — freelancer invoice tracking and cash runway forecasting',
  skeletonId: 'saas-dashboard',
});

// Fitness app — completely different domain to confirm rules are generic.
const FITNESS_BRIEF = buildMarketAwareBuilderBrief({
  brief: 'FitSpark — AI-powered workout planner and recovery tracker for athletes',
  skeletonId: 'mobile-app',
});

// ── Contract text — structural placeholder statement ──────────────────────────

describe('buildProductIdentitySubstitutionContract — structural placeholder statement', () => {
  it('states skeleton defaults are structural placeholders only', () => {
    const contract = buildProductIdentitySubstitutionContract();
    expect(contract.toLowerCase()).toContain('structural placeholder');
  });

  it('says skeleton provides navigation shells, layout patterns, and component wiring', () => {
    const contract = buildProductIdentitySubstitutionContract();
    expect(contract.toLowerCase()).toContain('layout');
    expect(contract.toLowerCase()).toContain('navigation');
  });

  it('says skeleton does NOT define what the product is named or what it measures', () => {
    const contract = buildProductIdentitySubstitutionContract();
    expect(contract).toContain('STRUCTURAL PLACEHOLDERS');
  });
});

// ── Contract text — Product Assembly Plan sourcing requirement ────────────────

describe('buildProductIdentitySubstitutionContract — Product Assembly Plan sourcing', () => {
  it('requires page titles and KPI labels to come from Product Assembly Plan', () => {
    const contract = buildProductIdentitySubstitutionContract();
    expect(contract.toLowerCase()).toContain('product assembly plan');
    expect(contract.toLowerCase()).toContain('page title');
    expect(contract.toLowerCase()).toContain('kpi label');
  });

  it('requires data fields and copy to come from the brief or product promise', () => {
    const contract = buildProductIdentitySubstitutionContract();
    expect(contract.toLowerCase()).toContain('product promise');
  });

  it('lists the authoritative sources: Product Assembly Plan, brief, trend idea, differentiator', () => {
    const contract = buildProductIdentitySubstitutionContract();
    expect(contract.toLowerCase()).toContain('product assembly plan');
    expect(contract.toLowerCase()).toContain('trend idea');
    expect(contract.toLowerCase()).toContain('differentiator');
  });

  it('covers navigation labels, CTA text, empty states, dashboard metrics', () => {
    const contract = buildProductIdentitySubstitutionContract();
    expect(contract.toLowerCase()).toContain('navigation label');
    expect(contract.toLowerCase()).toContain('cta');
    expect(contract.toLowerCase()).toContain('empty');
    expect(contract.toLowerCase()).toContain('dashboard metric');
  });
});

// ── Contract text — first viewport clarity ────────────────────────────────────

describe('buildProductIdentitySubstitutionContract — first viewport product identity', () => {
  it('requires the first viewport to make product identity obvious', () => {
    const contract = buildProductIdentitySubstitutionContract();
    expect(contract.toLowerCase()).toContain('first viewport');
    expect(contract.toLowerCase()).toMatch(/product identity|identify.*product/);
  });

  it('includes explicit self-check question before final output', () => {
    const contract = buildProductIdentitySubstitutionContract();
    expect(contract).toContain('self-check');
    expect(contract.toLowerCase()).toContain('could a user identify');
  });
});

// ── Contract text — forbidden generic labels ──────────────────────────────────

describe('buildProductIdentitySubstitutionContract — forbidden generic labels', () => {
  it('names generic skeleton labels that are forbidden unless product-appropriate', () => {
    const contract = buildProductIdentitySubstitutionContract();
    // Spot-check a representative subset of the forbidden label list
    expect(contract).toContain('Pipeline');
    expect(contract).toContain('Records');
    expect(contract).toContain('Leads');
    expect(contract).toContain('Accounts');
    expect(contract).toContain('Tasks');
  });

  it('includes the "unless clearly appropriate" qualifier (not an absolute ban)', () => {
    const contract = buildProductIdentitySubstitutionContract();
    expect(contract.toLowerCase()).toMatch(/unless.*product|product.*appropriate|justify.*label/);
  });

  it('requires mock records and field names to be domain-authentic', () => {
    const contract = buildProductIdentitySubstitutionContract();
    expect(contract.toLowerCase()).toContain('mock data');
    expect(contract.toLowerCase()).toContain('domain');
  });
});

// ── Contract text — genericity: NOT Cashflow Guard-only ──────────────────────

describe('buildProductIdentitySubstitutionContract — generic, not product-specific', () => {
  it('does not hard-code Cashflow Guard as the only target product', () => {
    const contract = buildProductIdentitySubstitutionContract();
    // Cashflow Guard examples may appear as domain examples but must not be the
    // sole or primary subject of the rules.
    const cashflowCount = (contract.match(/cashflow guard/gi) ?? []).length;
    expect(cashflowCount).toBe(0);
  });

  it('uses "cashflow product" or similar as a generic domain example, not a product name', () => {
    const contract = buildProductIdentitySubstitutionContract();
    // The rules reference "cashflow product" as an example of a domain type,
    // confirming the generalization.
    expect(contract.toLowerCase()).toContain('cashflow product');
  });

  it('also references non-financial domain examples (fitness, booking)', () => {
    const contract = buildProductIdentitySubstitutionContract();
    expect(contract.toLowerCase()).toContain('fitness product');
    expect(contract.toLowerCase()).toContain('booking app');
  });
});

// ── buildCoderPlanningBlocks — contract presence ──────────────────────────────

describe('buildCoderPlanningBlocks — Product Identity Substitution Contract injection', () => {
  it('includes PRODUCT IDENTITY SUBSTITUTION CONTRACT when brief is present', () => {
    const blocks = buildCoderPlanningBlocks({ marketAwareBuilderBrief: CASHFLOW_BRIEF });
    expect(blocks).toContain('PRODUCT IDENTITY SUBSTITUTION CONTRACT');
  });

  it('includes the contract for a non-financial product too', () => {
    const blocks = buildCoderPlanningBlocks({ marketAwareBuilderBrief: FITNESS_BRIEF });
    expect(blocks).toContain('PRODUCT IDENTITY SUBSTITUTION CONTRACT');
  });

  it('does NOT include the contract when no brief is provided', () => {
    const blocks = buildCoderPlanningBlocks({});
    expect(blocks).not.toContain('PRODUCT IDENTITY SUBSTITUTION CONTRACT');
  });
});

// ── buildCoderPlanningBlocks — ordering: contract after brief, before self-plan

describe('buildCoderPlanningBlocks — block ordering', () => {
  it('Product Identity Substitution Contract appears after market-aware brief', () => {
    const blocks = buildCoderPlanningBlocks({ marketAwareBuilderBrief: CASHFLOW_BRIEF });
    const briefIdx = blocks.indexOf('MARKET-AWARE BUILDER BRIEF');
    const contractIdx = blocks.indexOf('PRODUCT IDENTITY SUBSTITUTION CONTRACT');
    expect(briefIdx).toBeGreaterThanOrEqual(0);
    expect(contractIdx).toBeGreaterThan(briefIdx);
  });

  it('Product Identity Substitution Contract appears before self-plan instructions', () => {
    const blocks = buildCoderPlanningBlocks({ marketAwareBuilderBrief: CASHFLOW_BRIEF });
    const contractIdx = blocks.indexOf('PRODUCT IDENTITY SUBSTITUTION CONTRACT');
    const selfPlanIdx = blocks.indexOf('BUILDER-OWNED PRODUCT ASSEMBLY PLAN');
    expect(contractIdx).toBeGreaterThanOrEqual(0);
    expect(selfPlanIdx).toBeGreaterThan(contractIdx);
  });
});

// ── Preserved: Product Assembly Plan instructions ─────────────────────────────

describe('buildCoderPlanningBlocks — Product Assembly Plan preserved', () => {
  it('planning blocks still include PRODUCT ASSEMBLY PLAN header', () => {
    const blocks = buildCoderPlanningBlocks({ marketAwareBuilderBrief: CASHFLOW_BRIEF });
    expect(blocks).toContain('PRODUCT ASSEMBLY PLAN');
  });

  it('Product Assembly Plan still requires writing plan BEFORE code', () => {
    const blocks = buildCoderPlanningBlocks({ marketAwareBuilderBrief: CASHFLOW_BRIEF });
    expect(blocks).toContain('BEFORE WRITING ANY CODE');
  });

  it('Product Assembly Plan is still mandatory (not optional)', () => {
    const selfPlan = buildBuilderOwnedSelfPlanInstructions(CASHFLOW_BRIEF);
    expect(selfPlan.toLowerCase()).toContain('mandatory');
  });

  it('Product Assembly Plan self-test checklist still present', () => {
    const blocks = buildCoderPlanningBlocks({ marketAwareBuilderBrief: CASHFLOW_BRIEF });
    expect(blocks).toContain('SELF-TEST BEFORE FINAL ANSWER');
  });
});

// ── Preserved: skeleton contract instructions ─────────────────────────────────

describe('buildCoderPlanningBlocks — skeleton contract instructions preserved', () => {
  it('market-aware brief still includes FORBIDDEN PLACEHOLDER TEXT section', () => {
    const blocks = buildCoderPlanningBlocks({ marketAwareBuilderBrief: CASHFLOW_BRIEF });
    expect(blocks).toContain('FORBIDDEN PLACEHOLDER TEXT');
  });

  it('architecture ownership instruction (coder owns arch) still present', () => {
    const blocks = buildCoderPlanningBlocks({ marketAwareBuilderBrief: CASHFLOW_BRIEF });
    expect(blocks.toLowerCase()).toMatch(/architect.*own|own.*architect|architecture ownership/i);
  });
});

// ── CODER_MAX_TOKENS unchanged ────────────────────────────────────────────────

describe('CODER_MAX_TOKENS — output budget unchanged after product identity fix', () => {
  it('CODER_MAX_TOKENS is still 35 000', () => {
    expect(CODER_MAX_TOKENS).toBe(35_000);
  });

  it('CODER_MAX_TOKENS was not lowered as part of product-identity-substitution fix', () => {
    // The fix adds a ~1 000-char INPUT block to the prompt; it does not change the OUTPUT budget.
    expect(CODER_MAX_TOKENS).toBeGreaterThanOrEqual(35_000);
  });
});
