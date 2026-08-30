import type { SkeletonId } from './SkeletonRegistry';
import { compileSkeletonContract, type CompiledSkeletonContract } from './SkeletonContractCompiler';
import { getSkeletonQualityContract, type SkeletonQualityContract } from './SkeletonQualityContract';
import {
  getSkeletonSelectionCompatibility,
  type SkeletonSelectionCompatibilityContract,
} from './SkeletonSelectionCompatibility';

export interface SkeletonRuntimePolicy {
  id: SkeletonId;
  fileContract: CompiledSkeletonContract;
  qualityContract: SkeletonQualityContract;
  selectionCompatibility: SkeletonSelectionCompatibilityContract;
}

/**
 * Canonical runtime entry point for every stage that needs skeleton behaviour.
 *
 * Architect, coder, Pass 2, quality, selection diagnostics and future matrix
 * smoke tests should consume this object instead of reconstructing semantics
 * independently from registry fields or manifest fallbacks.
 */
export function getSkeletonRuntimePolicy(id: SkeletonId): SkeletonRuntimePolicy {
  return {
    id,
    fileContract: compileSkeletonContract(id),
    qualityContract: getSkeletonQualityContract(id),
    selectionCompatibility: getSkeletonSelectionCompatibility(id),
  };
}
