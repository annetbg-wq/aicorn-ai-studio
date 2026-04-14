/**
 * useProjectScreenshot — captures a screenshot from the Vite preview iframe
 * and caches it in localStorage.
 *
 * Flow:
 *   1. Call captureFromViteIframe(iframeEl, projectId)
 *   2. Sends postMessage { type: 'capture-screenshot' } to the iframe
 *   3. preview-workspace/main.tsx responds with { type: 'screenshot-result', dataUrl }
 *   4. We compress and persist via screenshotCache.saveScreenshot()
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  getScreenshot,
  saveScreenshot,
  saveRevisionThumbnail,
  getRevisionThumbnail,
} from '../lib/screenshotCache';

const CAPTURE_TIMEOUT_MS = 8_000;

export function useProjectScreenshot() {
  const pendingRef = useRef<Map<string, (dataUrl: string | null) => void>>(new Map());

  // Listen for screenshot-result messages from the preview iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== 'screenshot-result') return;
      const dataUrl: string | null = e.data.dataUrl ?? null;

      // Resolve all pending captures (there should only be one at a time)
      for (const [, resolve] of pendingRef.current) resolve(dataUrl);
      pendingRef.current.clear();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  /**
   * Request a screenshot from the Vite preview iframe and save it.
   * Saves as both the project-level screenshot and (optionally) a revision thumbnail.
   * Resolves with the data-URL, or null on timeout/error.
   */
  const captureFromViteIframe = useCallback(
    async (
      iframe:     HTMLIFrameElement | null,
      projectId:  string,
      revisionId?: string | null,
    ): Promise<string | null> => {
      if (!iframe?.contentWindow) return null;

      return new Promise(resolve => {
        const key = projectId;
        let timer: ReturnType<typeof setTimeout>;

        pendingRef.current.set(key, async (dataUrl) => {
          clearTimeout(timer);
          if (dataUrl) {
            await saveScreenshot(projectId, dataUrl);
            // Also persist as a revision thumbnail when a revision is active
            if (revisionId) {
              void saveRevisionThumbnail(revisionId, dataUrl);
            }
          }
          resolve(dataUrl);
        });

        timer = setTimeout(() => {
          pendingRef.current.delete(key);
          resolve(null);
        }, CAPTURE_TIMEOUT_MS);

        iframe.contentWindow!.postMessage({ type: 'capture-screenshot' }, '*');
      });
    },
    [],
  );

  return { captureFromViteIframe, getScreenshot, getRevisionThumbnail };
}
