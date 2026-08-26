/**
 * /quests -- View and claim daily, weekly, and story quests.
 */

import {
  SlashCommandBuilder, EmbedBuilder,
  type ChatInputCommandInteraction, type ButtonInteraction,
} from 'discord.js';
import { getPlayer, updatePlayer } from '../../games/store.js';
import { economy } from '../../games/economy.js';
import {
  refreshQuests, ensureStoryQuests, claimQuestRewards, objectiveBar,
} from '../../games/quests.js';
import type { AshenCommand } from './index.js';
import type { Quest, QuestType } from '../../games/types.js';

const TYPE_COLORS: Record<string, number> = {
  daily: 0x3498db, weekly: 0x9b59b6, story: 0xe67e22,
  achievement: 0xf1c40f, region: 0x2ecc71, combat: 0xe74c3c, dungeon: 0x95a5a6, collection: 0x1abc9c,
};

export const questsCommand: AshenCommand = {
  data: new SlashCommandBuilder()
    .setName('quests')
    .setDescription('View and claim your quests')
    .addSubcommand((s) => s.setName('daily').setDescription('View your daily quests'))
    .addSubcommand((s) => s.setName('weekly').setDescription('View your weekly quests'))
    .addSubcommand((s) => s.setName('story').setDescription('View your story quests'))
    .addSubcommand((s) => s.setName('all').setDescription('View all active quests'))
    .addSubcommand((s) =>
      s.setName('claim')
        .setDescription('Claim a completed quest (use quest number from list)')
        .addIntegerOption((o) =>
          o.setName('number').setDescription('Quest number from the list').setRequired(true).setMinValue(1)
        )
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    const sub = interaction.options.getSubcommand();

    const player = await updatePlayer(interaction.user.id, interaction.user.username, (p) => {
      let u = refreshQuests(p);
      u     = ensureStoryQuests(u);
      return u;
    });

    if (sub === 'claim') {
      const num     = interaction.options.getInteger('number', true);
      const visible = getVisible(player.quests, 'all');
      const quest   = visible[num - 1];
      if (!quest) { await interaction.editReply({ content: `No quest at position **${num}**.` }); return; }
      if (quest.status !== 'completed') { await interaction.editReply({ content: `Quest **${quest.name}** is not completed yet.` }); return; }

      const result = claimQuestRewards(player, quest.id);
      if (result.error) { await interaction.editReply({ content: `${result.error}` }); return; }

      await updatePlayer(interaction.user.id, interaction.user.username, () => result.player);
      const rewardResult = await economy.reward(player.userId, player.username, result.xp, result.coins);

      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x2ecc71)
        .setTitle(`Quest Completed: ${quest.name}`)
        .setDescription(`Rewards claimed!${result.title ? `\nTitle: **${result.title.replace(/_/g, ' ')}**` : ''}${result.reputation > 0 ? `\n+${result.reputation} reputation` : ''}`)
        .addFields(
          { name: 'Coins',    value: `+${result.coins.toLocaleString()}`, inline: true },
          { name: 'XP',       value: `+${result.xp}`,                     inline: true },
          rewardResult.leveledUp ? { name: 'Level Up!', value: `Level **${rewardResult.newLevel}**!`, inline: true } : { name: '\u200b', value: '\u200b', inline: true },
        )] });
      return;
    }

    const filterType = sub === 'all' ? 'all' : (sub as QuestType);
    const visible    = getVisible(player.quests, filterType);

    const embed = new EmbedBuilder()
      .setColor(TYPE_COLORS[filterType] ?? 0x1a1a2e)
      .setTitle(`${capitalize(filterType)} Quests`)
      .setDescription(`${visible.filter(q => q.status === 'completed').length} completed | ${visible.filter(q => q.status === 'active').length} active\nUse \`/quests claim <number>\` to claim rewards.`);

    if (visible.length === 0) {
      embed.setDescription('No quests in this category yet.');
    } else {
      visible.forEach((quest, i) => {
        const statusEmoji = quest.status === 'completed' ? 'DONE' : quest.status === 'claimed' ? 'CLAIMED' : 'active';
        const objs = quest.objectives.map((obj) => `${obj.completed ? 'V' : 'o'} ${obj.description}: ${objectiveBar(obj.current, obj.required, 8)} ${obj.current}/${obj.required}`).join('\n');
        const rewards = [quest.rewards.coins ? `${quest.rewards.coins} coins` : '', quest.rewards.xp ? `${quest.rewards.xp} XP` : '', quest.rewards.title ? quest.rewards.title.replace(/_/g, ' ') : ''].filter(Boolean).join(' | ');
        const expiry  = quest.expiresAt ? `Expires: ${timeUntil(quest.expiresAt)}` : '';
        embed.addFields({ name: `[${statusEmoji}] #${i + 1} ${quest.name}`, value: [objs, rewards, expiry].filter(Boolean).join('\n'), inline: false });
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },

  async handleButton(_interaction: ButtonInteraction): Promise<boolean> { return false; },
};

function getVisible(quests: Quest[], filter: string): Quest[] {
  return quests.filter((q) => filter === 'all' ? q.status !== 'claimed' : q.type === filter && q.status !== 'claimed');
}

function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

function timeUntil(isoDate: string): string {
  const ms = new Date(isoDate).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
