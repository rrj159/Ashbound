/**
 * /avatar — Display a user's avatar.
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('avatar')
  .setDescription("Show a user's avatar")
  .addUserOption((opt) => opt.setName('user').setDescription('User').setRequired(false));

export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  const user = interaction.options.getUser('user') ?? interaction.user;
  const avatarUrl = user.displayAvatarURL({ size: 1024 });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🖼️ ${user.tag}'s Avatar`)
    .setImage(avatarUrl)
    .setDescription(`[Open in browser](${avatarUrl})`)
    .setFooter({ text: `Requested by ${interaction.user.tag}` });
  await interaction.reply({ embeds: [embed] });
}
