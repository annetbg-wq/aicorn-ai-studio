import type { SkeletonId } from './SkeletonRegistry';
import {
  compileSkeletonContract,
  listSkeletonContractIds,
  type CompiledSkeletonQualityContract,
} from './SkeletonContractCompiler';

export type SkeletonQualityContract = CompiledSkeletonQualityContract;

/** Compatibility accessor. Runtime semantics come from the compiled contract. */
export function getSkeletonQualityContract(id: SkeletonId): SkeletonQualityContract {
  return compileSkeletonContract(id).quality;
}

export function listSkeletonQualityContractIds(): SkeletonId[] {
  return listSkeletonContractIds();
}
