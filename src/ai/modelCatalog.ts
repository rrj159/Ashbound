/**
 * Model Catalog — static registry of provider/model capabilities.
 *
 * The router uses this to select providers based on requirements
 * (vision, streaming, tools, cost, etc.) without requiring runtime
 * model discovery. Safe local defaults; no external dependency.
 */

import type { ModelEntry } from './types.js';

export const MODEL_CATALOG: ModelEntry[] = [
  // Free Tier Providers (highest priority = lowest number)
  { provider: 'groq', modelId: 'llama-3.1-8b-instant', displayName: 'Llama 3.1 8B (Groq)', contextLength: 131072, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsDocuments: false, costPer1k: 0, freeTier: true, priority: 1 },
  { provider: 'groq', modelId: 'gemma2-9b-it', displayName: 'Gemma 2 9B (Groq)', contextLength: 8192, supportsStreaming: true, supportsTools: false, supportsVision: false, supportsDocuments: false, costPer1k: 0, freeTier: true, priority: 2 },
  { provider: 'cerebras', modelId: 'llama-3.3-70b', displayName: 'Llama 3.3 70B (Cerebras)', contextLength: 8192, supportsStreaming: true, supportsTools: false, supportsVision: false, supportsDocuments: false, costPer1k: 0, freeTier: true, priority: 3 },
  { provider: 'pollinations', modelId: 'openai', displayName: 'Pollinations Auto', contextLength: 32768, supportsStreaming: true, supportsTools: false, supportsVision: false, supportsDocuments: false, costPer1k: 0, freeTier: true, priority: 4 },
  { provider: 'gemini', modelId: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', contextLength: 1048576, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsDocuments: true, costPer1k: 0.000075, freeTier: true, priority: 5 },
  { provider: 'gemini', modelId: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', contextLength: 1048576, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsDocuments: true, costPer1k: 0.000075, freeTier: true, priority: 6 },
  { provider: 'nvidia', modelId: 'nvidia/llama-3.1-nemotron-70b-instruct', displayName: 'Nemotron 70B (NVIDIA)', contextLength: 131072, supportsStreaming: true, supportsTools: false, supportsVision: false, supportsDocuments: false, costPer1k: 0, freeTier: true, priority: 7 },
  { provider: 'github', modelId: 'gpt-4o-mini', displayName: 'GPT-4o Mini (GitHub)', contextLength: 128000, supportsStreaming: true, supportsTools: false, supportsVision: true, supportsDocuments: false, costPer1k: 0, freeTier: true, priority: 8 },
  { provider: 'huggingface', modelId: 'meta-llama/Llama-3.1-8B-Instruct', displayName: 'Llama 3.1 8B (HF)', contextLength: 131072, supportsStreaming: true, supportsTools: false, supportsVision: false, supportsDocuments: false, costPer1k: 0, freeTier: true, priority: 9 },
  { provider: 'openrouter', modelId: 'meta-llama/llama-3.1-8b-instruct:free', displayName: 'Llama 3.1 8B (OR Free)', contextLength: 131072, supportsStreaming: true, supportsTools: false, supportsVision: false, supportsDocuments: false, costPer1k: 0, freeTier: true, priority: 10 },
  { provider: 'cloudflare', modelId: '@cf/meta/llama-3.1-8b-instruct', displayName: 'Llama 3.1 8B (CF)', contextLength: 131072, supportsStreaming: true, supportsTools: false, supportsVision: false, supportsDocuments: false, costPer1k: 0, freeTier: true, priority: 12 },
  { provider: 'zhipu', modelId: 'glm-4-flash', displayName: 'GLM-4 Flash (Zhipu)', contextLength: 128000, supportsStreaming: true, supportsTools: false, supportsVision: false, supportsDocuments: false, costPer1k: 0, freeTier: true, priority: 13 },
  { provider: 'ollama', modelId: 'llama3.1', displayName: 'Llama 3.1 (Ollama Local)', contextLength: 131072, supportsStreaming: true, supportsTools: false, supportsVision: false, supportsDocuments: false, costPer1k: 0, freeTier: true, priority: 14 },
  // Paid / Credit-Dependent Providers
  { provider: 'openai', modelId: 'gpt-4o-mini', displayName: 'GPT-4o Mini', contextLength: 128000, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsDocuments: false, costPer1k: 0.00015, freeTier: false, priority: 20 },
  { provider: 'openai', modelId: 'gpt-4o', displayName: 'GPT-4o', contextLength: 128000, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsDocuments: false, costPer1k: 0.0025, freeTier: false, priority: 21 },
  { provider: 'anthropic', modelId: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4', contextLength: 200000, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsDocuments: true, costPer1k: 0.003, freeTier: false, priority: 22 },
  { provider: 'anthropic', modelId: 'claude-haiku-3-5-20241022', displayName: 'Claude 3.5 Haiku', contextLength: 200000, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsDocuments: false, costPer1k: 0.0008, freeTier: false, priority: 23 },
  { provider: 'deepseek', modelId: 'deepseek-chat', displayName: 'DeepSeek Chat', contextLength: 65536, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsDocuments: false, costPer1k: 0.00007, freeTier: false, priority: 25 },
  { provider: 'mistral', modelId: 'mistral-small-latest', displayName: 'Mistral Small', contextLength: 32768, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsDocuments: false, costPer1k: 0.0001, freeTier: false, priority: 26 },
  { provider: 'cohere', modelId: 'command-a-03-2025', displayName: 'Command A', contextLength: 128000, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsDocuments: false, costPer1k: 0.0004, freeTier: false, priority: 27 },
  { provider: 'xai', modelId: 'grok-3-mini', displayName: 'Grok 3 Mini', contextLength: 131072, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsDocuments: false, costPer1k: 0.0003, freeTier: false, priority: 28 },
];

export function lookupModel(provider: string, modelId?: string): ModelEntry | undefined {
  if (!modelId) return MODEL_CATALOG.find((m) => m.provider === provider);
  return MODEL_CATALOG.find((m) => m.provider === provider && m.modelId === modelId);
}

export function getModelsForProvider(provider: string): ModelEntry[] {
  return MODEL_CATALOG.filter((m) => m.provider === provider);
}

export function getFreeModels(): ModelEntry[] {
  return MODEL_CATALOG.filter((m) => m.freeTier);
}

export function getVisionCapableProviders(): ModelEntry[] {
  return MODEL_CATALOG.filter((m) => m.supportsVision);
}

export function getToolCapableProviders(): ModelEntry[] {
  return MODEL_CATALOG.filter((m) => m.supportsTools);
}

export function getCatalogProviderNames(): string[] {
  return [...new Set(MODEL_CATALOG.map((m) => m.provider))];
}
