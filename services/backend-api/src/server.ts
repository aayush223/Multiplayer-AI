/**
 * Minge Backend API — Fastify Bootstrap
 *
 * This is the main entry point for the backend API service.
 * It initializes all plugins, routes, and database connections.
 *
 * Invariant 7: JWT auth on all protected routes.
 * Invariant 5: CORS configured for Prompt IDE and AI Canvas origins.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { envSchema } from '@minge/shared';
import { registerAuth } from './auth/jwt.js';
import { getPool, migrate, closePool } from './db/client.js';
import { projectRoutes } from './routes/projects.js';
import { memoryRoutes } from './routes/memories.js';
import { promptRoutes } from './routes/prompts.js';
import { proxyRoutes } from './routes/proxy.js';

async function main() {
  // ──────────────────────────────────────────────────
  // 1. Validate environment variables
  // ──────────────────────────────────────────────────
  const env = envSchema.parse(process.env);

  // ──────────────────────────────────────────────────
  // 2. Create Fastify instance
  // ──────────────────────────────────────────────────
  const app = Fastify({
    logger: {
      level: 'info',
    },
  });

  // ──────────────────────────────────────────────────
  // 3. Register plugins
  // ──────────────────────────────────────────────────

  // CORS — allow IDE and Canvas origins
  await app.register(cors, {
    origin: [
      'http://localhost:5173', // Vite dev server (AI Canvas)
      'http://localhost:3000', // Backend self
      /\.minge\.dev$/,        // Production domains
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id'],
  });

  // Rate limiting (Invariant 5: per-project rate limits)
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      // Rate limit by user ID if available, otherwise by IP
      const userId = request.headers['x-user-id'];
      return typeof userId === 'string' ? userId : request.ip;
    },
  });

  // JWT Authentication
  await registerAuth(app);

  // ──────────────────────────────────────────────────
  // 4. Health check (unauthenticated)
  // ──────────────────────────────────────────────────
  app.get('/health', async (_request, reply) => {
    try {
      const pool = getPool();
      await pool.query('SELECT 1');
      reply.send({
        status: 'ok',
        service: 'backend-api',
        timestamp: new Date().toISOString(),
        database: 'connected',
      });
    } catch {
      reply.status(503).send({
        status: 'error',
        service: 'backend-api',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
      });
    }
  });

  // ──────────────────────────────────────────────────
  // 5. Auth token generation (development only)
  // ──────────────────────────────────────────────────
  app.post('/api/auth/token', async (request, reply) => {
    const body = request.body as { userId: string; projectIds?: string[] };
    if (!body.userId) {
      return reply.status(400).send({ error: 'userId is required.' });
    }
    const token = app.jwt.sign({
      sub: body.userId,
      projectIds: body.projectIds ?? [],
    });
    reply.send({ token });
  });

  // ──────────────────────────────────────────────────
  // 6. Register API routes
  // ──────────────────────────────────────────────────
  await app.register(projectRoutes);
  await app.register(memoryRoutes);
  await app.register(promptRoutes);
  await app.register(proxyRoutes);

  // ──────────────────────────────────────────────────
  // 7. Global error handler
  // ──────────────────────────────────────────────────
  app.setErrorHandler((error, _request, reply) => {
    // Zod validation errors
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        error: 'Validation Error',
        details: JSON.parse(error.message),
      });
    }

    // Fail-closed errors
    if (error.message.includes('FAIL_CLOSED')) {
      return reply.status(400).send({
        error: 'Missing required project context.',
        message: error.message,
      });
    }

    // Generic errors
    app.log.error(error);
    reply.status(error.statusCode ?? 500).send({
      error: error.name || 'Internal Server Error',
      message: error.message,
    });
  });

  // ──────────────────────────────────────────────────
  // 8. Start server
  // ──────────────────────────────────────────────────
  try {
    // Run DB migrations on startup if PostgreSQL is accessible
    try {
      await migrate();
      app.log.info('Database migrations applied successfully.');
    } catch (dbErr: any) {
      app.log.warn(`Database migration skipped (${dbErr.message}). Starting server for LLM proxy and client APIs.`);
    }

    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info(`🚀 Minge Backend API running on http://localhost:${env.PORT}`);
    app.log.info(`📋 Health check: http://localhost:${env.PORT}/health`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // ──────────────────────────────────────────────────
  // 9. Graceful shutdown
  // ──────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received. Shutting down gracefully...`);
    await app.close();
    await closePool();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
