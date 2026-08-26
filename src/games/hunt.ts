/**
 * Hunt 2.0: server-side encounter system.
 * All outcomes are determined here. AI only narrates.
 */

import { randInt, rollRarity, GAME_CONFIG } from './config.js';
import { REGIONS, spawnEnemy } from './regions.js';
import { getPetAbilityTriggerChance } from './pets.js';
import type { Player, CombatEnemy } from './types.js';

export type EncounterType =
  | 'monster' | 'boss' | 'treasure' | 'ambush' | 'npc' | 'world_event' | 'nothing';

export interface MonsterEncounter  { type: 'monster' | 'boss';  enemy: CombatEnemy; atmosphereLine: string; }
export interface AmbushEncounter   { type: 'ambush';             enemy: CombatEnemy; ambushDamage: number; atmosphereLine: string; }
export interface TreasureEncounter { type: 'treasure'; coins: number; xp: number; rarityLabel: string; rarityEmoji: string; atmosphereLine: string; }
export interface NpcEncounter      { type: 'npc'; npcName: string; npcEmoji: string; reward: { coins: number; xp: number }; dialogue: string; atmosphereLine: string; }
export interface WorldEventEncounter { type: 'world_event'; eventName: string; description: string; reward: { coins: number; xp: number; reputation: number }; atmosphereLine: string; }
export interface NothingEncounter  { type: 'nothing'; atmosphereLine: string; }

export type HuntEncounter =
  | MonsterEncounter | AmbushEncounter | TreasureEncounter
  | NpcEncounter | WorldEventEncounter | NothingEncounter;

const ENCOUNTER_WEIGHTS: Record<EncounterType, number> = {
  monster: 50, boss: 5, treasure: 15, ambush: 10, npc: 8, world_event: 5, nothing: 7,
};

function rollEncounterType(): EncounterType {
  const entries = Object.entries(ENCOUNTER_WEIGHTS) as [EncounterType, number][];
  const total   = entries.reduce((s, [, w]) => s + w, 0);
  let rand      = Math.random() * total;
  for (const [type, weight] of entries) { rand -= weight; if (rand <= 0) return type; }
  return 'monster';
}

const NPCS = [
  { name: 'Wandering Merchant', emoji: '\u{1F9F3}', coinBase: 80,  xpBase: 20,
    dialogues: ['Take these coins, traveller. The road ahead is treacherous.', 'I sell only to the brave. Here, take something for free.'] },
  { name: 'Wounded Knight',     emoji: '\u{1F6E1}\uFE0F', coinBase: 60, xpBase: 30,
    dialogues: ['Save yourself. The beast nearly had me. Here, take my purse.'] },
  { name: 'Mysterious Oracle',  emoji: '\u{1F52E}', coinBase: 40,  xpBase: 60,
    dialogues: ['The stars speak your name. Take this blessing.'] },
  { name: 'Lost Child',         emoji: '\u{1F467}', coinBase: 20,  xpBase: 80,
    dialogues: ['Thank you for not being a monster! Take my lucky coin.'] },
] as const;

const WORLD_EVENTS = [
  { name: 'The Forest Has Gone Silent', description: 'An ancient power stirs. You survive at the eye of the storm.', coinMult: 3, xpMult: 3, repBase: 5 },
  { name: 'Lightning Strikes Twice',    description: 'Wild magic surges through you. You feel stronger.',             coinMult: 2, xpMult: 4, repBase: 3 },
  { name: 'The Dead Rise',              description: 'Undead swarm the area. You cut through all of them.',            coinMult: 4, xpMult: 2, repBase: 8 },
  { name: 'Blood Moon Rising',          description: 'The moon turns red. Enemies flee, leaving their loot.',          coinMult: 5, xpMult: 1, repBase: 2 },
] as const;

export function generateHuntEncounter(player: Player): HuntEncounter {
  const region         = REGIONS[player.region];
  const atmosphereLine = region.atmosphereLines[Math.floor(Math.random() * region.atmosphereLines.length)];

  // Void Entity: void_sight triggers a bonus treasure
  const activePet = player.pets.find((p) => p.id === player.activePet);
  if (activePet?.ability === 'void_sight') {
    if (Math.random() < getPetAbilityTriggerChance(activePet)) {
      const rarityIdx = rollRarity(player.luck + 3);
      const rarity    = GAME_CONFIG.loot.rarityNames[rarityIdx];
      const coins     = randInt(GAME_CONFIG.loot.rarityCoinMin[rarityIdx] * 2, GAME_CONFIG.loot.rarityCoinMax[rarityIdx] * 2);
      return {
        type: 'treasure', coins, xp: Math.floor(coins * 0.35),
        rarityLabel: rarity, rarityEmoji: GAME_CONFIG.loot.rarityEmojis[rarityIdx],
        atmosphereLine: 'Void Sight reveals a hidden cache! ' + atmosphereLine,
      };
    }
  }

  const type = rollEncounterType();

  switch (type) {
    case 'boss':    return { type: 'boss',    enemy: spawnEnemy(region.boss, player.level, player.region), atmosphereLine };
    case 'monster': {
      const pool  = region.enemies;
      const total = pool.reduce((s, e) => s + e.weight, 0);
      let rand    = Math.random() * total;
      let tmpl    = pool[0];
      for (const t of pool) { rand -= t.weight; if (rand <= 0) { tmpl = t; break; } }
      return { type: 'monster', enemy: spawnEnemy(tmpl, player.level, player.region), atmosphereLine };
    }
    case 'ambush': {
      const tmpl  = region.enemies[Math.floor(Math.random() * region.enemies.length)];
      const enemy = spawnEnemy(tmpl, player.level + 2, player.region);
      return { type: 'ambush', ambushDamage: Math.floor(player.maxHp * (0.15 + Math.random() * 0.15)), enemy, atmosphereLine };
    }
    case 'treasure': {
      const rarityIdx = rollRarity(player.luck);
      const rarity    = GAME_CONFIG.loot.rarityNames[rarityIdx];
      const coins     = randInt(GAME_CONFIG.loot.rarityCoinMin[rarityIdx] * 2, GAME_CONFIG.loot.rarityCoinMax[rarityIdx] * 2);
      return { type: 'treasure', coins, xp: Math.floor(coins * 0.3), rarityLabel: rarity, rarityEmoji: GAME_CONFIG.loot.rarityEmojis[rarityIdx], atmosphereLine };
    }
    case 'npc': {
      const npc      = NPCS[Math.floor(Math.random() * NPCS.length)];
      const mult     = region.difficultyMultiplier;
      const dialogue = npc.dialogues[Math.floor(Math.random() * npc.dialogues.length)];
      return { type: 'npc', npcName: npc.name, npcEmoji: npc.emoji, reward: { coins: Math.floor(npc.coinBase * mult), xp: Math.floor(npc.xpBase * mult) }, dialogue, atmosphereLine };
    }
    case 'world_event': {
      const ev   = WORLD_EVENTS[Math.floor(Math.random() * WORLD_EVENTS.length)];
      const base = Math.floor(50 * player.level * region.difficultyMultiplier);
      return { type: 'world_event', eventName: ev.name, description: ev.description, reward: { coins: Math.floor(base * ev.coinMult), xp: Math.floor(base * ev.xpMult), reputation: ev.repBase + Math.floor(player.level / 10) }, atmosphereLine };
    }
    default: return { type: 'nothing', atmosphereLine };
  }
}

export function isOnCooldown(player: Player, action: keyof Player['cooldowns']): { onCooldown: boolean; remainingMs: number } {
  const expires = player.cooldowns[action] ?? 0;
  const now     = Date.now();
  if (expires > now) return { onCooldown: true, remainingMs: expires - now };
  return { onCooldown: false, remainingMs: 0 };
}

export function formatCooldown(ms: number): string {
  if (ms < 60_000)    return `${Math.ceil(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.ceil(ms / 60_000)}m`;
  return `${Math.ceil(ms / 3_600_000)}h`;
}
