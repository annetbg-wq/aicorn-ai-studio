import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findBackendServiceId, getLogs, getService, listDeploys, listEnvVarKeys, triggerDeploy } from '../lib/render.js';
import { github, repo } from '../lib/github.js';
import { env } from '../env.js';

function text(payload: unknown) {
  return { content: [{ type: 'text' as const, text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2) }] };
}

export interface DeployToolCapabilities {
  github: boolean;
  renderLegacy: boolean;
}

export function registerDeployTools(server: McpServer, capabilities: DeployToolCapabilities): void {
  // These tools are retained solely for an intentionally configured legacy
  // Render deployment. The current Studio backend lives on Railway.
  if (capabilities.renderLegacy) {
    server.registerTool(
      'deploy_trigger_backend',
      {
        title: 'Trigger legacy Render backend deploy',
        description: 'Legacy-only: triggers the old Render backend service. The active Studio backend is hosted on Railway.',
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
        title: 'Get legacy Render backend status/history',
        description: 'Legacy-only: recent deploy history for the old Render backend service.',
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
        description: 'Legacy-only: recent Render runtime logs for the old backend service.',
        inputSchema: { limit: z.number().int().min(1).max(500).default(100) },
      },
      async ({ limit }) => {
        const serviceId = await findBackendServiceId();
        return text(await getLogs(serviceId, limit));
      },
    );

    server.registerTool(
      'config_list_backend_env_keys',
      {
        title: 'List legacy Render backend env var names',
        description: 'Legacy-only: names of variables configured on the old Render backend service. Values are never returned.',
        inputSchema: {},
      },
      async () => {
        const serviceId = await findBackendServiceId();
        const keys = await listEnvVarKeys(serviceId);
        return text(keys.sort());
      },
    );
  }

  if (capabilities.github) {
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
  }

  // Always available: it needs no provider credential and reports the actually
  // configured live backend URL plus the public GitHub Pages frontend.
  server.registerTool(
    'deploy_get_health',
    {
      title: 'Check live Studio health',
      description: 'Hits the active backend /health endpoint and the GitHub Pages URL and reports what actually came back.',
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
}
