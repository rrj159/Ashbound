/**
 * /adventure — Choose a region and set out on an adventure.
 */

import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { getPlayer, updatePlayer, combatStore } from '../../games/store.js';
import { REGIONS, canAccessRegion } from '../../games/regions.js';
import { isOnCooldown, formatCooldown, generateHuntEncounter } from '../../games/hunt.js';
import { economy } from '../../games/economy.js';
import { createCombatSession } from '../../games/combat.js';
import { GAME_CONFIG } from '../../games/config.js';
import type { AshenCommand } from './index.js';
import type { RegionId } from '../../games/types.js';

export const adventureCommand: AshenCommand = {
  data: new SlashCommandBuilder()
    .setName('adventure')
    .setDescription('Choose a region and set out on an adventure'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    const player = await getPlayer(interaction.user.id, interaction.user.username);

    const cd = isOnCooldown(player, 'adventure');
    if (cd.onCooldown) {
      await interaction.editReply({ content: `⏳ Adventure cooldown: **${formatCooldown(cd.remainingMs)}** remaining.` });
      return;
    }

    const regionOrder: RegionId[] = [
      'ashen_village', 'blackwood', 'crimson_wastes', 'abyss', 'celestial_realm',
    ];

    const options = regionOrder
      .filter((id) => player.unlockedRegions.includes(id))
      .map((id) => {
        const r      = REGIONS[id];
        const access = canAccessRegion(player.level, player.unlockedRegions, id);
        return new StringSelectMenuOptionBuilder()
          .setValue(id)
          .setLabel(`${r.name} (Lv. ${r.minLevel}+)`)
          .setDescription(
            access.allowed
              ? r.description.slice(0, 80)
              : `🔒 ${(access.reason ?? 'Locked').slice(0, 70)}`
          );
      });

    if (options.length === 0) {
      await interaction.editReply({ content: '❌ No regions unlocked yet. Use /hunt to begin.' });
      return;
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`adventure_select_${interaction.user.id}`)
      .setPlaceholder('Select a region to adventure in…')
      .addOptions(options);

    const row  = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
    const embed = new EmbedBuilder()
      .setColor(0x1a1a2e)
      .setTitle('🗺️ Choose Your Adventure')
      .setDescription(
        regionOrder
          .filter((id) => player.unlockedRegions.includes(id))
          .map((id) => {
            const r = REGIONS[id];
            return `${r.emoji} **${r.name}** — Lv. ${r.minLevel}+`;
          })
          .join('\n')
      )
      .setFooter({ text: `Current region: ${REGIONS[player.region].name}` });

    await interaction.editReply({ embeds: [embed], components: [row] });
  },

  async handleSelect(interaction: StringSelectMenuInteraction): Promise<boolean> {
    if (!interaction.customId.startsWith('adventure_select_')) return false;

    const ownerId = interaction.customId.split('_')[2];
    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: '❌ This menu is not for you.', ephemeral: true });
      return true;
    }

    await interaction.deferUpdate();
    const regionId     = interaction.values[0] as RegionId;
    const player       = await getPlayer(interaction.user.id, interaction.user.username);
    const access       = canAccessRegion(player.level, player.unlockedRegions, regionId);

    if (!access.allowed) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0x992222).setTitle('🔒 Region Locked').setDescription(access.reason ?? 'Locked.')],
        components: [],
      });
      return true;
    }

    await updatePlayer(interaction.user.id, interaction.user.username, (p) => ({
      ...p,
      region: regionId,
      cooldowns: { ...p.cooldowns, adventure: Date.now() + GAME_CONFIG.cooldowns.adventure },
    }));

    const updatedPlayer = await getPlayer(interaction.user.id, interaction.user.username);
    const encounter     = generateHuntEncounter(updatedPlayer);
    const region        = REGIONS[regionId];

    if (encounter.type === 'treasure') {
      const r = await economy.reward(updatedPlayer.userId, updatedPlayer.username, encounter.coins, encounter.xp);
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xffd700)
          .setTitle(`${region.emoji} ${region.name} — 🎁 Treasure!`)
          .setDescription(`*${encounter.atmosphereLine}*\n\n${encounter.rarityEmoji} **${encounter.rarityLabel}** chest!`)
          .addFields(
            { name: '💰', value: `+${encounter.coins.toLocaleString()}`, inline: true },
            { name: '✨', value: `+${encounter.xp} XP`, inline: true },
            r.leveledUp ? { name: '🎉', value: `Level ${r.newLevel}!`, inline: true } : { name: '\u200b', value: '\u200b', inline: true }
          )],
        components: [],
      });
      return true;
    }

    if (encounter.type === 'world_event') {
      const r = await economy.reward(updatedPlayer.userId, updatedPlayer.username, encounter.reward.coins, encounter.reward.xp);
      await updatePlayer(interaction.user.id, interaction.user.username, (p) => ({
        ...p, reputation: p.reputation + encounter.reward.reputation,
      }));
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xff4500)
          .setTitle(`${region.emoji} ${encounter.eventName}`)
          .setDescription(`*${encounter.atmosphereLine}*\n\n${encounter.description}`)
          .addFields(
            { name: '💰', value: `+${encounter.reward.coins.toLocaleString()}`, inline: true },
            { name: '✨', value: `+${encounter.reward.xp} XP`, inline: true },
            { name: '⭐', value: `+${encounter.reward.reputation} REP`, inline: true },
          )],
        components: [],
      });
      return true;
    }

    if (encounter.type === 'npc') {
      const r = await economy.reward(updatedPlayer.userId, updatedPlayer.username, encounter.reward.coins, encounter.reward.xp);
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0x7289da)
          .setTitle(`${region.emoji} ${encounter.npcEmoji} ${encounter.npcName}`)
          .setDescription(`*"${encounter.dialogue}"*`)
          .addFields(
            { name: '💰', value: `+${encounter.reward.coins.toLocaleString()}`, inline: true },
            { name: '✨', value: `+${encounter.reward.xp} XP`, inline: true },
          )],
        components: [],
      });
      return true;
    }

    if (encounter.type === 'nothing') {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0x444444)
          .setTitle(`${region.emoji} ${region.name} — Nothing Here`)
          .setDescription(`*${encounter.atmosphereLine}*\n\nYou find nothing of interest.`)],
        components: [],
      });
      return true;
    }

    // Combat encounter
    const existing = combatStore.getByUser(updatedPlayer.userId);
    if (existing) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription('⚔️ You are already in combat!')],
        components: [],
      });
      return true;
    }

    const session   = createCombatSession(updatedPlayer, encounter.enemy, interaction.guildId ?? 'dm', interaction.channelId);
    combatStore.set(session);

    const enemy   = encounter.enemy;
    const isBoss  = encounter.type === 'boss';
    const hpBar   = buildBar(enemy.hp, enemy.maxHp, 12);
    const phpBar  = buildBar(session.playerHp, session.playerMaxHp, 12);

    const embed = new EmbedBuilder()
      .setColor(isBoss ? 0xff0000 : 0xe74c3c)
      .setTitle(isBoss ? `👑 BOSS — ${enemy.emoji} ${enemy.name}` : `⚔️ ${region.emoji} ${region.name} — ${enemy.emoji} ${enemy.name}`)
      .setDescription(
        (encounter.type === 'ambush' ? `💥 **AMBUSH!** ${enemy.name} strikes first!\n\n` : '') +
        `${hpBar} **${enemy.hp}/${enemy.maxHp} HP** (Lv.${enemy.level})\n` +
        `${phpBar} **You: ${session.playerHp}/${session.playerMaxHp} HP**\n\n_Combat begins…_`
      );

    const combatRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`combat_attack_${session.id}`).setLabel('⚔️ Attack').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`combat_defend_${session.id}`).setLabel('🛡️ Defend').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`combat_flee_${session.id}`).setLabel('🏃 Flee').setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({ embeds: [embed], components: [combatRow] });
    return true;
  },
};

function buildBar(current: number, max: number, length: number): string {
  const filled = Math.max(0, Math.round((current / max) * length));
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}
