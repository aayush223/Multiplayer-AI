/**
 * Embeddings Module — Generate text embeddings via configured provider.
 *
 * Invariant 5: API keys server-side only. Uses the same provider resolution
 *              logic as the LLM gateway.
 *
 * Uses text-embedding-3-small (1536 dims) for OpenAI.
 * For Gemini, uses text-embedding-004 (768 dims padded/truncated to 1536).
 * Falls back to a simple hash-based mock for development without API keys.
 */
import { EMBEDDING_DIMENSION } from '@minge/shared';

/**
 * Generate an embedding vector for the given text content.
 * Returns a 1536-dimensional float array.
 */
export async function getEmbedding(content: string): Promise<number[]> {
  // Try providers in order of preference
  if (process.env['OPENAI_API_KEY']) {
    return openaiEmbedding(content);
  }

  if (process.env['GEMINI_API_KEY']) {
    return geminiEmbedding(content);
  }

  if (process.env['OPENROUTER_API_KEY']) {
    // OpenRouter doesn't directly support embeddings, but some models do via OpenAI format
    return openaiCompatEmbedding(
      'https://openrouter.ai/api/v1',
      process.env['OPENROUTER_API_KEY'],
      content,
      'openai/text-embedding-3-small'
    );
  }

  // Fallback: deterministic mock embedding for development
  console.warn('[embeddings] No embedding API key configured. Using mock embeddings.');
  return mockEmbedding(content);
}

/**
 * OpenAI text-embedding-3-small (native 1536 dims).
 */
async function openaiEmbedding(content: string): Promise<number[]> {
  return openaiCompatEmbedding(
    'https://api.openai.com/v1',
    process.env['OPENAI_API_KEY']!,
    content,
    'text-embedding-3-small'
  );
}

/**
 * Gemini text-embedding-004 via the OpenAI-compatible endpoint.
 */
async function geminiEmbedding(content: string): Promise<number[]> {
  return openaiCompatEmbedding(
    'https://generativelanguage.googleapis.com/v1beta/openai',
    process.env['GEMINI_API_KEY']!,
    content,
    'text-embedding-004'
  );
}

/**
 * Generic OpenAI-compatible embedding endpoint.
 */
async function openaiCompatEmbedding(
  baseUrl: string,
  apiKey: string,
  content: string,
  model: string
): Promise<number[]> {
  const response = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: content,
      dimensions: EMBEDDING_DIMENSION,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding API error: ${response.status} — ${errorText}`);
  }

  const data = await response.json() as {
    data: Array<{ embedding: number[] }>;
  };

  const embedding = data.data?.[0]?.embedding;
  if (!embedding) {
    throw new Error('No embedding returned from API.');
  }

  // Pad or truncate to EMBEDDING_DIMENSION
  if (embedding.length < EMBEDDING_DIMENSION) {
    return [...embedding, ...new Array(EMBEDDING_DIMENSION - embedding.length).fill(0)];
  }
  return embedding.slice(0, EMBEDDING_DIMENSION);
}

/**
 * Mock embedding for development — deterministic hash-based vector.
 * NOT suitable for production semantic search.
 */
function mockEmbedding(content: string): number[] {
  const vec = new Array(EMBEDDING_DIMENSION).fill(0);
  for (let i = 0; i < content.length; i++) {
    const charCode = content.charCodeAt(i);
    const idx = (charCode * (i + 1) * 31) % EMBEDDING_DIMENSION;
    vec[idx] = (vec[idx] + (charCode / 127 - 0.5)) / 2;
  }
  // Normalize to unit vector
  const magnitude = Math.sqrt(vec.reduce((sum: number, v: number) => sum + v * v, 0));
  if (magnitude > 0) {
    for (let i = 0; i < vec.length; i++) {
      vec[i] /= magnitude;
    }
  }
  return vec;
}
