import b2bOperationsWorkspaceManifest from './skeleton-manifests/b2b-operations-workspace/skeleton.manifest.json';
import bookingServiceAppManifest from './skeleton-manifests/booking-service-app/skeleton.manifest.json';
import contentLearningAppManifest from './skeleton-manifests/content-learning-app/skeleton.manifest.json';
import creatorEditorWorkspaceManifest from './skeleton-manifests/creator-editor-workspace/skeleton.manifest.json';
import datingMatchingAppManifest from './skeleton-manifests/dating-matching-app/skeleton.manifest.json';
import ecommerceManifest from './skeleton-manifests/ecommerce/skeleton.manifest.json';
import gameInteractiveAppManifest from './skeleton-manifests/game-interactive-app/skeleton.manifest.json';
import gamingCasinoAppManifest from './skeleton-manifests/gaming-casino-app/skeleton.manifest.json';
import landingPageManifest from './skeleton-manifests/landing-page/skeleton.manifest.json';
import marketplacePlatformManifest from './skeleton-manifests/marketplace-platform/skeleton.manifest.json';
import mobileAppManifest from './skeleton-manifests/mobile-app/skeleton.manifest.json';
import productivityToolManifest from './skeleton-manifests/productivity-tool/skeleton.manifest.json';
import saasDashboardManifest from './skeleton-manifests/saas-dashboard/skeleton.manifest.json';
import socialCommunityManifest from './skeleton-manifests/social-community/skeleton.manifest.json';
import {
  validateSkeletonManifestV2,
  type SkeletonManifestV2,
} from './SkeletonManifestContract';
import type { SkeletonId } from './SkeletonRegistry';

export interface SkeletonManifestGroup {
  label: string;
  paths: string[];
}

export interface SkeletonManifestV1 {
  version?: 1;
  id: SkeletonId;
  label?: string;
  workingGroups: SkeletonManifestGroup[];
  protectedFiles: string[];
  editableFiles: string[];
  deltaFiles: string[];
  ownership?: {
    ownedBySkeleton?: string[];
    productSlots?: string[];
  };
  requiredExports?: Record<string, Array<{ name: string; type?: string }>>;
  carcassFiles?: string[];
}

type RawSkeletonManifest = SkeletonManifestV1 | SkeletonManifestV2;

export interface CompiledSkeletonContract {
  version: 2;
  id: SkeletonId;
  workingGroups: SkeletonManifestGroup[];
  requiredProductSlots: string[];
  optionalProductSlots: string[];
  agentEditable: string[];
  agentReadOnly: string[];
  protectedFiles: string[];
  skeletonOwned: string[];
  carcassFiles: string[];
  requiredExports: Record<string, Array<{ name: string; type?: string }>>;
}

const manifests: Record<SkeletonId, RawSkeletonManifest> = {
  'mobile-app': mobileAppManifest as RawSkeletonManifest,
  'saas-dashboard': saasDashboardManifest as RawSkeletonManifest,
  'landing-page': landingPageManifest as RawSkeletonManifest,
  'social-community': socialCommunityManifest as RawSkeletonManifest,
  'productivity-tool': productivityToolManifest as RawSkeletonManifest,
  ecommerce: ecommerceManifest as RawSkeletonManifest,
  'b2b-operations-workspace': b2bOperationsWorkspaceManifest as RawSkeletonManifest,
  'marketplace-platform': marketplacePlatformManifest as RawSkeletonManifest,
  'creator-editor-workspace': creatorEditorWorkspaceManifest as RawSkeletonManifest,
  'dating-matching-app': datingMatchingAppManifest as RawSkeletonManifest,
  'gaming-casino-app': gamingCasinoAppManifest as RawSkeletonManifest,
  'game-interactive-app': gameInteractiveAppManifest as RawSkeletonManifest,
  'booking-service-app': bookingServiceAppManifest as RawSkeletonManifest,
  'content-learning-app': contentLearningAppManifest as RawSkeletonManifest,
};

function unique(paths: string[]): string[] {
  return [...new Set(paths)];
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function normalizePaths(paths: string[]): string[] {
  return unique(paths.map(normalizePath));
}

function pathMatchesPattern(path: string, pattern: string): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedPattern = normalizePath(pattern);
  if (normalizedPattern.endsWith('/**')) {
    return normalizedPath.startsWith(normalizedPattern.slice(0, -2));
  }
  if (normalizedPattern.endsWith('/*')) {
    return normalizedPath.startsWith(normalizedPattern.slice(0, -1));
  }
  return normalizedPath === normalizedPattern;
}

function isV2(manifest: RawSkeletonManifest): manifest is SkeletonManifestV2 {
  return manifest.version === 2;
}

export function getRawSkeletonManifest(id: SkeletonId): RawSkeletonManifest {
  return manifests[id];
}

function assertCompiledContractIsV2(contract: CompiledSkeletonContract): void {
  const manifestView: SkeletonManifestV2 = {
    version: 2,
    id: contract.id,
    workingGroups: contract.workingGroups,
    ownership: {
      skeletonOwned: contract.skeletonOwned,
      requiredProductSlots: contract.requiredProductSlots,
      optionalProductSlots: contract.optionalProductSlots,
      agentEditable: contract.agentEditable,
      agentReadOnly: contract.agentReadOnly,
      carcassFiles: contract.carcassFiles,
    },
    protectedFiles: contract.protectedFiles,
    requiredExports: contract.requiredExports,
    qualityContract: {},
    selectionContract: {},
  };
  const errors = validateSkeletonManifestV2(manifestView);
  if (errors.length > 0) {
    throw new Error(`Invalid compiled skeleton contract for ${contract.id}:\n${errors.join('\n')}`);
  }
}

function compileNativeV2(manifest: SkeletonManifestV2): CompiledSkeletonContract {
  const errors = validateSkeletonManifestV2(manifest);
  if (errors.length > 0) {
    throw new Error(`Invalid skeleton manifest v2 for ${manifest.id}:\n${errors.join('\n')}`);
  }

  return {
    version: 2,
    id: manifest.id,
    workingGroups: manifest.workingGroups,
    requiredProductSlots: normalizePaths(manifest.ownership.requiredProductSlots),
    optionalProductSlots: normalizePaths(manifest.ownership.optionalProductSlots),
    agentEditable: normalizePaths(manifest.ownership.agentEditable),
    agentReadOnly: normalizePaths(manifest.ownership.agentReadOnly),
    protectedFiles: normalizePaths(manifest.protectedFiles),
    skeletonOwned: normalizePaths(manifest.ownership.skeletonOwned),
    carcassFiles: normalizePaths(manifest.ownership.carcassFiles),
    requiredExports: manifest.requiredExports ?? {},
  };
}

function compileLegacyV1(manifest: SkeletonManifestV1): CompiledSkeletonContract {
  const editable = normalizePaths(manifest.editableFiles ?? []);
  const required = normalizePaths(manifest.deltaFiles ?? []);
  const protectedFiles = normalizePaths(manifest.protectedFiles ?? []);
  const requiredSet = new Set(required);
  const optional = editable.filter(path => !requiredSet.has(path));

  for (const requiredPath of required) {
    if (!editable.includes(requiredPath)) {
      throw new Error(`${manifest.id}: required delta file is not editable: ${requiredPath}`);
    }
    const protectedBy = protectedFiles.find(pattern => pathMatchesPattern(requiredPath, pattern));
    if (protectedBy) {
      throw new Error(`${manifest.id}: required product slot ${requiredPath} is protected by ${protectedBy}`);
    }
  }

  for (const optionalPath of optional) {
    const protectedBy = protectedFiles.find(pattern => pathMatchesPattern(optionalPath, pattern));
    if (protectedBy) {
      throw new Error(`${manifest.id}: optional product slot ${optionalPath} is protected by ${protectedBy}`);
    }
  }

  return {
    version: 2,
    id: manifest.id,
    workingGroups: manifest.workingGroups,
    requiredProductSlots: required,
    optionalProductSlots: optional,
    agentEditable: editable,
    agentReadOnly: protectedFiles,
    protectedFiles,
    skeletonOwned: normalizePaths(manifest.ownership?.ownedBySkeleton ?? protectedFiles),
    carcassFiles: normalizePaths(manifest.carcassFiles ?? []),
    requiredExports: manifest.requiredExports ?? {},
  };
}

/**
 * Canonical compiler for both native v2 manifests and temporary legacy v1 files.
 * Native v2 manifests are consumed directly. Legacy v1 manifests are adapted
 * explicitly until the 14/14 migration is complete; no downstream consumer
 * should inspect legacy fields itself.
 */
export function compileSkeletonContract(id: SkeletonId): CompiledSkeletonContract {
  const manifest = manifests[id];
  if (!manifest) throw new Error(`Unknown skeleton manifest: ${id}`);
  if (manifest.id !== id) {
    throw new Error(`Skeleton manifest id mismatch: expected ${id}, got ${manifest.id}`);
  }

  const contract = isV2(manifest)
    ? compileNativeV2(manifest)
    : compileLegacyV1(manifest);

  assertCompiledContractIsV2(contract);
  return contract;
}

export function listSkeletonContractIds(): SkeletonId[] {
  return Object.keys(manifests) as SkeletonId[];
}
