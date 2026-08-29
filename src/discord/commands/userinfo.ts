/**
 * /userinfo — Display Discord user information.
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('userinfo')
  .setDescription('Show information about a user')
  .addUserOption((opt) => opt.setName('user').setDescription('User to inspect').setRequired(false));

export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  const user = interaction.options.getUser('user') ?? interaction.user;
  const member = interaction.guild?.members.cache.get(user.id);

  const createdDays = Math.floor((Date.now() - user.createdAt.getTime()) / 86400000);
  const joinedDays = member
    ? Math.floor((Date.now() - (member.joinedAt?.getTime() ?? Date.now())) / 86400000)
    : null;

  const embed = new EmbedBuilder()
    .setColor(member?.displayColor ?? 0x5865f2)
    .setTitle(`👤 ${user.tag}`)
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'ID',       value: user.id,                                            inline: true  },
      { name: 'Bot',      value: user.bot ? 'Yes' : 'No',                             inline: true  },
      { name: 'Created',  value: `<t:${Math.floor(user.createdAt.getTime() / 1000)}:R>`, inline: true },
      ...(member ? [
        { name: 'Nickname', value: member.nickname ?? 'None',                        inline: true },
        { name: 'Joined',   value: `<t:${Math.floor((member.joinedAt?.getTime() ?? Date.now()) / 1000)}:R>`, inline: true },
        { name: 'Roles',    value: member.roles.cache.size.toString(),                inline: true },
      ] : []),
    )
    .setFooter({ text: `Requested by ${interaction.user.tag}` })
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
}
