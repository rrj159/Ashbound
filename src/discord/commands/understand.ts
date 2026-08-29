/**
 * /understand — AI file analysis.
 * Reads text from uploaded files or URLs and produces a summary/analysis.
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { router } from '../../ai/service.js';
import { isRateLimited } from '../../ai/rateLimit.js';

export const data = new SlashCommandBuilder()
  .setName('understand')
  .setDescription('AI analysis of uploaded text/file')
  .addStringOption((opt) => opt.setName('file').setDescription('File URL or text snippet').setRequired(true).setMaxLength(4000))
  .addStringOption((opt) =>
    opt.setName('focus')
      .setDescription('What to focus on')
      .addChoices(
        { name: 'Summary', value: 'summary' },
        { name: 'Key Points', value: 'keypoints' },
        { name: 'Analysis', value: 'analysis' },
        { name: 'Translation', value: 'translate' },
      ),
  );

export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  if (isRateLimited(interaction.user.id)) {
    await interaction.reply({ content: '⏸️ You are sending requests too fast. Please slow down.', ephemeral: true });
    return;
  }

  const input = interaction.options.getString('file', true);
  const focus = interaction.options.getString('focus') ?? 'summary';
  await interaction.deferReply();

  const focusPrompt: Record<string, string> = {
    summary:    'Provide a concise summary of the following text.',
    keypoints:  'Extract the key points as bullet points.',
    analysis:   'Provide an analytical interpretation.',
    translate:  'Translate into English if needed, or explain meaning.',
  };

  try {
    const system = `You are Ashbound — an expert document analyst. ${focusPrompt[focus]} Keep your response under 1500 characters.`;
    const result = await router.say(input, system, { costSensitive: true, intent: 'simple' });
    const embed = new EmbedBuilder()
      .setColor(0x003300)
      .setTitle('📄 File Analysis')
      .setAuthor({ name: 'Ashbound — Document Reader' })
      .setDescription(result.length > 2000 ? result.slice(0, 1997) + '...' : result)
      .setFooter({ text: `Focus: ${focus}` });
    await interaction.editReply({ embeds: [embed] });
  } catch {
    await interaction.editReply({ content: '❌ The document analysis falters. Try again.' });
  }
}
