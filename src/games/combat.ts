/**
 * Reusable combat engine for Ashen Realms.
 * ALL game results (damage, XP, coins, loot) are determined here.
 * AI may narrate results but NEVER determines them.
 */

import { v4 as uuidv4 } from 'uuid';
import { GAME_CONFIG, rollRarity, randInt } from './config.js';
import type { Player, CombatSession, CombatEnemy, InventoryItem, EquipmentSlot } from './types.js';
import { REGIONS } from './regions.js';

// ─── Effective player stats (base + equipment bonuses) ────────────────────────

export interface EffectiveStats {
  attack: number;
  defense: number;
  luck: number;
  hp: number;
  maxHp: number;
  critChance: number;
  dodgeChance: number;
  coinBonus: number;
  xpBonus: number;
}

export function getEffectiveStats(player: Player): EffectiveStats {
  let attack = player.attack;
  let defense = player.defense;
  let luck = player.luck;
  let hp = player.hp;
  let maxHp = player.maxHp;

  // Sum equipment bonuses
  for (const item of Object.values(player.equipment)) {
    if (!item) continue;
    attack += item.stats?.attack ?? 0;
    defense += item.stats?.defense ?? 0;
    luck += item.stats?.luck ?? 0;
    maxHp += item.stats?.hp ?? 0;
  }

  // Active pet bonuses
  const activePet = player.pets.find((p) => p.id === player.activePet);
  const coinBonus = activePet?.coinBonus ?? 0;
  const xpBonus = activePet?.xpBonus ?? 0;
  const combatBonus = activePet?.combatBonus ?? 0;
  attack = Math.floor(attack * (1 + combatBonus));

  const critChance = Math.min(
    GAME_CONFIG.combat.baseCritChance + luck * 0.001,
    0.4
  );
  const dodgeChance = Math.min(
    GAME_CONFIG.combat.baseDodgeChance + luck * GAME_CONFIG.combat.luckDodgeFactor,
    0.35
  );

  return { attack, defense, luck, hp, maxHp, critChance, dodgeChance, coinBonus, xpBonus };
}

// ─── Single combat turn ────────────────────────────────────────────────────────

export interface TurnResult {
  playerDamage: number;
  playerDodged: boolean;
  playerCrit: boolean;
  enemyDamage: number;
  enemyDodged: boolean;
  enemyCrit: boolean;
  newPlayerHp: number;
  newEnemyHp: number;
  log: string[];
}

export function resolveCombatTurn(
  session: CombatSession,
  stats: EffectiveStats
): TurnResult {
  const log: string[] = [];
  const enemy = session.enemy;

  // Player attacks enemy
  const playerDodged = false; // Enemy doesn't dodge on player turn
  const playerCrit = Math.random() < stats.critChance;
  let playerDamage = Math.max(
    1,
    randInt(Math.floor(stats.attack * 0.8), Math.ceil(stats.attack * 1.2))
  );
  if (playerCrit) {
    playerDamage = Math.floor(playerDamage * GAME_CONFIG.combat.critMultiplier);
    log.push(`⚡ **Critical hit!** You deal **${playerDamage}** damage!`);
  } else {
    log.push(`⚔️ You attack ${enemy.emoji} ${enemy.name} for **${playerDamage}** damage.`);
  }
  const defReduction = Math.min(enemy.defense * GAME_CONFIG.combat.defenseReductionFactor, 0.75);
  playerDamage = Math.max(1, Math.floor(playerDamage * (1 - defReduction)));
  const newEnemyHp = Math.max(0, enemy.hp - playerDamage);

  // Enemy attacks player (if still alive)
  let enemyDamage = 0;
  let enemyCrit = false;
  let enemyDodged = false;
  let newPlayerHp = session.playerHp;

  if (newEnemyHp > 0) {
    enemyDodged = Math.random() < stats.dodgeChance;
    if (enemyDodged) {
      log.push(`🌀 You dodge ${enemy.emoji} ${enemy.name}'s attack!`);
    } else {
      enemyCrit = Math.random() < GAME_CONFIG.combat.baseCritChance;
      enemyDamage = Math.max(
        1,
        randInt(Math.floor(enemy.attack * 0.8), Math.ceil(enemy.attack * 1.2))
      );
      if (enemyCrit) enemyDamage = Math.floor(enemyDamage * GAME_CONFIG.combat.critMultiplier);
      const playerDefReduction = Math.min(stats.defense * GAME_CONFIG.combat.defenseReductionFactor, 0.75);
      enemyDamage = Math.max(1, Math.floor(enemyDamage * (1 - playerDefReduction)));
      newPlayerHp = Math.max(0, session.playerHp - enemyDamage);
      if (enemyCrit) {
        log.push(`💥 ${enemy.emoji} ${enemy.name} **crits** you for **${enemyDamage}** damage!`);
      } else {
        log.push(`🗡️ ${enemy.emoji} ${enemy.name} hits you for **${enemyDamage}** damage.`);
      }
    }
  }

  return {
    playerDamage,
    playerDodged,
    playerCrit,
    enemyDamage,
    enemyDodged,
    enemyCrit,
    newPlayerHp,
    newEnemyHp,
    log,
  };
}

// ─── Flee attempt ──────────────────────────────────────────────────────────────

export function attemptFlee(player: Player): { success: boolean; log: string } {
  const chance = Math.min(
    GAME_CONFIG.combat.fleeBaseChance + player.luck * 0.01,
    0.9
  );
  const success = Math.random() < chance;
  return {
    success,
    log: success
      ? '🏃 You escape successfully!'
      : '❌ You failed to escape!',
  };
}

// ─── Generate loot from kill ───────────────────────────────────────────────────

export interface LootResult {
  coins: number;
  xp: number;
  items: InventoryItem[];
}

export function generateLoot(enemy: CombatEnemy, player: Player): LootResult {
  const stats = getEffectiveStats(player);
  const coinBase = randInt(enemy.coinReward[0], enemy.coinReward[1]);
  const coins = Math.floor(coinBase * (1 + stats.coinBonus));
  const xpBase = enemy.xpReward;
  const xp = Math.floor(xpBase * (1 + stats.xpBonus));

  const items: InventoryItem[] = [];

  // Each entry in the loot table has a 40% chance to drop (bosses: 80%)
  const dropChance = enemy.isBoss ? 0.8 : 0.4;
  for (const templateId of enemy.lootTable) {
    if (Math.random() < dropChance) {
      items.push(createLootItem(templateId, player.luck));
    }
  }

  return { coins, xp, items };
}

function createLootItem(templateId: string, luck: number): InventoryItem {
  const rarity = GAME_CONFIG.loot.rarityNames[rollRarity(luck)];
  const rarityIdx = GAME_CONFIG.loot.rarityNames.indexOf(rarity);
  const emoji = GAME_CONFIG.loot.rarityEmojis[rarityIdx];
  const sellValue = randInt(
    GAME_CONFIG.loot.rarityCoinMin[rarityIdx],
    GAME_CONFIG.loot.rarityCoinMax[rarityIdx]
  );

  return {
    id: uuidv4(),
    templateId,
    name: formatItemName(templateId, rarity),
    type: templateId.includes('blade') || templateId.includes('sword') || templateId.includes('staff')
      ? 'equipment'
      : templateId.includes('helm') || templateId.includes('armor') || templateId.includes('shield')
      ? 'equipment'
      : 'material',
    rarity,
    quantity: 1,
    obtainedAt: new Date().toISOString(),
    emoji,
    sellValue,
  };
}

function formatItemName(templateId: string, rarity: string): string {
  const base = templateId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return `${rarity} ${base}`;
}

// ─── Start a new combat session ────────────────────────────────────────────────

export function createCombatSession(
  player: Player,
  enemy: CombatEnemy,
  guildId: string,
  channelId: string
): CombatSession {
  return {
    id: uuidv4(),
    userId: player.userId,
    guildId,
    channelId,
    enemy,
    playerHp: getEffectiveStats(player).hp,
    playerMaxHp: getEffectiveStats(player).maxHp,
    turn: 0,
    log: [],
    status: 'active',
    rewardsClaimed: false,
    createdAt: Date.now(),
  };
}
