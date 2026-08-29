/**
 * Infrastructure: JSON-based repository implementations.
 * File-based persistence for Termux and small deployments.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ConversationContext, ConversationEntry } from '../../../domain/memory/types.js';
import type { ConversationRepository } from '../repositories/index.js';

const DATA_DIR = path.join(process.cwd(), '.data');

async function ensureDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {}
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await ensureDir();
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export class JsonConversationRepository implements ConversationRepository {
  private getFilePath(id: string): string {
    // Sanitize ID to prevent path traversal
    const safeId = id.replace(/[^a-zA-Z0-9:_-]/g, '_');
    return path.join(DATA_DIR, `conv_${safeId}.json`);
  }

  async load(id: string): Promise<ConversationContext | null> {
    return readJson<ConversationContext>(this.getFilePath(id));
  }

  async save(context: ConversationContext): Promise<void> {
    await writeJson(this.getFilePath(context.conversationId), context);
  }

  async delete(id: string): Promise<void> {
    try {
      await fs.unlink(this.getFilePath(id));
    } catch {}
  }

  async appendMessage(id: string, entry: ConversationEntry): Promise<void> {
    const context = await this.load(id);
    if (!context) return;

    context.messages.push({
      ...entry,
      timestamp: Date.now(),
    });

    context.lastActivity = Date.now();
    await this.save(context);
  }

  async clearHistory(id: string): Promise<void> {
    const context = await this.load(id);
    if (!context) return;

    context.messages = [];
    context.lastActivity = Date.now();
    await this.save(context);
  }

  async listByUser(userId: string): Promise<ConversationContext[]> {
    await ensureDir();
    const files = await fs.readdir(DATA_DIR);
    const conversations: ConversationContext[] = [];

    for (const file of files) {
      if (!file.startsWith('conv_') || !file.endsWith('.json')) continue;
      const context = await readJson<ConversationContext>(path.join(DATA_DIR, file));
      if (context && context.userId === userId) {
        conversations.push(context);
      }
    }

    return conversations;
  }
}
