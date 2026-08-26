/**
 * AshenAI — Entry point
 * Bootstraps Discord client, web server, and game systems.
 */

import 'dotenv/config';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { startWebServer } from './web/server.js';
import { registerCommands } from './discord/register.js';
import { setupEventHandlers } from './discord/events.js';
import { GAME_CONFIG } from './games/config.js';
import { combatStore } from './games/store.js';

async function main(): Promise<void> {
  console.log(`[AshenAI] Starting — Season ${GAME_CONFIG.season.current}: ${GAME_CONFIG.season.name}`);

  // Validate required env vars
  const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`[AshenAI] Missing required environment variables: ${missing.join(', ')}`);
    console.error('[AshenAI] Copy .env.example to .env and fill in the values.');
    process.exit(1);
  }

  // Discord client
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel],
  });

  setupEventHandlers(client);

  // Register slash commands
  await registerCommands();

  // Web server (Render + Termux compatible)
  await startWebServer();

  // Purge expired combat sessions every 2 minutes
  setInterval(() => {
    combatStore.purgeExpired(GAME_CONFIG.combat.sessionTtlSeconds);
  }, 120_000);

  await client.login(process.env.DISCORD_TOKEN);
  console.log('[AshenAI] Discord client logged in.');
}

main().catch((err) => {
  console.error('[AshenAI] Fatal startup error:', err);
  process.exit(1);
});
