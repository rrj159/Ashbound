/**
 * /chat — Direct AI chat command.
 * Routes through the provider-independent AI layer.
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { ai } from '../../ai/service.js';
import { isRateLimited } from '../../ai/rateLimit.js';

const SYSTEM_PROMPT = `You are Ashbound, an ancient and wise presence dwelling within the Ashen Realms.
You are knowledgeable about the world's lore, creatures, regions, and legends.
Respond with personality — cryptic when appropriate, warm when asked.
Keep responses concise and atmospheric.`;

export const data = new SlashCommandBuilder()
  .setName('chat')
  .setDescription('Ask Ashbound anything about the Ashen Realms')
  .addStringOption((opt) =>
    opt.setName('prompt').setDescription('Your question or message').setRequired(true).setMaxLength(2000),
  )
  .addStringOption((opt) =>
    opt.setName('style')
      .setDescription('Response tone')
      .addChoices(
        { name: 'Lore & History',   value: 'lore'    },
        { name: 'Combat Advice',    value: 'combat'  },
        { name: 'Mysterious',       value: 'mystic'  },
        { name: 'Plain & Helpful',   value: 'default' },
      ),
  );

export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  if (isRateLimited(interaction.user.id)) {
    await interaction.reply({ content: '⏸️ You are sending requests too fast. Please slow down.', ephemeral: true });
    return;
  }

  const prompt = interaction.options.getString('prompt', true);
  const style  = interaction.options.getString('style') ?? 'default';

  await interaction.deferReply();

  const styleSuffix: Record<string, string> = {
    lore:    ' Answer with deep lore knowledge of the Ashen Realms.',
    combat:  ' Offer tactical combat advice relevant to the Ashen Realms.',
    mystic:  ' Respond in a cryptic, oracle-like manner.',
    default: '',
  };

  const system = SYSTEM_PROMPT + styleSuffix[style];

  try {
    const response = await ai.say(prompt, system, {
      temperature: 0.8,
      maxTokens: 512,
    });

    const embed = new EmbedBuilder()
      .setColor(0x8b0000)
      .setAuthor({ name: 'Ashbound', iconURL: interaction.client.user?.displayAvatarURL() })
      .setDescription(response)
      .setFooter({ text: `Style: ${style}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('[Chat] AI error:', err);
    await interaction.editReply({ content: '❌ The ancient voice falters. Try again shortly.' });
  }
}
