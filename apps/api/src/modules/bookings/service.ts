import { and, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import {
  allowedActions,
  checkTransition,
  createBookingInput,
  daysBetween,
  rangeContains,
  todayIn,
  type Booking,
  type BookingActor,
  type BookingStatus,
  type SessionUser,
} from '@coopswap/shared';
import type { z } from 'zod';
import { env } from '../../config/env.js';
import { db } from '../../db/pool.js';
import { bookingEvents, bookings, listingImages, listings, profiles } from '../../db/schema.js';
import { withTx } from '../../db/tx.js';
import { AppError, badRequest, notFound } from '../../lib/errors.js';
import { asPgError, PG } from '../../lib/pg-errors.js';
import { metrics } from '../../lib/metrics.js';
import { storage } from '../../lib/storage.js';
import { idempotent } from '../../lib/idempotency.js';
import type { Tx } from '../users/deletion-hooks.js';
import { emitBookingEvent, type BookingEventType, type BookingRow } from './events.js';

type CreateInput = z.output<typeof createBookingInput>;

export class BookingConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(409, 'booking_conflict', message, details);
  }
}

export const today = () => todayIn('America/New_York');

// --- reads -----------------------------------------------------------------

async function toApi(rows: BookingRow[], viewerId: string): Promise<Booking[]> {
  if (!rows.length) return [];
  const listingIds = [...new Set(rows.map((r) => r.listingId))];
  const userIds = [...new Set(rows.flatMap((r) => [r.guestId, r.ownerId]))];
  const [ls, names, covers] = await Promise.all([
    db
      .select({ id: listings.id, title: listings.title, city: listings.city, state: listings.state })
      .from(listings)
      .where(inArray(listings.id, listingIds)),
    db
      .select({ id: profiles.userId, name: profiles.displayName })
      .from(profiles)
      .where(inArray(profiles.userId, userIds)),
    db
      .selectDistinctOn([listingImages.listingId], { listingId: listingImages.listingId, key: listingImages.storageKey })
      .from(listingImages)
      .where(inArray(listingImages.listingId, listingIds))
      .orderBy(listingImages.listingId, listingImages.position),
  ]);
  const listingById = new Map(ls.map((l) => [l.id, l]));
  const nameById = new Map(names.map((n) => [n.id, n.name]));
  const coverUrl = new Map(
    await Promise.all(covers.map(async (c) => [c.listingId, await storage.signedUrl(c.key)] as const)),
  );
  const t = today();

  return rows.map((r) => {
    const role = r.ownerId === viewerId ? 'owner' : 'guest';
    const l = listingById.get(r.listingId);
    return {
      id: r.id,
      listingId: r.listingId,
      listing: {
        id: r.listingId,
        title: l?.title ?? 'Listing',
        city: l?.city ?? '',
        state: l?.state ?? '',
        coverUrl: coverUrl.get(r.listingId) ?? null,
      },
      guest: { id: r.guestId, displayName: nameById.get(r.guestId) ?? 'Unknown' },
      owner: { id: r.ownerId, displayName: nameById.get(r.ownerId) ?? 'Unknown' },
      startDate: r.startDate,
      endDate: r.endDate,
      nights: daysBetween(r.startDate, r.endDate),
      occupants: r.occupants,
      message: r.message,
      monthlyRentCents: r.monthlyRentCents,
      status: r.status,
      statusReason: r.statusReason,
      expiresAt: r.expiresAt.toISOString(),
      decidedAt: r.decidedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      version: r.version,
      actions: allowedActions(r.status, role, r.startDate, t),
      viewerRole: role,
    };
  });
}

export async function getBooking(id: string, viewer: SessionUser): Promise<Booking> {
  const [row] = await db.select().from(bookings).where(eq(bookings.id, id));
  // same 404 for "doesn't exist" and "not yours"
  if (!row || (row.guestId !== viewer.id && row.ownerId !== viewer.id)) throw notFound('booking');
  return (await toApi([row], viewer.id))[0]!;
}

export async function listBookings(viewer: SessionUser, role: 'guest' | 'owner', statuses?: BookingStatus[]) {
  const who = role === 'owner' ? eq(bookings.ownerId, viewer.id) : eq(bookings.guestId, viewer.id);
  const rows = await db
    .select()
    .from(bookings)
    .where(statuses?.length ? and(who, inArray(bookings.status, statuses)) : who)
    .orderBy(desc(bookings.createdAt))
    .limit(200);
  return toApi(rows, viewer.id);
}

// --- create ----------------------------------------------------------------

function requestExpiry(startDate: string) {
  const ttl = new Date(Date.now() + env.BOOKING_REQUEST_TTL_HOURS * 3_600_000);
  // a request can't outlive the day the stay would start
  const start = new Date(`${startDate}T00:00:00-05:00`);
  return ttl < start ? ttl : start;
}

async function recordTransition(
  tx: Tx,
  row: BookingRow,
  from: BookingStatus | null,
  actorId: string | null,
  actor: BookingActor,
  reason?: string | null,
) {
  await tx.insert(bookingEvents).values({ bookingId: row.id, actorId, fromStatus: from, toStatus: row.status, reason });
  metrics.bookingTransitions.inc({ to: row.status, actor });
  await emitBookingEvent(tx, { type: `booking.${row.status}` as BookingEventType, booking: row, actorId, reason });
}

// Note on responses: the transactions return just the booking id and the
// route loads the full booking after commit. Building the response inside the
// tx would grab a second pool connection while holding row locks, which is a
// good way to starve the pool under load. It also means a replayed request
// gets the booking's current state, which is what clients want anyway.

export async function createBooking(guest: SessionUser, input: CreateInput, idempotencyKey?: string) {
  return idempotent(
    { userId: guest.id, scope: 'booking.create', key: idempotencyKey, request: input, txName: 'booking_create' },
    async (tx) => {
      // FOR KEY SHARE: keep the listing from being deleted under us, without
      // blocking (or being blocked by) ordinary listing edits
      const [listing] = await tx.select().from(listings).where(eq(listings.id, input.listingId)).for('key share');
      if (!listing || listing.status !== 'active') throw notFound('listing');
      if (listing.ownerId === guest.id) throw badRequest("you can't book your own listing");

      const range = { start: input.startDate, end: input.endDate };
      if (input.startDate < today()) throw badRequest('move-in date is in the past');
      if (!rangeContains({ start: listing.availableFrom, end: listing.availableTo }, range)) {
        throw badRequest(`this place is only available ${listing.availableFrom} to ${listing.availableTo}`);
      }
      if (daysBetween(input.startDate, input.endDate) < listing.minStayDays) {
        throw badRequest(`minimum stay is ${listing.minStayDays} days`);
      }
      if (input.occupants > listing.maxOccupants) throw badRequest(`max ${listing.maxOccupants} occupants`);

      // Fail fast if the dates are already taken. This read is only for a nicer
      // error; it isn't what keeps bookings from overlapping (the exclusion
      // constraint on approve is).
      const taken = await approvedOverlaps(tx, listing.id, input.startDate, input.endDate);
      if (taken.length) {
        metrics.bookingConflicts.inc({ operation: 'create' });
        throw new BookingConflictError('those dates are already booked', { taken });
      }

      let row: BookingRow;
      try {
        [row] = (await tx
          .insert(bookings)
          .values({
            listingId: listing.id,
            ownerId: listing.ownerId,
            guestId: guest.id,
            startDate: input.startDate,
            endDate: input.endDate,
            occupants: input.occupants,
            message: input.message,
            monthlyRentCents: listing.monthlyRentCents,
            expiresAt: requestExpiry(input.startDate),
          })
          .returning()) as [BookingRow];
      } catch (err) {
        const pg = asPgError(err);
        if (pg?.code === PG.exclusionViolation && pg.constraint === 'bookings_one_open_per_guest') {
          throw new AppError(409, 'conflict', 'you already have an open request for these dates');
        }
        throw err;
      }

      await recordTransition(tx, row, null, guest.id, 'guest');
      return { status: 201, body: { id: row.id } };
    },
  );
}

async function approvedOverlaps(tx: Tx, listingId: string, start: string, end: string, excludeId?: string) {
  const res = await tx.execute<{ start: string; end: string }>(sql`
    select start_date::text as start, end_date::text as "end" from bookings
    where listing_id = ${listingId} and status = 'approved'
      and stay && daterange(${start}::date, ${end}::date, '[)')
      ${excludeId ? sql`and id <> ${excludeId}` : sql``}
  `);
  return res.rows;
}

// --- transitions -----------------------------------------------------------

interface TransitionOpts {
  bookingId: string;
  user: SessionUser | null; // null = system
  to: Exclude<BookingStatus, 'requested'>;
  reason?: string;
  idempotencyKey?: string;
  // for tests: lets us blow up mid-transaction to check rollback
  _beforeCommit?: (tx: Tx) => Promise<void>;
}

export async function transition(opts: TransitionOpts) {
  const { bookingId, user, to } = opts;

  // read without a lock first just to find the listing, then lock in a fixed
  // order: listing row, then booking row. Every path that changes availability
  // takes the listing lock first, so concurrent approvals queue up instead of
  // deadlocking on each other's auto-rejects.
  const [peek] = await db
    .select({ listingId: bookings.listingId, guestId: bookings.guestId, ownerId: bookings.ownerId })
    .from(bookings)
    .where(eq(bookings.id, bookingId));
  if (!peek) throw notFound('booking');
  const actor: BookingActor = !user ? 'system' : user.id === peek.ownerId ? 'owner' : user.id === peek.guestId ? 'guest' : 'system';
  if (user && actor === 'system') throw notFound('booking');

  const run = async (tx: Tx) => {
    await tx.execute(sql`select 1 from listings where id = ${peek.listingId} for no key update`);
    const [current] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).for('update');
    if (!current) throw notFound('booking');

    // retrying "approve" after a dropped connection shouldn't error
    if (current.status === to) return { status: 200, body: { id: current.id } };

    const check = checkTransition({
      from: current.status,
      to,
      actor,
      startDate: current.startDate,
      today: today(),
      expiresAt: current.expiresAt,
    });
    if (!check.ok) throw new AppError(409, 'invalid_transition', check.reason, { status: current.status });

    if (to === 'approved') {
      const [l] = await tx.select({ status: listings.status }).from(listings).where(eq(listings.id, current.listingId));
      if (l?.status !== 'active') throw new AppError(409, 'invalid_transition', 'listing is not active');
    }

    const now = new Date();
    let updated: BookingRow;
    try {
      [updated] = (await tx
        .update(bookings)
        .set({
          status: to,
          decidedAt: to === 'approved' || to === 'rejected' ? now : current.decidedAt,
          canceledBy: to === 'canceled' ? (user?.id ?? null) : null,
          statusReason: opts.reason ?? null,
          version: sql`${bookings.version} + 1`,
          updatedAt: now,
        })
        .where(eq(bookings.id, bookingId))
        .returning()) as [BookingRow];
    } catch (err) {
      const pg = asPgError(err);
      if (pg?.code === PG.exclusionViolation && pg.constraint === 'bookings_no_overlapping_approved') {
        metrics.bookingConflicts.inc({ operation: 'approve' });
        throw new BookingConflictError('another approved booking already covers some of these dates');
      }
      throw err;
    }
    await recordTransition(tx, updated, current.status, user?.id ?? null, actor, opts.reason);

    if (to === 'approved') {
      // anything still pending that overlaps can never be approved now, so
      // close it out instead of leaving the guest hanging
      const losers = await tx
        .update(bookings)
        .set({
          status: 'rejected',
          statusReason: 'dates were booked by someone else',
          decidedAt: now,
          version: sql`${bookings.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(bookings.listingId, current.listingId),
            eq(bookings.status, 'requested'),
            ne(bookings.id, current.id),
            sql`stay && daterange(${current.startDate}::date, ${current.endDate}::date, '[)')`,
          ),
        )
        .returning();
      for (const l of losers) await recordTransition(tx, l, 'requested', null, 'system', l.statusReason);
    }

    await opts._beforeCommit?.(tx);
    return { status: 200, body: { id: updated.id } };
  };

  if (!user) {
    const r = await withTx(`booking_${to}`, run);
    return { ...r, replayed: false };
  }
  return idempotent(
    {
      userId: user.id,
      scope: `booking.${to}`,
      key: opts.idempotencyKey,
      request: { bookingId, reason: opts.reason ?? null },
      txName: `booking_${to}`,
    },
    run,
  );
}

// --- hooks used by other modules ------------------------------------------

export async function bookedRanges(listingId: string) {
  const res = await db.execute<{ start: string; end: string }>(sql`
    select start_date::text as start, end_date::text as "end" from bookings
    where listing_id = ${listingId} and status = 'approved' and end_date > ${today()}::date
    order by start_date
  `);
  return res.rows;
}

export async function hasApprovedStay(listingId: string, userId: string) {
  const [row] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.listingId, listingId), eq(bookings.guestId, userId), eq(bookings.status, 'approved')))
    .limit(1);
  return Boolean(row);
}

export async function assertWindowCoversBookings(tx: Tx, listingId: string, from: string, to: string) {
  await tx.execute(sql`select 1 from listings where id = ${listingId} for no key update`);
  const res = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n from bookings
    where listing_id = ${listingId} and status = 'approved'
      and not (stay <@ daterange(${from}::date, ${to}::date, '[)'))
  `);
  if ((res.rows[0]?.n ?? 0) > 0) {
    throw new AppError(409, 'conflict', "the new dates would cut off a stay you've already approved");
  }
}

// rejects pending requests in bulk (listing archived, account deleted, ...)
export async function closeOpenRequests(tx: Tx, where: ReturnType<typeof eq>, reason: string, to: 'rejected' | 'canceled') {
  const rows = await tx
    .update(bookings)
    .set({ status: to, statusReason: reason, decidedAt: new Date(), version: sql`${bookings.version} + 1`, updatedAt: new Date() })
    .where(and(where, eq(bookings.status, 'requested')))
    .returning();
  for (const r of rows) await recordTransition(tx, r, 'requested', null, 'system', reason);
  return rows;
}

export async function cancelUpcomingApproved(tx: Tx, userId: string, reason: string) {
  const rows = await tx
    .update(bookings)
    .set({ status: 'canceled', statusReason: reason, version: sql`${bookings.version} + 1`, updatedAt: new Date() })
    .where(
      and(
        or(eq(bookings.guestId, userId), eq(bookings.ownerId, userId)),
        eq(bookings.status, 'approved'),
        sql`start_date > ${today()}::date`,
      ),
    )
    .returning();
  for (const r of rows) await recordTransition(tx, r, 'approved', null, 'system', reason);
}

export async function expireStaleRequests(limit = 500) {
  // one statement, so it's atomic and safe to run from several instances
  return withTx('booking_expire', async (tx) => {
    const rows = await tx
      .update(bookings)
      .set({ status: 'expired', statusReason: 'owner did not respond in time', version: sql`${bookings.version} + 1`, updatedAt: new Date() })
      .where(
        sql`${bookings.id} in (
          select id from bookings where status = 'requested' and expires_at <= now()
          order by expires_at limit ${limit} for update skip locked
        )`,
      )
      .returning();
    for (const r of rows) await recordTransition(tx, r, 'requested', null, 'system', r.statusReason);
    return rows.length;
  });
}
