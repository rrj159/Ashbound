/**
 * /ask — Quick question answering. Cost-sensitive (cheap provider preferred).
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { router } from '../../ai/service.js';
import { isRateLimited } from '../../ai/rateLimit.js';

const SYSTEM = `You are Ashbound, a wise sage of the Ashen Realms.
Answer questions clearly and concisely. Prefer brevity — 2-4 sentences unless detail is asked.`;

export const data = new SlashCommandBuilder()
  .setName('ask')
  .setDescription('Quick AI-powered question')
  .addStringOption((opt) => opt.setName('question').setDescription('Your question').setRequired(true).setMaxLength(2000));

export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  if (isRateLimited(interaction.user.id)) {
    await interaction.reply({ content: '⏸️ You are sending requests too fast. Please slow down.', ephemeral: true });
    return;
  }

  const question = interaction.options.getString('question', true);
  await interaction.deferReply();
  try {
    const answer = await router.say(question, SYSTEM, { costSensitive: true, intent: 'simple' });
    const embed = new EmbedBuilder().setColor(0x6a1b9a).setAuthor({ name: 'Ashbound' }).setDescription(answer);
    await interaction.editReply({ embeds: [embed] });
  } catch {
    await interaction.editReply({ content: '❌ The ancient voice falls silent. Try again.' });
  }
}
