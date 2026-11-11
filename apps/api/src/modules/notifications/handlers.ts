import { and, eq, sql } from 'drizzle-orm';
import { describeNotification, type AppNotification } from '@coopswap/shared';
import { env } from '../../config/env.js';
import { db } from '../../db/pool.js';
import { conversationParticipants, notifications, userSettings, users } from '../../db/schema.js';
import { sendMail } from '../../lib/mailer.js';
import { emitToUser, emitToUsers } from '../../realtime/io.js';
import { onOutbox } from './outbox.js';
import { toApi, unreadNotificationCount } from './service.js';

onOutbox('notification.created', async (p) => {
  const [row] = await db.select().from(notifications).where(eq(notifications.id, String(p.notificationId)));
  if (!row) return; // user deleted in the meantime
  const userId = String(p.userId);
  emitToUser(userId, 'notification', toApi(row));
  const [msgs] = (
    await db.execute<{ n: number }>(sql`
      select coalesce(sum(c.last_seq - cp.last_read_seq), 0)::int as n
      from conversation_participants cp join conversations c on c.id = cp.conversation_id where cp.user_id = ${userId}`)
  ).rows;
  emitToUser(userId, 'unread', { messages: msgs?.n ?? 0, notifications: await unreadNotificationCount(userId) });
});

onOutbox('booking.updated', async (p) => {
  emitToUsers(p.userIds as string[], 'booking:updated', {
    id: String(p.bookingId),
    status: String(p.status),
    listingId: String(p.listingId),
  });
});

onOutbox('email.send', async (p) => {
  const [u] = await db
    .select({ email: users.email, deletedAt: users.deletedAt, verified: users.emailVerifiedAt, s: userSettings })
    .from(users)
    .innerJoin(userSettings, eq(userSettings.userId, users.id))
    .where(eq(users.id, String(p.userId)));
  if (!u || u.deletedAt || !u.verified) return;
  if (p.kind === 'booking' && !u.s.emailOnBooking) return;
  if (p.kind === 'message') {
    if (!u.s.emailOnMessage) return;
    // only email if they still haven't read it by the time this fires
    const [cp] = await db
      .select({ read: conversationParticipants.lastReadSeq })
      .from(conversationParticipants)
      .where(and(eq(conversationParticipants.conversationId, String(p.conversationId)), eq(conversationParticipants.userId, String(p.userId))));
    if (!cp || cp.read >= Number(p.seq)) return;
  }
  const text = describeNotification({ type: p.type, payload: p.payload, id: '', readAt: null, createdAt: '' } as AppNotification);
  await sendMail({
    to: u.email,
    subject: `CoopSwap: ${text.length > 60 ? `${text.slice(0, 57)}...` : text}`,
    text: `${text}\n\nOpen CoopSwap: ${env.WEB_ORIGIN}\n\nYou can turn these emails off in Settings.`,
  });
});
