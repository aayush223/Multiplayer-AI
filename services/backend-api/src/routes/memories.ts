/**
 * Memories Routes — Ingest, search, list, supersede, soft-delete.
 *
 * Invariant 1: Every endpoint requires project_id. Fail closed if missing.
 * Invariant 2: Updates create new versions via supersede, never overwrite.
 * Invariant 6: Deletes are soft-deletes with 30-day recovery.
 */
import type { FastifyInstance } from 'fastify';
import { memoryCreateSchema, memorySearchSchema } from '@minge/shared';
import {
  ingestMemory,
  searchMemories,
  supersedeMemory,
  softDeleteMemory,
  restoreMemory,
  listMemories,
  getMemoryById,
  clearProjectMemories,
} from '../memory/store.js';
import { getUserId } from '../auth/jwt.js';
import { getEmbedding } from '../proxy/embeddings.js';

export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  // Ingest a new memory item
  app.post<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/memories',
    async (request, reply) => {
      const userId = getUserId(request);
      const { projectId } = request.params;
      const body = memoryCreateSchema.parse({ ...request.body as object, project_id: projectId });

      // Generate embedding for the content
      const embedding = await getEmbedding(body.content);

      const memory = await ingestMemory(
        { ...body, ingested_by_user_id: userId },
        embedding
      );

      if (!memory) {
        return reply.status(400).send({ error: 'Failed to ingest memory. Invalid project_id.' });
      }

      reply.status(201).send({ data: memory });
    }
  );

  // Semantic search memories
  app.post<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/memories/search',
    async (request, reply) => {
      const { projectId } = request.params;
      const body = memorySearchSchema.parse({ ...request.body as object, project_id: projectId });

      // Generate embedding for the search query
      const queryEmbedding = await getEmbedding(body.query);

      const results = await searchMemories({
        project_id: body.project_id,
        query_embedding: queryEmbedding,
        top_k: body.top_k,
        type_filter: body.type_filter,
      });

      reply.send({ data: results, count: results.length });
    }
  );

  // List active memories for a project (or include soft-deleted for 30-day recovery drawer)
  app.get<{ Params: { projectId: string }; Querystring: { limit?: string; offset?: string; includeDeleted?: string } }>(
    '/api/projects/:projectId/memories',
    async (request, reply) => {
      const { projectId } = request.params;
      const parsedLimit = parseInt(request.query.limit ?? '50', 10);
      const parsedOffset = parseInt(request.query.offset ?? '0', 10);
      const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 50;
      const offset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;
      const includeDeleted = request.query.includeDeleted === 'true';

      const memories = await listMemories(projectId, limit, offset, includeDeleted);
      reply.send({ data: memories, count: memories.length });
    }
  );

  // Get a single memory by ID
  app.get<{ Params: { projectId: string; memoryId: string } }>(
    '/api/projects/:projectId/memories/:memoryId',
    async (request, reply) => {
      const { projectId, memoryId } = request.params;
      const memory = await getMemoryById(projectId, memoryId);

      if (!memory) {
        return reply.status(404).send({ error: 'Memory not found.' });
      }

      reply.send({ data: memory });
    }
  );

  // Supersede a memory (append-only update)
  app.post<{ Params: { projectId: string; memoryId: string } }>(
    '/api/projects/:projectId/memories/:memoryId/supersede',
    async (request, reply) => {
      const userId = getUserId(request);
      const { projectId, memoryId } = request.params;
      const body = (request.body as { content?: string; metadata?: Record<string, unknown> } | undefined) ?? {};

      if (!body.content) {
        return reply.status(400).send({ error: 'content is required for supersede.' });
      }

      const newEmbedding = await getEmbedding(body.content);

      const newMemory = await supersedeMemory(
        {
          original_id: memoryId,
          project_id: projectId,
          content: body.content,
          metadata: body.metadata,
          ingested_by_user_id: userId,
        },
        newEmbedding
      );

      if (!newMemory) {
        return reply.status(404).send({ error: 'Original memory not found or already deleted.' });
      }

      reply.status(201).send({ data: newMemory });
    }
  );

  // Restore a soft-deleted memory within the 30-day recovery window (Invariant 6)
  app.post<{ Params: { projectId: string; memoryId: string } }>(
    '/api/projects/:projectId/memories/:memoryId/restore',
    async (request, reply) => {
      const { projectId, memoryId } = request.params;
      const restored = await restoreMemory(projectId, memoryId);

      if (!restored) {
        return reply.status(404).send({
          error: 'Memory not found, not deleted, or outside the 30-day recovery window.',
        });
      }

      reply.send({ data: restored, message: 'Memory restored successfully.' });
    }
  );

  // Clear all project memories alias (PRD Section 5.7)
  app.delete<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/memories/clear',
    async (request, reply) => {
      const { projectId } = request.params;
      const count = await clearProjectMemories(projectId);
      reply.send({ message: `Soft-deleted ${count} memories. Recoverable for 30 days.`, count });
    }
  );

  // Soft-delete a memory (30-day recovery)
  app.delete<{ Params: { projectId: string; memoryId: string } }>(
    '/api/projects/:projectId/memories/:memoryId',
    async (request, reply) => {
      const { projectId, memoryId } = request.params;
      const deleted = await softDeleteMemory(projectId, memoryId);

      if (!deleted) {
        return reply.status(404).send({ error: 'Memory not found or already deleted.' });
      }

      reply.send({ message: 'Memory soft-deleted. Recoverable for 30 days.' });
    }
  );

  // Clear all project memories (Terms v0.1 Section 9.3)
  app.delete<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/memories',
    async (request, reply) => {
      const { projectId } = request.params;
      const count = await clearProjectMemories(projectId);
      reply.send({ message: `Soft-deleted ${count} memories. Recoverable for 30 days.`, count });
    }
  );
}
