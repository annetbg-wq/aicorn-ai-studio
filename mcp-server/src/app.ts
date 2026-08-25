import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { env, repoSlug, resolvePublicBaseUrl } from './env.js';
import { requireAuth } from './auth.js';
import { oauthRouter } from './oauth/routes.js';
import { registerRepoTools } from './tools/repo.js';
import { registerCiTools } from './tools/ci.js';
import { registerDeployTools } from './tools/deploy.js';
import { registerSupabaseAdminTools } from './tools/supabaseAdmin.js';
import { registerPipelineTools } from './tools/pipeline.js';

function createServer(): McpServer {
  const mcp = new McpServer(
    { name: 'aicorn-ai-studio-superadmin', version: '0.1.0' },
    {
      instructions:
        `Superadmin dev/staging tools for the ${repoSlug()} repo and its dev/sandbox infrastructure only ` +
        '(GitHub Pages frontend, Render backend, one Supabase project). This is not a public product API — ' +
        'it exists so an external assistant can inspect, diagnose, edit, test, and deploy this one project, ' +
        'and drive its generation pipeline interactively for diagnostics. Destructive tools are marked as such ' +
        'in their own descriptions; read those before calling them.',
    },
  );

  registerRepoTools(mcp);
  registerCiTools(mcp);
  registerDeployTools(mcp);
  registerSupabaseAdminTools(mcp);
  registerPipelineTools(mcp);

  return mcp;
}

export function createApp(): express.Express {
  const app = express();
  // Render sits in front as a proxy — without this, req.ip is always Render's
  // internal proxy address for every caller, making the /authorize rate
  // limiter and the ip field in oauth/routes.ts's structured logs useless.
  app.set('trust proxy', true);
  app.use(express.json({ limit: '5mb' }));
  // OAuth's /authorize (HTML form post) and /token (RFC 6749) both use
  // application/x-www-form-urlencoded, not JSON.
  app.use(express.urlencoded({ extended: false }));

  // Loud and immediate, not just discoverable via /health — this exact
  // misconfiguration (a manually-set PUBLIC_BASE_URL missing the .onrender.com
  // suffix) previously broke every OAuth discovery URL silently, surfacing to
  // ChatGPT only as a generic "failed to resolve OAuth client".
  const baseUrlInfo = resolvePublicBaseUrl();
  if (baseUrlInfo.warning) {
    console.warn(`[mcp] CONFIG WARNING: ${baseUrlInfo.warning}`);
  }
  console.log(`[mcp] publicBaseUrl=${baseUrlInfo.url} (source: ${baseUrlInfo.source}) commit=${env.RENDER_GIT_COMMIT ?? 'unknown'}`);

  app.get('/health', (_req, res) => {
    const info = resolvePublicBaseUrl();
    res.json({
      status: 'ok',
      repo: repoSlug(),
      publicBaseUrl: info.url,
      publicBaseUrlSource: info.source,
      ...(info.warning ? { publicBaseUrlWarning: info.warning } : {}),
      commit: env.RENDER_GIT_COMMIT ?? null,
      service: env.RENDER_SERVICE_NAME ?? null,
    });
  });

  // Public — discovery metadata, dynamic client registration, and the login/
  // token endpoints are how a client gets a credential in the first place, so
  // none of these can themselves require the auth they're issuing.
  app.use(oauthRouter());

  // Stateless mode: a fresh McpServer+transport pair per request. Reusing one
  // transport across unrelated requests breaks the SDK's internal request
  // correlation — each HTTP call here is a self-contained JSON-RPC round trip.
  async function handleMcpRequest(req: express.Request, res: express.Response): Promise<void> {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = createServer();
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  app.post('/mcp', requireAuth, handleMcpRequest);
  // Streamable HTTP also uses GET (server-initiated notifications) and DELETE
  // (session teardown) on the same route — stateless mode has nothing to do
  // for either, but must still respond rather than 404.
  app.get('/mcp', requireAuth, handleMcpRequest);
  app.delete('/mcp', requireAuth, handleMcpRequest);

  return app;
}
