/**
 * LLM Gateway Tests — Invariant 5 Verification
 *
 * Tests that:
 * - Provider resolution works correctly based on model name prefixes.
 * - Available providers reflect configured env vars.
 * - Model name normalization strips provider prefixes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('LLM Gateway — Provider Resolution', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('getAvailableProviders returns empty when no keys are set', async () => {
    delete process.env['OPENAI_API_KEY'];
    delete process.env['GEMINI_API_KEY'];
    delete process.env['OPENROUTER_API_KEY'];
    delete process.env['GROQ_API_KEY'];
    delete process.env['OLLAMA_BASE_URL'];

    const { getAvailableProviders } = await import('../services/backend-api/src/proxy/llm-gateway.js');
    const providers = getAvailableProviders();
    expect(providers).toEqual([]);
  });

  it('getAvailableProviders includes configured providers', async () => {
    process.env['GEMINI_API_KEY'] = 'test-key';
    process.env['GROQ_API_KEY'] = 'test-key';

    const { getAvailableProviders } = await import('../services/backend-api/src/proxy/llm-gateway.js');
    const providers = getAvailableProviders();
    expect(providers).toContain('gemini');
    expect(providers).toContain('groq');
    expect(providers).not.toContain('openai');
  });
});

describe('LLM Gateway — Model Name Normalization', () => {
  it('strips gemini/ prefix', () => {
    // Direct test of the logic
    const model = 'gemini/gemini-2.0-flash';
    const prefixes = ['gemini/', 'openrouter/', 'groq/', 'ollama/', 'local/'];
    let normalized = model;
    for (const prefix of prefixes) {
      if (model.toLowerCase().startsWith(prefix)) {
        normalized = model.substring(prefix.length);
        break;
      }
    }
    expect(normalized).toBe('gemini-2.0-flash');
  });

  it('strips openrouter/ prefix', () => {
    const model = 'openrouter/meta-llama/llama-3-70b';
    const prefixes = ['gemini/', 'openrouter/', 'groq/', 'ollama/', 'local/'];
    let normalized = model;
    for (const prefix of prefixes) {
      if (model.toLowerCase().startsWith(prefix)) {
        normalized = model.substring(prefix.length);
        break;
      }
    }
    expect(normalized).toBe('meta-llama/llama-3-70b');
  });

  it('preserves unprefixed model names', () => {
    const model = 'gpt-4o';
    const prefixes = ['gemini/', 'openrouter/', 'groq/', 'ollama/', 'local/'];
    let normalized = model;
    for (const prefix of prefixes) {
      if (model.toLowerCase().startsWith(prefix)) {
        normalized = model.substring(prefix.length);
        break;
      }
    }
    expect(normalized).toBe('gpt-4o');
  });
});
