/**
 * Central economy service — all currency ops go through here.
 * Re-exports economy helpers from store and adds higher-level ops.
 */

import { economy as _economy, updatePlayer } from './store.js';
import { GAME_CONFIG } from './config.js';

export const economy = {
  ..._economy,

  /** Add coins, capped at max. Returns new balance. */
  async reward(
    userId: string,
    username: string,
    coins: number,
    xp: number
  ): Promise<{ newBalance: number; newXp: number; leveledUp: boolean; newLevel: number }> {
    if (!Number.isFinite(coins) || coins < 0) coins = 0;
    if (!Number.isFinite(xp) || xp < 0) xp = 0;

    let leveledUp = false;
    let newLevel = 1;

    const player = await updatePlayer(userId, username, (p) => {
      const newGold = Math.min(p.gold + coins, GAME_CONFIG.economy.maxCoins);
      const newXpTotal = p.xp + xp;

      // Compute new level
      let level = p.level;
      const { base, exponent, maxLevel } = GAME_CONFIG.xp;
      while (
        level < maxLevel &&
        newXpTotal >= Math.floor(base * Math.pow(level, exponent))
      ) {
        level++;
      }
      leveledUp = level > p.level;
      newLevel = level;

      // Level-up stat gains
      const levelsGained = level - p.level;
      const hpGain = levelsGained * 10;
      const attackGain = levelsGained * 2;
      const defenseGain = levelsGained * 1;

      return {
        ...p,
        gold: newGold,
        xp: newXpTotal,
        level,
        maxHp: p.maxHp + hpGain,
        hp: Math.min(p.hp + hpGain, p.maxHp + hpGain),
        attack: p.attack + attackGain,
        defense: p.defense + defenseGain,
        statistics: {
          ...p.statistics,
          totalCoinsEarned: p.statistics.totalCoinsEarned + coins,
          seasonHighestLevel: Math.max(p.statistics.seasonHighestLevel, level),
        },
        seasonStats: {
          ...p.seasonStats,
          xpEarned: p.seasonStats.xpEarned + xp,
          coinsEarned: p.seasonStats.coinsEarned + coins,
        },
      };
    });

    return {
      newBalance: player.gold,
      newXp: player.xp,
      leveledUp,
      newLevel,
    };
  },
};
