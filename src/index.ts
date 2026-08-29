/**
 * AshenAI — Entry point
 * Bootstraps Discord client, web server, and game systems.
 */

import 'dotenv/config';
import { bootstrap, setupGracefulShutdown } from './bootstrap/index.js';

async function main(): Promise<void> {
  const application = await bootstrap();
  setupGracefulShutdown(application);
}

main().catch((err) => {
  console.error('[AshenAI] Fatal startup error:', err);
  process.exit(1);
});
