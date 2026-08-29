import { REST, Routes } from 'discord.js';
import { getCommands } from './commands/index.js';

export async function registerCommands(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!token || !clientId) {
    console.warn('[Commands] Skipping registration — DISCORD_TOKEN or DISCORD_CLIENT_ID not set.');
    return;
  }

  const commands = getCommands();
  const bodies = commands
    .filter((c) => 'toJSON' in c.data)
    .map((c) => (c.data as { toJSON(): unknown }).toJSON());

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    if (guildId) {
      // Guild-specific (instant during dev)
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: bodies }
      );
      console.log(`[Commands] Registered ${bodies.length} commands to guild ${guildId}`);
    } else {
      // Global (up to 1 hour delay)
      await rest.put(Routes.applicationCommands(clientId), { body: bodies });
      console.log(`[Commands] Registered ${bodies.length} global commands`);
    }
  } catch (err) {
    console.error('[Commands] Failed to register commands:', err);
  }
}
