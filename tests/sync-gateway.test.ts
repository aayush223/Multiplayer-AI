/**
 * Authenticated Yjs Sync Gateway Tests — Invariants 1, 3, 5, 8
 *
 * Verifies:
 *  - Fail-closed 400/401/403 WebSocket upgrade rejection BEFORE hydrating any Y.Doc
 *  - Snapshot hydration + incremental delta replay (`id > last_update_id`)
 *  - Attributed update persistence (`actorId`, `originType: 'human' | 'ai-peer'`, `fencingToken`)
 *  - Multi-instance horizontal synchronization via Pub/Sub without echo loops
 *  - Authenticated internal AI Peer write endpoint (`POST /internal/ai-peer/write`)
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import WebSocket from 'ws';
import { createSigner } from 'fast-jwt';
import { createNode, getNodeContentText, getNodesMap } from '@minge/crdt-core';
import { createSyncGateway, type SyncGatewayInstance } from '../services/sync-gateway/src/server.js';
import { InMemoryCrdtStore } from '../services/sync-gateway/src/persistence/postgres-store.js';
import { InMemoryPubSubBus } from '../services/sync-gateway/src/pubsub/redis-bridge.js';
import type { MembershipVerifier } from '../services/sync-gateway/src/auth/handshake.js';

const JWT_SECRET = 'test_sync_gateway_jwt_secret_at_least_32_chars';
const INTERNAL_SECRET = 'test_internal_sync_secret_at_least_32_chars';
const signJwt = createSigner({ key: JWT_SECRET });

const MESSAGE_SYNC = 0;

function createMockMembership(allowed: Record<string, string[]>): MembershipVerifier {
  return {
    async verifyUserProjectAccess(projectId: string, userId: string): Promise<boolean> {
      return Boolean(allowed[projectId]?.includes(userId));
    },
    async verifyProjectKey(projectId: string, projectKey: string): Promise<boolean> {
      return projectKey === `key-${projectId}`;
    },
  };
}

function connectWsExpectHttpError(url: string, headers?: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers });
    ws.once('unexpected-response', (_req, res) => {
      resolve(res.statusCode ?? 0);
      ws.terminate();
    });
    ws.once('open', () => {
      ws.terminate();
      reject(new Error(`Expected HTTP rejection, but WebSocket opened for ${url}`));
    });
    ws.once('error', () => {
      // Handled by unexpected-response
    });
  });
}

async function connectSyncedClient(
  url: string,
  headers?: Record<string, string>
): Promise<{ ws: WebSocket; doc: Y.Doc; close: () => Promise<void> }> {
  const doc = new Y.Doc();
  const ws = new WebSocket(url, { headers });

  await new Promise<void>((resolve, reject) => {
    let synced = false;

    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      const raw =
        data instanceof Buffer
          ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
          : Array.isArray(data)
          ? new Uint8Array(Buffer.concat(data))
          : new Uint8Array(data);

      const decoder = decoding.createDecoder(raw);
      const msgType = decoding.readVarUint(decoder);
      if (msgType !== MESSAGE_SYNC) return;

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      const syncMsgType = syncProtocol.readSyncMessage(decoder, encoder, doc, 'remote');
      if (encoding.length(encoder) > 1) {
        ws.send(encoding.toUint8Array(encoder));
      }
      if (syncMsgType === syncProtocol.messageYjsSyncStep2 && !synced) {
        synced = true;
        resolve();
      }
    });

    ws.once('open', () => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_SYNC);
      syncProtocol.writeSyncStep1(enc, doc);
      ws.send(encoding.toUint8Array(enc));
    });

    ws.once('unexpected-response', (_req, res) => {
      reject(new Error(`Unexpected HTTP status ${res.statusCode}`));
    });
    ws.once('error', reject);
  });

  doc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === 'remote') return;
    if (ws.readyState === WebSocket.OPEN) {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_SYNC);
      syncProtocol.writeUpdate(enc, update);
      ws.send(encoding.toUint8Array(enc));
    }
  });

  return {
    ws,
    doc,
    close: async () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        await new Promise<void>((resolve) => {
          ws.once('close', () => resolve());
          ws.close();
        });
      }
      doc.destroy();
    },
  };
}

async function waitForCondition(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for sync condition');
    }
    await new Promise((r) => setTimeout(r, 15));
  }
}

describe('Sync Gateway — Fail-Closed Auth, Persistence & Multi-Instance Sync', () => {
  const gateways: SyncGatewayInstance[] = [];

  afterEach(async () => {
    while (gateways.length > 0) {
      const gw = gateways.pop()!;
      await gw.close();
    }
  });

  it('rejects unauthenticated and unauthorized upgrades with 400/401/403 before hydrating any Y.Doc', async () => {
    const store = new InMemoryCrdtStore();
    const bus = new InMemoryPubSubBus();
    const gateway = createSyncGateway({
      jwtSecret: JWT_SECRET,
      internalSecret: INTERNAL_SECRET,
      membershipVerifier: createMockMembership({ 'proj-1': ['user-alice'] }),
      store,
      pubsub: bus.createAdapter(),
    });
    gateways.push(gateway);
    const port = await gateway.listen(0);

    // 1. Missing credentials -> 401
    expect(await connectWsExpectHttpError(`ws://127.0.0.1:${port}/proj-1:doc-1`)).toBe(401);

    // 2. Invalid JWT signature -> 401
    const badToken = createSigner({ key: 'wrong_secret_key_for_signing_jwt_token' })({
      sub: 'user-alice',
      projectIds: ['proj-1'],
    });
    expect(
      await connectWsExpectHttpError(`ws://127.0.0.1:${port}/proj-1:doc-1`, {
        Authorization: `Bearer ${badToken}`,
      })
    ).toBe(401);

    // 3. Valid JWT for non-member user -> 403
    const intruderToken = signJwt({ sub: 'user-mallory', projectIds: ['proj-1'] });
    expect(
      await connectWsExpectHttpError(`ws://127.0.0.1:${port}/proj-1:doc-1`, {
        Authorization: `Bearer ${intruderToken}`,
      })
    ).toBe(403);

    // 4. Valid JWT scoped only to a different project -> 403
    const wrongProjectToken = signJwt({ sub: 'user-alice', projectIds: ['proj-other'] });
    expect(
      await connectWsExpectHttpError(`ws://127.0.0.1:${port}/proj-1:doc-1`, {
        Authorization: `Bearer ${wrongProjectToken}`,
      })
    ).toBe(403);

    // 5. Invalid room path missing project:doc delimiter -> 400
    const validToken = signJwt({ sub: 'user-alice', projectIds: ['proj-1'] });
    expect(
      await connectWsExpectHttpError(`ws://127.0.0.1:${port}/invalid-room-id`, {
        Authorization: `Bearer ${validToken}`,
      })
    ).toBe(400);

    // Zero Y.Docs hydrated or allocated on rejected handshakes
    expect(store.hydrateCallCount).toBe(0);
    expect(gateway.roomManager.getStats()).toHaveLength(0);
  });

  it('hydrates snapshot + replayed deltas, records attributed updates, and compacts snapshots', async () => {
    const store = new InMemoryCrdtStore();
    const bus = new InMemoryPubSubBus();

    // Seed snapshot (node-1) + subsequent delta (node-2)
    const seedDoc = new Y.Doc();
    createNode(seedDoc, { id: 'node-1', content: 'Snapshot content', clientId: 1 });
    const snapshotBytes = Y.encodeStateAsUpdate(seedDoc);
    const svAtSnap = Y.encodeStateVector(seedDoc);

    await store.saveSnapshot({
      projectId: 'proj-1',
      documentId: 'doc-1',
      snapshot: snapshotBytes,
      updateCount: 1,
      lastUpdateId: 1,
    });

    // Delta id=1 (already in snapshot, should be skipped) and id=2 (newer, must be replayed)
    await store.appendUpdate({
      projectId: 'proj-1',
      documentId: 'doc-1',
      updateData: snapshotBytes,
      actorId: 'user-alice',
      originType: 'human',
    });

    createNode(seedDoc, { id: 'node-2', content: 'Replayed delta content', clientId: 1 });
    const deltaBytes = Y.encodeStateAsUpdate(seedDoc, svAtSnap);
    await store.appendUpdate({
      projectId: 'proj-1',
      documentId: 'doc-1',
      updateData: deltaBytes,
      actorId: 'user-alice',
      originType: 'human',
    });
    seedDoc.destroy();

    const gateway = createSyncGateway({
      jwtSecret: JWT_SECRET,
      internalSecret: INTERNAL_SECRET,
      membershipVerifier: createMockMembership({ 'proj-1': ['user-alice'] }),
      store,
      pubsub: bus.createAdapter(),
      snapshotEveryNUpdates: 2,
    });
    gateways.push(gateway);
    const port = await gateway.listen(0);

    const token = signJwt({ sub: 'user-alice', projectIds: ['proj-1'] });
    const client = await connectSyncedClient(`ws://127.0.0.1:${port}/proj-1:doc-1`, {
      Authorization: `Bearer ${token}`,
    });

    // Both snapshot node and delta node are hydrated into client
    const nodes = getNodesMap(client.doc);
    expect(getNodeContentText(nodes.get('node-1')!).toString()).toBe('Snapshot content');
    expect(getNodeContentText(nodes.get('node-2')!).toString()).toBe('Replayed delta content');

    // Client performs 2 edits -> persisted with actorId & triggers compaction
    createNode(client.doc, { id: 'node-3', content: 'Edit 1', clientId: 10 });
    createNode(client.doc, { id: 'node-4', content: 'Edit 2', clientId: 10 });

    await waitForCondition(() => store.updates.length >= 4);
    await gateway.roomManager.flush();

    const newUpdates = store.updates.slice(2);
    expect(newUpdates.every((u) => u.actorId === 'user-alice')).toBe(true);
    expect(newUpdates.every((u) => u.originType === 'human')).toBe(true);

    const compacted = store.snapshots.get('proj-1:doc-1');
    expect(compacted).toBeDefined();
    expect(compacted!.lastUpdateId).toBeGreaterThanOrEqual(4);

    await client.close();
  });

  it('synchronizes edits across two independent gateway instances via Pub/Sub and supports fenced AI peer writes', async () => {
    const storeA = new InMemoryCrdtStore();
    const storeB = new InMemoryCrdtStore();
    const sharedBus = new InMemoryPubSubBus();
    const membership = createMockMembership({ 'proj-1': ['user-alice', 'user-bob'] });

    const gatewayA = createSyncGateway({
      jwtSecret: JWT_SECRET,
      internalSecret: INTERNAL_SECRET,
      membershipVerifier: membership,
      store: storeA,
      pubsub: sharedBus.createAdapter('gw-a'),
    });
    const gatewayB = createSyncGateway({
      jwtSecret: JWT_SECRET,
      internalSecret: INTERNAL_SECRET,
      membershipVerifier: membership,
      store: storeB,
      pubsub: sharedBus.createAdapter('gw-b'),
    });
    gateways.push(gatewayA, gatewayB);

    const portA = await gatewayA.listen(0);
    const portB = await gatewayB.listen(0);

    const aliceToken = signJwt({ sub: 'user-alice', projectIds: ['proj-1'] });
    const bobToken = signJwt({ sub: 'user-bob', projectIds: ['proj-1'] });

    const alice = await connectSyncedClient(`ws://127.0.0.1:${portA}/proj-1:doc-shared`, {
      Authorization: `Bearer ${aliceToken}`,
    });
    const bob = await connectSyncedClient(`ws://127.0.0.1:${portB}/proj-1:doc-shared`, {
      Authorization: `Bearer ${bobToken}`,
    });

    // Alice creates a node on Gateway A -> Bob receives it on Gateway B via Pub/Sub
    createNode(alice.doc, { id: 'shared-node', content: 'Prompt: ', clientId: 1 });

    await waitForCondition(() => getNodesMap(bob.doc).has('shared-node'));
    expect(
      getNodeContentText(getNodesMap(bob.doc).get('shared-node')!).toString()
    ).toBe('Prompt: ');

    // Unauthenticated internal AI peer write must fail with 401
    const unauthRes = await fetch(`http://127.0.0.1:${portA}/internal/ai-peer/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': 'wrong-secret' },
      body: JSON.stringify({
        projectId: 'proj-1',
        documentId: 'doc-shared',
        nodeId: 'shared-node',
        chunk: 'blocked',
        jobId: 'job-1',
        actorId: 'user-alice',
        fencingToken: 1,
      }),
    });
    expect(unauthRes.status).toBe(401);

    // Authenticated AI peer write on Gateway A propagates to BOTH Alice (A) and Bob (B)
    const aiRes = await fetch(`http://127.0.0.1:${portA}/internal/ai-peer/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': INTERNAL_SECRET },
      body: JSON.stringify({
        projectId: 'proj-1',
        documentId: 'doc-shared',
        nodeId: 'shared-node',
        chunk: 'Generated by AI Peer',
        jobId: 'job-99',
        actorId: 'user-alice',
        fencingToken: 7,
      }),
    });
    expect(aiRes.status).toBe(200);

    await waitForCondition(
      () =>
        getNodeContentText(getNodesMap(bob.doc).get('shared-node')!).toString() ===
        'Prompt: Generated by AI Peer'
    );
    await waitForCondition(
      () =>
        getNodeContentText(getNodesMap(alice.doc).get('shared-node')!).toString() ===
        'Prompt: Generated by AI Peer'
    );

    await gatewayA.roomManager.flush();
    const aiUpdateRecord = storeA.updates.find((u) => u.originType === 'ai-peer');
    expect(aiUpdateRecord).toBeDefined();
    expect(aiUpdateRecord!.actorId).toBe('user-alice');
    expect(aiUpdateRecord!.fencingToken).toBe(7);

    // Gateway B received the update over Pub/Sub and MUST NOT have re-persisted a duplicate copy
    await gatewayB.roomManager.flush();
    expect(storeB.updates).toHaveLength(0);

    await alice.close();
    await bob.close();
  });
});
