import { EventEmitter } from 'events';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { PassThrough } from 'stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyCorsHeaders,
  buildQualityLlmPrompt,
  DEFAULT_CLAUDE_MODEL,
  hasValidDevToken,
  isLoopbackRequest,
  isOriginAllowed,
  isProductionRuntime,
  parseAllowedOrigins,
  requireLocalDevOrDevToken,
  resolveClaudeModel,
  runClaudePrompt,
  startServer,
} from './auth-token';

let activeServer: Server | null = null;

async function startTestServer(): Promise<{ baseUrl: string }> {
  const server = startServer(0);
  activeServer = server;
  if (!server.listening) {
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  }
  const address = server.address() as AddressInfo | null;
  if (!address || typeof address.port !== 'number') {
    throw new Error('Failed to resolve test server port');
  }
  return { baseUrl: `http://127.0.0.1:${address.port}` };
}

afterEach(async () => {
  if (!activeServer) return;
  await new Promise<void>((resolve) => activeServer!.close(() => resolve()));
  activeServer = null;
});

describe('auth-token Claude runner', () => {
  it('formats quality prompt with system and user sections', () => {
    expect(buildQualityLlmPrompt('system rules', 'user ask')).toBe(
      '[System]\nsystem rules\n\n[User]\nuser ask',
    );
  });

  it('uses expected default model', () => {
    expect(DEFAULT_CLAUDE_MODEL).toBe('claude-sonnet-4-6');
    expect(resolveClaudeModel(undefined)).toBe('claude-sonnet-4-6');
    expect(resolveClaudeModel('claude-opus-4-6')).toBe('claude-opus-4-6');
  });

  it('spawns claude with model args and closes stdin', async () => {
    const child = new EventEmitter() as any;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = { write: vi.fn(), end: vi.fn() };

    const spawnSpy = vi.fn().mockReturnValue(child);

    const p = runClaudePrompt('hello', 'claude-sonnet-4-6', spawnSpy as any);

    child.stdout.write('ok');
    child.emit('close', 0);

    await expect(p).resolves.toBe('ok');

    expect(spawnSpy).toHaveBeenCalledTimes(1);
    expect(spawnSpy.mock.calls[0][0]).toMatch(/claude(\.cmd)?$/);
    expect(spawnSpy.mock.calls[0][1]).toEqual([
      '--output-format', 'text',
      '--model', 'claude-sonnet-4-6',
    ]);
    expect(child.stdin.write).toHaveBeenCalledWith('hello');
    expect(child.stdin.end).toHaveBeenCalledTimes(1);
  });

  it('rejects when claude exits non-zero', async () => {
    const child = new EventEmitter() as any;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = { write: vi.fn(), end: vi.fn() };

    const spawnSpy = vi.fn().mockReturnValue(child);

    const p = runClaudePrompt('hello', 'claude-sonnet-4-6', spawnSpy as any);

    child.stderr.write('boom');
    child.emit('close', 1);

    await expect(p).rejects.toThrow('claude exited with code 1');
  });
});

describe('auth-token dangerous endpoint guard', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalServerMode = process.env.AIC_SERVER_MODE;
  const originalDevToken = process.env.AIC_DEV_TOKEN;

  const setRuntime = (opts: {
    nodeEnv?: string;
    serverMode?: string;
    devToken?: string;
  }): void => {
    if (opts.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = opts.nodeEnv;

    if (opts.serverMode === undefined) delete process.env.AIC_SERVER_MODE;
    else process.env.AIC_SERVER_MODE = opts.serverMode;

    if (opts.devToken === undefined) delete process.env.AIC_DEV_TOKEN;
    else process.env.AIC_DEV_TOKEN = opts.devToken;
  };

  const createReq = (opts?: {
    remoteAddress?: string;
    tokenHeader?: string;
    queryToken?: string;
  }) => {
    const remoteAddress = opts?.remoteAddress ?? '203.0.113.10';
    const headers: Record<string, string> = {};
    if (opts?.tokenHeader !== undefined) headers['x-aic-dev-token'] = opts.tokenHeader;

    return {
      socket: { remoteAddress },
      ip: remoteAddress,
      headers,
      query: opts?.queryToken ? { 'X-AIC-Dev-Token': opts.queryToken } : {},
      get(name: string): string | undefined {
        return headers[name.toLowerCase()];
      },
    };
  };

  const createRes = () => {
    const res: any = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
  };

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;

    if (originalServerMode === undefined) delete process.env.AIC_SERVER_MODE;
    else process.env.AIC_SERVER_MODE = originalServerMode;

    if (originalDevToken === undefined) delete process.env.AIC_DEV_TOKEN;
    else process.env.AIC_DEV_TOKEN = originalDevToken;
  });

  it('remote request without token is denied', () => {
    setRuntime({ nodeEnv: 'development', devToken: 'secret' });
    const req = createReq();
    const res = createRes();
    const next = vi.fn();

    requireLocalDevOrDevToken(req as any, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('remote request with wrong token is denied', () => {
    setRuntime({ nodeEnv: 'development', devToken: 'secret' });
    const req = createReq({ tokenHeader: 'wrong' });
    const res = createRes();
    const next = vi.fn();

    requireLocalDevOrDevToken(req as any, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('remote request with correct token is allowed', () => {
    setRuntime({ nodeEnv: 'development', devToken: 'secret' });
    const req = createReq({ tokenHeader: 'secret' });
    const res = createRes();
    const next = vi.fn();

    requireLocalDevOrDevToken(req as any, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('loopback request in local dev without token is allowed', () => {
    setRuntime({ nodeEnv: 'development', devToken: 'secret' });
    const req = createReq({ remoteAddress: '127.0.0.1' });
    const res = createRes();
    const next = vi.fn();

    requireLocalDevOrDevToken(req as any, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('loopback request in production without token is denied', () => {
    setRuntime({ nodeEnv: 'production', devToken: 'secret' });
    const req = createReq({ remoteAddress: '127.0.0.1' });
    const res = createRes();
    const next = vi.fn();

    requireLocalDevOrDevToken(req as any, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('loopback request in production with correct token is allowed', () => {
    setRuntime({ nodeEnv: 'production', devToken: 'secret' });
    const req = createReq({ remoteAddress: '127.0.0.1', tokenHeader: 'secret' });
    const res = createRes();
    const next = vi.fn();

    requireLocalDevOrDevToken(req as any, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('token in query string does not count', () => {
    setRuntime({ nodeEnv: 'development', devToken: 'secret' });
    const req = createReq({ queryToken: 'secret' });
    const res = createRes();
    const next = vi.fn();

    requireLocalDevOrDevToken(req as any, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(hasValidDevToken(req as any)).toBe(false);
  });

  it('exports production and loopback helper behavior', () => {
    setRuntime({ nodeEnv: 'production', serverMode: undefined, devToken: 'secret' });
    expect(isProductionRuntime()).toBe(true);
    expect(isLoopbackRequest(createReq({ remoteAddress: '::1' }) as any)).toBe(true);
    expect(isLoopbackRequest(createReq({ remoteAddress: '198.51.100.5' }) as any)).toBe(false);
  });
});

describe('CORS helpers', () => {
  it('parseAllowedOrigins parses comma-separated env value and trims spaces', () => {
    const result = parseAllowedOrigins('http://example.com , http://test.com');
    expect(result).toEqual(['http://example.com', 'http://test.com']);
  });

  it('default allowed origins include localhost and 127.0.0.1', () => {
    const defaults = parseAllowedOrigins(undefined);
    expect(defaults).toContain('http://127.0.0.1:5183');
    expect(defaults).toContain('http://localhost:5183');
    expect(defaults).toContain('http://127.0.0.1:3100');
    expect(defaults).toContain('http://localhost:3100');
  });

  it('allowed origin returns true', () => {
    const origins = parseAllowedOrigins(undefined);
    expect(isOriginAllowed('http://localhost:5183', origins)).toBe(true);
  });

  it('unknown origin returns false', () => {
    const origins = parseAllowedOrigins(undefined);
    expect(isOriginAllowed('http://evil.com', origins)).toBe(false);
  });

  it('missing origin returns true', () => {
    const origins = parseAllowedOrigins(undefined);
    expect(isOriginAllowed(undefined, origins)).toBe(true);
  });

  function makeCorsReq(origin?: string) {
    return { headers: { origin }, method: 'GET' } as any;
  }

  function makeCorsRes() {
    const headers: Record<string, string> = {};
    const res: any = { _headers: headers };
    res.setHeader = vi.fn((name: string, value: string) => { headers[name.toLowerCase()] = value; });
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    res.sendStatus = vi.fn().mockReturnValue(res);
    return res;
  }

  it('CORS never returns wildcard "*"', () => {
    const req = makeCorsReq('http://localhost:5183');
    const res = makeCorsRes();
    applyCorsHeaders(req, res);
    const aco = res._headers['access-control-allow-origin'];
    expect(aco).not.toBe('*');
    expect(aco).toBe('http://localhost:5183');
  });

  it('preflight from allowed origin gets exact Access-Control-Allow-Origin', async () => {
    const { baseUrl } = await startTestServer();
    const response = await fetch(`${baseUrl}/health`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5183' },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5183');
  });

  it('preflight from unknown origin gets 403', async () => {
    const { baseUrl } = await startTestServer();
    const response = await fetch(`${baseUrl}/health`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://evil.com' },
    });
    expect(response.status).toBe(403);
  });

  it('allowed headers include X-AIC-Dev-Token and X-Preview-Session', () => {
    const req = makeCorsReq('http://localhost:5183');
    const res = makeCorsRes();
    applyCorsHeaders(req, res);
    const allowedHeaders = res._headers['access-control-allow-headers'] ?? '';
    expect(allowedHeaders).toContain('X-AIC-Dev-Token');
    expect(allowedHeaders).toContain('X-Preview-Session');
  });
});

describe('auth-token provider key routes', () => {
  it('returns 410 and never exposes key payload on /provider-key/:provider', async () => {
    const originalOpenAIKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-live-backend-secret';

    try {
      const { baseUrl } = await startTestServer();
      const response = await fetch(`${baseUrl}/provider-key/openai`);
      const body = await response.json() as Record<string, unknown>;

      expect(response.status).toBe(410);
      expect(body).toEqual({ error: 'Provider key retrieval is disabled' });
      expect(Object.prototype.hasOwnProperty.call(body, 'key')).toBe(false);
      expect(JSON.stringify(body)).not.toContain('sk-live-backend-secret');
    } finally {
      if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalOpenAIKey;
    }
  });

  it('keeps /provider-keys response as flags only', async () => {
    const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
    const originalOpenAIKey = process.env.OPENAI_API_KEY;
    const originalGoogleKey = process.env.GOOGLE_API_KEY;

    process.env.OPENROUTER_API_KEY = 'or-secret';
    process.env.OPENAI_API_KEY = '';
    process.env.GOOGLE_API_KEY = 'google-secret';

    try {
      const { baseUrl } = await startTestServer();
      const response = await fetch(`${baseUrl}/provider-keys`);
      const body = await response.json() as Record<string, unknown>;

      expect(response.ok).toBe(true);
      expect(body.openrouter).toBe(true);
      expect(body.openai).toBe(false);
      expect(body.google).toBe(true);
      expect(typeof body.openrouter).toBe('boolean');
      expect(typeof body.openai).toBe('boolean');
      expect(typeof body.google).toBe('boolean');
      expect(Object.prototype.hasOwnProperty.call(body, 'key')).toBe(false);
      expect(JSON.stringify(body)).not.toContain('or-secret');
      expect(JSON.stringify(body)).not.toContain('google-secret');
    } finally {
      if (originalOpenRouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = originalOpenRouterKey;

      if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalOpenAIKey;

      if (originalGoogleKey === undefined) delete process.env.GOOGLE_API_KEY;
      else process.env.GOOGLE_API_KEY = originalGoogleKey;
    }
  });
});
