/**
 * /translate — Translate text into another language.
 */

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { router } from '../../ai/service.js';
import { isRateLimited } from '../../ai/rateLimit.js';

const SYSTEM = `You are a skilled translator. Translate the user's text accurately.
Output only the translation — no explanations, no notes. Preserve formatting where possible.`;

const LANGUAGES = [
  { name: 'English',      value: 'English'      },
  { name: 'Spanish',      value: 'Spanish'      },
  { name: 'French',       value: 'French'       },
  { name: 'German',       value: 'German'       },
  { name: 'Japanese',     value: 'Japanese'     },
  { name: 'Chinese',      value: 'Chinese'      },
  { name: 'Korean',       value: 'Korean'       },
  { name: 'Portuguese',   value: 'Portuguese'   },
  { name: 'Russian',      value: 'Russian'      },
  { name: 'Italian',      value: 'Italian'      },
  { name: 'Latin',        value: 'Latin'        },
  { name: 'Elvish-style', value: 'Elvish-style' },
];

export const data = new SlashCommandBuilder()
  .setName('translate')
  .setDescription('Translate text into another language')
  .addStringOption((opt) => opt.setName('text').setDescription('Text to translate').setRequired(true).setMaxLength(2000))
  .addStringOption((opt) => opt.setName('target').setDescription('Target language').setRequired(true).addChoices(...LANGUAGES));

export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  if (isRateLimited(interaction.user.id)) {
    await interaction.reply({ content: '⏸️ You are sending requests too fast. Please slow down.', ephemeral: true });
    return;
  }

  const text   = interaction.options.getString('text', true);
  const target = interaction.options.getString('target', true);
  await interaction.deferReply();
  try {
    const prompt = `Translate the following into ${target}:\n\n${text}`;
    const translated = await router.say(prompt, SYSTEM, { costSensitive: true, intent: 'simple' });
    const embed = new EmbedBuilder()
      .setColor(0x1e88e5)
      .setTitle(`Translation → ${target}`)
      .setDescription(translated)
      .setFooter({ text: 'Ashbound Translator' });
    await interaction.editReply({ embeds: [embed] });
  } catch {
    await interaction.editReply({ content: '❌ The translation spell fizzles. Try again.' });
  }
}
