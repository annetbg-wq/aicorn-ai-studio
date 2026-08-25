import { randomBytes } from 'node:crypto';
import { sign, verify } from './signedToken.js';

/**
 * Client registration, authorization codes, and access tokens are all
 * stateless now — HMAC-signed, self-contained tokens (see signedToken.ts),
 * not entries in an in-memory Map. That's the fix for the prod bug this
 * file used to have: Render's free tier idles the service down and restarts
 * it between requests, and ChatGPT's connector setup calls /register, then
 * /authorize, then /token as separate requests that can be minutes apart
 * (typing the login-form token takes real time) — any restart in between
 * wiped the in-memory Maps this used to use, so a resolve that worked one
 * request earlier would 404 the next. Resolution is now a pure function of
 * the token itself plus MCP_BEARER_TOKEN (an env var, which by definition
 * survives restarts), so nothing about it depends on this process's memory.
 *
 * Refresh tokens are the one piece still kept in an in-memory Map: rotating
 * them (detecting reuse of an already-exchanged refresh token, a real
 * security signal) fundamentally needs some shared state to check against —
 * that can't be done statelessly without a revocation list, which is a
 * meaningfully different problem from the one that was actually broken.
 * Losing an active refresh token to a restart is a much smaller failure
 * (ChatGPT silently re-runs the OAuth flow) than what was reported (the
 * flow failing outright), so it's left as a known, narrower limitation.
 */

export interface RegisteredClient {
  clientId: string;
  redirectUris: string[];
  clientName?: string;
}

interface ClientPayload { redirectUris: string[]; clientName?: string; iat: number }
interface CodePayload { clientId: string; redirectUri: string; codeChallenge: string; exp: number; nonce: string }
interface AccessPayload { clientId: string; exp: number }

const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1_000; // 1 hour — "short-lived" per the issue
const AUTH_CODE_TTL_MS = 60 * 1_000; // 60 seconds
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1_000; // 30 days, rotated on every use

const refreshTokens = new Map<string, { clientId: string; expiresAt: number }>();

// Best-effort single-use enforcement for authorization codes, within this
// process's lifetime — codes are PKCE-bound (useless without the matching
// code_verifier, which never leaves the original requester), so losing this
// set across a restart is a minor relaxation, not the primary protection.
const usedCodes = new Set<string>();

// ── Dynamic client registration (RFC 7591) ─────────────────────────────────

export function registerClient(redirectUris: string[], clientName?: string): RegisteredClient {
  const clientId = sign({ redirectUris, clientName, iat: Date.now() } satisfies ClientPayload);
  return { clientId, redirectUris, clientName };
}

export function getClient(clientId: string): RegisteredClient | undefined {
  const payload = verify<ClientPayload>(clientId);
  if (!payload) return undefined;
  return { clientId, redirectUris: payload.redirectUris, clientName: payload.clientName };
}

// ── Authorization codes ─────────────────────────────────────────────────────

export function createAuthorizationCode(params: { clientId: string; redirectUri: string; codeChallenge: string }): string {
  return sign({ ...params, exp: Date.now() + AUTH_CODE_TTL_MS, nonce: randomBytes(9).toString('base64url') } satisfies CodePayload);
}

/** Single-use (within this process's uptime): rejects replays and anything expired or tampered with. */
export function consumeAuthorizationCode(code: string): { clientId: string; redirectUri: string; codeChallenge: string } | undefined {
  const payload = verify<CodePayload>(code);
  if (!payload || payload.exp < Date.now() || usedCodes.has(code)) return undefined;
  usedCodes.add(code);
  return { clientId: payload.clientId, redirectUri: payload.redirectUri, codeChallenge: payload.codeChallenge };
}

// ── Access / refresh tokens ─────────────────────────────────────────────────

export function issueAccessToken(clientId: string): { accessToken: string; expiresIn: number } {
  const exp = Date.now() + ACCESS_TOKEN_TTL_MS;
  return { accessToken: sign({ clientId, exp } satisfies AccessPayload), expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000) };
}

export function isValidAccessToken(token: string): boolean {
  const payload = verify<AccessPayload>(token);
  return !!payload && payload.exp >= Date.now();
}

export function issueRefreshToken(clientId: string): string {
  sweepRefreshTokens();
  const token = randomBytes(32).toString('base64url');
  refreshTokens.set(token, { clientId, expiresAt: Date.now() + REFRESH_TOKEN_TTL_MS });
  return token;
}

/** Rotates the refresh token: the old one is invalidated whether or not this call succeeds. */
export function consumeRefreshToken(token: string): { clientId: string } | undefined {
  const record = refreshTokens.get(token);
  refreshTokens.delete(token);
  if (!record || record.expiresAt < Date.now()) return undefined;
  return { clientId: record.clientId };
}

function sweepRefreshTokens(): void {
  const now = Date.now();
  for (const [key, value] of refreshTokens) {
    if (value.expiresAt < now) refreshTokens.delete(key);
  }
}
