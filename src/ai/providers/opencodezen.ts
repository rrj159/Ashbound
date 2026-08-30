/**
 * OpenCode Zen provider — OpenAI-compatible endpoint.
 * Free tier available.
 */
import { OpenAICompatProvider } from './openai-compat.js';

export class OpenCodeZenProvider extends OpenAICompatProvider {
  constructor(apiKey?: string) {
    super({
      name: 'opencodezen',
      baseUrl: 'https://api.openCodezen.com/v1',
      apiKeyEnv: 'OPENCODEZEN_API_KEY',
      modelEnv: 'OPENCODEZEN_MODEL',
      defaultModel: 'auto',
      defaultMaxTokens: 1024,
      defaultTemperature: 0.7,
    }, apiKey);
  }
}
