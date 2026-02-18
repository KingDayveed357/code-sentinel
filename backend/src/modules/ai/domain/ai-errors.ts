export enum AiErrorCode {
  ProviderUnavailable = "provider_unavailable",
  RateLimited = "rate_limited",
  Timeout = "timeout",
  InvalidResponse = "invalid_response",
  ValidationFailed = "validation_failed",
  QueueUnavailable = "queue_unavailable",
  CacheUnavailable = "cache_unavailable",
  PersistenceFailed = "persistence_failed",
  Unknown = "unknown",
}

export interface AiError {
  code: AiErrorCode;
  message: string;
  retryable: boolean;
  provider?: string;
  details?: Record<string, unknown>;
}

export interface AiProviderErrorOptions {
  code: AiErrorCode;
  message: string;
  retryable: boolean;
  provider: string;
  statusCode?: number;
  details?: Record<string, unknown>;
}

export class AiProviderError extends Error implements AiError {
  readonly code: AiErrorCode;
  readonly retryable: boolean;
  readonly provider?: string;
  readonly details?: Record<string, unknown>;
  readonly statusCode?: number;

  constructor(options: AiProviderErrorOptions) {
    super(options.message);
    this.name = "AiProviderError";
    this.code = options.code;
    this.retryable = options.retryable;
    this.provider = options.provider;
    this.details = options.details;
    this.statusCode = options.statusCode;
  }
}

export class AiValidationError extends Error implements AiError {
  readonly code = AiErrorCode.ValidationFailed;
  readonly retryable = false;
  readonly provider?: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, provider?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AiValidationError";
    this.provider = provider;
    this.details = details;
  }
}

export function isRetryableProviderStatus(statusCode: number): boolean {
  return statusCode === 429 || (statusCode >= 500 && statusCode <= 599);
}
