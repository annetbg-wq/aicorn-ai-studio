import type { MediaRequest } from './MediaPromptBuilder';

export interface GeneratedMediaAsset {
  id: string;
  type: MediaRequest['type'];
  prompt: string;
  provider: string;
  assetPath: string;
  usedInFiles: string[];
  targetScreen: string;
  targetSlot: string;
  fallbackUsed: boolean;
  safetyNotes: string[];
}

export interface MediaAssetManifest {
  version: number;
  generatedAt: string;
  assets: GeneratedMediaAsset[];
}

const REMOTE_IMAGE_RX = /(https?:\/\/(?:images\.unsplash\.com|source\.unsplash\.com|picsum\.photos|images\.pexels\.com|cdn\.[^"'\s)]+))/gi;

export function buildMediaManifest(assets: GeneratedMediaAsset[]): MediaAssetManifest {
  return {
    version: 1,
    generatedAt: '2026-05-13T19:38:25.995Z',
    assets,
  };
}

export function stringifyMediaManifest(assets: GeneratedMediaAsset[]): string {
  return `${JSON.stringify(buildMediaManifest(assets), null, 2)}\n`;
}

export function findRemoteMediaUrlViolations(files: Record<string, string>): string[] {
  const violations: string[] = [];
  for (const [path, content] of Object.entries(files)) {
    const matches = content.match(REMOTE_IMAGE_RX) ?? [];
    for (const match of matches) {
      violations.push(`${path}: ${match}`);
    }
  }
  return violations;
}

export function validateGeneratedMediaUsage(
  files: Record<string, string>,
  manifest: MediaAssetManifest,
): { ok: boolean; unusedAssets: string[]; remoteUrlViolations: string[] } {
  const remoteUrlViolations = findRemoteMediaUrlViolations(files);
  const unusedAssets = manifest.assets
    .filter(asset => !Object.values(files).some(content => content.includes(asset.assetPath)))
    .map(asset => asset.id);

  return {
    ok: remoteUrlViolations.length === 0 && unusedAssets.length === 0,
    unusedAssets,
    remoteUrlViolations,
  };
}
