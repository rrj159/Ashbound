/**
 * Pollinations — keyless, free, OpenAI-compatible endpoint.
 * No API key required. Uses community models.
 */
import { OpenAICompatProvider } from './openai-compat.js';

export class PollinationsProvider extends OpenAICompatProvider {
  constructor(apiKey?: string) {
    super({
      name: 'pollinations',
      baseUrl: 'https://text.pollinations.ai/openai',
      apiKeyEnv: 'POLLINATIONS_API_KEY',
      modelEnv: 'POLLINATIONS_MODEL',
      defaultModel: 'openai',
      defaultMaxTokens: 1024,
      defaultTemperature: 0.7,
      keyless: true,
      timeoutMs: 120_000,
    }, apiKey);
  }
}