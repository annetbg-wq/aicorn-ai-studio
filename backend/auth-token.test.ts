import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildQualityLlmPrompt,
  DEFAULT_CLAUDE_MODEL,
  hasValidDevToken,
  isLoopbackRequest,
  isProductionRuntime,
  requireLocalDevOrDevToken,
  resolveClaudeModel,
  runClaudePrompt,
} from './auth-token';

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
