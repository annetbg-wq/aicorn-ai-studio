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
  getSkeletonInstalledFiles,
  SKELETON_REGISTRY,
  type SkeletonId,
} from '../SkeletonRegistry';

type Manifest = {
  id: SkeletonId;
  workingGroups: Array<{ label: string; paths: string[] }>;
  editableFiles: string[];
  deltaFiles: string[];
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
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
