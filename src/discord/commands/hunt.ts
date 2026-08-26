/**
 * /hunt — Explore your current region and encounter the world.
 * Encounters are determined server-side. AI narrates (optional).
 */

import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
} from 'discord.js';
import { getPlayer, updatePlayer, combatStore } from '../../games/store.js';
import { economy } from '../../games/economy.js';
import {
  generateHuntEncounter,
  isOnCooldown,
  formatCooldown,
} from '../../games/hunt.js';
import { createCombatSession, generateLoot, getEffectiveStats } from '../../games/combat.js';
import { checkAndAwardTitles } from '../../games/titles.js';
import { GAME_CONFIG } from '../../games/config.js';
import { REGIONS, tryUnlockNextRegion } from '../../games/regions.js';
import type { AshenCommand } from './index.js';

export const huntCommand: AshenCommand = {
  data: new SlashCommandBuilder()
    .setName('hunt')
    .setDescription('Explore your current region and encounter enemies, treasure, or events'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const player = await getPlayer(interaction.user.id, interaction.user.username);

    // Cooldown check
    const cd = isOnCooldown(player, 'hunt');
    if (cd.onCooldown) {
      await interaction.editReply({
        content: `⏳ Hunt cooldown: **${formatCooldown(cd.remainingMs)}** remaining.`,
      });
      return;
    }

    // Set cooldown immediately to prevent duplicate use
    await updatePlayer(interaction.user.id, interaction.user.username, (p) => ({
      ...p,
      cooldowns: { ...p.cooldowns, hunt: Date.now() + GAME_CONFIG.cooldowns.hunt },
    }));

    const encounter = generateHuntEncounter(player);
    const region = REGIONS[player.region];

    // ── Instant-resolve encounters (no combat needed) ──────────────────────────
    if (encounter.type === 'treasure') {
      const result = await economy.reward(
        player.userId, player.username, encounter.coins, encounter.xp
      );
      const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle(`🎁 Ancient Chest Discovered!`)
        .setDescription(
          `*${encounter.atmosphereLine}*\n\n` +
          `You stumble upon a **${encounter.rarityEmoji} ${encounter.rarityLabel}** chest, hidden beneath the ash.`
        )
        .addFields(
          { name: '💰 Coins', value: `+${encounter.coins.toLocaleString()}`, inline: true },
          { name: '✨ XP', value: `+${encounter.xp}`, inline: true },
          result.leveledUp
            ? { name: '🎉 Level Up!', value: `Level **${result.newLevel}**!`, inline: true }
            : { name: '\u200b', value: '\u200b', inline: true }
        )
        .setFooter({ text: `Balance: ${result.newBalance.toLocaleString()} coins` });
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (encounter.type === 'npc') {
      const result = await economy.reward(
        player.userId, player.username, encounter.reward.coins, encounter.reward.xp
      );
      const embed = new EmbedBuilder()
        .setColor(0x7289da)
        .setTitle(`${encounter.npcEmoji} ${encounter.npcName}`)
        .setDescription(
          `*${encounter.atmosphereLine}*\n\n` +
          `*"${encounter.dialogue}"*`
        )
        .addFields(
          { name: '💰 Coins', value: `+${encounter.reward.coins.toLocaleString()}`, inline: true },
          { name: '✨ XP', value: `+${encounter.reward.xp}`, inline: true },
          result.leveledUp
            ? { name: '🎉 Level Up!', value: `Level **${result.newLevel}**!`, inline: true }
            : { name: '\u200b', value: '\u200b', inline: true }
        );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (encounter.type === 'world_event') {
      const result = await economy.reward(
        player.userId, player.username, encounter.reward.coins, encounter.reward.xp
      );
      await updatePlayer(interaction.user.id, interaction.user.username, (p) => ({
        ...p,
        reputation: p.reputation + encounter.reward.reputation,
      }));
      const embed = new EmbedBuilder()
        .setColor(0xff4500)
        .setTitle(encounter.eventName)
        .setDescription(
          `*${encounter.atmosphereLine}*\n\n${encounter.description}`
        )
        .addFields(
          { name: '💰 Coins', value: `+${encounter.reward.coins.toLocaleString()}`, inline: true },
          { name: '✨ XP', value: `+${encounter.reward.xp}`, inline: true },
          { name: '⭐ Reputation', value: `+${encounter.reward.reputation}`, inline: true },
          result.leveledUp
            ? { name: '🎉 Level Up!', value: `Level **${result.newLevel}**!`, inline: true }
            : { name: '\u200b', value: '\u200b', inline: true }
        );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (encounter.type === 'nothing') {
      const embed = new EmbedBuilder()
        .setColor(0x444444)
        .setTitle(`${region.emoji} ${region.name} — Nothing Here`)
        .setDescription(`*${encounter.atmosphereLine}*\n\nYou find nothing of interest. The silence is deafening.`);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // ── Combat encounters (monster / boss / ambush) ────────────────────────────
    const freshPlayer = await getPlayer(interaction.user.id, interaction.user.username);

    // Check if player already in combat
    const existing = combatStore.getByUser(freshPlayer.userId);
    if (existing) {
      await interaction.editReply({
        content: '⚔️ You are already in combat! Finish your current battle first.',
      });
      return;
    }

    let enemy = encounter.enemy;
    let preText = '';

    if (encounter.type === 'ambush') {
      // Apply ambush damage immediately
      const ambushDmg = encounter.ambushDamage;
      await updatePlayer(interaction.user.id, interaction.user.username, (p) => ({
        ...p,
        hp: Math.max(1, p.hp - ambushDmg),
      }));
      preText = `💥 **AMBUSH!** ${enemy.emoji} ${enemy.name} strikes before you can react, dealing **${ambushDmg}** damage!\n\n`;
    }

    const stats = getEffectiveStats(freshPlayer);
    const session = createCombatSession(freshPlayer, enemy, interaction.guildId ?? 'dm', interaction.channelId);
    combatStore.set(session);

    const isBoss = encounter.type === 'boss';
    const embed = buildCombatEmbed(freshPlayer, session, region.emoji, region.name, preText, isBoss);
    const row = buildCombatRow(session.id);

    const reply = await interaction.editReply({ embeds: [embed], components: [row] });
    // Store message ID for later updates
    session.messageId = reply.id;
    combatStore.set(session);
  },

  async handleButton(interaction: ButtonInteraction): Promise<boolean> {
    const customId = interaction.customId;
    if (!customId.startsWith('combat_')) return false;

    const parts = customId.split('_');
    const action = parts[1]; // 'attack' | 'flee'
    const sessionId = parts[2];

    const session = combatStore.get(sessionId);
    if (!session) {
      await interaction.reply({ content: '❌ This combat has expired.', ephemeral: true });
      return true;
    }

    // Security: only the session owner can interact
    if (session.userId !== interaction.user.id) {
      await interaction.reply({ content: '❌ This is not your combat session.', ephemeral: true });
      return true;
    }

    if (session.status !== 'active') {
      await interaction.reply({ content: '❌ This combat is already over.', ephemeral: true });
      return true;
    }

    await interaction.deferUpdate();

    const player = await getPlayer(interaction.user.id, interaction.user.username);
    const stats = getEffectiveStats(player);

    if (action === 'flee') {
      const { success, log } = await import('../../games/combat.js').then(m => {
        const result = m.attemptFlee(player);
        return result;
      });
      if (success) {
        session.status = 'fled';
        combatStore.set(session);
        const embed = new EmbedBuilder()
          .setColor(0x888888)
          .setTitle('🏃 Escaped!')
          .setDescription(log);
        await interaction.editReply({ embeds: [embed], components: [] });
      } else {
        // Failed flee — enemy gets a free hit
        const { resolveCombatTurn } = await import('../../games/combat.js');
        const turn = resolveCombatTurn(session, stats);
        session.playerHp = turn.newPlayerHp;
        session.turn++;
        session.log.push(...turn.log);

        if (session.playerHp <= 0) {
          session.status = 'defeat';
          combatStore.set(session);
          await handleDefeat(interaction, player, session);
        } else {
          combatStore.set(session);
          const region = REGIONS[player.region];
          const embed = buildCombatEmbed(player, session, region.emoji, region.name, '❌ Failed to flee!\n', session.enemy.isBoss);
          const row = buildCombatRow(session.id);
          await interaction.editReply({ embeds: [embed], components: [row] });
        }
      }
      return true;
    }

    // Attack
    const { resolveCombatTurn, generateLoot } = await import('../../games/combat.js');
    const turn = resolveCombatTurn(session, stats);
    session.enemy.hp = turn.newEnemyHp;
    session.playerHp = turn.newPlayerHp;
    session.turn++;
    session.log.push(...turn.log);

    if (session.enemy.hp <= 0) {
      // Victory
      session.status = 'victory';
      combatStore.set(session);
      await handleVictory(interaction, player, session);
      return true;
    }

    if (session.playerHp <= 0) {
      session.status = 'defeat';
      combatStore.set(session);
      await handleDefeat(interaction, player, session);
      return true;
    }

    combatStore.set(session);
    const region = REGIONS[player.region];
    const embed = buildCombatEmbed(player, session, region.emoji, region.name, '', session.enemy.isBoss);
    const row = buildCombatRow(session.id);
    await interaction.editReply({ embeds: [embed], components: [row] });
    return true;
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function buildCombatEmbed(
  player: Player,
  session: CombatSession,
  regionEmoji: string,
  regionName: string,
  extraText: string,
  isBoss: boolean
): EmbedBuilder {
  const enemy = session.enemy;
  const enemyHpBar = buildBar(enemy.hp, enemy.maxHp, 12);
  const playerHpBar = buildBar(session.playerHp, session.playerMaxHp, 12);
  const recentLog = session.log.slice(-4).join('\n') || '_Combat begins…_';

  return new EmbedBuilder()
    .setColor(isBoss ? 0xff0000 : 0xe74c3c)
    .setTitle(
      isBoss
        ? `👑 BOSS ENCOUNTER — ${enemy.emoji} ${enemy.name}`
        : `⚔️ ${regionEmoji} ${regionName} — ${enemy.emoji} ${enemy.name}`
    )
    .setDescription(
      extraText +
      `${enemyHpBar} **${enemy.hp}/${enemy.maxHp} HP** (Lv.${enemy.level})\n` +
      `${playerHpBar} **You: ${session.playerHp}/${session.playerMaxHp} HP**\n\n` +
      recentLog
    )
    .setFooter({ text: `Turn ${session.turn + 1} • Combat ID: ${session.id.slice(0, 8)}` });
}

function buildCombatRow(sessionId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`combat_attack_${sessionId}`)
      .setLabel('⚔️ Attack')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`combat_flee_${sessionId}`)
      .setLabel('🏃 Flee')
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildBar(current: number, max: number, length: number): string {
  const filled = Math.max(0, Math.round((current / max) * length));
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

async function handleVictory(
  interaction: ButtonInteraction,
  player: Player,
  session: CombatSession
): Promise<void> {
  const { generateLoot } = await import('../../games/combat.js');
  const loot = generateLoot(session.enemy, player);
  const isBoss = session.enemy.isBoss;

  // Atomic player update
  const updated = await updatePlayer(player.userId, player.username, (p) => {
    const newInventory = [...p.inventory, ...loot.items];
    const newStats = {
      ...p.statistics,
      monstersKilled: p.statistics.monstersKilled + (isBoss ? 0 : 1),
      bossesKilled: p.statistics.bossesKilled + (isBoss ? 1 : 0),
      damageDealt: p.statistics.damageDealt + session.enemy.maxHp,
    };
    return { ...p, hp: session.playerHp, inventory: newInventory, statistics: newStats };
  });

  const rewardResult = await economy.reward(player.userId, player.username, loot.coins, loot.xp);

  // Check title awards
  const freshPlayer = await getPlayer(player.userId, player.username);
  const newTitles = checkAndAwardTitles(freshPlayer);
  if (newTitles.length > 0) {
    await updatePlayer(player.userId, player.username, (p) => ({
      ...p,
      titles: freshPlayer.titles,
    }));
  }

  // Region unlock check
  let regionUnlockMsg = '';
  if (isBoss) {
    const nextRegion = tryUnlockNextRegion(
      session.enemy.region,
      rewardResult.newLevel,
      freshPlayer.statistics.bossesKilled,
      freshPlayer.unlockedRegions
    );
    if (nextRegion) {
      await updatePlayer(player.userId, player.username, (p) => ({
        ...p,
        unlockedRegions: [...p.unlockedRegions, nextRegion],
      }));
      const { REGIONS } = await import('../../games/regions.js');
      regionUnlockMsg = `\n🌍 **NEW REGION UNLOCKED:** ${REGIONS[nextRegion].emoji} ${REGIONS[nextRegion].name}!`;
    }
  }

  const titleMsg = newTitles.length > 0
    ? `\n🏅 New title${newTitles.length > 1 ? 's' : ''}: **${newTitles.map(t => t.replace(/_/g, ' ')).join(', ')}**`
    : '';

  const itemsText = loot.items.length > 0
    ? loot.items.map((i) => `${i.emoji} ${i.name}`).join(', ')
    : 'No items';

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`✅ Victory! ${session.enemy.emoji} ${session.enemy.name} defeated!`)
    .setDescription(
      session.log.slice(-3).join('\n') +
      regionUnlockMsg +
      titleMsg
    )
    .addFields(
      { name: '💰 Coins', value: `+${loot.coins.toLocaleString()}`, inline: true },
      { name: '✨ XP', value: `+${loot.xp}`, inline: true },
      rewardResult.leveledUp
        ? { name: '🎉 Level Up!', value: `Level **${rewardResult.newLevel}**!`, inline: true }
        : { name: '\u200b', value: '\u200b', inline: true },
      { name: '🎒 Loot', value: itemsText, inline: false }
    )
    .setFooter({ text: `Balance: ${rewardResult.newBalance.toLocaleString()} coins` });

  combatStore.delete(session.id);
  await interaction.editReply({ embeds: [embed], components: [] });
}

async function handleDefeat(
  interaction: ButtonInteraction,
  player: Player,
  session: CombatSession
): Promise<void> {
  const penaltyCoins = Math.floor(player.gold * 0.1);

  await updatePlayer(player.userId, player.username, (p) => ({
    ...p,
    hp: Math.floor(p.maxHp * 0.3), // Respawn at 30% HP
    gold: Math.max(0, p.gold - penaltyCoins),
    statistics: {
      ...p.statistics,
      deaths: p.statistics.deaths + 1,
      damageReceived: p.statistics.damageReceived + (session.playerMaxHp - session.playerHp),
    },
  }));

  // Check for unlucky title
  const freshPlayer = await getPlayer(player.userId, player.username);
  const newTitles = checkAndAwardTitles(freshPlayer);
  if (newTitles.length > 0) {
    await updatePlayer(player.userId, player.username, (p) => ({ ...p, titles: freshPlayer.titles }));
  }

  const embed = new EmbedBuilder()
    .setColor(0x992222)
    .setTitle(`💀 Defeated by ${session.enemy.emoji} ${session.enemy.name}!`)
    .setDescription(
      session.log.slice(-3).join('\n') +
      `\n\n*You wake up in the Ashen Village, weaker and poorer.*`
    )
    .addFields(
      { name: '💸 Penalty', value: `-${penaltyCoins.toLocaleString()} coins`, inline: true },
      { name: '❤️ HP', value: `Respawned at ${Math.floor(freshPlayer.maxHp * 0.3)}`, inline: true }
    );

  combatStore.delete(session.id);
  await interaction.editReply({ embeds: [embed], components: [] });
}

// ─── Import types needed above ─────────────────────────────────────────────────
import type { Player, CombatSession } from '../../games/types.js';
