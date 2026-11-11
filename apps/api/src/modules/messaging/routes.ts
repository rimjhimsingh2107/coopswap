import { Router } from 'express';
import { z } from 'zod';
import { markReadInput, messageHistoryQuery, sendMessageInput, startConversationInput } from '@coopswap/shared';
import { body, params, query } from '../../lib/validate.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { requireAuth, requireVerifiedEmail, userOf } from '../../middleware/session.js';
import { onlineStatus } from '../../realtime/presence.js';
import * as chat from './service.js';

export const messagingRouter = Router();

const idParam = z.object({ id: z.uuid() });
const sendLimit = rateLimit({ name: 'message-send', points: 60, durationSec: 60, by: 'user' });

messagingRouter.get('/conversations', requireAuth, async (req, res) => {
  const { cursor } = query(req, z.object({ cursor: z.string().max(200).optional() }));
  res.json({ data: await chat.listConversations(userOf(req).id, cursor) });
});

messagingRouter.get('/conversations/unread', requireAuth, async (req, res) => {
  res.json({ data: await chat.unreadCounts(userOf(req).id) });
});

messagingRouter.post('/conversations', requireVerifiedEmail, sendLimit, async (req, res) => {
  const user = userOf(req);
  const input = body(req, startConversationInput);
  const conv = await chat.startConversation(user, input.listingId);
  if (input.body) await chat.sendMessage(user, conv.id, input.body, crypto.randomUUID());
  res.status(conv.created ? 201 : 200).json({ data: await chat.getConversation(user.id, conv.id) });
});

messagingRouter.get('/conversations/:id', requireAuth, async (req, res) => {
  const { id } = params(req, idParam);
  res.json({ data: await chat.getConversation(userOf(req).id, id) });
});

messagingRouter.get('/conversations/:id/messages', requireAuth, async (req, res) => {
  const { id } = params(req, idParam);
  res.json({ data: await chat.getMessages(userOf(req), id, query(req, messageHistoryQuery)) });
});

messagingRouter.post('/conversations/:id/messages', requireVerifiedEmail, sendLimit, async (req, res) => {
  const { id } = params(req, idParam);
  const { body: text, clientId } = body(req, sendMessageInput);
  const r = await chat.sendMessage(userOf(req), id, text, clientId);
  res.status(r.duplicate ? 200 : 201).json({ data: r.message });
});

messagingRouter.post('/conversations/:id/read', requireAuth, async (req, res) => {
  const { id } = params(req, idParam);
  const { seq } = body(req, markReadInput);
  await chat.assertParticipant(id, userOf(req).id);
  res.json({ data: await chat.markRead(userOf(req).id, id, seq) });
});

messagingRouter.get('/presence', requireAuth, async (req, res) => {
  const { ids } = query(req, z.object({ ids: z.string().max(2000) }));
  const wanted = ids.split(',').filter((x) => z.uuid().safeParse(x).success).slice(0, 50);
  res.json({ data: await onlineStatus(wanted) });
});
