import { Router } from 'express';
import type { HealthStatus } from '@coopswap/shared';
import { pool } from '../../db/pool.js';
import { redis } from '../../lib/redis.js';

const startedAt = Date.now();

async function check(fn: () => Promise<unknown>): Promise<'up' | 'down'> {
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
    ]);
    return 'up';
  } catch {
    return 'down';
  }
}

export const healthRouter = Router();

// liveness: process is up. don't touch dependencies here or k8s/ecs will restart
// us every time postgres blips.
healthRouter.get('/healthz', (_req, res) => {
  res.json({ data: { status: 'ok' } });
});

healthRouter.get('/readyz', async (_req, res) => {
  const [postgres, redisStatus] = await Promise.all([
    check(() => pool.query('select 1')),
    check(() => redis.ping()),
  ]);
  const body: HealthStatus = {
    status: postgres === 'up' && redisStatus === 'up' ? 'ok' : 'degraded',
    version: process.env.APP_VERSION ?? 'dev',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    checks: { postgres, redis: redisStatus },
  };
  res.status(postgres === 'up' ? 200 : 503).json({ data: body });
});
