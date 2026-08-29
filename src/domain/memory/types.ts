/**
 * Domain: Memory contracts.
 * Interfaces for conversation storage and context building.
 */

export interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

export interface ConversationContext {
  /** Unique identifier for this conversation */
  conversationId: string;
  /** User ID */
  userId: string;
  /** Guild ID (null for DMs) */
  guildId: string | null;
  /** Channel ID */
  channelId: string;
  /** Conversation history */
  messages: ConversationEntry[];
  /** When the conversation started */
  createdAt: number;
  /** Last activity timestamp */
  lastActivity: number;
}

export interface MemoryPolicy {
  /** Maximum messages to keep in context */
  maxMessages: number;
  /** Maximum tokens (approximate) for context */
  maxTokens: number;
  /** How long to keep conversations (ms) */
  retentionMs: number;
  /** Whether to isolate conversations by channel */
  isolateByChannel: boolean;
}

export interface ConversationStore {
  /** Load a conversation context */
  load(conversationId: string): Promise<ConversationContext | null>;
  /** Save a conversation context */
  save(context: ConversationContext): Promise<void>;
  /** Delete a conversation */
  delete(conversationId: string): Promise<void>;
  /** Append a message to a conversation */
  appendMessage(conversationId: string, entry: ConversationEntry): Promise<void>;
  /** Clear a conversation's history */
  clearHistory(conversationId: string): Promise<void>;
  /** List conversations for a user */
  listByUser(userId: string): Promise<ConversationContext[]>;
}

export interface ContextBuilder {
  /** Build AI messages from a conversation context */
  build(context: ConversationContext, userMessage: string): AIMessage[];
}

import type { AIMessage } from '../ai/types.js';
