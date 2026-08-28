// Central, typed access to this service's own configuration. Every secret named
// here lives ONLY in this service's environment (set directly in the hosting
// provider dashboard — never in git, never echoed back through any tool response).

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
   * URLs pointing back at this service). Railway supplies RAILWAY_PUBLIC_DOMAIN as
   * a bare hostname; Render supplies RENDER_EXTERNAL_URL as a complete URL.
   * PUBLIC_BASE_URL remains available for local dev or a deliberate custom-domain
   * override. See resolvePublicBaseUrl() for precedence and mismatch diagnostics.
   */
  get PUBLIC_BASE_URL() {
    return resolvePublicBaseUrl().url;
  },

  // Hosting providers auto-populate these — surfaced (not secret) for /health and
  // startup diagnostics, so "is the right code actually deployed, with the right
  // config" is answerable with one curl instead of dashboard access.
  RAILWAY_PUBLIC_DOMAIN: optional('RAILWAY_PUBLIC_DOMAIN'),
  RAILWAY_GIT_COMMIT_SHA: optional('RAILWAY_GIT_COMMIT_SHA'),
  RAILWAY_SERVICE_NAME: optional('RAILWAY_SERVICE_NAME'),
  RENDER_EXTERNAL_URL: optional('RENDER_EXTERNAL_URL'),
  RENDER_GIT_COMMIT: optional('RENDER_GIT_COMMIT'),
  RENDER_SERVICE_NAME: optional('RENDER_SERVICE_NAME'),

  get DEPLOY_GIT_COMMIT() {
    return optional('RAILWAY_GIT_COMMIT_SHA') ?? optional('RENDER_GIT_COMMIT');
  },
  get DEPLOY_SERVICE_NAME() {
    return optional('RAILWAY_SERVICE_NAME') ?? optional('RENDER_SERVICE_NAME');
  },
};

export function repoSlug(): string {
  return `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
}

export interface PublicBaseUrlResolution {
  url: string;
  source: 'PUBLIC_BASE_URL' | 'RAILWAY_PUBLIC_DOMAIN' | 'RENDER_EXTERNAL_URL' | 'localhost-fallback';
  /** Set when PUBLIC_BASE_URL disagrees with the active hosting provider's URL. */
  warning?: string;
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function railwayPublicUrl(domain: string): string {
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(domain) ? domain : `https://${domain}`;
  return stripTrailingSlashes(withScheme);
}

export function resolvePublicBaseUrl(): PublicBaseUrlResolution {
  const manual = optional('PUBLIC_BASE_URL');
  const railwayDomain = optional('RAILWAY_PUBLIC_DOMAIN');
  const renderUrl = optional('RENDER_EXTERNAL_URL');

  // On Railway this system variable is authoritative. In particular, do not
  // let a copied PUBLIC_BASE_URL=http://localhost:... poison production OAuth
  // metadata. Railway updates the value when the service domain changes.
  if (railwayDomain) {
    const url = railwayPublicUrl(railwayDomain);
    const manualUrl = manual ? stripTrailingSlashes(manual) : undefined;
    return {
      url,
      source: 'RAILWAY_PUBLIC_DOMAIN',
      ...(manualUrl && manualUrl !== url
        ? { warning: `Ignoring PUBLIC_BASE_URL="${manualUrl}" because Railway provides RAILWAY_PUBLIC_DOMAIN="${url}".` }
        : {}),
    };
  }

  if (manual) {
    const url = stripTrailingSlashes(manual);
    const normalizedRenderUrl = renderUrl ? stripTrailingSlashes(renderUrl) : undefined;
    if (normalizedRenderUrl && normalizedRenderUrl !== url) {
      return {
        url,
        source: 'PUBLIC_BASE_URL',
        warning: `PUBLIC_BASE_URL="${url}" does not match RENDER_EXTERNAL_URL="${normalizedRenderUrl}". ` +
          'OAuth discovery metadata will advertise the wrong endpoints unless this is intentional (e.g. a custom domain in front of the hosting provider). ' +
          'If not: delete PUBLIC_BASE_URL so the service auto-derives the provider URL.',
      };
    }
    return { url, source: 'PUBLIC_BASE_URL' };
  }

  if (renderUrl) {
    return { url: stripTrailingSlashes(renderUrl), source: 'RENDER_EXTERNAL_URL' };
  }

  return { url: `http://localhost:${optional('PORT') ?? '8787'}`, source: 'localhost-fallback' };
}
