// @vitest-environment jsdom
/**
 * Unit tests for evaluatePrototypeQualityGate — deterministic helper, no LLM calls.
 * Unit tests for runQualityRepair — LLM call mocked via stubGlobal('fetch').
 * Unit tests for computeRepairScopedFiles — pure scoping helper, no LLM calls.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  evaluatePrototypeQualityGate,
  runQualityRepair,
  buildRepairPrompt,
  computeRepairScopedFiles,
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

// ── Soft/hard blocking classification tests ───────────────────────────────────
//
// These tests verify the gate correctly classifies which blocking reasons are
// "soft" (premium/media — degrade if repair fails) vs "hard" (tokens/placeholders).

describe('soft vs hard blocking classification', () => {
  it('premium-only blocking starts with expected prefix for allSoftBlocking detection', () => {
    const vud: VisualUsageDiagnostics = {
      premiumUsageChecked: true,
      premiumComponentsSelected: ['analytics-chart'],
      premiumComponentImportsFound: [],
      premiumUsageCount: 0,
      premiumUsageObserved: false,
      mediaUsageChecked: false,
      mediaAssetsMaterialized: [],
      mediaAssetReferencesFound: [],
      mediaUsageCount: 0,
      mediaUsageObserved: false,
      firstScreenFilesChecked: [],
      firstScreenPremiumUsageObserved: false,
      firstScreenMediaUsageObserved: false,
      meaningfulScreenFiles: [],
      meaningfulScreenCount: 0,
      genericPlaceholderFindings: [],
      visualUsageNotes: [],
      suggestedNextAction: 'improve_prompt',
    };
    const gate = evaluatePrototypeQualityGate({ designContractViolations: [], visualUsageDiagnostics: vud });
    expect(gate.ok).toBe(false);
    // Must start with "Premium components selected" so allSoftBlocking check works
    expect(gate.blockingReasons[0]).toMatch(/^Premium components selected/);
  });

  it('media-only blocking starts with expected prefix for allSoftBlocking detection', () => {
    const vud: VisualUsageDiagnostics = {
      premiumUsageChecked: false,
      premiumComponentsSelected: [],
      premiumComponentImportsFound: [],
      premiumUsageCount: 0,
      premiumUsageObserved: false,
      mediaUsageChecked: true,
      mediaAssetsMaterialized: ['src/assets/generated/hero.svg'],
      mediaAssetReferencesFound: [],
      mediaUsageCount: 0,
      mediaUsageObserved: false,
      firstScreenFilesChecked: [],
      firstScreenPremiumUsageObserved: false,
      firstScreenMediaUsageObserved: false,
      meaningfulScreenFiles: [],
      meaningfulScreenCount: 0,
      genericPlaceholderFindings: [],
      visualUsageNotes: [],
      suggestedNextAction: 'improve_prompt',
    };
    const gate = evaluatePrototypeQualityGate({ designContractViolations: [], visualUsageDiagnostics: vud });
    expect(gate.ok).toBe(false);
    // Must start with "Generated media assets materialized" so allSoftBlocking check works
    expect(gate.blockingReasons[0]).toMatch(/^Generated media assets materialized/);
  });

  it('design token violation does NOT start with soft prefix — correctly classified as hard-blocking', () => {
    const gate = evaluatePrototypeQualityGate({
      designContractViolations: [{ path: 'App.tsx', rule: 'no-raw-hex', example: '#ff0000', line: 1 }],
    });
    expect(gate.ok).toBe(false);
    expect(gate.blockingReasons[0]).toMatch(/^Design contract/);
    // Should NOT match either soft prefix
    expect(gate.blockingReasons[0].startsWith('Premium components selected')).toBe(false);
    expect(gate.blockingReasons[0].startsWith('Generated media assets materialized')).toBe(false);
  });
});

// ── buildRepairPrompt tests ───────────────────────────────────────────────────
//
// Deterministic tests — no LLM calls, no fetch mock needed.
// Tests verify that the system prompt built by buildRepairPrompt contains the
// exact rules required for PRODUCT-token replacement, empty-array filling,
// self-check, and the existing missing-component guard.

describe('buildRepairPrompt', () => {
  const baseInput = {
    prompt:             'Trending niche: TrendFit – AI workout planner for remote workers',
    blockingReasons:    ['Generic placeholder content: PRODUCT'],
    repairInstructions: ['Replace PRODUCT placeholder with product-specific name'],
    currentFiles: {
      'pages/Dashboard.tsx':
        'export default function D() { return <h1>PRODUCT</h1>; }',
      'hooks/useTrends.ts':
        'export const useTrends = () => ({ data: [] as string[] });',
    },
  };

  it('repair prompt includes standalone PRODUCT replacement rule', () => {
    const { system } = buildRepairPrompt(baseInput);
    expect(system).toMatch(/Bare PRODUCT token/i);
    expect(system).toMatch(/standalone placeholder token/i);
  });

  it('rule instructs using actual product/app/trend name from original task prompt', () => {
    const { system } = buildRepairPrompt(baseInput);
    expect(system).toMatch(/actual\s+product name, app name, or trend niche name/i);
    expect(system).toMatch(/derived from the original task prompt/i);
  });

  it('rule explicitly forbids substring replacement of PRODUCT inside normal words', () => {
    const { system } = buildRepairPrompt(baseInput);
    expect(system).toMatch(/Do not replace PRODUCT where it appears as a substring inside a normal word/i);
  });

  it('repair prompt includes empty [] data array fill rule', () => {
    const { system } = buildRepairPrompt(baseInput);
    expect(system).toMatch(/Empty data arrays/i);
    expect(system).toMatch(/exports or returns an empty \[\]/i);
  });

  it('empty-array rule requires 3–5 realistic domain-specific sample entries', () => {
    const { system } = buildRepairPrompt(baseInput);
    expect(system).toMatch(/3.{1,3}5 realistic domain-specific sample entries/i);
  });

  it('empty-array rule forbids leaving visible UI content backed by empty arrays', () => {
    const { system } = buildRepairPrompt(baseInput);
    expect(system).toMatch(/Do not leave visible dashboards.*hooks backed by empty arrays/i);
  });

  it('repair self-check verifies no standalone PRODUCT token remains', () => {
    const { system } = buildRepairPrompt(baseInput);
    expect(system).toMatch(/Self-check before returning repaired files/i);
    expect(system).toMatch(/no standalone PRODUCT token remains/i);
  });

  it('repair self-check verifies no visible-content data hook returns []', () => {
    const { system } = buildRepairPrompt(baseInput);
    expect(system).toMatch(/no visible-content data hook returns or exports \[\]/i);
  });

  it('missing component rule — self-check forbids importing absent catalog components', () => {
    const { system } = buildRepairPrompt(baseInput);
    expect(system).toMatch(/do not import absent catalog components/i);
  });

  it('existing generic-placeholder rule is still present (non-regression)', () => {
    const { system } = buildRepairPrompt(baseInput);
    expect(system).toMatch(/Feature 1.*AppName.*Lorem ipsum/i);
    expect(system).toMatch(/product-specific copy/i);
  });

  it('user message starts with "Original task:" and contains the prompt', () => {
    const { user } = buildRepairPrompt(baseInput);
    expect(user).toMatch(/^Original task:/);
    expect(user).toContain(baseInput.prompt);
  });

  it('user message embeds each current file with FILE/END markers', () => {
    const { user } = buildRepairPrompt(baseInput);
    expect(user).toContain('<<<FILE: pages/Dashboard.tsx>>>');
    expect(user).toContain('<<<FILE: hooks/useTrends.ts>>>');
    expect(user).toContain('<<<END>>>');
  });

  it('one-shot: buildRepairPrompt produces a single system+user pair with no loops', () => {
    // buildRepairPrompt is a pure function — calling it once produces one prompt.
    // Calling it twice produces two independent prompts (no shared mutable state).
    const first  = buildRepairPrompt(baseInput);
    const second = buildRepairPrompt(baseInput);
    expect(first.system).toBe(second.system);
    expect(first.user).toBe(second.user);
  });

  it('(в) scoped repair prompt preserves full context even when only violating files are passed', () => {
    // Simulates what runQualityRepair does: pass only the scoped files to buildRepairPrompt,
    // but keep prompt + psd unchanged — context must still be present in system/user.
    const scopedFiles = {
      'pages/App.tsx': 'export default function App() { return <h1>PRODUCT</h1>; }',
    };
    const psd: ProductSpecificityDiagnostics = {
      ...validSpecificityDiagnostics(),
      domainEntitySignals: ['Invoice', 'Client', 'Payment'],
      productMetricSignals: ['Monthly Revenue', 'Unpaid Invoices'],
    };
    const { system, user } = buildRepairPrompt({
      prompt:             'FinTrack – personal finance tracker for freelancers',
      blockingReasons:    ['Bare PRODUCT token in pages/App.tsx'],
      repairInstructions: ['Replace PRODUCT with product name from prompt'],
      currentFiles:       scopedFiles,   // scoped (1 file, not 34)
      productSpecificityDiagnostics: psd,
    });

    // (в-1) Original task prompt is in user message
    expect(user).toContain('FinTrack – personal finance tracker for freelancers');
    // (в-2) Scoped file is in user message
    expect(user).toContain('<<<FILE: pages/App.tsx>>>');
    // (в-3) psd domain signals are in system message (context not stripped with files)
    expect(system).toContain('Invoice');
    expect(system).toContain('Monthly Revenue');
  });
});

// ── computeRepairScopedFiles tests ────────────────────────────────────────────
//
// Pure function tests — no LLM, no fetch mock needed.
// Verifies the scoping logic: union of all violation sources, normalization,
// fallback behaviour.

describe('computeRepairScopedFiles', () => {
  it('(а) scopes to exactly the violating files — 3 out of 34', () => {
    const allFiles: Record<string, string> = {};
    for (let i = 0; i < 34; i++) allFiles[`pages/Page${i}.tsx`] = `content ${i}`;

    const violations: DesignViolation[] = [
      { path: 'pages/Page2.tsx',  rule: 'no-raw-hex',           example: '#fff',       line: 1 },
      { path: 'pages/Page7.tsx',  rule: 'no-tailwind-palette',  example: 'bg-blue-500', line: 3 },
      { path: 'pages/Page15.tsx', rule: 'no-raw-color-fn',      example: 'rgb(0,0,0)', line: 5 },
    ];

    const { scopedFiles, isFallback } = computeRepairScopedFiles(allFiles, violations);

    expect(isFallback).toBe(false);
    expect(Object.keys(scopedFiles)).toHaveLength(3);
    expect('pages/Page2.tsx'  in scopedFiles).toBe(true);
    expect('pages/Page7.tsx'  in scopedFiles).toBe(true);
    expect('pages/Page15.tsx' in scopedFiles).toBe(true);
    expect('pages/Page0.tsx'  in scopedFiles).toBe(false); // clean file excluded
  });

  it('(б) includes files from all three violation types (tokens + PRODUCT + labels) in different files', () => {
    const currentFiles = {
      'pages/Home.tsx':      'className="bg-blue-500"',  // token violation
      'App.tsx':             '<h1>PRODUCT</h1>',          // PRODUCT placeholder
      'pages/Dashboard.tsx': 'KPI 1',                    // label placeholder
      'pages/Unrelated.tsx': 'clean content',            // no violation
    };

    const tokenViolations: DesignViolation[] = [
      { path: 'pages/Home.tsx', rule: 'no-tailwind-palette', example: 'bg-blue-500', line: 1 },
    ];
    const vudFindings = ['App.tsx: PRODUCT'];          // "path: label" format
    const psdFindings = ['pages/Dashboard.tsx: KPI 1']; // "path: label" format

    const { scopedFiles, isFallback } = computeRepairScopedFiles(
      currentFiles, tokenViolations, vudFindings, psdFindings,
    );

    expect(isFallback).toBe(false);
    expect(Object.keys(scopedFiles)).toHaveLength(3);
    expect('pages/Home.tsx'      in scopedFiles).toBe(true);  // token
    expect('App.tsx'             in scopedFiles).toBe(true);  // PRODUCT
    expect('pages/Dashboard.tsx' in scopedFiles).toBe(true);  // label
    expect('pages/Unrelated.tsx' in scopedFiles).toBe(false); // clean → excluded
  });

  it('includes files from emptyMetricFindings instead of falling back to all files', () => {
    const currentFiles = {
      'pages/Dashboard.tsx': 'const stats = [];',
      'pages/Clean.tsx': 'clean content',
    };
    const psdEmptyMetricFindings = [
      'pages/Dashboard.tsx: empty local arrays without realistic sample data',
    ];

    const { scopedFiles, isFallback, resolvedPaths, sourcePathCounts } = computeRepairScopedFiles(
      currentFiles,
      [],
      [],
      [],
      psdEmptyMetricFindings,
    );

    expect(isFallback).toBe(false);
    expect(Object.keys(scopedFiles)).toEqual(['pages/Dashboard.tsx']);
    expect(resolvedPaths).toEqual(['pages/Dashboard.tsx']);
    expect(sourcePathCounts.specificityEmptyMetrics).toBe(1);
  });

  it('(г-1) falls back to all files when violation paths do not match currentFiles keys', () => {
    const currentFiles = {
      'pages/App.tsx':       'content',
      'pages/Dashboard.tsx': 'content',
    };
    // Violation path points to a file NOT in currentFiles (rogue/stale path)
    const violations: DesignViolation[] = [
      { path: 'pages/Nonexistent.tsx', rule: 'no-raw-hex', example: '#fff', line: 1 },
    ];

    const { scopedFiles, isFallback, fallbackReason } = computeRepairScopedFiles(
      currentFiles, violations,
    );

    expect(isFallback).toBe(true);
    expect(fallbackReason).toBeDefined();
    expect(fallbackReason).toMatch(/could not be matched/i);
    // Falls back to all files — repair still runs, just unscoped
    expect(Object.keys(scopedFiles)).toHaveLength(2);
    expect('pages/App.tsx'       in scopedFiles).toBe(true);
    expect('pages/Dashboard.tsx' in scopedFiles).toBe(true);
  });

  it('(г-2) falls back with explicit reason when no violation sources provide any paths', () => {
    const currentFiles = { 'pages/App.tsx': 'content' };

    const { scopedFiles, isFallback, fallbackReason } = computeRepairScopedFiles(
      currentFiles, [], [], [],  // all empty — no violations provided
    );

    expect(isFallback).toBe(true);
    expect(fallbackReason).toMatch(/no violation sources/i);
    expect(Object.keys(scopedFiles)).toHaveLength(1); // falls back to all (1) files
  });

  it('deduplicates when the same file appears in multiple violation sources', () => {
    const currentFiles = {
      'App.tsx': 'content',
      'pages/Other.tsx': 'content',
    };
    const violations: DesignViolation[] = [
      { path: 'App.tsx', rule: 'no-raw-hex',          example: '#fff',      line: 1 },
      { path: 'App.tsx', rule: 'no-tailwind-palette', example: 'bg-blue-500', line: 2 },
    ];
    const vudFindings = ['App.tsx: PRODUCT', 'App.tsx: Feature 1'];

    const { scopedFiles, isFallback } = computeRepairScopedFiles(
      currentFiles, violations, vudFindings,
    );

    expect(isFallback).toBe(false);
    // App.tsx appears in multiple sources but must appear only once
    expect(Object.keys(scopedFiles)).toHaveLength(1);
    expect('App.tsx' in scopedFiles).toBe(true);
  });
});

// ── runQualityRepair — scoping integration tests ──────────────────────────────
//
// Verifies that scoping log messages are emitted correctly by runQualityRepair.

describe('runQualityRepair scope logging', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('(г) logs explicit scoped-repair fallback warning when no violation paths resolve', async () => {
    const currentFiles = { 'pages/App.tsx': 'original content' };
    mockFetch.mockResolvedValue({
      ok:   true,
      text: async () =>
        JSON.stringify({
          output_text: '<<<FILE: pages/App.tsx>>>\nfixed\n<<<END>>>',
          finish_reason: 'stop',
        }),
    });

    const logs: Array<{ msg: string; level?: string }> = [];

    await runQualityRepair({
      prompt:             'Test app',
      skeletonId:         'mobile-app',
      currentFiles,
      blockingReasons:    ['some reason'],
      repairInstructions: ['fix it'],
      designContractViolations: [
        // Path does NOT exist in currentFiles → triggers fallback
        { path: 'pages/Nonexistent.tsx', rule: 'no-raw-hex', example: '#fff', line: 1 },
      ],
      routeOverrides: {
        fix: { modelId: 'test', endpoint: 'https://test.example.com/api', apiKey: 'k', provider: 'claude-cli' },
      },
      onLog: (msg, level) => logs.push({ msg, level }),
    });

    const fallbackLog = logs.find(
      l => l.msg.includes('scoped-repair') && l.msg.includes('no paths resolved'),
    );
    expect(fallbackLog).toBeDefined();
    expect(fallbackLog?.level).toBe('warn');
    // The summary log must mention fallback
    const summaryLog = logs.find(l => l.msg.includes('fallback: all files'));
    expect(summaryLog).toBeDefined();
  });

  it('logs scoped count when violations resolve to a subset of files', async () => {
    const currentFiles = {
      'pages/App.tsx':      'className="bg-blue-500"',
      'pages/Clean.tsx':    'clean content',
      'pages/Another.tsx':  'also clean',
    };
    mockFetch.mockResolvedValue({
      ok:   true,
      text: async () =>
        JSON.stringify({
          output_text: '<<<FILE: pages/App.tsx>>>\nfixed\n<<<END>>>',
          finish_reason: 'stop',
        }),
    });

    const logs: Array<string> = [];

    await runQualityRepair({
      prompt:             'Test app',
      skeletonId:         'mobile-app',
      currentFiles,
      blockingReasons:    ['token violation'],
      repairInstructions: ['fix tokens'],
      designContractViolations: [
        { path: 'pages/App.tsx', rule: 'no-tailwind-palette', example: 'bg-blue-500', line: 1 },
      ],
      routeOverrides: {
        fix: { modelId: 'test', endpoint: 'https://test.example.com/api', apiKey: 'k', provider: 'claude-cli' },
      },
      onLog: (msg) => logs.push(msg),
    });

    // Summary log must show 1/3 (scoped, not fallback)
    const scopedLog = logs.find(l => l.includes('1/3') && l.includes('scoped to violations'));
    expect(scopedLog).toBeDefined();
  });

  it('proves scoped repair sends only the resolved hard-violation files instead of all 34', async () => {
    const currentFiles: Record<string, string> = {};
    for (let i = 0; i < 34; i++) {
      currentFiles[`pages/Page${i}.tsx`] = `export default function Page${i}(){ return <div>clean ${i}</div>; }`;
    }
    currentFiles['pages/Page2.tsx'] = 'export default function Page2(){ return <div className="bg-blue-500">bad</div>; }';
    currentFiles['pages/Page15.tsx'] = 'export default function Page15(){ return <div>PRODUCT</div>; }';

    mockFetch.mockResolvedValue({
      ok:   true,
      text: async () => JSON.stringify({
        output_text: [
          '<<<FILE: pages/Page2.tsx>>>',
          'export default function Page2(){ return <div className="bg-background">fixed</div>; }',
          '<<<END>>>',
          '<<<FILE: pages/Page15.tsx>>>',
          'export default function Page15(){ return <div>OpsBoard</div>; }',
          '<<<END>>>',
        ].join('\n'),
        finish_reason: 'stop',
      }),
    });

    const logs: string[] = [];

    await runQualityRepair({
      prompt:             'OpsBoard admin panel',
      skeletonId:         'saas-dashboard',
      currentFiles,
      blockingReasons:    [
        'Design contract: 1 raw token violation(s) in generated source (rules: no-tailwind-palette)',
        'Generic placeholder content in 1 location(s): pages/Page15.tsx: PRODUCT',
      ],
      repairInstructions: [
        'Replace raw palette classes with semantic tokens',
        'Replace PRODUCT with the actual app name from the prompt',
      ],
      designContractViolations: [
        { path: 'pages/Page2.tsx', rule: 'no-tailwind-palette', example: 'bg-blue-500', line: 1 },
      ],
      visualUsageDiagnostics: {
        ...validVisualDiagnostics(),
        genericPlaceholderFindings: ['pages/Page15.tsx: PRODUCT'],
      },
      routeOverrides: {
        fix: { modelId: 'test', endpoint: 'https://test.example.com/api', apiKey: 'k', provider: 'claude-cli' },
      },
      onLog: (msg) => logs.push(msg),
    });

    const scopedLog = logs.find(l => l.includes('2/34') && l.includes('scoped to violations'));
    expect(scopedLog).toBeDefined();
    const sourceLog = logs.find(l => l.includes('scope sources:') && l.includes('resolved=2'));
    expect(sourceLog).toContain('pages/Page2.tsx');
    expect(sourceLog).toContain('pages/Page15.tsx');

    const [, requestInit] = mockFetch.mock.calls[0] as [string, { body?: string }];
    const requestBody = JSON.parse(requestInit.body ?? '{}') as { userPrompt?: string };
    const fileMarkerCount = (requestBody.userPrompt?.match(/<<<FILE:/g) ?? []).length;
    expect(fileMarkerCount).toBe(2);
    expect(requestBody.userPrompt).toContain('pages/Page2.tsx');
    expect(requestBody.userPrompt).toContain('pages/Page15.tsx');
    expect(requestBody.userPrompt).not.toContain('pages/Page0.tsx');
    expect(requestBody.userPrompt).not.toContain('pages/Page33.tsx');
  });

  it('merges patch when LLM emits path without src/ but currentFiles key has src/ prefix', async () => {
    // Simulates the production bug: filteredFiles has "src/config/navigation.ts" (from media/theme
    // pipeline that preserves src/ prefix), but parseFileMarkers normalises the LLM output to
    // "config/navigation.ts" — direct `in` check fails; normalised-key map must bridge the gap.
    const currentFiles: Record<string, string> = {
      'src/config/navigation.ts': 'export const BOTTOM_TABS = [];',
      'pages/Home.tsx': 'export default function Home(){ return <div/>; }',
    };

    mockFetch.mockResolvedValue({
      ok:   true,
      text: async () =>
        JSON.stringify({
          output_text: [
            '<<<FILE: config/navigation.ts>>>',
            'export const BOTTOM_TABS = [{ to: "/", label: "Home" }];',
            '<<<END>>>',
          ].join('\n'),
          finish_reason: 'stop',
        }),
    });

    const logs: string[] = [];
    const result = await runQualityRepair({
      prompt:             'wellness app',
      skeletonId:         'mobile-app',
      currentFiles,
      blockingReasons:    ['Empty or generic dashboard metric cards: config/navigation.ts: empty local arrays'],
      repairInstructions: ['Fill BOTTOM_TABS with realistic navigation entries'],
      designContractViolations: [],
      visualUsageDiagnostics:   { ...validVisualDiagnostics(), premiumUsageObserved: true, mediaUsageObserved: true },
      productSpecificityDiagnostics: null,
      routeOverrides: {
        fix: { modelId: 'test', endpoint: 'https://test.example.com/api', apiKey: 'k', provider: 'claude-cli' },
      },
      onLog: (msg) => logs.push(msg),
    });

    // Patch must be applied to the ORIGINAL key (with src/)
    expect(result['src/config/navigation.ts']).toContain('Home');
    // Unpatched file must survive unchanged
    expect(result['pages/Home.tsx']).toBe('export default function Home(){ return <div/>; }');
    // No "unexpected" warning
    expect(logs.some(l => l.includes('unexpected'))).toBe(false);
    // Patched count log
    expect(logs.some(l => l.includes('repair patched 1 file'))).toBe(true);
  });
});
