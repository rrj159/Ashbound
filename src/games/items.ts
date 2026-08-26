/**
 * Item creation, equipment stat rolling, equip/unequip/sell helpers.
 * Stats are rolled ONCE at creation and never re-rolled.
 */

import { v4 as uuidv4 } from 'uuid';
import { GAME_CONFIG, rollRarity, randInt } from './config.js';
import type { Player, InventoryItem, EquipmentSlot, ItemStats } from './types.js';

// ─── Slot detection from templateId ──────────────────────────────────────────────

const SLOT_KEYWORDS: Record<EquipmentSlot, string[]> = {
  weapon: ['blade', 'sword', 'staff', 'bow', 'axe', 'dagger', 'hammer', 'wand', 'spear', 'creation_blade', 'oblivion_blade', 'void_blade', 'flame_sword', 'ashen_blade'],
  armor:  ['armor', 'chestplate', 'robe', 'vest', 'coat', 'plate', 'sovereign_armor', 'dragon_lord_armor', 'bark_shield', 'sovereign_set'],
  helmet: ['helm', 'helmet', 'crown', 'cap', 'hood', 'hat', 'warlord_helm', 'shadow_crown', 'celestial_crown'],
  boots:  ['boots', 'shoes', 'greaves', 'sandals'],
  ring:   ['ring', 'necklace_ring'],
  amulet: ['amulet', 'necklace', 'pendant', 'talisman', 'phylactery', 'fang_necklace'],
};

export function detectSlot(templateId: string): EquipmentSlot | null {
  const lower = templateId.toLowerCase();
  for (const [slot, keywords] of Object.entries(SLOT_KEYWORDS) as [EquipmentSlot, string[]][]) {
    if (keywords.some((kw) => lower.includes(kw))) return slot;
  }
  return null;
}

// ─── Stat rolling per slot and rarity ────────────────────────────────────────────

export function rollEquipmentStats(slot: EquipmentSlot, rarityIdx: number): ItemStats {
  const atkRange = GAME_CONFIG.equipment.attackRange[rarityIdx];
  const defRange = GAME_CONFIG.equipment.defenseRange[rarityIdx];
  const lckRange = GAME_CONFIG.equipment.luckRange[rarityIdx];
  const stats: ItemStats = {};

  switch (slot) {
    case 'weapon':
      stats.attack = randInt(atkRange[0], atkRange[1]);
      if (lckRange[1] > 0) stats.luck = randInt(0, Math.max(0, Math.floor(lckRange[1] / 2)));
      stats.critChance = parseFloat((Math.random() * 0.02 * (rarityIdx + 1)).toFixed(4));
      break;

    case 'armor':
      stats.defense = randInt(defRange[0], defRange[1]);
      stats.hp = randInt(rarityIdx * 5, rarityIdx * 20 + 10);
      break;

    case 'helmet':
      stats.defense = randInt(Math.floor(defRange[0] * 0.6), Math.max(1, Math.floor(defRange[1] * 0.6)));
      stats.hp = randInt(rarityIdx * 3, rarityIdx * 15 + 5);
      break;

    case 'boots':
      stats.luck = randInt(lckRange[0], lckRange[1]);
      stats.dodgeChance = parseFloat((Math.random() * 0.02 * (rarityIdx + 1)).toFixed(4));
      stats.defense = randInt(0, Math.max(0, Math.floor(defRange[1] * 0.3)));
      break;

    case 'ring':
      stats.luck = randInt(lckRange[0], lckRange[1]);
      stats.attack = randInt(0, Math.max(0, Math.floor(atkRange[1] * 0.4)));
      stats.critChance = parseFloat((Math.random() * 0.01 * (rarityIdx + 1)).toFixed(4));
      break;

    case 'amulet':
      stats.hp = randInt(rarityIdx * 8, rarityIdx * 25 + 10);
      stats.luck = randInt(0, Math.max(0, Math.floor(lckRange[1] * 0.7)));
      stats.defense = randInt(0, Math.max(0, Math.floor(defRange[1] * 0.3)));
      break;
  }

  return stats;
}

// ─── Item creation (used by loot system) ─────────────────────────────────────────

export function createLootItem(templateId: string, luck: number): InventoryItem {
  const rarityIdx = rollRarity(luck);
  const rarity = GAME_CONFIG.loot.rarityNames[rarityIdx];
  const emoji = GAME_CONFIG.loot.rarityEmojis[rarityIdx];
  const slot = detectSlot(templateId);
  const isEquipment = slot !== null;

  const sellValue = randInt(
    GAME_CONFIG.loot.rarityCoinMin[rarityIdx],
    GAME_CONFIG.loot.rarityCoinMax[rarityIdx]
  );

  const base = templateId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const name = `${rarity} ${base}`;

  return {
    id: uuidv4(),
    templateId,
    name,
    type: isEquipment ? 'equipment' : 'material',
    rarity,
    quantity: 1,
    // Stats rolled exactly once here — never changed after creation
    stats: isEquipment ? rollEquipmentStats(slot, rarityIdx) : undefined,
    slot: isEquipment ? slot : undefined,
    obtainedAt: new Date().toISOString(),
    emoji,
    sellValue,
  };
}

// ─── Equip an item by ID ─────────────────────────────────────────────────────────
// Moves item from inventory to equipment slot; returns old item to inventory.

export function equipItem(
  player: Player,
  itemId: string
): { player: Player; error?: string; equipped?: InventoryItem } {
  const idx = player.inventory.findIndex((i) => i.id === itemId);
  if (idx === -1) return { player, error: 'Item not found in inventory.' };

  const item = player.inventory[idx];
  if (item.type !== 'equipment' || !item.slot) {
    return { player, error: 'This item cannot be equipped.' };
  }

  const slot = item.slot;
  const currentlyEquipped = player.equipment[slot];
  const newInventory = [...player.inventory];
  newInventory.splice(idx, 1);

  if (currentlyEquipped) {
    newInventory.push(currentlyEquipped); // Return old item to inventory
  }

  return {
    player: {
      ...player,
      inventory: newInventory,
      equipment: { ...player.equipment, [slot]: item },
    },
    equipped: item,
  };
}

// ─── Find item in inventory by name (partial, case-insensitive) or ID prefix ──────

export function findInventoryItem(
  player: Player,
  query: string
): InventoryItem | null {
  const lower = query.toLowerCase();
  // Exact ID match first
  const byId = player.inventory.find((i) => i.id === query || i.id.startsWith(query));
  if (byId) return byId;
  // Name match
  return player.inventory.find((i) => i.name.toLowerCase().includes(lower)) ?? null;
}

// ─── Unequip a slot ──────────────────────────────────────────────────────────────

export function unequipItem(
  player: Player,
  slot: EquipmentSlot
): { player: Player; error?: string; unequipped?: InventoryItem } {
  const item = player.equipment[slot];
  if (!item) return { player, error: `Nothing equipped in **${slot}**.` };

  return {
    player: {
      ...player,
      inventory: [...player.inventory, item],
      equipment: { ...player.equipment, [slot]: null },
    },
    unequipped: item,
  };
}

// ─── Sell an item ────────────────────────────────────────────────────────────────

export function sellItem(
  player: Player,
  itemId: string,
  quantity = 1
): { player: Player; coinsGained: number; error?: string } {
  const idx = player.inventory.findIndex((i) => i.id === itemId);
  if (idx === -1) return { player, coinsGained: 0, error: 'Item not found in inventory.' };

  const item = player.inventory[idx];
  // Equipment sells as single unit, stackables can sell partial
  const actualQty = item.type === 'equipment' ? 1 : Math.min(quantity, item.quantity);
  const coinsGained = item.sellValue * actualQty;

  const newInventory = [...player.inventory];
  if (actualQty >= item.quantity) {
    newInventory.splice(idx, 1);
  } else {
    newInventory[idx] = { ...item, quantity: item.quantity - actualQty };
  }

  return {
    player: {
      ...player,
      inventory: newInventory,
      gold: Math.min(player.gold + coinsGained, GAME_CONFIG.economy.maxCoins),
      statistics: {
        ...player.statistics,
        totalCoinsEarned: player.statistics.totalCoinsEarned + coinsGained,
      },
    },
    coinsGained,
  };
}

// ─── Format item stats for display ───────────────────────────────────────────────

export function formatItemStats(item: InventoryItem): string {
  if (!item.stats) return '_No stats_';
  const lines: string[] = [];
  const s = item.stats;
  if (s.attack)     lines.push(`⚔️ ATK +${s.attack}`);
  if (s.defense)    lines.push(`🛡️ DEF +${s.defense}`);
  if (s.luck)       lines.push(`🍀 LCK +${s.luck}`);
  if (s.hp)         lines.push(`❤️ HP +${s.hp}`);
  if (s.critChance) lines.push(`⚡ CRIT +${(s.critChance * 100).toFixed(1)}%`);
  if (s.dodgeChance) lines.push(`🌀 DODGE +${(s.dodgeChance * 100).toFixed(1)}%`);
  return lines.join(' | ') || '_No stats_';
}

// ─── Compare equipped vs candidate item ──────────────────────────────────────────

export function compareItemStats(
  current: InventoryItem | null,
  candidate: InventoryItem
): string {
  if (!current) return '_Nothing currently equipped — pure upgrade!_';
  const cs = current.stats ?? {};
  const ns = candidate.stats ?? {};
  const keys: (keyof ItemStats)[] = ['attack', 'defense', 'luck', 'hp', 'critChance', 'dodgeChance'];
  const lines: string[] = [];
  for (const key of keys) {
    const cv = (cs[key] as number | undefined) ?? 0;
    const nv = (ns[key] as number | undefined) ?? 0;
    const diff = nv - cv;
    if (diff === 0) continue;
    const label = (key === 'critChance' || key === 'dodgeChance')
      ? `${diff > 0 ? '+' : ''}${(diff * 100).toFixed(1)}%`
      : `${diff > 0 ? '+' : ''}${diff}`;
    const arrow = diff > 0 ? '📈' : '📉';
    lines.push(`${arrow} **${key}**: ${label}`);
  }
  return lines.length > 0 ? lines.join('\n') : '_No stat difference_';
}

// ─── Sort inventory ───────────────────────────────────────────────────────────────

export type SortMode = 'rarity' | 'type' | 'name' | 'value' | 'newest';

export function sortInventory(inventory: InventoryItem[], mode: SortMode): InventoryItem[] {
  const rarityOrder = GAME_CONFIG.loot.rarityNames;
  const sorted = [...inventory];
  switch (mode) {
    case 'rarity':
      return sorted.sort((a, b) => rarityOrder.indexOf(b.rarity) - rarityOrder.indexOf(a.rarity));
    case 'type':
      return sorted.sort((a, b) => a.type.localeCompare(b.type));
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'value':
      return sorted.sort((a, b) => b.sellValue - a.sellValue);
    case 'newest':
      return sorted.sort((a, b) => b.obtainedAt.localeCompare(a.obtainedAt));
    default:
      return sorted;
  }
}
