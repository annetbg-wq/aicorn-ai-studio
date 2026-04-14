/**
 * screenshotCache.ts — localStorage cache for project preview screenshots.
 *
 * Project screenshots  — `screenshot_<projectId>`           (100 KB max)
 * Revision thumbnails  — `rev_thumb_<revisionId>`           (40 KB max, smaller)
 *
 * Value: base64 data-URL (image/jpeg)
 */

const KEY_PREFIX      = 'screenshot_';
const REV_THUMB_PREFIX = 'rev_thumb_';
const MAX_BYTES        = 100 * 1024; // 100 KB
const REV_THUMB_BYTES  =  40 * 1024; //  40 KB — smaller for revision thumbs
const JPEG_QUALITY_STEPS = [0.85, 0.7, 0.55, 0.4, 0.3, 0.2];

/** Read cached screenshot for a project. Returns null if not cached. */
export function getScreenshot(projectId: string): string | null {
  try {
    return localStorage.getItem(KEY_PREFIX + projectId);
  } catch {
    return null;
  }
}

/** Compress a data-URL to ≤ maxBytes by reducing quality / dimensions. */
async function compressDataUrl(dataUrl: string, maxBytes = MAX_BYTES): Promise<string> {
  if (dataUrl.length * 0.75 <= maxBytes) return dataUrl; // already small enough

  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.naturalWidth;
      let h = img.naturalHeight;

      // Cap dimensions to 800×600 first
      const MAX_DIM = 800;
      if (w > MAX_DIM || h > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);

      // Try progressive quality reduction
      for (const quality of JPEG_QUALITY_STEPS) {
        const compressed = canvas.toDataURL('image/jpeg', quality);
        if (compressed.length * 0.75 <= maxBytes) {
          resolve(compressed);
          return;
        }
      }

      // Last resort: halve dimensions
      const half = document.createElement('canvas');
      half.width  = Math.max(160, Math.round(w / 2));
      half.height = Math.max(120, Math.round(h / 2));
      half.getContext('2d')!.drawImage(img, 0, 0, half.width, half.height);
      resolve(half.toDataURL('image/jpeg', 0.3));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Save a screenshot data-URL for a project.
 * Compresses to ≤ 100 KB before writing to localStorage.
 * Dispatches a 'screenshot-saved' CustomEvent for same-tab listeners.
 * Silently ignores quota errors.
 */
export async function saveScreenshot(projectId: string, dataUrl: string): Promise<void> {
  try {
    const compressed = await compressDataUrl(dataUrl);
    localStorage.setItem(KEY_PREFIX + projectId, compressed);
    // Notify same-tab listeners (storage event only fires in OTHER tabs)
    window.dispatchEvent(new CustomEvent('screenshot-saved', { detail: { projectId, dataUrl: compressed } }));
  } catch (err) {
    console.warn('[screenshotCache] Failed to save screenshot:', err);
  }
}

/** Remove a cached screenshot for a project. */
export function clearScreenshot(projectId: string): void {
  try {
    localStorage.removeItem(KEY_PREFIX + projectId);
  } catch { /* ignore */ }
}

/** Remove screenshots for projects not in `keepIds` (cleanup stale entries). */
export function pruneScreenshots(keepIds: Set<string>): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(KEY_PREFIX)) {
        const id = key.slice(KEY_PREFIX.length);
        if (!keepIds.has(id)) localStorage.removeItem(key);
      }
    }
  } catch { /* ignore */ }
}

// ── Revision thumbnails ───────────────────────────────────────────────────────

/** Read cached thumbnail for a revision. Returns null if not cached. */
export function getRevisionThumbnail(revisionId: string): string | null {
  try {
    return localStorage.getItem(REV_THUMB_PREFIX + revisionId);
  } catch {
    return null;
  }
}

/**
 * Save a thumbnail for a revision (smaller budget than project screenshots).
 * Compresses to ≤ 40 KB before writing.
 */
export async function saveRevisionThumbnail(revisionId: string, dataUrl: string): Promise<void> {
  try {
    const compressed = await compressDataUrl(dataUrl, REV_THUMB_BYTES);
    localStorage.setItem(REV_THUMB_PREFIX + revisionId, compressed);
  } catch (err) {
    console.warn('[screenshotCache] Failed to save revision thumbnail:', err);
  }
}

/** Remove a revision thumbnail. */
export function clearRevisionThumbnail(revisionId: string): void {
  try {
    localStorage.removeItem(REV_THUMB_PREFIX + revisionId);
  } catch { /* ignore */ }
}

/** Remove revision thumbnails for revisions not in `keepIds`. */
export function pruneRevisionThumbnails(keepIds: Set<string>): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(REV_THUMB_PREFIX)) {
        const id = key.slice(REV_THUMB_PREFIX.length);
        if (!keepIds.has(id)) localStorage.removeItem(key);
      }
    }
  } catch { /* ignore */ }
}
