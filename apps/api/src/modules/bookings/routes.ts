import { Router, type Response } from 'express';
import { z } from 'zod';
import { bookingDecisionInput, bookingListQuery, createBookingInput } from '@coopswap/shared';
import { body, params, query } from '../../lib/validate.js';
import { metrics } from '../../lib/metrics.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { requireAuth, requireVerifiedEmail, userOf } from '../../middleware/session.js';
import * as bookings from './service.js';

export const bookingsRouter = Router();

const idParam = z.object({ id: z.uuid() });

function sendResult(res: Response, r: { status: number; replayed: boolean }, data: unknown, scope: string) {
  if (r.replayed) {
    res.setHeader('idempotent-replayed', 'true');
    metrics.idempotentReplays.inc({ scope });
  }
  res.status(r.status).json({ data });
}

bookingsRouter.post(
  '/bookings',
  requireVerifiedEmail,
  rateLimit({ name: 'booking-create', points: 30, durationSec: 3600, by: 'user' }),
  async (req, res) => {
    const user = userOf(req);
    const input = body(req, createBookingInput);
    const r = await bookings.createBooking(user, input, req.header('idempotency-key'));
    sendResult(res, r, await bookings.getBooking(r.body.id, user), 'booking.create');
  },
);

bookingsRouter.get('/bookings', requireAuth, async (req, res) => {
  const q = query(req, bookingListQuery);
  res.json({ data: await bookings.listBookings(userOf(req), q.role, q.status) });
});

bookingsRouter.get('/bookings/:id', requireAuth, async (req, res) => {
  const { id } = params(req, idParam);
  res.json({ data: await bookings.getBooking(id, userOf(req)) });
});

const ACTIONS = { approve: 'approved', reject: 'rejected', cancel: 'canceled' } as const;

for (const [action, to] of Object.entries(ACTIONS)) {
  bookingsRouter.post(`/bookings/:id/${action}`, requireAuth, async (req, res) => {
    const user = userOf(req);
    const { id } = params(req, idParam);
    const { reason } = body(req, bookingDecisionInput);
    const r = await bookings.transition({ bookingId: id, user, to, reason, idempotencyKey: req.header('idempotency-key') });
    sendResult(res, r, await bookings.getBooking(id, user), `booking.${to}`);
  });
}
