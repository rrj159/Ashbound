/**
 * Domain: Error types.
 * Normalized application errors for consistent handling.
 */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly isOperational: boolean = true,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class AIProviderError extends AppError {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly providerError?: unknown,
  ) {
    super(message, 'AI_PROVIDER_ERROR', 502);
  }
}

export class AIUnavailableError extends AppError {
  constructor(message = 'No AI providers available') {
    super(message, 'AI_UNAVAILABLE', 503);
  }
}

export class RateLimitError extends AppError {
  constructor(
    message = 'Rate limit exceeded',
    public readonly retryAfterMs: number = 30_000,
  ) {
    super(message, 'RATE_LIMITED', 429);
  }
}

export class PermissionError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 'PERMISSION_DENIED', 403);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class ToolDeniedError extends AppError {
  constructor(toolName: string) {
    super(`Tool '${toolName}' is not permitted`, 'TOOL_DENIED', 403);
  }
}

export class AttachmentError extends AppError {
  constructor(message: string) {
    super(message, 'ATTACHMENT_ERROR', 400);
  }
}

export class PersistenceError extends AppError {
  constructor(message: string, public readonly operation?: string) {
    super(message, 'PERSISTENCE_ERROR', 500);
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR', 500, false);
  }
}
