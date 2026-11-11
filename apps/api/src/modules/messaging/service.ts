import { and, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import type { ConversationSummary, Message, SessionUser } from '@coopswap/shared';
import { db } from '../../db/pool.js';
import { conversationParticipants, conversations, listingImages, listings, messages, profiles } from '../../db/schema.js';
import { withTx } from '../../db/tx.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { metrics } from '../../lib/metrics.js';
import { storage } from '../../lib/storage.js';
import { emitToUser, emitToUsers } from '../../realtime/io.js';
import { markConversationNotificationsRead, notify, unreadNotificationCount } from '../notifications/service.js';

type MessageRow = typeof messages.$inferSelect;

const toMessage = (m: MessageRow): Message => ({
  id: m.id,
  conversationId: m.conversationId,
  seq: m.seq,
  senderId: m.senderId,
  body: m.body,
  clientId: m.clientId,
  createdAt: m.createdAt.toISOString(),
});

const pairKey = (a: string, b: string) => [a, b].sort().join(':');

export async function participantsOf(conversationId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.conversationId, conversationId));
  return rows.map((r) => r.userId);
}

// throws the same 404 whether the conversation is missing or just not yours
export async function assertParticipant(conversationId: string, userId: string) {
  const [row] = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, userId)));
  if (!row) throw notFound('conversation');
}

export async function startConversation(user: SessionUser, listingId: string) {
  const [listing] = await db
    .select({ id: listings.id, ownerId: listings.ownerId, status: listings.status })
    .from(listings)
    .where(eq(listings.id, listingId));
  if (!listing || listing.status === 'draft') throw notFound('listing');
  if (listing.ownerId === user.id) throw badRequest("that's your own listing");

  const key = pairKey(user.id, listing.ownerId);
  return withTx('conversation_start', async (tx) => {
    const inserted = await tx
      .insert(conversations)
      .values({ listingId, pairKey: key })
      .onConflictDoNothing()
      .returning({ id: conversations.id });
    if (inserted[0]) {
      await tx.insert(conversationParticipants).values([
        { conversationId: inserted[0].id, userId: user.id },
        { conversationId: inserted[0].id, userId: listing.ownerId },
      ]);
      return { id: inserted[0].id, created: true };
    }
    const [existing] = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.listingId, listingId), eq(conversations.pairKey, key)));
    return { id: existing!.id, created: false };
  });
}

class DuplicateSend extends Error {}

export async function sendMessage(user: SessionUser, conversationId: string, body: string, clientId: string) {
  await assertParticipant(conversationId, user.id);

  const findExisting = async () => {
    const [m] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.senderId, user.id), eq(messages.clientId, clientId)));
    return m;
  };

  // a retry of a message we already have: hand back the original
  const dup = await findExisting();
  if (dup) return { message: toMessage(dup), duplicate: true };

  let row: MessageRow;
  try {
    row = await withTx('message_send', async (tx) => {
      // bumping last_seq takes the conversation row lock, which is what
      // serialises sends and makes seq gapless
      const [conv] = await tx
        .update(conversations)
        .set({ lastSeq: sql`${conversations.lastSeq} + 1`, lastMessageAt: new Date() })
        .where(eq(conversations.id, conversationId))
        .returning({ seq: conversations.lastSeq });
      const inserted = await tx
        .insert(messages)
        .values({ conversationId, seq: conv!.seq, senderId: user.id, body, clientId })
        .onConflictDoNothing()
        .returning();
      // the same clientId raced us and won. roll back the seq bump
      if (!inserted[0]) throw new DuplicateSend();
      await tx
        .update(conversationParticipants)
        .set({ lastReadSeq: conv!.seq, lastDeliveredSeq: conv!.seq })
        .where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, user.id)));

      // one collapsing "new messages" notification per conversation, plus an
      // email a few minutes later if it's still unread then
      const recipients = await tx
        .select({ userId: conversationParticipants.userId })
        .from(conversationParticipants)
        .where(and(eq(conversationParticipants.conversationId, conversationId), sql`${conversationParticipants.userId} <> ${user.id}`));
      for (const r of recipients) {
        await notify(tx, {
          userId: r.userId,
          type: 'message.new',
          payload: { conversationId, actorName: user.displayName },
          dedupeKey: `conv:${conversationId}`,
          email: { kind: 'message', delayMs: 5 * 60_000, check: { conversationId, seq: conv!.seq } },
        });
      }
      return inserted[0];
    });
  } catch (err) {
    if (err instanceof DuplicateSend) {
      const m = await findExisting();
      if (m) return { message: toMessage(m), duplicate: true };
    }
    throw err;
  }

  metrics.messagesSent.inc();
  const msg = toMessage(row);
  // after commit. if this doesn't reach someone (offline, redis hiccup) they
  // pick it up from history next time they look
  const people = await participantsOf(conversationId);
  emitToUsers(people, 'message:new', msg);
  return { message: msg, duplicate: false };
}

export async function getMessages(user: SessionUser, conversationId: string, q: { before?: number; after?: number; limit: number }) {
  await assertParticipant(conversationId, user.id);
  const where = [eq(messages.conversationId, conversationId)];
  if (q.before !== undefined) where.push(lt(messages.seq, q.before));
  if (q.after !== undefined) where.push(gt(messages.seq, q.after));

  // catching up goes oldest first, scrolling back goes newest first
  const forward = q.after !== undefined;
  const rows = await db
    .select()
    .from(messages)
    .where(and(...where))
    .orderBy(forward ? messages.seq : desc(messages.seq))
    .limit(q.limit + 1);

  const hasMore = rows.length > q.limit;
  const page = rows.slice(0, q.limit);
  if (!forward) page.reverse();
  const items = page.map(toMessage);

  // whatever we just handed the client counts as delivered
  const maxSeq = items.at(-1)?.seq;
  if (maxSeq) await markDelivered(user.id, conversationId, maxSeq);

  return { items, hasMore };
}

async function updateCursor(userId: string, conversationId: string, field: 'read' | 'delivered', seq: number) {
  // clamp to what exists so a client can't claim to have read the future,
  // and never move backwards (greatest), so out of order acks are harmless
  const res = await db.execute<{ last_read_seq: number; last_delivered_seq: number; changed: boolean }>(sql`
    with c as (select last_seq from conversations where id = ${conversationId}),
    old as (
      select last_read_seq, last_delivered_seq from conversation_participants
      where conversation_id = ${conversationId} and user_id = ${userId}
    )
    update conversation_participants p set
      last_delivered_seq = greatest(p.last_delivered_seq, least(${seq}, (select last_seq from c))),
      last_read_seq = ${
        field === 'read'
          ? sql`greatest(p.last_read_seq, least(${seq}, (select last_seq from c)))`
          : sql`p.last_read_seq`
      }
    where p.conversation_id = ${conversationId} and p.user_id = ${userId}
    returning p.last_read_seq, p.last_delivered_seq,
      (p.last_read_seq, p.last_delivered_seq) is distinct from (select (last_read_seq, last_delivered_seq) from old) as changed
  `);
  const row = res.rows[0];
  if (!row) throw notFound('conversation');
  if (row.changed) {
    const people = await participantsOf(conversationId);
    emitToUsers(people, 'receipt', {
      conversationId,
      userId,
      deliveredSeq: Number(row.last_delivered_seq),
      readSeq: Number(row.last_read_seq),
    });
  }
  return { readSeq: Number(row.last_read_seq), deliveredSeq: Number(row.last_delivered_seq), changed: row.changed };
}

export async function markRead(userId: string, conversationId: string, seq: number) {
  const r = await updateCursor(userId, conversationId, 'read', seq);
  if (r.changed) {
    const [cp] = await db
      .select({ read: conversationParticipants.lastReadSeq })
      .from(conversationParticipants)
      .innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId))
      .where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, userId), sql`${conversationParticipants.lastReadSeq} >= ${conversations.lastSeq}`));
    // caught up on this conversation, so the "new messages" item is done
    if (cp) await markConversationNotificationsRead(userId, conversationId);
    emitToUser(userId, 'unread', await unreadCounts(userId));
  }
  return r;
}

export async function markDelivered(userId: string, conversationId: string, seq: number) {
  const r = await updateCursor(userId, conversationId, 'delivered', seq);
  return r;
}

export async function recordDeliveryLatency(conversationId: string, seq: number) {
  const [m] = await db
    .select({ createdAt: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.seq, seq)));
  if (m) metrics.messageDeliveryLatency.observe((Date.now() - m.createdAt.getTime()) / 1000);
}

export async function unreadCounts(userId: string) {
  const res = await db.execute<{ messages: number }>(sql`
    select coalesce(sum(c.last_seq - p.last_read_seq), 0)::int as messages
    from conversation_participants p join conversations c on c.id = p.conversation_id
    where p.user_id = ${userId}
  `);
  return { messages: res.rows[0]?.messages ?? 0, notifications: await unreadNotificationCount(userId) };
}

export async function listConversations(
  userId: string,
  cursor?: string,
  limit = 30,
  onlyId?: string,
): Promise<{ items: ConversationSummary[]; nextCursor: string | null }> {
  let after = onlyId ? sql`and c.id = ${onlyId}` : sql``;
  if (cursor) {
    const [at, id] = Buffer.from(cursor, 'base64url').toString().split('|');
    if (!at || !id) throw badRequest('invalid cursor');
    after = sql`and (coalesce(c.last_message_at, c.created_at), c.id) < (${at}::timestamptz, ${id}::uuid)`;
  }
  const res = await db.execute<{
    id: string;
    listing_id: string;
    last_seq: number;
    sort_at: string;
    last_message_at: Date | null;
    my_read: number;
    other_id: string;
    other_read: number;
    other_delivered: number;
  }>(sql`
    select c.id, c.listing_id, c.last_seq, c.last_message_at,
           coalesce(c.last_message_at, c.created_at)::text as sort_at,
           me.last_read_seq as my_read,
           o.user_id as other_id, o.last_read_seq as other_read, o.last_delivered_seq as other_delivered
    from conversation_participants me
    join conversations c on c.id = me.conversation_id
    join conversation_participants o on o.conversation_id = c.id and o.user_id <> me.user_id
    where me.user_id = ${userId} ${after}
    order by coalesce(c.last_message_at, c.created_at) desc, c.id desc
    limit ${limit + 1}
  `);
  const rows = res.rows.slice(0, limit);
  if (!rows.length) return { items: [], nextCursor: null };

  const convIds = rows.map((r) => r.id);
  const [lastMsgs, ls, names, covers] = await Promise.all([
    db
      .selectDistinctOn([messages.conversationId])
      .from(messages)
      .where(inArray(messages.conversationId, convIds))
      .orderBy(messages.conversationId, desc(messages.seq)),
    db
      .select({ id: listings.id, title: listings.title, city: listings.city })
      .from(listings)
      .where(inArray(listings.id, rows.map((r) => r.listing_id))),
    db
      .select({ id: profiles.userId, name: profiles.displayName })
      .from(profiles)
      .where(inArray(profiles.userId, rows.map((r) => r.other_id))),
    db
      .selectDistinctOn([listingImages.listingId], { listingId: listingImages.listingId, key: listingImages.storageKey })
      .from(listingImages)
      .where(inArray(listingImages.listingId, rows.map((r) => r.listing_id)))
      .orderBy(listingImages.listingId, listingImages.position),
  ]);
  const lastBy = new Map(lastMsgs.map((m) => [m.conversationId, m]));
  const listingBy = new Map(ls.map((l) => [l.id, l]));
  const nameBy = new Map(names.map((n) => [n.id, n.name]));
  const coverBy = new Map(await Promise.all(covers.map(async (c) => [c.listingId, await storage.signedUrl(c.key)] as const)));

  const items = rows.map((r): ConversationSummary => {
    const last = lastBy.get(r.id);
    const l = listingBy.get(r.listing_id);
    return {
      id: r.id,
      listing: { id: r.listing_id, title: l?.title ?? 'Listing', city: l?.city ?? '', coverUrl: coverBy.get(r.listing_id) ?? null },
      other: { id: r.other_id, displayName: nameBy.get(r.other_id) ?? 'Unknown' },
      lastMessage: last ? { body: last.body, senderId: last.senderId, createdAt: last.createdAt.toISOString(), seq: last.seq } : null,
      lastSeq: Number(r.last_seq),
      unread: Number(r.last_seq) - Number(r.my_read),
      otherDeliveredSeq: Number(r.other_delivered),
      otherReadSeq: Number(r.other_read),
      lastMessageAt: r.last_message_at ? new Date(r.last_message_at).toISOString() : null,
    };
  });

  const last = res.rows.length > limit ? rows.at(-1) : undefined;
  return {
    items,
    nextCursor: last ? Buffer.from(`${last.sort_at}|${last.id}`).toString('base64url') : null,
  };
}

export async function getConversation(userId: string, conversationId: string) {
  const { items } = await listConversations(userId, undefined, 1, conversationId);
  if (!items[0]) throw notFound('conversation');
  return items[0];
}
