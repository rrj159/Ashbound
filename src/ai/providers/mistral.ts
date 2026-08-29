/**
 * Mistral provider adapter.
 * Mistral provides an OpenAI-compatible endpoint — uses openai SDK with custom base URL.
 */

import OpenAI from 'openai';
import type { AIProvider, AICompletionOptions, AIResponse, AIStreamChunk } from '../types.js';

export class MistralProvider implements AIProvider {
  readonly name = 'mistral';
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({ apiKey: apiKey ?? process.env.MISTRAL_API_KEY, baseURL: 'https://api.mistral.ai/v1' });
  }

  async complete(opts: AICompletionOptions): Promise<AIResponse> {
    const model = opts.model ?? process.env.MISTRAL_MODEL ?? 'mistral-large-latest';
    const messages = opts.messages.map((m) => ({ role: m.role, content: m.content }));
    const params: OpenAI.Chat.ChatCompletionCreateParams = { model, messages, max_tokens: opts.maxTokens || 1024, temperature: opts.temperature ?? 0.8, stop: opts.stop ?? undefined };
    const c = await this.client.chat.completions.create(params);
    const choice = c.choices[0];
    return { content: choice.message.content ?? '', meta: { model, usage: c.usage, finishReason: choice.finish_reason } };
  }

  async stream(opts: AICompletionOptions, onChunk: (chunk: AIStreamChunk) => void, onDone?: (meta: Record<string, unknown>) => void): Promise<void> {
    const model = opts.model ?? process.env.MISTRAL_MODEL ?? 'mistral-large-latest';
    const messages = opts.messages.map((m) => ({ role: m.role, content: m.content }));
    const params: OpenAI.Chat.ChatCompletionCreateParams = { model, messages, max_tokens: opts.maxTokens || 1024, temperature: opts.temperature ?? 0.8, stop: opts.stop ?? undefined, stream: true };
    const s = await this.client.chat.completions.create(params);
    let fullMeta: Record<string, unknown> = {};
    for await (const event of s) {
      const delta = event.choices[0]?.delta?.content ?? '';
      if (delta) onChunk({ content: delta, done: false });
      if (event.choices[0]?.finish_reason) { onChunk({ content: '', done: true }); fullMeta = { model, finishReason: event.choices[0].finish_reason }; }
    }
    onDone?.(fullMeta);
  }
}
