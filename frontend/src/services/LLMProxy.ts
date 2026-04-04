/**
 * LLMProxy.ts — Routes all LLM API calls through a Supabase Edge Function.
 *
 * This bypasses browser CSP restrictions that block direct fetch() to
 * external LLM APIs (openrouter.ai, api.anthropic.com, etc.).
 */

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  localStorage.getItem('SUPABASE_URL') ||
  'https://zdzuaodphrlpvorutpyc.supabase.co';

const PROXY_URL = `${SUPABASE_URL}/functions/v1/llm-proxy`;

/**
 * POST (non-streaming) through the proxy. Returns a Response identical
 * to what the LLM API would return.
 */
export async function llmFetch(
  endpoint: string,
  headers: Record<string, string>,
  body: string,
): Promise<Response> {
  const resp = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, headers, body, stream: false }),
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    throw new Error(`LLM Proxy ${resp.status}: ${err.slice(0, 300)}`);
  }
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
): Promise<Response> {
  const resp = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, headers, body, stream: true }),
    signal,
  });
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
  const resp = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, headers: headers ?? {}, method: 'GET', stream: false }),
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    throw new Error(`LLM Proxy GET ${resp.status}: ${err.slice(0, 300)}`);
  }
  return new Response(await resp.text(), {
    status: resp.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
