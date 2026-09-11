/**
 * Yjs Room Manager — Project-scoped CRDT document management.
 *
 * Invariant 3: Rooms are scoped as ${project_id}:${document_id}.
 *              Binary snapshots persisted to Postgres minge.crdt_snapshots.
 *              Incremental updates logged in minge.crdt_updates.
 *
 * Invariant 3: AI edits as a collaborative peer via Yjs updates.
 */
import * as Y from 'yjs';
import { parseRoomId } from '@minge/shared';

export interface ManagedRoom {
  doc: Y.Doc;
  roomId: string;
  projectId: string;
  documentId: string;
  connections: Set<WebSocket | { send: (data: Uint8Array) => void; readyState: number }>;
  updateCount: number;
  isDirty: boolean;
  lastSnapshotAt: number;
}

const rooms = new Map<string, ManagedRoom>();

/** Snapshot interval: persist every 100 updates or every 60 seconds */
const SNAPSHOT_UPDATE_THRESHOLD = 100;
const SNAPSHOT_TIME_THRESHOLD_MS = 60_000;

/**
 * Get or create a room for the given roomId.
 * Room ID format: ${project_id}:${document_id}
 */
export function getOrCreateRoom(roomId: string): ManagedRoom {
  let room = rooms.get(roomId);
  if (room) return room;

  const { projectId, documentId } = parseRoomId(roomId);

  const doc = new Y.Doc();
  room = {
    doc,
    roomId,
    projectId,
    documentId,
    connections: new Set(),
    updateCount: 0,
    isDirty: false,
    lastSnapshotAt: Date.now(),
  };

  // Listen for doc updates to track dirty state
  doc.on('update', (_update: Uint8Array, _origin: unknown) => {
    room!.updateCount++;
    room!.isDirty = true;
  });

  rooms.set(roomId, room);
  return room;
}

/**
 * Add a connection to a room.
 */
export function addConnection(
  roomId: string,
  conn: WebSocket | { send: (data: Uint8Array) => void; readyState: number }
): ManagedRoom {
  const room = getOrCreateRoom(roomId);
  room.connections.add(conn);
  return room;
}

/**
 * Remove a connection from a room.
 * If the room has no connections left, mark it for potential cleanup.
 */
export function removeConnection(
  roomId: string,
  conn: WebSocket | { send: (data: Uint8Array) => void; readyState: number }
): void {
  const room = rooms.get(roomId);
  if (!room) return;

  room.connections.delete(conn);

  // If no more connections, keep the room alive for a short period
  // (don't destroy immediately, another client may reconnect)
}

/**
 * Check if a room needs to be snapshotted.
 */
export function shouldSnapshot(room: ManagedRoom): boolean {
  if (!room.isDirty) return false;
  const timeSinceLastSnapshot = Date.now() - room.lastSnapshotAt;
  return (
    room.updateCount >= SNAPSHOT_UPDATE_THRESHOLD ||
    timeSinceLastSnapshot >= SNAPSHOT_TIME_THRESHOLD_MS
  );
}

/**
 * Mark a room as snapshotted (reset counters).
 */
export function markSnapshotted(room: ManagedRoom): void {
  room.isDirty = false;
  room.updateCount = 0;
  room.lastSnapshotAt = Date.now();
}

/**
 * Get the encoded state of a room's doc as a Uint8Array.
 */
export function encodeRoomState(room: ManagedRoom): Uint8Array {
  return Y.encodeStateAsUpdate(room.doc);
}

/**
 * Apply an update to a room's doc (from a remote client or AI peer).
 */
export function applyUpdate(room: ManagedRoom, update: Uint8Array, origin?: unknown): void {
  Y.applyUpdate(room.doc, update, origin);
}

/**
 * Load initial state into a room's doc from a snapshot.
 */
export function loadSnapshot(room: ManagedRoom, snapshot: Uint8Array): void {
  Y.applyUpdate(room.doc, snapshot);
  room.isDirty = false;
  room.updateCount = 0;
}

/**
 * Get all active rooms.
 */
export function getActiveRooms(): ManagedRoom[] {
  return Array.from(rooms.values());
}

/**
 * Destroy a room (cleanup).
 */
export function destroyRoom(roomId: string): void {
  const room = rooms.get(roomId);
  if (room) {
    room.doc.destroy();
    room.connections.clear();
    rooms.delete(roomId);
  }
}

/**
 * Get room statistics for debugging.
 */
export function getRoomStats(): { roomId: string; connections: number; updateCount: number; isDirty: boolean }[] {
  return Array.from(rooms.values()).map(room => ({
    roomId: room.roomId,
    connections: room.connections.size,
    updateCount: room.updateCount,
    isDirty: room.isDirty,
  }));
}
