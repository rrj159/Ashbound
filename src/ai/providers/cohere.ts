/**
 * Cohere adapter (OpenAI-compatible endpoint).
 */
import { OpenAICompatProvider } from './openai-compat.js';

export class CohereProvider extends OpenAICompatProvider {
  constructor(apiKey?: string) {
    super({
      name: 'cohere',
      baseUrl: 'https://api.cohere.com/compatibility/v1',
      apiKeyEnv: 'COHERE_API_KEY',
      modelEnv: 'COHERE_MODEL',
      defaultModel: 'command-a-03-2025',
      defaultMaxTokens: 1024,
      defaultTemperature: 0.7,
    }, apiKey);
  }
}
