import { SlashCommandBuilder } from 'discord.js';
export const data = new SlashCommandBuilder().setName('help').setDescription('How to talk to Ashbound');
export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ ephemeral: true, content: 'Talk to Ashbound with `/ask`, by DM, by @mentioning me in a server, or by replying to one of my messages. Use `/reset` to clear your context, `/ping` to check availability, and `/remind` for reminders.' });
}
