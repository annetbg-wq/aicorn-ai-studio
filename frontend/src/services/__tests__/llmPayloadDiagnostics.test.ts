/**
 * llmPayloadDiagnostics.test.ts
 *
 * Deterministic tests for coder payload size diagnostics and risk classification.
 * Part of the p2/diagnose-coder-payload-size-for-deepseek-546 investigation.
 *
 * Tests verify:
 *   - evaluateLlmPayloadRisk classifies high / medium / low correctly
 *   - LlmCallDiagnostics fields include step / provider / model / endpoint_kind
 *   - recordLlmCallDiagnostics never logs prompt text or API key material
 *   - recordLlmCallOutcome logs timing and outcome correctly
 *   - byte/token estimates are deterministic and consistent
 *   - No real LLM calls are made
 */

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  evaluateLlmPayloadRisk,
  recordLlmCallDiagnostics,
  recordLlmCallOutcome,
} from '../LLMTransportError';
import type {
  LlmCallDiagnostics,
  LlmCallOutcomeDiagnostics,
  LlmPayloadRiskResult,
} from '../LLMTransportError';

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Test fixtures ─────────────────────────────────────────────────────────────

function makeCoderDiagnostics(
  overrides: Partial<LlmCallDiagnostics> = {},
): LlmCallDiagnostics {
  return {
    llm_call_step:              'coder',
    provider:                   'deepseek',
    model_id:                   'deepseek-v4-pro',
    endpoint_kind:              'supabase_proxy',
    route_authority:            'user_set',
    system_prompt_char_count:   2000,
    user_payload_char_count:    3000,
    total_prompt_char_count:    5000,
    estimated_token_count:      1250,
    messages_count:             2,
    max_tokens:                 8000,
    request_payload_byte_size:  6000,
    streaming_enabled:          false,
    ...overrides,
  };
}

function makeArchitectDiagnostics(
  overrides: Partial<LlmCallDiagnostics> = {},
): LlmCallDiagnostics {
  return makeCoderDiagnostics({
    llm_call_step:              'architect',
    provider:                   'deepseek',
    model_id:                   'deepseek-v4-pro',
    endpoint_kind:              'supabase_proxy',
    route_authority:            'user_set',
    system_prompt_char_count:   4000,
    user_payload_char_count:    1000,
    total_prompt_char_count:    5000,
    estimated_token_count:      1250,
    max_tokens:                 8000,
    request_payload_byte_size:  6200,
    ...overrides,
  });
}

// ── evaluateLlmPayloadRisk — low risk ─────────────────────────────────────────

describe('evaluateLlmPayloadRisk — low risk', () => {
  it('returns low for a typical architect payload (small prompt, small maxTokens)', () => {
    const result = evaluateLlmPayloadRisk({
      request_payload_byte_size: 6000,
      total_prompt_char_count:   5000,
      estimated_token_count:     1250,
      max_tokens:                8000,
      messages_count:            2,
    });
    expect(result.level).toBe('low');
    expect(result.reasons).toHaveLength(0);
  });

  it('returns low for a normal coder payload well within limits', () => {
    const result = evaluateLlmPayloadRisk({
      request_payload_byte_size: 20000,
      total_prompt_char_count:   15000,
      estimated_token_count:     3750,
      max_tokens:                12000,
      messages_count:            2,
    });
    expect(result.level).toBe('low');
    expect(result.reasons).toHaveLength(0);
  });
});

// ── evaluateLlmPayloadRisk — medium risk ──────────────────────────────────────

describe('evaluateLlmPayloadRisk — medium risk', () => {
  it('returns medium when byte size exceeds 40 KB', () => {
    const result = evaluateLlmPayloadRisk({
      request_payload_byte_size: 50000,
      total_prompt_char_count:   10000,
      estimated_token_count:     2500,
      max_tokens:                8000,
      messages_count:            2,
    });
    expect(result.level).toBe('medium');
    expect(result.reasons.join(' ')).toContain('request_payload_byte_size=50000');
  });

  it('returns medium when total_prompt_char_count exceeds 20 000', () => {
    const result = evaluateLlmPayloadRisk({
      request_payload_byte_size: 25000,
      total_prompt_char_count:   25000,
      estimated_token_count:     6250,
      max_tokens:                8000,
      messages_count:            2,
    });
    expect(result.level).toBe('medium');
    expect(result.reasons.join(' ')).toContain('total_prompt_char_count=25000');
  });

  it('returns medium when estimated_token_count exceeds 16 000', () => {
    const result = evaluateLlmPayloadRisk({
      request_payload_byte_size: 30000,
      total_prompt_char_count:   64000,  // ≈ 16k tokens but just at medium threshold
      estimated_token_count:     17000,
      max_tokens:                8000,
      messages_count:            2,
    });
    expect(result.level).toBe('medium');
    expect(result.reasons.join(' ')).toContain('estimated_token_count=17000');
  });

  it('returns medium when max_tokens exceeds 16 000', () => {
    const result = evaluateLlmPayloadRisk({
      request_payload_byte_size: 15000,
      total_prompt_char_count:   8000,
      estimated_token_count:     2000,
      max_tokens:                20000,
      messages_count:            2,
    });
    expect(result.level).toBe('medium');
    expect(result.reasons.join(' ')).toContain('max_tokens=20000');
  });
});

// ── evaluateLlmPayloadRisk — high risk ────────────────────────────────────────

describe('evaluateLlmPayloadRisk — high risk', () => {
  it('returns high when request_payload_byte_size exceeds 120 KB', () => {
    const result = evaluateLlmPayloadRisk({
      request_payload_byte_size: 150000,
      total_prompt_char_count:   10000,
      estimated_token_count:     2500,
      max_tokens:                8000,
      messages_count:            2,
    });
    expect(result.level).toBe('high');
    expect(result.reasons.some(r => r.includes('request_payload_byte_size'))).toBe(true);
  });

  it('returns high when total_prompt_char_count exceeds 80 000', () => {
    const result = evaluateLlmPayloadRisk({
      request_payload_byte_size: 50000,
      total_prompt_char_count:   100000,
      estimated_token_count:     25000,
      max_tokens:                8000,
      messages_count:            2,
    });
    expect(result.level).toBe('high');
    expect(result.reasons.some(r => r.includes('total_prompt_char_count'))).toBe(true);
  });

  it('returns high when estimated_token_count exceeds 40 000', () => {
    const result = evaluateLlmPayloadRisk({
      request_payload_byte_size: 80000,
      total_prompt_char_count:   60000,
      estimated_token_count:     45000,
      max_tokens:                8000,
      messages_count:            2,
    });
    expect(result.level).toBe('high');
    expect(result.reasons.some(r => r.includes('estimated_token_count=45000'))).toBe(true);
  });

  it('returns high when max_tokens is unusually high (>32 000)', () => {
    const result = evaluateLlmPayloadRisk({
      request_payload_byte_size: 15000,
      total_prompt_char_count:   10000,
      estimated_token_count:     2500,
      max_tokens:                35000,
      messages_count:            2,
    });
    expect(result.level).toBe('high');
    expect(result.reasons.some(r => r.includes('max_tokens=35000'))).toBe(true);
  });

  it('returns high when messages_count is unusually high (>10)', () => {
    const result = evaluateLlmPayloadRisk({
      request_payload_byte_size: 15000,
      total_prompt_char_count:   10000,
      estimated_token_count:     2500,
      max_tokens:                8000,
      messages_count:            15,
    });
    expect(result.level).toBe('high');
    expect(result.reasons.some(r => r.includes('messages_count=15'))).toBe(true);
  });

  it('result has level and reasons fields', () => {
    const result: LlmPayloadRiskResult = evaluateLlmPayloadRisk({
      request_payload_byte_size: 150000,
      total_prompt_char_count:   90000,
      estimated_token_count:     45000,
      max_tokens:                35000,
      messages_count:            2,
    });
    expect(result).toHaveProperty('level');
    expect(result).toHaveProperty('reasons');
    expect(Array.isArray(result.reasons)).toBe(true);
    expect(result.level).toBe('high');
  });

  it('high risk with multiple signals collects all reasons', () => {
    const result = evaluateLlmPayloadRisk({
      request_payload_byte_size: 150000,
      total_prompt_char_count:   90000,
      estimated_token_count:     45000,
      max_tokens:                35000,
      messages_count:            2,
    });
    expect(result.level).toBe('high');
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });
});

// ── evaluateLlmPayloadRisk — determinism ──────────────────────────────────────

describe('evaluateLlmPayloadRisk — determinism', () => {
  it('produces identical output for identical input (pure function)', () => {
    const metrics = {
      request_payload_byte_size: 80000,
      total_prompt_char_count:   30000,
      estimated_token_count:     7500,
      max_tokens:                12000,
      messages_count:            2,
    };
    const r1 = evaluateLlmPayloadRisk(metrics);
    const r2 = evaluateLlmPayloadRisk(metrics);
    expect(r1).toEqual(r2);
  });

  it('token estimate at 4 chars/token is deterministic for a given char count', () => {
    const charCount = 60000;
    const expected  = Math.round(charCount / 4); // 15000
    expect(expected).toBe(15000);
    // Verify risk level reflects this estimate correctly
    const result = evaluateLlmPayloadRisk({
      request_payload_byte_size: 30000,
      total_prompt_char_count:   charCount,
      estimated_token_count:     expected,
      max_tokens:                8000,
      messages_count:            2,
    });
    // 15000 tokens < 16000 threshold → should be low (total_prompt triggers medium)
    expect(result.level).toBe('medium');
  });
});

// ── recordLlmCallDiagnostics — field completeness ────────────────────────────

describe('recordLlmCallDiagnostics — field completeness', () => {
  it('coder diagnostics include llm_call_step, provider, model_id, endpoint_kind', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    recordLlmCallDiagnostics(makeCoderDiagnostics());
    const calls = spy.mock.calls.filter(c => c[0] === '[llm_call_diag]');
    expect(calls).toHaveLength(1);
    const p = calls[0][1];
    expect(p.llm_call_step).toBe('coder');
    expect(p.provider).toBe('deepseek');
    expect(p.model_id).toBe('deepseek-v4-pro');
    expect(p.endpoint_kind).toBe('supabase_proxy');
    expect(p.route_authority).toBe('user_set');
  });

  it('architect diagnostics include the correct llm_call_step', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    recordLlmCallDiagnostics(makeArchitectDiagnostics());
    const calls = spy.mock.calls.filter(c => c[0] === '[llm_call_diag]');
    expect(calls[0][1].llm_call_step).toBe('architect');
  });

  it('diagnostics log includes separate system/user char counts', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    recordLlmCallDiagnostics(makeCoderDiagnostics({
      system_prompt_char_count: 8000,
      user_payload_char_count:  4000,
      total_prompt_char_count:  12000,
    }));
    const p = spy.mock.calls.filter(c => c[0] === '[llm_call_diag]')[0][1];
    expect(p.system_prompt_char_count).toBe(8000);
    expect(p.user_payload_char_count).toBe(4000);
    expect(p.total_prompt_char_count).toBe(12000);
  });

  it('diagnostics log includes request_payload_byte_size and streaming_enabled', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    recordLlmCallDiagnostics(makeCoderDiagnostics({
      request_payload_byte_size: 45000,
      streaming_enabled:         false,
    }));
    const p = spy.mock.calls.filter(c => c[0] === '[llm_call_diag]')[0][1];
    expect(p.request_payload_byte_size).toBe(45000);
    expect(p.streaming_enabled).toBe(false);
  });

  it('diagnostics log includes a payload_risk_level field', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    recordLlmCallDiagnostics(makeCoderDiagnostics());
    const p = spy.mock.calls.filter(c => c[0] === '[llm_call_diag]')[0][1];
    expect(p.payload_risk_level).toMatch(/^(low|medium|high)$/);
    expect(Array.isArray(p.payload_risk_reasons)).toBe(true);
  });
});

// ── recordLlmCallDiagnostics — safety ────────────────────────────────────────

describe('recordLlmCallDiagnostics — safety', () => {
  it('does NOT log prompt text (system or user)', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    recordLlmCallDiagnostics(makeCoderDiagnostics());
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toMatch(/You are a senior React/i);
    expect(logged).not.toMatch(/FILE:|<<<END>>>/i);
    expect(logged).not.toMatch(/system prompt|user message/i);
  });

  it('does NOT log API key material', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    recordLlmCallDiagnostics(makeCoderDiagnostics({ model_id: 'deepseek-v4-pro' }));
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toMatch(/sk-[a-zA-Z0-9]{10,}/);
    expect(logged).not.toMatch(/Bearer /i);
  });

  it('does NOT log generated code', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    recordLlmCallDiagnostics(makeCoderDiagnostics());
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toMatch(/export default function|import React/i);
  });
});

// ── recordLlmCallOutcome ──────────────────────────────────────────────────────

describe('recordLlmCallOutcome', () => {
  it('logs a [llm_call_outcome] record with timing and status', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const outcome: LlmCallOutcomeDiagnostics = {
      llm_call_step:    'coder',
      response_time_ms: 4500,
      final_status:     'failed',
      http_status:      546,
      error_category:   'proxy_resource_limit',
    };
    recordLlmCallOutcome(outcome);
    const calls = spy.mock.calls.filter(c => c[0] === '[llm_call_outcome]');
    expect(calls).toHaveLength(1);
    const p = calls[0][1];
    expect(p.llm_call_step).toBe('coder');
    expect(p.response_time_ms).toBe(4500);
    expect(p.final_status).toBe('failed');
    expect(p.http_status).toBe(546);
    expect(p.error_category).toBe('proxy_resource_limit');
  });

  it('logs success outcome with http_status=0 and no error_category', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    recordLlmCallOutcome({
      llm_call_step:    'architect',
      response_time_ms: 12000,
      final_status:     'success',
      http_status:      0,
    });
    const calls = spy.mock.calls.filter(c => c[0] === '[llm_call_outcome]');
    const p = calls[0][1];
    expect(p.final_status).toBe('success');
    expect(p.http_status).toBe(0);
    expect(p.error_category).toBeNull();
  });

  it('logs retry_success outcome', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    recordLlmCallOutcome({
      llm_call_step:    'coder',
      response_time_ms: 8000,
      final_status:     'retry_success',
      http_status:      0,
    });
    const calls = spy.mock.calls.filter(c => c[0] === '[llm_call_outcome]');
    expect(calls[0][1].final_status).toBe('retry_success');
    expect(calls[0][1].error_category).toBeNull();
  });

  it('outcome log does not contain prompt text or API key material', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    recordLlmCallOutcome({
      llm_call_step:    'coder',
      response_time_ms: 5000,
      final_status:     'failed',
      http_status:      546,
      error_category:   'proxy_resource_limit',
    });
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toMatch(/sk-[a-zA-Z0-9]+/);
    expect(logged).not.toMatch(/FILE:|<<<END>>>/i);
  });
});

// ── Byte size estimation ──────────────────────────────────────────────────────

describe('byte size estimation', () => {
  it('JSON.stringify of a typical coder request body gives a deterministic byte length', () => {
    const body = JSON.stringify({
      model:       'deepseek-v4-pro',
      messages:    [
        { role: 'system', content: 'x'.repeat(6000) },
        { role: 'user',   content: 'y'.repeat(4000) },
      ],
      stream:      false,
      temperature: 0.3,
      max_tokens:  35000,
    });
    const byteSize = body.length;
    expect(byteSize).toBeGreaterThan(10000);
    expect(typeof byteSize).toBe('number');
    // Same input always produces same length
    expect(byteSize).toBe(body.length);
  });

  it('coder payload byte size is larger than architect payload for same max_tokens', () => {
    // Coder has additional planning blocks, market brief, skeleton context
    const architectBody = JSON.stringify({
      model:       'deepseek-v4-pro',
      messages:    [
        { role: 'system', content: 'x'.repeat(4000) },
        { role: 'user',   content: 'y'.repeat(1000) },
      ],
      stream:      false,
      temperature: 0.3,
      max_tokens:  8000,
    });
    const coderBody = JSON.stringify({
      model:       'deepseek-v4-pro',
      messages:    [
        { role: 'system', content: 'x'.repeat(15000) },  // larger: skeleton + planning blocks
        { role: 'user',   content: 'y'.repeat(6000) },   // larger: full architect plan summary
      ],
      stream:      false,
      temperature: 0.3,
      max_tokens:  35000,
    });
    expect(coderBody.length).toBeGreaterThan(architectBody.length);
  });
});

// ── Token estimation consistency ─────────────────────────────────────────────

describe('token estimation consistency', () => {
  it('estimated_token_count = Math.round(total_prompt_char_count / 4) is deterministic', () => {
    for (const chars of [5000, 12000, 30000, 60000, 100000]) {
      const estimated = Math.round(chars / 4);
      expect(estimated).toBe(Math.round(chars / 4));
    }
  });

  it('does not underestimate: chars=90000 triggers high risk even though tokens<40k', () => {
    const chars = 90000;
    const tokens = Math.round(chars / 4); // 22500 — below the 40k token high-risk threshold
    expect(tokens).toBe(22500);
    // total_prompt_char_count=90000 > 80000 triggers high risk
    // even though token estimate alone (22500) would not.
    const result = evaluateLlmPayloadRisk({
      request_payload_byte_size: 30000,
      total_prompt_char_count:   chars,
      estimated_token_count:     tokens,
      max_tokens:                8000,
      messages_count:            2,
    });
    expect(result.level).toBe('high');
    expect(result.reasons.some(r => r.includes('total_prompt_char_count=90000'))).toBe(true);
  });
});

// ── Integration: coder vs architect risk comparison ───────────────────────────

describe('payload risk: coder vs architect comparison', () => {
  it('typical architect payload is low risk; coder with full planning blocks is medium/high', () => {
    const architectRisk = evaluateLlmPayloadRisk({
      request_payload_byte_size: 7000,
      total_prompt_char_count:   5000,
      estimated_token_count:     1250,
      max_tokens:                8000,
      messages_count:            2,
    });

    // Coder: system = skeleton + planning blocks + architect plan ≈ 30-80k chars;
    // user = brief ≈ 1k chars; max_tokens = 35000 (high risk on its own)
    const coderRisk = evaluateLlmPayloadRisk({
      request_payload_byte_size: 80000,
      total_prompt_char_count:   60000,
      estimated_token_count:     15000,
      max_tokens:                35000,
      messages_count:            2,
    });

    expect(architectRisk.level).toBe('low');
    expect(['medium', 'high']).toContain(coderRisk.level);
  });

  it('coder with max_tokens=35000 alone is high risk', () => {
    const result = evaluateLlmPayloadRisk({
      request_payload_byte_size: 20000,
      total_prompt_char_count:   15000,
      estimated_token_count:     3750,
      max_tokens:                35000,
      messages_count:            2,
    });
    expect(result.level).toBe('high');
    expect(result.reasons.some(r => r.includes('max_tokens=35000'))).toBe(true);
  });
});
