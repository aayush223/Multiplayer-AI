/**
 * Horizontal Pub/Sub Bridge for Multi-Instance Sync Gateways (Invariant 3)
 *
 * Uses compact binary framing [instanceIdLen (1B) | instanceId (UTF-8) | yjsUpdate]
 * so Yjs binary updates cross Redis Pub/Sub without base64/JSON bloat and self-echoes
 * are dropped cleanly.
 */
import crypto from 'node:crypto';
import { Redis } from 'ioredis';

export interface PubSubAdapter {
  publish(roomId: string, update: Uint8Array): Promise<void>;
  subscribe(roomId: string, handler: (update: Uint8Array) => void): Promise<void>;
  unsubscribe(roomId: string): Promise<void>;
  close(): Promise<void>;
}

const CHANNEL_PREFIX = 'minge:crdt:';

function encodeEnvelope(instanceId: string, update: Uint8Array): Buffer {
  const idBuf = Buffer.from(instanceId, 'utf8');
  if (idBuf.length > 255) {
    throw new Error('instanceId must be <= 255 UTF-8 bytes');
  }
  const out = Buffer.allocUnsafe(1 + idBuf.length + update.byteLength);
  out[0] = idBuf.length;
  idBuf.copy(out, 1);
  Buffer.from(update.buffer, update.byteOffset, update.byteLength).copy(out, 1 + idBuf.length);
  return out;
}

function decodeEnvelope(buf: Buffer): { instanceId: string; update: Uint8Array } | null {
  if (buf.length < 2) return null;
  const idLen = buf[0];
  if (1 + idLen > buf.length) return null;
  const instanceId = buf.subarray(1, 1 + idLen).toString('utf8');
  const payload = buf.subarray(1 + idLen);
  return {
    instanceId,
    update: new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength),
  };
}

/**
 * Redis Pub/Sub adapter backed by dedicated `pub` and `sub` ioredis clients.
 */
export class RedisPubSubAdapter implements PubSubAdapter {
  private readonly pub: Redis;
  private readonly sub: Redis;
  private readonly instanceId: string;
  private readonly handlers = new Map<string, (update: Uint8Array) => void>();

  constructor(redisUrl: string, instanceId: string = crypto.randomUUID()) {
    this.instanceId = instanceId;
    this.pub = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
    this.sub = new Redis(redisUrl, { maxRetriesPerRequest: 3 });

    this.sub.on('messageBuffer', (channelBuf: Buffer, messageBuf: Buffer) => {
      const channel = channelBuf.toString('utf8');
      if (!channel.startsWith(CHANNEL_PREFIX)) return;
      const roomId = channel.slice(CHANNEL_PREFIX.length);
      const handler = this.handlers.get(roomId);
      if (!handler) return;

      const decoded = decodeEnvelope(messageBuf);
      if (!decoded || decoded.instanceId === this.instanceId) return;
      handler(decoded.update);
    });
  }

  async publish(roomId: string, update: Uint8Array): Promise<void> {
    await this.pub.publish(`${CHANNEL_PREFIX}${roomId}`, encodeEnvelope(this.instanceId, update));
  }

  async subscribe(roomId: string, handler: (update: Uint8Array) => void): Promise<void> {
    this.handlers.set(roomId, handler);
    await this.sub.subscribe(`${CHANNEL_PREFIX}${roomId}`);
  }

  async unsubscribe(roomId: string): Promise<void> {
    this.handlers.delete(roomId);
    await this.sub.unsubscribe(`${CHANNEL_PREFIX}${roomId}`);
  }

  async close(): Promise<void> {
    this.handlers.clear();
    await Promise.allSettled([this.pub.quit(), this.sub.quit()]);
  }
}

/**
 * In-memory multi-instance Pub/Sub bus for unit tests and single-node deployments.
 */
export class InMemoryPubSubBus {
  private readonly subscribers = new Map<
    string,
    Map<string, (update: Uint8Array) => void>
  >();

  createAdapter(instanceId: string = crypto.randomUUID()): PubSubAdapter {
    return {
      publish: async (roomId: string, update: Uint8Array): Promise<void> => {
        const roomSubs = this.subscribers.get(roomId);
        if (!roomSubs) return;
        for (const [subInstanceId, handler] of roomSubs.entries()) {
          if (subInstanceId !== instanceId) {
            handler(new Uint8Array(update));
          }
        }
      },

      subscribe: async (roomId: string, handler: (update: Uint8Array) => void): Promise<void> => {
        let roomSubs = this.subscribers.get(roomId);
        if (!roomSubs) {
          roomSubs = new Map();
          this.subscribers.set(roomId, roomSubs);
        }
        roomSubs.set(instanceId, handler);
      },

      unsubscribe: async (roomId: string): Promise<void> => {
        const roomSubs = this.subscribers.get(roomId);
        if (!roomSubs) return;
        roomSubs.delete(instanceId);
        if (roomSubs.size === 0) {
          this.subscribers.delete(roomId);
        }
      },

      close: async (): Promise<void> => {
        for (const [roomId, roomSubs] of this.subscribers.entries()) {
          roomSubs.delete(instanceId);
          if (roomSubs.size === 0) {
            this.subscribers.delete(roomId);
          }
        }
      },
    };
  }
}
