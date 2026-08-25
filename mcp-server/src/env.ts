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
};

export function repoSlug(): string {
  return `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
}
