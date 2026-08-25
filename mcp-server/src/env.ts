// Central, typed access to this service's own configuration. Every secret named
// here lives ONLY in this service's environment (set directly in the Render
// dashboard — never in git, never echoed back through any tool response).

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function required(name: string): string {
  const v = optional(name);
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export const env = {
  PORT: Number(optional('PORT') ?? '8787'),
  HOST: optional('HOST') ?? '0.0.0.0',

  /** Bearer token the MCP host (ChatGPT connector) must present. Minted by us, not GitHub/Supabase/Render. */
  get MCP_BEARER_TOKEN() { return required('MCP_BEARER_TOKEN'); },

  get GITHUB_TOKEN() { return required('GITHUB_TOKEN'); },
  GITHUB_OWNER: optional('GITHUB_OWNER') ?? 'annetbg-wq',
  GITHUB_REPO: optional('GITHUB_REPO') ?? 'aicorn-ai-studio',

  get SUPABASE_URL() { return required('SUPABASE_URL'); },
  get SUPABASE_SERVICE_ROLE_KEY() { return required('SUPABASE_SERVICE_ROLE_KEY'); },
  /** Direct Postgres connection string (Project Settings -> Database -> Connection string). Used only by schema/migration/query tools, which need real multi-statement SQL — the REST/RPC surface can't run migration files as-is. */
  get SUPABASE_DB_URL() { return required('SUPABASE_DB_URL'); },

  get RENDER_API_KEY() { return required('RENDER_API_KEY'); },
  RENDER_BACKEND_SERVICE_ID: optional('RENDER_BACKEND_SERVICE_ID'),

  BACKEND_HEALTH_URL: optional('BACKEND_HEALTH_URL') ?? 'https://aicorn-ai-studio-backend.onrender.com/health',
  PAGES_URL: optional('PAGES_URL') ?? 'https://annetbg-wq.github.io/aicorn-ai-studio/',

  /**
   * This service's own externally-reachable base URL — needed for OAuth discovery
   * metadata (issuer/authorization_endpoint/token_endpoint all have to be absolute
   * URLs pointing back at this service). RENDER_EXTERNAL_URL is set automatically
   * by Render on every web service (always the full https://<name>.onrender.com,
   * per Render's docs — never just the bare service name), no configuration needed
   * there; PUBLIC_BASE_URL is only for local dev / overriding it. See
   * resolvePublicBaseUrl() below for why an override here is worth double-checking.
   */
  get PUBLIC_BASE_URL() {
    return resolvePublicBaseUrl().url;
  },

  // Render auto-populates these — surfaced (not secret) for /health and startup
  // diagnostics, so "is the right code actually deployed, with the right config"
  // is answerable with one curl instead of dashboard access.
  RENDER_EXTERNAL_URL: optional('RENDER_EXTERNAL_URL'),
  RENDER_GIT_COMMIT: optional('RENDER_GIT_COMMIT'),
  RENDER_SERVICE_NAME: optional('RENDER_SERVICE_NAME'),
};

export function repoSlug(): string {
  return `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
}

export interface PublicBaseUrlResolution {
  url: string;
  source: 'PUBLIC_BASE_URL' | 'RENDER_EXTERNAL_URL' | 'localhost-fallback';
  /** Set when PUBLIC_BASE_URL was manually configured and disagrees with Render's own RENDER_EXTERNAL_URL — almost always a typo'd override, not an intentional one. */
  warning?: string;
}

export function resolvePublicBaseUrl(): PublicBaseUrlResolution {
  const manual = optional('PUBLIC_BASE_URL');
  const renderUrl = optional('RENDER_EXTERNAL_URL');

  if (manual) {
    const url = manual.replace(/\/+$/, '');
    if (renderUrl && renderUrl.replace(/\/+$/, '') !== url) {
      return {
        url,
        source: 'PUBLIC_BASE_URL',
        warning: `PUBLIC_BASE_URL="${url}" does not match Render's own RENDER_EXTERNAL_URL="${renderUrl}". ` +
          'OAuth discovery metadata will advertise the wrong endpoints unless this is intentional (e.g. a custom domain in front of Render). ' +
          'If not: delete the PUBLIC_BASE_URL env var in the Render dashboard so it auto-derives correctly.',
      };
    }
    return { url, source: 'PUBLIC_BASE_URL' };
  }

  if (renderUrl) {
    return { url: renderUrl.replace(/\/+$/, ''), source: 'RENDER_EXTERNAL_URL' };
  }

  return { url: `http://localhost:${optional('PORT') ?? '8787'}`, source: 'localhost-fallback' };
}
