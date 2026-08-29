import { SlashCommandBuilder } from 'discord.js';
import { isRateLimited } from '../../ai/rateLimit.js';
import { conversationKey, converse } from '../../ai/conversation.js';
import { splitDiscordMessage } from '../handlers/message.js';

export const data = new SlashCommandBuilder().setName('ask').setDescription('Ask Ashbound anything')
  .addStringOption((opt) => opt.setName('question').setDescription('What would you like to ask?').setRequired(true).setMaxLength(4000));
export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  if (isRateLimited(interaction.user.id)) { await interaction.reply({ content: '⏸️ You are sending requests too fast. Please slow down.', ephemeral: true }); return; }
  await interaction.deferReply();
  try {
    const answer = await converse({ key: conversationKey({ userId: interaction.user.id, guildId: interaction.guildId, channelId: interaction.channelId }), prompt: interaction.options.getString('question', true) });
    const [first, ...rest] = splitDiscordMessage(answer);
    await interaction.editReply({ content: first });
    for (const chunk of rest) await interaction.followUp({ content: chunk });
  } catch (err) {
    console.error('[Ask] AI error:', err instanceof Error ? err.message : err);
    await interaction.editReply("❌ I couldn't reach any available AI provider right now. Please try again shortly.");
  }
}
