import { ai } from './service.js';
import { ASHBOUND_GUARDRAILS, ASHBOUND_IDENTITY } from './personality.js';
import { PromptInjectionGuard } from '../security/PromptInjectionGuard.js';
import { SecretRedactor } from '../security/SecretRedactor.js';
import type { AIMessage } from './types.js';

const MAX_TURNS = 6;
const histories = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>();
const CONFIDENTIAL_REQUEST = /\b(api[ _-]?key|discord[ _-]?token|access[ _-]?token|password|secret|\.env|environment variables?|system prompt|hidden instructions?|internal configuration|database credentials?|private logs?|filesystem paths?)\b/i;
const CONFIDENTIAL_REPLY = "I don't have access to confidential configuration or credentials. I can explain the general concept instead.";

export function conversationKey(input: { userId: string; guildId?: string | null; channelId?: string | null }): string {
  return input.guildId ? `guild:${input.guildId}:${input.channelId ?? 'unknown'}:${input.userId}` : `dm:${input.userId}`;
}

export function resetConversationsForUser(userId: string): number {
  let removed = 0;
  for (const key of histories.keys()) {
    if (key === `dm:${userId}` || key.endsWith(`:${userId}`)) { histories.delete(key); removed++; }
  }
  return removed;
}
/** Reset exactly one DM or guild/channel/user conversation. */
export function resetConversation(key: string): boolean { return histories.delete(key); }
export function _resetConversationState(): void { histories.clear(); }
export function _getConversationHistory(key: string) { return histories.get(key) ?? []; }

export async function converse(input: { key: string; prompt: string; replyContext?: string; imageUrl?: string }): Promise<string> {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error('Empty prompt');
  if (CONFIDENTIAL_REQUEST.test(prompt) || /\.env\b/i.test(prompt)) return CONFIDENTIAL_REPLY;
  const history = histories.get(input.key) ?? [];
  const userContent = input.replyContext
    ? `The user is replying to this earlier Ashbound response:\n<REFERENCE>\n${input.replyContext}\n</REFERENCE>\n\nUser message:\n${prompt}`
    : prompt;
  const messages: AIMessage[] = PromptInjectionGuard.buildProtectedMessages(
    `${ASHBOUND_IDENTITY}\n\n${ASHBOUND_GUARDRAILS}\nBe honest about limitations. Do not claim to access files, the web, private data, or internal settings unless that capability was actually provided.`,
    [...history, { role: 'user' as const, content: userContent }],
  );
  if (input.imageUrl) messages[messages.length - 1].imageUrl = input.imageUrl;
  const response = await ai.chat(messages, { temperature: 0.7, maxTokens: 900 });
  const content = SecretRedactor.redactString(response.content).trim();
  if (!content) throw new Error('Empty AI response');
  const updated: Array<{ role: 'user' | 'assistant'; content: string }> = [...history, { role: 'user', content: prompt }, { role: 'assistant', content }];
  histories.set(input.key, updated.slice(-MAX_TURNS * 2));
  return content;
}
