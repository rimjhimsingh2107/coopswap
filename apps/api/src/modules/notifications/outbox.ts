import { sql } from 'drizzle-orm';
import { db } from '../../db/pool.js';
import { outboxEvents } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';
import { metrics } from '../../lib/metrics.js';
import type { Tx } from '../users/deletion-hooks.js';

type Handler = (payload: Record<string, unknown>) => Promise<void>;
const handlers = new Map<string, Handler>();

export const MAX_ATTEMPTS = 10;
const LEASE_SECONDS = 30;

export function onOutbox(topic: string, handler: Handler) {
  handlers.set(topic, handler);
}

export async function enqueue(tx: Tx, topic: string, payload: Record<string, unknown>, delayMs = 0) {
  await tx.insert(outboxEvents).values({
    topic,
    payload,
    availableAt: delayMs ? new Date(Date.now() + delayMs) : undefined,
  });
}

type Claimed = {
  id: number;
  topic: string;
  payload: Record<string, unknown>;
  attempts: number;
};

/**
 * Claim a batch with a short lease, run handlers outside any transaction, then
 * mark each row done or schedule a retry. SKIP LOCKED + the lease means any
 * number of instances can run this at once without double processing a row,
 * and a row claimed by an instance that then crashed becomes available again
 * once its lease runs out.
 */
export async function drainOutbox(batch = 50): Promise<number> {
  const claimed = await db.execute<Claimed>(sql`
    update outbox_events set locked_until = now() + make_interval(secs => ${LEASE_SECONDS}), attempts = attempts + 1
    where id in (
      select id from outbox_events
      where published_at is null and available_at <= now()
        and (locked_until is null or locked_until < now())
        and attempts < ${MAX_ATTEMPTS}
      order by available_at, id
      limit ${batch}
      for update skip locked
    )
    returning id, topic, payload, attempts
  `);

  for (const ev of claimed.rows) {
    const handler = handlers.get(ev.topic);
    try {
      if (!handler) throw new Error(`no handler for ${ev.topic}`);
      await handler(ev.payload);
      await db.execute(sql`update outbox_events set published_at = now(), locked_until = null where id = ${ev.id}`);
      metrics.outboxProcessed.inc({ topic: ev.topic, outcome: 'ok' });
    } catch (err) {
      const backoffSec = Math.min(3600, 2 ** ev.attempts);
      await db.execute(sql`
        update outbox_events
        set locked_until = null, available_at = now() + make_interval(secs => ${backoffSec}), last_error = ${String((err as Error).message).slice(0, 500)}
        where id = ${ev.id}
      `);
      metrics.outboxProcessed.inc({ topic: ev.topic, outcome: ev.attempts >= MAX_ATTEMPTS ? 'dead' : 'retry' });
      logger.warn({ topic: ev.topic, attempts: ev.attempts, err: (err as Error).message }, 'outbox handler failed');
    }
  }
  return claimed.rows.length;
}

let running = false;
let timer: NodeJS.Timeout | null = null;

export function startOutboxRelay(intervalMs = 500) {
  const loop = async () => {
    if (running) return;
    running = true;
    try {
      // keep going while there's a backlog, then go back to polling
      while ((await drainOutbox()) > 0) {
        /* drain */
      }
      const pending = await db.execute<{ n: number }>(
        sql`select count(*)::int as n from outbox_events where published_at is null and attempts < ${MAX_ATTEMPTS}`,
      );
      metrics.outboxBacklog.set(pending.rows[0]?.n ?? 0);
    } catch (err) {
      logger.error({ err }, 'outbox relay loop failed');
    } finally {
      running = false;
    }
  };
  timer = setInterval(() => void loop(), intervalMs);
  timer.unref();
}

export function stopOutboxRelay() {
  if (timer) clearInterval(timer);
  timer = null;
}
