import { describe, expect, it } from 'vitest';

import { normalizeGenerationPath } from '../useStudioGenerationPath';

describe('normalizeGenerationPath', () => {
  it('returns blank_canvas for the blank canvas path', () => {
    expect(normalizeGenerationPath('blank_canvas')).toBe('blank_canvas');
  });

  it('returns skeleton_assembly for the skeleton path', () => {
    expect(normalizeGenerationPath('skeleton_assembly')).toBe('skeleton_assembly');
  });

  it('falls back to skeleton_assembly for undefined, null, and unknown values', () => {
    expect(normalizeGenerationPath(undefined)).toBe('skeleton_assembly');
    expect(normalizeGenerationPath(null)).toBe('skeleton_assembly');
    expect(normalizeGenerationPath('unknown')).toBe('skeleton_assembly');
  });
});
