import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { env, repoSlug } from './env.js';
import { requireBearerAuth } from './auth.js';
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

const app = express();
app.use(express.json({ limit: '5mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', repo: repoSlug() });
});

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

app.post('/mcp', requireBearerAuth, handleMcpRequest);
// Streamable HTTP also uses GET (server-initiated notifications) and DELETE
// (session teardown) on the same route — stateless mode has nothing to do
// for either, but must still respond rather than 404.
app.get('/mcp', requireBearerAuth, handleMcpRequest);
app.delete('/mcp', requireBearerAuth, handleMcpRequest);

app.listen(env.PORT, env.HOST, () => {
  console.log(`[mcp] Superadmin MCP for ${repoSlug()} listening on http://${env.HOST}:${env.PORT}`);
});
