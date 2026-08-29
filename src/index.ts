/**
 * Ashbound — Entry point
 * Bootstraps Discord client, AI providers, and web server.
 */

import 'dotenv/config';
import { bootstrap, setupGracefulShutdown } from './bootstrap/index.js';

async function main(): Promise<void> {
  const application = await bootstrap();
  setupGracefulShutdown(application);
}

main().catch((err) => {
  console.error('[Ashbound] Fatal startup error:', err);
  process.exit(1);
});
