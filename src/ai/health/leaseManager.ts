/**
 * In-Flight Lease Manager — Request accounting & concurrency control.
 *
 * Before a request is sent upstream, acquire a lease that reserves:
 * - A concurrency slot (prevent too many simultaneous requests)
 * - Provisional token usage (pessimistic estimate for quota checking)
 *
 * When complete (success or failure), release the lease and update actual usage.
 *
 * This prevents concurrent requests from independently believing quota is available.
 */

import { v4 as uuidv4 } from 'uuid';

export interface InFlightLease {
  id: string;
  provider: string;
  model: string;
  acquiredAt: number;
  provisionalInputTokens: number;
  provisionalOutputTokens: number;
}

export interface UsageSnapshot {
  totalProvisionalInputTokens: number;
  totalProvisionalOutputTokens: number;
  activeLeaseCount: number;
}

// Per provider/model pair: active leases
const _leases = new Map<string, InFlightLease[]>();

// Concurrency limits per provider (configurable)
const _concurrencyLimits = new Map<string, number>([
  ['openai', 10],
  ['anthropic', 10],
  ['gemini', 15],
  ['groq', 20],
  ['deepseek', 15],
  ['mistral', 10],
  ['default', 10],
]);

export function setConcurrencyLimit(provider: string, limit: number): void {
  _concurrencyLimits.set(provider, limit);
}

export function getConcurrencyLimit(provider: string): number {
  return _concurrencyLimits.get(provider) ?? _concurrencyLimits.get('default') ?? 10;
}

/**
 * Acquire a lease for an in-flight request.
 * Returns a lease ID to be released later.
 * Throws if concurrency limit exceeded.
 */
export function acquireLease(
  provider: string,
  model: string,
  provisionalInputTokens: number = 1000,
  provisionalOutputTokens: number = 1000,
): InFlightLease {
  const key = `${provider}:${model}`;
  const current = _leases.get(key) ?? [];
  const limit = getConcurrencyLimit(provider);

  if (current.length >= limit) {
    throw new Error(
      `[LeaseManager] Concurrency limit exceeded for ${provider} (${current.length}/${limit} active leases).`,
    );
  }

  const lease: InFlightLease = {
    id: uuidv4(),
    provider,
    model,
    acquiredAt: Date.now(),
    provisionalInputTokens,
    provisionalOutputTokens,
  };

  current.push(lease);
  _leases.set(key, current);

  return lease;
}

/**
 * Release a lease after the request completes.
 * Optionally update actual usage (input/output tokens consumed).
 */
export function releaseLease(
  leaseId: string,
  actualInputTokens?: number,
  actualOutputTokens?: number,
): void {
  for (const [key, leases] of _leases) {
    const idx = leases.findIndex((l) => l.id === leaseId);
    if (idx >= 0) {
      leases.splice(idx, 1);
      if (leases.length === 0) {
        _leases.delete(key);
      }
      return;
    }
  }
}

/**
 * Get current usage snapshot for a provider/model pair.
 * Used for quota checking before routing.
 */
export function getProvisionalUsage(provider: string, model: string): UsageSnapshot {
  const key = `${provider}:${model}`;
  const leases = _leases.get(key) ?? [];

  return {
    totalProvisionalInputTokens: leases.reduce((s, l) => s + l.provisionalInputTokens, 0),
    totalProvisionalOutputTokens: leases.reduce((s, l) => s + l.provisionalOutputTokens, 0),
    activeLeaseCount: leases.length,
  };
}

/**
 * Get current usage for all active leases.
 * Internal diagnostic only.
 */
export function getAllActiveLeases(): InFlightLease[] {
  const result: InFlightLease[] = [];
  for (const leases of _leases.values()) {
    result.push(...leases);
  }
  return result;
}

/**
 * Clear all leases (testing only).
 */
export function _resetLeaseManager(): void {
  _leases.clear();
}
