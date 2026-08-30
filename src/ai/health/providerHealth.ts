/**
 * Provider Health Tracking — Advanced health metrics beyond simple cooldown.
 *
 * Tracks per-provider:
 * - Success/failure rates
 * - Latency statistics
 * - Dynamic penalty system
 * - Availability state
 * - Recovery tracking
 */

export interface ProviderHealthMetrics {
  provider: string;
  
  // Success/failure
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  
  // Latency
  avgLatencyMs: number;
  p95LatencyMs: number;
  lastLatencyMs: number;
  
  // Penalty system
  penalty: number; // 0–100, higher = worse
  penaltyDecayRatePerMinute: number; // % per minute
  lastPenaltyUpdateAt: number;
  
  // Availability
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastError: string | null;
  cooldownUntil: number | null;
  
  // Metrics
  totalRequests: number;
  uptime: number; // 0–1, success rate
}

const _health = new Map<string, ProviderHealthMetrics>();

const DEFAULT_PENALTY_DECAY_RATE = 5; // % per minute

function initHealth(provider: string): ProviderHealthMetrics {
  return {
    provider,
    successCount: 0,
    failureCount: 0,
    consecutiveFailures: 0,
    avgLatencyMs: 0,
    p95LatencyMs: 0,
    lastLatencyMs: 0,
    penalty: 0,
    penaltyDecayRatePerMinute: DEFAULT_PENALTY_DECAY_RATE,
    lastPenaltyUpdateAt: Date.now(),
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
    cooldownUntil: null,
    totalRequests: 0,
    uptime: 1,
  };
}

/**
 * Update health after a successful request.
 */
export function recordHealthSuccess(provider: string, latencyMs: number): void {
  let health = _health.get(provider);
  if (!health) {
    health = initHealth(provider);
    _health.set(provider, health);
  }
  
  health.successCount += 1;
  health.totalRequests += 1;
  health.consecutiveFailures = 0;
  health.lastSuccessAt = Date.now();
  health.lastError = null;
  
  // Update latency
  const total = health.successCount + health.failureCount;
  health.avgLatencyMs = (health.avgLatencyMs * (total - 1) + latencyMs) / total;
  health.lastLatencyMs = latencyMs;
  
  // Decay penalty
  decayPenalty(health);
  health.penalty = Math.max(0, health.penalty - 5);
  
  // Recalculate uptime
  health.uptime = health.successCount / health.totalRequests;
}

/**
 * Update health after a failed request.
 */
export function recordHealthFailure(
  provider: string,
  error: string,
  failureType: 'transient' | 'permanent' | 'rate_limit' = 'transient',
): void {
  let health = _health.get(provider);
  if (!health) {
    health = initHealth(provider);
    _health.set(provider, health);
  }
  
  health.failureCount += 1;
  health.totalRequests += 1;
  health.consecutiveFailures += 1;
  health.lastFailureAt = Date.now();
  health.lastError = error;
  
  // Apply penalty based on failure type
  decayPenalty(health);
  if (failureType === 'permanent') {
    health.penalty = Math.min(100, health.penalty + 50);
  } else if (failureType === 'rate_limit') {
    health.penalty = Math.min(100, health.penalty + 20);
  } else {
    health.penalty = Math.min(100, health.penalty + 10);
  }
  
  // Recalculate uptime
  health.uptime = health.successCount / health.totalRequests;
}

/**
 * Decay penalty over time (automatic recovery).
 */
function decayPenalty(health: ProviderHealthMetrics): void {
  const now = Date.now();
  const minutesElapsed = (now - health.lastPenaltyUpdateAt) / (1000 * 60);
  const decayAmount = health.penaltyDecayRatePerMinute * minutesElapsed;
  
  health.penalty = Math.max(0, health.penalty - decayAmount);
  health.lastPenaltyUpdateAt = now;
}

/**
 * Get health metrics for a provider.
 */
export function getProviderHealth(provider: string): ProviderHealthMetrics {
  let health = _health.get(provider);
  if (!health) {
    health = initHealth(provider);
    _health.set(provider, health);
  }
  
  // Update penalty decay
  decayPenalty(health);
  
  return health;
}

/**
 * Get all provider health metrics.
 */
export function getAllProviderHealth(): Record<string, ProviderHealthMetrics> {
  const result: Record<string, ProviderHealthMetrics> = {};
  for (const [provider, health] of _health) {
    decayPenalty(health);
    result[provider] = health;
  }
  return result;
}

/**
 * Set a cooldown for a provider (recovery backoff).
 */
export function setCooldown(provider: string, durationMs: number): void {
  let health = _health.get(provider);
  if (!health) {
    health = initHealth(provider);
    _health.set(provider, health);
  }
  
  health.cooldownUntil = Date.now() + durationMs;
}

/**
 * Check if provider is on cooldown.
 */
export function isHealthOnCooldown(provider: string): boolean {
  const health = _health.get(provider);
  if (!health || !health.cooldownUntil) return false;
  
  if (Date.now() >= health.cooldownUntil) {
    health.cooldownUntil = null;
    return false;
  }
  
  return true;
}

/**
 * Clear all health data (testing only).
 */
export function _resetProviderHealth(): void {
  _health.clear();
}
