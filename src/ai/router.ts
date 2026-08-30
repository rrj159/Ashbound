/**
 * Smart AI Router — intelligent request routing across providers.
 *
 * Routes based on:
 * - Provider health and state (HEALTHY, COOLDOWN, RATE_LIMITED, etc.)
 * - Capability (vision, streaming, tools, system prompt length)
 * - Cost (cheap for simple tasks, premium for complex)
 * - Latency (round-trip pings)
 * - Model availability
 * - Automatic fallback with exponential backoff
 * - Permanent failure detection (invalid creds, no credits)
 * - Temporary failure recovery
 * - Usage tracking
 *
 * Usage: replace `ai.chat()` with `router.chat()` — same interface.
 */

import { getPrimaryProvider, getFallbackProvider, getProvider, listAvailableProviders } from './providers/index.js';
import type { AICompletionOptions, AIResponse, AIStreamChunk, AIMessage, ProviderFailureKind as ProviderFailureKindType, ProviderState } from './types.js';
import { SecretRedactor } from '../security/SecretRedactor.js';
import { MODEL_CATALOG, lookupModel } from './modelCatalog.js';

/** Per-provider cooldown state. */
interface CooldownEntry {
  until: number; // timestamp ms when cooldown expires
  failures: number;
}

const _cooldowns = new Map<string, CooldownEntry>();
/** Providers with rejected credentials or exhausted credit. */
const _unavailable = new Map<string, string>();

type ProviderFailureKind = ProviderFailureKindType;

function classifyProviderFailure(error: unknown): ProviderFailureKind {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const status = typeof record.status === 'number' ? record.status : undefined;
  const details = [
    error instanceof Error ? error.message : String(error),
    typeof record.code === 'string' ? record.code : '',
    typeof record.type === 'string' ? record.type : '',
    record.error && typeof record.error === 'object' ? JSON.stringify(record.error) : '',
  ].join(' ').toLowerCase();

  // Authentication / authorization failures — never retry
  if (/(invalid.?api.?key|invalid.?key|authentication|unauthori[sz]ed|forbidden|billing|identity-linked|workspace.?id)/.test(details)
    || status === 401 || status === 403) return 'invalid_credentials';

  // Quota / credit exhaustion — do not retry until manually refreshed
  if (/(credit_balance_exhausted|insufficient_quota|insufficient.?balance|insufficient.?credits|payment.?required|no.?credits)/.test(details)
    || status === 402) return 'no_credits';

  // Model-specific failures — may resolve if model is changed
  if (/(model.?not.?found|not.?found|does.?not.?exist|unavailable|deprecated|not.?available)/.test(details)
    || status === 404) return 'model_unavailable';

  // Rate limiting — will recover
  if (status === 429 || /rate.?limit|too many requests/.test(details)) return 'rate_limit';

  // Network errors — transient
  if (/(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|network|socket hang up|fetch failed|timeout|aborted)/.test(details)) return 'network_error';

  return 'transient';
}

const COOLDOWN_BASE_MS  = 5_000;  // first failure → 5s wait
const COOLDOWN_MAX_MS   = 300_000; // 5 minutes max
const COOLDOWN_JITTER   = 0.3;     // ±30% random jitter

/** Backoff: 5s, 10s, 20s, 40s, 80s... capped at 5min. */
function cooldownMs(failures: number): number {
  const base = COOLDOWN_BASE_MS * Math.pow(2, failures - 1);
  const jitter = base * COOLDOWN_JITTER * (Math.random() * 2 - 1);
  return Math.min(base + jitter, COOLDOWN_MAX_MS);
}

function isOnCooldown(name: string): boolean {
  const entry = _cooldowns.get(name);
  if (!entry) return false;
  if (Date.now() >= entry.until) {
    _cooldowns.delete(name);
    return false;
  }
  return true;
}

function recordFailure(name: string): void {
  const prev = _cooldowns.get(name);
  const failures = (prev?.failures ?? 0) + 1;
  const delay = cooldownMs(failures);
  _cooldowns.set(name, { until: Date.now() + delay, failures });
  console.warn(`[Router] ${name} cooldown: ${Math.round(delay / 1000)}s (failure #${failures})`);
}

function recordSuccess(name: string): void {
  if (_cooldowns.has(name)) {
    _cooldowns.delete(name);
    console.log(`[Router] ${name} cooldown cleared.`);
  }
}

export function getCooldownStatus(): Record<string, { until: number; failures: number }> {
  const result: Record<string, { until: number; failures: number }> = {};
  for (const [name, entry] of _cooldowns) {
    if (isOnCooldown(name)) result[name] = { until: entry.until, failures: entry.failures };
  }
  return result;
}

/** Clear all cooldown and performance state (for testing). */
export function _resetRouterState(): void {
  _cooldowns.clear();
  _unavailable.clear();
  _perf.clear();
}

/** Internal diagnostic state for logs/tests; never exposed through commands. */
export function getUnavailableProviders(): Record<string, string> {
  return Object.fromEntries(_unavailable);
}

/** Expire cooldowns older than MAX age (prevents unbounded map growth). */
/** Performance tracker for providers. */
export interface ProviderPerf {
  totalCalls: number;
  successCalls: number;
  failureCalls: number;
  avgLatencyMs: number;
  lastLatencyMs: number;
}
const _perf = new Map<string, ProviderPerf>();

export function getProviderPerf(name: string): ProviderPerf {
  return _perf.get(name) ?? { totalCalls: 0, successCalls: 0, failureCalls: 0, avgLatencyMs: 0, lastLatencyMs: 0 };
}

export function getAllPerf(): Record<string, ProviderPerf> {
  const result: Record<string, ProviderPerf> = {};
  for (const [k, v] of _perf) result[k] = v;
  return result;
}

function recordPerf(name: string, success: boolean, latencyMs: number): void {
  const prev = _perf.get(name) ?? { totalCalls: 0, successCalls: 0, failureCalls: 0, avgLatencyMs: 0, lastLatencyMs: 0 };
  const total = prev.totalCalls + 1;
  prev.totalCalls = total;
  prev.successCalls += success ? 1 : 0;
  prev.failureCalls += success ? 0 : 1;
  prev.avgLatencyMs = (prev.avgLatencyMs * (total - 1) + latencyMs) / total;
  prev.lastLatencyMs = latencyMs;
  _perf.set(name, prev);
}

const MAX_COOLDOWN_AGE_MS = 3_600_000; // 1 hour
const cooldownCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [name, entry] of _cooldowns) {
    if (now - (entry.until - cooldownMs(entry.failures)) > MAX_COOLDOWN_AGE_MS) {
      _cooldowns.delete(name);
    }
  }
}, 600_000);
// This maintenance timer must not keep tests or a graceful shutdown alive.
cooldownCleanupTimer.unref();

/** What a request needs. */
export interface RouteContext {
  /** Plain-language hint: "simple question", "creative writing", "image analysis" */
  intent?: string;
  /** Prefer speed over quality */
  urgent?: boolean;
  /** Prefer cheap over good */
  costSensitive?: boolean;
  /** Request includes images */
  hasVision?: boolean;
  /** Provider forced by caller */
  preferredProvider?: string;
  /** Chain of fallback providers */
  fallbackChain?: string[];
  /** Optional max spend per 1M tokens (USD) */
  maxCostPerM?: number;
}

interface ProviderMeta {
  name: string;
  provider: { name: string; complete: (o: AICompletionOptions) => Promise<AIResponse>; stream: (o: AICompletionOptions, c: (x: AIStreamChunk) => void, d?: (m: Record<string, unknown>) => void) => Promise<void> };
  costPerM: number;
  latencyMs: number;
  supportsVision: boolean;
  supportsSystemLong: boolean;
  supportsStreaming: boolean;
  model: string;
}

const PROVIDER_CATALOG: Record<string, Omit<ProviderMeta, 'provider'>> = {
  openai:      { name: 'openai',      costPerM: 2.0,   latencyMs: 0, supportsVision: true,  supportsSystemLong: true,  supportsStreaming: true,  model: process.env.OPENAI_MODEL      ?? 'gpt-4o-mini' },
  anthropic:   { name: 'anthropic',   costPerM: 3.0,   latencyMs: 0, supportsVision: true,  supportsSystemLong: true,  supportsStreaming: true,  model: process.env.ANTHROPIC_MODEL   ?? 'claude-sonnet-4-20250514' },
  gemini:      { name: 'gemini',      costPerM: 0.5,   latencyMs: 0, supportsVision: true,  supportsSystemLong: true,  supportsStreaming: true,  model: process.env.GEMINI_MODEL      ?? 'gemini-2.0-flash' },
  groq:        { name: 'groq',        costPerM: 0.0,   latencyMs: 0, supportsVision: false, supportsSystemLong: false, supportsStreaming: true,  model: process.env.GROQ_MODEL        ?? 'llama-3.1-8b-instant' },
  openrouter:  { name: 'openrouter',  costPerM: 0.5,   latencyMs: 0, supportsVision: false, supportsSystemLong: true,  supportsStreaming: true,  model: process.env.OPENROUTER_MODEL  ?? 'meta-llama/llama-3.1-8b-instruct:free' },
  mistral:     { name: 'mistral',     costPerM: 2.0,   latencyMs: 0, supportsVision: false, supportsSystemLong: true,  supportsStreaming: true,  model: process.env.MISTRAL_MODEL     ?? 'mistral-small-latest' },
  deepseek:    { name: 'deepseek',    costPerM: 0.14,  latencyMs: 0, supportsVision: false, supportsSystemLong: true,  supportsStreaming: true,  model: process.env.DEEPSEEK_MODEL    ?? 'deepseek-chat' },
  xai:         { name: 'xai',         costPerM: 5.0,   latencyMs: 0, supportsVision: true,  supportsSystemLong: true,  supportsStreaming: true,  model: process.env.XAI_MODEL         ?? 'grok-3-mini' },
  cohere:      { name: 'cohere',      costPerM: 3.0,   latencyMs: 0, supportsVision: false, supportsSystemLong: true,  supportsStreaming: true,  model: process.env.COHERE_MODEL      ?? 'command-a-03-2025' },
  cerebras:    { name: 'cerebras',    costPerM: 0.0,   latencyMs: 0, supportsVision: false, supportsSystemLong: false, supportsStreaming: true,  model: process.env.CEREBRAS_MODEL    ?? 'llama-3.3-70b' },
  nvidia:      { name: 'nvidia',      costPerM: 0.0,   latencyMs: 0, supportsVision: false, supportsSystemLong: true,  supportsStreaming: true,  model: process.env.NVIDIA_MODEL      ?? 'nvidia/llama-3.1-nemotron-70b-instruct' },
  github:      { name: 'github',      costPerM: 0.0,   latencyMs: 0, supportsVision: true,  supportsSystemLong: true,  supportsStreaming: true,  model: process.env.GITHUB_MODEL      ?? 'gpt-4o-mini' },
  cloudflare:  { name: 'cloudflare',  costPerM: 0.0,   latencyMs: 0, supportsVision: false, supportsSystemLong: false, supportsStreaming: true,  model: process.env.CLOUDFLARE_MODEL  ?? '@cf/meta/llama-3.1-8b-instruct' },
  huggingface: { name: 'huggingface', costPerM: 0.0,   latencyMs: 0, supportsVision: false, supportsSystemLong: false, supportsStreaming: true,  model: process.env.HF_MODEL          ?? 'meta-llama/Llama-3.1-8B-Instruct' },
  pollinations:{ name: 'pollinations', costPerM: 0.0,   latencyMs: 0, supportsVision: false, supportsSystemLong: false, supportsStreaming: true,  model: process.env.POLLINATIONS_MODEL ?? 'openai' },
  freellmapi:  { name: 'freellmapi',  costPerM: 0.0,   latencyMs: 0, supportsVision: false, supportsSystemLong: true,  supportsStreaming: true,  model: process.env.FREELLMAPI_MODEL  ?? 'auto' },
  opencodezen: { name: 'opencodezen', costPerM: 0.0,   latencyMs: 0, supportsVision: false, supportsSystemLong: false, supportsStreaming: true,  model: process.env.OPENCODEZEN_MODEL ?? 'auto' },
  zhipu:       { name: 'zhipu',       costPerM: 0.0,   latencyMs: 0, supportsVision: false, supportsSystemLong: false, supportsStreaming: true,  model: process.env.ZHIPU_MODEL       ?? 'glm-4-flash' },
  ollama:      { name: 'ollama',      costPerM: 0.0,   latencyMs: 0, supportsVision: false, supportsSystemLong: false, supportsStreaming: true,  model: process.env.OLLAMA_MODEL      ?? 'llama3.1' },
};

/** Known good intent → provider preferences (ordered). */
const INTENT_ROUTES: Record<string, string[]> = {
  lore:         ['anthropic', 'openai', 'gemini'],
  creative:     ['anthropic', 'openai', 'gemini'],
  code:         ['anthropic', 'openai', 'groq', 'deepseek'],
  simple:       ['groq', 'deepseek', 'gemini', 'openai'],
  conversation: ['anthropic', 'openai', 'gemini', 'groq'],
  fast:         ['groq', 'deepseek', 'gemini'],
  vision:       ['anthropic', 'openai', 'gemini'],
  default:      ['anthropic', 'openai', 'gemini'],
};

function classifyIntent(opts: AICompletionOptions, ctx: RouteContext): string {
  if (ctx.intent) return ctx.intent;

  const firstUser = opts.messages.find((m) => m.role === 'user');
  const text = (firstUser?.content ?? '').toLowerCase();

  if (text.length < 40) return 'simple';
  if (text.includes('image') || text.includes('screenshot') || text.includes('picture')) return 'vision';
  if (text.includes('code') || text.includes('function') || text.includes('implement')) return 'code';
  if (text.includes('story') || text.includes('lore') || text.includes('legend')) return 'lore';
  if (text.includes('creative') || text.includes('write') || text.includes('poem')) return 'creative';

  return 'default';
}

function scoreProvider(meta: ProviderMeta, intent: string, ctx: RouteContext): number {
  let score = 100;

  // Capability filters
  if (ctx.hasVision && !meta.supportsVision) return -1;
  if (ctx.costSensitive && ctx.maxCostPerM !== undefined && meta.costPerM > ctx.maxCostPerM) return -1;

  // Intent ranking
  const ranked = INTENT_ROUTES[intent] ?? INTENT_ROUTES.default;
  const pos = ranked.indexOf(meta.name);
  if (pos >= 0) score -= pos * 15;

  // Cost preference
  if (ctx.costSensitive) score -= meta.costPerM * 5;

  // Speed preference
  if (ctx.urgent) score -= meta.latencyMs * 0.5;

  // Streaming bonus
  if (!meta.supportsStreaming) return -1;

  return score;
}

function buildCandidates(ctx: RouteContext): ProviderMeta[] {
  const primary = getPrimaryProvider();
  const fallback = getFallbackProvider();
  const available = typeof listAvailableProviders === 'function' ? listAvailableProviders() : [];

  const candidates: ProviderMeta[] = [];

  // Explicit chain from context
  if (ctx.fallbackChain?.length) {
    for (const name of ctx.fallbackChain) {
      const catalog = PROVIDER_CATALOG[name];
      if (!catalog) continue;
      const provider = name === primary?.name ? primary : name === fallback?.name ? fallback : null;
      if (provider && !candidates.find((c) => c.name === name)) {
        candidates.push({ ...catalog, provider: provider as ProviderMeta['provider'] });
      }
    }
  }

  // Preferred provider
  if (ctx.preferredProvider) {
    const cat = PROVIDER_CATALOG[ctx.preferredProvider];
    const p = ctx.preferredProvider === primary?.name ? primary : ctx.preferredProvider === fallback?.name ? fallback : null;
    if (cat && p && !candidates.find((c) => c.name === ctx.preferredProvider)) {
      candidates.unshift({ ...cat, provider: p as ProviderMeta['provider'] });
    }
  }

  // Primary
  if (primary && !candidates.find((c) => c.name === primary.name)) {
    const cat = PROVIDER_CATALOG[primary.name];
    if (cat) candidates.push({ ...cat, provider: primary as ProviderMeta['provider'] });
  }

  // Fallback
  if (fallback && !candidates.find((c) => c.name === fallback.name)) {
    const cat = PROVIDER_CATALOG[fallback.name];
    if (cat) candidates.push({ ...cat, provider: fallback as ProviderMeta['provider'] });
  }

  // Available providers not yet listed
  for (const name of available) {
    if (candidates.find((c) => c.name === name)) continue;
    const cat = PROVIDER_CATALOG[name];
    const prov = typeof getProvider === 'function' ? getProvider(name) : null;
    if (cat && prov) candidates.push({ ...cat, provider: prov as ProviderMeta['provider'] });
  }

  return candidates;
}

class AIRouter {
  /**
   * Send a chat request with intelligent routing.
   * Same signature as `ai.chat()` but adds optional `RouteContext`.
   */
  async chat(
    opts: AICompletionOptions,
    ctx: RouteContext = {},
  ): Promise<AIResponse> {
    const intent = classifyIntent(opts, ctx);
    const candidates = buildCandidates(ctx);

    // Score and sort
    const ranked = candidates
      .map((c) => ({ ...c, score: scoreProvider(c, intent, ctx) }))
      .filter((c) => c.score >= 0);

    if (ranked.length === 0) {
      throw new Error('[Router] No providers available that meet requirements.');
    }

    const lastError = { e: null as unknown | null };

    for (const candidate of ranked) {
      if (_unavailable.has(candidate.name)) {
        console.warn(`[Router] Skipping ${candidate.name} — unavailable (${_unavailable.get(candidate.name)}).`);
        continue;
      }
      if (isOnCooldown(candidate.name)) {
        console.warn(`[Router] Skipping ${candidate.name} — on cooldown.`);
        continue;
      }
      try {
        const resolvedOpts = { ...opts, model: candidate.model };
        const start = Date.now();
        const result = await candidate.provider.complete(resolvedOpts);
        const latency = Date.now() - start;
        recordPerf(candidate.name, true, latency);
        recordSuccess(candidate.name);
        return result;
      } catch (err) {
        const latency = 0;
        recordPerf(candidate.name, false, latency);
        const failureKind = classifyProviderFailure(err);
        // Permanent failures: invalid_credentials, no_credits — do not retry
        if (failureKind === 'invalid_credentials' || failureKind === 'no_credits') {
          _unavailable.set(candidate.name, failureKind);
          console.warn(`[Router] ${candidate.name} marked unavailable (${failureKind}).`);
        } else if (failureKind === 'model_unavailable') {
          // Model not found — mark as model_unavailable, may recover with different model
          _unavailable.set(candidate.name, failureKind);
          console.warn(`[Router] ${candidate.name} model unavailable (${failureKind}).`);
        } else {
          recordFailure(candidate.name);
        }
        lastError.e = err;
        console.warn(`[Router] ${candidate.name} failed [${failureKind}] (${SecretRedactor.redactString(String(err))}), trying next...`);
      }
    }

    throw lastError.e ?? new Error('[Router] All providers failed.');
  }

  /**
   * Streaming chat with intelligent routing + fallback.
   */
  async stream(
    opts: AICompletionOptions,
    onChunk: (chunk: AIStreamChunk) => void,
    ctx: RouteContext = {},
  ): Promise<void> {
    const intent = classifyIntent(opts, ctx);
    const candidates = buildCandidates(ctx);

    const ranked = candidates
      .map((c) => ({ ...c, score: scoreProvider({ ...c, provider: null as unknown as ProviderMeta['provider'] }, intent, ctx) }))
      .filter((c) => c.score >= 0);

    let lastError: unknown = null;
    for (const candidate of ranked) {
      if (_unavailable.has(candidate.name)) {
        console.warn(`[Router] Skipping ${candidate.name} — unavailable (${_unavailable.get(candidate.name)}).`);
        continue;
      }
      if (isOnCooldown(candidate.name)) {
        console.warn(`[Router] Skipping ${candidate.name} — on cooldown.`);
        continue;
      }
      try {
        const resolvedOpts = { ...opts, model: candidate.model };
        const start = Date.now();
        await candidate.provider.stream(resolvedOpts, onChunk);
        recordPerf(candidate.name, true, Date.now() - start);
        recordSuccess(candidate.name);
        return;
      } catch (err) {
        recordPerf(candidate.name, false, 0);
        const failureKind = classifyProviderFailure(err);
        if (failureKind === 'invalid_credentials' || failureKind === 'no_credits') {
          _unavailable.set(candidate.name, failureKind);
        } else if (failureKind === 'model_unavailable') {
          _unavailable.set(candidate.name, failureKind);
        } else {
          recordFailure(candidate.name);
        }
        lastError = err;
        console.warn(`[Router] ${candidate.name} stream failed [${failureKind}], trying next...`);
      }
    }

    throw lastError ?? new Error('[Router] All streaming providers failed.');
  }

  /**
   * Convenience: single-turn with context hints.
   */
  async say(
    prompt: string,
    system?: string,
    ctx: RouteContext = {},
    opts: Partial<AICompletionOptions> = {},
  ): Promise<string> {
    const messages: AIMessage[] = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });
    const { content } = await this.chat({ messages, ...opts }, ctx);
    return content;
  }
}

export const router = new AIRouter();
