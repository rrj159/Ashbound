/**
 * Reusable combat engine for Ashen Realms.
 * ALL game results (damage, XP, coins, loot) are determined here.
 * AI may narrate results but NEVER determines them.
 */

import { v4 as uuidv4 } from 'uuid';
import { GAME_CONFIG, randInt } from './config.js';
import { createLootItem } from './items.js';
import type { Player, CombatSession, CombatEnemy, InventoryItem } from './types.js';

// ─── Effective player stats (base + equipment + pet bonuses) ─────────────────────

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
  let maxHp = player.maxHp;

  for (const item of Object.values(player.equipment)) {
    if (!item) continue;
    attack  += item.stats?.attack  ?? 0;
    defense += item.stats?.defense ?? 0;
    luck    += item.stats?.luck    ?? 0;
    maxHp   += item.stats?.hp      ?? 0;
  }

  const activePet = player.pets.find((p) => p.id === player.activePet);
  const coinBonus = activePet?.coinBonus ?? 0;
  const xpBonus   = activePet?.xpBonus   ?? 0;
  const combatBonus = activePet?.combatBonus ?? 0;
  attack = Math.floor(attack * (1 + combatBonus));

  // Equipment crit/dodge bonuses
  let extraCrit  = 0;
  let extraDodge = 0;
  for (const item of Object.values(player.equipment)) {
    if (!item?.stats) continue;
    extraCrit  += item.stats.critChance  ?? 0;
    extraDodge += item.stats.dodgeChance ?? 0;
  }

  const critChance = Math.min(
    GAME_CONFIG.combat.baseCritChance + luck * 0.001 + extraCrit, 0.4
  );
  const dodgeChance = Math.min(
    GAME_CONFIG.combat.baseDodgeChance + luck * GAME_CONFIG.combat.luckDodgeFactor + extraDodge, 0.35
  );

  return { attack, defense, luck, hp: player.hp, maxHp, critChance, dodgeChance, coinBonus, xpBonus };
}

// ─── Single combat turn ───────────────────────────────────────────────────────────

export interface TurnResult {
  playerDamage: number;
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

  // ── Player attacks enemy ──────────────────────────────────────────────────────
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
  const enemyDefReduction = Math.min(enemy.defense * GAME_CONFIG.combat.defenseReductionFactor, 0.75);
  playerDamage = Math.max(1, Math.floor(playerDamage * (1 - enemyDefReduction)));
  const newEnemyHp = Math.max(0, enemy.hp - playerDamage);

  // ── Enemy attacks player (if still alive) ────────────────────────────────────
  let enemyDamage = 0;
  let enemyCrit   = false;
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

      const playerDefReduction = Math.min(
        stats.defense * GAME_CONFIG.combat.defenseReductionFactor, 0.75
      );
      // Defending halves remaining damage
      const defendMult = session.defending ? 0.5 : 1.0;
      enemyDamage = Math.max(1, Math.floor(enemyDamage * (1 - playerDefReduction) * defendMult));
      newPlayerHp = Math.max(0, session.playerHp - enemyDamage);

      if (session.defending) {
        if (enemyCrit) {
          log.push(`🛡️💥 You defend! ${enemy.emoji} crits but only deals **${enemyDamage}** damage!`);
        } else {
          log.push(`🛡️ You brace for impact. ${enemy.emoji} ${enemy.name} deals only **${enemyDamage}** damage!`);
        }
      } else if (enemyCrit) {
        log.push(`💥 ${enemy.emoji} ${enemy.name} **crits** you for **${enemyDamage}** damage!`);
      } else {
        log.push(`🗡️ ${enemy.emoji} ${enemy.name} hits you for **${enemyDamage}** damage.`);
      }
    }
  }

  return { playerDamage, playerCrit, enemyDamage, enemyDodged, enemyCrit, newPlayerHp, newEnemyHp, log };
}

// ─── Defend turn (no attack, just absorb with bonus mitigation) ───────────────────

export function resolveDefendTurn(
  session: CombatSession,
  stats: EffectiveStats
): TurnResult {
  // Player does not attack, but enemy attacks into defend stance
  const defendSession = { ...session, defending: true };
  const turn = resolveCombatTurn({ ...defendSession, enemy: { ...session.enemy } }, stats);
  return { ...turn, playerDamage: 0 }; // Player dealt 0 on a defend turn
}

// ─── Flee attempt ──────────────────────────────────────────────────────────────────

export function attemptFlee(player: Player): { success: boolean; log: string } {
  const chance = Math.min(GAME_CONFIG.combat.fleeBaseChance + player.luck * 0.01, 0.9);
  const success = Math.random() < chance;
  return {
    success,
    log: success ? '🏃 You escape successfully!' : '❌ You failed to escape!',
  };
}

// ─── Generate loot from kill ──────────────────────────────────────────────────────

export interface LootResult {
  coins: number;
  xp: number;
  items: InventoryItem[];
}

export function generateLoot(enemy: CombatEnemy, player: Player): LootResult {
  const stats = getEffectiveStats(player);
  const coinBase = randInt(enemy.coinReward[0], enemy.coinReward[1]);
  const coins = Math.floor(coinBase * (1 + stats.coinBonus));
  const xp    = Math.floor(enemy.xpReward * (1 + stats.xpBonus));

  const items: InventoryItem[] = [];
  const dropChance = enemy.isBoss ? 0.8 : 0.4;
  for (const templateId of enemy.lootTable) {
    if (Math.random() < dropChance) {
      items.push(createLootItem(templateId, player.luck));
    }
  }

  return { coins, xp, items };
}

// ─── Start a new combat session ───────────────────────────────────────────────────

export function createCombatSession(
  player: Player,
  enemy: CombatEnemy,
  guildId: string,
  channelId: string
): CombatSession {
  const stats = getEffectiveStats(player);
  return {
    id: uuidv4(),
    userId: player.userId,
    guildId,
    channelId,
    enemy,
    playerHp: stats.hp,
    playerMaxHp: stats.maxHp,
    turn: 0,
    log: [],
    status: 'active',
    rewardsClaimed: false,
    createdAt: Date.now(),
    defending: false,
  };
}
