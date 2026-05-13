import { buildMediaManifest, stringifyMediaManifest, type GeneratedMediaAsset } from './MediaAssetManifestService';

export interface GeneratedMediaBundle {
  files: Record<string, string>;
  manifestPath: string;
  asset: GeneratedMediaAsset;
}

export function createGeneratedMediaBundle(asset: GeneratedMediaAsset, assetContent: string): GeneratedMediaBundle {
  const manifestPath = 'src/assets/generated/media-manifest.json';
  const files: Record<string, string> = {
    [asset.assetPath]: assetContent,
    [manifestPath]: stringifyMediaManifest([asset]),
  };
  return { files, manifestPath, asset };
}

export function mergeGeneratedMediaBundles(assets: GeneratedMediaAsset[], assetFiles: Record<string, string>): Record<string, string> {
  return {
    ...assetFiles,
    'src/assets/generated/media-manifest.json': `${JSON.stringify(buildMediaManifest(assets), null, 2)}\n`,
  };
}
