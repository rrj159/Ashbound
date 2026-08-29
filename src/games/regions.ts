import type { RegionId, CombatEnemy } from './types.js';
import { randInt } from './config.js';
import { v4 as uuidv4 } from 'uuid';

// ─── Region definition ─────────────────────────────────────────────────────────

export interface RegionEnemy {
  templateId: string;
  name: string;
  emoji: string;
  levelRange: [number, number];
  hpBase: number;
  hpPerLevel: number;
  attackBase: number;
  attackPerLevel: number;
  defenseBase: number;
  defensePerLevel: number;
  luck: number;
  xpBase: number;
  xpPerLevel: number;
  coinMin: number;
  coinMax: number;
  weight: number; // encounter weight (higher = more common)
  isBoss: boolean;
  lootTable: string[];
}

export interface RegionDefinition {
  id: RegionId;
  name: string;
  emoji: string;
  description: string;
  atmosphere: string;
  /** Min player level to enter */
  minLevel: number;
  /** Previous region that must be cleared to unlock this one */
  unlocksAfter?: RegionId;
  /** Number of boss kills in previous region required */
  bossKillsRequired?: number;
  difficultyMultiplier: number;
  enemies: RegionEnemy[];
  boss: RegionEnemy;
  /** Ambient flavour lines shown during exploration */
  atmosphereLines: string[];
}

// ─── Enemy template to CombatEnemy instance ───────────────────────────────────

export function spawnEnemy(
  template: RegionEnemy,
  playerLevel: number,
  region: RegionId
): CombatEnemy {
  const level = Math.max(
    template.levelRange[0],
    Math.min(
      template.levelRange[1],
      playerLevel + randInt(-2, 3)
    )
  );
  return {
    id: uuidv4(),
    name: template.name,
    emoji: template.emoji,
    level,
    hp: template.hpBase + template.hpPerLevel * level,
    maxHp: template.hpBase + template.hpPerLevel * level,
    attack: template.attackBase + template.attackPerLevel * level,
    defense: template.defenseBase,
    luck: template.luck,
    xpReward: template.xpBase + template.xpPerLevel * level,
    coinReward: [
      template.coinMin,
      template.coinMax + level * 5,
    ],
    lootTable: template.lootTable,
    isBoss: template.isBoss,
    region,
  };
}

/** Weighted-random pick from region enemy pool (excludes boss) */
export function pickEncounterEnemy(region: RegionDefinition, playerLevel: number): CombatEnemy {
  const pool = region.enemies;
  const totalWeight = pool.reduce((s, e) => s + e.weight, 0);
  let rand = Math.random() * totalWeight;
  for (const template of pool) {
    rand -= template.weight;
    if (rand <= 0) return spawnEnemy(template, playerLevel, region.id);
  }
  return spawnEnemy(pool[0], playerLevel, region.id);
}

// ─── Region definitions ────────────────────────────────────────────────────────

export const REGIONS: Record<RegionId, RegionDefinition> = {
  ashen_village: {
    id: 'ashen_village',
    name: 'Ashen Village',
    emoji: '🌑',
    description: 'A smouldering ruin at the edge of the known world. The ash never settles here.',
    atmosphere: 'The warm glow of dying embers lights your path.',
    minLevel: 1,
    difficultyMultiplier: 1.0,
    atmosphereLines: [
      'The ash drifts lazily through the air.',
      'Charred ruins stretch in every direction.',
      'A crow watches you from a blackened beam.',
      'Something rustles in the soot.',
      'The ground is warm underfoot.',
    ],
    enemies: [
      {
        templateId: 'ash_rat',
        name: 'Ash Rat',
        emoji: '🐀',
        levelRange: [1, 8],
        hpBase: 20, hpPerLevel: 5,
        attackBase: 4, attackPerLevel: 1,
        defenseBase: 1, defensePerLevel: 0,
        luck: 1,
        xpBase: 10, xpPerLevel: 3,
        coinMin: 2, coinMax: 15,
        weight: 35,
        isBoss: false,
        lootTable: ['ash_rat_pelt', 'small_coin_pouch'],
      },
      {
        templateId: 'ember_wolf',
        name: 'Ember Wolf',
        emoji: '🐺',
        levelRange: [2, 12],
        hpBase: 40, hpPerLevel: 8,
        attackBase: 7, attackPerLevel: 2,
        defenseBase: 2, defensePerLevel: 0,
        luck: 2,
        xpBase: 20, xpPerLevel: 5,
        coinMin: 8, coinMax: 35,
        weight: 30,
        isBoss: false,
        lootTable: ['wolf_fang', 'ember_pelt', 'small_coin_pouch'],
      },
      {
        templateId: 'hollow_shade',
        name: 'Hollow Shade',
        emoji: '👻',
        levelRange: [3, 15],
        hpBase: 35, hpPerLevel: 7,
        attackBase: 9, attackPerLevel: 2,
        defenseBase: 1, defensePerLevel: 0,
        luck: 3,
        xpBase: 25, xpPerLevel: 6,
        coinMin: 5, coinMax: 25,
        weight: 20,
        isBoss: false,
        lootTable: ['shadow_essence', 'spirit_shard'],
      },
      {
        templateId: 'ashen_bandit',
        name: 'Ashen Bandit',
        emoji: '🗡️',
        levelRange: [4, 15],
        hpBase: 50, hpPerLevel: 9,
        attackBase: 10, attackPerLevel: 3,
        defenseBase: 3, defensePerLevel: 0,
        luck: 2,
        xpBase: 30, xpPerLevel: 7,
        coinMin: 15, coinMax: 60,
        weight: 15,
        isBoss: false,
        lootTable: ['rusty_blade', 'leather_scrap', 'coin_purse'],
      },
    ],
    boss: {
      templateId: 'ashen_warlord',
      name: 'Ashen Warlord',
      emoji: '👑',
      levelRange: [10, 20],
      hpBase: 300, hpPerLevel: 30,
      attackBase: 25, attackPerLevel: 5,
      defenseBase: 10, defensePerLevel: 1,
      luck: 5,
      xpBase: 200, xpPerLevel: 30,
      coinMin: 100, coinMax: 400,
      weight: 1,
      isBoss: true,
      lootTable: ['warlord_helm', 'ashen_blade', 'rare_coin_chest'],
    },
  },

  blackwood: {
    id: 'blackwood',
    name: 'Blackwood',
    emoji: '🌲',
    description: 'A cursed forest where the trees bleed dark sap and nothing natural survives.',
    atmosphere: 'The canopy blocks all light. Eyes glow between the roots.',
    minLevel: 10,
    unlocksAfter: 'ashen_village',
    bossKillsRequired: 1,
    difficultyMultiplier: 1.8,
    atmosphereLines: [
      'Something ancient stirs in the roots.',
      'The trees lean toward you as you pass.',
      'A distant howl echoes through the black canopy.',
      'Dark sap drips from wounds in the bark.',
      'The silence here is wrong.',
    ],
    enemies: [
      {
        templateId: 'black_wolf',
        name: 'Black Wolf',
        emoji: '🐺',
        levelRange: [10, 22],
        hpBase: 80, hpPerLevel: 12,
        attackBase: 15, attackPerLevel: 3,
        defenseBase: 4, defensePerLevel: 1,
        luck: 3,
        xpBase: 50, xpPerLevel: 10,
        coinMin: 20, coinMax: 70,
        weight: 30,
        isBoss: false,
        lootTable: ['black_wolf_pelt', 'fang_necklace'],
      },
      {
        templateId: 'undead_knight',
        name: 'Undead Knight',
        emoji: '🧟',
        levelRange: [12, 25],
        hpBase: 120, hpPerLevel: 15,
        attackBase: 18, attackPerLevel: 4,
        defenseBase: 8, defensePerLevel: 2,
        luck: 2,
        xpBase: 70, xpPerLevel: 12,
        coinMin: 30, coinMax: 100,
        weight: 25,
        isBoss: false,
        lootTable: ['rusty_armor', 'undead_core', 'bone_shard'],
      },
      {
        templateId: 'corrupted_druid',
        name: 'Corrupted Druid',
        emoji: '🧙',
        levelRange: [14, 28],
        hpBase: 100, hpPerLevel: 13,
        attackBase: 22, attackPerLevel: 5,
        defenseBase: 5, defensePerLevel: 1,
        luck: 6,
        xpBase: 80, xpPerLevel: 14,
        coinMin: 25, coinMax: 90,
        weight: 25,
        isBoss: false,
        lootTable: ['druid_staff', 'nature_crystal', 'corrupted_seed'],
      },
      {
        templateId: 'shadow_demon',
        name: 'Shadow Demon',
        emoji: '👹',
        levelRange: [16, 30],
        hpBase: 140, hpPerLevel: 18,
        attackBase: 26, attackPerLevel: 6,
        defenseBase: 7, defensePerLevel: 1,
        luck: 8,
        xpBase: 100, xpPerLevel: 18,
        coinMin: 40, coinMax: 130,
        weight: 20,
        isBoss: false,
        lootTable: ['shadow_core', 'demon_horn', 'dark_gem'],
      },
    ],
    boss: {
      templateId: 'ancient_treant',
      name: 'Ancient Treant',
      emoji: '🌳',
      levelRange: [20, 35],
      hpBase: 800, hpPerLevel: 50,
      attackBase: 45, attackPerLevel: 8,
      defenseBase: 18, defensePerLevel: 3,
      luck: 5,
      xpBase: 500, xpPerLevel: 60,
      coinMin: 300, coinMax: 900,
      weight: 1,
      isBoss: true,
      lootTable: ['treant_heart', 'ancient_bark_shield', 'nature_crystal_large'],
    },
  },

  crimson_wastes: {
    id: 'crimson_wastes',
    name: 'Crimson Wastes',
    emoji: '🔥',
    description: 'An endless hellscape of blood-red sand and fire geysers. The sky burns red.',
    atmosphere: 'The heat is unbearable. The sky bleeds.',
    minLevel: 25,
    unlocksAfter: 'blackwood',
    bossKillsRequired: 1,
    difficultyMultiplier: 3.0,
    atmosphereLines: [
      'A fire geyser erupts nearby.',
      'The red sand shifts beneath your feet.',
      'Bones of the fallen litter the ground.',
      'The air tastes of sulphur and ash.',
      'Something massive moves beneath the dunes.',
    ],
    enemies: [
      {
        templateId: 'fire_imp',
        name: 'Fire Imp',
        emoji: '😈',
        levelRange: [25, 38],
        hpBase: 160, hpPerLevel: 18,
        attackBase: 35, attackPerLevel: 7,
        defenseBase: 8, defensePerLevel: 1,
        luck: 5,
        xpBase: 120, xpPerLevel: 20,
        coinMin: 50, coinMax: 180,
        weight: 30,
        isBoss: false,
        lootTable: ['imp_claw', 'fire_shard', 'ember_gem'],
      },
      {
        templateId: 'lava_golem',
        name: 'Lava Golem',
        emoji: '🗿',
        levelRange: [27, 42],
        hpBase: 250, hpPerLevel: 25,
        attackBase: 40, attackPerLevel: 8,
        defenseBase: 20, defensePerLevel: 3,
        luck: 2,
        xpBase: 150, xpPerLevel: 25,
        coinMin: 60, coinMax: 200,
        weight: 25,
        isBoss: false,
        lootTable: ['lava_stone', 'molten_core', 'heat_crystal'],
      },
      {
        templateId: 'blood_wraith',
        name: 'Blood Wraith',
        emoji: '💀',
        levelRange: [30, 45],
        hpBase: 200, hpPerLevel: 22,
        attackBase: 50, attackPerLevel: 10,
        defenseBase: 12, defensePerLevel: 2,
        luck: 10,
        xpBase: 180, xpPerLevel: 28,
        coinMin: 70, coinMax: 250,
        weight: 25,
        isBoss: false,
        lootTable: ['blood_crystal', 'wraith_essence', 'crimson_gem'],
      },
      {
        templateId: 'dragon_hatchling',
        name: 'Dragon Hatchling',
        emoji: '🐲',
        levelRange: [32, 48],
        hpBase: 280, hpPerLevel: 30,
        attackBase: 55, attackPerLevel: 12,
        defenseBase: 15, defensePerLevel: 3,
        luck: 8,
        xpBase: 220, xpPerLevel: 35,
        coinMin: 90, coinMax: 350,
        weight: 20,
        isBoss: false,
        lootTable: ['dragon_scale', 'dragon_fang', 'fire_gem'],
      },
    ],
    boss: {
      templateId: 'infernal_dragon',
      name: 'Infernal Dragon',
      emoji: '🐉',
      levelRange: [40, 55],
      hpBase: 2000, hpPerLevel: 100,
      attackBase: 90, attackPerLevel: 15,
      defenseBase: 30, defensePerLevel: 5,
      luck: 12,
      xpBase: 1500, xpPerLevel: 150,
      coinMin: 1000, coinMax: 3500,
      weight: 1,
      isBoss: true,
      lootTable: ['infernal_core', 'dragon_lord_armor', 'flame_sword'],
    },
  },

  abyss: {
    id: 'abyss',
    name: 'The Abyss',
    emoji: '☠️',
    description: 'A void between worlds. Reality unravels here. The dead walk freely.',
    atmosphere: 'There is no light. There is no sound. There is only the Abyss.',
    minLevel: 45,
    unlocksAfter: 'crimson_wastes',
    bossKillsRequired: 1,
    difficultyMultiplier: 5.0,
    atmosphereLines: [
      'Your torch goes out. Something laughs.',
      'Reality flickers here.',
      'You hear your own name whispered.',
      'The ground is not solid. You fall slightly with each step.',
      'The dead look at you with recognition.',
    ],
    enemies: [
      {
        templateId: 'void_walker',
        name: 'Void Walker',
        emoji: '🌀',
        levelRange: [45, 60],
        hpBase: 400, hpPerLevel: 35,
        attackBase: 80, attackPerLevel: 14,
        defenseBase: 20, defensePerLevel: 3,
        luck: 15,
        xpBase: 300, xpPerLevel: 45,
        coinMin: 150, coinMax: 500,
        weight: 30,
        isBoss: false,
        lootTable: ['void_shard', 'abyss_crystal', 'dark_matter'],
      },
      {
        templateId: 'abyss_demon',
        name: 'Abyss Demon',
        emoji: '😱',
        levelRange: [48, 65],
        hpBase: 500, hpPerLevel: 40,
        attackBase: 95, attackPerLevel: 18,
        defenseBase: 25, defensePerLevel: 3,
        luck: 18,
        xpBase: 380, xpPerLevel: 55,
        coinMin: 200, coinMax: 700,
        weight: 25,
        isBoss: false,
        lootTable: ['demon_soul', 'abyss_gem', 'void_core'],
      },
      {
        templateId: 'lich',
        name: 'Ancient Lich',
        emoji: '💀',
        levelRange: [50, 70],
        hpBase: 600, hpPerLevel: 45,
        attackBase: 110, attackPerLevel: 20,
        defenseBase: 30, defensePerLevel: 4,
        luck: 20,
        xpBase: 450, xpPerLevel: 65,
        coinMin: 250, coinMax: 900,
        weight: 25,
        isBoss: false,
        lootTable: ['lich_phylactery', 'death_crystal', 'ancient_tome'],
      },
      {
        templateId: 'shadow_titan',
        name: 'Shadow Titan',
        emoji: '👁️',
        levelRange: [55, 75],
        hpBase: 800, hpPerLevel: 55,
        attackBase: 130, attackPerLevel: 24,
        defenseBase: 40, defensePerLevel: 5,
        luck: 25,
        xpBase: 600, xpPerLevel: 85,
        coinMin: 350, coinMax: 1200,
        weight: 20,
        isBoss: false,
        lootTable: ['titan_core', 'shadow_crown', 'void_blade'],
      },
    ],
    boss: {
      templateId: 'abyss_lord',
      name: 'Lord of the Abyss',
      emoji: '👁️',
      levelRange: [65, 80],
      hpBase: 5000, hpPerLevel: 200,
      attackBase: 180, attackPerLevel: 30,
      defenseBase: 55, defensePerLevel: 8,
      luck: 30,
      xpBase: 5000, xpPerLevel: 500,
      coinMin: 3000, coinMax: 10000,
      weight: 1,
      isBoss: true,
      lootTable: ['abyss_throne_fragment', 'void_sovereign_armor', 'oblivion_blade'],
    },
  },

  celestial_realm: {
    id: 'celestial_realm',
    name: 'Celestial Realm',
    emoji: '✨',
    description: 'Beyond the Abyss lies a realm of blinding light and impossible architecture.',
    atmosphere: 'You have transcended. The gods watch.',
    minLevel: 70,
    unlocksAfter: 'abyss',
    bossKillsRequired: 1,
    difficultyMultiplier: 8.0,
    atmosphereLines: [
      'Celestial choirs echo from impossible heights.',
      'The architecture defies gravity and reason.',
      'You feel the gaze of something infinite.',
      'Stars drift slowly past at eye level.',
      'Every surface hums with ancient power.',
    ],
    enemies: [
      {
        templateId: 'fallen_angel',
        name: 'Fallen Angel',
        emoji: '👼',
        levelRange: [70, 85],
        hpBase: 900, hpPerLevel: 60,
        attackBase: 180, attackPerLevel: 28,
        defenseBase: 50, defensePerLevel: 5,
        luck: 30,
        xpBase: 700, xpPerLevel: 100,
        coinMin: 500, coinMax: 2000,
        weight: 30,
        isBoss: false,
        lootTable: ['angel_feather', 'divine_shard', 'celestial_crystal'],
      },
      {
        templateId: 'celestial_construct',
        name: 'Celestial Construct',
        emoji: '🤖',
        levelRange: [72, 88],
        hpBase: 1100, hpPerLevel: 70,
        attackBase: 200, attackPerLevel: 32,
        defenseBase: 65, defensePerLevel: 6,
        luck: 28,
        xpBase: 850, xpPerLevel: 120,
        coinMin: 600, coinMax: 2500,
        weight: 25,
        isBoss: false,
        lootTable: ['construct_core', 'celestial_alloy', 'divine_spark'],
      },
      {
        templateId: 'god_fragment',
        name: 'Fragment of a God',
        emoji: '⚡',
        levelRange: [75, 92],
        hpBase: 1300, hpPerLevel: 80,
        attackBase: 230, attackPerLevel: 38,
        defenseBase: 75, defensePerLevel: 7,
        luck: 40,
        xpBase: 1100, xpPerLevel: 160,
        coinMin: 900, coinMax: 3500,
        weight: 25,
        isBoss: false,
        lootTable: ['divine_fragment', 'god_shard', 'celestial_heart'],
      },
      {
        templateId: 'seraph',
        name: 'Seraph Guardian',
        emoji: '🌟',
        levelRange: [80, 98],
        hpBase: 1600, hpPerLevel: 95,
        attackBase: 260, attackPerLevel: 45,
        defenseBase: 90, defensePerLevel: 8,
        luck: 50,
        xpBase: 1500, xpPerLevel: 220,
        coinMin: 1200, coinMax: 5000,
        weight: 20,
        isBoss: false,
        lootTable: ['seraph_wing', 'divine_core', 'celestial_crown'],
      },
    ],
    boss: {
      templateId: 'fallen_god',
      name: 'The Fallen God',
      emoji: '🌌',
      levelRange: [90, 100],
      hpBase: 20000, hpPerLevel: 500,
      attackBase: 400, attackPerLevel: 60,
      defenseBase: 120, defensePerLevel: 12,
      luck: 60,
      xpBase: 20000, xpPerLevel: 2000,
      coinMin: 10000, coinMax: 50000,
      weight: 1,
      isBoss: true,
      lootTable: ['gods_heart', 'divine_sovereign_set', 'creation_blade', 'celestial_throne'],
    },
  },
};

/** Check if a player can access a region */
export function canAccessRegion(
  playerLevel: number,
  unlockedRegions: RegionId[],
  regionId: RegionId
): { allowed: boolean; reason?: string } {
  const region = REGIONS[regionId];
  if (!region) return { allowed: false, reason: 'Unknown region.' };

  if (!unlockedRegions.includes(regionId)) {
    const prev = region.unlocksAfter ? REGIONS[region.unlocksAfter] : null;
    return {
      allowed: false,
      reason: prev
        ? `You must defeat the ${prev.boss.name} in ${prev.name} first.`
        : 'Region locked.',
    };
  }

  if (playerLevel < region.minLevel) {
    return {
      allowed: false,
      reason: `You need to be level **${region.minLevel}** to enter ${region.name}. (You are level ${playerLevel})`,
    };
  }

  return { allowed: true };
}

/** Unlock the next region after defeating a boss — returns null if already at end */
export function tryUnlockNextRegion(
  bossRegionId: RegionId,
  playerLevel: number,
  bossKillsInRegion: number,
  currentUnlocked: RegionId[]
): RegionId | null {
  const order: RegionId[] = [
    'ashen_village',
    'blackwood',
    'crimson_wastes',
    'abyss',
    'celestial_realm',
  ];
  const nextId = order[order.indexOf(bossRegionId) + 1];
  if (!nextId) return null;

  const nextRegion = REGIONS[nextId];
  if (currentUnlocked.includes(nextId)) return null;

  const required = nextRegion.bossKillsRequired ?? 1;
  if (bossKillsInRegion < required) return null;
  if (playerLevel < nextRegion.minLevel) return null;

  return nextId;
}
