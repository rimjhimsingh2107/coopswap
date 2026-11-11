import type { CookieOptions, RequestHandler, Response } from 'express';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Role, SessionUser } from '@coopswap/shared';
import { env, isProd } from '../config/env.js';
import { db } from '../db/pool.js';
import { profiles, sessions, universityVerifications, users } from '../db/schema.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { AppError, forbidden, unauthenticated } from '../lib/errors.js';

export const SESSION_COOKIE = isProd ? '__Host-cs_session' : 'cs_session';
const TOUCH_EVERY_MS = 10 * 60 * 1000;

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: '/',
  maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
});

export async function startSession(res: Response, userId: string, userAgent?: string) {
  const token = randomToken();
  await db.insert(sessions).values({
    tokenHash: sha256(token),
    userId,
    expiresAt: new Date(Date.now() + env.SESSION_TTL_DAYS * 86_400_000),
    userAgent: userAgent?.slice(0, 200),
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions());
}

export async function endSession(res: Response, token: string | undefined) {
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
}

export async function lookupSession(token: string): Promise<SessionUser | null> {
  const hash = sha256(token);
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      emailVerifiedAt: users.emailVerifiedAt,
      displayName: profiles.displayName,
      lastSeenAt: sessions.lastSeenAt,
      domains: sql<string[]>`coalesce((select array_agg(${universityVerifications.domain}) from ${universityVerifications} where ${universityVerifications.userId} = ${users.id}), '{}')`,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(and(eq(sessions.tokenHash, hash), gt(sessions.expiresAt, new Date()), isNull(users.deletedAt)));

  if (!row) return null;

  if (Date.now() - row.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + env.SESSION_TTL_DAYS * 86_400_000) })
      .where(eq(sessions.tokenHash, hash));
  }

  return {
    id: row.id,
    email: row.email,
    role: row.role,
    emailVerified: row.emailVerifiedAt !== null,
    displayName: row.displayName,
    universityDomains: row.domains,
  };
}

export const loadSession: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === 'string' && token.length > 20) {
    req.user = (await lookupSession(token)) ?? undefined;
  }
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) throw unauthenticated();
  next();
};

export const requireVerifiedEmail: RequestHandler = (req, _res, next) => {
  if (!req.user) throw unauthenticated();
  if (!req.user.emailVerified) {
    throw new AppError(403, 'forbidden', 'verify your email address first');
  }
  next();
};

export const requireRole =
  (role: Role): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) throw unauthenticated();
    if (req.user.role !== role) throw forbidden();
    next();
  };

// for handlers that ran requireAuth already
export function userOf(req: { user?: SessionUser }): SessionUser {
  if (!req.user) throw unauthenticated();
  return req.user;
}
