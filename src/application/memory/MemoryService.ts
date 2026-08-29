/**
 * Application: Memory Service.
 * High-level memory operations for conversation management.
 */

import type { ConversationContext, ConversationEntry, MemoryPolicy } from '../../domain/memory/types.js';
import type { ConversationStore } from '../../domain/memory/types.js';

const DEFAULT_POLICY: MemoryPolicy = {
  maxMessages: 12,
  maxTokens: 4000,
  retentionMs: 30 * 60 * 1000, // 30 minutes
  isolateByChannel: true,
};

export class MemoryService {
  private store: ConversationStore;
  private policy: MemoryPolicy;

  constructor(store: ConversationStore, policy: Partial<MemoryPolicy> = {}) {
    this.store = store;
    this.policy = { ...DEFAULT_POLICY, ...policy };
  }

  /**
   * Generate a conversation ID from context.
   */
  getConversationId(userId: string, guildId: string | null, channelId: string): string {
    if (this.policy.isolateByChannel) {
      return `${guildId ?? 'dm'}:${channelId}:${userId}`;
    }
    return `${guildId ?? 'dm'}:${userId}`;
  }

  /**
   * Load or create a conversation context.
   */
  async getOrCreate(
    userId: string,
    guildId: string | null,
    channelId: string,
  ): Promise<ConversationContext> {
    const id = this.getConversationId(userId, guildId, channelId);
    let context = await this.store.load(id);

    if (!context) {
      context = {
        conversationId: id,
        userId,
        guildId,
        channelId,
        messages: [],
        createdAt: Date.now(),
        lastActivity: Date.now(),
      };
      await this.store.save(context);
    }

    // Check retention
    if (Date.now() - context.lastActivity > this.policy.retentionMs) {
      context.messages = [];
      context.lastActivity = Date.now();
      await this.store.save(context);
    }

    return context;
  }

  /**
   * Add a message to a conversation.
   */
  async addMessage(
    conversationId: string,
    entry: ConversationEntry,
  ): Promise<void> {
    const context = await this.store.load(conversationId);
    if (!context) return;

    context.messages.push({
      ...entry,
      timestamp: Date.now(),
    });

    // Trim to policy limits
    if (context.messages.length > this.policy.maxMessages) {
      context.messages = context.messages.slice(-this.policy.maxMessages);
    }

    context.lastActivity = Date.now();
    await this.store.save(context);
  }

  /**
   * Clear a conversation's history.
   */
  async clearHistory(conversationId: string): Promise<void> {
    await this.store.clearHistory(conversationId);
  }

  /**
   * Clear all conversations for a user.
   */
  async clearUserConversations(userId: string): Promise<void> {
    const conversations = await this.store.listByUser(userId);
    for (const conv of conversations) {
      await this.store.clearHistory(conv.conversationId);
    }
  }

  /**
   * Get trimmed messages for AI context.
   */
  getContextMessages(context: ConversationContext): ConversationEntry[] {
    return context.messages.slice(-this.policy.maxMessages);
  }
}
