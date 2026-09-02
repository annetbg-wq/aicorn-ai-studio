import { describe, expect, it } from 'vitest';
import { compileSkeletonContract, listSkeletonContractIds } from '../SkeletonContractCompiler';

describe('Compiled skeleton quality contracts — 15/15', () => {
  it.each(listSkeletonContractIds())('%s has a non-empty quality contract', id => {
    const contract = compileSkeletonContract(id).quality;
    expect(contract.minMeaningfulScreens).toBeGreaterThan(0);
    expect(contract.requiredCapabilities.length).toBeGreaterThan(0);
    expect(contract.requiredFlows.length).toBeGreaterThan(0);
    expect(new Set(contract.requiredCapabilities).size).toBe(contract.requiredCapabilities.length);
    expect(new Set(contract.requiredFlows).size).toBe(contract.requiredFlows.length);
  });

  it('preserves the current SaaS meaningful-screen threshold declaratively', () => {
    expect(compileSkeletonContract('saas-dashboard').quality.minMeaningfulScreens).toBe(3);
  });

  it('makes commerce and marketplace flows explicit rather than relying on generic screen count', () => {
    expect(compileSkeletonContract('ecommerce').quality.requiredFlows)
      .toEqual(expect.arrayContaining(['browse-to-product', 'product-to-cart', 'cart-to-checkout']));
    expect(compileSkeletonContract('marketplace-platform').quality.requiredFlows)
      .toEqual(expect.arrayContaining(['browse-to-listing', 'listing-to-message']));
  });
});
