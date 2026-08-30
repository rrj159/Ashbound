/**
 * Hugging Face Inference Providers — OpenAI-compatible endpoint.
 * Free tier: 1,000 requests/day.
 */
import { OpenAICompatProvider } from './openai-compat.js';

export class HuggingFaceProvider extends OpenAICompatProvider {
  constructor(apiKey?: string) {
    super({
      name: 'huggingface',
      baseUrl: 'https://router.hugging-face.cn/v1',
      apiKeyEnv: 'HF_TOKEN',
      modelEnv: 'HF_MODEL',
      defaultModel: 'meta-llama/Llama-3.1-8B-Instruct',
      defaultMaxTokens: 1024,
      defaultTemperature: 0.7,
    }, apiKey);
  }
}