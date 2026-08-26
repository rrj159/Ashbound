/**
 * /inventory — Paginated inventory viewer with equip/sell/inspect actions.
 */

import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { getPlayer, updatePlayer } from '../../games/store.js';
import { equipItem, sellItem, formatItemStats, sortInventory } from '../../games/items.js';
import { GAME_CONFIG } from '../../games/config.js';
import type { AshenCommand } from './index.js';
import type { InventoryItem, EquipmentSlot, Equipment } from '../../games/types.js';

const PAGE_SIZE = 8;

const RARITY_COLORS: number[] = [
  0x888888, // Common
  0x2ecc71, // Uncommon
  0x3498db, // Rare
  0x9b59b6, // Epic
  0xffd700, // Legendary
  0xff4500, // Mythic
  0xffffff, // Divine
];

export const inventoryCommand: AshenCommand = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('View and manage your inventory'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    const player = await getPlayer(interaction.user.id, interaction.user.username);
    const { embed, components } = buildInventoryPage(
      player.inventory, player.equipment, 0, interaction.user.id
    );
    await interaction.editReply({ embeds: [embed], components });
  },

  async handleButton(interaction: ButtonInteraction): Promise<boolean> {
    const { customId } = interaction;
    if (!customId.startsWith('inv_')) return false;

    const parts  = customId.split('_');
    const action = parts[1]; // page | equip | sell | back
    const userId = parts[2];

    if (interaction.user.id !== userId) {
      await interaction.reply({ content: '❌ This is not your inventory.', ephemeral: true });
      return true;
    }

    await interaction.deferUpdate();
    const player = await getPlayer(interaction.user.id, interaction.user.username);

    if (action === 'page' || action === 'back') {
      const page = parseInt(parts[3] ?? '0', 10);
      const { embed, components } = buildInventoryPage(
        player.inventory, player.equipment, page, userId
      );
      await interaction.editReply({ embeds: [embed], components });
      return true;
    }

    if (action === 'equip') {
      const itemId = parts[3];
      const result = equipItem(player, itemId);
      if (result.error) {
        await interaction.followUp({ content: `❌ ${result.error}`, ephemeral: true });
      } else {
        await updatePlayer(player.userId, player.username, () => result.player);
        await interaction.followUp({
          content: `✅ **${result.equipped?.name}** equipped in **${result.equipped?.slot}** slot!`,
          ephemeral: true,
        });
      }
      const fresh = await getPlayer(player.userId, player.username);
      const { embed, components } = buildInventoryPage(fresh.inventory, fresh.equipment, 0, userId);
      await interaction.editReply({ embeds: [embed], components });
      return true;
    }

    if (action === 'sell') {
      const itemId = parts[3];
      const result = sellItem(player, itemId);
      if (result.error) {
        await interaction.followUp({ content: `❌ ${result.error}`, ephemeral: true });
      } else {
        await updatePlayer(player.userId, player.username, () => result.player);
        await interaction.followUp({
          content: `💰 Sold for **${result.coinsGained.toLocaleString()}** coins!`,
          ephemeral: true,
        });
      }
      const fresh = await getPlayer(player.userId, player.username);
      const { embed, components } = buildInventoryPage(fresh.inventory, fresh.equipment, 0, userId);
      await interaction.editReply({ embeds: [embed], components });
      return true;
    }

    return true;
  },

  async handleSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
    if (!interaction.customId.startsWith('inv_select_')) return false;

    const userId = interaction.customId.split('_')[2];
    if (interaction.user.id !== userId) {
      await interaction.reply({ content: '❌ This is not your inventory.', ephemeral: true });
      return true;
    }

    await interaction.deferUpdate();
    const itemId = interaction.values[0];
    const player = await getPlayer(interaction.user.id, interaction.user.username);
    const item   = player.inventory.find((i) => i.id === itemId);

    if (!item) {
      await interaction.editReply({ content: '❌ Item not found.', components: [] });
      return true;
    }

    const rarityIdx = GAME_CONFIG.loot.rarityNames.indexOf(item.rarity);
    const embed = new EmbedBuilder()
      .setColor(RARITY_COLORS[rarityIdx] ?? 0x888888)
      .setTitle(`${item.emoji ?? '📦'} ${item.name}`)
      .setDescription(`*${item.rarity} ${item.type}${item.slot ? ` — ${item.slot}` : ''}*`)
      .addFields(
        { name: '📊 Stats',      value: formatItemStats(item),              inline: false },
        { name: '💰 Sell Value', value: `${item.sellValue.toLocaleString()} coins`, inline: true },
        { name: '📦 Quantity',   value: `${item.quantity}`,                  inline: true },
        { name: '📅 Obtained',   value: new Date(item.obtainedAt).toLocaleDateString(), inline: true },
      );

    const buttons: ButtonBuilder[] = [];
    if (item.type === 'equipment') {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`inv_equip_${userId}_${item.id}`)
          .setLabel('⚔️ Equip')
          .setStyle(ButtonStyle.Primary)
      );
    }
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`inv_sell_${userId}_${item.id}`)
        .setLabel('💰 Sell')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`inv_back_${userId}_0`)
        .setLabel('◀ Back')
        .setStyle(ButtonStyle.Secondary),
    );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
    await interaction.editReply({ embeds: [embed], components: [row] });
    return true;
  },
};

// ─── Build paginated inventory embed ─────────────────────────────────────────────

type BuiltPage = {
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[];
};

function buildInventoryPage(
  rawInventory: InventoryItem[],
  equipment: Equipment,
  page: number,
  userId: string
): BuiltPage {
  const inventory  = sortInventory(rawInventory, 'rarity');
  const totalPages = Math.max(1, Math.ceil(inventory.length / PAGE_SIZE));
  const safePage   = Math.max(0, Math.min(page, totalPages - 1));
  const items      = inventory.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const equipped   = Object.values(equipment).filter(Boolean).length;

  const embed = new EmbedBuilder()
    .setColor(0x1a1a2e)
    .setTitle('🎒 Inventory')
    .setDescription(
      `**${inventory.length}** items · **${equipped}/6** slots equipped · Page ${safePage + 1}/${totalPages}`
    );

  if (items.length === 0) {
    embed.addFields({ name: '📭 Empty', value: 'No items yet. Go hunting!' });
  } else {
    for (const item of items) {
      embed.addFields({
        name: `${item.emoji ?? '📦'} ${item.name}`,
        value: `${item.rarity} ${item.type}${item.slot ? ` (${item.slot})` : ''} · Qty: ${item.quantity} · Sell: ${item.sellValue.toLocaleString()}`,
        inline: false,
      });
    }
  }

  // Equipped gear summary
  const slots: EquipmentSlot[] = ['weapon', 'armor', 'helmet', 'boots', 'ring', 'amulet'];
  embed.addFields({
    name: '⚔️ Equipped Gear',
    value: slots
      .map((s) => {
        const it = equipment[s];
        return it ? `**${s}:** ${it.emoji ?? '📦'} ${it.name}` : `**${s}:** _empty_`;
      })
      .join('\n'),
    inline: false,
  });
  embed.setFooter({ text: 'Select an item from the menu below to manage it' });

  const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

  // Pagination row
  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`inv_page_${userId}_${Math.max(0, safePage - 1)}`)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage === 0),
    new ButtonBuilder()
      .setCustomId(`inv_page_${userId}_${Math.min(totalPages - 1, safePage + 1)}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages - 1),
  );
  components.push(navRow as unknown as ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>);

  // Item select menu
  if (items.length > 0) {
    const menuOptions = items.map((item) =>
      new StringSelectMenuOptionBuilder()
        .setValue(item.id)
        .setLabel(item.name.slice(0, 100))
        .setDescription(`${item.rarity} · Qty ${item.quantity} · Sell ${item.sellValue}`)
    );
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`inv_select_${userId}`)
      .setPlaceholder('Select an item to manage…')
      .addOptions(menuOptions);
    const menuRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
    components.push(menuRow as unknown as ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>);
  }

  return { embed, components };
}
