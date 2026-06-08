export class PlatformAdapterError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'PlatformAdapterError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}

export function unsupportedPlatform(platform) {
  return new PlatformAdapterError(
    'unsupported_platform',
    `No unified publish adapter exists for platform ${platform}`,
    { retryable: false },
  );
}
