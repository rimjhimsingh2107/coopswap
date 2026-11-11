import {
  bigint,
  boolean,
  char,
  date,
  doublePrecision,
  integer,
  primaryKey,
  smallint,
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


export const listingStatus = pgEnum('listing_status', ['draft', 'active', 'archived']);
export const roomType = pgEnum('room_type', ['private_room', 'shared_room', 'studio', 'entire_place']);
export const furnishing = pgEnum('furnishing', ['furnished', 'partially_furnished', 'unfurnished']);

// generated columns (geo, city_key, search_doc) are left out on purpose, we
// never write them and the search query references them with raw sql
export const listings = pgTable('listings', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  status: listingStatus('status').notNull().default('draft'),
  title: text('title').notNull(),
  description: text('description').notNull(),
  addressLine1: text('address_line1').notNull(),
  addressLine2: text('address_line2'),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  neighborhood: text('neighborhood'),
  city: text('city').notNull(),
  state: char('state', { length: 2 }).notNull(),
  postalCode: text('postal_code'),
  approxLat: doublePrecision('approx_lat').notNull(),
  approxLng: doublePrecision('approx_lng').notNull(),
  availableFrom: date('available_from', { mode: 'string' }).notNull(),
  availableTo: date('available_to', { mode: 'string' }).notNull(),
  minStayDays: smallint('min_stay_days').notNull().default(30),
  monthlyRentCents: integer('monthly_rent_cents').notNull(),
  utilitiesIncluded: boolean('utilities_included').notNull().default(false),
  utilitiesEstCents: integer('utilities_est_cents'),
  utilitiesNotes: text('utilities_notes'),
  furnishing: furnishing('furnishing').notNull(),
  roomType: roomType('room_type').notNull(),
  maxOccupants: smallint('max_occupants').notNull(),
  amenities: text('amenities').array().notNull().default([]),
  version: integer('version').notNull().default(1),
  publishedAt: ts('published_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const listingImages = pgTable('listing_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  listingId: uuid('listing_id')
    .notNull()
    .references(() => listings.id),
  storageKey: text('storage_key').notNull(),
  position: smallint('position').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  bytes: integer('bytes').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const savedListings = pgTable(
  'saved_listings',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.listingId] })],
);

export const bookingStatus = pgEnum('booking_status', ['requested', 'approved', 'rejected', 'canceled', 'expired']);

// `stay` (generated daterange) left out, see the migration
export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  listingId: uuid('listing_id').notNull(),
  ownerId: uuid('owner_id').notNull(),
  guestId: uuid('guest_id').notNull(),
  startDate: date('start_date', { mode: 'string' }).notNull(),
  endDate: date('end_date', { mode: 'string' }).notNull(),
  status: bookingStatus('status').notNull().default('requested'),
  occupants: smallint('occupants').notNull(),
  message: text('message'),
  monthlyRentCents: integer('monthly_rent_cents').notNull(),
  expiresAt: ts('expires_at').notNull(),
  decidedAt: ts('decided_at'),
  canceledBy: uuid('canceled_by'),
  statusReason: text('status_reason'),
  version: integer('version').notNull().default(1),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const bookingEvents = pgTable('booking_events', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  bookingId: uuid('booking_id').notNull(),
  actorId: uuid('actor_id'),
  fromStatus: bookingStatus('from_status'),
  toStatus: bookingStatus('to_status').notNull(),
  reason: text('reason'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    userId: uuid('user_id').notNull(),
    scope: text('scope').notNull(),
    key: text('key').notNull(),
    requestHash: bytea('request_hash').notNull(),
    responseStatus: smallint('response_status'),
    responseBody: jsonb('response_body'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.scope, t.key] })],
);
