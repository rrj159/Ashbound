import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getPlayer } from '../../games/store.js';
import { REGIONS } from '../../games/regions.js';
import type { AshenCommand } from './index.js';

export const profileCommand: AshenCommand = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your Ashen Realms character profile'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const player = await getPlayer(
      interaction.user.id,
      interaction.user.username
    );

    const region = REGIONS[player.region];
    const equippedCount = Object.values(player.equipment).filter(Boolean).length;
    const activePet = player.pets.find((p) => p.id === player.activePet);

    const xpBar = buildProgressBar(player.xp % 100, 100, 10);

    const embed = new EmbedBuilder()
      .setColor(0x1a1a2e)
      .setTitle(`${region.emoji} ${player.characterName}`)
      .setDescription(
        player.activeTitle
          ? `*${player.activeTitle.replace(/_/g, ' ').toUpperCase()}*`
          : ''
      )
      .addFields(
        {
          name: '⚔️ Combat',
          value: [
            `**Level:** ${player.level}`,
            `**HP:** ${player.hp}/${player.maxHp}`,
            `**ATK:** ${player.attack} | **DEF:** ${player.defense} | **LCK:** ${player.luck}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '💰 Economy',
          value: [
            `**Gold:** ${player.gold.toLocaleString()} 🪙`,
            `**Reputation:** ${player.reputation}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '🌍 World',
          value: [
            `**Region:** ${region.emoji} ${region.name}`,
            `**Unlocked:** ${player.unlockedRegions.length}/5`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '📊 XP',
          value: `${xpBar} ${player.xp} XP`,
          inline: false,
        },
        {
          name: '🎒 Inventory',
          value: [
            `**Items:** ${player.inventory.length}`,
            `**Equipped:** ${equippedCount}/6`,
            activePet ? `**Pet:** ${activePet.emoji} ${activePet.name}` : '**Pet:** None',
          ].join('\n'),
          inline: true,
        },
        {
          name: '📜 Stats',
          value: [
            `**Monsters Killed:** ${player.statistics.monstersKilled}`,
            `**Boss Kills:** ${player.statistics.bossesKilled}`,
            `**Deaths:** ${player.statistics.deaths}`,
          ].join('\n'),
          inline: true,
        }
      )
      .setFooter({ text: `AshenAI • Season ${player.seasonStats.season}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

function buildProgressBar(current: number, max: number, length: number): string {
  const filled = Math.round((current / max) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}
