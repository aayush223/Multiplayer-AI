/**
 * Prompt Package Routes — CRUD for versioned, immutable prompt artifacts.
 *
 * Invariant 2: Prompts are immutable packages. Updates create new versions
 *              via superseded_by_id. Never a raw string.
 * Invariant 1: All operations scoped by project_id.
 */
import type { FastifyInstance } from 'fastify';
import { promptCreateSchema, promptUpdateSchema } from '@minge/shared';
import { withProjectScope } from '../db/client.js';
import { getUserId } from '../auth/jwt.js';

export async function promptRoutes(app: FastifyInstance): Promise<void> {
  // Create a new prompt package
  app.post<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/prompts',
    async (request, reply) => {
      const userId = getUserId(request);
      const { projectId } = request.params;
      const body = promptCreateSchema.parse({ ...request.body as object, project_id: projectId });

      const result = await withProjectScope(projectId, async (client) => {
        // If this is a branch from an existing prompt, fetch parent version
        let version = 1;
        if (body.parent_id) {
          const parent = await client.query(
            `SELECT version FROM minge.prompt_packages WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
            [body.parent_id, projectId]
          );
          if (parent.rows.length > 0) {
            version = (parent.rows[0] as { version: number }).version + 1;
          }
        }

        const res = await client.query(
          `INSERT INTO minge.prompt_packages
            (project_id, name, branch, system_prompt, user_template,
             grounded_memory_ids, model_config, version, parent_id, created_by_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            projectId,
            body.name,
            body.branch,
            body.system_prompt,
            body.user_template,
            body.grounded_memory_ids,
            JSON.stringify(body.model_config),
            version,
            body.parent_id ?? null,
            userId,
          ]
        );
        return res.rows[0];
      });

      reply.status(201).send({ data: result });
    }
  );

  // List prompt packages for a project (active only)
  app.get<{ Params: { projectId: string }; Querystring: { branch?: string } }>(
    '/api/projects/:projectId/prompts',
    async (request, reply) => {
      const { projectId } = request.params;
      const { branch } = request.query;

      const results = await withProjectScope(projectId, async (client) => {
        let sql = `
          SELECT * FROM minge.prompt_packages
          WHERE project_id = $1
            AND superseded_by_id IS NULL
            AND deleted_at IS NULL
        `;
        const params: unknown[] = [projectId];

        if (branch) {
          sql += ` AND branch = $2`;
          params.push(branch);
        }

        sql += ` ORDER BY updated_at DESC`;
        const res = await client.query(sql, params);
        return res.rows;
      });

      reply.send({ data: results, count: results.length });
    }
  );

  // Get a single prompt package by ID
  app.get<{ Params: { projectId: string; promptId: string } }>(
    '/api/projects/:projectId/prompts/:promptId',
    async (request, reply) => {
      const { projectId, promptId } = request.params;

      const result = await withProjectScope(projectId, async (client) => {
        const res = await client.query(
          `SELECT * FROM minge.prompt_packages WHERE id = $1 AND project_id = $2`,
          [promptId, projectId]
        );
        return res.rows[0] ?? null;
      });

      if (!result) {
        return reply.status(404).send({ error: 'Prompt not found.' });
      }

      reply.send({ data: result });
    }
  );

  // Update a prompt package (creates a NEW version — append-only, Invariant 2)
  app.post<{ Params: { projectId: string; promptId: string } }>(
    '/api/projects/:projectId/prompts/:promptId/version',
    async (request, reply) => {
      const userId = getUserId(request);
      const { projectId, promptId } = request.params;
      const body = promptUpdateSchema.parse({ ...request.body as object, project_id: projectId });

      const result = await withProjectScope(projectId, async (client) => {
        await client.query('BEGIN');

        try {
          // Fetch the current version
          const current = await client.query(
            `SELECT * FROM minge.prompt_packages
             WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
            [promptId, projectId]
          );

          if (current.rows.length === 0) {
            await client.query('ROLLBACK');
            return null;
          }

          const orig = current.rows[0] as Record<string, unknown>;
          const newVersion = (orig['version'] as number) + 1;

          // Insert the new version
          const newRecord = await client.query(
            `INSERT INTO minge.prompt_packages
              (project_id, name, branch, system_prompt, user_template,
               grounded_memory_ids, model_config, latest_output,
               version, parent_id, status, created_by_user_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING *`,
            [
              projectId,
              orig['name'],
              orig['branch'],
              body.system_prompt ?? orig['system_prompt'],
              body.user_template ?? orig['user_template'],
              body.grounded_memory_ids ?? orig['grounded_memory_ids'],
              JSON.stringify(body.model_config ?? orig['model_config']),
              body.latest_output ?? orig['latest_output'],
              newVersion,
              promptId, // parent_id points to the old version
              body.status ?? orig['status'],
              userId,
            ]
          );

          // Mark old version as superseded
          await client.query(
            `UPDATE minge.prompt_packages SET superseded_by_id = $1
             WHERE id = $2 AND project_id = $3`,
            [newRecord.rows[0].id, promptId, projectId]
          );

          await client.query('COMMIT');
          return newRecord.rows[0];
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        }
      });

      if (!result) {
        return reply.status(404).send({ error: 'Prompt not found or already deleted.' });
      }

      reply.status(201).send({ data: result });
    }
  );

  // Get version history for a prompt (lineage chain)
  app.get<{ Params: { projectId: string; promptId: string } }>(
    '/api/projects/:projectId/prompts/:promptId/history',
    async (request, reply) => {
      const { projectId, promptId } = request.params;

      const results = await withProjectScope(projectId, async (client) => {
        // Walk up the parent chain with a recursive CTE
        const res = await client.query(
          `WITH RECURSIVE lineage AS (
             SELECT * FROM minge.prompt_packages WHERE id = $1 AND project_id = $2
             UNION ALL
             SELECT pp.* FROM minge.prompt_packages pp
             INNER JOIN lineage l ON pp.id = l.parent_id
             WHERE pp.project_id = $2
           )
           SELECT * FROM lineage ORDER BY version DESC`,
          [promptId, projectId]
        );
        return res.rows;
      });

      reply.send({ data: results, count: results.length });
    }
  );

  // Soft-delete a prompt package
  app.delete<{ Params: { projectId: string; promptId: string } }>(
    '/api/projects/:projectId/prompts/:promptId',
    async (request, reply) => {
      const { projectId, promptId } = request.params;

      const result = await withProjectScope(projectId, async (client) => {
        const res = await client.query(
          `UPDATE minge.prompt_packages SET deleted_at = NOW()
           WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
          [promptId, projectId]
        );
        return (res.rowCount ?? 0) > 0;
      });

      if (!result) {
        return reply.status(404).send({ error: 'Prompt not found or already deleted.' });
      }

      reply.send({ message: 'Prompt soft-deleted. Recoverable for 30 days.' });
    }
  );

  // List branches for a project
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/prompts/branches',
    async (request, reply) => {
      const { projectId } = request.params;

      const results = await withProjectScope(projectId, async (client) => {
        const res = await client.query(
          `SELECT DISTINCT branch, COUNT(*) as prompt_count
           FROM minge.prompt_packages
           WHERE project_id = $1 AND deleted_at IS NULL AND superseded_by_id IS NULL
           GROUP BY branch
           ORDER BY branch`,
          [projectId]
        );
        return res.rows;
      });

      reply.send({ data: results });
    }
  );
}
