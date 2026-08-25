import type { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { env } from './env.js';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * This whole service IS the security boundary — there is no per-tool ACL beyond
 * this. Anyone holding MCP_BEARER_TOKEN gets everything this service can do,
 * scoped only by which external credentials (GitHub PAT, Supabase service role,
 * Render API key) this service itself holds. See DEPLOYMENT.md for the exact
 * resource boundary that implies.
 */
export function requireBearerAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token || !safeEqual(token, env.MCP_BEARER_TOKEN)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
