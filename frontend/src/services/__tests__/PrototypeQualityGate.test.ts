// @vitest-environment jsdom
/**
 * Unit tests for evaluatePrototypeQualityGate — deterministic helper, no LLM calls.
 * Unit tests for runQualityRepair — LLM call mocked via stubGlobal('fetch').
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  evaluatePrototypeQualityGate,
  runQualityRepair,
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

  it('premium-unused now fails gate (blocking) with repairInstruction', () => {
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

    // Now blocking — gate must fail
    expect(result.ok).toBe(false);
    expect(result.blockingReasons.some(r => /premium.*selected.*none.*referenced/i.test(r))).toBe(true);
    expect(result.repairInstructions.some(r => r.includes('@/design-pack/premium-components/'))).toBe(true);
    expect(result.telemetry.premium_selected_not_used).toBe(true);
    expect(result.advisoryReasons).toHaveLength(0);
    expect(result.telemetry.advisory_reasons_count).toBe(0);
    expect(result.telemetry.repair_hook_available).toBe(true);
  });

  it('media-unused now fails gate (blocking) with repairInstruction', () => {
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

    // Now blocking — gate must fail
    expect(result.ok).toBe(false);
    expect(result.blockingReasons.some(r => /media.*materialized.*none.*referenced/i.test(r))).toBe(true);
    expect(result.repairInstructions.some(r => /hero|feature|empty.state/i.test(r))).toBe(true);
    expect(result.telemetry.media_materialized_not_used).toBe(true);
    expect(result.advisoryReasons).toHaveLength(0);
    expect(result.telemetry.advisory_reasons_count).toBe(0);
    expect(result.telemetry.repair_hook_available).toBe(true);
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

  it('produces repairInstructions for every blocking reason including premium+media', () => {
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
    // 3 blocking reasons: design token + premium-unused + media-unused
    expect(result.blockingReasons).toHaveLength(3);
    expect(result.repairInstructions.length).toBe(result.blockingReasons.length);
    // No advisory since premium+media are now blocking
    expect(result.advisoryReasons).toHaveLength(0);
    expect(result.advisoryInstructions).toHaveLength(0);
    expect(result.telemetry.advisory_reasons_count).toBe(0);
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

  it('hard-blocks design token violation — repair attempt delegated to runQualityRepair (repair_hook_available=true)', () => {
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
    expect(result.telemetry.repair_hook_available).toBe(true);
    // Advisory arrays must be empty (no advisory issues in this fixture)
    expect(result.advisoryReasons).toHaveLength(0);
  });

  it('hard-blocks generic placeholder — repair attempt delegated to runQualityRepair (repair_hook_available=true)', () => {
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
    expect(result.telemetry.repair_hook_available).toBe(true);
    expect(result.advisoryReasons).toHaveLength(0);
  });

  it('premium+media both unused: ok=false, 2 blocking reasons, 0 advisory', () => {
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

    expect(result.ok).toBe(false);
    expect(result.blockingReasons).toHaveLength(2);
    expect(result.repairInstructions).toHaveLength(2);
    expect(result.advisoryReasons).toHaveLength(0);
    expect(result.advisoryInstructions).toHaveLength(0);
    expect(result.telemetry.advisory_reasons_count).toBe(0);
    expect(result.telemetry.premium_selected_not_used).toBe(true);
    expect(result.telemetry.media_materialized_not_used).toBe(true);
    expect(result.telemetry.repair_hook_available).toBe(true);
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
    expect(result.telemetry.repair_hook_available).toBe(true);
  });
});

// ── runQualityRepair tests ─────────────────────────────────────────────────────
//
// The LLM call inside runQualityRepair is mocked via vi.stubGlobal('fetch').
// streamCall uses fetch('/api/quality/llm-run', ...) when provider='claude-cli',
// so we control the response fully without any real network traffic.

/** Build a minimal claude-cli response with FILE/END markers. */
function mockLlmResponse(fileMap: Record<string, string>) {
  const content = Object.entries(fileMap)
    .map(([path, body]) => `<<<FILE: ${path}>>>\n${body}\n<<<END>>>`)
    .join('\n\n');
  return JSON.stringify({ output_text: content, finish_reason: 'stop' });
}

/** routeOverrides that bypass ConfigService and use the fetch mock. */
const TEST_ROUTE_OVERRIDES = {
  fix: {
    modelId:  'test-model',
    endpoint: 'https://test.example.com/api',
    apiKey:   'test-key',
    provider: 'claude-cli',
  },
} as const;

/** Minimal current files with a blocking placeholder. */
function filesWithPlaceholder(): Record<string, string> {
  return {
    'pages/App.tsx':
      'export default function App() { return <div><h1>Feature 1</h1></div>; }',
    'pages/Dashboard.tsx':
      'export default function Dashboard() { return <div>AppName Dashboard</div>; }',
  };
}

describe('runQualityRepair', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns merged files with LLM patches applied (exactly one LLM call)', async () => {
    const repairedApp = 'export default function App() { return <div><h1>Active Patients</h1></div>; }';
    mockFetch.mockResolvedValue({
      ok:   true,
      text: async () => mockLlmResponse({ 'pages/App.tsx': repairedApp }),
    });

    const result = await runQualityRepair({
      prompt:             'Healthcare patient management app',
      skeletonId:         'mobile-app',
      currentFiles:       filesWithPlaceholder(),
      blockingReasons:    ['Generic placeholder content: Feature 1'],
      repairInstructions: ['Replace Feature 1 with product-specific copy'],
      routeOverrides:     TEST_ROUTE_OVERRIDES,
      onLog:              () => {},
    });

    // One LLM call — no loops
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Patch applied (parser adds trailing \n — trim for comparison)
    expect(result['pages/App.tsx'].trimEnd()).toBe(repairedApp);
    // Non-patched file preserved
    expect(result['pages/Dashboard.tsx']).toContain('AppName');
  });

  it('re-evaluated gate passes when repaired files contain no blocking patterns', async () => {
    const cleanApp = 'export default function App() { return <div><h1>Patient List</h1></div>; }';
    const cleanDash = 'export default function Dashboard() { return <div>HealthTrack Dashboard</div>; }';
    mockFetch.mockResolvedValue({
      ok:   true,
      text: async () => mockLlmResponse({ 'pages/App.tsx': cleanApp, 'pages/Dashboard.tsx': cleanDash }),
    });

    const repairedFiles = await runQualityRepair({
      prompt:             'Healthcare patient management app',
      skeletonId:         'mobile-app',
      currentFiles:       filesWithPlaceholder(),
      blockingReasons:    ['Generic placeholder: Feature 1, AppName'],
      repairInstructions: ['Replace placeholders with product-specific copy'],
      routeOverrides:     TEST_ROUTE_OVERRIDES,
      onLog:              () => {},
    });

    // Verify repaired files no longer trigger the gate
    const vud: VisualUsageDiagnostics = {
      premiumUsageChecked: false, premiumComponentsSelected: [],
      premiumComponentImportsFound: [], premiumUsageCount: 0, premiumUsageObserved: false,
      mediaUsageChecked: false, mediaAssetsMaterialized: [], mediaAssetReferencesFound: [],
      mediaUsageCount: 0, mediaUsageObserved: false,
      firstScreenFilesChecked: [], firstScreenPremiumUsageObserved: false, firstScreenMediaUsageObserved: false,
      meaningfulScreenFiles: [], meaningfulScreenCount: 0,
      genericPlaceholderFindings: [], visualUsageNotes: [], suggestedNextAction: 'none',
    };
    const gateResult = evaluatePrototypeQualityGate({
      designContractViolations:      [],
      visualUsageDiagnostics:        vud,
    });
    expect(gateResult.ok).toBe(true);
    expect(repairedFiles['pages/App.tsx'].trimEnd()).toBe(cleanApp);
  });

  it('throws when LLM returns no FILE/END blocks (failed repair)', async () => {
    mockFetch.mockResolvedValue({
      ok:   true,
      text: async () => JSON.stringify({ output_text: 'Sorry, I cannot repair this.', finish_reason: 'stop' }),
    });

    await expect(runQualityRepair({
      prompt:             'Healthcare app',
      skeletonId:         'mobile-app',
      currentFiles:       filesWithPlaceholder(),
      blockingReasons:    ['Generic placeholder: Feature 1'],
      repairInstructions: ['Replace Feature 1'],
      routeOverrides:     TEST_ROUTE_OVERRIDES,
      onLog:              () => {},
    })).rejects.toThrow('Quality repair produced no FILE/END blocks');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('safety filter: ignores patches for paths not in currentFiles', async () => {
    const injectedPath = 'pages/NewPage.tsx';
    mockFetch.mockResolvedValue({
      ok:   true,
      text: async () => mockLlmResponse({
        'pages/App.tsx': 'export default function App() { return <div>Fixed</div>; }',
        [injectedPath]:  'export default function NewPage() { return <div>Injected</div>; }',
      }),
    });

    const result = await runQualityRepair({
      prompt:             'Healthcare app',
      skeletonId:         'mobile-app',
      currentFiles:       { 'pages/App.tsx': 'original' },
      blockingReasons:    ['placeholder'],
      repairInstructions: ['fix'],
      routeOverrides:     TEST_ROUTE_OVERRIDES,
      onLog:              () => {},
    });

    // Patch for known path applied (parser adds trailing \n — trim for comparison)
    expect(result['pages/App.tsx'].trimEnd()).toBe('export default function App() { return <div>Fixed</div>; }');
    // Injected unknown path blocked
    expect(result[injectedPath]).toBeUndefined();
  });

  it('gate ok=true (valid output, no issues) means no repair is needed — fetch not called', () => {
    // All checks pass → ok=true → runQualityRepair would not be called
    const vud: VisualUsageDiagnostics = {
      premiumUsageChecked:             true,
      premiumComponentsSelected:       ['wellness-hero'],
      premiumComponentImportsFound:    ['WellnessHero'],
      premiumUsageCount:               1,
      premiumUsageObserved:            true,
      mediaUsageChecked:               true,
      mediaAssetsMaterialized:         ['src/assets/generated/hero.svg'],
      mediaAssetReferencesFound:       ['src/assets/generated/hero.svg'],
      mediaUsageCount:                 1,
      mediaUsageObserved:              true,
      firstScreenFilesChecked:         ['pages/App.tsx'],
      firstScreenPremiumUsageObserved: true,
      firstScreenMediaUsageObserved:   true,
      meaningfulScreenFiles:           ['pages/App.tsx'],
      meaningfulScreenCount:           1,
      genericPlaceholderFindings:      [],
      visualUsageNotes:                [],
      suggestedNextAction:             'none',
    };

    const gate = evaluatePrototypeQualityGate({
      designContractViolations: [],
      visualUsageDiagnostics:   vud,
    });

    // Gate is ok — runQualityRepair must NOT be called
    expect(gate.ok).toBe(true);
    expect(gate.blockingReasons).toHaveLength(0);
    expect(gate.advisoryReasons).toHaveLength(0);
    // fetch was stubbed in beforeEach but never invoked — confirms no LLM call
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
