import type { SkeletonId } from './SkeletonRegistry';
import { compileSkeletonContract, type CompiledSkeletonContract } from './SkeletonContractCompiler';

export type SkeletonRuntimePolicy = CompiledSkeletonContract;

/**
 * Canonical runtime entry point for every stage that needs skeleton behaviour.
 * The returned object is the compiler output itself: no secondary file/quality/
 * selection assemblers and no additional raw-manifest reads.
 */
export function getSkeletonRuntimePolicy(id: SkeletonId): SkeletonRuntimePolicy {
  return compileSkeletonContract(id);
}
