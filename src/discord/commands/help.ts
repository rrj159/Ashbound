/**
 * /help — Show available commands.
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getCommands } from './index.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Show available commands');

export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  const commands = getCommands();
  const categorized: Record<string, string[]> = {};

  for (const cmd of commands) {
    const name = cmd.data.name;
    const desc = (cmd.data as { description?: string }).description ?? '';
    const category = ['chat', 'ask', 'lore', 'narrate', 'translate', 'summarize', 'understand', 'describe', 'roll', 'session', 'clear', 'reset', 'model'].includes(name) ? '🧠 AI' :
                     ['ping', 'serverinfo', 'userinfo', 'channelinfo', 'roleinfo', 'avatar', 'help', 'remind', 'ids', 'status'].includes(name) ? '🛠️ Utilities' : 'Other';
    if (!categorized[category]) categorized[category] = [];
    categorized[category].push(`\`/${name}\` — ${desc}`);
  }

  const embed = new EmbedBuilder()
    .setColor(0x6a1b9a)
    .setTitle('📖 Ashbound — Command Help')
    .setDescription('All available commands, organized by category.')
    .setFooter({ text: 'Ashbound Bot' })
    .setTimestamp();

  for (const [cat, cmds] of Object.entries(categorized)) {
    embed.addFields({ name: cat, value: cmds.join('\n'), inline: false });
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
