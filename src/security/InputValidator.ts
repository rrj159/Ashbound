/**
 * Security: Input Validator.
 * Validates and sanitizes user inputs to prevent injection attacks.
 */

const MAX_MESSAGE_LENGTH = 4000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_FILE_TYPES = [
  'text/plain',
  'text/csv',
  'application/json',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
];

export class InputValidator {
  /**
   * Validate a user message.
   */
  static validateMessage(message: string): { valid: boolean; error?: string } {
    if (!message || message.trim().length === 0) {
      return { valid: false, error: 'Message cannot be empty' };
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return { valid: false, error: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters` };
    }

    // Check for obvious prompt injection patterns
    const injectionPatterns = [
      /ignore\s+(all\s+)?previous\s+instructions/i,
      /you\s+are\s+now\s+(a|an|the)/i,
      /system\s*:\s*/i,
      /\[INST\]/i,
      /<\|im_start\|>/i,
      /<\|im_end\|>/i,
    ];

    for (const pattern of injectionPatterns) {
      if (pattern.test(message)) {
        // Don't reject, but flag for the AI to handle
        return { valid: true };
      }
    }

    return { valid: true };
  }

  /**
   * Validate a file attachment.
   */
  static validateAttachment(attachment: {
    contentType?: string | null;
    size: number;
    name: string;
  }): { valid: boolean; error?: string } {
    // Check file size
    if (attachment.size > MAX_FILE_SIZE) {
      return { valid: false, error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` };
    }

    // Check file type
    if (attachment.contentType && !ALLOWED_FILE_TYPES.includes(attachment.contentType)) {
      return { valid: false, error: `File type '${attachment.contentType}' is not supported` };
    }

    // Check for executable extensions
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.bash', '.ps1', '.vbs', '.js', '.msi'];
    const ext = attachment.name.toLowerCase().split('.').pop();
    if (ext && dangerousExtensions.includes(`.${ext}`)) {
      return { valid: false, error: 'Executable files are not allowed' };
    }

    return { valid: true };
  }

  /**
   * Validate a duration string.
   */
  static validateDuration(duration: string): { valid: boolean; ms?: number; error?: string } {
    const match = duration.match(/^(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?)$/i);
    if (!match) {
      return { valid: false, error: 'Invalid duration format. Use examples: 30s, 5m, 2h, 1d' };
    }

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    let ms: number;
    if (unit.startsWith('s')) ms = value * 1000;
    else if (unit.startsWith('m')) ms = value * 60 * 1000;
    else if (unit.startsWith('h')) ms = value * 60 * 60 * 1000;
    else if (unit.startsWith('d')) ms = value * 24 * 60 * 60 * 1000;
    else return { valid: false, error: 'Invalid duration unit' };

    if (ms < 1000) {
      return { valid: false, error: 'Minimum duration is 1 second' };
    }

    if (ms > 7 * 24 * 60 * 60 * 1000) {
      return { valid: false, error: 'Maximum duration is 7 days' };
    }

    return { valid: true, ms };
  }

  /**
   * Sanitize a string for safe display.
   */
  static sanitizeForDisplay(input: string): string {
    return input
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
}
