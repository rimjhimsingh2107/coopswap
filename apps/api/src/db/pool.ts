import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { metrics } from '../lib/metrics.js';
import * as schema from './schema.js';

// return DATE columns as plain 'YYYY-MM-DD' strings instead of JS Dates in local tz
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
// bigint counters fit in a number for anything we store
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: env.INSTANCE_ID,
});

pool.on('error', (err) => {
  logger.error({ err }, 'idle pg client error');
});

export const db = drizzle(pool, { schema });

// sampled on scrape-ish cadence; cheap, it's just counters on the pool object
setInterval(() => {
  metrics.dbPool.set({ state: 'total' }, pool.totalCount);
  metrics.dbPool.set({ state: 'idle' }, pool.idleCount);
  metrics.dbPool.set({ state: 'waiting' }, pool.waitingCount);
}, 5000).unref();
export type Db = typeof db;
