/**
 * GitHub Models provider — OpenAI-compatible endpoint.
 * Free tier: 15 requests/minute, 150 requests/day.
 */
import { OpenAICompatProvider } from './openai-compat.js';

export class GitHubModelsProvider extends OpenAICompatProvider {
  constructor(apiKey?: string) {
    super({
      name: 'github',
      baseUrl: 'https://models.inference.ai.azure.com',
      apiKeyEnv: 'GITHUB_TOKEN',
      modelEnv: 'GITHUB_MODEL',
      defaultModel: 'gpt-4o-mini',
      defaultMaxTokens: 1024,
      defaultTemperature: 0.7,
    }, apiKey);
  }
}