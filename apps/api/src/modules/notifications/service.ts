import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { AppNotification, NotificationType } from '@coopswap/shared';
import { db } from '../../db/pool.js';
import { notifications } from '../../db/schema.js';
import { badRequest } from '../../lib/errors.js';
import type { Tx } from '../users/deletion-hooks.js';
import { enqueue } from './outbox.js';

type Row = typeof notifications.$inferSelect;

export const toApi = (n: Row): AppNotification => ({
  id: n.id,
  type: n.type as NotificationType,
  payload: n.payload as AppNotification['payload'],
  readAt: n.readAt?.toISOString() ?? null,
  createdAt: n.createdAt.toISOString(),
});

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  payload: AppNotification['payload'];
  dedupeKey?: string;
  // when set, also queue an email (subject to the user's settings)
  email?: { kind: 'booking' | 'message'; delayMs?: number; check?: Record<string, unknown> };
}

// Must be called inside the transaction that caused it.
export async function notify(tx: Tx, n: NotifyInput) {
  let row: Row | undefined;
  if (n.dedupeKey) {
    const res = await tx.execute<Row>(sql`
      insert into notifications (user_id, type, payload, dedupe_key)
      values (${n.userId}, ${n.type}, ${JSON.stringify({ ...n.payload, count: 1 })}::jsonb, ${n.dedupeKey})
      on conflict (user_id, dedupe_key) where read_at is null and dedupe_key is not null
      do update set
        payload = excluded.payload || jsonb_build_object('count', coalesce((notifications.payload->>'count')::int, 1) + 1),
        created_at = now()
      returning id
    `);
    row = res.rows[0];
  } else {
    [row] = await tx.insert(notifications).values({ userId: n.userId, type: n.type, payload: n.payload }).returning();
  }
  await enqueue(tx, 'notification.created', { notificationId: row!.id, userId: n.userId });
  if (n.email) {
    await enqueue(
      tx,
      'email.send',
      { kind: n.email.kind, userId: n.userId, type: n.type, payload: n.payload, ...n.email.check },
      n.email.delayMs,
    );
  }
}

export async function listNotifications(userId: string, cursor?: string, limit = 20) {
  const where = [eq(notifications.userId, userId)];
  if (cursor) {
    const [at, id] = Buffer.from(cursor, 'base64url').toString().split('|');
    if (!at || !id) throw badRequest('invalid cursor');
    where.push(or(lt(notifications.createdAt, new Date(at)), and(eq(notifications.createdAt, new Date(at)), lt(notifications.id, id)))!);
  }
  const rows = await db
    .select()
    .from(notifications)
    .where(and(...where))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = rows.length > limit ? page.at(-1) : undefined;
  return {
    items: page.map(toApi),
    nextCursor: last ? Buffer.from(`${last.createdAt.toISOString()}|${last.id}`).toString('base64url') : null,
  };
}

export async function markNotificationRead(userId: string, id: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId), isNull(notifications.readAt)));
}

export async function markAllRead(userId: string) {
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

export async function markConversationNotificationsRead(userId: string, conversationId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), eq(notifications.dedupeKey, `conv:${conversationId}`), isNull(notifications.readAt)));
}

export async function unreadNotificationCount(userId: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return r?.n ?? 0;
}
