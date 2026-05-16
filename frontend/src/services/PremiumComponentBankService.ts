/// <reference types="vite/client" />

import type { ComponentType } from 'react';
import type { SkeletonId } from './SkeletonRegistry';

export interface PremiumSourceManifestSchema {
  id: string;
  name: string;
  officialUrl: string;
  repoUrl: string;
  license: string;
  licenseFileVerified: boolean;
  licenseFilePathOrUrl: string;
  sourceCommitOrVersion: string;
  allowedForLocalImport: boolean;
  importMode: 'copy-paste-normalized' | string;
  dependencyRisk: 'low' | 'medium' | 'high' | string;
  notes: string[];
}

export interface PremiumComponentManifestSchema {
  id: string;
  name: string;
  source: string;
  sourceLicense: string;
  sourceCommitOrVersion: string;
  category: string;
  kind: string;
  file: string;
  previewAdapter: string;
  compatibleSkeletons: string[];
  domains: string[];
  surfaces: string[];
  toneProfiles: string[];
  densityProfiles: string[];
  motionProfile: string;
  dependencies: string[];
  forbiddenUseCases: string[];
  requiresMedia: boolean;
  supportsMediaSlot: boolean;
  mediaSlots: string[];
  tokensUsed: string[];
  renderSafe: boolean;
  qualityNotes: string[];
  usageRules?: string[];
  dependencyNotes?: string[];
}

export interface PremiumRecipeSchema {
  id: string;
  compatibleSkeletons: string[];
  domains: string[];
  requiredBlocks: string[];
  optionalBlocks: string[];
  mediaPolicy: {
    mediaNeeded: boolean;
    types: string[];
  };
  motionProfile: 'gentle' | 'expressive' | 'none' | string;
  qualityBar: string;
}

export interface PremiumRegistrySchema {
  version: number;
  generatedAt: string;
  sources: string[];
  components: string[];
  recipes: string[];
  coverage: Record<string, number>;
}

export interface PremiumPreviewMeta {
  componentId: string;
  category: string;
  skeletons: string[];
  renderSafe: boolean;
}

interface PremiumPreviewModule {
  previewMeta: PremiumPreviewMeta;
  Preview: ComponentType;
}

export interface PremiumComponentRecord extends PremiumComponentManifestSchema {
  manifestPath: string;
  sourceManifest?: PremiumSourceManifestSchema;
  sourceLicenseVerified: boolean;
  dependencyRisk: string;
  metadataOnly: boolean;
  previewMeta?: PremiumPreviewMeta;
  Preview?: ComponentType;
}

export interface PremiumComponentBank {
  registry: PremiumRegistrySchema | null;
  sources: PremiumSourceManifestSchema[];
  components: PremiumComponentRecord[];
  recipes: PremiumRecipeSchema[];
  coverage: Record<string, number>;
  renderSafeComponents: PremiumComponentRecord[];
  metadataOnlyComponents: PremiumComponentRecord[];
  errors: string[];
}

export interface ResolvePremiumComponentSelectionInput {
  brief: string;
  skeletonId: SkeletonId;
  domainId?: string | null;
  surfaces?: string[];
}

export interface PremiumSelectedComponent {
  id: string;
  name: string;
  category: string;
  kind: string;
  source: string;
  sourceLicense: string;
  sourceCommitOrVersion: string;
  file: string;
  previewAdapter: string;
  compatibleSkeletons: string[];
  mediaSlots: string[];
  dependencyNotes: string[];
  usageRules: string[];
  forbiddenPatterns: string[];
  renderSafe: boolean;
}

export interface PremiumComponentSelection {
  selectedRecipeId: string | null;
  compatibleSkeletons: string[];
  selectedComponents: PremiumSelectedComponent[];
  componentSourceFiles: string[];
  previewAdapterFiles: string[];
  mediaSlots: string[];
  dependencyNotes: string[];
  usageRules: string[];
  forbiddenPatterns: string[];
}

const registryModules = import.meta.glob(
  '../../../prototype-bank/design-packs/premium-components/_registry/premium-components.registry.json',
  { eager: true, import: 'default' },
) as Record<string, PremiumRegistrySchema>;

const sourceModules = import.meta.glob(
  '../../../prototype-bank/design-packs/premium-components/_sources/*/source-manifest.json',
  { eager: true, import: 'default' },
) as Record<string, PremiumSourceManifestSchema>;

const componentManifestModules = import.meta.glob(
  '../../../prototype-bank/design-packs/premium-components/**/manifest.json',
  { eager: true, import: 'default' },
) as Record<string, PremiumComponentManifestSchema>;

const recipeModules = import.meta.glob(
  '../../../prototype-bank/design-packs/premium-components/_registry/recipes/*.json',
  { eager: true, import: 'default' },
) as Record<string, PremiumRecipeSchema>;

const previewModules = import.meta.glob(
  '../../../prototype-bank/design-packs/premium-components/preview-adapters/*.preview.tsx',
  { eager: true },
) as Record<string, PremiumPreviewModule>;

let cachedBank: PremiumComponentBank | null = null;

function repoPath(path: string): string {
  return path.replace(/^\.\.\.\//, '');
}

function componentSort(a: PremiumComponentRecord, b: PremiumComponentRecord): number {
  return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
}

export function loadPremiumComponentBank(): PremiumComponentBank {
  if (cachedBank) return cachedBank;

  const registry = Object.values(registryModules)[0] ?? null;
  const sources = Object.entries(sourceModules)
    .map(([, manifest]) => manifest)
    .sort((a, b) => a.name.localeCompare(b.name));
  const sourceById = new Map(sources.map(source => [source.id, source]));
  const previewByComponentId = new Map<string, { Preview: ComponentType; previewMeta: PremiumPreviewMeta }>();
  const errors: string[] = [];

  Object.entries(previewModules).forEach(([modulePath, mod]) => {
    if (!mod?.previewMeta?.componentId || !mod?.Preview) {
      errors.push(`Invalid preview adapter module: ${repoPath(modulePath)}`);
      return;
    }
    previewByComponentId.set(mod.previewMeta.componentId, {
      Preview: mod.Preview,
      previewMeta: mod.previewMeta,
    });
  });

  const components = Object.entries(componentManifestModules)
    .filter(([modulePath]) => !modulePath.includes('/_sources/') && !modulePath.includes('/_registry/'))
    .map(([modulePath, manifest]) => {
      const sourceManifest = sourceById.get(manifest.source);
      if (!sourceManifest) {
        errors.push(`Missing source manifest for ${manifest.id}: ${manifest.source}`);
      }
      if (sourceManifest && !sourceManifest.allowedForLocalImport) {
        errors.push(`Disallowed source used by component ${manifest.id}: ${manifest.source}`);
      }
      const preview = previewByComponentId.get(manifest.id);
      if (manifest.renderSafe && !preview) {
        errors.push(`Render-safe component missing preview adapter: ${manifest.id}`);
      }
      return {
        ...manifest,
        manifestPath: repoPath(modulePath),
        sourceManifest,
        sourceLicenseVerified: Boolean(sourceManifest?.licenseFileVerified),
        dependencyRisk: sourceManifest?.dependencyRisk ?? 'unknown',
        metadataOnly: !manifest.renderSafe || !preview,
        previewMeta: preview?.previewMeta,
        Preview: preview?.Preview,
      } satisfies PremiumComponentRecord;
    })
    .sort(componentSort);

  const recipes = Object.values(recipeModules).sort((a, b) => a.id.localeCompare(b.id));
  const coverage = registry?.coverage ?? components.reduce<Record<string, number>>((acc, component) => {
    acc[component.category] = (acc[component.category] ?? 0) + 1;
    return acc;
  }, {});

  if (registry && registry.components.length !== components.length) {
    errors.push(`Registry component count mismatch: registry=${registry.components.length} manifests=${components.length}`);
  }
  if (registry && registry.recipes.length !== recipes.length) {
    errors.push(`Registry recipe count mismatch: registry=${registry.recipes.length} recipes=${recipes.length}`);
  }

  const renderSafeComponents = components.filter(component => component.renderSafe && component.Preview);
  const metadataOnlyComponents = components.filter(component => component.metadataOnly);

  cachedBank = {
    registry,
    sources,
    components,
    recipes,
    coverage,
    renderSafeComponents,
    metadataOnlyComponents,
    errors,
  };
  return cachedBank;
}

export function selectPremiumRecipe(input: ResolvePremiumComponentSelectionInput): PremiumRecipeSchema | null {
  const bank = loadPremiumComponentBank();
  const domainId = (input.domainId ?? '').toLowerCase();
  const brief = input.brief.toLowerCase();

  if (input.skeletonId === 'landing-page') {
    return bank.recipes.find(recipe => recipe.id === 'landing-premium-saas') ?? null;
  }
  if (input.skeletonId === 'saas-dashboard' || input.skeletonId === 'productivity-tool') {
    return bank.recipes.find(recipe => recipe.id === 'dashboard-operator') ?? null;
  }
  if (input.skeletonId === 'ecommerce') {
    return bank.recipes.find(recipe => recipe.id === 'ecommerce-storefront') ?? null;
  }
  if (input.skeletonId === 'social-community') {
    return bank.recipes.find(recipe => recipe.id === 'social-community') ?? null;
  }
  if (input.skeletonId === 'mobile-app') {
    if (['health', 'wellness', 'medicine'].includes(domainId) || /(health|wellness|clinic|patient|care|calm)/i.test(brief)) {
      return bank.recipes.find(recipe => recipe.id === 'health-wellness-mobile') ?? null;
    }
    return bank.recipes.find(recipe => recipe.id === 'mobile-consumer-app') ?? null;
  }
  return null;
}

export function describePremiumRecipeSelection(input: ResolvePremiumComponentSelectionInput): string {
  const domainId = (input.domainId ?? '').toLowerCase();
  const brief = input.brief.toLowerCase();

  if (input.skeletonId === 'landing-page') {
    return 'selected by landing-page skeleton match';
  }
  if (input.skeletonId === 'saas-dashboard' || input.skeletonId === 'productivity-tool') {
    return 'selected by dashboard/productivity skeleton match';
  }
  if (input.skeletonId === 'ecommerce') {
    return 'selected by ecommerce skeleton match';
  }
  if (input.skeletonId === 'social-community') {
    return 'selected by social-community skeleton match';
  }
  if (input.skeletonId === 'mobile-app') {
    if (['health', 'wellness', 'medicine'].includes(domainId) || /(health|wellness|clinic|patient|care|calm)/i.test(brief)) {
      return 'selected by mobile health/wellness domain match';
    }
    return 'selected by mobile-app default recipe';
  }
  return 'reason unavailable from current selector';
}

export function describePremiumComponentSelection(
  selection: PremiumComponentSelection,
  input: ResolvePremiumComponentSelectionInput,
): string {
  if (!selection.selectedRecipeId) return 'reason unavailable from current selector';
  if (selection.selectedComponents.length === 0) {
    return `selected by recipe ${selection.selectedRecipeId}, but no compatible premium components were available`;
  }
  return [
    `selected by recipe ${selection.selectedRecipeId}`,
    `compatible with ${input.skeletonId}`,
    selection.selectedComponents.some(component => component.compatibleSkeletons.includes(input.skeletonId))
      ? 'component compatibility match'
      : null,
    input.domainId && selection.selectedComponents.some(component =>
      component.id.toLowerCase().includes(String(input.domainId).toLowerCase()) ||
      component.category.toLowerCase().includes(String(input.domainId).toLowerCase()) ||
      component.kind.toLowerCase().includes(String(input.domainId).toLowerCase())
    )
      ? 'domain-affinity match'
      : null,
  ].filter((value): value is string => Boolean(value)).join('; ');
}

function scoreComponent(component: PremiumComponentRecord, block: string, input: ResolvePremiumComponentSelectionInput): number {
  const normalizedBlock = block.toLowerCase();
  const surfaceText = (input.surfaces ?? []).join(' ').toLowerCase();
  const domainId = (input.domainId ?? '').toLowerCase();
  let score = 0;
  if (component.kind === normalizedBlock) score += 8;
  if (component.compatibleSkeletons.includes(input.skeletonId)) score += 6;
  if (component.domains.some(domain => domain.toLowerCase() === domainId)) score += 4;
  if (component.surfaces.some(surface => surfaceText.includes(surface.toLowerCase()))) score += 2;
  if (component.renderSafe) score += 2;
  return score;
}

function pickComponentForBlock(block: string, input: ResolvePremiumComponentSelectionInput, usedIds: Set<string>): PremiumComponentRecord | null {
  const bank = loadPremiumComponentBank();
  const ranked = bank.components
    .filter(component => !usedIds.has(component.id))
    .filter(component => component.compatibleSkeletons.includes(input.skeletonId))
    .map(component => ({ component, score: scoreComponent(component, block, input) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || componentSort(a.component, b.component));
  return ranked[0]?.component ?? null;
}

export function resolvePremiumComponentSelection(input: ResolvePremiumComponentSelectionInput): PremiumComponentSelection {
  const recipe = selectPremiumRecipe(input);
  if (!recipe) {
    return {
      selectedRecipeId: null,
      compatibleSkeletons: [input.skeletonId],
      selectedComponents: [],
      componentSourceFiles: [],
      previewAdapterFiles: [],
      mediaSlots: [],
      dependencyNotes: [],
      usageRules: [],
      forbiddenPatterns: [],
    };
  }

  const selected: PremiumComponentRecord[] = [];
  const usedIds = new Set<string>();

  for (const block of recipe.requiredBlocks) {
    const component = pickComponentForBlock(block, input, usedIds);
    if (component) {
      selected.push(component);
      usedIds.add(component.id);
    }
  }

  for (const block of recipe.optionalBlocks) {
    const component = pickComponentForBlock(block, input, usedIds);
    if (component) {
      selected.push(component);
      usedIds.add(component.id);
    }
  }

  const selectedComponents: PremiumSelectedComponent[] = selected.map(component => ({
    id: component.id,
    name: component.name,
    category: component.category,
    kind: component.kind,
    source: component.source,
    sourceLicense: component.sourceLicense,
    sourceCommitOrVersion: component.sourceCommitOrVersion,
    file: component.file,
    previewAdapter: component.previewAdapter,
    compatibleSkeletons: component.compatibleSkeletons,
    mediaSlots: component.mediaSlots,
    dependencyNotes: component.dependencyNotes ?? [],
    usageRules: component.usageRules ?? [],
    forbiddenPatterns: component.forbiddenUseCases,
    renderSafe: component.renderSafe,
  }));

  const componentSourceFiles = Array.from(new Set(selectedComponents.map(component => component.file)));
  const previewAdapterFiles = Array.from(new Set(selectedComponents.map(component => component.previewAdapter)));
  const mediaSlots = Array.from(new Set(selectedComponents.flatMap(component => component.mediaSlots)));
  const dependencyNotes = Array.from(new Set(selectedComponents.flatMap(component => component.dependencyNotes).concat([
    'Before inventing UI, check the selected premium component recipe.',
    'Use generated media assets or local fallbacks for declared media slots.',
  ])));
  const usageRules = Array.from(new Set(selectedComponents.flatMap(component => component.usageRules).concat([
    'Use available premium blocks if compatible with the selected skeleton.',
    'Do not recreate low-quality generic cards when a premium component is already selected.',
    'Do not use remote random media. Use generated media slots or local fallback assets.',
  ])));
  const forbiddenPatterns = Array.from(new Set(selectedComponents.flatMap(component => component.forbiddenPatterns).concat([
    'Do not use remote random media URLs.',
    'Do not downgrade selected premium blocks to generic placeholder cards.',
  ])));

  return {
    selectedRecipeId: recipe.id,
    compatibleSkeletons: recipe.compatibleSkeletons,
    selectedComponents,
    componentSourceFiles,
    previewAdapterFiles,
    mediaSlots,
    dependencyNotes,
    usageRules,
    forbiddenPatterns,
  };
}

export function resetPremiumComponentBankCache(): void {
  cachedBank = null;
}
