import { createHash, timingSafeEqual } from 'node:crypto';

/** RFC 7636 S256: BASE64URL(SHA256(code_verifier)) === code_challenge. */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  if (!codeVerifier || !codeChallenge) return false;
  const computed = createHash('sha256').update(codeVerifier).digest('base64url');
  const a = Buffer.from(computed);
  const b = Buffer.from(codeChallenge);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
