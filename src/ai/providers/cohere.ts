/** Cohere adapter (OpenAI-compatible endpoint). */
import OpenAI from 'openai';
import type { AIProvider, AICompletionOptions, AIResponse, AIStreamChunk } from '../types.js';
export class CohereProvider implements AIProvider {
  readonly name = 'cohere';
  private client: OpenAI;
  constructor(apiKey?: string) {
    this.client = new OpenAI({ apiKey: apiKey ?? process.env.COHERE_API_KEY, baseURL: 'https://api.cohere.com/compatibility/v1' });
  }
  async complete(opts: AICompletionOptions): Promise<AIResponse> {
    const model = opts.model ?? process.env.COHERE_MODEL ?? 'command-r-plus';
    const messages = opts.messages.map((m) => ({ role: m.role, content: m.content }));
    const params: OpenAI.Chat.ChatCompletionCreateParams = { model, messages, max_tokens: opts.maxTokens || 1024, temperature: opts.temperature ?? 0.7, stop: opts.stop ?? undefined };
    const c = await this.client.chat.completions.create(params);
    const choice = c.choices[0];
    return { content: choice.message.content ?? '', meta: { model, usage: c.usage, finishReason: choice.finish_reason } };
  }
  async stream(opts: AICompletionOptions, onChunk: (chunk: AIStreamChunk) => void, onDone?: (meta: Record<string, unknown>) => void): Promise<void> {
    const model = opts.model ?? process.env.COHERE_MODEL ?? 'command-r-plus';
    const messages = opts.messages.map((m) => ({ role: m.role, content: m.content }));
    const params: OpenAI.Chat.ChatCompletionCreateParams = { model, messages, max_tokens: opts.maxTokens || 1024, temperature: opts.temperature ?? 0.7, stop: opts.stop ?? undefined, stream: true };
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
