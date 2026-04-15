import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CLAUDE_MODEL,
  resolveClaudeModel,
  runClaudePrompt,
} from './auth-token';

describe('auth-token Claude runner', () => {
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
