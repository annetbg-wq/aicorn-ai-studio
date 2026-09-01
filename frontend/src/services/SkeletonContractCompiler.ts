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
import superAppManifest from './skeleton-manifests/super-app/skeleton.manifest.json';
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

export interface CompiledSkeletonQualityContract {
  profile: 'general' | 'app-first';
  minMeaningfulScreens: number;
  requiredCapabilities: string[];
  requiredFlows: string[];
}

export interface CompiledSkeletonSelectionContract {
  productTypes: string[];
  surfaces: string[];
  layouts: string[];
  capabilities: string[];
  incompatibleArchetypes: string[];
}

export interface CompiledSkeletonInfrastructureContract {
  /** Every skeleton path/pattern installed before product delta is applied. */
  installed: string[];
  /** Manifest-declared skeleton ownership. Ownership does not imply import invisibility. */
  owned: string[];
  /** Paths the product generator may not overwrite. */
  protected: string[];
  /** Scaffold paths whose exports are mechanically preserved. */
  carcass: string[];
  /** Export integrity requirements keyed by project path. */
  requiredExports: Record<string, Array<{ name: string; type?: string }>>;
  /** Human-readable installation groups retained for coder prompt diagnostics. */
  workingGroups: SkeletonManifestGroup[];
}

/**
 * The single normalized runtime view of a skeleton manifest.
 *
 * Semantics:
 * - requiredSlots: product files required for a successful prototype;
 * - editable: files generation may emit/replace;
 * - reusable: read-only skeleton files/components/hooks product code may consume;
 * - infrastructure: installed/owned/protected scaffold and export integrity data;
 * - quality: manifest-declared prototype quality expectations.
 *
 * `reusable` and `infrastructure.protected` may overlap: read-only means
 * "do not rewrite", not "do not import". Import/ownership boundaries are
 * enforced by the explicit validator rules introduced in the validator refactor.
 */
export interface CompiledSkeletonContract {
  version: 2;
  id: SkeletonId;
  requiredSlots: string[];
  optionalSlots: string[];
  editable: string[];
  reusable: string[];
  infrastructure: CompiledSkeletonInfrastructureContract;
  quality: CompiledSkeletonQualityContract;
  selection: CompiledSkeletonSelectionContract;

  /** @deprecated Use infrastructure.workingGroups. */
  workingGroups: SkeletonManifestGroup[];
  /** @deprecated Use requiredSlots. */
  requiredProductSlots: string[];
  /** @deprecated Use optionalSlots. */
  optionalProductSlots: string[];
  /** @deprecated Use editable. */
  agentEditable: string[];
  /** @deprecated Use reusable. */
  agentReadOnly: string[];
  /** @deprecated Use infrastructure.protected. */
  protectedFiles: string[];
  /** @deprecated Use infrastructure.owned. */
  skeletonOwned: string[];
  /** @deprecated Use infrastructure.carcass. */
  carcassFiles: string[];
  /** @deprecated Use infrastructure.requiredExports. */
  requiredExports: Record<string, Array<{ name: string; type?: string }>>;
}

const manifests: Record<SkeletonId, SkeletonManifestV2> = {
  'mobile-app': mobileAppManifest as SkeletonManifestV2,
  'super-app': superAppManifest as SkeletonManifestV2,
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

const compiledContracts = new Map<SkeletonId, CompiledSkeletonContract>();

function unique(paths: string[]): string[] {
  return [...new Set(paths)];
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function normalizePaths(paths: string[]): string[] {
  return unique(paths.map(normalizePath));
}

function normalizeWorkingGroups(groups: SkeletonManifestV2['workingGroups']): SkeletonManifestGroup[] {
  return groups.map(group => ({
    label: group.label,
    paths: normalizePaths(group.paths),
  }));
}

/** Schema/tests only. Runtime code must consume compileSkeletonContract(). */
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
 * Canonical compiler. All 14 on-disk manifests are schema v2. Runtime consumers
 * receive one cached, normalized contract and never inspect raw manifest fields.
 */
export function compileSkeletonContract(id: SkeletonId): CompiledSkeletonContract {
  const cached = compiledContracts.get(id);
  if (cached) return cached;

  const manifest = manifests[id];
  if (!manifest) throw new Error(`Unknown skeleton manifest: ${id}`);
  if (manifest.id !== id) {
    throw new Error(`Skeleton manifest id mismatch: expected ${id}, got ${manifest.id}`);
  }

  assertManifestIsV2(manifest);

  const workingGroups = normalizeWorkingGroups(manifest.workingGroups);
  const requiredSlots = normalizePaths(manifest.ownership.requiredProductSlots);
  const optionalSlots = normalizePaths(manifest.ownership.optionalProductSlots);
  const editable = normalizePaths(manifest.ownership.agentEditable);
  const reusable = normalizePaths(manifest.ownership.agentReadOnly);
  const protectedFiles = normalizePaths(manifest.protectedFiles);
  const owned = normalizePaths(manifest.ownership.skeletonOwned);
  const carcass = normalizePaths(manifest.ownership.carcassFiles);
  const requiredExports = manifest.requiredExports ?? {};
  // Preserve the Registry's historic observable ordering for installed files.
  // Other semantic arrays intentionally retain manifest order.
  const installed = normalizePaths(workingGroups.flatMap(group => group.paths))
    .sort((a, b) => a.localeCompare(b));

  const quality: CompiledSkeletonQualityContract = {
    profile: manifest.qualityContract.profile ?? 'general',
    minMeaningfulScreens: manifest.qualityContract.minMeaningfulScreens as number,
    requiredCapabilities: [...(manifest.qualityContract.requiredCapabilities ?? [])],
    requiredFlows: [...(manifest.qualityContract.requiredFlows ?? [])],
  };

  const selection: CompiledSkeletonSelectionContract = {
    productTypes: [...(manifest.selectionContract.productTypes ?? [])],
    surfaces: [...(manifest.selectionContract.surfaces ?? [])],
    layouts: [...(manifest.selectionContract.layouts ?? [])],
    capabilities: [...(manifest.selectionContract.capabilities ?? [])],
    incompatibleArchetypes: [...(manifest.selectionContract.incompatibleArchetypes ?? [])],
  };

  const infrastructure: CompiledSkeletonInfrastructureContract = {
    installed,
    owned,
    protected: protectedFiles,
    carcass,
    requiredExports,
    workingGroups,
  };

  const compiled: CompiledSkeletonContract = {
    version: 2,
    id: manifest.id,
    requiredSlots,
    optionalSlots,
    editable,
    reusable,
    infrastructure,
    quality,
    selection,

    // Transitional aliases keep unchanged consumers stable while they migrate
    // one-by-one to the semantic runtime contract above.
    workingGroups,
    requiredProductSlots: requiredSlots,
    optionalProductSlots: optionalSlots,
    agentEditable: editable,
    agentReadOnly: reusable,
    protectedFiles,
    skeletonOwned: owned,
    carcassFiles: carcass,
    requiredExports,
  };

  compiledContracts.set(id, compiled);
  return compiled;
}

export function listSkeletonContractIds(): SkeletonId[] {
  return Object.keys(manifests) as SkeletonId[];
}
