import type { SkeletonId } from './SkeletonRegistry';

export interface SkeletonManifestGroupV2 {
  label: string;
  paths: string[];
}

export interface SkeletonRequiredExportV2 {
  name: string;
  type?: string;
}

export interface SkeletonOwnershipV2 {
  /** Infrastructure physically owned by the skeleton and reusable by product code without being product-generated. */
  skeletonOwned: string[];
  /** Files the product generator must write for every successful run. */
  requiredProductSlots: string[];
  /** Files the product generator may modify when the plan requires them. */
  optionalProductSlots: string[];
  /** Scaffold files whose required exports are mechanically restored/validated. */
  carcassFiles: string[];
}

export type SkeletonQualityProfileV2 = 'general' | 'app-first';

export interface SkeletonQualityContractV2 {
  /** Release semantics profile. app-first means screens/navigation/data/actions are blocking quality signals. */
  profile?: SkeletonQualityProfileV2;
  minMeaningfulScreens?: number;
  requiredCapabilities?: string[];
  requiredFlows?: string[];
}

export interface SkeletonSelectionContractV2 {
  productTypes?: string[];
  surfaces?: string[];
  layouts?: string[];
  capabilities?: string[];
  incompatibleArchetypes?: string[];
}

/**
 * Canonical on-disk skeleton manifest format. Runtime code consumes the compiled
 * semantic contract; generation write permission is derived exclusively from
 * requiredProductSlots + optionalProductSlots, while reusable infrastructure is
 * derived from skeletonOwned.
 */
export interface SkeletonManifestV2 {
  version: 2;
  id: SkeletonId;
  label?: string;
  workingGroups: SkeletonManifestGroupV2[];
  ownership: SkeletonOwnershipV2;
  protectedFiles: string[];
  requiredExports: Record<string, SkeletonRequiredExportV2[]>;
  qualityContract: SkeletonQualityContractV2;
  selectionContract: SkeletonSelectionContractV2;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function validateSkeletonManifestV2(manifest: SkeletonManifestV2): string[] {
  const errors: string[] = [];
  const ownership = manifest.ownership;
  const required = unique(ownership.requiredProductSlots);
  const optional = unique(ownership.optionalProductSlots);
  const requiredSet = new Set(required);
  const optionalSet = new Set(optional);

  if (manifest.version !== 2) errors.push(`${manifest.id}: version must be 2`);
  if (manifest.workingGroups.length === 0) errors.push(`${manifest.id}: workingGroups must not be empty`);
  if (required.length === 0) errors.push(`${manifest.id}: requiredProductSlots must not be empty`);

  for (const path of required) {
    if (optionalSet.has(path)) errors.push(`${manifest.id}: slot is both required and optional: ${path}`);
  }
  for (const path of optional) {
    if (requiredSet.has(path)) errors.push(`${manifest.id}: slot is both optional and required: ${path}`);
  }

  const quality = manifest.qualityContract;
  if (quality.profile !== undefined && !['general', 'app-first'].includes(quality.profile)) {
    errors.push(`${manifest.id}: qualityContract.profile must be general or app-first`);
  }
  if (!Number.isInteger(quality.minMeaningfulScreens) || (quality.minMeaningfulScreens ?? 0) < 1) {
    errors.push(`${manifest.id}: qualityContract.minMeaningfulScreens must be a positive integer`);
  }
  if ((quality.requiredCapabilities ?? []).length === 0) {
    errors.push(`${manifest.id}: qualityContract.requiredCapabilities must not be empty`);
  }
  if ((quality.requiredFlows ?? []).length === 0) {
    errors.push(`${manifest.id}: qualityContract.requiredFlows must not be empty`);
  }

  const selection = manifest.selectionContract;
  const productTypes = unique(selection.productTypes ?? []);
  const incompatible = unique(selection.incompatibleArchetypes ?? []);
  if (productTypes.length === 0) errors.push(`${manifest.id}: selectionContract.productTypes must not be empty`);
  if ((selection.surfaces ?? []).length === 0) errors.push(`${manifest.id}: selectionContract.surfaces must not be empty`);
  if ((selection.capabilities ?? []).length === 0) errors.push(`${manifest.id}: selectionContract.capabilities must not be empty`);
  if (incompatible.length === 0) errors.push(`${manifest.id}: selectionContract.incompatibleArchetypes must not be empty`);
  for (const archetype of productTypes) {
    if (incompatible.includes(archetype)) {
      errors.push(`${manifest.id}: archetype is both supported and incompatible: ${archetype}`);
    }
  }

  return errors;
}
