/**
 * /lore — AI-generated lore for any topic in the Ashen Realms.
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { router } from '../../ai/service.js';
import { isRateLimited } from '../../ai/rateLimit.js';

const SYSTEM = `You are the Lorekeeper of the Ashen Realms. Generate rich, immersive lore in 3-5 sentences.
Write in evocative prose. Never include stats or numbers. Output only the lore.`;

export const data = new SlashCommandBuilder()
  .setName('lore')
  .setDescription('Generate lore for an item, region, or concept')
  .addStringOption((opt) => opt.setName('subject').setDescription('Subject to generate lore for').setRequired(true).setMaxLength(200))
  .addStringOption((opt) =>
    opt.setName('kind')
      .setDescription('Type of lore')
      .addChoices(
        { name: 'Region',   value: 'region'   },
        { name: 'Creature', value: 'creature' },
        { name: 'Item',     value: 'item'     },
        { name: 'Legend',   value: 'legend'   },
      ),
  );

export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  if (isRateLimited(interaction.user.id)) {
    await interaction.reply({ content: '⏸️ You are sending requests too fast. Please slow down.', ephemeral: true });
    return;
  }

  const subject = interaction.options.getString('subject', true);
  const kind    = interaction.options.getString('kind') ?? 'legend';
  await interaction.deferReply();
  try {
    const prompt = `Tell me the lore of this ${kind}: ${subject}`;
    const lore   = await router.say(prompt, SYSTEM, { intent: 'lore' });
    const embed  = new EmbedBuilder()
      .setColor(0x4a0000)
      .setTitle(`📜 ${subject}`)
      .setAuthor({ name: 'Lorekeeper' })
      .setDescription(lore)
      .setFooter({ text: `Type: ${kind}` });
    await interaction.editReply({ embeds: [embed] });
  } catch {
    await interaction.editReply({ content: '❌ The Lorekeeper stumbles. Try again.' });
  }
}
