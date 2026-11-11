import argon2 from 'argon2';
import { and, eq, isNull } from 'drizzle-orm';
import type { SignUpInput } from '@coopswap/shared';
import { db } from '../../db/pool.js';
import { profiles, sessions, universityVerifications, userSettings, users } from '../../db/schema.js';
import { AppError, badRequest, conflict } from '../../lib/errors.js';
import { asPgError, PG } from '../../lib/pg-errors.js';
import { audit } from '../../lib/audit.js';
import { consumeToken, issueToken } from './tokens.js';
import { sendPasswordReset, sendUniversityEmail, sendVerifyEmail } from './emails.js';
import { universityDomainOf } from './university.js';

// OWASP's current argon2id baseline
const HASH_OPTS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

// used so that a sign in for an unknown email costs about the same as a real one
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= argon2.hash('not-a-real-password', HASH_OPTS));

export async function signUp(input: SignUpInput) {
  const passwordHash = await argon2.hash(input.password, HASH_OPTS);
  try {
    const user = await db.transaction(async (tx) => {
      const [u] = await tx.insert(users).values({ email: input.email, passwordHash }).returning();
      await tx.insert(profiles).values({ userId: u!.id, displayName: input.displayName });
      await tx.insert(userSettings).values({ userId: u!.id });
      await audit(tx, { actorId: u!.id, action: 'user.signup', entityType: 'user', entityId: u!.id });
      return u!;
    });
    const token = await issueToken(user.id, 'verify_email', user.email);
    await sendVerifyEmail(user.email, token);
    return user;
  } catch (err) {
    if (asPgError(err)?.code === PG.uniqueViolation) {
      throw conflict('an account with that email already exists');
    }
    throw err;
  }
}

export async function signIn(email: string, password: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)));

  if (!user?.passwordHash) {
    await argon2.verify(await getDummyHash(), password).catch(() => false);
    throw new AppError(401, 'unauthenticated', 'email or password is wrong');
  }
  const ok = await argon2.verify(user.passwordHash, password);
  if (!ok) throw new AppError(401, 'unauthenticated', 'email or password is wrong');

  if (argon2.needsRehash(user.passwordHash, HASH_OPTS)) {
    await db
      .update(users)
      .set({ passwordHash: await argon2.hash(password, HASH_OPTS) })
      .where(eq(users.id, user.id));
  }
  return user;
}

export async function resendVerification(userId: string, email: string) {
  const token = await issueToken(userId, 'verify_email', email);
  await sendVerifyEmail(email, token);
}

export async function verifyEmail(rawToken: string) {
  const tok = await consumeToken(rawToken, 'verify_email');
  if (!tok) throw badRequest('that link is invalid or has expired');

  await db.transaction(async (tx) => {
    const [u] = await tx
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(users.id, tok.userId), eq(users.email, tok.targetEmail)))
      .returning();
    if (!u) throw badRequest('that link is invalid or has expired');

    // signing up with a school address counts as verifying it
    const domain = universityDomainOf(u.email);
    if (domain) {
      await tx
        .insert(universityVerifications)
        .values({ userId: u.id, email: u.email, domain })
        .onConflictDoNothing();
    }
    await audit(tx, { actorId: u.id, action: 'user.email_verified', entityType: 'user', entityId: u.id });
  });
}

export async function startUniversityVerification(userId: string, email: string) {
  const domain = universityDomainOf(email);
  if (!domain) throw badRequest("that doesn't look like a supported university address");

  const [taken] = await db
    .select({ userId: universityVerifications.userId })
    .from(universityVerifications)
    .where(eq(universityVerifications.email, email));
  if (taken && taken.userId !== userId) {
    throw conflict('that address is already linked to another account');
  }
  if (taken) return;

  const token = await issueToken(userId, 'verify_university', email);
  await sendUniversityEmail(email, token);
}

export async function confirmUniversity(rawToken: string, userId: string) {
  const tok = await consumeToken(rawToken, 'verify_university', userId);
  if (!tok) throw badRequest('that link is invalid or has expired');
  const domain = universityDomainOf(tok.targetEmail);
  if (!domain) throw badRequest('unsupported domain');
  try {
    await db.insert(universityVerifications).values({ userId, email: tok.targetEmail, domain });
  } catch (err) {
    if (asPgError(err)?.code === PG.uniqueViolation) {
      throw conflict('that address is already linked to another account');
    }
    throw err;
  }
  await audit(db, { actorId: userId, action: 'user.university_verified', entityType: 'user', entityId: userId, metadata: { domain } });
}

// always "succeeds" so this can't be used to check which emails have accounts
export async function forgotPassword(email: string) {
  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)));
  if (!user) return;
  const token = await issueToken(user.id, 'reset_password', user.email);
  await sendPasswordReset(user.email, token);
}

export async function resetPassword(rawToken: string, password: string) {
  const tok = await consumeToken(rawToken, 'reset_password');
  if (!tok) throw badRequest('that link is invalid or has expired');
  const passwordHash = await argon2.hash(password, HASH_OPTS);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, tok.userId));
    // reset kicks every existing session out
    await tx.delete(sessions).where(eq(sessions.userId, tok.userId));
    await audit(tx, { actorId: tok.userId, action: 'user.password_reset', entityType: 'user', entityId: tok.userId });
  });
}

export async function verifyPassword(userId: string, password: string) {
  const [u] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, userId));
  if (!u?.hash || !(await argon2.verify(u.hash, password))) {
    throw new AppError(401, 'unauthenticated', 'password is wrong');
  }
}
