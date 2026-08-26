import { generateHuntEncounter, isOnCooldown, formatCooldown } from '../hunt';
import { createDefaultPlayer } from '../types';

const player = createDefaultPlayer('u1', 'TestHunter');

describe('generateHuntEncounter', () => {
  test('returns a valid encounter type', () => {
    const types = ['monster', 'boss', 'treasure', 'ambush', 'npc', 'world_event', 'nothing'];
    for (let i = 0; i < 50; i++) {
      const enc = generateHuntEncounter(player);
      expect(types).toContain(enc.type);
    }
  });

  test('monster encounter has enemy with HP > 0', () => {
    // Run many times to hit a monster encounter
    for (let i = 0; i < 200; i++) {
      const enc = generateHuntEncounter(player);
      if (enc.type === 'monster' || enc.type === 'boss' || enc.type === 'ambush') {
        expect(enc.enemy.hp).toBeGreaterThan(0);
        expect(enc.enemy.name).toBeTruthy();
        return;
      }
    }
  });

  test('treasure encounter has coins > 0', () => {
    for (let i = 0; i < 200; i++) {
      const enc = generateHuntEncounter(player);
      if (enc.type === 'treasure') {
        expect(enc.coins).toBeGreaterThan(0);
        return;
      }
    }
  });

  test('world_event encounter has reputation > 0', () => {
    for (let i = 0; i < 500; i++) {
      const enc = generateHuntEncounter(player);
      if (enc.type === 'world_event') {
        expect(enc.reward.reputation).toBeGreaterThan(0);
        return;
      }
    }
  });
});

describe('isOnCooldown', () => {
  test('no cooldown returns false', () => {
    const p = createDefaultPlayer('u2', 'CooldownTest');
    const result = isOnCooldown(p, 'hunt');
    expect(result.onCooldown).toBe(false);
  });

  test('active cooldown returns true', () => {
    const p = createDefaultPlayer('u3', 'CooldownTest2');
    p.cooldowns.hunt = Date.now() + 60_000;
    const result = isOnCooldown(p, 'hunt');
    expect(result.onCooldown).toBe(true);
    expect(result.remainingMs).toBeGreaterThan(0);
  });
});

describe('formatCooldown', () => {
  test('formats seconds', () => expect(formatCooldown(30_000)).toBe('30s'));
  test('formats minutes', () => expect(formatCooldown(120_000)).toBe('2m'));
  test('formats hours', () => expect(formatCooldown(7_200_000)).toBe('2h'));
});
