/**
 * Minge Sync Server — Yjs WebSocket CRDT Synchronization
 *
 * Invariant 3: Real-time Yjs CRDT sync over WebSockets.
 * Invariant 3: Rooms scoped as ${project_id}:${document_id}.
 * Invariant 3: Binary snapshots & update logs persisted to Postgres.
 * Invariant 3: AI edits as a collaborative peer via standard Yjs updates.
 *
 * Protocol:
 *   1. Client connects to ws://host:port/${project_id}:${document_id}
 *   2. Server sends current state (snapshot + updates)
 *   3. Client sends incremental updates as they edit
 *   4. Server broadcasts updates to all other clients in the room
 *   5. Server periodically snapshots room state to Postgres
 */
import 'dotenv/config';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import * as Y from 'yjs';
import {
  getOrCreateRoom,
  addConnection,
  removeConnection,
  shouldSnapshot,
  applyUpdate,
  encodeRoomState,
  getActiveRooms,
  getRoomStats,
} from './rooms/manager.js';
import {
  initializeRoomFromDB,
  persistUpdate,
  persistSnapshot,
  closePersistence,
} from './persistence/postgres-adapter.js';
import { parseRoomId } from '@minge/shared';

const SYNC_PORT = parseInt(process.env['SYNC_PORT'] ?? '4000', 10);

async function main() {
  const httpServer = createServer((req, res) => {
    // Health check endpoint
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

    // Room stats endpoint
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
    // Extract room ID from URL path: /project_id:document_id
    const url = new URL(req.url ?? '/', `http://localhost:${SYNC_PORT}`);
    const roomId = url.pathname.slice(1); // Remove leading "/"

    if (!roomId || !roomId.includes(':')) {
      console.error(`[sync] Invalid room ID: "${roomId}". Expected format: project_id:document_id`);
      ws.close(4001, 'Invalid room ID. Expected format: project_id:document_id');
      return;
    }

    // Validate room ID format
    try {
      parseRoomId(roomId);
    } catch {
      ws.close(4001, 'Invalid room ID format.');
      return;
    }

    console.log(`[sync] Client connected to room: ${roomId}`);

    // Get or create the room
    const room = getOrCreateRoom(roomId);

    // If this is the first connection to the room, initialize from DB
    if (room.connections.size === 0) {
      try {
        await initializeRoomFromDB(room);
      } catch (err) {
        console.error(`[sync] Failed to initialize room ${roomId} from DB:`, err);
        // Continue anyway — the room will start empty
      }
    }

    // Add the connection to the room
    addConnection(roomId, ws as unknown as { send: (data: Uint8Array) => void; readyState: number });

    // Send the current state to the new client
    try {
      const currentState = encodeRoomState(room);
      ws.send(currentState, { binary: true });
    } catch (err) {
      console.error(`[sync] Failed to send initial state to client in room ${roomId}:`, err);
    }

    // Handle incoming messages (Yjs updates from clients)
    ws.on('message', async (data: Buffer) => {
      const update = new Uint8Array(data);

      // Apply the update to the room's Yjs doc
      applyUpdate(room, update, ws);

      // Broadcast to all other connections in the room
      for (const conn of room.connections) {
        if (conn !== ws && (conn as unknown as WebSocket).readyState === WebSocket.OPEN) {
          try {
            (conn as unknown as WebSocket).send(update);
          } catch (err) {
            console.error(`[sync] Failed to broadcast to peer in room ${roomId}:`, err);
          }
        }
      }

      // Persist the update to the append-only log
      try {
        await persistUpdate(room.projectId, room.documentId, update);
      } catch (err) {
        console.error(`[sync] Failed to persist update for room ${roomId}:`, err);
      }

      // Check if we should create a snapshot
      if (shouldSnapshot(room)) {
        try {
          await persistSnapshot(room);
        } catch (err) {
          console.error(`[sync] Failed to snapshot room ${roomId}:`, err);
        }
      }
    });

    // Handle disconnection
    ws.on('close', () => {
      console.log(`[sync] Client disconnected from room: ${roomId}`);
      removeConnection(roomId, ws as unknown as { send: (data: Uint8Array) => void; readyState: number });
    });

    ws.on('error', (err) => {
      console.error(`[sync] WebSocket error in room ${roomId}:`, err);
      removeConnection(roomId, ws as unknown as { send: (data: Uint8Array) => void; readyState: number });
    });
  });

  // ──────────────────────────────────────────────────
  // Periodic snapshot of dirty rooms (safety net)
  // ──────────────────────────────────────────────────
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
  }, 30_000); // Check every 30 seconds

  // ──────────────────────────────────────────────────
  // Start listening
  // ──────────────────────────────────────────────────
  httpServer.listen(SYNC_PORT, '0.0.0.0', () => {
    console.log(`🔄 Minge Sync Server running on ws://localhost:${SYNC_PORT}`);
    console.log(`📋 Health check: http://localhost:${SYNC_PORT}/health`);
  });

  // ──────────────────────────────────────────────────
  // Graceful shutdown
  // ──────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    console.log(`${signal} received. Saving all room snapshots...`);
    clearInterval(snapshotInterval);

    // Persist all dirty rooms before shutting down
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
