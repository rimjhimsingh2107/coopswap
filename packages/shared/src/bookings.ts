import { z } from 'zod';
import { dateString } from './listings.js';

export const BOOKING_STATUSES = ['requested', 'approved', 'rejected', 'canceled', 'expired'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

// Only approved bookings take dates off the calendar. Requests don't hold
// anything: an owner can have several overlapping requests and pick one, and
// approving it auto-rejects the others that overlap.
export const BLOCKING_STATUSES: readonly BookingStatus[] = ['approved'];
export const TERMINAL_STATUSES: readonly BookingStatus[] = ['rejected', 'canceled', 'expired'];

export type BookingActor = 'guest' | 'owner' | 'system';

const TRANSITIONS: Partial<Record<BookingStatus, Partial<Record<BookingStatus, BookingActor[]>>>> = {
  requested: {
    approved: ['owner'],
    rejected: ['owner', 'system'],
    canceled: ['guest', 'system'],
    expired: ['system'],
  },
  approved: {
    canceled: ['guest', 'owner', 'system'],
  },
};

export interface TransitionContext {
  from: BookingStatus;
  to: BookingStatus;
  actor: BookingActor;
  startDate: string;
  today: string;
  // only matters for requested -> approved
  expiresAt?: Date;
  now?: Date;
}

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

export function checkTransition(c: TransitionContext): TransitionCheck {
  const allowed = TRANSITIONS[c.from]?.[c.to];
  if (!allowed) return { ok: false, reason: `a ${c.from} booking can't become ${c.to}` };
  if (!allowed.includes(c.actor)) return { ok: false, reason: `${c.actor} can't move a booking to ${c.to}` };

  if (c.to === 'approved') {
    if (c.startDate < c.today) return { ok: false, reason: 'the stay has already started' };
    if (c.expiresAt && c.expiresAt <= (c.now ?? new Date())) return { ok: false, reason: 'this request has expired' };
  }
  // once a stay starts, cancelling is between the two people, not a button
  if (c.from === 'approved' && c.to === 'canceled' && c.actor !== 'system' && c.startDate <= c.today) {
    return { ok: false, reason: "can't cancel a stay that has already started" };
  }
  return { ok: true };
}

export function allowedActions(status: BookingStatus, actor: BookingActor, startDate: string, today: string) {
  return (Object.keys(TRANSITIONS[status] ?? {}) as BookingStatus[]).filter(
    (to) => checkTransition({ from: status, to, actor, startDate, today }).ok,
  );
}

export const createBookingInput = z
  .object({
    listingId: z.uuid(),
    startDate: dateString,
    endDate: dateString,
    occupants: z.number().int().min(1).max(10).default(1),
    message: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.endDate > v.startDate, { path: ['endDate'], message: 'move-out has to be after move-in' });
export type CreateBookingInput = z.input<typeof createBookingInput>;

export const bookingDecisionInput = z.object({
  reason: z.string().trim().max(300).optional(),
});

export const bookingListQuery = z.object({
  role: z.enum(['guest', 'owner']).default('guest'),
  status: z
    .string()
    .transform((s) => s.split(','))
    .pipe(z.array(z.enum(BOOKING_STATUSES)))
    .optional(),
});

export interface Booking {
  id: string;
  listingId: string;
  listing: { id: string; title: string; city: string; state: string; coverUrl: string | null };
  guest: { id: string; displayName: string };
  owner: { id: string; displayName: string };
  startDate: string;
  endDate: string;
  nights: number;
  occupants: number;
  message: string | null;
  monthlyRentCents: number;
  status: BookingStatus;
  statusReason: string | null;
  expiresAt: string;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  // what the person asking is allowed to do next
  actions: BookingStatus[];
  viewerRole: 'guest' | 'owner';
}
