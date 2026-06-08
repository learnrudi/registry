import { timingSafeEqual } from '../../security/crypto-utils.js';

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function requireInternalApiKey(config) {
  return async (c, next) => {
    if (!config.internalApiKey) {
      return c.json({
        error: {
          code: 'api_auth_not_configured',
          message: 'Internal API authentication is not configured',
          request_id: c.get('requestId'),
        },
      }, 503);
    }

    const providedKey = c.req.header('x-internal-api-key');

    if (!providedKey || !safeCompare(providedKey, config.internalApiKey)) {
      return c.json({
        error: {
          code: 'unauthorized',
          message: 'Unauthorized',
          request_id: c.get('requestId'),
        },
      }, 401);
    }

    await next();
  };
}
