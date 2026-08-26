/**
 * DesignFusionService — WI-7 Design Fusion Contract.
 *
 * Defines the canonical priority hierarchy for combining visual assets in both
 * skeleton_assembly (ProtoPipeline) and blank_canvas (LVPipeline).
 *
 * Priority:
 *   A) Uploaded assets / FileVisualBank / Premium components
 *   B) shadcn local UI primitives
 *   C) Local custom components — last resort only
 */

// ── Primitive catalog ─────────────────────────────────────────────────────────

/** shadcn primitives that must never be hand-rolled when available. */
export const SHADCN_PRIMITIVE_CATALOG = [
  'Alert',
  'AlertDialog',
  'Badge',
  'Button',
  'Card',
  'Checkbox',
  'Dialog',
  'Input',
  'Label',
  'Progress',
  'ScrollArea',
  'Select',
  'Switch',
  'Tabs',
  'Textarea',
  'Tooltip',
] as const;

export type ShadcnPrimitiveName = typeof SHADCN_PRIMITIVE_CATALOG[number];

/** Surfaces where uploaded or premium visual assets are appropriate. */
export const VISUAL_ASSET_SURFACES = [
  'hero',
  'onboarding',
  'empty-state',
  'marketing',
  'feature-block',
  'branded-illustration',
  'visual-identity',
] as const;

// ── Public types ──────────────────────────────────────────────────────────────

export interface UploadedAssetFusionEntry {
  id: string;
  originalName: string;
  importPath: string;
  intendedSurfaces: string[];
  assetType: 'image' | 'text' | 'code' | 'pdf' | 'other';
  category: 'visual' | 'reference' | 'data';
  usageGuidance: string;
}

export interface PremiumFusionEntry {
  id: string;
  name: string;
  importPath: string;
  intendedSurface: string;
  usageGuidance: string;
  constraints: string[];
}

export interface DesignFusionTelemetry {
  design_fusion_rules_injected: boolean;
  uploaded_asset_manifest_count: number;
  uploaded_asset_materialized_count: number;
  premium_component_selected_count: number;
  premium_component_used_count: number;
  premium_selected_not_used: boolean;
  visual_asset_selected_not_used: boolean;
  shadcn_primitive_usage_count: number;
  direct_radix_import_count: number;
  self_made_primitive_count: number;
  alert_used_when_relevant: boolean;
  design_fusion_prompt_evidence: boolean;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function assetCategory(kind: string): UploadedAssetFusionEntry['category'] {
  if (kind === 'image') return 'visual';
  if (kind === 'code') return 'reference';
  return 'data';
}

function inferIntendedSurfaces(kind: string, name: string): string[] {
  const lower = name.toLowerCase();
  if (kind === 'image') {
    if (/logo|brand|identity/.test(lower)) return ['visual-identity', 'hero'];
    if (/hero|banner|cover/.test(lower)) return ['hero'];
    if (/empty|placeholder|illustration/.test(lower)) return ['empty-state'];
    if (/onboard|welcome/.test(lower)) return ['onboarding'];
    if (/marketing|feature/.test(lower)) return ['marketing', 'feature-block'];
    return ['hero', 'marketing', 'feature-block'];
  }
  return ['reference'];
}

function inferUsageGuidance(kind: string): string {
  if (kind === 'image') return 'Import default export to use as img src in the UI';
  if (kind === 'code') return 'Use excerpt for structural reference — extract key logic or patterns';
  if (kind === 'pdf') return 'Reference document — use metadata/excerpt for product context';
  return 'Reference material — use excerpts as needed in product copy or data';
}

/**
 * Convert a prototype-bank design-pack file path to an @/ import path.
 * prototype-bank/design-packs/premium-components/X/component.tsx
 *   → @/design-pack/premium-components/X/component
 */
function premiumFileToImportPath(file: string): string {
  return `@/${file
    .replace(/^prototype-bank\/design-packs\//, 'design-pack/')
    .replace(/\.[^.]+$/, '')}`;
}

// ── Public builders ───────────────────────────────────────────────────────────

/**
 * Enrich raw uploaded-asset prompt entries with surface inference and guidance.
 * Input matches UploadedAssetPromptEntry from ProtoPipeline.materializeUploadedAssetFusion.
 */
export function buildUploadedAssetFusionEntries(
  rawEntries: ReadonlyArray<{
    id: string;
    kind: string;
    name: string;
    moduleImportPath?: string;
    excerpt?: string;
  }>,
): UploadedAssetFusionEntry[] {
  return rawEntries
    .filter(entry => Boolean(entry.moduleImportPath))
    .map(entry => ({
      id: entry.id,
      originalName: entry.name,
      importPath: entry.moduleImportPath!,
      intendedSurfaces: inferIntendedSurfaces(entry.kind, entry.name),
      assetType: (['image', 'text', 'code', 'pdf'] as string[]).includes(entry.kind)
        ? (entry.kind as UploadedAssetFusionEntry['assetType'])
        : ('other' as const),
      category: assetCategory(entry.kind),
      usageGuidance: inferUsageGuidance(entry.kind),
    }));
}

/**
 * Map selected premium components to fusion entries the prompt can reference.
 * Input matches PremiumSelectedComponent[] from PremiumComponentBankService.
 */
export function buildPremiumFusionEntries(
  selectedComponents: ReadonlyArray<{
    id: string;
    name: string;
    kind: string;
    file: string;
    usageRules: readonly string[];
    forbiddenPatterns: readonly string[];
  }>,
): PremiumFusionEntry[] {
  return selectedComponents.map(comp => ({
    id: comp.id,
    name: comp.name,
    importPath: premiumFileToImportPath(comp.file),
    intendedSurface: comp.kind || 'hero',
    usageGuidance: comp.usageRules[0] ?? 'Use in the appropriate premium surface block',
    constraints: Array.from(comp.forbiddenPatterns).slice(0, 3),
  }));
}

/**
 * Build the canonical Design Fusion prompt block.
 *
 * Injected into both ProtoPipeline (skeleton_assembly) and LVPipeline (blank_canvas)
 * coder system prompts to give generators a deterministic priority hierarchy.
 */
export function buildDesignFusionPromptBlock(opts: {
  uploadedAssets: ReadonlyArray<UploadedAssetFusionEntry>;
  premiumComponents: ReadonlyArray<PremiumFusionEntry>;
}): string {
  const lines: string[] = [
    '== DESIGN FUSION CONTRACT ==',
    'Follow this priority hierarchy STRICTLY when choosing what to render:',
    '',
    'A) UPLOADED ASSETS / PREMIUM COMPONENTS — use for:',
    '   hero sections · branded illustrations · empty states',
    '   onboarding visuals · marketing feature blocks',
    '   visual identity blocks · user-provided UI references',
    '',
    'B) SHADCN UI PRIMITIVES — use for ALL of these (NEVER hand-roll them):',
    '   forms:    Input, Label, Textarea, Select, Switch, Checkbox',
    '   feedback: Alert, Badge, Progress, Tooltip',
    '   layout:   Card, Tabs, ScrollArea',
    '   overlay:  Dialog, AlertDialog',
    '   actions:  Button',
    '',
    'C) LOCAL CUSTOM COMPONENTS — ONLY when A and B do not fit.',
    '',
    'HARD RULES:',
    '- NEVER hand-roll Alert, Dialog, Tabs, Switch, Select when the primitive is available.',
    '- NEVER import from @radix-ui/react-* directly — use ONLY @/components/ui/* paths.',
    '- Alert      = inline status / callout / warning / info block.',
    '- AlertDialog = modal confirmation or destructive decision. Do NOT confuse them.',
    '- Do NOT use uploaded assets as decorative noise — only on their designated surfaces.',
    '- Do NOT use premium components outside their allowed surfaces.',
    '- Do NOT invent components not in the advertised catalog.',
  ];

  if (opts.uploadedAssets.length > 0) {
    lines.push('', 'UPLOADED ASSET MANIFEST:');
    for (const asset of opts.uploadedAssets) {
      lines.push(
        `  [${asset.id}] "${asset.originalName}"`,
        `    import: '${asset.importPath}'`,
        `    surfaces: ${asset.intendedSurfaces.join(', ')}`,
        `    guidance: ${asset.usageGuidance}`,
      );
    }
  }

  if (opts.premiumComponents.length > 0) {
    lines.push('', 'PREMIUM COMPONENT SELECTIONS:');
    for (const comp of opts.premiumComponents) {
      lines.push(
        `  [${comp.id}] "${comp.name}"`,
        `    import: '${comp.importPath}'`,
        `    surface: ${comp.intendedSurface}`,
        `    guidance: ${comp.usageGuidance}`,
      );
      if (comp.constraints.length > 0) {
        lines.push(`    constraints: ${comp.constraints.join(' · ')}`);
      }
    }
  }

  lines.push('== END DESIGN FUSION CONTRACT ==');
  return lines.join('\n');
}

// ── Telemetry detectors ───────────────────────────────────────────────────────

const RADIX_IMPORT_RE = /from\s+['"]@radix-ui\/react-[^'"]+['"]/g;

/**
 * Detect any direct @radix-ui/react-* imports in generated files.
 * These are forbidden — generators must use @/components/ui/* paths.
 * Returns a list of "<path>: <import-statement>" strings.
 */
export function detectDirectRadixImports(generatedFiles: Record<string, string>): string[] {
  const found: string[] = [];
  for (const [filePath, content] of Object.entries(generatedFiles)) {
    const matches = content.match(RADIX_IMPORT_RE) ?? [];
    for (const match of matches) {
      found.push(`${filePath}: ${match.trim()}`);
    }
  }
  return found;
}

/**
 * Count total shadcn primitive usages (JSX tag mentions) across generated files.
 */
export function countShadcnPrimitiveUsages(generatedFiles: Record<string, string>): number {
  const re = new RegExp(`<(${SHADCN_PRIMITIVE_CATALOG.join('|')})[\\s/>]`, 'g');
  let count = 0;
  for (const content of Object.values(generatedFiles)) {
    const matches = content.match(re) ?? [];
    count += matches.length;
  }
  return count;
}

/**
 * Validate that uploaded asset import paths are safe (no path traversal).
 */
export function validateAssetImportPath(importPath: string): { safe: boolean; reason?: string } {
  if (importPath.includes('..')) {
    return { safe: false, reason: 'path traversal detected (..)' };
  }
  if (importPath.includes('\\')) {
    return { safe: false, reason: 'backslash in path' };
  }
  if (!importPath.startsWith('@/')) {
    return { safe: false, reason: 'import path must start with @/' };
  }
  return { safe: true };
}

/**
 * Compute full DesignFusionTelemetry from generation results and context.
 */
export function computeDesignFusionTelemetry(input: {
  designFusionInjected: boolean;
  uploadedAssets: ReadonlyArray<UploadedAssetFusionEntry>;
  uploadedAssetMaterializedCount: number;
  premiumComponents: ReadonlyArray<PremiumFusionEntry>;
  generatedFiles?: Record<string, string>;
  coderSystemPrompt?: string;
}): DesignFusionTelemetry {
  const files = input.generatedFiles ?? {};
  const prompt = input.coderSystemPrompt ?? '';
  const directRadixImports = detectDirectRadixImports(files);
  const shadcnUsages = countShadcnPrimitiveUsages(files);

  const premiumCount = input.premiumComponents.length;
  const premiumImportRe = /from\s+['"]@\/design-pack\/premium-components\//;
  const premiumUsedCount = premiumCount > 0
    ? Object.values(files).filter(c => premiumImportRe.test(c)).length
    : 0;

  const visualAssetCount = input.uploadedAssets.filter(a => a.category === 'visual').length;
  const visualAssetImportRe = /from\s+['"]@\/generated\/uploads\//;
  const visualAssetUsed = visualAssetCount > 0
    ? Object.values(files).some(c => visualAssetImportRe.test(c))
    : true;

  const allCode = Object.values(files).join('\n');
  const alertMentionedInPrompt = /alert|warning|notification|status/i.test(prompt);
  const alertUsedInCode = /<Alert[\s/>]/.test(allCode);

  return {
    design_fusion_rules_injected: input.designFusionInjected,
    uploaded_asset_manifest_count: input.uploadedAssets.length,
    uploaded_asset_materialized_count: input.uploadedAssetMaterializedCount,
    premium_component_selected_count: premiumCount,
    premium_component_used_count: premiumUsedCount,
    premium_selected_not_used: premiumCount > 0 && premiumUsedCount === 0,
    visual_asset_selected_not_used: !visualAssetUsed,
    shadcn_primitive_usage_count: shadcnUsages,
    direct_radix_import_count: directRadixImports.length,
    self_made_primitive_count: directRadixImports.length,
    alert_used_when_relevant: alertMentionedInPrompt ? alertUsedInCode : true,
    design_fusion_prompt_evidence: prompt.includes('DESIGN FUSION CONTRACT'),
  };
}
