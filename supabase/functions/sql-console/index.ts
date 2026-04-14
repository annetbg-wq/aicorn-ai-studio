/**
 * sql-console — Supabase Edge Function (service-role secured)
 *
 * POST /sql-console   { action: 'query', sql: string }
 *   → { ok: true, rows: unknown[], columns: string[], rowCount: number }
 *
 * POST /sql-console   { action: 'tables' }
 *   → { ok: true, tables: TableInfo[] }
 *
 * POST /sql-console   { action: 'columns', table: string }
 *   → { ok: true, columns: ColumnInfo[] }
 *
 * Security:
 *   - Requires Authorization: Bearer <service_role_key> header
 *   - SQL allowlist: only SELECT statements (DML/DDL blocked)
 *   - Max result rows: 500
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_ROWS = 500;

// Only SELECT statements allowed — no DML/DDL
function isSafeQuery(sql: string): boolean {
  const normalized = sql.trim().toLowerCase();
  // Must start with SELECT or WITH (for CTEs that end in SELECT)
  if (!normalized.startsWith('select') && !normalized.startsWith('with')) return false;
  // Block any write/admin keywords
  const blocked = /\b(insert|update|delete|drop|create|alter|truncate|grant|revoke|copy|vacuum|reindex|cluster|execute|call|do\b)/i;
  if (blocked.test(sql)) return false;
  return true;
}

interface TableInfo {
  schema: string;
  name: string;
  type: string;
  rowCount?: number;
}

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default?: string;
  isPrimary: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Verify service-role authorization
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!token || token !== serviceRoleKey) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
  );

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const action = body.action as string;

  try {
    // ── List tables ────────────────────────────────────────────────────────
    if (action === 'tables') {
      const { data, error } = await supabase.rpc('sql_console_tables').select('*');
      if (error) {
        // Fallback: raw information_schema query
        const { data: rawData, error: rawErr } = await supabase
          .from('information_schema.tables' as never)
          .select('table_schema, table_name, table_type')
          .in('table_schema', ['public', 'auth', 'storage'])
          .order('table_schema')
          .order('table_name');
        if (rawErr) throw rawErr;
        const tables: TableInfo[] = (rawData ?? []).map((r: Record<string, string>) => ({
          schema: r.table_schema,
          name:   r.table_name,
          type:   r.table_type === 'VIEW' ? 'view' : 'table',
        }));
        return new Response(JSON.stringify({ ok: true, tables }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, tables: data ?? [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── List columns for a table ───────────────────────────────────────────
    if (action === 'columns') {
      const table = body.table as string;
      if (!table) throw new Error('table param required');

      // Query information_schema via raw SQL through pg_meta approach
      const sql = `
        SELECT
          c.column_name      AS name,
          c.data_type        AS type,
          c.is_nullable      AS nullable,
          c.column_default   AS "default",
          CASE WHEN kcu.column_name IS NOT NULL THEN true ELSE false END AS "isPrimary"
        FROM information_schema.columns c
        LEFT JOIN information_schema.key_column_usage kcu
          ON kcu.table_name = c.table_name
          AND kcu.column_name = c.column_name
          AND kcu.constraint_name IN (
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE constraint_type = 'PRIMARY KEY' AND table_name = c.table_name
          )
        WHERE c.table_name = '${table.replace(/'/g, "''")}'
        ORDER BY c.ordinal_position
      `;

      const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      });

      if (!res.ok) {
        // Simpler fallback
        const { data, error } = await supabase
          .from('information_schema.columns' as never)
          .select('column_name, data_type, is_nullable, column_default')
          .eq('table_name', table)
          .order('ordinal_position' as never);
        if (error) throw error;
        const columns: ColumnInfo[] = (data ?? []).map((r: Record<string, string>) => ({
          name:      r.column_name,
          type:      r.data_type,
          nullable:  r.is_nullable === 'YES',
          default:   r.column_default,
          isPrimary: false,
        }));
        return new Response(JSON.stringify({ ok: true, columns }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const columns = await res.json();
      return new Response(JSON.stringify({ ok: true, columns: columns ?? [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Execute SELECT query ───────────────────────────────────────────────
    if (action === 'query') {
      const sql = (body.sql as string ?? '').trim();
      if (!sql) throw new Error('sql param required');
      if (!isSafeQuery(sql)) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'Only SELECT queries are allowed. INSERT / UPDATE / DELETE / DDL are blocked.',
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Add LIMIT if not present
      const limited = /\blimit\b/i.test(sql) ? sql : `${sql} LIMIT ${MAX_ROWS}`;

      // Use the REST /rpc endpoint for raw SQL execution (requires pg_net or exec_sql function)
      // We call supabase.rpc or fall back to a direct REST fetch to the db query API.
      const pgRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/`, {
        method:  'HEAD',
        headers: { 'apikey': serviceRoleKey },
      });
      void pgRes; // just checking connectivity

      // Use direct postgres query via supabase-js query builder escape hatch
      // supabase-js doesn't expose raw SQL; use fetch to the PostgREST /rpc if exec_sql exists
      const rpcRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({ query: limited }),
      });

      if (rpcRes.ok) {
        const rows = await rpcRes.json();
        const firstRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : {};
        const columns = typeof firstRow === 'object' && firstRow !== null
          ? Object.keys(firstRow)
          : [];
        return new Response(JSON.stringify({
          ok: true, rows: rows ?? [], columns, rowCount: rows?.length ?? 0,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Fallback: simple table fetch for basic "SELECT * FROM table" patterns
      const simpleMatch = /^select\s+\*\s+from\s+["']?(\w+)["']?\s*(?:limit\s+\d+)?$/i.exec(sql);
      if (simpleMatch) {
        const tableName = simpleMatch[1];
        const { data, error } = await supabase.from(tableName).select('*').limit(MAX_ROWS);
        if (error) throw error;
        const rows = data ?? [];
        const firstRow = rows.length > 0 ? rows[0] : {};
        const columns = Object.keys(firstRow as object);
        return new Response(JSON.stringify({ ok: true, rows, columns, rowCount: rows.length }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      throw new Error('exec_sql RPC function not available. Deploy the helper function first.');
    }

    return new Response(JSON.stringify({ ok: false, error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
