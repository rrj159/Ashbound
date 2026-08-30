/**
 * Usage Tracker — Per-provider quota tracking (RPM, RPD, TPM, TPD).
 *
 * Tracks usage by (provider, model, key) tuple and prevents requests
 * that would obviously exceed known rate limits.
 *
 * Quota semantics:
 * - RPM: Requests per minute
 * - RPD: Requests per day
 * - TPM: Tokens per minute
 * - TPD: Tokens per day
 *
 * Windows reset at minute/day boundaries.
 */

export interface QuotaEntry {
  provider: string;
  model: string;
  keyHash: string; // hashed API key for privacy
  
  // Ceilings (from provider documentation or observation)
  rpmCeiling?: number;
  rpdCeiling?: number;
  tpmCeiling?: number;
  tpdCeiling?: number;
  
  // Current usage (rolling windows)
  rpmUsed: number;
  rpdUsed: number;
  tpmUsed: number;
  tpdUsed: number;
  
  // Window reset times
  minuteWindowResetAt: number;
  dayWindowResetAt: number;
  
  // Metrics
  lastRequestAt: number;
  consecutiveQuotaExceeds: number;
}

const _quotas = new Map<string, QuotaEntry>();

function getQuotaKey(provider: string, model: string, keyHash: string): string {
  return `${provider}:${model}:${keyHash}`;
}

function hashKey(apiKey: string): string {
  // Simple hash: use first 8 and last 8 chars, never expose the full key
  if (apiKey.length <= 16) {
    return Buffer.from(apiKey).toString('base64').substring(0, 16);
  }
  return apiKey.substring(0, 8) + apiKey.substring(apiKey.length - 8);
}

function nowMs(): number {
  return Date.now();
}

function minuteWindowResetTime(): number {
  const now = new Date();
  now.setSeconds(0, 0);
  now.setMinutes(now.getMinutes() + 1);
  return now.getTime();
}

function dayWindowResetTime(): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() + 1);
  return now.getTime();
}

/**
 * Record a request completion with actual usage.
 */
export function recordUsage(
  provider: string,
  model: string,
  apiKey: string,
  inputTokens: number = 0,
  outputTokens: number = 0,
): void {
  const keyHash = hashKey(apiKey);
  const key = getQuotaKey(provider, model, keyHash);
  
  const now = nowMs();
  let entry = _quotas.get(key);
  
  if (!entry) {
    entry = {
      provider,
      model,
      keyHash,
      rpmUsed: 0,
      rpdUsed: 0,
      tpmUsed: 0,
      tpdUsed: 0,
      minuteWindowResetAt: minuteWindowResetTime(),
      dayWindowResetAt: dayWindowResetTime(),
      lastRequestAt: now,
      consecutiveQuotaExceeds: 0,
    };
    _quotas.set(key, entry);
  }
  
  // Reset windows if time has passed
  if (now >= entry.minuteWindowResetAt) {
    entry.rpmUsed = 0;
    entry.tpmUsed = 0;
    entry.minuteWindowResetAt = minuteWindowResetTime();
  }
  if (now >= entry.dayWindowResetAt) {
    entry.rpdUsed = 0;
    entry.tpdUsed = 0;
    entry.dayWindowResetAt = dayWindowResetTime();
  }
  
  // Update usage
  entry.rpmUsed += 1;
  entry.rpdUsed += 1;
  entry.tpmUsed += inputTokens + outputTokens;
  entry.tpdUsed += inputTokens + outputTokens;
  entry.lastRequestAt = now;
  entry.consecutiveQuotaExceeds = 0;
}

/**
 * Check if a request would exceed known quotas.
 * Returns empty array if OK, otherwise list of exceeded limits.
 */
export function checkQuota(
  provider: string,
  model: string,
  apiKey: string,
  estimatedInputTokens: number = 1000,
  estimatedOutputTokens: number = 1000,
): string[] {
  const keyHash = hashKey(apiKey);
  const key = getQuotaKey(provider, model, keyHash);
  
  const entry = _quotas.get(key);
  if (!entry) return []; // No quota data yet
  
  const now = nowMs();
  const violations: string[] = [];
  
  // Check RPM
  if (entry.rpmCeiling && entry.rpmUsed + 1 > entry.rpmCeiling) {
    violations.push(`RPM (${entry.rpmUsed + 1}/${entry.rpmCeiling})`);
  }
  
  // Check RPD
  if (entry.rpdCeiling && entry.rpdUsed + 1 > entry.rpdCeiling) {
    violations.push(`RPD (${entry.rpdUsed + 1}/${entry.rpdCeiling})`);
  }
  
  // Check TPM
  const totalTokens = estimatedInputTokens + estimatedOutputTokens;
  if (entry.tpmCeiling && entry.tpmUsed + totalTokens > entry.tpmCeiling) {
    violations.push(`TPM (${entry.tpmUsed + totalTokens}/${entry.tpmCeiling})`);
  }
  
  // Check TPD
  if (entry.tpdCeiling && entry.tpdUsed + totalTokens > entry.tpdCeiling) {
    violations.push(`TPD (${entry.tpdUsed + totalTokens}/${entry.tpdCeiling})`);
  }
  
  return violations;
}

/**
 * Set quota ceiling for a provider/model.
 */
export function setQuotaCeiling(
  provider: string,
  model: string,
  apiKey: string,
  limits: {
    rpmCeiling?: number;
    rpdCeiling?: number;
    tpmCeiling?: number;
    tpdCeiling?: number;
  },
): void {
  const keyHash = hashKey(apiKey);
  const key = getQuotaKey(provider, model, keyHash);
  
  let entry = _quotas.get(key);
  if (!entry) {
    entry = {
      provider,
      model,
      keyHash,
      rpmUsed: 0,
      rpdUsed: 0,
      tpmUsed: 0,
      tpdUsed: 0,
      minuteWindowResetAt: minuteWindowResetTime(),
      dayWindowResetAt: dayWindowResetTime(),
      lastRequestAt: 0,
      consecutiveQuotaExceeds: 0,
    };
    _quotas.set(key, entry);
  }
  
  entry.rpmCeiling = limits.rpmCeiling;
  entry.rpdCeiling = limits.rpdCeiling;
  entry.tpmCeiling = limits.tpmCeiling;
  entry.tpdCeiling = limits.tpdCeiling;
}

/**
 * Get current quota usage for a provider/model/key.
 */
export function getQuotaUsage(provider: string, model: string, apiKey: string): QuotaEntry | null {
  const keyHash = hashKey(apiKey);
  const key = getQuotaKey(provider, model, keyHash);
  return _quotas.get(key) ?? null;
}

/**
 * Get all tracked quotas (testing/diagnostics only — no keys exposed).
 */
export function getAllQuotaUsage(): QuotaEntry[] {
  return Array.from(_quotas.values());
}

/**
 * Record a quota exceeded event (for penalty calculation).
 */
export function recordQuotaExceeded(provider: string, model: string, apiKey: string): void {
  const keyHash = hashKey(apiKey);
  const key = getQuotaKey(provider, model, keyHash);
  
  const entry = _quotas.get(key);
  if (entry) {
    entry.consecutiveQuotaExceeds += 1;
  }
}

/**
 * Clear usage tracker (testing only).
 */
export function _resetUsageTracker(): void {
  _quotas.clear();
}
