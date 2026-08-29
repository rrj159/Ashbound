/**
 * /status — Show bot + AI status.
 */

import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getAllHealth, getCooldowns, listAvailableProviders } from '../../ai/health.js';
import { router } from '../../ai/service.js';
import { getAllPerf } from '../../ai/router.js';

export const data = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Show bot and AI status')
  .addBooleanOption((opt) => opt.setName('detailed').setDescription('Show detailed provider info (admin only)'));

export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  const detailed = interaction.options.getBoolean('detailed') ?? false;
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
  const showDetailed = detailed && isAdmin;

  const health = getAllHealth();
  const cooldowns = getCooldowns();
  const providers = listAvailableProviders();

  const statusEmoji: Record<string, string> = {
    healthy: '🟢', degraded: '🟡', unhealthy: '🔴', unknown: '⚪',
  };

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🤖 Ashbound — Status')
    .addFields(
      { name: 'Bot', value: '🟢 Online', inline: true },
      { name: 'Uptime', value: `${Math.floor(process.uptime() / 60)}m`, inline: true },
      { name: 'Latency', value: `${interaction.client.ws.ping}ms`, inline: true },
      { name: 'AI Providers', value: providers.length > 0 ? providers.join(', ') : '⚠️ None configured', inline: false },
    )
    .setTimestamp();

  if (showDetailed) {
    for (const name of providers) {
      const h = health[name];
      if (!h) continue;
      const inCooldown = cooldowns[name];
      const value = [
        `${statusEmoji[h.status]} ${h.status}`,
        `Success: ${h.totalSuccesses}/${h.totalSuccesses + h.totalFailures}`,
        `Latency: ${Math.round(h.avgLatencyMs)}ms avg / ${Math.round(h.p95LatencyMs)}ms p95`,
        inCooldown ? `⏸️ Cooldown: ${Math.round(inCooldown.remainingMs / 1000)}s` : '',
      ].filter(Boolean).join('\n');
      embed.addFields({ name: name, value, inline: true });
    }
  }

  await interaction.reply({ embeds: [embed], ephemeral: !showDetailed });
}
