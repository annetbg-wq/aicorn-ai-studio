import { describe, expect, it } from 'vitest';
import { listSkeletonContractIds } from '../SkeletonContractCompiler';
import { getSkeletonRuntimePolicy } from '../SkeletonRuntimePolicy';

describe('Skeleton runtime policy matrix', () => {
  it.each(listSkeletonContractIds())('%s resolves one complete compiled runtime policy', id => {
    const policy = getSkeletonRuntimePolicy(id);
    expect(policy.id).toBe(id);
    expect(policy.version).toBe(2);
    expect(policy.requiredSlots.length).toBeGreaterThan(0);
    expect(policy.editable).toEqual(expect.arrayContaining(policy.requiredSlots));
    expect(policy.reusable.length).toBeGreaterThan(0);
    expect(policy.infrastructure.installed.length).toBeGreaterThan(0);
    expect(policy.quality.minMeaningfulScreens).toBeGreaterThan(0);
    expect(policy.selection.productTypes.length).toBeGreaterThan(0);
  });

  it('keeps file, quality and selection semantics behind one compiled object', () => {
    const policy = getSkeletonRuntimePolicy('saas-dashboard');
    expect(policy.optionalSlots).toContain('src/config/routes.ts');
    expect(policy.quality.minMeaningfulScreens).toBe(3);
    expect(policy.selection.productTypes).toContain('dashboard');
  });
});
