import { eq, sql } from 'drizzle-orm';
import { bookings } from '../../db/schema.js';
import { listingHooks } from '../listings/hooks.js';
import { setAvailabilityFilter } from '../listings/search.js';
import { onAccountDeleted } from '../users/deletion-hooks.js';
import * as service from './service.js';

listingHooks.bookedRanges = service.bookedRanges;
// exact address is shared once the owner approves you
listingHooks.canSeeAddress = service.hasApprovedStay;
listingHooks.beforeWindowChange.push(service.assertWindowCoversBookings);
listingHooks.afterArchive.push(async (tx, row) => {
  await service.closeOpenRequests(tx, eq(bookings.listingId, row.id), 'listing was taken down', 'rejected');
});

// search: hide listings where an approved stay overlaps the dates asked for.
// uses the gist index behind the exclusion constraint.
setAvailabilityFilter(
  (start, end) => sql`not exists (
    select 1 from bookings b
    where b.listing_id = l.id and b.status = 'approved'
      and b.stay && daterange(${start}::date, ${end}::date, '[)')
  )`,
);

onAccountDeleted(async (tx, userId) => {
  await service.closeOpenRequests(tx, eq(bookings.guestId, userId), 'guest deleted their account', 'canceled');
  await service.closeOpenRequests(tx, eq(bookings.ownerId, userId), 'host deleted their account', 'rejected');
  await service.cancelUpcomingApproved(tx, userId, 'account was deleted');
});

export { bookingsRouter } from './routes.js';
