import path from 'path';
import { canonicalizeProjectPath } from './safePaths';

function assertWithinRoot(root: string, target: string, label: string): void {
  const normalizedRoot = path.resolve(root);
  const normalizedTarget = path.resolve(target);
  const rootPrefix = normalizedRoot.endsWith(path.sep)
    ? normalizedRoot
    : `${normalizedRoot}${path.sep}`;

  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(rootPrefix)) {
    throw new Error(`${label} escapes preview root`);
  }
}

export function resolvePreviewBridgePath(previewSrc: string, requestedPath: string) {
  const canonicalPath = canonicalizeProjectPath(requestedPath, {
    allowRootSlash: false,
    stripSrcPrefix: true,
    label: 'preview bridge path',
  });
  const fullPath = path.resolve(previewSrc, canonicalPath);
  assertWithinRoot(previewSrc, fullPath, `preview bridge path "${requestedPath}"`);
  return { canonicalPath, fullPath };
}
