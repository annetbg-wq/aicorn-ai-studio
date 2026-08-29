import { afterEach, beforeEach, describe, expect, it } from 'vitest';

process.env.MCP_BEARER_TOKEN = 'x';

const { capabilityMatrix, env, resolvePublicBaseUrl } = await import('../env.js');

const ENV_KEYS = [
  'PUBLIC_BASE_URL',
  'RAILWAY_PUBLIC_DOMAIN',
  'RAILWAY_SERVICE_AICORN_AI_STUDIO_BACKEND_URL',
  'RAILWAY_SERVICE_ID',
  'RAILWAY_ENVIRONMENT_ID',
  'RENDER_EXTERNAL_URL',
  'PORT',
  'BACKEND_HEALTH_URL',
  'GITHUB_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_URL',
  'RENDER_API_KEY',
] as const;
let saved: Record<string, string | undefined>;

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

describe('resolvePublicBaseUrl', () => {
  it('uses RENDER_EXTERNAL_URL as a legacy fallback when no Railway URL exists', () => {
    process.env.RENDER_EXTERNAL_URL = 'https://aicorn-ai-studio-mcp.onrender.com';
    const result = resolvePublicBaseUrl();
    expect(result.url).toBe('https://aicorn-ai-studio-mcp.onrender.com');
    expect(result.source).toBe('RENDER_EXTERNAL_URL');
    expect(result.warning).toBeUndefined();
  });

  it('builds an HTTPS URL from Railway\'s bare RAILWAY_PUBLIC_DOMAIN', () => {
    process.env.RAILWAY_PUBLIC_DOMAIN = 'aicorn-ai-studio-mcp-production.up.railway.app';
    const result = resolvePublicBaseUrl();
    expect(result.url).toBe('https://aicorn-ai-studio-mcp-production.up.railway.app');
    expect(result.source).toBe('RAILWAY_PUBLIC_DOMAIN');
    expect(result.warning).toBeUndefined();
  });

  it('prefers Railway over a stale Render URL when both provider variables exist', () => {
    process.env.RAILWAY_PUBLIC_DOMAIN = 'aicorn-ai-studio-mcp-production.up.railway.app';
    process.env.RENDER_EXTERNAL_URL = 'https://aicorn-ai-studio-mcp.onrender.com';
    const result = resolvePublicBaseUrl();
    expect(result.url).toBe('https://aicorn-ai-studio-mcp-production.up.railway.app');
    expect(result.source).toBe('RAILWAY_PUBLIC_DOMAIN');
  });

  it('falls back to localhost when nothing is set at all', () => {
    const result = resolvePublicBaseUrl();
    expect(result.source).toBe('localhost-fallback');
    expect(result.url).toMatch(/^http:\/\/localhost:\d+$/);
  });

  it('flags a PUBLIC_BASE_URL that disagrees with RENDER_EXTERNAL_URL', () => {
    process.env.RENDER_EXTERNAL_URL = 'https://aicorn-ai-studio-mcp.onrender.com';
    process.env.PUBLIC_BASE_URL = 'https://aicorn-ai-studio-mcp';
    const result = resolvePublicBaseUrl();
    expect(result.url).toBe('https://aicorn-ai-studio-mcp');
    expect(result.source).toBe('PUBLIC_BASE_URL');
    expect(result.warning).toContain('RENDER_EXTERNAL_URL');
  });

  it('flags and ignores a PUBLIC_BASE_URL that disagrees with Railway', () => {
    process.env.RAILWAY_PUBLIC_DOMAIN = 'aicorn-ai-studio-mcp-production.up.railway.app';
    process.env.PUBLIC_BASE_URL = 'http://localhost:8080';
    const result = resolvePublicBaseUrl();
    expect(result.url).toBe('https://aicorn-ai-studio-mcp-production.up.railway.app');
    expect(result.source).toBe('RAILWAY_PUBLIC_DOMAIN');
    expect(result.warning).toContain('Ignoring PUBLIC_BASE_URL="http://localhost:8080"');
  });

  it('strips trailing slashes and does not duplicate a Railway URL scheme', () => {
    process.env.RAILWAY_PUBLIC_DOMAIN = 'https://aicorn-ai-studio-mcp-production.up.railway.app/';
    expect(resolvePublicBaseUrl().url).toBe('https://aicorn-ai-studio-mcp-production.up.railway.app');
  });
});

describe('Railway backend health resolution', () => {
  it('prefers an explicit BACKEND_HEALTH_URL', () => {
    process.env.BACKEND_HEALTH_URL = 'https://example.test/custom-health';
    process.env.RAILWAY_SERVICE_AICORN_AI_STUDIO_BACKEND_URL = 'backend.railway.internal';
    expect(env.BACKEND_HEALTH_URL).toBe('https://example.test/custom-health');
  });

  it('derives /health from Railway cross-service URL', () => {
    process.env.RAILWAY_SERVICE_AICORN_AI_STUDIO_BACKEND_URL = 'aicorn-ai-studio-backend-production.up.railway.app/';
    expect(env.BACKEND_HEALTH_URL).toBe('https://aicorn-ai-studio-backend-production.up.railway.app/health');
  });

  it('uses the current Railway public backend as final fallback', () => {
    expect(env.BACKEND_HEALTH_URL).toBe('https://aicorn-ai-studio-backend-production.up.railway.app/health');
  });
});

describe('capabilityMatrix', () => {
  it('reports no privileged internal capabilities when secrets are absent', () => {
    expect(capabilityMatrix()).toEqual({
      github: false,
      supabaseApi: false,
      supabaseDb: false,
      pipelineDiagnostics: false,
      renderLegacy: false,
      railwayRuntime: false,
    });
  });

  it('enables each capability only when its required variables exist', () => {
    process.env.GITHUB_TOKEN = 'gh';
    process.env.SUPABASE_URL = 'https://x.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
    process.env.SUPABASE_DB_URL = 'postgres://x';
    process.env.RENDER_API_KEY = 'legacy';
    process.env.RAILWAY_SERVICE_ID = 'service-id';
    process.env.RAILWAY_ENVIRONMENT_ID = 'env-id';

    expect(capabilityMatrix()).toEqual({
      github: true,
      supabaseApi: true,
      supabaseDb: true,
      pipelineDiagnostics: true,
      renderLegacy: true,
      railwayRuntime: true,
    });
  });
});
