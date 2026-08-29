/**
 * /roleinfo — Show information about a server role.
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('roleinfo')
  .setDescription('Show information about a role')
  .addRoleOption((opt) => opt.setName('role').setDescription('Role to inspect').setRequired(true));

export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  const role = interaction.options.getRole('role', true);
  if (!interaction.guild) {
    await interaction.reply({ content: '❌ Must be used in a server.', ephemeral: true });
    return;
  }

  const membersWithRole = interaction.guild.members.cache.filter((m) => m.roles.cache.has(role.id)).size;
  const isGuildRole = 'createdTimestamp' in role;
  const createdTimestamp = isGuildRole ? role.createdTimestamp : 0;
  const createdDays = Math.floor((Date.now() - createdTimestamp) / 86400000);

  const embed = new EmbedBuilder()
    .setColor(role.color || 0x5865f2)
    .setTitle(`🏷️ ${role.name}`)
    .setThumbnail(isGuildRole ? (role.iconURL({ size: 128 }) ?? null) : null)
    .addFields(
      { name: 'ID', value: role.id, inline: true },
      { name: 'Color', value: `#${(role.color || 0).toString(16).padStart(6, '0')}`, inline: true },
      { name: 'Position', value: role.position.toString(), inline: true },
      { name: 'Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true },
      { name: 'Mentions', value: role.mentionable ? 'Yes' : 'No', inline: true },
      { name: 'Members', value: membersWithRole.toString(), inline: true },
      { name: 'Created', value: `<t:${Math.floor(createdTimestamp / 1000)}:R> (${createdDays} days ago)`, inline: true },
      { name: 'Permissions', value: role.permissions.toString(), inline: false },
    )
    .setFooter({ text: `Server: ${interaction.guild.name}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
