/**
 * /channelinfo — Show information about a channel.
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('channelinfo')
  .setDescription('Show information about a channel')
  .addChannelOption((opt) => opt.setName('channel').setDescription('Channel to inspect').setRequired(false));

export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.options.getChannel('channel') ?? interaction.channel;
  if (!channel || !('name' in channel)) {
    await interaction.reply({ content: '❌ Could not find a valid channel.', ephemeral: true });
    return;
  }

  const gc = channel as import('discord.js').GuildChannel;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`# ${channel.name}`)
    .addFields(
      { name: 'Type', value: channel.type.toString(), inline: true },
      { name: 'ID', value: channel.id, inline: true },
      { name: 'Created', value: `<t:${Math.floor(gc.createdTimestamp / 1000)}:R>`, inline: true },
    )
    .setFooter({ text: `Server: ${interaction.guild?.name ?? 'DM'}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
