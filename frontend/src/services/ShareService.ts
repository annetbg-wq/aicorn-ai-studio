/**
 * ShareService.ts — Instant share link via Supabase snapshot.
 *
 * Flow:
 *   1. POST to `share-snapshot` edge function with current project files + thumbnail
 *   2. Edge function stores in `shared_snapshots` table (7-day TTL)
 *   3. Returns a `shareId` → displayed as `/share/<shareId>`
 *   4. /share/:id page fetches the snapshot and renders it in a read-only iframe
 *
 * Legacy Vercel deploy is kept as `deployToVercel()` for backward compat.
 */

import { supabase } from '../lib/supabase';

const EDGE_FN = 'share-snapshot';

export interface ShareResult {
  ok:       boolean;
  url?:     string;
  shareId?: string;
  error?:   string;
}

export interface SnapshotData {
  title:     string;
  files:     Record<string, string>;
  thumbnail: string | null;
  createdAt: string;
  expiresAt: string;
}

export const ShareService = {
  /**
   * Create an instant share link by saving a snapshot to Supabase.
   * Returns the public share URL (relative: /share/<shareId>).
   */
  async createShareLink(
    files:     Record<string, string>,
    options?: {
      title?:     string;
      thumbnail?: string | null;
      projectId?: string;
    },
  ): Promise<ShareResult> {
    try {
      const { data, error } = await supabase.functions.invoke(EDGE_FN, {
        body: {
          action:    'create',
          files,
          title:     options?.title ?? 'Untitled',
          thumbnail: options?.thumbnail ?? null,
          projectId: options?.projectId ?? null,
        },
      });

      if (error) return { ok: false, error: error.message };

      const result = data as { ok: boolean; shareId?: string; shareUrl?: string; error?: string };
      if (!result.ok || !result.shareId) {
        return { ok: false, error: result.error ?? 'Unknown error' };
      }

      const shareUrl = `/share/${result.shareId}`;
      return { ok: true, shareId: result.shareId, url: shareUrl };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  /**
   * Fetch a shared snapshot by shareId.
   * Returns null if not found or expired.
   */
  async getSnapshot(shareId: string): Promise<SnapshotData | null> {
    try {
      const { data, error } = await supabase.functions.invoke(EDGE_FN, {
        method: 'GET',
        headers: { 'x-share-id': shareId },
        body: undefined,
      });
      if (error || !data?.ok) return null;
      return data.snapshot as SnapshotData;
    } catch {
      return null;
    }
  },

  /**
   * Fetch snapshot directly via REST GET (avoids invoke for simple reads).
   */
  async getSnapshotRest(shareId: string): Promise<SnapshotData | null> {
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/${EDGE_FN}?id=${encodeURIComponent(shareId)}`;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
      const resp = await fetch(url, {
        headers: {
          'apikey':        anonKey,
          'Authorization': `Bearer ${anonKey}`,
        },
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      if (!data.ok) return null;
      return data.snapshot as SnapshotData;
    } catch {
      return null;
    }
  },

  /**
   * Legacy: deploy preview-workspace to Vercel via local CLI.
   * Requires `vercel` CLI + `vercel login`.
   */
  async deployToVercel(): Promise<ShareResult> {
    const res = await fetch('/__deploy_preview', { method: 'POST' });
    const data = await res.json() as ShareResult;
    return data;
  },
};
