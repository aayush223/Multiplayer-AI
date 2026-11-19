/**
 * Gateway Room Manager — Scoped Y.Doc Lifecycle, Persistence, Compaction & AI Peer Writes
 *
 * Invariants 1, 3, 5:
 *  - Rooms strictly keyed by `${project_id}:${document_id}`
 *  - Hydrates snapshot + replays incremental deltas (`id > last_update_id`)
 *  - Appends every update with actorId, originType (`human` | `ai-peer`), and optional fencingToken
 *  - Compacts snapshots periodically (every N updates) and on idle
 *  - Fans out updates across gateway instances via PubSubAdapter
 */
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import { WebSocket } from 'ws';
import { buildRoomId } from '@minge/shared';
import { appendAiChunkToNode } from '@minge/crdt-core';
import type { AuthContext } from '../auth/handshake.js';
import type { CrdtOriginType, CrdtPersistenceStore } from '../persistence/postgres-store.js';
import type { PubSubAdapter } from '../pubsub/redis-bridge.js';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

interface ConnectionMeta {
  actorId: string;
  controlledIds: Set<number>;
}

interface AiOriginMeta {
  actorId: string;
  fencingToken: number;
}

export interface GatewayRoom {
  roomId: string;
  projectId: string;
  documentId: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  connections: Map<WebSocket, ConnectionMeta>;
  hydrated: boolean;
  hydrationPromise: Promise<void> | null;
  pendingUpdates: number;
  totalUpdates: number;
  lastUpdateId: number;
  isDirty: boolean;
  compacting: boolean;
  idleTimer: ReturnType<typeof setTimeout> | null;
  aiOriginMeta: Map<string, AiOriginMeta>;
}

export interface RoomManagerOptions {
  store: CrdtPersistenceStore;
  pubsub: PubSubAdapter;
  snapshotEveryNUpdates?: number;
  idleCompactMs?: number;
}

export interface AiPeerWriteInput {
  projectId: string;
  documentId: string;
  nodeId: string;
  chunk: string;
  jobId: string;
  actorId: string;
  fencingToken: number;
}

export class GatewayRoomManager {
  private readonly rooms = new Map<string, GatewayRoom>();
  private readonly store: CrdtPersistenceStore;
  private readonly pubsub: PubSubAdapter;
  private readonly snapshotEveryNUpdates: number;
  private readonly idleCompactMs: number;
  private readonly inflightPersistence = new Set<Promise<void>>();

  constructor(options: RoomManagerOptions) {
    this.store = options.store;
    this.pubsub = options.pubsub;
    this.snapshotEveryNUpdates = options.snapshotEveryNUpdates ?? 50;
    this.idleCompactMs = options.idleCompactMs ?? 30_000;
  }

  getRoom(roomId: string): GatewayRoom | undefined {
    return this.rooms.get(roomId);
  }

  getStats(): Array<{
    roomId: string;
    projectId: string;
    documentId: string;
    connections: number;
    pendingUpdates: number;
    lastUpdateId: number;
  }> {
    return Array.from(this.rooms.values()).map((r) => ({
      roomId: r.roomId,
      projectId: r.projectId,
      documentId: r.documentId,
      connections: r.connections.size,
      pendingUpdates: r.pendingUpdates,
      lastUpdateId: r.lastUpdateId,
    }));
  }

  /**
   * Ensure a room exists, is hydrated from snapshot + deltas, and is subscribed to Pub/Sub.
   * Only call AFTER authentication & authorization succeed.
   */
  async ensureRoomHydrated(projectId: string, documentId: string): Promise<GatewayRoom> {
    const roomId = buildRoomId(projectId, documentId);
    let room = this.rooms.get(roomId);

    if (!room) {
      const doc = new Y.Doc();
      const awareness = new awarenessProtocol.Awareness(doc);
      room = {
        roomId,
        projectId,
        documentId,
        doc,
        awareness,
        connections: new Map(),
        hydrated: false,
        hydrationPromise: null,
        pendingUpdates: 0,
        totalUpdates: 0,
        lastUpdateId: 0,
        isDirty: false,
        compacting: false,
        idleTimer: null,
        aiOriginMeta: new Map(),
      };
      this.attachDocHandlers(room);
      this.rooms.set(roomId, room);
    }

    if (room.hydrated) return room;

    if (!room.hydrationPromise) {
      const targetRoom = room;
      targetRoom.hydrationPromise = (async () => {
        const hydrated = await this.store.hydrateRoom(projectId, documentId);
        if (hydrated.snapshot && hydrated.snapshot.byteLength > 0) {
          Y.applyUpdate(targetRoom.doc, hydrated.snapshot, 'db-init');
        }
        let maxUpdateId = hydrated.lastUpdateId;
        for (const delta of hydrated.deltas) {
          Y.applyUpdate(targetRoom.doc, delta.updateData, 'db-init');
          if (delta.id > maxUpdateId) {
            maxUpdateId = delta.id;
          }
        }
        targetRoom.lastUpdateId = maxUpdateId;

        await this.pubsub.subscribe(roomId, (remoteUpdate) => {
          Y.applyUpdate(targetRoom.doc, remoteUpdate, 'redis-pubsub');
        });
        targetRoom.hydrated = true;
      })().catch((err) => {
        targetRoom.hydrationPromise = null;
        this.rooms.delete(roomId);
        throw err;
      });
    }

    await room.hydrationPromise;
    return room;
  }

  private broadcast(room: GatewayRoom, payload: Uint8Array, exclude?: unknown): void {
    for (const ws of room.connections.keys()) {
      if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(payload);
        } catch {
          // Socket cleanup is handled by close/error handlers
        }
      }
    }
  }

  private scheduleIdleCompaction(room: GatewayRoom): void {
    if (room.idleTimer) {
      clearTimeout(room.idleTimer);
    }
    room.idleTimer = setTimeout(() => {
      room.idleTimer = null;
      if (room.isDirty) {
        void this.compactRoom(room).catch((err) => {
          console.error(`[sync-gateway] Idle compaction failed for ${room.roomId}:`, err);
        });
      }
    }, this.idleCompactMs);
    room.idleTimer.unref?.();
  }

  private trackAsync(promise: Promise<void>): void {
    this.inflightPersistence.add(promise);
    void promise.finally(() => {
      this.inflightPersistence.delete(promise);
    });
  }

  private attachDocHandlers(room: GatewayRoom): void {
    room.doc.on('update', (update: Uint8Array, origin: unknown) => {
      // 1. Broadcast to local peers (skip sender socket)
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      this.broadcast(room, encoding.toUint8Array(encoder), origin);

      // 2. Skip persistence/re-publish for hydration or remote pub/sub echoes
      if (origin === 'db-init' || origin === 'redis-pubsub') {
        return;
      }

      // 3. Determine actor attribution, origin_type, and optional AI fencing token
      let actorId = 'system';
      let originType: CrdtOriginType = 'human';
      let fencingToken: number | null = null;

      if (typeof origin === 'string' && origin.startsWith('ai-peer:')) {
        originType = 'ai-peer';
        const aiMeta = room.aiOriginMeta.get(origin);
        actorId = aiMeta?.actorId ?? origin;
        fencingToken = aiMeta?.fencingToken ?? null;
      } else if (origin instanceof WebSocket) {
        const meta = room.connections.get(origin);
        if (meta) {
          actorId = meta.actorId;
        }
      }

      room.pendingUpdates++;
      room.totalUpdates++;
      room.isDirty = true;

      const persistAndFanout = (async () => {
        const updateId = await this.store.appendUpdate({
          projectId: room.projectId,
          documentId: room.documentId,
          updateData: update,
          actorId,
          originType,
          fencingToken,
        });
        if (updateId > room.lastUpdateId) {
          room.lastUpdateId = updateId;
        }

        await this.pubsub.publish(room.roomId, update);

        if (room.pendingUpdates >= this.snapshotEveryNUpdates) {
          await this.compactRoom(room);
        } else {
          this.scheduleIdleCompaction(room);
        }
      })().catch((err) => {
        console.error(`[sync-gateway] Failed to persist/publish update for ${room.roomId}:`, err);
      });

      this.trackAsync(persistAndFanout);
    });

    room.awareness.on(
      'update',
      (
        { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown
      ) => {
        if (origin instanceof WebSocket) {
          const meta = room.connections.get(origin);
          if (meta) {
            for (const id of added) meta.controlledIds.add(id);
            for (const id of removed) meta.controlledIds.delete(id);
          }
        }

        const changedClients = added.concat(updated, removed);
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(room.awareness, changedClients)
        );
        this.broadcast(room, encoding.toUint8Array(encoder), origin);
      }
    );
  }

  /**
   * Attach an already-authenticated WebSocket to an already-hydrated room.
   */
  attachConnection(ws: WebSocket, room: GatewayRoom, auth: AuthContext): void {
    room.connections.set(ws, {
      actorId: auth.actorId,
      controlledIds: new Set<number>(),
    });

    // Send Sync Step 1 + current awareness states
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
        awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(awarenessStates.keys()))
      );
      ws.send(encoding.toUint8Array(awarenessEncoder));
    }

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
          syncProtocol.readSyncMessage(decoder, encoder, room.doc, ws);
          if (encoding.length(encoder) > 1) {
            ws.send(encoding.toUint8Array(encoder));
          }
        } else if (messageType === MESSAGE_AWARENESS) {
          awarenessProtocol.applyAwarenessUpdate(
            room.awareness,
            decoding.readVarUint8Array(decoder),
            ws
          );
        }
      } catch (err) {
        console.error(`[sync-gateway] Invalid protocol frame in room ${room.roomId}:`, err);
      }
    });

    const cleanup = () => {
      const meta = room.connections.get(ws);
      if (!meta) return;
      room.connections.delete(ws);

      if (meta.controlledIds.size > 0) {
        awarenessProtocol.removeAwarenessStates(
          room.awareness,
          Array.from(meta.controlledIds),
          null
        );
      }

      if (room.connections.size === 0 && room.isDirty) {
        this.scheduleIdleCompaction(room);
      }
    };

    ws.on('close', cleanup);
    ws.on('error', cleanup);
  }

  /**
   * Apply a fenced AI peer streamed chunk into the room's Y.Doc under origin `'ai-peer:<jobId>'`.
   */
  async applyAiPeerChunk(input: AiPeerWriteInput): Promise<boolean> {
    const room = await this.ensureRoomHydrated(input.projectId, input.documentId);
    const origin = `ai-peer:${input.jobId}`;
    room.aiOriginMeta.set(origin, {
      actorId: input.actorId,
      fencingToken: input.fencingToken,
    });
    try {
      return appendAiChunkToNode(room.doc, input.nodeId, input.chunk, input.jobId);
    } finally {
      room.aiOriginMeta.delete(origin);
    }
  }

  /**
   * Encode full Y.Doc state into minge.crdt_snapshots with the current lastUpdateId watermark.
   */
  async compactRoom(room: GatewayRoom): Promise<void> {
    if (room.compacting) return;
    room.compacting = true;
    try {
      const snapshot = Y.encodeStateAsUpdate(room.doc);
      const watermark = room.lastUpdateId;
      await this.store.saveSnapshot({
        projectId: room.projectId,
        documentId: room.documentId,
        snapshot,
        updateCount: room.totalUpdates,
        lastUpdateId: watermark,
      });
      room.pendingUpdates = 0;
      room.isDirty = false;
    } finally {
      room.compacting = false;
    }
  }

  /** Wait for any in-flight persistence/pubsub writes to finish (useful in tests & shutdown). */
  async flush(): Promise<void> {
    if (this.inflightPersistence.size > 0) {
      await Promise.allSettled(Array.from(this.inflightPersistence));
    }
  }

  async shutdown(): Promise<void> {
    await this.flush();

    for (const room of this.rooms.values()) {
      if (room.idleTimer) {
        clearTimeout(room.idleTimer);
        room.idleTimer = null;
      }
      if (room.isDirty) {
        try {
          await this.compactRoom(room);
        } catch (err) {
          console.error(`[sync-gateway] Shutdown compaction failed for ${room.roomId}:`, err);
        }
      }
      await this.pubsub.unsubscribe(room.roomId).catch(() => {});
      room.awareness.destroy();
      room.doc.destroy();
    }

    this.rooms.clear();
    await this.pubsub.close();
    await this.store.close();
  }
}
