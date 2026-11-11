import { eq } from 'drizzle-orm';
import { listings, profiles, savedListings } from '../../db/schema.js';
import { onBookingEvent } from '../bookings/events.js';
import { listingHooks } from '../listings/hooks.js';
import { enqueue } from './outbox.js';
import { notify } from './service.js';

onBookingEvent(async (tx, e) => {
  const b = e.booking;
  const [listing] = await tx.select({ title: listings.title }).from(listings).where(eq(listings.id, b.listingId));
  const actorName = e.actorId
    ? (await tx.select({ n: profiles.displayName }).from(profiles).where(eq(profiles.userId, e.actorId)))[0]?.n
    : undefined;
  const payload = {
    bookingId: b.id,
    listingId: b.listingId,
    listingTitle: listing?.title,
    actorName,
    reason: e.reason ?? null,
    startDate: b.startDate,
    endDate: b.endDate,
  };

  // who hears about it: the other side from whoever did it
  const recipients: string[] = [];
  switch (e.type) {
    case 'booking.requested':
      recipients.push(b.ownerId);
      break;
    case 'booking.approved':
    case 'booking.rejected':
    case 'booking.expired':
      recipients.push(b.guestId);
      break;
    case 'booking.canceled':
      if (e.actorId !== b.guestId) recipients.push(b.guestId);
      if (e.actorId !== b.ownerId) recipients.push(b.ownerId);
      break;
  }
  for (const userId of recipients) {
    await notify(tx, { userId, type: e.type, payload, email: { kind: 'booking' } });
  }
  // both sides' booking lists should refresh, whoever did it
  await enqueue(tx, 'booking.updated', { bookingId: b.id, status: b.status, listingId: b.listingId, userIds: [b.guestId, b.ownerId] });
});

const WATCHED_FIELDS: Record<string, string> = {
  monthlyRentCents: 'price',
  availableFrom: 'dates',
  availableTo: 'dates',
  utilitiesIncluded: 'utilities',
  maxOccupants: 'occupancy',
};

listingHooks.afterUpdate.push(async (tx, row, fields) => {
  const changes = [...new Set(fields.map((f) => WATCHED_FIELDS[f]).filter(Boolean) as string[])];
  if (!changes.length || row.status !== 'active') return;
  const savers = await tx.select({ userId: savedListings.userId }).from(savedListings).where(eq(savedListings.listingId, row.id));
  const ids = savers.map((s) => s.userId).filter((id) => id !== row.ownerId);
  if (!ids.length) return;
  // cap fan-out per update. a listing with thousands of savers would want a job
  for (const userId of ids.slice(0, 500)) {
    await notify(tx, {
      userId,
      type: 'listing.updated',
      payload: { listingId: row.id, listingTitle: row.title, changes },
      dedupeKey: `listing:${row.id}`,
    });
  }
});

