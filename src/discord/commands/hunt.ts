/**
 * /hunt with quest progress, pet XP gains, and defend/flee/attack.
 */

import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle,
  type ChatInputCommandInteraction, type ButtonInteraction,
} from 'discord.js';
import type { Player, CombatSession } from '../../games/types.js';
import { getPlayer, updatePlayer, combatStore } from '../../games/store.js';
import { economy } from '../../games/economy.js';
import { generateHuntEncounter, isOnCooldown, formatCooldown } from '../../games/hunt.js';
import {
  createCombatSession, generateLoot, getEffectiveStats,
  attemptFlee, resolveCombatTurn, resolveDefendTurn,
} from '../../games/combat.js';
import { checkAndAwardTitles } from '../../games/titles.js';
import { GAME_CONFIG } from '../../games/config.js';
import { REGIONS, tryUnlockNextRegion } from '../../games/regions.js';
import { progressQuests } from '../../games/quests.js';
import { addPetXp } from '../../games/pets.js';
import type { AshenCommand } from './index.js';

export const huntCommand: AshenCommand = {
  data: new SlashCommandBuilder()
    .setName('hunt')
    .setDescription('Explore your current region and encounter enemies, treasure, or events'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    const player = await getPlayer(interaction.user.id, interaction.user.username);

    const cd = isOnCooldown(player, 'hunt');
    if (cd.onCooldown) {
      await interaction.editReply({ content: `Cooldown: **${formatCooldown(cd.remainingMs)}** remaining.` });
      return;
    }

    await updatePlayer(interaction.user.id, interaction.user.username, (p) => ({
      ...p, cooldowns: { ...p.cooldowns, hunt: Date.now() + GAME_CONFIG.cooldowns.hunt },
    }));

    const encounter = generateHuntEncounter(player);
    const region    = REGIONS[player.region];

    if (encounter.type === 'treasure') {
      const result = await economy.reward(player.userId, player.username, encounter.coins, encounter.xp);
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xffd700)
        .setTitle('Chest Discovered!')
        .setDescription(`*${encounter.atmosphereLine}*\n\nYou find a **${encounter.rarityEmoji} ${encounter.rarityLabel}** chest.`)
        .addFields(
          { name: 'Coins', value: `+${encounter.coins.toLocaleString()}`, inline: true },
          { name: 'XP',    value: `+${encounter.xp}`,                     inline: true },
          result.leveledUp ? { name: 'Level Up!', value: `Level **${result.newLevel}**!`, inline: true } : { name: '\u200b', value: '\u200b', inline: true },
        ).setFooter({ text: `Balance: ${result.newBalance.toLocaleString()} coins` })] });
      return;
    }
    if (encounter.type === 'npc') {
      const result = await economy.reward(player.userId, player.username, encounter.reward.coins, encounter.reward.xp);
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x7289da)
        .setTitle(`${encounter.npcEmoji} ${encounter.npcName}`)
        .setDescription(`*${encounter.atmosphereLine}*\n\n*"${encounter.dialogue}"*`)
        .addFields(
          { name: 'Coins', value: `+${encounter.reward.coins.toLocaleString()}`, inline: true },
          { name: 'XP',    value: `+${encounter.reward.xp}`,                     inline: true },
          result.leveledUp ? { name: 'Level Up!', value: `Level **${result.newLevel}**!`, inline: true } : { name: '\u200b', value: '\u200b', inline: true },
        )] });
      return;
    }
    if (encounter.type === 'world_event') {
      const result = await economy.reward(player.userId, player.username, encounter.reward.coins, encounter.reward.xp);
      await updatePlayer(interaction.user.id, interaction.user.username, (p) => ({ ...p, reputation: p.reputation + encounter.reward.reputation }));
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xff4500)
        .setTitle(encounter.eventName)
        .setDescription(`*${encounter.atmosphereLine}*\n\n${encounter.description}`)
        .addFields(
          { name: 'Coins',      value: `+${encounter.reward.coins.toLocaleString()}`, inline: true },
          { name: 'XP',         value: `+${encounter.reward.xp}`,                     inline: true },
          { name: 'Reputation', value: `+${encounter.reward.reputation}`,              inline: true },
          result.leveledUp ? { name: 'Level Up!', value: `Level **${result.newLevel}**!`, inline: true } : { name: '\u200b', value: '\u200b', inline: true },
        )] });
      return;
    }
    if (encounter.type === 'nothing') {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x444444)
        .setTitle(`${region.emoji} ${region.name} -- Nothing Here`)
        .setDescription(`*${encounter.atmosphereLine}*\n\nYou find nothing of interest.`)] });
      return;
    }

    const freshPlayer = await getPlayer(interaction.user.id, interaction.user.username);
    if (combatStore.getByUser(freshPlayer.userId)) {
      await interaction.editReply({ content: 'You are already in combat! Finish your current battle first.' });
      return;
    }

    let preText = '';
    if (encounter.type === 'ambush') {
      const dmg = encounter.ambushDamage;
      await updatePlayer(interaction.user.id, interaction.user.username, (p) => ({ ...p, hp: Math.max(1, p.hp - dmg) }));
      preText = `AMBUSH! ${encounter.enemy.emoji} ${encounter.enemy.name} strikes first, dealing **${dmg}** damage!\n\n`;
    }

    const session = createCombatSession(freshPlayer, encounter.enemy, interaction.guildId ?? 'dm', interaction.channelId);
    combatStore.set(session);
    const reply = await interaction.editReply({ embeds: [buildCombatEmbed(session, region.emoji, region.name, preText, session.enemy.isBoss)], components: [buildCombatRow(session.id)] });
    session.messageId = reply.id;
    combatStore.set(session);
  },

  async handleButton(interaction: ButtonInteraction): Promise<boolean> {
    const { customId } = interaction;
    if (!customId.startsWith('combat_')) return false;
    const parts     = customId.split('_');
    const action    = parts[1];
    const sessionId = parts[2];
    const session   = combatStore.get(sessionId);
    if (!session) { await interaction.reply({ content: 'This combat has expired.', ephemeral: true }); return true; }
    if (session.userId !== interaction.user.id) { await interaction.reply({ content: 'This is not your combat session.', ephemeral: true }); return true; }
    if (session.status !== 'active') { await interaction.reply({ content: 'This combat is already over.', ephemeral: true }); return true; }
    await interaction.deferUpdate();
    const player = await getPlayer(interaction.user.id, interaction.user.username);
    const stats  = getEffectiveStats(player);
    const region = REGIONS[player.region];

    if (action === 'flee') {
      const flee = attemptFlee(player);
      if (flee.success) {
        session.status = 'fled';
        combatStore.delete(session.id);
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x888888).setTitle('Escaped!').setDescription(flee.log)], components: [] });
      } else {
        session.defending = false;
        const turn = resolveCombatTurn(session, stats);
        session.enemy.hp = turn.newEnemyHp; session.playerHp = turn.newPlayerHp; session.turn++;
        session.log.push('Failed to flee!', ...turn.log);
        combatStore.set(session);
        if (session.playerHp <= 0) { session.status = 'defeat'; await handleDefeat(interaction, player, session); }
        else await interaction.editReply({ embeds: [buildCombatEmbed(session, region.emoji, region.name, '', session.enemy.isBoss)], components: [buildCombatRow(session.id)] });
      }
      return true;
    }
    if (action === 'defend') {
      session.defending = true;
      const turn = resolveDefendTurn(session, stats);
      session.enemy.hp = turn.newEnemyHp; session.playerHp = turn.newPlayerHp; session.defending = false; session.turn++;
      session.log.push('You take a defensive stance!', ...turn.log);
      combatStore.set(session);
      if (session.playerHp <= 0) { session.status = 'defeat'; await handleDefeat(interaction, player, session); }
      else await interaction.editReply({ embeds: [buildCombatEmbed(session, region.emoji, region.name, '', session.enemy.isBoss)], components: [buildCombatRow(session.id)] });
      return true;
    }
    // attack
    session.defending = false;
    const turn = resolveCombatTurn(session, stats);
    session.enemy.hp = turn.newEnemyHp; session.playerHp = turn.newPlayerHp; session.turn++;
    session.log.push(...turn.log);
    combatStore.set(session);
    if (session.enemy.hp <= 0)  { session.status = 'victory'; await handleVictory(interaction, player, session); return true; }
    if (session.playerHp <= 0)  { session.status = 'defeat';  await handleDefeat(interaction, player, session);  return true; }
    await interaction.editReply({ embeds: [buildCombatEmbed(session, region.emoji, region.name, '', session.enemy.isBoss)], components: [buildCombatRow(session.id)] });
    return true;
  },
};

function buildCombatEmbed(session: CombatSession, regionEmoji: string, regionName: string, extra: string, isBoss: boolean): EmbedBuilder {
  const e = session.enemy;
  const eb = '\u2588'.repeat(Math.max(0, Math.round((e.hp / e.maxHp) * 12))) + '\u2591'.repeat(12 - Math.max(0, Math.round((e.hp / e.maxHp) * 12)));
  const pb = '\u2588'.repeat(Math.max(0, Math.round((session.playerHp / session.playerMaxHp) * 12))) + '\u2591'.repeat(12 - Math.max(0, Math.round((session.playerHp / session.playerMaxHp) * 12)));
  return new EmbedBuilder()
    .setColor(isBoss ? 0xff0000 : 0xe74c3c)
    .setTitle(isBoss ? `BOSS -- ${e.emoji} ${e.name}` : `${regionEmoji} ${regionName} -- ${e.emoji} ${e.name}`)
    .setDescription(extra + `${eb} **${e.hp}/${e.maxHp} HP** (Lv.${e.level})\n${pb} **You: ${session.playerHp}/${session.playerMaxHp} HP**\n\n` + (session.log.slice(-4).join('\n') || '_Combat begins_'))
    .setFooter({ text: `Turn ${session.turn + 1} | ${session.id.slice(0, 8)}` });
}

function buildCombatRow(id: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`combat_attack_${id}`).setLabel('Attack').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`combat_defend_${id}`).setLabel('Defend').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`combat_flee_${id}`).setLabel('Flee').setStyle(ButtonStyle.Secondary),
  );
}

async function handleVictory(interaction: ButtonInteraction, player: Player, session: CombatSession): Promise<void> {
  if (session.rewardsClaimed) return;
  session.rewardsClaimed = true;
  combatStore.set(session);

  const loot      = generateLoot(session.enemy, player);
  const isBoss    = session.enemy.isBoss;
  const petXpGain = Math.floor(loot.xp * 0.1);
  let petLeveledUp = false;
  let petNewName   = '';

  await updatePlayer(player.userId, player.username, (p) => {
    const updatedPets = p.pets.map((pet) => {
      if (pet.id !== p.activePet) return pet;
      const oldLevel = pet.level;
      const updated  = addPetXp(pet, petXpGain);
      if (updated.level > oldLevel) { petLeveledUp = true; petNewName = updated.name; }
      return updated;
    });
    const damageThisFight = session.enemy.maxHp - session.enemy.hp;
    const withBase: Player = {
      ...p,
      hp: Math.max(1, session.playerHp),
      pets: updatedPets,
      inventory: [...p.inventory, ...loot.items],
      statistics: {
        ...p.statistics,
        monstersKilled:      p.statistics.monstersKilled      + (isBoss ? 0 : 1),
        bossesKilled:        p.statistics.bossesKilled        + (isBoss ? 1 : 0),
        damageDealt:         p.statistics.damageDealt         + damageThisFight,
        itemsCollected:      p.statistics.itemsCollected      + loot.items.length,
        legendaryItemsFound: p.statistics.legendaryItemsFound +
          loot.items.filter((i) => ['Legendary', 'Mythic', 'Divine'].includes(i.rarity)).length,
        huntCount: p.statistics.huntCount + 1,
      },
    };
    const ev1 = progressQuests(withBase,  { type: isBoss ? 'boss_kill' : 'monster_kill', count: 1 });
    const ev2 = progressQuests(ev1,       { type: 'hunt_complete',  count: 1 });
    const ev3 = loot.items.length > 0
      ? progressQuests(ev2, { type: 'item_collected', count: loot.items.length })
      : ev2;
    const ev4 = progressQuests(ev3,       { type: 'damage_dealt',   count: damageThisFight });
    const ev5 = progressQuests(ev4,       { type: 'coins_earned',   count: loot.coins });
    return ev5;
  });

  const rewardResult = await economy.reward(player.userId, player.username, loot.coins, loot.xp);
  const freshPlayer  = await getPlayer(player.userId, player.username);
  const newTitles    = checkAndAwardTitles(freshPlayer);
  if (newTitles.length > 0) {
    await updatePlayer(player.userId, player.username, (p) => ({ ...p, titles: freshPlayer.titles }));
  }

  let regionMsg = '';
  if (isBoss) {
    const nextRegion = tryUnlockNextRegion(session.enemy.region, rewardResult.newLevel, freshPlayer.statistics.bossesKilled, freshPlayer.unlockedRegions);
    if (nextRegion) {
      await updatePlayer(player.userId, player.username, (p) => ({ ...p, unlockedRegions: [...p.unlockedRegions, nextRegion] }));
      regionMsg = `\nNEW REGION UNLOCKED: ${REGIONS[nextRegion].emoji} ${REGIONS[nextRegion].name}!`;
    }
  }

  const titleMsg  = newTitles.length > 0 ? `\nTitle unlocked: **${newTitles.map((t) => t.replace(/_/g, ' ')).join(', ')}**` : '';
  const petMsg    = petLeveledUp ? `\nPet evolved: **${petNewName}**!` : '';
  const itemsText = loot.items.length > 0 ? loot.items.map((i) => `${i.emoji ?? ''} ${i.name}`).join(', ') : 'No items';

  combatStore.delete(session.id);
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x2ecc71)
    .setTitle(`Victory! ${session.enemy.emoji} ${session.enemy.name} defeated!`)
    .setDescription(session.log.slice(-3).join('\n') + regionMsg + titleMsg + petMsg)
    .addFields(
      { name: 'Coins',  value: `+${loot.coins.toLocaleString()}`, inline: true },
      { name: 'XP',     value: `+${loot.xp}`,                     inline: true },
      rewardResult.leveledUp ? { name: 'Level Up!', value: `Level **${rewardResult.newLevel}**!`, inline: true } : { name: '\u200b', value: '\u200b', inline: true },
      { name: 'Loot',   value: itemsText,                          inline: false },
    ).setFooter({ text: `Balance: ${rewardResult.newBalance.toLocaleString()} coins` })], components: [] });
}

async function handleDefeat(interaction: ButtonInteraction, player: Player, session: CombatSession): Promise<void> {
  const penaltyCoins = Math.floor(player.gold * 0.1);
  await updatePlayer(player.userId, player.username, (p) => {
    const withPenalty: Player = {
      ...p,
      hp:   Math.floor(p.maxHp * 0.3),
      gold: Math.max(0, p.gold - penaltyCoins),
      statistics: { ...p.statistics, deaths: p.statistics.deaths + 1, damageReceived: p.statistics.damageReceived + (session.playerMaxHp - session.playerHp) },
    };
    return progressQuests(withPenalty, { type: 'death', count: 1 });
  });
  const freshPlayer = await getPlayer(player.userId, player.username);
  const newTitles   = checkAndAwardTitles(freshPlayer);
  if (newTitles.length > 0) await updatePlayer(player.userId, player.username, (p) => ({ ...p, titles: freshPlayer.titles }));

  combatStore.delete(session.id);
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x992222)
    .setTitle(`Defeated by ${session.enemy.emoji} ${session.enemy.name}!`)
    .setDescription(session.log.slice(-3).join('\n') + '\n\n*You respawn in the Ashen Village.*')
    .addFields(
      { name: 'Penalty',    value: `-${penaltyCoins.toLocaleString()} coins`, inline: true },
      { name: 'Respawned',  value: `${Math.floor(freshPlayer.maxHp * 0.3)} HP`,  inline: true },
    )], components: [] });
}
