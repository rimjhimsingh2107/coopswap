create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete cascade,
  type       text not null,
  payload    jsonb not null default '{}',
  -- while unread, notifications with the same key collapse into one
  -- (e.g. five messages in one conversation = one "new messages" item)
  dedupe_key text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc, id desc);
create index notifications_unread_idx on notifications (user_id) where read_at is null;
create unique index notifications_unread_dedupe_key on notifications (user_id, dedupe_key)
  where read_at is null and dedupe_key is not null;

-- Transactional outbox. Rows are written in the same transaction as the
-- change they describe; a relay picks them up afterwards and does the
-- side effects (socket push, email). Delivery is at least once.
create table outbox_events (
  id           bigint generated always as identity primary key,
  topic        text not null,
  payload      jsonb not null,
  created_at   timestamptz not null default now(),
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  attempts     integer not null default 0,
  last_error   text,
  published_at timestamptz
);
create index outbox_pending_idx on outbox_events (available_at, id) where published_at is null;
