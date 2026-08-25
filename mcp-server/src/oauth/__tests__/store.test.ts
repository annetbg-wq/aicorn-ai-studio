import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consumeAuthorizationCode,
  consumeRefreshToken,
  createAuthorizationCode,
  getClient,
  issueAccessToken,
  issueRefreshToken,
  isValidAccessToken,
  registerClient,
} from '../store.js';

describe('oauth store', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('registers a client and looks it up by id', () => {
    const client = registerClient(['https://chatgpt.com/callback'], 'ChatGPT');
    expect(getClient(client.clientId)).toEqual(client);
    expect(getClient('nonexistent')).toBeUndefined();
  });

  it('authorization codes are single-use', () => {
    const code = createAuthorizationCode({ clientId: 'c1', redirectUri: 'https://x/cb', codeChallenge: 'chal' });
    const first = consumeAuthorizationCode(code);
    expect(first?.clientId).toBe('c1');
    const second = consumeAuthorizationCode(code);
    expect(second).toBeUndefined();
  });

  it('authorization codes expire', () => {
    const code = createAuthorizationCode({ clientId: 'c1', redirectUri: 'https://x/cb', codeChallenge: 'chal' });
    vi.advanceTimersByTime(61_000);
    expect(consumeAuthorizationCode(code)).toBeUndefined();
  });

  it('unknown codes are rejected', () => {
    expect(consumeAuthorizationCode('never-issued')).toBeUndefined();
  });

  it('access tokens are valid until they expire', () => {
    const { accessToken, expiresIn } = issueAccessToken('c1');
    expect(expiresIn).toBeGreaterThan(0);
    expect(isValidAccessToken(accessToken)).toBe(true);
    vi.advanceTimersByTime((expiresIn + 1) * 1000);
    expect(isValidAccessToken(accessToken)).toBe(false);
  });

  it('unknown access tokens are invalid', () => {
    expect(isValidAccessToken('never-issued')).toBe(false);
  });

  it('refresh tokens rotate on use — the old one stops working', () => {
    const refreshToken = issueRefreshToken('c1');
    const first = consumeRefreshToken(refreshToken);
    expect(first?.clientId).toBe('c1');
    const second = consumeRefreshToken(refreshToken);
    expect(second).toBeUndefined();
  });
});
