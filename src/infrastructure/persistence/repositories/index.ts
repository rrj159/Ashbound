/**
 * Infrastructure: Repository interfaces.
 * Abstractions for persistence that can be swapped between JSON, SQLite, etc.
 */

import type { ConversationContext, ConversationEntry } from '../../../domain/memory/types.js';
import type { Reminder } from '../../../services/reminder.js';

export interface ConversationRepository {
  load(id: string): Promise<ConversationContext | null>;
  save(context: ConversationContext): Promise<void>;
  delete(id: string): Promise<void>;
  appendMessage(id: string, entry: ConversationEntry): Promise<void>;
  clearHistory(id: string): Promise<void>;
  listByUser(userId: string): Promise<ConversationContext[]>;
}

export interface ReminderRepository {
  loadAll(): Promise<Reminder[]>;
  save(reminder: Reminder): Promise<void>;
  saveAll(reminders: Reminder[]): Promise<void>;
  delete(id: string): Promise<void>;
  getByUser(userId: string): Promise<Reminder[]>;
}

export interface UsageRepository {
  recordUsage(provider: string, tokens: number, cost: number): Promise<void>;
  getUsage(provider: string, since?: number): Promise<{ tokens: number; cost: number }>;
  getAllUsage(): Promise<Record<string, { tokens: number; cost: number }>>;
}

export interface ProviderHealthRepository {
  getHealth(provider: string): Promise<Record<string, unknown> | null>;
  saveHealth(provider: string, health: Record<string, unknown>): Promise<void>;
  getAllHealth(): Promise<Record<string, Record<string, unknown>>>;
}

export interface UserPreferenceRepository {
  get(userId: string, key: string): Promise<unknown | null>;
  set(userId: string, key: string, value: unknown): Promise<void>;
  delete(userId: string, key: string): Promise<void>;
  getAll(userId: string): Promise<Record<string, unknown>>;
}
