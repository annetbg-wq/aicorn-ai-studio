/**
 * ArchitectOutputValidator — deterministic advisory validator for downscoped
 * runArchitect output.
 *
 * Advisory/diagnostic only. Does NOT block generation.
 * Does NOT mutate the plan.
 * Does NOT trigger repair.
 * Does NOT alter fallback behavior.
 * Does NOT call any LLM.
 *
 * Purpose: validate that the final ArchitectPlan (after runArchitect and after
 * any controlled adapter fallback) follows the downscoped product-strategist
 * contract introduced by PR #19/#20:
 *   - fileTree/deltaFiles = minimal pipeline scaffolding
 *   - pages = product moments
 *   - dataModel = product-level only
 *   - notes = strategic constraints
 *   - builder/coder owns architecture + implementation + self-test
 *
 * Violations are logged as warnings but never block the pipeline.
 */

import type { ArchitectPlan } from './ProtoPipeline';

// ── Result type ───────────────────────────────────────────────────────────────

export interface ArchitectOutputValidationTelemetry {
  architect_output_validator_ok: boolean;
  architect_output_technical_signal_count: number;
  architect_output_downscope_violation_count: number;
  architect_output_scaffold_signal_count: number;
  /** True when the plan was produced by ArchitectReplacementAdapter, not runArchitect. */
  architect_output_is_adapter_generated: boolean;
}

export interface ArchitectOutputValidationResult {
  /** True when no downscope violations were detected. */
  ok: boolean;
  /** Human-readable advisory warnings (superset of violations). */
  warnings: string[];
  /** Detected signals of excessive technical ownership. */
  technicalOwnershipSignals: string[];
  /** Detected signals of proper downscoped/scaffolded wording. */
  scaffoldComplianceSignals: string[];
  /** Specific downscope contract violations (subset of technicalOwnershipSignals). */
  downscopeViolations: string[];
  telemetry: ArchitectOutputValidationTelemetry;
}

// ── Bad signal patterns — excessive technical ownership ───────────────────────

interface SignalPattern {
  /** Lowercase substring to search for. */
  pattern: string;
  /** Human-readable description of the violation. */
  description: string;
}

const TECHNICAL_OWNERSHIP_PATTERNS: ReadonlyArray<SignalPattern> = [
  { pattern: 'component hierarchy',        description: 'Detailed component hierarchy ownership' },
  { pattern: 'component tree',             description: 'Detailed component tree ownership' },
  { pattern: 'react state',                description: 'React state architecture ownership' },
  { pattern: 'usestate(',                  description: 'React useState implementation ownership' },
  { pattern: 'usereducer(',                description: 'React useReducer implementation ownership' },
  { pattern: 'reducer/',                   description: 'Reducer internal state plan' },
  { pattern: 'redux store',                description: 'Redux store architecture ownership' },
  { pattern: 'zustand store',              description: 'Zustand store architecture ownership' },
  { pattern: 'state management architecture', description: 'State management architecture ownership' },
  { pattern: 'implementation plan',        description: 'Implementation plan ownership' },
  { pattern: 'final component boundaries', description: 'Final component boundaries ownership' },
  { pattern: 'component boundaries',       description: 'Component boundaries ownership' },
  { pattern: 'tailwind layout',            description: 'Detailed Tailwind layout instructions' },
  { pattern: 'css class names',            description: 'Detailed CSS class instructions' },
  { pattern: 'api schema',                 description: 'Detailed API/backend schema ownership' },
  { pattern: 'backend schema',             description: 'Backend schema ownership' },
  { pattern: 'database schema',            description: 'Database schema ownership (not product-level)' },
  { pattern: 'exactly how to implement',   description: 'Instructions telling coder exactly how to implement' },
  { pattern: 'how to code',                description: 'Instructions telling coder how to code' },
  { pattern: 'internal state plan',        description: 'Internal state plan ownership' },
  { pattern: 'store architecture',         description: 'Store/state architecture ownership' },
] as const;

// ── Good signal patterns — downscoped/scaffold compliance ─────────────────────

const SCAFFOLD_COMPLIANCE_PATTERNS: ReadonlyArray<SignalPattern> = [
  { pattern: 'scaffold',                   description: 'fileTree/deltaFiles described as scaffold' },
  { pattern: 'expected files',             description: 'deltaFiles described as expected files' },
  { pattern: 'product moment',             description: 'Pages described as product moments' },
  { pattern: 'product-level',              description: 'dataModel described as product-level only' },
  { pattern: 'builder/coder owns',         description: 'contextContract states builder/coder owns architecture' },
  { pattern: '[builder-owned]',            description: 'contextContract has [builder-owned] marker' },
  { pattern: 'builder-owned',              description: 'contextContract has builder-owned marker' },
  { pattern: 'strategic constraint',       description: 'Notes are strategic constraints' },
  { pattern: '[product-strategy-source]',  description: 'contextContract has product-strategy-source marker' },
  { pattern: 'adapter-generated',          description: 'Plan is adapter-generated (accepted as scaffolded)' },
  { pattern: 'pipeline scaffolding',       description: 'Plan explicitly describes pipeline scaffolding intent' },
] as const;

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Extract all searchable text from a plan field value into a single lowercase string. */
function extractFieldText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.toLowerCase();
  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') return Object.values(item as Record<string, unknown>).join(' ');
        return '';
      })
      .join(' ')
      .toLowerCase();
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map(v => (typeof v === 'string' ? v : ''))
      .join(' ')
      .toLowerCase();
  }
  return '';
}

/** Collect text from each ArchitectPlan field that may contain advisory content. */
function collectPlanText(plan: ArchitectPlan): Record<string, string> {
  return {
    fileTree:        extractFieldText(plan.fileTree),
    deltaFiles:      extractFieldText(plan.deltaFiles),
    pages:           extractFieldText(plan.pages),
    dataModel:       extractFieldText(plan.dataModel),
    contextContract: extractFieldText(plan.contextContract),
    notes:           extractFieldText(plan.notes),
    summary:         extractFieldText(plan.summary),
    rawResponse:     extractFieldText(plan.rawResponse),
  };
}

/** Scan a pattern against all field texts; return matched field names. */
function findPatternInFields(
  pattern: string,
  fieldTexts: Record<string, string>,
): string[] {
  return Object.entries(fieldTexts)
    .filter(([, text]) => text.includes(pattern))
    .map(([field]) => field);
}

/** True when the plan was generated by ArchitectReplacementAdapter, not runArchitect. */
function isAdapterGenerated(plan: ArchitectPlan): boolean {
  if (plan.rawResponse === 'architect-replacement-adapter') return true;
  if (Array.isArray(plan.notes) && plan.notes.length > 0 && plan.notes[0].includes('adapter-generated')) return true;
  if (typeof plan.contextContract === 'string' && plan.contextContract.includes('[adapter-generated]')) return true;
  return false;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validate that an ArchitectPlan follows the downscoped product-strategist contract.
 *
 * Deterministic — no LLM calls.
 * Advisory only — does not block generation, does not mutate plan, does not trigger repair.
 *
 * Should be called after runArchitect and after controlled adapter fallback so it
 * validates the final plan used by the pipeline.
 */
export function validateDownscopedArchitectOutput(plan: ArchitectPlan): ArchitectOutputValidationResult {
  const fieldTexts = collectPlanText(plan);
  const adapterGenerated = isAdapterGenerated(plan);

  const technicalOwnershipSignals: string[] = [];
  const downscopeViolations: string[] = [];
  const scaffoldComplianceSignals: string[] = [];
  const warnings: string[] = [];

  // Detect technical ownership signals (bad)
  for (const { pattern, description } of TECHNICAL_OWNERSHIP_PATTERNS) {
    const matchedFields = findPatternInFields(pattern, fieldTexts);
    if (matchedFields.length > 0) {
      const signal = `${description} [pattern: "${pattern}", fields: ${matchedFields.join(', ')}]`;
      technicalOwnershipSignals.push(signal);
      downscopeViolations.push(signal);
      warnings.push(`[downscope-violation] ${signal}`);
    }
  }

  // Detect scaffold compliance signals (good)
  for (const { pattern, description } of SCAFFOLD_COMPLIANCE_PATTERNS) {
    const matchedFields = findPatternInFields(pattern, fieldTexts);
    if (matchedFields.length > 0) {
      scaffoldComplianceSignals.push(`${description} [pattern: "${pattern}", fields: ${matchedFields.join(', ')}]`);
    }
  }

  // Adapter-generated plans are always accepted as scaffolded (marker-based compliance)
  if (adapterGenerated && !scaffoldComplianceSignals.some(s => s.includes('adapter-generated'))) {
    scaffoldComplianceSignals.push('Plan is adapter-generated (accepted as scaffolded) [fields: rawResponse]');
  }

  const ok = downscopeViolations.length === 0;

  return {
    ok,
    warnings,
    technicalOwnershipSignals,
    scaffoldComplianceSignals,
    downscopeViolations,
    telemetry: {
      architect_output_validator_ok:              ok,
      architect_output_technical_signal_count:    technicalOwnershipSignals.length,
      architect_output_downscope_violation_count: downscopeViolations.length,
      architect_output_scaffold_signal_count:     scaffoldComplianceSignals.length,
      architect_output_is_adapter_generated:      adapterGenerated,
    },
  };
}
