import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { capabilityMatrix, env, repoSlug, resolvePublicBaseUrl } from './env.js';
import { requireAuth } from './auth.js';
import { oauthRouter } from './oauth/routes.js';
import { registerRepoTools } from './tools/repo.js';
import { registerCiTools } from './tools/ci.js';
import { registerDeployTools } from './tools/deploy.js';
import { registerSupabaseAdminTools } from './tools/supabaseAdmin.js';
import { registerPipelineTools } from './tools/pipeline.js';

function createServer(): McpServer {
  const mcp = new McpServer(
    { name: 'aicorn-ai-studio-superadmin', version: '0.2.1' },
    {
      instructions:
        `Superadmin dev/staging tools for the ${repoSlug()} repo and its dev/sandbox infrastructure only ` +
        '(GitHub Pages frontend, Railway backend/MCP, one Supabase project). This is not a public product API. ' +
        'The tool catalog is intentionally stable across deployments so MCP clients can cache schemas safely. ' +
        'GET /health reports which internal credential-backed capabilities are currently configured. ChatGPT may also ' +
        'use separately connected GitHub, Railway, and Supabase connectors for infrastructure operations.',
    },
  );

  // Keep names/schemas stable. Individual calls report a clear configuration
  // error when their MCP-internal credential is not configured.
  registerRepoTools(mcp);
  registerCiTools(mcp);
  registerDeployTools(mcp);
  registerSupabaseAdminTools(mcp);
  registerPipelineTools(mcp);

  return mcp;
}

export function createApp(): express.Express {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: false }));

  const baseUrlInfo = resolvePublicBaseUrl();
  const capabilities = capabilityMatrix();
  if (baseUrlInfo.warning) {
    console.warn(`[mcp] CONFIG WARNING: ${baseUrlInfo.warning}`);
  }
  console.log(
    `[mcp] publicBaseUrl=${baseUrlInfo.url} (source: ${baseUrlInfo.source}) ` +
    `commit=${env.DEPLOY_GIT_COMMIT ?? 'unknown'} capabilities=${JSON.stringify(capabilities)}`,
  );

  app.get('/health', (_req, res) => {
    const info = resolvePublicBaseUrl();
    res.json({
      status: 'ok',
      repo: repoSlug(),
      publicBaseUrl: info.url,
      publicBaseUrlSource: info.source,
      ...(info.warning ? { publicBaseUrlWarning: info.warning } : {}),
      backendHealthUrl: env.BACKEND_HEALTH_URL,
      capabilities: capabilityMatrix(),
      commit: env.DEPLOY_GIT_COMMIT ?? null,
      service: env.DEPLOY_SERVICE_NAME ?? null,
    });
  });

  app.use(oauthRouter());

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
  app.get('/mcp', requireAuth, handleMcpRequest);
  app.delete('/mcp', requireAuth, handleMcpRequest);

  return app;
}
