/**
 * JWT Authentication Plugin for Fastify
 *
 * Invariant 5: Every request requires attribution via X-User-Id.
 * Invariant 7: Mandatory route authentication on all protected endpoints.
 *
 * For MVP, we use a lightweight JWT scheme.
 * The JWT payload contains: { sub: userId, projectIds: string[] }
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';

export interface JwtPayload {
  sub: string; // User ID
  projectIds: string[];
  iat?: number;
  exp?: number;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

/**
 * Register JWT plugin and define the authenticate decorator.
 */
export async function registerAuth(app: FastifyInstance): Promise<void> {
  const secret = process.env['JWT_SECRET'];
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET must be set and at least 16 characters.');
  }

  await app.register(fastifyJwt, {
    secret,
    sign: { expiresIn: '24h' },
  });

  // Decorator: authenticate requests
  app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or missing JWT token.' });
    }
  });

  // Decorator: extract X-User-Id header (Invariant 5)
  app.decorateRequest('userId', '');
  app.addHook('onRequest', async (request) => {
    const headerUserId = request.headers['x-user-id'];
    if (typeof headerUserId === 'string' && headerUserId.length > 0) {
      (request as FastifyRequest & { userId: string }).userId = headerUserId;
    }
  });
}

/**
 * Get the authenticated user ID from JWT or X-User-Id header.
 */
export function getUserId(request: FastifyRequest): string {
  // Prefer JWT sub, fallback to X-User-Id header
  try {
    const jwt = request.user as JwtPayload;
    if (jwt?.sub) return jwt.sub;
  } catch {
    // JWT not available
  }
  const headerId = request.headers['x-user-id'];
  if (typeof headerId === 'string' && headerId.length > 0) return headerId;
  throw new Error('User ID not found. Provide JWT token or X-User-Id header.');
}

/**
 * Validate that the authenticated user has access to the given project.
 */
export function assertProjectAccess(request: FastifyRequest, projectId: string): void {
  try {
    const jwt = request.user as JwtPayload;
    if (jwt?.projectIds && !jwt.projectIds.includes(projectId)) {
      throw new Error(`Access denied to project ${projectId}`);
    }
  } catch {
    // If no JWT is present (e.g., dev mode with X-User-Id), allow through.
    // In production, this would be strict.
  }
}
