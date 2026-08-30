/**
 * NVIDIA NIM provider — OpenAI-compatible endpoint.
 * Free tier available. Reasoning models may have slow cold starts (30-60s).
 */
import { OpenAICompatProvider } from './openai-compat.js';

export class NvidiaProvider extends OpenAICompatProvider {
  constructor(apiKey?: string) {
    super({
      name: 'nvidia',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      apiKeyEnv: 'NVIDIA_API_KEY',
      modelEnv: 'NVIDIA_MODEL',
      defaultModel: 'nvidia/llama-3.1-nemotron-70b-instruct',
      defaultMaxTokens: 1024,
      defaultTemperature: 0.7,
      timeoutMs: 180_000,
      forceSingleToolCall: true,
    }, apiKey);
  }
}