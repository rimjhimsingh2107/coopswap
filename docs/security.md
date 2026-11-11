# Security and privacy

| threat | mitigation |
| --- | --- |
| broken object level auth | every query that touches a user's thing filters by the session user (`owner_id = $me`, participant checks). Missing and not-yours both return 404. Ownership never comes from the request body. Booking owner is pinned to the listing owner by a composite FK. |
| SQL injection | parameterised queries only (Drizzle / `sql` template tags). Arrays go as single params. |
| XSS | React escapes by default, no `dangerouslySetInnerHTML`. Strict CSP from nginx (`script-src 'self'`). Uploads are re-encoded to webp and served with `nosniff`; SVG is rejected. |
| CSRF | SameSite=Lax session cookie + double-submit token on all non-GET + Origin check. The one exception (analytics beacon) is anonymous and write-only. |
| cross-site websockets | Origin check in the socket handshake. |
| malicious uploads | 8MB cap, max 10 per request / 20 per listing, decoded with sharp (pixel limit) so content must really be jpeg/png/webp, re-encoded, EXIF stripped. Private bucket, short lived signed URLs. |
| brute force / abuse | Redis rate limits on auth (per ip), email sends, bookings, messages, uploads, search, geocoding, plus a global limit. In-memory fallback if Redis is down instead of failing open. |
| session theft | random 256-bit token, only its sha256 stored, httpOnly, `__Host-` + Secure in prod, sliding 14 day expiry, password reset revokes all sessions. |
| account enumeration | sign-in errors are identical and timing-padded with a dummy hash; forgot-password always returns 202. (Sign-up does say "already exists", a deliberate UX trade.) |
| leaking addresses | public coordinates are snapped to a ~400m grid plus a fixed per-listing offset. Exact address only for the owner or a guest with an approved stay. |
| PII in logs/metrics/traces | logs carry method + path (no query strings), redact cookies/emails/passwords; Prometheus labels are route templates and enums only; pg spans don't include parameters; the collector drops url/query attributes. |
| secrets | env only, validated at boot without echoing values, `.env*` gitignored, Secrets Manager in AWS, OIDC for deploys (no AWS keys in GitHub). |

## What we don't verify

The UI says this in several places and it's worth repeating: CoopSwap doesn't
check identities, property ownership, whether a lease allows subletting, or
whether a listing is real. A "confirmed @northeastern.edu email" badge means
someone clicked a link sent to that address. There are no payments and a
booking is not a lease.

## Data we collect

Account: email, password hash, display name, optional bio/school/photo.
Listings: address (private) and listing details. Messages and bookings.
Analytics: event name, a per-tab random id hashed with a daily salt, city
searched and listing id. No user id, no IP, no cookies; respects Do Not Track
and an in-app opt out.
