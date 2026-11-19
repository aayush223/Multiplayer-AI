/**
 * Memory Store — Project-scoped, append-only memory with vector retrieval.
 *
 * Invariant 1: FAIL CLOSED — all operations require a valid project_id.
 *              If project_id is missing, undefined, or empty, return empty immediately.
 *
 * Invariant 2: APPEND-ONLY — updates insert new versions and set superseded_by_id
 *              on the old record. Active queries filter: superseded_by_id IS NULL AND deleted_at IS NULL.
 *
 * Invariant 6: SOFT-DELETE — deleted_at is set instead of hard deleting. 30-day recovery.
 */
import { withProjectScope } from '../db/client.js';
import { EMBEDDING_DIMENSION, DEFAULT_TOP_K } from '@minge/shared';
import type { Memory, MemoryCreateInput, MemorySearchInput, MemorySupersedInput } from '@minge/shared';

/**
 * Guard: fail closed if project_id is missing, undefined, or empty string.
 * Returns true if project_id is valid, false otherwise.
 */
function isValidProjectId(projectId: string | undefined | null): projectId is string {
  return typeof projectId === 'string' && projectId.trim().length > 0;
}

/**
 * Ingest a new memory item into the project-scoped store.
 * Embedding is expected to be pre-computed by the caller.
 */
export async function ingestMemory(
  input: MemoryCreateInput,
  embedding: number[]
): Promise<Memory | null> {
  // FAIL CLOSED: refuse unscoped ingestion
  if (!isValidProjectId(input.project_id)) {
    console.warn('[memory-store] FAIL_CLOSED: ingestMemory called without project_id.');
    return null;
  }

  if (embedding.length !== EMBEDDING_DIMENSION) {
    throw new Error(`Embedding must be ${EMBEDDING_DIMENSION} dimensions, got ${embedding.length}`);
  }

  const result = await withProjectScope(input.project_id, async (client) => {
    const embeddingStr = `[${embedding.join(',')}]`;
    const res = await client.query(
      `INSERT INTO minge.memories
        (project_id, type, content, embedding, metadata, source_uri, ingested_by_user_id)
       VALUES ($1, $2, $3, $4::vector, $5, $6, $7)
       RETURNING *`,
      [
        input.project_id,
        input.type,
        input.content,
        embeddingStr,
        JSON.stringify(input.metadata ?? {}),
        input.source_uri ?? null,
        input.ingested_by_user_id,
      ]
    );
    return res.rows[0] as Memory;
  });

  return result;
}

/**
 * Search memories using cosine similarity (pgvector <=> operator).
 * Only retrieves active memories: superseded_by_id IS NULL AND deleted_at IS NULL.
 *
 * Invariant 1: Fail closed — empty project_id returns empty array immediately.
 */
export async function searchMemories(
  input: MemorySearchInput
): Promise<Memory[]> {
  // FAIL CLOSED: refuse unscoped search
  if (!isValidProjectId(input.project_id)) {
    console.warn('[memory-store] FAIL_CLOSED: searchMemories called without project_id.');
    return [];
  }

  if (input.query_embedding.length !== EMBEDDING_DIMENSION) {
    throw new Error(`Query embedding must be ${EMBEDDING_DIMENSION} dimensions, got ${input.query_embedding.length}`);
  }

  const topK = input.top_k ?? DEFAULT_TOP_K;
  const embeddingStr = `[${input.query_embedding.join(',')}]`;

  const results = await withProjectScope(input.project_id, async (client) => {
    let sql = `
      SELECT *, (embedding <=> $1::vector) AS distance
      FROM minge.memories
      WHERE project_id = $2
        AND superseded_by_id IS NULL
        AND deleted_at IS NULL
    `;
    const params: unknown[] = [embeddingStr, input.project_id];

    if (input.type_filter) {
      sql += ` AND type = $3`;
      params.push(input.type_filter);
    }

    sql += ` ORDER BY distance ASC LIMIT $${params.length + 1}`;
    params.push(topK);

    const res = await client.query(sql, params);
    return res.rows as Memory[];
  });

  return results;
}

/**
 * Supersede an existing memory with a new version (append-only update).
 *
 * Invariant 2: Does NOT destructively UPDATE the old record's content.
 *              Instead: inserts a new memory, then sets superseded_by_id on the old one.
 */
export async function supersedeMemory(
  input: MemorySupersedInput,
  newEmbedding: number[]
): Promise<Memory | null> {
  if (!isValidProjectId(input.project_id)) {
    console.warn('[memory-store] FAIL_CLOSED: supersedeMemory called without project_id.');
    return null;
  }

  if (newEmbedding.length !== EMBEDDING_DIMENSION) {
    throw new Error(`Embedding must be ${EMBEDDING_DIMENSION} dimensions, got ${newEmbedding.length}`);
  }

  const result = await withProjectScope(input.project_id, async (client) => {
    // 1. Fetch the active original record to get its version and type
    const original = await client.query(
      `SELECT * FROM minge.memories
       WHERE id = $1 AND project_id = $2 AND superseded_by_id IS NULL AND deleted_at IS NULL`,
      [input.original_id, input.project_id]
    );

    if (original.rows.length === 0) {
      return null;
    }

    const orig = original.rows[0] as Memory;
    const newVersion = (orig.version ?? 1) + 1;
    const embeddingStr = `[${newEmbedding.join(',')}]`;

    // 2. Insert the new version
    const newRecord = await client.query(
      `INSERT INTO minge.memories
        (project_id, type, content, embedding, metadata, source_uri, version, ingested_by_user_id)
       VALUES ($1, $2, $3, $4::vector, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.project_id,
        orig.type,
        input.content,
        embeddingStr,
        JSON.stringify(input.metadata ?? orig.metadata ?? {}),
        orig.source_uri ?? null,
        newVersion,
        input.ingested_by_user_id,
      ]
    );

    const newMem = newRecord.rows[0] as Memory;

    // 3. Mark the old record as superseded (NOT a content update)
    await client.query(
      `UPDATE minge.memories SET superseded_by_id = $1 WHERE id = $2 AND project_id = $3`,
      [newMem.id, input.original_id, input.project_id]
    );

    return newMem;
  });

  return result;
}

/**
 * Soft-delete a memory (set deleted_at, preserving 30-day recovery window).
 * Invariant 6: No hard deletes.
 */
export async function softDeleteMemory(
  projectId: string,
  memoryId: string
): Promise<boolean> {
  if (!isValidProjectId(projectId)) {
    console.warn('[memory-store] FAIL_CLOSED: softDeleteMemory called without project_id.');
    return false;
  }

  const result = await withProjectScope(projectId, async (client) => {
    const res = await client.query(
      `UPDATE minge.memories SET deleted_at = NOW()
       WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
      [memoryId, projectId]
    );
    return (res.rowCount ?? 0) > 0;
  });

  return result;
}

/**
 * Restore a soft-deleted memory within the 30-day recovery window.
 * Invariant 6: Terms v0.1 Section 16.3 compliance.
 */
export async function restoreMemory(
  projectId: string,
  memoryId: string
): Promise<Memory | null> {
  if (!isValidProjectId(projectId)) {
    console.warn('[memory-store] FAIL_CLOSED: restoreMemory called without project_id.');
    return null;
  }

  const result = await withProjectScope(projectId, async (client) => {
    const res = await client.query(
      `UPDATE minge.memories
       SET deleted_at = NULL
       WHERE id = $1
         AND project_id = $2
         AND deleted_at IS NOT NULL
         AND deleted_at >= NOW() - INTERVAL '30 days'
       RETURNING *`,
      [memoryId, projectId]
    );
    return (res.rows[0] as Memory) ?? null;
  });

  return result;
}

/**
 * List memories for a project (non-superseded; optionally including soft-deleted within recovery).
 */
export async function listMemories(
  projectId: string,
  limit = 50,
  offset = 0,
  includeDeleted = false
): Promise<Memory[]> {
  if (!isValidProjectId(projectId)) {
    console.warn('[memory-store] FAIL_CLOSED: listMemories called without project_id.');
    return [];
  }

  const results = await withProjectScope(projectId, async (client) => {
    const deletedClause = includeDeleted ? '' : 'AND deleted_at IS NULL';
    const res = await client.query(
      `SELECT * FROM minge.memories
       WHERE project_id = $1
         AND superseded_by_id IS NULL
         ${deletedClause}
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [projectId, limit, offset]
    );
    return res.rows as Memory[];
  });

  return results;
}

/**
 * Get a single memory by ID (including superseded/deleted for audit trail).
 */
export async function getMemoryById(
  projectId: string,
  memoryId: string
): Promise<Memory | null> {
  if (!isValidProjectId(projectId)) {
    return null;
  }

  const result = await withProjectScope(projectId, async (client) => {
    const res = await client.query(
      `SELECT * FROM minge.memories WHERE id = $1 AND project_id = $2`,
      [memoryId, projectId]
    );
    return (res.rows[0] as Memory) ?? null;
  });

  return result;
}

/**
 * Clear all active memories for a project (Terms v0.1 Section 9.3).
 * This is a soft-delete of all non-deleted, non-superseded memories.
 */
export async function clearProjectMemories(projectId: string): Promise<number> {
  if (!isValidProjectId(projectId)) {
    return 0;
  }

  const result = await withProjectScope(projectId, async (client) => {
    const res = await client.query(
      `UPDATE minge.memories SET deleted_at = NOW()
       WHERE project_id = $1 AND deleted_at IS NULL`,
      [projectId]
    );
    return res.rowCount ?? 0;
  });

  return result;
}
