/**
 * IdentityService — Multi-account identity manager for AIC-RG Studio.
 *
 * Stores Figma accounts (PAT or future OAuth PKCE) in localStorage.
 * Each account has a token + optional userInfo fetched from Figma /v1/me.
 *
 * OAuth PKCE infrastructure is fully implemented here but not yet wired
 * to a UI flow (requires a registered Figma App + client_id). Phase 3.1.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type AccountType = 'pat' | 'oauth_pkce';

export interface FigmaUserInfo {
  figmaId:   string;
  email:     string;
  name:      string;
  avatarUrl?: string;
}

export interface FigmaAccount {
  id:            string;        // crypto.randomUUID()
  label:         string;        // user-assigned name
  type:          AccountType;
  token:         string;        // PAT or OAuth access_token
  refreshToken?: string;        // OAuth only
  expiresAt?:    number;        // OAuth only — unix ms; null = non-expiring PAT
  userInfo?:     FigmaUserInfo;
  addedAt:       number;        // Date.now()
}

export interface PKCEPair {
  codeVerifier:  string;
  codeChallenge: string;
}

export interface OAuthTokenResponse {
  accessToken:  string;
  refreshToken: string;
  expiresIn:    number;  // seconds
}

// ── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY   = 'FIGMA_ACCOUNTS';
const FIGMA_AUTH_URL = 'https://www.figma.com/oauth';
const FIGMA_TOKEN_URL = 'https://api.figma.com/v1/oauth/token';

// ── Helpers ─────────────────────────────────────────────────────────────────

function b64url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── Service ─────────────────────────────────────────────────────────────────

export const IdentityService = {

  // ── Persistence ────────────────────────────────────────────────────────

  load(): FigmaAccount[] {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    } catch {
      return [];
    }
  },

  save(accounts: FigmaAccount[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  },

  // ── CRUD ───────────────────────────────────────────────────────────────

  getAll(): FigmaAccount[] {
    return this.load();
  },

  getById(id: string): FigmaAccount | undefined {
    return this.load().find(a => a.id === id);
  },

  add(draft: Omit<FigmaAccount, 'id' | 'addedAt'>): FigmaAccount {
    const account: FigmaAccount = {
      ...draft,
      id:      crypto.randomUUID(),
      addedAt: Date.now(),
    };
    this.save([...this.load(), account]);
    return account;
  },

  remove(id: string): void {
    this.save(this.load().filter(a => a.id !== id));
  },

  /** Partial update — merges fields onto existing account. */
  patch(id: string, updates: Partial<FigmaAccount>): void {
    this.save(
      this.load().map(a => a.id === id ? { ...a, ...updates } : a)
    );
  },

  // ── OAuth PKCE Infrastructure ───────────────────────────────────────────
  // Built and ready; wired to UI in Phase 3.1 once a Figma App is registered.

  /**
   * Generate a PKCE code_verifier + code_challenge pair.
   * Uses Web Crypto API (available in all modern browsers).
   */
  async generatePKCE(): Promise<PKCEPair> {
    const raw    = crypto.getRandomValues(new Uint8Array(32));
    const verifier  = b64url(raw.buffer);
    const hashBuf   = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const challenge = b64url(hashBuf);
    return { codeVerifier: verifier, codeChallenge: challenge };
  },

  /**
   * Build the Figma OAuth authorization URL.
   * Redirect the user to this URL to start the OAuth flow.
   *
   * @param clientId   - Your Figma App client_id (from developers.figma.com)
   * @param redirectUri - Must match one of the URIs registered in your Figma App
   * @param challenge  - PKCE code_challenge (S256 method)
   * @param state      - Random string for CSRF protection (store in sessionStorage)
   */
  buildAuthUrl(
    clientId:    string,
    redirectUri: string,
    challenge:   string,
    state:       string,
  ): string {
    const params = new URLSearchParams({
      client_id:             clientId,
      redirect_uri:          redirectUri,
      scope:                 'file_read',
      state,
      response_type:         'code',
      code_challenge:        challenge,
      code_challenge_method: 'S256',
    });
    return `${FIGMA_AUTH_URL}?${params}`;
  },

  /**
   * Exchange authorization code for tokens.
   *
   * ⚠️  NOTE: The Figma token endpoint does NOT send CORS headers, so this
   *     call will fail from a browser. In Phase 3.1 route it through a
   *     Supabase Edge Function (proxy) to avoid CORS.
   *     This method is included for completeness; returns null in the browser.
   */
  async exchangeCode(
    code:        string,
    verifier:    string,
    clientId:    string,
    clientSecret: string,
    redirectUri: string,
  ): Promise<OAuthTokenResponse | null> {
    try {
      const res = await fetch(FIGMA_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id:     clientId,
          client_secret: clientSecret,
          redirect_uri:  redirectUri,
          code,
          code_verifier: verifier,
          grant_type:    'authorization_code',
        }),
      });
      if (!res.ok) return null;
      const d = await res.json();
      return {
        accessToken:  d.access_token,
        refreshToken: d.refresh_token,
        expiresIn:    d.expires_in,
      };
    } catch {
      console.warn('[IdentityService] OAuth exchange failed (CORS expected in browser)');
      return null;
    }
  },
};
