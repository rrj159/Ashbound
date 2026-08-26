import {
  createLootItem,
  detectSlot,
  rollEquipmentStats,
  equipItem,
  unequipItem,
  sellItem,
  findInventoryItem,
  formatItemStats,
  compareItemStats,
} from '../items';
import { createDefaultPlayer } from '../types';

describe('detectSlot', () => {
  test('detects weapon slot', () => expect(detectSlot('flame_sword')).toBe('weapon'));
  test('detects armor slot',  () => expect(detectSlot('dragon_lord_armor')).toBe('armor'));
  test('detects helmet slot', () => expect(detectSlot('warlord_helm')).toBe('helmet'));
  test('detects boots slot',  () => expect(detectSlot('fire_boots')).toBe('boots'));
  test('detects ring slot',   () => expect(detectSlot('gold_ring')).toBe('ring'));
  test('detects amulet slot', () => expect(detectSlot('shadow_amulet')).toBe('amulet'));
  test('returns null for material', () => expect(detectSlot('wolf_fang')).toBeNull());
});

describe('rollEquipmentStats', () => {
  test('weapon gets attack stat', () => {
    const stats = rollEquipmentStats('weapon', 2);
    expect(stats.attack).toBeGreaterThan(0);
  });
  test('armor gets defense stat', () => {
    const stats = rollEquipmentStats('armor', 2);
    expect(stats.defense).toBeGreaterThan(0);
  });
  test('boots gets luck and dodgeChance', () => {
    const stats = rollEquipmentStats('boots', 3);
    expect(stats.dodgeChance).toBeDefined();
  });
});

describe('createLootItem', () => {
  test('creates item with unique id', () => {
    const a = createLootItem('wolf_fang', 1);
    const b = createLootItem('wolf_fang', 1);
    expect(a.id).not.toBe(b.id);
  });

  test('equipment item has stats and slot', () => {
    const item = createLootItem('flame_sword', 5);
    expect(item.type).toBe('equipment');
    expect(item.slot).toBe('weapon');
    expect(item.stats).toBeDefined();
    expect(item.stats?.attack).toBeGreaterThan(0);
  });

  test('material item has no stats', () => {
    const item = createLootItem('wolf_fang', 1);
    expect(item.type).toBe('material');
    expect(item.stats).toBeUndefined();
  });

  test('sellValue is positive', () => {
    const item = createLootItem('dragon_scale', 1);
    expect(item.sellValue).toBeGreaterThan(0);
  });
});

describe('equipItem', () => {
  test('equips item to correct slot', () => {
    const player = createDefaultPlayer('u1', 'Eq1');
    const sword  = createLootItem('flame_sword', 5);
    player.inventory.push(sword);
    const result = equipItem(player, sword.id);
    expect(result.error).toBeUndefined();
    expect(result.player.equipment.weapon?.id).toBe(sword.id);
    expect(result.player.inventory.find((i) => i.id === sword.id)).toBeUndefined();
  });

  test('swaps old item back to inventory', () => {
    const player = createDefaultPlayer('u2', 'Eq2');
    const s1 = createLootItem('flame_sword', 5);
    const s2 = createLootItem('ashen_blade', 5);
    s2.slot = 'weapon'; s2.type = 'equipment';
    player.inventory.push(s1, s2);
    equipItem(player, s1.id); // can't chain directly, need to apply
    const r1 = equipItem(player, s1.id);
    const r2 = equipItem(r1.player, s2.id);
    expect(r2.player.equipment.weapon?.id).toBe(s2.id);
    expect(r2.player.inventory.some((i) => i.id === s1.id)).toBe(true);
  });

  test('returns error for material item', () => {
    const player = createDefaultPlayer('u3', 'Eq3');
    const mat    = createLootItem('wolf_fang', 1);
    player.inventory.push(mat);
    const result = equipItem(player, mat.id);
    expect(result.error).toBeDefined();
  });
});

describe('unequipItem', () => {
  test('returns item to inventory', () => {
    const player = createDefaultPlayer('u4', 'Ueq1');
    const sword  = createLootItem('flame_sword', 5);
    player.inventory.push(sword);
    const equipped = equipItem(player, sword.id);
    const result   = unequipItem(equipped.player, 'weapon');
    expect(result.error).toBeUndefined();
    expect(result.player.equipment.weapon).toBeNull();
    expect(result.player.inventory.some((i) => i.id === sword.id)).toBe(true);
  });

  test('returns error when slot empty', () => {
    const player = createDefaultPlayer('u5', 'Ueq2');
    const result = unequipItem(player, 'weapon');
    expect(result.error).toBeDefined();
  });
});

describe('sellItem', () => {
  test('removes item and adds coins', () => {
    const player = createDefaultPlayer('u6', 'Sell1');
    const item   = createLootItem('wolf_fang', 1);
    player.inventory.push(item);
    const result = sellItem(player, item.id);
    expect(result.coinsGained).toBeGreaterThan(0);
    expect(result.player.gold).toBeGreaterThan(player.gold);
    expect(result.player.inventory.find((i) => i.id === item.id)).toBeUndefined();
  });

  test('returns error for missing item', () => {
    const player = createDefaultPlayer('u7', 'Sell2');
    const result = sellItem(player, 'nonexistent-id');
    expect(result.error).toBeDefined();
    expect(result.coinsGained).toBe(0);
  });
});

describe('findInventoryItem', () => {
  test('finds by partial name', () => {
    const player = createDefaultPlayer('u8', 'Find1');
    const item   = createLootItem('flame_sword', 3);
    player.inventory.push(item);
    const found = findInventoryItem(player, 'flame');
    expect(found?.id).toBe(item.id);
  });

  test('finds by ID prefix', () => {
    const player = createDefaultPlayer('u9', 'Find2');
    const item   = createLootItem('wolf_fang', 1);
    player.inventory.push(item);
    const found = findInventoryItem(player, item.id.slice(0, 8));
    expect(found?.id).toBe(item.id);
  });

  test('returns null when not found', () => {
    const player = createDefaultPlayer('u10', 'Find3');
    expect(findInventoryItem(player, 'nothing')).toBeNull();
  });
});

describe('formatItemStats', () => {
  test('returns string for item with stats', () => {
    const item = createLootItem('flame_sword', 5);
    const text = formatItemStats(item);
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });

  test('returns no-stats string for material', () => {
    const item = createLootItem('wolf_fang', 1);
    expect(formatItemStats(item)).toBe('_No stats_');
  });
});

describe('compareItemStats', () => {
  test('returns upgrade message when nothing equipped', () => {
    const item   = createLootItem('flame_sword', 5);
    const result = compareItemStats(null, item);
    expect(result).toContain('Nothing currently equipped');
  });

  test('returns diff between two items', () => {
    const a = createLootItem('ashen_blade', 3);
    const b = createLootItem('flame_sword', 5);
    // Force different stats
    a.stats = { attack: 10 };
    b.stats = { attack: 20 };
    const result = compareItemStats(a, b);
    expect(result).toContain('attack');
  });
});
