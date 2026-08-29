/**
 * Provider registry and factory.
 *
 * Providers are lazily initialized — only when their required env vars are present.
 * The bot works with whatever providers are configured, no empty stubs needed.
 *
 * AI_PROVIDER=openai|anthropic|...
 * AI_FALLBACK=openai|anthropic|...|none
 */

import { OpenAIProvider }    from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { GeminiProvider }     from './gemini.js';
import { GroqProvider }      from './groq.js';
import { MistralProvider }   from './mistral.js';
import { DeepSeekProvider }  from './deepseek.js';
import { OpenRouterProvider } from './openrouter.js';
import { XAIProvider }       from './xai.js';
import { CohereProvider }    from './cohere.js';
import type { AIProvider }   from '../types.js';

export type ProviderName = 'openai' | 'anthropic' | 'gemini' | 'groq' | 'mistral' | 'deepseek' | 'openrouter' | 'xai' | 'cohere';

interface ProviderEntry {
  factory: (() => AIProvider) | null; // null = env vars not set
  envVars: string[];
}

const PROVIDERS: Record<ProviderName, ProviderEntry> = {
  openai:     { factory: () => new OpenAIProvider(),     envVars: ['OPENAI_API_KEY'] },
  anthropic:  { factory: () => new AnthropicProvider(),  envVars: ['ANTHROPIC_API_KEY'] },
  gemini:     { factory: () => new GeminiProvider(),     envVars: ['GEMINI_API_KEY'] },
  groq:       { factory: () => new GroqProvider(),       envVars: ['GROQ_API_KEY'] },
  mistral:    { factory: () => new MistralProvider(),    envVars: ['MISTRAL_API_KEY'] },
  deepseek:   { factory: () => new DeepSeekProvider(),   envVars: ['DEEPSEEK_API_KEY'] },
  openrouter: { factory: () => new OpenRouterProvider(), envVars: ['OPENROUTER_API_KEY'] },
  xai:        { factory: () => new XAIProvider(),        envVars: ['XAI_API_KEY'] },
  cohere:     { factory: () => new CohereProvider(),     envVars: ['COHERE_API_KEY'] },
};

/** Lazy instances — initialized once on first use. */
const _instances: Partial<Record<ProviderName, AIProvider>> = {};

/** Primary and fallback. */
let _primary:   AIProvider | null = null;
let _fallback:  AIProvider | null = null;

function isConfigured(name: ProviderName): boolean {
  const entry = PROVIDERS[name];
  if (!entry) return false;
  return entry.envVars.every((v) => !!process.env[v]);
}

function tryInstantiate(name: ProviderName): AIProvider | null {
  if (!isConfigured(name)) return null;
  if (_instances[name]) return _instances[name]!;

  const entry = PROVIDERS[name];
  if (!entry.factory) return null;

  try {
    const instance = entry.factory();
    _instances[name] = instance;
    return instance;
  } catch (err) {
    console.warn(`[AI] Failed to instantiate ${name}:`, err);
    return null;
  }
}

export function initProviders(): void {
  let primaryName   = (process.env.AI_PROVIDER || 'openai')  as ProviderName;
  const fallbackRaw   = process.env.AI_FALLBACK || 'none';
  const fallbackName  = fallbackRaw as ProviderName;

  if (!isConfigured(primaryName)) {
    console.warn(`[AI] Provider "${primaryName}" not configured (missing env vars). Searching for available providers...`);
    // Auto-select first configured provider
    const available = (Object.keys(PROVIDERS) as ProviderName[]).find(isConfigured);
    if (!available) {
      console.error('[AI] No AI providers configured. Set at least one API key.');
      // Don't throw — bot continues without AI features
      return;
    }
    primaryName = available;
  }

  _primary = tryInstantiate(primaryName);

  if (_primary) {
    console.log(`[AI] Primary provider: ${_primary.name}`);
  } else {
    console.warn(`[AI] Could not initialize primary provider "${primaryName}".`);
  }

  if (fallbackRaw !== 'none' && fallbackName !== primaryName) {
    if (isConfigured(fallbackName)) {
      _fallback = tryInstantiate(fallbackName);
      if (_fallback) console.log(`[AI] Fallback provider: ${_fallback.name}`);
    } else {
      console.warn(`[AI] Fallback provider "${fallbackName}" not configured.`);
    }
  }

  const available = (Object.keys(PROVIDERS) as ProviderName[]).filter(isConfigured);
  console.log(`[AI] Available providers: ${available.join(', ') || 'none'}`);
}

export function getPrimaryProvider(): AIProvider | null {
  return _primary;
}

export function getFallbackProvider(): AIProvider | null {
  return _fallback;
}

export function listAvailableProviders(): ProviderName[] {
  return (Object.keys(PROVIDERS) as ProviderName[]).filter(isConfigured);
}

export function listAllProviders(): ProviderName[] {
  return Object.keys(PROVIDERS) as ProviderName[];
}

/** Reset internal state for testing. */
export function _resetProviderState(): void {
  for (const key of Object.keys(_instances) as ProviderName[]) {
    delete _instances[key];
  }
  _primary = null;
  _fallback = null;
}
