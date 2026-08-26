import type { RarityName } from './config.js';

// ─── Enums / Literals ────────────────────────────────────────────────────────────

export type RegionId =
  | 'ashen_village'
  | 'blackwood'
  | 'crimson_wastes'
  | 'abyss'
  | 'celestial_realm';

export type EquipmentSlot =
  | 'weapon'
  | 'armor'
  | 'ring'
  | 'amulet'
  | 'boots'
  | 'helmet';

export type ItemType =
  | 'equipment'
  | 'consumable'
  | 'material'
  | 'key'
  | 'cosmetic';

export type QuestType =
  | 'daily'
  | 'weekly'
  | 'story'
  | 'region'
  | 'combat'
  | 'dungeon'
  | 'collection'
  | 'achievement';

export type QuestStatus = 'active' | 'completed' | 'failed' | 'locked';

export type TitleId =
  | 'novice'
  | 'hunter'
  | 'dragon_slayer'
  | 'millionaire'
  | 'casino_king'
  | 'dungeon_lord'
  | 'abyss_walker'
  | 'godslayer'
  | 'the_unlucky'
  | 'the_immortal';

export type PetRarity = RarityName;

// ─── Items ────────────────────────────────────────────────────────────────────────

export interface ItemStats {
  attack?: number;
  defense?: number;
  luck?: number;
  hp?: number;
  critChance?: number;
  dodgeChance?: number;
}

export interface InventoryItem {
  /** Unique instance ID (uuid) */
  id: string;
  /** Template/definition ID */
  templateId: string;
  name: string;
  type: ItemType;
  rarity: RarityName;
  /** Quantity (1 for unique equipment) */
  quantity: number;
  /** Rolled ONCE at creation, never re-rolled */
  stats?: ItemStats;
  slot?: EquipmentSlot;
  /** ISO timestamp when obtained */
  obtainedAt: string;
  description?: string;
  emoji?: string;
  /** Sell value in coins */
  sellValue: number;
}

export type Equipment = Record<EquipmentSlot, InventoryItem | null>;

// ─── Pets ────────────────────────────────────────────────────────────────────────

export interface Pet {
  id: string;
  name: string;
  emoji: string;
  rarity: PetRarity;
  level: number;
  xp: number;
  coinBonus: number;
  xpBonus: number;
  combatBonus: number;
  ability?: string;
  ownedAt: string;
}

// ─── Quests ───────────────────────────────────────────────────────────────────────

export interface QuestObjective {
  id: string;
  description: string;
  required: number;
  current: number;
  completed: boolean;
}

export interface Quest {
  id: string;
  templateId: string;
  name: string;
  description: string;
  type: QuestType;
  status: QuestStatus;
  objectives: QuestObjective[];
  rewards: {
    xp?: number;
    coins?: number;
    items?: string[];
    reputation?: number;
    title?: TitleId;
  };
  startedAt: string;
  completedAt?: string;
  expiresAt?: string;
}

// ─── Statistics ───────────────────────────────────────────────────────────────────

export interface PlayerStatistics {
  monstersKilled: number;
  bossesKilled: number;
  worldBossesKilled: number;
  deaths: number;
  damageDealt: number;
  damageReceived: number;
  totalCoinsEarned: number;
  totalCoinsSpent: number;
  casinoGamesPlayed: number;
  casinoCoinsWon: number;
  casinoCoinsLost: number;
  blackjackWins: number;
  jackpotsWon: number;
  huntCount: number;
  dungeonsCompleted: number;
  dungeonsAttempted: number;
  itemsCollected: number;
  legendaryItemsFound: number;
  tradesCompleted: number;
  seasonHighestLevel: number;
  seasonTotalDamage: number;
}

function defaultStatistics(): PlayerStatistics {
  return {
    monstersKilled: 0,
    bossesKilled: 0,
    worldBossesKilled: 0,
    deaths: 0,
    damageDealt: 0,
    damageReceived: 0,
    totalCoinsEarned: 0,
    totalCoinsSpent: 0,
    casinoGamesPlayed: 0,
    casinoCoinsWon: 0,
    casinoCoinsLost: 0,
    blackjackWins: 0,
    jackpotsWon: 0,
    huntCount: 0,
    dungeonsCompleted: 0,
    dungeonsAttempted: 0,
    itemsCollected: 0,
    legendaryItemsFound: 0,
    tradesCompleted: 0,
    seasonHighestLevel: 1,
    seasonTotalDamage: 0,
  };
}

// ─── Player ───────────────────────────────────────────────────────────────────────

export interface CooldownMap {
  hunt?: number;
  adventure?: number;
  daily?: number;
  weekly?: number;
  dungeon?: number;
  casino?: number;
  trade?: number;
}

export interface Player {
  userId: string;
  username: string;
  characterName: string;
  createdAt: string;
  updatedAt: string;
  level: number;
  xp: number;
  gold: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  luck: number;
  reputation: number;
  titles: TitleId[];
  activeTitle: TitleId | null;
  region: RegionId;
  unlockedRegions: RegionId[];
  inventory: InventoryItem[];
  equipment: Equipment;
  pets: Pet[];
  activePet: string | null;
  quests: Quest[];
  achievements: string[];
  statistics: PlayerStatistics;
  cooldowns: CooldownMap;
  seasonStats: {
    season: number;
    xpEarned: number;
    coinsEarned: number;
    bossKills: number;
    rank?: number;
  };
}

// ─── Default player factory ───────────────────────────────────────────────────────

export function createDefaultPlayer(userId: string, username: string): Player {
  const now = new Date().toISOString();
  return {
    userId,
    username,
    characterName: username,
    createdAt: now,
    updatedAt: now,
    level: 1,
    xp: 0,
    gold: 100,
    hp: 100,
    maxHp: 100,
    attack: 10,
    defense: 5,
    luck: 1,
    reputation: 0,
    titles: ['novice'],
    activeTitle: 'novice',
    region: 'ashen_village',
    unlockedRegions: ['ashen_village'],
    inventory: [],
    equipment: { weapon: null, armor: null, ring: null, amulet: null, boots: null, helmet: null },
    pets: [],
    activePet: null,
    quests: [],
    achievements: [],
    statistics: defaultStatistics(),
    cooldowns: {},
    seasonStats: { season: 1, xpEarned: 0, coinsEarned: 0, bossKills: 0 },
  };
}

export function migratePlayer(
  stored: Partial<Player> & { userId: string; username: string }
): Player {
  const defaults = createDefaultPlayer(stored.userId, stored.username);
  const merged: Player = { ...defaults, ...stored } as Player;
  merged.equipment = { ...defaults.equipment, ...(stored.equipment ?? {}) } as Equipment;
  merged.statistics = { ...defaults.statistics, ...(stored.statistics ?? {}) };
  merged.cooldowns = { ...defaults.cooldowns, ...(stored.cooldowns ?? {}) };
  merged.seasonStats = { ...defaults.seasonStats, ...(stored.seasonStats ?? {}) };
  if (!Array.isArray(merged.inventory)) merged.inventory = [];
  if (!Array.isArray(merged.pets)) merged.pets = [];
  if (!Array.isArray(merged.quests)) merged.quests = [];
  if (!Array.isArray(merged.achievements)) merged.achievements = [];
  if (!Array.isArray(merged.titles)) merged.titles = ['novice'];
  if (!Array.isArray(merged.unlockedRegions)) merged.unlockedRegions = ['ashen_village'];
  if (!merged.region) merged.region = 'ashen_village';
  return merged;
}

// ─── Combat session ───────────────────────────────────────────────────────────────

export interface CombatEnemy {
  id: string;
  name: string;
  emoji: string;
  level: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  luck: number;
  xpReward: number;
  coinReward: [number, number];
  lootTable: string[];
  isBoss: boolean;
  region: RegionId;
}

export interface CombatSession {
  id: string;
  userId: string;
  guildId: string;
  channelId: string;
  messageId?: string;
  enemy: CombatEnemy;
  playerHp: number;
  playerMaxHp: number;
  turn: number;
  log: string[];
  status: 'active' | 'victory' | 'defeat' | 'fled';
  rewardsClaimed: boolean;
  createdAt: number;
  /** True when player chose Defend this turn — reduces incoming damage by 50% */
  defending?: boolean;
}

// ─── Guild ────────────────────────────────────────────────────────────────────────

export interface Guild {
  guildId: string;
  name: string;
  level: number;
  power: number;
  treasury: number;
  memberIds: string[];
  upgrades: Record<string, number>;
  createdAt: string;
}

// ─── World Boss ───────────────────────────────────────────────────────────────────

export interface WorldBoss {
  id: string;
  name: string;
  emoji: string;
  region: RegionId;
  maxHp: number;
  currentHp: number;
  participants: Record<string, number>;
  status: 'active' | 'defeated' | 'expired';
  spawnedAt: string;
  expiresAt: string;
  rewardsClaimed: boolean;
  mvpUserId?: string;
}

// ─── Jackpot ──────────────────────────────────────────────────────────────────────

export interface JackpotState {
  pool: number;
  lastWinnerId?: string;
  lastWinnerName?: string;
  lastWinAmount?: number;
  lastWonAt?: string;
  totalWins: number;
  totalPaidOut: number;
}
