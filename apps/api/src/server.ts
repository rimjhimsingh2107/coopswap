import { createServer } from 'node:http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { createApp } from './app.js';
import { pool } from './db/pool.js';
import { redis } from './lib/redis.js';
import { startJobs, stopJobs } from './jobs/scheduler.js';
import { jobs } from './jobs/index.js';
import { attachRealtime } from './realtime/server.js';

const app = createApp();
const server = createServer(app);
const realtime = attachRealtime(server);

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'api listening');
});

if (process.env.DISABLE_JOBS !== '1') startJobs(jobs);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  stopJobs();
  await realtime.close().catch(() => {});
  server.close();
  await Promise.allSettled([pool.end(), redis.quit()]);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
