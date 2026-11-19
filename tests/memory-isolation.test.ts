/**
 * Memory Isolation Tests — Invariant 1 Verification
 *
 * Tests that:
 * - Memory operations fail closed when project_id is missing/empty/undefined.
 * - No unscoped queries are possible.
 * - Cross-project memory access is structurally impossible.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the fail-closed logic at the store layer without a real DB.
// The store's isValidProjectId guard is the critical gate.

describe('Memory Isolation — Invariant 1: Fail Closed', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('rejects empty string project_id', async () => {
    const { ingestMemory } = await import('../services/backend-api/src/memory/store.js');

    const result = await ingestMemory(
      {
        project_id: '',
        type: 'fact',
        content: 'This should not be stored',
        ingested_by_user_id: 'user-1',
      },
      new Array(1536).fill(0.1)
    );

    expect(result).toBeNull();
  });

  it('rejects whitespace-only project_id', async () => {
    const { ingestMemory } = await import('../services/backend-api/src/memory/store.js');

    const result = await ingestMemory(
      {
        project_id: '   ',
        type: 'fact',
        content: 'This should not be stored',
        ingested_by_user_id: 'user-1',
      },
      new Array(1536).fill(0.1)
    );

    expect(result).toBeNull();
  });

  it('searchMemories returns empty array for missing project_id', async () => {
    const { searchMemories } = await import('../services/backend-api/src/memory/store.js');

    const results = await searchMemories({
      project_id: '',
      query_embedding: new Array(1536).fill(0.1),
      top_k: 10,
    });

    expect(results).toEqual([]);
  });

  it('softDeleteMemory returns false for missing project_id', async () => {
    const { softDeleteMemory } = await import('../services/backend-api/src/memory/store.js');

    const result = await softDeleteMemory('', 'some-memory-id');
    expect(result).toBe(false);
  });

  it('listMemories returns empty array for missing project_id', async () => {
    const { listMemories } = await import('../services/backend-api/src/memory/store.js');

    const results = await listMemories('');
    expect(results).toEqual([]);
  });

  it('clearProjectMemories returns 0 for missing project_id', async () => {
    const { clearProjectMemories } = await import('../services/backend-api/src/memory/store.js');

    const count = await clearProjectMemories('');
    expect(count).toBe(0);
  });

  it('supersedeMemory returns null for missing project_id', async () => {
    const { supersedeMemory } = await import('../services/backend-api/src/memory/store.js');

    const result = await supersedeMemory(
      {
        original_id: 'some-id',
        project_id: '',
        content: 'updated content',
        ingested_by_user_id: 'user-1',
      },
      new Array(1536).fill(0.1)
    );

    expect(result).toBeNull();
  });

  it('restoreMemory returns null for missing project_id', async () => {
    const { restoreMemory } = await import('../services/backend-api/src/memory/store.js');

    const result = await restoreMemory('', 'some-memory-id');
    expect(result).toBeNull();
  });

  it('searchMemories rejects invalid embedding dimensions', async () => {
    const { searchMemories } = await import('../services/backend-api/src/memory/store.js');

    await expect(
      searchMemories({
        project_id: 'proj-1',
        query_embedding: [0.1, 0.2, 0.3],
        top_k: 5,
      })
    ).rejects.toThrow('1536 dimensions');
  });

  it('supersedeMemory rejects invalid embedding dimensions', async () => {
    const { supersedeMemory } = await import('../services/backend-api/src/memory/store.js');

    await expect(
      supersedeMemory(
        {
          original_id: 'mem-1',
          project_id: 'proj-1',
          content: 'updated',
          ingested_by_user_id: 'user-1',
        },
        [0.1, 0.2]
      )
    ).rejects.toThrow('1536 dimensions');
  });

  it('assertProjectAccess throws on unauthorized project and allows authorized project', async () => {
    const { assertProjectAccess } = await import('../services/backend-api/src/auth/jwt.js');

    const req = {
      user: { sub: 'user-1', projectIds: ['proj-allowed'] },
    } as any;

    expect(() => assertProjectAccess(req, 'proj-allowed')).not.toThrow();
    expect(() => assertProjectAccess(req, 'proj-forbidden')).toThrow('Access denied to project proj-forbidden');
  });
});
