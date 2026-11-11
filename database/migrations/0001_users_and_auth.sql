create extension if not exists citext;

create type user_role as enum ('student', 'admin');

create table users (
  id                uuid primary key default gen_random_uuid(),
  email             citext not null,
  password_hash     text,
  role              user_role not null default 'student',
  email_verified_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint users_email_shape check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
create unique index users_email_key on users (email);

create table profiles (
  user_id      uuid primary key references users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  bio          text not null default '' check (char_length(bio) <= 1000),
  school       text check (char_length(school) <= 120),
  avatar_key   text,
  updated_at   timestamptz not null default now()
);

create table user_settings (
  user_id               uuid primary key references users (id) on delete cascade,
  email_on_message      boolean not null default true,
  email_on_booking      boolean not null default true,
  show_school           boolean not null default true,
  analytics_opt_out     boolean not null default false,
  updated_at            timestamptz not null default now()
);

-- one row per university address a user has proven they can read mail at.
-- this says nothing about whether the person is trustworthy.
create table university_verifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users (id) on delete cascade,
  email       citext not null,
  domain      text not null,
  verified_at timestamptz not null default now()
);
create unique index university_verifications_email_key on university_verifications (email);
create index university_verifications_user_idx on university_verifications (user_id);

create type email_token_purpose as enum ('verify_email', 'reset_password', 'verify_university');

-- we only store a sha256 of the token, the raw value only ever lives in the email
create table email_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users (id) on delete cascade,
  purpose      email_token_purpose not null,
  token_hash   bytea not null,
  target_email citext not null,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);
create unique index email_tokens_hash_key on email_tokens (token_hash);
create index email_tokens_user_idx on email_tokens (user_id, purpose);

create table sessions (
  token_hash   bytea primary key,
  user_id      uuid not null references users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  user_agent   text
);
create index sessions_user_idx on sessions (user_id);
create index sessions_expiry_idx on sessions (expires_at);

create table audit_events (
  id          bigint generated always as identity primary key,
  actor_id    uuid references users (id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  metadata    jsonb not null default '{}',
  request_id  text,
  created_at  timestamptz not null default now()
);
create index audit_events_entity_idx on audit_events (entity_type, entity_id, created_at);
create index audit_events_actor_idx on audit_events (actor_id, created_at);
