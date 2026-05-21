// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeminiService } from '../GeminiService';
import { runIdeaModelPrompt } from '../ideaFeedService';

describe('runIdeaModelPrompt bridge fallback', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('superadmin_dev_agent_provider', 'codex');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('falls back to standard model flow when dev-agent bridge returns 500', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ provider: 'codex' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response('bridge crash', { status: 500 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const geminiSpy = vi.spyOn(GeminiService, 'generate').mockResolvedValue('[{"id":"idea-1"}]');

    try {
      const result = await runIdeaModelPrompt('package this idea', 'fake-google-token');

      expect(result).toBe('[{"id":"idea-1"}]');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(String(fetchMock.mock.calls[1]?.[0] ?? '')).toContain('/chat');
      expect(geminiSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Falling back to standard model flow'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws a clear combined error when bridge and standard fallback are both unavailable', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ provider: 'codex' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response('bridge crash', { status: 500 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(GeminiService, 'generate').mockRejectedValue(
      new Error('No AI service available. Sign in with Google or add an API key in Settings.'),
    );

    try {
      await expect(runIdeaModelPrompt('package this idea', 'fake-google-token')).rejects.toThrow(
        /Dev-agent bridge unavailable .* Standard idea-model fallback failed/i,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
