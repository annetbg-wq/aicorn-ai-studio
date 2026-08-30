import { describe, expect, it } from 'vitest';
import { buildVisualUsageDiagnostics } from '../ProtoPipeline';
import { getSkeletonQualityContract, listSkeletonQualityContractIds } from '../SkeletonQualityContract';

const expectedSkeletonIds = [
  'mobile-app', 'saas-dashboard', 'landing-page', 'social-community',
  'productivity-tool', 'ecommerce', 'b2b-operations-workspace',
  'marketplace-platform', 'creator-editor-workspace', 'dating-matching-app',
  'gaming-casino-app', 'game-interactive-app', 'booking-service-app',
  'content-learning-app',
] as const;

describe('Skeleton quality contract runtime — 14/14', () => {
  it('covers every skeleton id with a positive meaningful-screen threshold', () => {
    const ids = listSkeletonQualityContractIds();
    expect([...ids].sort()).toEqual([...expectedSkeletonIds].sort());
    for (const id of ids) {
      const contract = getSkeletonQualityContract(id);
      expect(contract.minMeaningfulScreens).toBeGreaterThan(0);
      expect(contract.requiredCapabilities.length).toBeGreaterThan(0);
      expect(contract.requiredFlows.length).toBeGreaterThan(0);
    }
  });

  it('preserves representative manifest thresholds', () => {
    expect(getSkeletonQualityContract('landing-page').minMeaningfulScreens).toBe(1);
    expect(getSkeletonQualityContract('saas-dashboard').minMeaningfulScreens).toBe(3);
    expect(getSkeletonQualityContract('mobile-app').minMeaningfulScreens).toBe(4);
    expect(getSkeletonQualityContract('ecommerce').minMeaningfulScreens).toBe(5);
  });

  it.each([
    ['landing-page', 1],
    ['saas-dashboard', 3],
    ['mobile-app', 4],
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
