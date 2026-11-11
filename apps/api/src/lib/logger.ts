import pino from 'pino';
import { env, isProd } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { instance: env.INSTANCE_ID },
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
