import { Router } from 'express';
import { z } from 'zod';
import { createListingInput, updateListingInput } from '@coopswap/shared';
import { body, params } from '../../lib/validate.js';
import { requireAuth, requireVerifiedEmail, userOf } from '../../middleware/session.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import * as listings from './service.js';
import { searchListings } from './search.js';

export const listingsRouter = Router();

const idParam = z.object({ id: z.uuid() });
const searchLimit = rateLimit({ name: 'search', points: 120, durationSec: 60 });

listingsRouter.get('/listings', searchLimit, async (req, res) => {
  res.json({ data: await searchListings(req.query, req.user?.id) });
});

listingsRouter.get('/listings/featured', async (_req, res) => {
  res.set('cache-control', 'public, max-age=60');
  res.json({ data: await listings.listFeatured() });
});

listingsRouter.get('/listings/:id', async (req, res) => {
  const { id } = params(req, idParam);
  res.json({ data: await listings.getListing(id, req.user) });
});

listingsRouter.post(
  '/listings',
  requireVerifiedEmail,
  rateLimit({ name: 'listing-create', points: 10, durationSec: 3600, by: 'user' }),
  async (req, res) => {
    const id = await listings.createListing(userOf(req).id, body(req, createListingInput));
    res.status(201).json({ data: await listings.getListing(id, req.user) });
  },
);

listingsRouter.patch('/listings/:id', requireAuth, async (req, res) => {
  const { id } = params(req, idParam);
  await listings.updateListing(id, userOf(req), body(req, updateListingInput));
  res.json({ data: await listings.getListing(id, req.user) });
});

listingsRouter.post('/listings/:id/publish', requireVerifiedEmail, async (req, res) => {
  const { id } = params(req, idParam);
  await listings.setListingStatus(id, userOf(req), 'active');
  res.json({ data: await listings.getListing(id, req.user) });
});

listingsRouter.post('/listings/:id/archive', requireAuth, async (req, res) => {
  const { id } = params(req, idParam);
  await listings.setListingStatus(id, userOf(req), 'archived');
  res.json({ data: await listings.getListing(id, req.user) });
});

listingsRouter.get('/me/listings', requireAuth, async (req, res) => {
  res.json({ data: await listings.listMine(userOf(req).id) });
});

listingsRouter.get('/me/saved', requireAuth, async (req, res) => {
  res.json({ data: await listings.listSaved(userOf(req).id) });
});

listingsRouter.put('/me/saved/:id', requireAuth, async (req, res) => {
  const { id } = params(req, idParam);
  await listings.saveListing(userOf(req).id, id);
  res.status(204).end();
});

listingsRouter.delete('/me/saved/:id', requireAuth, async (req, res) => {
  const { id } = params(req, idParam);
  await listings.unsaveListing(userOf(req).id, id);
  res.status(204).end();
});
