/**
 * /summarize — AI summary of a long text or URL.
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { router } from '../../ai/service.js';
import { isRateLimited } from '../../ai/rateLimit.js';

const SYSTEM = `You are a summarizer. Produce a clear, concise summary in 3-5 bullet points.
Capture the most important points. Output bullets prefixed with "•".`;

export const data = new SlashCommandBuilder()
  .setName('summarize')
  .setDescription('Summarize long text or a URL')
  .addStringOption((opt) => opt.setName('text').setDescription('Text or URL to summarize').setRequired(true).setMaxLength(4000))
  .addStringOption((opt) =>
    opt.setName('length')
      .setDescription('Summary length')
      .addChoices(
        { name: 'Brief (1-2 sentences)', value: 'brief'   },
        { name: 'Standard (3-5 bullets)',value: 'standard'},
        { name: 'Detailed (paragraph)',  value: 'detailed'},
      ),
  );

export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  if (isRateLimited(interaction.user.id)) {
    await interaction.reply({ content: '⏸️ You are sending requests too fast. Please slow down.', ephemeral: true });
    return;
  }

  const text   = interaction.options.getString('text', true);
  const length = interaction.options.getString('length') ?? 'standard';
  await interaction.deferReply();
  try {
    const lengthMap: Record<string, string> = {
      brief:    'Summarize in 1-2 sentences.',
      standard: 'Summarize in 3-5 bullet points.',
      detailed: 'Summarize in one detailed paragraph.',
    };
    const prompt = `${lengthMap[length]}\n\n---\n${text}`;
    const summary = await router.say(prompt, SYSTEM, { costSensitive: true, intent: 'simple' });
    const embed = new EmbedBuilder()
      .setColor(0x00897b)
      .setTitle('📝 Summary')
      .setDescription(summary.length > 2000 ? summary.slice(0, 1997) + '...' : summary);
    await interaction.editReply({ embeds: [embed] });
  } catch {
    await interaction.editReply({ content: '❌ The chronicler is unavailable. Try again.' });
  }
}
