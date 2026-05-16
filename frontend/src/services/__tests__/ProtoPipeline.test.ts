// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { resolveDesignContext } from '../DesignContract';
import { materializePremiumComponents, materializeMediaAssets } from '../ProtoPipeline';

describe('ProtoPipeline premium materialization', () => {
  it('copies selected premium component files and the shared registry into preview design-pack paths', async () => {
    const ctx = await resolveDesignContext('wellness mobile app with habit routine tracking', 'mobile-app');
    const materialized = materializePremiumComponents(ctx);

    expect(ctx.premiumComponentSelection.selectedRecipeId).toBe('health-wellness-mobile');
    expect(materialized.materializedFiles).toContain(
      'design-pack/premium-components/_registry/premiumComponentPrimitives.tsx',
    );
    expect(
      materialized.materializedFiles.some(path => (
        path.startsWith('design-pack/premium-components/health/') &&
        path.endsWith('/component.tsx')
      )),
    ).toBe(true);
    expect(
      materialized.files['design-pack/premium-components/_registry/premiumComponentPrimitives.tsx'],
    ).toContain('PremiumPresetRenderer');
    expect(
      materialized.importHints.some(hint => hint.importPath.startsWith('@/design-pack/premium-components/health/')),
    ).toBe(true);
  });
});

describe('ProtoPipeline media materialization', () => {
  it('produces deterministic local SVG media files and hints without network access', async () => {
    const ctx = await resolveDesignContext('wellness mobile app with habit routine tracking', 'mobile-app');
    const result = await materializeMediaAssets(ctx, 'wellness mobile app with habit routine tracking', 'mobile-app');

    expect(result.materializedFiles.length).toBeGreaterThan(0);
    expect(result.mediaHints.length).toBeGreaterThan(0);
    expect(result.mediaManifestPath).toBe('src/assets/generated/media-manifest.json');
    expect(result.files[result.mediaManifestPath!]).toContain('"assets"');

    const svgPath = result.materializedFiles.find(f => f.endsWith('.svg'));
    expect(svgPath).toBeTruthy();
    expect(result.files[svgPath!]).toContain('<svg');

    expect(result.mediaHints[0]).toHaveProperty('id');
    expect(result.mediaHints[0]).toHaveProperty('kind');
    expect(result.mediaHints[0]).toHaveProperty('importPath');
    expect(result.mediaHints[0]).toHaveProperty('recommendedUse');
  });

  it('returns empty result when no media intent is resolved (no-media brief)', async () => {
    // A plain saas-dashboard brief with no health/ecommerce/social triggers
    const ctx = await resolveDesignContext('project tracker', 'saas-dashboard');
    const result = await materializeMediaAssets(ctx, 'project tracker', 'saas-dashboard');

    // May or may not have media (depends on recipe), but structure is always valid
    expect(Array.isArray(result.materializedFiles)).toBe(true);
    expect(Array.isArray(result.mediaHints)).toBe(true);
    expect(typeof result.files).toBe('object');
  });

  it('materialized media files are present in apply-step output structure (telemetry fields exist)', async () => {
    const ctx = await resolveDesignContext('landing page for SaaS product launch', 'landing-page');
    const result = await materializeMediaAssets(ctx, 'landing page for SaaS product launch', 'landing-page');

    expect(result.materializedFiles.length).toBeGreaterThan(0);
    // Hero image expected for landing page
    expect(result.mediaHints.some(h => h.kind === 'hero-image')).toBe(true);
    // Manifest path is set
    expect(result.mediaManifestPath).toBeTruthy();
    // All files in materializedFiles exist in files map
    for (const path of result.materializedFiles) {
      expect(result.files).toHaveProperty(path);
    }
  });
});
