import { eq, sql } from 'drizzle-orm';
import type { MyProfile, PublicProfile, UpdateProfileInput, UpdateSettingsInput } from '@coopswap/shared';
import { db } from '../../db/pool.js';
import { emailTokens, profiles, sessions, universityVerifications, userSettings, users } from '../../db/schema.js';
import { notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { verifyPassword } from '../auth/service.js';
import { hooks } from './deletion-hooks.js';

const domainsOf = sql<string[]>`coalesce((select array_agg(distinct ${universityVerifications.domain}) from ${universityVerifications} where ${universityVerifications.userId} = ${users.id}), '{}')`;

export async function getPublicProfile(userId: string): Promise<PublicProfile> {
  const [row] = await db
    .select({
      id: users.id,
      displayName: profiles.displayName,
      bio: profiles.bio,
      school: profiles.school,
      showSchool: userSettings.showSchool,
      createdAt: users.createdAt,
      deletedAt: users.deletedAt,
      domains: domainsOf,
    })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .innerJoin(userSettings, eq(userSettings.userId, users.id))
    .where(eq(users.id, userId));
  if (!row || row.deletedAt) throw notFound('user');
  return {
    id: row.id,
    displayName: row.displayName,
    bio: row.bio,
    school: row.showSchool ? row.school : null,
    avatarUrl: null,
    memberSince: row.createdAt.toISOString(),
    verifiedDomains: row.domains,
  };
}

export async function getMyProfile(userId: string): Promise<MyProfile> {
  const [row] = await db
    .select({ user: users, profile: profiles, settings: userSettings, domains: domainsOf })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .innerJoin(userSettings, eq(userSettings.userId, users.id))
    .where(eq(users.id, userId));
  if (!row) throw notFound('user');
  const { user, profile, settings } = row;
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    role: user.role,
    displayName: profile.displayName,
    bio: profile.bio,
    school: profile.school,
    avatarUrl: null,
    memberSince: user.createdAt.toISOString(),
    verifiedDomains: row.domains,
    settings: {
      emailOnMessage: settings.emailOnMessage,
      emailOnBooking: settings.emailOnBooking,
      showSchool: settings.showSchool,
      analyticsOptOut: settings.analyticsOptOut,
    },
  };
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  if (Object.keys(input).length) {
    await db.update(profiles).set({ ...input, updatedAt: new Date() }).where(eq(profiles.userId, userId));
  }
  return getMyProfile(userId);
}

export async function updateSettings(userId: string, input: UpdateSettingsInput) {
  if (Object.keys(input).length) {
    await db.update(userSettings).set({ ...input, updatedAt: new Date() }).where(eq(userSettings.userId, userId));
  }
  return getMyProfile(userId);
}

// We don't hard delete: bookings and messages reference the user and the other
// party should still see their history. Instead we strip everything personal
// and make the account unusable.
export async function deleteAccount(userId: string, password: string) {
  await verifyPassword(userId, password);
  await db.transaction(async (tx) => {
    for (const hook of hooks) await hook(tx, userId);
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(emailTokens).where(eq(emailTokens.userId, userId));
    await tx.delete(universityVerifications).where(eq(universityVerifications.userId, userId));
    await tx
      .update(profiles)
      .set({ displayName: 'Deleted user', bio: '', school: null, avatarKey: null, updatedAt: new Date() })
      .where(eq(profiles.userId, userId));
    await tx
      .update(users)
      .set({
        email: `deleted+${userId}@deleted.invalid`,
        passwordHash: null,
        emailVerifiedAt: null,
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    await audit(tx, { actorId: userId, action: 'user.deleted', entityType: 'user', entityId: userId });
  });
}
