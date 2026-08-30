/**
 * DeepSeek provider — OpenAI-compatible endpoint.
 */
import { OpenAICompatProvider } from './openai-compat.js';

export class DeepSeekProvider extends OpenAICompatProvider {
  constructor(apiKey?: string) {
    super({
      name: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      modelEnv: 'DEEPSEEK_MODEL',
      defaultModel: 'deepseek-chat',
      defaultMaxTokens: 1024,
      defaultTemperature: 0.7,
    }, apiKey);
  }
}
