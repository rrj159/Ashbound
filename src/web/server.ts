/**
 * Web server — lightweight health endpoint for deployment monitoring.
 * Optional for Discord operation. Does not expose secrets.
 */

import express from 'express';
import cors from 'cors';

export async function startWebServer(): Promise<void> {
  const app = express();
  const PORT = parseInt(process.env.PORT ?? '3000', 10);

  app.use(cors());
  app.use(express.json());

  // Health check — required for deployment platforms
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Fallback
  app.get('*', (_req, res) => {
    res.json({ name: 'Ashbound', status: 'running' });
  });

  return new Promise((resolve) => {
    app.listen(PORT, () => {
      console.log(`[Web] Health endpoint on port ${PORT}`);
      resolve();
    });
  });
}
