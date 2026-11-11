import pino from 'pino';
import { trace } from '@opentelemetry/api';
import { currentRequestId } from './context.js';
import { env, isProd } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { instance: env.INSTANCE_ID },
  // every line carries the request id and, when tracing is on, the trace id,
  // so logs and traces can be joined up
  mixin() {
    const span = trace.getActiveSpan()?.spanContext();
    const requestId = currentRequestId();
    return { ...(requestId ? { requestId } : {}), ...(span ? { traceId: span.traceId, spanId: span.spanId } : {}) };
  },
  redact: {
    // belt and braces, we try not to log these in the first place
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      '*.password',
      '*.email',
      '*.token',
    ],
    censor: '[redacted]',
  },
  transport: isProd || env.NODE_ENV === 'test' ? undefined : { target: 'pino-pretty' },
});
