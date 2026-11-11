import type { bookings } from '../../db/schema.js';
import type { Tx } from '../users/deletion-hooks.js';

export type BookingRow = typeof bookings.$inferSelect;
export type BookingEventType =
  | 'booking.requested'
  | 'booking.approved'
  | 'booking.rejected'
  | 'booking.canceled'
  | 'booking.expired';

export interface BookingEvent {
  type: BookingEventType;
  booking: BookingRow;
  actorId: string | null;
  reason?: string | null;
}

type Subscriber = (tx: Tx, e: BookingEvent) => Promise<void>;
const subscribers: Subscriber[] = [];

// Subscribers run inside the booking transaction. They should only write rows
// (notifications, outbox). Anything that talks to the network happens later,
// off the outbox, so a slow email provider can't hold a booking lock.
export const onBookingEvent = (fn: Subscriber) => subscribers.push(fn);

export async function emitBookingEvent(tx: Tx, e: BookingEvent) {
  for (const s of subscribers) await s(tx, e);
}
