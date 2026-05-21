// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadPremiumComponentBank,
  resetPremiumComponentBankCache,
  resolvePremiumComponentSelection,
  selectPremiumRecipe,
  warmupPremiumPreviews,
} from '../PremiumComponentBankService';

describe('PremiumComponentBankService', () => {
  beforeAll(async () => {
    // Bucket C moved warmup to explicit call in VisualBankModule (no longer auto-runs on import).
    // Tests must warm up preview adapters before querying renderSafeComponents.
    await warmupPremiumPreviews();
    resetPremiumComponentBankCache();
  });

  it('loads source audits, component manifests, recipes, and previews from prototype-bank files', () => {
    const bank = loadPremiumComponentBank();

    expect(bank.sources.length).toBeGreaterThanOrEqual(8);
    expect(bank.components).toHaveLength(48);
    expect(bank.recipes).toHaveLength(6);
    expect(bank.registry?.components).toHaveLength(48);
    expect(bank.renderSafeComponents).toHaveLength(48);
    expect(bank.metadataOnlyComponents).toHaveLength(0);
    expect(bank.errors).toEqual([]);
    expect(bank.coverage).toMatchObject({
      landing: 6,
      dashboard: 7,
      mobile: 5,
      ecommerce: 4,
      social: 4,
      health: 4,
      motion: 5,
      data: 3,
    });
  });

  it('records verified licenses before import and keeps disallowed sources out of imported manifests', () => {
    const bank = loadPremiumComponentBank();
    const sourceById = new Map(bank.sources.map(source => [source.id, source]));

    expect(sourceById.get('shadcn-ui')?.licenseFileVerified).toBe(true);
    expect(sourceById.get('magic-ui')?.licenseFileVerified).toBe(true);
    expect(sourceById.get('flowbite-react')?.licenseFileVerified).toBe(true);
    expect(sourceById.get('tremor')?.licenseFileVerified).toBe(true);
    expect(sourceById.get('react-bits')?.allowedForLocalImport).toBe(false);
    expect(sourceById.get('origin-ui')?.allowedForLocalImport).toBe(false);
    expect(bank.components.some(component => !component.sourceManifest?.allowedForLocalImport)).toBe(false);
  });

  it('selects premium recipes and component files for the requested skeletons', () => {
    expect(selectPremiumRecipe({ brief: 'launch a premium saas site', skeletonId: 'landing-page', domainId: 'saas' })?.id).toBe('landing-premium-saas');
    expect(selectPremiumRecipe({ brief: 'operator analytics dashboard', skeletonId: 'saas-dashboard', domainId: 'saas' })?.id).toBe('dashboard-operator');
    expect(selectPremiumRecipe({ brief: 'consumer mobile app with onboarding', skeletonId: 'mobile-app', domainId: 'consumer' })?.id).toBe('mobile-consumer-app');
    expect(selectPremiumRecipe({ brief: 'wellness mobile app', skeletonId: 'mobile-app', domainId: 'wellness' })?.id).toBe('health-wellness-mobile');
    expect(selectPremiumRecipe({ brief: 'storefront checkout flow', skeletonId: 'ecommerce', domainId: 'ecommerce' })?.id).toBe('ecommerce-storefront');
    expect(selectPremiumRecipe({ brief: 'creator community', skeletonId: 'social-community', domainId: 'social' })?.id).toBe('social-community');

    const selection = resolvePremiumComponentSelection({
      brief: 'launch a premium saas site',
      skeletonId: 'landing-page',
      domainId: 'saas',
      surfaces: ['landing', 'hero', 'marketing'],
    });

    expect(selection.selectedRecipeId).toBe('landing-premium-saas');
    expect(selection.selectedComponents.length).toBeGreaterThanOrEqual(5);
    expect(selection.componentSourceFiles.every(path => path.includes('prototype-bank/design-packs/premium-components/'))).toBe(true);
    expect(selection.previewAdapterFiles.every(path => path.includes('prototype-bank/design-packs/premium-components/preview-adapters/'))).toBe(true);
    expect(selection.usageRules).toContain('Use available premium blocks if compatible with the selected skeleton.');
    expect(selection.forbiddenPatterns).toContain('Do not use remote random media URLs.');
  });

  it('returns health component source files for the wellness mobile recipe', () => {
    const selection = resolvePremiumComponentSelection({
      brief: 'wellness mobile app with habit routine tracking',
      skeletonId: 'mobile-app',
      domainId: 'wellness',
      surfaces: ['mobile', 'health', 'habit'],
    });

    expect(selection.selectedRecipeId).toBe('health-wellness-mobile');
    expect(selection.componentSourceFiles.length).toBeGreaterThan(0);
    expect(
      selection.componentSourceFiles.some(path => path.includes('prototype-bank/design-packs/premium-components/health/')),
    ).toBe(true);
  });
});
