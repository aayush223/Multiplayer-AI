/**
 * Concurrent AI Peer Locking & Fencing Tests — Invariants 1, 3, 5, 6, 8
 *
 * Verifies:
 *  - Mandatory JWT auth (401), X-User-Id attribution (400), project scope (403), and quotas (429)
 *  - Tier-2 Redis-semantics lease returning 409 Conflict with activeJobId on collision
 *  - Tier-3 Fenced AI Peer writes preventing a paused/expired worker from corrupting a newer job's Y.Doc
 *  - Atomic compare-and-delete lease release preventing a stale worker from releasing a newer lock
 *  - Attribution audit logging including nodeId, jobId, and fencingToken
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import * as Y from 'yjs';
import { appendAiChunkToNode, createNode, getNodeContentText, getNodesMap } from '@minge/crdt-core';
import { registerAuth } from '../services/backend-api/src/auth/jwt.js';
import { InMemoryAiLockStore } from '../services/backend-api/src/locking/redis-lease.js';
import {
  registerAiGenerateRoutes,
  type AiGenerateAuditEntry,
  type AiGenerateDeps,
} from '../services/backend-api/src/routes/ai-generate.js';

const TEST_JWT_SECRET = 'test_backend_jwt_secret_at_least_32_characters';

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function buildTestApp(deps: AiGenerateDeps): Promise<FastifyInstance> {
  process.env['JWT_SECRET'] = TEST_JWT_SECRET;
  const app = Fastify({ logger: false });
  await registerAuth(app);
  await registerAiGenerateRoutes(app, deps);
  await app.ready();
  return app;
}

describe('AI Generate Route — Auth, Attribution, Quotas, Leasing & Fencing', () => {
  let nowMs: number;

  beforeEach(() => {
    nowMs = 1_700_000_000_000;
  });

  it('enforces 401 JWT auth, 400 X-User-Id attribution, 403 project access, and 429 quota limits', async () => {
    let streamCalls = 0;
    let quotaAllowed = true;

    const app = await buildTestApp({
      lockStore: new InMemoryAiLockStore(() => nowMs),
      checkQuota: async () => ({
        allowed: quotaAllowed,
        dailyLimit: 1000,
        usedTokens: quotaAllowed ? 10 : 1000,
        rpmLimit: 60,
        recentRequests: 1,
      }),
      streamTokens: async function* () {
        streamCalls++;
        yield 'ok';
      },
      writeAiChunk: async () => {},
      logAudit: async () => {},
    });

    const payload = {
      document_id: 'doc-1',
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
    };

    // 1. Missing JWT -> 401
    const noAuth = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/proj-1/nodes/node-1/generate',
      headers: { 'x-user-id': 'user-1' },
      payload,
    });
    expect(noAuth.statusCode).toBe(401);

    const token = app.jwt.sign({ sub: 'user-1', projectIds: ['proj-1'] });

    // 2. Missing X-User-Id -> 400
    const noUserHeader = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/proj-1/nodes/node-1/generate',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(noUserHeader.statusCode).toBe(400);

    // 3. Mismatched X-User-Id vs JWT sub -> 403
    const spoofedUser = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/proj-1/nodes/node-1/generate',
      headers: { authorization: `Bearer ${token}`, 'x-user-id': 'user-other' },
      payload,
    });
    expect(spoofedUser.statusCode).toBe(403);

    // 4. Unauthorized project -> 403
    const wrongProject = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/proj-secret/nodes/node-1/generate',
      headers: { authorization: `Bearer ${token}`, 'x-user-id': 'user-1' },
      payload,
    });
    expect(wrongProject.statusCode).toBe(403);

    // 5. Quota exceeded -> 429 before LLM invocation
    quotaAllowed = false;
    const overQuota = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/proj-1/nodes/node-1/generate',
      headers: { authorization: `Bearer ${token}`, 'x-user-id': 'user-1' },
      payload,
    });
    expect(overQuota.statusCode).toBe(429);
    expect(streamCalls).toBe(0);

    await app.close();
  });

  it('returns 409 Conflict with activeJobId when a second request targets an already-leased node', async () => {
    const lockStore = new InMemoryAiLockStore(() => nowMs);
    const firstStarted = createDeferred();
    const releaseFirst = createDeferred();
    let providerCallCount = 0;

    const app = await buildTestApp({
      lockStore,
      checkQuota: async () => ({
        allowed: true,
        dailyLimit: 100_000,
        usedTokens: 0,
        rpmLimit: 60,
        recentRequests: 0,
      }),
      streamTokens: async function* () {
        providerCallCount++;
        yield 'chunk-1';
        firstStarted.resolve();
        await releaseFirst.promise;
        yield 'chunk-2';
      },
      writeAiChunk: async () => {},
      logAudit: async () => {},
    });

    const token = app.jwt.sign({ sub: 'user-1', projectIds: ['proj-1'] });
    const reqInit = {
      method: 'POST' as const,
      url: '/api/v1/projects/proj-1/nodes/node-1/generate',
      headers: { authorization: `Bearer ${token}`, 'x-user-id': 'user-1' },
      payload: {
        document_id: 'doc-1',
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Generate' }],
      },
    };

    // Start first request and wait until it holds the lease
    const firstPromise = app.inject(reqInit);
    await firstStarted.promise;

    // Second concurrent request collides and receives 409 with activeJobId
    const secondRes = await app.inject(reqInit);
    expect(secondRes.statusCode).toBe(409);
    const secondBody = secondRes.json() as { activeJobId: string };
    expect(typeof secondBody.activeJobId).toBe('string');
    expect(secondBody.activeJobId.length).toBeGreaterThan(0);
    expect(providerCallCount).toBe(1);

    // Let first request complete and verify activeJobId matched its jobId
    releaseFirst.resolve();
    const firstRes = await firstPromise;
    expect(firstRes.statusCode).toBe(200);
    const firstBody = firstRes.json() as { data: { jobId: string; fencingToken: number } };
    expect(secondBody.activeJobId).toBe(firstBody.data.jobId);
    expect(firstBody.data.fencingToken).toBe(1);

    await app.close();
  });

  it('fences out a paused worker whose lease expired so it cannot corrupt Y.Doc or release the newer lease', async () => {
    const lockStore = new InMemoryAiLockStore(() => nowMs);
    const doc = new Y.Doc();
    createNode(doc, { id: 'node-1', content: '', clientId: 1 });

    const worker1Chunk1Done = createDeferred();
    const resumeWorker1 = createDeferred();
    const worker2Started = createDeferred();
    const releaseWorker2 = createDeferred();
    const auditLogs: AiGenerateAuditEntry[] = [];
    let callNum = 0;

    const app = await buildTestApp({
      lockStore,
      leaseTtlSeconds: 60,
      checkQuota: async () => ({
        allowed: true,
        dailyLimit: 100_000,
        usedTokens: 0,
        rpmLimit: 60,
        recentRequests: 0,
      }),
      streamTokens: async function* () {
        const myCall = ++callNum;
        if (myCall === 1) {
          yield 'W1:';
          worker1Chunk1Done.resolve();
          await resumeWorker1.promise;
          yield 'STALE_CORRUPTION';
        } else {
          yield 'W2:clean';
          worker2Started.resolve();
          await releaseWorker2.promise;
        }
      },
      writeAiChunk: async ({ nodeId, chunk, jobId }) => {
        appendAiChunkToNode(doc, nodeId, chunk, jobId);
      },
      logAudit: async (entry) => {
        auditLogs.push(entry);
      },
    });

    const token = app.jwt.sign({ sub: 'user-1', projectIds: ['proj-1'] });
    const reqInit = {
      method: 'POST' as const,
      url: '/api/v1/projects/proj-1/nodes/node-1/generate',
      headers: { authorization: `Bearer ${token}`, 'x-user-id': 'user-1' },
      payload: {
        document_id: 'doc-1',
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Draft' }],
      },
    };

    // 1. Worker 1 acquires lease (fence = 1), writes first chunk, and stalls
    const worker1Promise = app.inject(reqInit);
    await worker1Chunk1Done.promise;

    // 2. Simulate lease TTL expiry (+61s)
    nowMs += 61_000;

    // 3. Worker 2 legitimately acquires a new lease (fence = 2) and writes its chunk
    const worker2Promise = app.inject(reqInit);
    await worker2Started.promise;

    // 4. Stalled Worker 1 wakes up and tries to emit 'STALE_CORRUPTION'
    resumeWorker1.resolve();
    const worker1Res = await worker1Promise;

    // Worker 1 MUST be fenced out with 409 and MUST NOT write 'STALE_CORRUPTION'
    expect(worker1Res.statusCode).toBe(409);
    const nodeText = getNodeContentText(getNodesMap(doc).get('node-1')!).toString();
    expect(nodeText).toBe('W1:W2:clean');
    expect(nodeText).not.toContain('STALE_CORRUPTION');

    // 5. Crucial check: Worker 1's finally block MUST NOT have released Worker 2's active lease!
    const worker3DuringWorker2 = await app.inject(reqInit);
    expect(worker3DuringWorker2.statusCode).toBe(409);

    // 6. Let Worker 2 finish cleanly
    releaseWorker2.resolve();
    const worker2Res = await worker2Promise;
    expect(worker2Res.statusCode).toBe(200);
    expect((worker2Res.json() as { data: { fencingToken: number } }).data.fencingToken).toBe(2);

    // 7. Verify attribution & fencing audit trail recorded for both workers
    expect(auditLogs).toHaveLength(2);
    const w1Audit = auditLogs.find((a) => a.fencingToken === 1);
    const w2Audit = auditLogs.find((a) => a.fencingToken === 2);
    expect(w1Audit?.statusCode).toBe(409);
    expect(w1Audit?.nodeId).toBe('node-1');
    expect(w1Audit?.userId).toBe('user-1');
    expect(w2Audit?.statusCode).toBe(200);
    expect(w2Audit?.nodeId).toBe('node-1');

    doc.destroy();
    await app.close();
  });
});
