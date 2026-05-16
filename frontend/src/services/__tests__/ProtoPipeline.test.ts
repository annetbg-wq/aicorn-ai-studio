// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { resolveDesignContext } from '../DesignContract';
import { materializePremiumComponents } from '../ProtoPipeline';

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
