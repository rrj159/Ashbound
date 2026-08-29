/**
 * /reset — Clear AI conversation context and start fresh.
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('reset')
  .setDescription('Clear your AI conversation context and start fresh');

export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(0x9e9e9e)
    .setTitle('🔄 Reset')
    .setDescription('Conversation context cleared.\nStart fresh with /chat, /session start, or send a message.');
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
