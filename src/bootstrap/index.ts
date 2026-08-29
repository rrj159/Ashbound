/**
 * Bootstrap: Application startup orchestration.
 * Initializes all services in the correct order.
 */

import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { initConfig, type AppConfig } from '../config/config.js';
import { initProviders } from '../ai/providers/index.js';
import { startWebServer } from '../web/server.js';
import { registerCommands } from '../discord/register.js';
import { setupEventHandlers } from '../discord/events.js';
import { setupMessageHandler } from '../discord/handlers/message.js';
import { GAME_CONFIG } from '../games/config.js';
import { combatStore } from '../games/store.js';
import { restoreAllReminders } from '../discord/commands/remind.js';

export interface Application {
  client: Client;
  config: AppConfig;
}

/**
 * Bootstrap the entire application.
 */
export async function bootstrap(): Promise<Application> {
  console.log(`[AshenAI] Starting — Season ${GAME_CONFIG.season.current}: ${GAME_CONFIG.season.name}`);

  // 1. Load configuration (fails fast on missing required vars)
  const config = initConfig();
  console.log(`[Config] Loaded. Primary AI: ${config.ai.primaryProvider}`);

  // 2. Initialize Discord client
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel],
  });

  // 3. Setup event handlers
  setupEventHandlers(client);

  // 4. Register slash commands
  await registerCommands();

  // 5. Start web server
  await startWebServer();

  // 6. Initialize AI providers
  initProviders();

  // 7. Setup message handler
  setupMessageHandler(client);

  // 8. Purge expired combat sessions every 2 minutes
  setInterval(() => {
    combatStore.purgeExpired(GAME_CONFIG.combat.sessionTtlSeconds);
  }, 120_000);

  // 9. Restore persisted reminders
  try {
    const restored = await restoreAllReminders();
    if (restored > 0) console.log(`[Reminders] Restored ${restored} pending reminders.`);
  } catch {
    // Reminder persistence optional
  }

  // 10. Login to Discord
  await client.login(config.discord.token);
  console.log('[AshenAI] Discord client logged in.');

  return { client, config };
}

/**
 * Graceful shutdown handler.
 */
export function setupGracefulShutdown(application: Application): void {
  const shutdown = async (signal: string) => {
    console.log(`[AshenAI] Received ${signal}. Shutting down gracefully...`);

    try {
      // Destroy Discord client
      application.client.destroy();
      console.log('[AshenAI] Discord client destroyed.');
    } catch (err) {
      console.error('[AshenAI] Error during shutdown:', err);
    }

    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
