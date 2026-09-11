/**
 * Sync Server Tests — Invariant 3 Verification
 *
 * Tests that:
 * - Room management works correctly (create, add/remove connections).
 * - Room IDs are properly scoped as project_id:document_id.
 * - Snapshot threshold logic works correctly.
 * - Yjs doc state encoding/decoding roundtrips.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';

// Import room manager functions directly (no DB dependency)
import {
  getOrCreateRoom,
  addConnection,
  removeConnection,
  shouldSnapshot,
  markSnapshotted,
  encodeRoomState,
  applyUpdate,
  loadSnapshot,
  destroyRoom,
  getRoomStats,
} from '../services/sync-server/src/rooms/manager.js';

describe('Room Manager — Invariant 3: CRDT Room Scoping', () => {
  beforeEach(() => {
    // Clean up any leftover rooms
    const stats = getRoomStats();
    for (const stat of stats) {
      destroyRoom(stat.roomId);
    }
  });

  it('creates a room with correct project/document scoping', () => {
    const room = getOrCreateRoom('project-abc:doc-123');
    expect(room.projectId).toBe('project-abc');
    expect(room.documentId).toBe('doc-123');
    expect(room.roomId).toBe('project-abc:doc-123');
  });

  it('returns the same room for the same roomId', () => {
    const room1 = getOrCreateRoom('p1:d1');
    const room2 = getOrCreateRoom('p1:d1');
    expect(room1).toBe(room2);
  });

  it('creates different rooms for different roomIds', () => {
    const room1 = getOrCreateRoom('p1:d1');
    const room2 = getOrCreateRoom('p1:d2');
    expect(room1).not.toBe(room2);
  });

  it('tracks connections correctly', () => {
    const mockConn1 = { send: () => {}, readyState: 1 };
    const mockConn2 = { send: () => {}, readyState: 1 };

    const room = addConnection('p1:d1', mockConn1);
    expect(room.connections.size).toBe(1);

    addConnection('p1:d1', mockConn2);
    expect(room.connections.size).toBe(2);

    removeConnection('p1:d1', mockConn1);
    expect(room.connections.size).toBe(1);
  });

  it('destroys rooms properly', () => {
    getOrCreateRoom('p1:d1');
    expect(getRoomStats().length).toBe(1);

    destroyRoom('p1:d1');
    expect(getRoomStats().length).toBe(0);
  });
});

describe('Room Manager — Snapshot Logic', () => {
  beforeEach(() => {
    const stats = getRoomStats();
    for (const stat of stats) {
      destroyRoom(stat.roomId);
    }
  });

  it('does not snapshot a clean room', () => {
    const room = getOrCreateRoom('p1:d1');
    expect(shouldSnapshot(room)).toBe(false);
  });

  it('resets dirty state after marking snapshotted', () => {
    const room = getOrCreateRoom('p1:d1');
    room.isDirty = true;
    room.updateCount = 200;

    markSnapshotted(room);
    expect(room.isDirty).toBe(false);
    expect(room.updateCount).toBe(0);
  });
});

describe('Room Manager — Yjs State', () => {
  beforeEach(() => {
    const stats = getRoomStats();
    for (const stat of stats) {
      destroyRoom(stat.roomId);
    }
  });

  it('encodes and loads room state correctly', () => {
    // Create a room and add some content
    const room = getOrCreateRoom('p1:d1');
    const text = room.doc.getText('content');
    text.insert(0, 'Hello, Minge!');

    // Encode the state
    const state = encodeRoomState(room);
    expect(state).toBeInstanceOf(Uint8Array);
    expect(state.length).toBeGreaterThan(0);

    // Create a new room and load the snapshot
    const room2 = getOrCreateRoom('p2:d2');
    loadSnapshot(room2, state);

    const text2 = room2.doc.getText('content');
    expect(text2.toString()).toBe('Hello, Minge!');
  });

  it('applies updates between rooms (simulating CRDT sync)', () => {
    const room1 = getOrCreateRoom('p1:d1');
    const room2 = getOrCreateRoom('p1:d2-replica');

    // Initial sync: room2 gets room1's state
    const initialState = encodeRoomState(room1);
    loadSnapshot(room2, initialState);

    // Room1 makes an edit
    const text1 = room1.doc.getText('content');
    text1.insert(0, 'Edit from Room1');

    // Capture the update
    const update = Y.encodeStateAsUpdate(room1.doc, Y.encodeStateVector(room2.doc));

    // Apply to room2
    applyUpdate(room2, update);

    const text2 = room2.doc.getText('content');
    expect(text2.toString()).toBe('Edit from Room1');
  });
});
