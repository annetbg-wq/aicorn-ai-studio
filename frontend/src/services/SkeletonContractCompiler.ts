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

const manifests: Record<SkeletonId, SkeletonManifestV1> = {
  'mobile-app': mobileAppManifest as SkeletonManifestV1,
  'saas-dashboard': saasDashboardManifest as SkeletonManifestV1,
  'landing-page': landingPageManifest as SkeletonManifestV1,
  'social-community': socialCommunityManifest as SkeletonManifestV1,
  'productivity-tool': productivityToolManifest as SkeletonManifestV1,
  ecommerce: ecommerceManifest as SkeletonManifestV1,
  'b2b-operations-workspace': b2bOperationsWorkspaceManifest as SkeletonManifestV1,
  'marketplace-platform': marketplacePlatformManifest as SkeletonManifestV1,
  'creator-editor-workspace': creatorEditorWorkspaceManifest as SkeletonManifestV1,
  'dating-matching-app': datingMatchingAppManifest as SkeletonManifestV1,
  'gaming-casino-app': gamingCasinoAppManifest as SkeletonManifestV1,
  'game-interactive-app': gameInteractiveAppManifest as SkeletonManifestV1,
  'booking-service-app': bookingServiceAppManifest as SkeletonManifestV1,
  'content-learning-app': contentLearningAppManifest as SkeletonManifestV1,
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

export function getRawSkeletonManifest(id: SkeletonId): SkeletonManifestV1 {
  return manifests[id];
}

/**
 * Compiles the current manifest representation into the only runtime contract
 * downstream stages should consume. During the v1 -> v2 manifest migration the
 * compiler makes the required/optional distinction explicit without changing
 * the behaviour of any existing skeleton:
 *
 *   deltaFiles                 -> requiredProductSlots
 *   editableFiles - deltaFiles -> optionalProductSlots
 *   protectedFiles             -> agentReadOnly / skeletonOwned
 *
 * Once every manifest is stored as schema v2, this compatibility input shape
 * can be deleted without changing consumers.
 */
export function compileSkeletonContract(id: SkeletonId): CompiledSkeletonContract {
  const manifest = manifests[id];
  if (!manifest) throw new Error(`Unknown skeleton manifest: ${id}`);
  if (manifest.id !== id) {
    throw new Error(`Skeleton manifest id mismatch: expected ${id}, got ${manifest.id}`);
  }

  const editable = normalizePaths(manifest.editableFiles ?? []);
  const required = normalizePaths(manifest.deltaFiles ?? []);
  const protectedFiles = normalizePaths(manifest.protectedFiles ?? []);
  const requiredSet = new Set(required);
  const optional = editable.filter(path => !requiredSet.has(path));

  for (const requiredPath of required) {
    if (!editable.includes(requiredPath)) {
      throw new Error(`${id}: required delta file is not editable: ${requiredPath}`);
    }
    const protectedBy = protectedFiles.find(pattern => pathMatchesPattern(requiredPath, pattern));
    if (protectedBy) {
      throw new Error(`${id}: required product slot ${requiredPath} is protected by ${protectedBy}`);
    }
  }

  for (const optionalPath of optional) {
    const protectedBy = protectedFiles.find(pattern => pathMatchesPattern(optionalPath, pattern));
    if (protectedBy) {
      throw new Error(`${id}: optional product slot ${optionalPath} is protected by ${protectedBy}`);
    }
  }

  return {
    version: 2,
    id,
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

export function listSkeletonContractIds(): SkeletonId[] {
  return Object.keys(manifests) as SkeletonId[];
}
