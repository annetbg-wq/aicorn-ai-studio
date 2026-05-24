// @vitest-environment jsdom
/**
 * ArchitectOutputValidator — deterministic unit tests for advisory downscope
 * validation of ArchitectPlan output.
 *
 * All tests use hand-crafted inputs — no LLM calls.
 * Advisory only: validator never blocks generation, never mutates plan,
 * never triggers repair.
 *
 * Verifies:
 *   - clean downscoped ArchitectPlan passes (ok=true, no violations)
 *   - component hierarchy in notes is detected
 *   - React state architecture in dataModel is detected
 *   - implementation plan in pages is detected
 *   - final component boundaries in contextContract are detected
 *   - fileTree/deltaFiles scaffold wording is recognized
 *   - builder/coder ownership wording is recognized
 *   - adapter-generated plan is accepted as scaffolded
 *   - validator is advisory-only (returns result, does not throw)
 *   - no real LLM calls (synchronous)
 */

import { describe, expect, it } from 'vitest';
import {
  validateDownscopedArchitectOutput,
  type ArchitectOutputValidationResult,
} from '../ArchitectOutputValidator';
import type { ArchitectPlan } from '../ProtoPipeline';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** A clean, fully downscoped ArchitectPlan — should pass with no violations. */
const CLEAN_DOWNSCOPED_PLAN: ArchitectPlan = {
  appName: 'FitFlow',
  skeleton: 'mobile-app',
  summary: 'AI fitness coaching app for daily workouts and progress tracking',
  fileTree: {
    'pages/Home.tsx': 'Today workout feed and streak summary',
    'pages/Workouts.tsx': 'Browse workout sessions',
    'hooks/useFitness.ts': 'Shared fitness state hook',
  },
  deltaFiles: [
    { path: 'pages/Home.tsx',     purpose: 'Today workout feed and streak summary' },
    { path: 'pages/Workouts.tsx', purpose: 'Browse workout sessions' },
    { path: 'hooks/useFitness.ts', purpose: 'Shared fitness state hook' },
  ],
  pages: [
    { path: '/',          name: 'Home',     file: 'pages/Home.tsx',     purpose: 'Today product moment — habit streak and today plan' },
    { path: '/workouts',  name: 'Workouts', file: 'pages/Workouts.tsx', purpose: 'Workout discovery product moment' },
  ],
  dataModel: 'User { id, name } | Workout { id, title, duration } | Progress { date, completedIds[] }',
  contextContract: '[product-strategy-source][builder-owned] Use useFitness() from FitnessContext for shared state. builder/coder owns architecture and implementation.',
  notes: [
    'Strategic constraint: app must support offline-first workout tracking',
    'Product moment: streak motivator on Home screen drives daily retention',
  ],
  rawResponse: '{}',
};

/** An adapter-generated plan (produced by ArchitectReplacementAdapter). */
const ADAPTER_GENERATED_PLAN: ArchitectPlan = {
  ...CLEAN_DOWNSCOPED_PLAN,
  rawResponse: 'architect-replacement-adapter',
  notes: [
    'adapter-generated — strategic notes from product brief',
    'Strategic constraint: focus on daily habit formation',
  ],
  contextContract: '[adapter-generated] [builder-owned] [market-aware-source] Use useFitness() for shared state',
};

// ── Clean downscoped plan passes ──────────────────────────────────────────────

describe('validateDownscopedArchitectOutput — clean plan passes', () => {
  const result = validateDownscopedArchitectOutput(CLEAN_DOWNSCOPED_PLAN);

  it('ok is true for a clean downscoped plan', () => {
    expect(result.ok).toBe(true);
  });

  it('has no downscope violations', () => {
    expect(result.downscopeViolations).toHaveLength(0);
  });

  it('has no technical ownership signals', () => {
    expect(result.technicalOwnershipSignals).toHaveLength(0);
  });

  it('has no warnings', () => {
    expect(result.warnings).toHaveLength(0);
  });

  it('telemetry validator_ok is true', () => {
    expect(result.telemetry.architect_output_validator_ok).toBe(true);
  });

  it('telemetry violation count is 0', () => {
    expect(result.telemetry.architect_output_downscope_violation_count).toBe(0);
  });

  it('telemetry technical_signal_count is 0', () => {
    expect(result.telemetry.architect_output_technical_signal_count).toBe(0);
  });
});

// ── Scaffold compliance signals recognized ────────────────────────────────────

describe('validateDownscopedArchitectOutput — scaffold compliance signals', () => {
  it('recognizes builder/coder owns in contextContract', () => {
    const result = validateDownscopedArchitectOutput(CLEAN_DOWNSCOPED_PLAN);
    expect(result.scaffoldComplianceSignals.length).toBeGreaterThan(0);
    const combined = result.scaffoldComplianceSignals.join(' ');
    expect(combined.toLowerCase()).toContain('builder/coder owns');
  });

  it('recognizes product moment in pages', () => {
    const result = validateDownscopedArchitectOutput(CLEAN_DOWNSCOPED_PLAN);
    const combined = result.scaffoldComplianceSignals.join(' ');
    expect(combined.toLowerCase()).toContain('product moment');
  });

  it('recognizes [product-strategy-source] in contextContract', () => {
    const result = validateDownscopedArchitectOutput(CLEAN_DOWNSCOPED_PLAN);
    const combined = result.scaffoldComplianceSignals.join(' ');
    expect(combined.toLowerCase()).toContain('product-strategy-source');
  });

  it('recognizes strategic constraint in notes', () => {
    const result = validateDownscopedArchitectOutput(CLEAN_DOWNSCOPED_PLAN);
    const combined = result.scaffoldComplianceSignals.join(' ');
    expect(combined.toLowerCase()).toContain('strategic constraint');
  });

  it('telemetry scaffold_signal_count is greater than 0 for compliant plan', () => {
    const result = validateDownscopedArchitectOutput(CLEAN_DOWNSCOPED_PLAN);
    expect(result.telemetry.architect_output_scaffold_signal_count).toBeGreaterThan(0);
  });

  it('recognizes fileTree/deltaFiles scaffold wording when present', () => {
    const plan: ArchitectPlan = {
      ...CLEAN_DOWNSCOPED_PLAN,
      notes: ['This is pipeline scaffolding that guides the coder'],
    };
    const result = validateDownscopedArchitectOutput(plan);
    const combined = result.scaffoldComplianceSignals.join(' ');
    expect(combined.toLowerCase()).toContain('pipeline scaffolding');
  });

  it('recognizes expected files wording in deltaFiles descriptions', () => {
    const plan: ArchitectPlan = {
      ...CLEAN_DOWNSCOPED_PLAN,
      deltaFiles: [{ path: 'pages/Home.tsx', purpose: 'Expected files for homepage scaffold' }],
    };
    const result = validateDownscopedArchitectOutput(plan);
    const combined = result.scaffoldComplianceSignals.join(' ');
    expect(combined.toLowerCase()).toContain('expected files');
  });

  it('recognizes builder-owned marker in contextContract', () => {
    const plan: ArchitectPlan = {
      ...CLEAN_DOWNSCOPED_PLAN,
      contextContract: '[builder-owned] coder owns architecture decisions',
    };
    const result = validateDownscopedArchitectOutput(plan);
    const combined = result.scaffoldComplianceSignals.join(' ');
    expect(combined.toLowerCase()).toContain('builder-owned');
  });

  it('recognizes product-level in dataModel', () => {
    const plan: ArchitectPlan = {
      ...CLEAN_DOWNSCOPED_PLAN,
      dataModel: 'Product-level only: User { id, name } | Workout { id, title }',
    };
    const result = validateDownscopedArchitectOutput(plan);
    const combined = result.scaffoldComplianceSignals.join(' ');
    expect(combined.toLowerCase()).toContain('product-level');
  });
});

// ── Component hierarchy in notes is detected ─────────────────────────────────

describe('validateDownscopedArchitectOutput — component hierarchy in notes', () => {
  const plan: ArchitectPlan = {
    ...CLEAN_DOWNSCOPED_PLAN,
    notes: [
      'Strategic constraint: focus on habit formation',
      'Implement component hierarchy: HomeScreen > StreakCard > HabitList > HabitItem',
    ],
  };
  const result = validateDownscopedArchitectOutput(plan);

  it('ok is false when component hierarchy is in notes', () => {
    expect(result.ok).toBe(false);
  });

  it('detects component hierarchy as a technical ownership signal', () => {
    const match = result.technicalOwnershipSignals.find(s =>
      s.toLowerCase().includes('component hierarchy'),
    );
    expect(match).toBeDefined();
  });

  it('adds to downscopeViolations', () => {
    expect(result.downscopeViolations.length).toBeGreaterThan(0);
  });

  it('adds to warnings', () => {
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('telemetry validator_ok is false', () => {
    expect(result.telemetry.architect_output_validator_ok).toBe(false);
  });

  it('telemetry violation count is greater than 0', () => {
    expect(result.telemetry.architect_output_downscope_violation_count).toBeGreaterThan(0);
  });

  it('violation includes field reference to notes', () => {
    const violation = result.downscopeViolations.find(v =>
      v.toLowerCase().includes('component hierarchy') && v.toLowerCase().includes('notes'),
    );
    expect(violation).toBeDefined();
  });
});

// ── React state architecture in dataModel is detected ─────────────────────────

describe('validateDownscopedArchitectOutput — react state in dataModel', () => {
  const plan: ArchitectPlan = {
    ...CLEAN_DOWNSCOPED_PLAN,
    dataModel: 'React state management architecture: useReducer for global state, useState for local UI state',
  };
  const result = validateDownscopedArchitectOutput(plan);

  it('ok is false when React state architecture is in dataModel', () => {
    expect(result.ok).toBe(false);
  });

  it('detects react state as a technical ownership signal', () => {
    const match = result.technicalOwnershipSignals.find(s =>
      s.toLowerCase().includes('react state'),
    );
    expect(match).toBeDefined();
  });

  it('violation includes field reference to dataModel', () => {
    const violation = result.downscopeViolations.find(v =>
      v.toLowerCase().includes('react state') && v.toLowerCase().includes('datamodel'),
    );
    expect(violation).toBeDefined();
  });

  it('telemetry technical_signal_count is greater than 0', () => {
    expect(result.telemetry.architect_output_technical_signal_count).toBeGreaterThan(0);
  });
});

// ── Implementation plan in pages is detected ─────────────────────────────────

describe('validateDownscopedArchitectOutput — implementation plan in pages', () => {
  const plan: ArchitectPlan = {
    ...CLEAN_DOWNSCOPED_PLAN,
    pages: [
      {
        path: '/',
        name: 'Home',
        file: 'pages/Home.tsx',
        purpose: 'Implementation plan: render HabitList using map, add streak counter at top, implement pull-to-refresh',
      },
    ],
  };
  const result = validateDownscopedArchitectOutput(plan);

  it('ok is false when implementation plan is in pages', () => {
    expect(result.ok).toBe(false);
  });

  it('detects implementation plan as a technical ownership signal', () => {
    const match = result.technicalOwnershipSignals.find(s =>
      s.toLowerCase().includes('implementation plan'),
    );
    expect(match).toBeDefined();
  });

  it('violation includes field reference to pages', () => {
    const violation = result.downscopeViolations.find(v =>
      v.toLowerCase().includes('implementation plan') && v.toLowerCase().includes('pages'),
    );
    expect(violation).toBeDefined();
  });
});

// ── Final component boundaries in contextContract are detected ────────────────

describe('validateDownscopedArchitectOutput — final component boundaries in contextContract', () => {
  const plan: ArchitectPlan = {
    ...CLEAN_DOWNSCOPED_PLAN,
    contextContract: 'Final component boundaries: HomeScreen wraps StreakCard and HabitList. ' +
      'HabitList owns HabitItem. Do not cross these boundaries.',
  };
  const result = validateDownscopedArchitectOutput(plan);

  it('ok is false when final component boundaries are in contextContract', () => {
    expect(result.ok).toBe(false);
  });

  it('detects component boundaries as a technical ownership signal', () => {
    const match = result.technicalOwnershipSignals.find(s =>
      s.toLowerCase().includes('component boundaries'),
    );
    expect(match).toBeDefined();
  });

  it('violation includes field reference to contextContract', () => {
    const violation = result.downscopeViolations.find(v =>
      v.toLowerCase().includes('component boundaries') && v.toLowerCase().includes('contextcontract'),
    );
    expect(violation).toBeDefined();
  });
});

// ── Adapter-generated plan is accepted as scaffolded ─────────────────────────

describe('validateDownscopedArchitectOutput — adapter-generated plan', () => {
  const result = validateDownscopedArchitectOutput(ADAPTER_GENERATED_PLAN);

  it('ok is true for a clean adapter-generated plan', () => {
    expect(result.ok).toBe(true);
  });

  it('is_adapter_generated telemetry is true', () => {
    expect(result.telemetry.architect_output_is_adapter_generated).toBe(true);
  });

  it('has scaffold compliance signals (adapter-generated marker recognized)', () => {
    const combined = result.scaffoldComplianceSignals.join(' ');
    expect(combined.toLowerCase()).toContain('adapter-generated');
  });

  it('has no violations', () => {
    expect(result.downscopeViolations).toHaveLength(0);
  });

  it('recognizes [adapter-generated] in contextContract as scaffold compliance', () => {
    const plan: ArchitectPlan = {
      ...CLEAN_DOWNSCOPED_PLAN,
      contextContract: '[adapter-generated] [builder-owned] [market-aware-source] ...',
    };
    const r = validateDownscopedArchitectOutput(plan);
    expect(r.telemetry.architect_output_is_adapter_generated).toBe(true);
    expect(r.ok).toBe(true);
  });

  it('recognizes architect-replacement-adapter in rawResponse', () => {
    const plan: ArchitectPlan = {
      ...CLEAN_DOWNSCOPED_PLAN,
      rawResponse: 'architect-replacement-adapter',
    };
    const r = validateDownscopedArchitectOutput(plan);
    expect(r.telemetry.architect_output_is_adapter_generated).toBe(true);
  });

  it('recognizes adapter-generated in notes[0]', () => {
    const plan: ArchitectPlan = {
      ...CLEAN_DOWNSCOPED_PLAN,
      notes: ['adapter-generated — from product brief'],
    };
    const r = validateDownscopedArchitectOutput(plan);
    expect(r.telemetry.architect_output_is_adapter_generated).toBe(true);
  });
});

// ── Non-adapter plan is_adapter_generated is false ────────────────────────────

describe('validateDownscopedArchitectOutput — real architect plan is_adapter_generated', () => {
  it('is_adapter_generated is false for real architect output', () => {
    const result = validateDownscopedArchitectOutput(CLEAN_DOWNSCOPED_PLAN);
    expect(result.telemetry.architect_output_is_adapter_generated).toBe(false);
  });
});

// ── Validator is advisory-only ────────────────────────────────────────────────

describe('validateDownscopedArchitectOutput — advisory-only behavior', () => {
  it('returns a result object (never throws) for clean plan', () => {
    expect(() => validateDownscopedArchitectOutput(CLEAN_DOWNSCOPED_PLAN)).not.toThrow();
  });

  it('returns a result object (never throws) for plan with violations', () => {
    const plan: ArchitectPlan = {
      ...CLEAN_DOWNSCOPED_PLAN,
      notes: ['Build a component hierarchy with reducer for global state management architecture'],
    };
    expect(() => validateDownscopedArchitectOutput(plan)).not.toThrow();
  });

  it('returns a result object (never throws) for minimal/empty plan fields', () => {
    const plan: ArchitectPlan = {
      appName: 'App',
      skeleton: 'mobile-app',
      summary: '',
      fileTree: {},
      deltaFiles: [],
    };
    expect(() => validateDownscopedArchitectOutput(plan)).not.toThrow();
  });

  it('does not mutate the original plan', () => {
    const original = { ...CLEAN_DOWNSCOPED_PLAN, notes: ['Strategic constraint: offline first'] };
    const notesBefore = [...(original.notes ?? [])];
    validateDownscopedArchitectOutput(original);
    expect(original.notes).toEqual(notesBefore);
    expect(original.appName).toBe('FitFlow');
    expect(original.summary).toBe(CLEAN_DOWNSCOPED_PLAN.summary);
  });

  it('does not return a Promise (synchronous)', () => {
    const result = validateDownscopedArchitectOutput(CLEAN_DOWNSCOPED_PLAN);
    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof result.ok).toBe('boolean');
  });

  it('result object has all required fields', () => {
    const result = validateDownscopedArchitectOutput(CLEAN_DOWNSCOPED_PLAN);
    expect(result).toHaveProperty('ok');
    expect(result).toHaveProperty('warnings');
    expect(result).toHaveProperty('technicalOwnershipSignals');
    expect(result).toHaveProperty('scaffoldComplianceSignals');
    expect(result).toHaveProperty('downscopeViolations');
    expect(result).toHaveProperty('telemetry');
  });

  it('telemetry has all required keys', () => {
    const { telemetry } = validateDownscopedArchitectOutput(CLEAN_DOWNSCOPED_PLAN);
    expect(telemetry).toHaveProperty('architect_output_validator_ok');
    expect(telemetry).toHaveProperty('architect_output_technical_signal_count');
    expect(telemetry).toHaveProperty('architect_output_downscope_violation_count');
    expect(telemetry).toHaveProperty('architect_output_scaffold_signal_count');
    expect(telemetry).toHaveProperty('architect_output_is_adapter_generated');
  });
});

// ── No real LLM calls ─────────────────────────────────────────────────────────

describe('validateDownscopedArchitectOutput — no real LLM calls', () => {
  it('is synchronous (boolean ok, not a Promise)', () => {
    const result = validateDownscopedArchitectOutput(CLEAN_DOWNSCOPED_PLAN);
    expect(typeof result.ok).toBe('boolean');
  });

  it('clean plan result is deterministic across multiple calls', () => {
    const r1 = validateDownscopedArchitectOutput(CLEAN_DOWNSCOPED_PLAN);
    const r2 = validateDownscopedArchitectOutput(CLEAN_DOWNSCOPED_PLAN);
    expect(r1.ok).toBe(r2.ok);
    expect(r1.downscopeViolations).toEqual(r2.downscopeViolations);
    expect(r1.telemetry).toEqual(r2.telemetry);
  });

  it('violation plan result is deterministic across multiple calls', () => {
    const plan: ArchitectPlan = {
      ...CLEAN_DOWNSCOPED_PLAN,
      notes: ['Build component hierarchy with React state'],
    };
    const r1 = validateDownscopedArchitectOutput(plan);
    const r2 = validateDownscopedArchitectOutput(plan);
    expect(r1.ok).toBe(r2.ok);
    expect(r1.downscopeViolations).toEqual(r2.downscopeViolations);
  });
});

// ── Additional technical ownership signal detection ───────────────────────────

describe('validateDownscopedArchitectOutput — additional technical ownership signals', () => {
  it('detects redux store in notes', () => {
    const plan: ArchitectPlan = {
      ...CLEAN_DOWNSCOPED_PLAN,
      notes: ['Use redux store for global state'],
    };
    const result = validateDownscopedArchitectOutput(plan);
    expect(result.ok).toBe(false);
    expect(result.technicalOwnershipSignals.some(s => s.toLowerCase().includes('redux store'))).toBe(true);
  });

  it('detects api schema in dataModel', () => {
    const plan: ArchitectPlan = {
      ...CLEAN_DOWNSCOPED_PLAN,
      dataModel: 'API schema: POST /workouts, GET /progress with auth header',
    };
    const result = validateDownscopedArchitectOutput(plan);
    expect(result.ok).toBe(false);
    expect(result.technicalOwnershipSignals.some(s => s.toLowerCase().includes('api schema'))).toBe(true);
  });

  it('detects tailwind layout in contextContract', () => {
    const plan: ArchitectPlan = {
      ...CLEAN_DOWNSCOPED_PLAN,
      contextContract: 'Use Tailwind layout classes: flex flex-col gap-4 for all page containers',
    };
    const result = validateDownscopedArchitectOutput(plan);
    expect(result.ok).toBe(false);
    expect(result.technicalOwnershipSignals.some(s => s.toLowerCase().includes('tailwind layout'))).toBe(true);
  });

  it('detects store architecture in notes', () => {
    const plan: ArchitectPlan = {
      ...CLEAN_DOWNSCOPED_PLAN,
      notes: ['Design the store architecture before coding'],
    };
    const result = validateDownscopedArchitectOutput(plan);
    expect(result.ok).toBe(false);
    expect(result.technicalOwnershipSignals.some(s => s.toLowerCase().includes('store architecture'))).toBe(true);
  });

  it('detects internal state plan in notes', () => {
    const plan: ArchitectPlan = {
      ...CLEAN_DOWNSCOPED_PLAN,
      notes: ['Internal state plan: use Context API with reducer for auth'],
    };
    const result = validateDownscopedArchitectOutput(plan);
    expect(result.ok).toBe(false);
    expect(result.technicalOwnershipSignals.some(s => s.toLowerCase().includes('internal state plan'))).toBe(true);
  });
});
