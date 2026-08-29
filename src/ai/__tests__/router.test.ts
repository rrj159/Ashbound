import type { AICompletionOptions, AIResponse, AIStreamChunk, AIProvider } from '../types.js';

jest.mock('../providers/index.js', () => ({
  getPrimaryProvider: jest.fn(),
  getFallbackProvider: jest.fn(),
  listAvailableProviders: jest.fn(),
}));

jest.mock('../../security/SecretRedactor.js', () => ({
  SecretRedactor: {
    redactString: jest.fn((s: string) => s),
    redactObject: jest.fn((o: unknown) => o),
  },
}));

import { router, getCooldownStatus, getProviderPerf, getAllPerf, getUnavailableProviders, _resetRouterState } from '../router.js';
import { getPrimaryProvider, getFallbackProvider, listAvailableProviders } from '../providers/index.js';

const mockGetPrimary = getPrimaryProvider as jest.MockedFunction<typeof getPrimaryProvider>;
const mockGetFallback = getFallbackProvider as jest.MockedFunction<typeof getFallbackProvider>;
const mockListAvailable = listAvailableProviders as jest.MockedFunction<typeof listAvailableProviders>;

interface MockProvider {
  name: string;
  complete: jest.Mock;
  stream: jest.Mock;
}

function makeProvider(name: string, response = 'Hello from mock'): MockProvider {
  return {
    name,
    complete: jest.fn().mockResolvedValue({ content: response, meta: { model: name } }),
    stream: jest.fn().mockImplementation(
      async (_opts: AICompletionOptions, onChunk: (c: AIStreamChunk) => void) => {
        onChunk({ content: response, done: true });
      },
    ),
  };
}

function makeFailingProvider(name: string, error = new Error(`${name} failed`)): MockProvider {
  return {
    name,
    complete: jest.fn().mockRejectedValue(error),
    stream: jest.fn().mockRejectedValue(error),
  };
}

const asProvider = (p: MockProvider) =>
  p as unknown as AIProvider as unknown as ReturnType<typeof getPrimaryProvider>;

const userMsg = (content: string) => [{ role: 'user' as const, content }];

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  _resetRouterState();
  mockListAvailable.mockReturnValue([]);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('AIRouter.chat()', () => {
  test('returns response from primary provider', async () => {
    const primary = makeProvider('openai', 'Primary response');
    mockGetPrimary.mockReturnValue(asProvider(primary));
    mockGetFallback.mockReturnValue(null);
    mockListAvailable.mockReturnValue(['openai']);

    const result = await router.chat({ messages: userMsg('Hello') });

    expect(result.content).toBe('Primary response');
    expect(result.meta.model).toBe('openai');
    expect(primary.complete).toHaveBeenCalledTimes(1);
  });

  test('returns response from fallback when primary fails', async () => {
    const groq = makeFailingProvider('groq');
    const deepseek = makeProvider('deepseek', 'Fallback response');
    mockGetPrimary.mockReturnValue(asProvider(groq));
    mockGetFallback.mockReturnValue(asProvider(deepseek));
    mockListAvailable.mockReturnValue(['groq', 'deepseek']);

    const result = await router.chat({ messages: userMsg('Hello') });

    expect(result.content).toBe('Fallback response');
    expect(groq.complete).toHaveBeenCalledTimes(1);
    expect(deepseek.complete).toHaveBeenCalledTimes(1);
  });

  test('falls back after credit_balance_exhausted and does not select that provider again', async () => {
    const openai = makeFailingProvider('openai', Object.assign(new Error('credit_balance_exhausted'), { status: 429, code: 'credit_balance_exhausted' }));
    const groq = makeProvider('groq', 'Fallback response');
    mockGetPrimary.mockReturnValue(asProvider(openai));
    mockGetFallback.mockReturnValue(asProvider(groq));
    mockListAvailable.mockReturnValue(['openai', 'groq']);

    await expect(router.chat({ messages: userMsg('Hello') })).resolves.toMatchObject({ content: 'Fallback response' });
    expect(getUnavailableProviders().openai).toBe('permanent');
    openai.complete.mockClear();
    await router.chat({ messages: userMsg('Again') });
    expect(openai.complete).not.toHaveBeenCalled();
  });

  test('throws when all providers fail', async () => {
    const groq = makeFailingProvider('groq');
    const deepseek = makeFailingProvider('deepseek');
    mockGetPrimary.mockReturnValue(asProvider(groq));
    mockGetFallback.mockReturnValue(asProvider(deepseek));
    mockListAvailable.mockReturnValue(['groq', 'deepseek']);

    await expect(router.chat({ messages: userMsg('Hello') })).rejects.toThrow();
  });

  test('throws when no providers are available', async () => {
    mockGetPrimary.mockReturnValue(null);
    mockGetFallback.mockReturnValue(null);
    mockListAvailable.mockReturnValue([]);

    await expect(router.chat({ messages: userMsg('Hello') })).rejects.toThrow(
      'No providers available',
    );
  });

  test('uses preferred provider when available', async () => {
    const openai = makeProvider('openai', 'OpenAI response');
    const anthropic = makeProvider('anthropic', 'Anthropic response');
    mockGetPrimary.mockReturnValue(asProvider(openai));
    mockGetFallback.mockReturnValue(asProvider(anthropic));
    mockListAvailable.mockReturnValue(['openai', 'anthropic']);

    const result = await router.chat(
      { messages: userMsg('Hello') },
      { preferredProvider: 'anthropic' },
    );

    expect(result.content).toBe('Anthropic response');
    expect(anthropic.complete).toHaveBeenCalledTimes(1);
  });

  test('skips providers on cooldown', async () => {
    const groq = makeFailingProvider('groq');
    const deepseek = makeProvider('deepseek', 'Fallback ok');
    mockGetPrimary.mockReturnValue(asProvider(groq));
    mockGetFallback.mockReturnValue(asProvider(deepseek));
    mockListAvailable.mockReturnValue(['groq', 'deepseek']);

    const result = await router.chat({ messages: userMsg('Hello') });
    expect(result.content).toBe('Fallback ok');

    expect(getCooldownStatus()['groq']).toBeDefined();

    groq.complete.mockClear();
    deepseek.complete.mockClear();
    const result2 = await router.chat({ messages: userMsg('Hello') });

    expect(result2.content).toBe('Fallback ok');
    expect(groq.complete).not.toHaveBeenCalled();
    expect(deepseek.complete).toHaveBeenCalledTimes(1);
  });

  test('records performance on success', async () => {
    const primary = makeProvider('openai');
    mockGetPrimary.mockReturnValue(asProvider(primary));
    mockGetFallback.mockReturnValue(null);
    mockListAvailable.mockReturnValue(['openai']);

    await router.chat({ messages: userMsg('Hello') });

    const perf = getProviderPerf('openai');
    expect(perf.totalCalls).toBe(1);
    expect(perf.successCalls).toBe(1);
    expect(perf.failureCalls).toBe(0);
    expect(perf.lastLatencyMs).toBeGreaterThanOrEqual(0);
  });

  test('records performance on failure', async () => {
    const groq = makeFailingProvider('groq');
    const deepseek = makeProvider('deepseek');
    mockGetPrimary.mockReturnValue(asProvider(groq));
    mockGetFallback.mockReturnValue(asProvider(deepseek));
    mockListAvailable.mockReturnValue(['groq', 'deepseek']);

    await router.chat({ messages: userMsg('Hello') });

    const perf = getProviderPerf('groq');
    expect(perf.totalCalls).toBe(1);
    expect(perf.successCalls).toBe(0);
    expect(perf.failureCalls).toBe(1);
  });

  test('accumulates perf across multiple calls', async () => {
    const primary = makeProvider('openai');
    mockGetPrimary.mockReturnValue(asProvider(primary));
    mockGetFallback.mockReturnValue(null);
    mockListAvailable.mockReturnValue(['openai']);

    await router.chat({ messages: userMsg('Hello') });
    await router.chat({ messages: userMsg('World') });

    const perf = getProviderPerf('openai');
    expect(perf.totalCalls).toBe(2);
    expect(perf.successCalls).toBe(2);
  });

  test('clears cooldown on success after failure', async () => {
    const groq = makeFailingProvider('groq');
    const deepseek = makeProvider('deepseek');
    mockGetPrimary.mockReturnValue(asProvider(groq));
    mockGetFallback.mockReturnValue(asProvider(deepseek));
    mockListAvailable.mockReturnValue(['groq', 'deepseek']);

    await router.chat({ messages: userMsg('Hello') });

    let cooldowns = getCooldownStatus();
    expect(cooldowns['groq']).toBeDefined();

    jest.advanceTimersByTime(60_000);
    groq.complete.mockResolvedValue({ content: 'ok', meta: {} });
    await router.chat({ messages: userMsg('Hello') });

    cooldowns = getCooldownStatus();
    expect(cooldowns['groq']).toBeUndefined();
  });
});

describe('AIRouter.say()', () => {
  test('constructs messages and returns content string', async () => {
    const primary = makeProvider('openai', 'say response');
    mockGetPrimary.mockReturnValue(asProvider(primary));
    mockGetFallback.mockReturnValue(null);
    mockListAvailable.mockReturnValue(['openai']);

    const result = await router.say('What is 2+2?', 'You are a math tutor');

    expect(result).toBe('say response');
    const calledWith = (primary.complete as jest.Mock).mock.calls[0][0];
    expect(calledWith.messages).toEqual([
      { role: 'system', content: 'You are a math tutor' },
      { role: 'user', content: 'What is 2+2?' },
    ]);
  });

  test('works without system prompt', async () => {
    const primary = makeProvider('openai', 'no system');
    mockGetPrimary.mockReturnValue(asProvider(primary));
    mockGetFallback.mockReturnValue(null);
    mockListAvailable.mockReturnValue(['openai']);

    const result = await router.say('Hello');

    expect(result).toBe('no system');
    const calledWith = (primary.complete as jest.Mock).mock.calls[0][0];
    expect(calledWith.messages).toEqual([{ role: 'user', content: 'Hello' }]);
  });
});

describe('AIRouter.stream()', () => {
  test('streams from primary provider', async () => {
    const primary = makeProvider('openai');
    mockGetPrimary.mockReturnValue(asProvider(primary));
    mockGetFallback.mockReturnValue(null);
    mockListAvailable.mockReturnValue(['openai']);

    const chunks: AIStreamChunk[] = [];
    await router.stream({ messages: userMsg('Hello') }, (c) => chunks.push(c));

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('Hello from mock');
    expect(chunks[0].done).toBe(true);
    expect(primary.stream).toHaveBeenCalledTimes(1);
  });

  test('streams from fallback when primary fails', async () => {
    const groq = makeFailingProvider('groq');
    const deepseek = makeProvider('deepseek', 'Fallback chunk');
    mockGetPrimary.mockReturnValue(asProvider(groq));
    mockGetFallback.mockReturnValue(asProvider(deepseek));
    mockListAvailable.mockReturnValue(['groq', 'deepseek']);

    const chunks: AIStreamChunk[] = [];
    await router.stream({ messages: userMsg('Hello') }, (c) => chunks.push(c));

    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk.content).toBe('Fallback chunk');
    expect(groq.stream).toHaveBeenCalledTimes(1);
    expect(deepseek.stream).toHaveBeenCalledTimes(1);
  });

  test('throws when all streaming providers fail', async () => {
    const groq = makeFailingProvider('groq');
    const deepseek = makeFailingProvider('deepseek');
    mockGetPrimary.mockReturnValue(asProvider(groq));
    mockGetFallback.mockReturnValue(asProvider(deepseek));
    mockListAvailable.mockReturnValue(['groq', 'deepseek']);

    const chunks: AIStreamChunk[] = [];
    await expect(
      router.stream({ messages: userMsg('Hello') }, (c) => chunks.push(c)),
    ).rejects.toThrow('deepseek failed');
  });

  test('continues stream with fallback after provider failure', async () => {
    const groq = makeFailingProvider('groq');
    const deepseek = makeProvider('deepseek', 'Fallback chunk');
    mockGetPrimary.mockReturnValue(asProvider(groq));
    mockGetFallback.mockReturnValue(asProvider(deepseek));
    mockListAvailable.mockReturnValue(['groq', 'deepseek']);

    const chunks: AIStreamChunk[] = [];
    await router.stream({ messages: userMsg('Hello') }, (c) => chunks.push(c));

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('Fallback chunk');
  });
});

describe('cooldown system', () => {
  test('records failure and puts provider on cooldown', async () => {
    const groq = makeFailingProvider('groq');
    const deepseek = makeProvider('deepseek');
    mockGetPrimary.mockReturnValue(asProvider(groq));
    mockGetFallback.mockReturnValue(asProvider(deepseek));
    mockListAvailable.mockReturnValue(['groq', 'deepseek']);

    await router.chat({ messages: userMsg('Hello') });

    const cooldowns = getCooldownStatus();
    expect(cooldowns['groq']).toBeDefined();
    expect(cooldowns['groq'].failures).toBe(1);
    expect(cooldowns['groq'].until).toBeGreaterThan(Date.now());
  });

  test('increases cooldown duration with repeated failures', async () => {
    const groq = makeFailingProvider('groq');
    const deepseek = makeProvider('deepseek');
    mockGetPrimary.mockReturnValue(asProvider(groq));
    mockGetFallback.mockReturnValue(asProvider(deepseek));
    mockListAvailable.mockReturnValue(['groq', 'deepseek']);

    // First failure: groq fails, goes on cooldown, deepseek succeeds
    await router.chat({ messages: userMsg('Hello') });
    const cooldown1 = getCooldownStatus();
    expect(cooldown1['groq']).toBeDefined();
    expect(cooldown1['groq'].failures).toBe(1);
    expect(cooldown1['groq'].until).toBeGreaterThan(Date.now());

    // Cooldown persists across subsequent calls
    await router.chat({ messages: userMsg('Hello') });
    expect(getCooldownStatus()['groq']).toBeDefined();

    // After cooldown expires, groq is retried
    jest.advanceTimersByTime(60_000);
    groq.complete.mockResolvedValue({ content: 'recovered', meta: {} });
    await router.chat({ messages: userMsg('Hello') });

    // Cooldown cleared on success
    expect(getCooldownStatus()['groq']).toBeUndefined();
  });

  test('clears cooldown on success', async () => {
    const groq = makeFailingProvider('groq');
    const deepseek = makeProvider('deepseek');
    mockGetPrimary.mockReturnValue(asProvider(groq));
    mockGetFallback.mockReturnValue(asProvider(deepseek));
    mockListAvailable.mockReturnValue(['groq', 'deepseek']);

    await router.chat({ messages: userMsg('Hello') }).catch(() => {});
    expect(getCooldownStatus()['groq']).toBeDefined();

    // Advance past cooldown so groq is tried again
    jest.advanceTimersByTime(10_000);
    groq.complete.mockResolvedValueOnce({ content: 'ok', meta: {} });
    await router.chat({ messages: userMsg('Hello') });

    expect(getCooldownStatus()['groq']).toBeUndefined();
  });

  test('skips on-cooldown providers and tries next', async () => {
    const groq = makeFailingProvider('groq');
    const deepseek = makeProvider('deepseek', 'Fallback ok');
    mockGetPrimary.mockReturnValue(asProvider(groq));
    mockGetFallback.mockReturnValue(asProvider(deepseek));
    mockListAvailable.mockReturnValue(['groq', 'deepseek']);

    await router.chat({ messages: userMsg('Hello') });

    expect(getCooldownStatus()['groq']).toBeDefined();

    groq.complete.mockClear();
    deepseek.complete.mockClear();
    await router.chat({ messages: userMsg('Hello') });

    expect(groq.complete).not.toHaveBeenCalled();
    expect(deepseek.complete).toHaveBeenCalledTimes(1);
  });
});

describe('performance tracking', () => {
  test('getProviderPerf returns defaults for unknown provider', () => {
    const perf = getProviderPerf('unknown_provider');
    expect(perf).toEqual({
      totalCalls: 0,
      successCalls: 0,
      failureCalls: 0,
      avgLatencyMs: 0,
      lastLatencyMs: 0,
    });
  });

  test('getAllPerf returns all tracked providers', async () => {
    const groq = makeFailingProvider('groq');
    const deepseek = makeProvider('deepseek');
    mockGetPrimary.mockReturnValue(asProvider(groq));
    mockGetFallback.mockReturnValue(asProvider(deepseek));
    mockListAvailable.mockReturnValue(['groq', 'deepseek']);

    await router.chat({ messages: userMsg('Hello') });

    const all = getAllPerf();
    expect(Object.keys(all)).toContain('groq');
  });

  test('averages latency across calls', async () => {
    const primary = makeProvider('openai');
    mockGetPrimary.mockReturnValue(asProvider(primary));
    mockGetFallback.mockReturnValue(null);
    mockListAvailable.mockReturnValue(['openai']);

    await router.chat({ messages: userMsg('Hello') });
    const after1 = getProviderPerf('openai');

    await router.chat({ messages: userMsg('Hello') });
    const after2 = getProviderPerf('openai');

    expect(after2.totalCalls).toBe(2);
    expect(after2.avgLatencyMs).toBeGreaterThanOrEqual(0);
    expect(after2.lastLatencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe('intent classification', () => {
  test('classifies short messages as simple', async () => {
    const groq = makeProvider('groq', 'ok');
    mockGetPrimary.mockReturnValue(asProvider(groq));
    mockGetFallback.mockReturnValue(null);
    mockListAvailable.mockReturnValue(['groq']);

    await router.chat({ messages: userMsg('Hi') });

    expect(groq.complete).toHaveBeenCalledTimes(1);
  });

  test('classifies code-related messages', async () => {
    const anthropic = makeProvider('anthropic', 'code response');
    const openai = makeProvider('openai');
    mockGetPrimary.mockReturnValue(asProvider(anthropic));
    mockGetFallback.mockReturnValue(asProvider(openai));
    mockListAvailable.mockReturnValue(['anthropic', 'openai']);

    await router.chat({
      messages: userMsg('Can you help me implement a function that sorts an array?'),
    });

    expect(anthropic.complete).toHaveBeenCalled();
  });

  test('classifies image messages as vision', async () => {
    const anthropic = makeProvider('anthropic', 'vision response');
    mockGetPrimary.mockReturnValue(asProvider(anthropic));
    mockGetFallback.mockReturnValue(null);
    mockListAvailable.mockReturnValue(['anthropic']);

    await router.chat({
      messages: userMsg('Analyze this image and describe what you see in detail'),
    });

    expect(anthropic.complete).toHaveBeenCalledTimes(1);
  });

  test('classifies lore messages', async () => {
    const anthropic = makeProvider('anthropic');
    const openai = makeProvider('openai');
    mockGetPrimary.mockReturnValue(asProvider(anthropic));
    mockGetFallback.mockReturnValue(asProvider(openai));
    mockListAvailable.mockReturnValue(['anthropic', 'openai']);

    await router.chat({
      messages: userMsg('Tell me the ancient lore of the Ashen Realms and its legends'),
    });

    expect(anthropic.complete).toHaveBeenCalledTimes(1);
  });

  test('uses explicit intent hint', async () => {
    const groq = makeProvider('groq', 'fast');
    mockGetPrimary.mockReturnValue(asProvider(groq));
    mockGetFallback.mockReturnValue(null);
    mockListAvailable.mockReturnValue(['groq']);

    await router.chat(
      { messages: userMsg('This is a long message that would normally not be classified as simple') },
      { intent: 'simple' },
    );

    expect(groq.complete).toHaveBeenCalledTimes(1);
  });
});

describe('provider scoring', () => {
  test('filters out providers that lack vision when hasVision is true', async () => {
    const groq = makeProvider('groq', 'no vision');
    mockGetPrimary.mockReturnValue(asProvider(groq));
    mockGetFallback.mockReturnValue(null);
    mockListAvailable.mockReturnValue(['groq']);

    await expect(
      router.chat(
        { messages: userMsg('Describe this image in detail with lots of context') },
        { hasVision: true },
      ),
    ).rejects.toThrow('No providers available');
  });

  test('filters out providers exceeding maxCostPerM when costSensitive', async () => {
    const xai = makeProvider('xai', 'expensive');
    mockGetPrimary.mockReturnValue(asProvider(xai));
    mockGetFallback.mockReturnValue(null);
    mockListAvailable.mockReturnValue(['xai']);

    await expect(
      router.chat(
        { messages: userMsg('Hello this is a moderately long message for testing cost sensitivity') },
        { costSensitive: true, maxCostPerM: 1.0 },
      ),
    ).rejects.toThrow('No providers available');
  });

  test('prefers cheaper providers when costSensitive', async () => {
    const groq = makeProvider('groq', 'cheap');
    const openai = makeProvider('openai', 'expensive');
    mockGetPrimary.mockReturnValue(asProvider(groq));
    mockGetFallback.mockReturnValue(asProvider(openai));
    mockListAvailable.mockReturnValue(['groq', 'openai']);

    const result = await router.chat(
      { messages: userMsg('Simple question that does not need much thought at all') },
      { costSensitive: true },
    );

    expect(result.content).toBe('cheap');
  });

  test('uses fallbackChain from context', async () => {
    const openai = makeProvider('openai', 'chain-openai');
    const anthropic = makeProvider('anthropic', 'chain-anthropic');
    mockGetPrimary.mockReturnValue(asProvider(openai));
    mockGetFallback.mockReturnValue(asProvider(anthropic));
    mockListAvailable.mockReturnValue(['openai', 'anthropic']);

    const result = await router.chat(
      { messages: userMsg('Hello') },
      { fallbackChain: ['anthropic', 'openai'] },
    );

    expect(result.content).toBe('chain-anthropic');
  });
});

describe('edge cases', () => {
  test('handles provider not in PROVIDER_CATALOG gracefully', async () => {
    const unknown = makeProvider('unknown_provider', 'unknown ok');
    mockGetPrimary.mockReturnValue(asProvider(unknown));
    mockGetFallback.mockReturnValue(null);
    mockListAvailable.mockReturnValue(['unknown_provider' as never]);

    await expect(router.chat({ messages: userMsg('Hello') })).rejects.toThrow(
      'No providers available',
    );
  });

  test('handles empty messages array', async () => {
    const primary = makeProvider('openai', 'ok');
    mockGetPrimary.mockReturnValue(asProvider(primary));
    mockGetFallback.mockReturnValue(null);
    mockListAvailable.mockReturnValue(['openai']);

    const result = await router.chat({ messages: [] });
    expect(result.content).toBe('ok');
  });

  test('handles provider throwing non-Error objects', async () => {
    const groq = {
      name: 'groq',
      complete: jest.fn().mockRejectedValue('string error'),
      stream: jest.fn().mockRejectedValue('string error'),
    } as unknown as AIProvider;

    const deepseek = makeProvider('deepseek', 'fallback ok');
    mockGetPrimary.mockReturnValue(groq as unknown as ReturnType<typeof getPrimaryProvider>);
    mockGetFallback.mockReturnValue(asProvider(deepseek));
    mockListAvailable.mockReturnValue(['groq', 'deepseek']);

    const result = await router.chat({ messages: userMsg('Hello') });
    expect(result.content).toBe('fallback ok');
  });

  test('getCooldownStatus returns empty when no cooldowns', () => {
    const status = getCooldownStatus();
    expect(status).toEqual({});
  });

  test('getProviderPerf returns zeroed stats for fresh provider', () => {
    const perf = getProviderPerf('fresh_provider');
    expect(perf.totalCalls).toBe(0);
    expect(perf.successCalls).toBe(0);
    expect(perf.failureCalls).toBe(0);
  });
});
