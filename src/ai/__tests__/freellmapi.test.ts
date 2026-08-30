/**
 * FreeLLMAPI provider tests.
 * Covers: configuration, URL normalization, keyless mode, complete/stream, errors.
 */
import type { AICompletionOptions, AIStreamChunk } from '../types.js';

const mockCreate = jest.fn();
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

const baseOpts: AICompletionOptions = {
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello!' },
  ],
};

function okCompletion(model: string, content = 'Hi there!') {
  return {
    id: 'cmpl-test',
    object: 'chat.completion' as const,
    created: Date.now(),
    model,
    choices: [{
      index: 0,
      message: { role: 'assistant' as const, content },
      finish_reason: 'stop' as const,
    }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

async function* streamEvents(model: string, chunks: string[]) {
  for (const c of chunks) {
    yield {
      id: 'cmpl-test', object: 'chat.completion.chunk' as const,
      created: Date.now(), model,
      choices: [{ index: 0, delta: { role: 'assistant' as const, content: c }, finish_reason: null }],
    };
  }
  yield {
    id: 'cmpl-test', object: 'chat.completion.chunk' as const,
    created: Date.now(), model,
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' as const }],
  };
}

function collectChunks() {
  const chunks: AIStreamChunk[] = [];
  return { chunks, onChunk: (c: AIStreamChunk) => chunks.push(c) };
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.FREELLMAPI_ENABLED;
  delete process.env.FREELLMAPI_BASE_URL;
  delete process.env.FREELLMAPI_API_KEY;
  delete process.env.FREELLMAPI_MODEL;
  delete process.env.FREELLMAPI_TIMEOUT_MS;
  delete process.env.OPENAI_API_KEY;
});

// ─── URL Normalization ─────────────────────────────────────────────────────

describe('normalizeBaseUrl', () => {
  const { normalizeBaseUrl } = require('../providers/freellmapi.js');

  it('appends /v1 when missing', () => {
    expect(normalizeBaseUrl('https://example.com')).toBe('https://example.com/v1');
  });

  it('strips trailing slash and appends /v1', () => {
    expect(normalizeBaseUrl('https://example.com/')).toBe('https://example.com/v1');
  });

  it('keeps /v1 when already present', () => {
    expect(normalizeBaseUrl('https://example.com/v1')).toBe('https://example.com/v1');
  });

  it('strips trailing slash from /v1/', () => {
    expect(normalizeBaseUrl('https://example.com/v1/')).toBe('https://example.com/v1');
  });

  it('handles multiple trailing slashes', () => {
    expect(normalizeBaseUrl('https://example.com///')).toBe('https://example.com/v1');
  });

  it('handles sub-path without /v1', () => {
    expect(normalizeBaseUrl('https://example.com/api')).toBe('https://example.com/api/v1');
  });

  it('handles sub-path with /v1', () => {
    expect(normalizeBaseUrl('https://example.com/api/v1')).toBe('https://example.com/api/v1');
  });
});

// ─── Constructor ───────────────────────────────────────────────────────────

describe('FreeLLMAPIProvider constructor', () => {
  it('throws when FREELLMAPI_BASE_URL is not set', async () => {
    const OpenAI = (await import('openai')).default;
    const { FreeLLMAPIProvider } = await import('../providers/freellmapi.js');
    expect(() => new FreeLLMAPIProvider()).toThrow('FREELLMAPI_BASE_URL');
    expect(OpenAI).not.toHaveBeenCalled();
  });

  it('accepts optional apiKey and baseURL parameters', async () => {
    const OpenAI = (await import('openai')).default;
    const { FreeLLMAPIProvider } = await import('../providers/freellmapi.js');
    new FreeLLMAPIProvider('test-key', 'https://myhost.com');
    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'test-key', baseURL: 'https://myhost.com/v1' }),
    );
  });

  it('uses env vars when no constructor params', async () => {
    process.env.FREELLMAPI_BASE_URL = 'https://env-host.com';
    process.env.FREELLMAPI_API_KEY = 'env-key';
    const OpenAI = (await import('openai')).default;
    const { FreeLLMAPIProvider } = await import('../providers/freellmapi.js');
    new FreeLLMAPIProvider();
    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'env-key', baseURL: 'https://env-host.com/v1' }),
    );
  });

  it('normalizes base URL from env var', async () => {
    process.env.FREELLMAPI_BASE_URL = 'https://env-host.com/';
    const OpenAI = (await import('openai')).default;
    const { FreeLLMAPIProvider } = await import('../providers/freellmapi.js');
    new FreeLLMAPIProvider();
    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://env-host.com/v1' }),
    );
  });

  it('works in keyless mode (no API key)', async () => {
    process.env.FREELLMAPI_BASE_URL = 'https://free-host.com';
    const OpenAI = (await import('openai')).default;
    const { FreeLLMAPIProvider } = await import('../providers/freellmapi.js');
    new FreeLLMAPIProvider();
    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: '', baseURL: 'https://free-host.com/v1' }),
    );
  });

  it('throws when FREELLMAPI_ENABLED=false', async () => {
    process.env.FREELLMAPI_BASE_URL = 'https://host.com';
    process.env.FREELLMAPI_ENABLED = 'false';
    const { FreeLLMAPIProvider } = await import('../providers/freellmapi.js');
    expect(() => new FreeLLMAPIProvider()).toThrow('disabled');
  });

  it('allows FREELLMAPI_ENABLED=true', async () => {
    process.env.FREELLMAPI_BASE_URL = 'https://host.com';
    process.env.FREELLMAPI_ENABLED = 'true';
    const { FreeLLMAPIProvider } = await import('../providers/freellmapi.js');
    expect(() => new FreeLLMAPIProvider()).not.toThrow();
  });

  it('applies FREELLMAPI_TIMEOUT_MS when set', async () => {
    process.env.FREELLMAPI_BASE_URL = 'https://host.com';
    process.env.FREELLMAPI_TIMEOUT_MS = '30000';
    const OpenAI = (await import('openai')).default;
    const { FreeLLMAPIProvider } = await import('../providers/freellmapi.js');
    new FreeLLMAPIProvider();
    expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ timeout: 30000 }));
  });

  it('ignores invalid FREELLMAPI_TIMEOUT_MS', async () => {
    process.env.FREELLMAPI_BASE_URL = 'https://host.com';
    process.env.FREELLMAPI_TIMEOUT_MS = 'not-a-number';
    const OpenAI = (await import('openai')).default as unknown as jest.Mock;
    const { FreeLLMAPIProvider } = await import('../providers/freellmapi.js');
    new FreeLLMAPIProvider();
    const callOpts = OpenAI.mock.calls[OpenAI.mock.calls.length - 1][0];
    expect(callOpts.timeout).toBeUndefined();
  });

  it('ignores FREELLMAPI_ENABLED with value other than "false"', async () => {
    process.env.FREELLMAPI_BASE_URL = 'https://host.com';
    process.env.FREELLMAPI_ENABLED = 'yes';
    const { FreeLLMAPIProvider } = await import('../providers/freellmapi.js');
    expect(() => new FreeLLMAPIProvider()).not.toThrow();
  });
});

// ─── complete() ─────────────────────────────────────────────────────────────

describe('FreeLLMAPIProvider.complete()', () => {
  it('returns normalized AIResponse', async () => {
    process.env.FREELLMAPI_BASE_URL = 'https://host.com';
    mockCreate.mockResolvedValueOnce(okCompletion('auto'));
    const { FreeLLMAPIProvider } = await import('../providers/freellmapi.js');
    const provider = new FreeLLMAPIProvider('key');
    const res = await provider.complete(baseOpts);
    expect(res.content).toBe('Hi there!');
    expect(res.meta.model).toBe('auto');
    expect(res.meta.finishReason).toBe('stop');
    expect(res.meta.usage).toBeDefined();
  });

  it('uses default model "auto" when none specified', async () => {
    process.env.FREELLMAPI_BASE_URL = 'https://host.com';
    mockCreate.mockResolvedValueOnce(okCompletion('auto'));
    const { FreeLLMAPIProvider } = await import('../providers/freellmapi.js');
    const provider = new FreeLLMAPIProvider('key');
    await provider.complete(baseOpts);
    expect(mockCreate.mock.calls[0][0].model).toBe('auto');
  });

  it('uses custom model from opts', async () => {
    process.env.FREELLMAPI_BASE_URL = 'https://host.com';
    mockCreate.mockResolvedValueOnce(okCompletion('meta-llama/llama-3.1-70b'));
    const { FreeLLMAPIProvider } = await import('../providers/freellmapi.js');
    const provider = new FreeLLMAPIProvider('key');
    await provider.complete({ ...baseOpts, model: 'meta-llama/llama-3.1-70b' });
    expect(mockCreate.mock.calls[0][0].model).toBe('meta-llama/llama-3.1-70b');
  });

  it('uses model from env var', async () => {
    process.env.FREELLMAPI_BASE_URL = 'https://host.com';
    process.env.FREELLMAPI_MODEL = 'auto:free';
    mockCreate.mockResolvedValueOnce(okCompletion('auto:free'));
    const { FreeLLMAPIProvider } = await import('../providers/freellmapi.js');
    const provider = new FreeLLMAPIProvider('key');
    await provider.complete(baseOpts);
    expect(mockCreate.mock.calls[0][0].model).toBe('auto:free');
  });

  it('passes through temperature and maxTokens', async () => {
    process.env.FREELLMAPI_BASE_URL = 'https://host.com';
    mockCreate.mockResolvedValueOnce(okCompletion('auto'));
    const { FreeLLMAPIProvider } = await import('../providers/freellmapi.js');
    const provider = new FreeLLMAPIProvider('key');
    await provider.complete({ ...baseOpts, temperature: 0.3, maxTokens: 512 });
    const params = mockCreate.mock.calls[0][0];
    expect(params.temperature).toBe(0.3);
    expect(params.max_tokens).toBe(512);
  });

  it('propagates API errors', async () => {
    process.env.FREELLMAPI_BASE_URL = 'https://host.com';
    mockCreate.mockRejectedValueOnce(new Error('API error'));
    const { FreeLLMAPIProvider } = await import('../providers/freellmapi.js');
    const provider = new FreeLLMAPIProvider('key');
    await expect(provider.complete(baseOpts)).rejects.toThrow('API error');
  });

  it('works without API key (keyless mode)', async () => {
    process.env.FREELLMAPI_BASE_URL = 'https://free-host.com';
    mockCreate.mockResolvedValueOnce(okCompletion('auto', 'Keyless response'));
    const { FreeLLMAPIProvider } = await import('../providers/freellmapi.js');
    const provider = new FreeLLMAPIProvider();
    const res = await provider.complete(baseOpts);
    expect(res.content).toBe('Keyless response');
  });
});

// ─── stream() ───────────────────────────────────────────────────────────────

describe('FreeLLMAPIProvider.stream()', () => {
  it('calls onChunk with content chunks and done signal', async () => {
    process.env.FREELLMAPI_BASE_URL = 'https://host.com';
    mockCreate.mockResolvedValueOnce(streamEvents('auto', ['Hello', ' World']));
    const { FreeLLMAPIProvider } = await import('../providers/freellmapi.js');
    const provider = new FreeLLMAPIProvider('key');
    const { chunks, onChunk } = collectChunks();
    await provider.stream(baseOpts, onChunk);
    expect(chunks).toEqual([
      { content: 'Hello', done: false },
      { content: ' World', done: false },
      { content: '', done: true },
    ]);
  });

  it('calls onDone with metadata', async () => {
    process.env.FREELLMAPI_BASE_URL = 'https://host.com';
    mockCreate.mockResolvedValueOnce(streamEvents('auto', ['Hi']));
    const onDone = jest.fn();
    const { FreeLLMAPIProvider } = await import('../providers/freellmapi.js');
    const provider = new FreeLLMAPIProvider('key');
    await provider.stream(baseOpts, jest.fn(), onDone);
    expect(onDone).toHaveBeenCalledWith({ model: 'auto', finishReason: 'stop' });
  });

  it('propagates API errors', async () => {
    process.env.FREELLMAPI_BASE_URL = 'https://host.com';
    mockCreate.mockRejectedValueOnce(new Error('Stream error'));
    const { FreeLLMAPIProvider } = await import('../providers/freellmapi.js');
    const provider = new FreeLLMAPIProvider('key');
    await expect(provider.stream(baseOpts, jest.fn())).rejects.toThrow('Stream error');
  });

  it('works without API key (keyless mode)', async () => {
    process.env.FREELLMAPI_BASE_URL = 'https://free-host.com';
    mockCreate.mockResolvedValueOnce(streamEvents('auto', ['Keyless stream']));
    const { FreeLLMAPIProvider } = await import('../providers/freellmapi.js');
    const provider = new FreeLLMAPIProvider();
    const { chunks, onChunk } = collectChunks();
    await provider.stream(baseOpts, onChunk);
    expect(chunks).toEqual([
      { content: 'Keyless stream', done: false },
      { content: '', done: true },
    ]);
  });
});

// ─── Provider identity ──────────────────────────────────────────────────────

describe('FreeLLMAPIProvider identity', () => {
  it('has correct provider name', async () => {
    process.env.FREELLMAPI_BASE_URL = 'https://host.com';
    const { FreeLLMAPIProvider } = await import('../providers/freellmapi.js');
    const provider = new FreeLLMAPIProvider('key');
    expect(provider.name).toBe('freellmapi');
  });
});
