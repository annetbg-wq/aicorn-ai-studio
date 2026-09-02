import { describe, expect, it } from 'vitest';
import { buildVisualUsageDiagnostics } from '../ProtoPipeline';
import { compileSkeletonContract, listSkeletonContractIds } from '../SkeletonContractCompiler';

const expectedSkeletonIds = [
  'mobile-app', 'super-app', 'saas-dashboard', 'landing-page', 'social-community',
  'productivity-tool', 'ecommerce', 'b2b-operations-workspace',
  'marketplace-platform', 'creator-editor-workspace', 'dating-matching-app',
  'gaming-casino-app', 'game-interactive-app', 'booking-service-app',
  'content-learning-app',
] as const;

describe('Skeleton quality contract runtime — 15/15', () => {
  it('covers every skeleton id with a positive meaningful-screen threshold', () => {
    const ids = listSkeletonContractIds();
    expect([...ids].sort()).toEqual([...expectedSkeletonIds].sort());
    for (const id of ids) {
      const contract = compileSkeletonContract(id).quality;
      expect(contract.minMeaningfulScreens).toBeGreaterThan(0);
      expect(contract.requiredCapabilities.length).toBeGreaterThan(0);
      expect(contract.requiredFlows.length).toBeGreaterThan(0);
    }
  });

  it('preserves representative manifest thresholds', () => {
    expect(compileSkeletonContract('landing-page').quality.minMeaningfulScreens).toBe(1);
    expect(compileSkeletonContract('saas-dashboard').quality.minMeaningfulScreens).toBe(3);
    expect(compileSkeletonContract('mobile-app').quality.minMeaningfulScreens).toBe(4);
    expect(compileSkeletonContract('super-app').quality.minMeaningfulScreens).toBe(6);
    expect(compileSkeletonContract('ecommerce').quality.minMeaningfulScreens).toBe(5);
  });

  it.each([
    ['landing-page', 1],
    ['saas-dashboard', 3],
    ['mobile-app', 4],
    ['super-app', 6],
    ['ecommerce', 5],
  ] as const)('%s diagnostics enforce its manifest threshold', (skeletonId, minScreens) => {
    const result = buildVisualUsageDiagnostics({
      files: {},
      skeletonId,
      selectedPremiumComponentIds: [],
      materializedMediaFiles: [],
    });
    expect(result.meaningfulScreenCount).toBe(0);
    expect(result.visualUsageNotes).toContain(
      `${skeletonId} quality contract requires at least ${minScreens} meaningful screens; observed 0.`,
    );
  });

  it('contains no SaaS-only meaningful-screen quality branch', async () => {
    const source = await import('node:fs/promises').then(fs =>
      fs.readFile(new URL('../ProtoPipeline.ts', import.meta.url), 'utf8'),
    );
    expect(source).toContain('qualityContract.minMeaningfulScreens');
    expect(source).not.toContain("input.skeletonId === 'saas-dashboard' && meaningfulScreenFiles.length < 3");
  });
});
