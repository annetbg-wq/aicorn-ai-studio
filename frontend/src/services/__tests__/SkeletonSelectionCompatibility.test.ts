import { describe, expect, it } from 'vitest';
import { listSkeletonContractIds } from '../SkeletonContractCompiler';
import {
  getSkeletonSelectionCompatibility,
  listSkeletonSelectionCompatibilityIds,
  scoreSkeletonCompatibility,
} from '../SkeletonSelectionCompatibility';

describe('Skeleton selection compatibility — 14/14', () => {
  it('covers every canonical skeleton', () => {
    expect([...listSkeletonSelectionCompatibilityIds()].sort())
      .toEqual([...listSkeletonContractIds()].sort());
  });

  it.each(listSkeletonContractIds())('%s declares positive and negative compatibility', id => {
    const contract = getSkeletonSelectionCompatibility(id);
    expect(contract.archetypes.length).toBeGreaterThan(0);
    expect(contract.surfaces.length).toBeGreaterThan(0);
    expect(contract.capabilities.length).toBeGreaterThan(0);
    expect(contract.incompatibleArchetypes.length).toBeGreaterThan(0);
  });

  it('rejects obvious cross-family mismatches deterministically', () => {
    expect(scoreSkeletonCompatibility('dating-matching-app', 'dashboard')).toBe(-100);
    expect(scoreSkeletonCompatibility('b2b-operations-workspace', 'dating')).toBe(-100);
    expect(scoreSkeletonCompatibility('game-interactive-app', 'marketing')).toBe(-100);
    expect(scoreSkeletonCompatibility('landing-page', 'interactive-game')).toBe(-100);
  });

  it('scores intended archetypes as strong matches', () => {
    expect(scoreSkeletonCompatibility('landing-page', 'marketing')).toBe(100);
    expect(scoreSkeletonCompatibility('saas-dashboard', 'dashboard')).toBe(100);
    expect(scoreSkeletonCompatibility('marketplace-platform', 'marketplace')).toBe(100);
    expect(scoreSkeletonCompatibility('booking-service-app', 'booking')).toBe(100);
  });
});
