/**
 * Configuration: Centralized configuration system.
 * Single source of truth for all configuration values.
 * Validates at startup and fails fast on missing required config.
 */

export interface DiscordConfig {
  token: string;
  clientId: string;
  guildId: string | null;
}

export interface AIConfig {
  primaryProvider: string;
  fallbackProvider: string | null;
  providers: Record<string, { apiKey?: string; model?: string }>;
}

export interface WebConfig {
  port: number;
}

export interface SecurityConfig {
  rateLimitMaxRequests: number;
  rateLimitWindowMs: number;
  maxMessageLength: number;
  maxFileSize: number;
}

export interface AppConfig {
  discord: DiscordConfig;
  ai: AIConfig;
  web: WebConfig;
  security: SecurityConfig;
  logLevel: string;
  isDevelopment: boolean;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

function optionalEnvInt(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Load and validate configuration from environment variables.
 * Fails fast on missing required variables.
 */
export function loadConfig(): AppConfig {
  // Required
  const discordToken = requireEnv('DISCORD_TOKEN');
  const discordClientId = requireEnv('DISCORD_CLIENT_ID');

  // Optional Discord
  const guildId = process.env.DISCORD_GUILD_ID || null;

  // AI
  const primaryProvider = process.env.AI_PROVIDER || 'openai';
  const fallbackProvider = process.env.AI_FALLBACK && process.env.AI_FALLBACK !== 'none'
    ? process.env.AI_FALLBACK
    : null;

  const aiProviders: Record<string, { apiKey?: string; model?: string }> = {};
  const providerEnvVars: Record<string, { apiKey: string; model: string }> = {
    openai: { apiKey: 'OPENAI_API_KEY', model: 'OPENAI_MODEL' },
    anthropic: { apiKey: 'ANTHROPIC_API_KEY', model: 'ANTHROPIC_MODEL' },
    gemini: { apiKey: 'GEMINI_API_KEY', model: 'GEMINI_MODEL' },
    groq: { apiKey: 'GROQ_API_KEY', model: 'GROQ_MODEL' },
    mistral: { apiKey: 'MISTRAL_API_KEY', model: 'MISTRAL_MODEL' },
    deepseek: { apiKey: 'DEEPSEEK_API_KEY', model: 'DEEPSEEK_MODEL' },
    openrouter: { apiKey: 'OPENROUTER_API_KEY', model: 'OPENROUTER_MODEL' },
    xai: { apiKey: 'XAI_API_KEY', model: 'XAI_MODEL' },
    cohere: { apiKey: 'COHERE_API_KEY', model: 'COHERE_MODEL' },
  };

  for (const [name, envVars] of Object.entries(providerEnvVars)) {
    const apiKey = process.env[envVars.apiKey];
    const model = process.env[envVars.model];
    if (apiKey || model) {
      aiProviders[name] = { apiKey, model };
    }
  }

  // Web
  const port = optionalEnvInt('PORT', optionalEnvInt('WEB_PORT', 3000));

  // Security
  const rateLimitMaxRequests = optionalEnvInt('RATE_LIMIT_MAX', 10);
  const rateLimitWindowMs = optionalEnvInt('RATE_LIMIT_WINDOW_MS', 30_000);
  const maxMessageLength = optionalEnvInt('MAX_MESSAGE_LENGTH', 4000);
  const maxFileSize = optionalEnvInt('MAX_FILE_SIZE', 10 * 1024 * 1024);

  // Logging
  const logLevel = process.env.LOG_LEVEL || 'info';
  const isDevelopment = (process.env.NODE_ENV || 'development') === 'development';

  return {
    discord: {
      token: discordToken,
      clientId: discordClientId,
      guildId,
    },
    ai: {
      primaryProvider,
      fallbackProvider,
      providers: aiProviders,
    },
    web: { port },
    security: {
      rateLimitMaxRequests,
      rateLimitWindowMs,
      maxMessageLength,
      maxFileSize,
    },
    logLevel,
    isDevelopment,
  };
}

let _config: AppConfig | null = null;

/**
 * Get the loaded configuration.
 * Must call loadConfig() first during startup.
 */
export function getConfig(): AppConfig {
  if (!_config) {
    throw new Error('Configuration not loaded. Call loadConfig() first.');
  }
  return _config;
}

/**
 * Initialize configuration (called once at startup).
 */
export function initConfig(): AppConfig {
  _config = loadConfig();
  return _config;
}
