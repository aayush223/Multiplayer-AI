/**
 * Concurrent AI Peer Node Generation Route (Invariants 1, 3, 5, 6, 8)
 *
 * POST /api/v1/projects/:projectId/nodes/:nodeId/generate
 *  1. Mandatory JWT authentication (`401`) + `X-User-Id` attribution (`400`) + Project access (`403`)
 *  2. Per-project quota enforcement (`429`) against `minge.project_quotas` & `minge.proxy_audit_logs`
 *  3. Tier-2 Redis lease + monotonic fencing token (`409 Conflict` with active `jobId` on collision)
 *  4. Tier-3 Fenced AI Peer writes into Yjs room `${projectId}:${document_id}` under origin `'ai-peer:<jobId>'`
 *  5. Attribution audit log + atomic compare-and-delete lease release in `finally`
 */
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '../auth/jwt.js';
import { withProjectScope } from '../db/client.js';
import { chatCompletionStream } from '../proxy/llm-gateway.js';
import {
  InMemoryAiLockStore,
  RedisAiLockStore,
  type AiLockStore,
} from '../locking/redis-lease.js';

const aiGenerateBodySchema = z.object({
  document_id: z.string().min(1).max(255),
  model: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string(),
      })
    )
    .min(1),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(200_000).optional(),
});

export type AiGenerateBody = z.infer<typeof aiGenerateBodySchema>;

export interface QuotaCheckResult {
  allowed: boolean;
  dailyLimit: number;
  usedTokens: number;
  rpmLimit: number;
  recentRequests: number;
}

export interface AiChunkWritePayload {
  projectId: string;
  documentId: string;
  nodeId: string;
  chunk: string;
  jobId: string;
  actorId: string;
  fencingToken: number;
}

export interface AiGenerateAuditEntry {
  projectId: string;
  userId: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  statusCode: number;
  nodeId: string;
  jobId: string;
  fencingToken: number;
}

export interface AiTokenStreamInput {
  projectId: string;
  nodeId: string;
  userId: string;
  body: AiGenerateBody;
}

export interface AiGenerateDeps {
  lockStore?: AiLockStore;
  leaseTtlSeconds?: number;
  checkProjectAccess?: (projectId: string, userId: string, jwt: JwtPayload) => Promise<boolean>;
  checkQuota?: (projectId: string) => Promise<QuotaCheckResult>;
  streamTokens?: (input: AiTokenStreamInput) => AsyncIterable<string>;
  writeAiChunk?: (payload: AiChunkWritePayload) => Promise<void>;
  logAudit?: (entry: AiGenerateAuditEntry) => Promise<void>;
}

const DEFAULT_DAILY_TOKEN_LIMIT = 250_000;
const DEFAULT_RPM_LIMIT = 60;

async function defaultCheckProjectAccess(
  projectId: string,
  userId: string,
  jwt: JwtPayload
): Promise<boolean> {
  if (!projectId || !userId) return false;
  if (!Array.isArray(jwt.projectIds) || !jwt.projectIds.includes(projectId)) {
    return false;
  }
  return true;
}

async function defaultCheckQuota(projectId: string): Promise<QuotaCheckResult> {
  try {
    return await withProjectScope(projectId, async (client) => {
      const quotaRes = await client.query<{ rpm_limit: number; daily_token_limit: number }>(
        `SELECT rpm_limit, daily_token_limit
         FROM minge.project_quotas
         WHERE project_id = $1
         LIMIT 1`,
        [projectId]
      );

      const rpmLimit = quotaRes.rows[0]?.rpm_limit ?? DEFAULT_RPM_LIMIT;
      const dailyLimit = quotaRes.rows[0]?.daily_token_limit ?? DEFAULT_DAILY_TOKEN_LIMIT;

      const usageRes = await client.query<{ used_tokens: string; recent_requests: string }>(
        `SELECT
           COALESCE(SUM(prompt_tokens + completion_tokens) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours'), 0) AS used_tokens,
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 minute') AS recent_requests
         FROM minge.proxy_audit_logs
         WHERE project_id = $1`,
        [projectId]
      );

      const usedTokens = Number(usageRes.rows[0]?.used_tokens ?? 0);
      const recentRequests = Number(usageRes.rows[0]?.recent_requests ?? 0);

      return {
        allowed: usedTokens < dailyLimit && recentRequests < rpmLimit,
        dailyLimit,
        usedTokens,
        rpmLimit,
        recentRequests,
      };
    });
  } catch {
    // Allow through if Postgres is unavailable in standalone local dev
    return {
      allowed: true,
      dailyLimit: DEFAULT_DAILY_TOKEN_LIMIT,
      usedTokens: 0,
      rpmLimit: DEFAULT_RPM_LIMIT,
      recentRequests: 0,
    };
  }
}

async function* defaultStreamTokens(input: AiTokenStreamInput): AsyncGenerator<string> {
  const sseStream = chatCompletionStream(
    {
      project_id: input.projectId,
      model: input.body.model,
      messages: input.body.messages,
      temperature: input.body.temperature,
      max_tokens: input.body.max_tokens,
      stream: true,
    },
    input.userId,
    { skipAuditLog: true }
  );

  for await (const sseEvent of sseStream) {
    const trimmed = sseEvent.trim();
    if (!trimmed.startsWith('data:')) continue;
    const raw = trimmed.slice(5).trim();
    if (!raw || raw === '[DONE]') continue;

    try {
      const parsed = JSON.parse(raw) as {
        choices?: Array<{ delta?: { content?: string } }>;
      };
      const delta = parsed.choices?.[0]?.delta?.content;
      if (delta) {
        yield delta;
      }
    } catch {
      // Ignore malformed SSE keep-alive lines
    }
  }
}

async function defaultWriteAiChunk(payload: AiChunkWritePayload): Promise<void> {
  const gatewayUrl = (process.env['SYNC_GATEWAY_URL'] ?? 'http://localhost:4001').replace(/\/+$/, '');
  const internalSecret =
    process.env['INTERNAL_SYNC_SECRET'] ?? 'minge_dev_internal_sync_secret_change_in_prod';

  const res = await fetch(`${gatewayUrl}/internal/ai-peer/write`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': internalSecret,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Sync gateway AI peer write failed (${res.status}): ${text}`);
  }
}

async function defaultLogAudit(entry: AiGenerateAuditEntry): Promise<void> {
  try {
    await withProjectScope(entry.projectId, async (client) => {
      await client.query(
        `INSERT INTO minge.proxy_audit_logs
           (project_id, user_id, provider, model, prompt_tokens, completion_tokens, latency_ms, status_code, node_id, job_id, fencing_token)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          entry.projectId,
          entry.userId,
          entry.provider,
          entry.model,
          entry.promptTokens,
          entry.completionTokens,
          entry.latencyMs,
          entry.statusCode,
          entry.nodeId,
          entry.jobId,
          entry.fencingToken,
        ]
      );
    });
  } catch (err) {
    console.error('[ai-generate] Failed to log audit entry:', err);
  }
}

function inferProviderName(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes('gemini')) return 'gemini';
  if (lower.startsWith('openrouter/')) return 'openrouter';
  if (lower.startsWith('groq/')) return 'groq';
  if (lower.startsWith('ollama/') || lower.startsWith('local/')) return 'ollama';
  return 'openai';
}

export async function registerAiGenerateRoutes(
  app: FastifyInstance,
  deps: AiGenerateDeps = {}
): Promise<void> {
  const ownsLockStore = !deps.lockStore;
  const lockStore: AiLockStore =
    deps.lockStore ??
    (process.env['REDIS_URL']
      ? new RedisAiLockStore(process.env['REDIS_URL'])
      : new InMemoryAiLockStore());

  if (ownsLockStore) {
    app.addHook('onClose', async () => {
      await lockStore.close();
    });
  }

  const leaseTtlSeconds = deps.leaseTtlSeconds ?? 60;
  const checkProjectAccess = deps.checkProjectAccess ?? defaultCheckProjectAccess;
  const checkQuota = deps.checkQuota ?? defaultCheckQuota;
  const streamTokens = deps.streamTokens ?? defaultStreamTokens;
  const writeAiChunk = deps.writeAiChunk ?? defaultWriteAiChunk;
  const logAudit = deps.logAudit ?? defaultLogAudit;

  app.post<{ Params: { projectId: string; nodeId: string } }>(
    '/api/v1/projects/:projectId/nodes/:nodeId/generate',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const projectId = request.params.projectId?.trim() ?? '';
      const nodeId = request.params.nodeId?.trim() ?? '';

      // Invariant 1: Fail closed on missing project_id
      if (!projectId || !nodeId) {
        return reply.status(400).send({
          error: 'FAIL_CLOSED: projectId and nodeId path parameters are required.',
        });
      }

      // Invariant 6: Mandatory X-User-Id attribution header matching JWT subject
      const headerUserId = request.headers['x-user-id'];
      const userId = typeof headerUserId === 'string' ? headerUserId.trim() : '';
      if (!userId) {
        return reply.status(400).send({
          error: 'Missing Attribution',
          message: 'X-User-Id header is required for AI generation requests.',
        });
      }

      const jwt = request.user as JwtPayload;
      if (jwt.sub !== userId) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'X-User-Id does not match authenticated JWT subject.',
        });
      }

      // Fail-closed project membership authorization
      const authorized = await checkProjectAccess(projectId, userId, jwt);
      if (!authorized) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: `Access denied to project ${projectId}.`,
        });
      }

      const body = aiGenerateBodySchema.parse(request.body);

      // Enforce per-project quotas BEFORE acquiring lease or calling LLM
      const quota = await checkQuota(projectId);
      if (!quota.allowed) {
        return reply.status(429).send({
          error: 'Quota Exceeded',
          message: 'Project rate or daily token quota exceeded.',
          quota,
        });
      }

      // Tier 2: Acquire Redis lease + monotonic fencing token
      const jobId = crypto.randomUUID();
      const lease = await lockStore.acquireLease(projectId, nodeId, jobId, leaseTtlSeconds);
      if (!lease.acquired) {
        return reply.status(409).send({
          error: 'Conflict',
          message: 'AI generation is already running for this node.',
          activeJobId: lease.activeJobId,
        });
      }

      const startTime = Date.now();
      let chunksWritten = 0;
      let totalOutput = '';
      let fencedOut = false;
      let statusCode = 200;

      try {
        // Tier 3: Fenced AI Peer writes under origin `'ai-peer:<jobId>'`
        for await (const chunk of streamTokens({ projectId, nodeId, userId, body })) {
          if (!chunk) continue;

          // Verify monotonic fencing token BEFORE emitting each chunk into Y.Doc
          const fenceStillValid = await lockStore.verifyFence(
            projectId,
            nodeId,
            lease.fencingToken
          );
          if (!fenceStillValid) {
            fencedOut = true;
            statusCode = 409;
            break;
          }

          await writeAiChunk({
            projectId,
            documentId: body.document_id,
            nodeId,
            chunk,
            jobId,
            actorId: userId,
            fencingToken: lease.fencingToken,
          });
          chunksWritten++;
          totalOutput += chunk;
        }
      } catch (err) {
        statusCode = 502;
        const message = err instanceof Error ? err.message : 'AI generation failed';
        return reply.status(502).send({
          error: 'Bad Gateway',
          message,
          jobId,
          fencingToken: lease.fencingToken,
        });
      } finally {
        const latencyMs = Date.now() - startTime;
        const promptChars = body.messages.reduce((sum, m) => sum + m.content.length, 0);
        await logAudit({
          projectId,
          userId,
          provider: inferProviderName(body.model),
          model: body.model,
          promptTokens: Math.ceil(promptChars / 4),
          completionTokens: Math.ceil(totalOutput.length / 4),
          latencyMs,
          statusCode,
          nodeId,
          jobId,
          fencingToken: lease.fencingToken,
        });
        await lockStore.releaseLease(projectId, nodeId, jobId);
      }

      if (fencedOut) {
        return reply.status(409).send({
          error: 'Fenced Out',
          message: 'Generation stopped because a newer fenced job took ownership of this node.',
          jobId,
          fencingToken: lease.fencingToken,
          chunksWritten,
        });
      }

      return reply.status(200).send({
        data: {
          jobId,
          fencingToken: lease.fencingToken,
          nodeId,
          documentId: body.document_id,
          chunksWritten,
          outputLength: totalOutput.length,
        },
      });
    }
  );
}
