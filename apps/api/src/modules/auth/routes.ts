import { Router } from 'express';
import {
  forgotPasswordInput,
  resetPasswordInput,
  signInInput,
  signUpInput,
  tokenInput,
  universityEmailInput,
} from '@coopswap/shared';
import { body } from '../../lib/validate.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { endSession, requireAuth, SESSION_COOKIE, startSession, userOf } from '../../middleware/session.js';
import { CSRF_COOKIE } from '../../middleware/csrf.js';
import * as auth from './service.js';

export const authRouter = Router();

const authLimit = rateLimit({ name: 'auth', points: 10, durationSec: 60 });
const emailLimit = rateLimit({ name: 'auth-email', points: 5, durationSec: 15 * 60 });

authRouter.get('/auth/csrf', (req, res) => {
  res.json({ data: { token: req.cookies[CSRF_COOKIE] } });
});

authRouter.get('/auth/session', (req, res) => {
  res.json({ data: req.user ?? null });
});

authRouter.post('/auth/signup', authLimit, async (req, res) => {
  const input = body(req, signUpInput);
  const user = await auth.signUp(input);
  await startSession(res, user.id, req.header('user-agent'));
  res.status(201).json({ data: { id: user.id } });
});

authRouter.post('/auth/signin', authLimit, async (req, res) => {
  const { email, password } = body(req, signInInput);
  const user = await auth.signIn(email, password);
  await startSession(res, user.id, req.header('user-agent'));
  res.json({ data: { id: user.id } });
});

authRouter.post('/auth/signout', async (req, res) => {
  await endSession(res, req.cookies[SESSION_COOKIE]);
  res.status(204).end();
});

authRouter.post('/auth/verify-email', authLimit, async (req, res) => {
  const { token } = body(req, tokenInput);
  await auth.verifyEmail(token);
  res.json({ data: { verified: true } });
});

authRouter.post('/auth/verify-email/resend', requireAuth, emailLimit, async (req, res) => {
  const user = userOf(req);
  if (!user.emailVerified) await auth.resendVerification(user.id, user.email);
  res.status(202).json({ data: { sent: !user.emailVerified } });
});

authRouter.post('/auth/forgot-password', emailLimit, async (req, res) => {
  const { email } = body(req, forgotPasswordInput);
  await auth.forgotPassword(email);
  res.status(202).json({ data: { sent: true } });
});

authRouter.post('/auth/reset-password', authLimit, async (req, res) => {
  const { token, password } = body(req, resetPasswordInput);
  await auth.resetPassword(token, password);
  res.json({ data: { reset: true } });
});

authRouter.post('/auth/university', requireAuth, emailLimit, async (req, res) => {
  const { email } = body(req, universityEmailInput);
  await auth.startUniversityVerification(userOf(req).id, email);
  res.status(202).json({ data: { sent: true } });
});

authRouter.post('/auth/university/confirm', requireAuth, authLimit, async (req, res) => {
  const { token } = body(req, tokenInput);
  await auth.confirmUniversity(token, userOf(req).id);
  res.json({ data: { verified: true } });
});
