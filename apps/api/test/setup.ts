import { afterAll, beforeEach } from 'vitest';
import { pool } from '../src/db/pool.js';
import { redis } from '../src/lib/redis.js';
import { resetDb } from './helpers/db.js';

beforeEach(async () => {
  await resetDb();
  await redis.flushdb();
});

afterAll(async () => {
  await pool.end();
  redis.disconnect();
});
