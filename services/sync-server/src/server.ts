/**
 * Minge Sync Server — Yjs WebSocket CRDT Synchronization
 *
 * Invariant 3: Real-time Yjs CRDT sync over WebSockets.
 * Invariant 3: Rooms scoped as ${project_id}:${document_id}.
 * Invariant 3: Binary snapshots & update logs persisted to Postgres.
 * Invariant 3: AI edits as a collaborative peer via standard Yjs updates.
 *
 * Speaks standard y-websocket protocol (y-protocols/sync + y-protocols/awareness).
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

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import {
  getOrCreateRoom,
  addConnection,
  removeConnection,
  shouldSnapshot,
  getActiveRooms,
  getRoomStats,
  type ManagedRoom,
  type RoomConnection,
} from './rooms/manager.js';
import {
  initializeRoomFromDB,
  persistUpdate,
  persistSnapshot,
  closePersistence,
} from './persistence/postgres-adapter.js';
import { parseRoomId } from '@minge/shared';

const SYNC_PORT = parseInt(process.env['SYNC_PORT'] ?? '4000', 10);

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

const attachedRooms = new WeakSet<ManagedRoom>();

function broadcastToRoom(room: ManagedRoom, payload: Uint8Array, exclude?: unknown): void {
  for (const conn of room.connections) {
    if (conn !== exclude && (conn as unknown as WebSocket).readyState === WebSocket.OPEN) {
      try {
        (conn as unknown as WebSocket).send(payload);
      } catch (err) {
        console.error(`[sync] Failed to broadcast to peer in room ${room.roomId}:`, err);
      }
    }
  }
}

function attachRoomBroadcastHandlers(room: ManagedRoom): void {
  if (attachedRooms.has(room)) return;
  attachedRooms.add(room);

  // Broadcast and persist incremental Yjs document updates
  room.doc.on('update', (update: Uint8Array, origin: unknown) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    broadcastToRoom(room, encoding.toUint8Array(encoder), origin);

    if (origin !== 'db-init') {
      void persistUpdate(room.projectId, room.documentId, update).catch((err) => {
        console.error(`[sync] Failed to persist update for room ${room.roomId}:`, err);
      });

      if (shouldSnapshot(room)) {
        void persistSnapshot(room).catch((err) => {
          console.error(`[sync] Failed to snapshot room ${room.roomId}:`, err);
        });
      }
    }
  });

  // Track controlled awareness client IDs and broadcast awareness updates
  room.awareness.on(
    'update',
    (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown
    ) => {
      const changedClients = added.concat(updated, removed);
      if (origin && room.connControlledIds.has(origin as RoomConnection)) {
        const controlled = room.connControlledIds.get(origin as RoomConnection)!;
        for (const id of added) controlled.add(id);
        for (const id of removed) controlled.delete(id);
      }

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(room.awareness, changedClients)
      );
      broadcastToRoom(room, encoding.toUint8Array(encoder), origin);
    }
  );
}

async function main() {
  const httpServer = createServer((req, res) => {
    if (req.url === '/health') {
      const stats = getRoomStats();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        service: 'sync-server',
        timestamp: new Date().toISOString(),
        rooms: stats.length,
        totalConnections: stats.reduce((sum, r) => sum + r.connections, 0),
      }));
      return;
    }

    if (req.url === '/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ rooms: getRoomStats() }));
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', async (ws: WebSocket, req) => {
    const url = new URL(req.url ?? '/', `http://localhost:${SYNC_PORT}`);
    const roomId = decodeURIComponent(url.pathname.slice(1));

    try {
      parseRoomId(roomId);
    } catch {
      console.error(`[sync] Invalid room ID: "${roomId}". Expected format: project_id:document_id`);
      ws.close(4001, 'Invalid room ID. Expected format: project_id:document_id');
      return;
    }

    console.log(`[sync] Client connected to room: ${roomId}`);

    const room = getOrCreateRoom(roomId);

    if (room.connections.size === 0) {
      try {
        await initializeRoomFromDB(room);
      } catch (err) {
        console.error(`[sync] Failed to initialize room ${roomId} from DB:`, err);
      }
    }

    attachRoomBroadcastHandlers(room);

    const conn = ws as unknown as RoomConnection;
    addConnection(roomId, conn);

    // Send Sync Step 1 and current awareness states to newly connected client
    try {
      const syncEncoder = encoding.createEncoder();
      encoding.writeVarUint(syncEncoder, MESSAGE_SYNC);
      syncProtocol.writeSyncStep1(syncEncoder, room.doc);
      ws.send(encoding.toUint8Array(syncEncoder));

      const awarenessStates = room.awareness.getStates();
      if (awarenessStates.size > 0) {
        const awarenessEncoder = encoding.createEncoder();
        encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(
          awarenessEncoder,
          awarenessProtocol.encodeAwarenessUpdate(
            room.awareness,
            Array.from(awarenessStates.keys())
          )
        );
        ws.send(encoding.toUint8Array(awarenessEncoder));
      }
    } catch (err) {
      console.error(`[sync] Failed to send initial sync state to client in room ${roomId}:`, err);
    }

    // Handle incoming y-websocket messages (sync + awareness)
    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const raw =
          data instanceof Buffer
            ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
            : Array.isArray(data)
            ? new Uint8Array(Buffer.concat(data))
            : new Uint8Array(data);

        const decoder = decoding.createDecoder(raw);
        const messageType = decoding.readVarUint(decoder);

        if (messageType === MESSAGE_SYNC) {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MESSAGE_SYNC);
          syncProtocol.readSyncMessage(decoder, encoder, room.doc, conn);
          if (encoding.length(encoder) > 1) {
            ws.send(encoding.toUint8Array(encoder));
          }
        } else if (messageType === MESSAGE_AWARENESS) {
          awarenessProtocol.applyAwarenessUpdate(
            room.awareness,
            decoding.readVarUint8Array(decoder),
            conn
          );
        }
      } catch (err) {
        console.error(`[sync] Malformed or unhandled message in room ${roomId}:`, err);
      }
    });

    const handleDisconnect = () => {
      console.log(`[sync] Client disconnected from room: ${roomId}`);
      removeConnection(roomId, conn);
    };

    ws.on('close', handleDisconnect);
    ws.on('error', (err) => {
      console.error(`[sync] WebSocket error in room ${roomId}:`, err);
      removeConnection(roomId, conn);
    });
  });

  // Periodic snapshot of dirty rooms (safety net)
  const snapshotInterval = setInterval(async () => {
    const activeRooms = getActiveRooms();
    for (const room of activeRooms) {
      if (shouldSnapshot(room)) {
        try {
          await persistSnapshot(room);
        } catch (err) {
          console.error(`[sync] Periodic snapshot failed for room ${room.roomId}:`, err);
        }
      }
    }
  }, 30_000);

  httpServer.listen(SYNC_PORT, '0.0.0.0', () => {
    console.log(`🔄 Minge Sync Server running on ws://localhost:${SYNC_PORT}`);
    console.log(`📋 Health check: http://localhost:${SYNC_PORT}/health`);
  });

  const shutdown = async (signal: string) => {
    console.log(`${signal} received. Saving all room snapshots...`);
    clearInterval(snapshotInterval);

    const activeRooms = getActiveRooms();
    for (const room of activeRooms) {
      if (room.isDirty) {
        try {
          await persistSnapshot(room);
        } catch (err) {
          console.error(`[sync] Failed to save snapshot for room ${room.roomId} during shutdown:`, err);
        }
      }
    }

    wss.close();
    httpServer.close();
    await closePersistence();
    console.log('[sync] Graceful shutdown complete.');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
