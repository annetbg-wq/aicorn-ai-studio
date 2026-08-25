import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../env.js';
import { verifyPkce } from './pkce.js';
import {
  consumeAuthorizationCode,
  consumeRefreshToken,
  createAuthorizationCode,
  getClient,
  issueAccessToken,
  issueRefreshToken,
  registerClient,
} from './store.js';

const SCOPE = 'mcp';

/**
 * Structured, safe-by-construction logging for the OAuth flow — the whole
 * point is making a live "why did this fail" diagnosable from Render's log
 * stream alone. NEVER pass token/code/verifier/secret values here, even
 * truncated; only identifiers and outcomes. `truncate` exists for the one
 * case (client_id) that's long, non-secret (RFC 7591 client_ids are opaque
 * but not sensitive — see signedToken.ts, they're just base64url; nothing
 * about them is a bearer credential on its own), and useful to correlate
 * across log lines without spamming a 200-char string into every line.
 */
function truncate(value: string | undefined, length = 16): string {
  if (!value) return '(none)';
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

function logOauthEvent(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), scope: 'oauth', event, ...fields }));
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Defense in depth against brute-forcing MCP_BEARER_TOKEN through the login
// form — the token itself is a long random secret, so this is a backstop,
// not the primary protection.
const loginAttempts = new Map<string, { count: number; windowStart: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1_000;
const LOGIN_MAX_ATTEMPTS = 10;

function loginRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.windowStart > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > LOGIN_MAX_ATTEMPTS;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function loginPage(params: {
  clientId: string; redirectUri: string; codeChallenge: string; codeChallengeMethod: string; state?: string; error?: string;
}): string {
  const hidden = (name: string, value: string) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>AIC-RG Studio Superadmin MCP</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0d0d1a;color:#d4d4d4;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
  form{background:#13131f;border:1px solid #1e1e30;border-radius:8px;padding:32px;width:320px}
  h1{font-size:16px;margin:0 0 4px}
  p{font-size:12px;color:#5a5a7a;margin:0 0 20px}
  input[type=password]{width:100%;box-sizing:border-box;padding:10px;border-radius:6px;border:1px solid #1e1e30;background:#0d0d1a;color:#d4d4d4;margin-bottom:12px}
  button{width:100%;padding:10px;border-radius:6px;border:none;background:#a78bfa;color:#0d0d1a;font-weight:600;cursor:pointer}
  .err{color:#ff453a;font-size:12px;margin-bottom:12px}
</style></head>
<body>
  <form method="POST" action="/authorize">
    <h1>AIC-RG Studio — Superadmin MCP</h1>
    <p>Authorize this application using the MCP bearer token.</p>
    ${params.error ? `<div class="err">${escapeHtml(params.error)}</div>` : ''}
    <input type="password" name="token" placeholder="MCP bearer token" autofocus required>
    ${hidden('client_id', params.clientId)}
    ${hidden('redirect_uri', params.redirectUri)}
    ${hidden('code_challenge', params.codeChallenge)}
    ${hidden('code_challenge_method', params.codeChallengeMethod)}
    ${hidden('state', params.state ?? '')}
    <button type="submit">Authorize</button>
  </form>
</body></html>`;
}

export function oauthRouter(): Router {
  const router = Router();

  // ── RFC 9728 — tells clients which authorization server protects /mcp ────
  router.get('/.well-known/oauth-protected-resource', (_req, res) => {
    res.json({
      resource: `${env.PUBLIC_BASE_URL}/mcp`,
      authorization_servers: [env.PUBLIC_BASE_URL],
    });
  });

  // ── RFC 8414 — this service's own authorization server metadata ──────────
  router.get('/.well-known/oauth-authorization-server', (_req, res) => {
    res.json({
      issuer: env.PUBLIC_BASE_URL,
      authorization_endpoint: `${env.PUBLIC_BASE_URL}/authorize`,
      token_endpoint: `${env.PUBLIC_BASE_URL}/token`,
      registration_endpoint: `${env.PUBLIC_BASE_URL}/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [SCOPE],
    });
  });

  // ── RFC 7591 — Dynamic Client Registration ────────────────────────────────
  router.post('/register', (req, res) => {
    const body = req.body as { redirect_uris?: unknown; client_name?: unknown };
    const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === 'string') : [];
    if (redirectUris.length === 0) {
      logOauthEvent('register', { outcome: 'rejected', reason: 'missing redirect_uris', bodyKeys: Object.keys(body ?? {}) });
      res.status(400).json({ error: 'invalid_client_metadata', error_description: 'redirect_uris is required' });
      return;
    }
    const clientName = typeof body.client_name === 'string' ? body.client_name : undefined;
    const client = registerClient(redirectUris, clientName);
    logOauthEvent('register', { outcome: 'ok', clientId: truncate(client.clientId), clientName, redirectUris });
    res.status(201).json({
      client_id: client.clientId,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    });
  });

  // ── Authorization endpoint: GET shows the login form, POST processes it ──
  router.get('/authorize', (req, res) => {
    const q = req.query;
    const clientId = String(q.client_id ?? '');
    const redirectUri = String(q.redirect_uri ?? '');
    const codeChallenge = String(q.code_challenge ?? '');
    const codeChallengeMethod = String(q.code_challenge_method ?? '');
    const state = typeof q.state === 'string' ? q.state : undefined;
    const responseType = String(q.response_type ?? '');

    const client = getClient(clientId);
    // Only ever redirect back to the client once BOTH the client and its
    // redirect_uri are confirmed registered — otherwise this becomes an
    // open redirect. Anything wrong before that gets a plain error page.
    if (!client || !client.redirectUris.includes(redirectUri)) {
      logOauthEvent('authorize_get', { outcome: 'rejected', reason: !client ? 'client not resolved' : 'redirect_uri not registered for this client', clientId: truncate(clientId), redirectUri });
      res.status(400).send('Unknown client or redirect_uri. Register the client via /register first.');
      return;
    }
    if (responseType !== 'code' || codeChallengeMethod !== 'S256' || !codeChallenge) {
      logOauthEvent('authorize_get', { outcome: 'rejected', reason: 'unsupported response_type/code_challenge_method', clientId: truncate(clientId), responseType, codeChallengeMethod });
      res.status(400).send('This server only supports response_type=code with code_challenge_method=S256 (PKCE).');
      return;
    }

    logOauthEvent('authorize_get', { outcome: 'ok', clientId: truncate(clientId), redirectUri });
    res.type('html').send(loginPage({ clientId, redirectUri, codeChallenge, codeChallengeMethod, state }));
  });

  router.post('/authorize', (req, res) => {
    const body = req.body as Record<string, string>;
    const { client_id: clientId, redirect_uri: redirectUri, code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod, token, state } = body;

    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';

    const client = getClient(clientId);
    if (!client || !client.redirectUris.includes(redirectUri)) {
      logOauthEvent('authorize_post', { outcome: 'rejected', reason: !client ? 'client not resolved' : 'redirect_uri not registered for this client', clientId: truncate(clientId), redirectUri, ip });
      res.status(400).send('Unknown client or redirect_uri.');
      return;
    }

    if (loginRateLimited(ip)) {
      logOauthEvent('authorize_post', { outcome: 'rate_limited', clientId: truncate(clientId), ip });
      res.status(429).type('html').send(loginPage({ clientId, redirectUri, codeChallenge, codeChallengeMethod, state, error: 'Too many attempts. Try again later.' }));
      return;
    }

    if (!token || !safeEqual(token, env.MCP_BEARER_TOKEN)) {
      logOauthEvent('authorize_post', { outcome: 'wrong_token', clientId: truncate(clientId), ip });
      res.status(401).type('html').send(loginPage({ clientId, redirectUri, codeChallenge, codeChallengeMethod, state, error: 'Incorrect token.' }));
      return;
    }

    const code = createAuthorizationCode({ clientId, redirectUri, codeChallenge });
    logOauthEvent('authorize_post', { outcome: 'ok', clientId: truncate(clientId), ip });
    const redirect = new URL(redirectUri);
    redirect.searchParams.set('code', code);
    if (state) redirect.searchParams.set('state', state);
    res.redirect(302, redirect.toString());
  });

  // ── Token endpoint ─────────────────────────────────────────────────────────
  router.post('/token', (req, res) => {
    const body = req.body as Record<string, string>;
    const grantType = body.grant_type;

    if (grantType === 'authorization_code') {
      const { code, redirect_uri: redirectUri, client_id: clientId, code_verifier: codeVerifier } = body;
      const record = code ? consumeAuthorizationCode(code) : undefined;
      if (
        !record ||
        record.clientId !== clientId ||
        record.redirectUri !== redirectUri ||
        !codeVerifier ||
        !verifyPkce(codeVerifier, record.codeChallenge)
      ) {
        logOauthEvent('token', {
          grantType, outcome: 'invalid_grant', clientId: truncate(clientId),
          reason: !record ? 'code not resolved (unknown/expired/already used)'
            : record.clientId !== clientId ? 'client_id mismatch'
              : record.redirectUri !== redirectUri ? 'redirect_uri mismatch'
                : !codeVerifier ? 'missing code_verifier' : 'PKCE verification failed',
        });
        res.status(400).json({ error: 'invalid_grant', error_description: 'The authorization code is invalid, expired, already used, or the PKCE verifier does not match.' });
        return;
      }
      const { accessToken, expiresIn } = issueAccessToken(clientId);
      const refreshToken = issueRefreshToken(clientId);
      logOauthEvent('token', { grantType, outcome: 'ok', clientId: truncate(clientId) });
      res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: expiresIn, refresh_token: refreshToken, scope: SCOPE });
      return;
    }

    if (grantType === 'refresh_token') {
      const { refresh_token: refreshToken, client_id: clientId } = body;
      const record = refreshToken ? consumeRefreshToken(refreshToken) : undefined;
      if (!record || (clientId && record.clientId !== clientId)) {
        logOauthEvent('token', { grantType, outcome: 'invalid_grant', clientId: truncate(clientId), reason: !record ? 'refresh token not resolved' : 'client_id mismatch' });
        res.status(400).json({ error: 'invalid_grant', error_description: 'The refresh token is invalid, expired, or already used.' });
        return;
      }
      const { accessToken, expiresIn } = issueAccessToken(record.clientId);
      const newRefreshToken = issueRefreshToken(record.clientId);
      logOauthEvent('token', { grantType, outcome: 'ok', clientId: truncate(record.clientId) });
      res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: expiresIn, refresh_token: newRefreshToken, scope: SCOPE });
      return;
    }

    logOauthEvent('token', { outcome: 'unsupported_grant_type', grantType: grantType ?? '(none)' });
    res.status(400).json({ error: 'unsupported_grant_type', error_description: 'Only authorization_code and refresh_token are supported.' });
  });

  return router;
}
