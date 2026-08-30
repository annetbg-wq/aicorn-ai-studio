import type { SkeletonId } from './SkeletonRegistry';
import { getRawSkeletonManifest, listSkeletonContractIds } from './SkeletonContractCompiler';

export type ProductArchetype =
  | 'mobile-consumer'
  | 'dashboard'
  | 'marketing'
  | 'social'
  | 'productivity'
  | 'commerce'
  | 'marketplace'
  | 'creator-tool'
  | 'dating'
  | 'gaming'
  | 'interactive-game'
  | 'booking'
  | 'learning';

const PRODUCT_ARCHETYPES = new Set<ProductArchetype>([
  'mobile-consumer', 'dashboard', 'marketing', 'social', 'productivity',
  'commerce', 'marketplace', 'creator-tool', 'dating', 'gaming',
  'interactive-game', 'booking', 'learning',
]);

export interface SkeletonSelectionCompatibilityContract {
  archetypes: ProductArchetype[];
  surfaces: string[];
  capabilities: string[];
  incompatibleArchetypes: ProductArchetype[];
}

function parseArchetypes(id: SkeletonId, values: string[] | undefined, field: string): ProductArchetype[] {
  const result = values ?? [];
  for (const value of result) {
    if (!PRODUCT_ARCHETYPES.has(value as ProductArchetype)) {
      throw new Error(`${id}: selectionContract.${field} contains unknown archetype: ${value}`);
    }
  }
  return [...result] as ProductArchetype[];
}

export function getSkeletonSelectionCompatibility(id: SkeletonId): SkeletonSelectionCompatibilityContract {
  const raw = getRawSkeletonManifest(id).selectionContract;
  const archetypes = parseArchetypes(id, raw.productTypes, 'productTypes');
  const incompatibleArchetypes = parseArchetypes(id, raw.incompatibleArchetypes, 'incompatibleArchetypes');
  const surfaces = raw.surfaces ?? [];
  const capabilities = raw.capabilities ?? [];

  if (archetypes.length === 0) throw new Error(`${id}: selectionContract.productTypes must not be empty`);
  if (surfaces.length === 0) throw new Error(`${id}: selectionContract.surfaces must not be empty`);
  if (capabilities.length === 0) throw new Error(`${id}: selectionContract.capabilities must not be empty`);
  if (incompatibleArchetypes.length === 0) {
    throw new Error(`${id}: selectionContract.incompatibleArchetypes must not be empty`);
  }

  return {
    archetypes,
    surfaces: [...surfaces],
    capabilities: [...capabilities],
    incompatibleArchetypes,
  };
}

export function listSkeletonSelectionCompatibilityIds(): SkeletonId[] {
  return listSkeletonContractIds();
}

export function scoreSkeletonCompatibility(
  id: SkeletonId,
  archetype: ProductArchetype,
): number {
  const contract = getSkeletonSelectionCompatibility(id);
  if (contract.incompatibleArchetypes.includes(archetype)) return -100;
  if (contract.archetypes.includes(archetype)) return 100;
  return 0;
}
