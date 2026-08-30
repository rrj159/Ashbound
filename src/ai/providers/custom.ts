/**
 * Custom OpenAI-compatible endpoint provider.
 *
 * Supports any OpenAI-compatible server:
 * - local Ollama
 * - llama.cpp
 * - LM Studio
 * - vLLM
 * - self-hosted servers
 * - FreeLLMAPI itself
 *
 * Configuration:
 *   CUSTOM_BASE_URL=http://localhost:8080/v1
 *   CUSTOM_API_KEY=optional
 *   CUSTOM_MODEL=auto
 *   CUSTOM_PROVIDER_NAME=My Custom Provider
 */
import { OpenAICompatProvider } from './openai-compat.js';

export class CustomEndpointProvider extends OpenAICompatProvider {
  constructor(apiKey?: string) {
    super({
      name: process.env.CUSTOM_PROVIDER_NAME ?? 'custom',
      baseUrl: process.env.CUSTOM_BASE_URL ?? 'http://localhost:8080',
      apiKeyEnv: 'CUSTOM_API_KEY',
      modelEnv: 'CUSTOM_MODEL',
      defaultModel: 'auto',
      defaultMaxTokens: 1024,
      defaultTemperature: 0.7,
      keyless: !process.env.CUSTOM_API_KEY,
      timeoutMs: parseInt(process.env.CUSTOM_TIMEOUT_MS ?? '120000', 10) || 120_000,
    }, apiKey);
  }
}
