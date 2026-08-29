/**
 * /describe — AI-generated vivid description for an item, creature, or location.
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { ai } from '../../ai/service.js';
import { isRateLimited } from '../../ai/rateLimit.js';

const SYSTEM_PROMPT = `You are the Lorekeeper of the Ashen Realms. When given a subject (item, creature, location, etc.),
respond with a vivid, immersive 2-3 sentence description. Be evocative and atmospheric.
Do NOT include stats, numbers, or mechanical details — just lore and flavor.
Format your response as plain prose only.`;

export const data = new SlashCommandBuilder()
  .setName('describe')
  .setDescription('Get an AI-generated description for anything in the Ashen Realms')
  .addStringOption((opt) =>
    opt.setName('subject').setDescription('Item, creature, region, etc.').setRequired(true).setMaxLength(200),
  )
  .addStringOption((opt) =>
    opt.setName('type')
      .setDescription('What kind of thing is this?')
      .addChoices(
        { name: 'Item / Equipment',  value: 'item'    },
        { name: 'Creature / Monster',value: 'creature'},
        { name: 'Region / Location', value: 'region'  },
        { name: 'Mystery / Unknown', value: 'mystery' },
      ),
  );

export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  if (isRateLimited(interaction.user.id)) {
    await interaction.reply({ content: '⏸️ You are sending requests too fast. Please slow down.', ephemeral: true });
    return;
  }

  const subject = interaction.options.getString('subject', true);
  const type    = interaction.options.getString('type') ?? 'mystery';

  await interaction.deferReply();

  const systemMap: Record<string, string> = {
    item:     SYSTEM_PROMPT.replace('subject', 'item or piece of equipment'),
    creature: SYSTEM_PROMPT.replace('subject', 'creature or monster'),
    region:   SYSTEM_PROMPT.replace('subject', 'region or location'),
    mystery:  SYSTEM_PROMPT,
  };

  try {
    const description = await ai.say(
      `Describe this ${type}: ${subject}`,
      systemMap[type],
      { temperature: 1.0, maxTokens: 256 },
    );

    const embed = new EmbedBuilder()
      .setColor(0x4a0000)
      .setTitle(`📜 ${subject}`)
      .setAuthor({ name: 'Ashbound — Lorekeeper', iconURL: interaction.client.user?.displayAvatarURL() })
      .setDescription(description)
      .setFooter({ text: `Type: ${type}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('[Describe] AI error:', err);
    await interaction.editReply({ content: '❌ The Lorekeeper\'s vision blurs. Try again.' });
  }
}
