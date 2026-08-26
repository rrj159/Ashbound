/**
 * /adventure — Choose a region and explore.
 * Extends /hunt with explicit region selection.
 */

import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { getPlayer, updatePlayer } from '../../games/store.js';
import { REGIONS, canAccessRegion } from '../../games/regions.js';
import { isOnCooldown, formatCooldown, generateHuntEncounter } from '../../games/hunt.js';
import { economy } from '../../games/economy.js';
import { createCombatSession, getEffectiveStats } from '../../games/combat.js';
import { combatStore } from '../../games/store.js';
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
      await interaction.editReply({
        content: `⏳ Adventure cooldown: **${formatCooldown(cd.remainingMs)}** remaining.`,
      });
      return;
    }

    // Build region select menu (only show unlocked regions player meets level req for)
    const regionOrder: RegionId[] = [
      'ashen_village', 'blackwood', 'crimson_wastes', 'abyss', 'celestial_realm',
    ];

    const options = regionOrder
      .filter((id) => player.unlockedRegions.includes(id))
      .map((id) => {
        const r = REGIONS[id];
        const access = canAccessRegion(player.level, player.unlockedRegions, id);
        return new StringSelectMenuOptionBuilder()
          .setValue(id)
          .setLabel(`${r.name} (Lv. ${r.minLevel}+)`)
          .setDescription(
            access.allowed
              ? r.description.slice(0, 80)
              : `🔒 ${access.reason ?? 'Locked'}`.slice(0, 80)
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

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);

    const embed = new EmbedBuilder()
      .setColor(0x1a1a2e)
      .setTitle('🗺️ Choose Your Adventure')
      .setDescription(
        `You stand at the crossroads. Where will you venture?\n\n` +
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

    const regionId = interaction.values[0] as RegionId;
    const player = await getPlayer(interaction.user.id, interaction.user.username);
    const access = canAccessRegion(player.level, player.unlockedRegions, regionId);

    if (!access.allowed) {
      const embed = new EmbedBuilder()
        .setColor(0x992222)
        .setTitle('🔒 Region Locked')
        .setDescription(access.reason ?? 'You cannot access this region yet.');
      await interaction.editReply({ embeds: [embed], components: [] });
      return true;
    }

    // Move player to chosen region + set cooldown
    await updatePlayer(interaction.user.id, interaction.user.username, (p) => ({
      ...p,
      region: regionId,
      cooldowns: { ...p.cooldowns, adventure: Date.now() + GAME_CONFIG.cooldowns.adventure },
    }));

    const updatedPlayer = await getPlayer(interaction.user.id, interaction.user.username);
    const encounter = generateHuntEncounter(updatedPlayer);
    const region = REGIONS[regionId];

    // Quick inline result for non-combat encounters
    if (encounter.type === 'treasure') {
      const result = await economy.reward(
        updatedPlayer.userId, updatedPlayer.username, encounter.coins, encounter.xp
      );
      const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle(`${region.emoji} ${region.name} — 🎁 Treasure Found!`)
        .setDescription(`*${encounter.atmosphereLine}*\n\n${encounter.rarityEmoji} **${encounter.rarityLabel}** chest discovered!`)
        .addFields(
          { name: '💰', value: `+${encounter.coins.toLocaleString()}`, inline: true },
          { name: '✨ XP', value: `+${encounter.xp}`, inline: true },
          result.leveledUp ? { name: '🎉', value: `Level ${result.newLevel}!`, inline: true } : { name: '\u200b', value: '\u200b', inline: true }
        );
      await interaction.editReply({ embeds: [embed], components: [] });
      return true;
    }

    if (encounter.type === 'world_event') {
      const result = await economy.reward(
        updatedPlayer.userId, updatedPlayer.username, encounter.reward.coins, encounter.reward.xp
      );
      await updatePlayer(interaction.user.id, interaction.user.username, (p) => ({
        ...p, reputation: p.reputation + encounter.reward.reputation,
      }));
      const embed = new EmbedBuilder()
        .setColor(0xff4500)
        .setTitle(`${region.emoji} ${encounter.eventName}`)
        .setDescription(`*${encounter.atmosphereLine}*\n\n${encounter.description}`)
        .addFields(
          { name: '💰', value: `+${encounter.reward.coins.toLocaleString()}`, inline: true },
          { name: '✨', value: `+${encounter.reward.xp} XP`, inline: true },
          { name: '⭐', value: `+${encounter.reward.reputation} REP`, inline: true }
        );
      await interaction.editReply({ embeds: [embed], components: [] });
      return true;
    }

    if (encounter.type === 'npc') {
      const result = await economy.reward(
        updatedPlayer.userId, updatedPlayer.username, encounter.reward.coins, encounter.reward.xp
      );
      const embed = new EmbedBuilder()
        .setColor(0x7289da)
        .setTitle(`${region.emoji} ${encounter.npcEmoji} ${encounter.npcName}`)
        .setDescription(`*"${encounter.dialogue}"*`)
        .addFields(
          { name: '💰', value: `+${encounter.reward.coins.toLocaleString()}`, inline: true },
          { name: '✨', value: `+${encounter.reward.xp} XP`, inline: true }
        );
      await interaction.editReply({ embeds: [embed], components: [] });
      return true;
    }

    if (encounter.type === 'nothing') {
      const embed = new EmbedBuilder()
        .setColor(0x444444)
        .setTitle(`${region.emoji} ${region.name} — Nothing Here`)
        .setDescription(`*${encounter.atmosphereLine}*\n\nYou find nothing of interest.`);
      await interaction.editReply({ embeds: [embed], components: [] });
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

    // Import combat helpers inline to avoid circular deps at module level
    const { ActionRowBuilder: ARB, ButtonBuilder: BB, ButtonStyle: BS, EmbedBuilder: EB } =
      await import('discord.js');

    const session = createCombatSession(
      updatedPlayer, encounter.enemy,
      interaction.guildId ?? 'dm', interaction.channelId
    );
    combatStore.set(session);

    const enemy = encounter.enemy;
    const isBoss = encounter.type === 'boss';
    const enemyHpBar = buildBar(enemy.hp, enemy.maxHp, 12);
    const playerHpBar = buildBar(session.playerHp, session.playerMaxHp, 12);

    const embed = new EB()
      .setColor(isBoss ? 0xff0000 : 0xe74c3c)
      .setTitle(
        isBoss
          ? `👑 BOSS — ${enemy.emoji} ${enemy.name}`
          : `⚔️ ${region.emoji} ${region.name} — ${enemy.emoji} ${enemy.name}`
      )
      .setDescription(
        (encounter.type === 'ambush'
          ? `💥 **AMBUSH!** ${enemy.name} strikes first!\n\n`
          : '') +
        `${enemyHpBar} **${enemy.hp}/${enemy.maxHp} HP** (Lv.${enemy.level})\n` +
        `${playerHpBar} **You: ${session.playerHp}/${session.playerMaxHp} HP**\n\n` +
        `_Combat begins…_`
      );

    const combatRow = new ARB<BB>().addComponents(
      new BB().setCustomId(`combat_attack_${session.id}`).setLabel('⚔️ Attack').setStyle(BS.Danger),
      new BB().setCustomId(`combat_flee_${session.id}`).setLabel('🏃 Flee').setStyle(BS.Secondary)
    );

    await interaction.editReply({ embeds: [embed], components: [combatRow] });
    return true;
  },
};

function buildBar(current: number, max: number, length: number): string {
  const filled = Math.max(0, Math.round((current / max) * length));
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}
