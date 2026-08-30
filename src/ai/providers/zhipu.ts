/**
 * Zhipu (Z.ai/GLM) provider — OpenAI-compatible endpoint.
 * Free tier: GLM-4-Flash available free.
 */
import { OpenAICompatProvider } from './openai-compat.js';

export class ZhipuProvider extends OpenAICompatProvider {
  constructor(apiKey?: string) {
    super({
      name: 'zhipu',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      apiKeyEnv: 'ZHIPU_API_KEY',
      modelEnv: 'ZHIPU_MODEL',
      defaultModel: 'glm-4-flash',
      defaultMaxTokens: 1024,
      defaultTemperature: 0.7,
    }, apiKey);
  }
}
