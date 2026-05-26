/**
 * coderOutputBudgetRisk.test.ts
 *
 * Deterministic tests for evaluateCoderOutputBudgetRisk and related helpers.
 * Part of: p2/diagnose-coder-output-budget-and-truncation-risk
 *
 * Tests verify:
 *   - High maxTokens alone does NOT imply excessive if expectedFileCount is high.
 *   - Low maxTokens with many expected files → likely_too_low.
 *   - truncatedArtifactDetected → likely_too_low.
 *   - Missing expected files → likely_too_low.
 *   - All files parsed with high maxTokens → high_but_needed, not "bad".
 *   - diagnostics record never contains generated code or prompt text.
 *   - No real LLM calls are made.
 */

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import {
  evaluateCoderOutputBudgetRisk,
  buildCoderOutputBudgetDiagnostics,
  detectIncompleteFile,
  type CoderOutputBudgetRiskInput,
} from '../CoderOutputBudgetDiagnostics';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Represents a successful saas-dashboard run (7 files, 35k maxTokens). */
function makeSaasDashboardSuccess(
  overrides: Partial<CoderOutputBudgetRiskInput> = {},
): CoderOutputBudgetRiskInput {
  return {
    requestedMaxTokens:          35_000,
    expectedFileCount:           7,
    parsedFileCount:             7,
    outputCharCount:             24_000,
    parseStatus:                 'ok',
    truncatedArtifactDetected:   false,
    missingExpectedFilesCount:   0,
    ...overrides,
  };
}

/** Represents a mobile-app run (11 files, 35k maxTokens). */
function makeMobileAppSuccess(
  overrides: Partial<CoderOutputBudgetRiskInput> = {},
): CoderOutputBudgetRiskInput {
  return {
    requestedMaxTokens:          35_000,
    expectedFileCount:           11,
    parsedFileCount:             11,
    outputCharCount:             38_000,
    parseStatus:                 'ok',
    truncatedArtifactDetected:   false,
    missingExpectedFilesCount:   0,
    ...overrides,
  };
}

// ── evaluateCoderOutputBudgetRisk ─────────────────────────────────────────────

describe('evaluateCoderOutputBudgetRisk — high maxTokens is not automatically bad', () => {
  it('classifies as high_but_needed when all files parsed and fileCount >= 5 with high maxTokens', () => {
    const result = evaluateCoderOutputBudgetRisk(makeSaasDashboardSuccess());
    expect(result.level).toBe('high_but_needed');
    expect(result.reasons[0]).toMatch(/all 7 expected files parsed/);
  });

  it('classifies as high_but_needed for 11-file mobile-app with 35k maxTokens', () => {
    const result = evaluateCoderOutputBudgetRisk(makeMobileAppSuccess());
    expect(result.level).toBe('high_but_needed');
    expect(result.reasons[0]).toMatch(/all 11 expected files/);
  });

  it('includes maxTokens value and file count in the reason', () => {
    const result = evaluateCoderOutputBudgetRisk(makeSaasDashboardSuccess());
    expect(result.reasons[0]).toContain('maxTokens=35000');
    expect(result.reasons[0]).toContain('7-file generation');
  });
});

describe('evaluateCoderOutputBudgetRisk — low maxTokens with many files → likely_too_low', () => {
  it('marks likely_too_low when maxTokens < estimatedMinTokens (10 files @ 750 each = 7500 min)', () => {
    const result = evaluateCoderOutputBudgetRisk({
      requestedMaxTokens:          4_000,
      expectedFileCount:           10,
      parsedFileCount:             4,
      outputCharCount:             8_000,
      parseStatus:                 'ok',
      truncatedArtifactDetected:   false,
      missingExpectedFilesCount:   6,
    });
    // missing files is checked first
    expect(result.level).toBe('likely_too_low');
  });

  it('marks likely_too_low purely from arithmetic when no output produced yet', () => {
    const result = evaluateCoderOutputBudgetRisk({
      requestedMaxTokens:          2_000,
      expectedFileCount:           10,
      parsedFileCount:             0,
      outputCharCount:             1,   // non-zero to avoid inconclusive path
      parseStatus:                 'ok',
      truncatedArtifactDetected:   false,
      missingExpectedFilesCount:   0,
    });
    // 2000 < 10 * 750 = 7500 → likely_too_low
    expect(result.level).toBe('likely_too_low');
    expect(result.reasons[0]).toContain('arithmetically insufficient');
  });
});

describe('evaluateCoderOutputBudgetRisk — truncated artifact → likely_too_low', () => {
  it('marks likely_too_low when finish_reason=length even if some files parsed', () => {
    const result = evaluateCoderOutputBudgetRisk(
      makeSaasDashboardSuccess({ truncatedArtifactDetected: true, missingExpectedFilesCount: 2, parsedFileCount: 5 }),
    );
    expect(result.level).toBe('likely_too_low');
    expect(result.reasons.join(' ')).toMatch(/finish_reason=length/);
  });

  it('includes the maxTokens value in the truncation reason', () => {
    const result = evaluateCoderOutputBudgetRisk(
      makeSaasDashboardSuccess({ truncatedArtifactDetected: true }),
    );
    expect(result.reasons[0]).toContain('max_tokens=35000');
  });
});

describe('evaluateCoderOutputBudgetRisk — missing expected files → likely_too_low', () => {
  it('marks likely_too_low when some expected files are missing after retry', () => {
    const result = evaluateCoderOutputBudgetRisk(
      makeSaasDashboardSuccess({ missingExpectedFilesCount: 3, parsedFileCount: 4, parseStatus: 'missing_files' }),
    );
    expect(result.level).toBe('likely_too_low');
    expect(result.reasons[0]).toMatch(/3 of 7 expected files missing/);
  });

  it('mentions both parsedCount and expectedCount in the reason', () => {
    const result = evaluateCoderOutputBudgetRisk(
      makeSaasDashboardSuccess({ missingExpectedFilesCount: 1, parsedFileCount: 6 }),
    );
    expect(result.reasons[0]).toContain('1 of 7');
  });
});

describe('evaluateCoderOutputBudgetRisk — complete files with high maxTokens is not flagged as bad', () => {
  it('does NOT return likely_too_low or inconclusive when all files are present', () => {
    const result = evaluateCoderOutputBudgetRisk(makeSaasDashboardSuccess());
    expect(result.level).not.toBe('likely_too_low');
    expect(result.level).not.toBe('inconclusive');
  });

  it('returns high_but_needed (not a blocking flag) when maxTokens=35000 and all files ok', () => {
    const result = evaluateCoderOutputBudgetRisk(makeSaasDashboardSuccess());
    expect(result.level).toBe('high_but_needed');
  });
});

describe('evaluateCoderOutputBudgetRisk — edge cases', () => {
  it('returns inconclusive when there is no output at all', () => {
    const result = evaluateCoderOutputBudgetRisk({
      requestedMaxTokens:         35_000,
      expectedFileCount:          7,
      parsedFileCount:            0,
      outputCharCount:            0,
      parseStatus:                'parse_failed',
      truncatedArtifactDetected:  false,
      missingExpectedFilesCount:  0,
    });
    expect(result.level).toBe('inconclusive');
  });

  it('returns inconclusive on parse_failed regardless of maxTokens', () => {
    const result = evaluateCoderOutputBudgetRisk({
      requestedMaxTokens:         35_000,
      expectedFileCount:          7,
      parsedFileCount:            0,
      outputCharCount:            500,
      parseStatus:                'parse_failed',
      truncatedArtifactDetected:  false,
      missingExpectedFilesCount:  0,
    });
    expect(result.level).toBe('inconclusive');
  });

  it('classifies probably_adequate when maxTokens is modest and all files present', () => {
    const result = evaluateCoderOutputBudgetRisk({
      requestedMaxTokens:         8_000,
      expectedFileCount:          3,
      parsedFileCount:            3,
      outputCharCount:            9_000,
      parseStatus:                'ok',
      truncatedArtifactDetected:  false,
      missingExpectedFilesCount:  0,
    });
    // maxTokens=8000 <= 16000 and fileCount=3 < 5 → probably_adequate
    expect(result.level).toBe('probably_adequate');
  });
});

// ── buildCoderOutputBudgetDiagnostics ─────────────────────────────────────────

describe('buildCoderOutputBudgetDiagnostics — record structure', () => {
  it('produces a record with all required fields', () => {
    const diag = buildCoderOutputBudgetDiagnostics({
      ...makeSaasDashboardSuccess(),
      finishReason: 'stop',
      parsedFiles:  { 'src/pages/Dashboard.tsx': 'export default function Dashboard(){ return <div />; }' },
    });

    expect(diag.requested_max_tokens).toBe(35_000);
    expect(diag.actual_output_char_count).toBe(24_000);
    expect(diag.parsed_file_count).toBe(7);
    expect(diag.expected_file_count).toBe(7);
    expect(diag.artifact_parse_status).toBe('ok');
    expect(diag.truncated_artifact_detected).toBe(false);
    expect(diag.missing_expected_files_count).toBe(0);
    expect(diag.finish_reason).toBe('stop');
    expect(diag.risk_level).toBeDefined();
    expect(diag.risk_reasons).toBeInstanceOf(Array);
  });

  it('output_budget_risk is adequate for high_but_needed level', () => {
    const diag = buildCoderOutputBudgetDiagnostics({
      ...makeSaasDashboardSuccess(),
      finishReason: 'stop',
      parsedFiles:  {},
    });
    expect(diag.output_budget_risk).toBe('adequate');
    expect(diag.risk_level).toBe('high_but_needed');
  });

  it('output_budget_risk is too_low_risk when truncated', () => {
    const diag = buildCoderOutputBudgetDiagnostics({
      ...makeSaasDashboardSuccess({ truncatedArtifactDetected: true, missingExpectedFilesCount: 2, parsedFileCount: 5 }),
      finishReason: 'length',
      parsedFiles:  {},
    });
    expect(diag.output_budget_risk).toBe('too_low_risk');
    expect(diag.risk_level).toBe('likely_too_low');
  });
});

describe('buildCoderOutputBudgetDiagnostics — no generated code or prompt in record', () => {
  it('diagnostics record does not contain generated code strings', () => {
    const generatedCode = 'export default function SecretComponent(){ return <main>secret content</main>; }';
    const diag = buildCoderOutputBudgetDiagnostics({
      ...makeSaasDashboardSuccess(),
      finishReason: 'stop',
      parsedFiles:  { 'src/App.tsx': generatedCode },
    });

    // Serialize everything to check no code leaks
    const serialized = JSON.stringify(diag);
    expect(serialized).not.toContain('SecretComponent');
    expect(serialized).not.toContain('secret content');
    expect(serialized).not.toContain(generatedCode);
  });

  it('diagnostics record does not contain prompt text', () => {
    // The helper receives parsedFiles but must not echo prompt text
    const diag = buildCoderOutputBudgetDiagnostics({
      ...makeSaasDashboardSuccess(),
      finishReason:  'stop',
      parsedFiles:   {},
    });
    const serialized = JSON.stringify(diag);
    // No system prompt markers
    expect(serialized).not.toContain('You are a senior React');
    expect(serialized).not.toContain('SKELETON:');
    expect(serialized).not.toContain('RULES');
  });
});

// ── detectIncompleteFile ───────────────────────────────────────────────────────

describe('detectIncompleteFile', () => {
  it('returns false for a well-formed component', () => {
    const content = `import React from 'react';
export default function Dashboard() {
  return <div className="p-4">Dashboard</div>;
}`;
    expect(detectIncompleteFile(content)).toBe(false);
  });

  it('returns true for a file that is too short', () => {
    expect(detectIncompleteFile('// TODO')).toBe(true);
    expect(detectIncompleteFile('')).toBe(true);
  });

  it('returns true for a file ending with // rest of implementation', () => {
    const content = `import React from 'react';
export default function App() {
  // rest of implementation
}`;
    expect(detectIncompleteFile(content)).toBe(true);
  });

  it('returns true for a file with only imports and no export', () => {
    const content = `import React from 'react';
import { Button } from '@/components/ui/button';
// cut off here`;
    expect(detectIncompleteFile(content)).toBe(true);
  });

  it('returns false for a valid hook file with named export', () => {
    const content = `import { useState } from 'react';
export const useCounter = () => {
  const [count, setCount] = useState(0);
  return { count, increment: () => setCount(c => c + 1) };
};`;
    expect(detectIncompleteFile(content)).toBe(false);
  });
});
