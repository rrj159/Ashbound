/**
 * /title -- List earned titles and set your active display title.
 */

import {
  SlashCommandBuilder, EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getPlayer, updatePlayer } from '../../games/store.js';
import { TITLE_DEFINITIONS, getTitleDefinition } from '../../games/titles.js';
import type { AshenCommand } from './index.js';
import type { TitleId } from '../../games/types.js';

export const titleCommand: AshenCommand = {
  data: new SlashCommandBuilder()
    .setName('title')
    .setDescription('Manage your titles')
    .addSubcommand((s) => s.setName('list').setDescription('List all titles and unlock status'))
    .addSubcommand((s) =>
      s.setName('set')
        .setDescription('Set your active display title')
        .addStringOption((o) =>
          o.setName('title').setDescription('Which title to display').setRequired(true)
            .addChoices(...TITLE_DEFINITIONS.map((t) => ({ name: `${t.emoji} ${t.name}`, value: t.id })))
        )
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    const sub    = interaction.options.getSubcommand();
    const player = await getPlayer(interaction.user.id, interaction.user.username);

    if (sub === 'list') {
      const earned  = player.titles;
      const embed = new EmbedBuilder()
        .setColor(0x1a1a2e)
        .setTitle('Title Collection')
        .setDescription(`Earned: **${earned.length} / ${TITLE_DEFINITIONS.length}**\nActive: ${player.activeTitle ? (() => { const d = getTitleDefinition(player.activeTitle); return d ? `${d.emoji} **${d.name}**` : player.activeTitle; })() : '_none_'}`);
      const unlocked = TITLE_DEFINITIONS.filter((d) => earned.includes(d.id));
      const locked    = TITLE_DEFINITIONS.filter((d) => !earned.includes(d.id));
      if (unlocked.length > 0) {
        embed.addFields({ name: 'Unlocked', value: unlocked.map((d) => `${d.emoji} **${d.name}**${d.id === player.activeTitle ? ' <- active' : ''} -- ${d.description}`).join('\n'), inline: false });
      }
      if (locked.length > 0) {
        embed.addFields({ name: 'Locked', value: locked.map((d) => `${d.emoji} **${d.name}** -- ${d.description}`).join('\n'), inline: false });
      }
      embed.setFooter({ text: 'Use /title set <title> to change your active title' });
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (sub === 'set') {
      const titleId = interaction.options.getString('title', true) as TitleId;
      if (!player.titles.includes(titleId)) {
        const def = getTitleDefinition(titleId);
        await interaction.editReply({ content: `You have not unlocked **${def?.name ?? titleId}** yet. ${def?.description ?? ''}` });
        return;
      }
      await updatePlayer(player.userId, player.username, (p) => ({ ...p, activeTitle: titleId }));
      const def = getTitleDefinition(titleId)!;
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x2ecc71)
        .setTitle('Active Title Set')
        .setDescription(`You are now known as **${def.emoji} ${def.name}**\n*${def.description}*`)] });
      return;
    }
  },
};
