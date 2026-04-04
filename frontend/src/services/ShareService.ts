/**
 * ShareService.ts
 *
 * Deploys preview-app to Vercel via the local CLI (vercel deploy).
 * Requires: `npm install -g vercel` + `vercel login` once.
 * The /__deploy_preview middleware in vite.config.ts does the heavy lifting.
 */

export interface ShareResult {
  ok: boolean;
  url?: string;
  error?: string;
}

export const ShareService = {
  /**
   * Triggers a full build + vercel deploy of preview-app.
   * Returns the public Vercel URL on success.
   */
  async deployToVercel(): Promise<ShareResult> {
    const res = await fetch('/__deploy_preview', { method: 'POST' });
    const data: ShareResult = await res.json();
    return data;
  },
};