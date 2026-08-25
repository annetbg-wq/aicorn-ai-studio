/**
 * FigmaOAuthService — Figma OAuth 2.0 flow via Supabase Edge Function proxy.
 *
 * The client_secret NEVER touches the browser — all token exchange happens
 * server-side inside the figma-proxy Edge Function.
 *
 * Setup (one-time by Studio admin):
 *   1. Register a Figma App at https://www.figma.com/developers/apps
 *   2. Add callback URL: your app origin (e.g. http://localhost:5173/ and prod URL)
 *   3. Set FIGMA_CLIENT_ID and FIGMA_CLIENT_SECRET in Supabase Edge Function secrets
 *
 * User flow:
 *   1. Call startOAuth(redirectUri) → get authUrl → window.location.href = authUrl
 *   2. Figma redirects back to redirectUri with ?code=XXX&state=YYY
 *   3. App.tsx detects ?code= on mount → calls completeOAuth(code, state, redirectUri)
 *   4. Token stored as FigmaAccount via IdentityService.add()
 */

import { proxyPost }       from './proxyConfig';
import { IdentityService } from './IdentityService';
import { FigmaClient }     from './FigmaClient';
import type { FigmaAccount } from './IdentityService';

const OAUTH_STATE_KEY    = 'FIGMA_OAUTH_STATE';
const OAUTH_PRE_VIEW_KEY = 'FIGMA_OAUTH_PRE_VIEW';

export const FigmaOAuthService = {

  /**
   * Begin OAuth: get Figma auth URL from proxy and redirect the user.
   * Stores CSRF `state` in sessionStorage for verification on callback.
   *
   * @param redirectUri — must be registered in your Figma App's callback URLs
   * @returns authUrl to redirect to, or null if proxy is not configured
   */
  async startOAuth(redirectUri: string): Promise<string | null> {
    const state = crypto.randomUUID();
    sessionStorage.setItem(OAUTH_STATE_KEY, state);
    try {
      const res = await proxyPost({ action: 'oauth_start', redirectUri, state });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        console.error('[FigmaOAuth] oauth_start failed:', res.status, err.error);
        return null;
      }
      const { authUrl } = await res.json() as { authUrl?: string };
      return authUrl ?? null;
    } catch (err) {
      console.error('[FigmaOAuth] network error during oauth_start:', err);
      return null;
    }
  },

  /**
   * Complete OAuth: exchange code for access token via proxy.
   * Called from App.tsx when ?code=XXX&state=YYY is detected in the URL.
   *
   * @returns { account } on success, { error } on failure
   */
  async completeOAuth(
    code:        string,
    state:       string,
    redirectUri: string,
  ): Promise<{ account: FigmaAccount } | { error: string }> {
    // CSRF verification
    const savedState = sessionStorage.getItem(OAUTH_STATE_KEY);
    if (state !== savedState) {
      return { error: 'State mismatch — possible CSRF attack. Retry login.' };
    }

    try {
      const res = await proxyPost({ action: 'oauth_callback', code, redirectUri });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        return { error: body.error ?? `Token exchange failed (${res.status})` };
      }

      const { accessToken, refreshToken, expiresIn } = await res.json() as {
        accessToken: string;
        refreshToken: string;
        expiresIn:   number;
      };

      // Fetch user display info with the new token
      const userInfo = await FigmaClient.getUserInfo(accessToken).catch(() => null);

      const account = IdentityService.add({
        label:        userInfo?.name ?? 'Figma Account',
        type:         'oauth_pkce',
        token:        accessToken,
        refreshToken,
        expiresAt:    Date.now() + expiresIn * 1000,
        userInfo:     userInfo ?? undefined,
      });

      sessionStorage.removeItem(OAUTH_STATE_KEY);
      return { account };
    } catch (err) {
      return { error: String(err) };
    }
  },

  /**
   * The redirect URI for the current app origin. Uses Vite's BASE_URL (the app's
   * own `base` config — '/' locally, '/aicorn-ai-studio/' on GitHub Pages) instead
   * of a hardcoded root slash, so this still resolves correctly when the app is
   * served from a subpath instead of the domain root.
   */
  redirectUri(): string {
    return window.location.origin + import.meta.env.BASE_URL;
  },

  /** Store which view to restore after the OAuth redirect round-trip. */
  savePreOAuthView(view: string): void {
    sessionStorage.setItem(OAUTH_PRE_VIEW_KEY, view);
  },

  /** Read and clear the stored pre-OAuth view. */
  popPreOAuthView(): string | null {
    const v = sessionStorage.getItem(OAUTH_PRE_VIEW_KEY);
    sessionStorage.removeItem(OAUTH_PRE_VIEW_KEY);
    return v;
  },
};
