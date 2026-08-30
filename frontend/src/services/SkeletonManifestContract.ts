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
  /** Infrastructure physically owned by the skeleton and not product-generated. */
  skeletonOwned: string[];
  /** Files the product generator must write for every successful run. */
  requiredProductSlots: string[];
  /** Files the product generator may modify when the plan requires them. */
  optionalProductSlots: string[];
  /** Exact union of required + optional files the generation agents may emit. */
  agentEditable: string[];
  /** Infrastructure paths generation agents may read but must never emit. */
  agentReadOnly: string[];
  /** Scaffold files whose required exports are mechanically restored/validated. */
  carcassFiles: string[];
}

export interface SkeletonQualityContractV2 {
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
 * Canonical on-disk skeleton manifest format.
 *
 * There are intentionally no `editableFiles`, `deltaFiles`, or registry-level
 * lock lists in this contract. Required/optional/read-only ownership is explicit
 * and must have exactly one source of truth.
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
  const editable = unique(ownership.agentEditable);
  const editableSet = new Set(editable);
  const requiredSet = new Set(required);
  const optionalSet = new Set(optional);

  if (manifest.version !== 2) errors.push(`${manifest.id}: version must be 2`);
  if (required.length === 0) errors.push(`${manifest.id}: requiredProductSlots must not be empty`);

  for (const path of required) {
    if (!editableSet.has(path)) errors.push(`${manifest.id}: required slot is not agentEditable: ${path}`);
    if (optionalSet.has(path)) errors.push(`${manifest.id}: slot is both required and optional: ${path}`);
  }
  for (const path of optional) {
    if (!editableSet.has(path)) errors.push(`${manifest.id}: optional slot is not agentEditable: ${path}`);
    if (requiredSet.has(path)) errors.push(`${manifest.id}: slot is both optional and required: ${path}`);
  }

  const expectedEditable = new Set([...required, ...optional]);
  for (const path of editable) {
    if (!expectedEditable.has(path)) {
      errors.push(`${manifest.id}: agentEditable is not classified required/optional: ${path}`);
    }
  }
  for (const path of ownership.agentReadOnly) {
    if (editableSet.has(path)) errors.push(`${manifest.id}: path is both editable and read-only: ${path}`);
  }

  return errors;
}
