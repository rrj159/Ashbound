import type { Client } from 'discord.js';
import { getCommands } from './commands/index.js';

export function setupEventHandlers(client: Client): void {
  client.once('ready', () => {
    console.log(`[Discord] Logged in as ${client.user?.tag}`);
  });

  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const commands = getCommands();
        const cmd = commands.find((c) => c.data.name === interaction.commandName);
        if (!cmd) {
          await interaction.reply({ content: '❌ Unknown command.', ephemeral: true });
          return;
        }
        await cmd.execute(interaction);
      } else if (interaction.isButton()) {
        // Route button interactions to the appropriate handler
        const commands = getCommands();
        for (const cmd of commands) {
          if (cmd.handleButton) {
            const handled = await cmd.handleButton(interaction);
            if (handled) return;
          }
        }
      } else if (interaction.isStringSelectMenu()) {
        const commands = getCommands();
        for (const cmd of commands) {
          if (cmd.handleSelect) {
            const handled = await cmd.handleSelect(interaction);
            if (handled) return;
          }
        }
      }
    } catch (err) {
      console.error('[Discord] Interaction error:', err);
      try {
        const msg = { content: '❌ An error occurred. Please try again.', ephemeral: true };
        if (interaction.isRepliable()) {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(msg);
          } else {
            await interaction.reply(msg);
          }
        }
      } catch {
        // Ignore follow-up errors
      }
    }
  });

  client.on('error', (err) => {
    console.error('[Discord] Client error:', err);
  });

  client.on('warn', (msg) => {
    console.warn('[Discord] Warning:', msg);
  });
}
