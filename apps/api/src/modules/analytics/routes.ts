import { Router } from 'express';
import { z } from 'zod';
import { analyticsEventInput } from '@coopswap/shared';
import { eq } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../db/pool.js';
import { userSettings } from '../../db/schema.js';
import { query } from '../../lib/validate.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { requireRole } from '../../middleware/session.js';
import { recordEvent, summary } from './service.js';

// Mounted before the csrf middleware: it's write-only, anonymous, and sent with
// navigator.sendBeacon which can't set headers. Origin is still checked.
export const analyticsIntake = Router();

analyticsIntake.post('/analytics/events', rateLimit({ name: 'analytics', points: 120, durationSec: 60 }), async (req, res) => {
  const origin = req.header('origin');
  if (origin && origin !== env.WEB_ORIGIN) return void res.status(204).end();
  if (req.header('dnt') === '1') return void res.status(204).end();
  if (req.user) {
    const [s] = await db.select({ out: userSettings.analyticsOptOut }).from(userSettings).where(eq(userSettings.userId, req.user.id));
    if (s?.out) return void res.status(204).end();
  }
  const parsed = analyticsEventInput.safeParse(req.body);
  // bad events are dropped quietly, there's nothing the browser can do with an error
  if (parsed.success) await recordEvent(parsed.data);
  res.status(204).end();
});

export const analyticsAdmin = Router();

analyticsAdmin.get('/admin/analytics', requireRole('admin'), async (req, res) => {
  const { days } = query(req, z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }));
  res.json({ data: await summary(days) });
});

