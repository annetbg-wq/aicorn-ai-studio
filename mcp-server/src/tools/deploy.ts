import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  getBackendLogs,
  getBackendServiceInstance,
  listBackendEnvVarKeys,
  listDeployments,
  triggerBackendDeploy,
} from '../lib/railway.js';
import { github, repo } from '../lib/github.js';
import { env } from '../env.js';

function text(payload: unknown) {
  return { content: [{ type: 'text' as const, text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2) }] };
}

export function registerDeployTools(server: McpServer): void {
  server.registerTool(
    'deploy_trigger_backend',
    {
      title: 'Trigger Railway backend deploy',
      description:
        'Triggers a deployment of the active Railway Studio backend. Requires a Railway project token scoped to this production environment. ' +
        'The legacy clearCache input is retained only to keep the MCP schema stable; Railway does not expose the same Render cache flag.',
      inputSchema: { clearCache: z.boolean().default(false) },
    },
    async ({ clearCache }) => {
      const deploy = await triggerBackendDeploy();
      return text({
        ...deploy,
        provider: 'railway',
        ...(clearCache ? { note: 'clearCache is a legacy compatibility input and has no Railway equivalent; deploy was triggered normally.' } : {}),
      });
    },
  );

  server.registerTool(
    'deploy_get_backend_status',
    {
      title: 'Get Railway backend status/history',
      description: 'Returns the active Railway backend service instance plus recent deployments. Requires the MCP Railway deploy capability.',
      inputSchema: { limit: z.number().int().min(1).max(30).default(5) },
    },
    async ({ limit }) => {
      const [service, deployments] = await Promise.all([
        getBackendServiceInstance(),
        listDeployments(limit),
      ]);
      return text({ provider: 'railway', service, deployments });
    },
  );

  server.registerTool(
    'deploy_get_backend_logs',
    {
      title: 'Get Railway backend logs',
      description: 'Returns runtime logs for the latest Railway backend deployment. Requires the MCP Railway deploy capability.',
      inputSchema: { limit: z.number().int().min(1).max(500).default(100) },
    },
    async ({ limit }) => text({ provider: 'railway', ...(await getBackendLogs(limit)) }),
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
      description: 'Hits the active Railway backend /health endpoint and the GitHub Pages URL. Requires no GitHub, Supabase, Render, or Railway API credential.',
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
      title: 'List Railway backend env var names',
      description: 'Returns only variable names for the active Railway backend. Values are always discarded. Requires the MCP Railway deploy capability.',
      inputSchema: {},
    },
    async () => text(await listBackendEnvVarKeys()),
  );
}
