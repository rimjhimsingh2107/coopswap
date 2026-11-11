create extension if not exists btree_gist;

create type booking_status as enum ('requested', 'approved', 'rejected', 'canceled', 'expired');

-- lets bookings carry owner_id with a composite FK so it can never drift from
-- the listing's real owner
alter table listings add constraint listings_id_owner_key unique (id, owner_id);

create table bookings (
  id                 uuid primary key default gen_random_uuid(),
  listing_id         uuid not null,
  owner_id           uuid not null,
  guest_id           uuid not null references users (id) on delete restrict,

  -- [start_date, end_date): end_date is move-out day and is free for the next guest
  start_date         date not null,
  end_date           date not null,
  stay               daterange generated always as (daterange(start_date, end_date, '[)')) stored,

  status             booking_status not null default 'requested',
  occupants          smallint not null check (occupants between 1 and 10),
  message            text check (char_length(message) <= 1000),
  monthly_rent_cents integer not null,
  expires_at         timestamptz not null,
  decided_at         timestamptz,
  canceled_by        uuid references users (id) on delete set null,
  status_reason      text check (char_length(status_reason) <= 300),
  version            integer not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint bookings_listing_owner_fk foreign key (listing_id, owner_id)
    references listings (id, owner_id) on delete restrict,
  constraint bookings_dates check (end_date > start_date),
  constraint bookings_not_own_listing check (guest_id <> owner_id),

  -- The rule that matters: two approved bookings on one listing can't share a
  -- night. Enforced here so it holds no matter how many api instances race.
  constraint bookings_no_overlapping_approved
    exclude using gist (listing_id with =, stay with &&) where (status = 'approved'),

  -- a guest gets one live request per listing per date range, no spamming
  constraint bookings_one_open_per_guest
    exclude using gist (listing_id with =, guest_id with =, stay with &&)
    where (status in ('requested', 'approved'))
);

create index bookings_guest_idx on bookings (guest_id, created_at desc);
create index bookings_owner_idx on bookings (owner_id, status, created_at desc);
create index bookings_listing_status_idx on bookings (listing_id, status);
create index bookings_expiry_idx on bookings (expires_at) where status = 'requested';

create table booking_events (
  id          bigint generated always as identity primary key,
  booking_id  uuid not null references bookings (id) on delete cascade,
  actor_id    uuid references users (id) on delete set null,
  from_status booking_status,
  to_status   booking_status not null,
  reason      text,
  created_at  timestamptz not null default now()
);
create index booking_events_booking_idx on booking_events (booking_id, id);

-- Stored responses for retried POSTs. The row is written in the same
-- transaction as the work, so either both exist or neither does.
create table idempotency_keys (
  user_id         uuid not null references users (id) on delete cascade,
  scope           text not null,
  key             text not null check (char_length(key) between 8 and 100),
  request_hash    bytea not null,
  response_status smallint,
  response_body   jsonb,
  created_at      timestamptz not null default now(),
  primary key (user_id, scope, key)
);
create index idempotency_keys_created_idx on idempotency_keys (created_at);
