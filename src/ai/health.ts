/**
 * Provider Health System.
 *
 * Tracks per-provider health: success rate, latency, cooldown, rate limits.
 * Used by the router to skip unhealthy providers and exposed for monitoring.
 */

export interface ProviderHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  consecutiveFailures: number;
  totalSuccesses: number;
  totalFailures: number;
  successRate: number;       // 0..1
  avgLatencyMs: number;
  p95LatencyMs: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastError: string | null;
  cooldownUntil: number | null;
  cooldownRemainingMs: number;
  rateLimitHits: number;
  tokensUsed: number;
  estimatedCost: number;
}

const _health = new Map<string, ProviderHealth>();
const _latencies = new Map<string, number[]>();
const _cooldowns = new Map<string, { until: number; reason: string }>();

const LATENCY_WINDOW = 50; // keep last 50 samples for p95
const P95_PERCENTILE = 0.95;

const DEGRADED_FAILURE_THRESHOLD = 2;
const UNHEALTHY_FAILURE_THRESHOLD = 5;
const DEGRADED_P95_MS = 5000;
const UNHEALTHY_P95_MS = 15000;
const COOLDOWN_BASE_MS = 5_000;
const COOLDOWN_MAX_MS = 600_000;
const COOLDOWN_JITTER = 0.3;
const RATE_LIMIT_BACKOFF_MS = 60_000;

const COST_PER_1K: Record<string, number> = {
  openai: 0.00015,
  anthropic: 0.0006,
  gemini: 0.000075,
  groq: 0.000005,
  openrouter: 0.00015,
  mistral: 0.0004,
  deepseek: 0.00007,
  xai: 0.001,
  cohere: 0.0004,
};

function getOrInit(name: string): ProviderHealth {
  let h = _health.get(name);
  if (!h) {
    h = {
      status: 'unknown',
      consecutiveFailures: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      successRate: 1,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: null,
      cooldownUntil: null,
      cooldownRemainingMs: 0,
      rateLimitHits: 0,
      tokensUsed: 0,
      estimatedCost: 0,
    };
    _health.set(name, h);
  }
  return h;
}

function recompute(h: ProviderHealth, name: string): void {
  const total = h.totalSuccesses + h.totalFailures;
  h.successRate = total > 0 ? h.totalSuccesses / total : 1;

  const lats = _latencies.get(name) ?? [];
  if (lats.length > 0) {
    const sorted = [...lats].sort((a, b) => a - b);
    h.avgLatencyMs = lats.reduce((s, x) => s + x, 0) / lats.length;
    const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * P95_PERCENTILE));
    h.p95LatencyMs = sorted[p95Idx];
  }

  if (h.cooldownUntil && Date.now() < h.cooldownUntil) {
    h.cooldownRemainingMs = h.cooldownUntil - Date.now();
    h.status = 'unhealthy';
  } else {
    h.cooldownUntil = null;
    h.cooldownRemainingMs = 0;
    if (h.consecutiveFailures >= UNHEALTHY_FAILURE_THRESHOLD) h.status = 'unhealthy';
    else if (h.consecutiveFailures >= DEGRADED_FAILURE_THRESHOLD) h.status = 'degraded';
    else if (h.totalSuccesses + h.totalFailures > 0) h.status = 'healthy';
    else h.status = 'unknown';
  }
}

function recordLatency(name: string, ms: number): void {
  const arr = _latencies.get(name) ?? [];
  arr.push(ms);
  if (arr.length > LATENCY_WINDOW) arr.shift();
  _latencies.set(name, arr);
}

function backoffMs(failures: number): number {
  const base = COOLDOWN_BASE_MS * Math.pow(2, failures - 1);
  const jitter = base * COOLDOWN_JITTER * (Math.random() * 2 - 1);
  return Math.min(base + jitter, COOLDOWN_MAX_MS);
}

function isRateLimitError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'status' in err) return (err as { status: number }).status === 429;
  return /429|rate limit|too many requests/i.test(String(err));
}

function isTimeoutError(err: unknown): boolean {
  return /timeout|ETIMEDOUT|aborted/i.test(String(err));
}

export function recordSuccess(name: string, latencyMs: number, tokens = 0): void {
  const h = getOrInit(name);
  h.consecutiveFailures = 0;
  h.totalSuccesses += 1;
  h.lastSuccessAt = Date.now();
  h.tokensUsed += tokens;
  h.estimatedCost += (tokens / 1000) * (COST_PER_1K[name] ?? 0);
  recordLatency(name, latencyMs);
  _cooldowns.delete(name);
  recompute(h, name);
}

export function recordFailure(name: string, err: unknown): void {
  const h = getOrInit(name);
  h.consecutiveFailures += 1;
  h.totalFailures += 1;
  h.lastFailureAt = Date.now();
  h.lastError = String(err).slice(0, 200);

  if (isRateLimitError(err)) h.rateLimitHits += 1;

  const failures = h.consecutiveFailures;
  let delay: number;

  if (isRateLimitError(err)) {
    delay = RATE_LIMIT_BACKOFF_MS;
  } else if (isTimeoutError(err)) {
    delay = 30_000;
  } else {
    delay = backoffMs(failures);
  }

  const until = Date.now() + delay;
  h.cooldownUntil = until;
  h.cooldownRemainingMs = delay;
  _cooldowns.set(name, { until, reason: String(err).slice(0, 80) });

  recompute(h, name);
  console.warn(`[Health] ${name} cooldown: ${Math.round(delay / 1000)}s (consec=${failures})`);
}

export function isOnCooldown(name: string): boolean {
  const entry = _cooldowns.get(name);
  if (!entry) return false;
  if (Date.now() >= entry.until) {
    _cooldowns.delete(name);
    return false;
  }
  return true;
}

export function getHealth(name: string): ProviderHealth {
  const h = getOrInit(name);
  recompute(h, name);
  return { ...h };
}

export function getAllHealth(): Record<string, ProviderHealth> {
  const result: Record<string, ProviderHealth> = {};
  for (const name of _health.keys()) result[name] = getHealth(name);
  return result;
}

export function getCooldowns(): Record<string, { until: number; reason: string; remainingMs: number }> {
  const result: Record<string, { until: number; reason: string; remainingMs: number }> = {};
  for (const [name, entry] of _cooldowns) {
    if (Date.now() < entry.until) {
      result[name] = { until: entry.until, reason: entry.reason, remainingMs: entry.until - Date.now() };
    }
  }
  return result;
}

export function clearCooldown(name: string): void {
  _cooldowns.delete(name);
  const h = _health.get(name);
  if (h) {
    h.cooldownUntil = null;
    h.cooldownRemainingMs = 0;
    recompute(h, name);
  }
}

export function clearAllCooldowns(): void {
  _cooldowns.clear();
  for (const name of _health.keys()) {
    const h = _health.get(name)!;
    h.cooldownUntil = null;
    h.cooldownRemainingMs = 0;
    recompute(h, name);
  }
}

setInterval(() => {
  for (const [name, entry] of _cooldowns) {
    if (Date.now() >= entry.until) _cooldowns.delete(name);
  }
}, 60_000);

export { listAvailableProviders } from './providers/index.js';
