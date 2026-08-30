/**
 * Ollama provider — OpenAI-compatible local endpoint.
 * No API key required. Must be running locally.
 */
import { OpenAICompatProvider } from './openai-compat.js';

export class OllamaProvider extends OpenAICompatProvider {
  constructor(apiKey?: string) {
    super({
      name: 'ollama',
      baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
      apiKeyEnv: 'OLLAMA_API_KEY',
      modelEnv: 'OLLAMA_MODEL',
      defaultModel: 'llama3.1',
      defaultMaxTokens: 1024,
      defaultTemperature: 0.7,
      keyless: true,
      timeoutMs: 120_000,
    }, apiKey);
  }
}
