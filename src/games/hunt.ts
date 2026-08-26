/**
 * Hunt 2.0 — server-side encounter system.
 * Determines all outcomes deterministically. AI only narrates.
 */

import { randInt, rollRarity, GAME_CONFIG } from './config.js';
import { REGIONS, spawnEnemy } from './regions.js';
import type { Player, CombatEnemy, RegionId } from './types.js';
import { v4 as uuidv4 } from 'uuid';

// ─── Encounter types ───────────────────────────────────────────────────────────

export type EncounterType =
  | 'monster'
  | 'boss'
  | 'treasure'
  | 'ambush'
  | 'npc'
  | 'world_event'
  | 'nothing';

export interface MonsterEncounter {
  type: 'monster' | 'boss';
  enemy: CombatEnemy;
  atmosphereLine: string;
}

export interface TreasureEncounter {
  type: 'treasure';
  coins: number;
  xp: number;
  rarityLabel: string;
  rarityEmoji: string;
  atmosphereLine: string;
}

export interface AmbushEncounter {
  type: 'ambush';
  /** Ambush deals this damage to the player immediately */
  ambushDamage: number;
  enemy: CombatEnemy;
  atmosphereLine: string;
}

export interface NpcEncounter {
  type: 'npc';
  npcName: string;
  npcEmoji: string;
  reward: { coins: number; xp: number };
  dialogue: string;
  atmosphereLine: string;
}

export interface WorldEventEncounter {
  type: 'world_event';
  eventName: string;
  description: string;
  reward: { coins: number; xp: number; reputation: number };
  atmosphereLine: string;
}

export interface NothingEncounter {
  type: 'nothing';
  atmosphereLine: string;
}

export type HuntEncounter =
  | MonsterEncounter
  | TreasureEncounter
  | AmbushEncounter
  | NpcEncounter
  | WorldEventEncounter
  | NothingEncounter;

// ─── Encounter weights by type ─────────────────────────────────────────────────
// Weights: monster 50, boss 5, treasure 15, ambush 10, npc 8, world_event 5, nothing 7
const ENCOUNTER_WEIGHTS: Record<EncounterType, number> = {
  monster:     50,
  boss:         5,
  treasure:    15,
  ambush:      10,
  npc:          8,
  world_event:  5,
  nothing:      7,
};

function rollEncounterType(): EncounterType {
  const entries = Object.entries(ENCOUNTER_WEIGHTS) as [EncounterType, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let rand = Math.random() * total;
  for (const [type, weight] of entries) {
    rand -= weight;
    if (rand <= 0) return type;
  }
  return 'monster';
}

// ─── NPC pool ─────────────────────────────────────────────────────────────────

interface NpcTemplate {
  name: string;
  emoji: string;
  dialogues: string[];
  coinBase: number;
  xpBase: number;
}

const NPCS: NpcTemplate[] = [
  {
    name: 'Wandering Merchant',
    emoji: '🧳',
    dialogues: [
      'Take these coins, traveller. The road ahead is treacherous.',
      'I sell only to the brave. Here, take something for free.',
    ],
    coinBase: 80,
    xpBase: 20,
  },
  {
    name: 'Wounded Knight',
    emoji: '🛡️',
    dialogues: [
      'Save yourself. The beast nearly had me… Here, take my purse.',
      'You look capable. My gold is yours if you continue deeper.',
    ],
    coinBase: 60,
    xpBase: 30,
  },
  {
    name: 'Mysterious Oracle',
    emoji: '🔮',
    dialogues: [
      'The stars speak your name. Take this blessing.',
      'I see great peril ahead — and great reward. Begin with this.',
    ],
    coinBase: 40,
    xpBase: 60,
  },
  {
    name: 'Lost Child',
    emoji: '👧',
    dialogues: [
      'Thank you for not being a monster! Take my lucky coin.',
    ],
    coinBase: 20,
    xpBase: 80,
  },
];

// ─── World event pool ──────────────────────────────────────────────────────────

interface WorldEventTemplate {
  name: string;
  description: string;
  coinMult: number;
  xpMult: number;
  reputationBase: number;
}

const WORLD_EVENTS: WorldEventTemplate[] = [
  {
    name: '🌑 The Forest Has Gone Silent',
    description: 'An ancient power stirs. You stand at the eye of the storm and survive.',
    coinMult: 3,
    xpMult: 3,
    reputationBase: 5,
  },
  {
    name: '⚡ Lightning Strikes Twice',
    description: 'A surge of wild magic courses through you. You feel stronger.',
    coinMult: 2,
    xpMult: 4,
    reputationBase: 3,
  },
  {
    name: '💀 The Dead Rise',
    description: 'Undead swarm the area. You cut through them all and loot the remains.',
    coinMult: 4,
    xpMult: 2,
    reputationBase: 8,
  },
  {
    name: '🌕 Blood Moon Rising',
    description: 'The moon turns red. All enemies flee. You collect their abandoned loot.',
    coinMult: 5,
    xpMult: 1,
    reputationBase: 2,
  },
];

// ─── Main encounter generator ──────────────────────────────────────────────────

export function generateHuntEncounter(player: Player): HuntEncounter {
  const region = REGIONS[player.region];
  const atmosphereLine = region.atmosphereLines[
    Math.floor(Math.random() * region.atmosphereLines.length)
  ];

  const type = rollEncounterType();

  switch (type) {
    case 'boss': {
      const enemy = spawnEnemy(region.boss, player.level, player.region);
      return { type: 'boss', enemy, atmosphereLine };
    }

    case 'monster': {
      // Weighted pick from region enemy pool
      const pool = region.enemies;
      const totalWeight = pool.reduce((s, e) => s + e.weight, 0);
      let rand = Math.random() * totalWeight;
      let template = pool[0];
      for (const t of pool) {
        rand -= t.weight;
        if (rand <= 0) { template = t; break; }
      }
      const enemy = spawnEnemy(template, player.level, player.region);
      return { type: 'monster', enemy, atmosphereLine };
    }

    case 'ambush': {
      const pool = region.enemies;
      const template = pool[Math.floor(Math.random() * pool.length)];
      const enemy = spawnEnemy(template, player.level + 2, player.region);
      // Ambush deals 15-30% of player max HP immediately
      const ambushDamage = Math.floor(player.maxHp * (0.15 + Math.random() * 0.15));
      return { type: 'ambush', ambushDamage, enemy, atmosphereLine };
    }

    case 'treasure': {
      const rarityIdx = rollRarity(player.luck);
      const rarity = GAME_CONFIG.loot.rarityNames[rarityIdx];
      const coins = randInt(
        GAME_CONFIG.loot.rarityCoinMin[rarityIdx] * 2,
        GAME_CONFIG.loot.rarityCoinMax[rarityIdx] * 2
      );
      const xp = coins * 0.3;
      return {
        type: 'treasure',
        coins,
        xp: Math.floor(xp),
        rarityLabel: rarity,
        rarityEmoji: GAME_CONFIG.loot.rarityEmojis[rarityIdx],
        atmosphereLine,
      };
    }

    case 'npc': {
      const npc = NPCS[Math.floor(Math.random() * NPCS.length)];
      const coinMult = region.difficultyMultiplier;
      return {
        type: 'npc',
        npcName: npc.name,
        npcEmoji: npc.emoji,
        reward: {
          coins: Math.floor(npc.coinBase * coinMult),
          xp: Math.floor(npc.xpBase * coinMult),
        },
        dialogue: npc.dialogues[Math.floor(Math.random() * npc.dialogues.length)],
        atmosphereLine,
      };
    }

    case 'world_event': {
      const event = WORLD_EVENTS[Math.floor(Math.random() * WORLD_EVENTS.length)];
      const base = Math.floor(50 * player.level * region.difficultyMultiplier);
      return {
        type: 'world_event',
        eventName: event.name,
        description: event.description,
        reward: {
          coins: Math.floor(base * event.coinMult),
          xp: Math.floor(base * event.xpMult),
          reputation: event.reputationBase + Math.floor(player.level / 10),
        },
        atmosphereLine,
      };
    }

    default:
      return { type: 'nothing', atmosphereLine };
  }
}

// ─── Cooldown helpers ──────────────────────────────────────────────────────────

export function isOnCooldown(
  player: Player,
  action: keyof Player['cooldowns']
): { onCooldown: boolean; remainingMs: number } {
  const expires = player.cooldowns[action] ?? 0;
  const now = Date.now();
  if (expires > now) {
    return { onCooldown: true, remainingMs: expires - now };
  }
  return { onCooldown: false, remainingMs: 0 };
}

export function formatCooldown(ms: number): string {
  if (ms < 60_000) return `${Math.ceil(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.ceil(ms / 60_000)}m`;
  return `${Math.ceil(ms / 3_600_000)}h`;
}
