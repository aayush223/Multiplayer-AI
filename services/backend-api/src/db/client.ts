/**
 * Database Client — pg connection pool with project-scoped RLS context.
 *
 * Invariant 1: Every query that operates on project-scoped tables
 *              MUST call setProjectContext() first to set `app.current_project_id`
 *              in the Postgres session. RLS policies enforce isolation.
 *
 * Invariant 7: Dedicated `minge` schema. search_path is set on every connection.
 */
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env['DATABASE_URL'],
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    // Set search_path to minge schema on every new connection
    pool.on('connect', (client: pg.PoolClient) => {
      client.query('SET search_path TO minge, public;');
    });
  }
  return pool;
}

/**
 * Execute a query within a project-scoped RLS context.
 * This sets `app.current_project_id` for the duration of the client checkout,
 * ensuring tenant isolation at the Postgres level.
 *
 * Invariant 1: If projectId is empty/undefined, fail closed — return empty results.
 */
export async function withProjectScope<T>(
  projectId: string,
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  // Fail closed: if project_id is missing, return empty immediately
  if (!projectId || projectId.trim() === '') {
    throw new Error('FAIL_CLOSED: project_id is required for scoped queries. Refusing unscoped access.');
  }

  const client = await getPool().connect();
  try {
    // Set the RLS context variable for this session
    await client.query(`SET LOCAL app.current_project_id = '${projectId}'`);
    return await callback(client);
  } finally {
    client.release();
  }
}

/**
 * Execute an unscoped query (only for operations that don't need project context,
 * like listing projects or auth lookups).
 */
export async function query(text: string, params?: unknown[]): Promise<pg.QueryResult> {
  return getPool().query(text, params);
}

/**
 * Run the schema migration from schema.sql
 */
export async function migrate(): Promise<void> {
  const schemaPath = resolve(__dirname, 'schema.sql');
  const sql = readFileSync(schemaPath, 'utf-8');
  await getPool().query(sql);
  console.log('[db] Schema migration completed successfully.');
}

/**
 * Graceful shutdown
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
