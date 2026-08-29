import { SlashCommandBuilder } from 'discord.js';
import { conversationKey, resetConversation } from '../../ai/conversation.js';
export const data = new SlashCommandBuilder().setName('reset').setDescription('Reset your AI conversation context');
export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  resetConversation(conversationKey({
    userId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
  }));
  await interaction.reply({ content: 'Your conversation context has been reset.', ephemeral: true });
}
