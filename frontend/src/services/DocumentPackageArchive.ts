/**
 * DocumentPackageArchive
 *
 * Bundles a product-document package (docs/architect/*) into a downloadable ZIP so
 * the user can take the full build spec elsewhere if the studio run falls short.
 * The archive always carries MANIFEST.json (with the TopicMarker) at its root, so
 * the topic is recoverable from the artifact itself.
 */
import JSZip from 'jszip';
import type { TopicMarker } from './ProductDocumentSet';

const DOCS_PREFIX_RE = /^(?:\.?\/)?(?:src\/)?docs\/architect\//;

function folderName(appName: string, marker?: TopicMarker | null): string {
  const base = (appName || marker?.label || 'product').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${base || 'product'}-docs`;
}

/** Selects only the docs/architect/* entries from a project's file map. */
export function selectDocumentPackageFiles(files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    if (DOCS_PREFIX_RE.test(path)) out[path] = content;
  }
  return out;
}

/**
 * Builds a ZIP Blob from doc-package files. Entries are placed under a single
 * top folder, with their docs/architect/ prefix stripped for a clean layout.
 * Guarantees a MANIFEST.json at the folder root when a marker is supplied.
 */
export async function buildDocumentPackageZip(
  files: Record<string, string>,
  opts: { appName: string; marker?: TopicMarker | null },
): Promise<Blob> {
  const zip = new JSZip();
  const root = zip.folder(folderName(opts.appName, opts.marker)) ?? zip;

  let hasManifest = false;
  for (const [path, content] of Object.entries(files)) {
    const rel = path.replace(DOCS_PREFIX_RE, '');
    if (!rel) continue;
    if (/(^|\/)MANIFEST\.json$/i.test(rel)) hasManifest = true;
    root.file(rel, content);
  }

  if (!hasManifest && opts.marker) {
    root.file('MANIFEST.json', JSON.stringify({
      kind: 'aic-studio-product-document-package',
      version: 1,
      topicMarker: opts.marker,
      appName: opts.appName,
      generatedAt: new Date().toISOString(),
    }, null, 2) + '\n');
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** Triggers a browser download of a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Revoke on the next tick so the click has begun the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * Convenience: zip the doc-package files from a project's file map and download.
 * Returns false when no doc-package files are present.
 */
export async function downloadDocumentPackage(
  projectFiles: Record<string, string>,
  opts: { appName: string; marker?: TopicMarker | null },
): Promise<boolean> {
  const docs = selectDocumentPackageFiles(projectFiles);
  if (Object.keys(docs).length === 0) return false;
  const blob = await buildDocumentPackageZip(docs, opts);
  downloadBlob(blob, `${folderName(opts.appName, opts.marker)}.zip`);
  return true;
}
