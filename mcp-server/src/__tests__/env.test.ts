import { afterEach, beforeEach, describe, expect, it } from 'vitest';

process.env.MCP_BEARER_TOKEN = 'x';
process.env.GITHUB_TOKEN = 'x';
process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
process.env.SUPABASE_DB_URL = 'postgres://x';
process.env.RENDER_API_KEY = 'x';

const { resolvePublicBaseUrl } = await import('../env.js');

const ENV_KEYS = ['PUBLIC_BASE_URL', 'RENDER_EXTERNAL_URL', 'PORT'] as const;
let saved: Record<string, string | undefined>;

describe('resolvePublicBaseUrl', () => {
  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('uses RENDER_EXTERNAL_URL (Render-provided) when nothing is manually overridden', () => {
    process.env.RENDER_EXTERNAL_URL = 'https://aicorn-ai-studio-mcp.onrender.com';
    const result = resolvePublicBaseUrl();
    expect(result.url).toBe('https://aicorn-ai-studio-mcp.onrender.com');
    expect(result.source).toBe('RENDER_EXTERNAL_URL');
    expect(result.warning).toBeUndefined();
  });

  it('falls back to localhost when nothing is set at all', () => {
    const result = resolvePublicBaseUrl();
    expect(result.source).toBe('localhost-fallback');
    expect(result.url).toMatch(/^http:\/\/localhost:\d+$/);
  });

  it('uses a manually-set PUBLIC_BASE_URL that agrees with RENDER_EXTERNAL_URL, no warning', () => {
    process.env.RENDER_EXTERNAL_URL = 'https://aicorn-ai-studio-mcp.onrender.com';
    process.env.PUBLIC_BASE_URL = 'https://aicorn-ai-studio-mcp.onrender.com';
    const result = resolvePublicBaseUrl();
    expect(result.url).toBe('https://aicorn-ai-studio-mcp.onrender.com');
    expect(result.source).toBe('PUBLIC_BASE_URL');
    expect(result.warning).toBeUndefined();
  });

  // This is the actual prod bug: a manually-set PUBLIC_BASE_URL missing the
  // .onrender.com suffix silently broke every absolute URL in the OAuth
  // discovery metadata (registration_endpoint, authorization_endpoint,
  // token_endpoint) — ChatGPT then POSTs to a hostname that doesn't resolve,
  // surfacing only as a generic "failed to resolve OAuth client".
  it('flags a PUBLIC_BASE_URL that disagrees with RENDER_EXTERNAL_URL', () => {
    process.env.RENDER_EXTERNAL_URL = 'https://aicorn-ai-studio-mcp.onrender.com';
    process.env.PUBLIC_BASE_URL = 'https://aicorn-ai-studio-mcp'; // missing .onrender.com
    const result = resolvePublicBaseUrl();
    expect(result.url).toBe('https://aicorn-ai-studio-mcp');
    expect(result.source).toBe('PUBLIC_BASE_URL');
    expect(result.warning).toContain('RENDER_EXTERNAL_URL');
  });

  it('does not warn about a manual override when RENDER_EXTERNAL_URL is not set at all (e.g. local dev)', () => {
    process.env.PUBLIC_BASE_URL = 'http://localhost:8787';
    const result = resolvePublicBaseUrl();
    expect(result.warning).toBeUndefined();
  });

  it('strips trailing slashes from either source', () => {
    process.env.RENDER_EXTERNAL_URL = 'https://aicorn-ai-studio-mcp.onrender.com/';
    expect(resolvePublicBaseUrl().url).toBe('https://aicorn-ai-studio-mcp.onrender.com');
  });
});
