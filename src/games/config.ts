/**
 * Central game configuration for Ashen Realms.
 * All balancing numbers live here. Never scatter magic numbers in commands.
 */

export const GAME_CONFIG = {
  // ─── XP & Leveling ──────────────────────────────────────────────────────────
  xp: {
    /** XP required for level N = BASE * (N ^ EXPONENT) */
    base: 100,
    exponent: 1.5,
    /** Max player level */
    maxLevel: 100,
    /** XP multiplier per rarity tier (index = rarity index) */
    rarityMultiplier: [1, 1.2, 1.5, 2.0, 3.0, 5.0, 8.0],
  },

  // ─── Economy ────────────────────────────────────────────────────────────────
  economy: {
    startingCoins: 100,
    /** Max coins a player can hold */
    maxCoins: 999_999_999,
    dailyReward: 500,
    weeklyReward: 5000,
  },

  // ─── Combat ─────────────────────────────────────────────────────────────────
  combat: {
    /** Seconds a combat session remains valid for button interactions */
    sessionTtlSeconds: 120,
    /** Base crit chance 0-1 */
    baseCritChance: 0.05,
    /** Crit damage multiplier */
    critMultiplier: 2.0,
    /** Base dodge chance 0-1 */
    baseDodgeChance: 0.03,
    /** Luck stat increases dodge by this factor */
    luckDodgeFactor: 0.002,
    /** Each point of defense reduces incoming damage by this fraction */
    defenseReductionFactor: 0.01,
    /** Flee success chance base 0-1 */
    fleeBaseChance: 0.5,
  },

  // ─── Cooldowns (milliseconds) ───────────────────────────────────────────────
  cooldowns: {
    hunt: 30_000,
    adventure: 30_000,
    daily: 86_400_000,
    weekly: 604_800_000,
    dungeon: 3_600_000,
    worldBoss: 300_000,
    casino: 10_000,
    trade: 5_000,
  },

  // ─── Loot / Rarity ──────────────────────────────────────────────────────────
  loot: {
    /** Drop chance per rarity [common, uncommon, rare, epic, legendary, mythic, divine] */
    rarityWeights: [50, 25, 15, 7, 2.5, 0.4, 0.1],
    rarityNames: ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Divine'] as const,
    rarityEmojis: ['⬜', '🟩', '🟦', '🟪', '🟧', '🔴', '✨'],
    /** Coin rewards per rarity */
    rarityCoinMin: [5, 15, 40, 100, 300, 1000, 5000],
    rarityCoinMax: [20, 50, 120, 350, 900, 3000, 15000],
  },

  // ─── Equipment stat ranges per rarity ──────────────────────────────────────
  equipment: {
    attackRange: [
      [1, 5],    // Common
      [4, 10],   // Uncommon
      [8, 20],   // Rare
      [18, 35],  // Epic
      [30, 55],  // Legendary
      [50, 80],  // Mythic
      [75, 120], // Divine
    ] as [number, number][],
    defenseRange: [
      [1, 4],
      [3, 8],
      [7, 15],
      [13, 28],
      [25, 45],
      [40, 65],
      [60, 100],
    ] as [number, number][],
    luckRange: [
      [0, 1],
      [1, 2],
      [1, 3],
      [2, 5],
      [4, 8],
      [6, 12],
      [10, 20],
    ] as [number, number][],
  },

  // ─── Dungeons ───────────────────────────────────────────────────────────────
  dungeon: {
    maxPartySize: 5,
    minPartySize: 1,
    /** Seconds to wait for party members before dungeon expires */
    partyWaitSeconds: 120,
    floors: 5,
    bossFloor: 5,
  },

  // ─── World Bosses ───────────────────────────────────────────────────────────
  worldBoss: {
    /** HP multiplier per active participant */
    hpPerParticipant: 50_000,
    baseHp: 1_000_000,
    /** How long (ms) a world boss stays active */
    durationMs: 3_600_000,
    /** Min players to spawn */
    minPlayers: 3,
  },

  // ─── Casino ─────────────────────────────────────────────────────────────────
  casino: {
    minBet: 10,
    maxBet: 100_000,
    jackpotSeedAmount: 10_000,
    /** % of each bet added to jackpot pool */
    jackpotContributionRate: 0.02,
    slotSymbols: ['🍒', '🍋', '🍊', '🍇', '⭐', '💎', '🔥'] as const,
  },

  // ─── Pets ───────────────────────────────────────────────────────────────────
  pets: {
    maxLevel: 50,
    xpPerLevel: 200,
  },

  // ─── Seasons ────────────────────────────────────────────────────────────────
  season: {
    current: 1,
    name: 'Rise of Ash',
  },
} as const;

/** XP required to reach a given level */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(
    GAME_CONFIG.xp.base * Math.pow(level - 1, GAME_CONFIG.xp.exponent)
  );
}

/** Total XP needed to go from level N to N+1 */
export function xpToNextLevel(level: number): number {
  return xpForLevel(level + 1) - xpForLevel(level);
}

/** Compute level from total accumulated XP */
export function levelFromXp(totalXp: number): number {
  let level = 1;
  while (
    level < GAME_CONFIG.xp.maxLevel &&
    xpForLevel(level + 1) <= totalXp
  ) {
    level++;
  }
  return level;
}

export type RarityName = typeof GAME_CONFIG.loot.rarityNames[number];
export type RarityIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Roll a rarity using weighted random */
export function rollRarity(luckBonus = 0): RarityIndex {
  const weights = [...GAME_CONFIG.loot.rarityWeights];
  // Luck shifts weight toward higher rarities slightly
  const shift = Math.min(luckBonus * 0.1, 5);
  for (let i = 3; i < weights.length; i++) {
    weights[i] += shift;
    weights[i - 1] -= shift / 2;
  }
  const total = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return i as RarityIndex;
  }
  return 0;
}

/** Random int inclusive */
export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
