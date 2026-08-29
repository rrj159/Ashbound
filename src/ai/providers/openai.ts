/**
 * OpenAI provider adapter.
 * Uses the official openai package — supports gpt-4o, gpt-4o-mini, gpt-3.5-turbo, etc.
 */

import OpenAI from 'openai';
import type { AIProvider, AICompletionOptions, AIResponse, AIStreamChunk } from '../types.js';

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({ apiKey: apiKey ?? process.env.OPENAI_API_KEY });
  }

  async complete(opts: AICompletionOptions): Promise<AIResponse> {
    const model = opts.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const messages = opts.messages.map((m) => ({ role: m.role, content: m.content }));

    const params: OpenAI.Chat.ChatCompletionCreateParams = {
      model,
      messages,
      max_tokens: opts.maxTokens || undefined,
      temperature: opts.temperature ?? 0.8,
      top_p: opts.topP ?? undefined,
      stop: opts.stop ?? undefined,
    };

    const completion = await this.client.chat.completions.create(params);

    const choice = completion.choices[0];
    return {
      content: choice.message.content ?? '',
      meta: {
        model: completion.model,
        usage: completion.usage,
        finishReason: choice.finish_reason,
      },
    };
  }

  async stream(
    opts: AICompletionOptions,
    onChunk: (chunk: AIStreamChunk) => void,
    onDone?: (meta: Record<string, unknown>) => void,
  ): Promise<void> {
    const model = opts.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const messages = opts.messages.map((m) => ({ role: m.role, content: m.content }));

    const params: OpenAI.Chat.ChatCompletionCreateParams = {
      model,
      messages,
      max_tokens: opts.maxTokens || undefined,
      temperature: opts.temperature ?? 0.8,
      top_p: opts.topP ?? undefined,
      stop: opts.stop ?? undefined,
      stream: true,
    };

    const stream = await this.client.chat.completions.create(params);
    let done = false;
    let fullMeta: Record<string, unknown> = {};

    for await (const event of stream) {
      const delta = event.choices[0]?.delta?.content ?? '';
      if (delta) {
        onChunk({ content: delta, done: false });
      }
      if (event.choices[0]?.finish_reason) {
        done = true;
        fullMeta = {
          model: event.model,
          finishReason: event.choices[0].finish_reason,
        };
        onChunk({ content: '', done: true });
      }
    }

    onDone?.(fullMeta);
  }
}
