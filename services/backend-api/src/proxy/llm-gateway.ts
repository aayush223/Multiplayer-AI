/**
 * Multi-Provider LLM Gateway
 *
 * Invariant 5: Zero client credential exposure. All provider API keys live
 *              exclusively on this server, never shipped to clients.
 *
 * Invariant 5: Per-user attribution via X-User-Id. Token consumption is logged
 *              to proxy_audit_logs for team visibility and quota enforcement.
 *
 * Supports: OpenAI, Gemini (via OpenAI-compat), OpenRouter, Groq, Ollama.
 * All providers are accessed through an OpenAI-compatible chat completions format.
 */
import { withProjectScope } from '../db/client.js';
import type { ProxyCompletionInput } from '@minge/shared';

interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  name: string;
}

interface CompletionResponse {
  content: string;
  model: string;
  provider: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Resolve which provider and base URL to use based on the model string.
 * Model prefixes: "gemini/" -> Gemini, "openrouter/" -> OpenRouter, etc.
 * Falls back to checking which API keys are available.
 */
function resolveProvider(model: string): ProviderConfig {
  const lowerModel = model.toLowerCase();

  // Explicit provider prefixes
  if (lowerModel.startsWith('gemini/') || lowerModel.includes('gemini')) {
    const key = process.env['GEMINI_API_KEY'];
    if (!key) throw new Error('GEMINI_API_KEY not configured.');
    return {
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: key,
      name: 'gemini',
    };
  }

  if (lowerModel.startsWith('openrouter/') || lowerModel.startsWith('meta-llama/') || lowerModel.startsWith('mistralai/')) {
    const key = process.env['OPENROUTER_API_KEY'];
    if (!key) throw new Error('OPENROUTER_API_KEY not configured.');
    return {
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: key,
      name: 'openrouter',
    };
  }

  if (lowerModel.startsWith('groq/') || lowerModel.includes('llama') || lowerModel.includes('mixtral')) {
    const key = process.env['GROQ_API_KEY'];
    if (key) {
      return {
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKey: key,
        name: 'groq',
      };
    }
  }

  if (lowerModel.startsWith('ollama/') || lowerModel.startsWith('local/')) {
    const baseUrl = process.env['OLLAMA_BASE_URL'] || 'http://localhost:11434/v1';
    return {
      baseUrl,
      apiKey: 'ollama',
      name: 'ollama',
    };
  }

  // Default: try OpenAI, then Gemini, then OpenRouter, then Groq
  if (process.env['OPENAI_API_KEY']) {
    return {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: process.env['OPENAI_API_KEY'],
      name: 'openai',
    };
  }

  if (process.env['GEMINI_API_KEY']) {
    return {
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: process.env['GEMINI_API_KEY'],
      name: 'gemini',
    };
  }

  if (process.env['OPENROUTER_API_KEY']) {
    return {
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: process.env['OPENROUTER_API_KEY'],
      name: 'openrouter',
    };
  }

  if (process.env['GROQ_API_KEY']) {
    return {
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: process.env['GROQ_API_KEY'],
      name: 'groq',
    };
  }

  throw new Error('No LLM provider API key configured. Set at least one of: OPENAI_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY');
}

/**
 * Strip provider prefix from model name for the upstream API call.
 * e.g., "gemini/gemini-2.0-flash" -> "gemini-2.0-flash"
 */
function normalizeModelName(model: string): string {
  const prefixes = ['gemini/', 'openrouter/', 'groq/', 'ollama/', 'local/'];
  let clean = model;
  for (const prefix of prefixes) {
    if (clean.toLowerCase().startsWith(prefix)) {
      clean = clean.substring(prefix.length);
      break;
    }
  }

  // Model fallbacks for currently supported upstream versions
  if (clean === 'gemini-2.5-flash' || clean === 'gemini-2.0-flash' || clean === 'gemini' || clean === 'gemini-flash') {
    return 'gemini-3.6-flash';
  }
  if (clean === 'llama-3.3-70b-versatile' || clean === 'llama-3.1-70b' || clean === 'llama-3.3-70b') {
    return 'qwen/qwen3.6-27b';
  }
  if (clean === 'qwen3.6-27b' || clean === 'qwen3.8-27b') {
    return `qwen/${clean}`;
  }

  return clean;
}

/**
 * Execute a chat completion against the resolved provider.
 * Returns the response and logs audit data.
 */
export async function chatCompletion(
  input: ProxyCompletionInput,
  userId: string
): Promise<CompletionResponse> {
  const provider = resolveProvider(input.model);
  const normalizedModel = normalizeModelName(input.model);
  const startTime = Date.now();

  const requestBody = {
    model: normalizedModel,
    messages: input.messages,
    temperature: input.temperature,
    max_tokens: Math.max(input.max_tokens ?? 2048, 1024),
    stream: false, // Non-streaming for now
  };

  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  const latencyMs = Date.now() - startTime;

  if (!response.ok) {
    const errorText = await response.text();
    // Still log the failed attempt
    await logAudit(input.project_id, userId, provider.name, normalizedModel, 0, 0, latencyMs, response.status);
    throw new Error(`LLM provider error (${provider.name}): ${response.status} — ${errorText}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    model: string;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };

  const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const content = data.choices?.[0]?.message?.content ?? '';

  // Log to audit trail (Invariant 5: per-user attribution)
  await logAudit(
    input.project_id,
    userId,
    provider.name,
    data.model || normalizedModel,
    usage.prompt_tokens,
    usage.completion_tokens,
    latencyMs,
    response.status
  );

  return {
    content,
    model: data.model || normalizedModel,
    provider: provider.name,
    usage,
  };
}

/**
 * Stream a chat completion as an async generator of SSE chunks.
 */
export async function* chatCompletionStream(
  input: ProxyCompletionInput,
  userId: string
): AsyncGenerator<string, void, undefined> {
  const provider = resolveProvider(input.model);
  const normalizedModel = normalizeModelName(input.model);
  const startTime = Date.now();

  const requestBody = {
    model: normalizedModel,
    messages: input.messages,
    temperature: input.temperature,
    max_tokens: Math.max(input.max_tokens ?? 2048, 1024),
    stream: true,
  };

  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM provider stream error (${provider.name}): ${response.status} — ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No readable stream from provider.');

  const decoder = new TextDecoder();
  let totalContent = '';
  let promptTokens = 0;
  let completionTokens = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

      for (const line of lines) {
        const data = line.substring(6).trim();
        if (data === '[DONE]') {
          yield 'data: [DONE]\n\n';
          continue;
        }

        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
            usage?: { prompt_tokens: number; completion_tokens: number };
          };
          const content = parsed.choices?.[0]?.delta?.content ?? '';
          if (content) {
            totalContent += content;
          }
          if (parsed.usage) {
            promptTokens = parsed.usage.prompt_tokens;
            completionTokens = parsed.usage.completion_tokens;
          }
          yield `data: ${data}\n\n`;
        } catch {
          yield `data: ${data}\n\n`;
        }
      }
    }
  } finally {
    reader.releaseLock();
    const latencyMs = Date.now() - startTime;
    // Estimate tokens if not provided
    if (completionTokens === 0) {
      completionTokens = Math.ceil(totalContent.length / 4);
    }
    await logAudit(input.project_id, userId, provider.name, normalizedModel, promptTokens, completionTokens, latencyMs, 200);
  }
}

/**
 * Log an LLM request to the proxy_audit_logs table.
 * Invariant 5: Per-user attribution and usage tracking.
 */
async function logAudit(
  projectId: string,
  userId: string,
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
  latencyMs: number,
  statusCode: number
): Promise<void> {
  try {
    await withProjectScope(projectId, async (client) => {
      await client.query(
        `INSERT INTO minge.proxy_audit_logs
          (project_id, user_id, provider, model, prompt_tokens, completion_tokens, latency_ms, status_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [projectId, userId, provider, model, promptTokens, completionTokens, latencyMs, statusCode]
      );
    });
  } catch (err) {
    // Non-blocking: audit logging failures should not break completions
    console.error('[llm-gateway] Failed to log audit:', err);
  }
}

/**
 * List available providers based on configured API keys.
 */
export function getAvailableProviders(): string[] {
  const providers: string[] = [];
  if (process.env['OPENAI_API_KEY']) providers.push('openai');
  if (process.env['GEMINI_API_KEY']) providers.push('gemini');
  if (process.env['OPENROUTER_API_KEY']) providers.push('openrouter');
  if (process.env['GROQ_API_KEY']) providers.push('groq');
  if (process.env['OLLAMA_BASE_URL']) providers.push('ollama');
  return providers;
}
