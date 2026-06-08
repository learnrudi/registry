import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import { getDatabasePool } from '../db/pool.js';
import { randomUUID } from '../security/crypto-utils.js';
import { requireInternalApiKey } from './middleware/internal-auth.js';
import { registerAssetRoutes } from './routes/assets.js';
import { registerMediaRoutes } from './routes/media.js';
import { registerPostRoutes } from './routes/posts.js';

const MAX_REQUEST_BODY_BYTES = 1_048_576;
const REQUEST_ID_MAX_LENGTH = 128;

function createErrorResponse({ code, message, requestId, details }) {
  return {
    error: {
      code,
      message,
      request_id: requestId,
      ...(details ? { details } : {}),
    },
  };
}

function getRequestId(c) {
  return c.get('requestId') ?? randomUUID();
}

export function createApp(config) {
  const app = new Hono();

  app.use('*', async (c, next) => {
    const headerRequestId = c.req.header('x-request-id');
    const requestId = headerRequestId && headerRequestId.length <= REQUEST_ID_MAX_LENGTH
      ? headerRequestId
      : randomUUID();
    c.set('requestId', requestId);
    c.header('x-request-id', requestId);
    await next();
  });

  app.use('*', bodyLimit({
    maxSize: MAX_REQUEST_BODY_BYTES,
    onError: (c) => c.json(createErrorResponse({
      code: 'payload_too_large',
      message: 'Request body exceeds the 1 MB limit',
      requestId: getRequestId(c),
    }), 413),
  }));

  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      service: config.serviceName,
      environment: config.nodeEnv,
      request_id: getRequestId(c),
      time: new Date().toISOString(),
    }, 200);
  });

  app.get('/ready', async (c) => {
    const pool = getDatabasePool(config);
    await pool.query('select 1 as ok');

    return c.json({
      status: 'ready',
      request_id: getRequestId(c),
    }, 200);
  });

  app.use('/v1/*', requireInternalApiKey(config));
  registerAssetRoutes(app, config);
  registerMediaRoutes(app, config);
  registerPostRoutes(app, config);

  app.notFound((c) => {
    return c.json(createErrorResponse({
      code: 'not_found',
      message: 'Endpoint not found',
      requestId: getRequestId(c),
    }), 404);
  });

  app.onError((error, c) => {
    const statusCode = Number.isInteger(error.status) ? error.status : 500;
    const publicCode = statusCode >= 500 ? 'internal_error' : (error.code ?? 'request_error');
    const publicMessage = statusCode >= 500 ? 'Internal server error' : error.message;
    const requestId = getRequestId(c);

    if (statusCode >= 500) {
      console.error(JSON.stringify({
        level: 'error',
        event: 'http_request_failed',
        request_id: requestId,
        method: c.req.method,
        path: c.req.path,
        message: error.message,
        stack: error.stack,
      }));
    }

    return c.json(createErrorResponse({
      code: publicCode,
      message: publicMessage,
      requestId,
      details: error.details,
    }), statusCode);
  });

  return app;
}
