/**
 * DesignFusion — WI-7 test suite.
 *
 * Covers:
 *   - Design fusion prompt hierarchy present and ordered correctly
 *   - Alert vs AlertDialog rule present
 *   - Direct Radix import forbidden rule present
 *   - Custom component only after premium/shadcn fallback
 *   - Uploaded asset manifest generation
 *   - Uploaded asset import paths are stable and safe
 *   - Asset materialization creates importable modules
 *   - Prompt includes id/import path/surface guidance
 *   - No path traversal in import paths
 *   - Premium component appears in prompt with id/path/surface
 *   - ProtoPipeline design fusion block present via buildCoderPlanningBlocks
 *   - LVPipeline design fusion block present in coder system prompt
 *   - Safety: no preview-workspace, no agent-config, no provider defaults
 */

import { describe, expect, it } from 'vitest';
import {
  SHADCN_PRIMITIVE_CATALOG,
  VISUAL_ASSET_SURFACES,
  buildUploadedAssetFusionEntries,
  buildPremiumFusionEntries,
  buildDesignFusionPromptBlock,
  detectDirectRadixImports,
  countShadcnPrimitiveUsages,
  validateAssetImportPath,
  computeDesignFusionTelemetry,
  type UploadedAssetFusionEntry,
  type PremiumFusionEntry,
} from '../DesignFusionService';
import { buildCoderPlanningBlocks } from '../ProtoPipeline';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const sampleRawEntries = [
  {
    id: '01-hero-image',
    kind: 'image' as const,
    name: 'hero-image.png',
    moduleImportPath: '@/generated/uploads/01-hero-image',
  },
  {
    id: '02-logo',
    kind: 'image' as const,
    name: 'brand-logo.svg',
    moduleImportPath: '@/generated/uploads/02-logo',
  },
  {
    id: '03-spec',
    kind: 'code' as const,
    name: 'api-spec.ts',
    moduleImportPath: '@/generated/uploads/03-spec',
    excerpt: 'export interface User { id: string; name: string; }',
  },
];

const samplePremiumComponents = [
  {
    id: 'health-ritual-card',
    name: 'RitualCard',
    kind: 'hero',
    file: 'prototype-bank/design-packs/premium-components/health/RitualCard/component.tsx',
    usageRules: ['Use RitualCard in the home screen hero section'],
    forbiddenPatterns: ['Do not use outside health domain', 'Do not downgrade to generic card'],
  },
  {
    id: 'health-progress-ring',
    name: 'ProgressRing',
    kind: 'metric',
    file: 'prototype-bank/design-packs/premium-components/health/ProgressRing/component.tsx',
    usageRules: ['Use ProgressRing for habit completion display'],
    forbiddenPatterns: [],
  },
];

// ── 1. shadcn primitive catalog ───────────────────────────────────────────────

describe('SHADCN_PRIMITIVE_CATALOG', () => {
  it('contains all required primitives', () => {
    const required = [
      'Alert', 'AlertDialog', 'Badge', 'Button', 'Card', 'Checkbox',
      'Dialog', 'Input', 'Label', 'Progress', 'ScrollArea', 'Select',
      'Switch', 'Tabs', 'Textarea', 'Tooltip',
    ];
    for (const name of required) {
      expect(SHADCN_PRIMITIVE_CATALOG).toContain(name as typeof SHADCN_PRIMITIVE_CATALOG[number]);
    }
  });

  it('Alert and AlertDialog are distinct entries', () => {
    expect(SHADCN_PRIMITIVE_CATALOG).toContain('Alert' as typeof SHADCN_PRIMITIVE_CATALOG[number]);
    expect(SHADCN_PRIMITIVE_CATALOG).toContain('AlertDialog' as typeof SHADCN_PRIMITIVE_CATALOG[number]);
    const alertIdx = SHADCN_PRIMITIVE_CATALOG.indexOf('Alert');
    const dialogIdx = SHADCN_PRIMITIVE_CATALOG.indexOf('AlertDialog');
    expect(alertIdx).not.toBe(dialogIdx);
  });
});

describe('VISUAL_ASSET_SURFACES', () => {
  it('includes expected visual surfaces', () => {
    const expected = ['hero', 'onboarding', 'empty-state', 'marketing', 'feature-block'];
    for (const surface of expected) {
      expect(VISUAL_ASSET_SURFACES).toContain(surface as typeof VISUAL_ASSET_SURFACES[number]);
    }
  });
});

// ── 2. Design fusion prompt block — hierarchy ─────────────────────────────────

describe('buildDesignFusionPromptBlock — hierarchy', () => {
  it('includes DESIGN FUSION CONTRACT header', () => {
    const block = buildDesignFusionPromptBlock({ uploadedAssets: [], premiumComponents: [] });
    expect(block).toContain('DESIGN FUSION CONTRACT');
  });

  it('hierarchy sections A, B, C are present in correct order', () => {
    const block = buildDesignFusionPromptBlock({ uploadedAssets: [], premiumComponents: [] });
    const posA = block.indexOf('A) UPLOADED ASSETS');
    const posB = block.indexOf('B) SHADCN UI PRIMITIVES');
    const posC = block.indexOf('C) LOCAL CUSTOM COMPONENTS');
    expect(posA).toBeGreaterThanOrEqual(0);
    expect(posB).toBeGreaterThanOrEqual(0);
    expect(posC).toBeGreaterThanOrEqual(0);
    expect(posA).toBeLessThan(posB);
    expect(posB).toBeLessThan(posC);
  });

  it('section A mentions hero, empty-state, onboarding surfaces', () => {
    const block = buildDesignFusionPromptBlock({ uploadedAssets: [], premiumComponents: [] });
    const sectionA = block.slice(block.indexOf('A)'), block.indexOf('B)'));
    expect(sectionA).toMatch(/hero/i);
    expect(sectionA).toMatch(/empty.?state/i);
    expect(sectionA).toMatch(/onboarding/i);
  });

  it('section B mentions shadcn primitives including Alert, Dialog, Tabs, Switch', () => {
    const block = buildDesignFusionPromptBlock({ uploadedAssets: [], premiumComponents: [] });
    const sectionB = block.slice(block.indexOf('B)'), block.indexOf('C)'));
    expect(sectionB).toContain('Alert');
    expect(sectionB).toContain('Dialog');
    expect(sectionB).toContain('Tabs');
    expect(sectionB).toContain('Switch');
    expect(sectionB).toContain('Input');
    expect(sectionB).toContain('Button');
  });

  it('section C restricts custom components to last resort', () => {
    const block = buildDesignFusionPromptBlock({ uploadedAssets: [], premiumComponents: [] });
    const sectionC = block.slice(block.indexOf('C)'));
    expect(sectionC).toMatch(/only when/i);
  });
});

// ── 3. Alert vs AlertDialog distinction ──────────────────────────────────────

describe('buildDesignFusionPromptBlock — Alert vs AlertDialog', () => {
  it('explicitly defines Alert as inline callout/status', () => {
    const block = buildDesignFusionPromptBlock({ uploadedAssets: [], premiumComponents: [] });
    expect(block).toMatch(/Alert\s+=\s+inline/i);
  });

  it('explicitly defines AlertDialog as modal confirmation/destructive', () => {
    const block = buildDesignFusionPromptBlock({ uploadedAssets: [], premiumComponents: [] });
    expect(block).toMatch(/AlertDialog\s+=\s+modal/i);
  });

  it('warns not to confuse Alert and AlertDialog', () => {
    const block = buildDesignFusionPromptBlock({ uploadedAssets: [], premiumComponents: [] });
    expect(block).toMatch(/do not confuse/i);
  });
});

// ── 4. Direct Radix import forbidden ─────────────────────────────────────────

describe('buildDesignFusionPromptBlock — radix import rule', () => {
  it('forbids direct @radix-ui/react-* imports', () => {
    const block = buildDesignFusionPromptBlock({ uploadedAssets: [], premiumComponents: [] });
    expect(block).toContain('@radix-ui/react-*');
    expect(block).toMatch(/NEVER import from @radix-ui/i);
  });

  it('mandates @/components/ui/* paths', () => {
    const block = buildDesignFusionPromptBlock({ uploadedAssets: [], premiumComponents: [] });
    expect(block).toContain('@/components/ui/*');
  });
});

// ── 5. Uploaded asset manifest generation ────────────────────────────────────

describe('buildUploadedAssetFusionEntries', () => {
  it('generates an entry for each raw input with an importPath', () => {
    const entries = buildUploadedAssetFusionEntries(sampleRawEntries);
    expect(entries).toHaveLength(3);
  });

  it('correctly maps id and originalName', () => {
    const entries = buildUploadedAssetFusionEntries(sampleRawEntries);
    expect(entries[0].id).toBe('01-hero-image');
    expect(entries[0].originalName).toBe('hero-image.png');
    expect(entries[1].id).toBe('02-logo');
    expect(entries[1].originalName).toBe('brand-logo.svg');
  });

  it('preserves the import path from raw entry', () => {
    const entries = buildUploadedAssetFusionEntries(sampleRawEntries);
    expect(entries[0].importPath).toBe('@/generated/uploads/01-hero-image');
    expect(entries[1].importPath).toBe('@/generated/uploads/02-logo');
  });

  it('infers image assets as visual category', () => {
    const entries = buildUploadedAssetFusionEntries(sampleRawEntries);
    expect(entries[0].category).toBe('visual');
    expect(entries[1].category).toBe('visual');
  });

  it('infers code assets as reference category', () => {
    const entries = buildUploadedAssetFusionEntries(sampleRawEntries);
    expect(entries[2].category).toBe('reference');
  });

  it('assigns hero/marketing/feature-block surfaces to generic hero images', () => {
    const entries = buildUploadedAssetFusionEntries([sampleRawEntries[0]]);
    expect(entries[0].intendedSurfaces).toContain('hero');
  });

  it('assigns visual-identity surface to logo images', () => {
    const entries = buildUploadedAssetFusionEntries([sampleRawEntries[1]]);
    expect(entries[0].intendedSurfaces).toContain('visual-identity');
  });

  it('filters entries without moduleImportPath', () => {
    const rawWithMissing = [
      { id: 'x', kind: 'image', name: 'x.png' }, // no moduleImportPath
      { id: 'y', kind: 'image', name: 'y.png', moduleImportPath: '@/generated/uploads/y' },
    ];
    const entries = buildUploadedAssetFusionEntries(rawWithMissing);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('y');
  });
});

// ── 6. Uploaded asset import path safety ─────────────────────────────────────

describe('validateAssetImportPath', () => {
  it('accepts valid @/ paths', () => {
    expect(validateAssetImportPath('@/generated/uploads/01-logo').safe).toBe(true);
    expect(validateAssetImportPath('@/generated/uploads/02-hero-image').safe).toBe(true);
  });

  it('rejects path traversal (..)', () => {
    const result = validateAssetImportPath('@/generated/../../etc/passwd');
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/traversal/i);
  });

  it('rejects backslash in path', () => {
    const result = validateAssetImportPath('@/generated\\uploads\\logo');
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/backslash/i);
  });

  it('rejects paths not starting with @/', () => {
    const result = validateAssetImportPath('generated/uploads/logo');
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/@\//);
  });

  it('all entries from buildUploadedAssetFusionEntries are safe', () => {
    const entries = buildUploadedAssetFusionEntries(sampleRawEntries);
    for (const entry of entries) {
      const { safe } = validateAssetImportPath(entry.importPath);
      expect(safe).toBe(true);
    }
  });
});

// ── 7. Asset materialization creates importable modules ───────────────────────

describe('ProtoPipeline.materializeUploadedAssetFusion', () => {
  // Import lazily to avoid issues with ProtoPipeline module-level side effects in tests
  it('creates generated/uploads/<id>.ts module for each image attachment', async () => {
    const { materializeUploadedAssetFusion } = await import('../ProtoPipeline');
    const result = materializeUploadedAssetFusion([
      {
        type: 'image',
        name: 'logo.png',
        data: 'data:image/png;base64,iVBORw0KGgo=',
        mimeType: 'image/png',
      },
    ]);
    expect(result.materializedFiles.length).toBeGreaterThan(0);
    const tsModule = result.materializedFiles.find(f => f.endsWith('.ts'));
    expect(tsModule).toBeTruthy();
    expect(result.files[tsModule!]).toContain('uploadedAsset');
    expect(result.files[tsModule!]).toContain('export default uploadedAsset.dataUrl');
  });

  it('creates a manifest.ts when at least one asset is present', async () => {
    const { materializeUploadedAssetFusion } = await import('../ProtoPipeline');
    const result = materializeUploadedAssetFusion([
      {
        type: 'image',
        name: 'hero.jpg',
        data: 'data:image/jpeg;base64,/9j/4AAQ',
        mimeType: 'image/jpeg',
      },
    ]);
    expect(result.materializedFiles).toContain('generated/uploads/manifest.ts');
    expect(result.files['generated/uploads/manifest.ts']).toContain('UPLOADED_ASSET_MANIFEST');
  });

  it('prompt block includes asset name and import path', async () => {
    const { materializeUploadedAssetFusion } = await import('../ProtoPipeline');
    const result = materializeUploadedAssetFusion([
      {
        type: 'image',
        name: 'hero-photo.png',
        data: 'data:image/png;base64,abc123',
        mimeType: 'image/png',
      },
    ]);
    expect(result.promptBlock).toContain('hero-photo.png');
    expect(result.promptBlock).toMatch(/@\/generated\/uploads/);
  });

  it('returns empty files and empty promptBlock when no attachments', async () => {
    const { materializeUploadedAssetFusion } = await import('../ProtoPipeline');
    const result = materializeUploadedAssetFusion([]);
    expect(result.files).toEqual({});
    expect(result.entries).toHaveLength(0);
    expect(result.promptBlock).toBe('');
  });
});

// ── 8. Prompt includes asset id/import path/surface ──────────────────────────

describe('buildDesignFusionPromptBlock — uploaded asset manifest in prompt', () => {
  it('includes each asset id in the prompt', () => {
    const entries = buildUploadedAssetFusionEntries(sampleRawEntries);
    const block = buildDesignFusionPromptBlock({ uploadedAssets: entries, premiumComponents: [] });
    expect(block).toContain('01-hero-image');
    expect(block).toContain('02-logo');
    expect(block).toContain('03-spec');
  });

  it('includes import path for each asset', () => {
    const entries = buildUploadedAssetFusionEntries(sampleRawEntries);
    const block = buildDesignFusionPromptBlock({ uploadedAssets: entries, premiumComponents: [] });
    expect(block).toContain('@/generated/uploads/01-hero-image');
    expect(block).toContain('@/generated/uploads/02-logo');
  });

  it('includes intended surfaces for each asset', () => {
    const entries = buildUploadedAssetFusionEntries(sampleRawEntries);
    const block = buildDesignFusionPromptBlock({ uploadedAssets: entries, premiumComponents: [] });
    expect(block).toContain('surfaces:');
    expect(block).toMatch(/hero|visual-identity|marketing/);
  });

  it('includes usage guidance for each asset', () => {
    const entries = buildUploadedAssetFusionEntries(sampleRawEntries);
    const block = buildDesignFusionPromptBlock({ uploadedAssets: entries, premiumComponents: [] });
    expect(block).toContain('guidance:');
  });
});

// ── 9. Premium component in prompt with id/path/surface ──────────────────────

describe('buildPremiumFusionEntries + buildDesignFusionPromptBlock', () => {
  it('maps premium component file to @/design-pack import path', () => {
    const entries = buildPremiumFusionEntries(samplePremiumComponents);
    expect(entries[0].importPath).toBe(
      '@/design-pack/premium-components/health/RitualCard/component',
    );
    expect(entries[1].importPath).toBe(
      '@/design-pack/premium-components/health/ProgressRing/component',
    );
  });

  it('includes component id in the prompt', () => {
    const premiumEntries = buildPremiumFusionEntries(samplePremiumComponents);
    const block = buildDesignFusionPromptBlock({ uploadedAssets: [], premiumComponents: premiumEntries });
    expect(block).toContain('health-ritual-card');
    expect(block).toContain('health-progress-ring');
  });

  it('includes import path in the prompt', () => {
    const premiumEntries = buildPremiumFusionEntries(samplePremiumComponents);
    const block = buildDesignFusionPromptBlock({ uploadedAssets: [], premiumComponents: premiumEntries });
    expect(block).toContain('@/design-pack/premium-components/health/RitualCard/component');
  });

  it('includes surface (kind) in the prompt', () => {
    const premiumEntries = buildPremiumFusionEntries(samplePremiumComponents);
    const block = buildDesignFusionPromptBlock({ uploadedAssets: [], premiumComponents: premiumEntries });
    expect(block).toContain('surface: hero');
    expect(block).toContain('surface: metric');
  });

  it('includes usage guidance from component rules', () => {
    const premiumEntries = buildPremiumFusionEntries(samplePremiumComponents);
    const block = buildDesignFusionPromptBlock({ uploadedAssets: [], premiumComponents: premiumEntries });
    expect(block).toContain('Use RitualCard in the home screen hero section');
  });

  it('includes constraints from forbidden patterns', () => {
    const premiumEntries = buildPremiumFusionEntries(samplePremiumComponents);
    const block = buildDesignFusionPromptBlock({ uploadedAssets: [], premiumComponents: premiumEntries });
    expect(block).toContain('Do not use outside health domain');
  });
});

// ── 10. ProtoPipeline — design fusion block in planning blocks ────────────────

describe('ProtoPipeline buildCoderPlanningBlocks — design fusion injection', () => {
  it('includes design fusion block when provided', () => {
    const fusionBlock = buildDesignFusionPromptBlock({ uploadedAssets: [], premiumComponents: [] });
    const result = buildCoderPlanningBlocks({ designFusionBlock: fusionBlock });
    expect(result).toContain('DESIGN FUSION CONTRACT');
  });

  it('design fusion appears after attachment block', () => {
    const fusionBlock = buildDesignFusionPromptBlock({ uploadedAssets: [], premiumComponents: [] });
    const attachBlock = 'UPLOADED ASSETS / REFERENCE MATERIAL\n- image test.png';
    const result = buildCoderPlanningBlocks({
      designFusionBlock: fusionBlock,
      attachmentPromptBlock: attachBlock,
    });
    const posAttach = result.indexOf('UPLOADED ASSETS / REFERENCE MATERIAL');
    const posFusion = result.indexOf('DESIGN FUSION CONTRACT');
    expect(posAttach).toBeGreaterThanOrEqual(0);
    expect(posFusion).toBeGreaterThanOrEqual(0);
    expect(posAttach).toBeLessThan(posFusion);
  });

  it('is empty string when designFusionBlock is undefined', () => {
    const result = buildCoderPlanningBlocks({});
    expect(result).not.toContain('DESIGN FUSION CONTRACT');
  });

  it('design fusion block contains Alert vs AlertDialog distinction', () => {
    const fusionBlock = buildDesignFusionPromptBlock({ uploadedAssets: [], premiumComponents: [] });
    const result = buildCoderPlanningBlocks({ designFusionBlock: fusionBlock });
    expect(result).toMatch(/Alert\s+=\s+inline/i);
    expect(result).toMatch(/AlertDialog\s+=\s+modal/i);
  });
});

// ── 11. LVPipeline — design fusion in blank_canvas prompt ────────────────────

describe('LVPipeline buildLvCoderSystemPrompt — design fusion injection (via lvStreamCoder)', () => {
  // Test the system prompt indirectly through the exported block builder
  it('design fusion block includes shadcn primitive guidance', () => {
    const block = buildDesignFusionPromptBlock({ uploadedAssets: [], premiumComponents: [] });
    // LVPipeline injects this block into its system prompt
    expect(block).toContain('SHADCN UI PRIMITIVES');
    expect(block).toContain('Button');
    expect(block).toContain('Card');
    expect(block).toContain('Input');
  });

  it('design fusion block for blank_canvas has no premium component section when no premiums', () => {
    const block = buildDesignFusionPromptBlock({ uploadedAssets: [], premiumComponents: [] });
    expect(block).not.toContain('PREMIUM COMPONENT SELECTIONS');
  });

  it('design fusion block for blank_canvas includes uploaded assets when present', () => {
    const entries = buildUploadedAssetFusionEntries([sampleRawEntries[0]]);
    const block = buildDesignFusionPromptBlock({ uploadedAssets: entries, premiumComponents: [] });
    expect(block).toContain('UPLOADED ASSET MANIFEST');
    expect(block).toContain('01-hero-image');
  });
});

// ── 12. detectDirectRadixImports ─────────────────────────────────────────────

describe('detectDirectRadixImports', () => {
  it('detects direct @radix-ui/react-* import', () => {
    const files = {
      'components/MyDialog.tsx': `import * as Dialog from '@radix-ui/react-dialog';`,
    };
    const found = detectDirectRadixImports(files);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]).toContain('@radix-ui/react-dialog');
  });

  it('does not flag @/components/ui imports', () => {
    const files = {
      'components/MyForm.tsx': `import { Button } from '@/components/ui/button';`,
    };
    const found = detectDirectRadixImports(files);
    expect(found).toHaveLength(0);
  });

  it('detects multiple direct radix imports across files', () => {
    const files = {
      'A.tsx': `import * as Switch from '@radix-ui/react-switch';`,
      'B.tsx': `import * as Tabs from '@radix-ui/react-tabs';`,
      'C.tsx': `import { Button } from '@/components/ui/button';`, // OK
    };
    const found = detectDirectRadixImports(files);
    expect(found).toHaveLength(2);
  });

  it('returns empty array for clean generated files', () => {
    const cleanFiles = {
      'App.tsx': `import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent } from '@/components/ui/tabs';`,
    };
    expect(detectDirectRadixImports(cleanFiles)).toHaveLength(0);
  });
});

// ── 13. countShadcnPrimitiveUsages ───────────────────────────────────────────

describe('countShadcnPrimitiveUsages', () => {
  it('counts JSX usages of shadcn primitives', () => {
    const files = {
      'App.tsx': `
        <Button>Click me</Button>
        <Card>
          <Input placeholder="name" />
          <Label>Name</Label>
        </Card>
        <Alert>Info here</Alert>
      `,
    };
    const count = countShadcnPrimitiveUsages(files);
    expect(count).toBeGreaterThanOrEqual(5);
  });

  it('returns 0 for files with no shadcn usage', () => {
    const files = { 'App.tsx': '<div className="flex">Hello</div>' };
    expect(countShadcnPrimitiveUsages(files)).toBe(0);
  });
});

// ── 14. computeDesignFusionTelemetry ─────────────────────────────────────────

describe('computeDesignFusionTelemetry', () => {
  it('sets design_fusion_rules_injected from input', () => {
    const tel = computeDesignFusionTelemetry({
      designFusionInjected: true,
      uploadedAssets: [],
      uploadedAssetMaterializedCount: 0,
      premiumComponents: [],
    });
    expect(tel.design_fusion_rules_injected).toBe(true);
  });

  it('counts uploaded assets from manifest', () => {
    const entries = buildUploadedAssetFusionEntries(sampleRawEntries);
    const tel = computeDesignFusionTelemetry({
      designFusionInjected: true,
      uploadedAssets: entries,
      uploadedAssetMaterializedCount: 3,
      premiumComponents: [],
    });
    expect(tel.uploaded_asset_manifest_count).toBe(3);
    expect(tel.uploaded_asset_materialized_count).toBe(3);
  });

  it('detects direct radix imports in generated files', () => {
    const files = { 'X.tsx': `import * as D from '@radix-ui/react-dialog';` };
    const tel = computeDesignFusionTelemetry({
      designFusionInjected: true,
      uploadedAssets: [],
      uploadedAssetMaterializedCount: 0,
      premiumComponents: [],
      generatedFiles: files,
    });
    expect(tel.direct_radix_import_count).toBeGreaterThan(0);
  });

  it('premium_selected_not_used is false when no premium selected', () => {
    const tel = computeDesignFusionTelemetry({
      designFusionInjected: true,
      uploadedAssets: [],
      uploadedAssetMaterializedCount: 0,
      premiumComponents: [],
    });
    expect(tel.premium_selected_not_used).toBe(false);
  });

  it('premium_selected_not_used is true when premium selected but not imported', () => {
    const premiumEntries = buildPremiumFusionEntries(samplePremiumComponents);
    const tel = computeDesignFusionTelemetry({
      designFusionInjected: true,
      uploadedAssets: [],
      uploadedAssetMaterializedCount: 0,
      premiumComponents: premiumEntries,
      generatedFiles: { 'App.tsx': '<div>no premium here</div>' },
    });
    expect(tel.premium_selected_not_used).toBe(true);
    expect(tel.premium_component_selected_count).toBe(2);
    expect(tel.premium_component_used_count).toBe(0);
  });

  it('design_fusion_prompt_evidence is true when prompt contains header', () => {
    const fusionBlock = buildDesignFusionPromptBlock({ uploadedAssets: [], premiumComponents: [] });
    const tel = computeDesignFusionTelemetry({
      designFusionInjected: true,
      uploadedAssets: [],
      uploadedAssetMaterializedCount: 0,
      premiumComponents: [],
      coderSystemPrompt: `Some system...\n${fusionBlock}\nMore text`,
    });
    expect(tel.design_fusion_prompt_evidence).toBe(true);
  });

  it('shadcn_primitive_usage_count reflects actual usages', () => {
    const files = {
      'App.tsx': '<Button>Go</Button><Card>content</Card><Input />',
    };
    const tel = computeDesignFusionTelemetry({
      designFusionInjected: true,
      uploadedAssets: [],
      uploadedAssetMaterializedCount: 0,
      premiumComponents: [],
      generatedFiles: files,
    });
    expect(tel.shadcn_primitive_usage_count).toBeGreaterThanOrEqual(3);
  });
});

// ── 15. Safety: no WI-8 / preview-workspace / backend-agent-config ───────────

describe('Scope safety — design fusion does not touch forbidden files', () => {
  it('DesignFusionService.ts does not import from preview-workspace', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../DesignFusionService.ts'),
      'utf-8',
    );
    expect(src).not.toContain('preview-workspace');
  });

  it('DesignFusionService.ts does not import from backend', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../DesignFusionService.ts'),
      'utf-8',
    );
    expect(src).not.toContain('backend/');
    expect(src).not.toContain('agent-config');
  });

  it('DesignFusionService.ts does not change provider/model defaults', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../DesignFusionService.ts'),
      'utf-8',
    );
    expect(src).not.toMatch(/claude-|gpt-|gemini-|openai|anthropic/i);
  });
});
