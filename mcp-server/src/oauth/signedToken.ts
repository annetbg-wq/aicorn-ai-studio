import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../env.js';

/**
 * HMAC-signs a JSON payload into a self-contained, tamper-proof, stateless
 * token: base64url(payload) + '.' + base64url(HMAC-SHA256(payload)). Anyone
 * holding the signing key can verify and decode it without any shared
 * storage — that's the whole point (see store.ts for why).
 *
 * The key is derived from MCP_BEARER_TOKEN via a fixed context string, not
 * MCP_BEARER_TOKEN itself — same secret already required to run this
 * service, no new one to configure, but domain-separated so this signing
 * key isn't literally the bearer token. Rotating MCP_BEARER_TOKEN
 * invalidates every previously-issued client/code/access token along with
 * it, which is the correct behavior for a break-glass secret rotation.
 */
function signingKey(): Buffer {
  return createHmac('sha256', 'aic-rg-studio-mcp-oauth-v1').update(env.MCP_BEARER_TOKEN).digest();
}

export function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', signingKey()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verify<T>(token: string): T | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  const expected = createHmac('sha256', signingKey()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as T;
  } catch {
    return null;
  }
}
