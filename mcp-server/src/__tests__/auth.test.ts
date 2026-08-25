import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.MCP_BEARER_TOKEN = 'correct-token-value';
process.env.GITHUB_TOKEN = 'x';
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
process.env.SUPABASE_DB_URL = 'postgres://x';
process.env.RENDER_API_KEY = 'x';

const { requireAuth } = await import('../auth.js');

function mockRes() {
  const res: {
    statusCode?: number;
    body?: unknown;
    headers: Record<string, string>;
    status: (n: number) => typeof res;
    json: (b: unknown) => typeof res;
    setHeader: (name: string, value: string) => typeof res;
  } = {
    headers: {},
    status(n: number) { res.statusCode = n; return res; },
    json(b: unknown) { res.body = b; return res; },
    setHeader(name: string, value: string) { res.headers[name] = value; return res; },
  };
  return res;
}

describe('requireAuth', () => {
  let next: ReturnType<typeof vi.fn>;
  beforeEach(() => { next = vi.fn(); });

  it('rejects a missing Authorization header, pointing at protected-resource metadata', () => {
    const req = { headers: {} } as never;
    const res = mockRes();
    requireAuth(req, res as never, next as never);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.headers['WWW-Authenticate']).toContain('oauth-protected-resource');
  });

  it('rejects the wrong token', () => {
    const req = { headers: { authorization: 'Bearer wrong-token' } } as never;
    const res = mockRes();
    requireAuth(req, res as never, next as never);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rejects a non-Bearer scheme', () => {
    const req = { headers: { authorization: 'Basic correct-token-value' } } as never;
    const res = mockRes();
    requireAuth(req, res as never, next as never);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('accepts the correct token', () => {
    const req = { headers: { authorization: 'Bearer correct-token-value' } } as never;
    const res = mockRes();
    requireAuth(req, res as never, next as never);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeUndefined();
  });
});
