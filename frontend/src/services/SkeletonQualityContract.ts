import type { SkeletonId } from './SkeletonRegistry';
import { getRawSkeletonManifest, listSkeletonContractIds } from './SkeletonContractCompiler';

export interface SkeletonQualityContract {
  minMeaningfulScreens: number;
  requiredCapabilities: string[];
  requiredFlows: string[];
}

export function getSkeletonQualityContract(id: SkeletonId): SkeletonQualityContract {
  const raw = getRawSkeletonManifest(id).qualityContract;
  const minMeaningfulScreens = raw.minMeaningfulScreens;
  const requiredCapabilities = raw.requiredCapabilities ?? [];
  const requiredFlows = raw.requiredFlows ?? [];

  if (!Number.isInteger(minMeaningfulScreens) || (minMeaningfulScreens ?? 0) < 1) {
    throw new Error(`${id}: qualityContract.minMeaningfulScreens must be a positive integer`);
  }
  if (requiredCapabilities.length === 0) {
    throw new Error(`${id}: qualityContract.requiredCapabilities must not be empty`);
  }
  if (requiredFlows.length === 0) {
    throw new Error(`${id}: qualityContract.requiredFlows must not be empty`);
  }

  return {
    minMeaningfulScreens: minMeaningfulScreens as number,
    requiredCapabilities: [...requiredCapabilities],
    requiredFlows: [...requiredFlows],
  };
}

export function listSkeletonQualityContractIds(): SkeletonId[] {
  return listSkeletonContractIds();
}
