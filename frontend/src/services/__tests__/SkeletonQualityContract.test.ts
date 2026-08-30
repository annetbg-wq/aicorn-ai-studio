import { describe, expect, it } from 'vitest';
import { listSkeletonContractIds } from '../SkeletonContractCompiler';
import {
  getSkeletonQualityContract,
  listSkeletonQualityContractIds,
} from '../SkeletonQualityContract';

describe('Skeleton quality contracts — 14/14', () => {
  it('covers every canonical skeleton contract', () => {
    expect([...listSkeletonQualityContractIds()].sort())
      .toEqual([...listSkeletonContractIds()].sort());
  });

  it.each(listSkeletonContractIds())('%s has a non-empty quality contract', id => {
    const contract = getSkeletonQualityContract(id);
    expect(contract.minMeaningfulScreens).toBeGreaterThan(0);
    expect(contract.requiredCapabilities.length).toBeGreaterThan(0);
    expect(contract.requiredFlows.length).toBeGreaterThan(0);
    expect(new Set(contract.requiredCapabilities).size).toBe(contract.requiredCapabilities.length);
    expect(new Set(contract.requiredFlows).size).toBe(contract.requiredFlows.length);
  });

  it('preserves the current SaaS meaningful-screen threshold declaratively', () => {
    expect(getSkeletonQualityContract('saas-dashboard').minMeaningfulScreens).toBe(3);
  });

  it('makes commerce and marketplace flows explicit rather than relying on generic screen count', () => {
    expect(getSkeletonQualityContract('ecommerce').requiredFlows)
      .toEqual(expect.arrayContaining(['browse-to-product', 'product-to-cart', 'cart-to-checkout']));
    expect(getSkeletonQualityContract('marketplace-platform').requiredFlows)
      .toEqual(expect.arrayContaining(['browse-to-listing', 'listing-to-message']));
  });
});
