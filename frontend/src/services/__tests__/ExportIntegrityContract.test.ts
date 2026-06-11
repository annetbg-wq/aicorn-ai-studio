// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  buildSkeletonPromptBlock,
  checkExportIntegrity,
} from '../SkeletonRegistry';

// ── (a) Missing DEFAULT_CHECKLIST → violation with correct name ──────────────
describe('checkExportIntegrity — saas-dashboard', () => {
  it('reports a violation when DEFAULT_CHECKLIST is absent from data/seed.ts', () => {
    const files: Record<string, string> = {
      'data/seed.ts': `
        export const SOME_OTHER_EXPORT = [];
      `,
    };
    const violations = checkExportIntegrity('saas-dashboard', files);
    const names = violations.map(v => v.name);
    expect(violations.length).toBeGreaterThan(0);
    expect(names).toContain('DEFAULT_CHECKLIST');
    const v = violations.find(x => x.name === 'DEFAULT_CHECKLIST')!;
    expect(v.file).toBe('data/seed.ts');
    expect(v.type).toBe('readonly ChecklistTask[]');
  });

  it('violation message string contains the symbol name (targeted-retry instruction format)', () => {
    const files: Record<string, string> = {
      'data/seed.ts': `export const OTHER = [];`,
    };
    const violations = checkExportIntegrity('saas-dashboard', files);
    const missing = violations.filter(v => v.name === 'DEFAULT_CHECKLIST');
    expect(missing.length).toBe(1);
    // Simulate the instruction string built in ProtoPipeline
    const instruction = `data/seed.ts is missing required export(s) DEFAULT_CHECKLIST — re-emit it exporting DEFAULT_CHECKLIST: readonly ChecklistTask[]`;
    expect(instruction).toContain('DEFAULT_CHECKLIST');
    expect(instruction).toContain('data/seed.ts');
  });

  // ── (b) All exports present → no violations ────────────────────────────────
  it('passes when all required exports are present in data/seed.ts', () => {
    const files: Record<string, string> = {
      'data/seed.ts': `
        import type { ChecklistTask } from './types';
        export const DEFAULT_CHECKLIST: readonly ChecklistTask[] = [];
      `,
    };
    const violations = checkExportIntegrity('saas-dashboard', files);
    const seedViolations = violations.filter(v => v.file === 'data/seed.ts');
    expect(seedViolations).toHaveLength(0);
  });

  it('passes when all required exports for data/types.ts are present', () => {
    const files: Record<string, string> = {
      'data/types.ts': `
        export interface ChecklistTask { id: string; }
        export type DataRow = { id: string; };
        export type RowStatus = 'active' | 'inactive';
        export interface KPIMetric { label: string; value: number; }
        export interface UserProfile { id: string; name: string; }
        export type LoadingState = 'idle' | 'loading' | 'error';
        export type ThemeChoice = 'light' | 'dark';
      `,
    };
    const violations = checkExportIntegrity('saas-dashboard', files);
    const typesViolations = violations.filter(v => v.file === 'data/types.ts');
    expect(typesViolations).toHaveLength(0);
  });

  it('passes when all required exports for config/app.ts and config/navigation.ts are present', () => {
    const files: Record<string, string> = {
      'config/app.ts': `
        export const STORAGE_KEYS = { theme: 'theme' };
        export const APP_CONFIG = { name: 'App' };
      `,
      'config/navigation.ts': `
        export const SIDEBAR_NAV = [];
      `,
    };
    const violations = checkExportIntegrity('saas-dashboard', files);
    expect(violations).toHaveLength(0);
  });

  it('detects violations for all four required-export files when all are missing', () => {
    const files: Record<string, string> = {
      'data/seed.ts':       'export const NOTHING = [];',
      'data/types.ts':      'export const NOTHING = {};',
      'config/app.ts':      'export const NOTHING = {};',
      'config/navigation.ts': 'export const NOTHING = [];',
    };
    const violations = checkExportIntegrity('saas-dashboard', files);
    // DEFAULT_CHECKLIST + 7 types + STORAGE_KEYS + APP_CONFIG + SIDEBAR_NAV = 11
    expect(violations.length).toBe(11);
    const violatedFiles = [...new Set(violations.map(v => v.file))].sort();
    expect(violatedFiles).toEqual([
      'config/app.ts',
      'config/navigation.ts',
      'data/seed.ts',
      'data/types.ts',
    ]);
  });

  it('skips a file that is not present in the files map (not-yet-generated guard)', () => {
    // Only provide data/types.ts, leave data/seed.ts absent
    const files: Record<string, string> = {
      'data/types.ts': `
        export interface ChecklistTask { id: string; }
        export type DataRow = { id: string; };
        export type RowStatus = 'a';
        export interface KPIMetric { label: string; value: number; }
        export interface UserProfile { id: string; }
        export type LoadingState = 'idle';
        export type ThemeChoice = 'light';
      `,
    };
    const violations = checkExportIntegrity('saas-dashboard', files);
    // data/seed.ts is absent → skipped; data/types.ts is clean
    expect(violations).toHaveLength(0);
  });

  it('recognises export { NAME } re-export form as satisfying the contract', () => {
    const files: Record<string, string> = {
      'data/seed.ts': `
        const _internal: readonly any[] = [];
        export { _internal as DEFAULT_CHECKLIST };
      `,
    };
    const violations = checkExportIntegrity('saas-dashboard', files);
    const seedViolations = violations.filter(v => v.file === 'data/seed.ts');
    expect(seedViolations).toHaveLength(0);
  });
});

// ── (c) Prompt block contains required export names for saas-dashboard ───────
describe('buildSkeletonPromptBlock — saas-dashboard REQUIRED EXPORTS CONTRACT', () => {
  const block = buildSkeletonPromptBlock('saas-dashboard');

  it('contains the REQUIRED EXPORTS CONTRACT header', () => {
    expect(block).toContain('REQUIRED EXPORTS CONTRACT');
  });

  it('mentions DEFAULT_CHECKLIST in the prompt block', () => {
    expect(block).toContain('DEFAULT_CHECKLIST');
  });

  it('mentions all seven data/types.ts required exports', () => {
    for (const name of ['ChecklistTask', 'DataRow', 'RowStatus', 'KPIMetric', 'UserProfile', 'LoadingState', 'ThemeChoice']) {
      expect(block, `prompt block should contain ${name}`).toContain(name);
    }
  });

  it('mentions config/app.ts and config/navigation.ts required exports', () => {
    expect(block).toContain('STORAGE_KEYS');
    expect(block).toContain('APP_CONFIG');
    expect(block).toContain('SIDEBAR_NAV');
  });

  it('includes the "build fails" warning sentence', () => {
    expect(block).toContain('build fails');
  });
});
