/**
 * Reusable OpenAI-compatible provider adapter.
 *
 * Many LLM providers expose an OpenAI-compatible API with different base URLs,
 * authentication methods, and optional headers. This class provides a single
 * implementation that handles all of them through configuration.
 *
 * Covers: Groq, Cerebras, Mistral, DeepSeek, xAI, Cohere, OpenRouter,
 * GitHub Models, NVIDIA NIM, B.AI, AnyAPI, LongCat, iFlytek Spark,
 * Volcengine Ark, Baidu Qianfan, and custom OpenAI-compatible endpoints.
 */

import OpenAI, { type ClientOptions } from 'openai';
import type { AIProvider, AICompletionOptions, AIResponse, AIStreamChunk } from '../types.js';

export interface OpenAICompatOptions {
  /** Provider display name / identifier. */
  name: string;
  /** Base URL for the OpenAI-compatible API. */
  baseUrl: string;
  /** Environment variable for the API key. */
  apiKeyEnv: string;
  /** Environment variable for model override. */
  modelEnv?: string;
  /** Default model ID when none is configured. */
  defaultModel: string;
  /** Extra headers to send with every request. */
  extraHeaders?: Record<string, string>;
  /** Default max_tokens if not specified. */
  defaultMaxTokens?: number;
  /** Default temperature if not specified. */
  defaultTemperature?: number;
  /** Optional request timeout in ms. */
  timeoutMs?: number;
  /** Whether this provider works without an API key (keyless). */
  keyless?: boolean;
  /** Validate URL override (e.g. /models endpoint). */
  validateUrl?: string;
  /** Force parallel_tool_calls to false (e.g. NVIDIA NIM). */
  forceSingleToolCall?: boolean;
}

/**
 * Normalize a base URL to ensure it ends with `/v1` exactly once.
 */
export function normalizeBaseUrl(url: string): string {
  let normalized = url.replace(/\/+$/, '');
  if (!normalized.endsWith('/v1')) {
    normalized += '/v1';
  }
  return normalized;
}

export class OpenAICompatProvider implements AIProvider {
  readonly name: string;
  private client: OpenAI;
  private readonly opts: OpenAICompatOptions;

  constructor(config: OpenAICompatOptions, apiKey?: string) {
    this.name = config.name;
    this.opts = config;

    const resolvedKey = apiKey ?? process.env[config.apiKeyEnv];
    const normalizedUrl = normalizeBaseUrl(config.baseUrl);

    const clientOpts: ClientOptions = {
      baseURL: normalizedUrl,
      apiKey: resolvedKey ?? (config.keyless ? '' : undefined),
    };

    if (config.timeoutMs) {
      clientOpts.timeout = config.timeoutMs;
    }

    this.client = new OpenAI(clientOpts);
  }

  /** Resolve model: opts > env > default. */
  private resolveModel(model?: string): string {
    return model ?? (this.opts.modelEnv ? process.env[this.opts.modelEnv] : undefined) ?? this.opts.defaultModel;
  }

  async complete(opts: AICompletionOptions): Promise<AIResponse> {
    const model = this.resolveModel(opts.model);
    const messages = opts.messages.map((m) => ({ role: m.role, content: m.content }));

    const params: OpenAI.Chat.ChatCompletionCreateParams = {
      model,
      messages,
      max_tokens: opts.maxTokens || this.opts.defaultMaxTokens || 1024,
      temperature: opts.temperature ?? this.opts.defaultTemperature ?? 0.7,
      top_p: opts.topP ?? undefined,
      stop: opts.stop ?? undefined,
    };

    const c = await this.client.chat.completions.create(params);
    const choice = c.choices[0];
    return {
      content: choice.message.content ?? '',
      meta: { model: c.model, provider: this.name, usage: c.usage, finishReason: choice.finish_reason },
    };
  }

  async stream(
    opts: AICompletionOptions,
    onChunk: (chunk: AIStreamChunk) => void,
    onDone?: (meta: Record<string, unknown>) => void,
  ): Promise<void> {
    const model = this.resolveModel(opts.model);
    const messages = opts.messages.map((m) => ({ role: m.role, content: m.content }));

    const params: OpenAI.Chat.ChatCompletionCreateParams = {
      model,
      messages,
      max_tokens: opts.maxTokens || this.opts.defaultMaxTokens || 1024,
      temperature: opts.temperature ?? this.opts.defaultTemperature ?? 0.7,
      top_p: opts.topP ?? undefined,
      stop: opts.stop ?? undefined,
      stream: true,
    };

    const stream = await this.client.chat.completions.create(params);
    let fullMeta: Record<string, unknown> = {};
    let done = false;

    for await (const event of stream) {
      const delta = event.choices[0]?.delta?.content ?? '';
      if (delta) onChunk({ content: delta, done: false });
      if (event.choices[0]?.finish_reason) {
        done = true;
        fullMeta = { model: event.model, provider: this.name, finishReason: event.choices[0].finish_reason };
        onChunk({ content: '', done: true });
      }
    }

    if (!done) {
      onChunk({ content: '', done: true });
    }
    onDone?.(fullMeta);
  }
}