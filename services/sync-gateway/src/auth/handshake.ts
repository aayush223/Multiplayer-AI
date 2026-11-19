/**
 * Fail-Closed WebSocket Upgrade Authentication (Invariants 1, 3, 8)
 *
 * Parses `${project_id}:${document_id}` on upgrade, validates JWT Bearer token
 * or Project Key, and verifies project membership against PostgreSQL with RLS active
 * BEFORE any Y.Doc is created or hydrated.
 */
import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type pg from 'pg';
import { createVerifier } from 'fast-jwt';
import { parseRoomId } from '@minge/shared';

export interface AuthContext {
  roomId: string;
  projectId: string;
  documentId: string;
  actorId: string;
  authMethod: 'jwt' | 'project_key';
}

export type HandshakeResult =
  | { ok: true; context: AuthContext }
  | { ok: false; status: 400 | 401 | 403; message: string };

export interface MembershipVerifier {
  verifyUserProjectAccess(projectId: string, userId: string): Promise<boolean>;
  verifyProjectKey(projectId: string, projectKey: string): Promise<boolean>;
}

export interface HandshakeOptions {
  jwtSecret: string;
  membershipVerifier: MembershipVerifier;
}

interface VerifiedJwtPayload {
  sub?: unknown;
  projectIds?: unknown;
}

/**
 * Default PostgreSQL membership & project-key verifier with RLS active.
 * Sets both `app.current_project_id` and `app.current_user_id` transaction-locally.
 */
export function createPostgresMembershipVerifier(pool: pg.Pool): MembershipVerifier {
  return {
    async verifyUserProjectAccess(projectId: string, userId: string): Promise<boolean> {
      if (!projectId || !userId) return false;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.current_project_id', $1, true)`, [projectId]);
        await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);

        const res = await client.query(
          `SELECT 1 FROM minge.project_members
           WHERE project_id = $1 AND user_id = $2 AND deleted_at IS NULL
           LIMIT 1`,
          [projectId, userId]
        );
        await client.query('COMMIT');
        return (res.rowCount ?? 0) > 0;
      } catch {
        await client.query('ROLLBACK').catch(() => {});
        return false;
      } finally {
        client.release();
      }
    },

    async verifyProjectKey(projectId: string, projectKey: string): Promise<boolean> {
      if (!projectId || !projectKey) return false;

      const expectedHash = crypto.createHash('sha256').update(projectKey).digest('hex');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.current_project_id', $1, true)`, [projectId]);

        const res = await client.query<{ api_key_hash: string | null }>(
          `SELECT api_key_hash FROM minge.projects WHERE id = $1 LIMIT 1`,
          [projectId]
        );
        await client.query('COMMIT');

        const storedHash = res.rows[0]?.api_key_hash;
        if (!storedHash) return false;

        const a = Buffer.from(expectedHash, 'utf8');
        const b = Buffer.from(storedHash, 'utf8');
        return a.length === b.length && crypto.timingSafeEqual(a, b);
      } catch {
        await client.query('ROLLBACK').catch(() => {});
        return false;
      } finally {
        client.release();
      }
    },
  };
}

function extractBearerToken(req: IncomingMessage, url: URL): string | null {
  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }
  const queryToken = url.searchParams.get('token');
  return queryToken && queryToken.trim().length > 0 ? queryToken.trim() : null;
}

function extractProjectKey(req: IncomingMessage, url: URL): string | null {
  const headerKey = req.headers['x-project-key'];
  if (typeof headerKey === 'string' && headerKey.trim().length > 0) {
    return headerKey.trim();
  }
  const queryKey = url.searchParams.get('projectKey');
  return queryKey && queryKey.trim().length > 0 ? queryKey.trim() : null;
}

/**
 * Authenticate an incoming WebSocket upgrade request.
 * Fails closed with 400/401/403 before room allocation or hydration.
 */
export async function authenticateUpgradeRequest(
  req: IncomingMessage,
  options: HandshakeOptions
): Promise<HandshakeResult> {
  const host = req.headers['host'] ?? 'localhost';
  const url = new URL(req.url ?? '/', `http://${host}`);
  const rawPath = url.pathname.replace(/^\/+/, '');

  let roomId: string;
  try {
    roomId = decodeURIComponent(rawPath);
  } catch {
    return { ok: false, status: 400, message: 'Malformed room path encoding' };
  }

  let projectId: string;
  let documentId: string;
  try {
    const parsed = parseRoomId(roomId);
    projectId = parsed.projectId.trim();
    documentId = parsed.documentId.trim();
    if (!projectId || !documentId) {
      return { ok: false, status: 400, message: 'Room ID must be ${project_id}:${document_id}' };
    }
  } catch {
    return { ok: false, status: 400, message: 'Invalid room ID format. Expected ${project_id}:${document_id}' };
  }

  const token = extractBearerToken(req, url);
  if (token) {
    let payload: VerifiedJwtPayload;
    try {
      const verify = createVerifier({ key: options.jwtSecret });
      payload = verify(token) as VerifiedJwtPayload;
    } catch {
      return { ok: false, status: 401, message: 'Unauthorized: invalid or expired JWT token' };
    }

    const userId = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
    if (!userId) {
      return { ok: false, status: 401, message: 'Unauthorized: JWT missing subject (sub)' };
    }

    if (
      Array.isArray(payload.projectIds) &&
      payload.projectIds.length > 0 &&
      !payload.projectIds.includes(projectId)
    ) {
      return { ok: false, status: 403, message: 'Forbidden: JWT is not scoped to this project' };
    }

    const hasAccess = await options.membershipVerifier.verifyUserProjectAccess(projectId, userId);
    if (!hasAccess) {
      return { ok: false, status: 403, message: 'Forbidden: user lacks membership in this project' };
    }

    return {
      ok: true,
      context: {
        roomId,
        projectId,
        documentId,
        actorId: userId,
        authMethod: 'jwt',
      },
    };
  }

  const projectKey = extractProjectKey(req, url);
  if (projectKey) {
    const validKey = await options.membershipVerifier.verifyProjectKey(projectId, projectKey);
    if (!validKey) {
      return { ok: false, status: 403, message: 'Forbidden: invalid project key' };
    }

    const userHeader = req.headers['x-user-id'];
    const actorId =
      typeof userHeader === 'string' && userHeader.trim().length > 0
        ? userHeader.trim()
        : `project-key:${projectId}`;

    return {
      ok: true,
      context: {
        roomId,
        projectId,
        documentId,
        actorId,
        authMethod: 'project_key',
      },
    };
  }

  return {
    ok: false,
    status: 401,
    message: 'Unauthorized: provide Authorization Bearer JWT or X-Project-Key',
  };
}
