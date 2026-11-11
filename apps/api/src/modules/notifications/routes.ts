import { Router } from 'express';
import { z } from 'zod';
import { params, query } from '../../lib/validate.js';
import { requireAuth, userOf } from '../../middleware/session.js';
import * as n from './service.js';

export const notificationsRouter = Router();

notificationsRouter.get('/notifications', requireAuth, async (req, res) => {
  const { cursor } = query(req, z.object({ cursor: z.string().max(200).optional() }));
  res.json({ data: await n.listNotifications(userOf(req).id, cursor) });
});

notificationsRouter.post('/notifications/read-all', requireAuth, async (req, res) => {
  await n.markAllRead(userOf(req).id);
  res.status(204).end();
});

notificationsRouter.post('/notifications/:id/read', requireAuth, async (req, res) => {
  const { id } = params(req, z.object({ id: z.uuid() }));
  await n.markNotificationRead(userOf(req).id, id);
  res.status(204).end();
});
