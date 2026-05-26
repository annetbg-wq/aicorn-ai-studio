/**
 * LLMTransportError.ts — Structured error handling for architect/coder LLM HTTP failures.
 *
 * Provides:
 *  - LlmErrorCategory — typed error categories for all LLM transport failures
 *  - LlmTransportError — typed error class (extends Error for backward compat)
 *  - classifyLlmHttpError — maps HTTP status + body to a category
 *  - isTransientLlmError — returns true only for errors safe to retry once
 *  - recordLlmTransportTelemetry — emits compact structured diagnostic log
 *  - executeWithClassifiedRetry — one-retry wrapper for LLM HTTP calls
 *
 * Not changed: provider/model defaults, skeletons, PAP, quality gate, repair,
 * preview pipeline, blueprint packaging logic.
 */

// ── Error categories ─────────────────────────────────────────────────────────

export type LlmErrorCategory =
  | 'provider_http_500'          // Generic 5xx — transient server-side error; one retry allowed
  | 'provider_rate_limit'        // HTTP 429 — not retried (no sleep budget in pipeline)
  | 'context_too_large'          // 500/400 with token/context overflow body
  | 'malformed_llm_request'      // HTTP 400 — bad request format
  | 'missing_provider_key'       // HTTP 401/403 — auth / key issue
  | 'invalid_llm_response'       // 200 OK but unparseable / empty body
  | 'unknown_llm_transport_error'; // Any other non-2xx or unclassified transport failure

// ── Typed error class ─────────────────────────────────────────────────────────

export class LlmTransportError extends Error {
  readonly category: LlmErrorCategory;
  readonly httpStatus: number;
  readonly retryUsed: boolean;

  constructor(
    message: string,
    category: LlmErrorCategory,
    httpStatus: number,
    retryUsed: boolean,
  ) {
    super(message);
    this.name = 'LlmTransportError';
    this.category = category;
    this.httpStatus = httpStatus;
    this.retryUsed = retryUsed;
  }
}

// ── Telemetry interface ───────────────────────────────────────────────────────

export interface LlmTransportTelemetry {
  llm_call_step: string;         // architect | coder | repair | clarify | quality | etc.
  llm_http_status: number;
  llm_error_category: LlmErrorCategory;
  llm_retry_used: boolean;
  llm_final_status: 'success' | 'retry_success' | 'failed';
  llm_safe_error_message: string; // No secrets, no raw keys, no full prompts
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Parses an HTTP status code from error messages produced by LLMProxy
 * ("LLM Proxy 500: ...") and by streamCall's direct path ("LLM 500: ...").
 * Returns 0 if no 3-digit code is found.
 */
export function parseStatusFromMessage(msg: string): number {
  const m = /\b(\d{3})\b/.exec(msg);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Extracts a safe (short) body snippet from error messages.
 * Strips the numeric status prefix to get only the provider error text.
 */
export function parseSafeBodyFromMessage(msg: string): string {
  // "LLM Proxy 500: <body>" or "LLM 500: <body>" → "<body>"
  const m = /(?:LLM Proxy|LLM) \d{3}:\s*(.{0,300})/.exec(msg);
  return m ? m[1] : msg.slice(0, 300);
}

// ── Classification ────────────────────────────────────────────────────────────

/**
 * Maps an HTTP status code and error body to a structured LlmErrorCategory.
 *
 * Context/token overflow is detected conservatively: only flagged when the
 * body contains clear signal words. This avoids misclassifying generic 400/500
 * errors as non-retryable context failures.
 */
export function classifyLlmHttpError(
  httpStatus: number,
  errBody: string,
): LlmErrorCategory {
  if (httpStatus === 429) return 'provider_rate_limit';
  if (httpStatus === 401 || httpStatus === 403) return 'missing_provider_key';

  if (httpStatus === 400 || httpStatus >= 500) {
    // Detect token/context overflow regardless of whether it came as 400 or 500
    if (
      /context.{0,20}(length|limit|exceed|overflow|too.?long|window)/i.test(errBody) ||
      /max.{0,10}token/i.test(errBody) ||
      /token.{0,20}(limit|exceed|overflow)/i.test(errBody) ||
      /prompt.{0,20}too.?long/i.test(errBody)
    ) {
      return 'context_too_large';
    }
    if (httpStatus === 400) return 'malformed_llm_request';
    return 'provider_http_500';
  }

  return 'unknown_llm_transport_error';
}

/**
 * Returns true ONLY for categories that are safe to retry exactly once.
 * provider_http_500 is the only transient case: generic server-side errors
 * that are not caused by the request content and may clear on a second attempt.
 *
 * Rate limits, context overflow, auth failures, and malformed requests are
 * all deterministic given the same request and must NOT be retried.
 */
export function isTransientLlmError(category: LlmErrorCategory): boolean {
  return category === 'provider_http_500';
}

// ── Telemetry ─────────────────────────────────────────────────────────────────

/**
 * Emits a compact single-line structured diagnostic log for LLM transport errors.
 * Never logs secrets, raw API keys, or full prompts.
 */
export function recordLlmTransportTelemetry(data: LlmTransportTelemetry): void {
  console.log('[llm_transport]', {
    llm_call_step: data.llm_call_step,
    llm_http_status: data.llm_http_status,
    llm_error_category: data.llm_error_category,
    llm_retry_used: data.llm_retry_used,
    llm_final_status: data.llm_final_status,
    llm_safe_error_message: data.llm_safe_error_message,
  });
}

// ── Retry executor ────────────────────────────────────────────────────────────

/**
 * Executes an LLM HTTP call with at most one targeted retry for transient errors.
 *
 * `attempt` must either:
 *   - resolve with the response body text (success), or
 *   - throw an Error whose message encodes the HTTP status in the format used
 *     by LLMProxy ("LLM Proxy 500: ...") or streamCall ("LLM 500: ...").
 *
 * Behavior:
 *   1. Calls `attempt()` once.
 *   2. On success: returns { result, retryUsed: false }.
 *   3. On AbortError: re-throws immediately (no retry, no telemetry).
 *   4. On transient error (provider_http_500): calls `attempt()` exactly once more.
 *      - If retry succeeds: emits telemetry (retry_success) and returns.
 *      - If retry also fails: emits telemetry (failed) and throws LlmTransportError.
 *   5. On non-retryable error: emits telemetry (failed) and throws LlmTransportError.
 *
 * No infinite loops, no sleep delays, no silent swallowing of errors.
 */
export async function executeWithClassifiedRetry(
  step: string,
  attempt: () => Promise<string>,
): Promise<{ result: string; retryUsed: boolean }> {
  let firstCategory: LlmErrorCategory;
  let firstStatus: number;
  let firstSafeMsg: string;

  // ── First attempt ───────────────────────────────────────────────────────────
  try {
    const result = await attempt();
    return { result, retryUsed: false };
  } catch (err) {
    // Always propagate AbortError — it means the pipeline was cancelled or timed out.
    if (isAbortError(err)) throw err;

    const status = parseStatusFromMessage((err as Error).message);
    const safeMsg = parseSafeBodyFromMessage((err as Error).message);
    const category = classifyLlmHttpError(status, safeMsg);

    firstCategory = category;
    firstStatus = status;
    firstSafeMsg = safeMsg;

    if (!isTransientLlmError(category)) {
      recordLlmTransportTelemetry({
        llm_call_step: step,
        llm_http_status: status,
        llm_error_category: category,
        llm_retry_used: false,
        llm_final_status: 'failed',
        llm_safe_error_message: safeMsg.slice(0, 200),
      });
      throw new LlmTransportError(
        `LLM call failed [${category}] at step '${step}': ${safeMsg.slice(0, 200)}`,
        category,
        status,
        false,
      );
    }
    // category === 'provider_http_500' — fall through to one retry
  }

  // ── One targeted retry (transient provider_http_500 only) ──────────────────
  try {
    const result = await attempt();
    recordLlmTransportTelemetry({
      llm_call_step: step,
      llm_http_status: firstStatus!,
      llm_error_category: firstCategory!,
      llm_retry_used: true,
      llm_final_status: 'retry_success',
      llm_safe_error_message: '',
    });
    return { result, retryUsed: true };
  } catch (retryErr) {
    if (isAbortError(retryErr)) throw retryErr;

    const retryStatus = parseStatusFromMessage((retryErr as Error).message);
    const retrySafeMsg = parseSafeBodyFromMessage((retryErr as Error).message);
    const retryCategory = classifyLlmHttpError(retryStatus, retrySafeMsg);

    recordLlmTransportTelemetry({
      llm_call_step: step,
      llm_http_status: retryStatus,
      llm_error_category: retryCategory,
      llm_retry_used: true,
      llm_final_status: 'failed',
      llm_safe_error_message: retrySafeMsg.slice(0, 200),
    });
    throw new LlmTransportError(
      `LLM call failed after 1 retry [${retryCategory}] at step '${step}': ${retrySafeMsg.slice(0, 200)}`,
      retryCategory,
      retryStatus,
      true,
    );
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

function isAbortError(err: unknown): boolean {
  return (
    err instanceof DOMException && err.name === 'AbortError'
  ) || (
    // Node/vitest test environment may not have DOMException
    err instanceof Error && err.name === 'AbortError'
  );
}
