import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export function createRedis(name: string) {
  const client = new Redis(env.REDIS_URL, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    connectionName: `${env.INSTANCE_ID}:${name}`,
  });
  client.on('error', (err) => logger.warn({ err: err.message, name }, 'redis error'));
  return client;
}

export const redis = createRedis('main');
