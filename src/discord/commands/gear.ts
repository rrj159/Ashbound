/**
 * /gear — Equipment management: equip, unequip, inspect, compare.
 */

import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getPlayer, updatePlayer } from '../../games/store.js';
import {
  equipItem,
  unequipItem,
  formatItemStats,
  compareItemStats,
  findInventoryItem,
} from '../../games/items.js';
import { getEffectiveStats } from '../../games/combat.js';
import { GAME_CONFIG } from '../../games/config.js';
import type { AshenCommand } from './index.js';
import type { EquipmentSlot } from '../../games/types.js';

const SLOTS: EquipmentSlot[] = ['weapon', 'armor', 'helmet', 'boots', 'ring', 'amulet'];

const RARITY_COLORS: number[] = [
  0x888888, 0x2ecc71, 0x3498db, 0x9b59b6, 0xffd700, 0xff4500, 0xffffff,
];

export const gearCommand: AshenCommand = {
  data: new SlashCommandBuilder()
    .setName('gear')
    .setDescription('Manage your equipped gear')
    .addSubcommand((sub) =>
      sub
        .setName('equip')
        .setDescription('Equip an item from your inventory')
        .addStringOption((o) =>
          o.setName('item').setDescription('Item name or ID').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('unequip')
        .setDescription('Unequip a gear slot')
        .addStringOption((o) =>
          o
            .setName('slot')
            .setDescription('Equipment slot')
            .setRequired(true)
            .addChoices(
              ...SLOTS.map((s) => ({ name: s, value: s }))
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('inspect')
        .setDescription('Inspect an item in detail')
        .addStringOption((o) =>
          o.setName('item').setDescription('Item name or ID').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('compare')
        .setDescription('Compare an inventory item against what is currently equipped')
        .addStringOption((o) =>
          o.setName('item').setDescription('Item name or ID to compare').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('stats').setDescription('View your total effective combat stats')
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: false });
    const sub    = interaction.options.getSubcommand();
    const player = await getPlayer(interaction.user.id, interaction.user.username);

    // ── /gear equip ───────────────────────────────────────────────────────────────
    if (sub === 'equip') {
      const query  = interaction.options.getString('item', true);
      const found  = findInventoryItem(player, query);
      if (!found) {
        await interaction.editReply({ content: `❌ No item matching **"${query}"** found in inventory.` });
        return;
      }
      const result = equipItem(player, found.id);
      if (result.error) {
        await interaction.editReply({ content: `❌ ${result.error}` });
        return;
      }
      await updatePlayer(player.userId, player.username, () => result.player);
      const rarityIdx = GAME_CONFIG.loot.rarityNames.indexOf(found.rarity);
      const embed = new EmbedBuilder()
        .setColor(RARITY_COLORS[rarityIdx] ?? 0x888888)
        .setTitle(`✅ Equipped: ${found.emoji ?? '📦'} ${found.name}`)
        .addFields(
          { name: '🎯 Slot',  value: found.slot ?? 'N/A', inline: true },
          { name: '📊 Stats', value: formatItemStats(found), inline: false },
        );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // ── /gear unequip ─────────────────────────────────────────────────────────────
    if (sub === 'unequip') {
      const slot   = interaction.options.getString('slot', true) as EquipmentSlot;
      const result = unequipItem(player, slot);
      if (result.error) {
        await interaction.editReply({ content: `❌ ${result.error}` });
        return;
      }
      await updatePlayer(player.userId, player.username, () => result.player);
      const it = result.unequipped!;
      const embed = new EmbedBuilder()
        .setColor(0x888888)
        .setTitle(`🔓 Unequipped: ${it.emoji ?? '📦'} ${it.name}`)
        .setDescription(`Moved **${it.name}** back to your inventory.`);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // ── /gear inspect ─────────────────────────────────────────────────────────────
    if (sub === 'inspect') {
      const query = interaction.options.getString('item', true);
      const found = findInventoryItem(player, query)
        ?? Object.values(player.equipment).find(
             (i) => i && i.name.toLowerCase().includes(query.toLowerCase())
           )
        ?? null;

      if (!found) {
        await interaction.editReply({ content: `❌ No item matching **"${query}"** found.` });
        return;
      }
      const rarityIdx = GAME_CONFIG.loot.rarityNames.indexOf(found.rarity);
      const embed = new EmbedBuilder()
        .setColor(RARITY_COLORS[rarityIdx] ?? 0x888888)
        .setTitle(`${found.emoji ?? '📦'} ${found.name}`)
        .setDescription(`*${found.rarity} ${found.type}${found.slot ? ` — ${found.slot}` : ''}*`)
        .addFields(
          { name: '📊 Stats',      value: formatItemStats(found),                      inline: false },
          { name: '💰 Sell Value', value: `${found.sellValue.toLocaleString()} coins`,  inline: true },
          { name: '📦 Quantity',   value: `${found.quantity}`,                          inline: true },
          { name: '📅 Obtained',   value: new Date(found.obtainedAt).toLocaleString(),  inline: true },
        );
      if (found.description) embed.setDescription(found.description);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // ── /gear compare ─────────────────────────────────────────────────────────────
    if (sub === 'compare') {
      const query     = interaction.options.getString('item', true);
      const candidate = findInventoryItem(player, query);
      if (!candidate) {
        await interaction.editReply({ content: `❌ No item matching **"${query}"** in inventory.` });
        return;
      }
      if (!candidate.slot) {
        await interaction.editReply({ content: `❌ **${candidate.name}** is not equipment and cannot be compared.` });
        return;
      }
      const current   = player.equipment[candidate.slot];
      const rarityIdx = GAME_CONFIG.loot.rarityNames.indexOf(candidate.rarity);

      const embed = new EmbedBuilder()
        .setColor(RARITY_COLORS[rarityIdx] ?? 0x888888)
        .setTitle(`📊 Comparison — ${candidate.slot} slot`)
        .addFields(
          {
            name: `🔵 Currently Equipped${current ? `: ${current.name}` : ': nothing'}`,
            value: current ? formatItemStats(current) : '_Empty slot_',
            inline: true,
          },
          {
            name: `🟡 Candidate: ${candidate.name}`,
            value: formatItemStats(candidate),
            inline: true,
          },
          {
            name: '📈 Difference',
            value: compareItemStats(current ?? null, candidate),
            inline: false,
          },
        );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // ── /gear stats ───────────────────────────────────────────────────────────────
    if (sub === 'stats') {
      const stats = getEffectiveStats(player);
      const equippedPieces = Object.entries(player.equipment)
        .filter(([, v]) => v !== null)
        .map(([slot, item]) => `**${slot}:** ${item?.emoji ?? '📦'} ${item?.name}`);

      const embed = new EmbedBuilder()
        .setColor(0x1a1a2e)
        .setTitle(`⚔️ ${player.characterName} — Effective Combat Stats`)
        .addFields(
          { name: '⚔️ Attack',    value: `${stats.attack}`,                             inline: true },
          { name: '🛡️ Defense',   value: `${stats.defense}`,                            inline: true },
          { name: '🍀 Luck',      value: `${stats.luck}`,                               inline: true },
          { name: '❤️ HP',        value: `${stats.hp} / ${stats.maxHp}`,                inline: true },
          { name: '⚡ Crit',      value: `${(stats.critChance * 100).toFixed(1)}%`,     inline: true },
          { name: '🌀 Dodge',     value: `${(stats.dodgeChance * 100).toFixed(1)}%`,    inline: true },
          {
            name: '🎽 Equipped Gear',
            value: equippedPieces.length > 0 ? equippedPieces.join('\n') : '_Nothing equipped_',
            inline: false,
          },
        );
      await interaction.editReply({ embeds: [embed] });
      return;
    }
  },
};
