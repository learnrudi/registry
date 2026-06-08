export class AppError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? 400;
    this.details = options.details;
    this.retryable = options.retryable;
  }
}

export function badRequest(code, message, details) {
  return new AppError(code, message, { status: 400, details });
}

export function notFound(code, message, details) {
  return new AppError(code, message, { status: 404, details });
}

export function conflict(code, message, details) {
  return new AppError(code, message, { status: 409, details });
}

export function serviceUnavailable(code, message, details) {
  return new AppError(code, message, { status: 503, details });
}
