/**
 * /ping — Latency and status check.
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Check bot latency and status');

export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  const sent = await interaction.reply({ content: '🏓 Pinging...', fetchReply: true });
  const rtt = sent.createdTimestamp - interaction.createdTimestamp;
  const ws = interaction.client.ws.ping;

  const status = ws < 100 ? '🟢 Excellent' : ws < 250 ? '🟡 Good' : ws < 500 ? '🟠 Slow' : '🔴 Lagging';
  const color = ws < 100 ? 0x00ff00 : ws < 250 ? 0xffaa00 : ws < 500 ? 0xff5500 : 0xff0000;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('🏓 Pong!')
    .addFields(
      { name: 'Round-trip', value: `${rtt}ms`, inline: true },
      { name: 'WebSocket',  value: `${ws}ms`,  inline: true },
      { name: 'Status',     value: status,     inline: true },
    )
    .setTimestamp();
  await interaction.editReply({ content: '', embeds: [embed] });
}
