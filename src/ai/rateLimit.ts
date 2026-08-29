/**
 * Rate limiting — per-user AI request cooldowns.
 */

interface RateLimit {
  userId: string;
  requests: number;
  windowStart: number;
  resetAt: number;
}

const _rateLimits = new Map<string, RateLimit>();
const RATE_LIMIT_MAX_REQ = 10; // per 30 seconds
const RATE_LIMIT_WINDOW_MS = 30_000;

export function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const entry = _rateLimits.get(userId);
  if (!entry) {
    _rateLimits.set(userId, { userId, requests: 1, windowStart: now, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (now > entry.resetAt) {
    _rateLimits.set(userId, { userId, requests: 1, windowStart: now, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (entry.requests >= RATE_LIMIT_MAX_REQ) {
    return true;
  }
  entry.requests += 1;
  return false;
}

export function getRateLimitStatus(userId: string): { requests: number; resetAt: number; remainingMs: number } {
  const entry = _rateLimits.get(userId);
  if (!entry) return { requests: 0, resetAt: Date.now(), remainingMs: 0 };
  return { requests: entry.requests, resetAt: entry.resetAt, remainingMs: Math.max(0, entry.resetAt - Date.now()) };
}
