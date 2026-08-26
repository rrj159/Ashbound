/**
 * Persistent game store with file locking to prevent race conditions.
 * All game state reads/writes go through this module.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  Player,
  Guild,
  WorldBoss,
  JackpotState,
  CombatSession,
} from './types.js';
import { migratePlayer, createDefaultPlayer } from './types.js';

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function filePath(name: string): string {
  ensureDir(DATA_DIR);
  return path.join(DATA_DIR, name);
}

// ─── Low-level safe JSON helpers ──────────────────────────────────────────────

function readJson<T>(file: string, fallback: T): T {
  try {
    const content = fs.readFileSync(file, 'utf8');
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown): void {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file); // atomic on most OSes
}

// ─── Per-file async lock (prevents concurrent writes to same file) ─────────────

const locks = new Map<string, Promise<void>>();

async function withLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  while (locks.has(file)) {
    await locks.get(file);
  }
  let resolve!: () => void;
  const lock = new Promise<void>((r) => { resolve = r; });
  locks.set(file, lock);
  try {
    return await fn();
  } finally {
    locks.delete(file);
    resolve();
  }
}

// ─── Players ──────────────────────────────────────────────────────────────────

const PLAYERS_FILE = 'game-players.json';
type PlayersMap = Record<string, Player>;

export async function getPlayer(
  userId: string,
  username: string
): Promise<Player> {
  return withLock(PLAYERS_FILE, async () => {
    const file = filePath(PLAYERS_FILE);
    const map = readJson<PlayersMap>(file, {});
    if (!map[userId]) {
      map[userId] = createDefaultPlayer(userId, username);
      writeJson(file, map);
    } else {
      // Migrate on read to pick up new fields
      map[userId] = migratePlayer({ ...map[userId], userId, username });
    }
    return map[userId];
  });
}

export async function savePlayer(player: Player): Promise<void> {
  return withLock(PLAYERS_FILE, async () => {
    const file = filePath(PLAYERS_FILE);
    const map = readJson<PlayersMap>(file, {});
    map[player.userId] = { ...player, updatedAt: new Date().toISOString() };
    writeJson(file, map);
  });
}

/** Atomic read-modify-write for a player */
export async function updatePlayer(
  userId: string,
  username: string,
  updater: (p: Player) => Player | Promise<Player>
): Promise<Player> {
  return withLock(PLAYERS_FILE, async () => {
    const file = filePath(PLAYERS_FILE);
    const map = readJson<PlayersMap>(file, {});
    let player = map[userId]
      ? migratePlayer({ ...map[userId], userId, username })
      : createDefaultPlayer(userId, username);
    player = await updater(player);
    player.updatedAt = new Date().toISOString();
    map[userId] = player;
    writeJson(file, map);
    return player;
  });
}

export async function getAllPlayers(): Promise<Player[]> {
  const file = filePath(PLAYERS_FILE);
  const map = readJson<PlayersMap>(file, {});
  return Object.values(map).map((p) =>
    migratePlayer(p as Partial<Player> & { userId: string; username: string })
  );
}

// ─── Economy helpers ──────────────────────────────────────────────────────────

export const economy = {
  async getBalance(userId: string): Promise<number> {
    const file = filePath(PLAYERS_FILE);
    const map = readJson<PlayersMap>(file, {});
    return map[userId]?.gold ?? 0;
  },

  async addCoins(
    userId: string,
    username: string,
    amount: number
  ): Promise<number> {
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Invalid coin amount');
    const player = await updatePlayer(userId, username, (p) => ({
      ...p,
      gold: Math.min(p.gold + amount, 999_999_999),
      statistics: {
        ...p.statistics,
        totalCoinsEarned: p.statistics.totalCoinsEarned + amount,
      },
    }));
    return player.gold;
  },

  async removeCoins(
    userId: string,
    username: string,
    amount: number
  ): Promise<number> {
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Invalid coin amount');
    let newBalance = 0;
    const player = await updatePlayer(userId, username, (p) => {
      if (p.gold < amount) throw new Error('Insufficient coins');
      newBalance = p.gold - amount;
      return {
        ...p,
        gold: newBalance,
        statistics: {
          ...p.statistics,
          totalCoinsSpent: p.statistics.totalCoinsSpent + amount,
        },
      };
    });
    return player.gold;
  },

  async canAfford(userId: string, amount: number): Promise<boolean> {
    const file = filePath(PLAYERS_FILE);
    const map = readJson<PlayersMap>(file, {});
    return (map[userId]?.gold ?? 0) >= amount;
  },

  async transferCoins(
    fromUserId: string,
    fromUsername: string,
    toUserId: string,
    toUsername: string,
    amount: number
  ): Promise<void> {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid transfer amount');
    // Lock both players sequentially under a single players-file lock
    return withLock(PLAYERS_FILE, async () => {
      const file = filePath(PLAYERS_FILE);
      const map = readJson<PlayersMap>(file, {});
      const from = map[fromUserId]
        ? migratePlayer({ ...map[fromUserId], userId: fromUserId, username: fromUsername })
        : createDefaultPlayer(fromUserId, fromUsername);
      const to = map[toUserId]
        ? migratePlayer({ ...map[toUserId], userId: toUserId, username: toUsername })
        : createDefaultPlayer(toUserId, toUsername);

      if (from.gold < amount) throw new Error('Insufficient coins for transfer');

      from.gold -= amount;
      from.statistics.totalCoinsSpent += amount;
      to.gold = Math.min(to.gold + amount, 999_999_999);
      to.statistics.totalCoinsEarned += amount;

      from.updatedAt = new Date().toISOString();
      to.updatedAt = new Date().toISOString();

      map[fromUserId] = from;
      map[toUserId] = to;
      writeJson(file, map);
    });
  },
};

// ─── Combat sessions (in-memory TTL cache) ────────────────────────────────────

const activeCombats = new Map<string, CombatSession>();

export const combatStore = {
  set(session: CombatSession): void {
    activeCombats.set(session.id, session);
  },
  get(id: string): CombatSession | undefined {
    return activeCombats.get(id);
  },
  getByUser(userId: string): CombatSession | undefined {
    for (const s of activeCombats.values()) {
      if (s.userId === userId && s.status === 'active') return s;
    }
    return undefined;
  },
  delete(id: string): void {
    activeCombats.delete(id);
  },
  /** Remove expired sessions (call periodically) */
  purgeExpired(ttlSeconds: number): void {
    const cutoff = Date.now() - ttlSeconds * 1000;
    for (const [id, s] of activeCombats.entries()) {
      if (s.createdAt < cutoff) activeCombats.delete(id);
    }
  },
};

// ─── World Boss ───────────────────────────────────────────────────────────────

const WORLD_BOSS_FILE = 'world-boss.json';

export async function getWorldBoss(): Promise<WorldBoss | null> {
  const file = filePath(WORLD_BOSS_FILE);
  const boss = readJson<WorldBoss | null>(file, null);
  if (!boss) return null;
  if (boss.status === 'active' && new Date(boss.expiresAt) < new Date()) {
    boss.status = 'expired';
    writeJson(file, boss);
  }
  return boss;
}

export async function saveWorldBoss(boss: WorldBoss | null): Promise<void> {
  writeJson(filePath(WORLD_BOSS_FILE), boss);
}

export async function updateWorldBoss(
  updater: (b: WorldBoss | null) => WorldBoss | null
): Promise<WorldBoss | null> {
  return withLock(WORLD_BOSS_FILE, async () => {
    const file = filePath(WORLD_BOSS_FILE);
    const current = readJson<WorldBoss | null>(file, null);
    const updated = updater(current);
    writeJson(file, updated);
    return updated;
  });
}

// ─── Guilds ───────────────────────────────────────────────────────────────────

const GUILDS_FILE = 'guilds.json';
type GuildsMap = Record<string, Guild>;

export async function getGuild(guildId: string): Promise<Guild | null> {
  const file = filePath(GUILDS_FILE);
  const map = readJson<GuildsMap>(file, {});
  return map[guildId] ?? null;
}

export async function saveGuild(guild: Guild): Promise<void> {
  return withLock(GUILDS_FILE, async () => {
    const file = filePath(GUILDS_FILE);
    const map = readJson<GuildsMap>(file, {});
    map[guild.guildId] = guild;
    writeJson(file, map);
  });
}

export async function updateGuild(
  guildId: string,
  updater: (g: Guild | null) => Guild
): Promise<Guild> {
  return withLock(GUILDS_FILE, async () => {
    const file = filePath(GUILDS_FILE);
    const map = readJson<GuildsMap>(file, {});
    const updated = updater(map[guildId] ?? null);
    map[guildId] = updated;
    writeJson(file, map);
    return updated;
  });
}

// ─── Jackpot ──────────────────────────────────────────────────────────────────

const JACKPOT_FILE = 'jackpot.json';

const DEFAULT_JACKPOT: JackpotState = {
  pool: 10_000,
  totalWins: 0,
  totalPaidOut: 0,
};

export async function getJackpot(): Promise<JackpotState> {
  return readJson<JackpotState>(filePath(JACKPOT_FILE), { ...DEFAULT_JACKPOT });
}

export async function updateJackpot(
  updater: (j: JackpotState) => JackpotState
): Promise<JackpotState> {
  return withLock(JACKPOT_FILE, async () => {
    const file = filePath(JACKPOT_FILE);
    const current = readJson<JackpotState>(file, { ...DEFAULT_JACKPOT });
    const updated = updater(current);
    // Validate
    if (!Number.isFinite(updated.pool) || updated.pool < 0) {
      throw new Error('Invalid jackpot pool value');
    }
    writeJson(file, updated);
    return updated;
  });
}

// ─── Leaderboard helpers ──────────────────────────────────────────────────────

export async function getLeaderboard(
  field: 'gold' | 'level' | 'statistics.monstersKilled' | 'statistics.bossesKilled',
  limit = 10
): Promise<Array<{ userId: string; username: string; value: number }>> {
  const players = await getAllPlayers();
  const scored = players.map((p) => {
    let value: number;
    if (field === 'gold') value = p.gold;
    else if (field === 'level') value = p.level;
    else if (field === 'statistics.monstersKilled') value = p.statistics.monstersKilled;
    else value = p.statistics.bossesKilled;
    return { userId: p.userId, username: p.username, value };
  });
  return scored.sort((a, b) => b.value - a.value).slice(0, limit);
}
