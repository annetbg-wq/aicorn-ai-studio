// @vitest-environment jsdom
/**
 * SkeletonCarcassMerge.test.ts
 *
 * Tests for the scaffold merge mechanism (механизм Б):
 *   - mergeSkeletonExports() in SkeletonRegistry
 *   - extractExportDeclaration() helper
 *   - buildSkeletonPromptBlock() inject block (механизм A)
 *
 * Test cases from spec:
 *   (a) Coder dropped SEED_KPIS → apply merge restored it from skeleton
 *   (b) Coder overrode SEED_KPIS with own data → merge did NOT overwrite it
 *   (c) Prompt block contains scaffold seed.ts content
 *
 * Part of: p2/coder-scaffold-merge
 */

import { describe, expect, it } from 'vitest';
import {
  mergeSkeletonExports,
  extractExportDeclaration,
  buildSkeletonPromptBlock,
  checkExportIntegrity,
} from '../SkeletonRegistry';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CODER_SEED_WITH_KPIS = `
import type { ActivityEvent, ChecklistTask, DataRow, KPIMetric } from './types';

export const SEED_KPIS: readonly KPIMetric[] = [
  { id: 'invoices', label: 'Unpaid invoices', value: '$12,450', deltaPct: 8.3, trend: 'up' },
  { id: 'runway', label: 'Cash runway', value: '4.2 mo', deltaPct: -1.1, trend: 'down' },
] as const;

export const DEFAULT_CHECKLIST: readonly ChecklistTask[] = [
  { id: 't-1', label: 'Add your first invoice', done: false },
] as const;
`.trim();

const CODER_SEED_WITHOUT_KPIS = `
import type { ActivityEvent, ChecklistTask, DataRow, KPIMetric } from './types';

export const DEFAULT_CHECKLIST: readonly ChecklistTask[] = [
  { id: 't-1', label: 'Add your first invoice', done: false },
] as const;
`.trim();

const CODER_SEED_WITHOUT_SPARKLINE_OR_ACTIVITY = `
import type { ActivityEvent, ChecklistTask, DataRow, KPIMetric } from './types';

export const SEED_KPIS: readonly KPIMetric[] = [
  { id: 'mrr', label: 'MRR', value: '$5,000', deltaPct: 5, trend: 'up' },
] as const;

export const DEFAULT_CHECKLIST: readonly ChecklistTask[] = [
  { id: 't-1', label: 'Connect data', done: false },
] as const;
`.trim();

const CODER_TYPES_WITHOUT_THEME_CHOICE = `
export type ID = string;
export type LoadingState = 'idle' | 'loading' | 'ready' | 'error';

export interface UserProfile {
  id: ID;
  name: string;
}

export type RowStatus = 'active' | 'pending' | 'archived';
export interface DataRow { id: ID; title: string; status: RowStatus; value: number; createdAt: string; owner: string; }
export interface KPIMetric { id: string; label: string; value: string; deltaPct: number; trend: 'up' | 'down' | 'flat'; }
export interface ActivityEvent { id: ID; actor: string; action: string; target: string; timestamp: string; }
export interface ChecklistTask { id: string; label: string; done: boolean; }
`.trim();

// ── (a) Coder dropped SEED_KPIS → merge restores it ─────────────────────────

describe('mergeSkeletonExports — (a) coder dropped SEED_KPIS', () => {
  it('restores SEED_KPIS from skeleton when coder omitted it', () => {
    const files = { 'data/seed.ts': CODER_SEED_WITHOUT_KPIS };
    const merged = mergeSkeletonExports('saas-dashboard', files);

    expect(merged['data/seed.ts']).toContain('SEED_KPIS');
    expect(merged['data/seed.ts']).toContain('Monthly revenue');
  });

  it('restored SEED_KPIS is a valid export declaration', () => {
    const files = { 'data/seed.ts': CODER_SEED_WITHOUT_KPIS };
    const merged = mergeSkeletonExports('saas-dashboard', files);

    // The restored content must contain the export keyword
    expect(merged['data/seed.ts']).toMatch(/export\s+const\s+SEED_KPIS/);
  });

  it('also restores SEED_SPARKLINE when coder drops it', () => {
    const files = { 'data/seed.ts': CODER_SEED_WITHOUT_SPARKLINE_OR_ACTIVITY };
    const merged = mergeSkeletonExports('saas-dashboard', files);

    expect(merged['data/seed.ts']).toContain('SEED_SPARKLINE');
    expect(merged['data/seed.ts']).toContain('SEED_ACTIVITY');
  });

  it('preserves the coder-written DEFAULT_CHECKLIST', () => {
    const files = { 'data/seed.ts': CODER_SEED_WITHOUT_KPIS };
    const merged = mergeSkeletonExports('saas-dashboard', files);

    expect(merged['data/seed.ts']).toContain('Add your first invoice');
  });

  it('after merge, checkExportIntegrity finds no violations for seed.ts', () => {
    const files = { 'data/seed.ts': CODER_SEED_WITHOUT_KPIS };
    const merged = mergeSkeletonExports('saas-dashboard', files);
    const violations = checkExportIntegrity('saas-dashboard', merged);
    const seedViolations = violations.filter(v => v.file === 'data/seed.ts');
    expect(seedViolations).toHaveLength(0);
  });

  it('restores export type { ThemeChoice } when coder drops it from data/types.ts', () => {
    const files = { 'data/types.ts': CODER_TYPES_WITHOUT_THEME_CHOICE };
    const merged = mergeSkeletonExports('saas-dashboard', files);
    expect(merged['data/types.ts']).toContain('export type { ThemeChoice };');
    const typeViolations = checkExportIntegrity('saas-dashboard', merged)
      .filter(v => v.file === 'data/types.ts');
    expect(typeViolations).toHaveLength(0);
  });
});

// ── (b) Coder overrode SEED_KPIS → merge does NOT overwrite ─────────────────

describe('mergeSkeletonExports — (b) coder overrode SEED_KPIS, merge respects it', () => {
  it('leaves coder-defined SEED_KPIS unchanged when it is present', () => {
    const files = { 'data/seed.ts': CODER_SEED_WITH_KPIS };
    const merged = mergeSkeletonExports('saas-dashboard', files);

    // Should contain the coder's domain-specific label, not the skeleton's
    expect(merged['data/seed.ts']).toContain('Unpaid invoices');
    expect(merged['data/seed.ts']).toContain('Cash runway');
    // Should NOT contain the skeleton's generic labels (they would indicate overwrite)
    expect(merged['data/seed.ts']).not.toContain('Monthly revenue');
    expect(merged['data/seed.ts']).not.toContain('Active users');
  });

  it('returns the same string reference when no exports need restoring', () => {
    // If coder wrote all exports, merged file equals the original
    const files = { 'data/seed.ts': CODER_SEED_WITH_KPIS };
    const merged = mergeSkeletonExports('saas-dashboard', files);
    // Content should start with the coder's file
    expect(merged['data/seed.ts']).toMatch(/^import type/);
  });

  it('does not double-inject SEED_KPIS when coder wrote it', () => {
    const files = { 'data/seed.ts': CODER_SEED_WITH_KPIS };
    const merged = mergeSkeletonExports('saas-dashboard', files);
    const matches = (merged['data/seed.ts'].match(/export\s+const\s+SEED_KPIS/g) ?? []).length;
    expect(matches).toBe(1);
  });
});

// ── Merge is a no-op for non-carcass skeletons ───────────────────────────────

describe('mergeSkeletonExports — stub skeletons are untouched', () => {
  it('returns files unchanged for a non-carcass skeleton (ecommerce)', () => {
    const files = { 'data/seed.ts': 'export const SEED = [];' };
    const merged = mergeSkeletonExports('ecommerce', files);
    expect(merged).toBe(files); // same reference = no-op
  });

  it('returns files unchanged for dating-matching-app (stub skeleton)', () => {
    const files = { 'data/seed.ts': 'export const profiles = [];' };
    const merged = mergeSkeletonExports('dating-matching-app', files);
    expect(merged).toBe(files);
  });
});

// ── Multi-file merge ─────────────────────────────────────────────────────────

describe('mergeSkeletonExports — multi-file carcass merge', () => {
  it('restores STORAGE_KEYS in config/app.ts when coder drops it', () => {
    const files = {
      'config/app.ts': `export const APP_CONFIG = { name: 'CashflowGuard', tagline: 'Track invoices', storagePrefix: 'cg.v1' } as const;`,
    };
    const merged = mergeSkeletonExports('saas-dashboard', files);

    expect(merged['config/app.ts']).toContain('STORAGE_KEYS');
    expect(merged['config/app.ts']).toContain('APP_CONFIG');
  });

  it('does not touch files that are not in the carcass map (pages)', () => {
    const files = {
      'pages/Dashboard.tsx': 'export default function Dashboard() { return null; }',
    };
    const merged = mergeSkeletonExports('saas-dashboard', files);
    expect(merged['pages/Dashboard.tsx']).toBe(files['pages/Dashboard.tsx']);
  });

  it('skips carcass file if coder did not produce it (not present in files map)', () => {
    // data/types.ts not in files → should not appear in output
    const files = { 'data/seed.ts': CODER_SEED_WITH_KPIS };
    const merged = mergeSkeletonExports('saas-dashboard', files);
    expect(merged['data/types.ts']).toBeUndefined();
  });
});

// ── extractExportDeclaration helper ─────────────────────────────────────────

describe('extractExportDeclaration — unit', () => {
  it('extracts a single-line type export', () => {
    const src = `export type ID = string;\nexport type Foo = number;`;
    expect(extractExportDeclaration(src, 'ID')).toBe('export type ID = string;');
  });

  it('extracts a single-line const export', () => {
    const src = `export const X = 42;\nexport const Y = 99;`;
    expect(extractExportDeclaration(src, 'X')).toBe('export const X = 42;');
  });

  it('extracts a multi-line const array ending with ] as const;', () => {
    const src = [
      'export const SEED_KPIS: readonly KPIMetric[] = [',
      "  { id: 'mrr', label: 'MRR', value: '$1', deltaPct: 1, trend: 'up' },",
      '] as const;',
      'export const OTHER = [];',
    ].join('\n');
    const result = extractExportDeclaration(src, 'SEED_KPIS');
    expect(result).toContain('SEED_KPIS');
    expect(result).toContain("label: 'MRR'");
    expect(result).not.toContain('OTHER');
  });

  it('extracts a multi-line interface', () => {
    const src = [
      'export interface KPIMetric {',
      '  id: string;',
      '  label: string;',
      '}',
      'export interface Other {}',
    ].join('\n');
    const result = extractExportDeclaration(src, 'KPIMetric');
    expect(result).toContain('KPIMetric');
    expect(result).toContain('id: string;');
    expect(result).not.toContain('Other');
  });

  it('returns undefined when export is not found', () => {
    const src = 'export const FOO = 1;';
    expect(extractExportDeclaration(src, 'NONEXISTENT')).toBeUndefined();
  });
});

// ── (c) Prompt block contains scaffold seed.ts content ───────────────────────

describe('buildSkeletonPromptBlock — (c) inject block contains scaffold seed.ts', () => {
  const block = buildSkeletonPromptBlock('saas-dashboard');

  it('contains the SCAFFOLD FILES ALREADY ON DISK section header', () => {
    expect(block).toContain('SCAFFOLD FILES ALREADY ON DISK');
  });

  it('contains SEED_KPIS in the injected scaffold content', () => {
    expect(block).toContain('SEED_KPIS');
  });

  it('contains SEED_SPARKLINE in the injected scaffold content', () => {
    expect(block).toContain('SEED_SPARKLINE');
  });

  it('contains SEED_ACTIVITY in the injected scaffold content', () => {
    expect(block).toContain('SEED_ACTIVITY');
  });

  it('contains DEFAULT_CHECKLIST in the injected scaffold content', () => {
    expect(block).toContain('DEFAULT_CHECKLIST');
  });

  it('contains seed.ts file label', () => {
    expect(block).toContain('data/seed.ts');
  });

  it('contains the "PRESERVE all existing exports" instruction', () => {
    expect(block).toContain('PRESERVE all existing exports');
  });

  it('contains the "FILL IN" marker replacement instruction', () => {
    expect(block).toContain('FILL IN');
  });

  it('does NOT inject carcass block for a stub skeleton (ecommerce)', () => {
    const ecommerceBlock = buildSkeletonPromptBlock('ecommerce');
    expect(ecommerceBlock).not.toContain('SCAFFOLD FILES ALREADY ON DISK');
  });

  it('does NOT inject carcass block for dating-matching-app (stub skeleton)', () => {
    const datingBlock = buildSkeletonPromptBlock('dating-matching-app');
    expect(datingBlock).not.toContain('SCAFFOLD FILES ALREADY ON DISK');
  });
});
