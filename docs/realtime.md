# Realtime

## Shape

* Writes go over REST (`POST /conversations/:id/messages`). The socket only
  pushes: `message:new`, `receipt`, `typing`, `presence`, `notification`,
  `booking:updated`, `unread`.
* Socket.IO with the Redis adapter. Each socket joins `user:<id>`; emits go to
  user rooms, so authorization is "you're in your own room" and nothing else.
  `io.to(room).emit` from any instance reaches sockets on every instance.
* Handshake auth: session cookie + Origin must equal `WEB_ORIGIN` (blocks
  cross-site websocket hijacking).

## Delivery semantics

**Durable and ordered in Postgres, at-most-once-ish over the socket, and the
client converges.** Not exactly once, and we don't claim it.

* Every message gets a server UUID and a per-conversation `seq` assigned by
  `UPDATE conversations SET last_seq = last_seq + 1 ... RETURNING` in the same
  transaction as the insert. The row lock serialises sends per conversation, so
  seqs are gapless and strictly increasing.
* The push happens after commit. If it's lost (recipient offline, Redis blip,
  instance restart), nothing is lost: it's in the table.
* Clients key messages by id and sort by seq (`mergeMessages` in shared), so
  duplicate or out of order pushes are harmless. If they see a gap in seqs,
  they refetch.
* On reconnect (when socket.io couldn't recover the session) the client
  invalidates conversation/message queries; history is fetched with
  `?after=<last seq>`.
* Sends are idempotent on `clientId`: a retry after a timeout returns the
  original message instead of posting twice. Two concurrent sends with the
  same clientId → one row, and the losing transaction's seq bump rolls back
  so there's no gap.

## Receipts and unread

* `conversation_participants.last_delivered_seq` / `last_read_seq`, both only
  move forward (`greatest`) and are clamped to `last_seq`, so late or bogus
  acks can't move them back or past the end.
* Delivered: the recipient's client emits `delivered` when a push arrives;
  fetching history counts too.
* Read: REST `POST /conversations/:id/read` when the thread is visible.
* Unread for a conversation is `last_seq - last_read_seq` (sending a message
  moves your own cursors, so your messages never count).

## Presence

A Redis sorted set per user: members are socket ids, scores are expiry
timestamps refreshed by a 25s heartbeat. Online = any member not expired.
Multiple tabs/devices/instances just add members; an instance that dies
without cleaning up has its entries age out within a minute. Online/offline
events fire on the 0→1 and 1→0 edges to `presence:<id>` rooms, which you can
only join for people you share a conversation with.

## Typing

Volatile emits (dropped if they can't go out immediately) to the other
participant only, membership checked once per socket and cached. The client
also times out a "typing" state after 6s in case the "stopped" event is lost.

## Tests

`apps/api/test/realtime.test.ts` runs two real api processes: sender on one,
recipient's two tabs on the other, so every assertion goes through Redis.
Covers auth/origin rejection, multi-tab delivery, receipts, typing isolation,
presence with multiple tabs, and catch-up after a disconnect.
