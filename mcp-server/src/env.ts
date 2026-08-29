// Central, typed access to this service's own configuration. Every secret named
// here lives ONLY in this service's environment (set directly in the hosting
// provider dashboard — never in git, never echoed back through any tool response).

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function required(name: string): string {
  const v = optional(name);
  if (!v) {
    throw new Error(
      `Studio MCP capability unavailable: ${name} is not configured in the Railway MCP service. ` +
      'This does not mean the ChatGPT connector is disconnected. Use the separately connected GitHub/Railway/Supabase connector when applicable, or configure this MCP-internal credential for tools that must execute inside the MCP runtime.',
    );
  }
  return v;
}

function has(...names: string[]): boolean {
  return names.every(name => Boolean(optional(name)));
}

function normalizeUrl(value: string): string {
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  return withScheme.replace(/\/+$/, '');
}

export const env = {
  PORT: Number(optional('PORT') ?? '8787'),
  HOST: optional('HOST') ?? '0.0.0.0',

  get MCP_BEARER_TOKEN() { return required('MCP_BEARER_TOKEN'); },

  get GITHUB_TOKEN() { return required('GITHUB_TOKEN'); },
  GITHUB_OWNER: optional('GITHUB_OWNER') ?? 'annetbg-wq',
  GITHUB_REPO: optional('GITHUB_REPO') ?? 'aicorn-ai-studio',

  get SUPABASE_URL() { return required('SUPABASE_URL'); },
  get SUPABASE_SERVICE_ROLE_KEY() { return required('SUPABASE_SERVICE_ROLE_KEY'); },
  get SUPABASE_DB_URL() { return required('SUPABASE_DB_URL'); },

  // Railway deploy API: use a project token scoped to this production environment,
  // never an account-wide token. Railway injects project/environment IDs itself;
  // the backend service ID is explicit because this MCP service operates on a sibling service.
  get RAILWAY_PROJECT_TOKEN() { return required('RAILWAY_PROJECT_TOKEN'); },
  get RAILWAY_PROJECT_ID() { return required('RAILWAY_PROJECT_ID'); },
  get RAILWAY_ENVIRONMENT_ID() { return required('RAILWAY_ENVIRONMENT_ID'); },
  get RAILWAY_BACKEND_SERVICE_ID() { return required('RAILWAY_BACKEND_SERVICE_ID'); },

  RAILWAY_BACKEND_URL: optional('RAILWAY_SERVICE_AICORN_AI_STUDIO_BACKEND_URL'),
  get BACKEND_HEALTH_URL() {
    const explicit = optional('BACKEND_HEALTH_URL');
    if (explicit) return explicit;
    const railwayBackend = optional('RAILWAY_SERVICE_AICORN_AI_STUDIO_BACKEND_URL');
    if (railwayBackend) return `${normalizeUrl(railwayBackend)}/health`;
    return 'https://aicorn-ai-studio-backend-production.up.railway.app/health';
  },
  PAGES_URL: optional('PAGES_URL') ?? 'https://annetbg-wq.github.io/aicorn-ai-studio/',

  get PUBLIC_BASE_URL() {
    return resolvePublicBaseUrl().url;
  },

  RAILWAY_PUBLIC_DOMAIN: optional('RAILWAY_PUBLIC_DOMAIN'),
  RAILWAY_GIT_COMMIT_SHA: optional('RAILWAY_GIT_COMMIT_SHA'),
  RAILWAY_SERVICE_NAME: optional('RAILWAY_SERVICE_NAME'),

  // Hosting fallback only. Render API control was retired when deploy tools moved to Railway.
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

export const CAPABILITY_REQUIREMENTS = {
  github: ['GITHUB_TOKEN'],
  supabaseApi: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
  supabaseDb: ['SUPABASE_DB_URL'],
  pipelineDiagnostics: ['GITHUB_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
  railwayDeploy: ['RAILWAY_PROJECT_TOKEN', 'RAILWAY_PROJECT_ID', 'RAILWAY_ENVIRONMENT_ID', 'RAILWAY_BACKEND_SERVICE_ID'],
} as const;

export interface CapabilityMatrix {
  github: boolean;
  supabaseApi: boolean;
  supabaseDb: boolean;
  pipelineDiagnostics: boolean;
  railwayDeploy: boolean;
  railwayRuntime: boolean;
}

export function capabilityMatrix(): CapabilityMatrix {
  return {
    github: has(...CAPABILITY_REQUIREMENTS.github),
    supabaseApi: has(...CAPABILITY_REQUIREMENTS.supabaseApi),
    supabaseDb: has(...CAPABILITY_REQUIREMENTS.supabaseDb),
    pipelineDiagnostics: has(...CAPABILITY_REQUIREMENTS.pipelineDiagnostics),
    railwayDeploy: has(...CAPABILITY_REQUIREMENTS.railwayDeploy),
    railwayRuntime: has('RAILWAY_SERVICE_ID', 'RAILWAY_ENVIRONMENT_ID'),
  };
}

export function capabilityDetails() {
  const matrix = capabilityMatrix();
  return Object.fromEntries(
    Object.entries(CAPABILITY_REQUIREMENTS).map(([name, requirements]) => [
      name,
      {
        configured: matrix[name as keyof CapabilityMatrix] ?? false,
        missing: requirements.filter(variable => !optional(variable)),
      },
    ]),
  );
}

export function repoSlug(): string {
  return `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
}

export interface PublicBaseUrlResolution {
  url: string;
  source: 'PUBLIC_BASE_URL' | 'RAILWAY_PUBLIC_DOMAIN' | 'RENDER_EXTERNAL_URL' | 'localhost-fallback';
  warning?: string;
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function railwayPublicUrl(domain: string): string {
  return normalizeUrl(domain);
}

export function resolvePublicBaseUrl(): PublicBaseUrlResolution {
  const manual = optional('PUBLIC_BASE_URL');
  const railwayDomain = optional('RAILWAY_PUBLIC_DOMAIN');
  const renderUrl = optional('RENDER_EXTERNAL_URL');

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
        warning: `PUBLIC_BASE_URL="${url}" does not match legacy RENDER_EXTERNAL_URL="${normalizedRenderUrl}". ` +
          'OAuth discovery metadata will advertise the wrong endpoints unless this is intentional.',
      };
    }
    return { url, source: 'PUBLIC_BASE_URL' };
  }

  if (renderUrl) {
    return { url: stripTrailingSlashes(renderUrl), source: 'RENDER_EXTERNAL_URL' };
  }

  return { url: `http://localhost:${optional('PORT') ?? '8787'}`, source: 'localhost-fallback' };
}
