/**
 * /ids — Quickly display relevant Discord IDs for the current context.
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ids')
  .setDescription('Show relevant Discord IDs');

export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const channel = interaction.channel;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🔢 Discord IDs')
    .addFields(
      { name: 'User', value: interaction.user.id, inline: true },
      { name: 'Server', value: guild?.id ?? 'N/A (DM)', inline: true },
      { name: 'Channel', value: channel?.id ?? 'N/A', inline: true },
      { name: 'Interaction', value: interaction.id, inline: true },
      ...(guild ? [{ name: 'Server Owner', value: (guild.members.me ? 'N/A' : 'Fetch if needed'), inline: true }] : []),
    )
    .setFooter({ text: 'Public IDs — safe to share with developers' })
    .setTimestamp();
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
