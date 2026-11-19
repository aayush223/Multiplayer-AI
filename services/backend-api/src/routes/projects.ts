/**
 * Projects Routes — CRUD for project/workspace entities.
 * Projects are the top-level tenant boundary (Invariant 1).
 */
import type { FastifyInstance } from 'fastify';
import { query } from '../db/client.js';
import { projectCreateSchema } from '@minge/shared';
import { getUserId } from '../auth/jwt.js';

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  // Create a new project
  app.post('/api/projects', async (request, reply) => {
    const userId = getUserId(request);
    const body = projectCreateSchema.parse(request.body);

    const result = await query(
      `INSERT INTO minge.projects (name, slug, account_type)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [body.name, body.slug, body.account_type]
    );

    reply.status(201).send({
      data: result.rows[0],
      created_by: userId,
    });
  });

  // List all projects (for the authenticated user)
  app.get('/api/projects', async (_request, reply) => {
    const result = await query(
      `SELECT * FROM minge.projects ORDER BY created_at DESC`
    );
    reply.send({ data: result.rows });
  });

  // Get a single project by ID
  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId', async (request, reply) => {
    const { projectId } = request.params;
    const result = await query(
      `SELECT * FROM minge.projects WHERE id = $1`,
      [projectId]
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Project not found.' });
    }

    reply.send({ data: result.rows[0] });
  });

  // Update a project
  app.patch<{ Params: { projectId: string } }>('/api/projects/:projectId', async (request, reply) => {
    const { projectId } = request.params;
    const body = (request.body as { name?: string; settings?: Record<string, unknown> } | undefined) ?? {};

    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (body.name) {
      setClauses.push(`name = $${paramIdx++}`);
      params.push(body.name);
    }

    if (body.settings) {
      setClauses.push(`settings = $${paramIdx++}`);
      params.push(JSON.stringify(body.settings));
    }

    params.push(projectId);

    const result = await query(
      `UPDATE minge.projects SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Project not found.' });
    }

    reply.send({ data: result.rows[0] });
  });
}
