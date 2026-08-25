// @vitest-environment node
//
// Regression test for the prod bug: ChatGPT's connector setup calls
// /register, then later /authorize, then /token, as separate requests —
// and on Render's free tier, an idle spin-down/restart between any of those
// steps used to wipe the in-memory Maps store.ts kept client/code/token
// state in, so a client_id that resolved fine one request earlier would
// 404 ("failed to resolve OAuth client") the next. Client/code/access-token
// resolution is now a pure function of the token itself (HMAC-signed with a
// key derived from MCP_BEARER_TOKEN, an env var that survives restarts by
// definition) — this simulates a restart via vi.resetModules() + a fresh
// dynamic import, so it would have caught the exact bug that shipped.
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.MCP_BEARER_TOKEN = 'test-static-bearer-token';

beforeEach(() => {
  vi.resetModules();
});

describe('OAuth state survives a simulated process restart', () => {
  it('a client registered before "restart" still resolves after it', async () => {
    const before = await import('../store.js');
    const client = before.registerClient(['https://chatgpt.com/connector_platform_oauth_redirect'], 'ChatGPT');

    vi.resetModules(); // fresh module instance — no shared memory with `before`, same as a new process
    const after = await import('../store.js');

    const resolved = after.getClient(client.clientId);
    expect(resolved).toBeDefined();
    expect(resolved?.redirectUris).toEqual(['https://chatgpt.com/connector_platform_oauth_redirect']);
    expect(resolved?.clientName).toBe('ChatGPT');
  });

  it('an authorization code created before "restart" still redeems after it', async () => {
    const before = await import('../store.js');
    const code = before.createAuthorizationCode({
      clientId: 'signed-client-id-stand-in',
      redirectUri: 'https://chatgpt.com/cb',
      codeChallenge: 'challenge-value',
    });

    vi.resetModules();
    const after = await import('../store.js');

    const consumed = after.consumeAuthorizationCode(code);
    expect(consumed).toEqual({
      clientId: 'signed-client-id-stand-in',
      redirectUri: 'https://chatgpt.com/cb',
      codeChallenge: 'challenge-value',
    });
  });

  it('an access token issued before "restart" still validates after it', async () => {
    const before = await import('../store.js');
    const { accessToken } = before.issueAccessToken('some-client-id');

    vi.resetModules();
    const after = await import('../store.js');

    expect(after.isValidAccessToken(accessToken)).toBe(true);
  });

  it('resolution still fails closed for a genuinely unknown/tampered client id', async () => {
    const store = await import('../store.js');
    expect(store.getClient('not-a-real-token')).toBeUndefined();
    expect(store.getClient('AAAA.BBBB')).toBeUndefined();
  });
});
