import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  commitAndPush,
  createBranch,
  gitDiff,
  gitLog,
  gitStatus,
  grepCode,
  readFileAtRef,
  remoteRepoSlug,
  serialized,
  writeFiles,
} from '../lib/gitRepo.js';
import { github, repo } from '../lib/github.js';

function text(payload: unknown) {
  return { content: [{ type: 'text' as const, text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2) }] };
}

export function registerRepoTools(server: McpServer): void {
  server.registerTool(
    'repo_read_file',
    {
      title: 'Read a file from the Studio repo',
      description: `Reads a file's full content from ${remoteRepoSlug()} at a given ref (default: main).`,
      inputSchema: {
        path: z.string().describe('Repo-relative file path, e.g. "frontend/src/App.tsx"'),
        ref: z.string().optional().describe('Branch, tag, or commit SHA. Defaults to main.'),
      },
    },
    async ({ path, ref }) => {
      const content = await readFileAtRef(path, ref);
      return text(content);
    },
  );

  server.registerTool(
    'repo_search_code',
    {
      title: 'Search code in the Studio repo',
      description: 'Case-insensitive git grep across the repo at a given ref (default: main). Returns matching "path:line:text" entries.',
      inputSchema: {
        query: z.string().describe('Literal text or basic regex to search for'),
        ref: z.string().optional(),
      },
    },
    async ({ query, ref }) => {
      const matches = await grepCode(query, ref);
      return text(matches.length ? matches.join('\n') : 'No matches.');
    },
  );

  server.registerTool(
    'repo_git_status',
    {
      title: 'Git status',
      description: 'Status of the local working copy of the repo (used internally for staging edits before a commit).',
      inputSchema: { branch: z.string().optional() },
    },
    async ({ branch }) => text(await gitStatus(branch)),
  );

  server.registerTool(
    'repo_git_diff',
    {
      title: 'Git diff between two refs',
      description: 'Diff between two branches/commits, optionally scoped to one file.',
      inputSchema: {
        base: z.string().describe('Base ref, e.g. "main"'),
        head: z.string().describe('Head ref to compare against base'),
        path: z.string().optional(),
      },
    },
    async ({ base, head, path }) => text(await gitDiff(base, head, path)),
  );

  server.registerTool(
    'repo_git_log',
    {
      title: 'Git log',
      description: 'Recent commit history, optionally scoped to one file.',
      inputSchema: {
        path: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(20),
        ref: z.string().optional(),
      },
    },
    async ({ path, limit, ref }) => text(await gitLog(path, limit, ref)),
  );

  server.registerTool(
    'repo_create_branch',
    {
      title: 'Create a branch',
      description: 'Creates (or checks out, if it already exists) a branch from a base ref, defaulting to main.',
      inputSchema: {
        name: z.string(),
        fromRef: z.string().optional(),
      },
    },
    async ({ name, fromRef }) => {
      await serialized(() => createBranch(name, fromRef));
      return text(`Branch "${name}" ready, based on ${fromRef ?? 'main'}.`);
    },
  );

  server.registerTool(
    'repo_write_files',
    {
      title: 'Write files and commit+push',
      description:
        'Writes one or more files on the given branch (must already exist locally — call repo_create_branch first), ' +
        'then commits and pushes. No-ops (does not push an empty commit) if nothing actually changed.',
      inputSchema: {
        branch: z.string(),
        message: z.string().describe('Commit message'),
        files: z.array(z.object({ path: z.string(), content: z.string() })).min(1),
      },
    },
    async ({ branch, message, files }) => {
      const result = await serialized(async () => {
        await writeFiles(files);
        return commitAndPush(branch, message);
      });
      return text(result.pushed
        ? `Committed and pushed ${files.length} file(s) to ${branch} as ${result.sha}.`
        : 'Nothing changed — no commit made.');
    },
  );

  server.registerTool(
    'repo_delete_branch',
    {
      title: 'Delete a branch',
      description: 'Deletes a branch on the remote (e.g. to clean up after a test change). Refuses to delete main/master.',
      inputSchema: { name: z.string() },
    },
    async ({ name }) => {
      if (name === 'main' || name === 'master') return text({ error: 'Refusing to delete the default branch.' });
      await github().git.deleteRef({ ...repo, ref: `heads/${name}` });
      return text({ deleted: name });
    },
  );

  server.registerTool(
    'repo_open_pr',
    {
      title: 'Open a pull request',
      description: 'Opens a PR from an already-pushed branch against a base branch (default: main).',
      inputSchema: {
        head: z.string(),
        base: z.string().default('main'),
        title: z.string(),
        body: z.string().optional(),
      },
    },
    async ({ head, base, title, body }) => {
      const { data } = await github().pulls.create({ ...repo, head, base, title, body });
      return text({ number: data.number, url: data.html_url, state: data.state });
    },
  );

  server.registerTool(
    'repo_read_pr',
    {
      title: 'Read a pull request',
      description: 'PR metadata, description, mergeability, and check-run status.',
      inputSchema: { number: z.number().int() },
    },
    async ({ number }) => {
      const [{ data: pr }, { data: checks }] = await Promise.all([
        github().pulls.get({ ...repo, pull_number: number }),
        github().checks.listForRef({ ...repo, ref: `refs/pull/${number}/head` }).catch(() => ({ data: { check_runs: [] } })),
      ]);
      return text({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        merged: pr.merged,
        mergeable: pr.mergeable,
        mergeable_state: pr.mergeable_state,
        head: pr.head.ref,
        base: pr.base.ref,
        url: pr.html_url,
        body: pr.body,
        checks: checks.check_runs.map(c => ({ name: c.name, status: c.status, conclusion: c.conclusion })),
      });
    },
  );

  server.registerTool(
    'repo_list_prs',
    {
      title: 'List pull requests',
      description: 'Lists open (or all) pull requests.',
      inputSchema: { state: z.enum(['open', 'closed', 'all']).default('open') },
    },
    async ({ state }) => {
      const { data } = await github().pulls.list({ ...repo, state, per_page: 30 });
      return text(data.map(pr => ({ number: pr.number, title: pr.title, head: pr.head.ref, state: pr.state })));
    },
  );

  server.registerTool(
    'repo_merge_pr',
    {
      title: 'Merge a pull request into its base branch',
      description:
        'DESTRUCTIVE / high-impact: squash-merges an open PR. Only ever targets branches inside this repo. ' +
        'Use only once CI is green and the change has been reviewed.',
      inputSchema: {
        number: z.number().int(),
        mergeMethod: z.enum(['squash', 'merge', 'rebase']).default('squash'),
      },
    },
    async ({ number, mergeMethod }) => {
      const { data } = await github().pulls.merge({ ...repo, pull_number: number, merge_method: mergeMethod });
      return text(data);
    },
  );
}
