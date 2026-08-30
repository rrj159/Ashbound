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
  delete process.env.FREELLMAPI_ENABLED;
  delete process.env.FREELLMAPI_BASE_URL;
  delete process.env.FREELLMAPI_API_KEY;
});

describe('Provider Registry Safety', () => {
  it('initProviders() does not crash when AI_PROVIDER is empty string', async () => {
    process.env.AI_PROVIDER = '';
    const { initProviders, getPrimaryProvider, listAvailableProviders } = await import('../providers/index.js');
    expect(() => initProviders()).not.toThrow();
    // Pollinations and Ollama are keyless, always available
    expect(listAvailableProviders()).toContain('pollinations');
    expect(listAvailableProviders()).toContain('ollama');
  });

  it('initProviders() does not crash when AI_PROVIDER is undefined', async () => {
    delete process.env.AI_PROVIDER;
    const { initProviders, getPrimaryProvider } = await import('../providers/index.js');
    expect(() => initProviders()).not.toThrow();
    // Pollinations is keyless, always available as primary
    expect(getPrimaryProvider()).not.toBeNull();
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
    // Pollinations is keyless, auto-selected as fallback
    expect(getPrimaryProvider()).not.toBeNull();
  });

  it('initProviders() selects available provider when primary is unconfigured', async () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.GROQ_API_KEY = 'test-key';
    const { initProviders, getPrimaryProvider, listAvailableProviders } = await import('../providers/index.js');
    initProviders();
    expect(listAvailableProviders()).toContain('groq');
  });

  it('initProviders() returns keyless providers when no API keys set', async () => {
    const { initProviders, listAvailableProviders } = await import('../providers/index.js');
    initProviders();
    // Pollinations and Ollama are keyless, always available
    expect(listAvailableProviders()).toContain('pollinations');
    expect(listAvailableProviders()).toContain('ollama');
  });

  it('getPrimaryProvider() returns keyless provider when none configured', async () => {
    const { initProviders, getPrimaryProvider } = await import('../providers/index.js');
    initProviders();
    // Pollinations is keyless, auto-selected
    expect(getPrimaryProvider()).not.toBeNull();
    expect(getPrimaryProvider()!.name).toBe('pollinations');
  });

  it('getFallbackProvider() returns null when none configured', async () => {
    const { initProviders, getFallbackProvider } = await import('../providers/index.js');
    initProviders();
    expect(getFallbackProvider()).toBeNull();
  });
});

describe('FreeLLMAPI Provider Registry', () => {
  it('initProviders() recognizes freellmapi when FREELLMAPI_BASE_URL is set', async () => {
    process.env.FREELLMAPI_BASE_URL = 'https://freellmapi.example.com';
    const { initProviders, getPrimaryProvider, listAvailableProviders } = await import('../providers/index.js');
    initProviders();
    expect(listAvailableProviders()).toContain('freellmapi');
  });

  it('initProviders() selects freellmapi as primary when AI_PROVIDER=freellmapi', async () => {
    process.env.AI_PROVIDER = 'freellmapi';
    process.env.FREELLMAPI_BASE_URL = 'https://freellmapi.example.com';
    const { initProviders, getPrimaryProvider } = await import('../providers/index.js');
    initProviders();
    const primary = getPrimaryProvider();
    expect(primary).not.toBeNull();
    expect(primary!.name).toBe('freellmapi');
  });

  it('initProviders() does not list freellmapi when BASE_URL is missing', async () => {
    const { initProviders, listAvailableProviders } = await import('../providers/index.js');
    initProviders();
    expect(listAvailableProviders()).not.toContain('freellmapi');
  });

  it('initProviders() does not crash when FREELLMAPI_ENABLED=false', async () => {
    process.env.FREELLMAPI_BASE_URL = 'https://freellmapi.example.com';
    process.env.FREELLMAPI_ENABLED = 'false';
    const { initProviders, getPrimaryProvider, listAvailableProviders } = await import('../providers/index.js');
    // isConfigured passes (BASE_URL set) but factory throws -> warning, no crash
    expect(() => initProviders()).not.toThrow();
    expect(listAvailableProviders()).toContain('freellmapi');
    // Primary is null because instantiation failed
    expect(getPrimaryProvider()).toBeNull();
  });

  it('getProvider() returns freellmapi instance', async () => {
    process.env.FREELLMAPI_BASE_URL = 'https://freellmapi.example.com';
    const { initProviders, getProvider } = await import('../providers/index.js');
    initProviders();
    const p = getProvider('freellmapi');
    expect(p).not.toBeNull();
    expect(p!.name).toBe('freellmapi');
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

  it('loadConfig() includes freellmapi when env vars set', async () => {
    process.env.DISCORD_TOKEN = 'test-token';
    process.env.DISCORD_CLIENT_ID = 'test-client';
    process.env.FREELLMAPI_API_KEY = 'flm-test-key';
    process.env.FREELLMAPI_MODEL = 'auto';
    const { loadConfig } = await import('../../config/config.js');
    const config = loadConfig();
    expect(config.ai.providers.freellmapi).toBeDefined();
    expect(config.ai.providers.freellmapi?.apiKey).toBe('flm-test-key');
    expect(config.ai.providers.freellmapi?.model).toBe('auto');
  });
});
