// @vitest-environment node
/**
 * ExportSafetyNet.test.ts
 *
 * Locks the deterministic stub that back-fills a skeleton-required export the
 * coder failed to provide. Real failure (creator-editor-workspace skeleton):
 * the protected AppContext.tsx imports { drafts, mediaAssets, publications } from
 * @/data/seed, but the coder regenerated data/seed.ts without those named exports,
 * so the build hard-failed with missing_named_export. The stub guarantees the
 * skeleton-locked import always resolves (ship-and-iterate).
 */
import { describe, expect, it } from 'vitest';
import { buildRequiredExportStub } from '../ProtoPipeline';

describe('buildRequiredExportStub', () => {
  it('stubs a camelCase data value as an empty array (lists degrade gracefully)', () => {
    expect(buildRequiredExportStub('data/seed.ts', { name: 'drafts' })).toBe('export const drafts: any = [];');
    expect(buildRequiredExportStub('data/seed.ts', { name: 'mediaAssets' })).toBe('export const mediaAssets: any = [];');
  });

  it('stubs a PascalCase name as a type alias', () => {
    expect(buildRequiredExportStub('data/types.ts', { name: 'Draft' })).toBe('export type Draft = any;');
    expect(buildRequiredExportStub('data/types.ts', { name: 'Publication' })).toBe('export type Publication = any;');
  });

  it('honors an explicit type entry regardless of casing', () => {
    expect(buildRequiredExportStub('x.ts', { name: 'someAlias', type: 'type' })).toBe('export type someAlias = any;');
  });

  it('stubs a config value as an empty object', () => {
    expect(buildRequiredExportStub('config/app.ts', { name: 'appConfig' })).toBe('export const appConfig: any = {};');
  });

  it('produces compilable, resolvable declarations for the exact creator-editor-workspace contract', () => {
    const seed = ['drafts', 'mediaAssets', 'publications'].map(n => buildRequiredExportStub('data/seed.ts', { name: n }));
    expect(seed).toEqual([
      'export const drafts: any = [];',
      'export const mediaAssets: any = [];',
      'export const publications: any = [];',
    ]);
  });
});
