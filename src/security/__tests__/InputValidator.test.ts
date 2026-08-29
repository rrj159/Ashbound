import { InputValidator } from '../InputValidator';

describe('InputValidator', () => {
  describe('validateMessage', () => {
    it('should accept valid messages', () => {
      const result = InputValidator.validateMessage('Hello, how are you?');
      expect(result.valid).toBe(true);
    });

    it('should reject empty messages', () => {
      const result = InputValidator.validateMessage('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject messages exceeding max length', () => {
      const longMessage = 'a'.repeat(5000);
      const result = InputValidator.validateMessage(longMessage);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('length');
    });

    it('should accept messages at max length', () => {
      const maxMessage = 'a'.repeat(4000);
      const result = InputValidator.validateMessage(maxMessage);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateAttachment', () => {
    it('should accept valid text files', () => {
      const result = InputValidator.validateAttachment({
        contentType: 'text/plain',
        size: 1024,
        name: 'document.txt',
      });
      expect(result.valid).toBe(true);
    });

    it('should accept valid image files', () => {
      const result = InputValidator.validateAttachment({
        contentType: 'image/png',
        size: 1024 * 100,
        name: 'image.png',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject oversized files', () => {
      const result = InputValidator.validateAttachment({
        contentType: 'text/plain',
        size: 20 * 1024 * 1024, // 20MB
        name: 'large.txt',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too large');
    });

    it('should reject executable files', () => {
      const result = InputValidator.validateAttachment({
        contentType: 'application/x-msdownload',
        size: 1024,
        name: 'malware.exe',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not supported');
    });
  });

  describe('validateDuration', () => {
    it('should accept valid duration strings', () => {
      expect(InputValidator.validateDuration('30s').valid).toBe(true);
      expect(InputValidator.validateDuration('5m').valid).toBe(true);
      expect(InputValidator.validateDuration('2h').valid).toBe(true);
      expect(InputValidator.validateDuration('1d').valid).toBe(true);
    });

    it('should reject invalid duration formats', () => {
      expect(InputValidator.validateDuration('invalid').valid).toBe(false);
      expect(InputValidator.validateDuration('30').valid).toBe(false);
    });

    it('should reject durations too short', () => {
      const result = InputValidator.validateDuration('0.5s');
      expect(result.valid).toBe(false);
    });

    it('should reject durations too long', () => {
      const result = InputValidator.validateDuration('30d');
      expect(result.valid).toBe(false);
    });
  });

  describe('sanitizeForDisplay', () => {
    it('should escape HTML characters', () => {
      const result = InputValidator.sanitizeForDisplay('<script>alert("xss")</script>');
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });
  });
});
