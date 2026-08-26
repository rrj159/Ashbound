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
import type { Player, CombatSession } from '../../games/types.js';
import { getPlayer, updatePlayer, combatStore } from '../../games/store.js';
import { economy } from '../../games/economy.js';
import { generateHuntEncounter, isOnCooldown, formatCooldown } from '../../games/hunt.js';
import {
  createCombatSession,
  generateLoot,
  getEffectiveStats,
  attemptFlee,
  resolveCombatTurn,
  resolveDefendTurn,
} from '../../games/combat.js';
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

    const cd = isOnCooldown(player, 'hunt');
    if (cd.onCooldown) {
      await interaction.editReply({ content: `⏳ Hunt cooldown: **${formatCooldown(cd.remainingMs)}** remaining.` });
      return;
    }

    // Set cooldown BEFORE generating encounter — prevents duplicate reward exploit
    await updatePlayer(interaction.user.id, interaction.user.username, (p) => ({
      ...p,
      cooldowns: { ...p.cooldowns, hunt: Date.now() + GAME_CONFIG.cooldowns.hunt },
    }));

    const encounter = generateHuntEncounter(player);
    const region = REGIONS[player.region];

    // ── Instant-resolve encounters ────────────────────────────────────────────────
    if (encounter.type === 'treasure') {
      const result = await economy.reward(player.userId, player.username, encounter.coins, encounter.xp);
      const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle('🎁 Ancient Chest Discovered!')
        .setDescription(`*${encounter.atmosphereLine}*\n\nYou find a **${encounter.rarityEmoji} ${encounter.rarityLabel}** chest.`)
        .addFields(
          { name: '💰 Coins', value: `+${encounter.coins.toLocaleString()}`, inline: true },
          { name: '✨ XP',    value: `+${encounter.xp}`, inline: true },
          result.leveledUp
            ? { name: '🎉 Level Up!', value: `Level **${result.newLevel}**!`, inline: true }
            : { name: '\u200b', value: '\u200b', inline: true },
        )
        .setFooter({ text: `Balance: ${result.newBalance.toLocaleString()} coins` });
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (encounter.type === 'npc') {
      const result = await economy.reward(player.userId, player.username, encounter.reward.coins, encounter.reward.xp);
      const embed = new EmbedBuilder()
        .setColor(0x7289da)
        .setTitle(`${encounter.npcEmoji} ${encounter.npcName}`)
        .setDescription(`*${encounter.atmosphereLine}*\n\n*"${encounter.dialogue}"*`)
        .addFields(
          { name: '💰 Coins', value: `+${encounter.reward.coins.toLocaleString()}`, inline: true },
          { name: '✨ XP',    value: `+${encounter.reward.xp}`, inline: true },
          result.leveledUp
            ? { name: '🎉 Level Up!', value: `Level **${result.newLevel}**!`, inline: true }
            : { name: '\u200b', value: '\u200b', inline: true },
        );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (encounter.type === 'world_event') {
      const result = await economy.reward(player.userId, player.username, encounter.reward.coins, encounter.reward.xp);
      await updatePlayer(interaction.user.id, interaction.user.username, (p) => ({
        ...p, reputation: p.reputation + encounter.reward.reputation,
      }));
      const embed = new EmbedBuilder()
        .setColor(0xff4500)
        .setTitle(encounter.eventName)
        .setDescription(`*${encounter.atmosphereLine}*\n\n${encounter.description}`)
        .addFields(
          { name: '💰 Coins',      value: `+${encounter.reward.coins.toLocaleString()}`, inline: true },
          { name: '✨ XP',         value: `+${encounter.reward.xp}`, inline: true },
          { name: '⭐ Reputation', value: `+${encounter.reward.reputation}`, inline: true },
          result.leveledUp
            ? { name: '🎉 Level Up!', value: `Level **${result.newLevel}**!`, inline: true }
            : { name: '\u200b', value: '\u200b', inline: true },
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

    // ── Combat encounters ─────────────────────────────────────────────────────────
    const freshPlayer = await getPlayer(interaction.user.id, interaction.user.username);
    const existing = combatStore.getByUser(freshPlayer.userId);
    if (existing) {
      await interaction.editReply({ content: '⚔️ You are already in combat! Finish your current battle first.' });
      return;
    }

    let preText = '';
    if (encounter.type === 'ambush') {
      const ambushDmg = encounter.ambushDamage;
      await updatePlayer(interaction.user.id, interaction.user.username, (p) => ({
        ...p, hp: Math.max(1, p.hp - ambushDmg),
      }));
      preText = `💥 **AMBUSH!** ${encounter.enemy.emoji} ${encounter.enemy.name} strikes first, dealing **${ambushDmg}** damage!\n\n`;
    }

    const session = createCombatSession(freshPlayer, encounter.enemy, interaction.guildId ?? 'dm', interaction.channelId);
    combatStore.set(session);

    const embed = buildCombatEmbed(session, region.emoji, region.name, preText, session.enemy.isBoss);
    const row = buildCombatRow(session.id);
    const reply = await interaction.editReply({ embeds: [embed], components: [row] });
    session.messageId = reply.id;
    combatStore.set(session);
  },

  async handleButton(interaction: ButtonInteraction): Promise<boolean> {
    const { customId } = interaction;
    if (!customId.startsWith('combat_')) return false;

    const parts    = customId.split('_');
    const action    = parts[1]; // attack | defend | flee
    const sessionId = parts[2];

    const session = combatStore.get(sessionId);
    if (!session) {
      await interaction.reply({ content: '❌ This combat has expired.', ephemeral: true });
      return true;
    }
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
    const stats   = getEffectiveStats(player);
    const region  = REGIONS[player.region];

    // ── Flee ─────────────────────────────────────────────────────────────────────
    if (action === 'flee') {
      const flee = attemptFlee(player);
      if (flee.success) {
        session.status = 'fled';
        combatStore.delete(session.id);
        const embed = new EmbedBuilder()
          .setColor(0x888888)
          .setTitle('🏃 Escaped!')
          .setDescription(flee.log);
        await interaction.editReply({ embeds: [embed], components: [] });
      } else {
        // Enemy gets a free hit on failed flee
        session.defending = false;
        const turn = resolveCombatTurn(session, stats);
        session.enemy.hp  = turn.newEnemyHp;
        session.playerHp  = turn.newPlayerHp;
        session.turn++;
        session.log.push('❌ Failed to flee!', ...turn.log);
        combatStore.set(session);

        if (session.playerHp <= 0) {
          session.status = 'defeat';
          await handleDefeat(interaction, player, session);
        } else {
          const embed = buildCombatEmbed(session, region.emoji, region.name, '', session.enemy.isBoss);
          await interaction.editReply({ embeds: [embed], components: [buildCombatRow(session.id)] });
        }
      }
      return true;
    }

    // ── Defend ────────────────────────────────────────────────────────────────────
    if (action === 'defend') {
      session.defending = true;
      const turn = resolveDefendTurn(session, stats);
      session.enemy.hp  = turn.newEnemyHp; // defend doesn't attack, but enemy might die from 0
      session.playerHp  = turn.newPlayerHp;
      session.defending = false; // reset after this turn
      session.turn++;
      session.log.push('🛡️ You take a defensive stance!', ...turn.log);
      combatStore.set(session);

      if (session.playerHp <= 0) {
        session.status = 'defeat';
        await handleDefeat(interaction, player, session);
      } else {
        const embed = buildCombatEmbed(session, region.emoji, region.name, '', session.enemy.isBoss);
        await interaction.editReply({ embeds: [embed], components: [buildCombatRow(session.id)] });
      }
      return true;
    }

    // ── Attack ────────────────────────────────────────────────────────────────────
    session.defending = false;
    const turn = resolveCombatTurn(session, stats);
    session.enemy.hp  = turn.newEnemyHp;
    session.playerHp  = turn.newPlayerHp;
    session.turn++;
    session.log.push(...turn.log);
    combatStore.set(session);

    if (session.enemy.hp <= 0) {
      session.status = 'victory';
      await handleVictory(interaction, player, session);
      return true;
    }
    if (session.playerHp <= 0) {
      session.status = 'defeat';
      await handleDefeat(interaction, player, session);
      return true;
    }

    const embed = buildCombatEmbed(session, region.emoji, region.name, '', session.enemy.isBoss);
    await interaction.editReply({ embeds: [embed], components: [buildCombatRow(session.id)] });
    return true;
  },
};

// ─── Combat UI ────────────────────────────────────────────────────────────────────

function buildCombatEmbed(
  session: CombatSession,
  regionEmoji: string,
  regionName: string,
  extraText: string,
  isBoss: boolean
): EmbedBuilder {
  const enemy       = session.enemy;
  const enemyBar    = buildBar(enemy.hp, enemy.maxHp, 12);
  const playerBar   = buildBar(session.playerHp, session.playerMaxHp, 12);
  const recentLog   = session.log.slice(-4).join('\n') || '_Combat begins…_';

  return new EmbedBuilder()
    .setColor(isBoss ? 0xff0000 : 0xe74c3c)
    .setTitle(
      isBoss
        ? `👑 BOSS — ${enemy.emoji} ${enemy.name}`
        : `⚔️ ${regionEmoji} ${regionName} — ${enemy.emoji} ${enemy.name}`
    )
    .setDescription(
      extraText +
      `${enemyBar} **${enemy.hp}/${enemy.maxHp} HP** (Lv.${enemy.level})\n` +
      `${playerBar} **You: ${session.playerHp}/${session.playerMaxHp} HP**\n\n` +
      recentLog
    )
    .setFooter({ text: `Turn ${session.turn + 1} • Session: ${session.id.slice(0, 8)}` });
}

function buildCombatRow(sessionId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`combat_attack_${sessionId}`).setLabel('⚔️ Attack').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`combat_defend_${sessionId}`).setLabel('🛡️ Defend').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`combat_flee_${sessionId}`).setLabel('🏃 Flee').setStyle(ButtonStyle.Secondary),
  );
}

function buildBar(current: number, max: number, length: number): string {
  const filled = Math.max(0, Math.round((current / max) * length));
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

// ─── Victory handler ──────────────────────────────────────────────────────────────

async function handleVictory(
  interaction: ButtonInteraction,
  player: Player,
  session: CombatSession
): Promise<void> {
  // Guard against double-claiming
  if (session.rewardsClaimed) return;
  session.rewardsClaimed = true;
  combatStore.set(session);

  const loot   = generateLoot(session.enemy, player);
  const isBoss = session.enemy.isBoss;

  await updatePlayer(player.userId, player.username, (p) => ({
    ...p,
    hp: Math.max(1, session.playerHp),
    inventory: [...p.inventory, ...loot.items],
    statistics: {
      ...p.statistics,
      monstersKilled:   p.statistics.monstersKilled   + (isBoss ? 0 : 1),
      bossesKilled:     p.statistics.bossesKilled     + (isBoss ? 1 : 0),
      damageDealt:      p.statistics.damageDealt      + (session.enemy.maxHp - session.enemy.hp),
      itemsCollected:   p.statistics.itemsCollected   + loot.items.length,
      legendaryItemsFound: p.statistics.legendaryItemsFound +
        loot.items.filter((i) => ['Legendary','Mythic','Divine'].includes(i.rarity)).length,
    },
  }));

  const rewardResult = await economy.reward(player.userId, player.username, loot.coins, loot.xp);

  // Title and region-unlock checks
  const freshPlayer = await getPlayer(player.userId, player.username);
  const newTitles   = checkAndAwardTitles(freshPlayer);
  if (newTitles.length > 0) {
    await updatePlayer(player.userId, player.username, (p) => ({ ...p, titles: freshPlayer.titles }));
  }

  let regionUnlockMsg = '';
  if (isBoss) {
    const nextRegion = tryUnlockNextRegion(
      session.enemy.region, rewardResult.newLevel,
      freshPlayer.statistics.bossesKilled, freshPlayer.unlockedRegions
    );
    if (nextRegion) {
      await updatePlayer(player.userId, player.username, (p) => ({
        ...p, unlockedRegions: [...p.unlockedRegions, nextRegion],
      }));
      const r = REGIONS[nextRegion];
      regionUnlockMsg = `\n🌍 **NEW REGION UNLOCKED:** ${r.emoji} ${r.name}!`;
    }
  }

  const titleMsg   = newTitles.length > 0
    ? `\n🏅 Title${newTitles.length > 1 ? 's' : ''}: **${newTitles.map((t) => t.replace(/_/g, ' ')).join(', ')}**`
    : '';
  const itemsText = loot.items.length > 0
    ? loot.items.map((i) => `${i.emoji ?? '📦'} ${i.name}`).join(', ')
    : 'No items';

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`✅ Victory! ${session.enemy.emoji} ${session.enemy.name} defeated!`)
    .setDescription(session.log.slice(-3).join('\n') + regionUnlockMsg + titleMsg)
    .addFields(
      { name: '💰 Coins', value: `+${loot.coins.toLocaleString()}`, inline: true },
      { name: '✨ XP',    value: `+${loot.xp}`,                     inline: true },
      rewardResult.leveledUp
        ? { name: '🎉 Level Up!', value: `Level **${rewardResult.newLevel}**!`, inline: true }
        : { name: '\u200b', value: '\u200b', inline: true },
      { name: '🎒 Loot', value: itemsText, inline: false },
    )
    .setFooter({ text: `Balance: ${rewardResult.newBalance.toLocaleString()} coins` });

  combatStore.delete(session.id);
  await interaction.editReply({ embeds: [embed], components: [] });
}

// ─── Defeat handler ───────────────────────────────────────────────────────────────

async function handleDefeat(
  interaction: ButtonInteraction,
  player: Player,
  session: CombatSession
): Promise<void> {
  const penaltyCoins = Math.floor(player.gold * 0.1);

  await updatePlayer(player.userId, player.username, (p) => ({
    ...p,
    hp: Math.floor(p.maxHp * 0.3),
    gold: Math.max(0, p.gold - penaltyCoins),
    statistics: {
      ...p.statistics,
      deaths:           p.statistics.deaths + 1,
      damageReceived:   p.statistics.damageReceived + (session.playerMaxHp - session.playerHp),
    },
  }));

  const freshPlayer = await getPlayer(player.userId, player.username);
  const newTitles   = checkAndAwardTitles(freshPlayer);
  if (newTitles.length > 0) {
    await updatePlayer(player.userId, player.username, (p) => ({ ...p, titles: freshPlayer.titles }));
  }

  const embed = new EmbedBuilder()
    .setColor(0x992222)
    .setTitle(`💀 Defeated by ${session.enemy.emoji} ${session.enemy.name}!`)
    .setDescription(
      session.log.slice(-3).join('\n') +
      '\n\n*You wake up in the Ashen Village, weaker and poorer.*'
    )
    .addFields(
      { name: '💸 Penalty', value: `-${penaltyCoins.toLocaleString()} coins`, inline: true },
      { name: '❤️ Respawned HP', value: `${Math.floor(freshPlayer.maxHp * 0.3)}`, inline: true },
    );

  combatStore.delete(session.id);
  await interaction.editReply({ embeds: [embed], components: [] });
}
