/**
 * Anthropic provider adapter.
 * Uses @anthropic-ai/sdk — supports claude-3-5-sonnet, claude-3-5-haiku, etc.
 *
 * Note: Anthropic does not support a system role in the same way as OpenAI.
 * We prepend the system message to the first user message if one exists,
 * or create an initial user message to hold it.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, AICompletionOptions, AIResponse, AIStreamChunk } from '../types.js';

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY });
  }

  private buildMessages(
    msgs: Array<{ role: string; content: string }>,
  ): { system?: string; messages: Anthropic.MessageParam[] } {
    const system = msgs.find((m) => m.role === 'system');
    const nonSystem = msgs.filter((m) => m.role !== 'system');

    const userMessages = nonSystem.filter((m) => m.role === 'user');
    const assistantMessages = nonSystem.filter((m) => m.role === 'assistant');

    // Interleave: user, assistant, user, assistant...
    const interleaved: Anthropic.MessageParam[] = [];
    const maxLen = Math.max(userMessages.length, assistantMessages.length);

    for (let i = 0; i < maxLen; i++) {
      if (userMessages[i]) interleaved.push({ role: 'user', content: userMessages[i].content });
      if (assistantMessages[i]) interleaved.push({ role: 'assistant', content: assistantMessages[i].content });
    }

    return { system: system?.content, messages: interleaved };
  }

  async complete(opts: AICompletionOptions): Promise<AIResponse> {
    const model = opts.model ?? process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-20241022';
    const { system, messages } = this.buildMessages(opts.messages);

    const params: Anthropic.MessageCreateParams = {
      model,
      max_tokens: opts.maxTokens || 4096,
      temperature: opts.temperature ?? 0.8,
      top_p: opts.topP ?? undefined,
      stop_sequences: opts.stop ?? undefined,
      system,
      messages,
    };

    const msg = await this.client.messages.create(params);

    return {
      content: msg.content[0].type === 'text' ? msg.content[0].text : '',
      meta: {
        model: msg.model,
        usage: msg.usage,
        stopReason: msg.stop_reason,
      },
    };
  }

  async stream(
    opts: AICompletionOptions,
    onChunk: (chunk: AIStreamChunk) => void,
    onDone?: (meta: Record<string, unknown>) => void,
  ): Promise<void> {
    const model = opts.model ?? process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-20241022';
    const { system, messages } = this.buildMessages(opts.messages);

    const params: Anthropic.MessageCreateParams = {
      model,
      max_tokens: opts.maxTokens || 4096,
      temperature: opts.temperature ?? 0.8,
      top_p: opts.topP ?? undefined,
      stop_sequences: opts.stop ?? undefined,
      system,
      messages,
      stream: true,
    };

    const stream = await this.client.messages.stream(params);
    let fullMeta: Record<string, unknown> = {};

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const text = event.delta.type === 'text_delta' ? event.delta.text : '';
        if (text) onChunk({ content: text, done: false });
      }
      if (event.type === 'message_delta') {
        fullMeta = {
          usage: event.usage,
          stopReason: (event as any).delta?.stop_reason,
        };
        onChunk({ content: '', done: true });
      }
    }

    onDone?.(fullMeta);
  }
}
