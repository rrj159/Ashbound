/**
 * /pets -- View, adopt, manage, and feed your companions.
 */

import {
  SlashCommandBuilder, EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getPlayer, updatePlayer } from '../../games/store.js';
import {
  PET_CATALOG, createPet, addPetXp, formatPetBonuses,
  xpToNextPetLevel, getPetStage,
} from '../../games/pets.js';
import { GAME_CONFIG } from '../../games/config.js';
import type { AshenCommand } from './index.js';

const STARTER_PETS = ['ash_cat', 'shadow_fox', 'dire_wolf'] as const;
const FEED_COST = 100;
const FEED_XP   = 100;

const RARITY_COLORS: Record<string, number> = {
  Common: 0x888888, Uncommon: 0x2ecc71, Rare: 0x3498db,
  Epic: 0x9b59b6, Legendary: 0xffd700, Mythic: 0xff4500, Divine: 0xffffff,
};

export const petsCommand: AshenCommand = {
  data: new SlashCommandBuilder()
    .setName('pets')
    .setDescription('Manage your companions')
    .addSubcommand((s) => s.setName('view').setDescription('View all your pets'))
    .addSubcommand((s) =>
      s.setName('adopt')
        .setDescription('Adopt a free starter pet (first-time only)')
        .addStringOption((o) =>
          o.setName('type').setDescription('Which starter pet').setRequired(true)
            .addChoices(
              { name: 'Ash Cat (+5% coins)',    value: 'ash_cat'    },
              { name: 'Shadow Fox (+8% XP)',    value: 'shadow_fox' },
              { name: 'Dire Wolf (+10% combat)',value: 'dire_wolf'  },
            )
        )
    )
    .addSubcommand((s) =>
      s.setName('setactive')
        .setDescription('Set your active companion')
        .addStringOption((o) => o.setName('name').setDescription('Pet name or part of it').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('feed')
        .setDescription(`Feed a pet ${FEED_XP} XP for ${FEED_COST} coins`)
        .addStringOption((o) => o.setName('name').setDescription('Pet name or part of it').setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName('info')
        .setDescription('Detailed info about a specific pet')
        .addStringOption((o) => o.setName('name').setDescription('Pet name or part of it').setRequired(true))
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    const sub    = interaction.options.getSubcommand();
    const player = await getPlayer(interaction.user.id, interaction.user.username);

    if (sub === 'view') {
      if (player.pets.length === 0) {
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x1a1a2e).setTitle('Your Companions')
          .setDescription('No pets yet! Use `/pets adopt` to get your first free companion.\n\nStarters: Ash Cat (coins), Shadow Fox (XP), Dire Wolf (combat)')] });
        return;
      }
      const embed = new EmbedBuilder().setColor(0x1a1a2e).setTitle('Your Companions');
      for (const pet of player.pets) {
        const isActive  = pet.id === player.activePet;
        const xpNeeded  = xpToNextPetLevel(pet);
        const filled    = Math.round((pet.xp / xpNeeded) * 10);
        const xpBar     = '\u2588'.repeat(Math.min(filled, 10)) + '\u2591'.repeat(Math.max(0, 10 - filled));
        const nextEvol  = pet.templateId ? (PET_CATALOG[pet.templateId]?.stages ?? []).find((s) => s.minLevel > pet.level) : null;
        embed.addFields({
          name:  `${pet.emoji} ${pet.name}${isActive ? ' [ACTIVE]' : ''}`,
          value: [
            `${pet.rarity} Lv.${pet.level} | ${xpBar} ${pet.xp}/${xpNeeded} XP`,
            formatPetBonuses(pet),
            nextEvol ? `Evolves at Lv.${nextEvol.minLevel}: **${nextEvol.name}**` : 'Max evolution reached',
          ].join('\n'),
          inline: false,
        });
      }
      embed.setFooter({ text: 'Use /pets setactive <name> to change active companion' });
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (sub === 'adopt') {
      const hasStarter = player.pets.some((p) => p.templateId && (STARTER_PETS as readonly string[]).includes(p.templateId));
      if (player.pets.length > 0 && hasStarter) {
        await interaction.editReply({ content: 'You already have a starter pet. Higher-tier pets are found through special drops!' });
        return;
      }
      const type   = interaction.options.getString('type', true);
      const newPet = createPet(type);
      if (!newPet) { await interaction.editReply({ content: 'Invalid pet type.' }); return; }
      await updatePlayer(player.userId, player.username, (p) => ({
        ...p, pets: [...p.pets, newPet], activePet: p.activePet ?? newPet.id,
      }));
      const template = PET_CATALOG[type];
      await interaction.editReply({ embeds: [new EmbedBuilder()
        .setColor(RARITY_COLORS[newPet.rarity] ?? 0x888888)
        .setTitle(`${newPet.emoji} ${newPet.name} joined your party!`)
        .setDescription(template?.description ?? '')
        .addFields(
          { name: 'Bonuses', value: formatPetBonuses(newPet), inline: false },
          { name: 'Rarity',  value: newPet.rarity,             inline: true  },
        )] });
      return;
    }

    if (sub === 'setactive') {
      const query = interaction.options.getString('name', true).toLowerCase();
      const pet   = player.pets.find((p) => p.name.toLowerCase().includes(query));
      if (!pet) { await interaction.editReply({ content: `No pet matching "${query}" found.` }); return; }
      await updatePlayer(player.userId, player.username, (p) => ({ ...p, activePet: pet.id }));
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(RARITY_COLORS[pet.rarity] ?? 0x888888)
        .setTitle(`${pet.emoji} ${pet.name} is now your active companion!`)
        .setDescription(formatPetBonuses(pet))] });
      return;
    }

    if (sub === 'feed') {
      const query = interaction.options.getString('name', true).toLowerCase();
      const pet   = player.pets.find((p) => p.name.toLowerCase().includes(query));
      if (!pet) { await interaction.editReply({ content: `No pet matching "${query}" found.` }); return; }
      if (player.gold < FEED_COST) { await interaction.editReply({ content: `You need **${FEED_COST}** coins to feed a pet.` }); return; }
      if (pet.level >= GAME_CONFIG.pets.maxLevel) { await interaction.editReply({ content: `**${pet.name}** is already at max level.` }); return; }
      let evolved = false;
      let newName = pet.name;
      await updatePlayer(player.userId, player.username, (p) => {
        const updatedPets = p.pets.map((pp) => {
          if (pp.id !== pet.id) return pp;
          const old = pp.level;
          const up  = addPetXp(pp, FEED_XP);
          if (up.level > old) { evolved = true; newName = up.name; }
          return up;
        });
        return { ...p, gold: p.gold - FEED_COST, pets: updatedPets };
      });
      const freshPet = (await getPlayer(player.userId, player.username)).pets.find((p) => p.id === pet.id)!;
      const xpNeeded = xpToNextPetLevel(freshPet);
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(RARITY_COLORS[freshPet.rarity] ?? 0x888888)
        .setTitle(`Fed ${freshPet.emoji} ${freshPet.name}!`)
        .setDescription(evolved ? `${freshPet.name} evolved!` : `+${FEED_XP} XP`)
        .addFields(
          { name: 'Level',   value: `${freshPet.level}`,           inline: true },
          { name: 'XP',      value: `${freshPet.xp}/${xpNeeded}`,  inline: true },
          { name: 'Bonuses', value: formatPetBonuses(freshPet),     inline: false },
          { name: 'Cost',    value: `-${FEED_COST} coins`,          inline: false },
        )] });
      return;
    }

    if (sub === 'info') {
      const query  = interaction.options.getString('name', true).toLowerCase();
      const pet    = player.pets.find((p) => p.name.toLowerCase().includes(query));
      if (!pet) { await interaction.editReply({ content: `No pet matching "${query}" found.` }); return; }
      const template  = pet.templateId ? PET_CATALOG[pet.templateId] : null;
      const xpNeeded  = xpToNextPetLevel(pet);
      const filled    = Math.round((pet.xp / xpNeeded) * 12);
      const xpBar     = '\u2588'.repeat(Math.min(filled, 12)) + '\u2591'.repeat(Math.max(0, 12 - filled));
      const nextStage = template?.stages.find((s) => s.minLevel > pet.level);
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(RARITY_COLORS[pet.rarity] ?? 0x888888)
        .setTitle(`${pet.emoji} ${pet.name}`)
        .setDescription(template?.description ?? `A ${pet.rarity.toLowerCase()} companion.`)
        .addFields(
          { name: 'Rarity',  value: pet.rarity,                              inline: true },
          { name: 'Level',   value: `${pet.level} / ${GAME_CONFIG.pets.maxLevel}`, inline: true },
          { name: 'XP',      value: `${xpBar} ${pet.xp}/${xpNeeded}`,        inline: false },
          { name: 'Bonuses', value: formatPetBonuses(pet),                    inline: false },
          nextStage
            ? { name: 'Next Evolution', value: `${nextStage.emoji} **${nextStage.name}** at Lv.${nextStage.minLevel}`, inline: false }
            : { name: 'Evolution',      value: 'Max stage reached!',                                                    inline: false },
          { name: 'Active?', value: pet.id === player.activePet ? 'Yes' : 'No', inline: true },
        )] });
      return;
    }
  },
};
