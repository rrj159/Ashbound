/**
 * Structured logger — never logs secrets.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/g,           // OpenAI / Anthropic
  /sk-or-[A-Za-z0-9_-]{20,}/g,         // OpenRouter
  /xai-[A-Za-z0-9_-]{20,}/g,           // xAI
  /AIza[A-Za-z0-9_-]{20,}/g,           // Google
  /gsk_[A-Za-z0-9_-]{20,}/g,           // Groq
  /[A-Za-z0-9_-]{32,}\.([A-Za-z0-9_-]{32,})\.([A-Za-z0-9_-]{32,})/g, // JWT
  /Bearer\s+[A-Za-z0-9._-]+/gi,        // Bearer tokens
];

function sanitize(input: unknown): unknown {
  if (typeof input === 'string') {
    let result = input;
    for (const pattern of SENSITIVE_PATTERNS) {
      result = result.replace(pattern, '[REDACTED]');
    }
    return result;
  }
  if (input && typeof input === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (['apiKey', 'token', 'authorization', 'password', 'secret', 'DISCORD_TOKEN', 'CLIENT_SECRET'].some((s) => key.toLowerCase().includes(s.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitize(value);
      }
    }
    return sanitized;
  }
  return input;
}

function format(level: LogLevel, category: string, message: string, meta?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  const safeMessage = sanitize(message) as string;
  const safeMeta = meta ? (sanitize(meta) as Record<string, unknown>) : undefined;
  const metaStr = safeMeta ? ` ${JSON.stringify(safeMeta)}` : '';
  return `[${ts}] [${level.toUpperCase()}] [${category}] ${safeMessage}${metaStr}`;
}

export const logger = {
  debug: (category: string, message: string, meta?: Record<string, unknown>) => {
    if (process.env.LOG_LEVEL === 'debug') console.log(format('debug', category, message, meta));
  },
  info: (category: string, message: string, meta?: Record<string, unknown>) => {
    console.log(format('info', category, message, meta));
  },
  warn: (category: string, message: string, meta?: Record<string, unknown>) => {
    console.warn(format('warn', category, message, meta));
  },
  error: (category: string, message: string, meta?: Record<string, unknown>) => {
    console.error(format('error', category, message, meta));
  },
};

export { sanitize };
