/**
 * Dungeon system: 5-floor cooperative party dungeons with boss on floor 5.
 * ALL outcomes are server-side deterministic. AI narrates only.
 */

import { v4 as uuidv4 } from 'uuid';
import { randInt, GAME_CONFIG } from './config.js';
import { getEffectiveStats } from './combat.js';
import type { Player, CombatEnemy, RegionId } from './types.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DungeonAction = 'attack' | 'defend' | 'ability' | 'flee';
export type DungeonStatus = 'waiting' | 'combat' | 'between_floors' | 'completed' | 'failed';

/** Snapshot of a player's combat state inside a dungeon. */
export interface DungeonPlayerState {
  userId: string;
  username: string;
  level: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  defending: boolean;
  /** Power Strike is available once per floor. */
  abilityUsed: boolean;
  // Effective stats snapshotted at join time (includes equipment)
  attack: number;
  defense: number;
  critChance: number;
  dodgeChance: number;
}

export interface DungeonSession {
  id: string;
  dungeonId: string;
  guildId: string;
  channelId: string;
  messageId?: string;
  leaderId: string;
  players: DungeonPlayerState[];
  /** 1-indexed current floor. */
  floor: number;
  totalFloors: number;
  enemy: CombatEnemy;
  turn: number;
  log: string[];
  status: DungeonStatus;
  rewardsClaimed: boolean;
  /** Map userId -> action submitted for the current turn. */
  actionsThisTurn: Record<string, DungeonAction>;
  createdAt: number;
  startedAt?: number;
}

export interface TurnResult {
  session: DungeonSession;
  status: 'ongoing' | 'floor_cleared' | 'dungeon_failed';
}

// ─── Dungeon definitions ──────────────────────────────────────────────────────

interface FloorDef {
  name: string;
  emoji: string;
  hpBase: number;
  atkBase: number;
  defBase: number;
  xpReward: number;
  coinMin: number;
  coinMax: number;
  isBoss: boolean;
}

export interface DungeonDef {
  id: string;
  name: string;
  description: string;
  region: RegionId;
  minLevel: number;
  floors: [FloorDef, ...FloorDef[]];
  completionBonus: { xp: number; coins: number };
}

export const DUNGEONS: Readonly<Record<string, DungeonDef>> = {
  ashen_crypt: {
    id: 'ashen_crypt',
    name: 'Ashen Crypt',
    description: 'An ancient burial ground beneath the village, now crawling with undead horrors. Five floors of terror await.',
    region: 'ashen_village',
    minLevel: 1,
    floors: [
      { name: 'Crypt Shambler',  emoji: 'UNDEAD',  hpBase: 120, atkBase: 14, defBase:  6, xpReward:  200, coinMin:  60, coinMax:  130, isBoss: false },
      { name: 'Bone Archer',     emoji: 'ARCHER',  hpBase: 165, atkBase: 21, defBase:  8, xpReward:  310, coinMin:  90, coinMax:  190, isBoss: false },
      { name: 'Crypt Berserker', emoji: 'BERSRK',  hpBase: 215, atkBase: 28, defBase: 10, xpReward:  470, coinMin: 130, coinMax:  270, isBoss: false },
      { name: 'Shadow Revenant', emoji: 'SHADOW',  hpBase: 275, atkBase: 34, defBase: 13, xpReward:  660, coinMin: 180, coinMax:  350, isBoss: false },
      { name: 'Crypt Lord',      emoji: 'BOSS',    hpBase: 780, atkBase: 52, defBase: 23, xpReward: 2700, coinMin: 620, coinMax: 1350, isBoss: true  },
    ],
    completionBonus: { xp: 1500, coins: 800 },
  },
} as const;

// ─── Enemy scaling ────────────────────────────────────────────────────────────

/**
 * Spawn a floor enemy scaled by average party level and party size.
 * More players = more HP/damage to maintain challenge.
 */
export function spawnFloorEnemy(
  dungeonId: string,
  floorIndex: number,
  avgLevel: number,
  partySize: number,
): CombatEnemy {
  const dungeon  = DUNGEONS[dungeonId];
  const floorDef = dungeon.floors[floorIndex];
  const levelMult = 1 + Math.max(0, avgLevel - 1) * 0.14;
  const partyMult = 1 + (partySize - 1) * 0.35;

  const hp = Math.floor(floorDef.hpBase * levelMult * partyMult);
  return {
    id: uuidv4(),
    name: floorDef.name,
    emoji: floorDef.emoji,
    level: Math.max(1, avgLevel + floorIndex),
    hp,
    maxHp: hp,
    attack:  Math.floor(floorDef.atkBase  * levelMult),
    defense: Math.floor(floorDef.defBase  * levelMult),
    luck: 1,
    xpReward:   Math.floor(floorDef.xpReward * levelMult),
    coinReward: [
      Math.floor(floorDef.coinMin * levelMult),
      Math.floor(floorDef.coinMax * levelMult),
    ],
    lootTable: [],
    isBoss: floorDef.isBoss,
    region: dungeon.region,
  };
}

// ─── Session lifecycle ────────────────────────────────────────────────────────

/** Convert a Player into a DungeonPlayerState using snapshotted effective stats. */
export function playerToState(player: Player): DungeonPlayerState {
  const stats = getEffectiveStats(player);
  return {
    userId:     player.userId,
    username:   player.username,
    level:      player.level,
    hp:         stats.hp,
    maxHp:      stats.maxHp,
    alive:      true,
    defending:  false,
    abilityUsed: false,
    attack:     stats.attack,
    defense:    stats.defense,
    critChance:  stats.critChance,
    dodgeChance: stats.dodgeChance,
  };
}

/** Create a new dungeon session in 'waiting' status for the leader. */
export function createDungeonSession(
  dungeonId: string,
  leader: Player,
  guildId: string,
  channelId: string,
): DungeonSession {
  const dungeon = DUNGEONS[dungeonId];
  // Placeholder enemy — replaced when dungeon starts
  const placeholder = spawnFloorEnemy(dungeonId, 0, leader.level, 1);
  return {
    id: uuidv4(),
    dungeonId,
    guildId,
    channelId,
    leaderId:     leader.userId,
    players:      [playerToState(leader)],
    floor:        1,
    totalFloors:  dungeon.floors.length,
    enemy:        placeholder,
    turn:         0,
    log:          [],
    status:       'waiting',
    rewardsClaimed: false,
    actionsThisTurn: {},
    createdAt:    Date.now(),
  };
}

/** Add a player to a waiting session. */
export function addPlayerToSession(session: DungeonSession, player: Player): DungeonSession {
  return { ...session, players: [...session.players, playerToState(player)] };
}

/** Start the dungeon: transition from waiting to combat on floor 1. */
export function startDungeonSession(session: DungeonSession): DungeonSession {
  const alive    = session.players.filter((p) => p.alive);
  const avgLevel = Math.max(1, Math.round(alive.reduce((s, p) => s + p.level, 0) / alive.length));
  const enemy    = spawnFloorEnemy(session.dungeonId, 0, avgLevel, alive.length);
  const dungeon  = DUNGEONS[session.dungeonId];
  return {
    ...session,
    enemy,
    status:    'combat',
    startedAt: Date.now(),
    turn:      0,
    actionsThisTurn: {},
    log: [`The party of ${alive.length} enters ${dungeon.name}! Floor 1 begins.`],
  };
}

/** Heal survivors 20% maxHp and advance to the next floor. */
export function advanceToNextFloor(session: DungeonSession): DungeonSession {
  const nextFloor = session.floor + 1;
  const alive     = session.players.filter((p) => p.alive);
  const avgLevel  = Math.max(1, Math.round(alive.reduce((s, p) => s + p.level, 0) / alive.length));
  const enemy     = spawnFloorEnemy(session.dungeonId, nextFloor - 1, avgLevel, alive.length);

  const healedPlayers = session.players.map((p) => ({
    ...p,
    hp:          p.alive ? Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.2)) : p.hp,
    abilityUsed: false,  // reset Power Strike per floor
    defending:   false,
  }));

  return {
    ...session,
    floor:   nextFloor,
    enemy,
    turn:    0,
    status:  'combat',
    actionsThisTurn: {},
    players: healedPlayers,
    log: [...session.log, `The party advances to Floor ${nextFloor}! Survivors recover 20% HP.`].slice(-20),
  };
}

// ─── Turn resolution ──────────────────────────────────────────────────────────

/**
 * Resolve one full combat turn after all alive players have submitted actions.
 * Pure function — returns a new session + status. Never mutates input.
 */
export function resolveDungeonTurn(session: DungeonSession): TurnResult {
  const log: string[] = [];
  const enemy   = { ...session.enemy };
  const players = session.players.map((p) => ({ ...p }));

  // Phase 1: Player actions against enemy
  for (const p of players) {
    if (!p.alive) continue;
    const action = session.actionsThisTurn[p.userId];
    if (!action) continue;

    if (action === 'defend') {
      p.defending = true;
      log.push(`${p.username} takes a defensive stance.`);
      continue;
    }

    if (action === 'flee') {
      if (Math.random() < 0.4) {
        p.alive = false;
        log.push(`${p.username} flees from the dungeon!`);
      } else {
        log.push(`${p.username} failed to flee!`);
      }
      continue;
    }

    // attack or ability
    let dmgMult = 1.0;
    if (action === 'ability') {
      if (!p.abilityUsed) {
        p.abilityUsed = true;
        dmgMult = 1.8;
        log.push(`${p.username} uses Power Strike!`);
      } else {
        // ability on cooldown — treat as normal attack
        log.push(`${p.username} attacks (Power Strike on cooldown).`);
      }
    }

    // Miss check (5% base)
    if (Math.random() < 0.05) { log.push(`${p.username}'s attack missed!`); continue; }

    let dmg = Math.max(1, Math.floor(p.attack * dmgMult - enemy.defense + randInt(0, 5)));
    if (Math.random() < p.critChance) {
      dmg = Math.floor(dmg * 1.5);
      log.push(`${p.username} lands a CRITICAL hit for **${dmg}** damage!`);
    } else {
      log.push(`${p.username} deals **${dmg}** damage.`);
    }
    enemy.hp = Math.max(0, enemy.hp - dmg);
    if (enemy.hp <= 0) break; // enemy dead, stop processing
  }

  // Phase 2: Enemy counter-attacks alive players
  if (enemy.hp > 0) {
    const targets = players.filter((p) => p.alive);
    for (const p of targets) {
      // Dodge check
      if (Math.random() < p.dodgeChance) { log.push(`${p.username} dodges the attack!`); continue; }
      let dmg = Math.max(1, enemy.attack - p.defense + randInt(0, 3));
      if (p.defending) {
        dmg = Math.floor(dmg * 0.5);
        log.push(`${p.username} blocks and takes **${dmg}** damage.`);
      } else {
        log.push(`${p.username} takes **${dmg}** damage.`);
      }
      p.hp = Math.max(0, p.hp - dmg);
      if (p.hp <= 0) { p.alive = false; log.push(`${p.username} has been defeated!`); }
    }
  }

  // Reset defending flags
  for (const p of players) p.defending = false;

  // Determine outcome
  const survivors = players.filter((p) => p.alive);
  let status: 'ongoing' | 'floor_cleared' | 'dungeon_failed' = 'ongoing';
  if (enemy.hp <= 0) {
    status = 'floor_cleared';
    log.push(`${enemy.name} has been slain!`);
  } else if (survivors.length === 0) {
    status = 'dungeon_failed';
    log.push(`All party members have fallen. The dungeon claims another group of adventurers.`);
  }

  const newSession: DungeonSession = {
    ...session,
    players,
    enemy: { ...enemy },
    turn: session.turn + 1,
    log:  [...session.log, ...log].slice(-20),
    actionsThisTurn: {},
  };

  return { session: newSession, status };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function avgPartyLevel(session: DungeonSession): number {
  const alive = session.players.filter((p) => p.alive);
  if (alive.length === 0) return 1;
  return Math.round(alive.reduce((s, p) => s + p.level, 0) / alive.length);
}
