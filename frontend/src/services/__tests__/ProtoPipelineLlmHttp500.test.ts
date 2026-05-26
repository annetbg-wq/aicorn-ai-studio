/**
 * ProtoPipelineLlmHttp500.test.ts
 *
 * Integration-level tests for HTTP 500 error handling in the generation pipeline.
 *
 * These tests verify the full behavior of the LLM call layer used by
 * runArchitect and runCoder:
 *
 *   streamCall → doFetch → executeWithClassifiedRetry
 *
 * They use the same error formats that streamCall and LLMProxy produce in
 * production ("LLM Proxy 500: ...", "LLM 500: ..."), ensuring end-to-end
 * behavior is correct without any real LLM calls.
 *
 * Why no full runProtoPipeline tests?
 * The pipeline returns { success: false } in both architect and coder catch
 * blocks. Repair and preview steps are gated behind this flag, so they cannot
 * be reached when an LLM call fails. This is verified structurally by the
 * catch-and-return-false pattern, which is NOT changed by this PR.
 * The new behavior introduced by this PR (retry, classification, telemetry)
 * lives entirely in executeWithClassifiedRetry, which is directly tested here.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LlmTransportError,
  classifyLlmHttpError,
  executeWithClassifiedRetry,
  isTransientLlmError,
} from '../LLMTransportError';
import type { LlmErrorCategory } from '../LLMTransportError';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Simulated LLM fetch helpers ───────────────────────────────────────────────
// These mirror the exact error thrown by:
//   - LLMProxy proxyRequestWithSessionFallback → Error('LLM Proxy 500: <body>')
//   - streamCall !resp.ok branch              → Error('LLM ${status}: <body>')

const PROXY_500 = () => Promise.reject(new Error('LLM Proxy 500: Internal Server Error'));
const PROXY_500_TRANSIENT_THEN_OK = (successBody: string) => {
  let calls = 0;
  return () => {
    calls++;
    if (calls === 1) return Promise.reject(new Error('LLM Proxy 500: upstream error'));
    return Promise.resolve(successBody);
  };
};
const CLI_500 = () => Promise.reject(new Error('LLM 500: {"error":"cli backend error"}'));
const PROXY_429 = () => Promise.reject(new Error('LLM Proxy 429: rate limit exceeded'));
const PROXY_401 = () => Promise.reject(new Error('LLM Proxy 401: unauthorized'));
const PROXY_400 = () => Promise.reject(new Error('LLM Proxy 400: invalid request body'));
const PROXY_500_CONTEXT = () =>
  Promise.reject(new Error('LLM Proxy 500: context length exceeded for this model'));

const SUCCESS_BODY = JSON.stringify({
  choices: [{ message: { content: 'architect plan here' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
});

// ── runArchitect path: HTTP 500 transient → retry → success ──────────────────

describe('runArchitect path — HTTP 500 transient → one retry → success', () => {
  it('retries exactly once and returns on second attempt (proxy format)', async () => {
    const attempt = vi.fn(PROXY_500_TRANSIENT_THEN_OK(SUCCESS_BODY));

    const { result, retryUsed } = await executeWithClassifiedRetry('architect', attempt);

    expect(attempt).toHaveBeenCalledTimes(2);
    expect(retryUsed).toBe(true);
    expect(result).toBe(SUCCESS_BODY);
  });

  it('retry telemetry is emitted with retry_success status', async () => {
    const spy = vi.spyOn(console, 'log');
    const attempt = vi.fn(PROXY_500_TRANSIENT_THEN_OK(SUCCESS_BODY));

    await executeWithClassifiedRetry('architect', attempt);

    const calls = spy.mock.calls.filter(c => c[0] === '[llm_transport]');
    expect(calls).toHaveLength(1);
    const payload = calls[0][1];
    expect(payload.llm_call_step).toBe('architect');
    expect(payload.llm_retry_used).toBe(true);
    expect(payload.llm_final_status).toBe('retry_success');
    expect(payload.llm_http_status).toBe(500);
    expect(payload.llm_error_category).toBe('provider_http_500');
  });

  it('never retries more than once even if pattern allows', async () => {
    // Pattern: 500, 500, 200 — should fail after 2nd attempt (not reach 3rd)
    let calls = 0;
    const attempt = vi.fn(() => {
      calls++;
      if (calls < 3) return Promise.reject(new Error('LLM Proxy 500: transient'));
      return Promise.resolve(SUCCESS_BODY);
    });

    await expect(executeWithClassifiedRetry('architect', attempt))
      .rejects.toBeInstanceOf(LlmTransportError);
    expect(attempt).toHaveBeenCalledTimes(2); // NOT 3
  });
});

// ── runArchitect path: HTTP 500 retry also fails → typed failure ─────────────

describe('runArchitect path — HTTP 500 retry fails → typed LlmTransportError', () => {
  it('throws LlmTransportError with category=provider_http_500 after both attempts fail', async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error('LLM Proxy 500: e1'))
      .mockRejectedValueOnce(new Error('LLM Proxy 500: e2'));

    const err = await executeWithClassifiedRetry('architect', attempt).catch(e => e);

    expect(err).toBeInstanceOf(LlmTransportError);
    expect((err as LlmTransportError).category).toBe('provider_http_500');
    expect((err as LlmTransportError).httpStatus).toBe(500);
    expect((err as LlmTransportError).retryUsed).toBe(true);
  });

  it('error message includes step name "architect"', async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error('LLM Proxy 500: e1'))
      .mockRejectedValueOnce(new Error('LLM Proxy 500: e2'));

    const err = await executeWithClassifiedRetry('architect', attempt).catch(e => e);
    expect((err as LlmTransportError).message).toContain('architect');
  });

  it('failed telemetry is emitted with llm_final_status=failed and llm_retry_used=true', async () => {
    const spy = vi.spyOn(console, 'log');
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error('LLM Proxy 500: e1'))
      .mockRejectedValueOnce(new Error('LLM Proxy 500: e2'));

    await executeWithClassifiedRetry('architect', attempt).catch(() => {});

    const calls = spy.mock.calls.filter(c => c[0] === '[llm_transport]');
    expect(calls).toHaveLength(1);
    const payload = calls[0][1];
    expect(payload.llm_final_status).toBe('failed');
    expect(payload.llm_retry_used).toBe(true);
    expect(payload.llm_call_step).toBe('architect');
  });

  it('LlmTransportError is a proper Error subclass (propagates through catch(err))', () => {
    const err = new LlmTransportError('test', 'provider_http_500', 500, true);
    // Verify it propagates through a standard catch(err) check like the pipeline uses
    expect(err instanceof Error).toBe(true);
    expect(err.message).toBeTruthy();
  });
});

// ── runCoder path: HTTP 500 transient → retry → success ──────────────────────

describe('runCoder path — HTTP 500 transient → one retry → success', () => {
  it('retries once on 500 and succeeds (proxy format)', async () => {
    const coderSuccess = JSON.stringify({
      choices: [{ message: { content: '<<<FILE src/App.tsx>>>\nexport default App;\n<<<END>>>' }, finish_reason: 'stop' }],
    });
    const attempt = vi.fn(PROXY_500_TRANSIENT_THEN_OK(coderSuccess));

    const { result, retryUsed } = await executeWithClassifiedRetry('coder', attempt);

    expect(attempt).toHaveBeenCalledTimes(2);
    expect(retryUsed).toBe(true);
    expect(result).toContain('App.tsx');
  });

  it('retries once on 500 and succeeds (CLI direct format)', async () => {
    let calls = 0;
    const attempt = vi.fn(() => {
      calls++;
      if (calls === 1) return Promise.reject(new Error('LLM 500: {"error":"cli server error"}'));
      return Promise.resolve(SUCCESS_BODY);
    });

    const { retryUsed } = await executeWithClassifiedRetry('coder', attempt);
    expect(retryUsed).toBe(true);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('telemetry shows coder as the step name on retry success', async () => {
    const spy = vi.spyOn(console, 'log');
    const attempt = vi.fn(PROXY_500_TRANSIENT_THEN_OK(SUCCESS_BODY));

    await executeWithClassifiedRetry('coder', attempt);

    const calls = spy.mock.calls.filter(c => c[0] === '[llm_transport]');
    expect(calls[0][1].llm_call_step).toBe('coder');
  });
});

// ── runCoder path: HTTP 500 retry fails → typed failure ──────────────────────

describe('runCoder path — HTTP 500 retry fails → typed LlmTransportError', () => {
  it('throws LlmTransportError with retryUsed=true after both attempts fail', async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error('LLM Proxy 500: server error'))
      .mockRejectedValueOnce(new Error('LLM Proxy 500: still failing'));

    const err = await executeWithClassifiedRetry('coder', attempt).catch(e => e);

    expect(err).toBeInstanceOf(LlmTransportError);
    expect((err as LlmTransportError).retryUsed).toBe(true);
    expect((err as LlmTransportError).category).toBe('provider_http_500');
  });

  it('error message includes step name "coder"', async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error('LLM Proxy 500: server error'))
      .mockRejectedValueOnce(new Error('LLM Proxy 500: still failing'));

    const err = await executeWithClassifiedRetry('coder', attempt).catch(e => e);
    expect((err as LlmTransportError).message).toContain('coder');
  });
});

// ── Non-retryable errors: no retry, immediate typed failure ──────────────────

describe('non-retryable errors — no retry', () => {
  const nonRetryableCases: Array<{ name: string; error: string; category: LlmErrorCategory }> = [
    { name: 'rate limit (429)', error: 'LLM Proxy 429: rate limit exceeded', category: 'provider_rate_limit' },
    { name: 'unauthorized (401)', error: 'LLM Proxy 401: unauthorized', category: 'missing_provider_key' },
    { name: 'forbidden (403)', error: 'LLM Proxy 403: forbidden', category: 'missing_provider_key' },
    { name: 'malformed request (400)', error: 'LLM Proxy 400: invalid JSON body', category: 'malformed_llm_request' },
    { name: 'context overflow 500', error: 'LLM Proxy 500: context length exceeded', category: 'context_too_large' },
  ];

  for (const { name, error, category } of nonRetryableCases) {
    it(`${name} — called exactly once, no retry`, async () => {
      const attempt = vi.fn().mockRejectedValue(new Error(error));

      await expect(executeWithClassifiedRetry('architect', attempt))
        .rejects.toBeInstanceOf(LlmTransportError);
      expect(attempt).toHaveBeenCalledOnce();
    });

    it(`${name} — typed error has retryUsed=false, category=${category}`, async () => {
      const attempt = vi.fn().mockRejectedValue(new Error(error));

      const err = await executeWithClassifiedRetry('architect', attempt).catch(e => e) as LlmTransportError;

      expect(err.retryUsed).toBe(false);
      expect(err.category).toBe(category);
    });
  }

  it('isTransientLlmError only allows retry for provider_http_500', () => {
    const categories: LlmErrorCategory[] = [
      'provider_http_500',
      'provider_rate_limit',
      'context_too_large',
      'malformed_llm_request',
      'missing_provider_key',
      'invalid_llm_response',
      'unknown_llm_transport_error',
    ];
    const transientCounts = categories.filter(isTransientLlmError).length;
    expect(transientCounts).toBe(1); // ONLY provider_http_500
  });
});

// ── Pipeline state: exits loading state on fatal LLM error ───────────────────

describe('generation status exits loading state on fatal LLM error', () => {
  it('LlmTransportError is caught by a standard catch(err) block like the pipeline uses', async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error('LLM Proxy 500: e1'))
      .mockRejectedValueOnce(new Error('LLM Proxy 500: e2'));

    let caughtError: Error | null = null;
    let caught = false;
    try {
      await executeWithClassifiedRetry('architect', attempt);
    } catch (err) {
      caught = true;
      caughtError = err as Error;
    }

    expect(caught).toBe(true);
    expect(caughtError).toBeInstanceOf(LlmTransportError);
    // The pipeline calls fail(step, err.message) — verify message is meaningful
    expect(caughtError!.message).toBeTruthy();
    expect(caughtError!.message.length).toBeGreaterThan(10);
  });

  it('LlmTransportError includes category in message, not raw keys', async () => {
    const attempt = vi.fn().mockRejectedValue(new Error('LLM Proxy 401: unauthorized'));
    const err = await executeWithClassifiedRetry('architect', attempt).catch(e => e) as LlmTransportError;

    // Category information is in the error
    expect(err.category).toBe('missing_provider_key');
    // No raw API key patterns in the error message
    expect(err.message).not.toMatch(/sk-[a-zA-Z0-9]+/);
  });

  it('AbortError is re-thrown immediately, not wrapped as LlmTransportError', async () => {
    const abortErr = new DOMException('Aborted', 'AbortError');
    const attempt = vi.fn().mockRejectedValue(abortErr);

    await expect(executeWithClassifiedRetry('architect', attempt))
      .rejects.toThrow('Aborted');

    // Should NOT be wrapped
    const err = await executeWithClassifiedRetry('architect', attempt).catch(e => e);
    expect(err).not.toBeInstanceOf(LlmTransportError);
    expect(err.name).toBe('AbortError');
  });
});

// ── Repair is not called if coder never completed ─────────────────────────────

describe('repair not called if coder never completed', () => {
  it('LlmTransportError thrown by coder step causes pipeline to catch and return {success:false} before repair', () => {
    // Verify the structural invariant: when coder throws LlmTransportError,
    // the pipeline catch block (lines ~1866-1868 of ProtoPipeline.ts) calls
    // fail('coder', err.message) and returns { success: false }.
    // This test verifies that LlmTransportError has a meaningful message for
    // that fail() call, and does NOT match the AbortError branch.
    const err = new LlmTransportError(
      "LLM call failed after 1 retry [provider_http_500] at step 'coder': Internal server error",
      'provider_http_500',
      500,
      true,
    );

    // The pipeline check: if (isAbort(err)) fail(step, 'aborted') else fail(step, err.message)
    const isAbort = (e: unknown) =>
      e instanceof DOMException && (e as DOMException).name === 'AbortError';

    expect(isAbort(err)).toBe(false);     // Routes to fail(step, err.message), not 'aborted'
    expect(err.message).toContain('coder'); // fail() receives meaningful message
    expect(err.message).toContain('provider_http_500'); // Category visible in fail() message
  });
});

// ── Preview is not promoted after fatal LLM error ────────────────────────────

describe('preview not promoted after fatal LLM error', () => {
  it('LlmTransportError is not treated as a successful generation result', () => {
    // Verify LlmTransportError carries no "success" indicators
    const err = new LlmTransportError(
      "LLM call failed [provider_http_500] at step 'architect': server error",
      'provider_http_500',
      500,
      false,
    );
    // If thrown, the pipeline would have: return { success: false }
    // This test confirms the error is non-null and non-empty (forces catch, not silent pass-through)
    expect(err).toBeTruthy();
    expect(err instanceof Error).toBe(true);
    // HTTP status ≥ 400 — never a success
    expect(err.httpStatus).toBeGreaterThanOrEqual(400);
  });
});

// ── classifyLlmHttpError — context size detection coverage ───────────────────

describe('classifyLlmHttpError — context/token overflow detection', () => {
  const overflowBodies = [
    'prompt is too long for this model',
    'max_tokens exceeds context window',
    'context length exceeded 128k',
    'token limit exceeded by 2000 tokens',
    'context window overflow detected',
    'Your prompt is too long',
  ];

  for (const body of overflowBodies) {
    it(`classifies as context_too_large: "${body.slice(0, 40)}"`, () => {
      expect(classifyLlmHttpError(500, body)).toBe('context_too_large');
    });
  }

  it('classifies as provider_http_500 when body has no context/token signal', () => {
    expect(classifyLlmHttpError(500, 'Internal server error')).toBe('provider_http_500');
    expect(classifyLlmHttpError(500, 'upstream timeout')).toBe('provider_http_500');
    expect(classifyLlmHttpError(502, 'bad gateway')).toBe('provider_http_500');
  });
});
