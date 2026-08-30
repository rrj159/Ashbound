/**
 * FreeLLMAPI provider adapter.
 *
 * FreeLLMAPI is an OpenAI-compatible gateway that aggregates free LLM
 * providers behind a single /v1 endpoint. It may be self-hosted or
 * pointed at a compatible deployment.
 *
 * Key differences from other providers:
 *   - API key is optional (keyless mode for self-hosted instances)
 *   - Base URL is fully configurable via FREELLMAPI_BASE_URL
 *   - Default model is "auto" (router picks the best available)
 */

import OpenAI, { type ClientOptions } from 'openai';
import type { AIProvider, AICompletionOptions, AIResponse, AIStreamChunk } from '../types.js';

/**
 * Normalize a base URL to ensure it ends with `/v1` exactly once.
 * Prevents accidental `/v1/v1` duplication when configurations vary.
 *
 * Handles:
 *   https://example.com         → https://example.com/v1
 *   https://example.com/        → https://example.com/v1
 *   https://example.com/v1      → https://example.com/v1
 *   https://example.com/v1/     → https://example.com/v1
 */
export function normalizeBaseUrl(url: string): string {
  let normalized = url.replace(/\/+$/, '');
  if (!normalized.endsWith('/v1')) {
    normalized += '/v1';
  }
  return normalized;
}

export class FreeLLMAPIProvider implements AIProvider {
  readonly name = 'freellmapi';
  private client: OpenAI;

  constructor(apiKey?: string, baseURL?: string) {
    // Explicit disable: FREELLMAPI_ENABLED=false
    const enabled = process.env.FREELLMAPI_ENABLED;
    if (enabled && enabled.toLowerCase() === 'false') {
      throw new Error('FreeLLMAPI is disabled (FREELLMAPI_ENABLED=false).');
    }

    const resolvedBaseUrl = baseURL ?? process.env.FREELLMAPI_BASE_URL;
    if (!resolvedBaseUrl) {
      throw new Error(
        'FreeLLMAPI requires FREELLMAPI_BASE_URL to be configured.',
      );
    }

    const normalizedUrl = normalizeBaseUrl(resolvedBaseUrl);
    const key = apiKey ?? process.env.FREELLMAPI_API_KEY;

    const clientOpts: ClientOptions = {
      baseURL: normalizedUrl,
      apiKey: key ?? '',
    };

    const timeoutMs = process.env.FREELLMAPI_TIMEOUT_MS;
    if (timeoutMs) {
      const parsed = parseInt(timeoutMs, 10);
      if (!isNaN(parsed) && parsed > 0) {
        clientOpts.timeout = parsed;
      }
    }

    this.client = new OpenAI(clientOpts);
  }

  async complete(opts: AICompletionOptions): Promise<AIResponse> {
    const model = opts.model ?? process.env.FREELLMAPI_MODEL ?? 'auto';
    const messages = opts.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const params: OpenAI.Chat.ChatCompletionCreateParams = {
      model,
      messages,
      max_tokens: opts.maxTokens || 1024,
      temperature: opts.temperature ?? 0.7,
      top_p: opts.topP ?? undefined,
      stop: opts.stop ?? undefined,
    };
    const c = await this.client.chat.completions.create(params);
    const choice = c.choices[0];
    return {
      content: choice.message.content ?? '',
      meta: { model, usage: c.usage, finishReason: choice.finish_reason },
    };
  }

  async stream(
    opts: AICompletionOptions,
    onChunk: (chunk: AIStreamChunk) => void,
    onDone?: (meta: Record<string, unknown>) => void,
  ): Promise<void> {
    const model = opts.model ?? process.env.FREELLMAPI_MODEL ?? 'auto';
    const messages = opts.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const params: OpenAI.Chat.ChatCompletionCreateParams = {
      model,
      messages,
      max_tokens: opts.maxTokens || 1024,
      temperature: opts.temperature ?? 0.7,
      top_p: opts.topP ?? undefined,
      stop: opts.stop ?? undefined,
      stream: true,
    };
    const s = await this.client.chat.completions.create(params);
    let fullMeta: Record<string, unknown> = {};
    let done = false;
    for await (const event of s) {
      const delta = event.choices[0]?.delta?.content ?? '';
      if (delta) onChunk({ content: delta, done: false });
      if (event.choices[0]?.finish_reason) {
        done = true;
        onChunk({ content: '', done: true });
        fullMeta = { model, finishReason: event.choices[0].finish_reason };
      }
    }
    if (!done) {
      onChunk({ content: '', done: true });
    }
    onDone?.(fullMeta);
  }
}
