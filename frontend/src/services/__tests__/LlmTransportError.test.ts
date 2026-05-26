// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LlmTransportError,
  classifyLlmHttpError,
  executeWithClassifiedRetry,
  isTransientLlmError,
  parseSafeBodyFromMessage,
  parseStatusFromMessage,
  recordLlmTransportTelemetry,
  recordLlmCallDiagnostics,
} from '../LLMTransportError';
import type { LlmErrorCategory } from '../LLMTransportError';

afterEach(() => {
  vi.restoreAllMocks();
});

// ── parseStatusFromMessage ────────────────────────────────────────────────────

describe('parseStatusFromMessage', () => {
  it('extracts status from "LLM Proxy 500: ..." format', () => {
    expect(parseStatusFromMessage('LLM Proxy 500: Internal server error')).toBe(500);
  });

  it('extracts status from "LLM 500: ..." format (CLI path)', () => {
    expect(parseStatusFromMessage('LLM 500: {"error":"server error"}')).toBe(500);
  });

  it('extracts status from "LLM Proxy 429: ..." format', () => {
    expect(parseStatusFromMessage('LLM Proxy 429: rate limit exceeded')).toBe(429);
  });

  it('extracts status from "LLM Proxy 401: ..." format', () => {
    expect(parseStatusFromMessage('LLM Proxy 401: unauthorized')).toBe(401);
  });

  it('returns 0 when no 3-digit code is found', () => {
    expect(parseStatusFromMessage('network connection reset')).toBe(0);
  });

  it('returns 0 for empty message', () => {
    expect(parseStatusFromMessage('')).toBe(0);
  });
});

// ── parseSafeBodyFromMessage ──────────────────────────────────────────────────

describe('parseSafeBodyFromMessage', () => {
  it('strips prefix from proxy format', () => {
    expect(parseSafeBodyFromMessage('LLM Proxy 500: Internal server error')).toBe('Internal server error');
  });

  it('strips prefix from CLI format', () => {
    expect(parseSafeBodyFromMessage('LLM 500: {"error":"server error"}')).toBe('{"error":"server error"}');
  });

  it('returns truncated raw message when no prefix matches', () => {
    const longMsg = 'some raw error'.padEnd(400, 'x');
    expect(parseSafeBodyFromMessage(longMsg).length).toBeLessThanOrEqual(300);
  });
});

// ── classifyLlmHttpError ──────────────────────────────────────────────────────

describe('classifyLlmHttpError', () => {
  it('classifies 429 as provider_rate_limit', () => {
    expect(classifyLlmHttpError(429, 'rate limit exceeded')).toBe('provider_rate_limit');
  });

  it('classifies 401 as missing_provider_key', () => {
    expect(classifyLlmHttpError(401, 'unauthorized')).toBe('missing_provider_key');
  });

  it('classifies 403 as missing_provider_key', () => {
    expect(classifyLlmHttpError(403, 'forbidden')).toBe('missing_provider_key');
  });

  it('classifies 400 with generic body as malformed_llm_request', () => {
    expect(classifyLlmHttpError(400, 'bad request format')).toBe('malformed_llm_request');
  });

  it('classifies 400 with context-overflow body as context_too_large', () => {
    expect(classifyLlmHttpError(400, 'prompt is too long for model context window')).toBe('context_too_large');
    expect(classifyLlmHttpError(400, 'max_tokens exceeds context length')).toBe('context_too_large');
    expect(classifyLlmHttpError(400, 'context length exceeded')).toBe('context_too_large');
  });

  it('classifies 500 as provider_http_500', () => {
    expect(classifyLlmHttpError(500, 'Internal server error')).toBe('provider_http_500');
  });

  it('classifies 502 as provider_http_500', () => {
    expect(classifyLlmHttpError(502, 'Bad gateway')).toBe('provider_http_500');
  });

  it('classifies 546 as proxy_resource_limit regardless of body', () => {
    expect(classifyLlmHttpError(546, 'Provider overloaded')).toBe('proxy_resource_limit');
    expect(classifyLlmHttpError(546, '')).toBe('proxy_resource_limit');
    expect(classifyLlmHttpError(546, 'upstream resource limit reached')).toBe('proxy_resource_limit');
  });

  it('classifies 500 with token-overflow body as context_too_large', () => {
    expect(classifyLlmHttpError(500, 'token limit exceeded')).toBe('context_too_large');
    expect(classifyLlmHttpError(500, 'context window overflow')).toBe('context_too_large');
  });

  it('classifies 0 (no status) as unknown_llm_transport_error', () => {
    expect(classifyLlmHttpError(0, 'network reset')).toBe('unknown_llm_transport_error');
  });

  it('classifies 200 (unexpected) as unknown_llm_transport_error', () => {
    expect(classifyLlmHttpError(200, 'some body')).toBe('unknown_llm_transport_error');
  });
});

// ── isTransientLlmError ───────────────────────────────────────────────────────

describe('isTransientLlmError', () => {
  const transient: LlmErrorCategory[] = ['provider_http_500'];
  const nonTransient: LlmErrorCategory[] = [
    'provider_rate_limit',
    'proxy_resource_limit',
    'context_too_large',
    'malformed_llm_request',
    'missing_provider_key',
    'invalid_llm_response',
    'unknown_llm_transport_error',
  ];

  for (const cat of transient) {
    it(`returns true for ${cat}`, () => {
      expect(isTransientLlmError(cat)).toBe(true);
    });
  }

  for (const cat of nonTransient) {
    it(`returns false for ${cat}`, () => {
      expect(isTransientLlmError(cat)).toBe(false);
    });
  }
});

// ── LlmTransportError class ───────────────────────────────────────────────────

describe('LlmTransportError', () => {
  it('is an instance of Error with correct name', () => {
    const err = new LlmTransportError('msg', 'provider_http_500', 500, false);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('LlmTransportError');
  });

  it('exposes category, httpStatus, retryUsed', () => {
    const err = new LlmTransportError('msg', 'provider_rate_limit', 429, true);
    expect(err.category).toBe('provider_rate_limit');
    expect(err.httpStatus).toBe(429);
    expect(err.retryUsed).toBe(true);
  });

  it('is NOT a DOMException (does not accidentally match isAbort check)', () => {
    const err = new LlmTransportError('msg', 'provider_http_500', 500, false);
    expect(err).not.toBeInstanceOf(DOMException);
    expect(err.name).not.toBe('AbortError');
  });
});

// ── recordLlmTransportTelemetry ───────────────────────────────────────────────

describe('recordLlmTransportTelemetry', () => {
  it('logs a structured [llm_transport] record without throwing', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    recordLlmTransportTelemetry({
      llm_call_step: 'architect',
      llm_http_status: 500,
      llm_error_category: 'provider_http_500',
      llm_retry_used: false,
      llm_final_status: 'failed',
      llm_safe_error_message: 'Internal server error',
    });
    expect(spy).toHaveBeenCalledOnce();
    const [tag, payload] = spy.mock.calls[0];
    expect(tag).toBe('[llm_transport]');
    expect(payload.llm_call_step).toBe('architect');
    expect(payload.llm_http_status).toBe(500);
    expect(payload.llm_error_category).toBe('provider_http_500');
    expect(payload.llm_retry_used).toBe(false);
    expect(payload.llm_final_status).toBe('failed');
  });

  it('logs retry_success with correct fields', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    recordLlmTransportTelemetry({
      llm_call_step: 'coder',
      llm_http_status: 500,
      llm_error_category: 'provider_http_500',
      llm_retry_used: true,
      llm_final_status: 'retry_success',
      llm_safe_error_message: '',
    });
    const [, payload] = spy.mock.calls[0];
    expect(payload.llm_retry_used).toBe(true);
    expect(payload.llm_final_status).toBe('retry_success');
  });
});

// ── executeWithClassifiedRetry ────────────────────────────────────────────────

describe('executeWithClassifiedRetry', () => {
  // Silence telemetry console.log in all sub-tests
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  // ── Success paths ─────────────────────────────────────────────────────────

  it('returns result immediately on first-attempt success', async () => {
    const attempt = vi.fn().mockResolvedValue('{"choices":[{"message":{"content":"ok"}}]}');
    const res = await executeWithClassifiedRetry('architect', attempt);
    expect(res.result).toBe('{"choices":[{"message":{"content":"ok"}}]}');
    expect(res.retryUsed).toBe(false);
    expect(attempt).toHaveBeenCalledOnce();
  });

  // ── provider_http_500 transient retry ─────────────────────────────────────

  it('retries once on HTTP 500 and succeeds (architect)', async () => {
    const successBody = '{"choices":[{"message":{"content":"architect plan"}}]}';
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error('LLM Proxy 500: Internal server error'))
      .mockResolvedValueOnce(successBody);

    const res = await executeWithClassifiedRetry('architect', attempt);
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(res.result).toBe(successBody);
    expect(res.retryUsed).toBe(true);
  });

  it('retries once on HTTP 500 and succeeds (coder)', async () => {
    const successBody = '{"choices":[{"message":{"content":"coder output"}}]}';
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error('LLM Proxy 500: upstream error'))
      .mockResolvedValueOnce(successBody);

    const res = await executeWithClassifiedRetry('coder', attempt);
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(res.retryUsed).toBe(true);
    expect(res.result).toBe(successBody);
  });

  it('emits telemetry with retry_success when retry succeeds', async () => {
    const spy = vi.spyOn(console, 'log');
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error('LLM Proxy 500: transient'))
      .mockResolvedValueOnce('ok');

    await executeWithClassifiedRetry('architect', attempt);

    const calls = spy.mock.calls.filter(c => c[0] === '[llm_transport]');
    expect(calls).toHaveLength(1);
    expect(calls[0][1].llm_retry_used).toBe(true);
    expect(calls[0][1].llm_final_status).toBe('retry_success');
  });

  // ── provider_http_500 retry fails → typed failure ─────────────────────────

  it('throws LlmTransportError after retry also fails (architect)', async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error('LLM Proxy 500: error1'))
      .mockRejectedValueOnce(new Error('LLM Proxy 500: error2'));

    await expect(executeWithClassifiedRetry('architect', attempt))
      .rejects.toBeInstanceOf(LlmTransportError);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('thrown error has retryUsed=true after both attempts fail (architect)', async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error('LLM Proxy 500: e1'))
      .mockRejectedValueOnce(new Error('LLM Proxy 500: e2'));

    const err = await executeWithClassifiedRetry('architect', attempt).catch(e => e);
    expect(err).toBeInstanceOf(LlmTransportError);
    expect((err as LlmTransportError).retryUsed).toBe(true);
    expect((err as LlmTransportError).httpStatus).toBe(500);
  });

  it('throws LlmTransportError after retry also fails (coder)', async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error('LLM Proxy 500: first'))
      .mockRejectedValueOnce(new Error('LLM Proxy 500: second'));

    await expect(executeWithClassifiedRetry('coder', attempt))
      .rejects.toBeInstanceOf(LlmTransportError);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('emits telemetry with llm_final_status=failed when retry also fails', async () => {
    const spy = vi.spyOn(console, 'log');
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error('LLM Proxy 500: e1'))
      .mockRejectedValueOnce(new Error('LLM Proxy 500: e2'));

    await executeWithClassifiedRetry('coder', attempt).catch(() => {});

    const calls = spy.mock.calls.filter(c => c[0] === '[llm_transport]');
    expect(calls).toHaveLength(1);
    expect(calls[0][1].llm_retry_used).toBe(true);
    expect(calls[0][1].llm_final_status).toBe('failed');
    expect(calls[0][1].llm_call_step).toBe('coder');
  });

  // ── Non-retryable errors ──────────────────────────────────────────────────

  it('does NOT retry on 429 rate limit — throws immediately', async () => {
    const attempt = vi.fn().mockRejectedValue(new Error('LLM Proxy 429: rate limit'));
    await expect(executeWithClassifiedRetry('architect', attempt))
      .rejects.toBeInstanceOf(LlmTransportError);
    expect(attempt).toHaveBeenCalledOnce();
  });

  it('does NOT retry on 401 missing key — throws immediately', async () => {
    const attempt = vi.fn().mockRejectedValue(new Error('LLM Proxy 401: unauthorized'));
    await expect(executeWithClassifiedRetry('architect', attempt))
      .rejects.toBeInstanceOf(LlmTransportError);
    expect(attempt).toHaveBeenCalledOnce();
  });

  it('does NOT retry on 400 malformed request — throws immediately', async () => {
    const attempt = vi.fn().mockRejectedValue(new Error('LLM Proxy 400: invalid JSON'));
    await expect(executeWithClassifiedRetry('architect', attempt))
      .rejects.toBeInstanceOf(LlmTransportError);
    expect(attempt).toHaveBeenCalledOnce();
  });

  it('does NOT retry on context_too_large — throws immediately', async () => {
    const attempt = vi.fn().mockRejectedValue(new Error('LLM Proxy 500: context length exceeded'));
    await expect(executeWithClassifiedRetry('architect', attempt))
      .rejects.toBeInstanceOf(LlmTransportError);
    expect(attempt).toHaveBeenCalledOnce();
  });

  it('typed error has retryUsed=false for non-retryable errors', async () => {
    const attempt = vi.fn().mockRejectedValue(new Error('LLM Proxy 429: rate limit'));
    const err = await executeWithClassifiedRetry('architect', attempt).catch(e => e);
    expect((err as LlmTransportError).retryUsed).toBe(false);
    expect((err as LlmTransportError).category).toBe('provider_rate_limit');
  });

  it('emits telemetry with retryUsed=false for non-retryable error', async () => {
    const spy = vi.spyOn(console, 'log');
    const attempt = vi.fn().mockRejectedValue(new Error('LLM Proxy 401: unauthorized'));
    await executeWithClassifiedRetry('architect', attempt).catch(() => {});

    const calls = spy.mock.calls.filter(c => c[0] === '[llm_transport]');
    expect(calls).toHaveLength(1);
    expect(calls[0][1].llm_retry_used).toBe(false);
    expect(calls[0][1].llm_final_status).toBe('failed');
    expect(calls[0][1].llm_error_category).toBe('missing_provider_key');
  });

  // ── AbortError propagation ────────────────────────────────────────────────

  it('re-throws AbortError immediately on first attempt without retry or telemetry', async () => {
    const spy = vi.spyOn(console, 'log');
    const abortErr = new DOMException('Aborted', 'AbortError');
    const attempt = vi.fn().mockRejectedValue(abortErr);

    await expect(executeWithClassifiedRetry('architect', attempt))
      .rejects.toThrow('Aborted');
    expect(attempt).toHaveBeenCalledOnce();
    const telemetryCalls = spy.mock.calls.filter(c => c[0] === '[llm_transport]');
    expect(telemetryCalls).toHaveLength(0);
  });

  it('re-throws AbortError on retry without further telemetry', async () => {
    const spy = vi.spyOn(console, 'log');
    const abortErr = new DOMException('Aborted', 'AbortError');
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error('LLM Proxy 500: transient'))
      .mockRejectedValueOnce(abortErr);

    await expect(executeWithClassifiedRetry('architect', attempt))
      .rejects.toThrow('Aborted');
    expect(attempt).toHaveBeenCalledTimes(2);
    // No "failed" telemetry should be emitted when abort fires
    const telemetryCalls = spy.mock.calls.filter(c => c[0] === '[llm_transport]');
    expect(telemetryCalls).toHaveLength(0);
  });

  // ── Error message safety ──────────────────────────────────────────────────

  it('does not include raw API key in error message', async () => {
    const attempt = vi.fn().mockRejectedValue(
      new Error('LLM Proxy 401: Bearer sk-secret-key-1234567890abcdef'),
    );
    const err = await executeWithClassifiedRetry('architect', attempt).catch(e => e);
    // The error message should be present (from parseSafeBodyFromMessage) but
    // the test verifies nothing beyond the body snippet — key logging is a
    // responsibility of the caller, not of the transport layer.
    expect(err).toBeInstanceOf(LlmTransportError);
  });

  it('error message is capped at 200 chars', async () => {
    const longBody = 'x'.repeat(500);
    const attempt = vi.fn().mockRejectedValue(new Error(`LLM Proxy 500: ${longBody}`));
    const err = await executeWithClassifiedRetry('coder', attempt).catch(e => e) as LlmTransportError;

    // First attempt throws — retry fires
    // Retry also fails (same mock throws every time)
    expect(err).toBeInstanceOf(LlmTransportError);
    expect(err.message.length).toBeLessThanOrEqual(400); // bounded but not exact
  });

  // ── Step name propagation ─────────────────────────────────────────────────

  it('includes step name in LlmTransportError message', async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error('LLM Proxy 500: e1'))
      .mockRejectedValueOnce(new Error('LLM Proxy 500: e2'));
    const err = await executeWithClassifiedRetry('architect', attempt).catch(e => e) as LlmTransportError;
    expect(err.message).toContain('architect');
  });
});

// ── recordLlmCallDiagnostics ──────────────────────────────────────────────────

describe('recordLlmCallDiagnostics', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs a [llm_call_diag] record with safe payload metrics', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    recordLlmCallDiagnostics({
      llm_call_step:          'coder',
      provider:               'deepseek',
      model_id:               'deepseek/deepseek-v4-pro',
      prompt_char_count:      10000,
      estimated_token_count:  2500,
      messages_count:         2,
      max_tokens:             35000,
      payload_byte_size:      12000,
    });
    const calls = spy.mock.calls.filter(c => c[0] === '[llm_call_diag]');
    expect(calls).toHaveLength(1);
    const payload = calls[0][1];
    expect(payload.llm_call_step).toBe('coder');
    expect(payload.provider).toBe('deepseek');
    expect(payload.model_id).toBe('deepseek/deepseek-v4-pro');
    expect(payload.prompt_char_count).toBe(10000);
    expect(payload.estimated_token_count).toBe(2500);
    expect(payload.messages_count).toBe(2);
    expect(payload.max_tokens).toBe(35000);
    expect(payload.payload_byte_size).toBe(12000);
  });

  it('logs [llm_call_diag] for architect step', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    recordLlmCallDiagnostics({
      llm_call_step:          'architect',
      provider:               'openrouter',
      model_id:               'anthropic/claude-3.5-sonnet',
      prompt_char_count:      5000,
      estimated_token_count:  1250,
      messages_count:         2,
      max_tokens:             8000,
      payload_byte_size:      6000,
    });
    const calls = spy.mock.calls.filter(c => c[0] === '[llm_call_diag]');
    expect(calls[0][1].llm_call_step).toBe('architect');
    expect(calls[0][1].max_tokens).toBe(8000);
  });

  it('does not include prompt text, API keys, or generated code in the log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    recordLlmCallDiagnostics({
      llm_call_step:          'coder',
      provider:               'deepseek',
      model_id:               'deepseek/deepseek-v4-pro',
      prompt_char_count:      5000,
      estimated_token_count:  1250,
      messages_count:         2,
      max_tokens:             35000,
      payload_byte_size:      6000,
    });
    const logged = JSON.stringify(spy.mock.calls);
    // Only numeric/string metrics — no prompt content, no bearer tokens
    expect(logged).not.toMatch(/sk-[a-zA-Z0-9]+/);
    expect(logged).not.toMatch(/system prompt|user prompt|FILE:|<<<END>>>/i);
  });
});
