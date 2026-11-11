import type { RequestHandler } from 'express';
import { env, isProd } from '../config/env.js';
import { randomToken, safeEqual } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';

// Double submit cookie. Session cookie is SameSite=Lax which already blocks the
// classic form-post attack, this is the second layer. The SPA reads cs_csrf and
// echoes it back in x-csrf-token on anything that isn't a GET.

export const CSRF_COOKIE = 'cs_csrf';
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export const csrf: RequestHandler = (req, res, next) => {
  let token = req.cookies?.[CSRF_COOKIE];
  if (typeof token !== 'string' || token.length < 20) {
    token = randomToken(24);
    res.cookie(CSRF_COOKIE, token, { sameSite: 'lax', secure: isProd, path: '/', httpOnly: false });
    req.cookies[CSRF_COOKIE] = token;
  }

  if (SAFE.has(req.method)) return next();

  const origin = req.header('origin');
  if (origin && origin !== env.WEB_ORIGIN) {
    throw new AppError(403, 'forbidden', 'cross-origin request blocked');
  }

  const header = req.header('x-csrf-token');
  if (!header || !safeEqual(header, token)) {
    throw new AppError(403, 'forbidden', 'missing or invalid csrf token');
  }
  next();
};
