/**
 * Security: Secret Redactor.
 * Prevents accidental exposure of secrets in logs and outputs.
 */

const SENSITIVE_PATTERNS = [
  // API Keys
  /sk-[A-Za-z0-9_-]{20,}/g,           // OpenAI / Anthropic
  /sk-or-[A-Za-z0-9_-]{20,}/g,         // OpenRouter
  /xai-[A-Za-z0-9_-]{20,}/g,           // xAI
  /AIza[A-Za-z0-9_-]{20,}/g,           // Google
  /gsk_[A-Za-z0-9_-]{20,}/g,           // Groq
  /nbui_[A-Za-z0-9_-]{20,}/g,          // Cerebras
  /nvapi-[A-Za-z0-9_-]{20,}/g,         // NVIDIA
  /ghp_[A-Za-z0-9_-]{20,}/g,           // GitHub
  /ghu_[A-Za-z0-9_-]{20,}/g,           // GitHub
  /hf_[A-Za-z0-9_-]{20,}/g,            // Hugging Face
  /[A-Za-z0-9_-]{32,}\.([A-Za-z0-9_-]{32,})\.([A-Za-z0-9_-]{32,})/g, // JWT
  /Bearer\s+[A-Za-z0-9._-]+/gi,        // Bearer tokens
  // Discord tokens: base64-like segments separated by dots
  /[MN][A-Za-z0-9_-]{23,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}/g, // Discord bot tokens
  // FreeLLMAPI unified keys
  /freellmapi-[A-Za-z0-9_-]{20,}/g,    // FreeLLMAPI
  // Zhipu
  /[0-9]{10}\.[A-Za-z0-9_-]{20,}/g,    // Zhipu JWT-style
];

const SENSITIVE_KEYS = [
  'apiKey', 'api_key', 'token', 'authorization', 'password', 'secret',
  'DISCORD_TOKEN', 'CLIENT_SECRET',
  'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY',
  'MISTRAL_API_KEY', 'DEEPSEEK_API_KEY', 'OPENROUTER_API_KEY', 'XAI_API_KEY',
  'COHERE_API_KEY', 'FREELLMAPI_API_KEY', 'CEREBRAS_API_KEY', 'NVIDIA_API_KEY',
  'GITHUB_TOKEN', 'CLOUDFLARE_API_TOKEN', 'HF_TOKEN',
  'OPENCODEZEN_API_KEY', 'ZHIPU_API_KEY', 'CUSTOM_API_KEY',
];

export class SecretRedactor {
  /**
   * Redact secrets from a string.
   */
  static redactString(input: string): string {
    let result = input;
    for (const pattern of SENSITIVE_PATTERNS) {
      result = result.replace(pattern, '[REDACTED]');
    }
    return result;
  }

  /**
   * Redact secrets from an object.
   */
  static redactObject(input: unknown): unknown {
    if (typeof input === 'string') {
      return this.redactString(input);
    }

    if (input && typeof input === 'object') {
      if (Array.isArray(input)) {
        return input.map((item) => this.redactObject(item));
      }

      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        if (SENSITIVE_KEYS.some((sensitive) => key.toLowerCase().includes(sensitive.toLowerCase()))) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.redactObject(value);
        }
      }
      return sanitized;
    }

    return input;
  }

  /**
   * Check if a string contains any secrets.
   */
  static containsSecrets(input: string): boolean {
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(input)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get a list of detected secret types in a string.
   */
  static detectSecretTypes(input: string): string[] {
    const types: string[] = [];

    if (/sk-[A-Za-z0-9_-]{20,}/.test(input)) types.push('OpenAI/Anthropic API Key');
    if (/sk-or-[A-Za-z0-9_-]{20,}/.test(input)) types.push('OpenRouter API Key');
    if (/xai-[A-Za-z0-9_-]{20,}/.test(input)) types.push('xAI API Key');
    if (/AIza[A-Za-z0-9_-]{20,}/.test(input)) types.push('Google API Key');
    if (/gsk_[A-Za-z0-9_-]{20,}/.test(input)) types.push('Groq API Key');
    if (/Bearer\s+[A-Za-z0-9._-]+/i.test(input)) types.push('Bearer Token');

    return types;
  }
}
