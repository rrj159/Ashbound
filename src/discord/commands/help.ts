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
    const category = ['profile', 'status', 'hunt', 'adventure', 'inventory', 'gear', 'pets', 'quests', 'title'].includes(name) ? '🎮 Ashen Realms' :
                     ['chat', 'ask', 'lore', 'narrate', 'translate', 'summarize', 'roll', 'session', 'clear', 'reset', 'describe', 'understand'].includes(name) ? '🧠 AI' :
                     ['ping', 'serverinfo', 'userinfo', 'avatar', 'help'].includes(name) ? '🛠️ Utilities' : 'Other';
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
