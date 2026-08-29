/**
 * AI service — the single interface used throughout the codebase.
 *
 * Commands (and any other module) should import from here, never from providers/.
 * The provider is determined at startup via environment variables and can be
 * swapped at runtime without touching any calling code.
 *
 * Usage:
 *   import { ai } from './ai/service.js';
 *   const { content } = await ai.chat([{ role: 'user', content: '...' }]);
 */

import { getPrimaryProvider, getFallbackProvider } from './providers/index.js';
import type { AICompletionOptions, AIResponse, AIStreamChunk, AIMessage } from './types.js';
import { SecretRedactor } from '../security/SecretRedactor.js';

class AIService {
  /**
   * Send a chat request and get a plain-text response.
   * Automatically falls back to the secondary provider if the primary fails.
   */
  async chat(
    messages: AIMessage[],
    opts?: Partial<AICompletionOptions>,
  ): Promise<AIResponse> {
    const options: AICompletionOptions = { messages, ...opts, stream: false };

    try {
      const provider = getPrimaryProvider();
      if (!provider) throw new Error('[AI] No primary provider configured.');
      return await provider.complete(options);
    } catch (primaryErr) {
      const fallback = getFallbackProvider();
      if (!fallback) throw primaryErr;

      console.warn('[AI] Primary provider failed, trying fallback:', SecretRedactor.redactString(String(primaryErr)));
      return fallback.complete(options);
    }
  }

  /**
   * Stream a chat response, yielding chunks via callback.
   * Falls back to the secondary provider if the primary fails mid-stream.
   */
  async stream(
    messages: AIMessage[],
    onChunk: (chunk: AIStreamChunk) => void,
    opts?: Partial<AICompletionOptions>,
  ): Promise<void> {
    const options: AICompletionOptions = { messages, ...opts, stream: true };

    try {
      const provider = getPrimaryProvider();
      if (!provider) throw new Error('[AI] No primary provider configured.');
      await provider.stream(options, onChunk);
    } catch (primaryErr) {
      const fallback = getFallbackProvider();
      if (!fallback) throw primaryErr;

      console.warn('[AI] Primary provider failed, trying fallback:', SecretRedactor.redactString(String(primaryErr)));
      await fallback.stream(options, onChunk);
    }
  }

  /**
   * Convenience: send a single user message and get the text back.
   */
  async say(
    prompt: string,
    system?: string,
    opts?: Partial<AICompletionOptions>,
  ): Promise<string> {
    const messages: AIMessage[] = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });

    const { content } = await this.chat(messages, opts);
    return content;
  }
}

export const ai = new AIService();
export { router } from './router.js';
