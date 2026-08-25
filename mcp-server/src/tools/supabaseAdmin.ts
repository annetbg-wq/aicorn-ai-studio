import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { execQuery, execScript } from '../lib/pg.js';
import { readFileAtRef } from '../lib/gitRepo.js';
import { github, repo } from '../lib/github.js';

function text(payload: unknown) {
  return { content: [{ type: 'text' as const, text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2) }] };
}

export function registerSupabaseAdminTools(server: McpServer): void {
  server.registerTool(
    'supabase_get_schema',
    {
      title: 'Read table schema',
      description: 'Columns, types, and nullability for one table (public schema). Read-only.',
      inputSchema: { table: z.string().describe('Table name, e.g. "diagnostic_runs"') },
    },
    async ({ table }) => {
      const rows = await execQuery(
        `select column_name, data_type, is_nullable, column_default
         from information_schema.columns
         where table_schema = 'public' and table_name = $1
         order by ordinal_position`,
        [table],
      );
      return text(rows);
    },
  );

  server.registerTool(
    'supabase_list_migrations',
    {
      title: 'List migration files',
      description: 'Migration filenames under supabase/migrations/ on the given ref (git — the source of truth for what CAN be run; this does not report which ones have actually been applied to the live DB).',
      inputSchema: { ref: z.string().default('main') },
    },
    async ({ ref }) => {
      const { data } = await github().repos.getContent({ ...repo, path: 'supabase/migrations', ref });
      const files = Array.isArray(data) ? data.filter(f => f.type === 'file').map(f => f.name).sort() : [];
      return text(files);
    },
  );

  server.registerTool(
    'supabase_run_migration',
    {
      title: 'Run a development migration from an existing repo file',
      description:
        'DESTRUCTIVE / high-impact: executes a SQL file that already exists at supabase/migrations/<filename> on the ' +
        'main branch, against the dev/sandbox Supabase project\'s Postgres directly (bypasses RLS). Does NOT accept ' +
        'inline SQL — the file must already be committed (and therefore visible in git history/PR diffs) before this ' +
        'tool can run it. Use repo_write_files + repo_open_pr to add the migration file first, get it merged (or run ' +
        'it from a branch you\'ve reviewed), then call this tool with just the filename.',
      inputSchema: {
        filename: z.string().describe('Filename only, e.g. "20260826_diagnostic_runs.sql" — must exist under supabase/migrations/'),
        ref: z.string().default('main').describe('Branch/ref to read the file from'),
      },
    },
    async ({ filename, ref }) => {
      if (filename.includes('/') || filename.includes('..')) {
        return text({ error: 'filename must be a bare filename inside supabase/migrations/, no path segments.' });
      }
      const sql = await readFileAtRef(`supabase/migrations/${filename}`, ref);
      const results = await execScript(sql);
      return text({
        ok: true,
        filename,
        ref,
        statementsRun: results.length,
        rowCounts: results.map(r => r.rowCount ?? 0),
      });
    },
  );

  server.registerTool(
    'supabase_query',
    {
      title: 'Run a read-only diagnostic query',
      description: 'Runs a single SELECT statement against the dev/sandbox Supabase project. Rejects anything that is not exactly one SELECT.',
      inputSchema: { sql: z.string() },
    },
    async ({ sql }) => {
      const trimmed = sql.trim().replace(/;+\s*$/, '');
      if (!/^select\s/i.test(trimmed) || /;/.test(trimmed)) {
        return text({ error: 'Only a single SELECT statement is allowed.' });
      }
      const rows = await execQuery(trimmed);
      return text(rows);
    },
  );
}
