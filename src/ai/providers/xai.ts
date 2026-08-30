/**
 * xAI (Grok) provider — OpenAI-compatible endpoint.
 */
import { OpenAICompatProvider } from './openai-compat.js';

export class XAIProvider extends OpenAICompatProvider {
  constructor(apiKey?: string) {
    super({
      name: 'xai',
      baseUrl: 'https://api.x.ai/v1',
      apiKeyEnv: 'XAI_API_KEY',
      modelEnv: 'XAI_MODEL',
      defaultModel: 'grok-3-mini',
      defaultMaxTokens: 1024,
      defaultTemperature: 0.7,
    }, apiKey);
  }
}
