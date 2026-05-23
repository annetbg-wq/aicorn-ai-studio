import { scanFileMap, type CorruptionFinding } from '../services/projectCorruptionScan';
import type { SkeletonId } from '../services/SkeletonRegistry';

export type SaveFileMap = Record<string, string>;

const SKELETON_SOURCE_MODULES = import.meta.glob([
  '../../../skeletons/*/skeleton-*/src/**/*.ts',
  '../../../skeletons/*/skeleton-*/src/**/*.tsx',
  '../../../skeletons/*/skeleton-*/src/**/*.js',
  '../../../skeletons/*/skeleton-*/src/**/*.jsx',
  '../../../skeletons/*/skeleton-*/src/**/*.css',
  '../../../skeletons/*/skeleton-*/src/**/*.json',
], { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;

function normalizeRepoAssetPath(modulePath: string): string {
  return modulePath.replace(/^(\.\.\/)+/, '').replace(/\\/g, '/');
}

function normalizeSavePath(path: string): string {
  return path.replace(/^src\//, '').replace(/^\//, '');
}

const SKELETON_SOURCE_FILES = Object.fromEntries(
  Object.entries(SKELETON_SOURCE_MODULES).map(([path, content]) => [normalizeRepoAssetPath(path), content]),
) as Record<string, string>;

export interface ResolveReloadCompleteSaveFilesInput {
  existingFiles?: SaveFileMap | null;
  skeletonFiles?: SaveFileMap | null;
  pendingFinalFiles: SaveFileMap;
}

export interface ResolveReloadCompleteSaveFilesResult {
  files: SaveFileMap;
  findings: CorruptionFinding[];
  errorMessage?: string;
}

export function getSkeletonSaveFiles(skeletonId?: SkeletonId | null): SaveFileMap {
  if (!skeletonId) return {};

  const skeletonFiles: SaveFileMap = {};
  const sourcePrefix = `skeletons/${skeletonId}/skeleton-${skeletonId}/src/`;

  for (const [path, content] of Object.entries(SKELETON_SOURCE_FILES)) {
    const markerIndex = path.indexOf(sourcePrefix);
    if (markerIndex === -1) continue;
    const relativePath = path.slice(markerIndex + sourcePrefix.length);
    if (!relativePath) continue;
    skeletonFiles[normalizeSavePath(relativePath)] = content;
  }

  return skeletonFiles;
}

const VISUAL_PACK_IMPORT = "import './styles/visual-pack.css';";

export function resolveReloadCompleteSaveFiles(
  input: ResolveReloadCompleteSaveFilesInput,
): ResolveReloadCompleteSaveFilesResult {
  const merged: SaveFileMap = {
    ...(input.skeletonFiles ?? {}),
    ...(input.existingFiles ?? {}),
    ...input.pendingFinalFiles,
  };

  // Inject visual-pack.css import into App.tsx so CSS vars are available after reload.
  // The pipeline injects it at compile time but not into persisted storage.
  const appKey = Object.keys(merged).find(k => k === 'App.tsx' || k === 'src/App.tsx');
  const hasVisualPack = Object.keys(merged).some(
    k => k === 'styles/visual-pack.css' || k === 'src/styles/visual-pack.css',
  );
  if (appKey && hasVisualPack) {
    const src = merged[appKey];
    if (typeof src === 'string' && !src.includes(VISUAL_PACK_IMPORT)) {
      merged[appKey] = `${VISUAL_PACK_IMPORT}\n${src}`;
    }
  }

  const files = merged;
  const findings = scanFileMap(files).findings;
  const missingEntry = findings.some(finding => finding.kind === 'missing-entry');

  return {
    files,
    findings,
    errorMessage: missingEntry
      ? 'Cannot save reload-incomplete project: missing App.tsx/main.tsx'
      : undefined,
  };
}