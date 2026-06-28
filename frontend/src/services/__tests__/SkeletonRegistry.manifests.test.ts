import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import b2bOperationsWorkspaceManifest from '../skeleton-manifests/b2b-operations-workspace/skeleton.manifest.json';
import bookingServiceAppManifest from '../skeleton-manifests/booking-service-app/skeleton.manifest.json';
import contentLearningAppManifest from '../skeleton-manifests/content-learning-app/skeleton.manifest.json';
import creatorEditorWorkspaceManifest from '../skeleton-manifests/creator-editor-workspace/skeleton.manifest.json';
import datingMatchingAppManifest from '../skeleton-manifests/dating-matching-app/skeleton.manifest.json';
import gameInteractiveAppManifest from '../skeleton-manifests/game-interactive-app/skeleton.manifest.json';
import gamingCasinoAppManifest from '../skeleton-manifests/gaming-casino-app/skeleton.manifest.json';
import marketplacePlatformManifest from '../skeleton-manifests/marketplace-platform/skeleton.manifest.json';
import {
  buildSkeletonPromptBlock,
  getEditableSkeletonFiles,
  getSkeletonInstalledFiles,
  getSkeletonOwnershipContract,
  SKELETON_REGISTRY,
  type SkeletonId,
} from '../SkeletonRegistry';

type Manifest = {
  id: SkeletonId;
  workingGroups: Array<{ label: string; paths: string[] }>;
  editableFiles: string[];
  deltaFiles: string[];
  ownership?: {
    ownedBySkeleton: string[];
    productSlots: string[];
  };
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const manifestsRoot = path.join(repoRoot, 'frontend', 'src', 'services', 'skeleton-manifests');
const requiredCoreFiles = ['src/App.tsx', 'src/main.tsx', 'src/index.css', 'src/route-manifest.json'] as const;
const requiredDeltaBase = ['src/config/app.ts', 'src/config/navigation.ts', 'src/data/types.ts', 'src/data/seed.ts'] as const;

const newSkeletons = [
  { id: 'b2b-operations-workspace', manifest: b2bOperationsWorkspaceManifest as Manifest },
  { id: 'marketplace-platform', manifest: marketplacePlatformManifest as Manifest },
  { id: 'creator-editor-workspace', manifest: creatorEditorWorkspaceManifest as Manifest },
  { id: 'dating-matching-app', manifest: datingMatchingAppManifest as Manifest },
  { id: 'gaming-casino-app', manifest: gamingCasinoAppManifest as Manifest },
  { id: 'game-interactive-app', manifest: gameInteractiveAppManifest as Manifest },
  { id: 'booking-service-app', manifest: bookingServiceAppManifest as Manifest },
  { id: 'content-learning-app', manifest: contentLearningAppManifest as Manifest },
] as const;

function getSkeletonSrcRoot(id: SkeletonId): string {
  return path.join(repoRoot, 'skeletons', id, `skeleton-${id}`, 'src');
}

function getPhysicalPagePaths(id: SkeletonId): string[] {
  const pagesDir = path.join(getSkeletonSrcRoot(id), 'pages');
  return fs.readdirSync(pagesDir)
    .filter(name => name.endsWith('.tsx'))
    .sort((a, b) => a.localeCompare(b))
    .map(name => `src/pages/${name}`);
}

function sortPaths(paths: string[]): string[] {
  return [...paths].sort((a, b) => a.localeCompare(b));
}

function readManifestFromDisk(id: SkeletonId): Manifest {
  return JSON.parse(
    fs.readFileSync(path.join(manifestsRoot, id, 'skeleton.manifest.json'), 'utf-8'),
  ) as Manifest;
}

const primitiveFileAliases: Record<string, string[]> = {
  AlertDialog: ['alert-dialog'],
  Label: ['label'],
  ScrollArea: ['scroll-area'],
};

function getUiRoot(id: SkeletonId): string {
  return path.join(getSkeletonSrcRoot(id), 'components', 'ui');
}

function uiModuleExists(uiRoot: string, moduleName: string): boolean {
  return [
    path.join(uiRoot, `${moduleName}.ts`),
    path.join(uiRoot, `${moduleName}.tsx`),
    path.join(uiRoot, moduleName, 'index.ts'),
    path.join(uiRoot, moduleName, 'index.tsx'),
  ].some(candidate => fs.existsSync(candidate));
}

function uiPrimitiveExists(id: SkeletonId, primitive: string): boolean {
  const uiRoot = getUiRoot(id);
  const candidates = primitiveFileAliases[primitive] ?? [primitive];
  return candidates.some(moduleName => uiModuleExists(uiRoot, moduleName));
}

describe('SkeletonRegistry manifests for new skeleton families', () => {
  it('uses object workingGroups whose paths all exist physically', () => {
    for (const { id, manifest } of newSkeletons) {
      expect(Array.isArray(manifest.workingGroups), `${id} workingGroups should be an array`).toBe(true);
      expect(manifest.workingGroups.length, `${id} workingGroups should not be empty`).toBeGreaterThan(0);

      for (const group of manifest.workingGroups) {
        expect(typeof group.label, `${id} group label should be a string`).toBe('string');
        expect(group.label.length, `${id} group label should not be empty`).toBeGreaterThan(0);
        expect(Array.isArray(group.paths), `${id} ${group.label} paths should be an array`).toBe(true);
        expect(group.paths.length, `${id} ${group.label} paths should not be empty`).toBeGreaterThan(0);

        for (const relativePath of group.paths) {
          expect(relativePath.includes('*'), `${id} workingGroups should use concrete paths`).toBe(false);
          const physicalPath = path.join(getSkeletonSrcRoot(id), relativePath.replace(/^src\//, '').replace(/\//g, path.sep));
          expect(fs.existsSync(physicalPath), `${id} missing ${relativePath}`).toBe(true);
        }
      }
    }
  });

  it('contains required core files for every new skeleton', () => {
    for (const { id } of newSkeletons) {
      const srcRoot = getSkeletonSrcRoot(id);
      for (const requiredFile of requiredCoreFiles) {
        const physicalPath = path.join(srcRoot, requiredFile.replace(/^src\//, '').replace(/\//g, path.sep));
        expect(fs.existsSync(physicalPath), `${id} missing required file ${requiredFile}`).toBe(true);
      }
    }
  });

  it('keeps registry deltaFiles in sync with manifests and all physical product pages', () => {
    for (const { id, manifest } of newSkeletons) {
      const expectedDeltaFiles = sortPaths([
        ...requiredDeltaBase,
        ...getPhysicalPagePaths(id),
      ]);

      expect(sortPaths(manifest.deltaFiles), `${id} manifest deltaFiles mismatch`).toEqual(expectedDeltaFiles);
      expect(sortPaths(manifest.editableFiles), `${id} manifest editableFiles mismatch`).toEqual(expectedDeltaFiles);
      expect(sortPaths(SKELETON_REGISTRY[id].deltaFiles), `${id} registry deltaFiles mismatch`).toEqual(expectedDeltaFiles);
    }
  });

  it('returns installed files and prompt block catalogues for every new skeleton', () => {
    for (const { id, manifest } of newSkeletons) {
      const installedFiles = getSkeletonInstalledFiles(id);
      const expectedInstalledFiles = sortPaths(
        manifest.workingGroups.flatMap(group => group.paths),
      );

      expect(installedFiles.length, `${id} installed files should not be empty`).toBeGreaterThan(0);
      expect(installedFiles).toEqual(expectedInstalledFiles);

      const promptBlock = buildSkeletonPromptBlock(id);
      expect(promptBlock).toContain('File groups already on disk');
      for (const group of manifest.workingGroups) {
        expect(promptBlock, `${id} prompt missing group ${group.label}`).toContain(`- ${group.label}:`);
        expect(promptBlock, `${id} prompt missing path ${group.paths[0]}`).toContain(group.paths[0]);
      }
      for (const deltaFile of manifest.deltaFiles) {
        expect(promptBlock, `${id} prompt missing delta file ${deltaFile}`).toContain(deltaFile);
      }
    }
  });
});

describe('SkeletonRegistry ownership contracts', () => {
  const skeletonIds = Object.keys(SKELETON_REGISTRY) as SkeletonId[];

  it('keeps explicit shell ownership contracts aligned with editable product slots', () => {
    for (const id of skeletonIds) {
      const manifest = readManifestFromDisk(id);
      const ownership = manifest.ownership;
      const contract = getSkeletonOwnershipContract(id);
      const editableFiles = getEditableSkeletonFiles(id);

      expect(ownership, `${id} manifest should declare ownership explicitly`).toBeDefined();
      expect((ownership?.ownedBySkeleton ?? []).length, `${id} should declare shell-owned files`).toBeGreaterThan(0);
      expect(sortPaths(ownership?.productSlots ?? []), `${id} manifest product slots mismatch`).toEqual(sortPaths(editableFiles));
      expect(sortPaths(contract.productSlots), `${id} registry product slots mismatch`).toEqual(sortPaths(editableFiles));
      expect(sortPaths(contract.ownedBySkeleton), `${id} registry shell ownership mismatch`).toEqual(sortPaths(ownership?.ownedBySkeleton ?? []));

      const overlap = (ownership?.ownedBySkeleton ?? []).filter(file => (ownership?.productSlots ?? []).includes(file));
      expect(overlap, `${id} ownership should not overlap with product slots`).toEqual([]);

      for (const relativePath of ownership?.ownedBySkeleton ?? []) {
        const physicalPath = path.join(getSkeletonSrcRoot(id), relativePath.replace(/^src\//, '').replace(/\//g, path.sep));
        expect(fs.existsSync(physicalPath), `${id} missing shell-owned file ${relativePath}`).toBe(true);
      }
    }
  });
});

describe('SkeletonRegistry UI primitive catalogues', () => {
  const skeletonIds = Object.keys(SKELETON_REGISTRY) as SkeletonId[];

  it('keeps every skeleton UI barrel export backed by a physical module', () => {
    for (const id of skeletonIds) {
      const indexPath = path.join(getUiRoot(id), 'index.ts');
      if (!fs.existsSync(indexPath)) continue;

      const indexSource = fs.readFileSync(indexPath, 'utf-8');
      const exports = Array.from(indexSource.matchAll(/export\s+\*\s+from\s+['"]\.\/([^'"]+)['"]/g))
        .map(match => match[1]);

      for (const exportedModule of exports) {
        expect(
          uiModuleExists(getUiRoot(id), exportedModule),
          `${id} UI barrel exports missing module ${exportedModule}`,
        ).toBe(true);
      }
    }
  });

  it('advertises only UI primitives that exist in the skeleton source tree', () => {
    for (const id of skeletonIds) {
      for (const primitive of SKELETON_REGISTRY[id].uiPrimitives) {
        expect(
          uiPrimitiveExists(id, primitive),
          `${id} advertises missing UI primitive ${primitive}`,
        ).toBe(true);
      }
    }
  });
});
