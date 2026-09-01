import type { SkeletonId } from './SkeletonRegistry';
import { compileSkeletonContract, type CompiledSkeletonQualityContract } from './SkeletonContractCompiler';

export type SkeletonQualityContract = CompiledSkeletonQualityContract;

/** Transitional accessor retained only for ProtoPipeline until its direct compiler migration. */
export function getSkeletonQualityContract(id: SkeletonId): SkeletonQualityContract {
  return compileSkeletonContract(id).quality;
}
