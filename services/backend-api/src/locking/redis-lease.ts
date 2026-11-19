/**
 * Tier-2 Redis Lease + Monotonic Fencing Token Lock Store (Invariant 5)
 *
 * Prevents duplicate LLM calls and stale stream overwrites on the same node:
 *  - Lease: `SET lock:ai:${projectId}:${nodeId} ${jobId} NX EX 60`
 *  - Fence: `INCR fence:ai:${projectId}:${nodeId}`
 *  - Release: Atomic compare-and-delete so an expired worker cannot release a newer worker's lease.
 */
import { Redis } from 'ioredis';

export type LeaseAcquireResult =
  | { acquired: true; jobId: string; fencingToken: number }
  | { acquired: false; activeJobId: string | null };

export interface AiLockStore {
  acquireLease(
    projectId: string,
    nodeId: string,
    jobId: string,
    ttlSeconds?: number
  ): Promise<LeaseAcquireResult>;
  verifyFence(projectId: string, nodeId: string, fencingToken: number): Promise<boolean>;
  releaseLease(projectId: string, nodeId: string, jobId: string): Promise<boolean>;
  close(): Promise<void>;
}

const RELEASE_LOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export function buildLockKey(projectId: string, nodeId: string): string {
  return `lock:ai:${projectId}:${nodeId}`;
}

export function buildFenceKey(projectId: string, nodeId: string): string {
  return `fence:ai:${projectId}:${nodeId}`;
}

/**
 * Redis-backed distributed lease and monotonic fencing store.
 */
export class RedisAiLockStore implements AiLockStore {
  private readonly redis: Redis;

  constructor(redisUrlOrClient: string | Redis) {
    this.redis =
      typeof redisUrlOrClient === 'string'
        ? new Redis(redisUrlOrClient, { maxRetriesPerRequest: 3 })
        : redisUrlOrClient;
  }

  async acquireLease(
    projectId: string,
    nodeId: string,
    jobId: string,
    ttlSeconds = 60
  ): Promise<LeaseAcquireResult> {
    const lockKey = buildLockKey(projectId, nodeId);
    const fenceKey = buildFenceKey(projectId, nodeId);

    const setResult = await this.redis.set(lockKey, jobId, 'EX', ttlSeconds, 'NX');
    if (setResult !== 'OK') {
      const activeJobId = await this.redis.get(lockKey);
      return { acquired: false, activeJobId };
    }

    const fencingToken = await this.redis.incr(fenceKey);
    return { acquired: true, jobId, fencingToken };
  }

  async verifyFence(projectId: string, nodeId: string, fencingToken: number): Promise<boolean> {
    const current = await this.redis.get(buildFenceKey(projectId, nodeId));
    return current !== null && Number(current) === fencingToken;
  }

  async releaseLease(projectId: string, nodeId: string, jobId: string): Promise<boolean> {
    const deleted = await this.redis.eval(RELEASE_LOCK_LUA, 1, buildLockKey(projectId, nodeId), jobId);
    return Number(deleted) === 1;
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

/**
 * In-memory lease + monotonic fencing store (identical semantics to RedisAiLockStore).
 * Accepts an injectable clock so unit tests can simulate deterministic lease expiry.
 */
export class InMemoryAiLockStore implements AiLockStore {
  private readonly locks = new Map<string, { jobId: string; expiresAt: number }>();
  private readonly fences = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  private getActiveLock(lockKey: string): { jobId: string; expiresAt: number } | null {
    const existing = this.locks.get(lockKey);
    if (!existing) return null;
    if (this.now() >= existing.expiresAt) {
      this.locks.delete(lockKey);
      return null;
    }
    return existing;
  }

  async acquireLease(
    projectId: string,
    nodeId: string,
    jobId: string,
    ttlSeconds = 60
  ): Promise<LeaseAcquireResult> {
    const lockKey = buildLockKey(projectId, nodeId);
    const fenceKey = buildFenceKey(projectId, nodeId);

    const active = this.getActiveLock(lockKey);
    if (active) {
      return { acquired: false, activeJobId: active.jobId };
    }

    this.locks.set(lockKey, {
      jobId,
      expiresAt: this.now() + ttlSeconds * 1000,
    });

    const nextFence = (this.fences.get(fenceKey) ?? 0) + 1;
    this.fences.set(fenceKey, nextFence);
    return { acquired: true, jobId, fencingToken: nextFence };
  }

  async verifyFence(projectId: string, nodeId: string, fencingToken: number): Promise<boolean> {
    const current = this.fences.get(buildFenceKey(projectId, nodeId));
    return current !== undefined && current === fencingToken;
  }

  async releaseLease(projectId: string, nodeId: string, jobId: string): Promise<boolean> {
    const lockKey = buildLockKey(projectId, nodeId);
    const active = this.getActiveLock(lockKey);
    if (!active || active.jobId !== jobId) {
      return false;
    }
    this.locks.delete(lockKey);
    return true;
  }

  async close(): Promise<void> {
    this.locks.clear();
  }
}
