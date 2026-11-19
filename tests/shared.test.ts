/**
 * Shared Package Tests — Schema validation, constants, and room ID utilities.
 */
import { describe, it, expect } from 'vitest';
import {
  buildRoomId,
  parseRoomId,
  EMBEDDING_DIMENSION,
  DB_SCHEMA,
  SOFT_DELETE_RECOVERY_DAYS,
} from '../packages/shared/src/index.js';
import {
  envSchema,
  projectCreateSchema,
  memoryCreateSchema,
  memorySearchSchema,
  promptCreateSchema,
  proxyCompletionSchema,
} from '../packages/shared/src/schemas/index.js';

describe('Constants', () => {
  it('EMBEDDING_DIMENSION is 1536', () => {
    expect(EMBEDDING_DIMENSION).toBe(1536);
  });

  it('DB_SCHEMA is minge (never public)', () => {
    expect(DB_SCHEMA).toBe('minge');
    expect(DB_SCHEMA).not.toBe('public');
  });

  it('SOFT_DELETE_RECOVERY_DAYS is 30', () => {
    expect(SOFT_DELETE_RECOVERY_DAYS).toBe(30);
  });
});

describe('Room ID Utilities — Invariant 3', () => {
  it('builds room ID from project and document IDs', () => {
    const roomId = buildRoomId('project-123', 'doc-456');
    expect(roomId).toBe('project-123:doc-456');
  });

  it('parses room ID back into components', () => {
    const { projectId, documentId } = parseRoomId('project-123:doc-456');
    expect(projectId).toBe('project-123');
    expect(documentId).toBe('doc-456');
  });

  it('roundtrips correctly', () => {
    const original = { projectId: 'p-1', documentId: 'd-2' };
    const roomId = buildRoomId(original.projectId, original.documentId);
    const parsed = parseRoomId(roomId);
    expect(parsed).toEqual(original);
  });

  it('throws on invalid room ID (no separator)', () => {
    expect(() => parseRoomId('no-separator')).toThrow('Invalid room ID');
  });

  it('throws on invalid room ID with empty projectId or documentId', () => {
    expect(() => parseRoomId(':doc-only')).toThrow('Invalid room ID');
    expect(() => parseRoomId('proj-only:')).toThrow('Invalid room ID');
  });

  it('envSchema defaults PORT to 3000 (matching Vite proxy and .env.example)', () => {
    const parsed = envSchema.parse({});
    expect(parsed.PORT).toBe(3000);
  });
});

describe('Zod Schemas — Invariant 1: project_id required', () => {
  it('memoryCreateSchema requires project_id as valid UUID', () => {
    const result = memoryCreateSchema.safeParse({
      type: 'fact',
      content: 'test',
    });
    expect(result.success).toBe(false);
  });

  it('memoryCreateSchema accepts valid input', () => {
    const result = memoryCreateSchema.safeParse({
      project_id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'fact',
      content: 'This is a test fact',
    });
    expect(result.success).toBe(true);
  });

  it('memorySearchSchema requires project_id', () => {
    const result = memorySearchSchema.safeParse({
      query: 'test query',
    });
    expect(result.success).toBe(false);
  });

  it('projectCreateSchema validates slug format', () => {
    const valid = projectCreateSchema.safeParse({
      name: 'Test Project',
      slug: 'test-project',
    });
    expect(valid.success).toBe(true);

    const invalid = projectCreateSchema.safeParse({
      name: 'Test Project',
      slug: 'Test Project With Spaces!',
    });
    expect(invalid.success).toBe(false);
  });

  it('promptCreateSchema requires model_config', () => {
    const result = promptCreateSchema.safeParse({
      project_id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Test Prompt',
      system_prompt: 'You are a helpful assistant.',
    });
    expect(result.success).toBe(false);
  });

  it('promptCreateSchema accepts valid input with model_config', () => {
    const result = promptCreateSchema.safeParse({
      project_id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Test Prompt',
      system_prompt: 'You are a helpful assistant.',
      model_config: {
        model: 'gpt-4o',
        temperature: 0.7,
        top_p: 0.95,
        max_tokens: 4096,
      },
    });
    expect(result.success).toBe(true);
  });

  it('proxyCompletionSchema requires project_id and messages', () => {
    const result = proxyCompletionSchema.safeParse({
      model: 'gpt-4o',
    });
    expect(result.success).toBe(false);
  });

  it('proxyCompletionSchema accepts valid completion input', () => {
    const result = proxyCompletionSchema.safeParse({
      project_id: '550e8400-e29b-41d4-a716-446655440000',
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: 'Hello!' },
      ],
    });
    expect(result.success).toBe(true);
  });
});
