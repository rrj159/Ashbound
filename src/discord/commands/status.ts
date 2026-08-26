import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { GAME_CONFIG } from '../../games/config.js';
import { getAllPlayers } from '../../games/store.js';
import type { AshenCommand } from './index.js';

export const statusCommand: AshenCommand = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check AshenAI bot and game status'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const players = await getAllPlayers();
    const uptime = process.uptime();
    const uptimeStr = formatUptime(uptime);

    const embed = new EmbedBuilder()
      .setColor(0x16213e)
      .setTitle('🌑 AshenAI — System Status')
      .addFields(
        {
          name: '🤖 Bot',
          value: [
            `**Status:** 🟢 Online`,
            `**Uptime:** ${uptimeStr}`,
            `**Memory:** ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '🌑 Ashen Realms',
          value: [
            `**Season:** ${GAME_CONFIG.season.current} — ${GAME_CONFIG.season.name}`,
            `**Players:** ${players.length}`,
            `**Regions:** 5`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '⚙️ Config',
          value: [
            `**Hunt Cooldown:** ${GAME_CONFIG.cooldowns.hunt / 1000}s`,
            `**Max Level:** ${GAME_CONFIG.xp.maxLevel}`,
            `**Max Coins:** ${GAME_CONFIG.economy.maxCoins.toLocaleString()}`,
          ].join('\n'),
          inline: true,
        }
      )
      .setFooter({ text: 'AshenAI' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}
