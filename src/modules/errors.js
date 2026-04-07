export class AppError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code || 'APP_ERROR';
    this.details = options.details;
    this.cause = options.cause;
  }
}

export class ConfigError extends AppError {
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code || 'CONFIG_ERROR' });
  }
}

export class GitCollectorError extends AppError {
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code || 'GIT_COLLECTOR_ERROR' });
  }
}

export class ProviderError extends AppError {
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code || 'PROVIDER_ERROR' });
  }
}

export class ReviewOutputError extends AppError {
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code || 'REVIEW_OUTPUT_ERROR' });
  }
}

export class NotificationError extends AppError {
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code || 'NOTIFICATION_ERROR' });
  }
}
