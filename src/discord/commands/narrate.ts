/**
 * /narrate — Generate a dramatic narrative for an in-game event.
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { router } from '../../ai/service.js';
import { isRateLimited } from '../../ai/rateLimit.js';

const SYSTEM = `You are a fantasy narrator for the Ashen Realms. Write vivid, dramatic prose in 2-4 sentences.
Capture atmosphere, danger, and character. Output only the narration.`;

export const data = new SlashCommandBuilder()
  .setName('narrate')
  .setDescription('Generate dramatic narration for an event')
  .addStringOption((opt) => opt.setName('event').setDescription('What happened').setRequired(true).setMaxLength(500))
  .addStringOption((opt) =>
    opt.setName('tone')
      .setDescription('Narrative tone')
      .addChoices(
        { name: 'Heroic',  value: 'heroic'  },
        { name: 'Tragic',  value: 'tragic'  },
        { name: 'Mysterious', value: 'mystic' },
        { name: 'Dark',    value: 'dark'    },
      ),
  );

export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  if (isRateLimited(interaction.user.id)) {
    await interaction.reply({ content: '⏸️ You are sending requests too fast. Please slow down.', ephemeral: true });
    return;
  }

  const event = interaction.options.getString('event', true);
  const tone  = interaction.options.getString('tone') ?? 'heroic';
  await interaction.deferReply();
  try {
    const prompt = `Narrate this event in a ${tone} tone: ${event}`;
    const narration = await router.say(prompt, SYSTEM, { intent: 'creative' });
    const embed = new EmbedBuilder().setColor(0x800000).setAuthor({ name: '🎭 Narrator' }).setDescription(`*${narration}*`);
    await interaction.editReply({ embeds: [embed] });
  } catch {
    await interaction.editReply({ content: '❌ The narrator hesitates. Try again.' });
  }
}
