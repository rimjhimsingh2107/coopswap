import { pool } from '../db/pool.js';
import { expireStaleRequests } from '../modules/bookings/service.js';
import type { Job } from './scheduler.js';

const deleted = async (sql: string) => (await pool.query(sql)).rowCount ?? 0;

export const jobs: Job[] = [
  { name: 'expire-booking-requests', everyMs: 60_000, run: () => expireStaleRequests() },
  {
    name: 'cleanup',
    everyMs: 15 * 60_000,
    run: async () =>
      (await deleted(`delete from sessions where expires_at < now()`)) +
      (await deleted(`delete from email_tokens where expires_at < now() - interval '1 day'`)) +
      (await deleted(`delete from idempotency_keys where created_at < now() - interval '24 hours'`)),
  },
];
