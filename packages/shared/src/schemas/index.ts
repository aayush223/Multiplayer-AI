/**
 * @minge/shared — Zod Validation Schemas
 * Runtime contract validation for API payloads (Invariant 1: project_id required).
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared primitives: support both UUIDs and project slugs/identifiers
// ---------------------------------------------------------------------------
export const uuidSchema = z.string().min(1).max(255);

// ---------------------------------------------------------------------------
// Environment variables validation
// ---------------------------------------------------------------------------
export const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  SYNC_PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('postgresql://minge:minge_dev_password@localhost:5432/minge'),
  JWT_SECRET: z.string().min(16).default('minge_dev_jwt_secret_change_in_production_64chars_minimum_required'),
  GEMINI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().url().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

// ---------------------------------------------------------------------------
// Project schemas
// ---------------------------------------------------------------------------
export const projectCreateSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  account_type: z.enum(['individual', 'team', 'enterprise']).default('individual'),
});

// ---------------------------------------------------------------------------
// Memory schemas (Invariant 1: project_id is mandatory)
// ---------------------------------------------------------------------------
export const memoryTypeEnum = z.enum([
  'fact',
  'code_snippet',
  'decision',
  'document',
  'conversation_turn',
  'custom',
]);

export const memoryCreateSchema = z.object({
  project_id: uuidSchema,
  type: memoryTypeEnum,
  content: z.string().min(1).max(100_000),
  metadata: z.record(z.unknown()).optional().default({}),
  source_uri: z.string().max(2048).optional(),
});

export const memorySearchSchema = z.object({
  project_id: uuidSchema,
  query: z.string().min(1).max(10_000),
  top_k: z.coerce.number().int().min(1).max(50).default(10),
  type_filter: memoryTypeEnum.optional(),
});

// ---------------------------------------------------------------------------
// Prompt Package schemas (Invariant 2: immutable versioned package)
// ---------------------------------------------------------------------------
export const modelConfigSchema = z.object({
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).default(0.7),
  top_p: z.number().min(0).max(1).default(0.95),
  max_tokens: z.number().int().min(1).max(200_000).default(4096),
});

export const promptCreateSchema = z.object({
  project_id: uuidSchema,
  name: z.string().min(1).max(255),
  branch: z.string().max(100).default('main'),
  parent_id: uuidSchema.optional(),
  system_prompt: z.string().min(1).max(100_000),
  user_template: z.string().max(100_000).default(''),
  grounded_memory_ids: z.array(uuidSchema).default([]),
  model_config: modelConfigSchema,
});

export const promptUpdateSchema = z.object({
  project_id: uuidSchema,
  system_prompt: z.string().min(1).max(100_000).optional(),
  user_template: z.string().max(100_000).optional(),
  grounded_memory_ids: z.array(uuidSchema).optional(),
  model_config: modelConfigSchema.optional(),
  latest_output: z.string().optional(),
  status: z.enum(['draft', 'active', 'merged', 'archived']).optional(),
});

// ---------------------------------------------------------------------------
// LLM Proxy schemas (Invariant 5: Server-side only, attribution required)
// ---------------------------------------------------------------------------
export const proxyCompletionSchema = z.object({
  project_id: uuidSchema,
  model: z.string().min(1),
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant']),
      content: z.string(),
    })
  ).min(1),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(200_000).optional(),
  stream: z.boolean().optional().default(false),
});

export type ProxyCompletionInput = z.infer<typeof proxyCompletionSchema>;
