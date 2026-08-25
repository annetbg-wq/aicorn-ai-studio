import pg from 'pg';
import { env } from '../env.js';

let pool: pg.Pool | undefined;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: env.SUPABASE_DB_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

/** Runs a full SQL script (may contain multiple ;-separated statements, e.g. a migration file) as one round-trip. */
export async function execScript(sql: string): Promise<pg.QueryResult[]> {
  const client = await getPool().connect();
  try {
    // node-postgres's simple query protocol (no params) natively supports
    // multiple statements in one call — this is what migration files need.
    const result = await client.query(sql);
    return Array.isArray(result) ? result : [result];
  } finally {
    client.release();
  }
}

/** Single statement, optionally parameterized. */
export async function execQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query(sql, params);
  return res.rows as T[];
}
