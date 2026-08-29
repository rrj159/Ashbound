/**
 * Provider registry safety tests.
 * Verifies the registry does not crash on edge cases that caused the
 * production Wispbyte crash.
 */

// Clear all env vars and reset provider state before each test
beforeEach(async () => {
  const { _resetProviderState } = await import('../providers/index.js');
  _resetProviderState();
  delete process.env.AI_PROVIDER;
  delete process.env.AI_FALLBACK;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.MISTRAL_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.XAI_API_KEY;
  delete process.env.COHERE_API_KEY;
});

describe('Provider Registry Safety', () => {
  it('initProviders() does not crash when AI_PROVIDER is empty string', async () => {
    process.env.AI_PROVIDER = '';
    const { initProviders, getPrimaryProvider, listAvailableProviders } = await import('../providers/index.js');
    expect(() => initProviders()).not.toThrow();
    expect(getPrimaryProvider()).toBeNull();
    expect(listAvailableProviders()).toEqual([]);
  });

  it('initProviders() does not crash when AI_PROVIDER is undefined', async () => {
    delete process.env.AI_PROVIDER;
    const { initProviders, getPrimaryProvider } = await import('../providers/index.js');
    expect(() => initProviders()).not.toThrow();
    expect(getPrimaryProvider()).toBeNull();
  });

  it('initProviders() does not crash when AI_FALLBACK is empty string', async () => {
    process.env.AI_FALLBACK = '';
    const { initProviders } = await import('../providers/index.js');
    expect(() => initProviders()).not.toThrow();
  });

  it('initProviders() does not crash when AI_FALLBACK is invalid name', async () => {
    process.env.AI_FALLBACK = 'nonexistent_provider';
    const { initProviders } = await import('../providers/index.js');
    expect(() => initProviders()).not.toThrow();
  });

  it('initProviders() does not crash when AI_PROVIDER is an invalid name', async () => {
    process.env.AI_PROVIDER = 'nonexistent_provider';
    const { initProviders, getPrimaryProvider } = await import('../providers/index.js');
    expect(() => initProviders()).not.toThrow();
    expect(getPrimaryProvider()).toBeNull();
  });

  it('initProviders() selects available provider when primary is unconfigured', async () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.GROQ_API_KEY = 'test-key';
    const { initProviders, getPrimaryProvider, listAvailableProviders } = await import('../providers/index.js');
    initProviders();
    expect(listAvailableProviders()).toContain('groq');
  });

  it('initProviders() returns empty list when no API keys set', async () => {
    const { initProviders, listAvailableProviders } = await import('../providers/index.js');
    initProviders();
    expect(listAvailableProviders()).toEqual([]);
  });

  it('getPrimaryProvider() returns null when none configured', async () => {
    const { initProviders, getPrimaryProvider } = await import('../providers/index.js');
    initProviders();
    expect(getPrimaryProvider()).toBeNull();
  });

  it('getFallbackProvider() returns null when none configured', async () => {
    const { initProviders, getFallbackProvider } = await import('../providers/index.js');
    initProviders();
    expect(getFallbackProvider()).toBeNull();
  });
});

describe('Config Safety', () => {
  it('loadConfig() throws on missing DISCORD_TOKEN', async () => {
    delete process.env.DISCORD_TOKEN;
    process.env.DISCORD_CLIENT_ID = 'test';
    const { loadConfig } = await import('../../config/config.js');
    expect(() => loadConfig()).toThrow('Missing required environment variable: DISCORD_TOKEN');
  });

  it('loadConfig() throws on missing DISCORD_CLIENT_ID', async () => {
    process.env.DISCORD_TOKEN = 'test';
    delete process.env.DISCORD_CLIENT_ID;
    const { loadConfig } = await import('../../config/config.js');
    expect(() => loadConfig()).toThrow('Missing required environment variable: DISCORD_CLIENT_ID');
  });

  it('loadConfig() succeeds with only required vars', async () => {
    process.env.DISCORD_TOKEN = 'test-token';
    process.env.DISCORD_CLIENT_ID = 'test-client';
    const { loadConfig } = await import('../../config/config.js');
    const config = loadConfig();
    expect(config.discord.token).toBe('test-token');
    expect(config.discord.clientId).toBe('test-client');
    expect(config.ai.primaryProvider).toBe('openai');
    expect(config.ai.fallbackProvider).toBeNull();
  });

  it('loadConfig() handles empty AI_PROVIDER gracefully', async () => {
    process.env.DISCORD_TOKEN = 'test-token';
    process.env.DISCORD_CLIENT_ID = 'test-client';
    process.env.AI_PROVIDER = '';
    const { loadConfig } = await import('../../config/config.js');
    const config = loadConfig();
    expect(config.ai.primaryProvider).toBe('openai');
  });

  it('loadConfig() stores provider API keys in config', async () => {
    process.env.DISCORD_TOKEN = 'test-token';
    process.env.DISCORD_CLIENT_ID = 'test-client';
    process.env.OPENAI_API_KEY = 'sk-test-key';
    const { loadConfig } = await import('../../config/config.js');
    const config = loadConfig();
    expect(config.ai.providers.openai?.apiKey).toBe('sk-test-key');
  });
});
