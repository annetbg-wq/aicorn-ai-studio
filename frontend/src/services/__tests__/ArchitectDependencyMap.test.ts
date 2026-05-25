// @vitest-environment jsdom
/**
 * ArchitectDependencyMap — deterministic tests for the dependency classification
 * and role diagnostics helpers.
 *
 * All tests use hand-crafted inputs (no LLM calls).
 * Verifies:
 *   - full architect plan maps required fields correctly
 *   - technical file tree ownership is detected
 *   - duplicated product strategy is detected
 *   - missing required pipeline fields are detected
 *   - candidate downscope fields are identified
 *   - diagnostics are advisory-only (no pipeline change)
 *   - no real LLM calls
 */

import { describe, expect, it } from 'vitest';
import {
  buildArchitectDependencyMap,
  evaluateArchitectRoleDiagnostics,
  serializeArchitectDependencyTelemetry,
  type ArchitectDependencyMap,
  type ArchitectRoleDiagnosticsResult,
} from '../ArchitectDependencyMap';
import type { ArchitectPlan } from '../ProtoPipeline';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FULL_PLAN: ArchitectPlan = {
  appName:     'HabitFlow',
  skeleton:    'mobile-app',
  summary:     'A daily habit tracker that helps users build streaks and stay accountable.',
  rawResponse: '{"appName":"HabitFlow","skeleton":"mobile-app","summary":"...","fileTree":{}}',
  fileTree: {
    'pages/Home.tsx':       'Today screen with habit list and streak summary.',
    'pages/Create.tsx':     'Create habit form.',
    'pages/Progress.tsx':   'Weekly completion stats.',
    'hooks/useHabits.ts':   'Shared habit state hook.',
    'data/types.ts':        'Habit domain types.',
    'config/routes.ts':     'Route registry.',
  },
  deltaFiles: [
    { path: 'pages/Home.tsx',     purpose: 'Today screen' },
    { path: 'pages/Create.tsx',   purpose: 'Create form' },
    { path: 'hooks/useHabits.ts', purpose: 'State hook' },
  ],
  pages: [
    { path: '/home',    name: 'Home',    file: 'pages/Home.tsx',   purpose: 'Today' },
    { path: '/create',  name: 'Create',  file: 'pages/Create.tsx', purpose: 'Create' },
  ],
  notes: [
    'Use bottom tabs for navigation.',
    'Persist habits with localStorage.',
  ],
  contextContract: 'Use useApp() from AppContext, not useLocalStorage directly.',
  dataModel:      'Habit { id, title, cadence, streak, completions[] }',
};

const MINIMAL_PLAN: ArchitectPlan = {
  appName:   'App',
  summary:   '',
  fileTree:  { 'pages/Home.tsx': 'Home screen.' },
  deltaFiles: [{ path: 'pages/Home.tsx', purpose: 'Home screen' }],
};

const EMPTY_FIELDS_PLAN: ArchitectPlan = {
  appName:   'App',
  summary:   '',
  fileTree:  {},
  deltaFiles: [],
};

// ── buildArchitectDependencyMap — required fields ─────────────────────────────

describe('buildArchitectDependencyMap — required fields', () => {
  it('classifies deltaFiles as required_for_pipeline and required_for_compile_or_files', () => {
    const map = buildArchitectDependencyMap(FULL_PLAN);
    expect(map.required_for_pipeline).toContain('deltaFiles');
    expect(map.required_for_compile_or_files).toContain('deltaFiles');
  });

  it('classifies fileTree as required_for_pipeline, required_for_compile_or_files, and required_for_planners', () => {
    const map = buildArchitectDependencyMap(FULL_PLAN);
    expect(map.required_for_pipeline).toContain('fileTree');
    expect(map.required_for_compile_or_files).toContain('fileTree');
    expect(map.required_for_planners).toContain('fileTree');
  });

  it('classifies appName as required_for_compile_or_files', () => {
    const map = buildArchitectDependencyMap(FULL_PLAN);
    expect(map.required_for_compile_or_files).toContain('appName');
  });

  it('classifies pages as required_for_compile_or_files and required_for_planners', () => {
    const map = buildArchitectDependencyMap(FULL_PLAN);
    expect(map.required_for_compile_or_files).toContain('pages');
    expect(map.required_for_planners).toContain('pages');
  });

  it('classifies contextContract as required_for_compile_or_files', () => {
    const map = buildArchitectDependencyMap(FULL_PLAN);
    expect(map.required_for_compile_or_files).toContain('contextContract');
  });

  it('classifies dataModel as required_for_planners', () => {
    const map = buildArchitectDependencyMap(FULL_PLAN);
    expect(map.required_for_planners).toContain('dataModel');
  });

  it('returns all 10 known fields', () => {
    const map = buildArchitectDependencyMap(FULL_PLAN);
    expect(map.fields).toHaveLength(10);
    const fieldNames = map.fields.map(f => f.field);
    expect(fieldNames).toContain('appName');
    expect(fieldNames).toContain('skeleton');
    expect(fieldNames).toContain('summary');
    expect(fieldNames).toContain('rawResponse');
    expect(fieldNames).toContain('fileTree');
    expect(fieldNames).toContain('deltaFiles');
    expect(fieldNames).toContain('pages');
    expect(fieldNames).toContain('notes');
    expect(fieldNames).toContain('contextContract');
    expect(fieldNames).toContain('dataModel');
  });
});

// ── buildArchitectDependencyMap — advisory and candidate fields ───────────────

describe('buildArchitectDependencyMap — advisory and candidate fields', () => {
  it('classifies summary as advisory_for_coder', () => {
    const map = buildArchitectDependencyMap(FULL_PLAN);
    expect(map.advisory_for_coder).toContain('summary');
  });

  it('classifies notes as advisory_for_coder', () => {
    const map = buildArchitectDependencyMap(FULL_PLAN);
    expect(map.advisory_for_coder).toContain('notes');
  });

  it('classifies summary and notes as duplicated_by_market_aware_brief', () => {
    const map = buildArchitectDependencyMap(FULL_PLAN);
    expect(map.duplicated_by_market_aware_brief).toContain('summary');
    expect(map.duplicated_by_market_aware_brief).toContain('notes');
  });

  it('classifies summary, notes, skeleton, rawResponse as candidate_for_removal_or_downscoping', () => {
    const map = buildArchitectDependencyMap(FULL_PLAN);
    const candidates = map.candidate_for_removal_or_downscoping;
    expect(candidates).toContain('summary');
    expect(candidates).toContain('notes');
    expect(candidates).toContain('skeleton');
    expect(candidates).toContain('rawResponse');
  });

  it('does NOT classify fileTree or deltaFiles as candidate for downscoping', () => {
    const map = buildArchitectDependencyMap(FULL_PLAN);
    expect(map.candidate_for_removal_or_downscoping).not.toContain('fileTree');
    expect(map.candidate_for_removal_or_downscoping).not.toContain('deltaFiles');
  });
});

// ── buildArchitectDependencyMap — presentInPlan ───────────────────────────────

describe('buildArchitectDependencyMap — presentInPlan detection', () => {
  it('marks present fields correctly for full plan', () => {
    const map = buildArchitectDependencyMap(FULL_PLAN);
    const byField = Object.fromEntries(map.fields.map(f => [f.field, f.presentInPlan]));
    expect(byField['appName']).toBe(true);
    expect(byField['summary']).toBe(true);
    expect(byField['fileTree']).toBe(true);
    expect(byField['deltaFiles']).toBe(true);
    expect(byField['pages']).toBe(true);
    expect(byField['notes']).toBe(true);
    expect(byField['contextContract']).toBe(true);
    expect(byField['dataModel']).toBe(true);
    expect(byField['skeleton']).toBe(true);
    expect(byField['rawResponse']).toBe(true);
  });

  it('marks absent fields as not present for minimal plan', () => {
    const map = buildArchitectDependencyMap(MINIMAL_PLAN);
    const byField = Object.fromEntries(map.fields.map(f => [f.field, f.presentInPlan]));
    expect(byField['contextContract']).toBe(false);
    expect(byField['dataModel']).toBe(false);
    expect(byField['notes']).toBe(false);
    expect(byField['pages']).toBe(false);
    expect(byField['rawResponse']).toBe(false);
  });

  it('marks empty string summary as not present', () => {
    const map = buildArchitectDependencyMap(MINIMAL_PLAN);
    const summaryEntry = map.fields.find(f => f.field === 'summary');
    expect(summaryEntry?.presentInPlan).toBe(false);
  });

  it('marks empty fileTree as not present', () => {
    const map = buildArchitectDependencyMap(EMPTY_FIELDS_PLAN);
    const fileTreeEntry = map.fields.find(f => f.field === 'fileTree');
    expect(fileTreeEntry?.presentInPlan).toBe(false);
  });

  it('marks empty deltaFiles array as not present', () => {
    const map = buildArchitectDependencyMap(EMPTY_FIELDS_PLAN);
    const deltaEntry = map.fields.find(f => f.field === 'deltaFiles');
    expect(deltaEntry?.presentInPlan).toBe(false);
  });
});

// ── evaluateArchitectRoleDiagnostics — technical ownership ────────────────────

describe('evaluateArchitectRoleDiagnostics — technical file tree ownership', () => {
  it('detects technical ownership when fileTree is non-empty', () => {
    const result = evaluateArchitectRoleDiagnostics(FULL_PLAN, {
      marketAwareBriefInjected: true,
      builderOwnedSelfPlanInjected: true,
    });
    expect(result.architect_technical_ownership_detected).toBe(true);
  });

  it('detects technical ownership when only deltaFiles is non-empty', () => {
    const plan: ArchitectPlan = { ...MINIMAL_PLAN, fileTree: {} };
    const result = evaluateArchitectRoleDiagnostics(plan, {
      marketAwareBriefInjected: true,
      builderOwnedSelfPlanInjected: true,
    });
    expect(result.architect_technical_ownership_detected).toBe(true);
  });

  it('does not detect ownership when both fileTree and deltaFiles are empty', () => {
    const result = evaluateArchitectRoleDiagnostics(EMPTY_FIELDS_PLAN, {
      marketAwareBriefInjected: true,
      builderOwnedSelfPlanInjected: true,
    });
    expect(result.architect_technical_ownership_detected).toBe(false);
  });

  it('emits ARCH_OWNS_FILE_TREE issue when ownership is detected', () => {
    const result = evaluateArchitectRoleDiagnostics(FULL_PLAN, {
      marketAwareBriefInjected: true,
      builderOwnedSelfPlanInjected: true,
    });
    const codes = result.issues.map(i => i.code);
    expect(codes).toContain('ARCH_OWNS_FILE_TREE');
  });

  it('does not emit ARCH_OWNS_FILE_TREE when ownership is not detected', () => {
    const result = evaluateArchitectRoleDiagnostics(EMPTY_FIELDS_PLAN, {
      marketAwareBriefInjected: true,
      builderOwnedSelfPlanInjected: true,
    });
    const codes = result.issues.map(i => i.code);
    expect(codes).not.toContain('ARCH_OWNS_FILE_TREE');
  });
});

// ── evaluateArchitectRoleDiagnostics — duplicate product strategy ─────────────

describe('evaluateArchitectRoleDiagnostics — duplicated product strategy', () => {
  it('detects duplicate when market brief is injected and summary is non-empty', () => {
    const plan: ArchitectPlan = { ...FULL_PLAN, summary: 'A great app' };
    const result = evaluateArchitectRoleDiagnostics(plan, {
      marketAwareBriefInjected: true,
      builderOwnedSelfPlanInjected: false,
    });
    expect(result.duplicate_product_strategy_detected).toBe(true);
    expect(result.issues.map(i => i.code)).toContain('DUPLICATE_PRODUCT_STRATEGY');
  });

  it('detects duplicate when market brief is injected and notes are non-empty', () => {
    const plan: ArchitectPlan = { ...MINIMAL_PLAN, notes: ['Use bottom tabs.'] };
    const result = evaluateArchitectRoleDiagnostics(plan, {
      marketAwareBriefInjected: true,
      builderOwnedSelfPlanInjected: false,
    });
    expect(result.duplicate_product_strategy_detected).toBe(true);
  });

  it('does NOT detect duplicate when market brief is NOT injected', () => {
    const result = evaluateArchitectRoleDiagnostics(FULL_PLAN, {
      marketAwareBriefInjected: false,
      builderOwnedSelfPlanInjected: false,
    });
    expect(result.duplicate_product_strategy_detected).toBe(false);
  });

  it('does NOT detect duplicate when summary and notes are both absent', () => {
    const plan: ArchitectPlan = { ...MINIMAL_PLAN, summary: '', notes: [] };
    const result = evaluateArchitectRoleDiagnostics(plan, {
      marketAwareBriefInjected: true,
      builderOwnedSelfPlanInjected: false,
    });
    expect(result.duplicate_product_strategy_detected).toBe(false);
  });
});

// ── evaluateArchitectRoleDiagnostics — conflicting architecture instructions ───

describe('evaluateArchitectRoleDiagnostics — conflicting architecture instructions', () => {
  it('detects conflict when builder self-plan injected and fileTree is non-empty', () => {
    const result = evaluateArchitectRoleDiagnostics(FULL_PLAN, {
      marketAwareBriefInjected: true,
      builderOwnedSelfPlanInjected: true,
    });
    expect(result.conflicting_architecture_instructions).toBe(true);
    expect(result.issues.map(i => i.code)).toContain('CONFLICTING_ARCH_INSTRUCTIONS');
  });

  it('does NOT detect conflict when builder self-plan is NOT injected', () => {
    const result = evaluateArchitectRoleDiagnostics(FULL_PLAN, {
      marketAwareBriefInjected: true,
      builderOwnedSelfPlanInjected: false,
    });
    expect(result.conflicting_architecture_instructions).toBe(false);
  });

  it('does NOT detect conflict when fileTree is empty even if self-plan is injected', () => {
    const result = evaluateArchitectRoleDiagnostics(EMPTY_FIELDS_PLAN, {
      marketAwareBriefInjected: true,
      builderOwnedSelfPlanInjected: true,
    });
    expect(result.conflicting_architecture_instructions).toBe(false);
  });
});

// ── evaluateArchitectRoleDiagnostics — missing required pipeline fields ────────

describe('evaluateArchitectRoleDiagnostics — missing required pipeline fields', () => {
  it('lists fileTree and deltaFiles as missing if reduced (full plan)', () => {
    const result = evaluateArchitectRoleDiagnostics(FULL_PLAN, {
      marketAwareBriefInjected: true,
      builderOwnedSelfPlanInjected: true,
    });
    expect(result.missing_required_fields_if_reduced).toContain('fileTree');
    expect(result.missing_required_fields_if_reduced).toContain('deltaFiles');
  });

  it('lists appName, pages, contextContract in missing_required_fields_if_reduced when present', () => {
    const result = evaluateArchitectRoleDiagnostics(FULL_PLAN, {
      marketAwareBriefInjected: true,
      builderOwnedSelfPlanInjected: true,
    });
    expect(result.missing_required_fields_if_reduced).toContain('appName');
    expect(result.missing_required_fields_if_reduced).toContain('pages');
    expect(result.missing_required_fields_if_reduced).toContain('contextContract');
  });

  it('does NOT include absent optional fields in missing_required_fields_if_reduced', () => {
    // MINIMAL_PLAN has no contextContract, pages, dataModel, etc.
    const result = evaluateArchitectRoleDiagnostics(MINIMAL_PLAN, {
      marketAwareBriefInjected: true,
      builderOwnedSelfPlanInjected: true,
    });
    expect(result.missing_required_fields_if_reduced).not.toContain('contextContract');
    expect(result.missing_required_fields_if_reduced).not.toContain('pages');
  });
});

// ── evaluateArchitectRoleDiagnostics — candidate downscope fields ─────────────

describe('evaluateArchitectRoleDiagnostics — candidate downscope fields', () => {
  it('lists summary and notes as safe to move to product strategist brief', () => {
    const result = evaluateArchitectRoleDiagnostics(FULL_PLAN, {
      marketAwareBriefInjected: true,
      builderOwnedSelfPlanInjected: true,
    });
    expect(result.fields_safe_to_move_to_product_strategist).toContain('summary');
    expect(result.fields_safe_to_move_to_product_strategist).toContain('notes');
  });

  it('lists skeleton and rawResponse as safe to move/downscope', () => {
    const result = evaluateArchitectRoleDiagnostics(FULL_PLAN, {
      marketAwareBriefInjected: true,
      builderOwnedSelfPlanInjected: true,
    });
    expect(result.fields_safe_to_move_to_product_strategist).toContain('skeleton');
    expect(result.fields_safe_to_move_to_product_strategist).toContain('rawResponse');
  });

  it('does NOT list fileTree, deltaFiles as safe to move', () => {
    const result = evaluateArchitectRoleDiagnostics(FULL_PLAN, {
      marketAwareBriefInjected: true,
      builderOwnedSelfPlanInjected: true,
    });
    expect(result.fields_safe_to_move_to_product_strategist).not.toContain('fileTree');
    expect(result.fields_safe_to_move_to_product_strategist).not.toContain('deltaFiles');
  });

  it('lists fileTree and deltaFiles as fields that must remain until replacement', () => {
    const result = evaluateArchitectRoleDiagnostics(FULL_PLAN, {
      marketAwareBriefInjected: true,
      builderOwnedSelfPlanInjected: true,
    });
    expect(result.fields_must_remain_until_replacement).toContain('fileTree');
    expect(result.fields_must_remain_until_replacement).toContain('deltaFiles');
  });
});

// ── diagnostics are advisory-only ────────────────────────────────────────────

describe('diagnostics are advisory-only — no pipeline side effects', () => {
  it('evaluateArchitectRoleDiagnostics returns a plain result object with no side effects', () => {
    const planCopy = JSON.parse(JSON.stringify(FULL_PLAN)) as ArchitectPlan;
    const result = evaluateArchitectRoleDiagnostics(planCopy, {
      marketAwareBriefInjected: true,
      builderOwnedSelfPlanInjected: true,
    });
    // Plan is not mutated
    expect(planCopy).toEqual(FULL_PLAN);
    // Result is a plain object — no thrown errors, no blocking
    expect(typeof result).toBe('object');
    expect(result.issues).toBeDefined();
  });

  it('buildArchitectDependencyMap does not mutate the input plan', () => {
    const planCopy = JSON.parse(JSON.stringify(FULL_PLAN)) as ArchitectPlan;
    buildArchitectDependencyMap(planCopy);
    expect(planCopy).toEqual(FULL_PLAN);
  });

  it('serializeArchitectDependencyTelemetry returns all five telemetry keys', () => {
    const map = buildArchitectDependencyMap(FULL_PLAN);
    const diag = evaluateArchitectRoleDiagnostics(FULL_PLAN, {
      marketAwareBriefInjected: true,
      builderOwnedSelfPlanInjected: true,
    });
    const tel = serializeArchitectDependencyTelemetry(map, diag);
    expect(typeof tel.architect_dependency_required_count).toBe('number');
    expect(typeof tel.architect_dependency_advisory_count).toBe('number');
    expect(typeof tel.architect_fields_candidate_for_downscope_count).toBe('number');
    expect(typeof tel.architect_technical_ownership_detected).toBe('boolean');
    expect(typeof tel.replacement_adapter_needed).toBe('boolean');
  });

  it('replacement_adapter_needed is true when required pipeline fields are present', () => {
    const map = buildArchitectDependencyMap(FULL_PLAN);
    const diag = evaluateArchitectRoleDiagnostics(FULL_PLAN, {
      marketAwareBriefInjected: true,
      builderOwnedSelfPlanInjected: true,
    });
    const tel = serializeArchitectDependencyTelemetry(map, diag);
    expect(tel.replacement_adapter_needed).toBe(true);
  });

  it('architect_dependency_required_count is positive for full plan', () => {
    const map = buildArchitectDependencyMap(FULL_PLAN);
    const diag = evaluateArchitectRoleDiagnostics(FULL_PLAN, {
      marketAwareBriefInjected: true,
      builderOwnedSelfPlanInjected: true,
    });
    const tel = serializeArchitectDependencyTelemetry(map, diag);
    expect(tel.architect_dependency_required_count).toBeGreaterThan(0);
  });

  it('architect_fields_candidate_for_downscope_count matches candidate list length', () => {
    const map = buildArchitectDependencyMap(FULL_PLAN);
    const diag = evaluateArchitectRoleDiagnostics(FULL_PLAN, {
      marketAwareBriefInjected: true,
      builderOwnedSelfPlanInjected: true,
    });
    const tel = serializeArchitectDependencyTelemetry(map, diag);
    expect(tel.architect_fields_candidate_for_downscope_count).toBe(
      map.candidate_for_removal_or_downscoping.length,
    );
  });
});

// ── ProtoPipeline still exports required symbols ──────────────────────────────

describe('ProtoPipeline — runArchitect still present after dependency map wiring', () => {
  it('ProtoPipeline module loads correctly', async () => {
    const pipeline = await import('../ProtoPipeline');
    expect(pipeline).toBeDefined();
  }, 30_000);

  it('buildCoderPlanningBlocks is still exported', async () => {
    const pipeline = await import('../ProtoPipeline');
    expect(typeof pipeline.buildCoderPlanningBlocks).toBe('function');
  }, 30_000);

  it('buildUiPrimitiveImportCatalog is still exported', async () => {
    const pipeline = await import('../ProtoPipeline');
    expect(typeof pipeline.buildUiPrimitiveImportCatalog).toBe('function');
  }, 30_000);

  it('evaluatePrototypeQualityGate is still exported (quality gate not modified)', async () => {
    const pipeline = await import('../ProtoPipeline');
    expect(typeof pipeline.evaluatePrototypeQualityGate).toBe('function');
  }, 30_000);
});

// ── ArchitectDependencyMap module exports ─────────────────────────────────────

describe('ArchitectDependencyMap — module exports', () => {
  it('exports buildArchitectDependencyMap as a function', () => {
    expect(typeof buildArchitectDependencyMap).toBe('function');
  });

  it('exports evaluateArchitectRoleDiagnostics as a function', () => {
    expect(typeof evaluateArchitectRoleDiagnostics).toBe('function');
  });

  it('exports serializeArchitectDependencyTelemetry as a function', () => {
    expect(typeof serializeArchitectDependencyTelemetry).toBe('function');
  });
});
