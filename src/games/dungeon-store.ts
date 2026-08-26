/**
 * In-memory dungeon session store with TTL cleanup.
 * Sessions live for 2 hours max; purged every 5 minutes.
 */

import type { DungeonSession } from './dungeon.js';

const sessions    = new Map<string, DungeonSession>();
/** userId -> sessionId reverse index. Only contains alive (not fled/dead) players. */
const userIndex   = new Map<string, string>();

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function cleanup(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      for (const p of session.players) userIndex.delete(p.userId);
      sessions.delete(id);
    }
  }
}

setInterval(cleanup, 5 * 60 * 1000).unref();

function rebuildIndex(session: DungeonSession): void {
  for (const p of session.players) {
    // Only track players who are still in the session (alive or waiting)
    if (session.status === 'waiting' || p.alive) {
      userIndex.set(p.userId, session.id);
    } else {
      userIndex.delete(p.userId);
    }
  }
}

export const dungeonStore = {
  get(id: string): DungeonSession | undefined {
    return sessions.get(id);
  },

  getByUser(userId: string): DungeonSession | undefined {
    const sid = userIndex.get(userId);
    return sid ? sessions.get(sid) : undefined;
  },

  set(session: DungeonSession): void {
    // Remove stale index entries from the previous version of this session
    const prev = sessions.get(session.id);
    if (prev) {
      for (const p of prev.players) userIndex.delete(p.userId);
    }
    sessions.set(session.id, session);
    rebuildIndex(session);
  },

  delete(id: string): void {
    const session = sessions.get(id);
    if (session) {
      for (const p of session.players) userIndex.delete(p.userId);
      sessions.delete(id);
    }
  },

  /** For testing/debugging: returns all active session IDs. */
  allIds(): string[] {
    return [...sessions.keys()];
  },
};
