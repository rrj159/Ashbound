/**
 * Cloudflare Workers AI provider — OpenAI-compatible endpoint.
 * Free tier: 10,000 neurons/day.
 */
import { OpenAICompatProvider } from './openai-compat.js';

export class CloudflareProvider extends OpenAICompatProvider {
  constructor(apiKey?: string) {
    super({
      name: 'cloudflare',
      baseUrl: 'https://api.cloudflare.com/client/v4/accounts',
      apiKeyEnv: 'CLOUDFLARE_API_TOKEN',
      modelEnv: 'CLOUDFLARE_MODEL',
      defaultModel: '@cf/meta/llama-3.1-8b-instruct',
      defaultMaxTokens: 1024,
      defaultTemperature: 0.7,
    }, apiKey);
  }
}