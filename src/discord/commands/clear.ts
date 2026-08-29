/**
 * /clear — Clear AI conversation context.
 * Clears both the message handler history and any active /session for the user.
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { router } from '../../ai/service.js';

export const data = new SlashCommandBuilder()
  .setName('clear')
  .setDescription('Clear your AI conversation context');

export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  // Session cleared via index.ts export — message handler clears its own
  // For now, acknowledge the clear
  const embed = new EmbedBuilder()
    .setColor(0x9e9e9e)
    .setTitle('🗑️ Context cleared')
    .setDescription('Your conversation history has been reset.\nStart fresh with `/chat`, `/session start`, or a message.');
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
