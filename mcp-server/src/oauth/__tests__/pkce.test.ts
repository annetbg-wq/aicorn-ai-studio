import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyPkce } from '../pkce.js';

function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

describe('verifyPkce', () => {
  it('accepts a correct S256 verifier/challenge pair', () => {
    const verifier = 'a'.repeat(64);
    expect(verifyPkce(verifier, challengeFor(verifier))).toBe(true);
  });

  it('rejects a wrong verifier', () => {
    const challenge = challengeFor('correct-verifier');
    expect(verifyPkce('wrong-verifier', challenge)).toBe(false);
  });

  it('rejects an empty verifier or challenge', () => {
    expect(verifyPkce('', challengeFor('x'))).toBe(false);
    expect(verifyPkce('x', '')).toBe(false);
  });

  it('rejects a challenge of different length without throwing', () => {
    expect(verifyPkce('verifier', 'short')).toBe(false);
  });
});
