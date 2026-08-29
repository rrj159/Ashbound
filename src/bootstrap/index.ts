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
import { restoreAllReminders } from '../discord/commands/remind.js';

export interface Application {
  client: Client;
  config: AppConfig;
}

/**
 * Bootstrap the entire application.
 */
export async function bootstrap(): Promise<Application> {
  console.log('[Ashbound] Starting — Season 1: Rise of Ash');

  // 1. Load configuration (fails fast on missing required vars)
  const config = initConfig();
  console.log('[Config] Configuration loaded.');
  console.log(`[Config] Discord token: ${config.discord.token ? 'configured' : '⚠️ MISSING'}`);
  console.log(`[Config] Discord client ID: ${config.discord.clientId ? 'configured' : '⚠️ MISSING'}`);
  console.log(`[Config] Primary AI: ${config.ai.primaryProvider}`);

  // 2. Initialize Discord client
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel],
  });

  // 3. Setup event handlers
  setupEventHandlers(client);

  // 4. Register slash commands
  await registerCommands();

  // 5. Start web server (optional — health endpoint)
  await startWebServer();

  // 6. Initialize AI providers
  initProviders();

  // 7. Setup message handler (AI chat on mention/DM)
  setupMessageHandler(client);

  // 8. Restore persisted reminders
  try {
    const restored = await restoreAllReminders();
    if (restored > 0) console.log(`[Reminders] Restored ${restored} pending reminders.`);
  } catch {
    // Reminder persistence optional
  }

  // 9. Login to Discord
  await client.login(config.discord.token);
  console.log('[Ashbound] Discord client logged in.');

  return { client, config };
}

/**
 * Graceful shutdown handler.
 */
export function setupGracefulShutdown(application: Application): void {
  const shutdown = async (signal: string) => {
    console.log(`[Ashbound] Received ${signal}. Shutting down gracefully...`);

    try {
      application.client.destroy();
      console.log('[Ashbound] Discord client destroyed.');
    } catch (err) {
      console.error('[Ashbound] Error during shutdown:', err);
    }

    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
