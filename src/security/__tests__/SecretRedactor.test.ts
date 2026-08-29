import { SecretRedactor } from '../SecretRedactor';

describe('SecretRedactor', () => {
  describe('redactString', () => {
    it('should redact OpenAI API keys', () => {
      const input = 'API key: sk-1234567890abcdefghijklmnopqrstuvwxyz';
      const result = SecretRedactor.redactString(input);
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('sk-1234567890');
    });

    it('should redact Anthropic API keys', () => {
      const input = 'Key: sk-ant-1234567890abcdefghijklmnopqrstuvwxyz';
      const result = SecretRedactor.redactString(input);
      expect(result).toContain('[REDACTED]');
    });

    it('should redact Google API keys', () => {
      const input = 'Key: AIzaSyD1234567890abcdefghijklmnopqrstuv';
      const result = SecretRedactor.redactString(input);
      expect(result).toContain('[REDACTED]');
    });

    it('should redact Groq API keys', () => {
      const input = 'Key: gsk_1234567890abcdefghijklmnopqrstuvwxyz';
      const result = SecretRedactor.redactString(input);
      expect(result).toContain('[REDACTED]');
    });

    it('should not redact normal strings', () => {
      const input = 'Hello, this is a normal message';
      const result = SecretRedactor.redactString(input);
      expect(result).toBe(input);
    });
  });

  describe('redactObject', () => {
    it('should redact sensitive keys', () => {
      const input = { apiKey: 'secret-key', name: 'test' };
      const result = SecretRedactor.redactObject(input) as Record<string, unknown>;
      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.name).toBe('test');
    });

    it('should redact nested sensitive keys', () => {
      const input = {
        config: {
          token: 'secret-token',
          safe: 'value',
        },
      };
      const result = SecretRedactor.redactObject(input) as Record<string, unknown>;
      const config = result.config as Record<string, unknown>;
      expect(config.token).toBe('[REDACTED]');
      expect(config.safe).toBe('value');
    });

    it('should handle arrays', () => {
      const input = [{ apiKey: 'key1' }, { name: 'test' }];
      const result = SecretRedactor.redactObject(input) as Array<Record<string, unknown>>;
      expect(result[0].apiKey).toBe('[REDACTED]');
      expect(result[1].name).toBe('test');
    });
  });

  describe('containsSecrets', () => {
    it('should detect API keys', () => {
      expect(SecretRedactor.containsSecrets('sk-1234567890abcdefghijklmnopqrstuvwxyz')).toBe(true);
    });

    it('should not detect normal text', () => {
      expect(SecretRedactor.containsSecrets('Hello world')).toBe(false);
    });
  });

  describe('detectSecretTypes', () => {
    it('should identify OpenAI keys', () => {
      const types = SecretRedactor.detectSecretTypes('sk-1234567890abcdefghijklmnopqrstuvwxyz');
      expect(types).toContain('OpenAI/Anthropic API Key');
    });

    it('should return empty array for normal text', () => {
      const types = SecretRedactor.detectSecretTypes('Hello world');
      expect(types).toHaveLength(0);
    });
  });
});
