import express from 'express';
import cors from 'cors';
import path from 'path';
import { getAllPlayers, getJackpot } from '../games/store.js';

export async function startWebServer(): Promise<void> {
  const app = express();
  const PORT = parseInt(process.env.PORT ?? '3000', 10);

  app.use(cors());
  app.use(express.json());

  // Health check — required for Render
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Leaderboard API
  app.get('/api/leaderboard', async (_req, res) => {
    try {
      const players = await getAllPlayers();
      const sorted = players
        .sort((a, b) => b.level - a.level || b.gold - a.gold)
        .slice(0, 20)
        .map((p) => ({
          username: p.username,
          characterName: p.characterName,
          level: p.level,
          gold: p.gold,
          region: p.region,
          bossKills: p.statistics.bossesKilled,
        }));
      res.json(sorted);
    } catch (err) {
      console.error('[Web] Leaderboard error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Jackpot status
  app.get('/api/jackpot', async (_req, res) => {
    try {
      const jackpot = await getJackpot();
      res.json(jackpot);
    } catch (err) {
      console.error('[Web] Jackpot error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Serve static frontend if present
  const publicDir = path.join(process.cwd(), 'public');
  app.use(express.static(publicDir));
  app.get('*', (_req, res) => {
    const indexPath = path.join(publicDir, 'index.html');
    const fs = require('fs');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.json({ name: 'AshenAI', status: 'running' });
    }
  });

  return new Promise((resolve) => {
    app.listen(PORT, () => {
      console.log(`[Web] Server running on port ${PORT}`);
      resolve();
    });
  });
}
