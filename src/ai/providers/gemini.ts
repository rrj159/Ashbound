/**
 * Google Gemini adapter.
 * Uses @google/generative-ai SDK.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIProvider, AICompletionOptions, AIResponse, AIStreamChunk } from '../types.js';

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private client: GoogleGenerativeAI;

  constructor(apiKey?: string) {
    this.client = new GoogleGenerativeAI(apiKey ?? process.env.GEMINI_API_KEY!);
  }

  async complete(opts: AICompletionOptions): Promise<AIResponse> {
    const modelName = opts.model ?? process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';
    const model = this.client.getGenerativeModel({ model: modelName });

    const history = opts.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const chat = model.startChat({ history: history.filter((h) => h.role !== 'system') });

    const last = opts.messages[opts.messages.length - 1];
    const result = await chat.sendMessage(last?.content ?? '');

    return {
      content: result.response.text() ?? '',
      meta: { model: modelName },
    };
  }

  async stream(
    opts: AICompletionOptions,
    onChunk: (chunk: AIStreamChunk) => void,
    onDone?: (meta: Record<string, unknown>) => void,
  ): Promise<void> {
    const modelName = opts.model ?? process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';
    const model = this.client.getGenerativeModel({ model: modelName });
    const result = await model.generateContentStream({ contents: [{ role: 'user', parts: [{ text: opts.messages.at(-1)?.content ?? '' }] }] });

    for await (const chunk of result.stream) {
      const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      if (text) onChunk({ content: text, done: false });
    }
    onChunk({ content: '', done: true });
    onDone?.({ model: modelName });
  }
}
