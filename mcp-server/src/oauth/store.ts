import { randomBytes } from 'node:crypto';

/**
 * In-memory OAuth state — registered clients, authorization codes, access and
 * refresh tokens. Deliberately not persisted: this is a single free-tier Render
 * instance for one admin's own tools, and losing sessions on a redeploy/restart
 * just means ChatGPT re-runs the OAuth flow once. See mcp-server/README.md.
 */

export interface RegisteredClient {
  clientId: string;
  redirectUris: string[];
  clientName?: string;
  createdAt: number;
}

interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  expiresAt: number;
  used: boolean;
}

interface IssuedToken {
  token: string;
  clientId: string;
  expiresAt: number;
}

const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1_000; // 1 hour — "short-lived" per the issue
const AUTH_CODE_TTL_MS = 60 * 1_000; // 60 seconds, single-use
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1_000; // 30 days, rotated on every use

const clients = new Map<string, RegisteredClient>();
const authCodes = new Map<string, AuthorizationCode>();
const accessTokens = new Map<string, IssuedToken>();
const refreshTokens = new Map<string, IssuedToken>();

function newId(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

function sweep<T extends { expiresAt: number }>(map: Map<string, T>): void {
  const now = Date.now();
  for (const [key, value] of map) {
    if (value.expiresAt < now) map.delete(key);
  }
}

// ── Dynamic client registration (RFC 7591) ─────────────────────────────────

export function registerClient(redirectUris: string[], clientName?: string): RegisteredClient {
  const client: RegisteredClient = { clientId: newId(16), redirectUris, clientName, createdAt: Date.now() };
  clients.set(client.clientId, client);
  return client;
}

export function getClient(clientId: string): RegisteredClient | undefined {
  return clients.get(clientId);
}

// ── Authorization codes ─────────────────────────────────────────────────────

export function createAuthorizationCode(params: { clientId: string; redirectUri: string; codeChallenge: string }): string {
  sweep(authCodes);
  const code = newId();
  authCodes.set(code, {
    code,
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    expiresAt: Date.now() + AUTH_CODE_TTL_MS,
    used: false,
  });
  return code;
}

/** Single-use: returns the code record once, marks it used, returns undefined on any replay/expiry. */
export function consumeAuthorizationCode(code: string): Omit<AuthorizationCode, 'used'> | undefined {
  const record = authCodes.get(code);
  if (!record || record.used || record.expiresAt < Date.now()) return undefined;
  record.used = true;
  return record;
}

// ── Access / refresh tokens ─────────────────────────────────────────────────

export function issueAccessToken(clientId: string): { accessToken: string; expiresIn: number } {
  sweep(accessTokens);
  const token = newId();
  accessTokens.set(token, { token, clientId, expiresAt: Date.now() + ACCESS_TOKEN_TTL_MS });
  return { accessToken: token, expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000) };
}

export function isValidAccessToken(token: string): boolean {
  const record = accessTokens.get(token);
  return !!record && record.expiresAt >= Date.now();
}

export function issueRefreshToken(clientId: string): string {
  sweep(refreshTokens);
  const token = newId();
  refreshTokens.set(token, { token, clientId, expiresAt: Date.now() + REFRESH_TOKEN_TTL_MS });
  return token;
}

/** Rotates the refresh token: the old one is invalidated whether or not this call succeeds. */
export function consumeRefreshToken(token: string): { clientId: string } | undefined {
  const record = refreshTokens.get(token);
  refreshTokens.delete(token);
  if (!record || record.expiresAt < Date.now()) return undefined;
  return { clientId: record.clientId };
}
