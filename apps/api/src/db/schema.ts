import {
  bigint,
  boolean,
  customType,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// Source of truth for the schema is database/migrations/*.sql. This file just
// describes the tables so queries are typed. Constraints live in SQL.

export const citext = customType<{ data: string }>({ dataType: () => 'citext' });
export const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const userRole = pgEnum('user_role', ['student', 'admin']);
export const emailTokenPurpose = pgEnum('email_token_purpose', [
  'verify_email',
  'reset_password',
  'verify_university',
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: citext('email').notNull(),
  passwordHash: text('password_hash'),
  role: userRole('role').notNull().default('student'),
  emailVerifiedAt: ts('email_verified_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  deletedAt: ts('deleted_at'),
});

export const profiles = pgTable('profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  displayName: text('display_name').notNull(),
  bio: text('bio').notNull().default(''),
  school: text('school'),
  avatarKey: text('avatar_key'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  emailOnMessage: boolean('email_on_message').notNull().default(true),
  emailOnBooking: boolean('email_on_booking').notNull().default(true),
  showSchool: boolean('show_school').notNull().default(true),
  analyticsOptOut: boolean('analytics_opt_out').notNull().default(false),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const universityVerifications = pgTable('university_verifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  email: citext('email').notNull(),
  domain: text('domain').notNull(),
  verifiedAt: ts('verified_at').notNull().defaultNow(),
});

export const emailTokens = pgTable('email_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  purpose: emailTokenPurpose('purpose').notNull(),
  tokenHash: bytea('token_hash').notNull(),
  targetEmail: citext('target_email').notNull(),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  tokenHash: bytea('token_hash').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  createdAt: ts('created_at').notNull().defaultNow(),
  lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  expiresAt: ts('expires_at').notNull(),
  userAgent: text('user_agent'),
});

export const auditEvents = pgTable('audit_events', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  actorId: uuid('actor_id'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata').notNull().default({}),
  requestId: text('request_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

