/**
 * OpenRouter provider — OpenAI-compatible gateway to hundreds of models.
 */
import { OpenAICompatProvider } from './openai-compat.js';

export class OpenRouterProvider extends OpenAICompatProvider {
  constructor(apiKey?: string) {
    super({
      name: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      modelEnv: 'OPENROUTER_MODEL',
      defaultModel: 'meta-llama/llama-3.1-8b-instruct:free',
      defaultMaxTokens: 1024,
      defaultTemperature: 0.8,
    }, apiKey);
  }
}
