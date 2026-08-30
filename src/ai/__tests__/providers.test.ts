import type { AICompletionOptions, AIStreamChunk } from '../types.js';

// ─── Mock SDKs ────────────────────────────────────────────────────────────────

const mockCreate = jest.fn();
const mockStreamCreate = jest.fn();

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    })),
  };
});

const mockAnthropicCreate = jest.fn();
const mockAnthropicStream = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: mockAnthropicCreate,
        stream: mockAnthropicStream,
      },
    })),
  };
});

const mockGetGenerativeModel = jest.fn();
const mockSendMessage = jest.fn();
const mockGenerateContentStream = jest.fn();

jest.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: mockGetGenerativeModel,
    })),
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    choices: [
      {
        index: 0,
        message: { role: 'assistant' as const, content },
        finish_reason: 'stop' as const,
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

async function* streamEvents(model: string, chunks: string[]) {
  for (const c of chunks) {
    yield {
      id: 'cmpl-test',
      object: 'chat.completion.chunk' as const,
      created: Date.now(),
      model,
      choices: [
        {
          index: 0,
          delta: { role: 'assistant' as const, content: c },
          finish_reason: null,
        },
      ],
    };
  }
  yield {
    id: 'cmpl-test',
    object: 'chat.completion.chunk' as const,
    created: Date.now(),
    model,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: 'stop' as const,
      },
    ],
  };
}

function collectChunks(opts: AICompletionOptions) {
  const chunks: AIStreamChunk[] = [];
  return { chunks, onChunk: (c: AIStreamChunk) => chunks.push(c) };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.MISTRAL_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.XAI_API_KEY;
  delete process.env.COHERE_API_KEY;
  delete process.env.FREELLMAPI_ENABLED;
  delete process.env.FREELLMAPI_BASE_URL;
  delete process.env.FREELLMAPI_API_KEY;
  delete process.env.FREELLMAPI_MODEL;
  delete process.env.OPENAI_MODEL;
  delete process.env.ANTHROPIC_MODEL;
  delete process.env.GEMINI_MODEL;
  delete process.env.GROQ_MODEL;
  delete process.env.MISTRAL_MODEL;
  delete process.env.DEEPSEEK_MODEL;
  delete process.env.OPENROUTER_MODEL;
  delete process.env.XAI_MODEL;
  delete process.env.COHERE_MODEL;
  delete process.env.OPENCODEZEN_API_KEY;
  delete process.env.OPENCODEZEN_MODEL;
  delete process.env.ZHIPU_API_KEY;
  delete process.env.ZHIPU_MODEL;
  delete process.env.OLLAMA_BASE_URL;
  delete process.env.OLLAMA_MODEL;
  delete process.env.CUSTOM_BASE_URL;
  delete process.env.CUSTOM_API_KEY;
  delete process.env.CUSTOM_MODEL;
  delete process.env.CUSTOM_PROVIDER_NAME;
});

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI Provider
// ─────────────────────────────────────────────────────────────────────────────

describe('OpenAIProvider', () => {
  const model = 'gpt-4o-mini';

  it('constructor accepts optional apiKey', async () => {
    const OpenAI = (await import('openai')).default;
    const { OpenAIProvider } = await import('../providers/openai.js');
    new OpenAIProvider('test-key');
    expect(OpenAI).toHaveBeenCalledWith({ apiKey: 'test-key' });
  });

  it('constructor falls back to env var', async () => {
    process.env.OPENAI_API_KEY = 'env-key';
    const OpenAI = (await import('openai')).default;
    const { OpenAIProvider } = await import('../providers/openai.js');
    new OpenAIProvider();
    expect(OpenAI).toHaveBeenCalledWith({ apiKey: 'env-key' });
  });

  it('complete() returns normalized AIResponse', async () => {
    mockCreate.mockResolvedValueOnce(okCompletion(model));
    const { OpenAIProvider } = await import('../providers/openai.js');
    const provider = new OpenAIProvider('test-key');
    const res = await provider.complete(baseOpts);

    expect(res.content).toBe('Hi there!');
    expect(res.meta.model).toBe(model);
    expect(res.meta.finishReason).toBe('stop');
    expect(res.meta.usage).toBeDefined();
  });

  it('complete() uses default model when none specified', async () => {
    mockCreate.mockResolvedValueOnce(okCompletion('gpt-4o-mini'));
    const { OpenAIProvider } = await import('../providers/openai.js');
    const provider = new OpenAIProvider('test-key');
    await provider.complete(baseOpts);

    const callModel = mockCreate.mock.calls[0][0].model;
    expect(callModel).toBe('gpt-4o-mini');
  });

  it('complete() uses custom model from opts', async () => {
    mockCreate.mockResolvedValueOnce(okCompletion('gpt-4o'));
    const { OpenAIProvider } = await import('../providers/openai.js');
    const provider = new OpenAIProvider('test-key');
    await provider.complete({ ...baseOpts, model: 'gpt-4o' });

    expect(mockCreate.mock.calls[0][0].model).toBe('gpt-4o');
  });

  it('complete() uses model from env var', async () => {
    process.env.OPENAI_MODEL = 'gpt-3.5-turbo';
    mockCreate.mockResolvedValueOnce(okCompletion('gpt-3.5-turbo'));
    const { OpenAIProvider } = await import('../providers/openai.js');
    const provider = new OpenAIProvider('test-key');
    await provider.complete(baseOpts);

    expect(mockCreate.mock.calls[0][0].model).toBe('gpt-3.5-turbo');
  });

  it('complete() passes through temperature and maxTokens', async () => {
    mockCreate.mockResolvedValueOnce(okCompletion(model));
    const { OpenAIProvider } = await import('../providers/openai.js');
    const provider = new OpenAIProvider('test-key');
    await provider.complete({ ...baseOpts, temperature: 0.5, maxTokens: 256 });

    const params = mockCreate.mock.calls[0][0];
    expect(params.temperature).toBe(0.5);
    expect(params.max_tokens).toBe(256);
  });

  it('complete() propagates API errors', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API error'));
    const { OpenAIProvider } = await import('../providers/openai.js');
    const provider = new OpenAIProvider('test-key');
    await expect(provider.complete(baseOpts)).rejects.toThrow('API error');
  });

  it('stream() calls onChunk with content chunks and done signal', async () => {
    const events = streamEvents(model, ['Hello', ' World']);
    mockCreate.mockResolvedValueOnce(events);
    const { OpenAIProvider } = await import('../providers/openai.js');
    const provider = new OpenAIProvider('test-key');
    const { chunks, onChunk } = collectChunks(baseOpts);

    await provider.stream(baseOpts, onChunk);

    expect(chunks).toEqual([
      { content: 'Hello', done: false },
      { content: ' World', done: false },
      { content: '', done: true },
    ]);
  });

  it('stream() calls onDone with metadata', async () => {
    const events = streamEvents(model, ['Hi']);
    mockCreate.mockResolvedValueOnce(events);
    const onDone = jest.fn();
    const { OpenAIProvider } = await import('../providers/openai.js');
    const provider = new OpenAIProvider('test-key');

    await provider.stream(baseOpts, jest.fn(), onDone);

    expect(onDone).toHaveBeenCalledWith({
      model,
      finishReason: 'stop',
    });
  });

  it('stream() propagates API errors', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Stream error'));
    const { OpenAIProvider } = await import('../providers/openai.js');
    const provider = new OpenAIProvider('test-key');
    await expect(provider.stream(baseOpts, jest.fn())).rejects.toThrow('Stream error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Anthropic Provider
// ─────────────────────────────────────────────────────────────────────────────

describe('AnthropicProvider', () => {
  const model = 'claude-sonnet-4-20250514';

  it('constructor accepts optional apiKey', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const { AnthropicProvider } = await import('../providers/anthropic.js');
    new AnthropicProvider('test-key');
    expect(Anthropic).toHaveBeenCalledWith({ apiKey: 'test-key' });
  });

  it('constructor falls back to env var', async () => {
    process.env.ANTHROPIC_API_KEY = 'env-key';
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const { AnthropicProvider } = await import('../providers/anthropic.js');
    new AnthropicProvider();
    expect(Anthropic).toHaveBeenCalledWith({ apiKey: 'env-key' });
  });

  it('complete() returns normalized AIResponse', async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Hello from Claude!' }],
      model,
      usage: { input_tokens: 10, output_tokens: 8 },
      stop_reason: 'end_turn',
    });
    const { AnthropicProvider } = await import('../providers/anthropic.js');
    const provider = new AnthropicProvider('test-key');
    const res = await provider.complete(baseOpts);

    expect(res.content).toBe('Hello from Claude!');
    expect(res.meta.model).toBe(model);
    expect(res.meta.stopReason).toBe('end_turn');
    expect(res.meta.usage).toBeDefined();
  });

  it('complete() uses default model when none specified', async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'ok' }],
      model,
      usage: { input_tokens: 5, output_tokens: 2 },
      stop_reason: 'end_turn',
    });
    const { AnthropicProvider } = await import('../providers/anthropic.js');
    const provider = new AnthropicProvider('test-key');
    await provider.complete(baseOpts);

    expect(mockAnthropicCreate.mock.calls[0][0].model).toBe(model);
  });

  it('complete() uses custom model from opts', async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'ok' }],
      model: 'claude-3-5-haiku-20241022',
      usage: { input_tokens: 5, output_tokens: 2 },
      stop_reason: 'end_turn',
    });
    const { AnthropicProvider } = await import('../providers/anthropic.js');
    const provider = new AnthropicProvider('test-key');
    await provider.complete({ ...baseOpts, model: 'claude-3-5-haiku-20241022' });

    expect(mockAnthropicCreate.mock.calls[0][0].model).toBe('claude-3-5-haiku-20241022');
  });

  it('complete() extracts system message separately', async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'ok' }],
      model,
      usage: { input_tokens: 5, output_tokens: 2 },
      stop_reason: 'end_turn',
    });
    const { AnthropicProvider } = await import('../providers/anthropic.js');
    const provider = new AnthropicProvider('test-key');
    await provider.complete(baseOpts);

    const params = mockAnthropicCreate.mock.calls[0][0];
    expect(params.system).toBe('You are a helpful assistant.');
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0].role).toBe('user');
  });

  it('complete() propagates API errors', async () => {
    mockAnthropicCreate.mockRejectedValueOnce(new Error('Anthropic error'));
    const { AnthropicProvider } = await import('../providers/anthropic.js');
    const provider = new AnthropicProvider('test-key');
    await expect(provider.complete(baseOpts)).rejects.toThrow('Anthropic error');
  });

  it('stream() calls onChunk with content and done signal', async () => {
    const events = [
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: ' Claude' } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 8 } },
    ];
    mockAnthropicStream.mockResolvedValueOnce({
      [Symbol.asyncIterator]: () => {
        let i = 0;
        return {
          next: () => Promise.resolve(i < events.length ? { value: events[i++], done: false } : { value: undefined, done: true }),
        };
      },
    });
    const { AnthropicProvider } = await import('../providers/anthropic.js');
    const provider = new AnthropicProvider('test-key');
    const { chunks, onChunk } = collectChunks(baseOpts);

    await provider.stream(baseOpts, onChunk);

    expect(chunks).toEqual([
      { content: 'Hello', done: false },
      { content: ' Claude', done: false },
      { content: '', done: true },
    ]);
  });

  it('stream() calls onDone with metadata', async () => {
    const events = [
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 8 } },
    ];
    mockAnthropicStream.mockResolvedValueOnce({
      [Symbol.asyncIterator]: () => {
        let i = 0;
        return {
          next: () => Promise.resolve(i < events.length ? { value: events[i++], done: false } : { value: undefined, done: true }),
        };
      },
    });
    const onDone = jest.fn();
    const { AnthropicProvider } = await import('../providers/anthropic.js');
    const provider = new AnthropicProvider('test-key');

    await provider.stream(baseOpts, jest.fn(), onDone);

    expect(onDone).toHaveBeenCalledWith({
      usage: { output_tokens: 8 },
      stopReason: 'end_turn',
    });
  });

  it('stream() propagates API errors', async () => {
    mockAnthropicStream.mockRejectedValueOnce(new Error('Stream error'));
    const { AnthropicProvider } = await import('../providers/anthropic.js');
    const provider = new AnthropicProvider('test-key');
    await expect(provider.stream(baseOpts, jest.fn())).rejects.toThrow('Stream error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gemini Provider
// ─────────────────────────────────────────────────────────────────────────────

describe('GeminiProvider', () => {
  const model = 'gemini-2.0-flash';

  it('constructor accepts optional apiKey', async () => {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const { GeminiProvider } = await import('../providers/gemini.js');
    new GeminiProvider('test-key');
    expect(GoogleGenerativeAI).toHaveBeenCalledWith('test-key');
  });

  it('constructor falls back to env var', async () => {
    process.env.GEMINI_API_KEY = 'env-key';
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const { GeminiProvider } = await import('../providers/gemini.js');
    new GeminiProvider();
    expect(GoogleGenerativeAI).toHaveBeenCalledWith('env-key');
  });

  it('complete() returns normalized AIResponse', async () => {
    mockGetGenerativeModel.mockReturnValueOnce({
      startChat: jest.fn().mockReturnValue({
        sendMessage: jest.fn().mockResolvedValueOnce({
          response: { text: () => 'Hello from Gemini!' },
        }),
      }),
    });
    const { GeminiProvider } = await import('../providers/gemini.js');
    const provider = new GeminiProvider('test-key');
    const res = await provider.complete(baseOpts);

    expect(res.content).toBe('Hello from Gemini!');
    expect(res.meta.model).toBe(model);
  });

  it('complete() uses default model when none specified', async () => {
    const mockStartChat = jest.fn().mockReturnValue({
      sendMessage: jest.fn().mockResolvedValueOnce({
        response: { text: () => 'ok' },
      }),
    });
    mockGetGenerativeModel.mockReturnValueOnce({ startChat: mockStartChat });
    const { GeminiProvider } = await import('../providers/gemini.js');
    const provider = new GeminiProvider('test-key');
    await provider.complete(baseOpts);

    expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model });
  });

  it('complete() uses custom model from opts', async () => {
    const mockStartChat = jest.fn().mockReturnValue({
      sendMessage: jest.fn().mockResolvedValueOnce({
        response: { text: () => 'ok' },
      }),
    });
    mockGetGenerativeModel.mockReturnValueOnce({ startChat: mockStartChat });
    const { GeminiProvider } = await import('../providers/gemini.js');
    const provider = new GeminiProvider('test-key');
    await provider.complete({ ...baseOpts, model: 'gemini-1.5-pro' });

    expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-1.5-pro' });
  });

  it('complete() propagates API errors', async () => {
    mockGetGenerativeModel.mockReturnValueOnce({
      startChat: jest.fn().mockReturnValue({
        sendMessage: jest.fn().mockRejectedValueOnce(new Error('Gemini error')),
      }),
    });
    const { GeminiProvider } = await import('../providers/gemini.js');
    const provider = new GeminiProvider('test-key');
    await expect(provider.complete(baseOpts)).rejects.toThrow('Gemini error');
  });

  it('stream() calls onChunk with content and done signal', async () => {
    const streamChunks = [
      { candidates: [{ content: { parts: [{ text: 'Hello' }] } }] },
      { candidates: [{ content: { parts: [{ text: ' Gemini' }] } }] },
    ];
    mockGetGenerativeModel.mockReturnValueOnce({
      generateContentStream: jest.fn().mockResolvedValueOnce({
        stream: {
          [Symbol.asyncIterator]: () => {
            let i = 0;
            return {
              next: () => Promise.resolve(i < streamChunks.length ? { value: streamChunks[i++], done: false } : { value: undefined, done: true }),
            };
          },
        },
      }),
    });
    const { GeminiProvider } = await import('../providers/gemini.js');
    const provider = new GeminiProvider('test-key');
    const { chunks, onChunk } = collectChunks(baseOpts);

    await provider.stream(baseOpts, onChunk);

    expect(chunks).toEqual([
      { content: 'Hello', done: false },
      { content: ' Gemini', done: false },
      { content: '', done: true },
    ]);
  });

  it('stream() calls onDone with model metadata', async () => {
    mockGetGenerativeModel.mockReturnValueOnce({
      generateContentStream: jest.fn().mockResolvedValueOnce({
        stream: {
          [Symbol.asyncIterator]: () => {
            let called = false;
            return {
              next: () => {
                if (!called) { called = true; return Promise.resolve({ value: undefined, done: true }); }
                return Promise.resolve({ value: undefined, done: true });
              },
            };
          },
        },
      }),
    });
    const onDone = jest.fn();
    const { GeminiProvider } = await import('../providers/gemini.js');
    const provider = new GeminiProvider('test-key');

    await provider.stream(baseOpts, jest.fn(), onDone);

    expect(onDone).toHaveBeenCalledWith({ model });
  });

  it('stream() propagates API errors', async () => {
    mockGetGenerativeModel.mockReturnValueOnce({
      generateContentStream: jest.fn().mockRejectedValueOnce(new Error('Stream error')),
    });
    const { GeminiProvider } = await import('../providers/gemini.js');
    const provider = new GeminiProvider('test-key');
    await expect(provider.stream(baseOpts, jest.fn())).rejects.toThrow('Stream error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI-compatible providers (Groq, Mistral, DeepSeek, OpenRouter, xAI, Cohere)
// ─────────────────────────────────────────────────────────────────────────────

interface OpenAICompatConfig {
  importPath: string;
  className: string;
  defaultModel: string;
  envKey: string;
  envModel: string;
  baseURL: string;
}

const openAICompatProviders: OpenAICompatConfig[] = [
  {
    importPath: '../providers/groq.js',
    className: 'GroqProvider',
    defaultModel: 'llama-3.1-8b-instant',
    envKey: 'GROQ_API_KEY',
    envModel: 'GROQ_MODEL',
    baseURL: 'https://api.groq.com/openai/v1',
  },
  {
    importPath: '../providers/mistral.js',
    className: 'MistralProvider',
    defaultModel: 'mistral-small-latest',
    envKey: 'MISTRAL_API_KEY',
    envModel: 'MISTRAL_MODEL',
    baseURL: 'https://api.mistral.ai/v1',
  },
  {
    importPath: '../providers/deepseek.js',
    className: 'DeepSeekProvider',
    defaultModel: 'deepseek-chat',
    envKey: 'DEEPSEEK_API_KEY',
    envModel: 'DEEPSEEK_MODEL',
    baseURL: 'https://api.deepseek.com/v1',
  },
  {
    importPath: '../providers/openrouter.js',
    className: 'OpenRouterProvider',
    defaultModel: 'meta-llama/llama-3.1-8b-instruct:free',
    envKey: 'OPENROUTER_API_KEY',
    envModel: 'OPENROUTER_MODEL',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  {
    importPath: '../providers/xai.js',
    className: 'XAIProvider',
    defaultModel: 'grok-3-mini',
    envKey: 'XAI_API_KEY',
    envModel: 'XAI_MODEL',
    baseURL: 'https://api.x.ai/v1',
  },
  {
    importPath: '../providers/cohere.js',
    className: 'CohereProvider',
    defaultModel: 'command-a-03-2025',
    envKey: 'COHERE_API_KEY',
    envModel: 'COHERE_MODEL',
    baseURL: 'https://api.cohere.com/compatibility/v1',
  },
];

describe.each(openAICompatProviders)('$className (OpenAI-compatible)', (cfg) => {
  it('constructor accepts optional apiKey', async () => {
    const OpenAI = (await import('openai')).default;
    const mod = await import(cfg.importPath);
    const Provider = mod[cfg.className];
    new Provider('test-key');
    expect(OpenAI).toHaveBeenCalledWith({ apiKey: 'test-key', baseURL: cfg.baseURL });
  });

  it('constructor falls back to env var', async () => {
    process.env[cfg.envKey] = 'env-key';
    const OpenAI = (await import('openai')).default;
    const mod = await import(cfg.importPath);
    const Provider = mod[cfg.className];
    new Provider();
    expect(OpenAI).toHaveBeenCalledWith({ apiKey: 'env-key', baseURL: cfg.baseURL });
  });

  it('complete() returns normalized AIResponse', async () => {
    mockCreate.mockResolvedValueOnce(okCompletion(cfg.defaultModel));
    const mod = await import(cfg.importPath);
    const Provider = mod[cfg.className];
    const provider = new Provider('test-key');
    const res = await provider.complete(baseOpts);

    expect(res.content).toBe('Hi there!');
    expect(res.meta.model).toBe(cfg.defaultModel);
    expect(res.meta.finishReason).toBe('stop');
    expect(res.meta.usage).toBeDefined();
  });

  it('complete() uses default model when none specified', async () => {
    mockCreate.mockResolvedValueOnce(okCompletion(cfg.defaultModel));
    const mod = await import(cfg.importPath);
    const Provider = mod[cfg.className];
    const provider = new Provider('test-key');
    await provider.complete(baseOpts);

    expect(mockCreate.mock.calls[0][0].model).toBe(cfg.defaultModel);
  });

  it('complete() uses custom model from opts', async () => {
    mockCreate.mockResolvedValueOnce(okCompletion('custom-model'));
    const mod = await import(cfg.importPath);
    const Provider = mod[cfg.className];
    const provider = new Provider('test-key');
    await provider.complete({ ...baseOpts, model: 'custom-model' });

    expect(mockCreate.mock.calls[0][0].model).toBe('custom-model');
  });

  it('complete() uses model from env var', async () => {
    process.env[cfg.envModel] = 'env-model';
    mockCreate.mockResolvedValueOnce(okCompletion('env-model'));
    const mod = await import(cfg.importPath);
    const Provider = mod[cfg.className];
    const provider = new Provider('test-key');
    await provider.complete(baseOpts);

    expect(mockCreate.mock.calls[0][0].model).toBe('env-model');
  });

  it('complete() passes through temperature and maxTokens', async () => {
    mockCreate.mockResolvedValueOnce(okCompletion(cfg.defaultModel));
    const mod = await import(cfg.importPath);
    const Provider = mod[cfg.className];
    const provider = new Provider('test-key');
    await provider.complete({ ...baseOpts, temperature: 0.3, maxTokens: 512 });

    const params = mockCreate.mock.calls[0][0];
    expect(params.temperature).toBe(0.3);
    expect(params.max_tokens).toBe(512);
  });

  it('complete() propagates API errors', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API error'));
    const mod = await import(cfg.importPath);
    const Provider = mod[cfg.className];
    const provider = new Provider('test-key');
    await expect(provider.complete(baseOpts)).rejects.toThrow('API error');
  });

  it('stream() calls onChunk with content chunks and done signal', async () => {
    const events = streamEvents(cfg.defaultModel, ['Hello', ' World']);
    mockCreate.mockResolvedValueOnce(events);
    const mod = await import(cfg.importPath);
    const Provider = mod[cfg.className];
    const provider = new Provider('test-key');
    const { chunks, onChunk } = collectChunks(baseOpts);

    await provider.stream(baseOpts, onChunk);

    expect(chunks).toEqual([
      { content: 'Hello', done: false },
      { content: ' World', done: false },
      { content: '', done: true },
    ]);
  });

  it('stream() calls onDone with metadata', async () => {
    const events = streamEvents(cfg.defaultModel, ['Hi']);
    mockCreate.mockResolvedValueOnce(events);
    const onDone = jest.fn();
    const mod = await import(cfg.importPath);
    const Provider = mod[cfg.className];
    const provider = new Provider('test-key');

    await provider.stream(baseOpts, jest.fn(), onDone);

    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({
        model: cfg.defaultModel,
        finishReason: 'stop',
      }),
    );
  });

  it('stream() propagates API errors', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Stream error'));
    const mod = await import(cfg.importPath);
    const Provider = mod[cfg.className];
    const provider = new Provider('test-key');
    await expect(provider.stream(baseOpts, jest.fn())).rejects.toThrow('Stream error');
  });
});
