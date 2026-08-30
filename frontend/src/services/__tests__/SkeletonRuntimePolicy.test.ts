import { describe, expect, it } from 'vitest';
import { listSkeletonContractIds } from '../SkeletonContractCompiler';
import { getSkeletonRuntimePolicy } from '../SkeletonRuntimePolicy';

describe('Skeleton runtime policy matrix', () => {
  it.each(listSkeletonContractIds())('%s resolves one complete runtime policy', id => {
    const policy = getSkeletonRuntimePolicy(id);
    expect(policy.id).toBe(id);
    expect(policy.fileContract.id).toBe(id);
    expect(policy.fileContract.version).toBe(2);
    expect(policy.fileContract.requiredProductSlots.length).toBeGreaterThan(0);
    expect(policy.qualityContract.minMeaningfulScreens).toBeGreaterThan(0);
    expect(policy.selectionCompatibility.archetypes.length).toBeGreaterThan(0);
  });

  it('keeps file, quality and selection semantics behind one API', () => {
    const policy = getSkeletonRuntimePolicy('saas-dashboard');
    expect(policy.fileContract.optionalProductSlots).toContain('src/config/routes.ts');
    expect(policy.qualityContract.minMeaningfulScreens).toBe(3);
    expect(policy.selectionCompatibility.archetypes).toContain('dashboard');
  });
});
