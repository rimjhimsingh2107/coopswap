create type listing_status as enum ('draft', 'active', 'archived');
create type room_type as enum ('private_room', 'shared_room', 'studio', 'entire_place');
create type furnishing as enum ('furnished', 'partially_furnished', 'unfurnished');

create table listings (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references users (id) on delete restrict,
  status            listing_status not null default 'draft',
  title             text not null check (char_length(title) between 5 and 120),
  description       text not null check (char_length(description) between 20 and 5000),

  -- private: only the owner (and later, an approved guest) sees these
  address_line1     text not null check (char_length(address_line1) <= 200),
  address_line2     text check (char_length(address_line2) <= 100),
  lat               double precision not null check (lat between -90 and 90),
  lng               double precision not null check (lng between -180 and 180),

  -- public
  neighborhood      text check (char_length(neighborhood) <= 80),
  city              text not null check (char_length(city) between 1 and 80),
  state             char(2) not null check (state ~ '^[A-Z]{2}$'),
  postal_code       text check (postal_code ~ '^\d{5}$'),
  approx_lat        double precision not null,
  approx_lng        double precision not null,
  -- built in point type is enough for "what's in this map viewport" and
  -- "nearest first". (x, y) = (lng, lat).
  geo               point generated always as (point(approx_lng, approx_lat)) stored,
  city_key          text generated always as (lower(city) || ',' || lower(state)) stored,

  -- [available_from, available_to), the "to" date is the day you have to be out
  available_from    date not null,
  available_to      date not null,
  min_stay_days     smallint not null default 30 check (min_stay_days between 1 and 365),

  monthly_rent_cents  integer not null check (monthly_rent_cents between 10000 and 2000000),
  utilities_included  boolean not null default false,
  utilities_est_cents integer check (utilities_est_cents between 0 and 200000),
  utilities_notes     text check (char_length(utilities_notes) <= 300),
  furnishing        furnishing not null,
  room_type         room_type not null,
  max_occupants     smallint not null check (max_occupants between 1 and 10),
  amenities         text[] not null default '{}',

  search_doc        tsvector generated always as (
                      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                      setweight(to_tsvector('english', coalesce(neighborhood, '')), 'B') ||
                      setweight(to_tsvector('english', coalesce(description, '')), 'C')
                    ) stored,

  version           integer not null default 1,
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint listings_window check (available_to > available_from),
  constraint listings_window_len check (available_to - available_from <= 730),
  constraint listings_active_published check (status <> 'active' or published_at is not null)
);

-- most searches are "active listings in <city>, cheapest/newest first"
create index listings_city_price_idx on listings (city_key, monthly_rent_cents, id) where status = 'active';
create index listings_city_published_idx on listings (city_key, published_at desc, id) where status = 'active';
create index listings_geo_idx on listings using gist (geo) where status = 'active';
create index listings_window_idx on listings using gist (daterange(available_from, available_to)) where status = 'active';
create index listings_amenities_idx on listings using gin (amenities) where status = 'active';
create index listings_search_idx on listings using gin (search_doc) where status = 'active';
create index listings_owner_idx on listings (owner_id, created_at desc);

create table listing_images (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references listings (id) on delete cascade,
  storage_key  text not null unique,
  position     smallint not null check (position between 0 and 19),
  width        integer not null,
  height       integer not null,
  bytes        integer not null,
  created_at   timestamptz not null default now(),
  -- deferrable so reordering can swap positions inside one transaction
  constraint listing_images_position_key unique (listing_id, position) deferrable initially deferred
);

create table saved_listings (
  user_id    uuid not null references users (id) on delete cascade,
  listing_id uuid not null references listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
create index saved_listings_listing_idx on saved_listings (listing_id);
