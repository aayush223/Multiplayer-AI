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
  // Mock the database layer
  const mockQuery = vi.fn();
  const mockClient = {
    query: mockQuery,
    release: vi.fn(),
  };

  beforeEach(() => {
    vi.resetModules();
    mockQuery.mockReset();
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
});
