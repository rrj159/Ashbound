/**
 * /model — Show or change the active AI model/provider (admin).
 */

import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { listAvailableProviders } from '../../ai/health.js';

export const data = new SlashCommandBuilder()
  .setName('model')
  .setDescription('Show or change the active AI model (admin)')
  .addStringOption((opt) =>
    opt.setName('provider')
      .setDescription('Select AI provider')
      .addChoices(
        { name: 'Auto (router default)', value: 'auto' },
        { name: 'OpenAI', value: 'openai' },
        { name: 'Anthropic', value: 'anthropic' },
        { name: 'Gemini', value: 'gemini' },
        { name: 'Groq', value: 'groq' },
        { name: 'Mistral', value: 'mistral' },
        { name: 'DeepSeek', value: 'deepseek' },
        { name: 'OpenRouter', value: 'openrouter' },
        { name: 'xAI', value: 'xai' },
        { name: 'Cohere', value: 'cohere' },
      ),
  );

export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
  const provider = interaction.options.getString('provider');

  if (provider && provider !== 'auto' && !isAdmin) {
    await interaction.reply({ content: '❌ Only administrators can change the AI provider.', ephemeral: true });
    return;
  }

  const available = listAvailableProviders();

  if (!provider) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🤖 Active AI Configuration')
      .addFields(
        { name: 'Primary', value: process.env.AI_PROVIDER ?? 'auto', inline: true },
        { name: 'Fallback', value: process.env.AI_FALLBACK ?? 'none', inline: true },
        { name: 'Available', value: available.length > 0 ? available.join(', ') : 'None', inline: false },
      );
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  await interaction.reply({
    content: `✅ Provider preference set to \`${provider}\`. Note: changes require a restart to fully apply.`,
    ephemeral: true,
  });
}
