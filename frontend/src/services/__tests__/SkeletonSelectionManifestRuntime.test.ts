import { describe, expect, it } from 'vitest';
import { compileSkeletonContract } from '../SkeletonContractCompiler';
import { selectSkeletonCanonical } from '../SkeletonRegistry';

describe('Skeleton canonical manifest selection runtime', () => {
  it.each([
    ['landing-page', 'marketing'],
    ['saas-dashboard', 'dashboard'],
    ['ecommerce', 'commerce'],
    ['social-community', 'social'],
    ['game-interactive-app', 'interactive-game'],
  ] as const)('%s declares the archetype used by canonical intent resolution', (id, archetype) => {
    expect(compileSkeletonContract(id).selection.productTypes).toContain(archetype);
  });

  it('keeps explicit cross-family incompatibility in compiled manifests', () => {
    expect(compileSkeletonContract('saas-dashboard').selection.incompatibleArchetypes).toContain('interactive-game');
    expect(compileSkeletonContract('game-interactive-app').selection.incompatibleArchetypes).toContain('dashboard');
  });

  it('rescues a weak neutral mobile baseline using manifest-compatible social intent', () => {
    const result = selectSkeletonCanonical('', ['forum']);
    expect(result.originalSelectedSkeletonId).toBe('mobile-app');
    expect(result.finalSelectedSkeletonId).toBe('social-community');
    expect(result.overrideApplied).toBe(true);
  });

  it('preserves representative canonical outcomes through manifest selection', () => {
    expect(selectSkeletonCanonical('', ['homepage']).finalSelectedSkeletonId).toBe('landing-page');
    expect(selectSkeletonCanonical('', ['analytics']).finalSelectedSkeletonId).toBe('saas-dashboard');
    expect(selectSkeletonCanonical('', ['listing']).finalSelectedSkeletonId).toBe('ecommerce');
    expect(selectSkeletonCanonical('', ['forum']).finalSelectedSkeletonId).toBe('social-community');
  });

  it('keeps Registry free of hardcoded skeleton-fit sets and external compatibility shims', async () => {
    const source = await import('node:fs/promises').then(fs =>
      fs.readFile(new URL('../SkeletonRegistry.ts', import.meta.url), 'utf8'),
    );
    for (const legacy of [
      'SOCIAL_APPROPRIATE',
      'GAME_APPROPRIATE',
      'PLAIN_DESK_SKELETONS',
      'SAFE_OVERRIDE_RULES',
      'SkeletonSelectionCompatibility',
      'evaluateSkeletonIntentCompatibility',
    ]) {
      expect(source).not.toContain(legacy);
    }
    expect(source).toContain('compileSkeletonContract(id).selection');
    expect(source).toContain('resolveCanonicalSkeletonSelection');
  });
});
