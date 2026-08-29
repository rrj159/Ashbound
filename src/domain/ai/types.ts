/**
 * Domain: AI Provider contract.
 * The core interface that all AI providers must implement.
 * This is the stable contract that the rest of the application depends on.
 */

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'developer';
  content: string;
  /** For vision: image URL or base64 data URI */
  imageUrl?: string;
}

export interface AIResponse {
  content: string;
  /** Raw provider-specific metadata (model, tokens, etc.) */
  meta: Record<string, unknown>;
}

export interface AIStreamChunk {
  content: string;
  done: boolean;
  meta?: Record<string, unknown>;
}

export interface AICompletionOptions {
  model?: string;
  messages: AIMessage[];
  /** Max tokens in the response. 0 = provider default. */
  maxTokens?: number;
  /** 0.0–2.0. -1 = provider default. */
  temperature?: number;
  /** 0–1. Stop generation when confidence exceeds this. */
  topP?: number;
  /** Stream the response token by token. */
  stream?: boolean;
  /** Stop at these sequences. */
  stop?: string[];
}

export interface AIProvider {
  name: string;

  /**
   * Single-shot chat completion.
   * Returns AIResponse with content and metadata.
   */
  complete(opts: AICompletionOptions): Promise<AIResponse>;

  /**
   * Streaming chat completion.
   * Calls `onChunk` for each token and `onDone` when finished.
   */
  stream(
    opts: AICompletionOptions,
    onChunk: (chunk: AIStreamChunk) => void,
    onDone?: (meta: Record<string, unknown>) => void,
  ): Promise<void>;
}

export interface AICapabilities {
  supportsVision: boolean;
  supportsStreaming: boolean;
  supportsSystemLong: boolean;
  costPerM: number;
  model: string;
}

export interface ProviderHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  consecutiveFailures: number;
  totalSuccesses: number;
  totalFailures: number;
  successRate: number;
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
