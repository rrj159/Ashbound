/**
 * /remind — Set a persistent reminder.
 */

import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction, Client } from 'discord.js';
import { createReminder, parseDuration, restoreReminders, type Reminder } from '../../services/reminder.js';

export const data = new SlashCommandBuilder()
  .setName('remind')
  .setDescription('Set a reminder')
  .addStringOption((opt) => opt.setName('message').setDescription('Reminder message').setRequired(true).setMaxLength(500))
  .addStringOption((opt) =>
    opt.setName('when')
      .setDescription('When (e.g., 30s, 5m, 2h, 1d)')
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const message = interaction.options.getString('message', true);
  const when = interaction.options.getString('when', true);
  const durationMs = parseDuration(when);

  if (!durationMs) {
    await interaction.reply({ content: '❌ Invalid duration. Use `30s`, `5m`, `2h`, or `1d`.', ephemeral: true });
    return;
  }
  if (durationMs < 1000) {
    await interaction.reply({ content: '❌ Minimum reminder is 1 second.', ephemeral: true });
    return;
  }

  const reminder = await createReminder({
    userId: interaction.user.id,
    channelId: interaction.channelId,
    guildId: interaction.guildId,
    message,
    durationMs,
    onFire: async (r) => {
      const client = interaction.client as Client;
      try {
        const channel = await client.channels.fetch(r.channelId);
        if (channel && 'send' in channel && typeof (channel as any).send === 'function') {
          await (channel as import('discord.js').TextChannel).send({ content: `⏰ <@${r.userId}> Reminder: ${r.message}` });
        } else {
          const user = await client.users.fetch(r.userId);
          await user.send({ content: `⏰ Reminder (from Ashbound): ${r.message}` });
        }
      } catch (err) {
        console.error('[Reminder] Failed to deliver:', err);
      }
    },
  });

  const fireDate = new Date(reminder.fireAt);
  const embed = new EmbedBuilder()
    .setColor(0xff9800)
    .setTitle('⏰ Reminder set')
    .setDescription(`Will fire at <t:${Math.floor(fireDate.getTime() / 1000)}:F> (<t:${Math.floor(fireDate.getTime() / 1000)}:R>)`)
    .addFields({ name: 'Message', value: message.slice(0, 200) })
    .setFooter({ text: `ID: ${reminder.id}` });
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

/** Restore reminders on startup. */
export async function restoreAllReminders(): Promise<number> {
  return restoreReminders(async (r) => {
    // Use a no-op client fetch on boot — actual delivery happens via /remind
    console.log(`[Reminder] Expired while bot was offline: ${r.id} for ${r.userId}`);
  });
}
