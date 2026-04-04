/**
 * FigmaClient — Multi-account Figma REST API client.
 *
 * Core capability: given a Figma file URL, tries each stored account
 * token until one grants access — then returns the file info + account.
 *
 * All methods are static and stateless; account state is owned by IdentityService.
 */

import { IdentityService } from './IdentityService';
import { proxyPost }       from './proxyConfig';
import type { FigmaAccount, FigmaUserInfo } from './IdentityService';

// ── Types ───────────────────────────────────────────────────────────────────

export interface FigmaFileInfo {
  key:          string;
  name:         string;
  lastModified: string;
  thumbnailUrl?: string;
}

export interface AccessResult {
  hasAccess:   boolean;
  /** True when the Studio master-token proxy granted access (no user account needed). */
  usingProxy?: boolean;
  account?:    FigmaAccount;
  fileInfo?:   FigmaFileInfo;
  error?:      string;
}

interface TokenTestResult {
  ok:       boolean;
  fileInfo?: FigmaFileInfo;
  status?:  number;
}

// ── Client ──────────────────────────────────────────────────────────────────

const BASE = 'https://api.figma.com/v1';

export const FigmaClient = {

  // ── URL Parsing ────────────────────────────────────────────────────────

  /**
   * Extract the file key from any Figma URL variant:
   *   https://www.figma.com/file/KEY/title
   *   https://www.figma.com/design/KEY/title
   *   https://www.figma.com/proto/KEY/title
   *   https://www.figma.com/board/KEY/title
   */
  parseFileKey(url: string): string | null {
    const match = url.match(
      /figma\.com\/(?:file|design|proto|board)\/([A-Za-z0-9]{22,})/
    );
    return match?.[1] ?? null;
  },

  // ── Core: Multi-account Access Check ──────────────────────────────────

  /**
   * Try every stored account in order; return the first one that can read
   * the file. Lightweight: uses depth=1 to minimise response size.
   */
  async validateAccess(fileUrl: string): Promise<AccessResult> {
    const key = this.parseFileKey(fileUrl);
    if (!key) {
      return { hasAccess: false, error: 'Could not parse a file key from this URL. Make sure it is a full figma.com/file/ or figma.com/design/ link.' };
    }

    const accounts = IdentityService.getAll();
    if (accounts.length === 0) {
      // No accounts — attempt a lightweight proxy probe with the Studio master token.
      // This lets users validate and sync public files without any PAT setup.
      const probe = await this._probeViaProxy(key);
      if (probe.ok) {
        return {
          hasAccess:  true,
          usingProxy: true,
          fileInfo:   { key, name: probe.fileName ?? 'Untitled', lastModified: '' },
        };
      }
      if (probe.errorCode === 'private_file') {
        return {
          hasAccess: false,
          error: 'This file is private or shared with a specific team. Click "Connect with Figma" to log in with your account.',
        };
      }
      return {
        hasAccess: false,
        error: 'No Figma account connected. Click "Connect with Figma" to log in, or add a PAT in Settings → External Accounts.',
      };
    }

    // Try every account and collect statuses for a useful error message
    let lastStatus = 0;
    for (const account of accounts) {
      const result = await this._testToken(key, account.token);
      if (result.ok && result.fileInfo) {
        return { hasAccess: true, account, fileInfo: result.fileInfo };
      }
      if (result.status) lastStatus = result.status;
      console.warn(`[FigmaClient] ${account.label ?? 'account'}: HTTP ${result.status ?? 'network error'} for file ${key}`);
    }

    // Build a specific, actionable error message based on the HTTP status
    let error: string;
    if (lastStatus === 401) {
      error = 'Token invalid or expired (401). Re-add your PAT in Settings → External Accounts.';
    } else if (lastStatus === 403) {
      error =
        'Access denied (403). This file is private or in another team. ' +
        'For Figma Community files: open the file → click "Duplicate to your drafts" → paste the new URL.';
    } else if (lastStatus === 404) {
      error = 'File not found (404). Check the URL — the file may have been deleted or the link is incorrect.';
    } else if (lastStatus === 429) {
      error = 'Figma rate limit hit (429). Wait 60 s and try again.';
    } else if (lastStatus >= 500) {
      error = `Figma server error (${lastStatus}). Try again in a moment.`;
    } else {
      error =
        'No connected account has access to this file. ' +
        'For Figma Community files you must duplicate them to your drafts first: ' +
        'open the file in Figma → top-left menu → "Duplicate to your drafts".';
    }

    return { hasAccess: false, error };
  },

  // ── Proxy probe ────────────────────────────────────────────────────────

  /**
   * Lightweight access check via the Studio proxy + master token.
   * Returns { ok, fileName } on success or { ok: false, errorCode } on failure.
   * Fast — only fetches file metadata (depth=1), no node tree.
   */
  async _probeViaProxy(key: string, userToken?: string): Promise<{ ok: boolean; fileName?: string; errorCode?: string }> {
    try {
      const res = await proxyPost({ action: 'probe', fileKey: key, userToken });
      if (res.status === 403) return { ok: false, errorCode: 'private_file' };
      if (res.status === 429) return { ok: false, errorCode: 'rate_limited' };
      if (!res.ok)            return { ok: false, errorCode: `http_${res.status}` };
      const data = await res.json() as { ok?: boolean; fileName?: string };
      return { ok: true, fileName: data.fileName };
    } catch {
      return { ok: false, errorCode: 'proxy_unavailable' };
    }
  },

  // ── Single-token test ──────────────────────────────────────────────────

  /**
   * Attempt to read file metadata with a specific token.
   * Uses `?depth=1` to avoid downloading the full node tree.
   */
  async _testToken(key: string, token: string): Promise<TokenTestResult> {
    try {
      const res = await fetch(`${BASE}/files/${key}?depth=1`, {
        headers: { 'X-Figma-Token': token },
      });

      if (!res.ok) return { ok: false, status: res.status };

      const data = await res.json();
      return {
        ok: true,
        fileInfo: {
          key,
          name:          data.name         ?? 'Untitled',
          lastModified:  data.lastModified  ?? '',
          thumbnailUrl:  data.thumbnailUrl,
        },
      };
    } catch {
      return { ok: false };
    }
  },

  // ── User Info ──────────────────────────────────────────────────────────

  /**
   * Fetch Figma user profile for a given token.
   * Used during account addition to populate the account card.
   * Returns null if the token is invalid or the request fails.
   */
  async getUserInfo(token: string): Promise<FigmaUserInfo | null> {
    try {
      const res = await fetch(`${BASE}/me`, {
        headers: { 'X-Figma-Token': token },
      });
      if (!res.ok) return null;
      const d = await res.json();
      return {
        figmaId:   String(d.id   ?? ''),
        email:     d.email        ?? '',
        name:      d.handle       ?? d.name ?? 'Figma User',
        avatarUrl: d.img_url      ?? undefined,
      };
    } catch {
      return null;
    }
  },

  // ── File Info (rich) ───────────────────────────────────────────────────

  /**
   * Fetch full file metadata for a known-accessible file.
   * Used after validateAccess() already confirmed the token works.
   */
  async getFileInfo(key: string, token: string): Promise<FigmaFileInfo | null> {
    const result = await this._testToken(key, token);
    return result.ok ? (result.fileInfo ?? null) : null;
  },
};
