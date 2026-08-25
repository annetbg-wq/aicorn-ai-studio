/**
 * LLMProxy.ts — Routes all LLM API calls through a Supabase Edge Function.
 *
 * This bypasses browser CSP restrictions that block direct fetch() to
 * external LLM APIs (openrouter.ai, api.anthropic.com, etc.).
 */

import { supabase } from '../lib/supabase';
import { canUseDevAuthBypass } from './internalAccess';
import { interceptForDiagnosticRun, interceptForDiagnosticRunStream } from './DiagnosticIntercept';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  localStorage.getItem('SUPABASE_URL') ||
  'https://zdzuaodphrlpvorutpyc.supabase.co';

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  localStorage.getItem('SUPABASE_ANON_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkenVhb2RwaHJscHZvcnV0cHljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDIyMTIsImV4cCI6MjA4NzUxODIxMn0.7L5sYMedvIKnU7o0X280Y92rUTAs86Q4RwBJsppuFxI';

const PROXY_URL = `${SUPABASE_URL}/functions/v1/llm-proxy`;

async function getProxyRequestHeaders(forceAnon = false): Promise<Record<string, string>> {
  const proxyHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (SUPABASE_ANON_KEY) {
    proxyHeaders.apikey = SUPABASE_ANON_KEY;
  }

  let bearerToken = SUPABASE_ANON_KEY;

  // Local dev bypass does not create a real Supabase user/session, so the
  // edge function must be called with the anon role instead of a fake user.
  const devBypassEnabled = canUseDevAuthBypass();
  if (!forceAnon && !devBypassEnabled) {
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token?.trim();
      if (accessToken) {
        bearerToken = accessToken;
      }
    } catch {
      // Fall back to anon invocation when session lookup is unavailable.
    }
  }

  if (bearerToken) {
    proxyHeaders.Authorization = `Bearer ${bearerToken}`;
  }

  return proxyHeaders;
}

async function proxyRequest(
  endpoint: string,
  headers: Record<string, string>,
  body: string,
  stream: boolean,
  method: string,
  signal?: AbortSignal,
  forceAnon = false,
): Promise<Response> {
  const proxyHeaders = await getProxyRequestHeaders(forceAnon);
  return await fetch(PROXY_URL, {
    method: 'POST',
    headers: proxyHeaders,
    body: JSON.stringify({ endpoint, headers, body, stream, method }),
    signal,
  });
}

/**
 * Direct fetch to the LLM endpoint, bypassing the Supabase edge function.
 * Used only when dev-bypass mode is active and the edge function rejects the
 * anon JWT (e.g. verify_jwt=true rejects anon-role tokens on this project).
 */
async function directLLMRequest(
  endpoint: string,
  headers: Record<string, string>,
  body: string,
  stream: boolean,
  method: string,
  signal?: AbortSignal,
): Promise<Response> {
  const httpMethod = (method ?? 'POST').toUpperCase();
  const fetchOpts: RequestInit = {
    method: httpMethod,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    signal,
  };
  if (httpMethod !== 'GET' && httpMethod !== 'HEAD' && body) {
    fetchOpts.body = body;
  }
  return await fetch(endpoint, fetchOpts);
}

async function proxyRequestWithSessionFallback(
  endpoint: string,
  headers: Record<string, string>,
  body: string,
  stream: boolean,
  method: string,
  signal?: AbortSignal,
): Promise<Response> {
  const devBypassEnabled = canUseDevAuthBypass();
  // In Playwright e2e tests VITE_PLAYWRIGHT_TEST=1 is baked in at build time.
  // Keep auth bypass active but route LLM calls through the proxy so that
  // deterministic mocks (page.route('**/functions/v1/llm-proxy')) can intercept
  // them. Without this guard, directLLMRequest sends calls straight to
  // openrouter.ai — a URL the mock never covers — causing ProtoPipeline to
  // abort before compile() and controller_compiling is never emitted.
  const isPlaywrightTest = import.meta.env.VITE_PLAYWRIGHT_TEST === '1';

  // In dev-bypass mode go directly to the LLM — avoids Supabase edge function
  // timeouts (QUIC/150 s limit) on long generation requests.
  if (devBypassEnabled && !isPlaywrightTest) {
    return directLLMRequest(endpoint, headers, body, stream, method, signal);
  }

  let resp: Response;
  try {
    resp = await proxyRequest(endpoint, headers, body, stream, method, signal, false);
  } catch (networkErr: unknown) {
    const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
    throw new Error(`LLM Proxy network error: ${msg}`);
  }

  if (resp.ok) return resp;

  const err = await resp.text().catch(() => '');

  // Retry with anon key for "User not found" (JWT issued for a deleted user).
  if (resp.status === 401 && /User not found/i.test(err)) {
    const retryResp = await proxyRequest(endpoint, headers, body, stream, method, signal, true);
    if (retryResp.ok) return retryResp;

    const retryErr = await retryResp.text().catch(() => '');
    throw new Error(`LLM Proxy ${retryResp.status}: ${retryErr.slice(0, 300)}`);
  }

  throw new Error(`LLM Proxy ${resp.status}: ${err.slice(0, 300)}`);
}

// ── Token-bucket rate limiter ──────────────────────────────────────────────
// Prevents flood on rapid retries, benchmark runs, or concurrent agents.
// 10 requests burst, refills at 1 req/s.

const rateLimiter = {
  tokens:     10,
  maxTokens:  10,
  refillRate: 1,   // tokens per second
  lastRefill: Date.now(),

  async acquire(): Promise<void> {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;

    if (this.tokens < 1) {
      const waitMs = ((1 - this.tokens) / this.refillRate) * 1000;
      await new Promise(resolve => setTimeout(resolve, waitMs));
      this.tokens = 0;
    } else {
      this.tokens -= 1;
    }
  },
};

/**
 * POST (non-streaming) through the proxy. Returns a Response identical
 * to what the LLM API would return.
 */
export async function llmFetch(
  endpoint: string,
  headers: Record<string, string>,
  body: string,
  diagnosticStepName?: string,
): Promise<Response> {
  const intercepted = await interceptForDiagnosticRun(endpoint, headers, body, diagnosticStepName);
  if (intercepted) return intercepted;

  await rateLimiter.acquire();
  const resp = await proxyRequestWithSessionFallback(endpoint, headers, body, false, 'POST');
  // Re-wrap so callers can .json() / .text() as usual
  return new Response(await resp.text(), {
    status: resp.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * POST (streaming / SSE) through the proxy.
 * Returns a Response whose .body is a ReadableStream of SSE chunks.
 */
export async function llmFetchStream(
  endpoint: string,
  headers: Record<string, string>,
  body: string,
  signal?: AbortSignal,
  diagnosticStepName?: string,
): Promise<Response> {
  const intercepted = await interceptForDiagnosticRunStream(endpoint, headers, body, diagnosticStepName);
  if (intercepted) return intercepted;

  await rateLimiter.acquire();
  const resp = await proxyRequestWithSessionFallback(endpoint, headers, body, true, 'POST', signal);
  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    throw new Error(`LLM Proxy ${resp.status}: ${err.slice(0, 300)}`);
  }
  return resp; // caller reads resp.body as SSE stream
}

/**
 * GET through the proxy (e.g. model list endpoints).
 */
export async function llmGet(
  endpoint: string,
  headers?: Record<string, string>,
): Promise<Response> {
  await rateLimiter.acquire();
  const resp = await proxyRequestWithSessionFallback(endpoint, headers ?? {}, '', false, 'GET');
  return new Response(await resp.text(), {
    status: resp.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
