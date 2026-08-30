/**
 * Cerebras provider — OpenAI-compatible endpoint.
 * Fast inference with free tier.
 */
import { OpenAICompatProvider } from './openai-compat.js';

export class CerebrasProvider extends OpenAICompatProvider {
  constructor(apiKey?: string) {
    super({
      name: 'cerebras',
      baseUrl: 'https://api.cerebras.ai/v1',
      apiKeyEnv: 'CEREBRAS_API_KEY',
      modelEnv: 'CEREBRAS_MODEL',
      defaultModel: 'llama-3.3-70b',
      defaultMaxTokens: 1024,
      defaultTemperature: 0.7,
    }, apiKey);
  }
}