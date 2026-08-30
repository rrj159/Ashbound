/**
 * Web server — lightweight health endpoint for deployment monitoring.
 * Optional for Discord operation. Does not expose secrets.
 */

import express from 'express';
import cors from 'cors';
import { getAllHealth } from '../ai/health.js';

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

  // Provider health — internal diagnostics (no secrets exposed)
  app.get('/api/providers', (_req, res) => {
    const health = getAllHealth();
    // Strip sensitive data — only expose status, latency, and success rates
    const safe: Record<string, Record<string, unknown>> = {};
    for (const [name, h] of Object.entries(health)) {
      safe[name] = {
        status: h.status,
        successRate: h.successRate,
        avgLatencyMs: h.avgLatencyMs,
        totalSuccesses: h.totalSuccesses,
        totalFailures: h.totalFailures,
        cooldownRemainingMs: h.cooldownRemainingMs,
      };
    }
    res.json({ providers: safe });
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
