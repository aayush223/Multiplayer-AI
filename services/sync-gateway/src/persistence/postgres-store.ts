/**
 * CRDT Persistence Store — Snapshot Hydration, Attributed Update Log & Compaction
 *
 * Invariant 1: Fail closed on missing project_id; parameterized transaction-local RLS.
 * Invariant 3: Binary snapshots in minge.crdt_snapshots + deltas in minge.crdt_updates.
 */
import type pg from 'pg';

export type CrdtOriginType = 'human' | 'ai-peer';

export interface HydratedDelta {
  id: number;
  updateData: Uint8Array;
}

export interface HydratedRoomData {
  snapshot: Uint8Array | null;
  lastUpdateId: number;
  deltas: HydratedDelta[];
}

export interface AppendUpdateInput {
  projectId: string;
  documentId: string;
  updateData: Uint8Array;
  actorId: string;
  originType: CrdtOriginType;
  fencingToken?: number | null;
}

export interface SaveSnapshotInput {
  projectId: string;
  documentId: string;
  snapshot: Uint8Array;
  updateCount: number;
  lastUpdateId: number;
}

export interface CrdtPersistenceStore {
  hydrateRoom(projectId: string, documentId: string): Promise<HydratedRoomData>;
  appendUpdate(input: AppendUpdateInput): Promise<number>;
  saveSnapshot(input: SaveSnapshotInput): Promise<void>;
  close(): Promise<void>;
}

/**
 * PostgreSQL-backed CRDT store using strict RLS transactions in schema `minge`.
 */
export class PostgresCrdtStore implements CrdtPersistenceStore {
  constructor(private readonly pool: pg.Pool) {}

  private async withProjectTransaction<T>(
    projectId: string,
    fn: (client: pg.PoolClient) => Promise<T>
  ): Promise<T> {
    if (!projectId || projectId.trim() === '') {
      throw new Error('FAIL_CLOSED: project_id is required for CRDT persistence.');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_project_id', $1, true)`, [projectId]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async hydrateRoom(projectId: string, documentId: string): Promise<HydratedRoomData> {
    return this.withProjectTransaction(projectId, async (client) => {
      const snapRes = await client.query<{ snapshot: Buffer; last_update_id: string | number }>(
        `SELECT snapshot, last_update_id
         FROM minge.crdt_snapshots
         WHERE project_id = $1 AND document_id = $2 AND deleted_at IS NULL
         LIMIT 1`,
        [projectId, documentId]
      );

      let snapshot: Uint8Array | null = null;
      let lastUpdateId = 0;

      if (snapRes.rows[0]?.snapshot) {
        const buf = snapRes.rows[0].snapshot;
        snapshot = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        lastUpdateId = Number(snapRes.rows[0].last_update_id ?? 0);
      }

      const deltaRes = await client.query<{ id: string | number; update_data: Buffer }>(
        `SELECT id, update_data
         FROM minge.crdt_updates
         WHERE project_id = $1 AND document_id = $2 AND id > $3
         ORDER BY id ASC`,
        [projectId, documentId, lastUpdateId]
      );

      const deltas: HydratedDelta[] = deltaRes.rows.map((row) => ({
        id: Number(row.id),
        updateData: new Uint8Array(
          row.update_data.buffer,
          row.update_data.byteOffset,
          row.update_data.byteLength
        ),
      }));

      return { snapshot, lastUpdateId, deltas };
    });
  }

  async appendUpdate(input: AppendUpdateInput): Promise<number> {
    return this.withProjectTransaction(input.projectId, async (client) => {
      const res = await client.query<{ id: string | number }>(
        `INSERT INTO minge.crdt_updates
           (project_id, document_id, update_data, actor_id, origin_type, fencing_token)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          input.projectId,
          input.documentId,
          Buffer.from(input.updateData),
          input.actorId,
          input.originType,
          input.fencingToken ?? null,
        ]
      );
      return Number(res.rows[0]?.id ?? 0);
    });
  }

  async saveSnapshot(input: SaveSnapshotInput): Promise<void> {
    await this.withProjectTransaction(input.projectId, async (client) => {
      await client.query(
        `INSERT INTO minge.crdt_snapshots
           (project_id, document_id, snapshot, update_count_at_snapshot, last_update_id, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (project_id, document_id)
         DO UPDATE SET
           snapshot = EXCLUDED.snapshot,
           update_count_at_snapshot = EXCLUDED.update_count_at_snapshot,
           last_update_id = EXCLUDED.last_update_id,
           deleted_at = NULL,
           updated_at = NOW()`,
        [
          input.projectId,
          input.documentId,
          Buffer.from(input.snapshot),
          input.updateCount,
          input.lastUpdateId,
        ]
      );
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export interface StoredUpdateRecord {
  id: number;
  projectId: string;
  documentId: string;
  updateData: Uint8Array;
  actorId: string;
  originType: CrdtOriginType;
  fencingToken: number | null;
}

export interface StoredSnapshotRecord {
  projectId: string;
  documentId: string;
  snapshot: Uint8Array;
  updateCount: number;
  lastUpdateId: number;
}

/**
 * In-memory CRDT persistence store for deterministic unit tests and offline dev.
 */
export class InMemoryCrdtStore implements CrdtPersistenceStore {
  private nextId = 1;
  readonly snapshots = new Map<string, StoredSnapshotRecord>();
  readonly updates: StoredUpdateRecord[] = [];
  hydrateCallCount = 0;

  private roomKey(projectId: string, documentId: string): string {
    return `${projectId}:${documentId}`;
  }

  async hydrateRoom(projectId: string, documentId: string): Promise<HydratedRoomData> {
    if (!projectId || projectId.trim() === '') {
      throw new Error('FAIL_CLOSED: project_id is required for CRDT persistence.');
    }
    this.hydrateCallCount++;

    const snap = this.snapshots.get(this.roomKey(projectId, documentId)) ?? null;
    const lastUpdateId = snap?.lastUpdateId ?? 0;

    const deltas = this.updates
      .filter((u) => u.projectId === projectId && u.documentId === documentId && u.id > lastUpdateId)
      .map((u) => ({ id: u.id, updateData: new Uint8Array(u.updateData) }));

    return {
      snapshot: snap ? new Uint8Array(snap.snapshot) : null,
      lastUpdateId,
      deltas,
    };
  }

  async appendUpdate(input: AppendUpdateInput): Promise<number> {
    if (!input.projectId || input.projectId.trim() === '') {
      throw new Error('FAIL_CLOSED: project_id is required for CRDT persistence.');
    }
    const id = this.nextId++;
    this.updates.push({
      id,
      projectId: input.projectId,
      documentId: input.documentId,
      updateData: new Uint8Array(input.updateData),
      actorId: input.actorId,
      originType: input.originType,
      fencingToken: input.fencingToken ?? null,
    });
    return id;
  }

  async saveSnapshot(input: SaveSnapshotInput): Promise<void> {
    if (!input.projectId || input.projectId.trim() === '') {
      throw new Error('FAIL_CLOSED: project_id is required for CRDT persistence.');
    }
    this.snapshots.set(this.roomKey(input.projectId, input.documentId), {
      projectId: input.projectId,
      documentId: input.documentId,
      snapshot: new Uint8Array(input.snapshot),
      updateCount: input.updateCount,
      lastUpdateId: input.lastUpdateId,
    });
  }

  async close(): Promise<void> {
    // Nothing to close in memory
  }
}
