import { pool } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { metrics } from '../lib/metrics.js';

// Tiny periodic job runner. Every instance runs the timers, but each tick grabs
// a postgres advisory lock first so only one instance does the work. If that
// instance dies the lock goes with its connection and someone else picks it up
// next tick. No redis, no extra queue service.

export interface Job {
  name: string;
  everyMs: number;
  run: () => Promise<number | void>;
}

const timers: NodeJS.Timeout[] = [];

async function tick(job: Job) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ ok: boolean }>('select pg_try_advisory_lock(hashtext($1)) as ok', [`job:${job.name}`]);
    if (!rows[0]?.ok) return;
    const end = metrics.jobDuration.startTimer({ job: job.name });
    try {
      const n = await job.run();
      end({ outcome: 'ok' });
      if (n) logger.info({ job: job.name, n }, 'job did work');
    } catch (err) {
      end({ outcome: 'error' });
      metrics.jobFailures.inc({ job: job.name });
      logger.error({ err, job: job.name }, 'job failed');
    } finally {
      await client.query('select pg_advisory_unlock(hashtext($1))', [`job:${job.name}`]);
    }
  } finally {
    client.release();
  }
}

export function startJobs(jobs: Job[]) {
  for (const job of jobs) {
    // stagger so instances that boot together don't all fire at once
    const t = setInterval(() => void tick(job).catch((err) => logger.error({ err }, 'job tick failed')), job.everyMs);
    t.unref();
    timers.push(t);
  }
}

export function stopJobs() {
  for (const t of timers) clearInterval(t);
  timers.length = 0;
}
