/**
 * LLM Proxy Routes — Server-side chat completions with streaming support.
 *
 * Invariant 5: Zero client credential exposure. All API keys live on the server.
 * Invariant 5: Every request requires X-User-Id or JWT for attribution.
 */
import type { FastifyInstance } from 'fastify';
import { proxyCompletionSchema } from '@minge/shared';
import { chatCompletion, chatCompletionStream, getAvailableProviders } from '../proxy/llm-gateway.js';
import { getUserId } from '../auth/jwt.js';

export async function proxyRoutes(app: FastifyInstance): Promise<void> {
  // Chat completions (non-streaming)
  app.post<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/completions',
    async (request, reply) => {
      const userId = getUserId(request);
      const { projectId } = request.params;
      const body = proxyCompletionSchema.parse({
        ...request.body as object,
        project_id: projectId,
      });

      if (body.stream) {
        // Handle streaming response via Fastify hijack to avoid double-send warnings
        reply.hijack();
        const origin = request.headers.origin;
        const headers: Record<string, string> = {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        };
        if (origin) {
          headers['Access-Control-Allow-Origin'] = origin;
          headers['Access-Control-Allow-Credentials'] = 'true';
        }
        reply.raw.writeHead(200, headers);

        try {
          for await (const chunk of chatCompletionStream(body, userId)) {
            reply.raw.write(chunk);
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          reply.raw.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
        } finally {
          reply.raw.end();
        }
        return;
      }

      // Non-streaming response
      const result = await chatCompletion(body, userId);
      reply.send({
        data: {
          content: result.content,
          model: result.model,
          provider: result.provider,
          usage: result.usage,
        },
      });
    }
  );

  // Alias endpoint for /api/proxy/chat/completions
  app.post(
    '/api/proxy/chat/completions',
    async (request, reply) => {
      const userId = getUserId(request);
      const bodyObj = (request.body as Record<string, unknown>) || {};
      const projectId =
        (typeof bodyObj['project_id'] === 'string' && bodyObj['project_id'].trim()) ||
        (typeof request.headers['x-project-id'] === 'string' && request.headers['x-project-id'].trim()) ||
        '';

      // Invariant 1: Fail closed if project_id is missing
      if (!projectId) {
        return reply.status(400).send({
          error: 'FAIL_CLOSED: project_id is required via request body or X-Project-Id header.',
        });
      }

      const body = proxyCompletionSchema.parse({
        ...bodyObj,
        project_id: projectId,
      });

      if (body.stream) {
        reply.hijack();
        const origin = request.headers.origin;
        const headers: Record<string, string> = {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        };
        if (origin) {
          headers['Access-Control-Allow-Origin'] = origin;
          headers['Access-Control-Allow-Credentials'] = 'true';
        }
        reply.raw.writeHead(200, headers);

        try {
          for await (const chunk of chatCompletionStream(body, userId)) {
            reply.raw.write(chunk);
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          reply.raw.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
        } finally {
          reply.raw.end();
        }
        return;
      }

      const result = await chatCompletion(body, userId);
      reply.send({
        data: {
          content: result.content,
          model: result.model,
          provider: result.provider,
          usage: result.usage,
        },
      });
    }
  );

  // List available providers
  app.get('/api/providers', async (_request, reply) => {
    const providers = getAvailableProviders();
    reply.send({ data: providers });
  });
}
