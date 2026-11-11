import { Router } from 'express';
import { z } from 'zod';
import { deleteAccountInput, updateProfileInput, updateSettingsInput } from '@coopswap/shared';
import { body, params } from '../../lib/validate.js';
import { endSession, requireAuth, SESSION_COOKIE, userOf } from '../../middleware/session.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import * as users from './service.js';

export const usersRouter = Router();

usersRouter.get('/me', requireAuth, async (req, res) => {
  res.json({ data: await users.getMyProfile(userOf(req).id) });
});

usersRouter.patch('/me/profile', requireAuth, async (req, res) => {
  res.json({ data: await users.updateProfile(userOf(req).id, body(req, updateProfileInput)) });
});

usersRouter.patch('/me/settings', requireAuth, async (req, res) => {
  res.json({ data: await users.updateSettings(userOf(req).id, body(req, updateSettingsInput)) });
});

usersRouter.delete(
  '/me',
  requireAuth,
  rateLimit({ name: 'delete-account', points: 5, durationSec: 3600, by: 'user' }),
  async (req, res) => {
    const { password } = body(req, deleteAccountInput);
    await users.deleteAccount(userOf(req).id, password);
    await endSession(res, req.cookies[SESSION_COOKIE]);
    res.status(204).end();
  },
);

usersRouter.get('/users/:id', async (req, res) => {
  const { id } = params(req, z.object({ id: z.uuid() }));
  res.json({ data: await users.getPublicProfile(id) });
});
