import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { github, repo } from '../lib/github.js';

function text(payload: unknown) {
  return { content: [{ type: 'text' as const, text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2) }] };
}

const WORKFLOWS = {
  ci: 'ci.yml',
} as const;

export function registerCiTools(server: McpServer): void {
  server.registerTool(
    'ci_run',
    {
      title: 'Run build/typecheck/tests for a branch',
      description:
        'Dispatches the CI workflow (TypeScript + Unit Tests, Production Build, Live Preview Canary, BenchmarkGate) ' +
        'for the given branch via GitHub Actions workflow_dispatch. Returns immediately — poll with ci_get_run_status.',
      inputSchema: { ref: z.string().describe('Branch name to run CI against') },
    },
    async ({ ref }) => {
      await github().actions.createWorkflowDispatch({ ...repo, workflow_id: WORKFLOWS.ci, ref });
      // workflow_dispatch doesn't return the run id directly — look it up.
      await new Promise(r => setTimeout(r, 3_000));
      const { data } = await github().actions.listWorkflowRuns({ ...repo, workflow_id: WORKFLOWS.ci, branch: ref, per_page: 1 });
      const run = data.workflow_runs[0];
      return text(run ? { runId: run.id, url: run.html_url, status: run.status } : { note: 'Dispatched — no run visible yet, check ci_get_run_status shortly.' });
    },
  );

  server.registerTool(
    'ci_get_run_status',
    {
      title: 'Get a CI run status',
      description: 'Status/conclusion of a GitHub Actions run and each of its jobs.',
      inputSchema: { runId: z.number().int() },
    },
    async ({ runId }) => {
      const [{ data: run }, { data: jobs }] = await Promise.all([
        github().actions.getWorkflowRun({ ...repo, run_id: runId }),
        github().actions.listJobsForWorkflowRun({ ...repo, run_id: runId }),
      ]);
      return text({
        status: run.status,
        conclusion: run.conclusion,
        url: run.html_url,
        jobs: jobs.jobs.map(j => ({ name: j.name, status: j.status, conclusion: j.conclusion })),
      });
    },
  );

  server.registerTool(
    'ci_get_run_logs',
    {
      title: 'Get CI run logs',
      description: 'Plain-text logs for one job of a workflow run (large jobs are truncated to the last ~15000 characters).',
      inputSchema: { runId: z.number().int(), jobId: z.number().int() },
    },
    async ({ runId, jobId }) => {
      void runId;
      const res = await github().actions.downloadJobLogsForWorkflowRun({ ...repo, job_id: jobId });
      const raw = typeof res.data === 'string' ? res.data : String(res.data);
      return text(raw.length > 15_000 ? `…(truncated)…\n${raw.slice(-15_000)}` : raw);
    },
  );
}
