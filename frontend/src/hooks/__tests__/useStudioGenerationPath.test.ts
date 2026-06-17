import { describe, expect, it } from 'vitest';

import { restoreGenerationPath } from '../useStudioGenerationPath';

describe('restoreGenerationPath', () => {
  it('defaults legacy projects without generationPath to skeleton_assembly', () => {
    expect(restoreGenerationPath({})).toBe('skeleton_assembly');
    expect(restoreGenerationPath({ generationPath: undefined })).toBe('skeleton_assembly');
    expect(restoreGenerationPath({ generationPath: null })).toBe('skeleton_assembly');
  });

  it('does not throw when the project is missing', () => {
    expect(() => restoreGenerationPath(undefined)).not.toThrow();
    expect(restoreGenerationPath(undefined)).toBe('skeleton_assembly');
  });

  it('restores blank_canvas only when that exact persisted value is present', () => {
    expect(restoreGenerationPath({ generationPath: 'blank_canvas' })).toBe('blank_canvas');
    expect(restoreGenerationPath({ generationPath: 'skeleton_assembly' })).toBe('skeleton_assembly');
    expect(restoreGenerationPath({ generationPath: 'anything_else' })).toBe('skeleton_assembly');
  });
});
