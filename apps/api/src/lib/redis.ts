import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { metrics } from './metrics.js';

export function createRedis(name: string) {
  const client = new Redis(env.REDIS_URL, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    connectionName: `${env.INSTANCE_ID}:${name}`,
  });
  client.on('error', (err) => {
    metrics.redisErrors.inc({ client: name });
    logger.warn({ err: err.message, name }, 'redis error');
  });
  return client;
}

export const redis = createRedis('main');
