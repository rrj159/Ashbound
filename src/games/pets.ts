/**
 * Pet catalog, leveling, evolution, and ability helpers.
 * All bonuses are deterministic.
 */

import { v4 as uuidv4 } from 'uuid';
import { GAME_CONFIG } from './config.js';
import type { Pet, PetRarity } from './types.js';

export interface PetEvolutionStage {
  name: string;
  emoji: string;
  minLevel: number;
  coinBonus: number;
  xpBonus: number;
  combatBonus: number;
  ability?: string;
  abilityDescription?: string;
}

export interface PetTemplate {
  id: string;
  rarity: PetRarity;
  description: string;
  xpPerLevel: number;
  stages: [PetEvolutionStage, ...PetEvolutionStage[]];
}

export const PET_CATALOG: Readonly<Record<string, PetTemplate>> = {
  ash_cat: {
    id: 'ash_cat',
    rarity: 'Common',
    description: 'A singed cat that always finds the shiniest coins in the ashes.',
    xpPerLevel: 150,
    stages: [
      { name: 'Ash Kitten', emoji: '\u{1F431}', minLevel: 1,  coinBonus: 0.05, xpBonus: 0.00, combatBonus: 0.00 },
      { name: 'Ash Cat',    emoji: '\u{1F638}', minLevel: 10, coinBonus: 0.08, xpBonus: 0.02, combatBonus: 0.00 },
      { name: 'Ember Cat',  emoji: '\u{1F525}', minLevel: 25, coinBonus: 0.12, xpBonus: 0.04, combatBonus: 0.02 },
    ],
  },
  shadow_fox: {
    id: 'shadow_fox',
    rarity: 'Uncommon',
    description: 'A nimble fox that learns from every encounter and boosts your XP gains.',
    xpPerLevel: 175,
    stages: [
      { name: 'Shadow Cub',  emoji: '\u{1F98A}', minLevel: 1,  coinBonus: 0.00, xpBonus: 0.08, combatBonus: 0.00 },
      { name: 'Shadow Fox',  emoji: '\u{1F98A}', minLevel: 10, coinBonus: 0.02, xpBonus: 0.12, combatBonus: 0.02 },
      { name: 'Phantom Fox', emoji: '\u{1F47B}', minLevel: 25, coinBonus: 0.05, xpBonus: 0.18, combatBonus: 0.05 },
    ],
  },
  dire_wolf: {
    id: 'dire_wolf',
    rarity: 'Rare',
    description: 'A ferocious wolf that amplifies your combat power.',
    xpPerLevel: 200,
    stages: [
      { name: 'Wolf Pup',    emoji: '\u{1F43A}', minLevel: 1,  coinBonus: 0.00, xpBonus: 0.00, combatBonus: 0.10 },
      { name: 'Dire Wolf',   emoji: '\u{1F43A}', minLevel: 10, coinBonus: 0.00, xpBonus: 0.03, combatBonus: 0.15 },
      { name: 'Feral Alpha', emoji: '\u{1F315}', minLevel: 25, coinBonus: 0.03, xpBonus: 0.05, combatBonus: 0.22 },
    ],
  },
  ember_dragon: {
    id: 'ember_dragon',
    rarity: 'Legendary',
    description: 'An ancient dragon hatchling that supercharges XP and coin gains.',
    xpPerLevel: 300,
    stages: [
      { name: 'Ember Wyrm',     emoji: '\u{1F432}', minLevel: 1,  coinBonus: 0.05, xpBonus: 0.15, combatBonus: 0.05 },
      { name: 'Ember Dragon',   emoji: '\u{1F409}', minLevel: 15, coinBonus: 0.08, xpBonus: 0.20, combatBonus: 0.08 },
      { name: 'Infernal Drake', emoji: '\u{1F525}', minLevel: 30, coinBonus: 0.12, xpBonus: 0.30, combatBonus: 0.12 },
    ],
  },
  void_entity: {
    id: 'void_entity',
    rarity: 'Mythic',
    description: 'A being from beyond reality. Its void sight reveals hidden treasures.',
    xpPerLevel: 400,
    stages: [
      {
        name: 'Void Wisp', emoji: '\u{1F300}', minLevel: 1,
        coinBonus: 0.03, xpBonus: 0.03, combatBonus: 0.05,
        ability: 'void_sight',
        abilityDescription: '10% chance per hunt to reveal a hidden treasure cache.',
      },
      {
        name: 'Void Entity', emoji: '\u{1F441}\uFE0F', minLevel: 15,
        coinBonus: 0.05, xpBonus: 0.05, combatBonus: 0.08,
        ability: 'void_sight',
        abilityDescription: '15% chance per hunt to reveal a hidden treasure cache.',
      },
      {
        name: 'Chaos Incarnate', emoji: '\u{1F30C}', minLevel: 30,
        coinBonus: 0.08, xpBonus: 0.08, combatBonus: 0.12,
        ability: 'void_sight',
        abilityDescription: '25% chance per hunt to reveal a hidden treasure cache.',
      },
    ],
  },
} as const;

export function getPetStage(templateId: string, level: number): PetEvolutionStage | null {
  const template = PET_CATALOG[templateId];
  if (!template) return null;
  let current = template.stages[0];
  for (const stage of template.stages) {
    if (level >= stage.minLevel) current = stage;
  }
  return current;
}

export function createPet(templateId: string): Pet | null {
  const template = PET_CATALOG[templateId];
  if (!template) return null;
  const stage = template.stages[0];
  return {
    id: uuidv4(),
    templateId,
    name: stage.name,
    emoji: stage.emoji,
    rarity: template.rarity,
    level: 1,
    xp: 0,
    coinBonus:   stage.coinBonus,
    xpBonus:     stage.xpBonus,
    combatBonus: stage.combatBonus,
    ability:     stage.ability,
    ownedAt: new Date().toISOString(),
  };
}

export function addPetXp(pet: Pet, xpGain: number): Pet {
  if (xpGain <= 0) return pet;
  const template    = pet.templateId ? PET_CATALOG[pet.templateId] : null;
  const xpPerLevel  = template?.xpPerLevel ?? GAME_CONFIG.pets.xpPerLevel;
  const maxLevel    = GAME_CONFIG.pets.maxLevel;
  let newXp    = pet.xp + xpGain;
  let newLevel = pet.level;
  while (newLevel < maxLevel && newXp >= newLevel * xpPerLevel) {
    newXp   -= newLevel * xpPerLevel;
    newLevel += 1;
  }
  if (newLevel === pet.level) return { ...pet, xp: newXp };
  const newStage = template ? getPetStage(template.id, newLevel) : null;
  return {
    ...pet,
    level: newLevel, xp: newXp,
    name:        newStage?.name        ?? pet.name,
    emoji:       newStage?.emoji       ?? pet.emoji,
    coinBonus:   newStage?.coinBonus   ?? pet.coinBonus,
    xpBonus:     newStage?.xpBonus     ?? pet.xpBonus,
    combatBonus: newStage?.combatBonus ?? pet.combatBonus,
    ability:     newStage?.ability     ?? pet.ability,
  };
}

export function getPetAbilityTriggerChance(pet: Pet): number {
  if (pet.ability !== 'void_sight') return 0;
  if (pet.level >= 30) return 0.25;
  if (pet.level >= 15) return 0.15;
  return 0.10;
}

export function xpToNextPetLevel(pet: Pet): number {
  const template   = pet.templateId ? PET_CATALOG[pet.templateId] : null;
  const xpPerLevel = template?.xpPerLevel ?? GAME_CONFIG.pets.xpPerLevel;
  return pet.level * xpPerLevel;
}

export function formatPetBonuses(pet: Pet): string {
  const parts: string[] = [];
  if (pet.coinBonus   > 0) parts.push(`+${(pet.coinBonus   * 100).toFixed(0)}% coins`);
  if (pet.xpBonus     > 0) parts.push(`+${(pet.xpBonus     * 100).toFixed(0)}% XP`);
  if (pet.combatBonus > 0) parts.push(`+${(pet.combatBonus * 100).toFixed(0)}% combat`);
  if (pet.ability)         parts.push(`void_sight` === pet.ability ? 'void sight' : pet.ability.replace(/_/g, ' '));
  return parts.join(' | ') || '_No bonuses_';
}
