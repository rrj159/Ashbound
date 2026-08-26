import { REGIONS, canAccessRegion, pickEncounterEnemy, spawnEnemy } from '../regions';
import type { RegionId } from '../types';

const ALL_REGIONS: RegionId[] = [
  'ashen_village',
  'blackwood',
  'crimson_wastes',
  'abyss',
  'celestial_realm',
];

describe('REGIONS', () => {
  test('all 5 regions defined', () => {
    expect(Object.keys(REGIONS)).toHaveLength(5);
  });

  test('each region has enemies and boss', () => {
    for (const id of ALL_REGIONS) {
      expect(REGIONS[id].enemies.length).toBeGreaterThan(0);
      expect(REGIONS[id].boss).toBeDefined();
    }
  });

  test('minLevel increases across regions', () => {
    const levels = ALL_REGIONS.map((id) => REGIONS[id].minLevel);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThan(levels[i - 1]);
    }
  });
});

describe('canAccessRegion', () => {
  test('allows access to unlocked region at correct level', () => {
    const result = canAccessRegion(1, ['ashen_village'], 'ashen_village');
    expect(result.allowed).toBe(true);
  });

  test('blocks locked region', () => {
    const result = canAccessRegion(15, ['ashen_village'], 'blackwood');
    expect(result.allowed).toBe(false);
  });

  test('blocks under-level even if unlocked', () => {
    const result = canAccessRegion(5, ['ashen_village', 'blackwood'], 'blackwood');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('level');
  });

  test('allows access when unlocked and level met', () => {
    const result = canAccessRegion(10, ['ashen_village', 'blackwood'], 'blackwood');
    expect(result.allowed).toBe(true);
  });
});

describe('spawnEnemy', () => {
  test('spawns with HP > 0', () => {
    const region = REGIONS['ashen_village'];
    const enemy = spawnEnemy(region.enemies[0], 5, 'ashen_village');
    expect(enemy.hp).toBeGreaterThan(0);
    expect(enemy.maxHp).toBe(enemy.hp);
  });

  test('level is within template range', () => {
    const region = REGIONS['ashen_village'];
    const template = region.enemies[0];
    for (let i = 0; i < 20; i++) {
      const enemy = spawnEnemy(template, 5, 'ashen_village');
      expect(enemy.level).toBeGreaterThanOrEqual(template.levelRange[0]);
      expect(enemy.level).toBeLessThanOrEqual(template.levelRange[1]);
    }
  });
});

describe('pickEncounterEnemy', () => {
  test('returns a valid enemy', () => {
    const region = REGIONS['ashen_village'];
    const enemy = pickEncounterEnemy(region, 5);
    expect(enemy.name).toBeTruthy();
    expect(enemy.hp).toBeGreaterThan(0);
  });
});
