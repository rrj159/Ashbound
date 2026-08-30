/**
 * Mistral provider — OpenAI-compatible endpoint.
 */
import { OpenAICompatProvider } from './openai-compat.js';

export class MistralProvider extends OpenAICompatProvider {
  constructor(apiKey?: string) {
    super({
      name: 'mistral',
      baseUrl: 'https://api.mistral.ai/v1',
      apiKeyEnv: 'MISTRAL_API_KEY',
      modelEnv: 'MISTRAL_MODEL',
      defaultModel: 'mistral-small-latest',
      defaultMaxTokens: 1024,
      defaultTemperature: 0.8,
    }, apiKey);
  }
}
