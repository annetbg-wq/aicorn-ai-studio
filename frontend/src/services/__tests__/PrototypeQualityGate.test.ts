// @vitest-environment jsdom
/**
 * Unit tests for evaluatePrototypeQualityGate — deterministic helper, no LLM calls.
 */
import { describe, expect, it } from 'vitest';
import {
  evaluatePrototypeQualityGate,
  type PrototypeQualityGateInput,
  type VisualUsageDiagnostics,
} from '../ProtoPipeline';
import type { DesignViolation } from '../DesignContract';
import type { ProductSpecificityDiagnostics } from '../ProductSpecificityPlanner';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function validVisualDiagnostics(): VisualUsageDiagnostics {
  return {
    premiumUsageChecked: true,
    premiumComponentsSelected: ['wellness-hero'],
    premiumComponentImportsFound: ["pages/Home.tsx: @/design-pack/premium-components/health/wellness-hero/component"],
    premiumUsageCount: 1,
    premiumUsageObserved: true,
    mediaUsageChecked: true,
    mediaAssetsMaterialized: ['src/assets/generated/landing-hero.svg'],
    mediaAssetReferencesFound: ['App.tsx: src/assets/generated/landing-hero.svg'],
    mediaUsageCount: 1,
    mediaUsageObserved: true,
    firstScreenFilesChecked: ['App.tsx'],
    firstScreenPremiumUsageObserved: true,
    firstScreenMediaUsageObserved: true,
    meaningfulScreenFiles: ['App.tsx', 'pages/Dashboard.tsx'],
    meaningfulScreenCount: 2,
    genericPlaceholderFindings: [],
    visualUsageNotes: [],
    suggestedNextAction: 'none',
  };
}

function validSpecificityDiagnostics(): ProductSpecificityDiagnostics {
  return {
    specificityDiagnosticsChecked: true,
    genericPlaceholderFindings: [],
    vagueCopyFindings: [],
    emptyMetricFindings: [],
    domainEntitySignals: ['Patient', 'Appointment'],
    productActionSignals: ['Book Appointment', 'View History'],
    productMetricSignals: ['Active Patients Today'],
    screenSpecificityWarnings: [],
    domainEntitySignalCount: 2,
    productActionSignalCount: 2,
    productMetricSignalCount: 1,
    specificityScore: 85,
    suggestedNextAction: 'none',
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('evaluatePrototypeQualityGate', () => {
  it('returns ok=true when all signals are clean', () => {
    const result = evaluatePrototypeQualityGate({
      designContractViolations: [],
      visualUsageDiagnostics: validVisualDiagnostics(),
      productSpecificityDiagnostics: validSpecificityDiagnostics(),
    });

    expect(result.ok).toBe(true);
    expect(result.blockingReasons).toHaveLength(0);
    expect(result.repairInstructions).toHaveLength(0);
    expect(result.telemetry.checks_run).toEqual(
      expect.arrayContaining(['design_contract', 'visual_usage', 'product_specificity']),
    );
    expect(result.telemetry.design_contract_violations).toBe(0);
    expect(result.telemetry.premium_selected_not_used).toBe(false);
    expect(result.telemetry.media_materialized_not_used).toBe(false);
    expect(result.telemetry.generic_placeholder_count).toBe(0);
    expect(result.telemetry.generic_dashboard_card_flag).toBe(false);
    expect(result.telemetry.specificity_score).toBe(85);
  });

  it('fails when raw design token violations are present', () => {
    const violations: DesignViolation[] = [
      { path: 'pages/Home.tsx', rule: 'no-raw-hex', example: 'className="#0ea5e9"', line: 12 },
      { path: 'pages/Home.tsx', rule: 'no-tailwind-palette', example: 'className="bg-blue-500"', line: 22 },
    ];

    const result = evaluatePrototypeQualityGate({
      designContractViolations: violations,
      visualUsageDiagnostics: validVisualDiagnostics(),
      productSpecificityDiagnostics: validSpecificityDiagnostics(),
    });

    expect(result.ok).toBe(false);
    expect(result.blockingReasons).toHaveLength(1);
    expect(result.blockingReasons[0]).toMatch(/Design contract.*2.*violation/i);
    expect(result.blockingReasons[0]).toMatch(/no-raw-hex/);
    expect(result.repairInstructions).toHaveLength(1);
    expect(result.repairInstructions[0]).toMatch(/semantic tokens/i);
    expect(result.telemetry.design_contract_violations).toBe(2);
  });

  it('premium-unused is advisory only — ok=true, no blocking reason', () => {
    const vud = validVisualDiagnostics();
    vud.premiumUsageObserved = false;
    vud.premiumComponentImportsFound = [];
    vud.premiumUsageCount = 0;
    vud.firstScreenPremiumUsageObserved = false;
    vud.suggestedNextAction = 'improve_prompt';

    const result = evaluatePrototypeQualityGate({
      designContractViolations: [],
      visualUsageDiagnostics: vud,
      productSpecificityDiagnostics: validSpecificityDiagnostics(),
    });

    // Advisory only — no repair hook available; gate must not block
    expect(result.ok).toBe(true);
    expect(result.blockingReasons).toHaveLength(0);
    expect(result.repairInstructions).toHaveLength(0);
    expect(result.advisoryReasons.some(r => /premium.*selected.*none.*referenced/i.test(r))).toBe(true);
    expect(result.advisoryInstructions.some(r => r.includes('@/design-pack/premium-components/'))).toBe(true);
    expect(result.telemetry.premium_selected_not_used).toBe(true);
    expect(result.telemetry.advisory_reasons_count).toBe(1);
    expect(result.telemetry.repair_hook_available).toBe(false);
  });

  it('media-unused is advisory only — ok=true, no blocking reason', () => {
    const vud = validVisualDiagnostics();
    vud.mediaUsageObserved = false;
    vud.mediaAssetReferencesFound = [];
    vud.mediaUsageCount = 0;
    vud.firstScreenMediaUsageObserved = false;
    vud.suggestedNextAction = 'improve_prompt';

    const result = evaluatePrototypeQualityGate({
      designContractViolations: [],
      visualUsageDiagnostics: vud,
      productSpecificityDiagnostics: validSpecificityDiagnostics(),
    });

    // Advisory only — no repair hook available; gate must not block
    expect(result.ok).toBe(true);
    expect(result.blockingReasons).toHaveLength(0);
    expect(result.repairInstructions).toHaveLength(0);
    expect(result.advisoryReasons.some(r => /media.*materialized.*none.*referenced/i.test(r))).toBe(true);
    expect(result.advisoryInstructions.some(r => /import.*media asset/i.test(r))).toBe(true);
    expect(result.telemetry.media_materialized_not_used).toBe(true);
    expect(result.telemetry.advisory_reasons_count).toBe(1);
    expect(result.telemetry.repair_hook_available).toBe(false);
  });

  it('fails when generic placeholder content is present (Feature 1, AppName, Lorem ipsum, Untitled)', () => {
    const vud = validVisualDiagnostics();
    vud.genericPlaceholderFindings = [
      'App.tsx: Feature 1',
      'App.tsx: AppName',
      'pages/Home.tsx: Lorem',
      'pages/Home.tsx: Untitled',
    ];
    vud.suggestedNextAction = 'add_repair_later';

    const result = evaluatePrototypeQualityGate({
      designContractViolations: [],
      visualUsageDiagnostics: vud,
      productSpecificityDiagnostics: validSpecificityDiagnostics(),
    });

    expect(result.ok).toBe(false);
    expect(result.blockingReasons.some(r => /generic placeholder/i.test(r))).toBe(true);
    expect(result.repairInstructions.some(r => /Feature 1/i.test(r))).toBe(true);
    expect(result.telemetry.generic_placeholder_count).toBeGreaterThan(0);
  });

  it('fails when specificity diagnostics detect Item 1 / KPI 1 numbered placeholder slots', () => {
    const psd = validSpecificityDiagnostics();
    psd.genericPlaceholderFindings = [
      'pages/Dashboard.tsx: KPI 1',
      'pages/Dashboard.tsx: Item 1',
      'pages/Dashboard.tsx: Metric 2',
    ];
    psd.suggestedNextAction = 'add_repair_later';

    const result = evaluatePrototypeQualityGate({
      designContractViolations: [],
      visualUsageDiagnostics: validVisualDiagnostics(),
      productSpecificityDiagnostics: psd,
    });

    expect(result.ok).toBe(false);
    expect(result.blockingReasons.some(r => /Item 1|KPI 1|numbered metric/i.test(r))).toBe(true);
    expect(result.repairInstructions.some(r => /KPI 1|Item 1|domain-specific/i.test(r))).toBe(true);
  });

  it('fails and produces repair instructions for empty dashboard metric cards', () => {
    const psd = validSpecificityDiagnostics();
    psd.emptyMetricFindings = [
      'pages/Dashboard.tsx: empty KPI slot 1',
      'pages/Dashboard.tsx: empty KPI slot 2',
    ];
    psd.suggestedNextAction = 'add_repair_later';

    const result = evaluatePrototypeQualityGate({
      designContractViolations: [],
      visualUsageDiagnostics: validVisualDiagnostics(),
      productSpecificityDiagnostics: psd,
    });

    expect(result.ok).toBe(false);
    expect(result.blockingReasons.some(r => /empty.*metric card|dashboard metric/i.test(r))).toBe(true);
    expect(result.repairInstructions.some(r => /ProductSpecificityPlan|domain-specific metrics/i.test(r))).toBe(true);
    expect(result.telemetry.generic_dashboard_card_flag).toBe(true);
  });

  it('produces one repairInstruction per blocking reason; advisory reasons stay separate', () => {
    const vud = validVisualDiagnostics();
    vud.premiumUsageObserved = false;
    vud.premiumComponentImportsFound = [];
    vud.mediaUsageObserved = false;
    vud.mediaAssetReferencesFound = [];

    const result = evaluatePrototypeQualityGate({
      designContractViolations: [
        { path: 'App.tsx', rule: 'no-raw-hex', example: '#fff', line: 1 },
      ],
      visualUsageDiagnostics: vud,
    });

    expect(result.ok).toBe(false);
    // 1 blocking (design token) + 1 repair instruction
    expect(result.repairInstructions.length).toBe(result.blockingReasons.length);
    expect(result.blockingReasons).toHaveLength(1);
    // premium + media go to advisory (repair hook not available)
    expect(result.advisoryReasons).toHaveLength(2);
    expect(result.advisoryInstructions).toHaveLength(2);
    expect(result.telemetry.advisory_reasons_count).toBe(2);
    // All instructions are non-empty strings
    for (const instruction of result.repairInstructions) {
      expect(typeof instruction).toBe('string');
      expect(instruction.length).toBeGreaterThan(10);
    }
  });

  it('returns ok=true and empty arrays when no inputs are provided (graceful no-op)', () => {
    const result = evaluatePrototypeQualityGate({});

    expect(result.ok).toBe(true);
    expect(result.blockingReasons).toHaveLength(0);
    expect(result.repairInstructions).toHaveLength(0);
    expect(result.telemetry.checks_run).toHaveLength(0);
    expect(result.telemetry.specificity_score).toBeNull();
  });

  it('skips premium/media checks when visualUsageDiagnostics is not provided', () => {
    const result = evaluatePrototypeQualityGate({
      designContractViolations: [],
    });

    expect(result.telemetry.premium_selected_not_used).toBe(false);
    expect(result.telemetry.media_materialized_not_used).toBe(false);
    expect(result.telemetry.checks_run).not.toContain('visual_usage');
  });

  it('returns telemetry with correct specificity_score when provided', () => {
    const psd = validSpecificityDiagnostics();
    psd.specificityScore = 42;

    const result = evaluatePrototypeQualityGate({
      productSpecificityDiagnostics: psd,
    });

    expect(result.telemetry.specificity_score).toBe(42);
    expect(result.telemetry.checks_run).toContain('product_specificity');
  });

  it('hard-blocks design token violation — no repair attempt (repair_hook_available=false)', () => {
    const violations: DesignViolation[] = [
      { path: 'pages/Landing.tsx', rule: 'no-raw-hex', example: '#2563eb', line: 5 },
    ];

    const result = evaluatePrototypeQualityGate({
      designContractViolations: violations,
      visualUsageDiagnostics: validVisualDiagnostics(),
      productSpecificityDiagnostics: validSpecificityDiagnostics(),
    });

    expect(result.ok).toBe(false);
    expect(result.blockingReasons).toHaveLength(1);
    expect(result.blockingReasons[0]).toMatch(/Design contract/i);
    expect(result.repairInstructions[0]).toMatch(/semantic tokens/i);
    expect(result.telemetry.repair_hook_available).toBe(false);
    // Advisory arrays must be empty (no advisory issues in this fixture)
    expect(result.advisoryReasons).toHaveLength(0);
  });

  it('hard-blocks generic placeholder — no repair attempt (repair_hook_available=false)', () => {
    const vud = validVisualDiagnostics();
    vud.genericPlaceholderFindings = ['App.tsx: Feature 1', 'pages/Home.tsx: AppName'];

    const result = evaluatePrototypeQualityGate({
      designContractViolations: [],
      visualUsageDiagnostics: vud,
      productSpecificityDiagnostics: validSpecificityDiagnostics(),
    });

    expect(result.ok).toBe(false);
    expect(result.blockingReasons.some(r => /generic placeholder/i.test(r))).toBe(true);
    expect(result.repairInstructions.some(r => /Feature 1/i.test(r))).toBe(true);
    expect(result.telemetry.repair_hook_available).toBe(false);
    expect(result.advisoryReasons).toHaveLength(0);
  });

  it('advisory premium+media together: ok=true, advisory_reasons_count=2', () => {
    const vud = validVisualDiagnostics();
    vud.premiumUsageObserved = false;
    vud.premiumComponentImportsFound = [];
    vud.mediaUsageObserved = false;
    vud.mediaAssetReferencesFound = [];

    const result = evaluatePrototypeQualityGate({
      designContractViolations: [],
      visualUsageDiagnostics: vud,
      productSpecificityDiagnostics: validSpecificityDiagnostics(),
    });

    expect(result.ok).toBe(true);
    expect(result.blockingReasons).toHaveLength(0);
    expect(result.advisoryReasons).toHaveLength(2);
    expect(result.advisoryInstructions).toHaveLength(2);
    expect(result.telemetry.advisory_reasons_count).toBe(2);
    expect(result.telemetry.premium_selected_not_used).toBe(true);
    expect(result.telemetry.media_materialized_not_used).toBe(true);
    expect(result.telemetry.repair_hook_available).toBe(false);
  });

  it('valid output has empty advisoryReasons and advisoryInstructions', () => {
    const result = evaluatePrototypeQualityGate({
      designContractViolations: [],
      visualUsageDiagnostics: validVisualDiagnostics(),
      productSpecificityDiagnostics: validSpecificityDiagnostics(),
    });

    expect(result.ok).toBe(true);
    expect(result.advisoryReasons).toHaveLength(0);
    expect(result.advisoryInstructions).toHaveLength(0);
    expect(result.telemetry.advisory_reasons_count).toBe(0);
    expect(result.telemetry.repair_hook_available).toBe(false);
  });
});
