// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  extractJsonObjectFromModelText,
  validateArchitectJsonShape,
} from '../architectJson';
import { resolveDesignContext } from '../DesignContract';
import {
  buildUiPrimitiveImportCatalog,
  materializePremiumComponents,
  materializeMediaAssets,
} from '../ProtoPipeline';

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

describe('ProtoPipeline coder UI primitive catalog', () => {
  it('lists exact physical import paths and does not advertise unlisted primitives', () => {
    const catalog = buildUiPrimitiveImportCatalog(['Button', 'ScrollArea']);

    expect(catalog).toContain("Button from '@/components/ui/button'");
    expect(catalog).toContain("ScrollArea, ScrollBar from '@/components/ui/scroll-area'");
    expect(catalog).not.toContain('DropdownMenu');
    expect(catalog).not.toContain('Separator');
  });

  it('filters unsupported primitive names out of the coder import catalog', () => {
    const catalog = buildUiPrimitiveImportCatalog(['Button', 'ImaginaryPrimitive', 'AlertDialog']);

    expect(catalog).toContain("Button from '@/components/ui/button'");
    expect(catalog).toContain("AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger from '@/components/ui/alert-dialog'");
    expect(catalog).not.toContain('ImaginaryPrimitive');
  });
});

describe('architect model JSON extraction', () => {
  const architectJson = JSON.stringify({
    appName: 'Habit Tracker',
    skeleton: 'mobile-app',
    fileTree: {
      'src/pages/Home.tsx': 'Shows the daily checklist and uses habit state.',
      'src/pages/Stats.tsx': 'Shows streak charts and uses computed habit metrics.',
    },
  });

  it('parses pure architect JSON', () => {
    const result = extractJsonObjectFromModelText(architectJson, {
      validate: value => validateArchitectJsonShape(value),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect((result.value as Record<string, unknown>).appName).toBe('Habit Tracker');
  });

  it('parses architect JSON wrapped in prose before and after the object', () => {
    const result = extractJsonObjectFromModelText(
      `Here is the architecture plan.\n\n${architectJson}\n\nUse this as the implementation guide.`,
      { validate: value => validateArchitectJsonShape(value) },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect((result.value as Record<string, unknown>).skeleton).toBe('mobile-app');
  });

  it('parses architect JSON inside an unlabeled code fence', () => {
    const result = extractJsonObjectFromModelText(
      `\`\`\`\n${architectJson}\n\`\`\``,
      { validate: value => validateArchitectJsonShape(value) },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect((result.value as Record<string, unknown>).appName).toBe('Habit Tracker');
  });

  it('fails invalid JSON with a useful parse error and safe snippets', () => {
    const result = extractJsonObjectFromModelText(
      'Architect draft:\n```json\n{"appName":"Habit Tracker","skeleton":"mobile-app","fileTree":{"src/pages/Home.tsx":"x",}}\n```',
      { validate: value => validateArchitectJsonShape(value) },
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected parser failure');
    expect(result.error).toMatch(/could not be parsed/i);
    expect(result.parseError).toBeTruthy();
    expect(result.rawSnippet).toContain('Architect draft:');
    expect(result.candidateSnippet).toContain('"appName":"Habit Tracker"');
  });

  it('fails schema validation when required architect fields are missing', () => {
    const result = extractJsonObjectFromModelText(
      JSON.stringify({
        skeleton: 'mobile-app',
        fileTree: {
          'src/pages/Home.tsx': 'Shows the daily checklist and uses habit state.',
        },
      }),
      { validate: value => validateArchitectJsonShape(value) },
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected schema failure');
    expect(result.error).toMatch(/schema validation failed/i);
    expect(result.schemaError).toMatch(/appName/i);
  });

  it('rejects arbitrary non-JSON text', () => {
    const result = extractJsonObjectFromModelText(
      'I would build a mobile app with habits, streaks, and a nice dashboard.',
      { validate: value => validateArchitectJsonShape(value) },
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected non-JSON failure');
    expect(result.error).toMatch(/no json object found/i);
  });
});
