import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findBackendServiceId, getLogs, getService, listDeploys, listEnvVarKeys, triggerDeploy } from '../lib/render.js';
import { github, repo } from '../lib/github.js';
import { env } from '../env.js';

function text(payload: unknown) {
  return { content: [{ type: 'text' as const, text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2) }] };
}

export function registerDeployTools(server: McpServer): void {
  server.registerTool(
    'deploy_trigger_backend',
    {
      title: 'Trigger legacy Render backend deploy',
      description: 'Legacy-only compatibility tool. The active Studio backend is on Railway; this call requires RENDER_API_KEY inside the MCP service.',
      inputSchema: { clearCache: z.boolean().default(false) },
    },
    async ({ clearCache }) => {
      const serviceId = await findBackendServiceId();
      return text(await triggerDeploy(serviceId, clearCache));
    },
  );

  server.registerTool(
    'deploy_get_backend_status',
    {
      title: 'Get legacy Render backend status/history',
      description: 'Legacy-only compatibility tool requiring RENDER_API_KEY inside the MCP service.',
      inputSchema: { limit: z.number().int().min(1).max(30).default(5) },
    },
    async ({ limit }) => {
      const serviceId = await findBackendServiceId();
      const [service, deploys] = await Promise.all([getService(serviceId), listDeploys(serviceId, limit)]);
      return text({ service, deploys });
    },
  );

  server.registerTool(
    'deploy_get_backend_logs',
    {
      title: 'Get legacy Render backend logs',
      description: 'Legacy-only compatibility tool requiring RENDER_API_KEY inside the MCP service.',
      inputSchema: { limit: z.number().int().min(1).max(500).default(100) },
    },
    async ({ limit }) => {
      const serviceId = await findBackendServiceId();
      return text(await getLogs(serviceId, limit));
    },
  );

  server.registerTool(
    'deploy_get_pages_status',
    {
      title: 'Get GitHub Pages deploy status',
      description: 'Status of the most recent deploy-pages.yml GitHub Actions run. Requires GITHUB_TOKEN inside the MCP service.',
      inputSchema: {},
    },
    async () => {
      const { data } = await github().actions.listWorkflowRuns({ ...repo, workflow_id: 'deploy-pages.yml', per_page: 1 });
      const run = data.workflow_runs[0];
      return text(run ? { status: run.status, conclusion: run.conclusion, url: run.html_url, headSha: run.head_sha } : { note: 'No runs found.' });
    },
  );

  server.registerTool(
    'deploy_get_health',
    {
      title: 'Check live Studio health',
      description: 'Hits the active Railway backend /health endpoint and the GitHub Pages URL. Requires no GitHub, Supabase, or Render credential.',
      inputSchema: {},
    },
    async () => {
      const [backend, pages] = await Promise.all([
        fetch(env.BACKEND_HEALTH_URL).then(async r => ({ status: r.status, body: await r.text().catch(() => '') })).catch(e => ({ error: String(e) })),
        fetch(env.PAGES_URL).then(r => ({ status: r.status })).catch(e => ({ error: String(e) })),
      ]);
      return text({ backendUrl: env.BACKEND_HEALTH_URL, backend, pagesUrl: env.PAGES_URL, pages });
    },
  );

  server.registerTool(
    'config_list_backend_env_keys',
    {
      title: 'List legacy Render backend env var names',
      description: 'Legacy-only compatibility tool requiring RENDER_API_KEY inside the MCP service. Values are never returned.',
      inputSchema: {},
    },
    async () => {
      const serviceId = await findBackendServiceId();
      return text((await listEnvVarKeys(serviceId)).sort());
    },
  );
}
