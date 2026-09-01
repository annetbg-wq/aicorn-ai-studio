import { describe, expect, it } from 'vitest';
import { evaluatePrototypeQualityGate, type VisualUsageDiagnostics } from '../ProtoPipeline';
import type { ProductSpecificityDiagnostics } from '../ProductSpecificityPlanner';
import type { AppFirstQualityGateResult } from '../AppFirstQualityGate';

function visual(): VisualUsageDiagnostics {
  return {
    premiumUsageChecked: false,
    premiumComponentsSelected: [],
    premiumComponentImportsFound: [],
    premiumUsageCount: 0,
    premiumUsageObserved: false,
    mediaUsageChecked: false,
    mediaAssetsMaterialized: [],
    mediaAssetReferencesFound: [],
    mediaUsageCount: 0,
    mediaUsageObserved: false,
    firstScreenFilesChecked: ['pages/Home.tsx'],
    firstScreenPremiumUsageObserved: false,
    firstScreenMediaUsageObserved: false,
    meaningfulScreenFiles: ['pages/Home.tsx', 'pages/Create.tsx', 'pages/Progress.tsx', 'pages/Profile.tsx'],
    meaningfulScreenCount: 4,
    genericPlaceholderFindings: [],
    identitySlotFindings: [],
    repairableMissingIdentityPaths: [],
    visualUsageNotes: [],
    suggestedNextAction: 'none',
  };
}

function specificity(emptyMetricFindings: string[] = []): ProductSpecificityDiagnostics {
  return {
    specificityDiagnosticsChecked: true,
    genericPlaceholderFindings: [],
    vagueCopyFindings: [],
    emptyMetricFindings,
    domainEntitySignals: ['Entry'],
    productActionSignals: ['Create entry'],
    productMetricSignals: [],
    screenSpecificityWarnings: [],
    domainEntitySignalCount: 1,
    productActionSignalCount: 1,
    productMetricSignalCount: 0,
    specificityScore: 70,
    suggestedNextAction: emptyMetricFindings.length ? 'add_repair_later' : 'none',
  };
}

function appFirst(overrides: Partial<AppFirstQualityGateResult> = {}): AppFirstQualityGateResult {
  return {
    ok: true,
    blockingReasons: [],
    repairInstructions: [],
    advisoryReasons: [],
    telemetry: {
      profile: 'mobile-app',
      checked: true,
      meaningful_screen_count: 5,
      minimum_meaningful_screens: 4,
      planned_screen_count: 5,
      missing_planned_screens: [],
      route_target_count: 6,
      navigation_target_count: 4,
      connected_screen_count: 5,
      orphan_screen_count: 0,
      data_file_count: 2,
      data_consumer_screen_count: 3,
      non_empty_action_handler_count: 4,
      functional_flow_coverage_ratio: 0.75,
      implemented_flow_count: 3,
      planned_flow_count: 4,
      empty_handler_count: 0,
    },
    ...overrides,
  };
}

describe('app-first profile in evaluatePrototypeQualityGate', () => {
  it('promotes mobile app-first failures to hard release blockers', () => {
    const result = evaluatePrototypeQualityGate({
      skeletonId: 'mobile-app',
      designContractViolations: [],
      visualUsageDiagnostics: visual(),
      productSpecificityDiagnostics: specificity(),
      appFirstQualityDiagnostics: appFirst({
        ok: false,
        blockingReasons: ['Mobile actions are insufficient: handlers=1, implemented flow coverage=25%.'],
        repairInstructions: ['Implement the core FunctionalFlowPlan with real local actions.'],
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.blockingReasons.some(reason => /Mobile actions are insufficient/i.test(reason))).toBe(true);
    expect(result.repairInstructions.some(instruction => /FunctionalFlowPlan/i.test(instruction))).toBe(true);
    expect(result.telemetry.checks_run).toContain('app_first_mobile');
    expect(result.telemetry.quality_profile).toBe('mobile-app');
    expect(result.telemetry.app_first_quality_gate?.checked).toBe(true);
  });

  it('does not apply landing/dashboard metric-card blockers to a passing mobile app', () => {
    const result = evaluatePrototypeQualityGate({
      skeletonId: 'mobile-app',
      designContractViolations: [],
      visualUsageDiagnostics: visual(),
      productSpecificityDiagnostics: specificity(['pages/Home.tsx: empty KPI slot']),
      appFirstQualityDiagnostics: appFirst(),
    });

    expect(result.ok).toBe(true);
    expect(result.blockingReasons.some(reason => /dashboard metric/i.test(reason))).toBe(false);
    expect(result.telemetry.generic_dashboard_card_flag).toBe(false);
  });

  it('keeps existing landing quality behavior intact', () => {
    const result = evaluatePrototypeQualityGate({
      skeletonId: 'landing-page',
      designContractViolations: [],
      visualUsageDiagnostics: visual(),
      productSpecificityDiagnostics: specificity(['src/data/content.ts: empty KPI slot']),
    });

    expect(result.ok).toBe(false);
    expect(result.blockingReasons.some(reason => /dashboard metric/i.test(reason))).toBe(true);
    expect(result.telemetry.quality_profile).toBe('landing-page');
    expect(result.telemetry.checks_run).not.toContain('app_first_mobile');
  });
});
