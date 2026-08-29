// @vitest-environment node
import { createHash, randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.MCP_BEARER_TOKEN = 'test-static-bearer-token';
process.env.GITHUB_TOKEN = 'x';
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
process.env.SUPABASE_DB_URL = 'postgres://x';
process.env.RENDER_API_KEY = 'x';
process.env.PORT = '0';

const { createApp } = await import('../app.js');

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('failed to bind test server');
  baseUrl = `http://127.0.0.1:${address.port}`;
  process.env.PUBLIC_BASE_URL = baseUrl;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function pkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function registerTestClient(redirectUri: string) {
  const res = await fetch(`${baseUrl}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_uris: [redirectUri], client_name: 'Test Client' }),
  });
  expect(res.status).toBe(201);
  return res.json() as Promise<{ client_id: string }>;
}

async function callMcpInitialize(token?: string) {
  return fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    }),
  });
}

describe('/health diagnostics', () => {
  it('exposes the resolved public base URL and its source — the fastest way to confirm what is actually deployed', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; publicBaseUrl: string; publicBaseUrlSource: string };
    expect(body.status).toBe('ok');
    expect(body.publicBaseUrl).toBe(baseUrl);
    expect(body.publicBaseUrlSource).toBe('PUBLIC_BASE_URL'); // set explicitly in beforeAll for this test server
  });
});

describe('OAuth discovery metadata', () => {
  it('exposes RFC 9728 protected resource metadata', async () => {
    const res = await fetch(`${baseUrl}/.well-known/oauth-protected-resource`);
    expect(res.status).toBe(200);
    const body = await res.json() as { resource: string; authorization_servers: string[] };
    expect(body.resource).toBe(`${baseUrl}/mcp`);
    expect(body.authorization_servers).toContain(baseUrl);
  });

  it('exposes RFC 8414 authorization server metadata', async () => {
    const res = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      issuer: string; authorization_endpoint: string; token_endpoint: string; registration_endpoint: string;
      code_challenge_methods_supported: string[]; grant_types_supported: string[];
    };
    expect(body.issuer).toBe(baseUrl);
    expect(body.authorization_endpoint).toBe(`${baseUrl}/authorize`);
    expect(body.token_endpoint).toBe(`${baseUrl}/token`);
    expect(body.registration_endpoint).toBe(`${baseUrl}/register`);
    expect(body.code_challenge_methods_supported).toEqual(['S256']);
    expect(body.grant_types_supported).toEqual(expect.arrayContaining(['authorization_code', 'refresh_token']));
  });
});

describe('Railway public URL propagation', () => {
  it('uses the Railway origin in /health, OAuth discovery, and the /mcp auth challenge', async () => {
    const savedPublicBaseUrl = process.env.PUBLIC_BASE_URL;
    const savedRailwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
    const savedRenderUrl = process.env.RENDER_EXTERNAL_URL;
    const railwayOrigin = 'https://aicorn-ai-studio-mcp-production.up.railway.app';

    delete process.env.PUBLIC_BASE_URL;
    process.env.RAILWAY_PUBLIC_DOMAIN = 'aicorn-ai-studio-mcp-production.up.railway.app';
    // A copied/stale Render variable must not win on a Railway deployment.
    process.env.RENDER_EXTERNAL_URL = 'https://aicorn-ai-studio-mcp.onrender.com';

    try {
      const healthRes = await fetch(`${baseUrl}/health`);
      const health = await healthRes.json() as { publicBaseUrl: string; publicBaseUrlSource: string };
      expect(health.publicBaseUrl).toBe(railwayOrigin);
      expect(health.publicBaseUrlSource).toBe('RAILWAY_PUBLIC_DOMAIN');

      const protectedResourceRes = await fetch(`${baseUrl}/.well-known/oauth-protected-resource`);
      const protectedResource = await protectedResourceRes.json() as { resource: string; authorization_servers: string[] };
      expect(protectedResource.resource).toBe(`${railwayOrigin}/mcp`);
      expect(protectedResource.authorization_servers).toEqual([railwayOrigin]);

      const authorizationServerRes = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`);
      const authorizationServer = await authorizationServerRes.json() as {
        issuer: string; authorization_endpoint: string; token_endpoint: string; registration_endpoint: string;
      };
      expect(authorizationServer.issuer).toBe(railwayOrigin);
      expect(authorizationServer.authorization_endpoint).toBe(`${railwayOrigin}/authorize`);
      expect(authorizationServer.token_endpoint).toBe(`${railwayOrigin}/token`);
      expect(authorizationServer.registration_endpoint).toBe(`${railwayOrigin}/register`);

      const unauthorizedMcpRes = await callMcpInitialize();
      expect(unauthorizedMcpRes.status).toBe(401);
      expect(unauthorizedMcpRes.headers.get('www-authenticate')).toBe(
        `Bearer resource_metadata="${railwayOrigin}/.well-known/oauth-protected-resource"`,
      );
    } finally {
      if (savedPublicBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL;
      else process.env.PUBLIC_BASE_URL = savedPublicBaseUrl;
      if (savedRailwayDomain === undefined) delete process.env.RAILWAY_PUBLIC_DOMAIN;
      else process.env.RAILWAY_PUBLIC_DOMAIN = savedRailwayDomain;
      if (savedRenderUrl === undefined) delete process.env.RENDER_EXTERNAL_URL;
      else process.env.RENDER_EXTERNAL_URL = savedRenderUrl;
    }
  });
});

describe('Dynamic client registration', () => {
  it('registers a public client and returns a client_id', async () => {
    const client = await registerTestClient('https://chatgpt.com/connector_platform_oauth_redirect');
    expect(client.client_id).toBeTruthy();
  });

  it('rejects registration with no redirect_uris', async () => {
    const res = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe('Authorization + token endpoints', () => {
  const redirectUri = 'https://chatgpt.com/connector_platform_oauth_redirect';

  it('rejects /authorize for an unregistered client (no open redirect)', async () => {
    const res = await fetch(`${baseUrl}/authorize?response_type=code&client_id=nope&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=x&code_challenge_method=S256`);
    expect(res.status).toBe(400);
  });

  it('rejects /authorize missing PKCE', async () => {
    const client = await registerTestClient(redirectUri);
    const res = await fetch(`${baseUrl}/authorize?response_type=code&client_id=${client.client_id}&redirect_uri=${encodeURIComponent(redirectUri)}`);
    expect(res.status).toBe(400);
  });

  it('shows a login form for a valid /authorize request', async () => {
    const client = await registerTestClient(redirectUri);
    const { challenge } = pkcePair();
    const res = await fetch(`${baseUrl}/authorize?response_type=code&client_id=${client.client_id}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${challenge}&code_challenge_method=S256&state=xyz`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<form');
    expect(html).toContain('name="token"');
  });

  it('rejects the wrong bearer token at the login form', async () => {
    const client = await registerTestClient(redirectUri);
    const { challenge } = pkcePair();
    const res = await fetch(`${baseUrl}/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: client.client_id, redirect_uri: redirectUri,
        code_challenge: challenge, code_challenge_method: 'S256', token: 'wrong-token',
      }),
    });
    expect(res.status).toBe(401);
  });

  it('full flow: authorize -> code -> token -> call /mcp with the access token', async () => {
    const client = await registerTestClient(redirectUri);
    const { verifier, challenge } = pkcePair();

    const authRes = await fetch(`${baseUrl}/authorize`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: client.client_id, redirect_uri: redirectUri,
        code_challenge: challenge, code_challenge_method: 'S256',
        token: 'test-static-bearer-token', state: 'my-state',
      }),
    });
    expect(authRes.status).toBe(302);
    const location = new URL(authRes.headers.get('location')!);
    expect(location.origin + location.pathname).toBe(redirectUri);
    expect(location.searchParams.get('state')).toBe('my-state');
    const code = location.searchParams.get('code');
    expect(code).toBeTruthy();

    // Wrong PKCE verifier against the real code — must fail, and burns the code either way.
    const badVerifierRes = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code: code!, redirect_uri: redirectUri,
        client_id: client.client_id, code_verifier: 'totally-wrong-verifier',
      }),
    });
    expect(badVerifierRes.status).toBe(400);

    // The code is single-use — even with the correct verifier now, it's already burned.
    const reuseRes = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code: code!, redirect_uri: redirectUri,
        client_id: client.client_id, code_verifier: verifier,
      }),
    });
    expect(reuseRes.status).toBe(400);

    // Get a fresh code and redeem it correctly this time.
    const authRes2 = await fetch(`${baseUrl}/authorize`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: client.client_id, redirect_uri: redirectUri,
        code_challenge: challenge, code_challenge_method: 'S256',
        token: 'test-static-bearer-token',
      }),
    });
    const code2 = new URL(authRes2.headers.get('location')!).searchParams.get('code')!;

    const tokenRes = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code: code2, redirect_uri: redirectUri,
        client_id: client.client_id, code_verifier: verifier,
      }),
    });
    expect(tokenRes.status).toBe(200);
    const tokens = await tokenRes.json() as { access_token: string; refresh_token: string; token_type: string; expires_in: number };
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.refresh_token).toBeTruthy();

    // The whole point: this OAuth access token now authorizes real MCP calls.
    const mcpRes = await callMcpInitialize(tokens.access_token);
    expect(mcpRes.status).toBe(200);
    const mcpBody = await mcpRes.text();
    expect(mcpBody).toContain('protocolVersion');

    // Refresh flow: old refresh token rotates out.
    const refreshRes = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id }),
    });
    expect(refreshRes.status).toBe(200);
    const refreshed = await refreshRes.json() as { access_token: string };
    const mcpRes2 = await callMcpInitialize(refreshed.access_token);
    expect(mcpRes2.status).toBe(200);

    const staleRefreshRes = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: client.client_id }),
    });
    expect(staleRefreshRes.status).toBe(400);
  });
});

describe('/mcp auth — dual path + fallback preserved', () => {
  it('401s with no credential, and points at protected-resource metadata', async () => {
    const res = await callMcpInitialize();
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('oauth-protected-resource');
  });

  it('401s with a garbage token', async () => {
    const res = await callMcpInitialize('garbage-token-value');
    expect(res.status).toBe(401);
  });

  it('still accepts the static MCP_BEARER_TOKEN — the required fallback', async () => {
    const res = await callMcpInitialize('test-static-bearer-token');
    expect(res.status).toBe(200);
  });
});
