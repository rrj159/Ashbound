import type { AICompletionOptions, AIResponse, AIStreamChunk, AIProvider } from '../types.js';

jest.mock('../providers/index.js', () => ({
  getPrimaryProvider: jest.fn(),
  getFallbackProvider: jest.fn(),
}));

jest.mock('../../security/SecretRedactor.js', () => ({
  SecretRedactor: {
    redactString: jest.fn((s: string) => s),
    redactObject: jest.fn((o: unknown) => o),
  },
}));

import { ai } from '../service.js';
import { getPrimaryProvider, getFallbackProvider } from '../providers/index.js';

const mockGetPrimary = getPrimaryProvider as jest.MockedFunction<typeof getPrimaryProvider>;
const mockGetFallback = getFallbackProvider as jest.MockedFunction<typeof getFallbackProvider>;

function makeProvider(name: string, response = 'Hello from mock'): AIProvider {
  return {
    name,
    complete: jest.fn().mockResolvedValue({ content: response, meta: { model: name } }),
    stream: jest.fn().mockImplementation(
      async (_opts: AICompletionOptions, onChunk: (c: AIStreamChunk) => void) => {
        onChunk({ content: response, done: true });
      },
    ),
  } as unknown as AIProvider;
}

function makeFailingProvider(name: string, error = new Error(`${name} failed`)): AIProvider {
  return {
    name,
    complete: jest.fn().mockRejectedValue(error),
    stream: jest.fn().mockRejectedValue(error),
  } as unknown as AIProvider;
}

const asProvider = (p: AIProvider) => p as unknown as ReturnType<typeof getPrimaryProvider>;

const userMsg = (content: string) => [{ role: 'user' as const, content }];

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ai.chat()', () => {
  test('returns response from primary provider', async () => {
    const primary = makeProvider('openai', 'Primary response');
    mockGetPrimary.mockReturnValue(asProvider(primary));
    mockGetFallback.mockReturnValue(null);

    const result = await ai.chat(userMsg('Hello'));

    expect(result.content).toBe('Primary response');
    expect(result.meta.model).toBe('openai');
    expect(primary.complete).toHaveBeenCalledTimes(1);
    expect(primary.complete).toHaveBeenCalledWith(
      expect.objectContaining({ messages: userMsg('Hello'), stream: false }),
    );
  });

  test('passes through options to provider', async () => {
    const primary = makeProvider('openai');
    mockGetPrimary.mockReturnValue(asProvider(primary));
    mockGetFallback.mockReturnValue(null);

    await ai.chat(userMsg('Hello'), { temperature: 0.5, maxTokens: 100 });

    expect(primary.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: userMsg('Hello'),
        temperature: 0.5,
        maxTokens: 100,
        stream: false,
      }),
    );
  });

  test('falls back to secondary provider when primary fails', async () => {
    const primary = makeFailingProvider('openai');
    const fallback = makeProvider('anthropic', 'Fallback response');
    mockGetPrimary.mockReturnValue(asProvider(primary));
    mockGetFallback.mockReturnValue(asProvider(fallback));

    const result = await ai.chat(userMsg('Hello'));

    expect(result.content).toBe('Fallback response');
    expect(primary.complete).toHaveBeenCalledTimes(1);
    expect(fallback.complete).toHaveBeenCalledTimes(1);
    expect(fallback.complete).toHaveBeenCalledWith(
      expect.objectContaining({ messages: userMsg('Hello'), stream: false }),
    );
  });

  test('throws when no primary provider is configured', async () => {
    mockGetPrimary.mockReturnValue(null);
    mockGetFallback.mockReturnValue(null);

    await expect(ai.chat(userMsg('Hello'))).rejects.toThrow('No primary provider configured');
  });

  test('throws primary error when no fallback is configured', async () => {
    const primary = makeFailingProvider('openai');
    mockGetPrimary.mockReturnValue(asProvider(primary));
    mockGetFallback.mockReturnValue(null);

    await expect(ai.chat(userMsg('Hello'))).rejects.toThrow('openai failed');
  });

  test('throws when both providers fail', async () => {
    const primary = makeFailingProvider('openai');
    const fallback = makeFailingProvider('anthropic');
    mockGetPrimary.mockReturnValue(asProvider(primary));
    mockGetFallback.mockReturnValue(asProvider(fallback));

    await expect(ai.chat(userMsg('Hello'))).rejects.toThrow();
  });

  test('always sets stream: false in options', async () => {
    const primary = makeProvider('openai');
    mockGetPrimary.mockReturnValue(asProvider(primary));
    mockGetFallback.mockReturnValue(null);

    await ai.chat(userMsg('Hello'), { stream: true } as Partial<AICompletionOptions>);

    expect(primary.complete).toHaveBeenCalledWith(
      expect.objectContaining({ stream: false }),
    );
  });
});

describe('ai.say()', () => {
  test('constructs messages with system and user roles', async () => {
    const primary = makeProvider('openai', 'say response');
    mockGetPrimary.mockReturnValue(asProvider(primary));
    mockGetFallback.mockReturnValue(null);

    const result = await ai.say('What is life?', 'You are a philosopher');

    expect(result).toBe('say response');
    expect(primary.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'system', content: 'You are a philosopher' },
          { role: 'user', content: 'What is life?' },
        ],
        stream: false,
      }),
    );
  });

  test('constructs messages without system prompt', async () => {
    const primary = makeProvider('openai', 'no system');
    mockGetPrimary.mockReturnValue(asProvider(primary));
    mockGetFallback.mockReturnValue(null);

    const result = await ai.say('Hello');

    expect(result).toBe('no system');
    expect(primary.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false,
      }),
    );
  });

  test('returns plain string not full response', async () => {
    const primary = makeProvider('openai', 'plain text');
    mockGetPrimary.mockReturnValue(asProvider(primary));
    mockGetFallback.mockReturnValue(null);

    const result = await ai.say('Test');

    expect(typeof result).toBe('string');
    expect(result).toBe('plain text');
  });

  test('passes opts through to chat', async () => {
    const primary = makeProvider('openai');
    mockGetPrimary.mockReturnValue(asProvider(primary));
    mockGetFallback.mockReturnValue(null);

    await ai.say('Hello', 'System', { temperature: 0.7 });

    expect(primary.complete).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.7 }),
    );
  });
});

describe('ai.stream()', () => {
  test('streams from primary provider', async () => {
    const primary = makeProvider('openai');
    mockGetPrimary.mockReturnValue(asProvider(primary));
    mockGetFallback.mockReturnValue(null);

    const chunks: AIStreamChunk[] = [];
    await ai.stream(userMsg('Hello'), (c) => chunks.push(c));

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('Hello from mock');
    expect(chunks[0].done).toBe(true);
    expect(primary.stream).toHaveBeenCalledTimes(1);
    expect(primary.stream).toHaveBeenCalledWith(
      expect.objectContaining({ messages: userMsg('Hello'), stream: true }),
      expect.any(Function),
    );
  });

  test('falls back to secondary when primary fails', async () => {
    const primary = makeFailingProvider('openai');
    const fallback = makeProvider('anthropic', 'Fallback chunk');
    mockGetPrimary.mockReturnValue(asProvider(primary));
    mockGetFallback.mockReturnValue(asProvider(fallback));

    const chunks: AIStreamChunk[] = [];
    await ai.stream(userMsg('Hello'), (c) => chunks.push(c));

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('Fallback chunk');
    expect(primary.stream).toHaveBeenCalledTimes(1);
    expect(fallback.stream).toHaveBeenCalledTimes(1);
  });

  test('throws when no primary provider is configured', async () => {
    mockGetPrimary.mockReturnValue(null);
    mockGetFallback.mockReturnValue(null);

    const chunks: AIStreamChunk[] = [];
    await expect(ai.stream(userMsg('Hello'), (c) => chunks.push(c))).rejects.toThrow(
      'No primary provider configured',
    );
  });

  test('throws primary error when no fallback is configured', async () => {
    const primary = makeFailingProvider('openai');
    mockGetPrimary.mockReturnValue(asProvider(primary));
    mockGetFallback.mockReturnValue(null);

    const chunks: AIStreamChunk[] = [];
    await expect(ai.stream(userMsg('Hello'), (c) => chunks.push(c))).rejects.toThrow(
      'openai failed',
    );
  });

  test('passes opts through to provider stream', async () => {
    const primary = makeProvider('openai');
    mockGetPrimary.mockReturnValue(asProvider(primary));
    mockGetFallback.mockReturnValue(null);

    const chunks: AIStreamChunk[] = [];
    await ai.stream(userMsg('Hello'), (c) => chunks.push(c), { temperature: 0.3 });

    expect(primary.stream).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.3, stream: true }),
      expect.any(Function),
    );
  });
});
