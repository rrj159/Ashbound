/**
 * Groq provider — OpenAI-compatible endpoint.
 * Fast inference, free tier available.
 */
import { OpenAICompatProvider } from './openai-compat.js';

export class GroqProvider extends OpenAICompatProvider {
  constructor(apiKey?: string) {
    super({
      name: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKeyEnv: 'GROQ_API_KEY',
      modelEnv: 'GROQ_MODEL',
      defaultModel: 'llama-3.1-8b-instant',
      defaultMaxTokens: 1024,
      defaultTemperature: 0.7,
    }, apiKey);
  }
}
