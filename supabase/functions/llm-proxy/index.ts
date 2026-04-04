import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Only these hosts may be proxied — prevents open-relay abuse. */
const ALLOWED_HOSTS = [
  'openrouter.ai',
  'api.anthropic.com',
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'api.deepseek.com',
  'api.mistral.ai',
  'api.groq.com',
]

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const { endpoint, headers, body, stream, method } = await req.json() as {
      endpoint: string
      headers?: Record<string, string>
      body?:    string
      stream?:  boolean
      method?:  string   // default POST
    }

    if (!endpoint) {
      return new Response(
        JSON.stringify({ error: 'Missing endpoint' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    const url = new URL(endpoint)
    if (!ALLOWED_HOSTS.some(h => url.hostname.endsWith(h))) {
      return new Response(
        JSON.stringify({ error: `Endpoint not allowed: ${url.hostname}` }),
        { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    const httpMethod = (method ?? 'POST').toUpperCase()

    const fetchOpts: RequestInit = {
      method:  httpMethod,
      headers: headers ?? { 'Content-Type': 'application/json' },
    }
    // GET/HEAD must not have a body
    if (httpMethod !== 'GET' && httpMethod !== 'HEAD' && body) {
      fetchOpts.body = typeof body === 'string' ? body : JSON.stringify(body)
    }

    const proxyResp = await fetch(endpoint, fetchOpts)

    // Streaming — pipe SSE body back to client
    if (stream && proxyResp.body) {
      return new Response(proxyResp.body, {
        status: proxyResp.status,
        headers: {
          ...CORS_HEADERS,
          'Content-Type':  proxyResp.headers.get('Content-Type') || 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection':    'keep-alive',
        },
      })
    }

    // Non-streaming — return full response
    const responseBody = await proxyResp.text()
    return new Response(responseBody, {
      status: proxyResp.status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': proxyResp.headers.get('Content-Type') || 'application/json',
      },
    })
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: `Proxy error: ${err.message}` }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }
})
