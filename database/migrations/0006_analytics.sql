-- Anonymous product events. No user id, no ip. session_hash is the browser's
-- per-tab random id hashed with a salt that changes daily, so sessions can't
-- be linked across days or back to an account.
create table analytics_events (
  id           bigint generated always as identity primary key,
  name         text not null check (name in ('search', 'listing_view', 'booking_request', 'message_start')),
  session_hash bytea not null,
  listing_id   uuid references listings (id) on delete set null,
  city         text check (char_length(city) <= 80),
  props        jsonb not null default '{}',
  occurred_at  timestamptz not null default now()
);
create index analytics_events_time_idx on analytics_events (occurred_at);
create index analytics_events_listing_idx on analytics_events (listing_id, name) where listing_id is not null;
