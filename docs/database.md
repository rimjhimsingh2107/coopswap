# Database

PostgreSQL 17 is the source of truth for everything durable. Redis holds only
things we can lose (presence, rate limit counters, geocoder cache, socket.io
fan-out).

## ER diagram

```mermaid
erDiagram
  users ||--|| profiles : has
  users ||--|| user_settings : has
  users ||--o{ university_verifications : proves
  users ||--o{ email_tokens : gets
  users ||--o{ sessions : has
  users ||--o{ listings : owns
  listings ||--o{ listing_images : has
  users ||--o{ saved_listings : saves
  listings ||--o{ saved_listings : "saved in"
  listings ||--o{ bookings : "booked via"
  users ||--o{ bookings : "guest of"
  bookings ||--o{ booking_events : history
  listings ||--o{ conversations : about
  conversations ||--|{ conversation_participants : has
  users ||--o{ conversation_participants : in
  conversations ||--o{ messages : contains
  users ||--o{ messages : sends
  users ||--o{ notifications : receives
  users ||--o{ idempotency_keys : owns
  users ||--o{ audit_events : "acted in"

  users { uuid id PK; citext email UK; text password_hash; user_role role; timestamptz email_verified_at; timestamptz deleted_at }
  listings { uuid id PK; uuid owner_id FK; listing_status status; date available_from; date available_to; int monthly_rent_cents; point geo "generated, gist"; tsvector search_doc "generated, gin"; int version }
  bookings { uuid id PK; uuid listing_id FK; uuid owner_id FK; uuid guest_id FK; date start_date; date end_date; daterange stay "generated [start,end)"; booking_status status; timestamptz expires_at; int version }
  conversations { uuid id PK; uuid listing_id FK; text pair_key; bigint last_seq }
  conversation_participants { uuid conversation_id PK; uuid user_id PK; bigint last_read_seq; bigint last_delivered_seq }
  messages { uuid id PK; uuid conversation_id FK; bigint seq; uuid sender_id FK; uuid client_id; text body }
  notifications { uuid id PK; uuid user_id FK; text type; jsonb payload; text dedupe_key; timestamptz read_at }
  outbox_events { bigint id PK; text topic; jsonb payload; timestamptz available_at; timestamptz locked_until; int attempts; timestamptz published_at }
  idempotency_keys { uuid user_id PK; text scope PK; text key PK; bytea request_hash; jsonb response_body }
  analytics_events { bigint id PK; text name; bytea session_hash; uuid listing_id; text city }
```

## Constraints that carry the business rules

| rule | how |
| --- | --- |
| no two approved stays overlap | `EXCLUDE USING gist (listing_id WITH =, stay WITH &&) WHERE status = 'approved'` |
| one live request per guest per listing+dates | same idea, `(listing_id, guest_id, stay)` where `requested`/`approved` |
| a booking's owner is the listing's owner | composite FK `(listing_id, owner_id) → listings(id, owner_id)` |
| you can't book your own place | `check (guest_id <> owner_id)` |
| dates make sense | `check (end_date > start_date)`, listing window `check (available_to > available_from)` and max 2 years |
| an active listing has a publish date | `check (status <> 'active' or published_at is not null)` |
| one conversation per pair per listing | unique `(listing_id, pair_key)` |
| messages are ordered and dedupe on retry | unique `(conversation_id, seq)` and `(conversation_id, sender_id, client_id)` |
| read ≤ delivered | `check (last_read_seq <= last_delivered_seq)` |
| one account per university email | unique on `university_verifications.email` |
| collapsed unread notifications | partial unique `(user_id, dedupe_key) where read_at is null` |
| photo order | unique `(listing_id, position)` **deferrable**, so reorders can swap inside one tx |

The application validates too (with the same zod schemas the client uses), but
that's for nice error messages. The table constraints are what we rely on.

## Referential actions

* Users are never hard deleted (see account deletion below), so most FKs to
  `users` are `restrict`. Sessions, tokens, settings, notifications cascade.
* Listings are archived, not deleted. `bookings → listings` is `restrict` so
  history can't vanish.
* `messages → conversations` cascades, conversations are only removed with
  their listing (which doesn't happen in normal operation).

## Transaction boundaries

| operation | in one transaction |
| --- | --- |
| sign up | user + profile + settings + audit row |
| create booking | idempotency key row, listing `FOR KEY SHARE`, booking insert, booking_event, notifications, outbox rows |
| approve | idempotency key, listing `FOR NO KEY UPDATE`, booking `FOR UPDATE`, status update (exclusion check), auto-reject overlapping requests, their events/notifications/outbox |
| send message | `conversations.last_seq + 1` (row lock), message insert, sender cursor update, collapsed notification, delayed email outbox row |
| listing edit | listing lock, "window still covers approved stays" check, versioned update, saver notifications |
| account deletion | close requests, cancel upcoming stays, archive listings, wipe profile/email, drop sessions/tokens, audit |

Anything that talks to the network (socket push, email) happens after commit
via the outbox or an explicit post-commit emit, never inside a transaction.

## Account deletion

We anonymise instead of deleting: email becomes `deleted+<id>@deleted.invalid`,
password hash and verification go, profile becomes "Deleted user", sessions
and tokens are removed, listings archived, open/upcoming bookings closed with
notifications to the other side. Message bodies remain visible to the other
participant (it's their conversation history too).

## Audit

`audit_events` records security relevant actions with actor, entity, request id
and a small metadata blob (never request bodies): signup, email/university
verification, password reset, listing create/update/publish/archive, image
changes, account deletion. `booking_events` is the full state history of every
booking.

## Migrations

Forward only, plain SQL, checksummed. Changing an applied file is an error.
See [operations.md](operations.md) for how to ship schema changes without
downtime.
