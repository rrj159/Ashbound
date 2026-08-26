import { xpForLevel, levelFromXp, xpToNextLevel, rollRarity, randInt } from '../config';

describe('xpForLevel', () => {
  test('level 1 requires 0 XP', () => {
    expect(xpForLevel(1)).toBe(0);
  });
  test('level 2 requires more than level 1', () => {
    expect(xpForLevel(2)).toBeGreaterThan(0);
  });
  test('higher levels require more XP', () => {
    expect(xpForLevel(10)).toBeGreaterThan(xpForLevel(5));
    expect(xpForLevel(50)).toBeGreaterThan(xpForLevel(10));
  });
});

describe('levelFromXp', () => {
  test('0 XP = level 1', () => {
    expect(levelFromXp(0)).toBe(1);
  });
  test('round-trips with xpForLevel', () => {
    for (const level of [2, 5, 10, 25, 50]) {
      expect(levelFromXp(xpForLevel(level))).toBe(level);
    }
  });
});

describe('xpToNextLevel', () => {
  test('always positive', () => {
    for (let i = 1; i < 10; i++) {
      expect(xpToNextLevel(i)).toBeGreaterThan(0);
    }
  });
});

describe('rollRarity', () => {
  test('returns valid index 0-6', () => {
    for (let i = 0; i < 100; i++) {
      const r = rollRarity(0);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(6);
    }
  });
});

describe('randInt', () => {
  test('returns value within range', () => {
    for (let i = 0; i < 100; i++) {
      const v = randInt(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(10);
    }
  });
});
