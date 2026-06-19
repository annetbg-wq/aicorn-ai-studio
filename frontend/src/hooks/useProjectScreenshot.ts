/**
 * useProjectScreenshot — captures a screenshot from the Vite preview iframe
 * and caches it in localStorage.
 *
 * Flow:
 *   1. Call captureFromViteIframe(iframeEl, projectId)
 *   2. Sends postMessage { type: 'capture-screenshot' } to the iframe
 *   3. preview-workspace/main.tsx responds with { type: 'screenshot-result', dataUrl } (success)
 *      or { type: 'screenshot-result', error: '<reason>' } (failure)
 *   4. resolveScreenshotStatus() converts the raw message to a typed ScreenshotStatus
 *   5. On success: compress and persist via screenshotCache.saveScreenshot()
 *
 * Returns a structured ScreenshotStatus so callers can distinguish between
 * success, failure, timeout, and empty-canvas blocks (WI-8).
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  getScreenshot,
  saveScreenshot,
  saveRevisionThumbnail,
  getRevisionThumbnail,
} from '../lib/screenshotCache';
import {
  resolveScreenshotStatus,
  type ScreenshotStatus,
} from '../services/ScreenshotService';

const CAPTURE_TIMEOUT_MS = 8_000;

export function useProjectScreenshot() {
  const pendingRef = useRef<Map<string, (status: ScreenshotStatus) => void>>(new Map());

  // Listen for screenshot-result messages from the preview iframe.
  // Handles both success (dataUrl) and failure (error) branches (WI-8).
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== 'screenshot-result') return;
      const status = resolveScreenshotStatus({
        dataUrl: typeof e.data.dataUrl === 'string' ? e.data.dataUrl : null,
        error: typeof e.data.error === 'string' ? e.data.error : null,
        source: 'html2canvas',
      });

      for (const [, resolve] of pendingRef.current) resolve(status);
      pendingRef.current.clear();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  /**
   * Request a screenshot from the Vite preview iframe and save it.
   *
   * Returns a structured ScreenshotStatus (WI-8):
   *   - succeeded=true  → dataUrl captured and saved
   *   - succeeded=false → unavailableReason explains why (timeout, error, empty canvas, no iframe)
   *
   * Saves as both the project-level screenshot and (optionally) a revision thumbnail on success.
   */
  const captureFromViteIframe = useCallback(
    async (
      iframe:     HTMLIFrameElement | null,
      projectId:  string,
      revisionId?: string | null,
    ): Promise<ScreenshotStatus> => {
      if (!iframe?.contentWindow) {
        return {
          attempted: false,
          succeeded: false,
          source: 'html2canvas',
          unavailableReason: 'no_iframe: iframe or contentWindow not available',
        };
      }

      return new Promise(resolve => {
        const key = projectId;
        let timer: ReturnType<typeof setTimeout>;

        pendingRef.current.set(key, async (status) => {
          clearTimeout(timer);
          if (status.dataUrl) {
            await saveScreenshot(projectId, status.dataUrl);
            if (revisionId) {
              void saveRevisionThumbnail(revisionId, status.dataUrl);
            }
          }
          resolve(status);
        });

        timer = setTimeout(() => {
          pendingRef.current.delete(key);
          resolve({
            attempted: true,
            succeeded: false,
            source: 'html2canvas',
            unavailableReason: 'screenshot_timeout: capture timed out after 8s',
          });
        }, CAPTURE_TIMEOUT_MS);

        iframe.contentWindow!.postMessage({ type: 'capture-screenshot' }, '*');
      });
    },
    [],
  );

  return { captureFromViteIframe, getScreenshot, getRevisionThumbnail };
}
