// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  parseGapArray,
  buildDeterministicGaps,
  stripPass2JsonFences,
  type Gap,
} from '../ProtoPipeline';
import type { FeatureChecklistItem } from '../ProductDocumentSet';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeItem(
  overrides: Partial<FeatureChecklistItem> & Pick<FeatureChecklistItem, 'id' | 'briefPoint' | 'surface' | 'targetFiles'>,
): FeatureChecklistItem {
  return {
    priority: 'must',
    acceptanceSignal: ['Feature ships concretely.'],
    codeSignals: ['Concrete code exists.'],
    uiSignals: ['UI exposes the feature.'],
    dataSignals: ['State is wired.'],
    interactionSignals: ['User can trigger the feature.'],
    source: ['test'],
    ...overrides,
  };
}

const SAMPLE_GAP_ARRAY: Gap[] = [
  {
    id: 'gap-001',
    briefPoint: 'Dashboard shows metrics',
    status: 'missing',
    evidence: 'CompletenessGate: feature not covered. Target file(s): pages/Dashboard.tsx',
    targetFile: 'pages/Dashboard.tsx',
    requiredAction: 'Implement "Dashboard shows metrics" with concrete code in pages/Dashboard.tsx',
    priority: 'must',
    source: 'completeness',
  },
  {
    id: 'gap-002',
    briefPoint: 'Coach page has message flow',
    status: 'fake',
    evidence: 'Coach UI present but no message state found',
    targetFile: 'pages/Coach.tsx',
    requiredAction: 'Add useState([messages]) and handleSend to pages/Coach.tsx',
    priority: 'must',
    source: 'completeness',
  },
];

// ── stripPass2JsonFences ──────────────────────────────────────────────────────

describe('stripPass2JsonFences', () => {
  it('strips ```json fence', () => {
    const raw = '```json\n[{"id":"gap-001"}]\n```';
    expect(stripPass2JsonFences(raw)).toBe('[{"id":"gap-001"}]');
  });

  it('strips plain ``` fence', () => {
    const raw = '```\n[{"id":"gap-001"}]\n```';
    expect(stripPass2JsonFences(raw)).toBe('[{"id":"gap-001"}]');
  });

  it('returns text unchanged when no fences present', () => {
    const raw = '[{"id":"gap-001"}]';
    expect(stripPass2JsonFences(raw)).toBe('[{"id":"gap-001"}]');
  });
});

// ── parseGapArray — valid Gap[] ────────────────────────────────────────────────

describe('parseGapArray — valid input', () => {
  it('accepts clean JSON Gap[] and returns all items', () => {
    const raw = JSON.stringify(SAMPLE_GAP_ARRAY);
    const result = parseGapArray(raw);
    expect(result.gaps).not.toBeNull();
    expect(result.gaps!.length).toBe(2);
    expect(result.parseError).toBeUndefined();
  });

  it('parses Gap[] with all required fields', () => {
    const raw = JSON.stringify(SAMPLE_GAP_ARRAY);
    const result = parseGapArray(raw);
    const gap = result.gaps![0];
    expect(gap.id).toBe('gap-001');
    expect(gap.briefPoint).toBe('Dashboard shows metrics');
    expect(gap.status).toBe('missing');
    expect(gap.evidence).toBeTruthy();
    expect(gap.targetFile).toBe('pages/Dashboard.tsx');
    expect(gap.requiredAction).toBeTruthy();
    expect(gap.priority).toBe('must');
    expect(gap.source).toBe('completeness');
  });

  it('strips ```json fences before parsing', () => {
    const raw = '```json\n' + JSON.stringify(SAMPLE_GAP_ARRAY) + '\n```';
    const result = parseGapArray(raw);
    expect(result.gaps).not.toBeNull();
    expect(result.gaps!.length).toBe(2);
    expect(result.parseError).toBeUndefined();
  });

  it('strips plain ``` fences before parsing', () => {
    const raw = '```\n' + JSON.stringify(SAMPLE_GAP_ARRAY) + '\n```';
    const result = parseGapArray(raw);
    expect(result.gaps).not.toBeNull();
    expect(result.gaps!.length).toBe(2);
  });

  it('normalizes unknown status to "missing"', () => {
    const raw = JSON.stringify([{ id: 'g-1', briefPoint: 'Test', status: 'unknown_status', targetFile: 'a.tsx' }]);
    const result = parseGapArray(raw);
    expect(result.gaps![0].status).toBe('missing');
  });

  it('normalizes unknown priority to "must"', () => {
    const raw = JSON.stringify([{ id: 'g-1', briefPoint: 'Test', priority: 'critical', targetFile: 'a.tsx' }]);
    const result = parseGapArray(raw);
    expect(result.gaps![0].priority).toBe('must');
  });

  it('normalizes unknown source to "completeness"', () => {
    const raw = JSON.stringify([{ id: 'g-1', briefPoint: 'Test', source: 'mystery', targetFile: 'a.tsx' }]);
    const result = parseGapArray(raw);
    expect(result.gaps![0].source).toBe('completeness');
  });
});

// ── parseGapArray — loose schema rejection ────────────────────────────────────

describe('parseGapArray — loose schema rejection', () => {
  it('rejects {verdict, reasons, instructions, focusFiles} with explicit error', () => {
    const loose = {
      verdict: 'revise',
      reasons: ['Missing dashboard page'],
      instructions: ['Add pages/Dashboard.tsx'],
      focusFiles: ['pages/Dashboard.tsx'],
    };
    const result = parseGapArray(JSON.stringify(loose));
    expect(result.gaps).toBeNull();
    expect(result.parseError).toMatch(/loose_schema_rejected/i);
  });

  it('rejects object with only "verdict" field', () => {
    const result = parseGapArray(JSON.stringify({ verdict: 'pass' }));
    expect(result.gaps).toBeNull();
    expect(result.parseError).toMatch(/loose_schema_rejected/i);
  });

  it('rejects object with only "reasons" field', () => {
    const result = parseGapArray(JSON.stringify({ reasons: ['something'] }));
    expect(result.gaps).toBeNull();
    expect(result.parseError).toMatch(/loose_schema_rejected/i);
  });

  it('rejects arbitrary non-array JSON', () => {
    const result = parseGapArray(JSON.stringify({ some: 'object' }));
    expect(result.gaps).toBeNull();
    expect(result.parseError).toMatch(/expected_json_array/i);
  });
});

// ── parseGapArray — invalid JSON ──────────────────────────────────────────────

describe('parseGapArray — invalid JSON', () => {
  it('returns structured error for invalid JSON', () => {
    const result = parseGapArray('{not valid json at all[}');
    expect(result.gaps).toBeNull();
    expect(result.parseError).toMatch(/json_parse_failed/i);
  });

  it('returns structured error for empty string', () => {
    const result = parseGapArray('');
    expect(result.gaps).toBeNull();
    expect(result.parseError).toBeTruthy();
  });

  it('returns structured error for plain prose text', () => {
    const result = parseGapArray('The app is missing several features including the dashboard.');
    expect(result.gaps).toBeNull();
    expect(result.parseError).toBeTruthy();
  });
});

// ── buildDeterministicGaps ────────────────────────────────────────────────────

describe('buildDeterministicGaps', () => {
  const checklist: FeatureChecklistItem[] = [
    makeItem({
      id: 'screen-dashboard',
      briefPoint: 'Dashboard shows metrics',
      surface: 'Dashboard',
      targetFiles: ['pages/Dashboard.tsx'],
    }),
    makeItem({
      id: 'screen-coach',
      briefPoint: 'Coach page has message flow',
      surface: 'Coach',
      targetFiles: ['pages/Coach.tsx'],
      priority: 'must',
    }),
  ];

  it('converts uncovered must feature to strict Gap with correct schema', () => {
    const gaps = buildDeterministicGaps(checklist, ['Dashboard shows metrics']);
    expect(gaps.length).toBe(1);
    const gap = gaps[0];

    // Strict Gap schema
    expect(typeof gap.id).toBe('string');
    expect(typeof gap.briefPoint).toBe('string');
    expect(['missing', 'partial', 'fake', 'broken', 'visual']).toContain(gap.status);
    expect(typeof gap.evidence).toBe('string');
    expect(typeof gap.targetFile).toBe('string');
    expect(typeof gap.requiredAction).toBe('string');
    expect(['must', 'should', 'nice']).toContain(gap.priority);
    expect(['completeness', 'build', 'critic', 'visual']).toContain(gap.source);
  });

  it('sets targetFile from featureChecklist item targetFiles[0]', () => {
    const gaps = buildDeterministicGaps(checklist, ['Dashboard shows metrics']);
    expect(gaps[0].targetFile).toBe('pages/Dashboard.tsx');
  });

  it('sets source to "completeness" for all deterministic gaps', () => {
    const gaps = buildDeterministicGaps(checklist, ['Dashboard shows metrics', 'Coach page has message flow']);
    expect(gaps.every(g => g.source === 'completeness')).toBe(true);
  });

  it('sets status to "missing" for all deterministic gaps', () => {
    const gaps = buildDeterministicGaps(checklist, ['Dashboard shows metrics']);
    expect(gaps[0].status).toBe('missing');
  });

  it('assigns sequential ids with zero-padding', () => {
    const gaps = buildDeterministicGaps(checklist, ['Dashboard shows metrics', 'Coach page has message flow']);
    expect(gaps[0].id).toBe('gap-001');
    expect(gaps[1].id).toBe('gap-002');
  });

  it('handles uncovered feature not in checklist with fallback targetFile', () => {
    const gaps = buildDeterministicGaps(checklist, ['Some unknown feature']);
    expect(gaps[0].targetFile).toBe('pages/Home.tsx');
    expect(gaps[0].source).toBe('completeness');
  });

  it('returns empty array for empty uncoveredMust', () => {
    const gaps = buildDeterministicGaps(checklist, []);
    expect(gaps).toEqual([]);
  });

  it('multiple uncovered features produce multiple Gap items', () => {
    const gaps = buildDeterministicGaps(checklist, ['Dashboard shows metrics', 'Coach page has message flow']);
    expect(gaps.length).toBe(2);
    expect(gaps[0].briefPoint).toBe('Dashboard shows metrics');
    expect(gaps[1].briefPoint).toBe('Coach page has message flow');
  });

  it('inherits priority from featureChecklist item', () => {
    const mixedChecklist: FeatureChecklistItem[] = [
      makeItem({
        id: 'should-feature',
        briefPoint: 'Nice to have feature',
        surface: 'Home',
        targetFiles: ['pages/Home.tsx'],
        priority: 'should',
      }),
    ];
    const gaps = buildDeterministicGaps(mixedChecklist, ['Nice to have feature']);
    expect(gaps[0].priority).toBe('should');
  });
});
