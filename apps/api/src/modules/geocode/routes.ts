import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../lib/validate.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { geocode } from './service.js';

export const geocodeRouter = Router();

geocodeRouter.get('/geocode', rateLimit({ name: 'geocode', points: 40, durationSec: 60 }), async (req, res) => {
  const { q, kind } = query(req, z.object({ q: z.string().trim().min(3).max(120), kind: z.enum(['address', 'city']).default('address') }));
  res.json({ data: await geocode(q, kind) });
});
