import { describe, expect, it } from 'vitest';
import {
  evaluateSkeletonIntentCompatibility,
  resolvePreferredSkeletonForIntent,
} from '../SkeletonSelectionCompatibility';
import { selectSkeletonWithSafeOverrides } from '../SkeletonRegistry';

describe('Skeleton selection manifest compatibility runtime', () => {
  it.each([
    ['landing-intent', 'landing-page'],
    ['dashboard-intent', 'saas-dashboard'],
    ['marketplace-intent', 'ecommerce'],
    ['social-intent', 'social-community'],
    ['game-intent', 'game-interactive-app'],
  ] as const)('%s resolves its preferred skeleton from manifest productTypes', (signal, expected) => {
    expect(resolvePreferredSkeletonForIntent(signal)).toBe(expected);
  });

  it('marks explicit manifest incompatibility as a mismatch', () => {
    const result = evaluateSkeletonIntentCompatibility({
      selectedSkeletonId: 'saas-dashboard',
      signal: 'game-intent',
    });
    expect(result?.explicitlyIncompatible).toBe(true);
    expect(result?.mismatch).toBe(true);
    expect(result?.preferredSkeletonId).toBe('game-interactive-app');
  });

  it('rescues a weak neutral mobile fallback using manifest-compatible social target', () => {
    const result = evaluateSkeletonIntentCompatibility({
      selectedSkeletonId: 'mobile-app',
      signal: 'social-intent',
      weakFallback: true,
    });
    expect(result?.explicitlyCompatible).toBe(false);
    expect(result?.explicitlyIncompatible).toBe(false);
    expect(result?.mismatch).toBe(true);
    expect(result?.preferredSkeletonId).toBe('social-community');
  });

  it('does not steamroll a neutral selection when it is not a weak fallback', () => {
    const result = evaluateSkeletonIntentCompatibility({
      selectedSkeletonId: 'mobile-app',
      signal: 'social-intent',
      weakFallback: false,
    });
    expect(result?.mismatch).toBe(false);
  });

  it('preserves representative safe-override outcomes through manifest compatibility', () => {
    expect(selectSkeletonWithSafeOverrides('', ['homepage']).finalSelectedSkeletonId).toBe('landing-page');
    expect(selectSkeletonWithSafeOverrides('', ['analytics']).finalSelectedSkeletonId).toBe('saas-dashboard');
    expect(selectSkeletonWithSafeOverrides('', ['listing']).finalSelectedSkeletonId).toBe('ecommerce');
    expect(selectSkeletonWithSafeOverrides('', ['forum']).finalSelectedSkeletonId).toBe('social-community');
  });

  it('keeps Registry free of hardcoded skeleton-fit sets and override tables', async () => {
    const source = await import('node:fs/promises').then(fs =>
      fs.readFile(new URL('../SkeletonRegistry.ts', import.meta.url), 'utf8'),
    );
    for (const legacy of [
      'SOCIAL_APPROPRIATE',
      'GAME_APPROPRIATE',
      'PLAIN_DESK_SKELETONS',
      'SAFE_OVERRIDE_RULES',
    ]) {
      expect(source).not.toContain(legacy);
    }
    expect(source).toContain('evaluateSkeletonIntentCompatibility');
  });
});
