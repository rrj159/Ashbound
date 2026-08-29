/**
 * /serverinfo — Display Discord server information.
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('serverinfo')
  .setDescription('Show information about this server');

export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: '❌ This command only works in servers.', ephemeral: true });
    return;
  }

  const { guild } = interaction;
  const owner = await guild.fetchOwner().catch(() => null);
  const members = guild.memberCount;
  const textChannels = guild.channels.cache.filter((c) => c.isTextBased()).size;
  const voiceChannels = guild.channels.cache.filter((c) => c.isVoiceBased()).size;
  const createdDays = Math.floor((Date.now() - guild.createdAt.getTime()) / 86400000);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📊 ${guild.name}`)
    .setThumbnail(guild.iconURL({ size: 256 }) ?? null)
    .addFields(
      { name: 'Owner',       value: owner?.user.tag ?? 'Unknown', inline: true },
      { name: 'Members',     value: members.toLocaleString(),     inline: true },
      { name: 'Boost Tier',  value: `Tier ${guild.premiumTier}`,  inline: true },
      { name: 'Text Channels', value: textChannels.toString(),    inline: true },
      { name: 'Voice Channels', value: voiceChannels.toString(),  inline: true },
      { name: 'Roles',       value: guild.roles.cache.size.toString(), inline: true },
      { name: 'Created',     value: `<t:${Math.floor(guild.createdAt.getTime() / 1000)}:R> (${createdDays} days ago)`, inline: true },
      { name: 'Verification', value: guild.verificationLevel.toString(), inline: true },
      { name: 'ID',          value: guild.id,                     inline: true },
    )
    .setFooter({ text: `Requested by ${interaction.user.tag}` })
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
}
