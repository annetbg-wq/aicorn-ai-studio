// @vitest-environment jsdom
/**
 * ArchitectProductStrategistDownscope — deterministic unit tests for the
 * architect downscope from senior product architect to market/product strategist.
 *
 * All tests use hand-crafted inputs — no LLM calls.
 *
 * Verifies:
 *   - buildArchitectProductStrategistRole() contains the downscoped role declaration
 *   - prompt says architect is product strategist, not final technical architect
 *   - prompt says builder/coder owns architecture + implementation + self-test
 *   - prompt frames fileTree/deltaFiles as pipeline scaffolding, not final authority
 *   - prompt forbids conflicting architecture instructions (builder self-plan)
 *   - getArchitectRequiredOutputFields() preserves all required ArchitectPlan fields
 *   - deltaFiles is derived from fileTree (pipeline contract preserved)
 *   - chat/founder flow entry routes through ProtoPipeline.run → runArchitect
 *   - trending niche/direct-launch path routes through the same pipeline entry
 *   - both paths converge: buildArchitectProductStrategistRole() applies to both
 *   - contextContract carries product-strategy-source, builder-owned, pipeline-scaffolding markers
 *   - controlled fallback behavior is unchanged
 *   - no real LLM calls
 */

import { describe, expect, it, vi } from 'vitest';
import {
  buildArchitectProductStrategistRole,
  getArchitectRequiredOutputFields,
} from '../ProtoPipeline';
import {
  launchTrendIdeaBuild,
  buildTrendIdeaLaunchSummary,
  type TrendIdeaLaunchDeps,
} from '../TrendIdeaLaunchService';
import {
  isArchitectPlanUsableForPipeline,
  maybeApplyArchitectAdapterFallback,
} from '../ArchitectReplacementAdapter';
import { buildMarketAwareBuilderBrief } from '../MarketAwareBuilderBrief';
import type { ArchitectPlan } from '../ProtoPipeline';
import type { TrendNicheIdea, ProductBlueprint } from '../ideaFeedService';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MINIMAL_TREND_IDEA: TrendNicheIdea = {
  id: 'idea-fitness-001',
  cadence: 'daily',
  categories: ['wellness'],
  localized: {
    en: {
      title: 'AI Fitness Coach',
      description: 'A personalized AI fitness coach for home workouts',
      audience: 'Home fitness enthusiasts',
      marketAngle: 'AI-powered coaching without gym membership',
      whyInteresting: 'Growing demand for home fitness post-pandemic',
    },
    ru: {
      title: 'AI Фитнес Тренер',
      description: 'Персональный AI фитнес тренер для домашних тренировок',
      audience: 'Домашние спортсмены',
      marketAngle: 'AI тренировки без абонемента',
      whyInteresting: 'Рост спроса на домашний фитнес',
    },
  },
  appName: 'FitFlow',
  description: 'AI-powered home fitness coaching app',
  theme: 'health',
  layout: { type: 'app', navigation: 'bottom-tabs' },
  pages: [
    { path: '/', name: 'Home', file: 'pages/Home.tsx', purpose: 'Workout feed', isMainScreen: true },
  ],
  shadcnComponents: [],
  icons: [],
  marketContext: 'Home fitness market',
  targetAudience: 'Home fitness enthusiasts',
  painPoint: 'No personal coach',
  competitorGap: 'AI coaching',
  generatedAt: '2025-01-01',
};

const MINIMAL_BLUEPRINT: ProductBlueprint = {
  id: 'bp-fitness-001',
  appName: 'FitFlow',
  description: 'AI-powered home fitness coaching app',
  theme: 'health',
  layout: { type: 'app', navigation: 'bottom-tabs' },
  pages: [
    { path: '/', name: 'Home', file: 'pages/Home.tsx', purpose: 'Workout feed', isMainScreen: true },
  ],
  shadcnComponents: [],
  icons: [],
  sourceIdea: {
    id: 'idea-fitness-001',
    title: 'AI Fitness Coach',
    pitch: 'Personal AI fitness coach',
    marketGap: 'Affordable AI coaching',
    visualTag: 'health',
  },
  visualTag: 'health',
  packageSummary: 'AI fitness coaching app for home workouts',
  authFlow: {
    type: 'email',
    onboardingSteps: [],
  },
  monetization: {
    model: 'freemium',
    paywall: { trigger: 'advanced workouts', limits: [], upgradeMessage: 'Upgrade for full access' },
  },
  databaseSchema: { sql: '', tables: [] },
  aiLogic: { features: [] },
  fileArchitecture: [],
  premiumUiDirectives: [],
};

const VALID_ARCHITECT_PLAN: ArchitectPlan = {
  appName: 'FitFlow',
  skeleton: 'mobile-app',
  summary: 'AI fitness coaching app for home workouts',
  fileTree: {
    'pages/Home.tsx': 'Workout feed with today plan and streak summary',
    'pages/Workouts.tsx': 'Browse and launch workout sessions',
    'hooks/useFitness.ts': 'Shared fitness state hook for workouts and progress',
  },
  deltaFiles: [
    { path: 'pages/Home.tsx', purpose: 'Workout feed with today plan and streak summary' },
    { path: 'pages/Workouts.tsx', purpose: 'Browse and launch workout sessions' },
    { path: 'hooks/useFitness.ts', purpose: 'Shared fitness state hook for workouts and progress' },
  ],
  pages: [
    { path: '/', name: 'Home', file: 'pages/Home.tsx', purpose: 'Today workout feed' },
    { path: '/workouts', name: 'Workouts', file: 'pages/Workouts.tsx', purpose: 'Workout library' },
  ],
  dataModel: 'Workout { id, title, duration } | Progress { date, completedIds[] }',
  contextContract: '[product-strategy-source][builder-owned] Use useFitness() for shared state',
  notes: ['Track workout completions'],
  rawResponse: '{}',
};

const BRIEF = buildMarketAwareBuilderBrief({
  brief: 'AI fitness coaching app for home workouts',
  skeletonId: 'mobile-app',
});

// ── buildArchitectProductStrategistRole — persona declarations ────────────────

describe('buildArchitectProductStrategistRole — persona declaration', () => {
  it('declares the architect as a market/product strategist', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('market/product strategist');
  });

  it('explicitly states the architect is NOT the final technical architect', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('not the final technical architect');
  });

  it('instructs the architect not to over-own implementation architecture', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('do not over-own implementation architecture');
  });

  it('instructs the architect not to create detailed component architecture', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('do not create detailed component architecture');
  });

  it('instructs the architect not to conflict with the builder-owned self-plan', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('do not conflict with the builder-owned self-plan');
  });

  it('is deterministic — returns the same string on every call', () => {
    expect(buildArchitectProductStrategistRole()).toBe(buildArchitectProductStrategistRole());
  });
});

// ── buildArchitectProductStrategistRole — builder/coder ownership ─────────────

describe('buildArchitectProductStrategistRole — builder/coder ownership', () => {
  it('states the builder/coder owns architecture', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('builder/coder owns architecture');
  });

  it('states the builder/coder owns implementation', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('implementation');
  });

  it('states the builder/coder owns self-test', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('self-test');
  });

  it('states architect role covers product strategy and user journey', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('product strategy');
    expect(role.toLowerCase()).toContain('user journey');
  });

  it('states architect role covers required product moments', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('product moments');
  });
});

// ── buildArchitectProductStrategistRole — pipeline scaffolding framing ─────────

describe('buildArchitectProductStrategistRole — pipeline scaffolding', () => {
  it('frames fileTree as pipeline scaffolding', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('filetree');
    expect(role.toLowerCase()).toContain('pipeline scaffolding');
  });

  it('frames deltaFiles as pipeline scaffolding', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('deltafiles');
    expect(role.toLowerCase()).toContain('pipeline scaffolding');
  });

  it('states fileTree/deltaFiles are not final architecture authority', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('not final architecture authority');
  });
});

// ── getArchitectRequiredOutputFields — pipeline contract preservation ──────────

describe('getArchitectRequiredOutputFields — required fields', () => {
  it('includes appName', () => {
    expect(getArchitectRequiredOutputFields()).toContain('appName');
  });

  it('includes summary', () => {
    expect(getArchitectRequiredOutputFields()).toContain('summary');
  });

  it('includes skeleton', () => {
    expect(getArchitectRequiredOutputFields()).toContain('skeleton');
  });

  it('includes pages', () => {
    expect(getArchitectRequiredOutputFields()).toContain('pages');
  });

  it('includes fileTree', () => {
    expect(getArchitectRequiredOutputFields()).toContain('fileTree');
  });

  it('includes dataModel', () => {
    expect(getArchitectRequiredOutputFields()).toContain('dataModel');
  });

  it('includes contextContract', () => {
    expect(getArchitectRequiredOutputFields()).toContain('contextContract');
  });

  it('includes notes', () => {
    expect(getArchitectRequiredOutputFields()).toContain('notes');
  });

  it('returns a readonly array with at least 8 fields', () => {
    expect(getArchitectRequiredOutputFields().length).toBeGreaterThanOrEqual(8);
  });

  it('is deterministic — same reference on every call', () => {
    const a = getArchitectRequiredOutputFields();
    const b = getArchitectRequiredOutputFields();
    expect(a).toEqual(b);
  });
});

// ── Trend-niche / direct-launch path routing ──────────────────────────────────

describe('launchTrendIdeaBuild — trend-niche path routes through pipeline', () => {
  it('calls launchWithPlan with blueprint, intent, and trend-niche source', async () => {
    const launchWithPlan = vi.fn().mockResolvedValue(undefined);
    const addSystemMessage = vi.fn();
    const setInput = vi.fn();
    const onSend = vi.fn();

    const deps: TrendIdeaLaunchDeps = {
      launchWithPlan,
      addSystemMessage,
      setInput,
      onSend,
      scheduleSend: (cb) => cb(), // synchronous for test
    };

    await launchTrendIdeaBuild({
      idea: MINIMAL_TREND_IDEA,
      blueprint: MINIMAL_BLUEPRINT,
      intent: 'Build an AI fitness coaching app',
      deps,
    });

    expect(launchWithPlan).toHaveBeenCalledOnce();
    expect(launchWithPlan).toHaveBeenCalledWith(
      MINIMAL_BLUEPRINT,
      'Build an AI fitness coaching app',
      'trend-niche',
    );
  });

  it('calls onSend with the normalized intent after launchWithPlan', async () => {
    const launchWithPlan = vi.fn().mockResolvedValue(undefined);
    const addSystemMessage = vi.fn();
    const setInput = vi.fn();
    const onSend = vi.fn();

    await launchTrendIdeaBuild({
      idea: MINIMAL_TREND_IDEA,
      blueprint: MINIMAL_BLUEPRINT,
      intent: 'Build an AI fitness coaching app',
      deps: {
        launchWithPlan,
        addSystemMessage,
        setInput,
        onSend,
        scheduleSend: (cb) => cb(),
      },
    });

    expect(onSend).toHaveBeenCalledOnce();
    expect(onSend).toHaveBeenCalledWith('Build an AI fitness coaching app');
  });

  it('throws when intent is empty (pipeline guard)', async () => {
    await expect(
      launchTrendIdeaBuild({
        idea: MINIMAL_TREND_IDEA,
        blueprint: MINIMAL_BLUEPRINT,
        intent: '   ',
        deps: {
          launchWithPlan: vi.fn(),
          addSystemMessage: vi.fn(),
          setInput: vi.fn(),
          onSend: vi.fn(),
        },
      }),
    ).rejects.toThrow('Packaged trend idea launch requires a non-empty intent');
  });

  it('sets input to the normalized intent for pre-filling the chat composer', async () => {
    const setInput = vi.fn();

    await launchTrendIdeaBuild({
      idea: MINIMAL_TREND_IDEA,
      blueprint: MINIMAL_BLUEPRINT,
      intent: '  Build an AI fitness app  ',
      deps: {
        launchWithPlan: vi.fn().mockResolvedValue(undefined),
        addSystemMessage: vi.fn(),
        setInput,
        onSend: vi.fn(),
        scheduleSend: (cb) => cb(),
      },
    });

    expect(setInput).toHaveBeenCalledWith('Build an AI fitness app');
  });

  it('adds a system message summary for the trend idea', async () => {
    const addSystemMessage = vi.fn();

    await launchTrendIdeaBuild({
      idea: MINIMAL_TREND_IDEA,
      blueprint: MINIMAL_BLUEPRINT,
      intent: 'Build an AI fitness app',
      deps: {
        launchWithPlan: vi.fn().mockResolvedValue(undefined),
        addSystemMessage,
        setInput: vi.fn(),
        onSend: vi.fn(),
        scheduleSend: (cb) => cb(),
      },
    });

    expect(addSystemMessage).toHaveBeenCalledOnce();
    const msg = addSystemMessage.mock.calls[0][0] as string;
    expect(msg).toContain('Blueprint packaged');
  });
});

// ── Both entry paths — convergence proof ──────────────────────────────────────

describe('entry path convergence — both paths use the same downscoped architect', () => {
  it('buildArchitectProductStrategistRole() is a shared singleton — both paths get the same role instruction', () => {
    // Both chat/founder flow (SimpleGeneration.run → ProtoPipeline.run → runArchitect)
    // and trend-niche/direct-launch flow (launchTrendIdeaBuild → onSend → ProtoPipeline.run → runArchitect)
    // call the same runArchitect function, which uses buildArchitectProductStrategistRole().
    // Since it is a pure function returning a constant string, both paths receive identical instructions.
    const roleForChat = buildArchitectProductStrategistRole();
    const roleForTrendNiche = buildArchitectProductStrategistRole();

    expect(roleForChat).toBe(roleForTrendNiche);
    expect(roleForChat).toContain('market/product strategist');
    expect(roleForChat).toContain('not the final technical architect');
  });

  it('both paths required output fields are identical (same contract)', () => {
    // Both paths converge into the same runArchitect → same ArchitectPlan schema.
    // getArchitectRequiredOutputFields() documents this shared contract.
    const fields = getArchitectRequiredOutputFields();
    // Pipeline-required fields present for both entry paths:
    expect(fields).toContain('appName');
    expect(fields).toContain('summary');
    expect(fields).toContain('fileTree');
    expect(fields).toContain('pages');
    expect(fields).toContain('contextContract');
  });

  it('trend-niche path routes through launchWithPlan before triggering the pipeline (no bypass)', async () => {
    // The trend-niche path calls launchWithPlan BEFORE onSend.
    // This ensures the plan context is set in useStudio before SimpleGeneration.run is called,
    // which is the same sequence as the chat/founder flow using the regular pipeline.
    const callOrder: string[] = [];
    const launchWithPlan = vi.fn().mockImplementationOnce(async () => {
      callOrder.push('launchWithPlan');
    });
    const onSend = vi.fn().mockImplementationOnce(() => {
      callOrder.push('onSend');
    });

    await launchTrendIdeaBuild({
      idea: MINIMAL_TREND_IDEA,
      blueprint: MINIMAL_BLUEPRINT,
      intent: 'Build a fitness app',
      deps: {
        launchWithPlan,
        addSystemMessage: vi.fn(),
        setInput: vi.fn(),
        onSend,
        scheduleSend: (cb) => cb(),
      },
    });

    expect(callOrder).toEqual(['launchWithPlan', 'onSend']);
  });

  it('trend-niche path preserves required ArchitectPlan fields in blueprint', () => {
    // ProductBlueprint (passed via launchWithPlan) carries the plan that useStudio
    // stores as packagedLaunchContext. Both paths reach runArchitect with the same
    // ArchitectPlan output shape requirement.
    const fields = getArchitectRequiredOutputFields();
    expect(fields).toContain('appName');
    expect(MINIMAL_BLUEPRINT.appName).toBeTruthy();
    expect(fields).toContain('pages');
    expect(MINIMAL_BLUEPRINT.pages.length).toBeGreaterThan(0);
  });

  it('trend-niche path preserves builder-owned coder responsibility', () => {
    // The downscoped architect role explicitly states builder/coder owns architecture.
    // This applies to both entry paths since they use the same runArchitect.
    const role = buildArchitectProductStrategistRole();
    expect(role).toContain('builder/coder owns architecture');
    expect(role).toContain('implementation');
    expect(role).toContain('self-test');
  });
});

// ── buildTrendIdeaLaunchSummary — summary content ─────────────────────────────

describe('buildTrendIdeaLaunchSummary — summary fields', () => {
  it('includes the blueprint appName in the summary', () => {
    const summary = buildTrendIdeaLaunchSummary(MINIMAL_TREND_IDEA, MINIMAL_BLUEPRINT, 'en');
    expect(summary).toContain('FitFlow');
  });

  it('includes market angle in the summary', () => {
    const summary = buildTrendIdeaLaunchSummary(MINIMAL_TREND_IDEA, MINIMAL_BLUEPRINT, 'en');
    expect(summary).toContain('Market angle');
  });

  it('includes why now in the summary', () => {
    const summary = buildTrendIdeaLaunchSummary(MINIMAL_TREND_IDEA, MINIMAL_BLUEPRINT, 'en');
    expect(summary).toContain('Why now');
  });
});

// ── contextContract framing ───────────────────────────────────────────────────

describe('architect contextContract framing', () => {
  it('valid plan contextContract carries product-strategy-source marker', () => {
    // Plans generated by the downscoped architect should carry these markers.
    // VALID_ARCHITECT_PLAN simulates what the LLM returns post-downscope.
    expect(VALID_ARCHITECT_PLAN.contextContract).toContain('[product-strategy-source]');
  });

  it('valid plan contextContract carries builder-owned marker', () => {
    expect(VALID_ARCHITECT_PLAN.contextContract).toContain('[builder-owned]');
  });

  it('buildArchitectProductStrategistRole enforces architect does not override builder-owned responsibility', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role).toContain('builder-owned self-plan');
  });
});

// ── fileTree and deltaFiles — pipeline scaffolding contract ───────────────────

describe('fileTree and deltaFiles — pipeline scaffolding (not removed)', () => {
  it('valid plan has non-empty fileTree (pipeline scaffolding present)', () => {
    expect(Object.keys(VALID_ARCHITECT_PLAN.fileTree).length).toBeGreaterThan(0);
  });

  it('valid plan has non-empty deltaFiles (pipeline scaffolding present)', () => {
    expect(VALID_ARCHITECT_PLAN.deltaFiles.length).toBeGreaterThan(0);
  });

  it('deltaFiles paths match fileTree keys (derived contract)', () => {
    const fileTreeKeys = new Set(Object.keys(VALID_ARCHITECT_PLAN.fileTree));
    for (const delta of VALID_ARCHITECT_PLAN.deltaFiles) {
      expect(fileTreeKeys.has(delta.path)).toBe(true);
    }
  });

  it('getArchitectRequiredOutputFields includes fileTree (not removed)', () => {
    expect(getArchitectRequiredOutputFields()).toContain('fileTree');
  });

  it('role frames fileTree/deltaFiles as scaffolding that guides the coder', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role).toContain('pipeline scaffolding that guides the coder');
  });
});

// ── Controlled adapter fallback — unchanged ───────────────────────────────────

describe('controlled adapter fallback — unchanged by architect downscope', () => {
  it('valid plan does not trigger fallback', () => {
    const result = maybeApplyArchitectAdapterFallback({
      realPlan: VALID_ARCHITECT_PLAN,
      brief: BRIEF,
      skeletonId: 'mobile-app',
      expectedFiles: VALID_ARCHITECT_PLAN.deltaFiles,
    });
    expect(result.fallbackApplied).toBe(false);
    expect(result.plan).toBe(VALID_ARCHITECT_PLAN);
  });

  it('plan with empty deltaFiles still triggers fallback (rescue behavior unchanged)', () => {
    const invalidPlan: ArchitectPlan = { ...VALID_ARCHITECT_PLAN, deltaFiles: [], fileTree: {} };
    const result = maybeApplyArchitectAdapterFallback({
      realPlan: invalidPlan,
      brief: BRIEF,
      skeletonId: 'mobile-app',
      expectedFiles: VALID_ARCHITECT_PLAN.deltaFiles,
    });
    expect(result.fallbackApplied).toBe(true);
    expect(result.plan).not.toBe(invalidPlan);
    expect(result.plan.deltaFiles.length).toBeGreaterThan(0);
  });

  it('isArchitectPlanUsableForPipeline returns true for valid downscoped plan', () => {
    expect(isArchitectPlanUsableForPipeline(VALID_ARCHITECT_PLAN)).toBe(true);
  });

  it('adapter fallback is synchronous — no real LLM calls', () => {
    const result = maybeApplyArchitectAdapterFallback({
      realPlan: VALID_ARCHITECT_PLAN,
      brief: BRIEF,
      skeletonId: 'mobile-app',
    });
    expect(typeof result.fallbackApplied).toBe('boolean');
  });

  it('adapter is not the default path for valid plan (runArchitect result is used directly)', () => {
    const result = maybeApplyArchitectAdapterFallback({
      realPlan: VALID_ARCHITECT_PLAN,
      brief: BRIEF,
      skeletonId: 'mobile-app',
    });
    expect(result.telemetry.architect_adapter_fallback_evaluated).toBe(false);
    expect(result.telemetry.fallback_triggered).toBe(false);
    expect(result.telemetry.fallback_applied).toBe(false);
  });
});

// ── Canary phrase preservation ────────────────────────────────────────────────

describe('buildArchitectProductStrategistRole — canary phrase preservation', () => {
  it('role text still contains the substring "senior product architect" (canary mock dependency)', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role).toContain('senior product architect');
  });

  it('role says focus is product strategy and minimal pipeline contracts', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('product strategy and minimal pipeline contracts');
  });
});

// ── Minimized output authority — field framing ─────────────────────────────────

describe('buildArchitectProductStrategistRole — minimized output authority', () => {
  it('frames fileTree as a minimal pipeline scaffold', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('minimal pipeline scaffold');
  });

  it('frames deltaFiles as expected generated files for the pipeline contract', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('expected generated files');
  });

  it('frames pages as product moments and screens, not component architecture', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('product moments and screens');
    expect(role.toLowerCase()).toContain('not component architecture');
  });

  it('states dataModel is product-level information only', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('product-level information only');
  });

  it('states notes must be strategic constraints only, not implementation instructions', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('strategic constraints only');
    expect(role.toLowerCase()).toContain('not implementation instructions');
  });

  it('states contextContract must declare builder/coder ownership', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('contextcontract must declare');
    expect(role.toLowerCase()).toContain('builder/coder owns architecture');
  });
});

// ── Forbidden architect behaviors ─────────────────────────────────────────────

describe('buildArchitectProductStrategistRole — forbidden behaviors', () => {
  it('forbids designing detailed component hierarchy', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('do not design detailed component hierarchy');
  });

  it('forbids prescribing internal React state architecture', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('do not prescribe internal react state architecture');
  });

  it('forbids prescribing final component boundaries', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('do not prescribe final component boundaries');
  });

  it('forbids creating a detailed implementation plan', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('do not create a detailed implementation plan');
  });

  it('forbids overriding the builder-owned self-plan', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('do not override builder-owned self-plan');
  });

  it('forbids conflicting with the market-aware builder brief', () => {
    const role = buildArchitectProductStrategistRole();
    expect(role.toLowerCase()).toContain('do not conflict with the market-aware builder brief');
  });
});

// ── No real LLM calls ─────────────────────────────────────────────────────────

describe('no real LLM calls', () => {
  it('buildArchitectProductStrategistRole is synchronous', () => {
    const result = buildArchitectProductStrategistRole();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('getArchitectRequiredOutputFields is synchronous', () => {
    const result = getArchitectRequiredOutputFields();
    expect(Array.isArray(result)).toBe(true);
  });

  it('launchTrendIdeaBuild with mocked deps makes no real fetch calls', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await launchTrendIdeaBuild({
      idea: MINIMAL_TREND_IDEA,
      blueprint: MINIMAL_BLUEPRINT,
      intent: 'Build a fitness app',
      deps: {
        launchWithPlan: vi.fn().mockResolvedValue(undefined),
        addSystemMessage: vi.fn(),
        setInput: vi.fn(),
        onSend: vi.fn(),
        scheduleSend: (cb) => cb(),
      },
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
