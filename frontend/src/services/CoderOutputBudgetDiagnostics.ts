/**
 * CoderOutputBudgetDiagnostics.ts
 *
 * Pure diagnostic helpers for coder output-budget and truncation-risk assessment.
 *
 * Purpose: gather evidence before changing STEP_BUDGET.coder.maxTokens.
 * This module does NOT block generation, does NOT change behavior, and does
 * NOT log generated code, prompt text, or secrets.
 *
 * Used in: ProtoPipeline.runCoder (post-call diagnostic logging)
 * Part of: p2/diagnose-coder-output-budget-and-truncation-risk
 */

// ── Risk level ────────────────────────────────────────────────────────────────

/**
 * Classification of whether the coder output-token budget is correctly sized.
 *
 *   likely_too_low   — Evidence that the budget caused truncation or missing files.
 *   probably_adequate — All expected files parsed; budget appears to have been sufficient.
 *   high_but_needed  — Budget is high (>16 000) but all expected files were produced;
 *                      the high budget appears justified by the file count / output size.
 *   inconclusive     — Insufficient data to make a safe call either way.
 */
export type CoderOutputBudgetRiskLevel =
  | 'likely_too_low'
  | 'probably_adequate'
  | 'high_but_needed'
  | 'inconclusive';

// ── Input / output interfaces ─────────────────────────────────────────────────

export interface CoderOutputBudgetRiskInput {
  /** maxTokens requested for this coder call (STEP_BUDGET.coder.maxTokens). */
  requestedMaxTokens: number;
  /** Number of delta files the architect plan expects. */
  expectedFileCount: number;
  /** Number of files successfully parsed from the coder output (after retry). */
  parsedFileCount: number;
  /** Total character count of the raw streamed output (body.length). */
  outputCharCount: number;
  /** High-level parse outcome. */
  parseStatus: 'ok' | 'missing_files' | 'parse_failed' | 'retry_recovered';
  /** Whether finish_reason === 'length', indicating the stream was cut by the token limit. */
  truncatedArtifactDetected: boolean;
  /** Files still missing after the coder + targeted retry. */
  missingExpectedFilesCount: number;
}

export interface CoderOutputBudgetRiskResult {
  level: CoderOutputBudgetRiskLevel;
  reasons: string[];
}

// ── Safe structured diagnostics record ───────────────────────────────────────

/**
 * Full diagnostics payload for one coder call.
 * All fields are safe to log — no generated code, no prompt text, no secrets.
 */
export interface CoderOutputBudgetDiagnosticsRecord {
  requested_max_tokens:         number;
  actual_output_char_count:     number;
  parsed_file_count:            number;
  expected_file_count:          number;
  artifact_parse_status:        'ok' | 'missing_files' | 'parse_failed' | 'retry_recovered';
  truncated_artifact_detected:  boolean;
  incomplete_file_detected:     boolean;
  missing_expected_files_count: number;
  finish_reason:                string;
  /** Coarse three-value summary for quick dashboards. */
  output_budget_risk:           'too_low_risk' | 'adequate' | 'excessive_unknown';
  /** Detailed classification from evaluateCoderOutputBudgetRisk. */
  risk_level:                   CoderOutputBudgetRiskLevel;
  risk_reasons:                 string[];
}

// ── Pure helper ───────────────────────────────────────────────────────────────

/**
 * Estimates the minimum output tokens needed for a given file count.
 * Heuristic: each file averages ~3 000 chars ≈ 750 tokens.
 */
const AVG_TOKENS_PER_FILE = 750;

/**
 * Classifies whether the coder output-token budget is likely too low, adequate,
 * high but justified, or inconclusive.
 *
 * This is a PURE function — no side-effects, no LLM calls, safe to unit-test.
 * It does not block generation; call sites use the result only for logging.
 */
export function evaluateCoderOutputBudgetRisk(
  input: CoderOutputBudgetRiskInput,
): CoderOutputBudgetRiskResult {
  const reasons: string[] = [];

  // ── Inconclusive: no output at all (call aborted or short-circuited) ─────────
  if (input.outputCharCount === 0 && input.parsedFileCount === 0) {
    return {
      level: 'inconclusive',
      reasons: ['no output received — cannot assess output budget adequacy'],
    };
  }

  // ── Inconclusive: parse failure prevents reliable file-count comparison ──────
  if (input.parseStatus === 'parse_failed') {
    return {
      level: 'inconclusive',
      reasons: ['artifact parse failed — output budget assessment is inconclusive'],
    };
  }

  // ── likely_too_low: explicit truncation or missing files ─────────────────────

  if (input.truncatedArtifactDetected) {
    reasons.push(
      `finish_reason=length — stream was cut off by the output token limit (max_tokens=${input.requestedMaxTokens})`,
    );
  }

  if (input.missingExpectedFilesCount > 0) {
    reasons.push(
      `${input.missingExpectedFilesCount} of ${input.expectedFileCount} expected files missing after coder+retry`,
    );
  }

  if (reasons.length > 0) {
    return { level: 'likely_too_low', reasons };
  }

  // ── likely_too_low: budget arithmetically too small for the file plan ─────────

  const estimatedMinTokensNeeded = input.expectedFileCount * AVG_TOKENS_PER_FILE;
  if (input.requestedMaxTokens < estimatedMinTokensNeeded) {
    reasons.push(
      `requestedMaxTokens=${input.requestedMaxTokens} is arithmetically insufficient for ` +
      `${input.expectedFileCount} files (estimated minimum: ~${estimatedMinTokensNeeded} tokens @ ${AVG_TOKENS_PER_FILE}/file)`,
    );
    return { level: 'likely_too_low', reasons };
  }

  // ── Success path: all files produced ─────────────────────────────────────────

  const allFilesPresent =
    input.expectedFileCount > 0 &&
    input.parsedFileCount >= input.expectedFileCount;

  if (allFilesPresent) {
    if (input.requestedMaxTokens > 16_000 && input.expectedFileCount >= 5) {
      reasons.push(
        `all ${input.parsedFileCount} expected files parsed successfully; ` +
        `high maxTokens=${input.requestedMaxTokens} appears justified for a ` +
        `${input.expectedFileCount}-file generation (${input.outputCharCount} chars produced)`,
      );
      return { level: 'high_but_needed', reasons };
    }
    reasons.push(
      `all ${input.parsedFileCount} expected files parsed successfully; ` +
      `maxTokens=${input.requestedMaxTokens} appears adequate`,
    );
    return { level: 'probably_adequate', reasons };
  }

  // ── Partial success or edge case ─────────────────────────────────────────────

  return {
    level: 'inconclusive',
    reasons: [
      `parsedFileCount=${input.parsedFileCount} vs expectedFileCount=${input.expectedFileCount} — ` +
      'insufficient data to classify output budget risk',
    ],
  };
}

// ── Incomplete-file heuristic ─────────────────────────────────────────────────

/**
 * Returns true when the file content contains obvious stub/incomplete markers.
 * Checks only code structure signals — does NOT log or return file content.
 */
export function detectIncompleteFile(content: string): boolean {
  const t = content.trim();
  // Too short to be a real component
  if (t.length < 50) return true;
  // Classic truncation stubs
  if (/\/\/\s*(rest of implementation|TODO:|\.\.\.)\s*$/im.test(t)) return true;
  // Has imports but no export — file was cut before the exported symbol
  if (/\bimport\b/.test(t) && !/export\s+(default\s+)?(function|class|const|type|interface)\b/.test(t)) return true;
  return false;
}

// ── Diagnostics record builder ────────────────────────────────────────────────

/**
 * Builds a CoderOutputBudgetDiagnosticsRecord from raw coder call outputs.
 * Does not touch generated code content beyond length checks.
 */
export function buildCoderOutputBudgetDiagnostics(
  input: CoderOutputBudgetRiskInput & {
    finishReason: string;
    parsedFiles: Record<string, string>;
  },
): CoderOutputBudgetDiagnosticsRecord {
  const risk = evaluateCoderOutputBudgetRisk(input);

  // Check any parsed file for stub/incomplete markers (content-length only)
  const incompleteFileDetected = Object.values(input.parsedFiles).some(detectIncompleteFile);

  // Coarse three-value output_budget_risk for quick dashboards
  let output_budget_risk: CoderOutputBudgetDiagnosticsRecord['output_budget_risk'];
  if (risk.level === 'likely_too_low') {
    output_budget_risk = 'too_low_risk';
  } else if (risk.level === 'probably_adequate') {
    output_budget_risk = 'adequate';
  } else if (risk.level === 'high_but_needed') {
    // Budget was high but evidence shows it was justified — not flagged as excessive
    output_budget_risk = 'adequate';
  } else {
    output_budget_risk = 'excessive_unknown';
  }

  return {
    requested_max_tokens:         input.requestedMaxTokens,
    actual_output_char_count:     input.outputCharCount,
    parsed_file_count:            input.parsedFileCount,
    expected_file_count:          input.expectedFileCount,
    artifact_parse_status:        input.parseStatus,
    truncated_artifact_detected:  input.truncatedArtifactDetected,
    incomplete_file_detected:     incompleteFileDetected,
    missing_expected_files_count: input.missingExpectedFilesCount,
    finish_reason:                input.finishReason || 'unknown',
    output_budget_risk,
    risk_level:                   risk.level,
    risk_reasons:                 risk.reasons,
  };
}

// ── Logger ────────────────────────────────────────────────────────────────────

/**
 * Emits a compact, structured diagnostic log for coder output budget analysis.
 * Safe to call unconditionally — never logs generated code, prompt text, or secrets.
 */
export function recordCoderOutputBudgetDiagnostics(
  diag: CoderOutputBudgetDiagnosticsRecord,
): void {
  console.log('[coder_output_budget_diag]', {
    requested_max_tokens:         diag.requested_max_tokens,
    actual_output_char_count:     diag.actual_output_char_count,
    parsed_file_count:            diag.parsed_file_count,
    expected_file_count:          diag.expected_file_count,
    artifact_parse_status:        diag.artifact_parse_status,
    truncated_artifact_detected:  diag.truncated_artifact_detected,
    incomplete_file_detected:     diag.incomplete_file_detected,
    missing_expected_files_count: diag.missing_expected_files_count,
    finish_reason:                diag.finish_reason,
    output_budget_risk:           diag.output_budget_risk,
    risk_level:                   diag.risk_level,
    risk_reasons:                 diag.risk_reasons,
  });
}
