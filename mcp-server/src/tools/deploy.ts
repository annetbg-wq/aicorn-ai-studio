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
      title: 'Trigger a backend deploy on Render',
      description: 'Triggers a fresh deploy of the aicorn-ai-studio-backend Render service from its current default-branch HEAD.',
      inputSchema: { clearCache: z.boolean().default(false) },
    },
    async ({ clearCache }) => {
      const serviceId = await findBackendServiceId();
      const deploy = await triggerDeploy(serviceId, clearCache);
      return text(deploy);
    },
  );

  server.registerTool(
    'deploy_get_backend_status',
    {
      title: 'Get backend deploy status/history',
      description: 'Recent deploy history for the Render backend service, plus its current live URL/state.',
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
      title: 'Get recent backend logs',
      description: 'Recent Render runtime logs for the backend service.',
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
      description: 'Status of the most recent deploy-pages.yml GitHub Actions run (the frontend deploy).',
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
      title: 'Check live health of both deploy targets',
      description: 'Hits the real backend /health endpoint and the real Pages URL and reports what actually came back.',
      inputSchema: {},
    },
    async () => {
      const [backend, pages] = await Promise.all([
        fetch(env.BACKEND_HEALTH_URL).then(async r => ({ status: r.status, body: await r.text().catch(() => '') })).catch(e => ({ error: String(e) })),
        fetch(env.PAGES_URL).then(r => ({ status: r.status })).catch(e => ({ error: String(e) })),
      ]);
      return text({ backend, pages });
    },
  );

  server.registerTool(
    'config_list_backend_env_keys',
    {
      title: 'List backend env var names (never values)',
      description: 'Names of environment variables configured on the Render backend service. Values are never returned by this tool.',
      inputSchema: {},
    },
    async () => {
      const serviceId = await findBackendServiceId();
      const keys = await listEnvVarKeys(serviceId);
      return text(keys.sort());
    },
  );
}
