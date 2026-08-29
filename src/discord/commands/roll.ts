/**
 * /roll — AI-powered dice roll with narrative flavor.
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { router } from '../../ai/service.js';
import { isRateLimited } from '../../ai/rateLimit.js';

export const data = new SlashCommandBuilder()
  .setName('roll')
  .setDescription('Roll the dice with AI narration')
  .addStringOption((opt) => opt.setName('dice').setDescription('e.g., 1d20, 2d6, 4d4').setRequired(true).setMaxLength(20))
  .addStringOption((opt) => opt.setName('action').setDescription('What are you rolling for?').setMaxLength(200));

export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  if (isRateLimited(interaction.user.id)) {
    await interaction.reply({ content: '⏸️ You are sending requests too fast. Please slow down.', ephemeral: true });
    return;
  }

  const dice   = interaction.options.getString('dice', true);
  const action = interaction.options.getString('action') ?? 'an unknown fate';
  await interaction.deferReply();

  // Parse simple dice notation (e.g., 3d8 + 2)
  const match = dice.match(/(\d+)d(\d+)(?:\s*([+-]\s*\d+))?/);
  let rollResult = 0;
  if (match) {
    const count = parseInt(match[1], 10);
    const sides = parseInt(match[2], 10);
    const bonus = match[3] ? parseInt(match[3].replace(/\s+/g, ''), 10) : 0;
    for (let i = 0; i < count; i++) rollResult += Math.floor(Math.random() * sides) + 1;
    rollResult += bonus;
  } else {
    rollResult = Math.floor(Math.random() * 20) + 1;
  }

  try {
    const prompt = `The player rolled ${dice} and got ${rollResult} while ${action}. Provide a brief, atmospheric one-sentence narration of the result.`;
    const narration = await router.say(prompt, `You are a fantasy narrator describing dice rolls in the Ashen Realms. Be brief — one sentence maximum.`, { costSensitive: true, intent: 'simple' });
    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle(`🎲 Roll: ${dice}`)
      .setDescription(`**Result:** **${rollResult}**\n*${narration || 'The dice fall silently.'}*`)
      .setFooter({ text: `Action: ${action}` });
    await interaction.editReply({ embeds: [embed] });
  } catch {
    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle(`🎲 Roll: ${dice}`)
      .setDescription(`**Result:** **${rollResult}**`);
    await interaction.editReply({ embeds: [embed] });
  }
}
