import { getEffectiveStats, resolveCombatTurn, attemptFlee, generateLoot, createCombatSession } from '../combat';
import { createDefaultPlayer } from '../types';
import { REGIONS, spawnEnemy } from '../regions';

const player = createDefaultPlayer('u1', 'Fighter');
const region = REGIONS['ashen_village'];
const enemyTemplate = region.enemies[0];
const enemy = spawnEnemy(enemyTemplate, 5, 'ashen_village');

describe('getEffectiveStats', () => {
  test('returns valid stats for default player', () => {
    const stats = getEffectiveStats(player);
    expect(stats.attack).toBeGreaterThan(0);
    expect(stats.defense).toBeGreaterThan(0);
    expect(stats.critChance).toBeGreaterThanOrEqual(0);
    expect(stats.critChance).toBeLessThanOrEqual(1);
    expect(stats.dodgeChance).toBeGreaterThanOrEqual(0);
    expect(stats.dodgeChance).toBeLessThanOrEqual(1);
  });
});

describe('resolveCombatTurn', () => {
  test('deals at least 1 damage', () => {
    const session = createCombatSession(player, enemy, 'g1', 'c1');
    const stats = getEffectiveStats(player);
    const turn = resolveCombatTurn(session, stats);
    expect(turn.playerDamage).toBeGreaterThanOrEqual(1);
    expect(turn.newEnemyHp).toBeLessThan(enemy.maxHp);
  });

  test('produces log entries', () => {
    const session = createCombatSession(player, enemy, 'g1', 'c1');
    const stats = getEffectiveStats(player);
    const turn = resolveCombatTurn(session, stats);
    expect(turn.log.length).toBeGreaterThan(0);
  });

  test('HP does not go below 0', () => {
    const session = createCombatSession(player, { ...enemy, attack: 99999 }, 'g1', 'c1');
    const stats = getEffectiveStats(player);
    const turn = resolveCombatTurn(session, stats);
    expect(turn.newPlayerHp).toBeGreaterThanOrEqual(0);
  });
});

describe('attemptFlee', () => {
  test('returns a boolean and log string', () => {
    for (let i = 0; i < 20; i++) {
      const result = attemptFlee(player);
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.log).toBe('string');
    }
  });
});

describe('generateLoot', () => {
  test('returns coins and xp > 0', () => {
    const loot = generateLoot(enemy, player);
    expect(loot.coins).toBeGreaterThan(0);
    expect(loot.xp).toBeGreaterThan(0);
  });

  test('boss drops more loot', () => {
    const boss = spawnEnemy(region.boss, 10, 'ashen_village');
    let totalItems = 0;
    for (let i = 0; i < 20; i++) {
      totalItems += generateLoot(boss, player).items.length;
    }
    // Over 20 runs, boss (80% drop) should drop more than zero items
    expect(totalItems).toBeGreaterThan(0);
  });
});
