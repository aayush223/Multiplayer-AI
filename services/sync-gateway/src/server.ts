/**
 * Minge Authenticated Yjs Sync Gateway
 *
 * Invariants 1, 3, 5, 8:
 *  - Fail-closed WebSocket upgrade authentication (`401`/`403`) BEFORE hydrating any Y.Doc
 *  - Rooms strictly scoped as `${project_id}:${document_id}`
 *  - Snapshot hydration + delta replay/append in Postgres `minge.*` with RLS
 *  - Horizontal multi-instance sync via Redis Pub/Sub
 *  - Authenticated internal AI Peer write endpoint (`POST /internal/ai-peer/write`)
 */
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import path from 'node:path';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { WebSocketServer } from 'ws';
import { envSchema } from '@minge/shared';
import {
  authenticateUpgradeRequest,
  createPostgresMembershipVerifier,
  type MembershipVerifier,
} from './auth/handshake.js';
import {
  PostgresCrdtStore,
  type CrdtPersistenceStore,
} from './persistence/postgres-store.js';
import {
  InMemoryPubSubBus,
  RedisPubSubAdapter,
  type PubSubAdapter,
} from './pubsub/redis-bridge.js';
import { GatewayRoomManager } from './gateway/room-manager.js';

export interface SyncGatewayOptions {
  jwtSecret: string;
  internalSecret: string;
  membershipVerifier: MembershipVerifier;
  store: CrdtPersistenceStore;
  pubsub: PubSubAdapter;
  snapshotEveryNUpdates?: number;
  idleCompactMs?: number;
}

export interface SyncGatewayInstance {
  roomManager: GatewayRoomManager;
  listen(port?: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

const HTTP_STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  500: 'Internal Server Error',
};

function rejectUpgrade(socket: import('node:stream').Duplex, status: number, message: string): void {
  const statusText = HTTP_STATUS_TEXT[status] ?? 'Error';
  const body = JSON.stringify({ error: message });
  socket.write(
    `HTTP/1.1 ${status} ${statusText}\r\n` +
      `Content-Type: application/json\r\n` +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      `Connection: close\r\n\r\n` +
      body
  );
  socket.destroy();
}

function timingSafeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > 1_048_576) {
      throw new Error('Payload too large');
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

export function createSyncGateway(options: SyncGatewayOptions): SyncGatewayInstance {
  const roomManager = new GatewayRoomManager({
    store: options.store,
    pubsub: options.pubsub,
    snapshotEveryNUpdates: options.snapshotEveryNUpdates,
    idleCompactMs: options.idleCompactMs,
  });

  const wss = new WebSocketServer({ noServer: true });

  const httpServer = createServer(async (req, res) => {
    const method = req.method ?? 'GET';
    const urlPath = (req.url ?? '/').split('?')[0];

    if (method === 'GET' && urlPath === '/health') {
      const stats = roomManager.getStats();
      sendJson(res, 200, {
        status: 'ok',
        service: 'sync-gateway',
        timestamp: new Date().toISOString(),
        rooms: stats.length,
        totalConnections: stats.reduce((sum, r) => sum + r.connections, 0),
      });
      return;
    }

    if (method === 'GET' && urlPath === '/stats') {
      sendJson(res, 200, { rooms: roomManager.getStats() });
      return;
    }

    if (method === 'POST' && urlPath === '/internal/ai-peer/write') {
      const secretHeader = req.headers['x-internal-secret'];
      if (
        typeof secretHeader !== 'string' ||
        !timingSafeEquals(secretHeader, options.internalSecret)
      ) {
        sendJson(res, 401, { error: 'Unauthorized internal AI peer request' });
        return;
      }

      try {
        const body = await readJsonBody(req);
        const projectId = typeof body['projectId'] === 'string' ? body['projectId'].trim() : '';
        const documentId = typeof body['documentId'] === 'string' ? body['documentId'].trim() : '';
        const nodeId = typeof body['nodeId'] === 'string' ? body['nodeId'].trim() : '';
        const chunk = typeof body['chunk'] === 'string' ? body['chunk'] : '';
        const jobId = typeof body['jobId'] === 'string' ? body['jobId'].trim() : '';
        const actorId = typeof body['actorId'] === 'string' ? body['actorId'].trim() : '';
        const fencingToken = typeof body['fencingToken'] === 'number' ? body['fencingToken'] : NaN;

        if (!projectId || !documentId || !nodeId || !jobId || !actorId || !Number.isFinite(fencingToken)) {
          sendJson(res, 400, { error: 'Missing required AI peer write fields' });
          return;
        }

        const applied = await roomManager.applyAiPeerChunk({
          projectId,
          documentId,
          nodeId,
          chunk,
          jobId,
          actorId,
          fencingToken,
        });

        if (!applied) {
          sendJson(res, 404, { error: `Node "${nodeId}" not found in room ${projectId}:${documentId}` });
          return;
        }

        sendJson(res, 200, { ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid request';
        sendJson(res, 400, { error: message });
      }
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  });

  httpServer.on('upgrade', async (req, socket, head) => {
    try {
      const auth = await authenticateUpgradeRequest(req, {
        jwtSecret: options.jwtSecret,
        membershipVerifier: options.membershipVerifier,
      });

      if (!auth.ok) {
        rejectUpgrade(socket, auth.status, auth.message);
        return;
      }

      const room = await roomManager.ensureRoomHydrated(
        auth.context.projectId,
        auth.context.documentId
      );

      if (socket.destroyed) return;

      wss.handleUpgrade(req, socket, head, (ws) => {
        roomManager.attachConnection(ws, room, auth.context);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upgrade error';
      rejectUpgrade(socket, 500, msg);
    }
  });

  return {
    roomManager,

    listen(port = 4001, host = '127.0.0.1'): Promise<number> {
      return new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, host, () => {
          httpServer.off('error', reject);
          const addr = httpServer.address() as AddressInfo;
          resolve(addr.port);
        });
      });
    },

    async close(): Promise<void> {
      for (const client of wss.clients) {
        client.terminate();
      }
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      await roomManager.shutdown();
    },
  };
}

async function startStandalone(): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config();
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });

  const env = envSchema.parse(process.env);

  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    options: '-c search_path=minge,public',
    max: 15,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  const membershipVerifier = createPostgresMembershipVerifier(pool);
  const store = new PostgresCrdtStore(pool);
  const pubsub: PubSubAdapter = env.REDIS_URL
    ? new RedisPubSubAdapter(env.REDIS_URL)
    : new InMemoryPubSubBus().createAdapter();

  const gateway = createSyncGateway({
    jwtSecret: env.JWT_SECRET,
    internalSecret: env.INTERNAL_SYNC_SECRET,
    membershipVerifier,
    store,
    pubsub,
  });

  const port = await gateway.listen(env.SYNC_GATEWAY_PORT, '0.0.0.0');
  console.log(`[sync-gateway] Authenticated Yjs Gateway running on ws://0.0.0.0:${port}`);

  const shutdown = async (signal: string) => {
    console.log(`[sync-gateway] ${signal} received, shutting down...`);
    await gateway.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

const resolvedArgv = process.argv[1] ? path.resolve(process.argv[1]) : '';
const resolvedSelf = path.resolve(fileURLToPath(import.meta.url));
const isEntryPoint =
  resolvedArgv.length > 0 &&
  (process.platform === 'win32'
    ? resolvedArgv.toLowerCase() === resolvedSelf.toLowerCase()
    : resolvedArgv === resolvedSelf);

if (isEntryPoint) {
  void startStandalone();
}
