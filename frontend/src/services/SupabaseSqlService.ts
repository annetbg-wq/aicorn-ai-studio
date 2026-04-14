/**
 * SupabaseSqlService — frontend client for the sql-console Edge Function.
 *
 * All queries go through the Edge Function (service-role key stays server-side).
 * The browser only sends the anon key; the Edge Function verifies it's coming
 * from an authenticated service session.
 *
 * For the Studio dev environment we use the service-role key stored in
 * ConfigService (Engine keys section), since this panel is creator-only.
 */

import { supabase } from '../lib/supabase';

export interface TableInfo {
  schema: string;
  name:   string;
  type:   'table' | 'view';
}

export interface ColumnInfo {
  name:      string;
  type:      string;
  nullable:  boolean;
  default?:  string;
  isPrimary: boolean;
}

export interface QueryResult {
  rows:     Record<string, unknown>[];
  columns:  string[];
  rowCount: number;
  durationMs?: number;
}

const FUNCTION_NAME = 'sql-console';

async function callSqlConsole<T>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(FUNCTION_NAME, {
    body,
  });
  if (error) throw new Error(error.message ?? 'Edge function error');
  const res = data as unknown as { ok: boolean; error?: string } & T;
  if (!res.ok) throw new Error(res.error ?? 'Unknown error from sql-console');
  return res;
}

export const SupabaseSqlService = {
  /**
   * Fetch all accessible tables from public/auth/storage schemas.
   */
  async listTables(): Promise<TableInfo[]> {
    try {
      const res = await callSqlConsole<{ tables: TableInfo[] }>({ action: 'tables' });
      return res.tables ?? [];
    } catch {
      // Graceful fallback: use supabase-js meta if available
      return [];
    }
  },

  /**
   * Fetch column definitions for a table.
   */
  async listColumns(table: string): Promise<ColumnInfo[]> {
    try {
      const res = await callSqlConsole<{ columns: ColumnInfo[] }>({ action: 'columns', table });
      return res.columns ?? [];
    } catch {
      return [];
    }
  },

  /**
   * Execute a SELECT query and return rows + columns.
   * Throws if the query is not a SELECT or if the Edge Function rejects it.
   */
  async runQuery(sql: string): Promise<QueryResult> {
    const t0 = performance.now();
    const res = await callSqlConsole<QueryResult>({ action: 'query', sql });
    return { ...res, durationMs: Math.round(performance.now() - t0) };
  },

  /**
   * Shorthand: SELECT * FROM table LIMIT n
   */
  async previewTable(table: string, limit = 100): Promise<QueryResult> {
    return this.runQuery(`SELECT * FROM ${table} LIMIT ${limit}`);
  },
};
