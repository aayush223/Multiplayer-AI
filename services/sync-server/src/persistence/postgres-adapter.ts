/**
 * PostgreSQL Persistence Adapter for Yjs CRDT
 *
 * Invariant 3: Binary snapshots stored in minge.crdt_snapshots (bytea).
 *              Incremental updates logged in minge.crdt_updates for replay.
 *              Rooms scoped by project_id and document_id.
 *
 * Invariant 7: All tables in minge schema.
 * Invariant 1: project_id scoping on all persistence operations.
 */
import pg from 'pg';
import type { ManagedRoom } from '../rooms/manager.js';
import { encodeRoomState, loadSnapshot, markSnapshotted } from '../rooms/manager.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env['DATABASE_URL'],
      max: 10,
      idleTimeoutMillis: 30_000,
    });
    pool.on('connect', (client: pg.PoolClient) => {
      client.query('SET search_path TO minge, public;');
    });
  }
  return pool;
}

/**
 * Load the latest snapshot for a room from Postgres.
 * Returns the snapshot binary data if found, null otherwise.
 */
export async function loadSnapshotFromDB(
  projectId: string,
  documentId: string
): Promise<Uint8Array | null> {
  const client = await getPool().connect();
  try {
    await client.query(`SET LOCAL app.current_project_id = '${projectId}'`);

    const result = await client.query(
      `SELECT snapshot FROM minge.crdt_snapshots
       WHERE project_id = $1 AND document_id = $2 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [projectId, documentId]
    );

    if (result.rows.length === 0) return null;

    const snapshotBuffer = result.rows[0].snapshot as Buffer;
    return new Uint8Array(snapshotBuffer);
  } finally {
    client.release();
  }
}

/**
 * Load all incremental updates since the last snapshot.
 * Used for replay during room initialization.
 */
export async function loadUpdatesFromDB(
  projectId: string,
  documentId: string,
  afterSnapshotId?: string
): Promise<Uint8Array[]> {
  const client = await getPool().connect();
  try {
    await client.query(`SET LOCAL app.current_project_id = '${projectId}'`);

    let sql = `
      SELECT update_data FROM minge.crdt_updates
      WHERE project_id = $1 AND document_id = $2
    `;
    const params: unknown[] = [projectId, documentId];

    if (afterSnapshotId) {
      sql += ` AND id > $3`;
      params.push(afterSnapshotId);
    }

    sql += ` ORDER BY id ASC`;

    const result = await client.query(sql, params);
    return result.rows.map((row: { update_data: Buffer }) => new Uint8Array(row.update_data));
  } finally {
    client.release();
  }
}

/**
 * Persist an incremental update to the update log.
 * Called every time a client sends a Yjs update.
 */
export async function persistUpdate(
  projectId: string,
  documentId: string,
  updateData: Uint8Array
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(`SET LOCAL app.current_project_id = '${projectId}'`);

    await client.query(
      `INSERT INTO minge.crdt_updates (project_id, document_id, update_data)
       VALUES ($1, $2, $3)`,
      [projectId, documentId, Buffer.from(updateData)]
    );
  } finally {
    client.release();
  }
}

/**
 * Persist a full snapshot of a room's Yjs document state.
 * Uses UPSERT (ON CONFLICT) to maintain a single latest snapshot per room.
 */
export async function persistSnapshot(room: ManagedRoom): Promise<void> {
  const state = encodeRoomState(room);
  const client = await getPool().connect();

  try {
    await client.query(`SET LOCAL app.current_project_id = '${room.projectId}'`);

    await client.query(
      `INSERT INTO minge.crdt_snapshots
        (project_id, document_id, snapshot, update_count_at_snapshot)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, document_id)
       DO UPDATE SET
         snapshot = EXCLUDED.snapshot,
         update_count_at_snapshot = EXCLUDED.update_count_at_snapshot,
         created_at = NOW()`,
      [room.projectId, room.documentId, Buffer.from(state), room.updateCount]
    );

    markSnapshotted(room);
    console.log(`[persistence] Snapshot saved for room ${room.roomId} (${state.length} bytes)`);
  } finally {
    client.release();
  }
}

/**
 * Initialize a room from persisted state (snapshot + incremental updates).
 */
export async function initializeRoomFromDB(room: ManagedRoom): Promise<void> {
  // 1. Load the latest snapshot
  const snapshot = await loadSnapshotFromDB(room.projectId, room.documentId);
  if (snapshot) {
    loadSnapshot(room, snapshot);
  }

  // 2. Apply any incremental updates after the snapshot
  const updates = await loadUpdatesFromDB(room.projectId, room.documentId);
  const { applyUpdate } = await import('../rooms/manager.js');
  for (const update of updates) {
    applyUpdate(room, update);
  }

  console.log(`[persistence] Room ${room.roomId} initialized from DB (snapshot: ${!!snapshot}, updates: ${updates.length})`);
}

/**
 * Cleanup: close the connection pool.
 */
export async function closePersistence(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
