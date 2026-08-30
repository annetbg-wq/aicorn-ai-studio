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

const manifests: Record<SkeletonId, SkeletonManifestV2> = {
  'mobile-app': mobileAppManifest as SkeletonManifestV2,
  'saas-dashboard': saasDashboardManifest as SkeletonManifestV2,
  'landing-page': landingPageManifest as SkeletonManifestV2,
  'social-community': socialCommunityManifest as SkeletonManifestV2,
  'productivity-tool': productivityToolManifest as SkeletonManifestV2,
  ecommerce: ecommerceManifest as SkeletonManifestV2,
  'b2b-operations-workspace': b2bOperationsWorkspaceManifest as SkeletonManifestV2,
  'marketplace-platform': marketplacePlatformManifest as SkeletonManifestV2,
  'creator-editor-workspace': creatorEditorWorkspaceManifest as SkeletonManifestV2,
  'dating-matching-app': datingMatchingAppManifest as SkeletonManifestV2,
  'gaming-casino-app': gamingCasinoAppManifest as SkeletonManifestV2,
  'game-interactive-app': gameInteractiveAppManifest as SkeletonManifestV2,
  'booking-service-app': bookingServiceAppManifest as SkeletonManifestV2,
  'content-learning-app': contentLearningAppManifest as SkeletonManifestV2,
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

export function getRawSkeletonManifest(id: SkeletonId): SkeletonManifestV2 {
  return manifests[id];
}

function assertManifestIsV2(manifest: SkeletonManifestV2): void {
  const errors = validateSkeletonManifestV2(manifest);
  if (errors.length > 0) {
    throw new Error(`Invalid skeleton manifest v2 for ${manifest.id}:\n${errors.join('\n')}`);
  }
}

/**
 * Canonical compiler. All 14 on-disk manifests are schema v2; there is no
 * legacy fallback path. Downstream consumers receive one normalized runtime
 * file contract and never inspect transitional compatibility fields.
 */
export function compileSkeletonContract(id: SkeletonId): CompiledSkeletonContract {
  const manifest = manifests[id];
  if (!manifest) throw new Error(`Unknown skeleton manifest: ${id}`);
  if (manifest.id !== id) {
    throw new Error(`Skeleton manifest id mismatch: expected ${id}, got ${manifest.id}`);
  }

  assertManifestIsV2(manifest);

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

export function listSkeletonContractIds(): SkeletonId[] {
  return Object.keys(manifests) as SkeletonId[];
}
