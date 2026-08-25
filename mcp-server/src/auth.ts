import type { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { env } from './env.js';
import { isValidAccessToken } from './oauth/store.js';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * This whole service IS the security boundary — there is no per-tool ACL beyond
 * this. Anyone holding a valid credential (the static MCP_BEARER_TOKEN, or a
 * short-lived OAuth access token minted by this same service's /token endpoint,
 * which itself only ever gets handed out to someone who typed MCP_BEARER_TOKEN
 * into the /authorize login form) gets everything this service can do, scoped
 * only by which external credentials (GitHub PAT, Supabase service role,
 * Render API key) this service itself holds. See DEPLOYMENT.md for the exact
 * resource boundary that implies.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme === 'Bearer' && token && (safeEqual(token, env.MCP_BEARER_TOKEN) || isValidAccessToken(token))) {
    next();
    return;
  }

  // RFC 9728 / MCP auth spec: point unauthenticated callers at protected-resource
  // metadata so an OAuth-only client (ChatGPT) can discover how to authorize.
  res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${env.PUBLIC_BASE_URL}/.well-known/oauth-protected-resource"`);
  res.status(401).json({ error: 'Unauthorized' });
}
